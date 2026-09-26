'use client'

import { useState, useEffect } from 'react'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import { getAccountDisplayLabel, type FinancialAccount } from '@/lib/financialAccounts'
import { getFinancialHealthInsight, getWeightedLiquidAssets } from '@/lib/financialHealthInsights'
import { formatPeso, formatDate } from '@/lib/format'
import { useSubscription } from '@/contexts/SubscriptionContext'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
import LockIcon from '@/components/ui/LockIcon'
import AddAssetLiabilityModal from '@/components/dashboard/AddAssetLiabilityModal'
import EditFinancialAccountModal from '@/components/dashboard/EditFinancialAccountModal'
import FinancialAccountIcon from '@/components/dashboard/FinancialAccountIcon'
import KlaroPageHeader from '@/components/layout/KlaroPageHeader'

export default function FinancialHealthPage() {
  const { isPro } = useSubscription()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addDefaultTab, setAddDefaultTab] = useState<'asset' | 'liability'>('asset')
  const [editAccount, setEditAccount] = useState<FinancialAccount | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)

  const load = async () => {
    const { data: { user } } = await getBrowserUser()
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
  /** Non-breaking space keeps the meta line's height before accounts load and when there are none. */
  const headerMeta = lastUpdatedLabel != null ? `Last updated: ${lastUpdatedLabel}` : '\u00a0'

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this item?')) return
    await supabase.from('financial_accounts').delete().eq('id', id)
    load()
  }

  return (
    <div className="dashboard-page klaro-page-shell">
      <KlaroPageHeader
        title="Financial Health"
        description="Your financial position at a glance — assets, liabilities, and net worth."
        meta={headerMeta}
      />

      <section className="dashboard-card-section">
        <div className="dash-card">
          <h2 className="dash-card-title" style={{ margin: '0 0 16px' }}>Summary</h2>
          <div className="fh-summary-grid">
            <div className="fh-summary-tile klaro-tint klaro-tone-sky">
              <p className="fh-summary-label">Total Assets</p>
              <p className="fh-summary-value">{loading ? '…' : formatPeso(assetsSum)}</p>
            </div>
            <div className="fh-summary-tile klaro-tint klaro-tone-coral">
              <p className="fh-summary-label">Total Liabilities</p>
              <p className="fh-summary-value">{loading ? '…' : formatPeso(liabilitiesSum)}</p>
            </div>
            <div className="fh-summary-tile klaro-tint klaro-tone-lavender">
              <p className="fh-summary-label">Net Worth</p>
              <p
                className={`fh-summary-value${net > 0 ? ' is-positive' : net < 0 ? ' is-negative' : ''}`}
              >
                {loading ? '…' : formatPeso(net)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Distinct keys: loaded account lists replace the loading cards rather than pushing them down. */}
      <div key={loading ? 'fh-loading' : 'fh-ready'} className="dashboard-card-section financial-health-two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="dash-card">
            <div className="dash-card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <h2 className="dash-card-title" style={{ margin: 0 }}>Assets</h2>
              <button
                type="button"
                className="btn-primary"
                onClick={() => { setAddDefaultTab('asset'); setAddModalOpen(true) }}
              >
                + Add Asset
              </button>
            </div>
            {loading ? (
              <p className="klaro-page-header-desc">Loading…</p>
            ) : assets.length === 0 ? (
              <p className="klaro-page-header-desc">No assets yet. Add your first asset above.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assets.map((row) => (
                  <li key={row.id} className="fh-account-row">
                    <FinancialAccountIcon subtype={row.subtype} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{getAccountDisplayLabel(row)}</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatPeso(Number(row.amount))}</span>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => { setEditAccount(row); setEditModalOpen(true) }}>
                      Edit
                    </button>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13, color: 'var(--color-danger)' }} onClick={() => handleDelete(row.id)}>
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
                onClick={() => { setAddDefaultTab('liability'); setAddModalOpen(true) }}
              >
                + Add Liability
              </button>
            </div>
            {loading ? (
              <p className="klaro-page-header-desc">Loading…</p>
            ) : liabilities.length === 0 ? (
              <p className="klaro-page-header-desc">No liabilities yet. Add your first liability above.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {liabilities.map((row) => (
                  <li key={row.id} className="fh-account-row">
                    <FinancialAccountIcon subtype={row.subtype} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{getAccountDisplayLabel(row)}</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatPeso(Number(row.amount))}</span>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => { setEditAccount(row); setEditModalOpen(true) }}>
                      Edit
                    </button>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 13, color: 'var(--color-danger)' }} onClick={() => handleDelete(row.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="dash-card" style={{ position: 'sticky', top: 24 }}>
          <h2 className="dash-card-title" style={{ margin: '0 0 8px' }}>
            Financial Health Insights
          </h2>
          <p className="klaro-page-header-desc" style={{ marginBottom: 16 }}>
            {isPro
              ? 'Advisory-style insights on your net worth, liquidity, and debt pressure.'
              : 'Explore KlaroPH Pro to unlock detailed insights on your financial position, liquidity, and debt pressure.'}
          </p>
          {!isPro ? (
            <div className="premium-gate-block" style={{ padding: 16, background: 'var(--pastel-sky)', borderRadius: 12, border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <span className="premium-feature-locked" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
                <LockIcon size={16} />
                Insights locked
              </span>
              <UpgradeCTA variant="compact" />
            </div>
          ) : (
            <div style={{ padding: 16, background: 'var(--pastel-lavender)', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
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
