// Read-only: rebuild everything the chain knows about one pet into a PetRecord.
// Every fact comes from Horizon. Timing comes ONLY from `created_at` of op
// records (ledger close time), never from a value someone wrote into data.

import { Asset, Horizon, StrKey } from '@stellar/stellar-sdk'
import { DATA_KEYS, PET_ASSET_CODE, TREAT_MEMO_PREFIX } from '../stellar/config'
import { decodeDataValue, loadAccountOrNull, server } from '../stellar/horizon'
import type { AccountRecord } from '../stellar/horizon'
import { CARE_KINDS, normalizeSpecies } from './types'
import type { CareEvent, CareKind, GiftEvent, PendingTransfer, PetRecord, Species } from './types'

type CollectionPage<T extends Horizon.HorizonApi.BaseResponse> = Horizon.ServerApi.CollectionPage<T>
type OperationRecord = Horizon.ServerApi.OperationRecord
type ManageDataOp = Horizon.ServerApi.ManageDataOperationRecord
type PaymentOp = Horizon.ServerApi.PaymentOperationRecord
type ClaimableBalanceRecord = Horizon.ServerApi.ClaimableBalanceRecord
type Predicate = Horizon.HorizonApi.Predicate

export type PetRelation = 'owner' | 'issuer-not-owner'

/** A pet in flight TO an account: what it needs to build the claim tx (see `claimOps` in tx.ts). */
export interface PendingClaim {
  issuer: string
  transfer: PendingTransfer
}

/** Horizon page size we ask for, and how many pages we follow per account. */
const PAGE_LIMIT = 200
const MAX_PAGES = 5
const MAX_LINEAGE_HOPS = 20
/** A pet is exactly one whole token. Horizon prints amounts with 7 decimals. */
const ONE_PET = '1.0000000'

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** `treat:apple` -> `apple`. Null when the memo is not a treat. */
export function parseTreatMemo(memo: string | undefined): string | null {
  if (!memo || !memo.startsWith(TREAT_MEMO_PREFIX)) return null
  const kind = memo.slice(TREAT_MEMO_PREFIX.length).trim()
  return kind.length > 0 ? kind : null
}

/** Why: the pet token is `PET1` issued by the birth account; that pair is its ID. */
function petAsset(issuer: string): Asset {
  return new Asset(PET_ASSET_CODE, issuer)
}

/** Horizon prints a non-native asset as `CODE:ISSUER`. The issuer when it is a pet token, else null. */
function petIssuerOf(asset: string): string | null {
  const [code, issuer] = asset.split(':')
  return code === PET_ASSET_CODE && issuer && StrKey.isValidEd25519PublicKey(issuer) ? issuer : null
}

/** Horizon timestamps are ISO-8601 (`2026-09-19T10:00:00Z`) -> unix ms. */
function toMs(iso: string): number {
  return Date.parse(iso)
}

function toSpecies(raw: string): Species {
  return normalizeSpecies(raw)
}

function isCareKind(raw: string): raw is CareKind {
  return (CARE_KINDS as readonly string[]).includes(raw)
}

/** Horizon op ids are decimal strings that can exceed 2^53; compare safely. */
function compareIds(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0
}

function isManageData(op: OperationRecord): op is ManageDataOp {
  return (op as { type: string }).type === 'manage_data'
}

function isPayment(op: { type: string }): op is PaymentOp {
  return op.type === 'payment'
}

/** Issuer of the PET1 this account holds exactly one of (optionally a specific issuer). */
function holdsOnePet(account: { balances: Horizon.HorizonApi.BalanceLine[] }, issuer?: string): string | null {
  for (const b of account.balances) {
    if (!('asset_code' in b)) continue
    if (b.asset_code !== PET_ASSET_CODE || b.balance !== ONE_PET) continue
    if (issuer && b.asset_issuer !== issuer) continue
    return b.asset_issuer
  }
  return null
}

/** A claimable balance that is exactly one pet token: its issuer, else null. */
function petInFlight(rec: ClaimableBalanceRecord): string | null {
  return rec.amount === ONE_PET ? petIssuerOf(rec.asset) : null
}

