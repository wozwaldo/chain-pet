import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SPECIES } from '../pet/types'
import { countPixels, frame, gridSize, isRectangular, isTransparent, mirror, stamp, type Grid } from './pixel'
import {
  BODIES,
  CANVAS,
  EGG,
  EYE_CLOSED,
  FACES,
  GHOST_FACE,
  GHOST_PALETTE,
  HALO,
  PetSprite,
  SPECIES_PALETTES,
  SPRITE_MOODS,
  SPRITE_STAGES,
  eyeStamps,
  spriteDef,
  type FaceDef,
  type SpriteDef,
  type Stamp,
  type XY,
} from './PetSprite'
import { TREATS, TreatIcon, treatDef } from './TreatIcon'

const HATCHED = ['baby', 'teen', 'adult'] as const

function allBodies(): Array<{ name: string; def: SpriteDef }> {
  const out: Array<{ name: string; def: SpriteDef }> = [{ name: 'egg', def: EGG }]
  for (const s of SPECIES) for (const st of HATCHED) out.push({ name: `${s}/${st}`, def: BODIES[s][st] })
  return out
}

function allStamps(): Array<{ name: string; rows: Grid }> {
  const out: Array<{ name: string; rows: Grid }> = [
    { name: 'halo', rows: HALO },
    { name: 'eye-closed', rows: EYE_CLOSED.rows },
  ]
  for (const [mood, f] of Object.entries({ ...FACES, ghost: GHOST_FACE })) {
    out.push({ name: `${mood}/eyeL`, rows: f.eyeL.rows })
    out.push({ name: `${mood}/eyeR`, rows: f.eyeR.rows })
    out.push({ name: `${mood}/mouth`, rows: f.mouth.rows })
    if (f.small) {
      out.push({ name: `${mood}/small/eyeL`, rows: f.small.eyeL.rows })
      out.push({ name: `${mood}/small/eyeR`, rows: f.small.eyeR.rows })
    }
    if (f.extra) out.push({ name: `${mood}/extra`, rows: f.extra.rows })
  }
  return out
}

const ALL_FACES: Record<string, FaceDef> = { ...FACES, ghost: GHOST_FACE }

/**
 * True when an outline-coloured cell of `s` (placed at `anchor`) is
 * 4-adjacent to an outline cell of the body that the stamp does not cover:
 * the two would read as one shape, e.g. a sparkle arm merging into the head.
 */
function touchesOutline(def: SpriteDef, anchor: XY, s: Stamp): boolean {
  const x0 = anchor[0] + s.dx
  const y0 = anchor[1] + s.dy
  const covered = (x: number, y: number) => {
    const ch = s.rows[y - y0]?.[x - x0]
    return ch !== undefined && !isTransparent(ch)
  }
  for (let ry = 0; ry < s.rows.length; ry++)
    for (let rx = 0; rx < s.rows[ry].length; rx++) {
      if (s.rows[ry][rx] !== 'o') continue
      const x = x0 + rx
      const y = y0 + ry
      const around: XY[] = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]
      for (const [nx, ny] of around) if (!covered(nx, ny) && def.rows[ny]?.[nx] === 'o') return true
    }
  return false
}

function usedChars(rows: Grid): Set<string> {
  const s = new Set<string>()
  for (const r of rows) for (const ch of r) if (!isTransparent(ch)) s.add(ch)
  return s
}

describe('pixel helpers', () => {
  it('mirror flips horizontally and keeps size', () => {
    expect(mirror(['ab.', 'c..'])).toEqual(['.ba', '..c'])
  })
  it('stamp overlays opaque cells only and ignores out-of-bounds', () => {
    expect(stamp(['....', '....'], ['x.', '.y'], 1, 0)).toEqual(['.x..', '..y.'])
    expect(stamp(['..'], ['zz'], 1, 0)).toEqual(['.z'])
  })
  it('frame centres horizontally and bottom-aligns', () => {
    const { rows, dx, dy } = frame(['ab', 'cd'], 4, 4)
    expect(rows).toEqual(['....', '....', '.ab.', '.cd.'])
    expect([dx, dy]).toEqual([1, 2])
  })
  it('gridSize / countPixels', () => {
    expect(gridSize(['a..', 'bb.'])).toEqual({ cols: 3, rows: 2 })
    expect(countPixels(['a..', 'bb.'])).toBe(3)
  })
})

