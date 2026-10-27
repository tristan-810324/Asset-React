const crypto = require('node:crypto');
const pool = require('../../config/db');

async function getUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, name, email, password_hash, is_active, email_verified_at, token_version
       FROM users
      WHERE lower(email) = $1
      LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function createBorrowerUser({ name, email, passwordHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roleResult = await client.query(
      `SELECT id FROM roles WHERE role_key = 'BORROWER' LIMIT 1`,
    );
    if (!roleResult.rowCount) {
      throw Object.assign(new Error('The BORROWER role has not been seeded.'), { code: 'BORROWER_ROLE_MISSING' });
    }

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, is_active, email_verified_at, token_version`,
      [name, email, passwordHash],
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [user.id, roleResult.rows[0].id],
    );
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUserRoles(userId) {
  const result = await pool.query(
    `SELECT r.role_key
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.role_key`,
    [userId],
  );
  return result.rows.map((row) => row.role_key);
}

async function getSessionUser(userId) {
  const result = await pool.query(
    `SELECT id, name, email, is_active, email_verified_at, token_version
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function countRecentLoginFailures(email, ipAddress) {
  const clientIp = ipAddress || null;
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE email = $1) AS email_failures,
       COUNT(*) FILTER (WHERE ip_address = $2) AS ip_failures
       FROM login_events
      WHERE event_type = 'login_failed'
        AND occurred_at > NOW() - INTERVAL '15 minutes'
        AND (email = $1 OR ip_address = $2)`,
    [email, clientIp],
  );
  return {
    emailFailures: Number(result.rows[0].email_failures),
    ipFailures: Number(result.rows[0].ip_failures),
  };
}

async function recordLoginEvent({ userId = null, email, ipAddress, eventType }) {
  await pool.query(
    `INSERT INTO login_events (user_id, email, ip_address, event_type)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, ipAddress || null, eventType],
  );
}

async function incrementAuthRateLimit(bucketKey, windowMinutes) {
  const result = await pool.query(
    `INSERT INTO auth_rate_limits (bucket_key, window_started_at, request_count)
     VALUES ($1, NOW(), 1)
     ON CONFLICT (bucket_key) DO UPDATE
       SET request_count = CASE
             WHEN auth_rate_limits.window_started_at <= NOW() - ($2 * INTERVAL '1 minute') THEN 1
             ELSE auth_rate_limits.request_count + 1
           END,
           window_started_at = CASE
             WHEN auth_rate_limits.window_started_at <= NOW() - ($2 * INTERVAL '1 minute') THEN NOW()
             ELSE auth_rate_limits.window_started_at
           END,
           updated_at = NOW()
     RETURNING request_count`,
    [bucketKey, windowMinutes],
  );
  return Number(result.rows[0].request_count);
}

async function getPasswordResetUser(email) {
  const result = await pool.query(
    `SELECT id, name, email, is_active
       FROM users
      WHERE lower(email) = $1
      LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function createPasswordResetOtp({ userId, challengeId, tokenHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const recent = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM auth_tokens
        WHERE user_id = $1
          AND purpose = 'reset_otp'
          AND created_at > NOW() - INTERVAL '1 minute'`,
      [userId],
    );

    if (recent.rows[0].count > 0) {
      await client.query('COMMIT');
      return false;
    }

    await client.query(
      `UPDATE auth_tokens
          SET used_at = NOW()
        WHERE user_id = $1
          AND purpose = 'reset_otp'
          AND used_at IS NULL`,
      [userId],
    );
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, 'reset_otp', $3, NOW() + INTERVAL '5 minutes')`,
      [challengeId, userId, tokenHash],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getActiveEmailVerificationOtp(userId) {
  const result = await pool.query(
    `SELECT id
       FROM auth_tokens
      WHERE user_id = $1
        AND purpose = 'email_verification_otp'
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.id || null;
}

async function getEmailVerificationUserByChallenge(challengeId) {
  const result = await pool.query(
    `SELECT user_account.id, user_account.email, user_account.is_active, user_account.email_verified_at
       FROM auth_tokens token
       JOIN users user_account ON user_account.id = token.user_id
      WHERE token.id = $1
        AND token.purpose = 'email_verification_otp'
      LIMIT 1`,
    [challengeId],
  );
  return result.rows[0] || null;
}

