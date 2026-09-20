// Real testnet round-trip for chain.ts. Gated: TESTNET_E2E=1 pnpm exec vitest run src/pet/chain.testnet.test.ts
// Uses throwaway Keypair.random() accounts funded by Friendbot. Never the user's keys.

import { beforeAll, describe, expect, it } from 'vitest'
import { Asset, Claimant, Keypair, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import type { Horizon } from '@stellar/stellar-sdk'
import { DATA_KEYS, FRIENDBOT_URL, NETWORK_PASSPHRASE, PET_ASSET_CODE } from '../stellar/config'
import { server } from '../stellar/horizon'
import {
  loadPendingClaimsFor,
  loadPetByAccount,
  loadPetRecord,
  parseTreatMemo,
  resolveOwner,
  resolvePetForAccount,
} from './chain'

// Why: tsconfig types only vite/client (no @types/node); Node provides `process` at runtime.
declare const process: { env: Record<string, string | undefined> }

const TIMEOUT = 120_000
/** Why: fee is per op in stroops; 1000 (0.0001 XLM) clears testnet surge pricing comfortably. */
const FEE = '1000'

describe('parseTreatMemo (pure)', () => {
  it('strips the prefix and rejects non-treats', () => {
    expect(parseTreatMemo('treat:apple')).toBe('apple')
    expect(parseTreatMemo('treat: cookie ')).toBe('cookie')
    expect(parseTreatMemo('treat:')).toBeNull()
    expect(parseTreatMemo('hello')).toBeNull()
    expect(parseTreatMemo(undefined)).toBeNull()
  })
})

async function fund(pk: string): Promise<void> {
  // Why: Friendbot creates and funds testnet accounts for free.
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pk)}`)
  if (!res.ok) throw new Error(`friendbot ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

type Build = (tb: TransactionBuilder) => TransactionBuilder

/** Build, sign with the source keypair, submit, and return Horizon's response. */
async function submit(source: Keypair, build: Build, memo?: Memo): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
  // Why: the builder needs the live sequence number of the source account.
  const account = await server.loadAccount(source.publicKey())
  let tb = build(new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK_PASSPHRASE }))
  if (memo) tb = tb.addMemo(memo)
  // Why: every tx must carry a timeout (or explicit time bounds) so it cannot linger forever.
  const tx = tb.setTimeout(60).build()
  tx.sign(source)
  try {
    return await server.submitTransaction(tx)
  } catch (err) {
    const e = err as { response?: { data?: { extras?: { result_codes?: unknown } } } }
    throw new Error(`submit failed: ${JSON.stringify(e.response?.data?.extras?.result_codes ?? String(err))}`, { cause: err })
  }
}

