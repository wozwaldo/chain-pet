// App shell in the Cozy Garden layout (design 6a): header bar, 1024-wide main
// (one column on mobile, [400px | 1fr] grid on lg inside the screens), grass
// footer. Routes: ?gallery (sprite sheet) and ?view=G... (read-only pet page).
// All signing goes through one Signer that re-checks Freighter's network first.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AddFundsButton } from './anchor/AddFundsButton'
import { PixelIcon } from './art/PixelIcon'
import { ClaimBanner } from './components/ClaimBanner'
import { Device } from './components/Device'
import { HatchScreen } from './components/HatchScreen'
import { PetScreen } from './components/PetScreen'
import { SpriteGallery } from './components/SpriteGallery'
import { AccountLink, Button, Card, Chip, ErrorBox, Why } from './components/ui'
import { useAnyBusy } from './components/useAction'
import { isPublicKey } from './components/form'
import { describeDuration } from './pet/engine'
import { useNow, usePet } from './pet/usePet'
import { signXdr } from './stellar/freighter'
import { shortKey } from './stellar/horizon'
import type { Signer } from './stellar/tx'
import { useWallet } from './stellar/useWallet'

const TAGLINE = 'Its hunger is real elapsed ledger time. Its life story is immutable. It can be inherited, but never reset.'

function App() {
  const wallet = useWallet()
  const address = wallet.address
  // why: an unfunded account can still have a pet in flight to it; both reads tolerate a missing account.
  const pet = usePet(address)
  const now = useNow()
  const anyBusy = useAnyBusy()
  const [refreshing, setRefreshing] = useState(false)
  const { requireTestnet } = wallet
  // why: re-verify the network at sign time (CLAUDE.md: verify TESTNET before any signing); this is the
  // single choke point for every signer (care, transfer, claim, gift, hatch, SEP-10, trustline).
  const sign = useMemo<Signer>(
    () => async (xdr) => {
      await requireTestnet()
      return signXdr(xdr, address ?? '')
    },
    [address, requireTestnet],
  )
  const reloadAll = useCallback(async () => {
    await pet.reload()
    if (address) await wallet.refresh(address).catch(() => {})
  }, [pet, address, wallet])
  const refreshNow = () => {
    setRefreshing(true)
    reloadAll().finally(() => setRefreshing(false))
  }

  const params = new URLSearchParams(window.location.search)
  if (params.has('gallery')) return <SpriteGallery />
  const view = params.get('view')
  if (view && isPublicKey(view)) return <ViewPet address={view} />

  const wrongNetwork = wallet.network !== null && !wallet.network.ok
  const canSign = !wrongNetwork
  const balance = wallet.balance ? Number(wallet.balance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '…'

  return (
    <Shell
      banner={wrongNetwork ? `Freighter is on ${wallet.network?.network}. Switch it to TESTNET to use Chain Pet.` : null}
      headerRight={
        address ? (
          <>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/25 bg-field px-[11px] py-1.5 font-mono text-[10px] font-bold text-ink lg:text-[11px] lg:font-semibold"
              title="Switch accounts in Freighter; Chain Pet follows"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-tab-active lg:h-[7px] lg:w-[7px]" />
              {shortKey(address, 4)}
            </span>
            {wallet.funded ? (
              <>
                <span className="hidden font-mono text-[11px] font-semibold text-ink sm:inline" title="XLM balance">
                  {balance} XLM
                </span>
                {canSign && (
                  // why: the anchor flow submits its own trustline tx from this account, so keep it closed while another tx is in flight.
                  <AddFundsButton address={address} sign={sign} onDone={reloadAll} disabled={anyBusy} />
                )}
              </>
            ) : (
              <Button tone="secondary" size="sm" disabled={wallet.busy} onClick={() => wallet.fund().then(() => pet.reload())}>
                Fund with Friendbot
              </Button>
            )}
            <Button
              tone="ghost"
              size="sm"
              className="px-2! text-base leading-none"
              disabled={refreshing}
              onClick={refreshNow}
              title="Re-read the ledger"
              aria-label="Refresh"
            >
              {refreshing ? '…' : '↻'}
            </Button>
            {pet.staleError && (
              <span className="text-[11px] font-semibold text-danger" title={pet.staleError}>
                last refresh failed
              </span>
            )}
          </>
        ) : (
          <Button size="sm" disabled={wallet.busy} onClick={wallet.connect}>
            {wallet.busy ? 'Connecting…' : 'Connect Freighter'}
          </Button>
        )
      }
    >
      <ErrorBox message={wallet.error} />
      {!address && <Landing busy={wallet.busy} onConnect={wallet.connect} />}
      {address && <ErrorBox message={pet.error} onRetry={refreshNow} />}
      {address && !wallet.funded && (
        <Card className="mx-auto max-w-md text-[13px] leading-normal">
          {pet.claims.length > 0 ? (
            <>
              <span className="mb-1 flex items-center gap-1.5 font-bold text-ink">
                <PixelIcon name="gift" px={14} /> A pet is waiting for you
              </span>
              {pet.claims.map((c) => (
                <span key={c.transfer.balanceId}>
                  From <AccountLink address={c.transfer.sponsor} />
                  {c.transfer.claimableAfter !== undefined && c.transfer.claimableAfter > now && (
                    <> (unlocks in {describeDuration(c.transfer.claimableAfter - now)})</>
                  )}
                  .{' '}
                </span>
              ))}
              This testnet account has no XLM yet. Fund it with Friendbot (free) to claim it.
            </>
          ) : (
            'This testnet account has no XLM yet. Fund it with Friendbot (free) to lay an egg.'
          )}
        </Card>
      )}
      {address && wallet.funded && (
        <>
          {pet.claims.length > 0 && (
            <ClaimBanner address={address} claims={pet.claims} current={pet.data} now={now} sign={sign} reload={reloadAll} canSign={canSign} />
          )}
          {!pet.loaded && !pet.error && <Loading />}
          {pet.loaded && pet.data && <PetScreen address={address} data={pet.data} now={now} sign={sign} reload={reloadAll} canSign={canSign} />}
          {pet.loaded &&
            !pet.data &&
            (wrongNetwork ? (
              <Card className="mx-auto max-w-md text-center text-[13px]">Switch Freighter to TESTNET to lay an egg.</Card>
            ) : (
              <HatchScreen address={address} sign={sign} onHatched={reloadAll} pendingClaims={pet.claims.length} />
            ))}
        </>
      )}
    </Shell>
  )
}

/** Read-only pet page by address: ?view=G... No wallet needed. */
function ViewPet({ address }: { address: string }) {
  const pet = usePet(address)
  const now = useNow()
  const noSign = useMemo<Signer>(() => () => Promise.reject(new Error('Read-only view')), [])
  return (
    <Shell
      headerRight={
        <>
          <a href="/" className="text-xs font-semibold text-link hover:underline">
            ← Back
          </a>
          <Chip tone="neutral">read-only view</Chip>
        </>
      }
    >
      <ErrorBox message={pet.error} onRetry={() => pet.reload()} />
      {!pet.loaded && !pet.error && <Loading />}
      {pet.loaded && pet.data && <PetScreen address="" data={pet.data} now={now} sign={noSign} reload={pet.reload} readOnly />}
      {pet.loaded && !pet.data && <Card className="mx-auto max-w-md text-center text-[13px]">No Chain Pet found at this address.</Card>}
    </Shell>
  )
}

/* ------------------------------------------------------------------ chrome */

/** Page chrome: optional wrong-network banner, header bar, centred main, grass footer. */
function Shell({ banner = null, headerRight, children }: { banner?: string | null; headerRight: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-ink">
      {banner && (
        <div role="alert" className="bg-alert px-4 py-2 text-center text-[13px] font-semibold text-white">
          {banner}
        </div>
      )}
      <header className="border-b border-line-soft bg-header">
        <div className="mx-auto flex max-w-[1024px] flex-wrap items-center gap-2 px-4 py-[11px] lg:gap-2.5 lg:px-[22px] lg:py-3">
          <a href="/" className="inline-flex items-center gap-2 lg:gap-2.5" title="Chain Pet">
            <PixelIcon name="sprout" px={15} />
            <span className="text-[15px] font-extrabold text-ink lg:text-base">Chain Pet</span>
          </a>
          <span className="hidden lg:inline-flex">
            <Chip tone="green" className="px-[9px]! py-1! text-[10px]!">
              Testnet
            </Chip>
          </span>
          <span className="flex-1" />
          {headerRight}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1024px] flex-1 space-y-4 px-4 pt-4 pb-1.5 lg:px-6 lg:py-6">{children}</main>
      <Footer />
    </div>
  )
}

