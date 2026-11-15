const auditRepository = require('../audit/audit.repository');
const facilitiesRepository = require('./facilities.repository');
const { validateCreateVenue, validateUpdateVenue, cleanDetailLabel } = require('./facilities.validation');

const fail = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const notFound = () => fail('That place was not found.', 404);

const publicVenue = (row) => ({
  id: row.id,
  label: row.label,
  requiresDetail: row.requiresDetail,
  detailLabel: row.detailLabel,
  isActive: row.isActive,
});

// The places GSO has not hidden. Requesters pick from this list.
async function listVenues() {
  return (await facilitiesRepository.listVenues({ activeOnly: true })).map(publicVenue);
}

// Every place, hidden ones included, so GSO can show a hidden place again.
async function listManagedVenues() {
  return (await facilitiesRepository.listVenues({ activeOnly: false })).map(publicVenue);
}

// The unique index refuses a name that is already on the list; report it as a clear conflict.
function duplicateOrThrow(error) {
  if (error.code === '23505') throw fail('That place is already on the list.', 409);
  throw error;
}

async function createVenue(user, input) {
  const values = validateCreateVenue(input);
  return facilitiesRepository.inTransaction(async (client) => {
    let row;
    try {
      row = await facilitiesRepository.insertVenue(values, client);
    } catch (error) {
      duplicateOrThrow(error);
    }
    await auditRepository.writeLog(client, {
      entityType: 'facility_option',
      entityKey: `VENUE:${row.id}`,
      entityName: `Facility place: ${row.label}`,
      action: 'created',
      reason: `Added "${row.label}" to the Facility Use places.`,
      oldValues: {},
      newValues: publicVenue(row),
      changedByUserId: user.id,
    });
    return publicVenue(row);
  });
}

async function updateVenue(user, rawId, input) {
  if (!/^\d+$/.test(String(rawId))) throw notFound();
  const changes = validateUpdateVenue(input);
  return facilitiesRepository.inTransaction(async (client) => {
    const current = await facilitiesRepository.getVenueForUpdate(rawId, client);
    if (!current) throw notFound();

    const next = {
      label: changes.label ?? current.label,
      requiresDetail: changes.requiresDetail ?? current.requiresDetail,
      detailLabel: cleanDetailLabel(
        changes.requiresDetail ?? current.requiresDetail,
        changes.detailLabel ?? current.detailLabel,
      ),
      isActive: changes.isActive ?? current.isActive,
    };

    let row;
    try {
      row = await facilitiesRepository.updateVenue(current.id, next, client);
    } catch (error) {
      duplicateOrThrow(error);
    }

    const reason = current.isActive && !row.isActive
      ? `Hid "${row.label}" from new requests. Old requests keep their saved text.`
      : !current.isActive && row.isActive
        ? `Showed "${row.label}" to requesters again.`
        : `Changed the "${current.label}" place.`;
    await auditRepository.writeLog(client, {
      entityType: 'facility_option',
      entityKey: `VENUE:${row.id}`,
      entityName: `Facility place: ${row.label}`,
      action: 'updated',
      reason,
      oldValues: publicVenue(current),
      newValues: publicVenue(row),
      changedByUserId: user.id,
    });
    return publicVenue(row);
  });
}

async function deleteVenue(user, rawId) {
  if (!/^\d+$/.test(String(rawId))) throw notFound();
  return facilitiesRepository.inTransaction(async (client) => {
    const current = await facilitiesRepository.getVenueForUpdate(rawId, client);
    if (!current) throw notFound();
    await facilitiesRepository.deleteVenue(current.id, client);
    await auditRepository.writeLog(client, {
      entityType: 'facility_option',
      entityKey: `VENUE:${current.id}`,
      entityName: `Facility place: ${current.label}`,
      action: 'deleted',
      reason: `Deleted "${current.label}" from the Facility Use places. Requests sent before keep their venue text.`,
      oldValues: publicVenue(current),
      newValues: {},
      changedByUserId: user.id,
    });
    return publicVenue(current);
  });
}

module.exports = { listVenues, listManagedVenues, createVenue, updateVenue, deleteVenue };
