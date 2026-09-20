# CHAIN PET — Stellar Hackathon Project (36h, solo)

## Concept
A digital pet that truly LIVES on Stellar. Its life history is immutable on-chain:
it can never be reset, faked, or deleted. Care is free (signed manageData ops),
its state changes with real elapsed time, and it can be transferred/inherited
via claimable balances. Micro-payments exist only as social gifting (treats to
other pets), never pay-to-care.

## Non-negotiables
- The pet must feel ALIVE: state (hunger/mood/evolution) derives from real
  time elapsed since last on-chain care action. No fake timers.
- Real Stellar usage is a MUST: manageData for care, payments for gifting,
  claimable balance for transfer/inheritance.
- Anchor integration is a MUST: SEP-24 deposit via testanchor.stellar.org,
  isolated behind an "Add funds" button. Time-box it; if blocked, mock the UI
  and keep the flow demoable.
- TESTNET ONLY. Never mainnet. Never ask for or handle secret keys — all
  signing goes through Freighter.

## Pet data model (decided 2026-09-19)
- Pet identity = a custom asset `PET1:<birth account>`. The birth account is the
  asset issuer, so `PET1:G...` is the pet's permanent, globally unique ID.
  Issuers never hold their own asset, so: owner = the account holding 1 PET1;
  else the sponsor of a pending claimable balance of PET1; else the issuer.
- Hatch = manageData ops on the birth account: `pet.name`, `pet.species`.
  Birth time = ledger close time of that transaction.
- Care = one manageData op on the CURRENT OWNER's account, key `pet.care`,
  value `feed` | `play` | `clean`. Care is free (just the network fee).
- Time source = the ledger `created_at` of each op as returned by Horizon,
  never a client-supplied value. That is what makes state unfakeable.
- History = Horizon's operations log (`/accounts/{id}/operations`), not the
  current data entry. Entries can be overwritten; the op record cannot.
- Transfer = createClaimableBalance of 1 PET1 to the new owner (unconditional).
  Inheritance = same, with predicate "not before <date>" for the heir plus an
  unconditional claimant for the sender so they can cancel.
- Claim tx = changeTrust(PET1) + claimClaimableBalance + manageData
  `pet.prev=<previous owner G...>` in ONE transaction. The app walks `pet.prev`
  back to the issuer to rebuild the full lineage.
- Gifts = XLM payment to the other pet's owner with text memo `treat:<kind>`.
  Read back via `/accounts/{id}/payments?join=transactions` for the memo.
- Neglect: derived state only. A pet with no care past DEATH_AFTER is dead,
  permanently, because the history that proves it is on-chain.

## Tech stack
Vite + React + TypeScript + Tailwind v4, pnpm.
@stellar/stellar-sdk v17, @stellar/freighter-api v6. SEP-24 via plain fetch
(SEP-1 toml → SEP-10 challenge signed by Freighter → interactive deposit URL).
Vitest for `src/pet/engine.ts` only (pure state derivation from timestamps).
Testnet: Horizon https://horizon-testnet.stellar.org, passphrase
"Test SDF Network ; September 2015", Friendbot https://friendbot.stellar.org.
Demo clock: `VITE_TIME_SCALE` multiplies elapsed time so judges see hunger
change in minutes. Default 1 (real time). Never affects on-chain data.

## Source layout
- `src/stellar/config.ts` — network constants, time scale.
- `src/stellar/freighter.ts` — connect, network check, sign helper.
- `src/stellar/horizon.ts` — Horizon server instance + typed fetch helpers.
- `src/stellar/tx.ts` — build/sign/submit + op builders (hatch, care, transfer, claim, gift, trust).
- `src/pet/types.ts` — shared PetRecord / PetState / CareEvent types (the contract).
- `src/pet/chain.ts` — read ops from Horizon into PetRecord (owner lookup, lineage walk).
- `src/pet/engine.ts` — pure: PetRecord + now → PetState. Tested.
- `src/anchor/` — SEP-24 flow, isolated behind AddFundsButton.
- `src/art/` — cast + icon grids (data), PixelIcon.
- `src/components/` — Device (the handheld), PetSprite, StatBar, ui primitives, screens.

## About me (the developer)
- 5 years frontend (React/TS/Tailwind), strong UI/UX sense, 2D artist.
- NEW to Stellar (started yesterday). Already working: Freighter wallet
  connect, Horizon balance fetch, funded testnet accounts. I understand the
  payment/TransactionBuilder flow in theory but haven't written it yet.
- Explain Stellar-specific steps in one short sentence each ("why"), then code.

## References
- My working starter (wallet connect + balance): https://github.com/wozwaldo/stellar-tip-jar
  (local clone: ../stellar-tip-jar)
- Stellar dev tooling: https://raven.stellar.org/#connect
- Stellar skills/learning: https://skills.stellar.org/
- Official docs: https://developers.stellar.org

## Working rules
- Production mode: write full code directly. I architect, you build.
- Build order (do not reorder): 1) port wallet connect + balance from starter
  (verify Freighter network is TESTNET before any signing; show a banner otherwise)
  → 2) Feed action via manageData + Freighter sign → 3) pet engine: read ops
  from Horizon, derive hunger/mood/evolution from elapsed time →
  4) transfer/inheritance via claimable balance → 5) gifting (payment to
  another pet) → 6) anchor "Add funds" (time-boxed; needs changeTrust for SRT
  before the deposit) → 7) polish + pitch assets.
- Commit after every completed block.
- Sub-agents welcome for parallel work (e.g., one on pet engine, one on
  anchor research) — but merge into the build order above. Agents own disjoint
  files; only the coordinator edits App.tsx and package.json.
- Speed > polish. MVP scope only; propose extras, don't silently add them.
- Visuals (decided 2026-09-20): the Claude Design "Cozy Garden" direction.
  Tokens live in src/index.css (@theme) and src/components/ui.tsx; the pet
  lives inside the Device component (src/components/Device.tsx, a port of the
  design's Shell 'garden' era with meadow LCD + FEED/PLAY/CLEAN keys). Art is
  the purchased 9-character cast in src/art/cast.ts (text grids, never retype)
  plus UI icons in src/art/icons.ts. Design source zip:
  ~/Downloads/"Chain Pet_ Blockchain Tamagotchi.zip" (README.md inside has
  tokens + animation timings). Font: Outfit; mono only for addresses/numbers.
- Brainstorming welcome ON TOP of this concept (how to make the pet more
  useful/interesting) — suggest, ask, then implement. Never change the
  non-negotiables.
- Shell note: `head` on this Mac is not coreutils (it is a Perl HTTP tool). Use `sed -n`.
