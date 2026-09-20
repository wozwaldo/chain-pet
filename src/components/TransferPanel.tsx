// Rehome now / Set an heir (design 6a Transfer tab). Same ops as before:
// createClaimableBalance of the 1 PET1 token, optional "not before" predicate,
// and cancel = the sponsor claiming it back.
import { useState } from 'react'
import { cancelTransferOp, submitOps, transferOp, type Signer } from '../stellar/tx'
import { describeDuration } from '../pet/engine'
import type { PetRecord } from '../pet/types'
import { useAction } from './useAction'
import { AccountLink, Button, Card, ErrorBox, Field, Tabs, TxLink, Why, type TabItem } from './ui'
import { inputClass, isPublicKey } from './form'

type Mode = 'rehome' | 'heir'

const MODES: readonly TabItem<Mode>[] = [
  { value: 'rehome', label: 'Rehome now' },
  { value: 'heir', label: 'Set an heir' },
]

function defaultHeirDate(): string {
  const d = new Date(Date.now() + 30 * 24 * 3600 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "Jan 1 2027" for the pending row. */
function shortDate(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.getFullYear()}`
}

export function TransferPanel({
  address,
  record,
  now,
  sign,
  reload,
  canSign = true,
}: {
  address: string
  record: PetRecord
  now: number
  sign: Signer
  reload: () => Promise<void>
  /** false while Freighter is on the wrong network. */
  canSign?: boolean
}) {
  const [mode, setMode] = useState<Mode>('rehome')
  const [to, setTo] = useState('')
  const [when, setWhen] = useState(defaultHeirDate)
  const action = useAction(reload)
  const pending = record.pendingTransfer

  if (pending) {
    const after = pending.claimableAfter
    const locked = after !== undefined && after > now
    return (
      <div className="space-y-3 pt-1 lg:pt-1.5 lg:max-w-[470px]">
        <Card tone="pending" className="flex items-center gap-2 rounded-xl! px-3! py-2.5!">
          <span className="shrink-0 text-[11px] font-bold text-muted">{after !== undefined ? 'Heir' : 'Rehoming'}</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-ink">
            <AccountLink address={pending.to} chars={4} /> · {locked && after !== undefined ? `after ${shortDate(after)}` : 'claimable now'}
          </span>
          <span className="flex-1" />
          <Button
            tone="danger"
            disabled={action.anyBusy || !canSign || pending.sponsor !== address}
            onClick={() => action.run(() => submitOps(address, [cancelTransferOp(pending.balanceId)], sign))}
          >
            {action.busy ? 'Cancelling…' : 'Cancel'}
          </Button>
        </Card>
        <Why>
          A claimable balance holding this pet is waiting for <AccountLink address={pending.to} />
          {after !== undefined && <> and unlocks {locked ? `in ${describeDuration(after - now)}` : 'now'} ({new Date(after).toLocaleString()})</>}.
          You keep caring for it until they claim. You are also a claimant on that balance, so claiming it yourself cancels the transfer.
        </Why>
        {action.lastHash && <TxLink hash={action.lastHash} />}
        <ErrorBox message={action.error} />
      </div>
    )
  }

  const validTo = isPublicKey(to) && to.trim() !== address
  const whenMs = new Date(when).getTime()
  const validWhen = mode === 'rehome' || (Number.isFinite(whenMs) && whenMs > now + 60_000)

  return (
    <div className="pt-1 lg:pt-1.5 lg:max-w-[470px]">
      <Tabs items={MODES} value={mode} onChange={setMode} size="sm" disabled={action.busy} className="mb-3" aria-label="Transfer mode" />
      <Field label="New owner's address" hint="A testnet G… address. They claim the pet in Chain Pet.">
        <input className={inputClass} value={to} placeholder="G…" onChange={(e) => setTo(e.target.value.trim())} disabled={action.busy} />
      </Field>
      {mode === 'heir' && (
        <Field className="mt-3" label="Inheritable after" hint="Until then only you can care for it. Set minutes ahead for a demo.">
          <input className={inputClass} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={action.busy} />
        </Field>
      )}
      <Why className="mt-2">
        {mode === 'heir'
          ? 'Same claimable balance with a "not before" date: the heir cannot claim early, and you can cancel any time.'
          : 'Moves the PET token into a claimable balance. You stay a claimant until they claim it — take it back any time.'}
      </Why>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          className="w-full lg:w-[220px]"
          disabled={!validTo || !validWhen || action.anyBusy || !canSign}
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
          {action.busy ? 'Signing & confirming…' : mode === 'heir' ? 'Name heir' : 'Send pet'}
        </Button>
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      {action.busy && <Why className="mt-2">Sign in Freighter, then Horizon confirms in a few seconds…</Why>}
      <ErrorBox className="mt-3" message={action.error} />
    </div>
  )
}
