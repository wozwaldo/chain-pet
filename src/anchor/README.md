# `src/anchor` — SEP-24 deposit ("Add funds")

Everything anchor-related lives here, behind one component. The rest of the app
only renders `<AddFundsButton address={...} sign={...} />` and never imports
anything else from this folder.

## The flow (what each step is and why)

| # | Step | What happens | Why (Stellar) |
|---|------|--------------|---------------|
| 0 | SEP-1 toml | `GET https://testanchor.stellar.org/.well-known/stellar.toml` | An anchor publishes its endpoints, signing key and assets at this well-known path. We read `WEB_AUTH_ENDPOINT`, `TRANSFER_SERVER_SEP0024`, `SIGNING_KEY`, `NETWORK_PASSPHRASE` and the `[[CURRENCIES]]` blocks. |
| 1 | SEP-10 auth | `GET /auth?account=G...` → challenge tx. Validate with `WebAuth.readChallengeTx`. Sign with the wallet. `POST /auth {transaction}` → JWT. | The challenge is a tx with sequence 0 (can never be submitted). Signing it proves you control the account. We validate it *before* signing so a hostile server cannot make the wallet sign a real payment. |
| 2 | Trustline | Read `/accounts/{G}` from Horizon; if no `SRT` balance line, submit one `changeTrust` op. | An account can only receive an asset it explicitly trusts, otherwise the anchor's payment fails with `op_no_trust`. A trustline reserves ~0.5 XLM. |
| 3 | Interactive deposit | `POST /sep24/transactions/deposit/interactive` with `Authorization: Bearer <jwt>` and `{asset_code, account, lang}` → `{type:'interactive_customer_info_needed', url, id}`. Open `url` in a popup. | The anchor hosts its own web form for the off-chain side (amount, KYC). The wallet only opens it. |
| 4 | Poll | `GET /sep24/transaction?id=...` every 3 s until a terminal status: `completed` / `error` / `expired` / `refunded` / `no_market` / `too_small` / `too_large`. Anything but `completed` is shown as an error with Retry. | The anchor works off-chain and reports progress through this record. On `completed` it has sent the asset to the account on Stellar. |

`AddFundsButton.tsx` runs steps 0–2 automatically after the click, then stops
and waits for a second click ("Open anchor window") because `window.open` must
happen synchronously inside a user gesture or the popup blocker eats it. Polling
starts right after the popup opens. Each row of the stepper shows a one-line
"why" caption; errors render inline with a **Retry** that resumes from the
failed step (auth, trustline or polling).

## Public API (`sep24.ts`)

```ts
fetchAnchorInfo(): Promise<AnchorInfo>                       // cached per page load
sep10Auth(address, sign): Promise<string>                    // JWT
ensureTrustline(address, code, issuer, sign): Promise<'exists' | 'created'>
startInteractiveDeposit(token, address, code): Promise<{ url; id }>
getTransaction(token, id, signal?): Promise<Sep24Transaction>   // signal aborts the GET itself
pollTransaction(token, id, onUpdate, { intervalMs?, maxMs?, signal? }): Promise<Sep24Transaction>
findCurrency(info, code), parseStellarToml(text), isMockMode(), isTerminal(status), isAbortError(err)
TERMINAL_STATUSES  // completed, error, expired, refunded, no_market, too_small, too_large
```

`pollTransaction` honours `signal` at every point: before each GET, inside the
GET (passed to `fetch`), after the GET (a record that arrives while the abort
landed is dropped, `onUpdate` is not called) and during the sleep between polls.
It always rejects with an error whose `name` is `AbortError`; `isAbortError`
recognises both that and the `DOMException` an aborted `fetch` throws.

`sign` is the same `Signer` type `src/stellar/tx.ts` uses (`(xdr) => Promise<signedXdr>`),
so the app passes Freighter's `signXdr` and tests pass a `Keypair`. Freighter can
sign the SEP-10 challenge even though its source account is the *anchor's*
account, because it simply adds the selected account's signature to the envelope.

## Verified live on 2026-09-19 (testanchor.stellar.org)

`curl -s https://testanchor.stellar.org/.well-known/stellar.toml` returned (trimmed):

```toml
ACCOUNTS = ["GCSGSR6KQQ5BP2FXVPWRL6SWPUSFWLVONLIBJZUKTVQB5FYJFVL6XOXE"]
VERSION = "0.1.0"
SIGNING_KEY = "GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR"
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"

WEB_AUTH_ENDPOINT = "https://testanchor.stellar.org/auth"
KYC_SERVER = "https://testanchor.stellar.org/sep12"
TRANSFER_SERVER = "https://testanchor.stellar.org/sep6"
TRANSFER_SERVER_SEP0024 = "https://testanchor.stellar.org/sep24"
DIRECT_PAYMENT_SERVER = "https://testanchor.stellar.org/sep31"
ANCHOR_QUOTE_SERVER = "https://testanchor.stellar.org/sep38"

[[CURRENCIES]]
code = "SRT"
issuer = "GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B"
status = "test"

[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "test"

[[CURRENCIES]]
code = "native"
status = "test"
```

