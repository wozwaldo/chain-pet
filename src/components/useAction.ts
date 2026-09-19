import { useCallback, useState } from 'react'

/** Wraps one signed transaction: busy flag, readable error, last tx hash. */
export function useAction(onSuccess?: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastHash, setLastHash] = useState<string | null>(null)

  const run = useCallback(
    async (fn: () => Promise<{ hash: string }>) => {
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
      }
    },
    [onSuccess],
  )

  const clear = useCallback(() => {
    setError(null)
    setLastHash(null)
  }, [])

  return { busy, error, lastHash, run, clear }
}
