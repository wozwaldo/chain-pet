import {
  isConnected,
  requestAccess,
  getAddress,
  getNetworkDetails,
  signTransaction,
  WatchWalletChanges,
} from '@stellar/freighter-api'
import { NETWORK_PASSPHRASE } from './config'

export class FreighterError extends Error {}

/** Why: Freighter is the only signer we allow, so it must be installed. */
export async function connectWallet(): Promise<string> {
  const conn = await isConnected()
  if (!conn.isConnected) {
    throw new FreighterError('Freighter is not installed. Install it and refresh the page.')
  }
  const access = await requestAccess()
  if (access.error) throw new FreighterError(access.error.message)
  if (!access.address) throw new FreighterError('Freighter returned no address.')
  return access.address
}

/** Returns the address without prompting if the site is already allowed. */
export async function currentAddress(): Promise<string | null> {
  try {
    const conn = await isConnected()
    if (!conn.isConnected) return null
    const res = await getAddress()
    if (res.error || !res.address) return null
    return res.address
  } catch {
    return null
  }
}

export interface NetworkCheck {
  ok: boolean
  network: string
  passphrase: string
}

/** Why: signing a testnet tx while Freighter is on mainnet fails confusingly. */
export async function checkNetwork(): Promise<NetworkCheck> {
  const d = await getNetworkDetails()
  if (d.error) throw new FreighterError(d.error.message)
  return {
    ok: d.networkPassphrase === NETWORK_PASSPHRASE,
    network: d.network,
    passphrase: d.networkPassphrase,
  }
}

/**
 * Polls Freighter for account or network switches (no prompt: same silent path as
 * `currentAddress`). Fires once with the current values, then on every change.
 * Returns a stop function.
 */
export function watchWallet(cb: (info: { address: string; passphrase: string }) => void, intervalMs = 1500): () => void {
  const watcher = new WatchWalletChanges(intervalMs)
  watcher.watch(({ address, networkPassphrase, error }) => {
    // why: on extension errors the watcher fires with an empty address; ignore those ticks.
    if (error || !address) return
    cb({ address, passphrase: networkPassphrase })
  })
  return () => watcher.stop()
}

/** Sign a base64 tx XDR with Freighter. Returns the signed XDR. */
export async function signXdr(xdr: string, address: string): Promise<string> {
  const res = await signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address })
  if (res.error) throw new FreighterError(res.error.message)
  if (!res.signedTxXdr) throw new FreighterError('Freighter returned no signature.')
  return res.signedTxXdr
}
