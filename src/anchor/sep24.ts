// SEP-24 hosted deposit against testanchor.stellar.org, using plain fetch.
// The flow: SEP-1 toml (who is the anchor) -> SEP-10 challenge signed by the
// wallet (prove you own the account) -> trustline for the anchor's asset ->
// SEP-24 interactive URL (anchor's own web form) -> poll the transaction.
//
// Set VITE_ANCHOR_MOCK=1 to run the whole flow against realistic fake data
// with short delays; no network calls are made in that mode.

import { Asset, WebAuth } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE } from '../stellar/config'
import { server } from '../stellar/horizon'
import { explainHorizonError, submitOps, trustOp, type Signer } from '../stellar/tx'

// ---------------------------------------------------------------------------
// Constants / config
// ---------------------------------------------------------------------------

/** Home domain of the SDF reference anchor on testnet. */
export const ANCHOR_HOME_DOMAIN = 'testanchor.stellar.org'
/** why: SEP-1 says an anchor publishes its endpoints and keys at this well-known path. */
export const ANCHOR_TOML_URL = `https://${ANCHOR_HOME_DOMAIN}/.well-known/stellar.toml`
/** The asset the demo deposits. SRT = Stellar Reference Token, a free test asset. */
export const DEFAULT_ASSET_CODE = 'SRT'

/** True when the app runs with VITE_ANCHOR_MOCK=1: every function returns fake data. */
export function isMockMode(): boolean {
  return import.meta.env.VITE_ANCHOR_MOCK === '1'
}

/**
 * SEP-24 transaction statuses that will never change again. why: `no_market`,
 * `too_small` and `too_large` are failure end states too; the anchor never
 * advances a transaction past them, so polling must stop and surface an error.
 */
export const TERMINAL_STATUSES = [
  'completed',
  'error',
  'expired',
  'refunded',
  'no_market',
  'too_small',
  'too_large',
] as const
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnchorCurrency {
  code: string
  /** Missing for `native` (XLM). */
  issuer?: string
  status?: string
  desc?: string
}

export interface AnchorInfo {
  homeDomain: string
  /** SEP-10 challenge endpoint (GET challenge, POST signed challenge). */
  webAuthEndpoint: string
  /** Base URL for SEP-24 (`/info`, `/transactions/deposit/interactive`, `/transaction`). */
  transferServerSep24: string
  /** Public key the anchor signs SEP-10 challenges with. */
  signingKey: string
  networkPassphrase: string
  currencies: AnchorCurrency[]
}

/** https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md#transaction-history */
export type Sep24Status =
  | 'incomplete'
  | 'pending_user_transfer_start'
  | 'pending_user_transfer_complete'
  | 'pending_external'
  | 'pending_anchor'
  | 'pending_stellar'
  | 'pending_trust'
  | 'pending_user'
  | 'completed'
  | 'refunded'
  | 'expired'
  | 'no_market'
  | 'too_small'
  | 'too_large'
  | 'error'
  | (string & {})

export interface Sep24Transaction {
  id: string
  kind: 'deposit' | 'withdrawal' | (string & {})
  status: Sep24Status
  status_eta?: number | null
  /** What the user paid the anchor (off-chain side). */
  amount_in?: string | null
  amount_in_asset?: string | null
  /** What the anchor sent on Stellar. */
  amount_out?: string | null
  amount_out_asset?: string | null
  amount_fee?: string | null
  started_at?: string | null
  completed_at?: string | null
  /** Hash of the Stellar payment once the anchor has sent it. */
  stellar_transaction_id?: string | null
  more_info_url?: string | null
  message?: string | null
  from?: string | null
  to?: string | null
}

export interface InteractiveDeposit {
  /** The anchor's hosted web form. Open it in a popup. */
  url: string
  /** SEP-24 transaction id, used to poll status. */
  id: string
}

export interface PollOpts {
  /** Default 3000. */
  intervalMs?: number
  /** Give up after this long. Default 10 minutes. */
  maxMs?: number
  /** Abort early (for example when the modal closes). */
  signal?: AbortSignal
}

