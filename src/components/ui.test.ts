import { describe, expect, it } from 'vitest'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountLink, Button, Card, Chip, ErrorBox, Field, SectionTitle, Stepper, Tabs, TxLink, Why } from './ui'
import { StatBar } from './StatBar'
import { inputClass, inputClassSans, isPublicKey, stepValue } from './form'

const render = (el: ReactElement) => renderToStaticMarkup(el)
const noop = () => {}

const TABS = [
  { value: 'history', label: 'History' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'gift', label: 'Gift' },
] as const

describe('Tabs', () => {
  it('renders a tablist with one selected tab in the garden pill style', () => {
    const html = render(h(Tabs, { items: TABS, value: 'transfer', onChange: noop }))
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)).toHaveLength(3)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="false"/g)).toHaveLength(2)
    // active segment: sage pill with light ink; inactive: muted text
    expect(html).toMatch(/aria-selected="true"[^>]*class="[^"]*bg-tab-active[^"]*text-tab-active-ink/)
    expect(html).toMatch(/aria-selected="false"[^>]*class="[^"]*text-muted/)
    expect(html).toContain('bg-tabs')
    expect(html).toContain('type="button"')
  })

  it('sizes: sm is 12px, md is 13px', () => {
    expect(render(h(Tabs, { items: TABS, value: 'history', onChange: noop }))).toContain('text-xs')
    expect(render(h(Tabs, { items: TABS, value: 'history', onChange: noop, size: 'md' }))).toContain('text-[13px]')
  })

  it('disabled flag reaches every tab', () => {
    const html = render(h(Tabs, { items: TABS, value: 'history', onChange: noop, disabled: true }))
    expect(html.match(/disabled=""/g)).toHaveLength(3)
  })
})

describe('Chip', () => {
  it('maps tones to the token pairs', () => {
    expect(render(h(Chip, { tone: 'amber', children: 'x' }))).toContain('bg-chip-amber text-chip-amber-ink')
    expect(render(h(Chip, { tone: 'terra', children: 'x' }))).toContain('bg-chip-terra text-chip-terra-ink')
    expect(render(h(Chip, { tone: 'green', children: 'x' }))).toContain('bg-chip-green text-chip-green-ink')
    expect(render(h(Chip, { children: 'x' }))).toContain('bg-chip-neutral text-chip-neutral-ink')
  })
  it('is a pill and only pulses on request', () => {
    const plain = render(h(Chip, { tone: 'terra', children: 'Dies if ignored 2d 23h' }))
    expect(plain).toContain('rounded-full')
    expect(plain).not.toContain('pulse-chip')
    expect(render(h(Chip, { tone: 'terra', pulse: true, children: 'x' }))).toContain('pulse-chip')
  })
})

describe('Stepper', () => {
  const fmt = (v: number) => `${v} XLM`
  it('shows the formatted value between − and + keys', () => {
    const html = render(h(Stepper, { value: 0.5, onChange: noop, min: 0.1, max: 5, step: 0.1, format: fmt }))
    expect(html).toContain('0.5 XLM')
    expect(html).toContain('aria-label="Decrease"')
    expect(html).toContain('aria-label="Increase"')
    expect(html).toContain('font-mono')
    expect(html).not.toContain('disabled=""')
  })
  it('disables the key that would leave [min, max]', () => {
    const atMin = render(h(Stepper, { value: 0.1, onChange: noop, min: 0.1, max: 5, step: 0.1 }))
    expect(atMin).toMatch(/aria-label="Decrease"[^>]*disabled=""/)
    expect(atMin).not.toMatch(/aria-label="Increase"[^>]*disabled=""/)
    const atMax = render(h(Stepper, { value: 5, onChange: noop, min: 0.1, max: 5, step: 0.1 }))
    expect(atMax).toMatch(/aria-label="Increase"[^>]*disabled=""/)
    expect(atMax).not.toMatch(/aria-label="Decrease"[^>]*disabled=""/)
  })
  it('stepValue has no float noise and clamps', () => {
    expect(stepValue(0.5, 1, 0.1, 0.1, 5)).toBe(0.6)
    expect(stepValue(0.3, -1, 0.1, 0.1, 5)).toBe(0.2)
    expect(stepValue(0.1, -1, 0.1, 0.1, 5)).toBe(0.1)
    expect(stepValue(4.95, 1, 0.1, 0.1, 5)).toBe(5)
    expect(stepValue(2, 1, 1, 0, 3)).toBe(3)
    expect(stepValue(3, 1, 1, 0, 3)).toBe(3)
  })
})

