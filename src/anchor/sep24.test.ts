// Offline tests: the tiny TOML parser and the VITE_ANCHOR_MOCK=1 code path.
// Run: pnpm exec vitest run src/anchor/sep24.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANCHOR_TOML_URL,
  MOCK_DEPOSIT_HTML,
  TERMINAL_STATUSES,
  ensureTrustline,
  fetchAnchorInfo,
  findCurrency,
  isAbortError,
  isMockMode,
  isTerminal,
  parseStellarToml,
  pollTransaction,
  resetAnchorInfoCache,
  sep10Auth,
  startInteractiveDeposit,
  type Sep24Transaction,
} from './sep24'

const TOML = `
# comment
ACCOUNTS = ["GCSGSR6KQQ5BP2FXVPWRL6SWPUSFWLVONLIBJZUKTVQB5FYJFVL6XOXE"]
VERSION = "0.1.0"
SIGNING_KEY = "GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR"
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"

WEB_AUTH_ENDPOINT = "https://testanchor.stellar.org/auth"
TRANSFER_SERVER_SEP0024 = "https://testanchor.stellar.org/sep24"

[[CURRENCIES]]
code = "SRT"
issuer = "GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B"
status = "test"
desc = "Stellar Reference Token"

[[CURRENCIES]]
code = "native"
status = "test"

[DOCUMENTATION]
ORG_NAME = "Stellar Development Foundation"
`

describe('parseStellarToml', () => {
  it('reads top-level strings and [[CURRENCIES]] blocks only', () => {
    const { top, currencies } = parseStellarToml(TOML)
    expect(top.WEB_AUTH_ENDPOINT).toBe('https://testanchor.stellar.org/auth')
    expect(top.TRANSFER_SERVER_SEP0024).toBe('https://testanchor.stellar.org/sep24')
    expect(top.SIGNING_KEY).toBe('GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR')
    expect(top.NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015')
    expect(top.ORG_NAME).toBeUndefined()
    expect(currencies).toEqual([
      {
        code: 'SRT',
        issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
        status: 'test',
        desc: 'Stellar Reference Token',
      },
      { code: 'native', status: 'test' },
    ])
  })
})

describe('mock mode (VITE_ANCHOR_MOCK=1)', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    vi.stubEnv('VITE_ANCHOR_MOCK', '1')
    vi.stubGlobal('fetch', fetchSpy)
    resetAnchorInfoCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    resetAnchorInfoCache()
  })

  it('runs the whole flow without touching the network', async () => {
    expect(isMockMode()).toBe(true)
    const address = 'GCSGSR6KQQ5BP2FXVPWRL6SWPUSFWLVONLIBJZUKTVQB5FYJFVL6XOXE'
    const sign = vi.fn(async (xdr: string) => xdr)

    const info = await fetchAnchorInfo()
    expect(findCurrency(info, 'SRT')?.issuer).toMatch(/^G/)

    const token = await sep10Auth(address, sign)
    expect(token.split('.')).toHaveLength(3)
    expect(sign).not.toHaveBeenCalled()

    const issuer = findCurrency(info, 'SRT')!.issuer!
    expect(await ensureTrustline(address, 'SRT', issuer, sign)).toBe('created')
    expect(await ensureTrustline(address, 'SRT', issuer, sign)).toBe('exists')

    const dep = await startInteractiveDeposit(token, address, 'SRT')
    expect(dep.url.startsWith('data:text/html')).toBe(true)
    expect(decodeURIComponent(dep.url.slice(dep.url.indexOf(',') + 1))).toBe(MOCK_DEPOSIT_HTML)
    expect(MOCK_DEPOSIT_HTML).toContain('Mock anchor deposit')

    const statuses: string[] = []
    const final = await pollTransaction(token, dep.id, (t) => statuses.push(t.status), { intervalMs: 10 })
    expect(final.status).toBe('completed')
    expect(final.amount_out).toBe('10')
    expect(statuses).toEqual(['incomplete', 'pending_user_transfer_start', 'pending_anchor', 'pending_stellar', 'completed'])

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('terminal statuses', () => {
  it('treats every SEP-24 end state as terminal, including the failure ones', () => {
    for (const s of ['completed', 'error', 'expired', 'refunded', 'no_market', 'too_small', 'too_large']) {
      expect(TERMINAL_STATUSES).toContain(s)
      expect(isTerminal(s)).toBe(true)
    }
    for (const s of ['incomplete', 'pending_user_transfer_start', 'pending_anchor', 'pending_stellar', 'pending_trust']) {
      expect(isTerminal(s)).toBe(false)
    }
  })

  it('isAbortError accepts the DOMException an aborted fetch rejects with', () => {
    expect(isAbortError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true)
    expect(isAbortError(new Error('Aborted'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

// Live code path (no VITE_ANCHOR_MOCK) against a stubbed fetch: the toml comes
// from TOML above, the transaction record from each test's own handler.
describe('pollTransaction against a stubbed anchor', () => {
  const TX_URL = 'https://testanchor.stellar.org/sep24/transaction?id=tx1'
  const record = (status: string): Sep24Transaction => ({ id: 'tx1', kind: 'deposit', status })
  const okJson = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

  beforeEach(() => resetAnchorInfoCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    resetAnchorInfoCache()
  })

  it('stops on a failure end state instead of polling until maxMs', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === ANCHOR_TOML_URL) return new Response(TOML)
      return okJson({ transaction: record('too_small') })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const seen: string[] = []
    const final = await pollTransaction('jwt', 'tx1', (t) => seen.push(t.status), { intervalMs: 5, maxMs: 50 })
    expect(final.status).toBe('too_small')
    expect(seen).toEqual(['too_small'])
    expect(fetchSpy.mock.calls.filter(([u]) => u === TX_URL)).toHaveLength(1)
  })

  it('never calls onUpdate for a record fetched while the abort landed, and hands the signal to fetch', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === ANCHOR_TOML_URL) return new Response(TOML)
      // why: ignore the signal on purpose (like a fetch that cannot cancel) so the post-GET abort check is what stops it.
      await gate
      return okJson({ transaction: record('completed') })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const ctrl = new AbortController()
    const onUpdate = vi.fn()
    const p = pollTransaction('jwt', 'tx1', onUpdate, { intervalMs: 5, signal: ctrl.signal })
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(TX_URL, expect.anything()))
    ctrl.abort()
    release()

    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(onUpdate).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenLastCalledWith(TX_URL, expect.objectContaining({ signal: ctrl.signal }))
  })

  it('reports an aborted fetch (DOMException) as AbortError', async () => {
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ANCHOR_TOML_URL) return new Response(TOML)
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const ctrl = new AbortController()
    const onUpdate = vi.fn()
    const p = pollTransaction('jwt', 'tx1', onUpdate, { intervalMs: 5, signal: ctrl.signal })
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(TX_URL, expect.anything()))
    ctrl.abort()

    const err = await p.catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
