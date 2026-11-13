const pool = require('../../config/db');

async function getSignature(userId, db = pool) {
  const result = await db.query(
    `SELECT image, width, height, image_sha256 AS "imageSha256", updated_at AS "updatedAt"
       FROM user_signatures
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function saveSignature({ userId, image, width, height, imageSha256 }, db = pool) {
  const result = await db.query(
    `INSERT INTO user_signatures (user_id, image, width, height, image_sha256, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE
        SET image = EXCLUDED.image,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            image_sha256 = EXCLUDED.image_sha256,
            updated_at = NOW()
     RETURNING width, height, image_sha256 AS "imageSha256", updated_at AS "updatedAt"`,
    [userId, image, width, height, imageSha256],
  );
  return result.rows[0];
}

async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getSignature, saveSignature, inTransaction };