/**
 * Inheritance predicate -> earliest claim time in unix ms.
 * Horizon renders "not before T" as `{ not: { abs_before: ISO, abs_before_epoch: secs } }`.
 * Returns undefined for an unconditional (claim-now) predicate.
 */
function claimableAfterFromPredicate(p: Predicate | undefined): number | undefined {
  if (!p) return undefined
  if (p.not) {
    const inner = p.not
    if (inner.abs_before_epoch) return Number(inner.abs_before_epoch) * 1000
    if (inner.abs_before) return toMs(inner.abs_before)
    return undefined
  }
  if (p.and) {
    const times = p.and.map(claimableAfterFromPredicate).filter((t): t is number => t !== undefined)
    return times.length ? Math.max(...times) : undefined
  }
  if (p.or) {
    const times = p.or.map(claimableAfterFromPredicate).filter((t): t is number => t !== undefined)
    return times.length ? Math.min(...times) : undefined
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Horizon paging
// ---------------------------------------------------------------------------

/** Why: Horizon pages results; follow `next` links, but never forever. */
async function collectPages<T extends Horizon.HorizonApi.BaseResponse>(
  first: Promise<CollectionPage<T>>,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = []
  let page = await first
  for (let i = 0; i < maxPages; i++) {
    out.push(...page.records)
    if (page.records.length < PAGE_LIMIT) break
    page = await page.next()
  }
  return out
}

/**
 * Same, for a time-ordered feed requested NEWEST first. Stops as soon as
 * `coversStart` says a page already reaches back to everything we need, and
 * returns the records oldest first.
 * Why: /accounts/{id}/operations lists every op that touches the account
 * (received payments, unrelated activity), so a busy owner blows through the
 * page cap. Walking backwards means the cap can only ever drop the OLDEST
 * records, never the latest care.
 */
async function collectPagesDesc<T extends Horizon.HorizonApi.BaseResponse>(
  first: Promise<CollectionPage<T>>,
  coversStart: (page: T[]) => boolean,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = []
  let page = await first
  for (let i = 0; i < maxPages; i++) {
    out.push(...page.records)
    if (page.records.length < PAGE_LIMIT || coversStart(page.records)) break
    page = await page.next()
  }
  return out.reverse()
}

/** Page predicate: the page's oldest record is already older than `since` (unix ms). */
function reachesBack(since: number): (page: { created_at: string }[]) => boolean {
  return (page) => page.length > 0 && toMs(page[page.length - 1].created_at) < since
}

/** Successful manageData ops signed by `account` itself (not ops merely touching it), oldest first. */
function ownManageData(records: OperationRecord[], account: string): ManageDataOp[] {
  return records
    .filter(isManageData)
    .filter((op) => op.source_account === account && op.transaction_successful !== false)
    .sort((a, b) => toMs(a.created_at) - toMs(b.created_at) || compareIds(a.id, b.id))
}

/**
 * The account's manageData history, walked newest first until `coversStart` holds.
 * Why: the ops log is the immutable history; the data entry is only the latest value.
 */
async function loadManageDataOps(
  account: string,
  coversStart: (page: OperationRecord[]) => boolean,
): Promise<ManageDataOp[]> {
  const records = await collectPagesDesc(
    server.operations().forAccount(account).limit(PAGE_LIMIT).order('desc').call(),
    coversStart,
  )
  return ownManageData(records, account)
}

/** manageData ops by `account` from `since` (unix ms) onward, oldest first. */
async function loadManageDataOpsSince(account: string, since: number): Promise<ManageDataOp[]> {
  const ops = await loadManageDataOps(account, reachesBack(since))
  return ops.filter((op) => toMs(op.created_at) >= since)
}

/**
 * The issuer's manageData history back to its hatch, plus the birth time.
 * Why: birth time is the ledger close time of the hatch (`pet.name`) op. It is
 * never a stored value and never the client clock; if the hatch cannot be
 * found there is no birth time, so this returns null instead of inventing one.
 */
async function loadIssuerHistory(issuer: string): Promise<{ ops: ManageDataOp[]; bornAt: number } | null> {
  const isHatch = (op: OperationRecord): boolean =>
    isManageData(op) && op.source_account === issuer && op.name === DATA_KEYS.name
  // Walk back until a page holds the hatch; nothing older can belong to the pet.
  const ops = await loadManageDataOps(issuer, (page) => page.some(isHatch))
  let hatch = ops.find((op) => op.name === DATA_KEYS.name)
  if (!hatch) {
    // Why: the page cap was hit first. The hatch is among the account's earliest ops,
    // so one oldest-first page finds it even when the newest pages did not.
    const first = await server.operations().forAccount(issuer).limit(PAGE_LIMIT).order('asc').call()
    hatch = ownManageData(first.records, issuer).find((op) => op.name === DATA_KEYS.name)
    if (!hatch) return null
  }
  const bornAt = toMs(hatch.created_at)
  return { ops: ops.filter((op) => toMs(op.created_at) >= bornAt), bornAt }
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Who owns pet `PET1:issuer` right now.
 * Rule (CLAUDE.md): holder of 1 PET1 > sponsor of a pending claimable balance > issuer.
 */
export async function resolveOwner(issuer: string): Promise<{ owner: string; pendingTransfer?: PendingTransfer }> {
  const asset = petAsset(issuer)
  const [trustlineAccounts, balances] = await Promise.all([
    // Why: /accounts?asset= lists every account with a trustline to PET1:issuer (balance may be 0).
    collectPages(server.accounts().forAsset(asset).limit(PAGE_LIMIT).order('asc').call()),
    // Why: a transfer in flight lives in a claimable balance, held by neither party.
    collectPages(server.claimableBalances().asset(asset).limit(PAGE_LIMIT).order('asc').call()),
  ])

  const holder = trustlineAccounts.find((a) => holdsOnePet(a, issuer) !== null)
  const pending = toPendingTransfer(balances.find((b) => b.sponsor !== undefined && b.amount === ONE_PET) ?? balances.find((b) => b.sponsor !== undefined))

  if (holder) {
    // A holder and a pending balance can only coexist transiently; trust the holder,
    // but still surface the transfer if that same holder is the one sending it away.
    return pending && pending.sponsor === holder.account_id
      ? { owner: holder.account_id, pendingTransfer: pending }
      : { owner: holder.account_id }
  }
  if (pending) return { owner: pending.sponsor, pendingTransfer: pending }
  // Why: issuers never hold their own asset, so a never-transferred pet has no holder.
  return { owner: issuer }
}

function toPendingTransfer(rec: ClaimableBalanceRecord | undefined): PendingTransfer | undefined {
  if (!rec || !rec.sponsor) return undefined
  const sponsor = rec.sponsor
  // Why: inheritance balances list the sender too (unconditional) so they can cancel;
  // the real recipient is the claimant that is not the sponsor.
  const heir = rec.claimants.find((c) => c.destination !== sponsor) ?? rec.claimants[0]
  if (!heir) return undefined
  const claimableAfter = claimableAfterFromPredicate(heir.predicate)
  return {
    balanceId: rec.id,
    to: heir.destination,
    ...(claimableAfter !== undefined ? { claimableAfter } : {}),
    sponsor,
  }
}

/** Which pet, if any, an account is connected to, and how. */
async function findIssuerForAccount(
  account: AccountRecord,
): Promise<{ issuer: string; viaBalance: boolean } | null> {
  // 1) Holding exactly one PET1 of some issuer means this account owns that pet.
  const heldIssuer = holdsOnePet(account)
  if (heldIssuer) return { issuer: heldIssuer, viaBalance: true }
  // 2) Sponsoring a pending PET1 claimable balance means this account is sending its pet
  //    away and still owns it until claimed (CLAUDE.md sponsor rule). Its own balance is 0
  //    meanwhile, so without this the sender loses sight of the pet after a reload.
  //    Why: Horizon indexes claimable balances by sponsor; resolveOwner then confirms ownership.
  const sponsored = await collectPages(
    server.claimableBalances().sponsor(account.account_id).limit(PAGE_LIMIT).order('asc').call(),
  )
  for (const b of sponsored) {
    const issuer = petInFlight(b)
    if (issuer) return { issuer, viaBalance: false }
  }
  // 3) A `pet.name` data entry means this account hatched its own pet (it is the issuer).
  if (account.data_attr[DATA_KEYS.name] !== undefined) return { issuer: account.account_id, viaBalance: false }
  return null
}

export async function resolvePetForAccount(
  address: string,
): Promise<{ issuer: string; relation: 'owner' | 'issuer-not-owner' | 'none' } | null> {
  const account = await loadAccountOrNull(address)
  if (!account) return null
  const found = await findIssuerForAccount(account)
  if (!found) return null
  if (found.viaBalance) return { issuer: found.issuer, relation: 'owner' }
  // The account hatched this pet or is sending it away; resolveOwner decides if it still owns it.
  const { owner } = await resolveOwner(found.issuer)
  return { issuer: found.issuer, relation: owner === address ? 'owner' : 'issuer-not-owner' }
}

/**
 * Pets being sent TO `address`: every pending PET1 claimable balance that names it
 * as recipient/heir. This is how a claimant discovers the balanceId to claim.
 * Why: Horizon indexes claimable balances by claimant; the sender's own cancel
 * claimant is filtered out because for them the pet is not incoming.
 */
export async function loadPendingClaimsFor(address: string): Promise<PendingClaim[]> {
  const balances = await collectPages(
    server.claimableBalances().claimant(address).limit(PAGE_LIMIT).order('asc').call(),
  )
  const claims: PendingClaim[] = []
  for (const b of balances) {
    const issuer = petInFlight(b)
    if (!issuer) continue
    const transfer = toPendingTransfer(b)
    if (!transfer || transfer.to !== address) continue
    claims.push({ issuer, transfer })
  }
  return claims
}

// ---------------------------------------------------------------------------
// Full record
// ---------------------------------------------------------------------------

/**
 * Null when `issuer` has no pet. Throws when the pet exists (name entry present)
 * but its hatch op cannot be located in Horizon history: that is a read failure,
 * not an absent pet, and the birth time must never be fabricated.
 */
export async function loadPetRecord(issuer: string): Promise<PetRecord | null> {
  const issuerAccount = await loadAccountOrNull(issuer)
  if (!issuerAccount) return null
  const nameB64 = issuerAccount.data_attr[DATA_KEYS.name]
  if (nameB64 === undefined) return null

  // Why: data entries arrive base64-encoded from Horizon.
  const name = decodeDataValue(nameB64)
  const species = toSpecies(decodeDataValue(issuerAccount.data_attr[DATA_KEYS.species]))

  const [history, ownership] = await Promise.all([loadIssuerHistory(issuer), resolveOwner(issuer)])
  if (!history) {
    throw new Error(`${PET_ASSET_CODE}:${issuer} has a ${DATA_KEYS.name} entry but no hatch op was found in its Horizon history`)
  }
  const { ops: issuerOps, bornAt } = history
  const { owner, pendingTransfer } = ownership

  const lineage = await walkLineage(issuer, owner)

  // Care windows: starts[i] is when lineage[i] took over, opsByMember[i] its ops from then on.
  // The issuer starts at birth.
  const starts: number[] = [bornAt]
  const opsByMember: ManageDataOp[][] = [issuerOps]
  for (let i = 1; i < lineage.length; i++) {
    const member = lineage[i]
    const prev = lineage[i - 1]
    // Why: lineage[i] cannot have taken over before lineage[i-1] did, so older ops are irrelevant.
    const ops = await loadManageDataOpsSince(member, starts[i - 1])
    // Why: the claim tx writes `pet.prev=<previous owner>`; its created_at is the handover time.
    const handover = ops.find((op) => op.name === DATA_KEYS.prev && decodeDataValue(op.value) === prev)
    // The expected handover is missing when the lineage walk skipped an owner (a pet that
    // came back to a previous owner only keeps the latest `pet.prev`). Then the member's
    // first claim of any origin, else its first care, still marks where its chapter began.
    // Reusing starts[i-1] is the last resort: it makes the previous owner's window empty.
    const startOp = handover ?? ops.find((op) => op.name === DATA_KEYS.prev) ?? ops.find((op) => op.name === DATA_KEYS.care)
    starts.push(startOp ? toMs(startOp.created_at) : starts[i - 1])
    opsByMember.push(ops)
  }

  const care: CareEvent[] = []
  for (let i = 0; i < lineage.length; i++) {
    const from = Math.max(starts[i], bornAt)
    const to = i + 1 < lineage.length ? starts[i + 1] : Number.POSITIVE_INFINITY
    for (const op of opsByMember[i]) {
      if (op.name !== DATA_KEYS.care) continue
      const kind = decodeDataValue(op.value)
      if (!isCareKind(kind)) continue
      const at = toMs(op.created_at)
      if (at < from || at >= to) continue
      care.push({ kind, at, by: op.source_account, txHash: op.transaction_hash })
    }
  }
  care.sort((a, b) => a.at - b.at)

  const ownerStart = Math.max(starts[starts.length - 1], bornAt)
  const gifts = await loadGifts(owner, ownerStart)

  return {
    id: `${PET_ASSET_CODE}:${issuer}`,
    issuer,
    name,
    species,
    bornAt,
    owner,
    lineage,
    care,
    gifts,
    ...(pendingTransfer ? { pendingTransfer } : {}),
  }
}

/**
 * Follow `pet.prev` data entries from the current owner back to the issuer.
 * Returns birth -> current, with lineage[0] === issuer.
 */
async function walkLineage(issuer: string, owner: string): Promise<string[]> {
  const chain: string[] = []
  const visited = new Set<string>()
  let cur = owner
  for (let hop = 0; hop < MAX_LINEAGE_HOPS; hop++) {
    if (visited.has(cur)) break
    visited.add(cur)
    chain.unshift(cur)
    if (cur === issuer) break
    const account = await loadAccountOrNull(cur)
    const prev = decodeDataValue(account?.data_attr[DATA_KEYS.prev])
    // Why: StrKey validates the G... checksum so a garbage entry cannot send us to Horizon.
    if (!prev || !StrKey.isValidEd25519PublicKey(prev)) break
    cur = prev
  }
  if (chain[0] !== issuer) chain.unshift(issuer)
  return chain
}

/**
 * Native XLM payments to `owner` whose tx memo is `treat:<kind>`, from `since` onwards.
 * Why: `join=transactions` embeds each payment's tx so we can read the memo in one request.
 * Walked newest first for the same reason as the ops log: the cap must not drop new treats.
 */
async function loadGifts(owner: string, since: number): Promise<GiftEvent[]> {
  const records = await collectPagesDesc(
    server.payments().forAccount(owner).join('transactions').limit(PAGE_LIMIT).order('desc').call(),
    reachesBack(since),
  )
  const gifts: GiftEvent[] = []
  for (const rec of records) {
    if (!isPayment(rec)) continue
    if (rec.to !== owner || rec.asset_type !== 'native') continue
    if (rec.transaction_successful === false) continue
    const at = toMs(rec.created_at)
    if (at < since) continue
    const tx = await joinedTransaction(rec)
    if (!tx || tx.memo_type !== 'text') continue
    const kind = parseTreatMemo(tx.memo)
    if (!kind) continue
    gifts.push({ kind, amountXlm: rec.amount, from: rec.from, at, txHash: rec.transaction_hash })
  }
  gifts.sort((a, b) => a.at - b.at)
  return gifts
}

interface JoinedTx {
  memo_type?: string
  memo?: string
}

/**
 * The SDK moves a joined `transaction` object to `transaction_attr` and replaces
 * `transaction` with a fetch function. Prefer the embedded copy; fall back to fetching.
 */
async function joinedTransaction(rec: PaymentOp): Promise<JoinedTx | null> {
  const embedded = (rec as unknown as { transaction_attr?: JoinedTx }).transaction_attr
  if (embedded) return embedded
  try {
    return await rec.transaction()
  } catch {
    return null
  }
}

export async function loadPetByAccount(address: string): Promise<{ record: PetRecord; relation: PetRelation } | null> {
  const account = await loadAccountOrNull(address)
  if (!account) return null
  const found = await findIssuerForAccount(account)
  if (!found) return null
  const record = await loadPetRecord(found.issuer)
  if (!record) return null
  return { record, relation: record.owner === address ? 'owner' : 'issuer-not-owner' }
}
