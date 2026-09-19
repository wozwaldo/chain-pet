// Build, sign and submit Stellar transactions, plus one op builder per Chain Pet
// action. This file never imports freighter.ts on purpose: signing is injected
// as a `Signer` so the app can sign with Freighter and node tests with a Keypair.

import { AccountRequiresMemoError, Asset, BASE_FEE, Claimant, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import type { Transaction, xdr } from '@stellar/stellar-sdk'
import { DATA_KEYS, NETWORK_PASSPHRASE, PET_ASSET_CODE, TREAT_MEMO_PREFIX } from './config'
import { server } from './horizon'
import { CARE_KINDS, SPECIES, TREAT_KINDS } from '../pet/types'
import type { CareKind, Species, TreatKind } from '../pet/types'

/** Takes an unsigned base64 transaction XDR, returns the signed base64 XDR. */
export type Signer = (xdr: string) => Promise<string>

/** Text memo, max 28 bytes UTF-8. Gifts use `treat:<kind>`. */
interface TxOpts {
  memo?: string
}

export const MIN_GIFT_XLM = '0.1'
export const MAX_GIFT_XLM = '5'

/** Seconds a built tx stays valid. Long enough for a Freighter prompt. */
const TX_TIMEOUT_SECONDS = 120

/**
 * Max fee BID per operation, in stroops: 10 x BASE_FEE = 1000 = 0.0001 XLM.
 * why: the network charges the ledger's effective base fee (100 stroops when
 * calm) up to this bid, never the bid itself, so bidding higher is free in
 * normal conditions and keeps txs landing under surge pricing instead of
 * failing with tx_insufficient_fee.
 */
export const MAX_FEE_PER_OP = String(10 * Number(BASE_FEE))

/** Max bytes of a Stellar text memo. */
const MEMO_TEXT_MAX_BYTES = 28
/** Max bytes of a manageData value (and key). */
const DATA_VALUE_MAX_BYTES = 64
const PET_NAME_MAX_CHARS = 24

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

/** Why: a Stellar asset is (code, issuer); `PET1:<issuer>` is the pet's permanent ID. */
export function petAsset(issuer: string): Asset {
  return new Asset(PET_ASSET_CODE, issuer)
}

// ---------------------------------------------------------------------------
// Build / sign / submit
// ---------------------------------------------------------------------------

export async function buildTx(source: string, ops: xdr.Operation[], opts: TxOpts = {}): Promise<Transaction> {
  if (ops.length === 0) throw new Error('buildTx: a transaction needs at least one operation')
  // why: every tx must carry the source account's next sequence number, so load it fresh from Horizon.
  const account = await server.loadAccount(source)
  // why: `fee` is the max bid per operation in stroops (see MAX_FEE_PER_OP); the passphrase binds the signature to testnet.
  const builder = new TransactionBuilder(account, { fee: MAX_FEE_PER_OP, networkPassphrase: NETWORK_PASSPHRASE })
  for (const op of ops) builder.addOperation(op)
  // why: a text memo is the only free-form tx-level field (28 bytes); gifts use it to tag the treat kind.
  if (opts.memo !== undefined) builder.addMemo(Memo.text(opts.memo))
  // why: timebounds make the tx expire, so a stale unsigned tx cannot be replayed much later.
  builder.setTimeout(TX_TIMEOUT_SECONDS)
  return builder.build()
}

export async function signAndSubmit(tx: Transaction, sign: Signer): Promise<{ hash: string }> {
  // why: wallets sign the XDR envelope (not our JS objects) and hand back a new envelope with the signature attached.
  const signedXdr = await sign(tx.toXdr())
  // why: rebuild the signed envelope with the same passphrase so its hash matches what testnet will verify.
  const signed = TransactionBuilder.fromXdr(signedXdr, NETWORK_PASSPHRASE)
  try {
    // why: Horizon forwards the tx to stellar-core and waits until it lands in a closed ledger (or fails).
    const res = await server.submitTransaction(signed)
    return { hash: res.hash }
  } catch (err) {
    // why: an HTTP reply (any status) is Horizon's verdict on this tx. No reply (connection dropped after the
    // POST, client-side timeout) means the tx may already be in a ledger, so a blind retry of a gift could pay twice.
    // The SDK's memo-required precheck throws before anything is sent, so it is a definite failure too.
    const definite = hasHttpResponse(err) || err instanceof AccountRequiresMemoError
    throw new Error(
      definite
        ? explainHorizonError(err)
        : `${explainHorizonError(err)}; the transaction may still have been accepted, check the account before retrying`,
      { cause: err },
    )
  }
}

export async function submitOps(
  source: string,
  ops: xdr.Operation[],
  sign: Signer,
  opts: TxOpts = {},
): Promise<{ hash: string }> {
  let tx: Transaction
  try {
    tx = await buildTx(source, ops, opts)
  } catch (err) {
    // why: loadAccount 404s when the source was never funded; turn that into a readable message too.
    throw new Error(explainHorizonError(err), { cause: err })
  }
  return signAndSubmit(tx, sign)
}

// ---------------------------------------------------------------------------
// Error explanation
// ---------------------------------------------------------------------------

/** Transaction-level result codes. https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/transactions */
const TX_CODE_TEXT: Record<string, string> = {
  tx_bad_seq: 'the account sequence number is stale (another transaction went through first); reload and try again',
  tx_bad_auth: 'the signature is invalid: signed by a different account or for a different network',
  tx_bad_auth_extra: 'the transaction carries an unexpected extra signature',
  tx_insufficient_fee: 'the network fee is too low for the current load; try again in a moment',
  tx_insufficient_balance: 'the source account cannot pay the network fee',
  tx_too_early: 'the transaction is not valid yet (check the device clock)',
  tx_too_late: 'the transaction expired before it reached the network; build it again',
  tx_no_source_account: 'the source account does not exist on testnet',
  tx_missing_operation: 'the transaction has no operations',
  tx_failed: 'one of the operations failed',
}

/** Operation-level result codes shared across op types. */
const OP_CODE_TEXT: Record<string, string> = {
  op_underfunded: 'not enough XLM (or asset) to send that amount',
  op_no_trust: 'the receiving account has no trustline for this asset',
  op_low_reserve: 'not enough spare XLM to reserve a new ledger entry (a trustline, data entry or claimable balance each lock ~0.5 XLM)',
  op_line_full: 'the receiving trustline limit would be exceeded',
  op_no_source_account: 'the operation source account does not exist',
  op_no_destination: 'the destination account does not exist on testnet',
  op_does_not_exist: 'the claimable balance no longer exists (already claimed or cancelled)',
  op_cannot_claim: 'the claim condition is not met yet (for example the "not before" date has not passed)',
  op_self_not_allowed: 'an account cannot do this to itself (for example trust its own asset)',
  op_bad_auth: 'the operation is missing a valid signature from its source account',
  op_malformed: 'the operation is malformed (bad amount, asset or claimants)',
  op_not_supported: 'the operation is not supported by the network',
}

/** Horizon problem+json body. https://developers.stellar.org/docs/data/horizon/api-reference/errors */
interface HorizonProblem {
  status?: number
  title?: string
  detail?: string
  extras?: {
    result_codes?: { transaction?: string; operations?: string[] }
  }
}

/**
 * stellar-sdk 17 wraps errors two ways. `submitTransaction` (wrapHttpError):
 * `response = { status, statusText, data: <problem> }`. Every call builder
 * (`loadAccount`, `claimableBalances()...`, via `_handleNetworkError`):
 * `response = <problem>` itself, with no `data`. Read both.
 */
interface HorizonErrorShape {
  message?: string
  response?: HorizonProblem & { statusText?: string; data?: HorizonProblem }
}

/** True when Horizon actually answered (any HTTP status), not a connection-level failure. */
function hasHttpResponse(err: unknown): boolean {
  const e = err as HorizonErrorShape | null | undefined
  return e?.response !== undefined && e?.response !== null
}

/**
 * Turns a Horizon / SDK error into one plain-English sentence. The raw result
 * codes are appended in brackets so they can still be searched or reported.
 */
export function explainHorizonError(err: unknown): string {
  const e = (err ?? {}) as HorizonErrorShape
  const message = typeof e.message === 'string' && e.message ? e.message : String(err)
  // why: submit errors nest the problem body under `data`; call-builder errors are the body itself.
  const body = e.response?.data ?? e.response
  const codes = body?.extras?.result_codes

  if (codes) {
    const txCode = codes.transaction ?? ''
    const opCodes = codes.operations ?? []
    const raw = [txCode ? `tx: ${txCode}` : '', opCodes.length ? `ops: ${opCodes.join(', ')}` : '']
      .filter(Boolean)
      .join('; ')

    const reasons: string[] = []
    opCodes.forEach((code, i) => {
      if (code === 'op_success') return
      const label = opCodes.length > 1 ? `operation ${i + 1}: ` : ''
      reasons.push(`${label}${OP_CODE_TEXT[code] ?? code}`)
    })
    // why: tx_failed only says "an op failed"; the op codes carry the real reason, so only show it when they do not.
    if (reasons.length === 0 || txCode !== 'tx_failed') {
      reasons.unshift(TX_CODE_TEXT[txCode] ?? (txCode || 'unknown transaction error'))
    }
    return `Transaction failed: ${reasons.join('; ')} [${raw}]`
  }

  const status = e.response?.status
  const detail = body?.detail ?? body?.title
  if (status === 404) {
    return `Not found on testnet (is the account funded?): ${detail ?? message} [404]`
  }
  if (status === 504) {
    // why: Horizon timing out does not mean the tx was dropped; it may still land in a later ledger.
    return `Horizon timed out waiting for the transaction; it may still succeed, check the account before retrying [504]`
  }
  if (status === 429) {
    return `Horizon rate limit hit; wait a few seconds and retry [429]`
  }
  if (status !== undefined && detail) {
    return `${message} (${detail}) [${status}]`
  }
  return message
}

// ---------------------------------------------------------------------------
// Op builders — hatch / care
// ---------------------------------------------------------------------------

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/**
 * Hatch = write `pet.name` + `pet.species` on the birth account (the asset issuer).
 * Birth time is the ledger close time of this tx, read back from Horizon later.
 */
export function hatchOps(name: string, species: Species): xdr.Operation[] {
  const chars = Array.from(name).length
  if (chars < 1 || chars > PET_NAME_MAX_CHARS) {
    throw new Error(`Pet name must be 1 to ${PET_NAME_MAX_CHARS} characters`)
  }
  if (utf8Bytes(name) > DATA_VALUE_MAX_BYTES) {
    throw new Error(`Pet name must be at most ${DATA_VALUE_MAX_BYTES} bytes of UTF-8`)
  }
  if (!isOneOf(SPECIES, species)) {
    throw new Error(`Unknown species "${species}". Expected one of: ${SPECIES.join(', ')}`)
  }
  return [
    // why: manageData stores a small key/value on the account; the op record in Horizon history is immutable.
    Operation.manageData({ name: DATA_KEYS.name, value: name }),
    Operation.manageData({ name: DATA_KEYS.species, value: species }),
  ]
}

/** Care = one manageData op `pet.care=<kind>` on the CURRENT owner's account. Free apart from the fee. */
export function careOp(kind: CareKind): xdr.Operation {
  if (!isOneOf(CARE_KINDS, kind)) {
    throw new Error(`Unknown care kind "${kind}". Expected one of: ${CARE_KINDS.join(', ')}`)
  }
  // why: overwriting the same key is fine; the app reads the op history, not the current value.
  return Operation.manageData({ name: DATA_KEYS.care, value: kind })
}

// ---------------------------------------------------------------------------
// Op builders — transfer / inheritance / claim
// ---------------------------------------------------------------------------

function unixSeconds(d: Date): string {
  const s = Math.floor(d.getTime() / 1000)
  if (!Number.isFinite(s) || s < 0) throw new Error('claimableAfter must be a valid date')
  return String(s)
}

/**
 * Transfer (or inheritance) = park 1 PET1 in a claimable balance for `to`.
 * With `claimableAfter`, `to` can only claim once that date has passed.
 * `from` is always an unconditional claimant so the sender can cancel.
 * `from` may be the issuer: an issuer can create claimable balances of its
 * own asset with no trustline (it mints on the way out, burns on the way back).
 */
export function transferOp(
  issuer: string,
  from: string,
  to: string,
  opts: { claimableAfter?: Date } = {},
): xdr.Operation {
  // why: claimant destinations must be unique inside one claimable balance, or the network rejects it as op_malformed.
  if (from === to) throw new Error('Cannot transfer a pet to its current owner')

  const heirPredicate = opts.claimableAfter
    ? // why: "not (before T)" = claimable only when the ledger close time is >= T (unix seconds, as a string).
      Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(unixSeconds(opts.claimableAfter)))
    : Claimant.predicateUnconditional()

  // why: a claimable balance holds the asset on the ledger until a claimant takes it; the receiver needs no trustline yet.
  return Operation.createClaimableBalance({
    asset: petAsset(issuer),
    amount: '1',
    claimants: [
      new Claimant(to, heirPredicate),
      // why: the sender stays an unconditional claimant so cancelling is just "claim it back".
      new Claimant(from, Claimant.predicateUnconditional()),
    ],
    source: from,
  })
}

