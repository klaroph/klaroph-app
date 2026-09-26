'use client'

import { useEffect, useState } from 'react'
import { toLocalDateString } from '@/lib/format'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`
}

function getCurrentMonthFirst(): string {
  const d = new Date()
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
}

type MonthPickerProps = {
  id: string
  value: string
  onChange: (monthFirst: string) => void
  /** Bump to re-read months that have expenses (e.g. after adding a transaction) */
  refreshKey?: number
  className?: string
}

/** Month selector listing the current month plus every month with recorded expenses (newest first). */
export default function MonthPicker({ id, value, onChange, refreshKey = 0, className }: MonthPickerProps) {
  const [months, setMonths] = useState<string[]>(() => [getCurrentMonthFirst()])

  useEffect(() => {
    let mounted = true
    fetch('/api/expense-months', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (!mounted) return
        const set = new Set(Array.isArray(data) ? (data as string[]) : [])
        set.add(getCurrentMonthFirst())
        setMonths(Array.from(set).sort().reverse())
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [refreshKey])

  return (
    <div className={`klaro-month-picker${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="klaro-month-picker-label">
        Month
      </label>
      <select
        id={id}
        className="klaro-month-picker-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m)}
          </option>
        ))}
      </select>
    </div>
  )
}
