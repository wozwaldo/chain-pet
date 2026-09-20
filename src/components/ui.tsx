// Cozy Garden primitives (design handoff, section 6a). Components only —
// shared class strings and pure helpers live in form.ts. Colors, radii and
// shadows are theme tokens from src/index.css (bg-card, text-ink, shadow-card ...).
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { EXPLORER_ACCOUNT_URL, EXPLORER_TX_URL } from '../stellar/config'
import { shortKey } from '../stellar/horizon'
import { stepValue } from './form'

/* ---------------------------------------------------------------- Card */

export type CardTone = 'default' | 'info' | 'pending'

const CARD_TONE: Record<CardTone, string> = {
  default: 'border border-line bg-card shadow-card',
  info: 'border border-info-border bg-info',
  pending: 'border-[1.5px] border-pending-border bg-pending',
}

export function Card({
  tone = 'default',
  className = '',
  children,
}: {
  tone?: CardTone
  className?: string
  children: ReactNode
}) {
  return <section className={`rounded-card px-4 py-3.5 ${CARD_TONE[tone]} ${className}`}>{children}</section>
}

/* -------------------------------------------------------------- Button */

export type ButtonTone = 'primary' | 'amber' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-bold transition select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-active active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0'

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary: 'rounded-full bg-primary text-white shadow-cta hover:bg-primary-hover',
  amber: 'rounded-full bg-(image:--gradient-amber) text-amber-ink shadow-amber hover:brightness-105',
  secondary: 'rounded-full border-[1.5px] border-line-strong bg-field text-ink hover:bg-header',
  ghost: 'rounded-full bg-transparent text-muted hover:bg-ink/5 hover:text-ink',
  danger: 'rounded-none bg-transparent text-danger hover:underline',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'px-5 py-3 text-sm',
  sm: 'px-[14px] py-2 text-xs',
}

// The amber CTA and the text-only danger link have one size in the design.
const BUTTON_FIXED: Partial<Record<ButtonTone, string>> = {
  amber: 'px-[13px] py-[7px] text-[11px]',
  // why: padding + equal negative margins keep the text link's layout box at 16px while the hit area grows to ~36px.
  danger: 'px-2 -mx-2 py-2.5 -my-2.5 text-xs',
}

