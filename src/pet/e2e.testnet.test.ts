// End-to-end verification of the Chain Pet core on REAL testnet:
//   tx.ts (write ops) -> chain.ts (read the ledger back) -> engine.ts (derive state).
// Skipped unless TESTNET_E2E=1. Run:
//   TESTNET_E2E=1 pnpm exec vitest run src/pet/e2e.testnet.test.ts
//
// Three throwaway Keypair.random() accounts funded by Friendbot: A hatches the
// pet, B receives it, C sends a gift. They are disposable: never the user's
// keys, never written anywhere. Only the PUBLIC APIs of tx.ts are used to write,
// exactly as the app does, with a Keypair standing in for Freighter as the Signer.

import { beforeAll, describe, expect, it } from 'vitest'
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE, PET_ASSET_CODE } from '../stellar/config'
import { fundWithFriendbot, server } from '../stellar/horizon'
import {
  cancelTransferOp,
  careOp,
  claimOps,
  giftMemo,
  giftOp,
  hatchOps,
  submitOps,
  transferOp,
} from '../stellar/tx'
import type { Signer } from '../stellar/tx'
import { loadPendingClaimsFor, loadPetByAccount, resolveOwner, resolvePetForAccount } from './chain'
import { THRESHOLDS, deriveState } from './engine'
import type { PetRecord } from './types'

// tsconfig.app.json only loads vite/client types, so read process.env without @types/node.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const E2E = Boolean(env.TESTNET_E2E)

/** Friendbot, ledger close (~5s each) and a handful of Horizon reads per step. */
const T = 180_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Signs with a raw Keypair. The app signs with Freighter instead; tx.ts does not care which. */
function keypairSigner(kp: Keypair): Signer {
  return async (xdr) => {
    // why: rebuild the envelope with the testnet passphrase so the signature covers the right network hash.
    const tx = TransactionBuilder.fromXdr(xdr, NETWORK_PASSPHRASE)
    tx.sign(kp)
    return tx.toXdr()
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Friendbot occasionally 429s/503s under load; a funded account is a precondition, so retry it. */
async function fund(pk: string): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < 4; i++) {
    try {
      await fundWithFriendbot(pk)
      return
    } catch (err) {
      lastErr = err
      await sleep(2_000 * (i + 1))
    }
  }
  throw lastErr
}

/**
 * Re-read until `ok` holds. why: submitTransaction resolves once the tx is in a
 * closed ledger, but horizon-testnet sits behind a load balancer whose replicas
 * can lag that ledger by a few seconds, so an immediate read may be stale.
 * Returns the LAST value even when `ok` never held, so the assertion that
 * follows reports the real mismatch instead of a timeout.
 */
async function eventually<V>(read: () => Promise<V>, ok: (v: V) => boolean, tries = 12): Promise<V> {
  let last: V | undefined
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      last = await read()
      lastErr = undefined
      if (ok(last)) return last
    } catch (err) {
      lastErr = err
    }
    await sleep(2_000)
  }
  if (lastErr) throw lastErr
  return last as V
}

