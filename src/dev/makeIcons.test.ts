// Generates public/favicon.svg and public/icons/*.png from the sprite grids.
// Run: MAKE_ICONS=1 pnpm exec vitest run src/dev/makeIcons.test.ts
import { describe, expect, it } from 'vitest'
import { composeSprite, spriteSvg, type ComposedSprite } from '../components/spriteGrid'
import { isTransparent } from '../components/pixel'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) return [255, 0, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

let table: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function be32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type)
  const body = concat([t, data])
  return concat([be32(data.length), body, be32(crc32(body))])
}

async function encodePng(w: number, h: number, rgba: Uint8Array): Promise<Uint8Array> {
  // @ts-expect-error tsconfig.app.json has no node types; vitest runs this in Node.
  const { deflateSync } = await import('node:zlib')
  const stride = w * 4
  const raw = new Uint8Array((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const ihdr = concat([be32(w), be32(h), new Uint8Array([8, 6, 0, 0, 0])])
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  return concat([sig, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())])
}

function paint(sprite: ComposedSprite, px: number, padFrac: number, bg: string): Uint8Array {
  const rgba = new Uint8Array(px * px * 4)
  const [br, bgc, bb] = hexToRgb(bg)
  for (let i = 0; i < px * px; i++) rgba.set([br, bgc, bb, 255], i * 4)
  const cols = sprite.rows[0]?.length ?? 1
  const inner = px * (1 - padFrac * 2)
  const cell = Math.floor(inner / cols)
  const off = Math.floor((px - cell * cols) / 2)
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (isTransparent(ch)) continue
      const [r, g, b] = hexToRgb(sprite.palette[ch] ?? '#ff00ff')
      for (let yy = 0; yy < cell; yy++) {
        const py = off + y * cell + yy
        for (let xx = 0; xx < cell; xx++) {
          const pxi = off + x * cell + xx
          rgba.set([r, g, b, 255], (py * px + pxi) * 4)
        }
      }
    }
  })
  return rgba
}

describe.skipIf(!env.MAKE_ICONS)('make icons', () => {
  it('writes favicon.svg and PNG app icons', async () => {
    // @ts-expect-error tsconfig.app.json has no node types; vitest runs this in Node.
    const { writeFileSync } = await import('node:fs')
    const sprite = composeSprite('cat', 'adult', 'happy', true)
    const svg = spriteSvg(sprite)
    expect(svg).toContain('<svg')
    writeFileSync('public/favicon.svg', svg + '\n')
    const bg = '#fef3c7'
    writeFileSync('public/icons/icon-192.png', await encodePng(192, 192, paint(sprite, 192, 0.08, bg)))
    writeFileSync('public/icons/icon-512.png', await encodePng(512, 512, paint(sprite, 512, 0.08, bg)))
    writeFileSync('public/icons/icon-512-maskable.png', await encodePng(512, 512, paint(sprite, 512, 0.2, bg)))
  })
})
