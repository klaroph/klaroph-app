import { describe, expect, it } from 'vitest'
import { payPeriodAt, payPeriodForCivilDate } from './payPeriod'

describe('pay periods in Asia/Manila', () => {
  it('covers the 1st through the 15th', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 1 })).toEqual({
      half: 'first',
      month: '2026-02',
      start: '2026-02-01',
      end: '2026-02-15',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 15 }).half).toBe('first')
  })

  it('ends a non-leap February on the 28th', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 16 })).toEqual({
      half: 'second',
      month: '2026-02',
      start: '2026-02-16',
      end: '2026-02-28',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 28 }).end).toBe('2026-02-28')
  })

  it('ends a leap February on the 29th', () => {
    expect(payPeriodForCivilDate({ year: 2024, month: 2, day: 29 })).toEqual({
      half: 'second',
      month: '2024-02',
      start: '2024-02-16',
      end: '2024-02-29',
    })
  })

  it('includes the 31st in the second half of a 31-day month', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 1, day: 31 })).toEqual({
      half: 'second',
      month: '2026-01',
      start: '2026-01-16',
      end: '2026-01-31',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 3, day: 31 }).end).toBe('2026-03-31')
    expect(payPeriodForCivilDate({ year: 2026, month: 4, day: 30 }).end).toBe('2026-04-30')
  })

  it('uses the Manila calendar date, including midnight and month edges', () => {
    expect(payPeriodAt(new Date('2026-02-15T15:59:59.000Z'))).toMatchObject({
      half: 'first',
      start: '2026-02-01',
      end: '2026-02-15',
    })
    expect(payPeriodAt(new Date('2026-02-15T16:00:00.000Z'))).toMatchObject({
      half: 'second',
      start: '2026-02-16',
      end: '2026-02-28',
    })
    expect(payPeriodAt(new Date('2026-01-31T16:00:00.000Z'))).toMatchObject({
      month: '2026-02',
      half: 'first',
      start: '2026-02-01',
    })
    expect(payPeriodAt(new Date('2026-12-31T16:00:00.000Z'))).toMatchObject({
      month: '2027-01',
      half: 'first',
      start: '2027-01-01',
      end: '2027-01-15',
    })
  })

  it('rejects a February 31', () => {
    expect(() => payPeriodForCivilDate({ year: 2026, month: 2, day: 31 })).toThrow(/Invalid calendar date/)
  })
})
