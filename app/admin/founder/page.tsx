import Link from 'next/link'
import { loadFounderSnapshot } from '@/lib/founder/data'
import { configuredHealth, databaseHealth, type HealthSignal } from '@/lib/founder/metrics'
import { formatCount, formatCountOf, formatLongDate, formatPeso, formatRelative, founderGreeting } from '@/lib/founder/format'
import { AttentionList, DockHeader, DockSection, SignalList, StatCard, UnavailableNote } from '@/components/founder/DockUI'

const ACTIVITY_ICONS = { signup: '＋', purchase: '₱', campaign: '✉' } as const

export default async function FounderOverviewPage() {
  const s = await loadFounderSnapshot()
  const now = new Date(s.now)
  const { userSummary: users, revenue } = s
  const activePct = users.total ? Math.round((users.active / users.total) * 100) : 0
  const lastCampaign = s.campaigns.find((c) => c.delivery.lastSentAt)

  const health: HealthSignal[] = [
    databaseHealth(s.database),
    revenue.lastWebhookAt
      ? { label: 'Payments', value: `Last PayMongo event ${formatRelative(revenue.lastWebhookAt, now)}`, tone: s.config.paymongoWebhookConfigured ? 'ok' : 'bad' }
      : configuredHealth('Payments', s.config.paymongoWebhookConfigured, 'Webhook secret missing'),
    s.config.aiConfigured
      ? { label: 'Ask Klaro', value: `${formatCountOf(s.ai.requestsToday, 'request')} today`, tone: 'ok' }
      : configuredHealth('Ask Klaro', false),
    lastCampaign
      ? { label: 'Email', value: `Last campaign: ${lastCampaign.delivery.sent} accepted`, tone: lastCampaign.delivery.pending ? 'warn' : 'ok' }
      : configuredHealth('Email', s.config.deliveryConfigured),
  ]

  const attentionSummary =
    s.attention.length === 0 ? 'All clear' : `${s.attention.length} item${s.attention.length === 1 ? '' : 's'} need${s.attention.length === 1 ? 's' : ''} attention`

  return (
    <>
      <DockHeader
        eyebrow="KlaroPH Mission Control"
        title={`${founderGreeting(now)}, Founder.`}
        subtitle={
          <>
            {formatLongDate(now)} · <strong>{attentionSummary}</strong>
          </>
        }
      />
      <UnavailableNote sources={s.unavailable} />

      <DockSection title="Attention" hint="Only things that need a decision from you.">
        <AttentionList items={s.attention} />
      </DockSection>

      <DockSection title="Key numbers" hint="Real customers only — tester accounts are excluded.">
        <div className="fd-grid fd-grid-4">
          <StatCard
            label="Users"
            value={formatCount(users.total)}
            context={users.newThisWeek ? `+${users.newThisWeek} this week` : 'No new signups this week'}
          />
          <StatCard
            label="Active"
            value={formatCount(users.active)}
            context={`${activePct}% signed in within 30 days${s.activity ? ` · ${s.activity.wau} logged activity this week` : ''}`}
          />
          <StatCard
            label="Pro"
            value={formatCount(users.pro.total)}
            context={`${users.pro.paid} paid · ${users.pro.lifetime} lifetime · ${users.pro.complimentary} complimentary`}
          />
          <StatCard
            label="Revenue · 30 days"
            value={formatPeso(revenue.last30.gross)}
            context={`${formatPeso(revenue.allTime.gross)} collected all time`}
          />
        </div>
      </DockSection>

      <div className="fd-grid fd-grid-2">
        <DockSection
          title="Product health"
          action={
            <Link href="/admin/founder/health" className="fd-link">
              Details →
            </Link>
          }
        >
          <div className="fd-card">
            <SignalList signals={health} />
          </div>
        </DockSection>

        <DockSection title="Recent activity">
          <div className="fd-card">
            {s.recentActivity.length === 0 ? (
              <p className="fd-empty">No recent activity.</p>
            ) : (
              <ul className="fd-activity">
                {s.recentActivity.map((e, i) => (
                  <li key={`${e.kind}-${e.at}-${i}`} className={`fd-activity-item fd-activity-${e.kind}`}>
                    <span className="fd-activity-icon" aria-hidden>
                      {ACTIVITY_ICONS[e.kind]}
                    </span>
                    <span className="fd-activity-text">{e.text}</span>
                    <span className="fd-activity-time">{formatRelative(e.at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DockSection>
      </div>
    </>
  )
}
