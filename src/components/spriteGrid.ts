// Pure sprite grid + standalone SVG output, for the favicon and app icons
// where there is no React tree to render.
import type { Mood, Species, Stage } from '../pet/types'
import { petFrame } from '../art/petSprite'
import { gridSize, isTransparent, type Grid, type Palette } from './pixel'

export interface ComposedSprite {
  rows: Grid
  palette: Palette
}

/**
 * The grid PetSprite renders at rest: egg, ghost, or the cast base frame.
 * `mood` is accepted for API stability; the cast art has no mood faces.
 */
export function composeSprite(species: Species, stage: Stage, _mood: Mood, alive: boolean): ComposedSprite {
  const { rows, palette } = petFrame({ species, stage, alive })
  return { rows, palette }
}

export interface SvgOpts {
  /** Solid background colour; omitted = transparent. */
  background?: string
  /** Extra cells of padding around the sprite. */
  pad?: number
}

/** Standalone SVG markup; viewBox = cols x rows (non-square grids keep their aspect). Horizontal runs are merged so there are no hairline seams. */
export function spriteSvg({ rows, palette }: ComposedSprite, opts: SvgOpts = {}): string {
  const pad = opts.pad ?? 0
  const { cols, rows: h } = gridSize(rows)
  const w = cols + pad * 2
  const hh = h + pad * 2
  let body = opts.background ? `<rect width="${w}" height="${hh}" fill="${opts.background}"/>` : ''
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" shape-rendering="crispEdges">${body}</svg>`
}

export function spriteSvgDataUrl(sprite: ComposedSprite, opts?: SvgOpts): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(spriteSvg(sprite, opts))
}