async function createEmailVerificationOtp({ userId, challengeId, tokenHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `SELECT id, email_verified_at, is_active
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [userId],
    );
    const user = account.rows[0];
    if (!user || !user.is_active) {
      await client.query('COMMIT');
      return { unavailable: true };
    }
    if (user.email_verified_at) {
      await client.query('COMMIT');
      return { alreadyVerified: true };
    }

    const active = await client.query(
      `SELECT id
         FROM auth_tokens
        WHERE user_id = $1
          AND purpose = 'email_verification_otp'
          AND used_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    if (active.rowCount) {
      await client.query('COMMIT');
      return { challengeId: active.rows[0].id, created: false };
    }

    await client.query(
      `UPDATE auth_tokens
          SET used_at = NOW()
        WHERE user_id = $1
          AND purpose = 'email_verification_otp'
          AND used_at IS NULL`,
      [userId],
    );
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, 'email_verification_otp', $3, NOW() + INTERVAL '5 minutes')`,
      [challengeId, userId, tokenHash],
    );
    await client.query('COMMIT');
    return { challengeId, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function replaceEmailVerificationOtp({ userId, challengeId, tokenHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `SELECT id, email_verified_at, is_active
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [userId],
    );
    const user = account.rows[0];
    if (!user || !user.is_active) {
      await client.query('COMMIT');
      return { unavailable: true };
    }
    if (user.email_verified_at) {
      await client.query('COMMIT');
      return { alreadyVerified: true };
    }

    await client.query(
      `UPDATE auth_tokens
          SET used_at = NOW()
        WHERE user_id = $1
          AND purpose = 'email_verification_otp'
          AND used_at IS NULL`,
      [userId],
    );
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, 'email_verification_otp', $3, NOW() + INTERVAL '5 minutes')`,
      [challengeId, userId, tokenHash],
    );
    await client.query('COMMIT');
    return { challengeId, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function consumeEmailVerificationOtp({ challengeId, otpHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, user_id, token_hash, attempts
         FROM auth_tokens
        WHERE id = $1
          AND purpose = 'email_verification_otp'
          AND used_at IS NULL
          AND expires_at > NOW()
          AND attempts < 5
        FOR UPDATE`,
      [challengeId],
    );
    const token = found.rows[0];
    if (!token) {
      await client.query('COMMIT');
      return null;
    }

    const storedHash = Buffer.from(token.token_hash, 'hex');
    const submittedHash = Buffer.from(otpHash, 'hex');
    if (storedHash.length !== submittedHash.length || !crypto.timingSafeEqual(storedHash, submittedHash)) {
      await client.query(
        `UPDATE auth_tokens
            SET attempts = attempts + 1,
                used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
          WHERE id = $1`,
        [challengeId],
      );
      await client.query('COMMIT');
      return null;
    }

    await client.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1', [challengeId]);
    const verified = await client.query(
      `UPDATE users
          SET email_verified_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND is_active = TRUE AND email_verified_at IS NULL
        RETURNING id, name, email, is_active, email_verified_at, token_version`,
      [token.user_id],
    );
    await client.query('COMMIT');
    return verified.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function invalidateToken(tokenId) {
  await pool.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL', [tokenId]);
}

async function consumeOtpAndCreateResetToken({ challengeId, otpHash, resetTokenHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, user_id, token_hash, attempts
         FROM auth_tokens
        WHERE id = $1
          AND purpose = 'reset_otp'
          AND used_at IS NULL
          AND expires_at > NOW()
          AND attempts < 5
        FOR UPDATE`,
      [challengeId],
    );
    const token = found.rows[0];

    if (!token) {
      await client.query('COMMIT');
      return false;
    }

    const storedHash = Buffer.from(token.token_hash, 'hex');
    const submittedHash = Buffer.from(otpHash, 'hex');
    if (storedHash.length !== submittedHash.length || !crypto.timingSafeEqual(storedHash, submittedHash)) {
      await client.query(
        `UPDATE auth_tokens
            SET attempts = attempts + 1,
                used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
          WHERE id = $1`,
        [challengeId],
      );
      await client.query('COMMIT');
      return false;
    }

    await client.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1', [challengeId]);
    await client.query(
      `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'password_reset', $2, NOW() + INTERVAL '10 minutes')`,
      [token.user_id, resetTokenHash],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updatePasswordWithResetToken({ tokenHash, passwordHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, user_id
         FROM auth_tokens
        WHERE purpose = 'password_reset'
          AND token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash],
    );
    const token = found.rows[0];
    if (!token) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `UPDATE users
          SET password_hash = $1,
              token_version = token_version + 1,
              updated_at = NOW()
        WHERE id = $2`,
      [passwordHash, token.user_id],
    );
    await client.query(
      `UPDATE auth_tokens
          SET used_at = NOW()
        WHERE user_id = $1 AND used_at IS NULL`,
      [token.user_id],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getUserByEmail,
  createBorrowerUser,
  getUserRoles,
  getSessionUser,
  countRecentLoginFailures,
  recordLoginEvent,
  incrementAuthRateLimit,
  getPasswordResetUser,
  createPasswordResetOtp,
  getActiveEmailVerificationOtp,
  getEmailVerificationUserByChallenge,
  createEmailVerificationOtp,
  replaceEmailVerificationOtp,
  consumeEmailVerificationOtp,
  invalidateToken,
  consumeOtpAndCreateResetToken,
  updatePasswordWithResetToken,
};
