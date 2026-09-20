// Send a treat (design 6a Gift tab): friend lookup with preview, four treat
// tiles, an XLM stepper, one real payment with a `treat:<kind>` memo.
import { useEffect, useState } from 'react'
import { PixelIcon } from '../art/PixelIcon'
import { loadPetByAccount } from '../pet/chain'
import { deriveState } from '../pet/engine'
import { TREAT_KINDS, type PetRecord, type TreatKind } from '../pet/types'
import { TIME_SCALE } from '../stellar/config'
import { explainHorizonError, giftMemo, giftOp, MAX_GIFT_XLM, MIN_GIFT_XLM, submitOps, type Signer } from '../stellar/tx'
import { PetSprite } from './PetSprite'
import { useAction } from './useAction'
import { AccountLink, Button, ErrorBox, Field, Stepper, TxLink, Why } from './ui'
import { inputClass, isPublicKey } from './form'

const TREAT_LABEL: Record<TreatKind, string> = { apple: 'Apple', cookie: 'Cookie', fish: 'Fish', star: 'Star' }
const MIN_XLM = Number(MIN_GIFT_XLM)
const MAX_XLM = Number(MAX_GIFT_XLM)

export function GiftPanel({
  address,
  now,
  sign,
  reload,
  canSign = true,
}: {
  address: string
  now: number
  sign: Signer
  reload: () => Promise<void>
  /** false while Freighter is on the wrong network. */
  canSign?: boolean
}) {
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<TreatKind>('apple')
  const [amount, setAmount] = useState(0.5)
  // why: a Horizon error must not look like "no pet here": that would silently redirect the
  // payment to the pasted (maybe birth) address instead of the pet's current owner.
  const [lookup, setLookup] = useState<{ address: string; record: PetRecord | null; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const action = useAction(reload)

  const validTo = isPublicKey(to) && to !== address
  useEffect(() => {
    if (!validTo) return
    let cancelled = false
    loadPetByAccount(to)
      .then((r) => {
        if (!cancelled) setLookup({ address: to, record: r ? r.record : null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLookup({ address: to, record: null, error: explainHorizonError(err) })
      })
    return () => {
      cancelled = true
    }
  }, [to, validTo, attempt])

  const retry = () => {
    setLookup(null)
    setAttempt((n) => n + 1)
  }

  const target = validTo && lookup && lookup.address === to ? lookup : null
  const looking = validTo && target === null

  const validAmount = Number.isFinite(amount) && amount >= MIN_XLM && amount <= MAX_XLM
  const dest = target?.record ? target.record.owner : to
  // why: the pasted key may be a pet's birth address whose current owner is this account.
  const selfTarget = dest === address
  const preview = target?.record ? deriveState(target.record, now, TIME_SCALE) : null

  const tile = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-1 rounded-[14px] pt-[9px] pb-[7px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-active disabled:cursor-not-allowed disabled:opacity-50 lg:w-16 lg:flex-none lg:gap-[3px] lg:pt-2 lg:pb-1.5 ${
      active ? 'border-2 border-treat-active-border bg-treat-active' : 'border-[1.5px] border-line-soft bg-field hover:bg-header'
    }`

  return (
    <div className="pt-1 lg:pt-1.5 lg:max-w-[470px]">
      <Field label="Friend's pet (owner or birth address)" hint={validTo ? undefined : 'Paste the address of a friend who has a Chain Pet.'}>
        <input className={inputClass} value={to} placeholder="G…" onChange={(e) => setTo(e.target.value.trim())} disabled={action.busy} />
      </Field>
      {validTo && (
        <div className="mt-2 flex min-h-[52px] items-center gap-3 rounded-xl border-2 border-dashed border-dash px-3 py-2 text-[13px]">
          {looking && <span className="text-muted">Looking up their pet…</span>}
          {target?.error && (
            <span className="text-danger">
              Could not look up that address ({target.error}).{' '}
              <Button tone="danger" onClick={retry}>
                Retry
              </Button>
            </span>
          )}
          {target && !target.record && !target.error && (
            <span className="text-muted">No Chain Pet found at that address. The treat would still be a plain payment.</span>
          )}
          {preview && target?.record && (
            <>
              <span className="flex w-10 shrink-0 items-end justify-center">
                <PetSprite species={target.record.species} stage={preview.stage} mood={preview.mood} alive={preview.alive} px={40} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-ink">{target.record.name}</span>
                <span className="block text-xs text-muted">
                  {selfTarget ? (
                    'That is your own pet — send treats to a friend.'
                  ) : (
                    <>
                      {preview.statusLine} · lives with <AccountLink address={target.record.owner} />
                    </>
                  )}
                </span>
              </span>
            </>
          )}
        </div>
      )}

      <div className="mt-3 text-xs font-semibold text-muted">
        <span className="lg:hidden">Treat</span>
        <span className="hidden lg:inline">Treat · amount</span>
      </div>
      <div className="mt-1.5 lg:flex lg:items-stretch lg:gap-[7px]">
        <div className="flex gap-2 lg:gap-[7px]" role="radiogroup" aria-label="Treat">
          {TREAT_KINDS.map((k) => {
            const active = kind === k
            return (
              <button key={k} type="button" role="radio" aria-checked={active} className={tile(active)} disabled={action.busy} onClick={() => setKind(k)}>
                <PixelIcon name={k} px={24} />
                <span className={`text-[11px] lg:text-[10px] ${active ? 'font-bold text-ink' : 'font-semibold text-muted-2'}`}>{TREAT_LABEL[k]}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 lg:mt-0 lg:min-w-0 lg:flex-1">
          <div className="mb-1.5 text-xs font-semibold text-muted lg:hidden">Amount</div>
          <Stepper
            value={amount}
            onChange={setAmount}
            min={MIN_XLM}
            max={MAX_XLM}
            step={0.1}
            format={(v) => `${v} XLM`}
            disabled={action.busy}
            aria-label="Amount in XLM"
            className="lg:h-full"
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {MIN_GIFT_XLM}–{MAX_GIFT_XLM} XLM · goes to the pet's owner.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          className="w-full lg:w-[220px]"
          disabled={!validTo || !validAmount || selfTarget || action.anyBusy || looking || !!target?.error || !canSign}
          onClick={() => action.run(() => submitOps(address, [giftOp(dest, amount.toFixed(7))], sign, { memo: giftMemo(kind) }))}
        >
          {action.busy ? 'Signing & confirming…' : 'Send treat'}
        </Button>
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      <Why className="mt-2">
        A real payment with memo <span className="font-mono text-[11px]">treat:{kind}</span> — their pet's happiness refreshes from its ledger time.
      </Why>
      {action.busy && <Why className="mt-2">Sign in Freighter, then Horizon confirms in a few seconds…</Why>}
      <ErrorBox className="mt-3" message={action.error} />
    </div>
  )
}
