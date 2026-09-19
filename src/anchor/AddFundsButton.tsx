// "Add funds" button + self-contained stepper modal for a SEP-24 deposit.
// App renders <AddFundsButton address={...} sign={...} /> and nothing else
// needs to know about anchors. Tailwind only.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import type { Signer } from '../stellar/tx'
import {
  DEFAULT_ASSET_CODE,
  ensureTrustline,
  fetchAnchorInfo,
  findCurrency,
  isAbortError,
  isMockMode,
  isTerminal,
  pollTransaction,
  sep10Auth,
  startInteractiveDeposit,
  type InteractiveDeposit,
  type Sep24Transaction,
} from './sep24'

type StepId = 'auth' | 'trust' | 'open' | 'wait' | 'done'

const STEPS: { id: StepId; title: string; why: string }[] = [
  { id: 'auth', title: 'Authenticate', why: 'SEP-10: sign a harmless challenge so the anchor knows this account is yours.' },
  { id: 'trust', title: `Trust ${DEFAULT_ASSET_CODE}`, why: 'An account can only receive an asset it has explicitly trusted (~0.5 XLM reserve).' },
  { id: 'open', title: 'Open anchor', why: "The anchor's own web form collects the off-chain side (amount, KYC) — SEP-24." },
  { id: 'wait', title: 'Waiting for deposit', why: 'The anchor sends the asset on Stellar and reports progress through its transaction record.' },
  { id: 'done', title: 'Done', why: 'The asset is now in your account; Freighter will show it under Assets.' },
]

const ORDER: StepId[] = STEPS.map((s) => s.id)

interface FlowState {
  step: StepId
  busy: boolean
  error: string | null
  token: string | null
  issuer: string | null
  trust: 'exists' | 'created' | null
  deposit: InteractiveDeposit | null
  tx: Sep24Transaction | null
  popupBlocked: boolean
}

const INITIAL: FlowState = {
  step: 'auth',
  busy: false,
  error: null,
  token: null,
  issuer: null,
  trust: null,
  deposit: null,
  tx: null,
  popupBlocked: false,
}

const POPUP_FEATURES = 'width=480,height=720'

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Opens the anchor page. data: URLs (mock mode) are blocked by Chrome/Firefox, so those are written into a blank popup. */
function openAnchorWindow(url: string): Window | null {
  const isData = url.startsWith('data:')
  const w = window.open(isData ? '' : url, 'sep24', POPUP_FEATURES)
  if (w && isData) {
    const html = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    w.document.open()
    w.document.write(html)
    w.document.close()
  }
  return w
}

