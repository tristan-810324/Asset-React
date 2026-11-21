const bcrypt = require('bcryptjs');
const usersRepository = require('./users.repository');
const auditRepository = require('../audit/audit.repository');
const { validateCreateSystemUser } = require('./users.validation');

const DEFAULT_ACCOUNT_PASSWORD = 'Admin123';

const roleLabels = {
  BORROWER: 'EmployeeHead / Requester',
  GSO_STAFF: 'GSO Staff',
  GSO_HEAD: 'GSO Head',
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
      throw Object.assign(new Error('May account na gamit ang email na iyan.'), { status: 409 });
    }
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
  if (!/^\d+$/.test(id)) throw Object.assign(new Error('Hindi valid ang user.'), { status: 400 });
  return id;
}

async function setSystemUserActive(userIdValue, isActive, actor) {
  const userId = validateUserId(userIdValue);
  if (typeof isActive !== 'boolean') throw Object.assign(new Error('Piliin kung Active o Inactive ang account.'), { status: 400 });
  if (userId === String(actor.id)) throw Object.assign(new Error('Hindi mo maaaring baguhin ang sarili mong account.'), { status: 400 });
  const updated = await usersRepository.setSystemUserActive(userId, isActive);
  if (!updated) throw Object.assign(new Error('Hindi makita ang account.'), { status: 404 });

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

async function deleteSystemUser(userIdValue, actor) {
  const userId = validateUserId(userIdValue);
  if (userId === String(actor.id)) throw Object.assign(new Error('Hindi mo maaaring burahin ang sarili mong account.'), { status: 400 });
  let deleted;
  try {
    deleted = await usersRepository.deleteSystemUser(userId);
  } catch (error) {
    if (error.code === '23503') {
      throw Object.assign(new Error('May requests o issuance records ang account na ito, kaya hindi ito mabubura. I-deactivate na lang.'), { status: 409 });
    }
    throw error;
  }
  if (!deleted) throw Object.assign(new Error('Hindi makita ang account.'), { status: 404 });

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
  deleteSystemUser,
};
