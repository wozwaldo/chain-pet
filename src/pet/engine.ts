// Pure pet engine: PetRecord + now -> PetState. No Stellar, no React, no I/O.
// why: every timestamp in PetRecord is a ledger close time read from Horizon,
// so deriving state from "now minus those timestamps" is what makes the pet
// unfakeable. This file only does the arithmetic.

import type { CareEvent, CareKind, GiftEvent, Mood, PetRecord, PetState, Stage } from './types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** All durations are ms of REAL time. Scale elapsed time, never these. */
export const THRESHOLDS = {
  /** Hunger climbs 0 -> 100 over this long since the last feed (or birth). */
  HUNGER_FULL_AFTER: 24 * HOUR,
  /** Happiness falls 100 -> 0 over this long since the last play or gift. */
  HAPPINESS_DECAY: 36 * HOUR,
  /** Cleanliness falls 100 -> 0 over this long since the last clean (or birth). */
  CLEAN_DECAY: 48 * HOUR,
  /** No care of any kind for longer than this -> dead. Eggs are exempt. */
  DEATH_AFTER: 72 * HOUR,
  TEEN_AGE: 48 * HOUR,
  TEEN_CARE: 6,
  ADULT_AGE: 120 * HOUR,
  ADULT_CARE: 18,
} as const

// ---------------------------------------------------------------------------
// Timeline: the record normalised against `nowMs`, shared by every export.
// ---------------------------------------------------------------------------

interface Timeline {
  bornAt: number
  /**
   * Ledger time of the first care op (the hatch), or bornAt while still an egg.
   * why: happiness and cleanliness start at 100 when the pet hatches, not when
   * the egg was laid, so an egg left for days does not hatch already bored.
   */
  hatchAt: number
  /** Ascending, every `at` clamped to nowMs. */
  care: CareEvent[]
  /** Ascending, every `at` clamped to nowMs. */
  gifts: GiftEvent[]
  /** Latest care op of any kind, or null for an egg. */
  lastCareAt: number | null
  /** Unscaled unix ms of death, or null while alive. */
  diedAt: number | null
  /** Care ops that happened before death (all of them while alive). */
  careBeforeDeath: CareEvent[]
  /** Gifts that arrived before death (all of them while alive). */
  giftsBeforeDeath: GiftEvent[]
}

function buildTimeline(record: PetRecord, nowMs: number, scale: number): Timeline {
  // why: Horizon's `created_at` comes from validator clocks; the browser clock
  // can lag a few seconds behind it. A future-dated op is treated as "just now"
  // so it can never produce negative elapsed time (and thus > 100 stats).
  const bornAt = Math.min(record.bornAt, nowMs)
  const care = record.care
    .map((c) => (c.at > nowMs ? { ...c, at: nowMs } : c))
    .sort((a, b) => a.at - b.at)
  const gifts = record.gifts
    .map((g) => (g.at > nowMs ? { ...g, at: nowMs } : g))
    .sort((a, b) => a.at - b.at)

  const lastCareAt = care.length ? care[care.length - 1].at : null
  const diedAt = lastCareAt === null ? null : findDeath(care, nowMs, scale)

  return {
    bornAt,
    hatchAt: care.length ? care[0].at : bornAt,
    care,
    gifts,
    lastCareAt,
    diedAt,
    careBeforeDeath: diedAt === null ? care : care.filter((c) => c.at <= diedAt),
    giftsBeforeDeath: diedAt === null ? gifts : gifts.filter((g) => g.at <= diedAt),
  }
}

/**
 * First moment the pet went longer than DEATH_AFTER (scaled) without care.
 * why: the ops log on-chain is append-only, so a fatal gap anywhere in the
 * history is permanent. Later care ops cannot revive the pet.
 *
 * Every historical gap is judged at `scale`, on purpose: a pet is either dead
 * or not, and a feed after the UI showed it dead must not bring it back. So a
 * demo pet must be hatched AFTER VITE_TIME_SCALE is set, and then cared for at
 * least every DEATH_AFTER / scale of real time.
 */
function findDeath(care: CareEvent[], nowMs: number, scale: number): number | null {
  const realLimit = THRESHOLDS.DEATH_AFTER / scale
  for (let i = 1; i < care.length; i++) {
    if ((care[i].at - care[i - 1].at) * scale > THRESHOLDS.DEATH_AFTER) {
      return care[i - 1].at + realLimit
    }
  }
  const last = care[care.length - 1].at
  return (nowMs - last) * scale > THRESHOLDS.DEATH_AFTER ? last + realLimit : null
}

function latestPerKind(care: CareEvent[]): Partial<Record<CareKind, number>> {
  const out: Partial<Record<CareKind, number>> = {}
  for (const c of care) {
    const prev = out[c.kind]
    if (prev === undefined || c.at > prev) out[c.kind] = c.at
  }
  return out
}

function sanitizeScale(timeScale: number): number {
  return Number.isFinite(timeScale) && timeScale > 0 ? timeScale : 1
}

function clamp01to100(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)))
}

// ---------------------------------------------------------------------------
// Stage, mood, status text.
// ---------------------------------------------------------------------------

