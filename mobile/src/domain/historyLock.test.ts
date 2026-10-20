import { describe, expect, it } from 'vitest'
import { freeHistoryCutoffDate, isOlderThanFreeHistory, minimumSelectableHistoryDate } from './historyLock'

/** 08:00 Asia/Manila on 2026-10-20, which is still 2026-10-19 in Los Angeles. */
const eightAmManila = new Date('2026-10-20T00:00:00.000Z')
/** 00:00 Asia/Manila on 2026-10-20, 09:00 the previous morning in Los Angeles. */
const manilaMidnight = new Date('2026-10-19T16:00:00.000Z')

describe('free history picker', () => {
  it('stops a Free picker on the Manila cutoff even when the phone is in Los Angeles', () => {
    expect(freeHistoryCutoffDate(new Date('2026-10-19T15:59:59.000Z'))).toBe('2026-07-21')
    expect(freeHistoryCutoffDate(manilaMidnight)).toBe('2026-07-22')
    expect(freeHistoryCutoffDate(eightAmManila)).toBe('2026-07-22')
    expect(freeHistoryCutoffDate(new Date('2026-10-19T23:59:00.000Z'))).toBe('2026-07-22')
    expect(isOlderThanFreeHistory('2026-07-21', eightAmManila)).toBe(true)
    expect(isOlderThanFreeHistory('2026-07-22', eightAmManila)).toBe(false)
    const minimum = minimumSelectableHistoryDate('Free', eightAmManila)
    expect(minimum?.getFullYear()).toBe(2026)
    expect(minimum?.getMonth()).toBe(6)
    expect(minimum?.getDate()).toBe(22)
    expect(minimumSelectableHistoryDate('Pro', eightAmManila)).toBeUndefined()
    expect(minimumSelectableHistoryDate('Clarity Premium', eightAmManila)).toBeUndefined()
    expect(minimumSelectableHistoryDate(null, eightAmManila)).toBeUndefined()
    expect(minimumSelectableHistoryDate(undefined, eightAmManila)).toBeUndefined()
  })
})
