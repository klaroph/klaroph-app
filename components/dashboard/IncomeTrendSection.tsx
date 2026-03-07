'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import IncomeAllocationModal from './IncomeAllocationModal'

type IncomeTrendSectionProps = {
  onSaved?: () => void
  refreshTrigger?: number
}

type IncomeRecord = { total_amount: number; date: string }

export default function IncomeTrendSection({ onSaved, refreshTrigger = 0 }: IncomeTrendSectionProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [records, setRecords] = useState<IncomeRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRecords([])
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('income_records')
        .select('total_amount, date')
        .order('date', { ascending: true })
      setRecords((data as IncomeRecord[]) || [])
      setLoading(false)
    }
    load()
  }, [refreshTrigger])

  const maxVal = Math.max(1, ...records.map((r) => Number(r.total_amount)))
  const chartHeight = 160
  const barGap = 4
  const barWidth = records.length ? Math.max(4, (280 - (records.length - 1) * barGap) / records.length) : 0

  return (
    <section
      style={{
        marginBottom: 24,
        padding: 24,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        borderLeft: '4px solid #059669',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
          Income trend
        </h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
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
          Add income / allocate
        </button>
      </div>
      <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
        Track your income over time. Every peso logged moves you closer to clarity.
      </p>
      <div
        style={{
          height: 200,
          backgroundColor: '#f8faf9',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: barGap,
          padding: '16px 20px',
          minHeight: 200,
        }}
      >
        {loading ? (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</span>
        ) : records.length === 0 ? (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>No income logged yet. Add income to see your trend.</span>
        ) : (
          <svg width="100%" height={chartHeight} viewBox={`0 0 ${Math.max(280, records.length * (barWidth + barGap))} ${chartHeight}`} preserveAspectRatio="xMidYMax meet" style={{ overflow: 'visible' }}>
            {records.map((r, i) => {
              const h = (Number(r.total_amount) / maxVal) * (chartHeight - 8)
              const x = i * (barWidth + barGap)
              return (
                <rect
                  key={`${r.date}-${i}`}
                  x={x}
                  y={chartHeight - h}
                  width={Math.max(2, barWidth)}
                  height={h}
                  fill="#059669"
                  rx={4}
                />
              )
            })}
          </svg>
        )}
      </div>
      <IncomeAllocationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => onSaved?.()}
      />
    </section>
  )
}
