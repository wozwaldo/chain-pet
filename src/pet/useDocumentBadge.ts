import { useEffect } from 'react'
import { composeSprite, spriteSvgDataUrl, type ComposedSprite } from '../components/spriteGrid'
import { isTransparent } from '../components/pixel'
import type { Mood, PetRecord, PetState, Species, Stage } from './types'

const DEFAULT_TITLE = 'Chain Pet'
const DEFAULT_ICON = '/favicon.svg'
const MOOD_EMOJI: Record<Mood, string> = { ecstatic: '😸', happy: '🙂', meh: '😐', sad: '😢', miserable: '😭' }

/** "🍙 Mochi · Starving! Feed me." */
export function badgeTitle(name: string, state: PetState): string {
  const emoji = !state.alive
    ? '🪦'
    : state.stage === 'egg'
      ? '🥚'
      : state.hunger >= 80
        ? '🍙'
        : state.happiness <= 20
          ? '🎾'
          : state.cleanliness <= 20
            ? '🫧'
            : MOOD_EMOJI[state.mood]
  return `${emoji} ${name} · ${state.statusLine}`
}

/** PNG via canvas (Safari ignores SVG favicons); null where canvas is unavailable. */
function pngDataUrl(sprite: ComposedSprite, px: number): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = px
    canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const cols = sprite.rows[0]?.length ?? 1
    const cell = px / cols
    sprite.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        if (isTransparent(ch)) continue
        ctx.fillStyle = sprite.palette[ch] ?? '#ff00ff'
        ctx.fillRect(Math.round(x * cell), Math.round(y * cell), Math.ceil(cell), Math.ceil(cell))
      }
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function iconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  return link
}

/** Mirrors the pet's mood into the tab title and favicon, so it lives in the tab bar too. */
export function useDocumentBadge(record: PetRecord | null, state: PetState | null) {
  const title = record && state ? badgeTitle(record.name, state) : DEFAULT_TITLE
  const species: Species | null = record ? record.species : null
  const stage: Stage | null = state ? state.stage : null
  const mood: Mood | null = state ? state.mood : null
  const alive = state ? state.alive : true

  useEffect(() => {
    document.title = title
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title])

  useEffect(() => {
    if (!species || !stage || !mood) return
    const sprite = composeSprite(species, stage, mood, alive)
    const href = pngDataUrl(sprite, 64) ?? spriteSvgDataUrl(sprite)
    const link = iconLink()
    link.type = href.startsWith('data:image/png') ? 'image/png' : 'image/svg+xml'
    link.href = href
    return () => {
      link.type = 'image/svg+xml'
      link.href = DEFAULT_ICON
    }
  }, [species, stage, mood, alive])
}
