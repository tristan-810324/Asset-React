// Removes the paper from a photo or scan of a signature, leaving only the ink as a transparent PNG.
export type CleanedSignature = {
  dataUrl: string
  originalDataUrl: string
  width: number
  height: number
}

export const SIGNATURE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const WORK_WIDTH = 1000
const BLOCK_SIZE = 32
const MAX_WIDTH = 1200
const MAX_HEIGHT = 600
const MAX_BYTES = 300 * 1024
// Brightness relative to the local paper: at or above PAPER_LEVEL it is paper, at or below FULL_INK_LEVEL it is solid ink.
const PAPER_LEVEL = 0.9
const FULL_INK_LEVEL = 0.55
const NOISE_FLOOR = 0.12
const NO_SIGNATURE = 'No signature was found. Use a clear photo of your signature on plain paper, in good light.'

type PaperMap = { levels: Float32Array; cols: number; rows: number }
type Box = { x: number; y: number; w: number; h: number }

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export async function cleanSignatureImage(file: File): Promise<CleanedSignature> {
  if (!SIGNATURE_IMAGE_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('The image is larger than 15 MB. Take a smaller photo or scan.')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Unable to read this image. Try another file.')
  }

  const scale = Math.min(1, WORK_WIDTH / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('This browser cannot process images.')
  // Transparent areas turn white first, so they count as paper.
  sourceContext.fillStyle = '#ffffff'
  sourceContext.fillRect(0, 0, width, height)
  sourceContext.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const layer = inkLayer(sourceContext.getImageData(0, 0, width, height).data, width, height)
  if (!layer) throw new Error(NO_SIGNATURE)

  const inkCanvas = document.createElement('canvas')
  inkCanvas.width = width
  inkCanvas.height = height
  const inkContext = inkCanvas.getContext('2d')
  if (!inkContext) throw new Error('This browser cannot process images.')
  const output = inkContext.createImageData(width, height)
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4
    output.data[p] = layer.ink.r
    output.data[p + 1] = layer.ink.g
    output.data[p + 2] = layer.ink.b
    output.data[p + 3] = Math.round(layer.alpha[i] * 255)
  }
  inkContext.putImageData(output, 0, 0)

  const box = inkBox(output.data, width, height)
  if (!box) throw new Error(NO_SIGNATURE)
  return { ...encodeWithinLimits(inkCanvas, box), originalDataUrl: source.toDataURL('image/jpeg', 0.85) }
}

// How solid each pixel of a photographed signature is (0 to 1), and the colour of the pen.
export function inkLayer(pixels: Uint8ClampedArray, width: number, height: number) {
  const luminance = luminanceOf(pixels)
  const paper = paperMap(luminance, width, height)
  const alpha = removeSpecks(inkAlpha(luminance, paper, width, height), width, height)
  const ink = inkColor(pixels, alpha, luminance)
  return ink ? { alpha, ink } : null
}

function luminanceOf(pixels: Uint8ClampedArray) {
  const luminance = new Float32Array(pixels.length / 4)
  for (let i = 0; i < luminance.length; i += 1) {
    const p = i * 4
    luminance[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]
  }
  return luminance
}

// Paper brightness per block: its 90th percentile, so the ink in a block does not pull it down.
function paperMap(luminance: Float32Array, width: number, height: number): PaperMap {
  const cols = Math.ceil(width / BLOCK_SIZE)
  const rows = Math.ceil(height / BLOCK_SIZE)
  const levels = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const histogram = new Uint32Array(256)
      const right = Math.min(width, (col + 1) * BLOCK_SIZE)
      const bottom = Math.min(height, (row + 1) * BLOCK_SIZE)
      let count = 0
      for (let y = row * BLOCK_SIZE; y < bottom; y += 1) {
        for (let x = col * BLOCK_SIZE; x < right; x += 1) {
          histogram[Math.round(luminance[y * width + x])] += 1
          count += 1
        }
      }
      let seen = 0
      let level = 255
      for (let value = 0; value < 256; value += 1) {
        seen += histogram[value]
        if (seen >= count * 0.9) {
          level = value
          break
        }
      }
      levels[row * cols + col] = level
    }
  }
  return { levels, cols, rows }
}

