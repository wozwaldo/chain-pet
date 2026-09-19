import { describe, expect, it } from 'vitest'
import { THRESHOLDS, deriveState, describeDuration, timeUntil } from './engine'
import type { CareEvent, CareKind, GiftEvent, PetRecord } from './types'

const MIN = 60_000
const H = 60 * MIN
const D = 24 * H

/** Arbitrary fixed "birth" instant so tests never depend on Date.now(). */
const BORN = 1_758_000_000_000

function care(kind: CareKind, at: number): CareEvent {
  return { kind, at, by: 'GOWNER', txHash: `tx-${kind}-${at}` }
}

function gift(at: number, kind = 'apple'): GiftEvent {
  return { kind, amountXlm: '1.0000000', from: 'GFRIEND', at, txHash: `gift-${at}` }
}

function pet(overrides: Partial<PetRecord> = {}): PetRecord {
  return {
    id: 'PET1:GISSUER',
    issuer: 'GISSUER',
    name: 'Blobby',
    species: 'blob',
    bornAt: BORN,
    owner: 'GISSUER',
    lineage: ['GISSUER'],
    care: [],
    gifts: [],
    ...overrides,
  }
}

/** `n` care ops spread evenly over [fromMs, toMs] so no gap is ever fatal. */
function careSpread(n: number, fromMs: number, toMs: number, kind: CareKind = 'feed'): CareEvent[] {
  if (n === 1) return [care(kind, fromMs)]
  const step = (toMs - fromMs) / (n - 1)
  return Array.from({ length: n }, (_, i) => care(kind, Math.round(fromMs + i * step)))
}

describe('THRESHOLDS', () => {
  it('are expressed in ms of real time', () => {
    expect(THRESHOLDS.HUNGER_FULL_AFTER).toBe(24 * H)
    expect(THRESHOLDS.HAPPINESS_DECAY).toBe(36 * H)
    expect(THRESHOLDS.CLEAN_DECAY).toBe(48 * H)
    expect(THRESHOLDS.DEATH_AFTER).toBe(72 * H)
    expect(THRESHOLDS.TEEN_AGE).toBe(48 * H)
    expect(THRESHOLDS.TEEN_CARE).toBe(6)
    expect(THRESHOLDS.ADULT_AGE).toBe(120 * H)
    expect(THRESHOLDS.ADULT_CARE).toBe(18)
  })
})

describe('egg', () => {
  it('is an egg until the first care op, whatever its age', () => {
    const s = deriveState(pet(), BORN + 500 * H)
    expect(s.stage).toBe('egg')
    expect(s.alive).toBe(true)
    expect(s.diedAt).toBeUndefined()
    expect(s.careCount).toBe(0)
    expect(s.lastCare).toEqual({})
    expect(s.statusLine).toBe('An egg. Feed it to hatch!')
  })

  it('cannot die', () => {
    const s = deriveState(pet(), BORN + 10_000 * H)
    expect(s.alive).toBe(true)
    expect(timeUntil(pet(), BORN + 10_000 * H, 1).diesIn).toBeNull()
  })

  it('does not hatch from gifts alone', () => {
    const s = deriveState(pet({ gifts: [gift(BORN + H)] }), BORN + 2 * H)
    expect(s.stage).toBe('egg')
  })

  it('reports zero age when bornAt is in the future (clock skew)', () => {
    const s = deriveState(pet({ bornAt: BORN + H }), BORN)
    expect(s.ageMs).toBe(0)
  })
})

