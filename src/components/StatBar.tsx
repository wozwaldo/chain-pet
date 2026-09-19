/* eslint-disable react-refresh/only-export-components -- this file intentionally exports data/helpers next to its component; editing it triggers a full HMR reload instead of a fast refresh */
// 0..100 rounded stat bar. Tailwind only; the outline colour matches the
// sprites' #2b2140 so the whole card reads as one pixel-toy.
import type { ReactNode } from 'react'

export type StatTone = 'good' | 'warn' | 'bad' | 'auto'

export interface StatBarProps {
  label: string
  /** 0..100; anything outside is clamped. */
  value: number
  /** Emoji / short string or any node (e.g. <TreatIcon />). */
  icon?: ReactNode
  /** 'auto' (default) picks green >= 60, amber >= 30, red otherwise. */
  tone?: StatTone
  /**
   * For stats where HIGH is bad (hunger: 100 = starving). Only the auto tone
   * is inverted; the bar still fills to `value` so the number reads honestly.
   */
  invert?: boolean
}

const FILL: Record<Exclude<StatTone, 'auto'>, string> = {
  good: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
}

export function resolveTone(value: number, tone: StatTone = 'auto', invert = false): Exclude<StatTone, 'auto'> {
  if (tone !== 'auto') return tone
  const v = invert ? 100 - value : value
  return v >= 60 ? 'good' : v >= 30 ? 'warn' : 'bad'
}

export function StatBar({ label, value, icon, tone = 'auto', invert = false }: StatBarProps) {
  const v = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
  const t = resolveTone(v, tone, invert)
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon !== undefined && (
        <span aria-hidden className="flex w-6 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      <span className="w-20 shrink-0 truncate font-semibold">{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        className="h-4 flex-1 overflow-hidden rounded-full border-2 border-[#2b2140] bg-white/70"
      >
        <div
          className={`h-full rounded-full ${FILL[t]} transition-[width] duration-500 ease-out`}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-stone-500">{v}</span>
    </div>
  )
}
