// The pet page in the Cozy Garden layout (design 6a): the Device on the left
// (the care keys ARE the care actions), vitals + History / Transfer / Gift on
// the right. All chain logic is unchanged: one manageData op per key press,
// guarded by the shared tx lock, the owner rule and the network check.
import { useState } from 'react'
import { PixelIcon } from '../art/PixelIcon'
import { deriveState, describeDuration, THRESHOLDS, timeUntil } from '../pet/engine'
import type { PetData } from '../pet/usePet'
import { useDocumentBadge } from '../pet/useDocumentBadge'
import { TIME_SCALE } from '../stellar/config'
import { shortKey } from '../stellar/horizon'
import { careOp, submitOps, type Signer } from '../stellar/tx'
import { Device, type DeviceAction } from './Device'
import { GiftPanel } from './GiftPanel'
import { HistoryPanel } from './HistoryPanel'
import { StatBar } from './StatBar'
import { TransferPanel } from './TransferPanel'
import { useAction } from './useAction'
import { AccountLink, Card, Chip, ErrorBox, SectionTitle, Tabs, TxLink, Why, type TabItem } from './ui'

type Tab = 'history' | 'transfer' | 'gift'

const TABS: readonly TabItem<Tab>[] = [
  { value: 'history', label: 'History' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'gift', label: 'Gift' },
]
const READ_ONLY_TABS: readonly TabItem<Tab>[] = TABS.filter((t) => t.value === 'history')

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Starves-in / dies-in countdown pills. Design 6a puts them inside the Vitals
 * card on mobile (left-aligned) and under the device on desktop (centred), so
 * the caller owns the display class (flex vs hidden lg:flex) and the spacing.
 */
