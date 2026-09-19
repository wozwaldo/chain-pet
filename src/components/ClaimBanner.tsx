import type { PendingClaim } from '../pet/chain'
import { describeDuration } from '../pet/engine'
import { claimOps, submitOps, type Signer } from '../stellar/tx'
import { useAction } from './useAction'
import { AccountLink, Button, Card, ErrorBox, TxLink, Why } from './ui'

export function ClaimBanner({
  address,
  claims,
  now,
  sign,
  reload,
}: {
  address: string
  claims: PendingClaim[]
  now: number
  sign: Signer
  reload: () => Promise<void>
}) {
  const action = useAction(reload)
  return (
    <Card className="border-sky-700 bg-sky-50">
      <h2 className="text-base font-black">🎁 A pet is waiting for you</h2>
      <ul className="mt-2 space-y-2">
        {claims.map((c) => {
          const after = c.transfer.claimableAfter
          const locked = after !== undefined && after > now
          return (
            <li key={c.transfer.balanceId} className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                From <AccountLink address={c.transfer.sponsor} /> (pet born on <AccountLink address={c.issuer} />)
                {locked && <span className="ml-1 text-stone-500">· unlocks in {describeDuration(after - now)}</span>}
              </span>
              <Button
                disabled={locked || action.busy}
                onClick={() => action.run(() => submitOps(address, claimOps(c.issuer, address, c.transfer.balanceId, c.transfer.sponsor), sign))}
              >
                {action.busy ? 'Waiting for Freighter…' : locked ? 'Locked' : 'Claim'}
              </Button>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex items-center gap-3">
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      <div className="mt-2">
        <Why>One tx: trust the PET1 asset, claim the balance, and record pet.prev so the lineage stays linked.</Why>
      </div>
      <ErrorBox message={action.error} />
    </Card>
  )
}
