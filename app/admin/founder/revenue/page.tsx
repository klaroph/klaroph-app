import { loadFounderSnapshot } from '@/lib/founder/data'
import { EXPIRING_SOON_DAYS, REVENUE_WINDOW_DAYS } from '@/lib/founder/metrics'
import { formatCount, formatCountOf, formatDate, formatDateTime, formatPeso } from '@/lib/founder/format'
import { DockHeader, DockSection, Pill, StatCard, UnavailableNote } from '@/components/founder/DockUI'

const RECENT_LIMIT = 10

export default async function FounderRevenuePage() {
  const s = await loadFounderSnapshot()
  const { revenue, userSummary } = s

  return (
    <>
      <DockHeader
        eyebrow="Revenue"
        title={`${formatPeso(revenue.allTime.gross)} collected`}
        subtitle="Live PayMongo payments for KlaroPH Pro from real accounts. Test-mode and tester payments are excluded."
      />
      <UnavailableNote sources={s.unavailable} />

      <DockSection title="Collected">
        <div className="fd-grid fd-grid-4">
          <StatCard
            label={`Last ${REVENUE_WINDOW_DAYS} days`}
            value={formatPeso(revenue.last30.gross)}
            context={`${formatCountOf(revenue.last30.count, 'payment')} · ${formatPeso(revenue.last30.net)} after fees`}
          />
          <StatCard
            label="All time"
            value={formatPeso(revenue.allTime.gross)}
            context={`${formatCountOf(revenue.allTime.count, 'payment')} · ${formatPeso(revenue.allTime.net)} after fees`}
          />
          <StatCard label="PayMongo fees" value={formatPeso(revenue.allTime.fees)} context="All time" />
          <StatCard
            label="Failed payments"
            value={formatCount(revenue.failedLast7)}
            context="Live payment.failed events, last 7 days"
          />
        </div>
      </DockSection>

      <div className="fd-grid fd-grid-2">
        <DockSection title="Pro accounts">
          <div className="fd-card">
            <dl className="fd-kv-list">
              <div>
                <dt>Paid (PayMongo)</dt>
                <dd>{formatCount(userSummary.pro.paid)}</dd>
              </div>
              <div>
                <dt>Lifetime</dt>
                <dd>{formatCount(userSummary.pro.lifetime)}</dd>
              </div>
              <div>
                <dt>Complimentary (manual)</dt>
                <dd>{formatCount(userSummary.pro.complimentary)}</dd>
              </div>
              <div className="fd-kv-total">
                <dt>Total Pro</dt>
                <dd>{formatCount(userSummary.pro.total)}</dd>
              </div>
            </dl>
          </div>
        </DockSection>

        <DockSection title={`Paid Pro ending within ${EXPIRING_SOON_DAYS} days`} hint="QR Ph payments do not renew automatically.">
          <div className="fd-card">
            {s.expiringPro.length === 0 ? (
              <p className="fd-empty">No paid plans ending this week.</p>
            ) : (
              <ul className="fd-simple-list">
                {s.expiringPro.map((u) => (
                  <li key={u.id}>
                    <span>
                      <strong>{u.name ?? 'No name'}</strong> <span className="fd-muted">{u.email}</span>
                    </span>
                    <span className="fd-muted">
                      {u.planType ?? 'Pro'} · ends {formatDate(u.proEndsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DockSection>
      </div>

      <DockSection title="Recent purchases">
        <div className="fd-card fd-table-card">
          {revenue.recent.length === 0 ? (
            <p className="fd-empty">No live purchases yet.</p>
          ) : (
            <table className="fd-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Promo</th>
                </tr>
              </thead>
              <tbody>
                {revenue.recent.slice(0, RECENT_LIMIT).map((p, i) => (
                  <tr key={`${p.at}-${i}`}>
                    <td data-label="Date">{formatDateTime(p.at)}</td>
                    <td data-label="Plan">
                      <Pill tone="info">Pro · {p.planType}</Pill>
                    </td>
                    <td data-label="Amount" className="fd-num">
                      {formatPeso(p.amount)}
                    </td>
                    <td data-label="Promo">{p.promo ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DockSection>

      <DockSection title="Not available yet">
        <div className="fd-card fd-note">
          <p>
            <strong>MRR, ARR, LTV and conversion rates are not shown.</strong> KlaroPH Pro is prepaid through QR Ph and does not
            renew automatically, so there is no recurring-revenue figure the data can support honestly. Collected revenue above is
            exact.
          </p>
        </div>
      </DockSection>
    </>
  )
}