export function AddFundsButton({ address, sign, onDone }: { address: string; sign: Signer; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<FlowState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const patch = useCallback((p: Partial<FlowState>) => setFlow((s) => ({ ...s, ...p })), [])

  /** Runs the automatic steps (auth -> trust) from `from`, stopping at `open` which needs a click. */
  const runAuto = useCallback(
    async (from: 'auth' | 'trust', prev: FlowState) => {
      if (runningRef.current) return
      runningRef.current = true
      const ctrl = new AbortController()
      abortRef.current = ctrl
      let token = prev.token
      let issuer = prev.issuer
      try {
        if (from === 'auth') {
          patch({ step: 'auth', busy: true, error: null })
          const info = await fetchAnchorInfo()
          const cur = findCurrency(info, DEFAULT_ASSET_CODE)
          if (!cur?.issuer) throw new Error(`Anchor does not list ${DEFAULT_ASSET_CODE}`)
          issuer = cur.issuer
          token = await sep10Auth(address, sign)
          if (ctrl.signal.aborted) return
          patch({ token, issuer })
        }
        if (!token || !issuer) throw new Error('Authentication did not complete')

        patch({ step: 'trust', busy: true, error: null })
        const trust = await ensureTrustline(address, DEFAULT_ASSET_CODE, issuer, sign)
        if (ctrl.signal.aborted) return
        patch({ trust })

        // why: SEP-24 needs the JWT and the account; the anchor answers with the URL of its hosted form.
        const deposit = await startInteractiveDeposit(token, address, DEFAULT_ASSET_CODE)
        if (ctrl.signal.aborted) return
        patch({ deposit, step: 'open', busy: false })
      } catch (err) {
        if (!ctrl.signal.aborted) patch({ busy: false, error: errText(err) })
      } finally {
        // why: only release the guard if no newer run (after Cancel/Retry) has taken over.
        if (abortRef.current === ctrl) runningRef.current = false
      }
    },
    [address, sign, patch],
  )

  const startPolling = useCallback(
    async (token: string, id: string) => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      patch({ step: 'wait', busy: true, error: null })
      try {
        const final = await pollTransaction(
          token,
          id,
          // why: a record that arrives after Cancel/unmount must not overwrite the reset state (or a newer flow).
          (tx) => {
            if (!ctrl.signal.aborted) patch({ tx })
          },
          { signal: ctrl.signal },
        )
        if (ctrl.signal.aborted) return
        if (final.status === 'completed') {
          patch({ step: 'done', busy: false, tx: final })
          onDoneRef.current?.()
        } else {
          patch({ busy: false, error: `Deposit ended with status "${final.status}"${final.message ? `: ${final.message}` : ''}` })
        }
      } catch (err) {
        if (!isAbortError(err) && !ctrl.signal.aborted) patch({ busy: false, error: errText(err) })
      }
    },
    [patch],
  )

  const begin = useCallback(() => {
    setFlow(INITIAL)
    setOpen(true)
    void runAuto('auth', INITIAL)
  }, [runAuto])

  const close = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    runningRef.current = false
    setOpen(false)
    setFlow(INITIAL)
  }, [])

  const retry = useCallback(() => {
    if (flow.step === 'wait' && flow.token && flow.deposit) {
      void startPolling(flow.token, flow.deposit.id)
    } else if (flow.step === 'trust' && flow.token) {
      void runAuto('trust', flow)
    } else {
      void runAuto('auth', flow)
    }
  }, [flow, runAuto, startPolling])

  const openAnchor = useCallback(() => {
    if (!flow.deposit || !flow.token) return
    // why: window.open must happen synchronously in the click, or the browser's popup blocker eats it.
    const w = openAnchorWindow(flow.deposit.url)
    if (!w) {
      // why: stay at 'open' so the "Popup blocked?" link renders; polling only starts once the form is really open.
      patch({ popupBlocked: true })
      return
    }
    patch({ popupBlocked: false })
    void startPolling(flow.token, flow.deposit.id)
  }, [flow.deposit, flow.token, patch, startPolling])

  /** Fallback after a blocked popup. A real link click is never popup-blocked, so the browser follows `href` itself. */
  const openAnchorViaLink = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (!flow.deposit || !flow.token) return
      if (flow.deposit.url.startsWith('data:')) {
        // why: browsers refuse to navigate a link to data: (mock mode), so retry the document.write popup instead.
        e.preventDefault()
        openAnchor()
        return
      }
      patch({ popupBlocked: false })
      void startPolling(flow.token, flow.deposit.id)
    },
    [flow.deposit, flow.token, patch, startPolling, openAnchor],
  )

  // Abort polling if the component unmounts mid-flow.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <>
      <button
        type="button"
        onClick={begin}
        className="rounded-full border-2 border-emerald-300 bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500 hover:text-white"
      >
        + Add funds
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="addfunds-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 text-stone-800 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="addfunds-title" className="text-lg font-black tracking-tight">
                  Add funds via anchor
                </h2>
                <p className="text-xs text-stone-500">
                  testanchor.stellar.org · {DEFAULT_ASSET_CODE} deposit · testnet
                  {isMockMode() && <span className="ml-1 rounded bg-amber-200 px-1 font-semibold text-amber-800">MOCK</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full px-2 text-xl leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                ×
              </button>
            </div>

            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <StepRow key={s.id} index={i} step={s} flow={flow} />
              ))}
            </ol>

            {flow.error && (
              <div className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
                <p className="break-words">{flow.error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              {flow.step === 'open' && !flow.error && (
                <>
                  {flow.popupBlocked && flow.deposit && (
                    <a
                      href={flow.deposit.url}
                      target="sep24"
                      rel="noreferrer"
                      className="text-xs text-pink-600 underline"
                      onClick={openAnchorViaLink}
                    >
                      Popup blocked? Click here
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={openAnchor}
                    className="rounded-full bg-pink-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-pink-600"
                  >
                    Open anchor window
                  </button>
                </>
              )}
              {flow.step === 'wait' && flow.deposit && (
                <button
                  type="button"
                  onClick={() => openAnchorWindow(flow.deposit!.url)}
                  className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Reopen anchor window
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="rounded-full px-4 py-1.5 text-sm font-semibold text-stone-500 hover:bg-stone-100"
              >
                {flow.step === 'done' ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// One row of the stepper
// ---------------------------------------------------------------------------

function StepRow({ index, step, flow }: { index: number; step: (typeof STEPS)[number]; flow: FlowState }) {
  const pos = ORDER.indexOf(flow.step)
  const mine = ORDER.indexOf(step.id)
  const isDone = mine < pos || (step.id === 'done' && flow.step === 'done')
  const isCurrent = mine === pos
  const failed = isCurrent && !!flow.error
  const spinning = isCurrent && flow.busy && !failed

  const badge = isDone
    ? 'bg-emerald-500 text-white'
    : failed
      ? 'bg-red-500 text-white'
      : isCurrent
        ? 'bg-pink-500 text-white'
        : 'bg-stone-200 text-stone-500'

  return (
    <li className={`flex gap-3 ${!isDone && !isCurrent ? 'opacity-50' : ''}`}>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}
        aria-hidden="true"
      >
        {isDone ? '✓' : failed ? '!' : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{step.title}</span>
          {spinning && (
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600"
              aria-label="working"
            />
          )}
          <StepDetail step={step.id} flow={flow} />
        </div>
        <p className="text-xs text-stone-500">{step.why}</p>
      </div>
    </li>
  )
}

/** Small live detail per step: trustline result, deposit status, final amount. */
function StepDetail({ step, flow }: { step: StepId; flow: FlowState }) {
  if (step === 'trust' && flow.trust) {
    return <span className="text-xs text-stone-500">({flow.trust === 'created' ? 'created' : 'already there'})</span>
  }
  if (step === 'wait' && flow.tx && !isTerminal(flow.tx.status)) {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] text-amber-800">
        {flow.tx.status.replace(/_/g, ' ')}
      </span>
    )
  }
  if (step === 'done' && flow.step === 'done' && flow.tx) {
    const amt = flow.tx.amount_out ?? flow.tx.amount_in
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
        +{amt ?? '?'} {DEFAULT_ASSET_CODE}
      </span>
    )
  }
  return null
}
