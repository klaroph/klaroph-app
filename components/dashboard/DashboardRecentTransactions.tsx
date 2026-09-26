'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/format'

type TxRow = {
  id: string
  kind: 'income' | 'expense'
  label: string
  category: string
  date: string
  amount: number
}

type DashboardRecentTransactionsProps = {
  refreshTrigger?: number
  limit?: number
}

export default function DashboardRecentTransactions({
  refreshTrigger = 0,
  limit = 5,
}: DashboardRecentTransactionsProps) {
  const [rows, setRows] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await getBrowserUser()
      if (!user) {
        if (mounted) {
          setRows([])
          setLoading(false)
        }
        return
      }

      const [incRes, expRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('id, total_amount, date, income_source')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(limit),
        supabase
          .from('expenses')
          .select('id, amount, date, category, description')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(limit),
      ])

      if (!mounted) return

      const combined: TxRow[] = [
        ...(incRes.data ?? []).map((r) => {
          const row = r as {
            id: string
            total_amount: number
            date: string
            income_source: string | null
          }
          return {
            id: `inc-${row.id}`,
            kind: 'income' as const,
            label: row.income_source?.trim() || 'Income',
            category: 'Income',
            date: row.date,
            amount: Number(row.total_amount) || 0,
          }
        }),
        ...(expRes.data ?? []).map((r) => {
          const row = r as {
            id: string
            amount: number
            date: string
            category: string
            description: string | null
          }
          return {
            id: `exp-${row.id}`,
            kind: 'expense' as const,
            label: row.description?.trim() || row.category || 'Expense',
            category: row.category || 'Other',
            date: row.date,
            amount: Number(row.amount) || 0,
          }
        }),
      ]

      combined.sort((a, b) => b.date.localeCompare(a.date))
      setRows(combined.slice(0, limit))
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [refreshTrigger, limit])

  return (
    <section className="dash-recent-tx card dash-card" aria-labelledby="dash-recent-tx-heading">
      <div className="dash-recent-tx-header">
        <h3 id="dash-recent-tx-heading" className="dash-card-title">
          Recent Transactions
        </h3>
        <Link href="/dashboard/expenses" className="card-outline-link">
          View all →
        </Link>
      </div>
      {loading ? (
        <p className="dash-recent-tx-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="dash-recent-tx-empty">No transactions yet this period.</p>
      ) : (
        <ul className="dash-recent-tx-list">
          {rows.map((tx) => (
            <li key={tx.id} className="dash-recent-tx-row">
              <div className={`dash-recent-tx-icon dash-recent-tx-icon--${tx.kind}`} aria-hidden>
                {tx.kind === 'income' ? '+' : '−'}
              </div>
              <div className="dash-recent-tx-meta">
                <p className="dash-recent-tx-label">{tx.label}</p>
                <p className="dash-recent-tx-sub">
                  {tx.category} · {tx.date}
                </p>
              </div>
              <p
                className={`dash-recent-tx-amount tabular-nums${
                  tx.kind === 'income' ? ' is-income' : ' is-expense'
                }`}
              >
                {tx.kind === 'income' ? `+${formatCurrency(tx.amount)}` : formatCurrency(-tx.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
