/* eslint-disable react-refresh/only-export-components -- this file intentionally exports data/helpers next to its component; editing it triggers a full HMR reload instead of a fast refresh */
// Generated pixel-art pet. Everything visual lives in the exported grids and
// palettes below so an artist can redraw a species without touching the JSX.
//
// Grid legend (see pixel.tsx):  '.' transparent  o outline  b body  d shade
//   l highlight  a accent (belly / inner ear / wing)  k blush  w white
//   y halo yellow  t tear  r mouth inside
//
// Every stage is drawn compactly, then centred + bottom-aligned on a 16x16
// canvas by `frame()` so all pets share one footprint in the UI.
import type { Mood, Species, Stage } from '../pet/types'
import { PixelArt, PixelRects, frame, mirror, type Grid, type Palette } from './pixel'
import './sprites.css'

export const OUTLINE = '#2b2140'
export const BLUSH = '#ff9db3'
/** Canvas size in cells; every PetSprite renders CANVAS x CANVAS cells. */
export const CANVAS = 16

const SHARED: Palette = {
  o: OUTLINE,
  k: BLUSH,
  w: '#ffffff',
  y: '#ffd84d',
  t: '#7fd3ff',
  r: '#e0587a',
}

export const SPECIES_PALETTES: Record<Species, Palette> = {
  blob: { ...SHARED, b: '#7fe3c9', d: '#3fbfa0', l: '#c8fff0', a: '#a7f0dd' },
  cat: { ...SHARED, b: '#ffc59a', d: '#f28c3b', l: '#ffe6cc', a: '#ffb0c8' },
  dragon: { ...SHARED, b: '#c9a8ff', d: '#8e5ee6', l: '#ecdcff', a: '#ffe9b3' },
}

/** Pale, desaturated palette for a dead pet; the halo stays yellow. */
export const GHOST_PALETTE: Palette = {
  ...SHARED,
  o: '#8d93b8',
  b: '#eef1ff',
  d: '#d3d8f2',
  l: '#ffffff',
  a: '#e3e7fb',
  k: '#f3d4de',
  t: '#cfe6ff',
  r: '#d9c2d1',
}

export type XY = [x: number, y: number]

export interface FaceAnchors {
  /** Top-left of a 2x2 eye. */
  eyeL: XY
  eyeR: XY
  /** [centre column, top row]. */
  mouth: XY
  /**
   * Set when the 2x2 eye boxes sit right against the head outline, so a 3x3
   * eye (sparkle / X) would fuse into it. Faces that carry a `small` variant
   * draw that instead; see eyeStamps(). Checked by the geometry test.
   */
  smallEyes?: boolean
}

export interface SpriteDef {
  rows: Grid
  /** Face anchors in this grid's coordinates. Omitted for the egg (no face). */
  face?: FaceAnchors
}

/** Same shape for every species; only the palette changes. 12x13. */
export const EGG: SpriteDef = {
  rows: [
    '....oooo....',
    '..oobbbboo..',
    '.obbllbbbbo.',
    '.oblbbbbdbo.',
    'obbbbbbbbbbo',
    'obbdbbbbbbbo',
    'obbbbbbdbbbo',
    'obbbbbbbbbbo',
    'obdbbbbbbdbo',
    'obbbbbdbbbbo',
    '.obbbbbbbdo.',
    '.oobbbbbboo.',
    '..oooooooo..',
  ],
}

export type HatchedStage = Exclude<Stage, 'egg'>

