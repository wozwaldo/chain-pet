import { useCallback, useEffect, useState } from 'react'
import { checkNetwork, connectWallet, currentAddress, FreighterError, watchWallet, type NetworkCheck } from './freighter'
import { fundWithFriendbot, loadAccountOrNull, xlmBalance } from './horizon'

export interface WalletState {
  address: string | null
  balance: string | null
  /** false when the account does not exist on testnet yet. */
  funded: boolean
  network: NetworkCheck | null
  busy: boolean
  error: string | null
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    balance: null,
    funded: true,
    network: null,
    busy: false,
    error: null,
  })

  const refresh = useCallback(async (address: string) => {
    const [account, network] = await Promise.all([loadAccountOrNull(address), checkNetwork()])
    setState((s) => ({
      ...s,
      address,
      network,
      funded: account !== null,
      balance: account ? xlmBalance(account) : null,
    }))
  }, [])

  /**
   * Live check at sign time. why: Freighter can be switched mid-session; re-read the
   * network right before signing and refresh the banner state as a side effect.
   */
  const requireTestnet = useCallback(async () => {
    const network = await checkNetwork()
    setState((s) => ({ ...s, network }))
    if (!network.ok) throw new FreighterError(`Freighter is on ${network.network}. Switch it to TESTNET and try again.`)
  }, [])

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }))
    try {
      const address = await connectWallet()
      await refresh(address)
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Something went wrong' }))
    } finally {
      setState((s) => ({ ...s, busy: false }))
    }
  }, [refresh])

  const fund = useCallback(async () => {
    if (!state.address) return
    setState((s) => ({ ...s, busy: true, error: null }))
    try {
      await fundWithFriendbot(state.address)
      await refresh(state.address)
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Funding failed' }))
    } finally {
      setState((s) => ({ ...s, busy: false }))
    }
  }, [state.address, refresh])

  // Silent reconnect if the site was already allowed in Freighter.
  useEffect(() => {
    let cancelled = false
    currentAddress().then((address) => {
      if (address && !cancelled) refresh(address).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Follow account/network switches made inside Freighter once an address is known.
  // why: the app otherwise keeps building txs for the previous account, and the
  // wrong-network banner would never clear after the user switches back.
  const curAddress = state.address
  const curPassphrase = state.network?.passphrase ?? null
  useEffect(() => {
    if (!curAddress) return
    return watchWallet(({ address, passphrase }) => {
      const addressChanged = address !== curAddress
      const networkChanged = curPassphrase !== null && passphrase !== curPassphrase
      if (addressChanged || networkChanged) refresh(address).catch(() => {})
    })
  }, [curAddress, curPassphrase, refresh])

  return { ...state, connect, fund, refresh, requireTestnet }
}
