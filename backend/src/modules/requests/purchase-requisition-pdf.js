// Builds the purchase requisition PDF that GSO Staff prints and hands to Finance. The file is written directly (no PDF
// library): standard Helvetica fonts, the school logo and the GSO Head's signature as images, and a table
// of the items to buy.
const fs = require('node:fs');
const path = require('node:path');
const { decodePng } = require('../../lib/png');

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = PAGE_WIDTH - 48;
const CONTENT_WIDTH = RIGHT - LEFT;
const BOTTOM_LIMIT = 764; // content stops above the footer rule
const LOGO_PATH = path.join(__dirname, '../../assets/gso-logo.png');

const NAVY = [0.035, 0.141, 0.29];
const INK = [0.118, 0.161, 0.231];
const MUTED = [0.392, 0.455, 0.545];
const RULE = [0.796, 0.835, 0.882];
const ZEBRA = [0.973, 0.98, 0.988];
const WHITE = [1, 1, 1];

// Helvetica glyph widths in 1/1000 em, used to right-align and wrap text. Other characters count as 556.
const WIDTHS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};
for (const digit of '0123456789') WIDTHS[digit] = 556;

function ascii(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[×]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, '?');
}

function widthOf(value, size, bold) {
  let units = 0;
  for (const char of value) units += WIDTHS[char] ?? 556;
  return (units * size * (bold ? 1.05 : 1)) / 1000;
}

