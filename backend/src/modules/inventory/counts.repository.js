const pool = require('../../config/db');

// What the records say should be physically in GSO right now: stock minus what employees and
// requesters still hold. Units awaiting handover or set aside for repair are still in the office.
async function listExpectedOnHand() {
  const items = await pool.query(
    `SELECT item.id::TEXT AS "itemId",
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
            item.tracking_mode AS "trackingMode",
            item.unit_of_measure AS "unitOfMeasure",
            item.quantity
              - COALESCE((
                  SELECT SUM(issue.quantity - issue.returned_quantity)
                    FROM employee_issuances AS issue
                   WHERE issue.item_id = item.id AND issue.status = 'Issued'
                ), 0)
              - COALESCE((
                  SELECT SUM(asset.quantity)
                    FROM service_request_assets AS asset
                    JOIN service_requests AS request ON request.id = asset.request_id
                   WHERE asset.item_id = item.id
                     AND request.status IN ('Issued', 'Return Requested')
                     AND asset.returned_at IS NULL
                ), 0) AS expected
       FROM item_catalog AS item
      ORDER BY item.item_code`,
  );
  const tags = await pool.query(
    `SELECT tag.tag_code AS "tagCode", tag.item_id::TEXT AS "itemId", tag.custody_status AS "custodyStatus",
            tag.lifecycle_status AS "lifecycleStatus"
       FROM asset_unit_tags AS tag`,
  );
  return { items: items.rows, tags: tags.rows };
}

async function saveCount({ userId, note, lines, discrepancyCount }) {
  const result = await pool.query(
    `INSERT INTO inventory_counts (counted_by_user_id, note, lines, discrepancy_count)
     VALUES ($1, $2, $3::JSONB, $4)
     RETURNING id::TEXT AS id, created_at AS "createdAt"`,
    [userId, note, JSON.stringify(lines), discrepancyCount],
  );
  return result.rows[0];
}

async function listCounts() {
  const result = await pool.query(
    `SELECT count.id::TEXT AS id, count.note, count.lines, count.discrepancy_count AS "discrepancyCount",
            count.created_at AS "createdAt", counter.name AS "countedBy"
       FROM inventory_counts AS count
       LEFT JOIN users AS counter ON counter.id = count.counted_by_user_id
      ORDER BY count.created_at DESC, count.id DESC
      LIMIT 50`,
  );
  return result.rows;
}

module.exports = { listExpectedOnHand, saveCount, listCounts };
