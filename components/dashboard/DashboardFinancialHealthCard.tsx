'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/format'
import type { FinancialAccount } from '@/lib/financialAccounts'
import { getNetWorthInsight } from '@/lib/dashboardCardInsights'
import DashboardCardInsight from '@/components/dashboard/DashboardCardInsight'

/**
 * Dashboard snapshot of the existing Financial Health page:
 * assets, liabilities, net worth from `financial_accounts` (same derivation).
 */
export default function DashboardFinancialHealthCard({
  refreshTrigger = 0,
}: {
  refreshTrigger?: number
}) {
  const [assets, setAssets] = useState(0)
  const [liabilities, setLiabilities] = useState(0)
  const [hasAccounts, setHasAccounts] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await getBrowserUser()
      if (!mounted) return
      if (!user) {
        setAssets(0)
        setLiabilities(0)
        setHasAccounts(false)
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('financial_accounts')
        .select('type, amount')
      if (!mounted) return
      const rows = (data as Pick<FinancialAccount, 'type' | 'amount'>[]) ?? []
      let a = 0
      let l = 0
      for (const row of rows) {
        const amount = Number(row.amount) || 0
        if (row.type === 'asset') a += amount
        else if (row.type === 'liability') l += amount
      }
      setAssets(a)
      setLiabilities(l)
      setHasAccounts(rows.length > 0)
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [refreshTrigger])

  const netWorth = assets - liabilities

  const insight = getNetWorthInsight(assets, liabilities, hasAccounts)

  return (
    <section className="dash-fh-card card dash-card" aria-labelledby="dash-fh-heading" aria-busy={loading}>
      <div className="dash-fh-header">
        <h3 id="dash-fh-heading" className="dash-card-title">
          Financial Health
        </h3>
        <Link href="/dashboard/financial-health" className="card-outline-link">
          View details →
        </Link>
      </div>

      <ul className="dash-fh-rows">
        <li className="dash-fh-row">
          <span className="dash-fh-icon dash-fh-icon--assets" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V8l7-5 7 5v13" />
              <path d="M9 21v-6h6v6" />
            </svg>
          </span>
          <span className="dash-fh-label">Total Assets</span>
          <span className="dash-fh-value tabular-nums">{formatCurrency(assets)}</span>
        </li>
        <li className="dash-fh-row">
          <span className="dash-fh-icon dash-fh-icon--liabilities" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="13" rx="2" />
              <path d="M2 11h20" />
            </svg>
          </span>
          <span className="dash-fh-label">Total Liabilities</span>
          <span className="dash-fh-value tabular-nums">{formatCurrency(liabilities)}</span>
        </li>
        <li className="dash-fh-row">
          <span className="dash-fh-icon dash-fh-icon--net" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
          </span>
          <span className="dash-fh-label">Net Worth</span>
          <span
            className={`dash-fh-value tabular-nums${netWorth > 0 ? ' is-positive' : netWorth < 0 ? ' is-negative' : ''}`}
          >
            {formatCurrency(netWorth)}
          </span>
        </li>
      </ul>

      {!loading && <DashboardCardInsight insight={insight} />}
    </section>
  )
}
