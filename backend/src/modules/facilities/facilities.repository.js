const pool = require('../../config/db');

const COLUMNS = `id::TEXT AS id, label, requires_detail AS "requiresDetail",
       detail_label AS "detailLabel", is_active AS "isActive"`;

// "Others" always stays last, so it sits at the bottom of the list.
const ORDER_BY = `ORDER BY lower(btrim(label)) = 'others', lower(btrim(label))`;

async function listVenues({ activeOnly }, db = pool) {
  const result = await db.query(
    `SELECT ${COLUMNS}
       FROM facility_options
      WHERE option_type = 'VENUE' ${activeOnly ? 'AND is_active' : ''}
      ${ORDER_BY}`,
  );
  return result.rows;
}

async function getVenueForUpdate(id, client) {
  const result = await client.query(
    `SELECT ${COLUMNS} FROM facility_options WHERE option_type = 'VENUE' AND id = $1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] || null;
}

async function insertVenue({ label, requiresDetail, detailLabel }, client) {
  const result = await client.query(
    `INSERT INTO facility_options (option_type, label, requires_detail, detail_label)
     VALUES ('VENUE', $1, $2, $3)
     RETURNING ${COLUMNS}`,
    [label, requiresDetail, detailLabel],
  );
  return result.rows[0];
}

async function updateVenue(id, { label, requiresDetail, detailLabel, isActive }, client) {
  const result = await client.query(
    `UPDATE facility_options
        SET label = $2, requires_detail = $3, detail_label = $4, is_active = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, label, requiresDetail, detailLabel, isActive],
  );
  return result.rows[0] || null;
}

// Requests keep their own copy of the venue text, so removing the row does not change them.
async function deleteVenue(id, client) {
  const result = await client.query(
    `DELETE FROM facility_options WHERE option_type = 'VENUE' AND id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return result.rows[0] || null;
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

module.exports = { listVenues, getVenueForUpdate, insertVenue, updateVenue, deleteVenue, inTransaction };
