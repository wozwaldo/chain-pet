import { useState } from 'react'
import { deriveState, describeDuration, THRESHOLDS, timeUntil } from '../pet/engine'
import type { PetData } from '../pet/usePet'
import { CARE_KINDS, type CareKind } from '../pet/types'
import { TIME_SCALE } from '../stellar/config'
import { useDocumentBadge } from '../pet/useDocumentBadge'
import { careOp, submitOps, type Signer } from '../stellar/tx'
import { GiftPanel } from './GiftPanel'
import { HistoryPanel } from './HistoryPanel'
import { PetSprite } from './PetSprite'
import { StatBar } from './StatBar'
import { TransferPanel } from './TransferPanel'
import { useAction } from './useAction'
import { AccountLink, Button, Card, ErrorBox, TxLink, Why } from './ui'

type Tab = 'care' | 'history' | 'transfer' | 'gift'
const CARE_LABEL: Record<CareKind, string> = { feed: '🍙 Feed', play: '🎾 Play', clean: '🫧 Clean' }
const STAGE_LABEL = { egg: 'Egg', baby: 'Baby', teen: 'Teen', adult: 'Adult' } as const

export function PetScreen({
  address,
  data,
  now,
  sign,
  reload,
  readOnly = false,
  canSign = true,
}: {
  address: string
  data: PetData
  now: number
  sign: Signer
  reload: () => Promise<void>
  /** Viewing someone else's pet: no actions, no "you hatched" banner. */
  readOnly?: boolean
  /** false while Freighter is on the wrong network: everything visible, nothing signable. */
  canSign?: boolean
}) {
  const { record, relation } = data
  const [tab, setTab] = useState<Tab>(readOnly ? 'history' : 'care')
  const action = useAction(reload)
  const state = deriveState(record, now, TIME_SCALE)
  const until = timeUntil(record, now, TIME_SCALE)
  useDocumentBadge(record, state)
  const isOwner = !readOnly && relation === 'owner'
  const canCare = isOwner && state.alive && canSign
  // Shout before the point of no return: death is permanent. Scale-aware (18 real min at x60, 18h at x1).
  const deathWarnMs = (THRESHOLDS.DEATH_AFTER / TIME_SCALE) * 0.25
  const nearDeath = state.alive && until.diesIn !== null && until.diesIn < deathWarnMs

  const anim = !state.alive ? 'sprite-anim-sway' : state.mood === 'ecstatic' ? 'sprite-anim-wobble' : state.mood === 'sad' || state.mood === 'miserable' ? 'sprite-anim-droop' : 'sprite-anim-bob'

  return (
    <div className="space-y-4">
      {readOnly && (
        <Card className="border-sky-700 bg-sky-50 text-sm">
          Viewing <b>{record.name}</b>, who lives with <AccountLink address={record.owner} />. Connect Freighter to send a treat.
        </Card>
      )}
      {!readOnly && !isOwner && (
        <Card className="border-sky-700 bg-sky-50 text-sm">
          You hatched <b>{record.name}</b>, but it now lives with <AccountLink address={record.owner} />. Its whole life is still on-chain below.
        </Card>
      )}
      <Card>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center">
            <div className="rounded-2xl bg-amber-100 p-4">
              <PetSprite species={record.species} stage={state.stage} mood={state.mood} alive={state.alive} size={8} className={anim} />
            </div>
            <span className="mt-2 rounded-full border border-[#2b2140] bg-white px-2 py-0.5 text-xs font-bold">
              {state.alive ? STAGE_LABEL[state.stage] : 'Ghost'} · {record.species}
            </span>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-2xl font-black">{record.name}</h2>
              <p className="text-sm text-stone-600">{state.statusLine}</p>
              <p className="text-xs text-stone-500">
                Age {describeDuration(state.ageMs)} · {state.careCount} care ops · born on <AccountLink address={record.issuer} />
                {TIME_SCALE > 1 && <span className="ml-1 rounded bg-violet-100 px-1 text-violet-700">demo clock ×{TIME_SCALE}</span>}
              </p>
            </div>
            {state.stage !== 'egg' && (
              <div className="space-y-1.5">
                <StatBar label="Hunger" value={state.hunger} icon="🍙" invert />
                <StatBar label="Happiness" value={state.happiness} icon="🎾" />
                <StatBar label="Clean" value={state.cleanliness} icon="🫧" />
              </div>
            )}
            {state.alive ? (
              <p className="text-xs text-stone-500">
                {until.starvesIn === 0 ? 'Starving' : <>Starves in {describeDuration(until.starvesIn)}</>}
                {until.diesIn !== null && !nearDeath && <> · dies if ignored for {describeDuration(until.diesIn)}</>}
                {nearDeath && until.diesIn !== null && (
                  <span className="ml-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                    Dies for good in {describeDuration(until.diesIn)} — any care resets this
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm font-semibold text-stone-700">
                💐 {record.name} passed away {state.diedAt ? describeDuration(now - state.diedAt) : ''} ago. The record cannot be reset.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          {(readOnly ? (['history'] as Tab[]) : (['care', 'history', 'transfer', 'gift'] as Tab[])).map((t) => (
            <Button key={t} tone={tab === t ? 'secondary' : 'ghost'} disabled={action.anyBusy} onClick={() => setTab(t)} className="capitalize">
              {t}
            </Button>
          ))}
        </div>
        {tab === 'care' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {CARE_KINDS.map((k) => (
                <Button
                  key={k}
                  disabled={!canCare || action.anyBusy}
                  className={nearDeath && canCare ? 'animate-pulse' : ''}
                  onClick={() => action.run(() => submitOps(address, [careOp(k)], sign))}
                >
                  {CARE_LABEL[k]}
                </Button>
              ))}
              {action.lastHash && <TxLink hash={action.lastHash} />}
            </div>
            {action.busy && <p className="text-sm text-stone-500">Sign in Freighter, then Horizon confirms in a few seconds…</p>}
            <Why>Each action is one manageData op (key pet.care). Free apart from the network fee; the ledger timestamp is what the pet feels.</Why>
            {!isOwner && <p className="text-sm text-stone-500">Only the current owner can care for this pet.</p>}
            {isOwner && !canSign && <p className="text-sm text-stone-500">Switch Freighter to TESTNET to care for this pet.</p>}
            <ErrorBox message={action.error} />
          </div>
        )}
        {tab === 'history' && <HistoryPanel record={record} now={now} />}
        {tab === 'transfer' &&
          (isOwner ? (
            <TransferPanel address={address} record={record} now={now} sign={sign} reload={reload} canSign={canSign} />
          ) : (
            <p className="text-sm text-stone-500">Only the current owner can transfer this pet.</p>
          ))}
        {tab === 'gift' && <GiftPanel address={address} now={now} sign={sign} reload={reload} canSign={canSign} />}
      </Card>
    </div>
  )
}