`curl -s https://testanchor.stellar.org/sep24/info`:

```json
{"deposit":{"SRT":{"enabled":true,"min_amount":1,"max_amount":10},
           "native":{"enabled":true,"min_amount":1,"max_amount":10},
           "USDC":{"enabled":true,"min_amount":1,"max_amount":10}},
 "withdraw":{...same...},"fee":{"enabled":false},
 "features":{"account_creation":false,"claimable_balances":false}}
```

`curl -s "https://testanchor.stellar.org/auth?account=G..."` → HTTP 200,
`{"transaction":"AAAAAgAAAACOs4wu…","network_passphrase":"Test SDF Network ; September 2015"}`.
The challenge's first manageData key is `testanchor.stellar.org auth` and it
carries a `web_auth_domain = testanchor.stellar.org` op, which is what
`readChallengeTx(tx, SIGNING_KEY, passphrase, 'testanchor.stellar.org', 'testanchor.stellar.org')` checks.

The full round trip is exercised by `sep24.testnet.test.ts` with a throwaway
Friendbot-funded keypair (5/5 passing, ~17 s):

- toml parsed, `SRT` issuer found, second call served from cache;
- SEP-10 → JWT whose `sub` is the account; signing with a *different* keypair is rejected by the anchor (HTTP 400);
- `ensureTrustline` → `'created'` (changeTrust landed on testnet), then `'exists'`;
- interactive deposit → `https://anchor-ref-ui-testanchor.stellar.org?transaction_id=<uuid>&token=<jwt>` (JSON body accepted, no multipart fallback needed);
- `GET /sep24/transaction?id=` → `{status:"incomplete", kind:"deposit", to:<account>, more_info_url:...}`;
- polling stops on `maxMs` while still `incomplete` and honours an `AbortSignal`.

Not verified unattended: the part after a human fills the anchor's form
(`pending_user_transfer_start → pending_anchor → pending_stellar → completed`).
That needs the popup; run the app, click through the form (amount 1–10 SRT),
and the stepper follows the status until `completed`.

Run it yourself: `TESTNET_E2E=1 pnpm exec vitest run src/anchor/sep24.testnet.test.ts --reporter=verbose --silent=false`

## Mock mode — `VITE_ANCHOR_MOCK=1`

Every function in `sep24.ts` checks `import.meta.env.VITE_ANCHOR_MOCK === '1'`
and, when set, returns realistic fake data after a short delay and makes **no
network call** (asserted by `sep24.test.ts` with a stubbed `fetch`):

- `fetchAnchorInfo` → the same values as the live toml above;
- `sep10Auth` → a fake three-part JWT, the signer is never called;
- `ensureTrustline` → `'created'` the first time per account/asset, then `'exists'`;
- `startInteractiveDeposit` → a `data:text/html` page titled **"Mock anchor deposit"**
  (Chrome/Firefox refuse to navigate a popup to a `data:` URL, so the button opens a blank popup and `document.write`s the page into it);
- `pollTransaction` → walks `incomplete → pending_user_transfer_start → pending_anchor → pending_stellar → completed` (about 1.2 s per step) with `amount_in`/`amount_out` = 10.

Use it for demos without network or when the anchor is down:

```sh
VITE_ANCHOR_MOCK=1 pnpm dev
```

The modal shows a yellow **MOCK** badge in that mode.

## Gotchas

- Popups: the "Open anchor window" step is a separate click on purpose (popup blockers). If `window.open` is still blocked the flow stays at "Open anchor" (polling does not start) and the modal shows a "Popup blocked? Click here" link. That link is a real `<a href target="sep24">`, which browsers never popup-block: clicking it lets the browser open the form and then starts polling. In mock mode (`data:` URL, which links cannot navigate to) the link retries the `document.write` popup instead.
- A deposit that ends in `error`, `expired`, `refunded`, `no_market`, `too_small` or `too_large` stops polling immediately and renders as an inline error with Retry (which polls again).
- The SRT trustline costs a ~0.5 XLM reserve, so the account needs > 1.5 XLM free. Friendbot gives 10,000.
- `fetchAnchorInfo` caches the toml for the page's lifetime; a failed fetch is not cached, so Retry re-fetches.
- The anchor refuses accounts that are not on testnet passphrase; `sep24.ts` also refuses to talk to an anchor whose toml names another network.
- `USDC` and `native` deposits are enabled on the anchor too; only `DEFAULT_ASSET_CODE = 'SRT'` is wired into the button.