describe.skipIf(!process.env.TESTNET_E2E)('chain.ts on real testnet', () => {
  const A = Keypair.random()
  const B = Keypair.random()
  const pet = new Asset(PET_ASSET_CODE, A.publicKey())

  beforeAll(async () => {
    await Promise.all([fund(A.publicKey()), fund(B.publicKey())])

    // A hatches: name + species as data entries on the birth account.
    await submit(A, (tb) =>
      tb
        .addOperation(Operation.manageData({ name: DATA_KEYS.name, value: 'Mochi' }))
        .addOperation(Operation.manageData({ name: DATA_KEYS.species, value: 'tanuki' })),
    )
    // A feeds.
    await submit(A, (tb) => tb.addOperation(Operation.manageData({ name: DATA_KEYS.care, value: 'feed' })))

    // A transfers: 1 PET1 into an unconditional claimable balance for B.
    await submit(A, (tb) =>
      tb.addOperation(
        Operation.createClaimableBalance({
          asset: pet,
          amount: '1',
          claimants: [new Claimant(B.publicKey(), Claimant.predicateUnconditional())],
        }),
      ),
    )
    // Why: the claim op needs the balance id; Horizon indexes balances by claimant + asset.
    const balanceRecords = await server.claimableBalances().claimant(B.publicKey()).asset(pet).call()
    const balanceId = balanceRecords.records[0]?.id
    if (!balanceId) throw new Error('claimable balance not indexed by Horizon')

    // B claims: trustline + claim + pet.prev=A in ONE tx (the app's claim shape).
    await submit(B, (tb) =>
      tb
        .addOperation(Operation.changeTrust({ asset: pet, limit: '1' }))
        .addOperation(Operation.claimClaimableBalance({ balanceId }))
        .addOperation(Operation.manageData({ name: DATA_KEYS.prev, value: A.publicKey() })),
    )
    // B plays.
    await submit(B, (tb) => tb.addOperation(Operation.manageData({ name: DATA_KEYS.care, value: 'play' })))
    // A gifts B a treat: XLM payment with text memo.
    await submit(
      A,
      (tb) => tb.addOperation(Operation.payment({ destination: B.publicKey(), asset: Asset.native(), amount: '0.5' })),
      Memo.text('treat:apple'),
    )
  }, TIMEOUT)

  it(
    'B is the owner with full lineage, care and gifts',
    async () => {
      const res = await loadPetByAccount(B.publicKey())
      expect(res).not.toBeNull()
      if (!res) return
      expect(res.relation).toBe('owner')
      const r = res.record
      expect(r.id).toBe(`${PET_ASSET_CODE}:${A.publicKey()}`)
      expect(r.issuer).toBe(A.publicKey())
      expect(r.name).toBe('Mochi')
      expect(r.species).toBe('tanuki')
      expect(r.owner).toBe(B.publicKey())
      expect(r.lineage).toEqual([A.publicKey(), B.publicKey()])
      expect(r.care.map((c) => c.kind)).toEqual(['feed', 'play'])
      expect(r.care[0].by).toBe(A.publicKey())
      expect(r.care[1].by).toBe(B.publicKey())
      expect(r.care[0].at).toBeLessThanOrEqual(r.care[1].at)
      expect(r.bornAt).toBeLessThanOrEqual(r.care[0].at)
      expect(r.bornAt).toBeGreaterThan(Date.now() - 10 * 60_000)
      for (const c of r.care) expect(c.txHash).toMatch(/^[0-9a-f]{64}$/)
      expect(r.gifts).toHaveLength(1)
      expect(r.gifts[0]).toMatchObject({ kind: 'apple', from: A.publicKey(), amountXlm: '0.5000000' })
      expect(r.gifts[0].at).toBeGreaterThanOrEqual(r.care[1].at)
      expect(r.pendingTransfer).toBeUndefined()
    },
    TIMEOUT,
  )

  it(
    'A is the issuer but no longer the owner',
    async () => {
      const res = await loadPetByAccount(A.publicKey())
      expect(res).not.toBeNull()
      expect(res?.relation).toBe('issuer-not-owner')
      expect(res?.record.owner).toBe(B.publicKey())

      const resolved = await resolvePetForAccount(A.publicKey())
      expect(resolved).toEqual({ issuer: A.publicKey(), relation: 'issuer-not-owner' })
      const resolvedB = await resolvePetForAccount(B.publicKey())
      expect(resolvedB).toEqual({ issuer: A.publicKey(), relation: 'owner' })
    },
    TIMEOUT,
  )

  it(
    'unknown accounts resolve to null',
    async () => {
      const stranger = Keypair.random().publicKey()
      expect(await resolvePetForAccount(stranger)).toBeNull()
      expect(await loadPetRecord(stranger)).toBeNull()
      expect(await loadPetByAccount(stranger)).toBeNull()
    },
    TIMEOUT,
  )

  it(
    'pending inheritance: B sends the pet back to A, claimable in 1h',
    async () => {
      const notBefore = Math.floor(Date.now() / 1000) + 3600
      // Why: "not before T" is expressed as NOT(before T). The sender stays an unconditional claimant to cancel.
      await submit(B, (tb) =>
        tb.addOperation(
          Operation.createClaimableBalance({
            asset: pet,
            amount: '1',
            claimants: [
              new Claimant(A.publicKey(), Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(String(notBefore)))),
              new Claimant(B.publicKey(), Claimant.predicateUnconditional()),
            ],
          }),
        ),
      )

      const { owner, pendingTransfer } = await resolveOwner(A.publicKey())
      expect(owner).toBe(B.publicKey())
      expect(pendingTransfer).toBeDefined()
      expect(pendingTransfer?.to).toBe(A.publicKey())
      expect(pendingTransfer?.sponsor).toBe(B.publicKey())
      expect(pendingTransfer?.balanceId).toMatch(/^[0-9a-f]+$/)
      expect(pendingTransfer?.claimableAfter).toBe(notBefore * 1000)

      // The full record still resolves through the pending sponsor.
      const record = await loadPetRecord(A.publicKey())
      expect(record?.owner).toBe(B.publicKey())
      expect(record?.pendingTransfer?.to).toBe(A.publicKey())
      expect(record?.lineage).toEqual([A.publicKey(), B.publicKey()])

      // The sender's balance is now 0, but they still own the pet and must find it
      // (and the balanceId to cancel) after a reload: the sponsor lookup covers this.
      const byB = await loadPetByAccount(B.publicKey())
      expect(byB).not.toBeNull()
      expect(byB?.relation).toBe('owner')
      expect(byB?.record.pendingTransfer?.balanceId).toBe(pendingTransfer?.balanceId)
      expect(await resolvePetForAccount(B.publicKey())).toEqual({ issuer: A.publicKey(), relation: 'owner' })

      // The heir discovers the incoming pet by claimant; the sender's cancel claimant is not "incoming".
      const claimsForA = await loadPendingClaimsFor(A.publicKey())
      expect(claimsForA).toHaveLength(1)
      expect(claimsForA[0].issuer).toBe(A.publicKey())
      expect(claimsForA[0].transfer.balanceId).toBe(pendingTransfer?.balanceId)
      expect(claimsForA[0].transfer.claimableAfter).toBe(notBefore * 1000)
      expect(await loadPendingClaimsFor(B.publicKey())).toEqual([])
    },
    TIMEOUT,
  )
})