describe.skipIf(!E2E)('Chain Pet core on real testnet (tx -> chain -> engine)', () => {
  const a = Keypair.random()
  const b = Keypair.random()
  const c = Keypair.random()
  const A = a.publicKey()
  const B = b.publicKey()
  const C = c.publicKey()
  const signA = keypairSigner(a)
  const signB = keypairSigner(b)
  const signC = keypairSigner(c)
  const PET_ID = `${PET_ASSET_CODE}:${A}`

  let transferId = ''
  let inheritId = ''
  /** Latest full record; step 7 derives death from it offline. */
  let record: PetRecord | undefined

  beforeAll(async () => {
    // why: testnet accounts are created for free by Friendbot; all three must exist before any tx.
    await Promise.all([fund(A), fund(B), fund(C)])
  }, T)

  it('1. A hatches Pixel the dragon: an egg owned by A with an empty history', async () => {
    const { hash } = await submitOps(A, hatchOps('Pixel', 'dragonet'), signA)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)

    const res = await eventually(() => loadPetByAccount(A), (r) => r !== null)
    expect(res).not.toBeNull()
    if (!res) return
    expect(res.relation).toBe('owner')
    const r = res.record
    expect(r).toMatchObject({
      id: PET_ID,
      issuer: A,
      name: 'Pixel',
      species: 'dragonet',
      owner: A,
      lineage: [A],
      care: [],
      gifts: [],
    })
    expect(r.pendingTransfer).toBeUndefined()
    // bornAt is the hatch tx's ledger close time, so it must sit within clock skew of "now".
    expect(Math.abs(Date.now() - r.bornAt)).toBeLessThan(5 * MINUTE)

    const s = deriveState(r, Date.now())
    expect(s.stage).toBe('egg')
    expect(s.careCount).toBe(0)
    expect(s.alive).toBe(true)
    expect(s.diedAt).toBeUndefined()
    record = r
  }, T)

  it('2. A feeds: the egg hatches into a full, living baby', async () => {
    await submitOps(A, [careOp('feed')], signA)

    const res = await eventually(() => loadPetByAccount(A), (r) => (r?.record.care.length ?? 0) >= 1)
    expect(res).not.toBeNull()
    if (!res) return
    const r = res.record
    expect(r.care.map((e) => e.kind)).toEqual(['feed'])
    expect(r.care[0].by).toBe(A)
    expect(r.care[0].txHash).toMatch(/^[0-9a-f]{64}$/)
    expect(r.care[0].at).toBeGreaterThanOrEqual(r.bornAt)

    const s = deriveState(r, Date.now())
    expect(s.stage).toBe('baby')
    expect(s.hunger).toBeLessThanOrEqual(1)
    expect(s.careCount).toBe(1)
    expect(s.alive).toBe(true)
    expect(s.lastCare.feed).toBe(r.care[0].at)
    record = r
  }, T)

  it('3. A transfers to B unconditionally; B claims; lineage becomes [A, B]', async () => {
    await submitOps(A, [transferOp(A, A, B)], signA)

    // Sender side: A still owns the pet while the balance is unclaimed, and can see it leaving.
    const before = await eventually(() => resolveOwner(A), (o) => o.pendingTransfer !== undefined)
    expect(before.owner).toBe(A)
    expect(before.pendingTransfer).toMatchObject({ to: B, sponsor: A })
    expect(before.pendingTransfer?.claimableAfter).toBeUndefined()

    // Receiver side: the balance id comes from Horizon's claimant index (what the UI does via loadPendingClaimsFor).
    // why: Horizon indexes claimable balances by claimant, so a receiver can discover a pending transfer.
    const page = await server.claimableBalances().claimant(B).call()
    const cb = page.records.find((rec) => rec.asset === PET_ID)
    expect(cb).toBeDefined()
    if (!cb) return
    transferId = cb.id
    expect(transferId).toBe(before.pendingTransfer?.balanceId)
    const incoming = await loadPendingClaimsFor(B)
    expect(incoming).toHaveLength(1)
    expect(incoming[0].issuer).toBe(A)
    expect(incoming[0].transfer.balanceId).toBe(transferId)
    // The sender's own cancel-claimant is not "incoming" for the sender.
    expect(await loadPendingClaimsFor(A)).toEqual([])

    // B claims: trustline + claim + pet.prev=A in one tx.
    await submitOps(B, claimOps(A, B, transferId, A), signB)

    const byB = await eventually(() => loadPetByAccount(B), (r) => r?.relation === 'owner')
    expect(byB).not.toBeNull()
    if (!byB) return
    expect(byB.relation).toBe('owner')
    expect(byB.record.owner).toBe(B)
    expect(byB.record.lineage).toEqual([A, B])
    expect(byB.record.pendingTransfer).toBeUndefined()
    // Care history follows the pet across owners.
    expect(byB.record.care.map((e) => e.kind)).toEqual(['feed'])
    expect(byB.record.bornAt).toBe(record?.bornAt)

    const byA = await loadPetByAccount(A)
    expect(byA?.relation).toBe('issuer-not-owner')
    expect(byA?.record.owner).toBe(B)
    expect(await resolvePetForAccount(A)).toEqual({ issuer: A, relation: 'issuer-not-owner' })
    expect(await resolvePetForAccount(B)).toEqual({ issuer: A, relation: 'owner' })
    expect(await loadPendingClaimsFor(B)).toEqual([])
    record = byB.record
  }, T)

  it('4. B plays and cleans: care kinds [feed, play, clean] ascending across owners', async () => {
    await submitOps(B, [careOp('play')], signB)
    await submitOps(B, [careOp('clean')], signB)

    const res = await eventually(() => loadPetByAccount(B), (r) => (r?.record.care.length ?? 0) >= 3)
    expect(res).not.toBeNull()
    if (!res) return
    const r = res.record
    expect(r.care.map((e) => e.kind)).toEqual(['feed', 'play', 'clean'])
    expect(r.care.map((e) => e.by)).toEqual([A, B, B])
    for (let i = 1; i < r.care.length; i++) expect(r.care[i - 1].at).toBeLessThanOrEqual(r.care[i].at)

    const s = deriveState(r, Date.now())
    expect(s.careCount).toBe(3)
    expect(s.stage).toBe('baby')
    expect(s.alive).toBe(true)
    expect(s.cleanliness).toBeGreaterThanOrEqual(99)
    expect(s.happiness).toBeGreaterThanOrEqual(99)
    record = r
  }, T)

  it('5. C gifts B a cookie: 0.5 XLM with memo treat:cookie', async () => {
    const { hash } = await submitOps(C, [giftOp(B, '0.5')], signC, { memo: giftMemo('cookie') })

    const res = await eventually(() => loadPetByAccount(B), (r) => (r?.record.gifts.length ?? 0) >= 1)
    expect(res).not.toBeNull()
    if (!res) return
    const r = res.record
    expect(r.gifts).toHaveLength(1)
    expect(r.gifts[0]).toMatchObject({ kind: 'cookie', from: C, amountXlm: '0.5000000', txHash: hash })
    expect(r.gifts[0].at).toBeGreaterThanOrEqual(r.care[0].at)

    const s = deriveState(r, Date.now())
    expect(s.happiness).toBeGreaterThanOrEqual(99)
    expect(s.alive).toBe(true)
    record = r
  }, T)

  it('6. B names A as heir (claimable in 1h); A cannot claim early; B cancels', async () => {
    const claimableAfter = new Date(Date.now() + HOUR)
    await submitOps(B, [transferOp(A, B, A, { claimableAfter })], signB)

    // Owner = sponsor of the pending balance while the token is parked on the ledger.
    const pending = await eventually(() => resolveOwner(A), (o) => o.pendingTransfer !== undefined)
    expect(pending.owner).toBe(B)
    expect(pending.pendingTransfer).toMatchObject({ to: A, sponsor: B })
    if (!pending.pendingTransfer) return
    inheritId = pending.pendingTransfer.balanceId
    expect(pending.pendingTransfer.claimableAfter).toBeDefined()
    expect(Math.abs((pending.pendingTransfer.claimableAfter ?? 0) - claimableAfter.getTime())).toBeLessThan(5 * MINUTE)

    // The heir sees it as incoming with the same date; the sender does not.
    const claimsForA = await loadPendingClaimsFor(A)
    expect(claimsForA).toHaveLength(1)
    expect(claimsForA[0].issuer).toBe(A)
    expect(claimsForA[0].transfer.balanceId).toBe(inheritId)
    expect(claimsForA[0].transfer.claimableAfter).toBe(pending.pendingTransfer.claimableAfter)
    expect(await loadPendingClaimsFor(B)).toEqual([])

    // The sender still finds its pet after a reload even though its PET1 balance is 0 now.
    const byB = await loadPetByAccount(B)
    expect(byB?.relation).toBe('owner')
    expect(byB?.record.owner).toBe(B)
    expect(byB?.record.pendingTransfer?.balanceId).toBe(inheritId)
    expect(byB?.record.lineage).toEqual([A, B])

    // A tries to claim before the date: the network refuses with op_cannot_claim.
    const early = claimOps(A, A, inheritId, B)
    expect(early).toHaveLength(1)
    await expect(submitOps(A, early, signA)).rejects.toThrow(/op_cannot_claim/)

    // B cancels by claiming its own balance back.
    await submitOps(B, [cancelTransferOp(inheritId)], signB)
    const after = await eventually(() => resolveOwner(A), (o) => o.pendingTransfer === undefined)
    expect(after.owner).toBe(B)
    expect(after.pendingTransfer).toBeUndefined()
    expect(await loadPendingClaimsFor(A)).toEqual([])

    const res = await eventually(() => loadPetByAccount(B), (r) => r?.record.pendingTransfer === undefined)
    expect(res?.relation).toBe('owner')
    expect(res?.record.pendingTransfer).toBeUndefined()
    if (res) record = res.record
  }, T)

  it('7. neglect: dead 72h after the last care op, and sooner under the demo clock', async () => {
    const res = await loadPetByAccount(B)
    expect(res).not.toBeNull()
    if (!res) return
    const r = res.record
    expect(r.care.map((e) => e.kind)).toEqual(['feed', 'play', 'clean'])
    expect(r.care.map((e) => e.txHash)).toEqual(record?.care.map((e) => e.txHash))
    const lastCare = r.care[r.care.length - 1].at
    const now = Date.now()

    expect(deriveState(r, now).alive).toBe(true)

    // Real time: 80h with no care is past DEATH_AFTER (72h). Death is pinned to lastCare + 72h.
    const dead = deriveState(r, now + 80 * HOUR, 1)
    expect(dead.alive).toBe(false)
    expect(dead.diedAt).toBe(lastCare + THRESHOLDS.DEATH_AFTER)
    expect(dead.mood).toBe('miserable')
    expect(dead.statusLine).toMatch(/Rest in peace/)

    // Demo clock: timeScale multiplies ELAPSED real time, thresholds stay in real ms.
    // At 60x, 72h of neglect is 72 real minutes: 1 real hour after the last care is only
    // 60 scaled hours (still alive); 2 real hours is 120 scaled hours (dead), and the
    // reported diedAt is an unscaled ledger time: lastCare + 72h / 60.
    expect(deriveState(r, lastCare + HOUR, 60).alive).toBe(true)
    const scaled = deriveState(r, now + 2 * HOUR, 60)
    expect(scaled.alive).toBe(false)
    expect(scaled.diedAt).toBe(lastCare + THRESHOLDS.DEATH_AFTER / 60)
  }, T)
})
