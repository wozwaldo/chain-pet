// Offline unit tests for tx.ts: input validation, error mapping, and the
// build/submit wrappers with Horizon mocked. No network. Runs in `pnpm test`.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Account, AccountRequiresMemoError, Keypair } from '@stellar/stellar-sdk'
import type { Horizon } from '@stellar/stellar-sdk'
import { server } from './horizon'
import {
  MAX_FEE_PER_OP,
  MAX_GIFT_XLM,
  MIN_GIFT_XLM,
  buildTx,
  careOp,
  claimOps,
  explainHorizonError,
  giftMemo,
  giftOp,
  hatchOps,
  signAndSubmit,
  transferOp,
} from './tx'

describe('tx.ts offline validation', () => {
  // why: the SDK checks the strkey checksum of every G... address, so a hand-typed placeholder is rejected.
  const G = Keypair.random().publicKey()
  const H = Keypair.random().publicKey()

  it('hatchOps validates name and species', () => {
    expect(hatchOps('Pixel', 'tanuki')).toHaveLength(2)
    expect(() => hatchOps('', 'tanuki')).toThrow(/1 to 24/)
    expect(() => hatchOps('x'.repeat(25), 'tanuki')).toThrow(/1 to 24/)
    // 24 chars but > 64 bytes of UTF-8 (each emoji is 4 bytes)
    expect(() => hatchOps('🐉'.repeat(20), 'dragonet')).toThrow(/64 bytes/)
    expect(() => hatchOps('Pixel', 'unicorn' as never)).toThrow(/species/)
  })

  it('careOp rejects unknown kinds', () => {
    expect(() => careOp('bathe' as never)).toThrow(/care kind/)
  })

  it('giftOp enforces the XLM range and decimal format', () => {
    expect(() => giftOp(G, MIN_GIFT_XLM)).not.toThrow()
    expect(() => giftOp(G, MAX_GIFT_XLM)).not.toThrow()
    expect(() => giftOp(G, '0.05')).toThrow(/between/)
    expect(() => giftOp(G, '5.0000001')).toThrow(/between/)
    expect(() => giftOp(G, '1e2')).toThrow(/decimal/)
    expect(() => giftOp(G, '1.12345678')).toThrow(/decimal/)
  })

  it('giftMemo builds treat:<kind> within 28 bytes', () => {
    expect(giftMemo('apple')).toBe('treat:apple')
    expect(() => giftMemo('pizza' as never)).toThrow(/treat kind/)
  })

  it('transferOp refuses self-transfer', () => {
    expect(() => transferOp(G, G, G)).toThrow(/current owner/)
  })

  it('claimOps skips trustline and pet.prev for the issuer', () => {
    expect(claimOps(G, G, '0'.repeat(72), G)).toHaveLength(1)
    expect(claimOps(G, H, '0'.repeat(72), G)).toHaveLength(3)
  })

  it('explainHorizonError maps result codes and keeps the raw codes', () => {
    const fake = (transaction: string, operations?: string[]) => ({
      message: 'Transaction submission failed. Server responded: 400 Bad Request',
      response: { status: 400, data: { extras: { result_codes: { transaction, operations } } } },
    })
    expect(explainHorizonError(fake('tx_failed', ['op_success', 'op_cannot_claim']))).toMatch(
      /operation 2: the claim condition is not met.*\[tx: tx_failed; ops: op_success, op_cannot_claim\]/,
    )
    expect(explainHorizonError(fake('tx_bad_seq'))).toMatch(/sequence number is stale.*\[tx: tx_bad_seq\]/)
    expect(explainHorizonError(fake('tx_failed', ['op_low_reserve']))).toMatch(/spare XLM/)
    expect(explainHorizonError(new Error('boom'))).toBe('boom')
    expect(explainHorizonError({ message: 'nf', response: { status: 404 } })).toMatch(/Not found on testnet/)
  })

  it('explainHorizonError reads the problem body from both SDK error shapes', () => {
    // Call-builder shape (loadAccount 404 etc.): `response` IS the problem+json body, no `data`.
    const builder404 = {
      message: 'Not Found',
      response: {
        type: 'https://stellar.org/horizon-errors/not_found',
        title: 'Resource Missing',
        status: 404,
        detail: 'The resource at the url requested was not found.',
      },
    }
    expect(explainHorizonError(builder404)).toMatch(/Not found on testnet.*url requested was not found.*\[404\]/)

    const builder400 = { message: 'Bad Request', response: { title: 'Bad Request', status: 400, detail: 'invalid cursor' } }
    expect(explainHorizonError(builder400)).toBe('Bad Request (invalid cursor) [400]')

    // Submit shape (wrapHttpError): `response = { status, statusText, data: <problem> }`.
    const submit400 = {
      message: 'Transaction submission failed. Server responded: 400 Bad Request',
      response: { status: 400, statusText: 'Bad Request', data: { title: 'Transaction Malformed', detail: 'bad xdr' } },
    }
    expect(explainHorizonError(submit400)).toMatch(/\(bad xdr\) \[400\]$/)
    // title is the fallback when detail is missing
    const submitTitleOnly = { message: 'm', response: { status: 400, data: { title: 'Transaction Malformed' } } }
    expect(explainHorizonError(submitTitleOnly)).toBe('m (Transaction Malformed) [400]')

    expect(explainHorizonError({ message: 'x', response: { status: 429 } })).toMatch(/rate limit.*\[429\]/)
    expect(explainHorizonError({ message: 'x', response: { status: 504 } })).toMatch(/may still succeed.*\[504\]/)
  })
})

