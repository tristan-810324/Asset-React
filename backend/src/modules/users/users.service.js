const bcrypt = require('bcryptjs');
const usersRepository = require('./users.repository');
const { validateCreateGsoAccount } = require('./users.validation');

const DEFAULT_GSO_PASSWORD = 'Admin123';

async function listGsoAccounts() {
  return usersRepository.listGsoUsers();
}

async function createGsoAccount(input) {
  const account = validateCreateGsoAccount(input);
  const passwordHash = await bcrypt.hash(DEFAULT_GSO_PASSWORD, 12);

  try {
    return await usersRepository.createGsoUser({ ...account, passwordHash });
  } catch (error) {
    if (error.code === '23505') {
      throw Object.assign(new Error('May account na gamit ang email na iyan.'), { status: 409 });
    }
    throw error;
  }
}

module.exports = { listGsoAccounts, createGsoAccount };
