// Shared contract between chain reader (chain.ts), engine (engine.ts) and UI.
// No enums: tsconfig has erasableSyntaxOnly. Use string unions.

/** The nine cast characters (src/art/cast.ts). Stored on-chain as the `pet.species` value. */
export const SPECIES = ['bug', 'angel', 'dragonet', 'tanuki', 'elf', 'oni', 'plain', 'bee', 'cow'] as const
export type Species = (typeof SPECIES)[number]

export interface SpeciesMeta {
  label: string
  /** Floating pets hover and never touch the ground line; ground pets stand on it. */
  kind: 'floating' | 'ground'
  /** Idle micro-animation frame the art provides: wings/tail ('flap') or eyes ('blink'). */
  idle: 'flap' | 'blink'
}

export const SPECIES_META: Record<Species, SpeciesMeta> = {
  bug: { label: 'Fairy bug', kind: 'floating', idle: 'flap' },
  angel: { label: 'Angel', kind: 'floating', idle: 'flap' },
  dragonet: { label: 'Leaf drake', kind: 'floating', idle: 'flap' },
  tanuki: { label: 'Tanuki', kind: 'ground', idle: 'flap' },
  elf: { label: 'Elf', kind: 'ground', idle: 'flap' },
  oni: { label: 'Oni', kind: 'ground', idle: 'flap' },
  plain: { label: 'Kid', kind: 'ground', idle: 'blink' },
  bee: { label: 'Bee', kind: 'ground', idle: 'blink' },
  cow: { label: 'Cow', kind: 'ground', idle: 'blink' },
}

/** Pets hatched before the cast art existed used these names. */
const LEGACY_SPECIES: Record<string, Species> = { blob: 'plain', cat: 'tanuki', dragon: 'dragonet' }

/** Maps any on-chain `pet.species` value to a cast character. Unknown values become 'plain'. */
export function normalizeSpecies(raw: string): Species {
  if ((SPECIES as readonly string[]).includes(raw)) return raw as Species
  return LEGACY_SPECIES[raw] ?? 'plain'
}

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