export function Button({
  tone = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${BUTTON_TONE[tone]} ${BUTTON_FIXED[tone] ?? BUTTON_SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------- Chip */

export type ChipTone = 'amber' | 'terra' | 'green' | 'neutral'

const CHIP_TONE: Record<ChipTone, string> = {
  amber: 'bg-chip-amber text-chip-amber-ink',
  terra: 'bg-chip-terra text-chip-terra-ink',
  green: 'bg-chip-green text-chip-green-ink',
  neutral: 'bg-chip-neutral text-chip-neutral-ink',
}

export function Chip({
  tone = 'neutral',
  pulse = false,
  className = '',
  title,
  children,
}: {
  tone?: ChipTone
  /** Adds the soft breathing halo (.pulse-chip) for urgent countdowns. */
  pulse?: boolean
  className?: string
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-[11px] py-1.5 text-[11px] font-semibold ${CHIP_TONE[tone]} ${pulse ? 'pulse-chip' : ''} ${className}`}
    >
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- Tabs */

export interface TabItem<T extends string = string> {
  value: T
  label: ReactNode
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className = '',
  size = 'sm',
  disabled = false,
  'aria-label': ariaLabel,
}: {
  items: readonly TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** 'sm' = 12px / 6px (Rehome now · Set an heir); 'md' = 13px / 7px (History · Transfer · Gift). */
  size?: 'sm' | 'md'
  disabled?: boolean
  'aria-label'?: string
}) {
  const pad = size === 'md' ? 'py-[7px] text-[13px]' : 'py-1.5 text-xs'
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex gap-1 rounded-full bg-tabs p-1 ${className}`}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            className={`flex-1 rounded-full text-center transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tab-active disabled:cursor-not-allowed disabled:opacity-60 ${pad} ${
              active ? 'bg-tab-active font-bold text-tab-active-ink shadow-tab' : 'font-semibold text-muted hover:text-ink'
            }`}
            onClick={() => {
              if (!active) onChange(it.value)
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- Stepper */

const STEPPER_KEY =
  'flex w-[42px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-line-strong bg-field text-base font-bold text-ink transition select-none hover:bg-header lg:bg-field-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tab-active disabled:cursor-not-allowed disabled:opacity-40'

export function Stepper({
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  format,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Text for the value box, e.g. (v) => `${v} XLM`. Defaults to String(value). */
  format?: (value: number) => string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const canDec = !disabled && value > min
  const canInc = !disabled && value < max
  return (
    <div role="group" aria-label={ariaLabel} className={`flex min-h-[42px] items-stretch gap-2 lg:gap-[7px] ${className}`}>
      <button
        type="button"
        className={STEPPER_KEY}
        aria-label="Decrease"
        disabled={!canDec}
        onClick={() => onChange(stepValue(value, -1, step, min, max))}
      >
        −
      </button>
      <span
        aria-live="polite"
        className="flex flex-1 items-center justify-center rounded-lg border-[1.5px] border-pending-border bg-field font-mono text-xs font-bold text-ink tabular-nums lg:rounded-xl lg:border-line-mid"
      >
        {format ? format(value) : String(value)}
      </span>
      <button
        type="button"
        className={STEPPER_KEY}
        aria-label="Increase"
        disabled={!canInc}
        onClick={() => onChange(stepValue(value, 1, step, min, max))}
      >
        +
      </button>
    </div>
  )
}

/* -------------------------------------------------------- SectionTitle */

export function SectionTitle({
  icon,
  children,
  right,
  className = '',
}: {
  icon?: ReactNode
  children: ReactNode
  /** Mono 10px meta on the right, e.g. "45m old · 4 care ops". */
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <h2 className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-ink">
        {icon !== undefined && (
          <span aria-hidden className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        )}
        {children}
      </h2>
      {right !== undefined && (
        <span className="shrink-0 truncate font-mono text-[10px] font-semibold text-muted-2">{right}</span>
      )}
    </div>
  )
}

/* ------------------------------------------------------- Text helpers */

export function Why({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-normal text-muted ${className}`}>{children}</p>
}

export function ErrorBox({
  message,
  onRetry,
  className = '',
}: {
  message: string | null
  onRetry?: () => void
  className?: string
}) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`rounded-xl bg-chip-terra px-3 pt-2.5 pb-[13px] text-xs leading-normal text-chip-terra-ink ${className}`}
    >
      {message}
      {onRetry && (
        <Button tone="danger" className="ml-4 align-baseline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- Links */

export function TxLink({ hash, label = 'tx ↗', className = '' }: { hash: string; label?: string; className?: string }) {
  return (
    <a
      className={`inline-flex items-center rounded-full bg-txchip px-[9px] py-[3px] text-[11px] font-bold text-link no-underline transition hover:bg-txchip-hover ${className}`}
      href={`${EXPLORER_TX_URL}${hash}`}
      target="_blank"
      rel="noreferrer"
      title={hash}
    >
      {label}
    </a>
  )
}

export function AccountLink({
  address,
  className = '',
  chars = 5,
}: {
  address: string
  className?: string
  /** Characters kept on each side of the ellipsis. */
  chars?: number
}) {
  return (
    <a
      className={`font-mono text-[11px] whitespace-nowrap text-link no-underline hover:underline ${className}`}
      href={`${EXPLORER_ACCOUNT_URL}${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {shortKey(address, chars)}
    </a>
  )
}

/* --------------------------------------------------------------- Field */

export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-normal text-muted">{hint}</span>}
    </label>
  )
}
