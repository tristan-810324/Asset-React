const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { TextEncoder } = require('node:util');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = require('../src/config/db');

function askHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal to enter the password safely.'));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    function finish(error) {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    }

    function onData(buffer) {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') {
          finish(new Error('Admin setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          value = value.slice(0, -1);
          stdout.write('\b \b');
          continue;
        }
        if (character >= ' ') {
          value += character;
          stdout.write('*');
        }
      }
    }

    stdin.on('data', onData);
  });
}

// A new database has no IT Admin, no GSO staff, and no positions to choose from, so run this
// once for each: `node scripts/create-admin.js`, then `node scripts/create-admin.js --gso`.
const account = process.argv.includes('--gso')
  ? { roleKey: 'GSO_STAFF', label: 'GSO Staff', positionExample: 'GSO Head' }
  : { roleKey: 'IT_ADMIN', label: 'IT Admin', positionExample: 'IT Administrator' };

async function createAdmin() {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  const name = (await prompt.question(`${account.label} full name: `)).trim();
  const email = (await prompt.question(`${account.label} email: `)).trim().toLowerCase();
  const position = (await prompt.question(`${account.label} position (example: ${account.positionExample}): `)).trim();
  prompt.close();

  if (!name || name.length > 200) {
    throw new Error('Name must contain between 1 and 200 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  if (!position || position.length > 120) {
    throw new Error('Position must contain between 1 and 120 characters.');
  }

  const password = await askHidden('Initial password (12 to 72 UTF-8 bytes): ');
  const passwordBytes = new TextEncoder().encode(password).length;
  if (passwordBytes < 12 || passwordBytes > 72) {
    throw new Error('Password must contain 12 to 72 UTF-8 bytes.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query('SELECT id FROM roles WHERE role_key = $1', [account.roleKey]);
    if (role.rowCount !== 1) {
      throw new Error(`${account.roleKey} role is missing. Apply the database migrations before creating an account.`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insertedUser = await client.query(
      `INSERT INTO users (name, email, position, password_hash, email_verified_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [name, email, position, passwordHash],
    );
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [insertedUser.rows[0].id, role.rows[0].id],
    );
    await client.query('COMMIT');
    stdout.write(`Created ${account.label} account for ${email}. Keep the initial password private.\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw new Error('An account with that email already exists.');
    }
    throw error;
  } finally {
    client.release();
  }
}

createAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
