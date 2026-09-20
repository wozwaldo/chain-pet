// The handheld: shell with tilt, solar strip, meadow LCD, moodline, ticker and
// the three capsule keys. Port of the design's Shell component ('garden' era).
// The parent owns the chain; the Device only draws state and runs an animation
// sequence when the `play` / `hatched` nonces change (i.e. after a tx
// succeeded). A key press just calls `onAction`; nothing animates on its own.
import { useEffect, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { SPECIES_META, type Mood, type Species, type Stage } from '../pet/types'
import type { CastVariant } from '../art/cast'
import { PixelIcon } from '../art/PixelIcon'
import { PetSprite } from './PetSprite'
import './device.css'

export type DeviceAction = 'feed' | 'play' | 'clean'

export interface DeviceProps {
  name: string
  stageLabel: string
  species: Species
  stage: Stage
  mood: Mood
  alive: boolean
  /** Uppercase mono line under the pet when idle. */
  moodline: string
  /** Optional bottom ticker row; hidden when empty/undefined. */
  ticker?: string
  urgent?: boolean
  onAction?: (kind: DeviceAction) => void
  /** Dims keys (opacity .45) and ignores presses. */
  keysDisabled?: boolean
  /** While a tx is in flight: replaces the moodline (e.g. 'SIGNING · CONFIRMING…') and disables keys. */
  busyLine?: string | null
  /** When nonce changes, run that action's animation sequence (call AFTER the transaction succeeded). */
  play?: { kind: DeviceAction; nonce: number } | null
  /** Nonce; when it changes play the egg squash then reveal the pet (stage changed from egg). */
  hatched?: number
  className?: string
}

type SeqKind = DeviceAction | 'squash' | 'hatch'
type SeqPhase = 'go' | 'done' | 'squash' | 'reveal'

/** One running animation sequence. `id` guards stale timers. */
interface Seq {
  id: number
  kind: SeqKind
  phase: SeqPhase
  line: string | null
  /** Pet mirrored (play: turns to follow the ball). */
  flip: boolean
  /** Feed: the mouth-open frame is showing. */
  eat: boolean
}

const ACTION_LINES: Record<DeviceAction, string> = { feed: 'NOM NOM NOM', play: 'WHEEE!', clean: 'SCRUB-A-DUB' }

const KEYS: readonly { kind: DeviceAction; icon: 'apple' | 'ball' | 'soap'; label: string; aria: string }[] = [
  { kind: 'feed', icon: 'apple', label: 'FEED', aria: 'Feed' },
  { kind: 'play', icon: 'ball', label: 'PLAY', aria: 'Play' },
  { kind: 'clean', icon: 'soap', label: 'CLEAN', aria: 'Clean' },
]

const REDUCED_MQ = '(prefers-reduced-motion: reduce)'
function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(REDUCED_MQ)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
function readReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_MQ).matches
}
function readReducedServer(): boolean {
  return false
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function startSeq(prev: Seq | null, kind: SeqKind): Seq {
  const line = kind === 'feed' || kind === 'play' || kind === 'clean' ? ACTION_LINES[kind] : kind === 'hatch' ? 'CRACK!' : null
  return { id: (prev?.id ?? 0) + 1, kind, phase: kind === 'hatch' ? 'squash' : 'go', line, flip: false, eat: false }
}

export function Device(props: DeviceProps) {
  const { name, stageLabel, species, stage, mood, alive, moodline, ticker, urgent, onAction, keysDisabled, busyLine, play, hatched, className } = props
  const reduced = useSyncExternalStore(subscribeReduced, readReduced, readReducedServer)

  // --- Animation sequences: start one when a nonce changes (React's "adjust state on prop change" pattern).
  const playNonce = play?.nonce ?? 0
  const hatchNonce = hatched ?? 0
  const [seen, setSeen] = useState({ play: playNonce, hatch: hatchNonce })
  const [seq, setSeq] = useState<Seq | null>(null)
  if (seen.play !== playNonce || seen.hatch !== hatchNonce) {
    const hatching = seen.hatch !== hatchNonce
    setSeen({ play: playNonce, hatch: hatchNonce })
    let kind: SeqKind | null = null
    if (alive) {
      // Ghosts ignore everything; an egg only wobbles, whatever the key.
      if (hatching) kind = 'hatch'
      else if (stage === 'egg') kind = 'squash'
      else if (play) kind = play.kind
    }
    if (kind !== null) {
      const next = kind
      setSeq((prev) => startSeq(prev, next))
    }
  }

  // Timers for the running sequence. Re-runs only when a NEW sequence starts (id), and the
  // cleanup clears every timer of the previous one, so a nonce arriving mid-sequence is safe.
  const seqId = seq?.id ?? 0
  const seqKind = seq?.kind ?? null
  useEffect(() => {
    if (seqId === 0 || seqKind === null) return
    const id = seqId
    const timers: number[] = []
    let chew: number | undefined
    const t = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms))
    }
    const patch = (p: Partial<Seq>) => setSeq((s) => (s && s.id === id ? { ...s, ...p } : s))
    const end = () => setSeq((s) => (s && s.id === id ? null : s))
    const done = (at: number) => {
      t(() => patch({ phase: 'done', line: 'SO HAPPY', flip: false, eat: false }), at)
      t(end, at + 900)
    }
    switch (seqKind) {
      case 'feed':
        // apple lands ~950ms in; chew (mouth frame swap) 950-2050, then SO HAPPY.
        t(() => {
          chew = window.setInterval(() => setSeq((s) => (s && s.id === id ? { ...s, eat: !s.eat } : s)), 200)
        }, 950)
        t(() => {
          if (chew !== undefined) window.clearInterval(chew)
          chew = undefined
          patch({ eat: false })
        }, 2050)
        done(2150)
        break
      case 'play':
        t(() => patch({ flip: true }), 950)
        t(() => patch({ flip: false }), 1800)
        done(2150)
        break
      case 'clean':
        done(1950)
        break
      case 'squash':
        t(end, 500)
        break
      case 'hatch':
        t(() => patch({ phase: 'reveal', line: 'HATCHED!' }), 450)
        t(end, 450 + 900)
        break
    }
    return () => {
      timers.forEach((h) => window.clearTimeout(h))
      if (chew !== undefined) window.clearInterval(chew)
    }
  }, [seqId, seqKind])

  // --- Idle micro-frames: wings/tail 'flap' every 360ms, or a 150ms 'blink' every 3.2s.
  const idleKind = SPECIES_META[species].idle
  const microOn = alive && stage !== 'egg' && seq === null
  const [micro, setMicro] = useState<CastVariant | null>(null)
  useEffect(() => {
    if (!microOn) return
    if (idleKind === 'flap') {
      const iv = window.setInterval(() => setMicro((m) => (m === 'flap' ? null : 'flap')), 360)
      return () => window.clearInterval(iv)
    }
    let off: number | undefined
    const iv = window.setInterval(() => {
      setMicro('blink')
      off = window.setTimeout(() => setMicro(null), 150)
    }, 3200)
    return () => {
      window.clearInterval(iv)
      if (off !== undefined) window.clearTimeout(off)
    }
  }, [microOn, idleKind, species])

  // --- Butterfly wing frame swap.
  const [wing, setWing] = useState(false)
  useEffect(() => {
    const iv = window.setInterval(() => setWing((w) => !w), 340)
    return () => window.clearInterval(iv)
  }, [])

  // --- Tilt + cursor follow.
  const cheerful = mood === 'happy' || mood === 'ecstatic'
  const canFollow = alive && stage !== 'egg' && seq === null && cheerful && !reduced
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 })
  const [follow, setFollow] = useState({ hover: false, x: 0, flip: false })
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced) return
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const dx = (e.clientX - r.left) / r.width - 0.5
    const dy = (e.clientY - r.top) / r.height - 0.5
    setTilt({ rx: -dy * 7, ry: dx * 9 })
    // The art faces left: mirror when the pointer is on the right so the pet looks at it.
    if (canFollow) setFollow({ hover: true, x: clamp(dx * 40, -16, 16), flip: dx > 0.06 })
  }
  const onLeave = () => {
    setTilt({ rx: 0, ry: 0 })
    setFollow({ hover: false, x: 0, flip: false })
  }

  // --- What to draw.
  const disabled = Boolean(keysDisabled || busyLine || !alive)
  const line = busyLine ?? seq?.line ?? moodline
  const showEgg = seq?.kind === 'hatch' && seq.phase === 'squash'
  const spriteStage: Stage = showEgg ? 'egg' : stage
  const variant: CastVariant | null = seq?.kind === 'feed' && seq.eat ? 'eat' : microOn ? micro : null
  const flipped = seq ? seq.flip : canFollow && follow.flip
  const petX = canFollow ? follow.x : 0
  const stroll = canFollow && !follow.hover
  const floating = !alive || (spriteStage !== 'egg' && SPECIES_META[species].kind === 'floating')

  const idleClass = !alive
    ? 'dv-i-ghost'
    : spriteStage === 'egg'
      ? 'dv-i-egg'
      : mood === 'sad' || mood === 'miserable'
        ? 'dv-i-droop'
        : floating
          ? 'dv-i-float'
          : 'dv-i-bob'
  let animClass = idleClass
  if (seq) {
    if (seq.kind === 'hatch') animClass = seq.phase === 'squash' ? 'dv-a-squash' : 'dv-a-reveal'
    else if (seq.kind === 'squash') animClass = 'dv-a-squash'
    else if (seq.phase === 'done') animClass = idleClass
    else if (seq.kind === 'play') animClass = 'dv-a-hop'
    else if (seq.kind === 'clean') animClass = 'dv-a-scrub'
    else animClass = 'dv-a-still'
  }
  const going = seq !== null && seq.phase === 'go'
  const showFood = going && seq.kind === 'feed'
  const showBall = going && seq.kind === 'play'
  const showBubbles = going && seq.kind === 'clean'
  const showHeartPop = seq !== null && (seq.phase === 'done' || seq.phase === 'reveal')

  const rootClass = ['dv-root', alive ? '' : 'dv-ghost', className ?? ''].filter(Boolean).join(' ')

  return (
    <div className={rootClass} onPointerMove={onMove} onPointerLeave={onLeave} data-stage={stage} data-mood={mood}>
      <div className="dv-shell" style={{ transform: `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)` }}>
        <div className="dv-solar">
          <PixelIcon name="leaf" px={18} />
          <span className="dv-brand">CHAIN·PET</span>
          <span className="dv-cells" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="dv-bezel">
          <div className="dv-lcd">
            <div className="dv-glare" aria-hidden="true" />
            <div className="dv-meadow" aria-hidden="true">
              <PixelIcon name="grass" px={18} className="dv-grass" />
              <PixelIcon name="flower" px={26} className="dv-flower" />
              <PixelIcon name="grass" px={18} className="dv-grass dv-grass-r" />
            </div>
            <div className="dv-bfly" aria-hidden="true">
              <PixelIcon name={wing ? 'bfly_b' : 'bfly_a'} px={13} />
            </div>

            <div className="dv-head">
              <span>{name}</span>
              <span>{stageLabel}</span>
            </div>

            <div className="dv-pet-col">
              <div className={floating ? 'dv-petbox dv-kind-floating' : 'dv-petbox'}>
                <div className={stroll ? 'dv-walk dv-stroll' : 'dv-walk'}>
                  <div className="dv-follow" style={{ transform: `translateX(${petX}px)` }}>
                    <div className="dv-petwrap">
                      <div className={`dv-anim ${animClass}`}>
                        <PetSprite species={species} stage={spriteStage} mood={mood} alive={alive} px={116} variant={variant} flip={flipped} />
                      </div>
                      {showFood && (
                        <>
                          <div className="dv-item-food" aria-hidden="true">
                            <PixelIcon name="apple" px={32} />
                          </div>
                          <div className="dv-shards" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                          </div>
                        </>
                      )}
                      {showBall && (
                        <>
                          <div className="dv-item-ball" aria-hidden="true">
                            <PixelIcon name="ball" px={32} />
                          </div>
                          <div className="dv-hearts" aria-hidden="true">
                            <PixelIcon name="heart" px={14} />
                            <PixelIcon name="heart" px={12} />
                            <PixelIcon name="heart" px={11} />
                            <PixelIcon name="heart" px={14} />
                            <PixelIcon name="heart" px={12} />
                          </div>
                        </>
                      )}
                      {showBubbles && (
                        <div className="dv-bubbles" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                          <i />
                        </div>
                      )}
                      {showHeartPop && (
                        <div className="dv-heartpop" aria-hidden="true">
                          <PixelIcon name="heart" px={26} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="dv-shadow" aria-hidden="true" />
              <div className="dv-line" aria-live="polite">
                {line}
              </div>
            </div>

            {ticker ? (
              <div className={urgent ? 'dv-ticker dv-urgent' : 'dv-ticker'} role={urgent ? 'status' : undefined}>
                <i className="dv-dot" aria-hidden="true" />
                <span>{ticker}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="dv-keys">
          {KEYS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className="dv-key"
              aria-label={k.aria}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onAction?.(k.kind)
              }}
            >
              <PixelIcon name={k.icon} px={19} />
              <span className="dv-keylabel">{k.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
