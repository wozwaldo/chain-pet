import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPendingClaimsFor, loadPetByAccount, type PendingClaim, type PetRelation } from './chain'
import type { PetRecord } from './types'

export interface PetData {
  record: PetRecord
  relation: PetRelation
}

interface Snapshot {
  address: string
  data: PetData | null
  claims: PendingClaim[]
}

/** Reads the connected account's pet and any pets in flight to it. */
export function usePet(address: string | null) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [failure, setFailure] = useState<{ address: string; message: string } | null>(null)
  const seq = useRef(0)

  const reload = useCallback((): Promise<void> => {
    if (!address) return Promise.resolve()
    const my = ++seq.current
    // why: both are Horizon reads; the pet is the account's data + token, the
    // claims are claimable balances naming this account as claimant.
    return Promise.all([loadPetByAccount(address), loadPendingClaimsFor(address)]).then(
      ([pet, pending]) => {
        if (my !== seq.current) return
        setSnap({ address, data: pet, claims: pending })
        setFailure(null)
      },
      (err: unknown) => {
        if (my !== seq.current) return
        setFailure({ address, message: err instanceof Error ? err.message : 'Could not read the pet from Horizon' })
      },
    )
  }, [address])

  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  // Snapshots are keyed by address so switching accounts never shows stale data.
  const current = snap && snap.address === address ? snap : null
  return {
    data: current?.data ?? null,
    claims: current?.claims ?? [],
    loaded: current !== null,
    error: failure && failure.address === address ? failure.message : null,
    reload,
  }
}

/** A ticking clock so derived state re-renders. Not a game timer: state is derived from ledger times. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
