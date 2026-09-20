// UI pixel icons from the design handoff (sprites.js), extracted by script with
// each palette pre-resolved (BASE merged with the icon's overrides; egg / ghost
// use the design's SPECIES.egg / SPECIES.ghost tints). Do not hand-edit those
// grids. 'gift' is an original addition for unknown treat kinds.
import type { Grid, Palette } from '../components/pixel'

export const ICON_NAMES = ['apple', 'ball', 'soap', 'cookie', 'fish', 'star', 'heart', 'leaf', 'flower', 'sprout', 'grass', 'bfly_a', 'bfly_b', 'vineh', 'vinec', 'egg', 'ghost', 'gift'] as const
export type IconName = (typeof ICON_NAMES)[number]

export interface IconDef {
  rows: Grid
  palette: Palette
}

export const ICONS: Record<IconName, IconDef> = {
  apple: {
    // 8x8
    rows: [
      '...o....',
      '..oyo...',
      '.obbbbo.',
      'obbbbbbo',
      'obwbbbbo',
      'obbbbbbo',
      '.obbbbo.',
      '..oooo..',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#e04f4f', y: '#4fae6d' },
  },
  ball: {
    // 8x8
    rows: [
      '..oooo..',
      '.obbbbo.',
      'obwbbbbo',
      'obbwbbbo',
      'obbbwbbo',
      '.obbbwo.',
      '..oooo..',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#cfe45a' },
  },
  soap: {
    // 8x8
    rows: [
      '..o..o..',
      '........',
      '.oooooo.',
      'obwwbbbo',
      'obbbbbbo',
      'obbbbbbo',
      '.oooooo.',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#7ec8f0' },
  },
  cookie: {
    // 8x8
    rows: [
      '..oooo..',
      '.obkbbo.',
      'obbbbkbo',
      'obkbbbbo',
      'obbbkbbo',
      '.obbbbo.',
      '..oooo..',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#d9a15e' },
  },
  fish: {
    // 8x8
    rows: [
      '........',
      '.oooo...',
      'obbbbo.o',
      'obkbbooo',
      'obbbbo.o',
      '.oooo...',
      '........',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#6fb7e8' },
  },
  star: {
    // 8x8
    rows: [
      '...o....',
      '..oyo...',
      'ooyyyoo.',
      'oyyyyyo.',
      '.oyyyo..',
      '.oyoyo..',
      'oo...oo.',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#f2b23c', y: '#f2b23c' },
  },
  heart: {
    // 8x8
    rows: [
      '.bb..bb.',
      'bwbbbbbb',
      'bbbbbbbb',
      'bbbbbbbb',
      '.bbbbbb.',
      '..bbbb..',
      '...bb...',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffd3e0', p: '#f4a8c4', m: '#8f3d5e', b: '#e0557a' },
  },
  leaf: {
    // 8x8
    rows: [
      '....oo..',
      '..obbbo.',
      '.obbbbo.',
      '.obbbo..',
      '..obo...',
      '...o....',
      '........',
      '........',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#4a9e63' },
  },
  flower: {
    // 8x8
    rows: [
      '..ooo...',
      '.opppo..',
      '.opypo..',
      '..ooo...',
      '...b....',
      '..bbb...',
      '...b....',
      '........',
    ],
    palette: { o: '#3a4030', k: '#2b2140', w: '#ffffff', p: '#e08a9b', m: '#8f3d5e', y: '#f2d06b', b: '#5d8a4f' },
  },
  sprout: {
    // 8x6
    rows: [
      '.bb.bb..',
      '.bbbbb..',
      '...b....',
      '...b....',
      '.mmmmm..',
      'mmmmmmm.',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8a5a3a', b: '#6fae52' },
  },
  grass: {
    // 16x4
    rows: [
      '.o..o.....o..o..',
      '.o.oo..o..oo.o..',
      'oo.oo.oo..oo.oo.',
      'oooooooooooooooo',
    ],
    palette: { o: '#3e7a4f', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#6bbf7d' },
  },
  bfly_a: {
    // 8x4
    rows: [
      '.bb..bb.',
      'bbboobbb',
      '.bboobb.',
      '..b..b..',
    ],
    palette: { o: '#3a4030', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#a35a4e' },
  },
  bfly_b: {
    // 8x4
    rows: [
      '..b..b..',
      '.bboobb.',
      '.bboobb.',
      '..b..b..',
    ],
    palette: { o: '#3a4030', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#a35a4e' },
  },
  vineh: {
    // 16x6
    rows: [
      '..oo.....oo.....',
      '.obbo...obbo....',
      '..oo..o..oo..o..',
      'oooooooooooooooo',
      '...o..oo....oo..',
      '..obo.obbo..obo.',
    ],
    palette: { o: '#2f5940', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#5cb576' },
  },
  vinec: {
    // 12x12
    rows: [
      'oo..........',
      'obo.........',
      '.obo...oo...',
      '.obbo.obbo..',
      '..obo..oo...',
      '..obbo......',
      '...obo..oo..',
      '...obbo.obo.',
      '....obo..o..',
      '....obbo....',
      '.....oo.....',
      '............',
    ],
    palette: { o: '#2f5940', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#5cb576' },
  },
  egg: {
    // 16x16
    rows: [
      '................',
      '................',
      '................',
      '......oooo......',
      '.....obbbbo.....',
      '....obbdbbbo....',
      '...obbbbbbbbo...',
      '...obdbbbbdbo...',
      '..obbbbdbbbbbo..',
      '..obbbbbbbbbbo..',
      '..obbdbbbbbbbo..',
      '..obbbbbbdbbbo..',
      '...obbbbbbbbo...',
      '....obbbbbbo....',
      '.....oooooo.....',
      '................',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#fff3dc', d: '#c9bdec', y: '#fff3dc' },
  },
  ghost: {
    // 16x16
    rows: [
      '................',
      '................',
      '.....oooooo.....',
      '....obbbbbbo....',
      '...obbbbbbbbo...',
      '..obbbbbbbbbbo..',
      '..obkkbbbbkkbo..',
      '..obkkbbbbkkbo..',
      '..obbbbbbbbbbo..',
      '..obbbbkkbbbbo..',
      '..obbbbbbbbbbo..',
      '..obbbbbbbbbbo..',
      '..obbobbbbobbo..',
      '..oo.oo..oo.oo..',
      '................',
      '................',
    ],
    palette: { o: '#2b2140', k: '#2b2140', w: '#ffffff', p: '#f4a8c4', m: '#8f3d5e', b: '#f4f1ff', d: '#dcd6f2', y: '#f4f1ff' },
  },
  gift: {
    // 8x8, original: wrapped box with a bow
    rows: [
      '.oo..oo.',
      'oyyooyyo',
      '.ooyyoo.',
      'oooyyooo',
      'obbyybbo',
      'oooyyooo',
      'obbyybbo',
      '.oooooo.',
    ],
    palette: { o: '#2b2140', b: '#e08a9b', y: '#f2d06b' },
  },
}

export function iconGrid(name: IconName): IconDef {
  return ICONS[name]
}

/** True for names that exist in ICONS; a safe check for strings coming from chain memos. */
export function isIconName(name: string): name is IconName {
  return (ICON_NAMES as readonly string[]).includes(name)
}