function stageFor(careCount: number, ageMs: number): Stage {
  if (careCount === 0) return 'egg'
  if (ageMs >= THRESHOLDS.ADULT_AGE && careCount >= THRESHOLDS.ADULT_CARE) return 'adult'
  if (ageMs >= THRESHOLDS.TEEN_AGE && careCount >= THRESHOLDS.TEEN_CARE) return 'teen'
  return 'baby'
}

function moodFor(hunger: number, happiness: number, cleanliness: number): Mood {
  const score = (100 - hunger) * 0.5 + happiness * 0.3 + cleanliness * 0.2
  if (score >= 85) return 'ecstatic'
  if (score >= 65) return 'happy'
  if (score >= 45) return 'meh'
  if (score >= 25) return 'sad'
  return 'miserable'
}

const MOOD_LINES: Record<Mood, string> = {
  ecstatic: 'Living my best life!',
  happy: 'Feeling great. Thanks for the care!',
  meh: 'Doing okay. A little attention?',
  sad: 'Feeling neglected. Some love, please?',
  miserable: 'Everything hurts. Help me!',
}

function statusFor(
  stage: Stage,
  alive: boolean,
  ageMs: number,
  hunger: number,
  happiness: number,
  cleanliness: number,
  mood: Mood,
): string {
  if (!alive) {
    const days = Math.floor(ageMs / DAY)
    return `Rest in peace. Lived ${days} day${days === 1 ? '' : 's'}.`
  }
  if (stage === 'egg') return 'An egg. Feed it to hatch!'
  if (hunger >= 80) return 'Starving! Feed me.'
  if (happiness <= 20) return 'Bored. Play with me?'
  if (cleanliness <= 20) return 'Stinky. Bath time!'
  return MOOD_LINES[mood]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the pet's current state from its on-chain record.
 *
 * @param nowMs     Client clock, unix ms.
 * @param timeScale Demo multiplier applied to every ELAPSED duration. 1 = real
 *                  time. Never changes stored data; only how fast it "ages".
 */
export function deriveState(record: PetRecord, nowMs: number, timeScale = 1): PetState {
  const scale = sanitizeScale(timeScale)
  const t = buildTimeline(record, nowMs, scale)
  const alive = t.diedAt === null
  // why: a dead pet is frozen at its moment of death; nothing after counts.
  const asOf = t.diedAt ?? nowMs
  const elapsed = (sinceMs: number) => (asOf - sinceMs) * scale

  const last = latestPerKind(t.careBeforeDeath)
  const lastGiftAt = t.giftsBeforeDeath.length
    ? t.giftsBeforeDeath[t.giftsBeforeDeath.length - 1].at
    : null
  // why: a gift that arrived before the hatch cannot push happiness below the
  // fresh-hatch value, hence max() against hatchAt rather than a bare gift time.
  const happyAnchor = Math.max(last.play ?? t.hatchAt, lastGiftAt ?? t.hatchAt)

  const ageMs = elapsed(t.bornAt)
  // Hunger alone counts from birth: it is the countdown behind "Feed it to hatch!".
  const hunger = clamp01to100((elapsed(last.feed ?? t.bornAt) / THRESHOLDS.HUNGER_FULL_AFTER) * 100)
  const happiness = clamp01to100(100 - (elapsed(happyAnchor) / THRESHOLDS.HAPPINESS_DECAY) * 100)
  const cleanliness = clamp01to100(100 - (elapsed(last.clean ?? t.hatchAt) / THRESHOLDS.CLEAN_DECAY) * 100)

  const stage = stageFor(t.careBeforeDeath.length, ageMs)
  const mood: Mood = alive ? moodFor(hunger, happiness, cleanliness) : 'miserable'

  return {
    stage,
    hunger,
    happiness,
    cleanliness,
    mood,
    alive,
    ...(t.diedAt !== null ? { diedAt: t.diedAt } : {}),
    ageMs,
    careCount: record.care.length,
    lastCare: latestPerKind(t.care),
    statusLine: statusFor(stage, alive, ageMs, hunger, happiness, cleanliness, mood),
  }
}

/** '3h', '2d 4h', '3h 20m', '12m', '<1m'. Two units at most. */
export function describeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE) return '<1m'
  const totalMinutes = Math.floor(ms / MINUTE)
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

export interface TimeUntil {
  /** Real ms until hunger reaches 100. 0 if already starving or dead. */
  starvesIn: number
  /** Real ms until DEATH_AFTER elapses. null for eggs, 0 if dead. */
  diesIn: number | null
}

/** Countdowns in REAL ms (already divided by timeScale), for the UI. */
export function timeUntil(record: PetRecord, nowMs: number, timeScale = 1): TimeUntil {
  const scale = sanitizeScale(timeScale)
  const t = buildTimeline(record, nowMs, scale)
  if (t.lastCareAt === null) {
    // Egg: hunger still ticks from birth (it nudges the first feed), but eggs never die.
    return { starvesIn: Math.max(0, t.bornAt + THRESHOLDS.HUNGER_FULL_AFTER / scale - nowMs), diesIn: null }
  }
  if (t.diedAt !== null) return { starvesIn: 0, diesIn: 0 }

  const lastFeedAt = latestPerKind(t.care).feed ?? t.bornAt
  return {
    starvesIn: Math.max(0, lastFeedAt + THRESHOLDS.HUNGER_FULL_AFTER / scale - nowMs),
    diesIn: Math.max(0, t.lastCareAt + THRESHOLDS.DEATH_AFTER / scale - nowMs),
  }
}