describe('Card / Button', () => {
  it('card tones', () => {
    expect(render(h(Card, { children: 'x' }))).toContain('bg-card')
    expect(render(h(Card, { children: 'x' }))).toContain('shadow-card')
    expect(render(h(Card, { tone: 'info', children: 'x' }))).toContain('bg-info')
    expect(render(h(Card, { tone: 'pending', children: 'x' }))).toContain('border-[1.5px] border-pending-border bg-pending')
  })
  it('button tones, sizes and disabled state', () => {
    const primary = render(h(Button, {}, 'Send pet'))
    expect(primary).toContain('type="button"')
    expect(primary).toContain('bg-primary')
    expect(primary).toContain('rounded-full')
    expect(primary).toContain('px-5 py-3 text-sm')
    expect(render(h(Button, { size: 'sm' }, 'x'))).toContain('text-xs')
    expect(render(h(Button, { tone: 'amber' }, '+ Add funds'))).toContain('gradient-amber')
    expect(render(h(Button, { tone: 'secondary' }, 'x'))).toContain('border-line-strong')
    expect(render(h(Button, { tone: 'ghost' }, 'x'))).toContain('bg-transparent')
    const danger = render(h(Button, { tone: 'danger' }, 'Cancel'))
    expect(danger).toContain('text-danger')
    expect(danger).not.toContain('rounded-full')
    expect(render(h(Button, { disabled: true }, 'x'))).toContain('disabled=""')
  })
})

describe('links, text helpers, field', () => {
  // G + 55 base32 chars; shortKey(addr, 5) must read GB4FT…U4M2W like the design.
  const addr = `GB4FT${'A'.repeat(46)}U4M2W`
  it('TxLink is a tx chip', () => {
    const html = render(h(TxLink, { hash: 'abc123' }))
    expect(html).toContain('href="https://stellar.expert/explorer/testnet/tx/abc123"')
    expect(html).toContain('tx ↗')
    expect(html).toContain('bg-txchip')
    expect(render(h(TxLink, { hash: 'abc', label: 'View' }))).toContain('>View<')
  })
  it('AccountLink shortens with the full address as title', () => {
    const html = render(h(AccountLink, { address: addr }))
    expect(html).toContain(`title="${addr}"`)
    expect(html).toContain('GB4FT…U4M2W')
    expect(html).toContain('font-mono')
  })
  it('Why / ErrorBox / Field', () => {
    expect(render(h(Why, { children: 'because' }))).toContain('text-muted')
    expect(render(h(Why, { children: 'because' }))).not.toContain('💡')
    expect(render(h(ErrorBox, { message: null }))).toBe('')
    const err = render(h(ErrorBox, { message: 'boom', onRetry: noop }))
    expect(err).toContain('role="alert"')
    expect(err).toContain('bg-chip-terra')
    expect(err).toContain('Retry')
    expect(render(h(ErrorBox, { message: 'boom' }))).not.toContain('Retry')
    const field = render(h(Field, { label: 'Name', hint: 'hint here', children: h('input') }))
    expect(field).toContain('Name')
    expect(field).toContain('hint here')
    expect(field).toContain('<input')
  })
  it('SectionTitle puts meta on the right in mono', () => {
    const html = render(h(SectionTitle, { right: '45m old · 4 care ops', children: 'Vitals' }))
    expect(html).toContain('Vitals')
    expect(html).toMatch(/font-mono[^>]*>45m old · 4 care ops</)
  })
  it('form helpers', () => {
    expect(inputClass).toContain('font-mono')
    expect(inputClassSans).toContain('font-sans')
    expect(isPublicKey(addr)).toBe(true)
    expect(isPublicKey('nope')).toBe(false)
  })
})

describe('StatBar', () => {
  it('green at 60 and above, terracotta below, with progressbar aria', () => {
    const ok = render(h(StatBar, { label: 'Happy', value: 91 }))
    expect(ok).toContain('role="progressbar"')
    expect(ok).toContain('aria-valuenow="91"')
    expect(ok).toContain('bg-fill')
    expect(ok).toContain('width:91%')
    expect(ok).toContain('>91<')
    const low = render(h(StatBar, { label: 'Clean', value: 20 }))
    expect(low).toContain('bg-low')
    expect(low).not.toContain('bg-fill')
    // the 6a sample: Clean 54 is terracotta, Hunger 72 is green
    expect(render(h(StatBar, { label: 'Clean', value: 54 }))).toContain('bg-low')
    expect(render(h(StatBar, { label: 'Hunger', value: 72 }))).toContain('bg-fill')
  })
  it('invert flips only the colour, not the fill; clamps and accepts icon', () => {
    const hungry = render(h(StatBar, { label: 'Hunger', value: 80, invert: true, icon: 'x' }))
    expect(hungry).toContain('bg-low')
    expect(hungry).toContain('width:80%')
    expect(render(h(StatBar, { label: 'Clamped', value: 140 }))).toContain('aria-valuenow="100"')
    expect(render(h(StatBar, { label: 'Fixed', value: 95, tone: 'bad' }))).toContain('bg-low')
    expect(render(h(StatBar, { label: 'Fixed', value: 5, tone: 'good' }))).toContain('bg-fill')
  })
})
