// Pure sizing + grid selection for a pet, shared by PetSprite (React) and
// spriteGrid (favicon / app icons). No React here.
import { SPECIES_META, type Species, type Stage } from '../pet/types'
import { gridSize, type Grid, type Palette } from '../components/pixel'
import { castGrid, type CastVariant } from './cast'
import { ICONS } from './icons'

/** Rendered height as a fraction of `px` (the adult height) per stage. The egg is square at 0.8. */
export const SPRITE_STAGE_SCALE: Record<Stage, number> = { egg: 0.8, baby: 0.7, teen: 0.85, adult: 1 }
/** Ghosts are square at this fraction of `px`, whatever the stage. */
export const GHOST_SCALE = 0.8
/** Default adult height in CSS px. */
export const DEFAULT_PET_PX = 96

export interface PetFrame {
  rows: Grid
  palette: Palette
  /** Rendered size in CSS px (already stage-scaled, aspect preserved). */
  width: number
  height: number
  kind: 'egg' | 'ghost' | 'cast'
  /** Human label without the mood, e.g. "adult Tanuki", "Tanuki egg", "ghost of a Tanuki". */
  label: string
}

export interface PetFrameOpts {
  species: Species
  stage: Stage
  alive: boolean
  variant?: CastVariant | null
  /** Target adult height in CSS px. */
  px?: number
}

/** !alive -> ghost; egg -> egg; else the cast grid (variant falls back to base). */
export function petFrame({ species, stage, alive, variant = null, px = DEFAULT_PET_PX }: PetFrameOpts): PetFrame {
  const name = SPECIES_META[species].label
  if (!alive) {
    const side = Math.round(px * GHOST_SCALE)
    return { ...ICONS.ghost, width: side, height: side, kind: 'ghost', label: `ghost of a ${name}` }
  }
  if (stage === 'egg') {
    const side = Math.round(px * SPRITE_STAGE_SCALE.egg)
    return { ...ICONS.egg, width: side, height: side, kind: 'egg', label: `${name} egg` }
  }
  const { rows, palette } = castGrid(species, variant)
  const { cols, rows: h } = gridSize(rows)
  const height = Math.round(px * SPRITE_STAGE_SCALE[stage])
  const width = Math.round(h > 0 ? (height * cols) / h : 0)
  return { rows, palette, width, height, kind: 'cast', label: `${stage} ${name}` }
}