/** Grass decoration row (two sizes, one per breakpoint) over the sage band. */
function Footer() {
  return (
    <footer className="mt-auto">
      <div aria-hidden="true" className="mx-auto flex max-w-[1024px] items-end justify-between px-2 lg:hidden">
        <PixelIcon name="grass" px={20} />
        <PixelIcon name="flower" px={22} className="mb-px" />
        <PixelIcon name="grass" px={20} className="-scale-x-100" />
        <PixelIcon name="sprout" px={17} className="mb-px" />
        <PixelIcon name="grass" px={20} />
      </div>
      <div aria-hidden="true" className="mx-auto hidden max-w-[1024px] items-end justify-between px-2.5 lg:flex">
        <PixelIcon name="grass" px={28} />
        <PixelIcon name="flower" px={24} className="mb-0.5" />
        <PixelIcon name="grass" px={28} className="-scale-x-100" />
        <PixelIcon name="sprout" px={18} className="mb-0.5" />
        <PixelIcon name="grass" px={28} />
        <PixelIcon name="flower" px={24} className="mb-0.5" />
        <PixelIcon name="grass" px={28} className="-scale-x-100" />
      </div>
      <div className="bg-grass px-4 pt-1.5 pb-[11px] text-center text-[11px] text-footer">Stellar testnet · signs via Freighter · nothing off-chain</div>
    </footer>
  )
}

/** No wallet yet: the egg on the device, the pitch, one button. */
function Landing({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-7">
      <Device name="CHAIN PET" stageLabel="EGG" species="plain" stage="egg" mood="happy" alive moodline="CONNECT TO BEGIN" keysDisabled className="w-full" />
      <Card>
        <h2 className="text-lg font-extrabold text-ink">A pet that lives on Stellar</h2>
        <p className="mt-1 text-[13px] leading-normal text-muted">{TAGLINE}</p>
        <Button className="mt-4 w-full lg:w-auto" disabled={busy} onClick={onConnect}>
          {busy ? 'Connecting…' : 'Connect Freighter (Testnet)'}
        </Button>
        <Why className="mt-3">Testnet only. Every action is signed in Freighter; Chain Pet never sees a secret key.</Why>
      </Card>
    </div>
  )
}

function Loading() {
  return <p className="text-center text-[13px] text-muted">Reading the ledger…</p>
}

export default App
