// "Lay an egg": the Device previews the egg on the left, the birth-certificate
// card on the right. Two manageData ops (pet.name, pet.species) on this account.
import { useState } from 'react'
import { hatchOps, submitOps, type Signer } from '../stellar/tx'
import { SPECIES, SPECIES_META, type Species } from '../pet/types'
import { Device } from './Device'
import { PetSprite } from './PetSprite'
import { useAction } from './useAction'
import { Button, Card, ErrorBox, Field, TxLink, Why } from './ui'
import { inputClassSans } from './form'

export function HatchScreen({
  address,
  sign,
  onHatched,
  pendingClaims = 0,
}: {
  address: string
  sign: Signer
  onHatched: () => Promise<void>
  /** Pets in flight to this account. Hatching makes them unclaimable, so warn first. */
  pendingClaims?: number
}) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<Species>('plain')
  const [ack, setAck] = useState(false)
  const action = useAction(onHatched)
  const trimmed = name.trim()
  const valid = trimmed.length >= 1 && trimmed.length <= 24
  const blockedByClaim = pendingClaims > 0 && !ack

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-7">
      <Device
        name={trimmed ? trimmed.toUpperCase() : 'NEW EGG'}
        stageLabel="EGG"
        species={species}
        stage="egg"
        mood="happy"
        alive
        moodline={action.busy ? 'HATCHING ON STELLAR…' : 'NAME ME, THEN HATCH'}
        keysDisabled
        className="w-full"
      />
      <Card>
        <h2 className="text-lg font-extrabold text-ink">Lay an egg</h2>
        <p className="mt-1 text-[13px] leading-normal text-muted">
          Your account becomes the pet's birth certificate. The ledger time of this transaction is its birthday, forever.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Species">
          {SPECIES.map((s) => {
            const active = species === s
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={action.busy}
                onClick={() => setSpecies(s)}
                className={`flex flex-col items-center gap-1.5 rounded-[14px] px-1 pt-3 pb-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-active disabled:cursor-not-allowed disabled:opacity-50 ${
                  active ? 'border-2 border-treat-active-border bg-treat-active' : 'border-[1.5px] border-line-soft bg-field hover:bg-header'
                }`}
              >
                <span className="flex h-16 items-end justify-center">
                  <PetSprite species={s} stage="adult" mood="happy" alive px={64} />
                </span>
                <span className={`text-xs ${active ? 'font-bold text-ink' : 'font-semibold text-muted-2'}`}>{SPECIES_META[s].label}</span>
              </button>
            )
          })}
        </div>
        <Field className="mt-4" label="Name" hint="1–24 characters. Stored on-chain as data entry pet.name.">
          <input
            className={inputClassSans}
            value={name}
            maxLength={24}
            placeholder="Mochi"
            onChange={(e) => setName(e.target.value)}
            disabled={action.busy}
          />
        </Field>
        {pendingClaims > 0 && (
          <div className="mt-4 rounded-xl border-[1.5px] border-pending-border bg-pending px-3 py-2.5 text-[13px] leading-normal text-ink">
            <p>A pet is waiting for you above. If you hatch your own, you will not be able to claim it.</p>
            <label className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
              <input type="checkbox" className="accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={action.busy} />
              I want a new pet anyway
            </label>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            className="w-full lg:w-[220px]"
            disabled={!valid || blockedByClaim || action.anyBusy}
            onClick={() => action.run(() => submitOps(address, hatchOps(trimmed, species), sign))}
          >
            {action.busy ? 'Signing & confirming…' : 'Hatch on Stellar'}
          </Button>
          {action.lastHash && <TxLink hash={action.lastHash} />}
        </div>
        {action.busy && <Why className="mt-2">Sign in Freighter, then Horizon confirms in a few seconds…</Why>}
        <Why className="mt-3">Two manageData ops write pet.name and pet.species to your account. Costs only the network fee.</Why>
        <ErrorBox className="mt-2" message={action.error} />
      </Card>
    </div>
  )
}
