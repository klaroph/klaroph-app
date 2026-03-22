'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getAccountDisplayLabel, type FinancialAccount } from '@/lib/financialAccounts'
import { getFinancialHealthInsight, getWeightedLiquidAssets } from '@/lib/financialHealthInsights'
import { formatDate } from '@/lib/format'
import { useSubscription } from '@/contexts/SubscriptionContext'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
import LockIcon from '@/components/ui/LockIcon'
import AddAssetLiabilityModal from '@/components/dashboard/AddAssetLiabilityModal'
import EditFinancialAccountModal from '@/components/dashboard/EditFinancialAccountModal'
import FinancialAccountIcon from '@/components/dashboard/FinancialAccountIcon'
import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'

export default function FinancialHealthPage() {
  const { isPro } = useSubscription()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addDefaultTab, setAddDefaultTab] = useState<'asset' | 'liability'>('asset')
  const [editAccount, setEditAccount] = useState<FinancialAccount | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAccounts([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('financial_accounts')
      .select('id, user_id, type, subtype, institution_name, custom_name, amount, notes, created_at, updated_at')
    setAccounts((data as FinancialAccount[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const assets = accounts.filter((a) => a.type === 'asset')
  const liabilities = accounts.filter((a) => a.type === 'liability')
  const assetsSum = assets.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const liabilitiesSum = liabilities.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const net = assetsSum - liabilitiesSum
  const weightedLiquidAssets = getWeightedLiquidAssets(assets.map((a) => ({ subtype: a.subtype, amount: Number(a.amount) })))
  const insight = getFinancialHealthInsight(assetsSum, liabilitiesSum, net, weightedLiquidAssets, assets.map((a) => ({ subtype: a.subtype, amount: Number(a.amount) })))

  // Latest asset/liability modification timestamp (updated_at; fallback to created_at only when updated_at missing)
  const lastUpdatedIso = accounts.length === 0
    ? null
    : accounts.reduce<string | null>((max, a) => {
        const ts = a.updated_at || a.created_at
        if (!ts) return max
        return !max || new Date(ts) > new Date(max) ? ts : max
      }, null)
  const lastUpdatedLabel = lastUpdatedIso ? formatDate(lastUpdatedIso) : null

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this item?')) return
    await supabase.from('financial_accounts').delete().eq('id', id)
    load()
  }

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
    fontSize: 14,
  } as const

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div className="min-w-0 flex-1 max-lg:w-full">
          <div className="max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:overflow-visible">
            <h2 className="max-lg:mb-0">Financial Health</h2>
            <DashboardMobileHeaderLogo />
          </div>
          <p className="max-lg:mt-1 max-lg:text-xs max-lg:leading-snug max-lg:mb-0 max-lg:text-[var(--text-muted,#64748b)]">
            Track your assets, liabilities, and net worth. Get a clear snapshot and premium insights on your financial position.
          </p>
        </div>
      </div>
      {lastUpdatedLabel != null && (
        <p className="page-header-meta" style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          Last updated: {lastUpdatedLabel}
        </p>
      )}

      {/* Summary card — full width */}
      <section className="dashboard-card-section">
        <div className="dash-card">
          <h2 className="dash-card-title" style={{ margin: '0 0 16px' }}>Summary</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div className="income-expense-summary-card premium-summary-card" style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total assets</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '…' : `₱${assetsSum.toLocaleString()}`}
              </div>
            </div>
            <div className="income-expense-summary-card premium-summary-card" style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total liabilities</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '…' : `₱${liabilitiesSum.toLocaleString()}`}
              </div>
            </div>
            <div className="income-expense-summary-card premium-summary-card" style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Net worth</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {loading ? '…' : `₱${net.toLocaleString()}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column layout: left 65% (Assets + Liabilities), right 35% (Insights) */}
      <div className="dashboard-card-section financial-health-two-col">
        {/* Left column — Assets and Liabilities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="dash-card">
            <div className="dash-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <h2 className="dash-card-title" style={{ margin: 0 }}>Assets</h2>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: 14 }}
                onClick={() => { setAddDefaultTab('asset'); setAddModalOpen(true) }}
              >
                Add Asset
              </button>
            </div>
            {loading ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>
            ) : assets.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>No assets yet. Add your first asset above.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assets.map((row) => (
                  <li key={row.id} style={rowStyle}>
                    <FinancialAccountIcon subtype={row.subtype} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{getAccountDisplayLabel(row)}</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>₱{Number(row.amount).toLocaleString()}</span>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => { setEditAccount(row); setEditModalOpen(true) }}>
                      Edit
                    </button>
                    <button type="button" style={{ padding: '4px 10px', fontSize: 13, color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => handleDelete(row.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="dash-card">
            <div className="dash-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <h2 className="dash-card-title" style={{ margin: 0 }}>Liabilities</h2>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: 14 }}
                onClick={() => { setAddDefaultTab('liability'); setAddModalOpen(true) }}
              >
                Add Liability
              </button>
            </div>
            {loading ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>
            ) : liabilities.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>No liabilities yet. Add your first liability above.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {liabilities.map((row) => (
                  <li key={row.id} style={rowStyle}>
                    <FinancialAccountIcon subtype={row.subtype} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{getAccountDisplayLabel(row)}</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>₱{Number(row.amount).toLocaleString()}</span>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => { setEditAccount(row); setEditModalOpen(true) }}>
                      Edit
                    </button>
                    <button type="button" style={{ padding: '4px 10px', fontSize: 13, color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => handleDelete(row.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column — Financial Health Insights */}
        <div className="dash-card" style={{ position: 'sticky', top: 24 }}>
          <h2 className="dash-card-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            Financial Health Insights
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {isPro
              ? 'Advisory-style insights on your net worth, liquidity, and debt pressure.'
              : 'Explore KlaroPH Pro to unlock detailed insights on your financial position, liquidity, and debt pressure.'}
          </p>
          {!isPro ? (
            <div className="premium-gate-block" style={{ padding: 16, background: 'var(--border-muted)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <span className="premium-feature-locked" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
                <LockIcon size={16} />
                Insights locked
              </span>
              <UpgradeCTA variant="compact" />
            </div>
          ) : (
            <div style={{ padding: 16, background: 'var(--border-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                {insight.headline}
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {insight.paragraph}
              </p>
            </div>
          )}
        </div>
      </div>

      <AddAssetLiabilityModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={() => { setAddModalOpen(false); load() }}
        defaultTab={addDefaultTab}
      />
      <EditFinancialAccountModal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditAccount(null) }}
        account={editAccount}
        onSaved={() => { setEditModalOpen(false); setEditAccount(null); load() }}
      />
    </div>
  )
}
