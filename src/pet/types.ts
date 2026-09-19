// Shared contract between chain reader (chain.ts), engine (engine.ts) and UI.
// No enums: tsconfig has erasableSyntaxOnly. Use string unions.

export const SPECIES = ['blob', 'cat', 'dragon'] as const
export type Species = (typeof SPECIES)[number]

export const CARE_KINDS = ['feed', 'play', 'clean'] as const
export type CareKind = (typeof CARE_KINDS)[number]

export const TREAT_KINDS = ['apple', 'cookie', 'fish', 'star'] as const
export type TreatKind = (typeof TREAT_KINDS)[number]

export type Stage = 'egg' | 'baby' | 'teen' | 'adult'
export type Mood = 'ecstatic' | 'happy' | 'meh' | 'sad' | 'miserable'

/** One care op read from Horizon. `at` is the ledger close time in unix ms. */
export interface CareEvent {
  kind: CareKind
  at: number
  by: string
  txHash: string
}

/** One treat payment received, read from Horizon payments joined with tx memo. */
export interface GiftEvent {
  kind: TreatKind | string
  amountXlm: string
  from: string
  at: number
  txHash: string
}

export interface PendingTransfer {
  balanceId: string
  /** Claimant that is not the sponsor. */
  to: string
  /** Unix ms if the heir predicate is "not before"; undefined = claimable now. */
  claimableAfter?: number
  sponsor: string
}

/** Everything the chain knows about one pet. Produced by chain.ts. */
export interface PetRecord {
  /** `PET1:<issuer>` */
  id: string
  issuer: string
  name: string
  species: Species
  /** Ledger close time of the hatch tx, unix ms. */
  bornAt: number
  /** Current owner (see CLAUDE.md owner rule). */
  owner: string
  /** Owners from birth to current, inclusive. lineage[0] === issuer. */
  lineage: string[]
  /** Ascending by `at`. Includes care by every owner in the lineage. */
  care: CareEvent[]
  /** Ascending by `at`. Treats received by the current owner. */
  gifts: GiftEvent[]
  pendingTransfer?: PendingTransfer
}

/** Derived, never stored. Produced by engine.ts from PetRecord + now. */
export interface PetState {
  stage: Stage
  /** 0 = full, 100 = starving. */
  hunger: number
  /** 0 = bored, 100 = delighted. */
  happiness: number
  /** 0 = filthy, 100 = sparkling. */
  cleanliness: number
  mood: Mood
  alive: boolean
  /** Unix ms when the pet is considered to have died, if !alive. */
  diedAt?: number
  ageMs: number
  careCount: number
  lastCare: Partial<Record<CareKind, number>>
  /** Short human line for the UI, e.g. "Starving. Feed me!" */
  statusLine: string
}