function wrapText(value, maxWidth, size, bold = false) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && widthOf(candidate, size, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function pdfEscape(value) {
  return value.replace(/([\\()])/g, '\\$1');
}

const colorOp = (color, op) => `${color.map((part) => part.toFixed(3)).join(' ')} ${op}`;

// Drawing helpers. Positions are "top" offsets from the top of the page, like a document.
function text(ops, value, x, top, { size = 10, bold = false, color = INK, align = 'left' } = {}) {
  const content = ascii(value);
  const left = align === 'right' ? x - widthOf(content, size, bold) : x;
  const baseline = PAGE_HEIGHT - top - size * 0.8;
  ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colorOp(color, 'rg')} ${left.toFixed(2)} ${baseline.toFixed(2)} Td (${pdfEscape(content)}) Tj ET`);
}

function box(ops, x, top, width, height, color) {
  ops.push(`${colorOp(color, 'rg')} ${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re f`);
}

function frame(ops, x, top, width, height, color) {
  ops.push(`${colorOp(color, 'RG')} 0.6 w ${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re S`);
}

function rule(ops, x1, top1, x2, top2, color, width = 0.6) {
  ops.push(`${colorOp(color, 'RG')} ${width} w ${x1} ${PAGE_HEIGHT - top1} m ${x2} ${PAGE_HEIGHT - top2} l S`);
}

function drawImage(ops, name, x, top, width, height) {
  ops.push(`q ${width} 0 0 ${height} ${x} ${PAGE_HEIGHT - top - height} cm /${name} Do Q`);
}

const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
  : '—');
const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
  : '—');
const urgencyText = (data) => (data.urgency === 'Urgent'
  ? `Urgent${data.urgentReason ? `: ${data.urgentReason}` : ''}`
  : data.urgency || 'Standard');

// COMPUTER_PERIPHERALS is shown as "Computer peripherals".
const categoryName = (value) => {
  const label = String(value || '').replace(/_/g, ' ').toLowerCase();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '—';
};

// The logo is decoded once. If it cannot be read, the PDF still builds with a plain-text header.
let cachedLogo;
function loadLogo() {
  if (cachedLogo === undefined) {
    try {
      cachedLogo = decodePng(fs.readFileSync(LOGO_PATH));
    } catch (error) {
      console.error('The school logo could not be added to the Finance PDF.', error.message);
      cachedLogo = null;
    }
  }
  return cachedLogo;
}

// A signature that cannot be read is left off; the printed requisition still has a clear signature line.
function decodeSignature(png) {
  if (!png) return null;
  try {
    return decodePng(png);
  } catch (error) {
    console.error('The signature could not be added to the Finance PDF.', error.message);
    return null;
  }
}

function assemble(pages, images) {
  const objects = new Map();
  const firstPageId = 5 + images.length;
  const pageIds = pages.map((_page, index) => firstPageId + index * 2);
  objects.set(1, { dict: '<< /Type /Catalog /Pages 2 0 R >>' });
  objects.set(2, { dict: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>` });
  objects.set(3, { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' });
  objects.set(4, { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>' });
  images.forEach((image, index) => {
    objects.set(5 + index, {
      body: `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
      data: image.data,
    });
  });
  const xobjects = images.length
    ? ` /XObject << ${images.map((image, index) => `/${image.name} ${5 + index} 0 R`).join(' ')} >>`
    : '';
  pages.forEach((ops, index) => {
    const pageId = pageIds[index];
    objects.set(pageId, {
      dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${pageId + 1} 0 R >>`,
    });
    objects.set(pageId + 1, { body: '', data: Buffer.from(ops.join('\n'), 'latin1') });
  });

  const parts = [];
  let length = 0;
  const write = (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'latin1');
    parts.push(buffer);
    length += buffer.length;
  };
  const offsets = new Map();
  const lastId = Math.max(...objects.keys());
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  for (let id = 1; id <= lastId; id += 1) {
    const object = objects.get(id);
    if (!object) continue;
    offsets.set(id, length);
    if (object.data) {
      write(`${id} 0 obj\n<< ${object.body} /Length ${object.data.length} >>\nstream\n`);
      write(object.data);
      write('\nendstream\nendobj\n');
    } else {
      write(`${id} 0 obj\n${object.dict}\nendobj\n`);
    }
  }
  const xrefOffset = length;
  let xref = `xref\n0 ${lastId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= lastId; id += 1) {
    xref += offsets.has(id) ? `${String(offsets.get(id)).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n';
  }
  write(xref);
  write(`trailer\n<< /Size ${lastId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat(parts);
}

function buildPurchaseRequisitionPdf({ request, endorsedBy, endorsedEmail, signaturePng = null }) {
  const data = request.formData || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const logo = loadLogo();
  const decodedSignature = decodeSignature(signaturePng);
  const logoImage = logo ? { name: 'Logo', ...logo } : null;
  const signature = decodedSignature ? { name: 'Sig', ...decodedSignature } : null;
  const images = [logoImage, signature].filter(Boolean);
  const pages = [];
  let ops;
  let top;
  const startPage = (startTop = 48) => {
    ops = [];
    pages.push(ops);
    top = startTop;
  };
  const room = (height) => {
    if (top + height > BOTTOM_LIMIT) startPage();
  };
  const sectionLabel = (label) => {
    room(30);
    text(ops, label, LEFT, top, { size: 8, bold: true, color: NAVY });
    top += 16;
  };

  // First page header: logo (or name, if the logo is missing), document title, and reference.
  startPage(138);
  if (logoImage) drawImage(ops, 'Logo', LEFT, 36, 150, (150 * logo.height) / logo.width);
  else text(ops, 'A.S.SET', LEFT, 40, { size: 16, bold: true, color: NAVY });
  text(ops, 'PURCHASE REQUISITION', RIGHT, 40, { size: 18, bold: true, color: NAVY, align: 'right' });
  text(ops, 'General Services Office', RIGHT, 64, { size: 9, color: MUTED, align: 'right' });
  text(ops, `Reference ${request.referenceNo}`, RIGHT, 80, { size: 11, bold: true, align: 'right' });
  text(ops, `Generated ${formatDate(new Date())}`, RIGHT, 98, { size: 8.5, color: MUTED, align: 'right' });
  rule(ops, LEFT, 122, RIGHT, 122, NAVY, 1.5);

  // Request details, two columns.
  sectionLabel('REQUEST DETAILS');
  const details = [
    [['Requester', data.requesterName || request.requesterName], ['Requester email', request.requesterEmail]],
    [['Employee code', data.requesterEmployeeCode], ['Request date', formatDate(request.createdAt)]],
    [['Department', data.departmentOrganization], ['Date needed', formatDate(data.requiredDate)]],
    [['Position', data.requesterPosition], ['Urgency', urgencyText(data)]],
  ];
  for (const row of details) {
    const cells = row.map(([label, value], index) => ({ label, x: index ? 318 : LEFT, lines: wrapText(value || '—', 240, 10, true) }));
    const height = 11 + Math.max(...cells.map((cell) => cell.lines.length)) * 13 + 9;
    room(height);
    for (const cell of cells) {
      text(ops, cell.label, cell.x, top, { size: 7.5, bold: true, color: MUTED });
      cell.lines.forEach((line, index) => text(ops, line, cell.x, top + 11 + index * 13, { size: 10, bold: true }));
    }
    top += height;
  }
  rule(ops, LEFT, top, RIGHT, top, RULE, 0.5);
  top += 12;

  sectionLabel('PURPOSE');
  for (const line of wrapText(data.purpose || '—', CONTENT_WIDTH, 10)) {
    room(14);
    text(ops, line, LEFT, top, { size: 10 });
    top += 14;
  }
  top += 10;

  // Items to buy. The header repeats on every page the table continues to.
  sectionLabel('ITEMS FOR PURCHASE');
  const columns = [
    { width: 26, label: 'No.' },
    { width: 206, label: 'Item and specifications' },
    { width: 108, label: 'Category' },
    { width: 58, label: 'Requested', right: true },
    { width: 58, label: 'From stock', right: true },
    { width: 60, label: 'To buy', right: true },
  ];
  const drawTableHeader = () => {
    box(ops, LEFT, top, CONTENT_WIDTH, 22, NAVY);
    let x = LEFT;
    for (const column of columns) {
      text(ops, column.label, column.right ? x + column.width - 6 : x + 6, top + 7, {
        size: 8, bold: true, color: WHITE, align: column.right ? 'right' : 'left',
      });
      x += column.width;
    }
    top += 22;
  };
  room(62);
  drawTableHeader();
  if (!items.length) {
    room(24);
    text(ops, 'No items recorded.', LEFT + 6, top + 7, { size: 9, color: MUTED });
    top += 24;
  }
  items.forEach((item, index) => {
    const nameLines = wrapText(item.itemName || 'Proposed item', 194, 9.5, true);
    const specLines = item.description ? wrapText(item.description, 194, 8.5) : [];
    const categoryLines = wrapText(categoryName(item.category), 96, 8.5);
    const height = Math.max(nameLines.length * 12 + (specLines.length ? specLines.length * 11 + 3 : 0), categoryLines.length * 11) + 14;
    if (top + height > BOTTOM_LIMIT) {
      startPage();
      drawTableHeader();
    }
    if (index % 2) box(ops, LEFT, top, CONTENT_WIDTH, height, ZEBRA);
    let x = LEFT;
    text(ops, String(index + 1), x + 6, top + 7, { size: 9.5 });
    x += columns[0].width;
    nameLines.forEach((line, lineIndex) => text(ops, line, x + 6, top + 7 + lineIndex * 12, { size: 9.5, bold: true }));
    specLines.forEach((line, lineIndex) => text(ops, line, x + 6, top + 10 + nameLines.length * 12 + lineIndex * 11, { size: 8.5, color: MUTED }));
    x += columns[1].width;
    categoryLines.forEach((line, lineIndex) => text(ops, line, x + 6, top + 7 + lineIndex * 11, { size: 8.5, color: MUTED }));
    x += columns[2].width;
    [item.requestedQuantity, item.stockAvailableQuantity, item.quantity].forEach((value, valueIndex) => {
      const column = columns[3 + valueIndex];
      text(ops, String(value ?? 0), x + column.width - 6, top + 7, { size: 9.5, bold: valueIndex === 2, align: 'right' });
      x += column.width;
    });
    top += height;
    rule(ops, LEFT, top, RIGHT, top, RULE, 0.5);
  });

  const sum = (key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  room(28);
  rule(ops, LEFT, top, RIGHT, top, NAVY, 1);
  text(ops, 'Total', LEFT + columns[0].width + 6, top + 8, { size: 9.5, bold: true, color: NAVY });
  let totalX = LEFT + columns[0].width + columns[1].width + columns[2].width;
  ['requestedQuantity', 'stockAvailableQuantity', 'quantity'].forEach((key, index) => {
    const column = columns[3 + index];
    text(ops, String(sum(key)), totalX + column.width - 6, top + 8, { size: 9.5, bold: true, color: NAVY, align: 'right' });
    totalX += column.width;
  });
  top += 40;


  // Approval: the GSO Head who endorsed the purchase (with their signature, if saved).
  room(80);
  sectionLabel('APPROVAL');
  if (signature) {
    const scale = Math.min(120 / signature.width, 35 / signature.height);
    const width = signature.width * scale;
    const height = signature.height * scale;
    drawImage(ops, 'Sig', LEFT, top + 8 - height, width, height);
    text(ops, '(Electronically signed)', LEFT + 124, top, { size: 7.5, color: MUTED });
  } else {
    text(ops, '(Signature)', LEFT, top, { size: 7.5, color: MUTED });
  }
  rule(ops, LEFT, top + 8, LEFT + 200, top + 8, INK, 0.6);
  text(ops, endorsedBy || '—', LEFT, top + 14, { size: 9.5, bold: true });
  text(ops, endorsedEmail || '', LEFT, top + 26, { size: 8, color: MUTED });
  text(ops, `Endorsed ${formatDateTime(request.gsoHeadEndorsedAt)}`, LEFT, top + 37, { size: 8, color: MUTED });

  pages.forEach((pageOps, index) => {
    rule(pageOps, LEFT, 792, RIGHT, 792, RULE, 0.5);
    text(pageOps, `A.S.SET - ${request.referenceNo}`, LEFT, 800, { size: 8, color: MUTED });
    text(pageOps, `Page ${index + 1} of ${pages.length}`, RIGHT, 800, { size: 8, color: MUTED, align: 'right' });
  });
  return assemble(pages, images);
}

module.exports = { buildPurchaseRequisitionPdf };
