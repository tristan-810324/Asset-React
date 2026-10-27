const bcrypt = require('bcryptjs');
const usersRepository = require('./users.repository');
const { validateCreateSystemUser } = require('./users.validation');

const DEFAULT_ACCOUNT_PASSWORD = 'Admin123';

async function listSystemUsers() {
  return usersRepository.listSystemUsers();
}

async function listAccountPositions() {
  return usersRepository.listAccountPositions();
}

async function createSystemUser(input) {
  const account = validateCreateSystemUser(input);
  const availablePositions = await usersRepository.listAccountPositions();
  if (!availablePositions.some((position) => position.toLowerCase() === account.position.toLowerCase())) {
    throw Object.assign(new Error('Select a position from the available employee positions.'), { status: 400 });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ACCOUNT_PASSWORD, 12);
  try {
    return await usersRepository.createSystemUser({ ...account, passwordHash });
  } catch (error) {
    if (error.code === '23505') {
      throw Object.assign(new Error('May account na gamit ang email na iyan.'), { status: 409 });
    }
    throw error;
  }
}

module.exports = { listSystemUsers, listAccountPositions, createSystemUser };
