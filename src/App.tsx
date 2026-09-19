import { useWallet } from './stellar/useWallet'
import { shortKey } from './stellar/horizon'

function App() {
  const wallet = useWallet()

  return (
    <div className="min-h-screen bg-amber-50 text-stone-800">
      {wallet.network && !wallet.network.ok && (
        <div className="bg-red-500 px-4 py-2 text-center text-sm font-semibold text-white">
          Freighter is on {wallet.network.network}. Switch it to TESTNET to use Chain Pet.
        </div>
      )}
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <h1 className="text-xl font-black tracking-tight">🥚 Chain Pet</h1>
        {wallet.address ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {shortKey(wallet.address)}
            </span>
            {wallet.funded ? (
              <span className="font-semibold">
                {wallet.balance ? Number(wallet.balance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '…'} XLM
              </span>
            ) : (
              <button
                className="rounded-full bg-pink-500 px-3 py-1 font-semibold text-white disabled:opacity-50"
                disabled={wallet.busy}
                onClick={wallet.fund}
              >
                Fund with Friendbot
              </button>
            )}
          </div>
        ) : (
          <button
            className="rounded-full border-2 border-pink-300 bg-pink-200 px-5 py-2 font-semibold text-pink-600 transition hover:bg-pink-500 hover:text-white disabled:opacity-50"
            disabled={wallet.busy}
            onClick={wallet.connect}
          >
            {wallet.busy ? 'Connecting…' : 'Connect Freighter'}
          </button>
        )}
      </header>
      <main className="mx-auto max-w-2xl px-4">
        {wallet.error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{wallet.error}</p>}
        {!wallet.address && (
          <p className="mt-16 text-center text-stone-500">Connect Freighter (Testnet) to meet your pet.</p>
        )}
      </main>
    </div>
  )
}

export default App
