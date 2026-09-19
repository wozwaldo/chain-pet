import type { PendingClaim } from '../pet/chain'
import { describeDuration } from '../pet/engine'
import type { PetData } from '../pet/usePet'
import { claimOps, submitOps, type Signer } from '../stellar/tx'
import { useAction } from './useAction'
import { AccountLink, Button, Card, ErrorBox, TxLink, Why } from './ui'

export function ClaimBanner({
  address,
  claims,
  current,
  now,
  sign,
  reload,
  canSign = true,
}: {
  address: string
  claims: PendingClaim[]
  /** The pet this account already has, if any. */
  current: PetData | null
  now: number
  sign: Signer
  reload: () => Promise<void>
  /** false while Freighter is on the wrong network. */
  canSign?: boolean
}) {
  const action = useAction(reload)
  // why: chain.ts resolves exactly one pet per account (a held token wins), so claiming a
  // second pet would hide the first one for good. The only claim allowed while this account
  // already has a pet is the issuer taking its own pet back.
  const canClaim = (c: PendingClaim) => current === null || (current.relation === 'issuer-not-owner' && c.issuer === current.record.issuer)
  const blockedNote =
    current?.relation === 'owner'
      ? 'This account already has a pet; transfer it first.'
      : 'This account hatched a pet that lives elsewhere, so it cannot adopt another.'
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
              {canClaim(c) ? (
                <Button
                  disabled={locked || action.anyBusy || !canSign}
                  onClick={() => action.run(() => submitOps(address, claimOps(c.issuer, address, c.transfer.balanceId, c.transfer.sponsor), sign))}
                >
                  {action.busy ? 'Signing & confirming…' : locked ? 'Locked' : 'Claim'}
                </Button>
              ) : (
                <span className="text-xs text-stone-500">{blockedNote}</span>
              )}
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
