// 0..100 stat bar in the Cozy Garden style (design 6a "Vitals" card):
// [label 60px] [sliced pill track] [mono value 34px]. The fill turns terracotta
// when the effective value drops under 60; the slice overlay paints card-bg
// gaps every 8px so the bar reads as pixel segments.
import type { CSSProperties, ReactNode } from 'react'

export type StatTone = 'good' | 'warn' | 'bad' | 'auto'

export interface StatBarProps {
  label: string
  /** 0..100; anything outside is clamped. */
  value: number
  /** Accepted for API compatibility; the garden design draws no icon in the row. */
  icon?: ReactNode
  /** 'auto' (default) turns the bar low (terracotta) under 60; 'bad' forces it, 'good'/'warn' keep green. */
  tone?: StatTone
  /**
   * For stats where HIGH is bad (hunger: 100 = starving). Only the auto tone
   * is inverted; the bar still fills to `value` so the number reads honestly.
   */
  invert?: boolean
  className?: string
}

// 6a paints Clean 54 terracotta and Hunger 72 green; 60 is also the pre-port 'good' boundary.
const LOW_BELOW = 60

const SLICES: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 8px, var(--color-card) 8px 10px)',
}

function isLow(value: number, tone: StatTone, invert: boolean): boolean {
  if (tone !== 'auto') return tone === 'bad'
  return (invert ? 100 - value : value) < LOW_BELOW
}

export function StatBar(props: StatBarProps) {
  const { label, value, tone = 'auto', invert = false, className = '' } = props
  const v = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
  const low = isLow(v, tone, invert)
  return (
    <div className={`grid grid-cols-[60px_1fr_34px] items-center gap-2.5 ${className}`}>
      <span className="truncate text-[13px] font-semibold text-ink">{label}</span>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        className="relative block h-[11px] overflow-hidden rounded-full bg-track"
      >
        <span
          className={`absolute inset-0 ${low ? 'bg-low' : 'bg-fill'} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
          style={{ width: `${v}%` }}
        />
        <span aria-hidden className="absolute inset-0" style={SLICES} />
      </span>
      <span className="text-right font-mono text-xs font-bold tabular-nums text-ink">{v}</span>
    </div>
  )
}
