# Chain Pet

A digital pet that lives on Stellar testnet. Its life history is on-chain and cannot be reset.

- **Identity**: a `PET1:<birth account>` token. Whoever holds it owns the pet.
- **Care**: free `manageData` ops (`pet.care = feed | play | clean`). Hunger, happiness and cleanliness derive from the ledger time of those ops. No timers, nothing stored off-chain.
- **Transfer / inheritance**: claimable balances. An heir gets a "not before" predicate; the sender can cancel until it is claimed.
- **Gifts**: XLM payments with a `treat:<kind>` memo. Received treats refresh the pet's happiness.
- **Add funds**: SEP-24 hosted deposit via testanchor.stellar.org (SEP-10 auth signed by Freighter).

## Run

```
pnpm install
pnpm dev
```

Connect Freighter on **Testnet**. Unfunded accounts get a Friendbot button.

Routes: `/?view=G...` shows any pet read-only (no wallet). `/?gallery` shows every sprite.

The app is installable as a PWA (manifest + no-cache service worker in production builds). The tab title and favicon change with the pet's mood. Regenerate icons after editing sprites: `MAKE_ICONS=1 pnpm exec vitest run src/dev/makeIcons.test.ts`.

## Env (`.env.local`)

| Variable | Effect |
|---|---|
| `VITE_TIME_SCALE=60` | Demo clock: one real minute counts as one hour. On-chain data is untouched. Death is permanent and also scaled: at 60x a pet dies after 72 real minutes without care, so hatch a fresh pet after setting the scale and keep caring during the demo. |
| `VITE_ANCHOR_MOCK=1` | Runs the Add funds flow against fake anchor responses. |

## Tests

```
pnpm test                                  # unit tests (engine, tx, sprites, anchor)
TESTNET_E2E=1 pnpm exec vitest run         # also real testnet scenarios with throwaway keys
SEED_DEMO=1 pnpm exec vitest run src/dev/seedDemoPet.testnet.test.ts   # creates a demo pet, prints its address
```

## Layout

See `CLAUDE.md` for the data model and `src/` layout. Stellar-specific steps carry a `why:` comment.