describe.skipIf(!process.env.TESTNET_E2E)('chain.ts paging on a busy account', () => {
  const D = Keypair.random()
  /** Why: Stellar allows at most 100 ops per tx; 10 such txs push the account past 1000 ops. */
  const OPS_PER_TX = 100
  const CARE_TXS = 10

  beforeAll(async () => {
    await fund(D.publicKey())
    await submit(D, (tb) =>
      tb
        .addOperation(Operation.manageData({ name: DATA_KEYS.name, value: 'Busy' }))
        .addOperation(Operation.manageData({ name: DATA_KEYS.species, value: 'dragonet' })),
    )
    // Why: re-setting the same key overwrites the entry (one subentry) but every op stays in the log.
    for (let t = 0; t < CARE_TXS; t++) {
      await submit(D, (tb) => {
        for (let i = 0; i < OPS_PER_TX; i++) tb = tb.addOperation(Operation.manageData({ name: DATA_KEYS.care, value: 'play' }))
        return tb
      })
    }
    await submit(D, (tb) => tb.addOperation(Operation.manageData({ name: DATA_KEYS.care, value: 'clean' })))
  }, 5 * TIMEOUT)

  it(
    'keeps the NEWEST care and the real birth time past the page cap',
    async () => {
      const r = await loadPetRecord(D.publicKey())
      expect(r).not.toBeNull()
      if (!r) return
      expect(r.name).toBe('Busy')
      expect(r.owner).toBe(D.publicKey())
      expect(r.lineage).toEqual([D.publicKey()])
      // The last op is the one that matters for a living pet: it must never be dropped.
      expect(r.care[r.care.length - 1].kind).toBe('clean')
      // More than one page was followed (a single page holds at most 200 ops).
      expect(r.care.length).toBeGreaterThan(200)
      // Birth time is the hatch ledger time, found even though it fell off the newest pages.
      expect(r.bornAt).toBeLessThanOrEqual(r.care[0].at)
      expect(r.bornAt).toBeGreaterThan(Date.now() - 30 * 60_000)
      for (let i = 1; i < r.care.length; i++) expect(r.care[i - 1].at).toBeLessThanOrEqual(r.care[i].at)
    },
    TIMEOUT,
  )
})
