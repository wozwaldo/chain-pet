// Dev-only visual QA: every species x stage x mood, plus ghosts, treats and
// stat bars. Not wired into App; mount it temporarily to eyeball the art.
import { useState } from 'react'
import { SPECIES, TREAT_KINDS } from '../pet/types'
import { PetSprite, SPRITE_MOODS, SPRITE_STAGES } from './PetSprite'
import { StatBar } from './StatBar'
import { TreatIcon } from './TreatIcon'

export function SpriteGallery({ size: initialSize = 4 }: { size?: number }) {
  const [size, setSize] = useState(initialSize)
  const columns = [...SPRITE_MOODS, 'ghost'] as const

  return (
    <div className="min-h-screen bg-amber-50 p-6 text-stone-800">
      <header className="mb-6 flex items-center gap-4">
        <h1 className="text-xl font-black">Sprite gallery</h1>
        <label className="flex items-center gap-2 text-sm">
          size {size}
          <input type="range" min={2} max={10} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
      </header>

      {SPECIES.map((species) => (
        <section key={species} className="mb-10">
          <h2 className="mb-2 text-lg font-bold capitalize">{species}</h2>
          <div
            className="grid items-end gap-2"
            style={{ gridTemplateColumns: `6rem repeat(${columns.length}, max-content)` }}
          >
            <div />
            {columns.map((c) => (
              <div key={c} className="text-center text-xs font-semibold text-stone-500">
                {c}
              </div>
            ))}
            {SPRITE_STAGES.map((stage) => (
              <Row key={stage} label={stage}>
                {columns.map((c) => (
                  <Cell key={c}>
                    <PetSprite
                      species={species}
                      stage={stage}
                      mood={c === 'ghost' ? 'meh' : c}
                      alive={c !== 'ghost'}
                      size={size}
                    />
                  </Cell>
                ))}
              </Row>
            ))}
          </div>
        </section>
      ))}

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-bold">Treats</h2>
        <div className="flex flex-wrap gap-4">
          {[...TREAT_KINDS, 'gift', 'unknown-kind'].map((kind) => (
            <div key={kind} className="flex flex-col items-center gap-1 text-xs text-stone-500">
              <Cell>
                <TreatIcon kind={kind} size={size + 2} />
              </Cell>
              {kind}
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-md space-y-2">
        <h2 className="mb-2 text-lg font-bold">Stat bars</h2>
        <StatBar label="Happiness" icon="💖" value={85} />
        <StatBar label="Clean" icon="🫧" value={45} />
        <StatBar label="Hunger" icon={<TreatIcon kind="apple" size={2} />} value={80} invert />
        <StatBar label="Fixed bad" value={95} tone="bad" />
        <StatBar label="Clamped" value={140} />
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-sm font-semibold capitalize">{label}</div>
      {children}
    </>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end justify-center rounded-xl border-2 border-[#2b2140] bg-white p-1">{children}</div>
  )
}
