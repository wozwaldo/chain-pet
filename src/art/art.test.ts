import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SPECIES, type Species, type Stage } from '../pet/types'
import { gridSize, isRectangular, isTransparent, pixelBox, type Grid, type Palette } from '../components/pixel'
import { composeSprite, spriteSvg, spriteSvgDataUrl } from '../components/spriteGrid'
import { PetSprite } from '../components/PetSprite'
import { TreatIcon } from '../components/TreatIcon'
import { CAST, CAST_MATCHES_SPECIES, CAST_NAMES, CAST_VARIANTS, castGrid } from './cast'
import { ICONS, ICON_NAMES, iconGrid, isIconName } from './icons'
import { PixelIcon } from './PixelIcon'
import { DEFAULT_PET_PX, GHOST_SCALE, SPRITE_STAGE_SCALE, petFrame } from './petSprite'
import { treatIconDef } from './treats'

const STAGES: readonly Stage[] = ['egg', 'baby', 'teen', 'adult']

function usedChars(rows: Grid): Set<string> {
  const out = new Set<string>()
  for (const r of rows) for (const ch of r) if (!isTransparent(ch)) out.add(ch)
  return out
}

function expectPaletteComplete(rows: Grid, palette: Palette, label: string) {
  for (const ch of usedChars(rows)) expect(palette[ch], `${label}: '${ch}' missing from palette`).toMatch(/^#[0-9a-f]{6}$/i)
}

describe('cast', () => {
  it('names equal the on-chain Species list', () => {
    expect(CAST_MATCHES_SPECIES).toBe(true)
    expect([...CAST_NAMES]).toEqual([...SPECIES])
    expect(Object.keys(CAST).sort()).toEqual([...SPECIES].sort())
  })

  it('every base grid and variant is exactly w x h and palette-complete', () => {
    for (const name of CAST_NAMES) {
      const s = CAST[name]
      const grids: Array<[string, Grid]> = [['base', s.grid]]
      for (const [v, g] of Object.entries(s.variants)) if (g) grids.push([v, g])
      expect(grids.length, `${name} has variants`).toBeGreaterThan(1)
      for (const [label, g] of grids) {
        expect(isRectangular(g), `${name}/${label} rectangular`).toBe(true)
        expect(g.length, `${name}/${label} height`).toBe(s.h)
        expect(g[0].length, `${name}/${label} width`).toBe(s.w)
        expectPaletteComplete(g, s.pal, `${name}/${label}`)
      }
    }
  })

  it('every character has an eat frame plus flap or blink', () => {
    for (const name of CAST_NAMES) {
      const v = CAST[name].variants
      expect(v.eat, `${name} eat`).toBeDefined()
      expect(Boolean(v.flap) !== Boolean(v.blink), `${name} has exactly one idle frame`).toBe(true)
    }
  })

  it('castGrid returns the variant, or the base grid when it is missing', () => {
    expect(castGrid('bug', 'flap').rows).toBe(CAST.bug.variants.flap)
    expect(castGrid('plain', 'blink').rows).toBe(CAST.plain.variants.blink)
    expect(castGrid('plain', 'flap').rows).toBe(CAST.plain.grid)
    expect(castGrid('cow', 'ant').rows).toBe(CAST.cow.grid)
    expect(castGrid('cow').rows).toBe(CAST.cow.grid)
    expect(castGrid('cow', null).palette).toBe(CAST.cow.pal)
    for (const v of CAST_VARIANTS) expect(isRectangular(castGrid('bug', v).rows)).toBe(true)
  })
})

describe('icons', () => {
  it('every entry is rectangular and palette-complete', () => {
    for (const name of ICON_NAMES) {
      const { rows, palette } = ICONS[name]
      expect(isRectangular(rows), `${name} rectangular`).toBe(true)
      expect(usedChars(rows).size, `${name} draws something`).toBeGreaterThan(0)
      expectPaletteComplete(rows, palette, name)
      expect(iconGrid(name)).toBe(ICONS[name])
    }
  })

  it('keeps the design sizes', () => {
    expect(gridSize(ICONS.grass.rows)).toEqual({ cols: 16, rows: 4 })
    expect(gridSize(ICONS.bfly_a.rows)).toEqual({ cols: 8, rows: 4 })
    expect(gridSize(ICONS.bfly_b.rows)).toEqual({ cols: 8, rows: 4 })
    expect(gridSize(ICONS.sprout.rows)).toEqual({ cols: 8, rows: 6 })
    expect(gridSize(ICONS.vineh.rows)).toEqual({ cols: 16, rows: 6 })
    expect(gridSize(ICONS.vinec.rows)).toEqual({ cols: 12, rows: 12 })
    expect(gridSize(ICONS.egg.rows)).toEqual({ cols: 16, rows: 16 })
    expect(gridSize(ICONS.ghost.rows)).toEqual({ cols: 16, rows: 16 })
    for (const n of ['apple', 'ball', 'soap', 'cookie', 'fish', 'star', 'heart', 'leaf', 'flower', 'gift'] as const)
      expect(gridSize(ICONS[n].rows), n).toEqual({ cols: 8, rows: 8 })
  })

  it('isIconName rejects prototype members and unknown names', () => {
    expect(isIconName('apple')).toBe(true)
    expect(isIconName('constructor')).toBe(false)
    expect(isIconName('nope')).toBe(false)
  })

  it('treatIconDef maps treats and falls back to the gift box', () => {
    expect(treatIconDef('apple')).toBe(ICONS.apple)
    expect(treatIconDef('star')).toBe(ICONS.star)
    expect(treatIconDef('constructor')).toBe(ICONS.gift)
    expect(treatIconDef('')).toBe(ICONS.gift)
  })
})

describe('petFrame / composeSprite', () => {
  it('works for every Species x Stage x alive', () => {
    for (const species of SPECIES)
      for (const stage of STAGES)
        for (const alive of [true, false]) {
          const sprite = composeSprite(species, stage, 'happy', alive)
          expect(isRectangular(sprite.rows), `${species}/${stage}/${alive}`).toBe(true)
          expect(usedChars(sprite.rows).size).toBeGreaterThan(0)
          expectPaletteComplete(sprite.rows, sprite.palette, `${species}/${stage}/${alive}`)
          const expected = !alive ? ICONS.ghost.rows : stage === 'egg' ? ICONS.egg.rows : CAST[species].grid
          expect(sprite.rows).toBe(expected)
        }
  })

  it('scales by stage from the adult height and keeps the aspect', () => {
    const adult = petFrame({ species: 'bug', stage: 'adult', alive: true, px: 96 })
    expect(adult.height).toBe(96)
    expect(adult.width).toBe(Math.round((96 * 26) / 34))
    expect(petFrame({ species: 'bug', stage: 'baby', alive: true, px: 96 }).height).toBe(Math.round(96 * 0.7))
    expect(petFrame({ species: 'bug', stage: 'teen', alive: true, px: 96 }).height).toBe(Math.round(96 * 0.85))
    const egg = petFrame({ species: 'bug', stage: 'egg', alive: true, px: 96 })
    expect([egg.width, egg.height]).toEqual([Math.round(96 * SPRITE_STAGE_SCALE.egg), Math.round(96 * SPRITE_STAGE_SCALE.egg)])
    const ghost = petFrame({ species: 'bug', stage: 'baby', alive: false, px: 96 })
    expect([ghost.width, ghost.height]).toEqual([Math.round(96 * GHOST_SCALE), Math.round(96 * GHOST_SCALE)])
    expect(petFrame({ species: 'cow', stage: 'adult', alive: true }).height).toBe(DEFAULT_PET_PX)
    expect(petFrame({ species: 'cow', stage: 'adult', alive: true, variant: 'blink' }).rows).toBe(CAST.cow.variants.blink)
  })

  it('spriteSvg emits rects with a cols x rows viewBox', () => {
    const svg = spriteSvg(composeSprite('tanuki', 'adult', 'happy', true))
    expect(svg).toContain('<svg')
    expect(svg).toContain('<rect')
    expect(svg).toContain('viewBox="0 0 21 27"')
    expect(svg).not.toContain('#ff00ff')
    const padded = spriteSvg(composeSprite('tanuki', 'egg', 'happy', true), { pad: 2, background: '#a9d48e' })
    expect(padded).toContain('viewBox="0 0 20 20"')
    expect(padded).toContain('fill="#a9d48e"')
    expect(spriteSvgDataUrl(composeSprite('bee', 'teen', 'meh', false))).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
  })

  it('pixelBox follows the grid aspect', () => {
    expect(pixelBox(16, 4, 8, undefined, 16)).toEqual({ width: 64, height: 16 })
    expect(pixelBox(8, 6, 8, undefined, 32)).toEqual({ width: 43, height: 32 })
    expect(pixelBox(8, 8, 4)).toEqual({ width: 32, height: 32 })
    expect(pixelBox(16, 4, 8, 32)).toEqual({ width: 32, height: 8 })
  })
})

describe('components', () => {
  const render = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)

  it('PetSprite renders an <svg> for the egg, the ghost and every species (flipped)', () => {
    const egg = render(createElement(PetSprite, { species: 'elf', stage: 'egg', mood: 'happy', alive: true }))
    expect(egg).toMatch(/^<svg/)
    expect(egg).toContain('viewBox="0 0 16 16"')
    expect(egg).toContain('data-stage="egg"')
    expect(egg).toContain('aria-label="happy Elf egg"')

    const ghost = render(createElement(PetSprite, { species: 'elf', stage: 'adult', mood: 'sad', alive: false, px: 100 }))
    expect(ghost).toContain('data-alive="false"')
    expect(ghost).toContain('width="80"')
    expect(ghost).toContain('aria-label="ghost of a Elf"')

    for (const species of SPECIES) {
      const html = render(createElement(PetSprite, { species, stage: 'adult', mood: 'ecstatic', alive: true, flip: true, px: 96 }))
      expect(html, species).toMatch(/^<svg/)
      expect(html).toContain(`data-species="${species}"`)
      expect(html).toContain('data-mood="ecstatic"')
      expect(html).toContain('transform:scaleX(-1)')
      expect(html).toContain('height="96"')
      expect(html).toContain('<rect')
      expect(html).not.toContain('#ff00ff')
    }
    const unflipped = render(createElement(PetSprite, { species: 'oni', stage: 'teen', mood: 'meh', alive: true }))
    expect(unflipped).not.toContain('scaleX')
    expect(unflipped).toContain(`height="${Math.round(96 * 0.85)}"`)
  })

  it('PetSprite honours the deprecated size prop (px = size * 7) and custom titles', () => {
    const html = render(createElement(PetSprite, { species: 'cow', stage: 'adult', mood: 'happy', alive: true, size: 8, title: 'Mochi' }))
    expect(html).toContain('height="56"')
    expect(html).toContain('aria-label="Mochi"')
  })

  it('PixelIcon renders at px height with the grid aspect', () => {
    const grass = render(createElement(PixelIcon, { name: 'grass', px: 16 }))
    expect(grass).toContain('width="64"')
    expect(grass).toContain('height="16"')
    expect(grass).toContain('aria-hidden="true"')
    const apple = render(createElement(PixelIcon, { name: 'apple', px: 32, title: 'apple' }))
    expect(apple).toContain('width="32"')
    expect(apple).toContain('role="img"')
    expect(apple).toContain('shape-rendering="crispEdges"')
  })

  it('TreatIcon renders 8 * size px and falls back to the gift box', () => {
    const apple = render(createElement(TreatIcon, { kind: 'apple', size: 4 }))
    expect(apple).toContain('width="32"')
    expect(apple).toContain('fill="#e04f4f"')
    const gift = render(createElement(TreatIcon, { kind: 'mystery', size: 3 }))
    expect(gift).toContain('width="24"')
    expect(gift).toContain('fill="#f2d06b"')
    expect(gift).toContain('aria-label="mystery"')
  })

  it('species meta is available for every cast name', () => {
    const s: Species[] = [...CAST_NAMES]
    expect(s).toHaveLength(9)
  })
})
