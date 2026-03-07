'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import ManageAssetsLiabilitiesModal from './ManageAssetsLiabilitiesModal'

type SnapshotItem = { name: string; amount: number }

type SnapshotCardProps = {
  label: string
  value: string
  breakdown?: SnapshotItem[]
  netWorthBreakdown?: { assets: SnapshotItem[]; liabilities: SnapshotItem[]; net: number }
}

function SnapshotCard({ label, value, breakdown, netWorthBreakdown }: SnapshotCardProps) {
  const [hover, setHover] = useState(false)

  return (
    <div
      style={{
        flex: 1,
        minWidth: 120,
        padding: 20,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        position: 'relative',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>{value}</div>
      {hover && breakdown && breakdown.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 8,
            padding: 12,
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            zIndex: 10,
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {breakdown.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '4px 0',
                borderBottom: i < breakdown.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <span>{item.name}</span>
              <span>₱{Number(item.amount).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {hover && netWorthBreakdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 8,
            padding: 12,
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            zIndex: 10,
            maxHeight: 320,
            overflow: 'auto',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
            Assets
          </div>
          {netWorthBreakdown.assets.map((item, i) => (
            <div
              key={`a-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '2px 0',
              }}
            >
              <span>{item.name}</span>
              <span>₱{Number(item.amount).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 12, marginBottom: 8 }}>
            Liabilities
          </div>
          {netWorthBreakdown.liabilities.map((item, i) => (
            <div
              key={`l-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '2px 0',
              }}
            >
              <span>{item.name}</span>
              <span>₱{Number(item.amount).toLocaleString()}</span>
            </div>
          ))}
          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: '1px solid #e5e7eb',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Net worth</span>
            <span>₱{netWorthBreakdown.net.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

type FinancialSnapshotSectionProps = {
  refreshTrigger?: number
  onDataChange?: () => void
  /** Called when snapshot totals are known (for assessment). */
  onSnapshotTotals?: (assetsSum: number, liabilitiesSum: number, net: number) => void
}

export default function FinancialSnapshotSection({
  refreshTrigger = 0,
  onDataChange,
  onSnapshotTotals,
}: FinancialSnapshotSectionProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [assets, setAssets] = useState<SnapshotItem[]>([])
  const [liabilities, setLiabilities] = useState<SnapshotItem[]>([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: assetsData } = await supabase.from('assets').select('name, amount')
      const { data: liabilitiesData } = await supabase.from('liabilities').select('name, amount')
      setAssets((assetsData as SnapshotItem[]) || [])
      setLiabilities((liabilitiesData as SnapshotItem[]) || [])
    }
    load()
  }, [refresh, refreshTrigger])

  const assetsSum = assets.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const liabilitiesSum = liabilities.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const net = assetsSum - liabilitiesSum

  useEffect(() => {
    onSnapshotTotals?.(assetsSum, liabilitiesSum, net)
  }, [assetsSum, liabilitiesSum, net])

  return (
    <section
      style={{
        marginBottom: 24,
        padding: 24,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        borderLeft: '4px solid #0ea5e9',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
          Financial snapshot
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
          Manage assets & liabilities
        </button>
      </div>
      <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
        Know where you stand. Your assets, liabilities, and net worth—updated whenever you need clarity.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <SnapshotCard
          label="Total assets"
          value={`₱${assetsSum.toLocaleString()}`}
          breakdown={assets}
        />
        <SnapshotCard
          label="Total liabilities"
          value={`₱${liabilitiesSum.toLocaleString()}`}
          breakdown={liabilities}
        />
        <SnapshotCard
          label="Net worth"
          value={`₱${net.toLocaleString()}`}
          netWorthBreakdown={{
            assets,
            liabilities,
            net,
          }}
        />
      </div>
      <ManageAssetsLiabilitiesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setRefresh((n) => n + 1)
          onDataChange?.()
        }}
      />
    </section>
  )
}