export const BODIES: Record<Species, Record<HatchedStage, SpriteDef>> = {
  blob: {
    // 10x9: round drop with a single tuft
    baby: {
      rows: [
        '.....o....',
        '....obo...',
        '..oobbboo.',
        '.obllbbbbo',
        'obbbbbbbbo',
        'obbbbbbbbo',
        'okbbbbbbko',
        '.obbbbbdo.',
        '..oooooo..',
      ],
      face: { eyeL: [2, 4], eyeR: [6, 4], mouth: [5, 6], smallEyes: true },
    },
    // 12x11: taller, bigger tuft
    teen: {
      rows: [
        '......o.....',
        '.....obo....',
        '....obbbo...',
        '..oobbbbboo.',
        '.oblbbbbbbbo',
        'obllbbbbbbbo',
        'obbbbbbbbbbo',
        'okbbbbbbbbko',
        'obbbbbbbbbdo',
        '.obbbbbbbdo.',
        '..oooooooo..',
      ],
      // the tuft's slope puts outline right above / beside the left eye
      face: { eyeL: [3, 5], eyeR: [7, 5], mouth: [6, 7], smallEyes: true },
    },
    // 14x14: signature triple-drip crown
    adult: {
      rows: [
        '......oo......',
        '.....obbo.....',
        '..oo.obbo.oo..',
        '.obboobboobbo.',
        '.obbbbbbbbbbo.',
        'obllbbbbbbbbbo',
        'oblbbbbbbbbbbo',
        'obbbbbbbbbbbbo',
        'obbbbbbbbbbbbo',
        'okbbbbbbbbbbko',
        'obbbbbbbbbbbdo',
        'obbbbbbbbbbddo',
        '.obbbbbbbbbdo.',
        '..oooooooooo..',
      ],
      face: { eyeL: [3, 6], eyeR: [9, 6], mouth: [7, 9] },
    },
  },
  cat: {
    // 10x9: round kitten head with pink inner ears
    baby: {
      rows: [
        '.o......o.',
        'oao....oao',
        'obboooobbo',
        'oblbbbbbbo',
        'obbbbbbbbo',
        'obbbbbbbbo',
        'okbbbbbbko',
        '.obbbbbdo.',
        '..oooooo..',
      ],
      face: { eyeL: [2, 4], eyeR: [6, 4], mouth: [5, 6], smallEyes: true },
    },
    // 12x11: forehead stripes appear
    teen: {
      rows: [
        '.o........o.',
        'oao......oao',
        'obboooooobbo',
        'oblbdbbdbbbo',
        'obbbbbbbbbbo',
        'obbbbbbbbbbo',
        'obbbbbbbbbbo',
        'okbbbbbbbbko',
        'obbbbbbbbbdo',
        '.obbbbbbbdo.',
        '..oooooooo..',
      ],
      face: { eyeL: [3, 5], eyeR: [7, 5], mouth: [6, 7] },
    },
    // 16x14: signature ears + stripes + curled tail on the right
    adult: {
      rows: [
        '.o........o.....',
        'oao......oao....',
        'obboooooobbo....',
        'oblbdbbdbbbo....',
        'obbbbbbbbbbo....',
        'obbbbbbbbbbo....',
        'obbbbbbbbbbo....',
        'obbbbbbbbbbo..oo',
        'okbbbbbbbbko.obo',
        'obbbbbbbbbbooobo',
        'obbbbbbbbbbbbbbo',
        'obbbbbbbbbbooooo',
        '.obbbbbbbdo.....',
        '..oooooooo......',
      ],
      face: { eyeL: [3, 5], eyeR: [7, 5], mouth: [6, 8] },
    },
  },
  dragon: {
    // 10x9: nub horns + cream belly
    baby: {
      rows: [
        '..o....o..',
        '.oboooobo.',
        'oblbbbbbbo',
        'obbbbbbbbo',
        'obbbbbbbbo',
        'okbbbbbbko',
        'obbaaaabbo',
        '.obaaaabo.',
        '..oooooo..',
      ],
      face: { eyeL: [2, 3], eyeR: [6, 3], mouth: [5, 5], smallEyes: true },
    },
    // 14x11: horns + small wing nubs + belly
    teen: {
      rows: [
        '....o....o....',
        '...oboooobo...',
        '..oblbbbbbbo..',
        '..obbbbbbbbo..',
        '.oobbbbbbbboo.',
        'oaobbbbbbbboao',
        'oaokbbbbbbkoao',
        '.oobbaaaabboo.',
        '..obbaaaabdo..',
        '..obbaaaabdo..',
        '...oooooooo...',
      ],
      face: { eyeL: [4, 4], eyeR: [8, 4], mouth: [7, 6], smallEyes: true },
    },
    // 16x14: signature full wings, horns, belly, tail stub
    adult: {
      rows: [
        '.....o....o.....',
        '....oboooobo....',
        '...obllbbbbbo...',
        '...obbbbbbbbo...',
        '..oobbbbbbbboo..',
        '.oaobbbbbbbboao.',
        'oaaokbbbbbbkoaao',
        'oaaobbbbbbbboaao',
        '.ooobbaaaabbooo.',
        '...obbaaaabbo...',
        '...obbaaaabbooo.',
        '...obbaaaabbbbo.',
        '....obbaaaabooo.',
        '.....ooooooo....',
      ],
      face: { eyeL: [5, 4], eyeR: [9, 4], mouth: [8, 7], smallEyes: true },
    },
  },
}