export class AnchorError extends Error {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

/** True for our own abort errors and for the DOMException an aborted fetch rejects with. */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

async function readBody(res: Response): Promise<{ text: string; json: unknown }> {
  const text = await res.text().catch(() => '')
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { text, json }
}

function httpError(what: string, res: Response, text: string): AnchorError {
  return new AnchorError(`${what}: HTTP ${res.status} ${text.slice(0, 200)}`.trim())
}

export function isTerminal(status: Sep24Status): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

// ---------------------------------------------------------------------------
// Minimal TOML parser (only what stellar.toml needs)
// ---------------------------------------------------------------------------

/** Strips quotes from a TOML string scalar. Non-string values are returned raw. */
function tomlScalar(raw: string): string {
  const v = raw.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * Parses `KEY = "value"` lines at the top level plus every `[[CURRENCIES]]`
 * block. Everything else (other tables, arrays, multiline strings) is ignored.
 * Good enough for stellar.toml; not a general TOML parser.
 */
export function parseStellarToml(text: string): { top: Record<string, string>; currencies: AnchorCurrency[] } {
  const top: Record<string, string> = {}
  const currencies: AnchorCurrency[] = []
  let section: 'top' | 'currency' | 'other' = 'top'
  let current: Record<string, string> | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const name = line.slice(2, -2).trim()
      if (name === 'CURRENCIES') {
        section = 'currency'
        current = {}
        currencies.push(current as unknown as AnchorCurrency)
      } else {
        section = 'other'
        current = null
      }
      continue
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      section = 'other'
      current = null
      continue
    }

    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = tomlScalar(line.slice(eq + 1))
    if (section === 'top') top[key] = value
    else if (section === 'currency' && current) current[key] = value
  }

  return { top, currencies: currencies.filter((c) => typeof c.code === 'string' && c.code.length > 0) }
}

// ---------------------------------------------------------------------------
// fetchAnchorInfo (SEP-1)
// ---------------------------------------------------------------------------

let infoCache: Promise<AnchorInfo> | null = null

/** Loads and caches the anchor's stellar.toml. Throws when a required key is missing. */
export function fetchAnchorInfo(): Promise<AnchorInfo> {
  if (!infoCache) {
    infoCache = loadAnchorInfo().catch((err) => {
      // why: do not cache a failure, so the next click retries the network.
      infoCache = null
      throw err
    })
  }
  return infoCache
}

/** Test hook: forget the cached toml. */
export function resetAnchorInfoCache(): void {
  infoCache = null
}

async function loadAnchorInfo(): Promise<AnchorInfo> {
  if (isMockMode()) {
    await sleep(200)
    return MOCK_INFO
  }
  const res = await fetch(ANCHOR_TOML_URL)
  if (!res.ok) throw httpError('stellar.toml', res, await res.text().catch(() => ''))
  const { top, currencies } = parseStellarToml(await res.text())

  const required = ['WEB_AUTH_ENDPOINT', 'TRANSFER_SERVER_SEP0024', 'SIGNING_KEY'] as const
  for (const k of required) {
    if (!top[k]) throw new AnchorError(`stellar.toml is missing ${k}`)
  }
  const passphrase = top.NETWORK_PASSPHRASE ?? NETWORK_PASSPHRASE
  // why: never talk to an anchor that is on a different network; a mainnet anchor would move real money.
  if (passphrase !== NETWORK_PASSPHRASE) {
    throw new AnchorError(`Anchor is on another network: ${passphrase}`)
  }
  return {
    homeDomain: ANCHOR_HOME_DOMAIN,
    webAuthEndpoint: top.WEB_AUTH_ENDPOINT,
    transferServerSep24: top.TRANSFER_SERVER_SEP0024.replace(/\/+$/, ''),
    signingKey: top.SIGNING_KEY,
    networkPassphrase: passphrase,
    currencies,
  }
}

/** Finds an asset by code in the toml. Returns undefined when the anchor does not list it. */
export function findCurrency(info: AnchorInfo, code: string): AnchorCurrency | undefined {
  return info.currencies.find((c) => c.code === code)
}

// ---------------------------------------------------------------------------
// sep10Auth (SEP-10)
// ---------------------------------------------------------------------------

/**
 * Proves to the anchor that `address` is ours and returns a JWT for the
 * SEP-24 endpoints. why: SEP-10 is "sign this harmless challenge tx" so the
 * anchor knows it is really talking to the owner of the account.
 */
