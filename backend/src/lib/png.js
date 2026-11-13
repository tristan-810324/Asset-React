const zlib = require('node:zlib');

// Decodes a non-interlaced 8-bit PNG (RGB or RGBA) into raw RGB, flattened onto white so transparent
// parts of a logo or signature print as paper. The result is deflated, ready to embed in a PDF.
function decodePng(file) {
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Not a PNG file.');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    }
    if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (!header || header.depth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.colorType)) {
    throw new Error('Unsupported PNG format.');
  }
  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * header.height);
  // Undo the PNG row filters.
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpLeft = Math.abs(estimate - upLeft);
        predictor = distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft ? left : distanceUp <= distanceUpLeft ? up : upLeft;
      } else throw new Error('Unknown PNG filter.');
      row[x] = (source[x] + predictor) & 0xff;
    }
  }
  const rgb = Buffer.alloc(header.width * header.height * 3);
  for (let p = 0, o = 0; p < pixels.length; p += channels, o += 3) {
    if (channels === 3) {
      rgb[o] = pixels[p];
      rgb[o + 1] = pixels[p + 1];
      rgb[o + 2] = pixels[p + 2];
    } else {
      const alpha = pixels[p + 3] / 255;
      for (let c = 0; c < 3; c += 1) rgb[o + c] = Math.round(pixels[p + c] * alpha + 255 * (1 - alpha));
    }
  }
  return { width: header.width, height: header.height, data: zlib.deflateSync(rgb) };
}

module.exports = { decodePng };
