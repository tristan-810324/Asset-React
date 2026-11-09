const labelsRepository = require('./labels.repository');

function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: status < 500 });
}

async function listUnitLabels() {
  const rows = await labelsRepository.listUnitLabels();
  return rows.map((row) => ({ ...row, needsPrinting: !row.isReturned && !row.labelPrintedAt }));
}

function readTagCode(value) {
  const tagCode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})$/.test(tagCode)) throw httpError(400, 'Hindi valid ang unit barcode.');
  return tagCode;
}

async function recordLabelPrint(tagCodeValue, user) {
  return labelsRepository.recordLabelPrint({ tagCode: readTagCode(tagCodeValue), userId: user.id });
}

async function recordLabelPrintBatch(input, user) {
  const rawTagCodes = input?.tagCodes;
  if (!Array.isArray(rawTagCodes) || rawTagCodes.length < 1 || rawTagCodes.length > 100) {
    throw httpError(400, 'Pumili ng 1 hanggang 100 barcode label na ipi-print.');
  }
  const tagCodes = rawTagCodes.map(readTagCode);
  if (new Set(tagCodes).size !== tagCodes.length) {
    throw httpError(400, 'May nadobleng barcode label sa print request.');
  }
  return labelsRepository.recordLabelPrintBatch({ tagCodes, userId: user.id });
}

async function reprintUnitLabel(tagCodeValue, input, user) {
  const tagCode = readTagCode(tagCodeValue);
  const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw httpError(400, 'Isulat kung bakit kailangang i-reprint ang label.');
  if (reason.length > 500) throw httpError(400, 'Hindi dapat lumampas sa 500 characters ang dahilan.');
  return labelsRepository.reprintUnitLabel({ tagCode, reason, userId: user.id });
}

module.exports = { listUnitLabels, recordLabelPrint, recordLabelPrintBatch, reprintUnitLabel };
