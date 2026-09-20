// Real-testnet end-to-end test for tx.ts. Skipped unless TESTNET_E2E=1.
// Run: TESTNET_E2E=1 pnpm exec vitest run src/stellar/tx.testnet.test.ts
// Offline validation and mocked build/submit tests live in tx.test.ts.
//
// Uses two throwaway Keypair.random() accounts funded by Friendbot. They are
// disposable: never the user's keys, never written anywhere.

import { beforeAll, describe, expect, it } from 'vitest'
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk'
import type { Horizon } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE, DATA_KEYS, PET_ASSET_CODE } from './config'
import { decodeDataValue, fundWithFriendbot, server } from './horizon'
import {
  MAX_FEE_PER_OP,
  cancelTransferOp,
  careOp,
  claimOps,
  giftMemo,
  giftOp,
  hatchOps,
  submitOps,
  transferOp,
  type Signer,
} from './tx'

// tsconfig.app.json only loads vite/client types, so read process.env without @types/node.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const E2E = Boolean(env.TESTNET_E2E)

/** Friendbot + ledger close can each take several seconds. */
const T = 120_000

/** Signs with a raw Keypair. The app uses Freighter instead; tx.ts does not care which. */
function keypairSigner(kp: Keypair): Signer {
  return async (xdr) => {
    // why: rebuild the envelope with the testnet passphrase so the signature covers the right network hash.
    const tx = TransactionBuilder.fromXdr(xdr, NETWORK_PASSPHRASE)
    tx.sign(kp)
    return tx.toXdr()
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Horizon ingests right after submit, but poll briefly to be safe. */
async function findPendingBalance(claimant: string, issuer: string): Promise<Horizon.ServerApi.ClaimableBalanceRecord> {
  const assetId = `${PET_ASSET_CODE}:${issuer}`
  for (let i = 0; i < 10; i++) {
    // why: Horizon indexes claimable balances by claimant, so the receiver can discover a pending transfer.
    const page = await server.claimableBalances().claimant(claimant).call()
    const hit = page.records.find((r) => r.asset === assetId)
    if (hit) return hit
    await sleep(1000)
  }
  throw new Error(`No pending ${assetId} balance for ${claimant}`)
}

function petBalance(account: Horizon.AccountResponse, issuer: string): string | undefined {
  const line = account.balances.find(
    (b) => b.asset_type !== 'native' && 'asset_code' in b && b.asset_code === PET_ASSET_CODE && b.asset_issuer === issuer,
  )
  return line?.balance
}

describe.skipIf(!E2E)('tx.ts on real testnet', () => {
  const a = Keypair.random()
  const b = Keypair.random()
  const A = a.publicKey()
  const B = b.publicKey()
  const signA = keypairSigner(a)
  const signB = keypairSigner(b)

  let transferId = ''
  let inheritId = ''

  beforeAll(async () => {
    // why: testnet accounts are created for free by Friendbot; both must exist before any tx.
    await Promise.all([fundWithFriendbot(A), fundWithFriendbot(B)])
  }, T)

  it('hatches the pet on A (the issuer)', async () => {
    const { hash } = await submitOps(A, hatchOps('Pixel', 'plain'), signA)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    const acct = await server.loadAccount(A)
    expect(decodeDataValue(acct.data_attr[DATA_KEYS.name])).toBe('Pixel')
    expect(decodeDataValue(acct.data_attr[DATA_KEYS.species])).toBe('plain')
    // The bid is 2 ops x MAX_FEE_PER_OP; the network charges only the effective base fee, at most the bid.
    const tx = await server.transactions().transaction(hash).call()
    expect(String(tx.max_fee)).toBe(String(2 * Number(MAX_FEE_PER_OP)))
    expect(Number(tx.fee_charged)).toBeLessThanOrEqual(Number(tx.max_fee))
  }, T)

  it("care 'feed' on A", async () => {
    await submitOps(A, [careOp('feed')], signA)
    const acct = await server.loadAccount(A)
    expect(decodeDataValue(acct.data_attr[DATA_KEYS.care])).toBe('feed')
  }, T)

  it('A transfers to B unconditionally (claimable balance appears for B)', async () => {
    await submitOps(A, [transferOp(A, A, B)], signA)
    const cb = await findPendingBalance(B, A)
    transferId = cb.id
    expect(cb.amount).toBe('1.0000000')
    expect(cb.sponsor).toBe(A)
    const dests = cb.claimants.map((c) => c.destination).sort()
    expect(dests).toEqual([A, B].sort())
    for (const c of cb.claimants) expect(c.predicate.unconditional).toBe(true)
  }, T)

  it('B claims (trustline + claim + pet.prev in one tx)', async () => {
    const ops = claimOps(A, B, transferId, A)
    expect(ops).toHaveLength(3)
    await submitOps(B, ops, signB)
    const acct = await server.loadAccount(B)
    expect(petBalance(acct, A)).toBe('1.0000000')
    expect(decodeDataValue(acct.data_attr[DATA_KEYS.prev])).toBe(A)
    // The balance is gone for everyone.
    const page = await server.claimableBalances().claimant(B).call()
    expect(page.records.find((r) => r.id === transferId)).toBeUndefined()
  }, T)

  it("care 'play' on B (the new owner)", async () => {
    await submitOps(B, [careOp('play')], signB)
    const acct = await server.loadAccount(B)
    expect(decodeDataValue(acct.data_attr[DATA_KEYS.care])).toBe('play')
  }, T)

  it("A gifts B 0.5 XLM with memo treat:apple", async () => {
    const before = await server.loadAccount(B)
    const { hash } = await submitOps(A, [giftOp(B, '0.5')], signA, { memo: giftMemo('apple') })
    const tx = await server.transactions().transaction(hash).call()
    expect(tx.memo_type).toBe('text')
    expect(tx.memo).toBe('treat:apple')
    const after = await server.loadAccount(B)
    const xlm = (acct: Horizon.AccountResponse) => Number(acct.balances.find((x) => x.asset_type === 'native')?.balance ?? '0')
    expect(xlm(after) - xlm(before)).toBeCloseTo(0.5, 6)
  }, T)

  it('B sets inheritance to A (not before +1h); A cannot claim yet', async () => {
    const claimableAfter = new Date(Date.now() + 60 * 60 * 1000)
    await submitOps(B, [transferOp(A, B, A, { claimableAfter })], signB)

    const cb = await findPendingBalance(A, A)
    inheritId = cb.id
    expect(cb.sponsor).toBe(B)
    const heir = cb.claimants.find((c) => c.destination === A)
    const sender = cb.claimants.find((c) => c.destination === B)
    expect(sender?.predicate.unconditional).toBe(true)
    // Horizon renders our predicateNot(beforeAbsoluteTime) as { not: { abs_before_epoch } }.
    expect(heir?.predicate.not?.abs_before_epoch).toBe(String(Math.floor(claimableAfter.getTime() / 1000)))

    // B no longer holds the token; it is parked in the claimable balance.
    expect(petBalance(await server.loadAccount(B), A)).toBe('0.0000000')

    // The issuer reclaim path has a single op (no trustline, no pet.prev).
    const ops = claimOps(A, A, inheritId, B)
    expect(ops).toHaveLength(1)
    await expect(submitOps(A, ops, signA)).rejects.toThrow(/op_cannot_claim/)
    await expect(submitOps(A, ops, signA)).rejects.toThrow(/claim condition is not met/)
  }, T)

  it('B cancels the inheritance by claiming it back', async () => {
    await submitOps(B, [cancelTransferOp(inheritId)], signB)
    expect(petBalance(await server.loadAccount(B), A)).toBe('1.0000000')
    const page = await server.claimableBalances().claimant(A).call()
    expect(page.records.find((r) => r.id === inheritId)).toBeUndefined()
  }, T)
})
