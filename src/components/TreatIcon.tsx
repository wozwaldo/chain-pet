/* eslint-disable react-refresh/only-export-components -- this file intentionally exports data/helpers next to its component; editing it triggers a full HMR reload instead of a fast refresh */
// 8x8 pixel treat icons. Unknown kinds fall back to a gift box, since gift
// memos come from other users and may say anything (see GiftEvent.kind).
import type { TreatKind } from '../pet/types'
import { PixelArt, type Grid, type Palette } from './pixel'
import { OUTLINE } from './PetSprite'

const SHARED: Palette = { o: OUTLINE, w: '#ffffff' }

export interface TreatDef {
  rows: Grid
  palette: Palette
}

export const TREATS: Record<TreatKind | 'gift', TreatDef> = {
  apple: {
    rows: [
      '....o...',
      '...og...',
      '.orrrro.',
      'orwrrrro',
      'orrrrrro',
      'orrrrrro',
      '.orrrro.',
      '..oooo..',
    ],
    palette: { ...SHARED, r: '#ff6b6b', g: '#6fd66f' },
  },
  cookie: {
    rows: [
      '..oooo..',
      '.occcco.',
      'ocmccmco',
      'occcmcco',
      'occccmco',
      'ocmcccco',
      '.occcco.',
      '..oooo..',
    ],
    palette: { ...SHARED, c: '#e8b96a', m: '#6b3e26' },
  },
  fish: {
    rows: [
      '........',
      '..ooo...',
      '.offfo.o',
      'ofoffffo',
      'olfffffo',
      '.offfo.o',
      '..ooo...',
      '........',
    ],
    palette: { ...SHARED, f: '#7cc4ff', l: '#c8e8ff' },
  },
  star: {
    rows: [
      '...oo...',
      '..oyyo..',
      'oooyyooo',
      'oysyyyyo',
      '.oyyyyo.',
      '.oyyyyo.',
      'oyyooyyo',
      'oo....oo',
    ],
    palette: { ...SHARED, y: '#ffd84d', s: '#fff3a0' },
  },
  gift: {
    rows: [
      '.oo..oo.',
      'oyyooyyo',
      'oooyyooo',
      'oggyyggo',
      'oooyyooo',
      'oggyyggo',
      'oggyyggo',
      'oooooooo',
    ],
    palette: { ...SHARED, g: '#c9a8ff', y: '#ffd84d' },
  },
}

export function treatDef(kind: string): TreatDef {
  // Own-property check: `kind` is memo text from strangers, and a plain lookup
  // would hand back Object.prototype members for 'constructor' / 'toString'.
  return Object.hasOwn(TREATS, kind) ? TREATS[kind as keyof typeof TREATS] : TREATS.gift
}

export interface TreatIconProps {
  kind: TreatKind | string
  /** Screen pixels per cell; the icon is 8 * size px square. Default 4. */
  size?: number
  className?: string
}

export function TreatIcon({ kind, size = 4, className }: TreatIconProps) {
  const def = treatDef(kind)
  return <PixelArt rows={def.rows} palette={def.palette} size={size} className={className} title={kind} />
}
