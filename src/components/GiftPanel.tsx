import { useEffect, useState } from 'react'
import { loadPetByAccount } from '../pet/chain'
import { deriveState } from '../pet/engine'
import { TREAT_KINDS, type PetRecord, type TreatKind } from '../pet/types'
import { TIME_SCALE } from '../stellar/config'
import { explainHorizonError, giftMemo, giftOp, MAX_GIFT_XLM, MIN_GIFT_XLM, submitOps, type Signer } from '../stellar/tx'
import { PetSprite } from './PetSprite'
import { TreatIcon } from './TreatIcon'
import { useAction } from './useAction'
import { AccountLink, Button, ErrorBox, Field, TxLink, Why } from './ui'
import { inputClass, isPublicKey } from './form'

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
  const [amount, setAmount] = useState('0.5')
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

  const amt = Number(amount)
  const validAmount = Number.isFinite(amt) && amt >= Number(MIN_GIFT_XLM) && amt <= Number(MAX_GIFT_XLM)
  const dest = target?.record ? target.record.owner : to
  // why: the pasted key may be a pet's birth address whose current owner is this account.
  const selfTarget = dest === address
  const preview = target?.record ? deriveState(target.record, now, TIME_SCALE) : null

  return (
    <div className="space-y-3">
      <Field label="Friend's pet (owner or birth address)" hint="Paste the address of a friend who has a Chain Pet.">
        <input className={inputClass} value={to} placeholder="G…" onChange={(e) => setTo(e.target.value.trim())} disabled={action.busy} />
      </Field>
      {validTo && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-stone-300 p-2 text-sm">
          {looking && <span className="text-stone-500">Looking up their pet…</span>}
          {target?.error && (
            <span className="text-red-700">
              Could not look up that address ({target.error}).{' '}
              <button type="button" className="underline" onClick={retry}>
                Retry
              </button>
            </span>
          )}
          {target && !target.record && !target.error && (
            <span className="text-stone-500">No Chain Pet found at that address. The treat would still be a plain payment.</span>
          )}
          {preview && target?.record && (
            <>
              <PetSprite species={target.record.species} stage={preview.stage} mood={preview.mood} alive={preview.alive} size={3} />
              <div>
                <div className="font-bold">{target.record.name}</div>
                <div className="text-xs text-stone-500">
                  {selfTarget ? (
                    'That is your own pet — send treats to a friend.'
                  ) : (
                    <>
                      {preview.statusLine} · lives with <AccountLink address={target.record.owner} />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <div>
        <span className="mb-1 block text-sm font-semibold">Treat</span>
        <div className="flex gap-2">
          {TREAT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2 text-xs font-bold ${
                kind === k ? 'border-[#2b2140] bg-amber-100 shadow-[2px_2px_0_#2b2140]' : 'border-transparent hover:bg-stone-100'
              }`}
            >
              <TreatIcon kind={k} size={4} />
              {k}
            </button>
          ))}
        </div>
      </div>
      <Field label="Amount (XLM)" hint={`Between ${MIN_GIFT_XLM} and ${MAX_GIFT_XLM} XLM. Goes to the pet's owner.`}>
        <input className={inputClass} type="number" step="0.1" min={MIN_GIFT_XLM} max={MAX_GIFT_XLM} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={action.busy} />
      </Field>
      <div className="flex items-center gap-3">
        <Button
          disabled={!validTo || !validAmount || selfTarget || action.anyBusy || looking || !!target?.error || !canSign}
          onClick={() => action.run(() => submitOps(address, [giftOp(dest, amt.toFixed(7))], sign, { memo: giftMemo(kind) }))}
        >
          {action.busy ? 'Signing & confirming…' : 'Send treat'}
        </Button>
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      <Why>A real XLM payment with text memo treat:{kind}. Their pet's happiness refreshes from the payment's ledger time.</Why>
      <ErrorBox message={action.error} />
    </div>
  )
}
