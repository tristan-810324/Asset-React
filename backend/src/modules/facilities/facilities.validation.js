// Checks for the Facility Use places GSO manages. A question is required when requesters must say more after
// picking the place, such as "Which science lab?".
const invalid = (message) => Object.assign(new Error(message), { status: 400, expose: true });

const body = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function cleanLabel(value) {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!label) throw invalid('Type a name for the place.');
  if (label.length > 120) throw invalid('The name must be 120 characters or fewer.');
  return label;
}

function cleanDetailLabel(requiresDetail, value) {
  if (!requiresDetail) return null;
  const question = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!question) throw invalid('Type the question requesters answer, such as "Which room?".');
  if (question.length > 80) throw invalid('The question must be 80 characters or fewer.');
  return question;
}

function validateCreateVenue(input) {
  const source = body(input);
  const requiresDetail = source.requiresDetail === true;
  return {
    label: cleanLabel(source.label),
    requiresDetail,
    detailLabel: cleanDetailLabel(requiresDetail, source.detailLabel),
  };
}

// Only the fields that were sent change. The service checks the result against the current row.
function validateUpdateVenue(input) {
  const source = body(input);
  const changes = {};
  if (source.label !== undefined) changes.label = cleanLabel(source.label);
  if (source.requiresDetail !== undefined) {
    if (typeof source.requiresDetail !== 'boolean') throw invalid('Choose whether the place asks requesters for details.');
    changes.requiresDetail = source.requiresDetail;
  }
  if (source.detailLabel !== undefined) changes.detailLabel = typeof source.detailLabel === 'string' ? source.detailLabel : '';
  if (source.isActive !== undefined) {
    if (typeof source.isActive !== 'boolean') throw invalid('Choose whether the place is shown to requesters.');
    changes.isActive = source.isActive;
  }
  if (Object.keys(changes).length === 0) throw invalid('Nothing to change.');
  return changes;
}

module.exports = { validateCreateVenue, validateUpdateVenue, cleanDetailLabel };
