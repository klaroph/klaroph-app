import { describe, expect, it } from 'vitest'
import { payPeriodAt, payPeriodForCivilDate } from './payPeriod'

describe('pay periods in Asia/Manila', () => {
  it('covers the previous last day through the 14th', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 1 })).toEqual({
      half: 'a',
      month: '2026-02',
      start: '2026-01-31',
      end: '2026-02-14',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 14 })).toEqual({
      half: 'a',
      month: '2026-02',
      start: '2026-01-31',
      end: '2026-02-14',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 1, day: 1 })).toMatchObject({
      half: 'a',
      month: '2026-01',
      start: '2025-12-31',
      end: '2026-01-14',
    })
  })

  it('covers the 15th through the day before the last day', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 15 })).toEqual({
      half: 'b',
      month: '2026-02',
      start: '2026-02-15',
      end: '2026-02-27',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 27 }).end).toBe('2026-02-27')
    expect(payPeriodForCivilDate({ year: 2026, month: 1, day: 15 })).toMatchObject({
      half: 'b',
      start: '2026-01-15',
      end: '2026-01-30',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 1, day: 30 }).end).toBe('2026-01-30')
    expect(payPeriodForCivilDate({ year: 2026, month: 4, day: 15 })).toMatchObject({
      half: 'b',
      start: '2026-04-15',
      end: '2026-04-29',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 4, day: 29 }).end).toBe('2026-04-29')
  })

  it('starts the next period A on a non-leap February 28', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 2, day: 28 })).toEqual({
      half: 'a',
      month: '2026-03',
      start: '2026-02-28',
      end: '2026-03-14',
    })
  })

  it('starts the next period A on a leap February 29 and ends period B on the 28th', () => {
    expect(payPeriodForCivilDate({ year: 2024, month: 2, day: 28 })).toEqual({
      half: 'b',
      month: '2024-02',
      start: '2024-02-15',
      end: '2024-02-28',
    })
    expect(payPeriodForCivilDate({ year: 2024, month: 2, day: 29 })).toEqual({
      half: 'a',
      month: '2024-03',
      start: '2024-02-29',
      end: '2024-03-14',
    })
  })

  it('puts the 31st and the 30th last-days into the next period A', () => {
    expect(payPeriodForCivilDate({ year: 2026, month: 1, day: 31 })).toEqual({
      half: 'a',
      month: '2026-02',
      start: '2026-01-31',
      end: '2026-02-14',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 3, day: 31 })).toMatchObject({
      half: 'a',
      month: '2026-04',
      start: '2026-03-31',
      end: '2026-04-14',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 4, day: 30 })).toEqual({
      half: 'a',
      month: '2026-05',
      start: '2026-04-30',
      end: '2026-05-14',
    })
    expect(payPeriodForCivilDate({ year: 2026, month: 12, day: 31 })).toEqual({
      half: 'a',
      month: '2027-01',
      start: '2026-12-31',
      end: '2027-01-14',
    })
  })

  it('uses the Manila calendar date across midnight', () => {
    expect(payPeriodAt(new Date('2026-02-13T16:00:00.000Z'))).toMatchObject({
      half: 'a',
      month: '2026-02',
      start: '2026-01-31',
      end: '2026-02-14',
    })
    expect(payPeriodAt(new Date('2026-02-14T15:59:59.000Z'))).toMatchObject({
      half: 'a',
      end: '2026-02-14',
    })
    expect(payPeriodAt(new Date('2026-02-14T16:00:00.000Z'))).toMatchObject({
      half: 'b',
      month: '2026-02',
      start: '2026-02-15',
      end: '2026-02-27',
    })
    expect(payPeriodAt(new Date('2026-01-30T16:00:00.000Z'))).toMatchObject({
      half: 'a',
      month: '2026-02',
      start: '2026-01-31',
      end: '2026-02-14',
    })
    expect(payPeriodAt(new Date('2026-12-31T16:00:00.000Z'))).toMatchObject({
      half: 'a',
      month: '2027-01',
      start: '2026-12-31',
      end: '2027-01-14',
    })
  })

  it('rejects a February 31', () => {
    expect(() => payPeriodForCivilDate({ year: 2026, month: 2, day: 31 })).toThrow(/Invalid calendar date/)
  })
})
