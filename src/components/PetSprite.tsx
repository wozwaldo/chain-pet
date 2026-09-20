// The pet as an inline SVG: egg (ICONS.egg), ghost (ICONS.ghost) or one of the
// nine cast characters (src/art/cast.ts). Sizing lives in src/art/petSprite.ts.
// No animation in here: the Device owns motion and swaps `variant` frames.
import type { Mood, Species, Stage } from '../pet/types'
import type { CastVariant } from '../art/cast'
import { DEFAULT_PET_PX, petFrame } from '../art/petSprite'
import { PixelRects, gridSize } from './pixel'

export { SPRITE_STAGE_SCALE } from '../art/petSprite'

export interface PetSpriteProps {
  species: Species
  stage: Stage
  mood: Mood
  alive: boolean
  /** Target height of an ADULT in CSS px (default 96); baby .7, teen .85, egg / ghost .8 square. */
  px?: number
  /** Animation frame to show; falls back to the base grid when the character lacks it. */
  variant?: CastVariant | null
  /** Mirror horizontally (the art faces left by default). */
  flip?: boolean
  className?: string
  /** Accessible name; defaults to e.g. "happy adult Tanuki". */
  title?: string
  /** @deprecated Old cell-size prop; maps to px = size * 7. Use `px`. */
  size?: number
}

export function PetSprite({ species, stage, mood, alive, px, variant = null, flip = false, className, title, size }: PetSpriteProps) {
  const target = px ?? (size !== undefined ? size * 7 : DEFAULT_PET_PX)
  const f = petFrame({ species, stage, alive, variant, px: target })
  const { cols, rows } = gridSize(f.rows)
  const label = title ?? (alive ? `${mood} ${f.label}` : f.label)
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      width={f.width}
      height={f.height}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      data-species={species}
      data-stage={stage}
      data-mood={mood}
      data-alive={alive ? 'true' : 'false'}
    >
      <PixelRects rows={f.rows} palette={f.palette} />
    </svg>
  )
}
