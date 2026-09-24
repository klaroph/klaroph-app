'use client'

import LockIcon from '@/components/ui/LockIcon'
import {
  FILTER_PERIOD_ORDER,
  LOCKED_FILTER_TOOLTIP,
  PERIOD_LABELS,
  PREMIUM_PERIODS,
  type FilterPeriod,
} from '@/lib/transactionPeriod'

type Props = {
  period: FilterPeriod
  isPro: boolean
  onSelect: (period: FilterPeriod) => void
  onLockedClick: () => void
  /** When set, highlight this period instead of `period` (e.g. budget-synced month). */
  activePeriod?: FilterPeriod
}

export default function PeriodFilterPills({
  period,
  isPro,
  onSelect,
  onLockedClick,
  activePeriod,
}: Props) {
  const highlighted = activePeriod ?? period
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {FILTER_PERIOD_ORDER.map((p) => {
        const isLocked = !isPro && PREMIUM_PERIODS.has(p)
        const isActive = highlighted === p
        return (
          <button
            key={p}
            type="button"
            title={isLocked ? LOCKED_FILTER_TOOLTIP : undefined}
            onClick={() => {
              if (isLocked) {
                onLockedClick()
                return
              }
              onSelect(p)
            }}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--border)'}`,
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: isActive ? 'var(--color-blue-muted)' : 'var(--surface)',
              color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
              opacity: isLocked ? 0.85 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            className={isLocked ? 'analytics-filter-locked' : ''}
          >
            {isLocked && <LockIcon size={11} />}
            {PERIOD_LABELS[p]}
          </button>
        )
      })}
    </div>
  )
}
