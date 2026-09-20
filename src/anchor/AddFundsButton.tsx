// "Add funds" button + self-contained stepper modal for a SEP-24 deposit.
// App renders <AddFundsButton address={...} sign={...} /> and nothing else
// needs to know about anchors. Cozy Garden primitives + Tailwind only.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button, Card, Chip, ErrorBox } from '../components/ui'
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

export function AddFundsButton({
  address,
  sign,
  onDone,
  disabled = false,
}: {
  address: string
  sign: Signer
  onDone?: () => void
  /** Keeps the trigger closed while another tx holds the account's sequence number. */
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<FlowState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  const dialogRef = useRef<HTMLDivElement | null>(null)
  /** Whatever had focus when the dialog opened (the trigger); focus goes back there on close. */
  const returnFocusRef = useRef<HTMLElement | null>(null)

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
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
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

  // Modal focus: the page behind (#root) is inert while open (the overlay is portaled to body, so it
  // stays live), focus moves onto the dialog, and on close it returns to the trigger only after inert
  // is lifted, because an inert element cannot take focus.
  useEffect(() => {
    if (!open) return
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    return () => {
      root?.removeAttribute('inert')
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [open])
  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  // Tab / Shift+Tab wrap inside the dialog.
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const nodes = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <Button tone="amber" onClick={begin} disabled={disabled} title="Deposit via the SEP-24 test anchor">
        + Add funds
      </Button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close()
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="addfunds-title"
              tabIndex={-1}
              onKeyDown={trapTab}
              className="w-full max-w-md outline-none"
            >
              <Card className="shadow-screen">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id="addfunds-title" className="text-base font-extrabold text-ink">
                      Add funds via anchor
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span className="font-mono">testanchor.stellar.org</span>
                      <span>· {DEFAULT_ASSET_CODE} deposit · testnet</span>
                      {isMockMode() && <Chip tone="amber">mock</Chip>}
                    </p>
                  </div>
                  <Button tone="ghost" size="sm" onClick={close} aria-label="Close" className="-mr-2 -mt-1 px-2.5! text-lg leading-none">
                    ×
                  </Button>
                </div>

                <ol className="space-y-3">
                  {STEPS.map((s, i) => (
                    <StepRow key={s.id} index={i} step={s} flow={flow} />
                  ))}
                </ol>

                <ErrorBox className="mt-4" message={flow.error} onRetry={retry} />

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                  {flow.step === 'open' && !flow.error && (
                    <>
                      {flow.popupBlocked && flow.deposit && (
                        <a
                          href={flow.deposit.url}
                          target="sep24"
                          rel="noreferrer"
                          className="text-xs font-semibold text-link underline"
                          onClick={openAnchorViaLink}
                        >
                          Popup blocked? Click here
                        </a>
                      )}
                      <Button size="sm" onClick={openAnchor}>
                        Open anchor window
                      </Button>
                    </>
                  )}
                  {flow.step === 'wait' && flow.deposit && (
                    <Button tone="secondary" size="sm" onClick={() => openAnchorWindow(flow.deposit!.url)}>
                      Reopen anchor window
                    </Button>
                  )}
                  <Button tone="ghost" size="sm" onClick={close}>
                    {flow.step === 'done' ? 'Close' : 'Cancel'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>,
          document.body,
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

  const badge = isDone ? 'bg-primary text-white' : failed ? 'bg-alert text-white' : isCurrent ? 'bg-tab-active text-white' : 'bg-tabs text-muted-2'

  return (
    <li className={`flex gap-3 ${!isDone && !isCurrent ? 'opacity-50' : ''}`}>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${badge}`}
        aria-hidden="true"
      >
        {isDone ? '✓' : failed ? '!' : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-ink">{step.title}</span>
          {spinning && (
            <span
              role="img"
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-info-border border-t-primary"
              aria-label="working"
            />
          )}
          <StepDetail step={step.id} flow={flow} />
        </div>
        <p className="text-xs leading-normal text-muted">{step.why}</p>
      </div>
    </li>
  )
}

/** Small live detail per step: trustline result, deposit status, final amount. */
function StepDetail({ step, flow }: { step: StepId; flow: FlowState }) {
  if (step === 'trust' && flow.trust) {
    return <span className="text-xs text-muted">({flow.trust === 'created' ? 'created' : 'already there'})</span>
  }
  if (step === 'wait' && flow.tx && !isTerminal(flow.tx.status)) {
    return (
      <Chip tone="amber" className="font-mono">
        {flow.tx.status.replace(/_/g, ' ')}
      </Chip>
    )
  }
  if (step === 'done' && flow.step === 'done' && flow.tx) {
    const amt = flow.tx.amount_out ?? flow.tx.amount_in
    return (
      <Chip tone="green" className="font-mono">
        +{amt ?? '?'} {DEFAULT_ASSET_CODE}
      </Chip>
    )
  }
  return null
}
