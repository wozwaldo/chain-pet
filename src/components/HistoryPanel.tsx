import { describeDuration } from '../pet/engine'
import type { PetRecord } from '../pet/types'
import { TreatIcon } from './TreatIcon'
import { AccountLink, TxLink, Why } from './ui'

const CARE_ICON: Record<string, string> = { feed: '🍙', play: '🎾', clean: '🫧' }

interface Row {
  at: number
  txHash: string
  icon: React.ReactNode
  text: React.ReactNode
}

export function HistoryPanel({ record, now }: { record: PetRecord; now: number }) {
  const rows: Row[] = [
    ...record.care.map((c) => ({
      at: c.at,
      txHash: c.txHash,
      icon: <span>{CARE_ICON[c.kind] ?? '✨'}</span>,
      text: (
        <>
          <b>{c.kind}</b> by <AccountLink address={c.by} />
        </>
      ),
    })),
    ...record.gifts.map((g) => ({
      at: g.at,
      txHash: g.txHash,
      icon: <TreatIcon kind={g.kind} size={3} />,
      text: (
        <>
          <b>{g.kind}</b> treat ({g.amountXlm} XLM) from <AccountLink address={g.from} />
        </>
      ),
    })),
  ].sort((a, b) => b.at - a.at)

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-black uppercase tracking-wide text-stone-500">Lineage</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
          {record.lineage.map((a, i) => (
            <span key={a} className="flex items-center gap-1">
              {i > 0 && <span className="text-stone-400">→</span>}
              <span className="rounded-full border border-[#2b2140] bg-amber-50 px-2 py-0.5">
                <AccountLink address={a} /> {i === 0 && <span className="text-stone-500">(birth)</span>}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-black uppercase tracking-wide text-stone-500">Life log</h3>
        <ul className="mt-1 divide-y divide-stone-200">
          {rows.map((r) => (
            <li key={r.txHash + String(r.at)} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-6 text-center">{r.icon}</span>
              <span className="flex-1">{r.text}</span>
              <span className="text-xs text-stone-500">{describeDuration(Math.max(0, now - r.at))} ago</span>
              <TxLink hash={r.txHash} label="tx" />
            </li>
          ))}
          <li className="flex items-center gap-2 py-2 text-sm">
            <span className="w-6 text-center">🥚</span>
            <span className="flex-1">
              Born on <AccountLink address={record.issuer} />
            </span>
            <span className="text-xs text-stone-500">{describeDuration(Math.max(0, now - record.bornAt))} ago</span>
          </li>
        </ul>
      </div>
      <Why>Every row is a Stellar operation. Anyone can verify it on the explorer; nobody can edit or delete it.</Why>
    </div>
  )
}