describe('tx.ts build/submit with Horizon mocked', () => {
  const G = Keypair.random().publicKey()
  const H = Keypair.random().publicKey()
  const identitySigner = async (xdr: string) => xdr

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockLoadAccount() {
    // why: TransactionBuilder only needs accountId/sequenceNumber; a base Account stands in for AccountResponse.
    return vi
      .spyOn(server, 'loadAccount')
      .mockResolvedValue(new Account(G, '1') as unknown as Horizon.AccountResponse)
  }

  it('buildTx bids MAX_FEE_PER_OP per operation, sets the memo and timebounds', async () => {
    mockLoadAccount()
    const before = Math.floor(Date.now() / 1000)
    const tx = await buildTx(G, hatchOps('Pixel', 'tanuki'), { memo: giftMemo('apple') })
    expect(MAX_FEE_PER_OP).toBe('1000')
    expect(tx.fee).toBe(String(2 * Number(MAX_FEE_PER_OP)))
    expect(tx.operations).toHaveLength(2)
    expect(tx.memo.type).toBe('text')
    // why: the built tx re-parses the memo from XDR, so the text comes back as bytes.
    expect(new TextDecoder().decode(tx.memo.value as Uint8Array)).toBe('treat:apple')
    expect(Number(tx.timeBounds?.maxTime)).toBeGreaterThan(before)
    expect(server.loadAccount).toHaveBeenCalledWith(G)
  })

  it('buildTx rejects an empty op list before touching Horizon', async () => {
    const spy = mockLoadAccount()
    await expect(buildTx(G, [])).rejects.toThrow(/at least one operation/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('signAndSubmit warns that the tx may have landed when Horizon never answered', async () => {
    mockLoadAccount()
    const tx = await buildTx(G, [giftOp(H, '1')])
    vi.spyOn(server, 'submitTransaction').mockRejectedValue(new Error('Network Error'))
    await expect(signAndSubmit(tx, identitySigner)).rejects.toThrow(
      /^Network Error; the transaction may still have been accepted, check the account before retrying$/,
    )
  })

  it('signAndSubmit does not add the warning when Horizon replied or the precheck failed', async () => {
    mockLoadAccount()
    const tx = await buildTx(G, [giftOp(H, '1')])

    const rejected = {
      message: 'Transaction submission failed. Server responded: 400 Bad Request',
      response: { status: 400, statusText: 'Bad Request', data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
    }
    vi.spyOn(server, 'submitTransaction').mockRejectedValue(rejected)
    await expect(signAndSubmit(tx, identitySigner)).rejects.toThrow(/^Transaction failed: .*\[tx: tx_bad_seq\]$/)

    vi.spyOn(server, 'submitTransaction').mockRejectedValue(new AccountRequiresMemoError('account requires memo', H, 0))
    await expect(signAndSubmit(tx, identitySigner)).rejects.toThrow(/^account requires memo$/)
  })

  it('signAndSubmit returns the hash Horizon reports', async () => {
    mockLoadAccount()
    const tx = await buildTx(G, [careOp('feed')])
    const sign = vi.fn(identitySigner)
    vi.spyOn(server, 'submitTransaction').mockResolvedValue({ hash: 'ab'.repeat(32) } as never)
    await expect(signAndSubmit(tx, sign)).resolves.toEqual({ hash: 'ab'.repeat(32) })
    expect(sign).toHaveBeenCalledWith(tx.toXdr())
  })
})
