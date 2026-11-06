const nodemailer = require('nodemailer');
const { waitUntil } = require('@vercel/functions');
const env = require('../../config/env');
const employeesRepository = require('./employees.repository');
const { validateEmployee, validateUpdateEmployee } = require('./employees.validation');

const mailTransport = env.smtp
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

// Tells the old address its email was changed, so a change the employee did not ask for gets noticed.
function emailChangeNoticeInBackground({ to, employeeName, newEmail, changedBy }) {
  if (!mailTransport || !to) return;
  const text = [
    `Dear ${employeeName},`,
    '',
    `${changedBy} of the General Services Office changed the email on your GSO employee record to ${newEmail}.`,
    'Return confirmation codes and receipts for items you borrow will now go to that address.',
    '',
    'If you did not ask for this change, report it to the General Services Office and the IT Admin right away.',
    '',
    'General Services Office',
  ].join('\n');
  waitUntil(mailTransport.sendMail({ from: env.smtp.from, to, subject: 'Your GSO employee record email was changed', text })
    .catch((error) => {
      console.error('Employee email change notice could not be delivered.', { code: error.code, responseCode: error.responseCode });
    }));
}

function validateEmployeeCode(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) {
    throw Object.assign(new Error('Hindi valid ang employee code na ie-edit.'), { status: 400 });
  }
  return value.trim();
}

function translateDuplicate(error) {
  if (error.code === '23505' && error.constraint === 'employees_employee_code_lower_unique_idx') {
    throw Object.assign(new Error('May employee profile na gumagamit ng Employee Code na iyan.'), { status: 409 });
  }
  if (error.code === '23505' && error.constraint === 'employees_email_lower_unique_idx') {
    throw Object.assign(new Error('May employee profile na gumagamit ng email address na iyan.'), { status: 409 });
  }
}

async function listEmployees() {
  return employeesRepository.listEmployees();
}

async function createEmployee(input, user) {
  const employee = validateEmployee(input);
  try {
    return await employeesRepository.createEmployee(employee, { createdByUserId: user.id });
  } catch (error) {
    translateDuplicate(error);
    throw error;
  }
}

async function updateEmployee(employeeCodeValue, input, user) {
  const employeeCode = validateEmployeeCode(employeeCodeValue);
  const employee = validateUpdateEmployee(input);
  try {
    const { employee: updated, previousEmail } = await employeesRepository.updateEmployee(employeeCode, employee, { changedByUserId: user.id });
    if (previousEmail) {
      emailChangeNoticeInBackground({
        to: previousEmail,
        employeeName: `${updated.firstName} ${updated.lastName}`,
        newEmail: updated.email,
        changedBy: user.name || user.email,
      });
    }
    return updated;
  } catch (error) {
    translateDuplicate(error);
    throw error;
  }
}

module.exports = { listEmployees, createEmployee, updateEmployee };