describe('sprite grids', () => {
  it.each(allBodies())('$name rows have equal width', ({ def }) => {
    expect(isRectangular(def.rows)).toBe(true)
  })

  it.each(allStamps())('$name stamp rows have equal width', ({ rows }) => {
    expect(isRectangular(rows)).toBe(true)
  })

  it.each(Object.entries(TREATS))('treat %s is 8x8', (_kind, def) => {
    expect(isRectangular(def.rows)).toBe(true)
    expect(gridSize(def.rows)).toEqual({ cols: 8, rows: 8 })
    for (const ch of usedChars(def.rows)) expect(def.palette[ch], `palette key ${ch}`).toBeDefined()
  })

  it('grids are the claimed sizes and fit the 16x16 canvas', () => {
    expect(gridSize(EGG.rows)).toEqual({ cols: 12, rows: 13 })
    const expected: Record<string, [number, number]> = {
      'blob/baby': [10, 9],
      'blob/teen': [12, 11],
      'blob/adult': [14, 14],
      'cat/baby': [10, 9],
      'cat/teen': [12, 11],
      'cat/adult': [16, 14],
      'dragon/baby': [10, 9],
      'dragon/teen': [14, 11],
      'dragon/adult': [16, 14],
    }
    for (const { name, def } of allBodies()) {
      const { cols, rows } = gridSize(def.rows)
      expect(cols, name).toBeLessThanOrEqual(CANVAS)
      expect(rows, name).toBeLessThanOrEqual(CANVAS)
      if (expected[name]) expect([cols, rows], name).toEqual(expected[name])
    }
  })

  it('every stage grows: baby < teen < adult in area', () => {
    for (const s of SPECIES) {
      const area = (st: (typeof HATCHED)[number]) => countPixels(BODIES[s][st].rows)
      expect(area('baby')).toBeLessThan(area('teen'))
      expect(area('teen')).toBeLessThan(area('adult'))
    }
  })

  it('every grid char exists in every palette (species + ghost)', () => {
    const grids = [...allBodies().map((b) => b.def.rows), ...allStamps().map((s) => s.rows)]
    const palettes = [...Object.values(SPECIES_PALETTES), GHOST_PALETTE]
    for (const rows of grids)
      for (const ch of usedChars(rows)) for (const p of palettes) expect(p[ch], `palette key ${ch}`).toBeDefined()
  })

  it('face stamps land inside the body for every species x stage x mood', () => {
    const inside = (def: SpriteDef, anchor: [number, number], s: Stamp) => {
      const { cols, rows } = gridSize(def.rows)
      const x0 = anchor[0] + s.dx
      const y0 = anchor[1] + s.dy
      const { cols: w, rows: h } = gridSize(s.rows)
      return x0 >= 0 && y0 >= 0 && x0 + w <= cols && y0 + h <= rows
    }
    for (const s of SPECIES)
      for (const st of HATCHED) {
        const def = BODIES[s][st]
        expect(def.face, `${s}/${st} has a face`).toBeDefined()
        for (const [mood, f] of Object.entries(ALL_FACES)) {
          expect(inside(def, def.face!.eyeL, f.eyeL), `${s}/${st}/${mood} eyeL`).toBe(true)
          expect(inside(def, def.face!.eyeR, f.eyeR), `${s}/${st}/${mood} eyeR`).toBe(true)
          expect(inside(def, def.face!.mouth, f.mouth), `${s}/${st}/${mood} mouth`).toBe(true)
          if (f.small) {
            expect(inside(def, def.face!.eyeL, f.small.eyeL), `${s}/${st}/${mood} small eyeL`).toBe(true)
            expect(inside(def, def.face!.eyeR, f.small.eyeR), `${s}/${st}/${mood} small eyeR`).toBe(true)
          }
          if (f.extra) expect(inside(def, def.face!.eyeL, f.extra), `${s}/${st}/${mood} extra`).toBe(true)
        }
      }
  })

  it('eyes never fuse into the head outline; smallEyes is set exactly where the 3x3 eyes would', () => {
    for (const s of SPECIES)
      for (const st of HATCHED) {
        const def = BODIES[s][st]
        const anchors = def.face!
        const wideWouldTouch = Object.values(ALL_FACES).some(
          (f) => touchesOutline(def, anchors.eyeL, f.eyeL) || touchesOutline(def, anchors.eyeR, f.eyeR),
        )
        expect(anchors.smallEyes === true, `${s}/${st} smallEyes`).toBe(wideWouldTouch)
        for (const [mood, f] of Object.entries(ALL_FACES)) {
          const eyes = eyeStamps(f, anchors.smallEyes)
          expect(touchesOutline(def, anchors.eyeL, eyes.eyeL), `${s}/${st}/${mood} eyeL`).toBe(false)
          expect(touchesOutline(def, anchors.eyeR, eyes.eyeR), `${s}/${st}/${mood} eyeR`).toBe(false)
        }
      }
  })

  it('eyeStamps picks the small pair only on smallEyes heads that have one', () => {
    expect(eyeStamps(FACES.ecstatic, true)).toBe(FACES.ecstatic.small)
    expect(eyeStamps(FACES.ecstatic, false)).toEqual({ eyeL: FACES.ecstatic.eyeL, eyeR: FACES.ecstatic.eyeR })
    expect(eyeStamps(FACES.happy, true)).toEqual({ eyeL: FACES.happy.eyeL, eyeR: FACES.happy.eyeR })
    expect(eyeStamps(FACES.happy)).toEqual({ eyeL: FACES.happy.eyeL, eyeR: FACES.happy.eyeR })
  })

  it('egg has no face and is shared across species', () => {
    expect(EGG.face).toBeUndefined()
    for (const s of SPECIES) expect(spriteDef(s, 'egg')).toBe(EGG)
  })

  it('treatDef falls back to the gift box', () => {
    expect(treatDef('nope')).toBe(TREATS.gift)
    expect(treatDef('apple')).toBe(TREATS.apple)
    // memo text is untrusted: prototype keys must not leak Object.prototype members
    for (const k of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'])
      expect(treatDef(k), k).toBe(TREATS.gift)
  })

  it('TreatIcon renders the gift box for a prototype-key memo instead of throwing', () => {
    const html = renderToStaticMarkup(createElement(TreatIcon, { kind: 'constructor' }))
    expect(html).toContain('viewBox="0 0 8 8"')
    expect(html).toContain(TREATS.gift.palette.g)
    expect(html).not.toContain('#ff00ff')
  })
})

describe('PetSprite render', () => {
  it('renders a 16x16 SVG with a title for every combo, alive and ghost', () => {
    for (const species of SPECIES)
      for (const stage of SPRITE_STAGES)
        for (const mood of SPRITE_MOODS)
          for (const alive of [true, false]) {
            const html = renderToStaticMarkup(createElement(PetSprite, { species, stage, mood, alive, size: 4 }))
            expect(html).toContain(`viewBox="0 0 ${CANVAS} ${CANVAS}"`)
            expect(html).toContain('role="img"')
            expect(html).toContain('width="64"')
            expect(html).toContain('shape-rendering="crispEdges"')
            expect(html).not.toContain('#ff00ff')
            if (!alive) expect(html).toContain('#ffd84d') // halo
          }
  })

  it('blinking moods emit both eye groups; x-eyes do not', () => {
    const happy = renderToStaticMarkup(createElement(PetSprite, { species: 'cat', stage: 'adult', mood: 'happy', alive: true }))
    expect(happy).toContain('sprite__eyes--closed')
    const mis = renderToStaticMarkup(createElement(PetSprite, { species: 'cat', stage: 'adult', mood: 'miserable', alive: true }))
    expect(mis).not.toContain('sprite__eyes')
  })

  it('the sad tear is drawn outside the blinking eye groups', () => {
    const tear = SPECIES_PALETTES.cat.t
    const sad = renderToStaticMarkup(createElement(PetSprite, { species: 'cat', stage: 'baby', mood: 'sad', alive: true }))
    expect(sad).toContain(tear)
    const groups = sad.match(/<g class="sprite__eyes[^"]*">.*?<\/g>/g) ?? []
    expect(groups.length).toBe(3) // eyeL, eyeR, closed lids
    for (const g of groups) expect(g).not.toContain(tear)
  })
})
