'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ManageExpensesModal from './ManageExpensesModal'

type ViewMode = 'pie' | 'bar' | 'trend'

type ExpenseRow = { category: string; type: string; amount: number; date: string }

type ExpensesOverviewSectionProps = {
  refreshTrigger: number
  onDataChange?: () => void
}

function aggregateByCategory(rows: ExpenseRow[]): { category: string; total: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = r.category || 'Other'
    map.set(key, (map.get(key) ?? 0) + Number(r.amount))
  }
  return Array.from(map.entries()).map(([category, total]) => ({ category, total }))
}

function aggregateByDate(rows: ExpenseRow[]): { date: string; total: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = r.date
    map.set(key, (map.get(key) ?? 0) + Number(r.amount))
  }
  return Array.from(map.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

const PIE_COLORS = ['#059669', '#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4']

export default function ExpensesOverviewSection({
  refreshTrigger,
  onDataChange,
}: ExpensesOverviewSectionProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('pie')
  const [manageModalOpen, setManageModalOpen] = useState(false)
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRows([])
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('expenses')
        .select('category, type, amount, date')
        .order('date', { ascending: false })
      setRows((data as ExpenseRow[]) || [])
      setLoading(false)
    }
    load()
  }, [refreshTrigger])

  const buttonBase: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 13,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fff',
    color: '#6b7280',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const buttonActive: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: '#059669',
    color: '#fff',
    border: '1px solid #059669',
  }

  const handleExpensesSaved = () => {
    onDataChange?.()
  }

  const byCategory = aggregateByCategory(rows)
  const byDate = aggregateByDate(rows)
  const totalExpenses = rows.reduce((s, r) => s + Number(r.amount), 0)
  const maxCategory = Math.max(1, ...byCategory.map((c) => c.total))
  const maxDate = Math.max(1, ...byDate.map((d) => d.total))
  const chartHeight = 160

  // Pie: simple SVG circle segments
  let pieSegments: { offset: number; length: number; color: string; category: string }[] = []
  if (byCategory.length > 0 && totalExpenses > 0) {
    let offset = 0
    pieSegments = byCategory.map((c, i) => {
      const length = (c.total / totalExpenses) * 100
      const seg = { offset, length, color: PIE_COLORS[i % PIE_COLORS.length], category: c.category }
      offset += length
      return seg
    })
  }

  return (
    <section
      style={{
        marginBottom: 24,
        padding: 24,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        borderLeft: '4px solid #dc2626',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
          Expenses overview
        </h2>
        <button
          type="button"
          onClick={() => setManageModalOpen(true)}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            border: 'none',
            borderRadius: 8,
            backgroundColor: '#059669',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Manage expenses
        </button>
      </div>
      <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
        See where your money goes. Needs vs wants helps you stay in control.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setViewMode('pie')}
          style={viewMode === 'pie' ? buttonActive : buttonBase}
        >
          Pie
        </button>
        <button
          type="button"
          onClick={() => setViewMode('bar')}
          style={viewMode === 'bar' ? buttonActive : buttonBase}
        >
          Bar
        </button>
        <button
          type="button"
          onClick={() => setViewMode('trend')}
          style={viewMode === 'trend' ? buttonActive : buttonBase}
        >
          Trend
        </button>
      </div>
      <div
        style={{
          height: 220,
          backgroundColor: '#f8faf9',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          minHeight: 220,
        }}
      >
        {loading ? (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</span>
        ) : rows.length === 0 ? (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>No expenses yet. Add some to see your breakdown.</span>
        ) : viewMode === 'pie' && pieSegments.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <svg width={140} height={140} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
              {pieSegments.map((seg, i) => (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="20"
                  strokeDasharray={`${seg.length * 2.51} 251`}
                  strokeDashoffset={-seg.offset * 2.51}
                />
              ))}
            </svg>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {pieSegments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, backgroundColor: seg.color, borderRadius: 2 }} />
                  {seg.category}: {seg.length.toFixed(0)}% (₱{byCategory[i]?.total.toLocaleString() ?? 0})
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === 'bar' && byCategory.length > 0 ? (
          <svg width="100%" height={chartHeight} viewBox={`0 0 280 ${chartHeight}`} preserveAspectRatio="xMidYMax meet">
            {byCategory.map((c, i) => {
              const w = 280 / byCategory.length - 8
              const h = (c.total / maxCategory) * (chartHeight - 8)
              const x = i * (280 / byCategory.length) + 4
              return (
                <rect
                  key={c.category}
                  x={x}
                  y={chartHeight - h}
                  width={w}
                  height={h}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                  rx={4}
                />
              )
            })}
          </svg>
        ) : viewMode === 'trend' && byDate.length > 0 ? (
          (() => {
            const barW = Math.max(4, (280 - (byDate.length - 1) * 4) / byDate.length)
            return (
              <svg width="100%" height={chartHeight} viewBox={`0 0 ${Math.max(280, byDate.length * (barW + 4))} ${chartHeight}`} preserveAspectRatio="xMidYMax meet">
                {byDate.map((d, i) => {
                  const h = (d.total / maxDate) * (chartHeight - 8)
                  const x = i * (barW + 4)
                  return (
                    <rect
                      key={d.date}
                      x={x}
                      y={chartHeight - h}
                      width={barW}
                      height={h}
                      fill="#dc2626"
                      rx={4}
                    />
                  )
                })}
              </svg>
            )
          })()
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>No data for this view.</span>
        )}
      </div>
      <ManageExpensesModal
        isOpen={manageModalOpen}
        onClose={() => setManageModalOpen(false)}
        onSaved={handleExpensesSaved}
      />
    </section>
  )
}
