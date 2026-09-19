import { useState } from 'react'
import { hatchOps, submitOps, type Signer } from '../stellar/tx'
import { SPECIES, type Species } from '../pet/types'
import { PetSprite } from './PetSprite'
import { useAction } from './useAction'
import { Button, Card, ErrorBox, Field, TxLink, Why } from './ui'
import { inputClass } from './form'

const SPECIES_LABEL: Record<Species, string> = { blob: 'Blob', cat: 'Cat', dragon: 'Dragon' }

export function HatchScreen({ address, sign, onHatched }: { address: string; sign: Signer; onHatched: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<Species>('blob')
  const action = useAction(onHatched)
  const valid = name.trim().length >= 1 && name.trim().length <= 24

  return (
    <Card className="mx-auto max-w-md">
      <h2 className="text-lg font-black">Lay an egg</h2>
      <p className="mt-1 text-sm text-stone-600">
        Your account becomes the pet's birth certificate. The ledger time of this transaction is its birthday, forever.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {SPECIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpecies(s)}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition ${
              species === s ? 'border-[#2b2140] bg-amber-100 shadow-[2px_2px_0_#2b2140]' : 'border-transparent hover:bg-stone-100'
            }`}
          >
            <PetSprite species={s} stage="egg" mood="happy" alive size={4} />
            <span className="text-xs font-bold">{SPECIES_LABEL[s]}</span>
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Field label="Name" hint="1–24 characters. Stored on-chain as data entry pet.name.">
          <input
            className={inputClass}
            value={name}
            maxLength={24}
            placeholder="Mochi"
            onChange={(e) => setName(e.target.value)}
            disabled={action.busy}
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={!valid || action.busy} onClick={() => action.run(() => submitOps(address, hatchOps(name.trim(), species), sign))}>
          {action.busy ? 'Waiting for Freighter…' : 'Hatch on Stellar'}
        </Button>
        {action.lastHash && <TxLink hash={action.lastHash} />}
      </div>
      <div className="mt-3">
        <Why>Two manageData ops write pet.name and pet.species to your account. Costs only the network fee.</Why>
      </div>
      <div className="mt-2">
        <ErrorBox message={action.error} />
      </div>
    </Card>
  )
}