/** A small grid drawn at an anchor + (dx, dy) offset. */
export interface Stamp {
  rows: Grid
  dx: number
  dy: number
}

export interface FaceDef {
  eyeL: Stamp
  eyeR: Stamp
  mouth: Stamp
  /** 2x2 eyes drawn instead of eyeL/eyeR on heads flagged `smallEyes`. */
  small?: { eyeL: Stamp; eyeR: Stamp }
  /**
   * Extra layer anchored at eyeL that must stay put while the eyes blink
   * (the sad tear); drawn without the blink class.
   */
  extra?: Stamp
  /** Whether the idle blink animation applies (not for x-eyes / sparkles). */
  blink: boolean
}

const EYE: Grid = ['ow', 'oo']
const EYE_DULL: Grid = ['oo', 'ow']
const EYE_SPARKLE: Grid = ['.o.', 'owo', '.o.']
const EYE_X: Grid = ['o.o', '.o.', 'o.o']
/** 2x2 stand-ins for heads with no room for a 3x3 eye (FaceAnchors.smallEyes). */
const EYE_SPARKLE_SMALL: Grid = ['ow', 'wo'] // EYE's top-right glint plus a second one
/** One slit per eye; mirrored for the right eye so the pair droops outward. */
const EYE_SLIT: Grid = ['.o', 'o.']
/** Shown only while blinking (see sprites.css). */
export const EYE_CLOSED: Stamp = { rows: ['oo'], dx: 0, dy: 1 }

const eye = (rows: Grid, dx = 0, dy = 0): Stamp => ({ rows, dx, dy })
/** Mouths are anchored by their centre column; dx = -floor(width / 2). */
const mouth = (rows: Grid): Stamp => ({ rows, dx: -Math.floor(rows[0].length / 2), dy: 0 })

export const FACES: Record<Mood, FaceDef> = {
  ecstatic: {
    eyeL: eye(EYE_SPARKLE, -1, -1),
    eyeR: eye(EYE_SPARKLE, 0, -1),
    small: { eyeL: eye(EYE_SPARKLE_SMALL), eyeR: eye(EYE_SPARKLE_SMALL) },
    mouth: mouth(['o.o', 'oro']),
    blink: false,
  },
  happy: { eyeL: eye(EYE), eyeR: eye(EYE), mouth: mouth(['o.o', '.o.']), blink: true },
  meh: { eyeL: eye(EYE_DULL), eyeR: eye(EYE_DULL), mouth: mouth(['ooo']), blink: true },
  sad: {
    eyeL: eye(EYE),
    eyeR: eye(EYE),
    /** Tear under the left eye; separate from eyeL so it does not blink away. */
    extra: { rows: ['t'], dx: 0, dy: 2 },
    mouth: mouth(['.o.', 'o.o']),
    blink: true,
  },
  miserable: {
    eyeL: eye(EYE_X, -1, -1),
    eyeR: eye(EYE_X, 0, -1),
    small: { eyeL: eye(EYE_SLIT), eyeR: eye(mirror(EYE_SLIT)) },
    mouth: mouth(['.ooo.', 'o...o']),
    blink: false,
  },
}

/** The eye stamps PetSprite draws: the face's `small` pair on a `smallEyes` head, else eyeL/eyeR. */
export function eyeStamps(face: FaceDef, smallEyes = false): { eyeL: Stamp; eyeR: Stamp } {
  return smallEyes && face.small ? face.small : { eyeL: face.eyeL, eyeR: face.eyeR }
}

/** Serene closed eyes + tiny mouth for the ghost. */
export const GHOST_FACE: FaceDef = {
  eyeL: eye(['oo'], 0, 1),
  eyeR: eye(['oo'], 0, 1),
  mouth: mouth(['o']),
  blink: false,
}

