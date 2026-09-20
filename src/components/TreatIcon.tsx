// 8x8 treat icon from the design's icon set; unknown kinds show a gift box.
import type { TreatKind } from '../pet/types'
import { treatIconDef } from '../art/treats'
import { PixelArt } from './pixel'

export interface TreatIconProps {
  kind: TreatKind | string
  /** Screen pixels per cell; the icon is 8 * size px square. Default 4. */
  size?: number
  className?: string
}

export function TreatIcon({ kind, size = 4, className }: TreatIconProps) {
  const def = treatIconDef(kind)
  return <PixelArt rows={def.rows} palette={def.palette} size={size} className={className} title={kind} />
}
