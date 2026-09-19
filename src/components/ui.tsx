import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { EXPLORER_ACCOUNT_URL, EXPLORER_TX_URL } from '../stellar/config'
import { shortKey } from '../stellar/horizon'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border-2 border-[#2b2140] bg-white p-4 shadow-[4px_4px_0_#2b2140] ${className}`}>
      {children}
    </section>
  )
}

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost'
const TONES: Record<Tone, string> = {
  primary: 'bg-pink-400 text-white hover:bg-pink-500',
  secondary: 'bg-amber-200 text-[#2b2140] hover:bg-amber-300',
  danger: 'bg-rose-200 text-rose-800 hover:bg-rose-300',
  ghost: 'bg-transparent text-[#2b2140] hover:bg-stone-100',
}

export function Button({
  tone = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`rounded-xl border-2 border-[#2b2140] px-4 py-2 text-sm font-bold shadow-[2px_2px_0_#2b2140] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Why({ children }: { children: ReactNode }) {
  return <p className="text-xs text-stone-500">💡 {children}</p>
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>
}

export function TxLink({ hash, label = 'View transaction' }: { hash: string; label?: string }) {
  return (
    <a
      className="text-xs font-semibold text-sky-700 underline decoration-dotted hover:text-sky-900"
      href={`${EXPLORER_TX_URL}${hash}`}
      target="_blank"
      rel="noreferrer"
    >
      {label} ↗
    </a>
  )
}

export function AccountLink({ address, className = '' }: { address: string; className?: string }) {
  return (
    <a
      className={`font-mono text-xs text-sky-700 underline decoration-dotted hover:text-sky-900 ${className}`}
      href={`${EXPLORER_ACCOUNT_URL}${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {shortKey(address, 5)}
    </a>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  )
}
