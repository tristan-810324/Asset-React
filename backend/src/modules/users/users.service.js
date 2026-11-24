const bcrypt = require('bcryptjs');
const usersRepository = require('./users.repository');
const auditRepository = require('../audit/audit.repository');
const employeesService = require('../employees/employees.service');
const requesterIdentityRepository = require('../requester-identity/requester-identity.repository');
const { validateCreateSystemUser, validateUpdateSystemUser } = require('./users.validation');

const DEFAULT_ACCOUNT_PASSWORD = 'Admin123';

const roleLabels = {
  BORROWER: 'EmployeeHead / Requester',
  GSO_STAFF: 'GSO Staff',
  GSO_HEAD: 'GSO Head',
  IT_STAFF: 'IT Staff',
};

async function listSystemUsers() {
  return usersRepository.listSystemUsers();
}

async function listAccountPositions() {
  return usersRepository.listAccountPositions();
}

async function createSystemUser(input, actor) {
  const account = validateCreateSystemUser(input);

  const passwordHash = await bcrypt.hash(DEFAULT_ACCOUNT_PASSWORD, 12);
  let created;
  try {
    created = await usersRepository.createSystemUser({ ...account, passwordHash });
  } catch (error) {
    if (error.code === '23505') {
      throw Object.assign(new Error('An account already uses that email.'), { status: 409 });
    }
    throw error;
  }

  // Auto-approve: save the identity and add it to Employee Master Data the same way a GSO approval does.
  // If that fails, remove the new login so no half-created account is left behind.
  try {
    await requesterIdentityRepository.submitMine(created.id, account);
    await requesterIdentityRepository.review(created.id, {
      status: 'Verified',
      note: 'Auto-approved: account created by IT.',
      department: account.department,
      position: account.position,
      addDepartment: true,
      addPosition: true,
      reviewedByUserId: actor.id,
    });
  } catch (error) {
    await usersRepository.deleteSystemUser(String(created.id));
    throw error;
  }

  await auditRepository.writeLog(null, {
    entityType: 'user',
    entityKey: String(created.id),
    entityName: created.name,
    action: 'created',
    reason: `Created ${roleLabels[account.roleKey] || account.roleKey} account for ${created.email}.`,
    newValues: { email: created.email, roleKey: account.roleKey, position: account.position },
    changedByUserId: actor.id,
  });
  return created;
}

function validateUserId(value) {
  const id = String(value ?? '');
  if (!/^\d+$/.test(id)) throw Object.assign(new Error('Invalid user.'), { status: 400 });
  return id;
}

async function setSystemUserActive(userIdValue, isActive, actor) {
  const userId = validateUserId(userIdValue);
  if (typeof isActive !== 'boolean') throw Object.assign(new Error('Choose whether the account is Active or Inactive.'), { status: 400 });
  if (userId === String(actor.id)) throw Object.assign(new Error('You cannot change your own account.'), { status: 400 });
  const updated = await usersRepository.setSystemUserActive(userId, isActive);
  if (!updated) throw Object.assign(new Error('Account not found.'), { status: 404 });

  await auditRepository.writeLog(null, {
    entityType: 'user',
    entityKey: userId,
    entityName: updated.name,
    action: isActive ? 'activated' : 'deactivated',
    reason: `${isActive ? 'Activated' : 'Deactivated'} account for ${updated.email}. ${isActive ? 'It can sign in again.' : 'It can no longer sign in.'}`,
    newValues: { isActive },
    changedByUserId: actor.id,
  });
  return { id: updated.id, isActive: updated.isActive };
}

// The identity details the edit form shows, read from the requester profile (empty until one exists).
async function getSystemUserDetails(userIdValue) {
  const userId = validateUserId(userIdValue);
  const profile = await requesterIdentityRepository.getMine(userId);
  if (!profile) throw Object.assign(new Error('Account not found.'), { status: 404 });
  return {
    employeeCode: profile.employeeCode,
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    suffix: profile.suffix,
    department: profile.department,
    position: profile.position,
    contactNumber: profile.contactNumber,
  };
}

