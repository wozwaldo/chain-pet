// Shared form styling + tiny pure helpers. Kept in a .ts file so the .tsx
// components stay component-only (react-refresh rule).

// Cozy Garden field: white, 1.5px line, 12px radius, 11px 13px padding.
// Focus = the same opaque 2px outline the buttons use (a 40% ring was 1.6:1,
// invisible); no outline-none so the UA ring also survives forced-colors mode.
const FIELD_BASE =
  'w-full rounded-xl border-[1.5px] border-line-strong bg-field px-[13px] py-[11px] text-ink placeholder:text-placeholder focus-visible:border-tab-active focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tab-active disabled:cursor-not-allowed disabled:opacity-50'

/** Addresses, hashes, amounts: mono, 12px from lg up (the design's rule for machine values).
 *  Below lg the font is 16px: iOS Safari zooms the page when a focused input is < 16px. Keep it. */
export const inputClass = `${FIELD_BASE} font-mono text-[16px]/5 lg:text-xs`

/** Prose values such as a pet's name: Outfit, 14px from lg up; 16px below lg for the same iOS zoom rule. */
export const inputClassSans = `${FIELD_BASE} font-sans text-[16px]/5 lg:text-sm`

export function isPublicKey(s: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(s.trim())
}

/**
 * Nudge `value` by one `step` in `dir`, clamped to [min, max], without float
 * noise (0.5 + 0.1 is 0.6, not 0.6000000000000001). Used by <Stepper>.
 */
export function stepValue(value: number, dir: 1 | -1, step: number, min: number, max: number): number {
  const next = Number((value + dir * step).toFixed(countDecimals(step)))
  return Math.min(max, Math.max(min, next))
}

function countDecimals(n: number): number {
  const s = String(n)
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}
