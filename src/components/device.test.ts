import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Device, type DeviceProps } from './Device'

const base: DeviceProps = {
  name: 'LEYLA',
  stageLabel: 'ADULT',
  species: 'tanuki',
  stage: 'adult',
  mood: 'happy',
  alive: true,
  moodline: 'LIVING MY BEST LIFE',
}

const render = (p: Partial<DeviceProps>) => renderToStaticMarkup(h(Device, { ...base, ...p }))
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

describe('Device', () => {
  it('renders an egg: wobble idle, no stroll, keys enabled', () => {
    const html = render({ stage: 'egg', stageLabel: 'EGG', name: 'NEW EGG', moodline: 'NAME ME, THEN HATCH' })
    expect(html).toContain('data-stage="egg"')
    expect(html).toContain('NEW EGG')
    expect(html).toContain('>EGG<')
    expect(html).toContain('NAME ME, THEN HATCH')
    expect(html).toContain('dv-i-egg')
    expect(html).not.toContain('dv-stroll')
    expect(html).toContain('aria-label="Feed"')
    expect(html).toContain('aria-label="Play"')
    expect(html).toContain('aria-label="Clean"')
    expect(count(html, /disabled=""/g)).toBe(0)
  })

  it('renders a happy alive adult: strolls, bobs on the ground, keys enabled, ticker optional', () => {
    const html = render({})
    expect(html).toContain('data-stage="adult"')
    expect(html).toContain('data-alive="true"')
    expect(html).toContain('dv-stroll')
    expect(html).toContain('dv-i-bob')
    expect(html).not.toContain('dv-kind-floating')
    expect(html).not.toContain('dv-ticker')
    expect(html).toContain('CHAIN·PET')
    expect(count(html, /class="dv-key"/g)).toBe(3)
    expect(count(html, /disabled=""/g)).toBe(0)

    const withTicker = render({ ticker: 'STARVES IN 23H 16M', urgent: true })
    expect(withTicker).toContain('dv-ticker dv-urgent')
    expect(withTicker).toContain('STARVES IN 23H 16M')
  })

  it('floating species hover above the ground line; sad pets droop', () => {
    expect(render({ species: 'bug' })).toContain('dv-kind-floating')
    expect(render({ species: 'bug' })).toContain('dv-i-float')
    expect(render({ mood: 'miserable' })).toContain('dv-i-droop')
    expect(render({ mood: 'miserable' })).not.toContain('dv-stroll')
  })

  it('renders a ghost: lilac LCD, float idle, keys disabled', () => {
    const html = render({ alive: false, stageLabel: 'GHOST', mood: 'miserable' })
    expect(html).toContain('dv-root dv-ghost')
    expect(html).toContain('data-alive="false"')
    expect(html).toContain('dv-i-ghost')
    expect(html).not.toContain('dv-stroll')
    expect(count(html, /disabled=""/g)).toBe(3)
  })

  it('busyLine replaces the moodline and disables the keys', () => {
    const idle = render({})
    expect(idle).toContain('LIVING MY BEST LIFE')
    expect(count(idle, /disabled=""/g)).toBe(0)

    const busy = render({ busyLine: 'SIGNING · CONFIRMING…' })
    expect(busy).toContain('SIGNING · CONFIRMING…')
    expect(busy).not.toContain('LIVING MY BEST LIFE')
    expect(count(busy, /disabled=""/g)).toBe(3)

    expect(count(render({ keysDisabled: true }), /disabled=""/g)).toBe(3)
  })

  it('does not start an action sequence on mount, whatever the nonces already are', () => {
    const html = render({ play: { kind: 'feed', nonce: 5 }, hatched: 2 })
    expect(html).toContain('LIVING MY BEST LIFE')
    expect(html).not.toContain('NOM NOM NOM')
    expect(html).not.toContain('dv-a-')
    expect(html).not.toContain('dv-item-food')
    expect(html).not.toContain('dv-heartpop')
  })

  it('passes className through and keeps the pet at the adult height', () => {
    const html = render({ className: 'w-full' })
    expect(html).toContain('class="dv-root w-full"')
    expect(html).toContain('height="116"')
  })
})
