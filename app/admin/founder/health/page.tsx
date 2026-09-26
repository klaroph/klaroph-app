import { loadFounderSnapshot } from '@/lib/founder/data'
import { authSyncHealth, configuredHealth, databaseHealth, type HealthSignal } from '@/lib/founder/metrics'
import { formatCount, formatDateTime, formatRelative } from '@/lib/founder/format'
import { DockHeader, DockSection, SignalList } from '@/components/founder/DockUI'

export default async function FounderHealthPage() {
  const s = await loadFounderSnapshot()
  const now = new Date(s.now)
  const { config, revenue, ai } = s
  const lastCampaign = s.campaigns.find((c) => c.delivery.lastSentAt)

  const sections: { title: string; hint: string; signals: HealthSignal[] }[] = [
    {
      title: 'Application',
      hint: 'What this server knows about its own deployment.',
      signals: [
        s.deployment.environment
          ? { label: 'Environment', value: s.deployment.environment, tone: s.deployment.environment === 'production' ? 'ok' : 'unknown' }
          : { label: 'Environment', value: 'Not running on Vercel', tone: 'unknown' },
        s.deployment.commit
          ? { label: 'Deployed commit', value: `${s.deployment.commit}${s.deployment.message ? ` · ${s.deployment.message}` : ''}`, tone: 'ok' }
          : { label: 'Deployed commit', value: 'Not available on this server', tone: 'unknown' },
        { label: 'Founder access', value: 'Verified founder session', tone: 'ok' },
      ],
    },
    {
      title: 'Database',
      hint: 'A live query against Supabase from this request.',
      signals: [
        databaseHealth(s.database),
        authSyncHealth(s.authWithoutProfile),
        s.unavailable.length === 0
          ? { label: 'Founder data sources', value: 'All loaded', tone: 'ok' }
          : { label: 'Founder data sources', value: `Failed: ${s.unavailable.join(', ')}`, tone: 'bad' },
      ],
    },
    {
      title: 'Payments',
      hint: 'Based on PayMongo webhooks KlaroPH has received.',
      signals: [
        configuredHealth('PayMongo API key', config.paymongoConfigured),
        configuredHealth('Webhook secret', config.paymongoWebhookConfigured),
        revenue.lastWebhookAt
          ? { label: 'Last webhook received', value: `${formatRelative(revenue.lastWebhookAt, now)} · ${formatDateTime(revenue.lastWebhookAt)}`, tone: 'ok' }
          : { label: 'Last webhook received', value: 'None yet', tone: 'unknown' },
        { label: 'Failed payments · 7 days', value: formatCount(revenue.failedLast7), tone: revenue.failedLast7 ? 'warn' : 'ok' },
      ],
    },
    {
      title: 'Ask Klaro',
      hint: 'Usage counters from klaro_ai_usage (UTC day). No conversations or prompts are read.',
      signals: [
        configuredHealth('Gemini API key', config.aiConfigured),
        {
          label: 'Requests today',
          value: `${formatCount(ai.requestsToday)} (chat ${formatCount(ai.byFeature.chat ?? 0)} · insight ${formatCount(ai.byFeature.insight ?? 0)})`,
          tone: 'ok',
        },
        { label: 'Free vs Pro', value: `${formatCount(ai.freeRequests)} free · ${formatCount(ai.proRequests)} Pro`, tone: 'ok' },
        { label: 'Users at daily limit', value: `${formatCount(ai.usersAtLimit)} of ${formatCount(ai.usersToday)} today`, tone: 'ok' },
        { label: 'AI errors', value: 'Not tracked in KlaroPH — see Vercel logs', tone: 'unknown' },
      ],
    },
    {
      title: 'Email',
      hint: 'KlaroPH-side delivery state. Opens and bounces live in Resend.',
      signals: [
        configuredHealth('Marketing delivery', config.deliveryConfigured),
        config.sendsEnabled
          ? { label: 'Campaign kill switch', value: 'Sends enabled', tone: 'warn' }
          : { label: 'Campaign kill switch', value: 'Sends disabled', tone: 'ok' },
        lastCampaign
          ? {
              label: 'Last campaign',
              value: `${lastCampaign.name} · ${formatCount(lastCampaign.delivery.sent)} accepted · ${formatCount(lastCampaign.delivery.pending)} pending`,
              tone: lastCampaign.delivery.pending ? 'warn' : 'ok',
            }
          : { label: 'Last campaign', value: 'None sent yet', tone: 'unknown' },
        { label: 'Unsubscribed users', value: formatCount(s.userSummary.unsubscribed), tone: 'ok' },
        { label: 'Opens, bounces, complaints', value: 'Not tracked in KlaroPH — see Resend', tone: 'unknown' },
      ],
    },
  ]

  return (
    <>
      <DockHeader eyebrow="Product health" title="System status" subtitle="Only signals KlaroPH can verify itself. Nothing here pretends to be infrastructure monitoring." />
      <div className="fd-grid fd-grid-2 fd-health-grid">
        {sections.map((section) => (
          <DockSection key={section.title} title={section.title} hint={section.hint}>
            <div className="fd-card">
              <SignalList signals={section.signals} />
            </div>
          </DockSection>
        ))}
      </div>
    </>
  )
}