describe('hatching', () => {
  it('becomes a baby on the first feed', () => {
    const now = BORN + H
    const s = deriveState(pet({ care: [care('feed', now)] }), now)
    expect(s.stage).toBe('baby')
    expect(s.hunger).toBe(0)
    expect(s.careCount).toBe(1)
    expect(s.lastCare).toEqual({ feed: now })
  })

  it('hatches on any care kind, not only feed', () => {
    const now = BORN + H
    expect(deriveState(pet({ care: [care('play', now)] }), now).stage).toBe('baby')
    expect(deriveState(pet({ care: [care('clean', now)] }), now).stage).toBe('baby')
  })

  it('hatches fresh even when the egg sat for days', () => {
    // why: happiness and cleanliness count from the hatch, not from bornAt,
    // so a long-neglected egg does not come out already "Bored".
    const now = BORN + 5 * D
    const s = deriveState(pet({ care: [care('feed', now)] }), now)
    expect(s).toMatchObject({ stage: 'baby', hunger: 0, happiness: 100, cleanliness: 100, mood: 'ecstatic' })
    expect(s.statusLine).not.toMatch(/bored|stinky/i)
  })

  it('still counts hunger from bornAt so the egg has a feed countdown', () => {
    const now = BORN + 12 * H
    expect(deriveState(pet(), now).hunger).toBe(50)
    expect(deriveState(pet({ care: [care('play', now)] }), now).hunger).toBe(50)
  })
})

describe('hunger', () => {
  it('rises linearly from 0 to 100 over 24h since the last feed', () => {
    const fed = BORN + H
    const rec = pet({ care: [care('feed', fed)] })
    expect(deriveState(rec, fed).hunger).toBe(0)
    expect(deriveState(rec, fed + 6 * H).hunger).toBe(25)
    expect(deriveState(rec, fed + 12 * H).hunger).toBe(50)
    expect(deriveState(rec, fed + 24 * H).hunger).toBe(100)
  })

  it('clamps at 100', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    expect(deriveState(rec, BORN + 30 * H).hunger).toBe(100)
  })

  it('counts from bornAt when never fed', () => {
    const rec = pet({ care: [care('play', BORN + 12 * H)] })
    expect(deriveState(rec, BORN + 12 * H).hunger).toBe(50)
  })

  it('uses only the latest feed', () => {
    const rec = pet({ care: [care('feed', BORN), care('feed', BORN + 20 * H)] })
    expect(deriveState(rec, BORN + 26 * H).hunger).toBe(25)
  })
})

describe('happiness', () => {
  it('is 100 at the last play and decays linearly to 0 over 36h', () => {
    const played = BORN + H
    const rec = pet({ care: [care('play', played)] })
    expect(deriveState(rec, played).happiness).toBe(100)
    expect(deriveState(rec, played + 18 * H).happiness).toBe(50)
    expect(deriveState(rec, played + 36 * H).happiness).toBe(0)
  })

  it('is refreshed by a gift', () => {
    const played = BORN + H
    const rec = pet({ care: [care('play', played)], gifts: [gift(played + 30 * H)] })
    expect(deriveState(rec, played + 30 * H).happiness).toBe(100)
    expect(deriveState(rec, played + 48 * H).happiness).toBe(50)
  })

  it('uses whichever of play or gift is latest', () => {
    const rec = pet({ care: [care('play', BORN + 20 * H)], gifts: [gift(BORN + 2 * H)] })
    expect(deriveState(rec, BORN + 20 * H).happiness).toBe(100)
  })

  it('starts at 100 from the hatch moment before the first play', () => {
    const hatched = BORN + 18 * H
    const rec = pet({ care: [care('feed', hatched)] })
    expect(deriveState(rec, hatched).happiness).toBe(100)
    expect(deriveState(rec, hatched + 18 * H).happiness).toBe(50)
  })

  it('does not let a gift received before the hatch lower the fresh-hatch value', () => {
    const hatched = BORN + 3 * D
    const rec = pet({ care: [care('feed', hatched)], gifts: [gift(BORN + H)] })
    expect(deriveState(rec, hatched).happiness).toBe(100)
  })

  it('clamps at 0', () => {
    const rec = pet({ care: [care('play', BORN)], gifts: [] })
    // 40h < DEATH_AFTER so still alive, but > HAPPINESS_DECAY.
    expect(deriveState(rec, BORN + 40 * H).happiness).toBe(0)
  })
})