/**
 * Claim = changeTrust(PET1) + claimClaimableBalance + manageData `pet.prev`,
 * all in ONE transaction so the ledger never shows a half-claimed pet.
 *
 * `pet.prev` hazard: it is ONE overwritable data entry per account, so it only
 * records that account's LATEST hand-in. A pet that returns to a previous
 * owner (issuer A -> B -> C -> B) leaves B.pet.prev = C and C.pet.prev = B: the
 * current entries form a cycle that never reaches the issuer. chain.ts must
 * therefore guard its `pet.prev` walk (it does: a visited set plus a hop cap)
 * and treat the result as best-effort, possibly truncated. The complete,
 * cycle-free lineage lives in the operations log: each claim tx pairs a
 * `claim_claimable_balance` op of PET1 with this `manage_data` `pet.prev` op
 * under the same `transaction_hash`, and op records are append-only. That is
 * why all three ops share one tx.
 *
 * Issuer-reclaim limitation: when the claimant IS the issuer we skip both the
 * trustline (an issuer cannot trust its own asset: op_self_not_allowed) and
 * `pet.prev`, because the walk stops at the issuer (lineage[0] === issuer) and
 * a `pet.prev` there would be another cycle. Owners between the issuer's two
 * tenures are dropped from the walked lineage; their care ops are still on-chain.
 */
