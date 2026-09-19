// Live round trip against testanchor.stellar.org. Skipped unless TESTNET_E2E=1.
// Run: TESTNET_E2E=1 pnpm exec vitest run src/anchor/sep24.testnet.test.ts
//
// Uses a throwaway Keypair.random() funded by Friendbot as the Signer. It is
// disposable: never the user's keys, never written anywhere.

import { beforeAll, describe, expect, it } from 'vitest'
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE } from '../stellar/config'
import { fundWithFriendbot, server } from '../stellar/horizon'
import type { Signer } from '../stellar/tx'
import {
  DEFAULT_ASSET_CODE,
  ensureTrustline,
  fetchAnchorInfo,
  findCurrency,
  getTransaction,
  pollTransaction,
  sep10Auth,
  startInteractiveDeposit,
} from './sep24'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const E2E = Boolean(env.TESTNET_E2E)
const T = 120_000

function keypairSigner(kp: Keypair): Signer {
  return async (xdr) => {
    // why: a SEP-10 challenge is a normal tx envelope; adding our signature next to the server's is all it takes.
    const tx = TransactionBuilder.fromXdr(xdr, NETWORK_PASSPHRASE)
    tx.sign(kp)
    return tx.toXdr()
  }
}

describe.skipIf(!E2E)('sep24.ts on testanchor.stellar.org', () => {
  const kp = Keypair.random()
  const address = kp.publicKey()
  const sign = keypairSigner(kp)
  let token = ''
  let issuer = ''

  beforeAll(async () => {
    await fundWithFriendbot(address)
  }, T)

  it(
    'fetchAnchorInfo parses the live toml',
    async () => {
      const info = await fetchAnchorInfo()
      console.log('anchor info', JSON.stringify(info, null, 2))
      expect(info.webAuthEndpoint).toMatch(/^https:\/\//)
      expect(info.transferServerSep24).toMatch(/^https:\/\//)
      expect(info.signingKey).toMatch(/^G[A-Z2-7]{55}$/)
      expect(info.networkPassphrase).toBe(NETWORK_PASSPHRASE)
      const srt = findCurrency(info, DEFAULT_ASSET_CODE)
      expect(srt?.issuer).toMatch(/^G[A-Z2-7]{55}$/)
      issuer = srt!.issuer!
      // cached: second call returns the same object
      expect(await fetchAnchorInfo()).toBe(info)
    },
    T,
  )

  it(
    'sep10Auth returns a JWT for the throwaway account',
    async () => {
      token = await sep10Auth(address, sign)
      console.log('sep10 token', token.slice(0, 40) + '…')
      expect(token.split('.')).toHaveLength(3)
      // why: a JWT payload is base64url; swap the url-safe chars so atob (DOM lib, no Buffer) can read it.
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(b64)) as { sub?: string }
      expect(payload.sub).toBe(address)
    },
    T,
  )

  it(
    'sep10Auth rejects a signer for another account',
    async () => {
      const other = Keypair.random()
      // why: the anchor checks that the signature on the challenge belongs to the account it issued it for.
      await expect(sep10Auth(address, keypairSigner(other))).rejects.toThrow(/SEP-10/)
    },
    T,
  )

  it(
    'ensureTrustline creates then reports existing',
    async () => {
      expect(await ensureTrustline(address, DEFAULT_ASSET_CODE, issuer, sign)).toBe('created')
      const acct = await server.loadAccount(address)
      expect(acct.balances.some((b) => 'asset_code' in b && b.asset_code === DEFAULT_ASSET_CODE)).toBe(true)
      expect(await ensureTrustline(address, DEFAULT_ASSET_CODE, issuer, sign)).toBe('exists')
    },
    T,
  )

  it(
    'startInteractiveDeposit returns a URL and id; the tx starts incomplete',
    async () => {
      const dep = await startInteractiveDeposit(token, address, DEFAULT_ASSET_CODE)
      console.log('interactive URL', dep.url)
      console.log('transaction id', dep.id)
      expect(dep.url).toMatch(/^https:\/\//)
      expect(dep.id.length).toBeGreaterThan(0)

      const tx = await getTransaction(token, dep.id)
      console.log('transaction record', JSON.stringify(tx, null, 2))
      expect(tx.id).toBe(dep.id)
      expect(tx.kind).toBe('deposit')
      expect(tx.status).toBe('incomplete')

      // Nobody fills the form in CI, so a short poll must time out while still "incomplete".
      const seen: string[] = []
      await expect(
        pollTransaction(token, dep.id, (t) => seen.push(t.status), { intervalMs: 1000, maxMs: 2500 }),
      ).rejects.toThrow(/still "incomplete"/)
      expect(seen.length).toBeGreaterThanOrEqual(2)

      // Abort works too.
      const ctrl = new AbortController()
      const p = pollTransaction(token, dep.id, () => {}, { intervalMs: 1000, maxMs: 60_000, signal: ctrl.signal })
      setTimeout(() => ctrl.abort(), 300)
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    },
    T,
  )
})
