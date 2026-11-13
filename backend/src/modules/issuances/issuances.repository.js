const crypto = require('crypto');
const pool = require('../../config/db');
const { getAvailableQuantity, refreshInventoryStatus } = require('../inventory/inventory.stock');

function createAssetTagCode() {
  const randomValue = BigInt(`0x${crypto.randomBytes(8).toString('hex')}`);
  return `AST-${randomValue.toString(36).toUpperCase().padStart(13, '0')}`;
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

async function requesterUserIdForEmployee(client, employeeCode) {
  const result = await client.query(
    `SELECT user_id
       FROM requester_identity_profiles
      WHERE verification_status = 'Verified'
        AND lower(trim(employee_code)) = lower(trim($1))
      ORDER BY reviewed_at DESC NULLS LAST, user_id
      LIMIT 1`,
    [employeeCode],
  );
  return result.rows[0]?.user_id ?? null;
}

async function createUnitTags(client, issuance, assignedUserId) {
  if (issuance.tracking_mode === 'quantity') return [];
  const assetResult = await client.query(
    `SELECT serial_number AS "serialNumber", location
       FROM item_catalog
      WHERE id = $1
      FOR UPDATE`,
    [issuance.item_id],
  );
  const asset = assetResult.rows[0] || {};
  const availableTags = await client.query(
    `SELECT id, tag_code AS "tagCode", unit_number AS "unitNumber"
       FROM asset_unit_tags
      WHERE item_id = $1
        AND custody_status = 'Available'
        AND lifecycle_status = 'Active'
        AND condition NOT IN ('Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired')
        AND issuance_id IS NULL
        AND assigned_employee_id IS NULL
        AND assigned_user_id IS NULL
      ORDER BY unit_number
      LIMIT $2
      FOR UPDATE`,
    [issuance.item_id, issuance.quantity],
  );
  const tags = availableTags.rows.map((tag) => ({
    id: String(tag.id),
    tagCode: tag.tagCode,
    unitNumber: tag.unitNumber,
  }));

  if (tags.length > 0) {
    await client.query(
      `UPDATE asset_unit_tags
          SET issuance_id = $2,
              custody_status = 'Issued',
              assigned_employee_id = $3,
              assigned_user_id = $4,
              updated_at = NOW()
        WHERE id = ANY($1::BIGINT[])`,
      [tags.map((tag) => tag.id), issuance.id, issuance.employee_id, assignedUserId],
    );
  }

  const remainingQuantity = Number(issuance.quantity) - tags.length;
  if (remainingQuantity > 0) {
    const numberResult = await client.query(
      `SELECT COALESCE(MAX(unit_number), 0)::INTEGER AS last_unit_number
         FROM asset_unit_tags
        WHERE item_id = $1`,
      [issuance.item_id],
    );
    const firstUnitNumber = Number(numberResult.rows[0]?.last_unit_number || 0) + 1;
    const generatedTagCodes = Array.from({ length: remainingQuantity }, () => createAssetTagCode());
    const createdTags = await client.query(
      `INSERT INTO asset_unit_tags (
         tag_code, item_id, issuance_id, unit_number, serial_number, location, condition, lifecycle_status,
         custody_status, assigned_employee_id, assigned_user_id
       )
       SELECT generated_tag.tag_code, $1, $2,
              $3 + generated_tag.unit_offset::INTEGER - 1,
              CASE WHEN generated_tag.unit_offset = 1 THEN NULLIF($8::TEXT, '') ELSE NULL END,
              COALESCE(NULLIF($9::TEXT, ''), 'GSO Storage'), $4, 'Active', 'Issued', $5, $6
         FROM UNNEST($7::TEXT[]) WITH ORDINALITY AS generated_tag(tag_code, unit_offset)
       RETURNING id::TEXT AS id, tag_code AS "tagCode", unit_number AS "unitNumber"`,
      [
        issuance.item_id,
        issuance.id,
        firstUnitNumber,
        issuance.item_condition,
        issuance.employee_id,
        assignedUserId,
        generatedTagCodes,
        asset.serialNumber || '',
        asset.location || 'GSO Storage',
      ],
    );
    tags.push(...createdTags.rows);
  }
  if (tags.length > 0 && asset.serialNumber) {
    await client.query('UPDATE item_catalog SET serial_number = NULL WHERE id = $1', [issuance.item_id]);
  }
  return tags;
}

async function writeAuditLog(client, issuance, {
  changedByUserId = null,
  reason,
  oldValues,
  newValues,
}) {
  const status = newValues?.issuanceStatus;
  const action = status === 'Pending' ? 'requested'
    : status === 'Issued' && oldValues?.issuanceStatus !== 'Issued' ? 'issued'
      : status === 'Rejected' ? 'rejected'
      : ['Expired', 'Email Failed', 'Cancelled'].includes(status) ? 'cancelled' : 'updated';
  await client.query(
    `INSERT INTO inventory_change_logs (
       entity_type, entity_key, entity_name, item_id, employee_id, action, reason,
       old_values, new_values, changed_by_user_id
     ) VALUES ('item', $1, $2, $3, $4, $9, $5, $6::JSONB, $7::JSONB, $8)`,
    [
      issuance.item_code,
      issuance.description,
      issuance.item_id,
      issuance.employee_id,
      reason,
      JSON.stringify(oldValues),
      JSON.stringify(newValues),
      changedByUserId,
      action,
    ],
  );
}

async function createPendingIssuance({ employeeCode, itemId, quantity, notes, tokenHash, requestedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      `SELECT employee.id, employee.employee_code, employee.first_name, employee.last_name,
              employee.email, employee.status,
              (SELECT account.email
                 FROM requester_identity_profiles AS profile
                 JOIN users AS account ON account.id = profile.user_id
                WHERE profile.verification_status = 'Verified'
                  AND lower(trim(profile.employee_code)) = lower(trim(employee.employee_code))
                ORDER BY profile.reviewed_at DESC NULLS LAST, profile.user_id
                LIMIT 1) AS requester_email
         FROM employees AS employee
        WHERE lower(employee.employee_code) = lower($1)
        FOR SHARE OF employee`,
      [employeeCode],
    );
    const employee = employeeResult.rows[0];
    if (!employee) throw notFound('Hindi na makita ang employee profile. I-refresh ang page at subukan muli.');
    if (employee.status !== 'Active') throw conflict('Hindi puwedeng mag-request ng issuance para sa inactive na employee.');
    if (!employee.requester_email) {
      throw conflict('Kailangan munang ma-verify ng GSO ang requester account na naka-link sa employee bago magpadala ng issuance.');
    }

    const itemResult = await client.query(
      `SELECT id, item_code, description, condition, inventory_status, tracking_mode, quantity, unit_of_measure
         FROM item_catalog
        WHERE id = $1
        FOR UPDATE`,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw notFound('Hindi na makita ang inventory item. I-refresh ang inventory at pumili muli.');
    if (item.inventory_status === 'Borrowed') throw conflict('Hindi available ang item na ito para i-issue muli.');
    const availableQuantity = await getAvailableQuantity(client, item);
    if (availableQuantity < quantity) {
      throw conflict(`Hindi sapat ang available stock. ${item.item_code} ay may ${availableQuantity} ${item.unit_of_measure} na available.`);
    }

    const inserted = await client.query(
      `INSERT INTO employee_issuances (
         employee_id, item_id, requested_by_user_id, status, token_hash,
         token_expires_at, item_condition, notes, quantity, unit_of_measure
       ) VALUES ($1, $2, $3, 'Pending', $4, NOW() + INTERVAL '24 hours', $5, $6, $7, $8)
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt"`,
      [employee.id, item.id, requestedByUserId, tokenHash, item.condition, notes, quantity, item.unit_of_measure],
    );
    await refreshInventoryStatus(client, item.id);
    const issuance = {
      id: inserted.rows[0].id,
      status: inserted.rows[0].status,
      expiresAt: inserted.rows[0].expiresAt,
      requestedAt: inserted.rows[0].requestedAt,
      employee_id: employee.id,
      employee_code: employee.employee_code,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      employee_email: employee.email,
      item_id: item.id,
      item_code: item.item_code,
      description: item.description,
      item_condition: item.condition,
      quantity,
      unit_of_measure: item.unit_of_measure,
    };

    await writeAuditLog(client, issuance, {
      changedByUserId: requestedByUserId,
      reason: `Issuance request for ${quantity} ${item.unit_of_measure} of ${issuance.description} is awaiting employee email approval.`,
      oldValues: { inventoryStatus: item.inventory_status, availableQuantity },
      newValues: {
        inventoryStatus: quantity === availableQuantity ? 'Reserved' : 'Available',
        reservedQuantity: quantity,
        issuanceStatus: 'Pending',
        employeeCode: employee.employee_code,
        employeeEmail: employee.email,
      },
    });

    await client.query('COMMIT');
    return issuance;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && ['employee_issuances_one_active_employee_item_idx', 'employee_issuances_one_active_item_idx'].includes(error.constraint)) {
      throw conflict('May pending o active issuance na ang item na ito.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function markEmailSent(issuanceId) {
  await pool.query(
    `UPDATE employee_issuances
        SET email_sent_at = NOW()
      WHERE id = $1 AND status = 'Pending'`,
    [issuanceId],
  );
}

async function markEmailFailed(issuanceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, inventory.item_code,
              inventory.description, employee.employee_code, employee.first_name,
              employee.last_name
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.id = $1 AND issue.status = 'Pending'
        FOR UPDATE OF issue, inventory`,
      [issuanceId],
    );
    const issuance = result.rows[0];
    if (issuance) {
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Email Failed',
                decision_note = 'The approval email could not be delivered.',
                decided_at = NOW()
          WHERE id = $1`,
        [issuanceId],
      );
      await refreshInventoryStatus(client, issuance.item_id);
      await writeAuditLog(client, issuance, {
        reason: `Issuance approval email could not be delivered to ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
        newValues: { issuanceStatus: 'Email Failed' },
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createPendingIssuanceBatch({ employeeCode, items: requestedItems, notes, borrowDetails, purchaseRequisitionId, tokenHash, requestedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      `SELECT employee.id, employee.employee_code, employee.first_name, employee.middle_name, employee.last_name, employee.suffix,
              employee.email, employee.status, employee.department,
              requester.user_id AS requester_user_id,
              COALESCE(requester.email, employee.email) AS requester_email
         FROM employees AS employee
         LEFT JOIN LATERAL (
           SELECT profile.user_id, account.email
             FROM requester_identity_profiles AS profile
             JOIN users AS account ON account.id = profile.user_id
            WHERE profile.verification_status = 'Verified'
              AND lower(trim(profile.employee_code)) = lower(trim(employee.employee_code))
            ORDER BY profile.reviewed_at DESC NULLS LAST, profile.user_id
            LIMIT 1
         ) AS requester ON TRUE
        WHERE lower(employee.employee_code) = lower($1)
        FOR SHARE OF employee`,
      [employeeCode],
    );
    const employee = employeeResult.rows[0];
    if (!employee) throw notFound('Hindi na makita ang employee profile. I-refresh ang page at subukan muli.');
    if (employee.status !== 'Active') throw conflict('Hindi puwedeng mag-request ng issuance para sa inactive na employee.');

    let requisition = null;
    const requisitionLinesById = new Map();
    if (purchaseRequisitionId) {
      const requisitionResult = await client.query(
        `SELECT id, request_type, status, form_data FROM service_requests WHERE id = $1 FOR UPDATE`,
        [purchaseRequisitionId],
      );
      requisition = requisitionResult.rows[0];
      if (!requisition || requisition.request_type !== 'PURCHASE_REQUISITION') throw notFound('Hindi makita ang purchase requisition.');
      const issuableRequisitionStatuses = new Set([
        'Approved', 'Under Review', 'GSO Endorsed', 'Finance Handoff Pending',
        'Finance Handoff Failed', 'Sent to Finance', 'Finance Response Recorded',
      ]);
      if (!issuableRequisitionStatuses.has(requisition.status)) {
        throw conflict('Walang active purchase requisition stage na puwedeng i-issue sa Main Issuance.');
      }
      if (String(requisition.form_data?.requesterEmployeeCode || '').trim().toLowerCase() !== employee.employee_code.trim().toLowerCase()) {
        throw conflict('Hindi tugma ang employee sa purchase requisition. Piliin ang tamang recipient.');
      }
      const lineIds = requestedItems.map((item) => item.purchaseRequisitionLineId);
      if (lineIds.some((lineId) => !lineId)) throw conflict('Pumili lamang ng item na nakalaan sa requisition na ito.');
      const requestLinesResult = await client.query(
        `SELECT id, request_id, route_status, requested_quantity, reserved_quantity, finance_quantity, issued_quantity
           FROM purchase_requisition_lines
          WHERE request_id = $1
          ORDER BY line_number FOR UPDATE`,
        [purchaseRequisitionId],
      );
      const availableForWholeRequest = new Set(['READY_FOR_STAFF', 'PARTIALLY_ISSUED', 'HANDOVER_PENDING', 'ISSUED']);
      const allRequestLinesReady = requestLinesResult.rows.length > 0 && requestLinesResult.rows.every((line) => (
        availableForWholeRequest.has(line.route_status)
          && Number(line.finance_quantity) === 0
          && Number(line.reserved_quantity) >= Number(line.requested_quantity)
      ));
      if (!allRequestLinesReady) {
        throw conflict('Hindi pa kumpleto ang stock ng buong request. Walang item na puwedeng i-issue hanggang ready ang bawat requested item.');
      }
      const requestLinesById = new Map(requestLinesResult.rows.map((line) => [String(line.id), line]));
      const selectedLines = lineIds.map((lineId) => requestLinesById.get(String(lineId)));
      if (selectedLines.some((line) => !line)
        || selectedLines.some((line) => !['READY_FOR_STAFF', 'PARTIALLY_ISSUED'].includes(line.route_status))) {
        throw conflict('May napiling item na hindi na ready para sa staff issuance. I-refresh ang queue.');
      }
      for (const line of selectedLines) requisitionLinesById.set(String(line.id), line);
    } else if (requestedItems.some((item) => item.purchaseRequisitionLineId)) {
      throw conflict('May purchase requisition item reference na walang request context. I-refresh ang queue.');
    } else if (requestedItems.some((item) => item.recipientAllocations.length > 0)) {
      throw conflict('Recipient allocations are only available for an approved purchase requisition.');
    }

    const recipientCodes = [...new Set(requestedItems.flatMap((item) => item.recipientAllocations
      .map((allocation) => allocation.employeeCode.trim())
      .filter((code) => code.toLowerCase() !== employee.employee_code.trim().toLowerCase())))];
    const recipientByCode = new Map([[employee.employee_code.trim().toLowerCase(), employee]]);
    if (recipientCodes.length > 0) {
      const recipientsResult = await client.query(
        `SELECT employee.id, employee.employee_code, employee.first_name, employee.middle_name, employee.last_name, employee.suffix,
                employee.email, employee.status, employee.department,
                requester.user_id AS requester_user_id,
                COALESCE(requester.email, employee.email) AS requester_email
           FROM employees AS employee
           LEFT JOIN LATERAL (
             SELECT profile.user_id, account.email
               FROM requester_identity_profiles AS profile
               JOIN users AS account ON account.id = profile.user_id
              WHERE profile.verification_status = 'Verified'
                AND lower(trim(profile.employee_code)) = lower(trim(employee.employee_code))
              ORDER BY profile.reviewed_at DESC NULLS LAST, profile.user_id
              LIMIT 1
           ) AS requester ON TRUE
          WHERE lower(trim(employee.employee_code)) = ANY($1::TEXT[])
          FOR SHARE OF employee`,
        [recipientCodes.map((code) => code.toLowerCase())],
      );
      if (recipientsResult.rows.length !== recipientCodes.length) {
        throw conflict('May recipient na hindi makita sa Employee Master Data. I-refresh at piliin ulit ang active department staff.');
      }
      for (const recipient of recipientsResult.rows) {
        if (recipient.status !== 'Active'
          || String(recipient.department || '').trim().toLowerCase() !== String(employee.department || '').trim().toLowerCase()) {
          throw conflict(`${recipient.employee_code} ay hindi active staff sa department ng requesting head.`);
        }
        recipientByCode.set(recipient.employee_code.trim().toLowerCase(), recipient);
      }
    }

    const itemResult = await client.query(
      `SELECT id, item_code, description, condition, inventory_status, tracking_mode, issue_behavior, quantity, unit_of_measure
         FROM item_catalog
        WHERE id = ANY($1::BIGINT[])
        ORDER BY id
        FOR UPDATE`,
      [requestedItems.map((item) => item.itemId)],
    );
    if (itemResult.rows.length !== requestedItems.length) {
      throw notFound('Hindi na makita ang isa o higit pang inventory item. I-refresh ang inventory at subukan muli.');
    }
    const itemsById = new Map(itemResult.rows.map((item) => [String(item.id), item]));
    const items = requestedItems.map((requested) => {
      const recipientAllocations = requested.recipientAllocations.length > 0
        ? requested.recipientAllocations.map((allocation) => {
          const recipient = recipientByCode.get(allocation.employeeCode.trim().toLowerCase());
          if (!recipient) throw conflict(`Hindi makita ang recipient na ${allocation.employeeCode}.`);
          return { ...allocation, recipient };
        })
        : [{ employeeCode: employee.employee_code, quantity: requested.quantity, location: '', purpose: '', recipient: employee }];
      if (recipientAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== requested.quantity) {
        throw conflict('Dapat tumugma ang recipient allocation sa quantity na ini-issue.');
      }
      return {
        ...itemsById.get(String(requested.itemId)),
        requestedQuantity: requested.quantity,
        recipientAllocations,
        purchaseRequisitionLine: requested.purchaseRequisitionLineId
          ? requisitionLinesById.get(String(requested.purchaseRequisitionLineId))
          : null,
      };
    });
    const itemFlow = (item) => item.tracking_mode === 'individual'
      ? 'per-unit'
      : item.issue_behavior === 'consumable' ? 'consumable' : 'reusable';
    const selectedFlows = new Set(items.map(itemFlow));
    if (selectedFlows.has('reusable')) {
      throw conflict('Reusable stock must be handled through the separate Borrowing workflow, not Main Issuance.');
    }
    if (!purchaseRequisitionId && selectedFlows.has('per-unit')) {
      throw conflict('Individually tracked items must go through an approved Purchase Requisition before issuance. Consumable stock may be issued directly.');
    }
    if (selectedFlows.size > 1) {
      throw conflict('Process one inventory type per issuance.');
    }
    if (borrowDetails) throw conflict('Borrowing schedules are handled through the separate Borrowing workflow.');
    const isConsumableIssue = selectedFlows.has('consumable');
    // Individually tracked items may only enter this flow from an approved purchase requisition.
    // GSO prepares them for pickup immediately, including their barcode labels; the
    // requester no longer needs to acknowledge a separate handover step.
    const isPerUnitPickup = selectedFlows.has('per-unit');
    const initialStatus = isConsumableIssue || isPerUnitPickup ? 'Issued' : 'Pending';
    const initialDecisionNote = isConsumableIssue
      ? 'Released by GSO. No employee approval is required for consumable stock.'
      : 'GSO prepared the individually tracked item for pickup. Barcode labels are ready; no requester confirmation is required.';
    for (const item of items) {
      if (!item.id) throw notFound('Hindi na makita ang isa o higit pang inventory item. I-refresh ang inventory at subukan muli.');
      if (item.purchaseRequisitionLine) {
        const allocation = await client.query(
          `SELECT quantity, fulfilled_quantity
             FROM purchase_requisition_line_allocations
            WHERE line_id = $1 AND item_id = $2 AND status = 'Reserved'
            FOR UPDATE`,
          [item.purchaseRequisitionLine.id, item.id],
        );
        const reserved = allocation.rows.reduce((sum, row) => sum + Number(row.quantity) - Number(row.fulfilled_quantity), 0);
        if (reserved < item.requestedQuantity) throw conflict(`Hindi na sapat ang nakareserbang stock para sa ${item.item_code}. I-refresh ang requisition queue.`);
        item.purchaseRequisitionReservedQuantity = reserved;
      }
      const availableQuantity = await getAvailableQuantity(client, item) + Number(item.purchaseRequisitionReservedQuantity || 0);
      if (item.inventory_status === 'Borrowed' || availableQuantity < item.requestedQuantity) {
        throw conflict(`Hindi sapat ang available stock para sa ${item.item_code || 'napiling item'}. ${availableQuantity} ${item.unit_of_measure || 'unit'} na lang ang available.`);
      }
      item.availableQuantityBefore = availableQuantity;
    }

    const batchResult = await client.query(
      `INSERT INTO employee_issuance_batches (
         employee_id, requested_by_user_id, requester_user_id, status, token_hash, token_expires_at,
         borrow_use_date, expected_return_date, borrow_use_at, expected_return_at, use_location, use_purpose, decision_note, decided_at,
         purchase_requisition_id
       ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours', $6, $7, $8, $9, $10, $11, $12,
                 CASE WHEN $4 = 'Issued' THEN NOW() ELSE NULL END, $13)
       RETURNING id, status, token_expires_at AS "expiresAt", requested_at AS "requestedAt",
                 borrow_use_date::TEXT AS "borrowUseDate",
                 to_char(borrow_use_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "borrowUseAt",
                 expected_return_date::TEXT AS "expectedReturnDate",
                 to_char(expected_return_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "expectedReturnAt",
                 use_location AS "useLocation", use_purpose AS "usePurpose"`,
      [employee.id, requestedByUserId, employee.requester_user_id, initialStatus, tokenHash,
        borrowDetails?.useDate ?? null, borrowDetails?.expectedReturnDate ?? null,
        borrowDetails?.useAt ?? null, borrowDetails?.expectedReturnAt ?? null,
        borrowDetails?.useLocation ?? null, borrowDetails?.purpose ?? null, initialDecisionNote, purchaseRequisitionId || null],
    );
    const batch = batchResult.rows[0];

    const issuanceItems = [];
    const requisitionLineQuantities = new Map();
    for (const item of items) {
      if (!item.id) throw notFound('Hindi na makita ang isa o higit pang inventory item. I-refresh ang inventory at subukan muli.');
      if (item.purchaseRequisitionLine) {
        const line = item.purchaseRequisitionLine;
        await client.query(
          `UPDATE purchase_requisition_line_allocations
              SET fulfilled_quantity = fulfilled_quantity + $3,
                  status = CASE WHEN fulfilled_quantity + $3 >= quantity THEN 'Fulfilled' ELSE 'Reserved' END,
                  updated_at = NOW()
            WHERE line_id = $1 AND item_id = $2 AND status = 'Reserved'`,
          [line.id, item.id, item.requestedQuantity],
        );
        const existingLineQuantity = requisitionLineQuantities.get(String(line.id));
        requisitionLineQuantities.set(String(line.id), {
          line,
          quantity: Number(existingLineQuantity?.quantity || 0) + Number(item.requestedQuantity),
        });
      }

      for (const recipientAllocation of item.recipientAllocations) {
        const recipient = recipientAllocation.recipient;
        const recipientNotes = [
          notes,
          recipientAllocation.location ? `Use location: ${recipientAllocation.location}` : '',
          recipientAllocation.purpose ? `Intended use: ${recipientAllocation.purpose}` : '',
        ].filter(Boolean).join(' · ');
        const inserted = await client.query(
          `INSERT INTO employee_issuances (
             batch_id, employee_id, item_id, requested_by_user_id, status, token_hash,
             token_expires_at, item_condition, notes, quantity, unit_of_measure, decision_note, decided_at,
             purchase_requisition_line_id, recipient_location, recipient_purpose
           ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11,
                     CASE WHEN $5 = 'Issued' THEN NOW() ELSE NULL END, $12, $13, $14)
           RETURNING id`,
          [batch.id, recipient.id, item.id, requestedByUserId, initialStatus, batch.expiresAt,
            item.condition, recipientNotes, recipientAllocation.quantity, item.unit_of_measure,
            initialDecisionNote, item.purchaseRequisitionLine?.id || null,
            recipientAllocation.location, recipientAllocation.purpose],
        );
        const issuance = {
          id: inserted.rows[0].id,
          employee_id: recipient.id,
          employee_code: recipient.employee_code,
          employee_name: `${recipient.first_name} ${recipient.middle_name || ''} ${recipient.last_name} ${recipient.suffix || ''}`.trim().replace(/\s+/g, ' '),
          employee_email: recipient.requester_email || recipient.email,
          item_id: item.id,
          item_code: item.item_code,
          description: item.description,
          tracking_mode: item.tracking_mode,
          item_condition: item.condition,
          quantity: recipientAllocation.quantity,
          unit_of_measure: item.unit_of_measure,
        };
        const tags = initialStatus === 'Issued' && item.tracking_mode === 'individual'
          ? await createUnitTags(client, issuance, recipient.requester_user_id || null)
          : [];
        issuanceItems.push({
          id: issuance.id,
          itemId: item.id,
          itemCode: item.item_code,
          itemName: item.description,
          recipientEmployeeCode: recipient.employee_code,
          recipientEmployeeName: issuance.employee_name,
          recipientLocation: recipientAllocation.location,
          recipientPurpose: recipientAllocation.purpose,
          trackingMode: item.tracking_mode,
          issueBehavior: item.issue_behavior,
          condition: item.condition,
          quantity: recipientAllocation.quantity,
          unitOfMeasure: item.unit_of_measure,
          availableQuantity: item.availableQuantityBefore - item.requestedQuantity,
          tags: tags.map((tag) => ({ tagCode: tag.tagCode, unitNumber: tag.unitNumber, printedAt: null })),
        });

        await writeAuditLog(client, issuance, {
          changedByUserId: requestedByUserId,
          reason: isConsumableIssue
            ? `GSO issued ${recipientAllocation.quantity} ${item.unit_of_measure} of ${issuance.description} to ${recipient.employee_code} for requisition head ${employee.employee_code}.`
            : `GSO issued ${issuance.description} to ${recipient.employee_code} for requisition head ${employee.employee_code}; barcode labels are ready.`,
          oldValues: { inventoryStatus: item.inventory_status, availableQuantity: item.availableQuantityBefore },
          newValues: {
            inventoryStatus: item.requestedQuantity === item.availableQuantityBefore ? 'Issued' : 'Available',
            reservedQuantity: 0,
            issuedQuantity: recipientAllocation.quantity,
            issuanceStatus: initialStatus,
            barcodeCount: tags.length,
            issuanceBatchId: batch.id,
            handoverEmployeeCode: employee.employee_code,
            employeeCode: recipient.employee_code,
            employeeEmail: issuance.employee_email,
            recipientLocation: recipientAllocation.location,
            recipientPurpose: recipientAllocation.purpose,
          },
        });
      }
      await refreshInventoryStatus(client, item.id);
    }

    for (const { line, quantity } of requisitionLineQuantities.values()) {
      if (initialStatus === 'Pending') {
        line.route_status = 'HANDOVER_PENDING';
      } else {
        line.issued_quantity = Number(line.issued_quantity) + quantity;
        if (line.issued_quantity < Number(line.reserved_quantity)) line.route_status = 'PARTIALLY_ISSUED';
        else if (Number(line.finance_quantity) > 0) {
          line.route_status = requisition.status === 'Sent to Finance' ? 'WAITING_FOR_PURCHASE' : 'WAITING_FINANCE';
        } else line.route_status = 'ISSUED';
      }
      await client.query(
        `UPDATE purchase_requisition_lines
            SET issued_quantity = $2, route_status = $3, updated_at = NOW()
          WHERE id = $1`,
        [line.id, line.issued_quantity, line.route_status],
      );
    }

    if (purchaseRequisitionId) {
      const issuedSummary = issuanceItems.map((item) => `${item.quantity} ${item.unitOfMeasure} ${item.itemName} to ${item.recipientEmployeeName}`).join('; ');
      const actionNote = isPerUnitPickup
        ? `GSO Staff recorded ${issuedSummary}; barcode labels are mapped to the listed staff recipients and ready to print.`
        : initialStatus === 'Pending'
        ? `GSO Staff prepared the physical handover for ${issuedSummary}; requester receipt is pending.`
        : `GSO Staff issued ${issuedSummary} through Main Issuance.`;
      await client.query(
        `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
         VALUES ($1, $2, $2, $3, $4)`,
        [purchaseRequisitionId, requisition.status, actionNote, requestedByUserId],
      );
    }

    if (purchaseRequisitionId && initialStatus !== 'Pending') {
      const unfinishedResult = await client.query(
        `SELECT COUNT(*) FILTER (WHERE route_status NOT IN ('ISSUED', 'REJECTED', 'CANCELLED'))::INTEGER AS unfinished,
                BOOL_OR(route_status = 'ISSUED') AS has_issued
           FROM purchase_requisition_lines
          WHERE request_id = $1`,
        [purchaseRequisitionId],
      );
      if (Number(unfinishedResult.rows[0]?.unfinished || 0) === 0 && unfinishedResult.rows[0]?.has_issued && !isPerUnitPickup) {
        const finalRequestStatus = 'Completed';
        const finalRequestNote = isPerUnitPickup
          ? 'All approved requisition items are prepared for pickup by GSO; barcode labels are ready.'
          : 'All approved requisition items have been issued by GSO Staff.';
        const deliveredTo = await requisitionDeliverySummary(client, purchaseRequisitionId);
        const noteWithDelivery = deliveredTo ? `${finalRequestNote} Delivered to: ${deliveredTo}.` : finalRequestNote;
        const completed = await client.query(
          `UPDATE service_requests
              SET status = $2,
                  completed_at = CASE WHEN $2 = 'Completed' THEN NOW() ELSE NULL END,
                  updated_at = NOW()
            WHERE id = $1 AND status <> $2
            RETURNING status`,
          [purchaseRequisitionId, finalRequestStatus],
        );
        if (completed.rowCount) {
          await client.query(
            `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [purchaseRequisitionId, requisition.status, finalRequestStatus, noteWithDelivery, requestedByUserId],
          );
        }
      }
    }
    await client.query('COMMIT');
    return {
      id: batch.id,
      status: batch.status,
      requesterAccountLinked: Boolean(employee.requester_user_id),
      requesterUserId: employee.requester_user_id ? String(employee.requester_user_id) : null,
      expiresAt: batch.expiresAt,
      requestedAt: batch.requestedAt,
      borrowDetails: batch.borrowUseDate ? {
        useDate: batch.borrowUseDate,
        expectedReturnDate: batch.expectedReturnDate,
        useAt: batch.borrowUseAt,
        expectedReturnAt: batch.expectedReturnAt,
        useLocation: batch.useLocation,
        purpose: batch.usePurpose,
      } : null,
      employee_code: employee.employee_code,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      employee_email: employee.requester_email,
      items: issuanceItems,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && ['employee_issuances_one_active_employee_item_idx', 'employee_issuances_one_active_item_idx'].includes(error.constraint)) {
      throw conflict('May pending o active issuance na ang isa o higit pang item. I-refresh ang inventory at piliin muli.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function markBatchEmailSent(batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE employee_issuance_batches
          SET email_sent_at = NOW()
      WHERE id = $1 AND status IN ('Pending', 'Issued')`,
      [batchId],
    );
    await client.query(
      `UPDATE employee_issuances
          SET email_sent_at = NOW()
        WHERE batch_id = $1 AND status IN ('Pending', 'Issued')`,
      [batchId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markBatchEmailFailed(batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batchResult = await client.query(
      `SELECT batch.id, batch.employee_id, employee.employee_code
         FROM employee_issuance_batches AS batch
         JOIN employees AS employee ON employee.id = batch.employee_id
        WHERE batch.id = $1 AND batch.status = 'Pending'
        FOR UPDATE OF batch`,
      [batchId],
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      await client.query('COMMIT');
      return;
    }

    const itemsResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.batch_id = $1 AND issue.status = 'Pending'
        ORDER BY issue.id
        FOR UPDATE OF issue, inventory`,
      [batchId],
    );
    await client.query(
      `UPDATE employee_issuance_batches
          SET status = 'Email Failed',
              decision_note = 'The issuance notification email could not be delivered.',
              decided_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [batchId],
    );
    await client.query(
      `UPDATE employee_issuances
          SET status = 'Email Failed',
              decision_note = 'The issuance notification email could not be delivered.',
              decided_at = NOW()
        WHERE batch_id = $1 AND status = 'Pending'`,
      [batchId],
    );
    const itemIds = itemsResult.rows.map((item) => item.item_id);
    for (const itemId of new Set(itemIds.map(String))) await refreshInventoryStatus(client, itemId);
    for (const issuance of itemsResult.rows) {
      await writeAuditLog(client, issuance, {
        reason: `Issuance notification email could not be delivered to ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
        newValues: { issuanceStatus: 'Email Failed' },
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Old purchase-requisition batches may still be Pending from the former
// requester-confirmation flow. Promote only individually tracked batches so they adopt
// the new pickup flow without affecting any other legacy approval process.
async function prepareLegacyPendingPickupBatches(userId) {
  const pendingResult = await pool.query(
    `SELECT batch.id::TEXT AS id
       FROM employee_issuance_batches AS batch
       JOIN employees AS employee ON employee.id = batch.employee_id
       JOIN requester_identity_profiles AS profile
         ON profile.user_id = $1
        AND profile.verification_status = 'Verified'
        AND lower(trim(profile.employee_code)) = lower(trim(employee.employee_code))
      WHERE batch.requester_user_id = $1
        AND batch.status = 'Pending'
        AND batch.purchase_requisition_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM employee_issuances AS issue
            JOIN item_catalog AS inventory ON inventory.id = issue.item_id
           WHERE issue.batch_id = batch.id
             AND inventory.tracking_mode = 'individual'
        )
        AND NOT EXISTS (
          SELECT 1
            FROM employee_issuances AS issue
            JOIN item_catalog AS inventory ON inventory.id = issue.item_id
           WHERE issue.batch_id = batch.id
             AND (inventory.tracking_mode <> 'individual' OR issue.status <> 'Pending')
        )
        AND NOT EXISTS (
          SELECT 1
            FROM employee_issuances AS issue
           WHERE issue.batch_id = batch.id
             AND issue.purchase_requisition_line_id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
            FROM employee_issuances AS issue
            JOIN purchase_requisition_lines AS line ON line.id = issue.purchase_requisition_line_id
           WHERE issue.batch_id = batch.id
             AND line.route_status <> 'HANDOVER_PENDING'
        )
      ORDER BY batch.id`,
    [userId],
  );

  for (const batch of pendingResult.rows) {
    await resolveApproval({
      batchId: batch.id,
      requesterUserId: userId,
      action: 'acknowledge',
      autoPreparePickup: true,
    });
  }
}

async function listMyPendingIssuanceBatches(userId) {
  const result = await pool.query(
    `SELECT batch.id::TEXT AS id,
            batch.status,
            batch.requested_at AS "requestedAt",
            batch.token_expires_at AS "expiresAt",
            batch.borrow_use_date::TEXT AS "borrowUseDate",
            to_char(batch.borrow_use_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "borrowUseAt",
            batch.expected_return_date::TEXT AS "expectedReturnDate",
            to_char(batch.expected_return_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "expectedReturnAt",
            batch.use_location AS "useLocation",
            batch.use_purpose AS "usePurpose",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            requester.name AS "requestedBy",
            COALESCE(
              json_agg(json_build_object(
                'issuanceId', issue.id::TEXT,
                'itemCode', inventory.item_code,
                'itemName', inventory.description,
                'recipientEmployeeCode', recipient.employee_code,
                'recipientEmployeeName', trim(concat_ws(' ', recipient.first_name, recipient.middle_name, recipient.last_name, recipient.suffix)),
                'recipientLocation', issue.recipient_location,
                'recipientPurpose', issue.recipient_purpose,
                'trackingMode', inventory.tracking_mode,
                'issueBehavior', inventory.issue_behavior,
                'condition', issue.item_condition,
                'quantity', issue.quantity,
                'unitOfMeasure', issue.unit_of_measure,
                'notes', issue.notes,
                'tags', COALESCE((
                  SELECT json_agg(json_build_object(
                    'tagCode', unit_tag.tag_code,
                    'unitNumber', unit_tag.unit_number
                  ) ORDER BY unit_tag.unit_number)
                    FROM asset_unit_tags AS unit_tag
                   WHERE unit_tag.issuance_id = issue.id
                ), '[]'::JSON)
              ) ORDER BY issue.id) FILTER (WHERE issue.id IS NOT NULL),
              '[]'::JSON
            ) AS items
       FROM requester_identity_profiles AS profile
       JOIN employees AS employee
         ON lower(trim(employee.employee_code)) = lower(trim(profile.employee_code))
       JOIN employee_issuance_batches AS batch ON batch.employee_id = employee.id
       LEFT JOIN users AS requester ON requester.id = batch.requested_by_user_id
       LEFT JOIN employee_issuances AS issue ON issue.batch_id = batch.id
        LEFT JOIN employees AS recipient ON recipient.id = issue.employee_id
       LEFT JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE profile.user_id = $1
        AND profile.verification_status = 'Verified'
        AND batch.requester_user_id = $1
        AND batch.status = 'Pending'
       GROUP BY batch.id, employee.id, requester.id
      ORDER BY batch.requested_at DESC, batch.id DESC`,
    [userId],
  );
  return result.rows;
}

async function listMyIssuanceActivity(userId) {
  const result = await pool.query(
    `SELECT batch.id::TEXT AS id,
            batch.status,
            batch.requested_at AS "requestedAt",
            batch.decided_at AS "decidedAt",
            batch.decision_note AS "decisionNote",
            batch.borrow_use_date::TEXT AS "borrowUseDate",
            to_char(batch.borrow_use_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "borrowUseAt",
            batch.expected_return_date::TEXT AS "expectedReturnDate",
            to_char(batch.expected_return_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "expectedReturnAt",
            batch.use_location AS "useLocation",
            batch.use_purpose AS "usePurpose",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            requester.name AS "requestedBy",
            COALESCE(
              json_agg(json_build_object(
                'issuanceId', issue.id::TEXT,
                'itemCode', inventory.item_code,
                'itemName', inventory.description,
                'recipientEmployeeCode', recipient.employee_code,
                'recipientEmployeeName', trim(concat_ws(' ', recipient.first_name, recipient.middle_name, recipient.last_name, recipient.suffix)),
                'recipientLocation', issue.recipient_location,
                'recipientPurpose', issue.recipient_purpose,
                'trackingMode', inventory.tracking_mode,
                'issueBehavior', inventory.issue_behavior,
                'status', issue.status,
                'condition', issue.item_condition,
                'quantity', issue.quantity,
                'returnedQuantity', issue.returned_quantity,
                'returnedAt', (
                  SELECT MAX(COALESCE(ret.decided_at, ret.requested_at)) FROM employee_issuance_returns AS ret
                   WHERE ret.issuance_id = issue.id AND ret.status NOT IN ('Voided', 'Lost')
                ),
                'returnedByName', (
                  SELECT NULLIF(BTRIM(ret.returned_by_name), '') FROM employee_issuance_returns AS ret
                   WHERE ret.issuance_id = issue.id AND ret.status NOT IN ('Voided', 'Lost')
                   ORDER BY COALESCE(ret.decided_at, ret.requested_at) DESC, ret.id DESC LIMIT 1
                ),
                'returnCondition', (
                  SELECT ret.return_condition FROM employee_issuance_returns AS ret
                   WHERE ret.issuance_id = issue.id AND ret.status NOT IN ('Voided', 'Lost')
                   ORDER BY COALESCE(ret.decided_at, ret.requested_at) DESC, ret.id DESC LIMIT 1
                ),
                'unitOfMeasure', issue.unit_of_measure,
                'notes', issue.notes,
                'tags', COALESCE((
                  SELECT json_agg(json_build_object(
                    'tagCode', unit_tag.tag_code,
                    'unitNumber', unit_tag.unit_number
                  ) ORDER BY unit_tag.unit_number)
                    FROM asset_unit_tags AS unit_tag
                   WHERE unit_tag.issuance_id = issue.id
                ), '[]'::JSON)
              ) ORDER BY issue.id) FILTER (WHERE issue.id IS NOT NULL),
              '[]'::JSON
            ) AS items
       FROM requester_identity_profiles AS profile
       JOIN employees AS employee
         ON lower(trim(employee.employee_code)) = lower(trim(profile.employee_code))
       JOIN employee_issuance_batches AS batch ON batch.employee_id = employee.id
       LEFT JOIN users AS requester ON requester.id = batch.requested_by_user_id
       LEFT JOIN employee_issuances AS issue ON issue.batch_id = batch.id
        LEFT JOIN employees AS recipient ON recipient.id = issue.employee_id
       LEFT JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE profile.user_id = $1
        AND profile.verification_status = 'Verified'
        AND batch.requester_user_id = $1
      GROUP BY batch.id, employee.id, requester.id
      ORDER BY COALESCE(batch.decided_at, batch.requested_at) DESC, batch.id DESC
      LIMIT 100`,
    [userId],
  );
  return result.rows;
}

async function listIssuanceReturnRows(userId) {
  const result = await pool.query(
    `SELECT return_record.id::TEXT AS id,
            return_record.status,
            return_record.return_condition AS condition,
            return_record.reason,
            NULLIF(BTRIM(return_record.returned_by_name), '') AS "returnedByName",
            return_record.requested_at AS "requestedAt",
            return_record.decided_at AS "decidedAt",
            return_record.quantity,
            issue.unit_of_measure AS "unitOfMeasure",
            staff.employee_code AS "employeeCode",
            trim(concat_ws(' ', staff.first_name, staff.middle_name, staff.last_name, staff.suffix)) AS "employeeName",
            inventory.item_code AS "itemCode",
            COALESCE(NULLIF(inventory.item_name, ''), inventory.description) AS "itemName",
            COALESCE(return_record.tag_snapshot->>'tagCode', tag.tag_code) AS "tagCode",
            issue.recipient_location AS "recipientLocation",
            issue.recipient_purpose AS "recipientPurpose",
            staff.department
       FROM requester_identity_profiles AS profile
        JOIN employees AS head
          ON lower(trim(head.employee_code)) = lower(trim(profile.employee_code))
        JOIN employees AS staff
          ON lower(trim(staff.department)) = lower(trim(head.department))
        JOIN employee_issuances AS issue ON issue.employee_id = staff.id
        JOIN employee_issuance_returns AS return_record ON return_record.issuance_id = issue.id
       JOIN item_catalog AS inventory ON inventory.id = issue.item_id
       LEFT JOIN asset_unit_tags AS tag ON tag.id = return_record.asset_unit_tag_id
      WHERE profile.user_id = $1
        AND profile.verification_status = 'Verified'
        AND head.status = 'Active'
        AND return_record.status NOT IN ('Voided', 'Lost')
      ORDER BY COALESCE(return_record.decided_at, return_record.requested_at) DESC,
               return_record.id DESC
      LIMIT 20`,
    [userId],
  );
  return result.rows;
}

// Issuance returns and borrowing returns from the requester's verified department, newest first.
async function listMyDepartmentReturnActivity(userId) {
  const [issuanceRows, borrowingRows] = await Promise.all([listIssuanceReturnRows(userId), listBorrowingReturnRows(userId)]);
  return [...issuanceRows, ...borrowingRows]
    .sort((first, second) => new Date(second.decidedAt || second.requestedAt).getTime() - new Date(first.decidedAt || first.requestedAt).getTime())
    .slice(0, 20);
}

// One row per borrowed item that GSO has received back, so a returned borrowing appears in Recent returns.
async function listBorrowingReturnRows(userId) {
  const result = await pool.query(
    `SELECT ('borrow-' || asset.id::TEXT) AS id,
            'BORROWING' AS source,
            request.id::TEXT AS "requestId",
            request.status,
            asset.condition_in AS condition,
            '' AS reason,
            COALESCE(NULLIF(BTRIM(request.form_data->>'returnResponsibleName'), ''), requester.name) AS "returnedByName",
            request.created_at AS "requestedAt",
            asset.returned_at AS "decidedAt",
            asset.quantity,
            asset.unit_of_measure AS "unitOfMeasure",
            COALESCE(other.employee_code, '') AS "employeeCode",
            requester.name AS "employeeName",
            inventory.item_code AS "itemCode",
            COALESCE(NULLIF(inventory.item_name, ''), inventory.description) AS "itemName",
            NULL::TEXT AS "tagCode",
            request.form_data->>'useLocation' AS "recipientLocation",
            request.form_data->>'purpose' AS "recipientPurpose",
            other.department
       FROM requester_identity_profiles AS profile
       JOIN requester_identity_profiles AS other
         ON lower(trim(other.department)) = lower(trim(profile.department))
        AND other.verification_status = 'Verified'
       JOIN service_requests AS request
         ON request.requested_by_user_id = other.user_id AND request.request_type = 'BORROWING'
       JOIN service_request_assets AS asset
         ON asset.request_id = request.id AND asset.returned_at IS NOT NULL
       JOIN item_catalog AS inventory ON inventory.id = asset.item_id
       JOIN users AS requester ON requester.id = request.requested_by_user_id
      WHERE profile.user_id = $1
        AND profile.verification_status = 'Verified'
      ORDER BY COALESCE(asset.returned_at, request.created_at) DESC, asset.id DESC
      LIMIT 20`,
    [userId],
  );
  return result.rows;
}

async function getMyDepartmentIssuanceSummary(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(issue.quantity), 0)::INTEGER AS "totalIssuedUnits",
            COALESCE(SUM(issue.quantity - issue.returned_quantity) FILTER (WHERE issue.status = 'Issued'), 0)::INTEGER AS "remainingUnits"
       FROM requester_identity_profiles AS profile
       JOIN employees AS head
         ON lower(trim(head.employee_code)) = lower(trim(profile.employee_code))
       JOIN employees AS staff
         ON lower(trim(staff.department)) = lower(trim(head.department))
       JOIN employee_issuances AS issue ON issue.employee_id = staff.id
      WHERE profile.user_id = $1
        AND profile.verification_status = 'Verified'
        AND head.status = 'Active'
        AND staff.status = 'Active'
        AND issue.status IN ('Issued', 'Returned')`,
    [userId],
  );
  return result.rows[0] || { totalIssuedUnits: 0 };
}

// A requisition is handed over to its requesting head first.  This workspace lets that
// verified head record the final staff member who actually receives every tagged unit.


// "Building C — Raise lab (9), Itss office (1)": where the requisition's units were handed over, for the requester's timeline.
async function requisitionDeliverySummary(client, requestId) {
  const result = await client.query(
    `SELECT COALESCE(NULLIF(BTRIM(issue.recipient_location), ''), 'No location recorded') AS location,
            SUM(issue.quantity)::INTEGER AS quantity
       FROM employee_issuances AS issue
       JOIN purchase_requisition_lines AS line ON line.id = issue.purchase_requisition_line_id
      WHERE line.request_id = $1
      GROUP BY 1
      ORDER BY 1`,
    [requestId],
  );
  return result.rows.map((row) => `${row.location} (${row.quantity})`).join(', ');
}

async function getIssuanceBatch(batchId) {
  const batchResult = await pool.query(
    `SELECT batch.id::TEXT AS id,
            batch.status,
            batch.requested_at AS "requestedAt",
            batch.decided_at AS "decidedAt",
            batch.decision_note AS "decisionNote",
            batch.email_sent_at IS NOT NULL AS "emailSent",
            batch.token_expires_at AS "expiresAt",
            batch.borrow_use_date::TEXT AS "borrowUseDate",
            to_char(batch.borrow_use_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "borrowUseAt",
            batch.expected_return_date::TEXT AS "expectedReturnDate",
            to_char(batch.expected_return_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "expectedReturnAt",
            batch.use_location AS "useLocation",
            batch.use_purpose AS "usePurpose",
            batch.requester_user_id IS NOT NULL AS "requesterAccountLinked",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.email AS "employeeEmail"
       FROM employee_issuance_batches AS batch
       JOIN employees AS employee ON employee.id = batch.employee_id
      WHERE batch.id = $1`,
    [batchId],
  );
  const batch = batchResult.rows[0];
  if (!batch) throw notFound('Hindi makita ang issuance request.');

  const itemsResult = await pool.query(
    `SELECT issue.id::TEXT AS "issuanceId",
            inventory.item_code AS "itemCode",
            inventory.description AS "itemName",
            recipient.employee_code AS "recipientEmployeeCode",
            trim(concat_ws(' ', recipient.first_name, recipient.middle_name, recipient.last_name, recipient.suffix)) AS "recipientEmployeeName",
            issue.recipient_location AS "recipientLocation",
            issue.recipient_purpose AS "recipientPurpose",
            inventory.tracking_mode AS "trackingMode",
            inventory.issue_behavior AS "issueBehavior",
            issue.item_condition AS condition,
            issue.quantity,
            issue.unit_of_measure AS "unitOfMeasure",
            issue.status,
            COALESCE(
               (
                 SELECT json_agg(json_build_object(
                   'tagCode', tag_set.tag_code,
                   'unitNumber', tag_set.unit_number,
                   'printedAt', tag_set.label_printed_at,
                   'returned', tag_set.returned
                 ) ORDER BY tag_set.unit_number)
                   FROM (
                     SELECT tag.tag_code, tag.unit_number, tag.label_printed_at, FALSE AS returned
                       FROM asset_unit_tags AS tag
                      WHERE tag.issuance_id = issue.id
                     UNION
                     SELECT COALESCE(return_record.tag_snapshot->>'tagCode', tag.tag_code), tag.unit_number, NULL::TIMESTAMPTZ, TRUE
                       FROM employee_issuance_returns AS return_record
                       JOIN asset_unit_tags AS tag ON tag.id = return_record.asset_unit_tag_id
                      WHERE return_record.issuance_id = issue.id
                        AND return_record.status = 'Returned'
                   ) AS tag_set
               ),
              '[]'::JSON
            ) AS tags
       FROM employee_issuances AS issue
       JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        JOIN employees AS recipient ON recipient.id = issue.employee_id
      WHERE issue.batch_id = $1
      ORDER BY issue.id`,
    [batchId],
  );
  return { ...batch, items: itemsResult.rows };
}

async function listApprovedIssuanceBatches() {
  const result = await pool.query(
    `SELECT batch.id::TEXT AS id,
            batch.status,
            batch.requested_at AS "requestedAt",
            batch.decided_at AS "decidedAt",
            batch.token_expires_at AS "expiresAt",
            batch.borrow_use_date::TEXT AS "borrowUseDate",
            to_char(batch.borrow_use_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "borrowUseAt",
            batch.expected_return_date::TEXT AS "expectedReturnDate",
            to_char(batch.expected_return_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI') AS "expectedReturnAt",
            batch.use_location AS "useLocation",
            batch.use_purpose AS "usePurpose",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.email AS "employeeEmail",
            COALESCE(approved_items.items, '[]'::JSON) AS items
       FROM employee_issuance_batches AS batch
       JOIN employees AS employee ON employee.id = batch.employee_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(json_agg(json_build_object(
                  'issuanceId', approved_item.issuance_id,
                  'itemCode', approved_item.item_code,
                  'itemName', approved_item.item_name,
                   'recipientEmployeeCode', approved_item.recipient_employee_code,
                   'recipientEmployeeName', approved_item.recipient_employee_name,
                   'recipientLocation', approved_item.recipient_location,
                   'recipientPurpose', approved_item.recipient_purpose,
                   'trackingMode', approved_item.tracking_mode,
                  'condition', approved_item.condition,
                  'quantity', approved_item.quantity,
                  'unitOfMeasure', approved_item.unit_of_measure,
                  'status', approved_item.status,
                  'tags', approved_item.tags
                ) ORDER BY approved_item.item_code, approved_item.issuance_id), '[]'::JSON) AS items
           FROM (
             SELECT issue.id::TEXT AS issuance_id,
                    inventory.item_code,
                    COALESCE(NULLIF(inventory.item_name, ''), inventory.description) AS item_name,
                     recipient.employee_code AS recipient_employee_code,
                     trim(concat_ws(' ', recipient.first_name, recipient.middle_name, recipient.last_name, recipient.suffix)) AS recipient_employee_name,
                     issue.recipient_location,
                     issue.recipient_purpose,
                     inventory.tracking_mode,
                    issue.item_condition AS condition,
                    issue.quantity,
                    issue.unit_of_measure,
                    issue.status,
                    COALESCE((
                      SELECT json_agg(json_build_object(
                               'tagCode', tag_set.tag_code,
                               'unitNumber', tag_set.unit_number
                             ) ORDER BY tag_set.unit_number)
                        FROM (
                          SELECT tag.id, tag.tag_code, tag.unit_number
                            FROM asset_unit_tags AS tag
                           WHERE tag.issuance_id = issue.id
                          UNION
                          SELECT tag.id, tag.tag_code, tag.unit_number
                            FROM employee_issuance_returns AS return_record
                            JOIN asset_unit_tags AS tag ON tag.id = return_record.asset_unit_tag_id
                           WHERE return_record.issuance_id = issue.id
                             AND return_record.status = 'Returned'
                        ) AS tag_set
                    ), '[]'::JSON) AS tags
               FROM employee_issuances AS issue
               JOIN item_catalog AS inventory ON inventory.id = issue.item_id
                JOIN employees AS recipient ON recipient.id = issue.employee_id
              WHERE issue.batch_id = batch.id
           ) AS approved_item
       ) AS approved_items ON TRUE
      WHERE batch.status = 'Issued'
      ORDER BY batch.decided_at DESC NULLS LAST, batch.id DESC`,
  );
  return result.rows;
}

async function getAssetTagByCode(tagCode) {
  const result = await pool.query(
    `SELECT tag.id::TEXT AS id,
            tag.tag_code AS "tagCode",
            tag.unit_number AS "unitNumber",
            COALESCE(NULLIF(btrim(tag.serial_number), ''), NULLIF(btrim(item.serial_number), '')) AS "serialNumber",
            tag.condition,
            tag.lifecycle_status AS "lifecycleStatus",
            tag.custody_status AS "custodyStatus",
            tag.location,
            tag.disposal_reason AS "disposalReason",
            item.id::TEXT AS "itemId",
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName",
            employee.employee_code AS "employeeCode",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            COALESCE((
              SELECT json_agg(json_build_object(
                       'employeeCode', borrower_history."employeeCode",
                       'employeeName', borrower_history."employeeName",
                       'department', borrower_history.department,
                       'position', borrower_history.position,
                       'email', borrower_history.email,
                       'issuedAt', borrower_history."issuedAt",
                       'returnedAt', borrower_history."returnedAt",
                       'returnCondition', borrower_history."returnCondition",
                       'status', borrower_history.status
                     ) ORDER BY borrower_history."issuedAt" DESC)
                FROM LATERAL (
                  SELECT borrower.employee_code AS "employeeCode",
                         borrower.first_name || ' ' || borrower.last_name AS "employeeName",
                         borrower.department,
                         borrower.position,
                         borrower.email,
                         COALESCE(issue.decided_at, issue.requested_at) AS "issuedAt",
                         return_record.decided_at AS "returnedAt",
                         return_record.return_condition AS "returnCondition",
                         'Returned' AS status
                    FROM employee_issuance_returns AS return_record
                    JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
                    JOIN employees AS borrower ON borrower.id = issue.employee_id
                   WHERE return_record.asset_unit_tag_id = tag.id
                     AND return_record.status = 'Returned'

                  UNION ALL

                  SELECT borrower.employee_code AS "employeeCode",
                         borrower.first_name || ' ' || borrower.last_name AS "employeeName",
                         borrower.department,
                         borrower.position,
                         borrower.email,
                         COALESCE(issue.decided_at, issue.requested_at) AS "issuedAt",
                         NULL::TIMESTAMPTZ AS "returnedAt",
                         NULL::TEXT AS "returnCondition",
                         'Issued' AS status
                    FROM employee_issuances AS issue
                    JOIN employees AS borrower ON borrower.id = tag.assigned_employee_id
                   WHERE issue.id = tag.issuance_id
                     AND tag.custody_status = 'Issued'
                ) AS borrower_history
            ), '[]'::JSON) AS "borrowerHistory",
            tag.last_inspected_at AS "lastInspectedAt",
            tag.last_inspection_note AS "lastInspectionNote",
            inspector.name AS "lastInspectedBy",
            NULLIF(BTRIM(current_issue.recipient_location), '') AS "assignedLocation",
            issuer.employee_code AS "issuedByCode",
            issuer.first_name || ' ' || issuer.last_name AS "issuedByName",
            issuer.department AS "issuedByDepartment"
       FROM asset_unit_tags AS tag
       JOIN item_catalog AS item ON item.id = tag.item_id
       LEFT JOIN employees AS employee ON employee.id = tag.assigned_employee_id
       LEFT JOIN users AS inspector ON inspector.id = tag.last_inspected_by_user_id
       LEFT JOIN employee_issuances AS current_issue
         ON current_issue.id = tag.issuance_id AND tag.custody_status = 'Issued'
       LEFT JOIN employee_issuance_batches AS current_batch ON current_batch.id = current_issue.batch_id
       LEFT JOIN employees AS issuer ON issuer.id = current_batch.employee_id
      WHERE tag.tag_code = $1`,
    [tagCode],
  );
  if (result.rows[0]) return result.rows[0];

  const retiredResult = await pool.query(
    `SELECT reprint.created_at AS "replacedAt",
            reprint.kind,
            reprint.label_version AS "labelVersion",
            tag.unit_number AS "unitNumber",
            item.item_code AS "itemCode",
            COALESCE(NULLIF(item.item_name, ''), item.description) AS "itemName"
       FROM asset_label_reprints AS reprint
       JOIN asset_unit_tags AS tag ON tag.id = reprint.asset_unit_tag_id
       JOIN item_catalog AS item ON item.id = tag.item_id
      WHERE reprint.old_tag_code = $1`,
    [tagCode],
  );
  if (retiredResult.rows[0]) return { retiredLabel: true, ...retiredResult.rows[0] };

  const itemResult = await pool.query(
    `SELECT item.item_code AS "itemCode",
            COUNT(tag.id)::INTEGER AS "unitCount",
            MIN(tag.tag_code) AS "singleTagCode"
       FROM item_catalog AS item
       LEFT JOIN asset_unit_tags AS tag
         ON tag.item_id = item.id AND tag.lifecycle_status <> 'Disposed'
      WHERE lower(trim(item.item_code)) = lower(trim($1))
      GROUP BY item.id`,
    [tagCode],
  );
  const item = itemResult.rows[0];
  if (!item) return null;
  const unitCount = Number(item.unitCount);
  if (unitCount === 0) return { barcodeNotGenerated: true, itemCode: item.itemCode };
  if (unitCount > 1) return { ambiguous: true, itemCode: item.itemCode, unitCount };
  return getAssetTagByCode(item.singleTagCode);
}

async function updateAssetTagInspection({ tagCode, condition, note, changedByUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tagResult = await client.query(
      `SELECT tag.id, tag.tag_code, tag.item_id, tag.condition,
              tag.lifecycle_status, tag.custody_status, tag.assigned_employee_id,
              item.item_code, COALESCE(NULLIF(item.item_name, ''), item.description) AS item_name
         FROM asset_unit_tags AS tag
         JOIN item_catalog AS item ON item.id = tag.item_id
        WHERE tag.tag_code = $1
        FOR UPDATE OF tag`,
      [tagCode],
    );
    const tag = tagResult.rows[0];
    if (!tag) {
      await client.query('COMMIT');
      return null;
    }
    // An issued unit's condition is recorded at return, so it cannot be rewritten while the employee still holds it.
    if (tag.custody_status === 'Issued') {
      throw conflict('Naka-issue pa ang item na ito. Itala ang condition kapag ini-return na ito sa Return Items.');
    }

    await client.query(
      `UPDATE asset_unit_tags
          SET condition = $2,
              last_inspected_at = NOW(),
              last_inspected_by_user_id = $3,
              last_inspection_note = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [tag.id, condition, changedByUserId, note],
    );
    await client.query(
      `INSERT INTO inventory_change_logs (
         entity_type, entity_key, entity_name, item_id, employee_id, action,
         reason, old_values, new_values, changed_by_user_id
       ) VALUES ('item', $1, $2, $3, $4, 'updated', $5, $6::JSONB, $7::JSONB, $8)`,
      [
        tag.item_code,
        tag.item_name,
        tag.item_id,
        tag.assigned_employee_id,
        note,
        JSON.stringify({ tagCode, condition: tag.condition, lifecycleStatus: tag.lifecycle_status, custodyStatus: tag.custody_status }),
        JSON.stringify({ tagCode, condition, lastInspectionNote: note }),
        changedByUserId,
      ],
    );
    await client.query('COMMIT');
    return getAssetTagByCode(tagCode);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function lookupApproval(tokenHash) {
  const batchResult = await pool.query(
    `SELECT batch.status,
            batch.token_expires_at AS "expiresAt",
            batch.requested_at AS "requestedAt",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.employee_code AS "employeeCode",
            COALESCE(
              json_agg(json_build_object(
                'itemCode', inventory.item_code,
                'itemName', inventory.description,
                'condition', issue.item_condition,
                'quantity', issue.quantity,
                'unitOfMeasure', issue.unit_of_measure
              ) ORDER BY issue.id) FILTER (WHERE issue.id IS NOT NULL),
              '[]'::JSON
            ) AS items
       FROM employee_issuance_batches AS batch
       JOIN employees AS employee ON employee.id = batch.employee_id
       LEFT JOIN employee_issuances AS issue ON issue.batch_id = batch.id
       LEFT JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE batch.token_hash = $1
      GROUP BY batch.id, employee.id`,
    [tokenHash],
  );
  const batch = batchResult.rows[0];
  if (batch) {
    const firstItem = batch.items[0] || {};
    return {
      ...batch,
      itemCode: firstItem.itemCode || '',
      itemName: batch.items.length > 1 ? `${batch.items.length} items` : firstItem.itemName || '',
      condition: batch.items.length > 1 ? 'Multiple' : firstItem.condition || '',
    };
  }

  const result = await pool.query(
    `SELECT issue.status,
            issue.token_expires_at AS "expiresAt",
            issue.item_condition AS condition,
            issue.quantity,
            issue.unit_of_measure AS "unitOfMeasure",
            issue.requested_at AS "requestedAt",
            employee.first_name || ' ' || employee.last_name AS "employeeName",
            employee.employee_code AS "employeeCode",
            inventory.item_code AS "itemCode",
            inventory.description AS "itemName"
       FROM employee_issuances AS issue
       JOIN employees AS employee ON employee.id = issue.employee_id
       JOIN item_catalog AS inventory ON inventory.id = issue.item_id
      WHERE issue.token_hash = $1`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

async function resolveApproval({ tokenHash, batchId, requesterUserId, gsoUserId, action, handoverMethod, handoverNote, autoPreparePickup = false }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batchResult = batchId !== undefined && requesterUserId !== undefined
      ? await client.query(
        `SELECT batch.id, batch.status, batch.token_expires_at, batch.purchase_requisition_id,
                requisition.status AS purchase_requisition_status, employee.id AS employee_id,
                employee.employee_code, employee.first_name, employee.last_name
           FROM employee_issuance_batches AS batch
           JOIN employees AS employee ON employee.id = batch.employee_id
           LEFT JOIN service_requests AS requisition ON requisition.id = batch.purchase_requisition_id
           JOIN requester_identity_profiles AS profile
             ON profile.user_id = $2
            AND profile.verification_status = 'Verified'
            AND lower(trim(profile.employee_code)) = lower(trim(employee.employee_code))
          WHERE batch.id = $1
            AND batch.requester_user_id = $2
          FOR UPDATE OF batch`,
        [batchId, requesterUserId],
      )
      : batchId !== undefined && gsoUserId !== undefined
        ? await client.query(
          `SELECT batch.id, batch.status, batch.token_expires_at, batch.requester_user_id,
                  batch.purchase_requisition_id, requisition.status AS purchase_requisition_status,
                  employee.id AS employee_id,
                  employee.employee_code, employee.first_name, employee.last_name
             FROM employee_issuance_batches AS batch
             JOIN employees AS employee ON employee.id = batch.employee_id
             LEFT JOIN service_requests AS requisition ON requisition.id = batch.purchase_requisition_id
            WHERE batch.id = $1
            FOR UPDATE OF batch`,
          [batchId],
        )
        : await client.query(
        `SELECT batch.id, batch.status, batch.token_expires_at, batch.purchase_requisition_id,
                requisition.status AS purchase_requisition_status, employee.id AS employee_id,
                employee.employee_code, employee.first_name, employee.last_name
           FROM employee_issuance_batches AS batch
           JOIN employees AS employee ON employee.id = batch.employee_id
           LEFT JOIN service_requests AS requisition ON requisition.id = batch.purchase_requisition_id
          WHERE batch.token_hash = $1
          FOR UPDATE OF batch`,
        [tokenHash],
      );
    const batch = batchResult.rows[0];
    // An employee with an A.S.SET account confirms receipt there; GSO records it only for those without one.
    if (batch && gsoUserId !== undefined && batch.requester_user_id && batch.status === 'Pending') {
      throw conflict('May A.S.SET account ang employee na ito, kaya siya mismo ang magkukumpirma ng receipt sa kanyang Requester account.');
    }
    if (batch) {
      const itemsResult = await client.query(
        `SELECT issue.id, issue.status, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure,
                issue.purchase_requisition_line_id,
                issue.item_condition, issue.notes, employee.employee_code,
                 employee.first_name, employee.last_name, inventory.item_code,
                 inventory.description, inventory.inventory_status, inventory.tracking_mode
           FROM employee_issuances AS issue
           JOIN employees AS employee ON employee.id = issue.employee_id
           JOIN item_catalog AS inventory ON inventory.id = issue.item_id
          WHERE issue.batch_id = $1
          ORDER BY issue.id
          FOR UPDATE OF issue, inventory`,
        [batch.id],
      );
      const items = itemsResult.rows;
      const employeeName = `${batch.first_name} ${batch.last_name}`;
      const itemSummaries = items.map((item) => ({
        itemCode: item.item_code,
        itemName: item.description,
        condition: item.item_condition,
        trackingMode: item.tracking_mode,
        quantity: item.quantity,
        unitOfMeasure: item.unit_of_measure,
      }));
      const firstItem = itemSummaries[0] || {};

      if (batch.status !== 'Pending') {
        const generatedTagResult = await client.query(
          `SELECT COUNT(*)::INTEGER AS count
             FROM asset_unit_tags
            WHERE issuance_id = ANY($1::BIGINT[])`,
          [items.map((item) => item.id)],
        );
        await client.query('COMMIT');
        return {
          alreadyDecided: true,
          status: batch.status,
          employeeName,
          employeeCode: batch.employee_code,
          itemName: itemSummaries.length > 1 ? `${itemSummaries.length} items` : firstItem.itemName,
          itemCode: firstItem.itemCode,
          items: itemSummaries,
          generatedTagCount: Number(generatedTagResult.rows[0]?.count || 0),
        };
      }

      if (action !== 'acknowledge' && new Date(batch.token_expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE employee_issuance_batches
              SET status = 'Expired',
                  decision_note = 'The employee dashboard approval expired.',
                  decided_at = NOW()
            WHERE id = $1 AND status = 'Pending'`,
          [batch.id],
        );
        await client.query(
          `UPDATE employee_issuances
              SET status = 'Expired',
                  decision_note = 'The employee dashboard approval expired.',
                  decided_at = NOW()
            WHERE batch_id = $1 AND status = 'Pending'`,
          [batch.id],
        );
        for (const item of items) {
          if (!batch.purchase_requisition_id || !item.purchase_requisition_line_id) continue;
          await client.query(
            `UPDATE purchase_requisition_line_allocations
                SET fulfilled_quantity = GREATEST(fulfilled_quantity - $3, 0),
                    status = 'Reserved', updated_at = NOW()
              WHERE line_id = $1 AND item_id = $2 AND status IN ('Reserved', 'Fulfilled')`,
            [item.purchase_requisition_line_id, item.item_id, item.quantity],
          );
          await client.query(
            `UPDATE purchase_requisition_lines
                SET route_status = CASE WHEN finance_quantity > 0 THEN 'WAITING_FOR_PURCHASE' ELSE 'READY_FOR_STAFF' END,
                    updated_at = NOW()
              WHERE id = $1 AND route_status = 'HANDOVER_PENDING'`,
            [item.purchase_requisition_line_id],
          );
        }
        const itemIds = items.map((item) => item.item_id);
        for (const itemId of new Set(itemIds.map(String))) await refreshInventoryStatus(client, itemId);
        for (const item of items) {
          const issuance = {
            employee_id: item.employee_id,
            employee_code: item.employee_code,
            employee_name: `${item.first_name} ${item.last_name}`,
            item_id: item.item_id,
            item_code: item.item_code,
            description: item.description,
          };
          await writeAuditLog(client, issuance, {
            reason: `Employee issuance decision window expired for ${item.employee_code}; ${item.quantity} ${item.unit_of_measure} were released.`,
            oldValues: { issuanceStatus: 'Pending', quantity: item.quantity, unitOfMeasure: item.unit_of_measure },
            newValues: { issuanceStatus: 'Expired' },
          });
        }
        if (batch.purchase_requisition_id) {
          const summary = items.map((item) => `${item.quantity} ${item.unit_of_measure} ${item.description}`).join('; ');
          await client.query(
            `INSERT INTO service_request_history (request_id, previous_status, new_status, note)
             VALUES ($1, $2, $2, $3)`,
            [batch.purchase_requisition_id, batch.purchase_requisition_status, `Employee handover expired; the stock reservation returned to the GSO Staff queue. ${summary}`],
          );
        }
        await client.query('COMMIT');
        return { expired: true };
      }

      if (items.length === 0 || items.some((item) => item.status !== 'Pending')) {
        throw conflict('May item sa issuance batch na hindi na pending. Makipag-ugnayan sa GSO para ma-check ang request.');
      }

      if (action === 'acknowledge' && items.some((item) => item.tracking_mode !== 'individual')) {
        throw conflict('Individually tracked items lang ang nangangailangan ng receipt acknowledgment.');
      }

      const nextStatus = action === 'reject' ? 'Rejected' : 'Issued';
      const decisionChannel = autoPreparePickup
        ? 'automatic pickup preparation'
        : gsoUserId !== undefined
          ? 'GSO-recorded handover'
          : requesterUserId !== undefined ? 'Requester Dashboard' : 'legacy email approval link';
      const decisionNote = action === 'reject'
        ? `Rejected by employee through the ${decisionChannel}.`
        : autoPreparePickup
          ? 'GSO prepared the individually tracked items for pickup. Barcode labels are ready; no requester confirmation is required.'
        : action === 'acknowledge' && gsoUserId !== undefined
          ? `Receipt recorded by GSO via ${handoverMethod === 'authorized_handover' ? 'authorized handover' : 'signed receipt'}${handoverNote ? `: ${handoverNote}` : ''}.`
          : action === 'acknowledge'
            ? 'Employee confirmed physical receipt in the Requester Dashboard.'
            : `Approved by employee in the ${decisionChannel}.`;
      const itemIds = items.map((item) => item.item_id);

      await client.query(
        `UPDATE employee_issuance_batches
            SET status = $2, decision_note = $3, decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [batch.id, nextStatus, decisionNote],
      );
      await client.query(
        `UPDATE employee_issuances
            SET status = $2, decision_note = $3, decided_at = NOW()
          WHERE batch_id = $1 AND status = 'Pending'`,
        [batch.id, nextStatus, decisionNote],
      );
      if (action === 'reject') {
        for (const item of items) {
          if (!batch.purchase_requisition_id || !item.purchase_requisition_line_id) continue;
          await client.query(
            `UPDATE purchase_requisition_line_allocations
                SET fulfilled_quantity = GREATEST(fulfilled_quantity - $3, 0),
                    status = 'Reserved', updated_at = NOW()
              WHERE line_id = $1 AND item_id = $2 AND status IN ('Reserved', 'Fulfilled')`,
            [item.purchase_requisition_line_id, item.item_id, item.quantity],
          );
          await client.query(
            `UPDATE purchase_requisition_lines
                SET route_status = CASE WHEN finance_quantity > 0 THEN 'WAITING_FOR_PURCHASE' ELSE 'READY_FOR_STAFF' END,
                    updated_at = NOW()
              WHERE id = $1 AND route_status = 'HANDOVER_PENDING'`,
            [item.purchase_requisition_line_id],
          );
        }
      } else {
        // A requisition line can be fulfilled by several individually tracked inventory
        // records. Update each line once with its total, otherwise the first
        // update changes HANDOVER_PENDING and the next one fails its guard.
        const quantitiesByLine = new Map();
        for (const item of items) {
          if (!batch.purchase_requisition_id || !item.purchase_requisition_line_id) continue;
          const lineKey = String(item.purchase_requisition_line_id);
          const existing = quantitiesByLine.get(lineKey);
          quantitiesByLine.set(lineKey, {
            lineId: item.purchase_requisition_line_id,
            quantity: Number(existing?.quantity || 0) + Number(item.quantity),
          });
        }
        for (const { lineId, quantity } of quantitiesByLine.values()) {
          const lineResult = await client.query(
            `UPDATE purchase_requisition_lines AS line
                SET issued_quantity = line.issued_quantity + $2,
                    route_status = CASE
                      WHEN line.issued_quantity + $2 < line.reserved_quantity THEN 'PARTIALLY_ISSUED'
                      WHEN line.finance_quantity > 0 AND $3 = 'Sent to Finance' THEN 'WAITING_FOR_PURCHASE'
                      WHEN line.finance_quantity > 0 THEN 'WAITING_FINANCE'
                      ELSE 'ISSUED'
                    END,
                    updated_at = NOW()
              WHERE line.id = $1 AND line.route_status = 'HANDOVER_PENDING'
              RETURNING line.request_id`,
            [lineId, quantity, batch.purchase_requisition_status],
          );
          if (!lineResult.rowCount) throw conflict('Nagbago ang purchase requisition line habang nire-record ang handover. I-refresh ang page.');
        }
      }
      const generatedTags = [];
      if (action !== 'reject') {
        const assignedUserId = requesterUserId ?? await requesterUserIdForEmployee(client, batch.employee_code);
        for (const item of items) {
          const itemTags = await createUnitTags(client, item, assignedUserId);
          generatedTags.push(...itemTags);
        }
      }
      const inventoryStatuses = new Map();
      for (const itemId of new Set(itemIds.map(String))) {
        inventoryStatuses.set(itemId, await refreshInventoryStatus(client, itemId));
      }
      for (const item of items) {
        const issuance = {
          employee_id: item.employee_id,
          employee_code: item.employee_code,
          employee_name: `${item.first_name} ${item.last_name}`,
          item_id: item.item_id,
          item_code: item.item_code,
          description: item.description,
        };
        await writeAuditLog(client, issuance, {
          changedByUserId: autoPreparePickup ? null : requesterUserId ?? gsoUserId ?? null,
          reason: action === 'acknowledge'
            ? autoPreparePickup
              ? `${decisionNote} Unit custody is prepared for pickup by ${item.employee_code}.`
              : `${decisionNote} Unit custody was activated for ${item.employee_code}.`
            : `${nextStatus} by employee ${item.employee_code} in the ${decisionChannel} for ${item.quantity} ${item.unit_of_measure}.`,
          oldValues: { issuanceStatus: 'Pending', quantity: item.quantity, unitOfMeasure: item.unit_of_measure },
          newValues: {
            issuanceStatus: nextStatus,
            inventoryStatus: inventoryStatuses.get(String(item.item_id)),
            barcodeCount: action !== 'reject' && item.tracking_mode !== 'quantity' ? Number(item.quantity) : 0,
          },
        });
      }
      if (batch.purchase_requisition_id) {
        const summary = items.map((item) => `${item.quantity} ${item.unit_of_measure} ${item.description}`).join('; ');
        const requestNote = action === 'reject'
          ? `Requester declined the handover; the stock reservation returned to the GSO Staff queue. ${summary}`
          : autoPreparePickup
            ? `GSO prepared the approved items for pickup; barcode labels are ready. ${summary}`
          : action === 'acknowledge' && gsoUserId !== undefined
            ? `GSO Staff recorded the completed item handover. ${summary}`
            : action === 'acknowledge'
              ? `Requester confirmed receipt of the issued items. ${summary}`
              : `Employee approved the issued items. ${summary}`;
        await client.query(
          `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
           VALUES ($1, $2, $2, $3, $4)`,
          [batch.purchase_requisition_id, batch.purchase_requisition_status, requestNote, autoPreparePickup ? null : requesterUserId ?? gsoUserId ?? null],
        );
      }

      if (batch.purchase_requisition_id && action !== 'reject') {
        const unfinishedResult = await client.query(
          `SELECT COUNT(*) FILTER (WHERE route_status NOT IN ('ISSUED', 'REJECTED', 'CANCELLED'))::INTEGER AS unfinished,
                  BOOL_OR(route_status = 'ISSUED') AS has_issued
             FROM purchase_requisition_lines
            WHERE request_id = $1`,
          [batch.purchase_requisition_id],
        );
        if (Number(unfinishedResult.rows[0]?.unfinished || 0) === 0 && unfinishedResult.rows[0]?.has_issued && !autoPreparePickup) {
          const finalRequestStatus = 'Completed';
          const finalRequestNote = autoPreparePickup
            ? 'All approved requisition items are prepared for pickup by GSO; barcode labels are ready.'
            : 'All approved requisition items have been issued by GSO Staff.';
          const deliveredTo = await requisitionDeliverySummary(client, batch.purchase_requisition_id);
          const noteWithDelivery = deliveredTo ? `${finalRequestNote} Delivered to: ${deliveredTo}.` : finalRequestNote;
          const updatedRequest = await client.query(
            `UPDATE service_requests
                SET status = $2,
                    completed_at = CASE WHEN $2 = 'Completed' THEN NOW() ELSE NULL END,
                    updated_at = NOW()
              WHERE id = $1 AND status <> $2
              RETURNING status`,
            [batch.purchase_requisition_id, finalRequestStatus],
          );
          if (updatedRequest.rowCount) {
            await client.query(
              `INSERT INTO service_request_history (request_id, previous_status, new_status, note, changed_by_user_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [batch.purchase_requisition_id, batch.purchase_requisition_status, finalRequestStatus, noteWithDelivery, autoPreparePickup ? null : requesterUserId ?? gsoUserId ?? null],
            );
          }
        }
      }

      await client.query('COMMIT');
      return {
        status: nextStatus,
        employeeName,
        employeeCode: batch.employee_code,
        itemName: itemSummaries.length > 1 ? `${itemSummaries.length} items` : firstItem.itemName,
        itemCode: firstItem.itemCode,
        items: itemSummaries,
        generatedTagCount: generatedTags.length,
      };
    }

    const result = await client.query(
      `SELECT issue.id, issue.status, issue.token_expires_at, issue.employee_id,
              issue.item_id, issue.item_condition, issue.notes, issue.quantity, issue.unit_of_measure, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description, inventory.inventory_status, inventory.tracking_mode
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.token_hash = $1
        FOR UPDATE OF issue, inventory`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return { notFound: true };
    }

    const issuance = {
      id: row.id,
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      employee_name: `${row.first_name} ${row.last_name}`,
      item_id: row.item_id,
      item_code: row.item_code,
      description: row.description,
      tracking_mode: row.tracking_mode,
      quantity: row.quantity,
      unit_of_measure: row.unit_of_measure,
    };

    if (row.status !== 'Pending') {
      await client.query('COMMIT');
      return { alreadyDecided: true, status: row.status, employeeName: issuance.employee_name, itemName: row.description };
    }

    if (new Date(row.token_expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Expired',
                decision_note = 'The issuance approval window expired.',
                decided_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      await refreshInventoryStatus(client, row.item_id);
      await writeAuditLog(client, issuance, {
        reason: `Employee approval link expired for ${row.employee_code}; ${row.quantity} ${row.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: row.quantity, unitOfMeasure: row.unit_of_measure },
        newValues: { issuanceStatus: 'Expired' },
      });
      await client.query('COMMIT');
      return { expired: true };
    }

    const nextStatus = action === 'approve' ? 'Issued' : 'Rejected';
    const decisionNote = action === 'approve'
      ? 'Approved by employee using the email approval link.'
      : 'Rejected by employee using the email approval link.';
    await client.query(
      `UPDATE employee_issuances
          SET status = $2, decision_note = $3, decided_at = NOW()
        WHERE id = $1 AND status = 'Pending'`,
      [row.id, nextStatus, decisionNote],
    );
    const generatedTags = action === 'approve'
      ? await createUnitTags(
        client,
        issuance,
        await requesterUserIdForEmployee(client, row.employee_code),
      )
      : [];
    const inventoryStatus = await refreshInventoryStatus(client, row.item_id);
    await writeAuditLog(client, issuance, {
      reason: `${nextStatus} by employee ${row.employee_code} via legacy emailed approval link for ${row.quantity} ${row.unit_of_measure}.`,
      oldValues: { issuanceStatus: 'Pending', quantity: row.quantity, unitOfMeasure: row.unit_of_measure },
      newValues: {
        issuanceStatus: nextStatus,
        inventoryStatus,
        barcodeCount: action === 'approve' ? generatedTags.length : 0,
      },
    });

    await client.query('COMMIT');
    return {
      status: nextStatus,
      employeeName: issuance.employee_name,
      employeeCode: row.employee_code,
      itemName: row.description,
      itemCode: row.item_code,
      quantity: row.quantity,
      unitOfMeasure: row.unit_of_measure,
      generatedTagCount: generatedTags.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listEmployeeIssuances(employeeCode) {
  const employeeResult = await pool.query(
    `SELECT id
       FROM employees
      WHERE lower(employee_code) = lower($1)`,
    [employeeCode],
  );
  const employee = employeeResult.rows[0];
  if (!employee) throw notFound('Hindi na makita ang employee profile.');

  const [itemsResult, historyResult] = await Promise.all([
    pool.query(
      `SELECT issue.id::TEXT AS id,
              inventory.item_code AS code,
              inventory.description AS name,
              inventory.tracking_mode AS "trackingMode",
              inventory.issue_behavior AS "issueBehavior",
              issue.item_condition AS condition,
              CASE WHEN inventory.tracking_mode = 'individual' THEN COALESCE((
                SELECT COUNT(tag.id)::INTEGER
                  FROM asset_unit_tags AS tag
                 WHERE tag.issuance_id = issue.id
                   AND tag.assigned_employee_id = $1
                   AND tag.custody_status = 'Issued'
                   AND tag.lifecycle_status = 'Active'
              ), 0) ELSE issue.quantity - issue.returned_quantity END AS quantity,
              issue.unit_of_measure AS "unitOfMeasure",
              to_char(issue.decided_at, 'Mon DD, YYYY · HH12:MI AM') AS "assignedOn",
              COALESCE((
                SELECT json_agg(tag.tag_code ORDER BY tag.unit_number)
                  FROM asset_unit_tags AS tag
                 WHERE tag.issuance_id = issue.id
                   AND tag.assigned_employee_id = $1
                   AND tag.custody_status = 'Issued'
                   AND tag.lifecycle_status = 'Active'
              ), '[]'::JSON) AS "assetTagCodes"
         FROM employee_issuances AS issue
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
         WHERE issue.employee_id = $1 AND issue.status = 'Issued'
         ORDER BY issue.decided_at DESC, issue.id DESC`,
      [employee.id],
    ),
    pool.query(
      `SELECT history.event,
              history.item,
              history.code,
              history."assetTagCode",
              history.quantity,
              history."unitOfMeasure",
              history.note,
              history."returnId",
              history."repairOutcome",
              history."repairResolvedAt",
              history."returnCondition",
              history."returnedByName",
              history."confirmationMethod",
              history."approvalAction",
              history."approvalDecisionNote",
              to_char(history.event_at, 'Mon DD, YYYY') AS date
         FROM (
           SELECT CASE issue.status
                    WHEN 'Pending' THEN 'Pending Approval'
                    WHEN 'Returned' THEN 'Issued'
                    ELSE issue.status
                  END AS event,
                  inventory.description AS item,
                  inventory.item_code AS code,
                  NULL::TEXT AS "assetTagCode",
                  issue.quantity,
                  issue.unit_of_measure AS "unitOfMeasure",
                  COALESCE(issue.decision_note, issue.notes, '') AS note,
                  NULL::TEXT AS "returnId",
                  NULL::TEXT AS "repairOutcome",
                  NULL::TIMESTAMPTZ AS "repairResolvedAt",
                  NULL::TEXT AS "returnCondition",
                  NULL::TEXT AS "returnedByName",
                  NULL::TEXT AS "confirmationMethod",
                  NULL::TEXT AS "approvalAction",
                  NULL::TEXT AS "approvalDecisionNote",
                  COALESCE(issue.decided_at, issue.requested_at) AS event_at,
                  issue.id AS sort_id
             FROM employee_issuances AS issue
             JOIN item_catalog AS inventory ON inventory.id = issue.item_id
            WHERE issue.employee_id = $1

           UNION ALL

           SELECT CASE return_request.status
                    WHEN 'Pending' THEN 'Return Pending Approval'
                    WHEN 'Returned' THEN 'Returned'
                    WHEN 'Rejected' THEN 'Return Rejected'
                    WHEN 'Expired' THEN 'Return Expired'
                    WHEN 'Lost' THEN 'Reported Lost'
                    WHEN 'Voided' THEN 'Return Voided'
                    ELSE 'Return Email Failed'
                  END AS event,
                  inventory.description AS item,
                  inventory.item_code AS code,
                  COALESCE(return_request.tag_snapshot->>'tagCode', return_tag.tag_code) AS "assetTagCode",
                  return_request.quantity,
                  issue.unit_of_measure AS "unitOfMeasure",
                  CASE return_request.status
                    WHEN 'Pending' THEN 'Awaiting employee email approval. Condition after return: ' || return_request.return_condition || '. GSO notes: ' || return_request.reason
                    WHEN 'Returned' THEN COALESCE(return_request.decision_note, 'Return confirmed by employee.') || ' Condition after return: ' || return_request.return_condition || '. GSO notes: ' || return_request.reason
                    WHEN 'Lost' THEN COALESCE(return_request.decision_note, '') || ' Settlement: ' || COALESCE(return_request.settlement_status, 'Pending') || '. GSO notes: ' || return_request.reason
                    WHEN 'Voided' THEN 'Return voided by IT Admin: ' || COALESCE(return_request.void_reason, '')
                    ELSE COALESCE(return_request.decision_note, return_request.reason)
                  END AS note,
                  return_request.id::TEXT AS "returnId",
                  return_request.repair_outcome AS "repairOutcome",
                  return_request.repair_resolved_at AS "repairResolvedAt",
                  return_request.return_condition AS "returnCondition",
                  return_request.returned_by_name AS "returnedByName",
                  return_request.confirmation_method AS "confirmationMethod",
                  return_request.approval_action AS "approvalAction",
                  return_request.approval_decision_note AS "approvalDecisionNote",
                  COALESCE(return_request.decided_at, return_request.requested_at) AS event_at,
                  return_request.id AS sort_id
             FROM employee_issuance_returns AS return_request
             JOIN employee_issuances AS issue ON issue.id = return_request.issuance_id
             JOIN item_catalog AS inventory ON inventory.id = issue.item_id
             LEFT JOIN asset_unit_tags AS return_tag ON return_tag.id = return_request.asset_unit_tag_id
              WHERE issue.employee_id = $1
         ) AS history
        ORDER BY history.event_at DESC, history.sort_id DESC`,
      [employee.id],
    ),
  ]);

  return { assignedItems: itemsResult.rows, history: historyResult.rows };
}

// Unfinished returns that stop new issuances to an employee until GSO sorts them out.
async function getEmployeeReturnBlockers(employeeCode) {
  const result = await pool.query(
    `SELECT (
              SELECT COUNT(*)
                FROM employee_issuances AS issue
                JOIN employees AS employee ON employee.id = issue.employee_id
                JOIN item_catalog AS item ON item.id = issue.item_id
                JOIN employee_issuance_batches AS batch ON batch.id = issue.batch_id
               WHERE lower(employee.employee_code) = lower($1)
                 AND issue.status = 'Issued'
                 AND issue.quantity > issue.returned_quantity
                 AND item.issue_behavior = 'returnable'
                 AND COALESCE(batch.expected_return_at < NOW(), batch.expected_return_date < (NOW() AT TIME ZONE 'Asia/Manila')::DATE, FALSE)
            )::INTEGER AS overdue,
            (
              SELECT COUNT(*)
                FROM employee_issuance_returns AS return_record
                JOIN employee_issuances AS issue ON issue.id = return_record.issuance_id
                JOIN employees AS employee ON employee.id = issue.employee_id
               WHERE lower(employee.employee_code) = lower($1)
                 AND return_record.status = 'Lost'
                 AND return_record.settlement_status = 'Pending'
            )::INTEGER AS unsettled`,
    [employeeCode],
  );
  return result.rows[0];
}

async function expirePendingIssuances() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expiredResult = await client.query(
      `SELECT issue.id, issue.employee_id, issue.item_id, issue.quantity, issue.unit_of_measure, employee.employee_code,
              employee.first_name, employee.last_name, inventory.item_code,
              inventory.description
         FROM employee_issuances AS issue
         JOIN employees AS employee ON employee.id = issue.employee_id
         JOIN item_catalog AS inventory ON inventory.id = issue.item_id
        WHERE issue.status = 'Pending'
          AND issue.batch_id IS NULL
          AND issue.token_expires_at <= NOW()
        ORDER BY issue.token_expires_at, issue.id
        LIMIT 100
        FOR UPDATE OF issue, inventory SKIP LOCKED`,
    );

    for (const issuance of expiredResult.rows) {
      await client.query(
        `UPDATE employee_issuances
            SET status = 'Expired',
                decision_note = 'The issuance approval window expired.',
                decided_at = NOW()
          WHERE id = $1 AND status = 'Pending'`,
        [issuance.id],
      );
      await refreshInventoryStatus(client, issuance.item_id);
      await writeAuditLog(client, issuance, {
        reason: `Employee issuance decision window expired for ${issuance.employee_code}; ${issuance.quantity} ${issuance.unit_of_measure} were released.`,
        oldValues: { issuanceStatus: 'Pending', quantity: issuance.quantity, unitOfMeasure: issuance.unit_of_measure },
        newValues: { issuanceStatus: 'Expired' },
      });
    }

    await client.query('COMMIT');
    return expiredResult.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createAssetTagCode,
  getEmployeeReturnBlockers,
  createPendingIssuance,
  createPendingIssuanceBatch,
  prepareLegacyPendingPickupBatches,
  listMyPendingIssuanceBatches,
  listMyIssuanceActivity,
  listMyDepartmentReturnActivity,
  getMyDepartmentIssuanceSummary,
  getIssuanceBatch,
  listApprovedIssuanceBatches,
  getAssetTagByCode,
  updateAssetTagInspection,
  markEmailSent,
  markEmailFailed,
  markBatchEmailSent,
  markBatchEmailFailed,
  lookupApproval,
  resolveApproval,
  listEmployeeIssuances,
  expirePendingIssuances,
};
