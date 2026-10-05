'use client'

import { useCallback, useEffect, useState } from 'react'
import IncomeAllocationModal, { type IncomeRecordForEdit } from './IncomeAllocationModal'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import { formatWholePeso } from '@/lib/format'
import { suggestedSavingsAllocation } from '@/lib/suggestedSavingsAllocation'
import {
  dispatchDashboardGoalsRefresh,
  dispatchDashboardTransactionsRefresh,
} from '@/lib/dashboardRefresh'

const DISMISS_KEY = 'klaroph-first-income-allocate-dismissed'

type CardModel = {
  income: IncomeRecordForEdit
  total: number
  suggested: number | null
  savingsPercent: number | null
}

/**
 * One-shot Home prompt for the single unallocated income created at onboarding.
 * Opens the existing edit-income modal only after the user taps Allocate.
 */
export default function FirstIncomeAllocateCard({ refreshTrigger }: { refreshTrigger: number }) {
  const [card, setCard] = useState<CardModel | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await getBrowserUser()
    if (!user) {
      setCard(null)
      return
    }

    const { data: incomes, error } = await supabase
      .from('income_records')
      .select('id, total_amount, date, income_source')
      .eq('user_id', user.id)
      .order('date', { ascending: true })
      .limit(2)

    if (error || !incomes || incomes.length !== 1) {
      setCard(null)
      return
    }

    const row = incomes[0] as {
      id: string
      total_amount: number
      date: string
      income_source: string | null
    }

    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === row.id
    } catch {
      dismissed = false
    }
    if (dismissed) {
      setCard(null)
      return
    }

    const { count, error: allocError } = await supabase
      .from('income_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('income_record_id', row.id)

    if (allocError || (count ?? 0) > 0) {
      setCard(null)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('savings_percent')
      .eq('id', user.id)
      .maybeSingle()

    const rawPercent = (profile as { savings_percent?: unknown } | null)?.savings_percent
    const savingsPercent = typeof rawPercent === 'number' && Number.isFinite(rawPercent) ? rawPercent : null
    const total = Number(row.total_amount)
    const suggested = suggestedSavingsAllocation(total, savingsPercent)

    setCard((prev) => {
      if (
        prev &&
        prev.income.id === row.id &&
        prev.income.total_amount === total &&
        prev.income.date === row.date &&
        prev.income.income_source === row.income_source &&
        prev.suggested === suggested &&
        prev.savingsPercent === savingsPercent
      ) {
        return prev
      }
      return {
        income: {
          id: row.id,
          total_amount: total,
          date: row.date,
          income_source: row.income_source,
        },
        total,
        suggested,
        savingsPercent,
      }
    })
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  if (!card) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, card.income.id)
    } catch {
      /* private mode */
    }
    setOpen(false)
    setCard(null)
  }

  const percentLabel =
    card.savingsPercent != null && card.savingsPercent > 0
      ? ` We'll suggest ${card.savingsPercent}% — you can change or skip it.`
      : ' You can change the amount or skip it.'

  return (
    <section className="first-income-allocate w-full max-lg:order-1" aria-label="Allocate your first income">
      <h3>Your first income is saved</h3>
      <p>
        {formatWholePeso(card.total)} is recorded. Nothing moves to your goal until you allocate it.
        {percentLabel}
      </p>
      <div className="first-income-allocate-actions">
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          Allocate
        </button>
        <button type="button" className="btn-secondary" onClick={dismiss}>
          Not now
        </button>
      </div>
      <IncomeAllocationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          dispatchDashboardTransactionsRefresh()
          dispatchDashboardGoalsRefresh()
          void load()
        }}
        initialRecord={card.income}
        suggestedAllocateAmount={card.suggested}
      />
    </section>
  )
}
