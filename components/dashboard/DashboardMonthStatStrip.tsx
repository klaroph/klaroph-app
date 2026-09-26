import { Fragment } from 'react'
import { formatCurrency } from '@/lib/format'

/** Line breaks may only fall after a thousands separator, never inside a digit group. */
function StatAmount({ value }: { value: number }) {
  return formatCurrency(value)
    .split(',')
    .map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <>,<wbr /></>}
        {part}
      </Fragment>
    ))
}

type DashboardMonthStatStripProps = {
  income: number
  expenses: number
  loading: boolean
  goalsCount: number
  goalsOnTrack: number
  goalsProgressPct: number
}

export default function DashboardMonthStatStrip({
  income,
  expenses,
  loading,
  goalsCount,
  goalsOnTrack,
  goalsProgressPct,
}: DashboardMonthStatStripProps) {
  const netFlow = income - expenses
  const pct = Math.min(100, Math.max(0, goalsProgressPct))

  return (
    <section
      className="dash-stat-strip"
      aria-label="Financial snapshot"
      aria-busy={loading}
    >
      <article className="dash-stat-card klaro-tint dash-stat-card--income">
        <div className="dash-stat-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div className="dash-stat-body">
          <p className="dash-stat-label">Total Income</p>
          <p className="dash-stat-value tabular-nums"><StatAmount value={income} /></p>
        </div>
      </article>

      <article className="dash-stat-card klaro-tint dash-stat-card--expense">
        <div className="dash-stat-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
        </div>
        <div className="dash-stat-body">
          <p className="dash-stat-label">Total Expenses</p>
          <p className="dash-stat-value tabular-nums"><StatAmount value={expenses} /></p>
        </div>
      </article>

      <article className="dash-stat-card klaro-tint dash-stat-card--net">
        <div className="dash-stat-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 3 3 5-6" />
          </svg>
        </div>
        <div className="dash-stat-body">
          <p className="dash-stat-label">Net Flow</p>
          <p className={`dash-stat-value tabular-nums${netFlow < 0 ? ' dash-stat-value--neg' : netFlow > 0 ? ' dash-stat-value--pos' : ''}`}>
            <StatAmount value={netFlow} />
          </p>
        </div>
      </article>

      <article className="dash-stat-card klaro-tint dash-stat-card--goals">
        <div className="dash-stat-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" x2="4" y1="22" y2="15" />
          </svg>
        </div>
        <div className="dash-stat-body">
          <p className="dash-stat-label">Active Goals</p>
          <p className="dash-stat-value">
            {goalsCount === 0
              ? 'None yet'
              : `${goalsOnTrack} / ${goalsCount} on track`}
          </p>
          {/* Track always occupies its row so the strip height does not change when goals load. */}
          {goalsCount > 0 ? (
            <div className="dash-stat-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Overall goals progress">
              <div className="dash-stat-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <div className="dash-stat-progress invisible" aria-hidden />
          )}
        </div>
      </article>
    </section>
  )
}