describe('cleanliness', () => {
  it('is 100 at the last clean and decays linearly to 0 over 48h', () => {
    const cleaned = BORN + H
    const rec = pet({ care: [care('clean', cleaned)] })
    expect(deriveState(rec, cleaned).cleanliness).toBe(100)
    expect(deriveState(rec, cleaned + 24 * H).cleanliness).toBe(50)
    expect(deriveState(rec, cleaned + 48 * H).cleanliness).toBe(0)
  })

  it('starts at 100 from the hatch moment before the first clean', () => {
    const hatched = BORN + 24 * H
    const rec = pet({ care: [care('feed', hatched)] })
    expect(deriveState(rec, hatched).cleanliness).toBe(100)
    expect(deriveState(rec, hatched + 24 * H).cleanliness).toBe(50)
  })

  it('clamps at 0', () => {
    const rec = pet({ care: [care('clean', BORN)] })
    expect(deriveState(rec, BORN + 60 * H).cleanliness).toBe(0)
  })
})

describe('rounding', () => {
  it('returns integer stats', () => {
    const rec = pet({ care: [care('feed', BORN), care('play', BORN), care('clean', BORN)] })
    const s = deriveState(rec, BORN + 7 * H + 13 * MIN + 999)
    for (const v of [s.hunger, s.happiness, s.cleanliness]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

describe('stage thresholds (age AND care count both required)', () => {
  it('teen at TEEN_AGE with TEEN_CARE ops', () => {
    const now = BORN + THRESHOLDS.TEEN_AGE
    const rec = pet({ care: careSpread(THRESHOLDS.TEEN_CARE, BORN + H, now) })
    expect(deriveState(rec, now).stage).toBe('teen')
  })

  it('stays baby when old enough but one care op short', () => {
    const now = BORN + THRESHOLDS.TEEN_AGE
    const rec = pet({ care: careSpread(THRESHOLDS.TEEN_CARE - 1, BORN + H, now) })
    expect(deriveState(rec, now).stage).toBe('baby')
  })

  it('stays baby when cared enough but one ms too young', () => {
    const now = BORN + THRESHOLDS.TEEN_AGE - 1
    const rec = pet({ care: careSpread(THRESHOLDS.TEEN_CARE, BORN + H, now) })
    expect(deriveState(rec, now).stage).toBe('baby')
  })

  it('adult at ADULT_AGE with ADULT_CARE ops', () => {
    const now = BORN + THRESHOLDS.ADULT_AGE
    const rec = pet({ care: careSpread(THRESHOLDS.ADULT_CARE, BORN + H, now) })
    const s = deriveState(rec, now)
    expect(s.alive).toBe(true)
    expect(s.stage).toBe('adult')
  })

  it('stays teen when old enough but one care op short of adult', () => {
    const now = BORN + THRESHOLDS.ADULT_AGE
    const rec = pet({ care: careSpread(THRESHOLDS.ADULT_CARE - 1, BORN + H, now) })
    expect(deriveState(rec, now).stage).toBe('teen')
  })

  it('stays teen when cared enough but too young for adult', () => {
    const now = BORN + THRESHOLDS.ADULT_AGE - 1
    const rec = pet({ care: careSpread(THRESHOLDS.ADULT_CARE, BORN + H, now) })
    expect(deriveState(rec, now).stage).toBe('teen')
  })
})

describe('mood and statusLine', () => {
  it('ecstatic when everything is fresh', () => {
    const now = BORN + H
    const rec = pet({ care: [care('feed', now), care('play', now), care('clean', now)] })
    const s = deriveState(rec, now)
    expect(s).toMatchObject({ hunger: 0, happiness: 100, cleanliness: 100, mood: 'ecstatic' })
    expect(s.statusLine).not.toMatch(/starving|bored|stinky|egg/i)
  })

  it('happy: score 75', () => {
    const now = BORN + 24 * H
    // hunger 50, happiness 100, cleanliness 100 -> 25 + 30 + 20 = 75
    const rec = pet({ care: [care('feed', now - 12 * H), care('play', now), care('clean', now)] })
    expect(deriveState(rec, now).mood).toBe('happy')
  })

  it('meh: score 50', () => {
    const now = BORN + 30 * H
    // hunger 100 -> 0, happiness 100 -> 30, cleanliness 100 -> 20
    const rec = pet({ care: [care('feed', now - 24 * H), care('play', now), care('clean', now)] })
    expect(deriveState(rec, now).mood).toBe('meh')
  })

  it('sad: score 35', () => {
    const now = BORN + 30 * H
    // hunger 100 -> 0, happiness 50 -> 15, cleanliness 100 -> 20
    const rec = pet({ care: [care('feed', now - 24 * H), care('play', now - 18 * H), care('clean', now)] })
    expect(deriveState(rec, now).mood).toBe('sad')
  })

  it('miserable when everything has decayed', () => {
    const rec = pet({ care: [care('feed', BORN), care('play', BORN), care('clean', BORN)] })
    const s = deriveState(rec, BORN + 60 * H)
    expect(s.alive).toBe(true)
    expect(s.mood).toBe('miserable')
  })

  it('statusLine prioritises starving', () => {
    const now = BORN + 24 * H
    const rec = pet({ care: [care('feed', now - 20 * H), care('play', now), care('clean', now)] })
    const s = deriveState(rec, now)
    expect(s.hunger).toBeGreaterThanOrEqual(80)
    expect(s.statusLine).toBe('Starving! Feed me.')
  })

  it('statusLine asks for play when bored', () => {
    const now = BORN + 40 * H
    const rec = pet({ care: [care('feed', now), care('play', now - 30 * H), care('clean', now)] })
    const s = deriveState(rec, now)
    expect(s.happiness).toBeLessThanOrEqual(20)
    expect(s.statusLine).toBe('Bored. Play with me?')
  })

  it('statusLine asks for a bath when dirty', () => {
    const now = BORN + 50 * H
    const rec = pet({ care: [care('feed', now), care('play', now), care('clean', now - 40 * H)] })
    const s = deriveState(rec, now)
    expect(s.cleanliness).toBeLessThanOrEqual(20)
    expect(s.statusLine).toBe('Stinky. Bath time!')
  })
})

describe('death', () => {
  it('is alive at exactly DEATH_AFTER since the last care op', () => {
    const fed = BORN + H
    const rec = pet({ care: [care('feed', fed)] })
    const s = deriveState(rec, fed + THRESHOLDS.DEATH_AFTER)
    expect(s.alive).toBe(true)
    expect(s.diedAt).toBeUndefined()
  })

  it('dies one ms after DEATH_AFTER with diedAt = lastCareAt + DEATH_AFTER', () => {
    const fed = BORN + H
    const rec = pet({ care: [care('feed', fed)] })
    const s = deriveState(rec, fed + THRESHOLDS.DEATH_AFTER + 1)
    expect(s.alive).toBe(false)
    expect(s.diedAt).toBe(fed + THRESHOLDS.DEATH_AFTER)
    expect(s.mood).toBe('miserable')
    expect(s.statusLine).toMatch(/^Rest in peace\. Lived /)
  })

  it('counts from the latest care op of any kind', () => {
    const rec = pet({ care: [care('feed', BORN), care('clean', BORN + 50 * H)] })
    expect(deriveState(rec, BORN + 100 * H).alive).toBe(true)
    expect(deriveState(rec, BORN + 122 * H + 1).alive).toBe(false)
  })

  it('is not postponed by gifts', () => {
    const rec = pet({ care: [care('feed', BORN)], gifts: [gift(BORN + 70 * H)] })
    const s = deriveState(rec, BORN + 73 * H)
    expect(s.alive).toBe(false)
    expect(s.diedAt).toBe(BORN + 72 * H)
  })

  it('freezes stats, age and stage at diedAt', () => {
    const fed = BORN + H
    const rec = pet({ care: [care('feed', fed)], gifts: [gift(fed + 60 * H)] })
    // At diedAt (fed + 72h) the gift is 12h old -> happiness 100 * (1 - 12/36) = 67.
    const atDeath = deriveState(rec, fed + 72 * H + 1)
    const longAfter = deriveState(rec, fed + 72 * H + 500 * H)
    expect(atDeath.happiness).toBe(67)
    expect(longAfter.happiness).toBe(67)
    expect(longAfter.hunger).toBe(100)
    expect(longAfter.cleanliness).toBe(0)
    expect(longAfter.ageMs).toBe(fed + 72 * H - BORN)
    expect(longAfter.diedAt).toBe(fed + 72 * H)
    expect(longAfter.stage).toBe('baby')
    expect(longAfter.statusLine).toBe('Rest in peace. Lived 3 days.')
  })

  it('ignores gifts that arrive after death', () => {
    const fed = BORN + H
    const rec = pet({ care: [care('feed', fed)], gifts: [gift(fed + 80 * H)] })
    const s = deriveState(rec, fed + 81 * H)
    expect(s.alive).toBe(false)
    expect(s.happiness).toBe(0)
  })

  it('is permanent: a fatal gap in the history is never undone by later care', () => {
    // why: on-chain history is immutable, so a pet that once went 72h+ without care stays dead.
    const rec = pet({ care: [care('feed', BORN), care('feed', BORN + 100 * H)] })
    const s = deriveState(rec, BORN + 101 * H)
    expect(s.alive).toBe(false)
    expect(s.diedAt).toBe(BORN + 72 * H)
    expect(s.hunger).toBe(100)
    expect(s.careCount).toBe(2)
  })

  it('reports whole days lived, floored, in the epitaph', () => {
    // Cared for 10 days, then abandoned: dies at day 13 (10d + 72h).
    const rec = pet({ care: careSpread(30, BORN, BORN + 10 * D) })
    const s = deriveState(rec, BORN + 20 * D)
    expect(s.alive).toBe(false)
    expect(s.diedAt).toBe(BORN + 13 * D)
    expect(s.ageMs).toBe(13 * D)
    expect(s.statusLine).toBe('Rest in peace. Lived 13 days.')
    // Floors: 3 days + 1h is still "3 days".
    const rec2 = pet({ care: [care('feed', BORN + H)] })
    expect(deriveState(rec2, BORN + 80 * H).statusLine).toBe('Rest in peace. Lived 3 days.')
  })
})

describe('timeScale', () => {
  it('multiplies elapsed time for hunger', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    expect(deriveState(rec, BORN + H, 12).hunger).toBe(50)
    expect(deriveState(rec, BORN + 2 * H, 12).hunger).toBe(100)
  })

  it('scales age and stage', () => {
    const now = BORN + 4 * H // 4h real * 12 = 48h scaled
    const rec = pet({ care: careSpread(THRESHOLDS.TEEN_CARE, BORN + 10 * MIN, now) })
    const s = deriveState(rec, now, 12)
    expect(s.ageMs).toBe(48 * H)
    expect(s.stage).toBe('teen')
    expect(deriveState(rec, now, 1).stage).toBe('baby')
  })

  it('scales death and reports an unscaled diedAt', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    expect(deriveState(rec, BORN + 6 * H, 12).alive).toBe(true)
    const s = deriveState(rec, BORN + 6 * H + 1, 12)
    expect(s.alive).toBe(false)
    expect(s.diedAt).toBe(BORN + 6 * H)
  })

  it('does not treat a same-history pet as dead at scale 1', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    expect(deriveState(rec, BORN + 6 * H + 1, 1).alive).toBe(true)
  })

  it('judges historical gaps at scale too, so a pet hatched before the scale was set can die', () => {
    // why: death is permanent and never judged twice, so the scale applies to
    // the whole history. Demo pets must be hatched after VITE_TIME_SCALE is set.
    const rec = pet({ care: [care('feed', BORN), care('feed', BORN + 8 * H), care('feed', BORN + 9 * H)] })
    expect(deriveState(rec, BORN + 9 * H, 1).alive).toBe(true)
    const s = deriveState(rec, BORN + 9 * H, 12)
    expect(s.alive).toBe(false)
    expect(s.diedAt).toBe(BORN + 6 * H)
  })
})

describe('future-dated ops (clock skew)', () => {
  it('treats a care op in the future as happening now', () => {
    const now = BORN + 10 * H
    const rec = pet({ care: [care('feed', now + 5 * H)] })
    const s = deriveState(rec, now)
    expect(s.stage).toBe('baby')
    expect(s.hunger).toBe(0)
    expect(s.lastCare.feed).toBe(now)
    expect(s.alive).toBe(true)
  })

  it('treats a gift in the future as happening now', () => {
    const now = BORN + 10 * H
    const rec = pet({ care: [care('feed', now)], gifts: [gift(now + H)] })
    expect(deriveState(rec, now).happiness).toBe(100)
  })

  it('does not misorder death when an op is future-dated', () => {
    const now = BORN + 10 * H
    const rec = pet({ care: [care('feed', BORN), care('feed', now + 5 * H)] })
    expect(deriveState(rec, now).alive).toBe(true)
  })
})

describe('describeDuration', () => {
  it('formats compactly', () => {
    expect(describeDuration(0)).toBe('<1m')
    expect(describeDuration(59_999)).toBe('<1m')
    expect(describeDuration(-5 * H)).toBe('<1m')
    expect(describeDuration(12 * MIN)).toBe('12m')
    expect(describeDuration(3 * H)).toBe('3h')
    expect(describeDuration(3 * H + 20 * MIN)).toBe('3h 20m')
    expect(describeDuration(2 * D)).toBe('2d')
    expect(describeDuration(2 * D + 4 * H)).toBe('2d 4h')
    expect(describeDuration(2 * D + 4 * H + 30 * MIN)).toBe('2d 4h')
    expect(describeDuration(Number.NaN)).toBe('<1m')
  })
})

describe('timeUntil', () => {
  it('returns real ms until starving and until death', () => {
    const fed = BORN + H
    const rec = pet({ care: [care('feed', fed)] })
    const t = timeUntil(rec, fed + 10 * H, 1)
    expect(t.starvesIn).toBe(14 * H)
    expect(t.diesIn).toBe(62 * H)
  })

  it('uses the latest care op of any kind for death but only feeds for hunger', () => {
    const rec = pet({ care: [care('feed', BORN), care('play', BORN + 10 * H)] })
    const t = timeUntil(rec, BORN + 12 * H, 1)
    expect(t.starvesIn).toBe(12 * H)
    expect(t.diesIn).toBe(70 * H)
  })

  it('clamps starvesIn at 0 once starving', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    expect(timeUntil(rec, BORN + 30 * H, 1).starvesIn).toBe(0)
  })

  it('returns null diesIn for an egg and counts hunger from bornAt', () => {
    const t = timeUntil(pet(), BORN + 4 * H, 1)
    expect(t.diesIn).toBeNull()
    expect(t.starvesIn).toBe(20 * H)
  })

  it('converts scaled thresholds back to real ms', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    const t = timeUntil(rec, BORN + H, 2)
    expect(t.starvesIn).toBe(11 * H)
    expect(t.diesIn).toBe(35 * H)
  })

  it('returns zeros for a dead pet', () => {
    const rec = pet({ care: [care('feed', BORN)] })
    const t = timeUntil(rec, BORN + 100 * H, 1)
    expect(t.starvesIn).toBe(0)
    expect(t.diesIn).toBe(0)
  })

  it('treats future-dated feeds as now', () => {
    const now = BORN + H
    const rec = pet({ care: [care('feed', now + 3 * H)] })
    const t = timeUntil(rec, now, 1)
    expect(t.starvesIn).toBe(24 * H)
    expect(t.diesIn).toBe(72 * H)
  })
})
