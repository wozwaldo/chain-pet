import { useCallback, useState, useSyncExternalStore } from 'react'

// One lock shared by every panel. why: one account = one sequence number, so two
// txs built at the same time (Feed while Claim waits in Freighter) both load the
// same sequence and the second one fails with tx_bad_seq.
let locked = false
const subs = new Set<() => void>()
const txLock = {
  get: () => locked,
  set(v: boolean) {
    locked = v
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

/** True while any panel has a transaction in flight (build, sign, submit, reload). */
export function useAnyBusy(): boolean {
  return useSyncExternalStore(txLock.subscribe, txLock.get)
}

/** Wraps one signed transaction: busy flag, readable error, last tx hash. */
export function useAction(onSuccess?: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastHash, setLastHash] = useState<string | null>(null)
  const anyBusy = useAnyBusy()

  const run = useCallback(
    async (fn: () => Promise<{ hash: string }>) => {
      // Re-entrancy guard: a click that lands while another tx is in flight is ignored.
      if (txLock.get()) return null
      txLock.set(true)
      setBusy(true)
      setError(null)
      try {
        const res = await fn()
        setLastHash(res.hash)
        await onSuccess?.()
        return res
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return null
      } finally {
        setBusy(false)
        txLock.set(false)
      }
    },
    [onSuccess],
  )

  const clear = useCallback(() => {
    setError(null)
    setLastHash(null)
  }, [])

  return { busy, anyBusy, error, lastHash, run, clear }
}
