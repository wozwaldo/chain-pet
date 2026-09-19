/* eslint-disable react-refresh/only-export-components -- this file intentionally exports data/helpers next to its component; editing it triggers a full HMR reload instead of a fast refresh */
// Data-driven pixel art. A "grid" is an array of equal-length strings; each
// character is a palette key, and ' ' or '.' is transparent. Artists edit the
// grids (see PetSprite.tsx / TreatIcon.tsx), never this renderer.
import type { CSSProperties, ReactNode } from 'react'

export type Grid = string[]
export type Palette = Record<string, string>

/** Loud fallback so a typo in a grid shows up as magenta instead of vanishing. */
export const MISSING_COLOR = '#ff00ff'

export function isTransparent(ch: string): boolean {
  return ch === ' ' || ch === '.'
}

/** Width = longest row, height = row count. */
export function gridSize(rows: Grid): { cols: number; rows: number } {
  let cols = 0
  for (const r of rows) if (r.length > cols) cols = r.length
  return { cols, rows: rows.length }
}

/** True when every row has the same length (what the tests assert). */
export function isRectangular(rows: Grid): boolean {
  const w = rows[0]?.length ?? 0
  return rows.every((r) => r.length === w)
}

/** Horizontal flip (left <-> right). Handy for a right-facing variant. */
export function mirror(rows: Grid): Grid {
  return rows.map((r) => [...r].reverse().join(''))
}

/** Vertical flip (top <-> bottom). */
export function flipVertical(rows: Grid): Grid {
  return [...rows].reverse()
}

/** Count of opaque cells; useful for tests and for sanity-checking a grid. */
export function countPixels(rows: Grid): number {
  let n = 0
  for (const r of rows) for (const ch of r) if (!isTransparent(ch)) n++
  return n
}

/**
 * Draw `layer` onto a copy of `base` with its top-left at (x, y).
 * Transparent cells in the layer leave the base untouched; out-of-bounds
 * cells are dropped. Returns a new grid.
 */
export function stamp(base: Grid, layer: Grid, x: number, y: number): Grid {
  const out = base.map((r) => [...r])
  layer.forEach((row, ly) => {
    const ty = y + ly
    if (ty < 0 || ty >= out.length) return
    for (let lx = 0; lx < row.length; lx++) {
      const ch = row[lx]
      const tx = x + lx
      if (isTransparent(ch) || tx < 0 || tx >= out[ty].length) continue
      out[ty][tx] = ch
    }
  })
  return out.map((r) => r.join(''))
}

export type FrameAlign = 'bottom' | 'center' | 'top'

/**
 * Pad a compact grid onto a fixed canvas (horizontally centred, vertically
 * aligned as requested). Returns the padded grid plus the offset (dx, dy) the
 * original landed at, so face anchors can be translated the same way.
 */
export function frame(
  rows: Grid,
  width: number,
  height: number,
  align: FrameAlign = 'bottom',
): { rows: Grid; dx: number; dy: number } {
  const { cols, rows: h } = gridSize(rows)
  const dx = Math.max(0, Math.floor((width - cols) / 2))
  const dy =
    align === 'bottom' ? Math.max(0, height - h) : align === 'center' ? Math.max(0, Math.floor((height - h) / 2)) : 0
  const blank = '.'.repeat(width)
  const out: Grid = []
  for (let y = 0; y < height; y++) {
    const src = rows[y - dy]
    if (src === undefined) {
      out.push(blank)
      continue
    }
    const line = '.'.repeat(dx) + src.padEnd(cols, '.')
    out.push(line.slice(0, width).padEnd(width, '.'))
  }
  return { rows: out, dx, dy }
}

export interface PixelRectsProps {
  rows: Grid
  palette: Palette
  /** Offset in grid cells inside the parent SVG. */
  x?: number
  y?: number
  /** When set, the rects are wrapped in a <g> with this class (e.g. for a blink animation). */
  className?: string
}

/** One <rect> per opaque cell. Must be rendered inside an <svg>. */
export function PixelRects({ rows, palette, x = 0, y = 0, className }: PixelRectsProps) {
  const rects: ReactNode[] = []
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]
      if (isTransparent(ch)) continue
      rects.push(
        <rect key={`${rx},${ry}`} x={x + rx} y={y + ry} width={1} height={1} fill={palette[ch] ?? MISSING_COLOR} />,
      )
    }
  })
  return className ? <g className={className}>{rects}</g> : <>{rects}</>
}

export interface PixelArtProps {
  rows: Grid
  palette: Palette
  /** Screen pixels per grid cell. */
  size?: number
  className?: string
  /** Accessible name. Without it the image is aria-hidden (decorative). */
  title?: string
  style?: CSSProperties
  /** Extra SVG layers drawn on top of the grid, in grid coordinates. */
  children?: ReactNode
}

/** Inline SVG: viewBox = cols x rows, rendered at cols*size by rows*size px. */
export function PixelArt({ rows, palette, size = 8, className, title, style, children }: PixelArtProps) {
  const { cols, rows: h } = gridSize(rows)
  return (
    <svg
      viewBox={`0 0 ${cols} ${h}`}
      width={cols * size}
      height={h * size}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={style}
    >
      <PixelRects rows={rows} palette={palette} />
      {children}
    </svg>
  )
}
