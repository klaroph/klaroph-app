import { describe, expect, it } from 'vitest'
import { manilaDateInRange, manilaHalfMonth, paydayCampaignId, type ManilaHalfMonthWindow } from './manilaHalfMonth'

/** A Manila civil time, converted with the fixed +8 offset. 08:00 Manila is 00:00 UTC the same calendar day. */
function manilaAt(ymd: string, hour = 8, minute = 0): Date {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute))
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = []
  for (let ymd = start; ymd <= end; ymd = addDays(ymd, 1)) days.push(ymd)
  return days
}

describe('manilaHalfMonth', () => {
  it('uses the send month for half a, including the December to January rollover', () => {
    const window = manilaHalfMonth(manilaAt('2027-01-15'))
    expect(window).toEqual({
      half: 'a',
      month: '2027-01',
      covered: { start: '2026-12-31', end: '2027-01-14' },
      dayCount: 15,
    })
    expect(paydayCampaignId(window!)).toBe('half-2027-01-a')
    expect(paydayCampaignId(window!)).toMatch(/^[a-z0-9][a-z0-9-]{2,63}$/)

    const december = manilaHalfMonth(manilaAt('2026-12-31'))
    expect(december).toEqual({
      half: 'b',
      month: '2026-12',
      covered: { start: '2026-12-15', end: '2026-12-30' },
      dayCount: 16,
    })
    expect(paydayCampaignId(december!)).toBe('half-2026-12-b')
    expect(addDays(december!.covered.end, 1)).toBe(window!.covered.start)
  })

  it('keeps 08:59 Manila on the same payday as 08:00', () => {
    const morning = manilaHalfMonth(manilaAt('2027-01-15', 8, 0))
    const delayed = manilaHalfMonth(manilaAt('2027-01-15', 8, 59))
    expect(delayed).toEqual(morning)
    expect(paydayCampaignId(delayed!)).toBe('half-2027-01-a')
    expect(manilaHalfMonth(manilaAt('2027-01-16', 0, 0))).toBeNull()
  })

  it('uses the Manila date when it differs from the UTC date', () => {
    const justAfterManilaMidnight = manilaHalfMonth(manilaAt('2027-01-15', 0, 1))
    expect(justAfterManilaMidnight?.half).toBe('a')
    expect(paydayCampaignId(justAfterManilaMidnight!)).toBe('half-2027-01-a')
    expect(manilaHalfMonth(manilaAt('2027-01-14', 23, 59))).toBeNull()
  })

  it('skips the 28th, 29th, and 30th of a 31-day month', () => {
    for (const day of [28, 29, 30]) {
      expect(manilaHalfMonth(manilaAt(`2026-10-${day}`, 8, 0))).toBeNull()
      expect(manilaHalfMonth(manilaAt(`2026-10-${day}`, 8, 59))).toBeNull()
    }
    const last = manilaHalfMonth(manilaAt('2026-10-31', 8, 59))
    expect(last).toEqual({
      half: 'b',
      month: '2026-10',
      covered: { start: '2026-10-15', end: '2026-10-30' },
      dayCount: 16,
    })
    expect(paydayCampaignId(last!)).toBe('half-2026-10-b')
  })

  it('covers February in a leap year and a normal year, and connects to March', () => {
    const leapFifteenth = manilaHalfMonth(manilaAt('2028-02-15'))
    expect(leapFifteenth).toEqual({
      half: 'a',
      month: '2028-02',
      covered: { start: '2028-01-31', end: '2028-02-14' },
      dayCount: 15,
    })
    expect(paydayCampaignId(leapFifteenth!)).toBe('half-2028-02-a')
    expect(manilaHalfMonth(manilaAt('2028-02-28'))).toBeNull()
    const leapLast = manilaHalfMonth(manilaAt('2028-02-29'))
    expect(leapLast).toEqual({
      half: 'b',
      month: '2028-02',
      covered: { start: '2028-02-15', end: '2028-02-28' },
      dayCount: 14,
    })
    expect(paydayCampaignId(leapLast!)).toBe('half-2028-02-b')
    const leapMarch = manilaHalfMonth(manilaAt('2028-03-15'))
    expect(leapMarch?.covered).toEqual({ start: '2028-02-29', end: '2028-03-14' })
    expect(paydayCampaignId(leapMarch!)).toBe('half-2028-03-a')

    const normalFifteenth = manilaHalfMonth(manilaAt('2027-02-15'))
    expect(normalFifteenth).toEqual({
      half: 'a',
      month: '2027-02',
      covered: { start: '2027-01-31', end: '2027-02-14' },
      dayCount: 15,
    })
    expect(paydayCampaignId(normalFifteenth!)).toBe('half-2027-02-a')
    const normalLast = manilaHalfMonth(manilaAt('2027-02-28'))
    expect(normalLast).toEqual({
      half: 'b',
      month: '2027-02',
      covered: { start: '2027-02-15', end: '2027-02-27' },
      dayCount: 13,
    })
    expect(paydayCampaignId(normalLast!)).toBe('half-2027-02-b')
    const normalMarch = manilaHalfMonth(manilaAt('2027-03-15'))
    expect(normalMarch?.covered).toEqual({ start: '2027-02-28', end: '2027-03-14' })
    expect(paydayCampaignId(normalMarch!)).toBe('half-2027-03-a')

    expect(addDays(leapFifteenth!.covered.end, 1)).toBe(leapLast!.covered.start)
    expect(addDays(leapLast!.covered.end, 1)).toBe(leapMarch!.covered.start)
    expect(addDays(normalFifteenth!.covered.end, 1)).toBe(normalLast!.covered.start)
    expect(addDays(normalLast!.covered.end, 1)).toBe(normalMarch!.covered.start)
  })

  it('covers a 30-day month on the 30th and skips the 28th and 29th', () => {
    expect(manilaHalfMonth(manilaAt('2026-04-28'))).toBeNull()
    expect(manilaHalfMonth(manilaAt('2026-04-29'))).toBeNull()
    const april = manilaHalfMonth(manilaAt('2026-04-30'))
    expect(april).toEqual({
      half: 'b',
      month: '2026-04',
      covered: { start: '2026-04-15', end: '2026-04-29' },
      dayCount: 15,
    })
    expect(paydayCampaignId(april!)).toBe('half-2026-04-b')
    const may = manilaHalfMonth(manilaAt('2026-05-15'))
    expect(may?.covered).toEqual({ start: '2026-04-30', end: '2026-05-14' })
    expect(addDays(april!.covered.end, 1)).toBe(may!.covered.start)
  })

  it('leaves no gaps or overlaps from the 2026 January payday through December 2028', () => {
    const windows: ManilaHalfMonthWindow[] = []
    for (const day of eachDay('2026-01-01', '2028-12-31')) {
      const window = manilaHalfMonth(manilaAt(day))
      if (window) windows.push(window)
    }
    expect(windows[0].covered).toEqual({ start: '2025-12-31', end: '2026-01-14' })
    expect(windows[windows.length - 1].covered).toEqual({ start: '2028-12-15', end: '2028-12-30' })
    for (let i = 1; i < windows.length; i++) {
      expect(addDays(windows[i - 1].covered.end, 1)).toBe(windows[i].covered.start)
    }
    for (const window of windows) {
      expect(window.dayCount).toBe(eachDay(window.covered.start, window.covered.end).length)
      expect(paydayCampaignId(window)).toMatch(/^half-\d{4}-\d{2}-[ab]$/)
    }
  })
})

describe('manilaDateInRange', () => {
  const covered = manilaHalfMonth(manilaAt('2026-10-15'))!.covered

  it('counts the previous month last day and the 14th, and excludes the day before and the 15th', () => {
    expect(covered).toEqual({ start: '2026-09-30', end: '2026-10-14' })
    expect(manilaDateInRange('2026-09-30', covered)).toBe(true)
    expect(manilaDateInRange('2026-10-14', covered)).toBe(true)
    expect(manilaDateInRange('2026-09-29', covered)).toBe(false)
    expect(manilaDateInRange('2026-10-15', covered)).toBe(false)
  })

  it('rejects timestamps so a boundary instant cannot sneak in', () => {
    expect(manilaDateInRange('2026-10-14T23:59:59.999Z', covered)).toBe(false)
    expect(manilaDateInRange('2026-09-30T00:00:00.000Z', covered)).toBe(false)
  })
})
