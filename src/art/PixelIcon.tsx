// Inline SVG for one of the design's UI icons. `px` is the rendered HEIGHT;
// the width follows the grid aspect (grass is 16x4, bfly 8x4, sprout 8x6).
import { PixelArt } from '../components/pixel'
import { ICONS, type IconName } from './icons'

export interface PixelIconProps {
  name: IconName
  /** Rendered height in CSS px. Default 16. */
  px?: number
  className?: string
  /** Accessible name; without it the icon is decorative (aria-hidden). */
  title?: string
}

export function PixelIcon({ name, px = 16, className, title }: PixelIconProps) {
  const { rows, palette } = ICONS[name]
  return (
    <PixelArt
      rows={rows}
      palette={palette}
      height={px}
      className={className}
      title={title}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