export async function sep10Auth(address: string, sign: Signer): Promise<string> {
  if (isMockMode()) {
    await sleep(600)
    return `mock.${btoa(JSON.stringify({ sub: address, iat: Math.floor(Date.now() / 1000) }))}.sig`
  }
  const info = await fetchAnchorInfo()

  // why: the anchor builds a special tx (sequence 0, so it can never be submitted) that includes our address.
  const getRes = await fetch(`${info.webAuthEndpoint}?account=${encodeURIComponent(address)}`)
  const got = await readBody(getRes)
  if (!getRes.ok) throw httpError('SEP-10 challenge', getRes, got.text)
  const challenge = got.json as { transaction?: string; network_passphrase?: string; error?: string } | null
  if (!challenge?.transaction) {
    throw new AnchorError(`SEP-10 challenge has no transaction: ${challenge?.error ?? got.text.slice(0, 200)}`)
  }
  if (challenge.network_passphrase && challenge.network_passphrase !== NETWORK_PASSPHRASE) {
    throw new AnchorError(`SEP-10 challenge is for another network: ${challenge.network_passphrase}`)
  }

  // why: validate BEFORE signing. This checks the server signature, sequence 0, timebounds and the
  // home-domain data op, so a hostile server cannot trick the wallet into signing a real payment.
  const webAuthDomain = new URL(info.webAuthEndpoint).host
  let clientAccountID: string
  try {
    ;({ clientAccountID } = WebAuth.readChallengeTx(
      challenge.transaction,
      info.signingKey,
      NETWORK_PASSPHRASE,
      info.homeDomain,
      webAuthDomain,
    ))
  } catch (err) {
    throw new AnchorError(`SEP-10 challenge failed validation: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (clientAccountID !== address) {
    throw new AnchorError(`SEP-10 challenge is for ${clientAccountID}, not ${address}`)
  }

  // why: the wallet adds our signature next to the server's. Freighter signs it like any other tx envelope.
  const signedXdr = await sign(challenge.transaction)

  // why: the anchor verifies our signature on the challenge and mints a JWT that authorizes SEP-24 calls.
  const postRes = await fetch(info.webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  })
  const posted = await readBody(postRes)
  if (!postRes.ok) throw httpError('SEP-10 token', postRes, posted.text)
  const tokenRes = posted.json as { token?: string; error?: string } | null
  if (!tokenRes?.token) throw new AnchorError(`SEP-10 returned no token: ${tokenRes?.error ?? posted.text.slice(0, 200)}`)
  return tokenRes.token
}

// ---------------------------------------------------------------------------
// ensureTrustline
// ---------------------------------------------------------------------------

const mockTrustlines = new Set<string>()

/**
 * Makes sure `address` can hold `assetCode:issuer`. why: an account can only
 * receive an asset it has explicitly trusted (changeTrust), otherwise the
 * anchor's payment fails with op_no_trust.
 */
export async function ensureTrustline(
  address: string,
  assetCode: string,
  issuer: string,
  sign: Signer,
): Promise<'exists' | 'created'> {
  if (isMockMode()) {
    await sleep(700)
    const key = `${address}:${assetCode}:${issuer}`
    if (mockTrustlines.has(key)) return 'exists'
    mockTrustlines.add(key)
    return 'created'
  }
  let account
  try {
    // why: Horizon's account record lists every trustline as a balance entry, even when the balance is 0.
    account = await server.loadAccount(address)
  } catch (err) {
    throw new AnchorError(explainHorizonError(err))
  }
  const has = account.balances.some(
    (b) => b.asset_type !== 'native' && 'asset_code' in b && b.asset_code === assetCode && b.asset_issuer === issuer,
  )
  if (has) return 'exists'
  // why: changeTrust reserves ~0.5 XLM on the account and opens the line; the wallet must sign it.
  await submitOps(address, [trustOp(new Asset(assetCode, issuer))], sign)
  return 'created'
}

// ---------------------------------------------------------------------------
// startInteractiveDeposit (SEP-24)
// ---------------------------------------------------------------------------

/** The page the mock popup shows. Exported so the UI can document.write it when data: URLs are blocked. */
export const MOCK_DEPOSIT_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Mock anchor deposit</title>
<style>body{font-family:system-ui,sans-serif;background:#fffbeb;color:#292524;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
main{max-width:22rem;padding:2rem}h1{font-size:1.4rem}p{color:#57534e;line-height:1.5}code{background:#fde68a;padding:.1rem .3rem;border-radius:.25rem}</style></head>
<body><main><h1>Mock anchor deposit</h1><p>This stands in for the anchor's hosted deposit form (SEP-24).</p>
<p>The app is running with <code>VITE_ANCHOR_MOCK=1</code>, so nothing touches the network. Close this window and watch the status advance to <b>completed</b>.</p></main></body></html>`

export async function startInteractiveDeposit(
  token: string,
  address: string,
  assetCode: string,
): Promise<InteractiveDeposit> {
  if (isMockMode()) {
    await sleep(500)
    return {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(MOCK_DEPOSIT_HTML)}`,
      id: `mock-${Math.random().toString(36).slice(2, 10)}`,
    }
  }
  const info = await fetchAnchorInfo()
  const endpoint = `${info.transferServerSep24}/transactions/deposit/interactive`
  const fields = { asset_code: assetCode, account: address, lang: 'en' }

  // why: the JWT from SEP-10 goes in the Authorization header; that is how the anchor ties this deposit to our account.
  let res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(fields),
  })
  let body = await readBody(res)

  // why: SEP-24 allows JSON or multipart bodies; some anchors only accept multipart, so retry that way on a 4xx.
  if (!res.ok && res.status !== 401 && res.status !== 403) {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    body = await readBody(res)
  }
  if (!res.ok) throw httpError('SEP-24 deposit', res, body.text)

  const data = body.json as { type?: string; url?: string; id?: string; error?: string } | null
  if (data?.type !== 'interactive_customer_info_needed' || !data.url || !data.id) {
    throw new AnchorError(`Unexpected SEP-24 response: ${data?.error ?? body.text.slice(0, 200)}`)
  }
  return { url: data.url, id: data.id }
}

// ---------------------------------------------------------------------------
// pollTransaction (SEP-24)
// ---------------------------------------------------------------------------

/** One GET of the SEP-24 transaction record. `signal` cancels the request itself, not just the wait between polls. */
export async function getTransaction(token: string, id: string, signal?: AbortSignal): Promise<Sep24Transaction> {
  if (isMockMode()) return mockTransaction(id)
  const info = await fetchAnchorInfo()
  const res = await fetch(`${info.transferServerSep24}/transaction?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal,
  })
  const body = await readBody(res)
  if (!res.ok) throw httpError('SEP-24 transaction', res, body.text)
  const data = body.json as { transaction?: Sep24Transaction; error?: string } | null
  if (!data?.transaction?.id) throw new AnchorError(`SEP-24 transaction missing: ${data?.error ?? body.text.slice(0, 200)}`)
  return data.transaction
}

/**
 * Polls the anchor until the deposit reaches a terminal status or `maxMs`
 * passes. why: the anchor works off-chain and tells us through this record
 * when it has sent the asset to our account.
 */
export async function pollTransaction(
  token: string,
  id: string,
  onUpdate: (tx: Sep24Transaction) => void,
  opts: PollOpts = {},
): Promise<Sep24Transaction> {
  const intervalMs = opts.intervalMs ?? 3000
  const maxMs = opts.maxMs ?? 10 * 60 * 1000
  const deadline = Date.now() + maxMs

  for (;;) {
    if (opts.signal?.aborted) throw abortError()
    let tx: Sep24Transaction
    try {
      tx = await getTransaction(token, id, opts.signal)
    } catch (err) {
      // why: an aborted fetch rejects with a DOMException; report every abort as the same AbortError.
      if (opts.signal?.aborted) throw abortError()
      throw err
    }
    // why: an abort that lands while the GET is in flight must not leak a stale record to the caller.
    if (opts.signal?.aborted) throw abortError()
    onUpdate(tx)
    if (isTerminal(tx.status)) return tx
    if (Date.now() >= deadline) {
      throw new AnchorError(`Deposit still "${tx.status}" after ${Math.round(maxMs / 1000)}s; check the anchor later`)
    }
    await sleep(isMockMode() ? Math.min(intervalMs, 1200) : intervalMs, opts.signal)
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** Same shape as the live toml; values copied from testanchor.stellar.org on 2026-09-19. */
const MOCK_INFO: AnchorInfo = {
  homeDomain: ANCHOR_HOME_DOMAIN,
  webAuthEndpoint: 'https://testanchor.stellar.org/auth',
  transferServerSep24: 'https://testanchor.stellar.org/sep24',
  signingKey: 'GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR',
  networkPassphrase: NETWORK_PASSPHRASE,
  currencies: [
    { code: 'SRT', issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B', status: 'test' },
    { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', status: 'test' },
    { code: 'native', status: 'test' },
  ],
}

const MOCK_STATUS_SEQUENCE: Sep24Status[] = [
  'incomplete',
  'pending_user_transfer_start',
  'pending_anchor',
  'pending_stellar',
  'completed',
]
const mockPollCount = new Map<string, number>()

function mockTransaction(id: string): Sep24Transaction {
  const n = mockPollCount.get(id) ?? 0
  mockPollCount.set(id, n + 1)
  const status = MOCK_STATUS_SEQUENCE[Math.min(n, MOCK_STATUS_SEQUENCE.length - 1)]
  const done = status === 'completed'
  const startedAt = new Date(Date.now() - n * 1000).toISOString()
  return {
    id,
    kind: 'deposit',
    status,
    amount_in: n >= 1 ? '10' : null,
    amount_in_asset: n >= 1 ? 'iso4217:USD' : null,
    amount_out: n >= 3 ? '10' : null,
    amount_out_asset: n >= 3 ? `stellar:SRT:${MOCK_INFO.currencies[0].issuer}` : null,
    amount_fee: n >= 1 ? '0' : null,
    started_at: startedAt,
    completed_at: done ? new Date().toISOString() : null,
    stellar_transaction_id: done ? 'mock'.padEnd(64, '0') : null,
    more_info_url: null,
    message: done ? 'Mock deposit complete' : null,
  }
}
