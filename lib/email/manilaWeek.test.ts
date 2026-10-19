import { describe, expect, it } from 'vitest'
import { manilaDateInRange, manilaWeekWindow, weeklyCampaignId } from './manilaWeek'

/** Monday 08:00 Asia/Manila = 00:00 UTC. */
const monday8am = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)

describe('manilaWeekWindow', () => {
  it('covers the previous Manila Monday through Sunday when the cron runs Monday morning', () => {
    const window = manilaWeekWindow(monday8am('2026-10-19'))
    expect(window).toEqual({
      startMonday: '2026-10-12',
      covered: { start: '2026-10-12', end: '2026-10-18' },
      previous: { start: '2026-10-05', end: '2026-10-11' },
    })
    expect(weeklyCampaignId(window)).toBe('week-2026-10-12')
    expect(weeklyCampaignId(window)).toMatch(/^[a-z0-9][a-z0-9-]{2,63}$/)
  })

  it('crosses a month boundary', () => {
    const window = manilaWeekWindow(monday8am('2026-03-02'))
    expect(window.covered).toEqual({ start: '2026-02-23', end: '2026-03-01' })
    expect(window.previous).toEqual({ start: '2026-02-16', end: '2026-02-22' })
    expect(weeklyCampaignId(window)).toBe('week-2026-02-23')
  })

  it('crosses a year boundary', () => {
    const window = manilaWeekWindow(monday8am('2026-01-05'))
    expect(window.covered).toEqual({ start: '2025-12-29', end: '2026-01-04' })
    expect(window.previous).toEqual({ start: '2025-12-22', end: '2025-12-28' })
    expect(weeklyCampaignId(window)).toBe('week-2025-12-29')
  })

  it('flips at Manila Monday 00:00, not at UTC midnight', () => {
    const before = manilaWeekWindow(new Date('2026-10-18T15:59:59.999Z')) // Sunday 23:59:59.999 Manila
    const after = manilaWeekWindow(new Date('2026-10-18T16:00:00.000Z')) // Monday 00:00 Manila
    expect(before.covered).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(after.covered).toEqual({ start: '2026-10-12', end: '2026-10-18' })
  })
})

describe('manilaDateInRange', () => {
  const covered = manilaWeekWindow(monday8am('2026-10-19')).covered

  it('counts Sunday and excludes the following Monday', () => {
    expect(manilaDateInRange('2026-10-18', covered)).toBe(true)
    expect(manilaDateInRange('2026-10-19', covered)).toBe(false)
    expect(manilaDateInRange('2026-10-12', covered)).toBe(true)
    expect(manilaDateInRange('2026-10-11', covered)).toBe(false)
  })

  it('rejects timestamps so a Monday instant cannot sneak in as Sunday', () => {
    expect(manilaDateInRange('2026-10-18T23:59:59.999Z', covered)).toBe(false)
    expect(manilaDateInRange('2026-10-19T00:00:00.000Z', covered)).toBe(false)
  })
})
