import { useEffect, useState } from 'react'
import { loadPetByAccount } from '../pet/chain'
import { deriveState } from '../pet/engine'
import { TREAT_KINDS, type PetRecord, type TreatKind } from '../pet/types'
import { TIME_SCALE } from '../stellar/config'
import { giftMemo, giftOp, MAX_GIFT_XLM, MIN_GIFT_XLM, submitOps, type Signer } from '../stellar/tx'
import { PetSprite } from './PetSprite'
import { TreatIcon } from './TreatIcon'
import { useAction } from './useAction'
import { AccountLink, Button, ErrorBox, Field, TxLink, Why } from './ui'
import { inputClass, isPublicKey } from './form'

export function GiftPanel({ address, now, sign, reload }: { address: string; now: number; sign: Signer; reload: () => Promise<void> }) {
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<TreatKind>('apple')
  const [amount, setAmount] = useState('0.5')
  const [lookup, setLookup] = useState<{ address: string; record: PetRecord | null } | null>(null)
  const action = useAction(reload)

  const validTo = isPublicKey(to) && to !== address
  useEffect(() => {
    if (!validTo) return
    let cancelled = false
    loadPetByAccount(to)
      .then((r) => {
        if (!cancelled) setLookup({ address: to, record: r ? r.record : null })
      })
      .catch(() => {
        if (!cancelled) setLookup({ address: to, record: null })
      })
    return () => {
      cancelled = true
    }
  }, [to, validTo])

  const target = validTo && lookup && lookup.address === to ? lookup : null
  const looking = validTo && target === null

  const amt = Number(amount)
  const validAmount = Number.isFinite(amt) && amt >= Number(MIN_GIFT_XLM) && amt <= Number(MAX_GIFT_XLM)
  const dest = target?.record ? target.record.owner : to
  const preview = target?.record ? deriveState(target.record, now, TIME_SCALE) : null

  return (
    <div className="space-y-3">
      <Field label="Friend's pet (owner or birth address)" hint="Paste the address of a friend who has a Chain Pet.">
        <input className={inputClass} value={to} placeholder="G…" onChange={(e) => setTo(e.target.value.trim())} disabled={action.busy} />
      </Field>
      {validTo && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-stone-300 p-2 text-sm">
          {looking && <span className="text-stone-500">Looking up their pet…</span>}
          {target && !target.record && <span className="text-stone-500">No Chain Pet found at that address. The treat would still be a plain payment.</span>}
          {preview && target?.record && (
            <>
              <PetSprite species={target.record.species} stage={preview.stage} mood={preview.mood} alive={preview.alive} size={3} />
              <div>
                <div className="font-bold">{target.record.name}</div>
                <div className="text-xs text-stone-500">
                  {preview.statusLine} · lives with <AccountLink address={target.record.owner} />
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
          disabled={!validTo || !validAmount || action.busy || looking}
          onClick={() => action.run(() => submitOps(address, [giftOp(dest, amt.toFixed(7))], sign, { memo: giftMemo(kind) }))}
        >
          {action.busy ? 'Waiting for Freighter…' : 'Send treat'}
        </Button>
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      <Why>A real XLM payment with text memo treat:{kind}. Their pet's happiness refreshes from the payment's ledger time.</Why>
      <ErrorBox message={action.error} />
    </div>
  )
}
