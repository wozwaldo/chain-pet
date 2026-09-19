// Pure sprite composition (body + face + halo) into one grid, plus SVG output.
// Used for the favicon and app icons, where there is no React tree to render.
import type { Mood, Species, Stage } from '../pet/types'
import { CANVAS, FACES, GHOST_FACE, GHOST_PALETTE, HALO, SPECIES_PALETTES, eyeStamps, spriteDef, type Stamp, type XY } from './PetSprite'
import { frame, isTransparent, stamp, type Grid, type Palette } from './pixel'

export interface ComposedSprite {
  rows: Grid
  palette: Palette
}

/** Same composition PetSprite renders, with eyes open and no animation. */
export function composeSprite(species: Species, stage: Stage, mood: Mood, alive: boolean): ComposedSprite {
  const palette = alive ? SPECIES_PALETTES[species] : GHOST_PALETTE
  const def = spriteDef(species, stage)
  const framed = frame(def.rows, CANVAS, CANVAS, 'bottom')
  let rows = framed.rows
  const { dx, dy } = framed
  const face = alive ? FACES[mood] : GHOST_FACE
  const anchors = def.face
  const put = (anchor: XY, s: Stamp) => {
    rows = stamp(rows, s.rows, dx + anchor[0] + s.dx, dy + anchor[1] + s.dy)
  }
  if (anchors) {
    const eyes = eyeStamps(face, anchors.smallEyes)
    put(anchors.eyeL, eyes.eyeL)
    put(anchors.eyeR, eyes.eyeR)
    if (face.extra) put(anchors.eyeL, face.extra)
    put(anchors.mouth, face.mouth)
  }
  if (!alive) {
    const cx = anchors ? anchors.mouth[0] : Math.floor(def.rows[0].length / 2)
    rows = stamp(rows, HALO, dx + cx - 2, Math.max(0, dy - HALO.length))
  }
  return { rows, palette }
}

export interface SvgOpts {
  /** Solid background colour; omitted = transparent. */
  background?: string
  /** Extra cells of padding around the sprite. */
  pad?: number
}

/** Standalone SVG markup. Horizontal runs are merged so there are no hairline seams. */
export function spriteSvg({ rows, palette }: ComposedSprite, opts: SvgOpts = {}): string {
  const pad = opts.pad ?? 0
  const cols = rows[0]?.length ?? 0
  const w = cols + pad * 2
  const h = rows.length + pad * 2
  let body = opts.background ? `<rect width="${w}" height="${h}" fill="${opts.background}"/>` : ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (isTransparent(ch)) {
        x++
        continue
      }
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      body += `<rect x="${x + pad}" y="${y + pad}" width="${end - x}" height="1" fill="${palette[ch] ?? '#ff00ff'}"/>`
      x = end
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`
}

export function spriteSvgDataUrl(sprite: ComposedSprite, opts?: SvgOpts): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(spriteSvg(sprite, opts))
}
