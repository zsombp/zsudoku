// Generates every app icon from scratch. No image library, no binary blobs
// checked in that nobody can regenerate: run this and the icons come back
// identical.
//
//   node scripts/make-icons.mjs
//
// The mark is a brass Z on ink blue, drawn as a polygon and supersampled, so it
// stays crisp at 32px and at 512px without a font dependency.

import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x14, 0x16, 0x1d] // ink blue, matches --bg
const FG = [0xe2, 0xa6, 0x3d] // brass, matches --accent

// A Z outline in a normalised 0..1 box. Traced as one closed path: along the
// top bar, down the diagonal, along the bottom bar, and back up.
const Z = [
  [0.00, 0.00], [1.00, 0.00], [1.00, 0.17], [0.34, 0.83],
  [1.00, 0.83], [1.00, 1.00], [0.00, 1.00], [0.00, 0.83],
  [0.66, 0.17], [0.00, 0.17],
]

function insidePolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ---- PNG encoding ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** `pixels` is RGB or RGBA rows. alpha decides which. */
function encodePng(width, height, pixels, alpha) {
  const channels = alpha ? 4 : 3
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = alpha ? 6 : 2 // colour type: RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- drawing ----

/**
 * @param size    pixels square
 * @param glyph   fraction of the icon the Z occupies
 * @param radius  corner rounding as a fraction of size, 0 for a hard square
 * @param alpha   emit an alpha channel. Must be false for the Apple touch icon:
 *                iOS composites transparency to black rather than to white.
 */
function draw(size, { glyph = 0.62, radius = 0, alpha = false }) {
  const channels = alpha ? 4 : 3
  const buf = Buffer.alloc(size * size * channels)
  const SS = 4 // supersampling grid per axis
  const box = size * glyph
  const off = (size - box) / 2
  const r = radius * size

  const inCorner = (x, y) => {
    if (!r) return true
    const cx = x < r ? r : x > size - r ? size - r : x
    const cy = y < r ? r : y > size - r ? size - r : y
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hitsGlyph = 0
      let hitsShape = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (inCorner(px, py)) hitsShape++
          if (insidePolygon((px - off) / box, (py - off) / box, Z)) hitsGlyph++
        }
      }
      const total = SS * SS
      const g = hitsGlyph / total
      const s = hitsShape / total
      const i = (y * size + x) * channels
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(BG[c] * (1 - g) + FG[c] * g)
      if (alpha) buf[i + 3] = Math.round(255 * s)
    }
  }
  return encodePng(size, size, buf, alpha)
}

mkdirSync(OUT, { recursive: true })

const icons = [
  // Manifest "any" icons. Rounded, so they look right on a desktop launcher.
  ['icon-192.png', 192, { glyph: 0.6, radius: 0.18, alpha: true }],
  ['icon-512.png', 512, { glyph: 0.6, radius: 0.18, alpha: true }],
  // Maskable: Android crops to its own shape, so the glyph stays inside the
  // 80% safe zone and the background bleeds to the edge.
  ['icon-maskable-512.png', 512, { glyph: 0.46, radius: 0, alpha: false }],
  // iOS ignores the manifest icons entirely for the home screen and rounds this
  // one itself. No alpha channel.
  ['apple-touch-icon.png', 180, { glyph: 0.6, radius: 0, alpha: false }],
  ['favicon-32.png', 32, { glyph: 0.62, radius: 0.18, alpha: true }],
]

for (const [name, size, opts] of icons) {
  const png = draw(size, opts)
  writeFileSync(join(OUT, name), png)
  console.log(`${name.padEnd(24)} ${String(size).padStart(3)}px  ${String(png.length).padStart(6)} bytes`)
}
