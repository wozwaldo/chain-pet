import { useCallback, useMemo } from 'react'
import { AddFundsButton } from './anchor/AddFundsButton'
import { ClaimBanner } from './components/ClaimBanner'
import { HatchScreen } from './components/HatchScreen'
import { PetScreen } from './components/PetScreen'
import { PetSprite } from './components/PetSprite'
import { SpriteGallery } from './components/SpriteGallery'
import { Button, Card, ErrorBox } from './components/ui'
import { useNow, usePet } from './pet/usePet'
import { isPublicKey } from './components/form'
import { signXdr } from './stellar/freighter'
import { shortKey } from './stellar/horizon'
import type { Signer } from './stellar/tx'
import { useWallet } from './stellar/useWallet'

function App() {
  const wallet = useWallet()
  const address = wallet.address
  const pet = usePet(address && wallet.funded ? address : null)
  const now = useNow()
  const sign = useMemo<Signer>(() => (xdr) => signXdr(xdr, address ?? ''), [address])
  const reloadAll = useCallback(async () => {
    await pet.reload()
    if (address) await wallet.refresh(address).catch(() => {})
  }, [pet, address, wallet])

  const params = new URLSearchParams(window.location.search)
  if (params.has('gallery')) return <SpriteGallery />
  const view = params.get('view')
  if (view && isPublicKey(view)) return <ViewPet address={view} />

  const wrongNetwork = wallet.network !== null && !wallet.network.ok

  return (
    <div className="min-h-screen bg-amber-50 text-stone-800">
      {wrongNetwork && (
        <div className="bg-red-500 px-4 py-2 text-center text-sm font-semibold text-white">
          Freighter is on {wallet.network?.network}. Switch it to TESTNET to use Chain Pet.
        </div>
      )}
      <header className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <h1 className="text-xl font-black tracking-tight">🥚 Chain Pet</h1>
        {address ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#2b2140] bg-green-100 px-3 py-1 font-medium text-green-800">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {shortKey(address)}
            </span>
            {wallet.funded ? (
              <>
                <span className="font-semibold">
                  {wallet.balance ? Number(wallet.balance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '…'} XLM
                </span>
                <AddFundsButton address={address} sign={sign} onDone={reloadAll} />
              </>
            ) : (
              <Button tone="secondary" disabled={wallet.busy} onClick={wallet.fund}>
                Fund with Friendbot
              </Button>
            )}
          </div>
        ) : (
          <Button disabled={wallet.busy} onClick={wallet.connect}>
            {wallet.busy ? 'Connecting…' : 'Connect Freighter'}
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16">
        <ErrorBox message={wallet.error} />
        {!address && (
          <Card className="mx-auto max-w-md text-center">
            <div className="flex justify-center gap-2">
              <PetSprite species="blob" stage="adult" mood="happy" alive size={5} className="sprite-anim-bob" />
              <PetSprite species="cat" stage="adult" mood="ecstatic" alive size={5} className="sprite-anim-wobble" />
              <PetSprite species="dragon" stage="adult" mood="happy" alive size={5} className="sprite-anim-bob" />
            </div>
            <h2 className="mt-3 text-lg font-black">A pet that lives on Stellar</h2>
            <p className="mt-1 text-sm text-stone-600">
              Its hunger is real elapsed ledger time. Its life story is immutable. It can be inherited, but never reset.
            </p>
            <div className="mt-4">
              <Button disabled={wallet.busy} onClick={wallet.connect}>
                Connect Freighter (Testnet)
              </Button>
            </div>
          </Card>
        )}
        {address && !wallet.funded && (
          <Card className="mx-auto max-w-md text-center text-sm">
            This testnet account has no XLM yet. Fund it with Friendbot (free) to lay an egg.
          </Card>
        )}
        {address && wallet.funded && (
          <>
            {pet.claims.length > 0 && <ClaimBanner address={address} claims={pet.claims} now={now} sign={sign} reload={reloadAll} />}
            <ErrorBox message={pet.error} />
            {!pet.loaded && !pet.error && <p className="text-center text-sm text-stone-500">Reading the ledger…</p>}
            {pet.loaded && pet.data && <PetScreen address={address} data={pet.data} now={now} sign={sign} reload={reloadAll} />}
            {pet.loaded && !pet.data && !wrongNetwork && <HatchScreen address={address} sign={sign} onHatched={reloadAll} />}
          </>
        )}
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-xs text-stone-400">
        Stellar testnet only · all signing via Freighter · nothing here is stored off-chain
      </footer>
    </div>
  )
}

/** Read-only pet page by address: ?view=G... No wallet needed. */
function ViewPet({ address }: { address: string }) {
  const pet = usePet(address)
  const now = useNow()
  const noSign = useMemo<Signer>(() => () => Promise.reject(new Error('Read-only view')), [])
  return (
    <div className="min-h-screen bg-amber-50 text-stone-800">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <a href="/" className="text-xl font-black tracking-tight">🥚 Chain Pet</a>
        <span className="text-xs text-stone-500">read-only view</span>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-16">
        <ErrorBox message={pet.error} />
        {!pet.loaded && !pet.error && <p className="text-center text-sm text-stone-500">Reading the ledger…</p>}
        {pet.loaded && pet.data && <PetScreen address="" data={pet.data} now={now} sign={noSign} reload={pet.reload} readOnly />}
        {pet.loaded && !pet.data && <Card className="text-center text-sm">No Chain Pet found at this address.</Card>}
      </main>
    </div>
  )
}

export default App