/** 5x2 arc drawn above the head of a ghost. */
export const HALO: Grid = ['.yyy.', 'y...y']

export const SPRITE_STAGES: readonly Stage[] = ['egg', 'baby', 'teen', 'adult']
export const SPRITE_MOODS: readonly Mood[] = ['ecstatic', 'happy', 'meh', 'sad', 'miserable']

export function spriteDef(species: Species, stage: Stage): SpriteDef {
  return stage === 'egg' ? EGG : BODIES[species][stage]
}

type Anim = 'bob' | 'droop' | 'wobble' | 'rock' | 'sway'

function pickAnim(stage: Stage, mood: Mood, alive: boolean): Anim {
  if (!alive) return 'sway'
  if (stage === 'egg') return 'rock'
  if (mood === 'ecstatic') return 'wobble'
  if (mood === 'sad' || mood === 'miserable') return 'droop'
  return 'bob'
}

export interface PetSpriteProps {
  species: Species
  stage: Stage
  mood: Mood
  alive: boolean
  /** Screen pixels per cell; the sprite is CANVAS * size px square. Default 8. */
  size?: number
  className?: string
}

export function PetSprite({ species, stage, mood, alive, size = 8, className }: PetSpriteProps) {
  const palette = alive ? SPECIES_PALETTES[species] : GHOST_PALETTE
  const def = spriteDef(species, stage)
  const { rows, dx, dy } = frame(def.rows, CANVAS, CANVAS, 'bottom')
  const face = alive ? FACES[mood] : GHOST_FACE
  const anchors = def.face
  const eyes = eyeStamps(face, anchors?.smallEyes)
  const cx = anchors ? anchors.mouth[0] : Math.floor(def.rows[0].length / 2)
  const anim = pickAnim(stage, mood, alive)
  const title = alive ? `${mood} ${stage} ${species}` : `ghost of a ${species} (${stage})`
  const classes = [
    'sprite',
    `sprite--${species}`,
    `sprite--${stage}`,
    `sprite--${mood}`,
    alive ? 'sprite--alive' : 'sprite--ghost',
    `sprite-anim-${anim}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const at = (anchor: XY, s: Stamp): XY => [dx + anchor[0] + s.dx, dy + anchor[1] + s.dy]

  return (
    <PixelArt rows={rows} palette={palette} size={size} className={classes} title={title}>
      {anchors && (
        <>
          <PixelRects
            rows={eyes.eyeL.rows}
            palette={palette}
            x={at(anchors.eyeL, eyes.eyeL)[0]}
            y={at(anchors.eyeL, eyes.eyeL)[1]}
            className={face.blink ? 'sprite__eyes' : undefined}
          />
          <PixelRects
            rows={eyes.eyeR.rows}
            palette={palette}
            x={at(anchors.eyeR, eyes.eyeR)[0]}
            y={at(anchors.eyeR, eyes.eyeR)[1]}
            className={face.blink ? 'sprite__eyes' : undefined}
          />
          {face.blink && (
            <g className="sprite__eyes--closed">
              <PixelRects
                rows={EYE_CLOSED.rows}
                palette={palette}
                x={at(anchors.eyeL, EYE_CLOSED)[0]}
                y={at(anchors.eyeL, EYE_CLOSED)[1]}
              />
              <PixelRects
                rows={EYE_CLOSED.rows}
                palette={palette}
                x={at(anchors.eyeR, EYE_CLOSED)[0]}
                y={at(anchors.eyeR, EYE_CLOSED)[1]}
              />
            </g>
          )}
          {face.extra && (
            <PixelRects
              rows={face.extra.rows}
              palette={palette}
              x={at(anchors.eyeL, face.extra)[0]}
              y={at(anchors.eyeL, face.extra)[1]}
            />
          )}
          <PixelRects
            rows={face.mouth.rows}
            palette={palette}
            x={at(anchors.mouth, face.mouth)[0]}
            y={at(anchors.mouth, face.mouth)[1]}
          />
        </>
      )}
      {!alive && (
        <PixelRects rows={HALO} palette={palette} x={dx + cx - 2} y={Math.max(0, dy - HALO.length)} />
      )}
    </PixelArt>
  )
}