// Paper brightness at one pixel, blended between neighbouring blocks so shadows fade smoothly.
function paperAt({ levels, cols, rows }: PaperMap, x: number, y: number) {
  const fx = clamp((x + 0.5) / BLOCK_SIZE - 0.5, 0, cols - 1)
  const fy = clamp((y + 0.5) / BLOCK_SIZE - 0.5, 0, rows - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, cols - 1)
  const y1 = Math.min(y0 + 1, rows - 1)
  const tx = fx - x0
  const ty = fy - y0
  const top = levels[y0 * cols + x0] * (1 - tx) + levels[y0 * cols + x1] * tx
  const bottom = levels[y1 * cols + x0] * (1 - tx) + levels[y1 * cols + x1] * tx
  return top * (1 - ty) + bottom * ty
}

// How much ink covers each pixel: 0 on paper, 1 on solid ink, in between on the edges.
function inkAlpha(luminance: Float32Array, paper: PaperMap, width: number, height: number) {
  const alpha = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      const ratio = luminance[i] / Math.max(paperAt(paper, x, y), 32)
      const value = clamp((PAPER_LEVEL - ratio) / (PAPER_LEVEL - FULL_INK_LEVEL), 0, 1)
      alpha[i] = value < NOISE_FLOOR ? 0 : value
    }
  }
  return alpha
}

// Drops isolated specks (dust, paper grain) that touch no other solid ink.
function removeSpecks(alpha: Float32Array, width: number, height: number) {
  const cleaned = new Float32Array(alpha)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (alpha[i] < 0.5) continue
      let neighbours = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (alpha[ny * width + nx] >= 0.5) neighbours += 1
        }
      }
      if (neighbours === 0) cleaned[i] = 0
    }
  }
  return cleaned
}

// The pen colour, taken from the darkest solid strokes so a blue pen stays blue.
function inkColor(pixels: Uint8ClampedArray, alpha: Float32Array, luminance: Float32Array) {
  const histogram = new Uint32Array(256)
  let strokes = 0
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] < 0.5) continue
    histogram[Math.round(luminance[i])] += 1
    strokes += 1
  }
  if (strokes === 0) return null
  let seen = 0
  let darkest = 255
  for (let value = 0; value < 256; value += 1) {
    seen += histogram[value]
    if (seen >= strokes * 0.3) {
      darkest = value
      break
    }
  }
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] < 0.5 || luminance[i] > darkest) continue
    const p = i * 4
    r += pixels[p]
    g += pixels[p + 1]
    b += pixels[p + 2]
    n += 1
  }
  return { r: r / n, g: g / n, b: b / n }
}

function inkBox(data: Uint8ClampedArray, width: number, height: number): Box | null {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) return null
  const pad = 4
  const x = Math.max(0, left - pad)
  const y = Math.max(0, top - pad)
  return { x, y, w: Math.min(width, right + pad + 1) - x, h: Math.min(height, bottom + pad + 1) - y }
}

// Crops to the signature and scales it down until the PNG fits the server's limit.
function encodeWithinLimits(source: HTMLCanvasElement, box: Box) {
  let scale = Math.min(1, MAX_WIDTH / box.w, MAX_HEIGHT / box.h)
  let result = { dataUrl: '', width: 1, height: 1 }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(1, Math.round(box.w * scale))
    const height = Math.max(1, Math.round(box.h * scale))
    const target = document.createElement('canvas')
    target.width = width
    target.height = height
    const context = target.getContext('2d')
    if (!context) throw new Error('This browser cannot process images.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, width, height)
    result = { dataUrl: target.toDataURL('image/png'), width, height }
    if (dataUrlBytes(result.dataUrl) <= MAX_BYTES) break
    scale *= 0.8
  }
  return result
}

function dataUrlBytes(dataUrl: string) {
  return Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
}
