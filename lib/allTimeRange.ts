import type { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'

export type AllTimeTableName = 'income_records' | 'expenses'

export type TrendGrouping = 'day' | 'month' | 'year'

export type AllTimeRangeResult = {
  start: string
  end: string
  grouping: TrendGrouping
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function differenceInDays(dateRight: Date, dateLeft: Date): number {
  const utcRight = Date.UTC(dateRight.getFullYear(), dateRight.getMonth(), dateRight.getDate())
  const utcLeft = Date.UTC(dateLeft.getFullYear(), dateLeft.getMonth(), dateLeft.getDate())
  return Math.floor((utcRight - utcLeft) / MS_PER_DAY)
}

function getGroupingForRange(minDate: Date, maxDate: Date): TrendGrouping {
  const diffInDays = differenceInDays(maxDate, minDate)
  if (diffInDays <= 45) return 'day'
  if (diffInDays <= 540) return 'month' // 18 months
  return 'year'
}

/**
 * Fetches only the date column to compute min/max range and auto grouping.
 * Use when period is "All Time". No hardcoded fallback year.
 */
export async function getAllTimeRangeAndGrouping(
  supabase: SupabaseClient,
  userId: string,
  tableName: AllTimeTableName
): Promise<AllTimeRangeResult> {
  const today = toLocalDateString(new Date())

  const { data: minRow } = await supabase
    .from(tableName)
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: maxRow } = await supabase
    .from(tableName)
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const minDateStr = (minRow as { date?: string } | null)?.date
  const maxDateStr = (maxRow as { date?: string } | null)?.date

  if (minDateStr == null || maxDateStr == null) {
    return { start: today, end: today, grouping: 'day' }
  }

  const minDate = parseLocalDateString(minDateStr)
  const maxDate = parseLocalDateString(maxDateStr)
  const grouping = getGroupingForRange(minDate, maxDate)

  return {
    start: minDateStr,
    end: maxDateStr,
    grouping,
  }
}
