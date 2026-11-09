function ascii(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, '?');
}

function wrap(value, width = 92) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function pdfEscape(value) {
  return value.replace(/([\\()])/g, '\\$1');
}

function buildPurchaseRequisitionPdf({ request, endorsedBy, endorsedEmail }) {
  const data = request.formData || {};
  const lines = [
    'A.S.SET - PURCHASE REQUISITION',
    `Reference: ${request.referenceNo}`,
    `Requester: ${data.requesterName || request.requesterName || ''}`,
    `Employee code: ${data.requesterEmployeeCode || ''}`,
    `Department: ${data.departmentOrganization || ''}`,
    `Position: ${data.requesterPosition || ''}`,
    `Request date: ${request.createdAt ? new Date(request.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : ''}`,
    `Date needed: ${data.requiredDate || ''}`,
    '',
    'PURPOSE',
    ...wrap(data.purpose || ''),
    '',
    'REQUESTED ITEMS',
  ];
  for (const [index, item] of (Array.isArray(data.items) ? data.items : []).entries()) {
    lines.push(...wrap(`${index + 1}. ${item.itemName || 'Proposed item'} | ${item.category || ''} | Quantity: ${item.quantity || 0}`));
    lines.push(...wrap(`Specifications: ${item.description || 'None'}`));
    lines.push(...wrap(`GSO stock checked: ${item.stockAvailableQuantity ?? 'Not recorded'}`));
    lines.push('');
  }
  lines.push(`GSO Head endorsement: ${endorsedBy || ''} <${endorsedEmail || ''}>`);
  lines.push(`Endorsed at: ${request.gsoHeadEndorsedAt ? new Date(request.gsoHeadEndorsedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : ''}`);

  const pageLines = [];
  for (let index = 0; index < lines.length; index += 52) pageLines.push(lines.slice(index, index + 52));
  if (!pageLines.length) pageLines.push(['A.S.SET - PURCHASE REQUISITION']);

  const objects = [];
  const pageObjectIds = pageLines.map((_page, index) => 4 + index * 2);
  const contentObjectIds = pageLines.map((_page, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageLines.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pageLines.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    const commands = ['BT', '/F1 10 Tf', '48 790 Td', '14 TL'];
    page.forEach((line, lineIndex) => {
      if (lineIndex) commands.push('T*');
      commands.push(`(${pdfEscape(ascii(line))}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

module.exports = { buildPurchaseRequisitionPdf };
