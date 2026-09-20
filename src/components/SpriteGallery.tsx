// Dev-only visual QA page (/?gallery): the whole cast with its animation
// frames, egg + ghost, every UI icon, treats, and the stage scale. Imports
// only the art modules so it keeps working while screens are mid-rewrite.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { SPECIES, SPECIES_META, TREAT_KINDS, type Species, type Stage } from '../pet/types'
import { CAST, type CastVariant } from '../art/cast'
import { ICON_NAMES } from '../art/icons'
import { SPRITE_STAGE_SCALE } from '../art/petSprite'
import { PixelIcon } from '../art/PixelIcon'
import { PetSprite } from './PetSprite'
import { TreatIcon } from './TreatIcon'

const STAGES: readonly Stage[] = ['egg', 'baby', 'teen', 'adult']
const PX = 96

export function SpriteGallery() {
  const [demoSpecies, setDemoSpecies] = useState<Species>('tanuki')
  const [flip, setFlip] = useState(false)

  return (
    <div className="min-h-screen bg-[#ebe6cf] p-6 text-[#3a4030]">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-black">Sprite gallery</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
          flip
        </label>
        <span className="text-xs text-[#75795c]">adult px = {PX}</span>
      </header>

      <Section title="Cast">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {SPECIES.map((s) => {
            const idle = SPECIES_META[s].idle
            const variants: Array<CastVariant | null> = [null, 'eat', idle]
            if (s === 'bug') variants.push('ant')
            return (
              <Card key={s}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-bold">{SPECIES_META[s].label}</h3>
                  <span className="font-mono text-xs text-[#75795c]">
                    {s} · {CAST[s].w}x{CAST[s].h} · {SPECIES_META[s].kind}
                  </span>
                </div>
                <div className="flex items-end gap-3">
                  {variants.map((v) => (
                    <Labeled key={v ?? 'base'} label={v ?? 'base'}>
                      <PetSprite species={s} stage="adult" mood="happy" alive px={PX} variant={v} flip={flip} />
                    </Labeled>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      </Section>

      <Section title="Egg and ghost">
        <Card>
          <div className="flex items-end gap-6">
            <Labeled label="egg">
              <PetSprite species="tanuki" stage="egg" mood="happy" alive px={PX} />
            </Labeled>
            <Labeled label="ghost">
              <PetSprite species="tanuki" stage="adult" mood="meh" alive={false} px={PX} />
            </Labeled>
          </div>
        </Card>
      </Section>

      <Section title="Stage scale">
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            {SPECIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDemoSpecies(s)}
                className={
                  'rounded-full px-3 py-1 text-sm ' +
                  (s === demoSpecies ? 'bg-[#5d8a4f] text-white' : 'bg-[#e7e1c6] text-[#3a4030]')
                }
              >
                {SPECIES_META[s].label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-6 border-b-4 border-[#dce6bf] pb-1">
            {STAGES.map((st) => (
              <Labeled key={st} label={`${st} ×${SPRITE_STAGE_SCALE[st]}`}>
                <PetSprite species={demoSpecies} stage={st} mood="happy" alive px={PX} flip={flip} />
              </Labeled>
            ))}
            <Labeled label="ghost ×0.8">
              <PetSprite species={demoSpecies} stage="adult" mood="sad" alive={false} px={PX} />
            </Labeled>
          </div>
        </Card>
      </Section>

      <Section title="Icons (px 32)">
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            {ICON_NAMES.map((n) => (
              <Labeled key={n} label={n}>
                <PixelIcon name={n} px={32} title={n} />
              </Labeled>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Treats">
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            {[...TREAT_KINDS, 'unknown-kind'].map((k) => (
              <Labeled key={k} label={k}>
                <TreatIcon kind={k} size={4} />
              </Labeled>
            ))}
          </div>
        </Card>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-[rgba(58,64,48,0.15)] bg-[#f9f6e8] p-4">{children}</div>
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-end justify-center">{children}</div>
      <span className="font-mono text-[11px] text-[#75795c]">{label}</span>
    </div>
  )
}
