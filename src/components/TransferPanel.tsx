import { useState } from 'react'
import { cancelTransferOp, submitOps, transferOp, type Signer } from '../stellar/tx'
import { describeDuration } from '../pet/engine'
import type { PetRecord } from '../pet/types'
import { useAction } from './useAction'
import { AccountLink, Button, ErrorBox, Field, TxLink, Why } from './ui'
import { inputClass, isPublicKey } from './form'

function defaultHeirDate(): string {
  const d = new Date(Date.now() + 30 * 24 * 3600 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TransferPanel({
  address,
  record,
  now,
  sign,
  reload,
}: {
  address: string
  record: PetRecord
  now: number
  sign: Signer
  reload: () => Promise<void>
}) {
  const [mode, setMode] = useState<'rehome' | 'heir'>('rehome')
  const [to, setTo] = useState('')
  const [when, setWhen] = useState(defaultHeirDate)
  const action = useAction(reload)
  const pending = record.pendingTransfer

  if (pending) {
    const after = pending.claimableAfter
    const locked = after !== undefined && after > now
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-stone-500">{after ? 'Heir set' : 'Rehoming in progress'}</h3>
        <p className="text-sm">
          A claimable balance holding this pet is waiting for <AccountLink address={pending.to} />
          {after && (
            <>
              {' '}
              and unlocks {locked ? `in ${describeDuration(after - now)}` : 'now'} ({new Date(after).toLocaleString()})
            </>
          )}
          . You keep caring for it until they claim.
        </p>
        <div className="flex items-center gap-3">
          <Button tone="danger" disabled={action.busy || pending.sponsor !== address} onClick={() => action.run(() => submitOps(address, [cancelTransferOp(pending.balanceId)], sign))}>
            {action.busy ? 'Waiting for Freighter…' : 'Cancel transfer'}
          </Button>
          {action.lastHash && <TxLink hash={action.lastHash} />}
        </div>
        <Why>You are also a claimant on that balance, so claiming it yourself cancels the transfer.</Why>
        <ErrorBox message={action.error} />
      </div>
    )
  }

  const validTo = isPublicKey(to) && to.trim() !== address
  const whenMs = new Date(when).getTime()
  const validWhen = mode === 'rehome' || (Number.isFinite(whenMs) && whenMs > now + 60_000)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button tone={mode === 'rehome' ? 'secondary' : 'ghost'} onClick={() => setMode('rehome')}>
          Rehome now
        </Button>
        <Button tone={mode === 'heir' ? 'secondary' : 'ghost'} onClick={() => setMode('heir')}>
          Set an heir
        </Button>
      </div>
      <Field label="New owner's Stellar address" hint="A testnet G… address. They will need to claim the pet in Chain Pet.">
        <input className={inputClass} value={to} placeholder="G…" onChange={(e) => setTo(e.target.value.trim())} disabled={action.busy} />
      </Field>
      {mode === 'heir' && (
        <Field label="Inheritable after" hint="Until then only you can care for it. Set minutes ahead for a demo.">
          <input className={inputClass} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={action.busy} />
        </Field>
      )}
      <div className="flex items-center gap-3">
        <Button
          disabled={!validTo || !validWhen || action.busy}
          onClick={() =>
            action.run(() =>
              submitOps(
                address,
                [transferOp(record.issuer, address, to, mode === 'heir' ? { claimableAfter: new Date(whenMs) } : undefined)],
                sign,
              ),
            )
          }
        >
          {action.busy ? 'Waiting for Freighter…' : mode === 'heir' ? 'Name heir' : 'Send pet'}
        </Button>
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      <Why>
        {mode === 'heir'
          ? 'createClaimableBalance with a "not before" predicate: the heir cannot claim early, and you can cancel any time.'
          : 'createClaimableBalance of the 1 PET1 token. The pet leaves your account only when they claim it.'}
      </Why>
      <ErrorBox message={action.error} />
    </div>
  )
}