function CountdownChips({
  alive,
  until,
  nearDeath,
  livedDays,
  className,
}: {
  alive: boolean
  until: ReturnType<typeof timeUntil>
  nearDeath: boolean
  livedDays: number
  /** Caller supplies the display class (flex / hidden lg:flex) plus spacing. */
  className: string
}) {
  return (
    <div className={`flex-wrap gap-1.5 ${className}`}>
      {alive ? (
        <>
          <Chip tone="amber" pulse={until.starvesIn === 0}>
            {until.starvesIn === 0 ? 'Starving' : `Starves in ${describeDuration(until.starvesIn)}`}
          </Chip>
          {until.diesIn !== null && (
            <Chip tone="terra" pulse={nearDeath} title={nearDeath ? 'Any care resets this countdown' : undefined}>
              {nearDeath ? `Dies for good in ${describeDuration(until.diesIn)}` : `Dies if ignored ${describeDuration(until.diesIn)}`}
            </Chip>
          )}
        </>
      ) : (
        <Chip tone="neutral">
          Lived {livedDays} day{livedDays === 1 ? '' : 's'}
        </Chip>
      )}
      {TIME_SCALE > 1 && (
        <Chip tone="neutral" title="VITE_TIME_SCALE multiplies elapsed time for the demo; on-chain data is untouched">
          demo clock ×{TIME_SCALE}
        </Chip>
      )}
    </div>
  )
}

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
  const [tab, setTab] = useState<Tab>('history')
  const action = useAction(reload)
  const state = deriveState(record, now, TIME_SCALE)
  const until = timeUntil(record, now, TIME_SCALE)
  useDocumentBadge(record, state)
  const isOwner = !readOnly && relation === 'owner'
  const canCare = isOwner && state.alive && canSign
  // Shout before the point of no return: death is permanent. Scale-aware (18 real min at x60, 18h at x1).
  const deathWarnMs = (THRESHOLDS.DEATH_AFTER / TIME_SCALE) * 0.25
  const nearDeath = state.alive && until.diesIn !== null && until.diesIn < deathWarnMs

  // Device animation triggers. `play` bumps once the care tx is confirmed; `hatched` bumps when the
  // derived stage leaves 'egg' (React's "adjust state when a prop changes" pattern: no effect needed).
  const [play, setPlay] = useState<{ kind: DeviceAction; nonce: number } | null>(null)
  const [hatched, setHatched] = useState(0)
  const [seenStage, setSeenStage] = useState(state.stage)
  if (seenStage !== state.stage) {
    setSeenStage(state.stage)
    if (seenStage === 'egg') setHatched((n) => n + 1)
  }

  const care = (kind: DeviceAction) => {
    if (!canCare) return
    void action.run(async () => {
      const res = await submitOps(address, [careOp(kind)], sign)
      // why: start the animation as soon as Horizon confirms, while the reload is still in flight.
      setPlay((p) => ({ kind, nonce: (p?.nonce ?? 0) + 1 }))
      return res
    })
  }

  const livedDays = Math.floor(state.ageMs / DAY_MS)
  const diedAgo = state.diedAt !== undefined ? describeDuration(Math.max(0, now - state.diedAt)) : null
  // why: one 10px mono line on the LCD is ~33 chars at 390px; the 'for good' nuance lives on the terra chip below.
  const urgentLine = nearDeath && until.diesIn !== null ? `DIES IN ${describeDuration(until.diesIn).toUpperCase()} · ANY CARE RESETS` : undefined

  return (
    <div className="space-y-4">
      {readOnly && (
        <Card tone="info" className="text-[13px] leading-normal">
          Viewing <b>{record.name}</b>, who lives with <AccountLink address={record.owner} />. Connect Freighter to send a treat.
        </Card>
      )}
      {!readOnly && !isOwner && (
        <Card tone="info" className="text-[13px] leading-normal">
          You hatched <b>{record.name}</b>, but it now lives with <AccountLink address={record.owner} />. Its whole life is still on-chain below.
        </Card>
      )}

      <div className="grid gap-[18px] lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-7">
        {/* Left: the handheld + countdown chips */}
        <div className="min-w-0">
          <Device
            name={record.name.toUpperCase()}
            stageLabel={state.alive ? state.stage.toUpperCase() : 'GHOST'}
            species={record.species}
            stage={state.stage}
            mood={state.mood}
            alive={state.alive}
            moodline={state.statusLine.toUpperCase()}
            ticker={urgentLine}
            urgent={nearDeath}
            onAction={care}
            keysDisabled={!canCare || action.anyBusy}
            busyLine={action.busy ? 'SIGNING · CONFIRMING…' : null}
            play={play}
            hatched={hatched}
            className="w-full"
          />
          {/* Desktop only (6a 1024): centred under the device. The mobile copy sits inside the Vitals card. */}
          <CountdownChips alive={state.alive} until={until} nearDeath={nearDeath} livedDays={livedDays} className="mt-3.5 hidden justify-center lg:flex" />
          {isOwner && state.alive && canSign && (
            <Why className="mt-3 text-center">Each key signs one manageData op (pet.care). Free apart from the network fee; the ledger timestamp is what the pet feels.</Why>
          )}
          {isOwner && state.alive && !canSign && <Why className="mt-3 text-center">Switch Freighter to TESTNET to care for this pet.</Why>}
          {!readOnly && !isOwner && <Why className="mt-3 text-center">Only the current owner can care for this pet.</Why>}
          <ErrorBox className="mt-3" message={action.error} />
          {action.lastHash && (
            <div className="mt-3 flex justify-center">
              <TxLink hash={action.lastHash} label="last care tx ↗" />
            </div>
          )}
        </div>

        {/* Right: vitals + tabs */}
        <div className="min-w-0">
          <Card>
            <SectionTitle
              className="mb-[11px]"
              icon={<PixelIcon name="flower" px={16} />}
              right={
                <>
                  {describeDuration(state.ageMs)} old · {state.careCount} care ops
                  {record.lineage.length > 1 && <> · {record.lineage.length} owners</>}
                  <span className="hidden lg:inline"> · born {shortKey(record.issuer, 5)}</span>
                </>
              }
            >
              Vitals
            </SectionTitle>
            {state.stage === 'egg' ? (
              <p className="text-[13px] text-muted">An egg. Feed it to hatch.</p>
            ) : (
              <div className="space-y-[9px]">
                {/* Engine hunger is 0 = full, 100 = starving; the garden vitals read higher = better, so show fullness. */}
                <StatBar label="Hunger" value={100 - state.hunger} />
                <StatBar label="Happy" value={state.happiness} />
                <StatBar label="Clean" value={state.cleanliness} />
              </div>
            )}
            {/* Mobile only (6a 390): inside the card, after the bars, left-aligned. */}
            <CountdownChips alive={state.alive} until={until} nearDeath={nearDeath} livedDays={livedDays} className="mt-[11px] flex lg:hidden" />
            {!state.alive && (
              <p className="mt-3 text-[13px] font-semibold leading-normal text-ink">
                {record.name} passed away{diedAgo ? ` ${diedAgo} ago` : ''}. The record cannot be reset.
              </p>
            )}
          </Card>

          <Tabs
            items={readOnly ? READ_ONLY_TABS : TABS}
            value={tab}
            onChange={setTab}
            size="md"
            disabled={action.anyBusy}
            className="mt-3 lg:mt-3.5 lg:max-w-[440px]"
            aria-label="Pet sections"
          />
          <div key={tab} className="leaf-in px-0.5 pt-1.5">
            {tab === 'history' && <HistoryPanel record={record} now={now} />}
            {tab === 'transfer' &&
              (isOwner ? (
                <TransferPanel address={address} record={record} now={now} sign={sign} reload={reload} canSign={canSign} />
              ) : (
                <Why className="pt-1 lg:pt-1.5">Only the current owner can transfer this pet.</Why>
              ))}
            {tab === 'gift' && <GiftPanel address={address} now={now} sign={sign} reload={reload} canSign={canSign} />}
          </div>
        </div>
      </div>
    </div>
  )
}