export function claimOps(issuer: string, claimant: string, balanceId: string, prevOwner: string): xdr.Operation[] {
  const isIssuer = claimant === issuer
  const ops: xdr.Operation[] = []
  // why: an account can only hold an asset after opening a trustline to it. Re-running changeTrust on an existing line is a no-op.
  if (!isIssuer) ops.push(trustOp(petAsset(issuer)))
  // why: claiming moves the 1 PET1 into the claimant's trustline, or burns it when the claimant is the issuer.
  ops.push(Operation.claimClaimableBalance({ balanceId }))
  // why: `pet.prev` on the new owner is the back-pointer the app follows to rebuild the full lineage.
  if (!isIssuer) ops.push(Operation.manageData({ name: DATA_KEYS.prev, value: prevOwner }))
  return ops
}

/** Cancel a pending transfer: the sender claims its own claimable balance back. */
export function cancelTransferOp(balanceId: string): xdr.Operation {
  // why: the sender was added as an unconditional claimant in transferOp exactly so this works.
  return Operation.claimClaimableBalance({ balanceId })
}

/** Open (or resize) a trustline. `limit` defaults to the maximum; "0" would delete the line. */
export function trustOp(asset: Asset, limit?: string): xdr.Operation {
  // why: trustlines are opt-in: without one an account cannot receive a non-native asset (op_no_trust).
  return limit === undefined ? Operation.changeTrust({ asset }) : Operation.changeTrust({ asset, limit })
}

