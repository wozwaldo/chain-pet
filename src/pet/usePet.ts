import { useCallback, useEffect, useRef, useState } from 'react'
import { explainHorizonError } from '../stellar/tx'
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

/**
 * Reads the connected account's pet and any pets in flight to it.
 * Re-reads when the tab regains focus and on a slow poll, because chain state
 * changes from other tabs and accounts (a claim, a treat, a cancelled transfer).
 */
export function usePet(address: string | null, pollMs = 30_000) {
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
        setFailure({ address, message: explainHorizonError(err) })
      },
    )
  }, [address])

  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  useEffect(() => {
    if (!address) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const id = setInterval(onVisible, pollMs)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(id)
    }
  }, [address, reload, pollMs])

  // Snapshots are keyed by address so switching accounts never shows stale data.
  const current = snap && snap.address === address ? snap : null
  const failed = failure && failure.address === address ? failure.message : null
  return {
    data: current?.data ?? null,
    claims: current?.claims ?? [],
    loaded: current !== null,
    /** The initial read failed: nothing to show. */
    error: current === null ? failed : null,
    /** A background refresh failed but the last good snapshot is still shown. */
    staleError: current !== null ? failed : null,
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
