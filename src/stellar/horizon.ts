import { Horizon } from '@stellar/stellar-sdk'
import { FRIENDBOT_URL, HORIZON_URL } from './config'

/** One shared Horizon client. Why: Horizon is the read API for the ledger. */
export const server = new Horizon.Server(HORIZON_URL)

export type AccountRecord = Horizon.AccountResponse

/** Returns null when the account is not yet funded (Horizon 404). */
export async function loadAccountOrNull(publicKey: string): Promise<AccountRecord | null> {
  try {
    return await server.loadAccount(publicKey)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

export function xlmBalance(account: AccountRecord): string {
  const native = account.balances.find((b) => b.asset_type === 'native')
  return native ? native.balance : '0'
}

/** Why: testnet accounts are created for free by Friendbot. */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Friendbot failed: ${res.status} ${body.slice(0, 120)}`)
  }
}

export function isNotFound(err: unknown): boolean {
  const e = err as { response?: { status?: number }; name?: string }
  return e?.response?.status === 404 || e?.name === 'NotFoundError'
}

/** Horizon returns manageData values base64-encoded. */
export function decodeDataValue(b64: string | undefined | null): string {
  if (!b64) return ''
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

export function shortKey(pk: string, n = 4): string {
  return pk.length > n * 2 + 1 ? `${pk.slice(0, n)}…${pk.slice(-n)}` : pk
}
