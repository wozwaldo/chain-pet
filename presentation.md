# Chain Pet — Pitch Notes

Talking points for the demo and answers to the questions a jury is likely to ask. Written 2026-09-19.

## One-liner

A digital pet that truly lives on Stellar: its hunger is real elapsed ledger time, its life story is an immutable operations log, and it can be inherited but never reset.

## 30-second pitch

Every Tamagotchi ever made could be reset. Chain Pet cannot. Its identity is a token issued by the account that hatched it. Every feed, play and clean is a signed Stellar operation, and the pet's mood is computed from how much ledger time has passed since those operations. Neglect it and it dies, publicly, forever. Care for it and you can pass it on: transfers and inheritance are claimable balances with time locks. Gifting treats to a friend's pet is a plain XLM payment with a memo. No backend, no database, no secrets: the app is a viewer over the ledger, and Freighter signs everything.

## What is real on Stellar (say this explicitly)

| Feature | Stellar primitive | Where |
|---|---|---|
| Pet identity | Custom asset `PET1:<birth account>`; holder of the 1 unit owns the pet | `src/stellar/tx.ts` petAsset |
| Hatch | `manageData` ops `pet.name`, `pet.species` on the birth account | hatchOps |
| Care (feed/play/clean) | `manageData` op `pet.care` on the current owner's account | careOp |
| Pet state | Derived from Horizon `created_at` of those ops, nothing stored | `src/pet/engine.ts` |
| Transfer | `createClaimableBalance` of 1 PET1, unconditional claimant | transferOp |
| Inheritance | Same, with predicate `not(beforeAbsoluteTime)` for the heir, plus the sender as a second claimant so they can cancel | transferOp |
| Claim | One tx: `changeTrust` + `claimClaimableBalance` + `manageData pet.prev` (lineage link) | claimOps |
| Gifts | `payment` in XLM with text memo `treat:<kind>` | giftOp, giftMemo |
| Add funds | SEP-1 toml → SEP-10 challenge signed by Freighter → SEP-24 interactive deposit → poll | `src/anchor/sep24.ts` |
| Wallet | Freighter API v6, network re-checked before every signature | `src/stellar/freighter.ts` |

## Why it cannot be faked (the core claim)

- **Time comes from consensus.** A transaction only exists once validators close it into a ledger, about every 5 seconds. The ledger's close time is what Horizon returns as `created_at`. The app never reads a timestamp the user typed. You cannot feed your pet "yesterday".
- **The log cannot be edited.** Data entries can be overwritten, so the app does not trust them for history. It reads the operations log, which is append-only. The current entry only tells us the name; the ops tell us the life.
- **Only the owner's care counts.** Anyone can write `pet.care` on their own account, but the reader only counts ops from accounts in the pet's lineage, inside each owner's ownership window. Nobody can write data entries to someone else's account.
- **Death is derived, not stored.** If 72 hours pass with no care op, the pet is dead. There is no "alive" flag to flip. The evidence is the absence of ops on a public ledger.

## Data model in six lines

1. The birth account issues `PET1`. That asset code plus issuer is the permanent pet ID.
2. Issuers never hold their own asset, so: owner = whoever holds 1 PET1; else the sponsor of a pending claimable balance; else the issuer.
3. Care ops live on the current owner's account under key `pet.care`.
4. On claim, the new owner writes `pet.prev = <previous owner>`; the app walks that chain back to the issuer to rebuild the lineage.
5. Each owner's care window runs from their claim time to the next owner's claim time.
6. Gifts are payments received by the owner with a `treat:` memo, inside that window.

## Demo script (about 4 minutes)

Prepare: Freighter on Testnet with two funded accounts. `.env.local` has `VITE_TIME_SCALE=60` so one real minute is one pet hour. Hatch a fresh pet after setting the scale. Keep the seeded backup pet's `?view=` link open in another tab.

1. Landing → Connect Freighter. Point at the Testnet banner logic.
2. Hatch "Mochi" (cat). Click the tx link, show the two data entries on stellar.expert.
3. Feed. Hunger drops to 0. Show the life log row and its tx. Say: "that timestamp is the ledger's, not mine."
4. Wait 30 seconds, hunger visibly climbs. Point at the demo clock badge and say real time is 24h.
5. Transfer tab → Set an heir → second account, date 2 minutes ahead. Show "Heir set", explain the predicate and cancel.
6. Switch Freighter to the second account. The claim banner shows "Locked · unlocks in 1m". Wait, claim. History now shows a two-owner lineage.
7. Switch back, Gift tab → paste the second account → cookie treat 0.5 XLM. Show it in the second pet's history and the happiness refresh.
8. Header → Add funds. Walk the stepper: SEP-10 signature, SRT trustline, anchor popup.
9. Close with the read-only `?view=` link: "Anyone can verify this pet without a wallet."

If a live transaction fails, fall back to the seeded pet view and the explorer links. The app's error text names the Horizon result code.

## Numbers worth having ready