// ---------------------------------------------------------------------------
// Op builders — gifting
// ---------------------------------------------------------------------------

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/

/** Gift = plain XLM payment to the other pet's owner. Tag it with `giftMemo(kind)` at submit time. */
export function giftOp(to: string, amountXlm: string): xdr.Operation {
  if (!AMOUNT_RE.test(amountXlm)) {
    throw new Error(`Gift amount "${amountXlm}" must be a decimal XLM string with at most 7 decimals`)
  }
  const n = Number(amountXlm)
  if (n < Number(MIN_GIFT_XLM) || n > Number(MAX_GIFT_XLM)) {
    throw new Error(`Gift amount must be between ${MIN_GIFT_XLM} and ${MAX_GIFT_XLM} XLM`)
  }
  // why: Asset.native() is XLM; a payment to an existing account needs no trustline.
  return Operation.payment({ destination: to, asset: Asset.native(), amount: amountXlm })
}

/** `treat:<kind>` text memo for a gift payment. */
export function giftMemo(kind: TreatKind): string {
  if (!isOneOf(TREAT_KINDS, kind)) {
    throw new Error(`Unknown treat kind "${kind}". Expected one of: ${TREAT_KINDS.join(', ')}`)
  }
  const memo = `${TREAT_MEMO_PREFIX}${kind}`
  // why: Stellar text memos are capped at 28 bytes; anything longer fails at build time.
  if (utf8Bytes(memo) > MEMO_TEXT_MAX_BYTES) {
    throw new Error(`Memo "${memo}" exceeds ${MEMO_TEXT_MAX_BYTES} bytes`)
  }
  return memo
}
