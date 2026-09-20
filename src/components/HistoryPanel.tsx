// Life log in the Cozy Garden style (design 6a History tab): one dashed row
// per on-chain operation (care, treat, birth), newest first; the ownership
// chain is a muted footnote line, shown only once the pet has changed hands.
import { Fragment, type ReactNode } from 'react'
import { PixelIcon } from '../art/PixelIcon'
import { describeDuration } from '../pet/engine'
import type { CareKind, PetRecord } from '../pet/types'
import { TreatIcon } from './TreatIcon'
import { AccountLink, TxLink } from './ui'

const CARE_ROW: Record<CareKind, { icon: 'apple' | 'ball' | 'soap'; verb: string }> = {
  feed: { icon: 'apple', verb: 'Fed' },
  play: { icon: 'ball', verb: 'Played' },
  clean: { icon: 'soap', verb: 'Cleaned' },
}

interface Row {
  key: string
  at: number
  txHash: string | null
  icon: ReactNode
  text: ReactNode
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

export function HistoryPanel({ record, now }: { record: PetRecord; now: number }) {
  const rows: Row[] = [
    ...record.care.map((c): Row => {
      const meta = CARE_ROW[c.kind]
      return {
        key: `care-${c.txHash}-${c.at}`,
        at: c.at,
        txHash: c.txHash,
        icon: <PixelIcon name={meta.icon} px={16} />,
        text: (
          <>
            <b>{meta.verb}</b> by <AccountLink address={c.by} />
          </>
        ),
      }
    }),
    ...record.gifts.map(
      (g): Row => ({
        key: `gift-${g.txHash}-${g.at}`,
        at: g.at,
        txHash: g.txHash,
        icon: <TreatIcon kind={g.kind} size={2} />,
        text: (
          <>
            <b>{capitalize(g.kind)} treat</b> ({Number(g.amountXlm)} XLM) from <AccountLink address={g.from} />
          </>
        ),
      }),
    ),
  ].sort((a, b) => b.at - a.at)
  rows.push({
    key: 'born',
    at: record.bornAt,
    txHash: null,
    icon: <PixelIcon name="egg" px={16} />,
    text: (
      <>
        <b>Born</b> on <AccountLink address={record.issuer} />
      </>
    ),
  })

  return (
    <div>
      <ol>
        {rows.map((r, i) => (
          <li
            key={r.key}
            className={`flex items-center gap-[9px] px-1 py-2.5 ${i === rows.length - 1 ? '' : 'border-b-2 border-dashed border-dash'}`}
          >
            <span aria-hidden className="flex w-4 shrink-0 items-center justify-center">
              {r.icon}
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{r.text}</span>
            <span className="shrink-0 text-[11px] text-muted-2">
              {describeDuration(Math.max(0, now - r.at))}
              <span className="hidden lg:inline"> ago</span>
            </span>
            {r.txHash && <TxLink hash={r.txHash} />}
          </li>
        ))}
      </ol>
      <p className="mt-1 px-1 text-[11px] leading-normal text-muted-2">
        Every row is a Stellar operation — verifiable on the explorer, editable by no one.
      </p>
      {record.lineage.length > 1 && (
        <p className="mt-1.5 px-1 text-[11px] leading-normal text-muted-2">
          Owners:{' '}
          {record.lineage.map((a, i) => (
            <Fragment key={a}>
              {i > 0 && <span aria-hidden> → </span>}
              <AccountLink address={a} chars={4} />
            </Fragment>
          ))}
        </p>
      )}
    </div>
  )
}