async function updateSystemUser(userIdValue, input, actor) {
  const userId = validateUserId(userIdValue);
  const change = validateUpdateSystemUser(input);
  const previous = await usersRepository.getSystemUserForEdit(userId);
  if (!previous) throw Object.assign(new Error('Account not found.'), { status: 404 });
  const profile = await requesterIdentityRepository.getMine(userId);

  const before = {
    employeeCode: profile?.employeeCode ?? '',
    firstName: profile?.firstName ?? '',
    middleName: profile?.middleName ?? '',
    lastName: profile?.lastName ?? '',
    suffix: profile?.suffix ?? '',
    department: profile?.department ?? '',
    position: profile?.position ?? '',
    contactNumber: profile?.contactNumber ?? '',
  };
  const after = {
    employeeCode: change.employeeCode,
    firstName: change.firstName,
    middleName: change.middleName,
    lastName: change.lastName,
    suffix: change.suffix,
    department: change.department,
    position: change.position,
    contactNumber: change.contactNumber,
  };
  const identityChanged = Object.keys(after).some((key) => before[key] !== after[key]);
  const emailChanged = previous.email.toLowerCase() !== change.email;
  const nameChanged = previous.name !== change.name;

  const roleChanged = previous.roles.length !== 1 || previous.roles[0] !== change.roleKey;
  if (roleChanged && (previous.roles.includes('IT_ADMIN') || change.roleKey === 'IT_ADMIN')) {
    throw Object.assign(new Error('The IT Admin role cannot be given or removed here.'), { status: 400 });
  }
  if (roleChanged && userId === String(actor.id)) throw Object.assign(new Error('You cannot change your own role.'), { status: 400 });

  // Employee Master Data is the record GSO approval updates, so it follows the identity details. It runs first: if it
  // refuses (for example a department or position that is not in master data), the account is left unchanged.
  if (profile?.matchedEmployeeCode && (identityChanged || emailChanged)) {
    await employeesService.updateEmployee(profile.matchedEmployeeCode, {
      ...after,
      email: change.email,
      status: profile.matchedEmployeeStatus,
      reason: change.reason,
    }, actor);
  }

  let updated;
  try {
    updated = await usersRepository.updateSystemUser({
      userId, name: change.name, email: change.email, roleKey: change.roleKey, emailChanged, roleChanged, identity: change,
    });
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('That email or employee number is already used by another account.'), { status: 409 });
    throw error;
  }
  if (!updated) throw Object.assign(new Error('Account not found.'), { status: 404 });

  const roles = roleChanged ? [change.roleKey] : previous.roles;
  const result = { id: updated.id, name: updated.name, email: updated.email, position: updated.position, roles };
  // Saving the same details again is not an edit, so nothing is flagged.
  if (!identityChanged && !emailChanged && !nameChanged && !roleChanged) return result;

  await auditRepository.writeLog(null, {
    entityType: 'user',
    entityKey: userId,
    entityName: updated.name,
    action: 'updated',
    reason: change.reason,
    oldValues: { ...before, name: previous.name, email: previous.email, roles: previous.roles },
    newValues: { ...after, name: updated.name, email: updated.email, roles },
    changedByUserId: actor.id,
    flag: 'ACCOUNT_EDITED',
  });
  return result;
}

async function deleteSystemUser(userIdValue, actor) {
  const userId = validateUserId(userIdValue);
  if (userId === String(actor.id)) throw Object.assign(new Error('You cannot delete your own account.'), { status: 400 });
  let deleted;
  try {
    deleted = await usersRepository.deleteSystemUser(userId);
  } catch (error) {
    if (error.code === '23503') {
      throw Object.assign(new Error('This account has requests or issuance records, so it cannot be deleted. Deactivate it instead.'), { status: 409 });
    }
    throw error;
  }
  if (!deleted) throw Object.assign(new Error('Account not found.'), { status: 404 });

  await auditRepository.writeLog(null, {
    entityType: 'user',
    entityKey: userId,
    entityName: deleted.name,
    action: 'deleted',
    reason: `Deleted account for ${deleted.email}. The account was permanently removed.`,
    newValues: { email: deleted.email },
    changedByUserId: actor.id,
    flag: 'RECORD_DELETED',
  });
  return { id: userId };
}

module.exports = {
  listSystemUsers,
  listAccountPositions,
  createSystemUser,
  setSystemUserActive,
  getSystemUserDetails,
  updateSystemUser,
  deleteSystemUser,
};