| Thing | Value |
|---|---|
| Network fee per op | 100 stroops = 0.00001 XLM (app bids up to 0.0001, pays the market minimum) |
| Cost of 100,000 feeds | about 1 XLM |
| Reserve per data entry / trustline | 0.5 XLM locked (not spent); a pet uses at most 4 entries, and `pet.care` overwrites so it never grows |
| Claimable balance reserve | 0.5 XLM held by the sender until claimed or cancelled |
| Hunger full | 24h since last feed |
| Happiness to zero | 36h since last play or gift |
| Cleanliness to zero | 48h since last clean |
| Death | 72h without any care (eggs cannot die) |
| Teen / Adult | 48h and 6 care ops / 120h and 18 care ops |
| Tests | 138 unit tests; 29 more run against real testnet with throwaway keys (hatch → care → transfer → claim → gift → heir lock → cancel) |

## Questions the jury may ask

**Why is there a fee at all? Shouldn't care be free?**
The network fee is Stellar's spam protection and cannot be zero; it is 0.00001 XLM and nobody profits from it. "Free" here means no pay-to-care: no one sells food. Fully gasless is possible with fee-bump transactions paid by a sponsor account, which needs a small backend holding a key. Deliberately out of scope for 36 hours.

**Why not a Soroban smart contract?**
Classic operations already give everything the pet needs: consensus timestamps, an append-only log, transferable ownership with time-locked predicates, and payments with memos. A contract would add deploy and invocation cost without adding a guarantee. The one thing a contract could add later is enforcing rules on-chain (for example only the owner's care counts), which today is enforced by the reader. That is the natural next step.

**Can the owner cheat the clock?**
No. The only clock is the ledger close time. Clients cannot submit into the past, and future-dated ops are impossible because the ledger stamps them at close.

**Can the owner delete history?**
They can overwrite or delete the data entries, but the operations remain in the ledger history. The app reads operations. Caveat: Stellar testnet is reset periodically, so testnet pets do not outlive a reset. On mainnet, history is permanent.

**Why a token and not just data entries?**
Ownership has to be transferable and verifiable by anything, not just this app. A token shows up in Freighter and on explorers as `PET1`, and claimable balances give transfer and inheritance for free.

**Why claimable balances instead of a payment for transfer?**
The recipient must accept (a trustline), the sender can cancel before it is claimed, and predicates give time-locked inheritance. A payment would need the recipient to already trust the asset and offers no lock.

**Is inheritance a real dead-man's switch?**
Partly. Stellar predicates are time-based only. The heir cannot claim before the date; the owner can cancel any time before that. A true inactivity switch would need the owner to push the date forward periodically or a contract. Say this honestly.

**What stops someone else from writing `pet.care`?**
They can only write to their own account. The reader counts care only from accounts in the pet's lineage during their ownership windows.

**Can I have more than one pet?**
MVP is one per account, because the pet's asset code is fixed to `PET1`. Using `PET2`, `PET3` extends it without changing the model.

**What happens if the heir claims and then gives it back to the birth account?**
The lineage pointer `pet.prev` is one overwritable entry per account, so a cycle (A → B → A) truncates the reconstructed lineage. The complete lineage is still recoverable from the operations log by pairing each claim op with its `pet.prev` op; not built yet.

**What is the anchor for?**
Treats cost XLM, so users need an on-ramp. SEP-24 is Stellar's standard hosted deposit. We authenticate with SEP-10 (Freighter signs a challenge), create the SRT trustline, open the anchor's hosted flow and poll the transaction. The live toml, challenge and interactive URL were verified against testanchor.stellar.org. A mock mode exists only as a demo fallback.

**Security?**
The app never sees a secret. Signing is injected as a function, implemented by Freighter. The network passphrase is hard-coded to Testnet and re-checked before every signature. One transaction in flight per account. Nothing is stored off-chain.

**What breaks at scale?**
Reading ops per account through Horizon paging. It is fine for a pet's lifetime and would move to an indexer for many pets. The engine is a pure function of the record, so caching the record is trivial.

**Mainnet?**
Change the Horizon URL and passphrase. Costs are pennies. Add fee-bump sponsorship for a gasless experience.

**What was hardest?**
Deciding what "on-chain identity" means for a pet. The token-as-identity plus care-on-owner model makes transfer, inheritance and verification fall out of Stellar primitives instead of custom logic.

## Known limitations (own them before they are asked)

- Testnet only; testnet resets wipe pets.
- One pet per account.
- Lineage via a single overwritable pointer; cycles truncate.
- Inheritance is time-locked, not inactivity-triggered.
- Freighter is a desktop extension; the demo is on desktop.
- Sprites are generated placeholders; the developer is a 2D artist and will replace them.

## Roadmap ideas (only if asked)

- Breeding: two owners create a child pet whose birth account records both parents.
- Fee-bump sponsorship for gasless care.
- A Soroban contract that enforces ownership rules and evolution on-chain.
- Indexer for a public "pet directory" and leaderboards of longest-lived pets.
- Multi-wallet support via Stellar Wallets Kit.

## Stack facts

Vite + React 19 + TypeScript + Tailwind v4, pnpm. `@stellar/stellar-sdk` 17, `@stellar/freighter-api` 6, plain fetch for SEP-24. Vitest. No backend. Installable as a PWA. The tab title and favicon reflect the pet's mood.
