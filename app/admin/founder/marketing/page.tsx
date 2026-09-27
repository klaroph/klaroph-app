import { loadFounderSnapshot } from '@/lib/founder/data'
import type { CampaignStatus } from '@/lib/founder/metrics'
import { formatCount, formatDateTime } from '@/lib/founder/format'
import { DockHeader, DockSection, Pill, UnavailableNote } from '@/components/founder/DockUI'
import CampaignActions from '@/components/founder/CampaignActions'
import EmailSamples from '@/components/founder/EmailSamples'

const STATUS: Record<CampaignStatus, { label: string; tone: 'ok' | 'warn' | 'info' }> = {
  draft: { label: 'Draft', tone: 'info' },
  sending: { label: 'Needs review', tone: 'warn' },
  sent: { label: 'Sent', tone: 'ok' },
}

export default async function FounderMarketingPage() {
  const s = await loadFounderSnapshot()
  const { config } = s

  return (
    <>
      <DockHeader
        eyebrow="Marketing"
        title="Campaigns"
        subtitle="Recipients are always recomputed on the server. Each user can receive a campaign once."
      />
      <UnavailableNote sources={s.unavailable} />

      <div className="fd-status-strip">
        <Pill tone={config.sendsEnabled ? 'warn' : 'ok'}>{config.sendsEnabled ? 'Sends enabled' : 'Sends disabled (kill switch off)'}</Pill>
        <Pill tone={config.deliveryConfigured ? 'ok' : 'bad'}>{config.deliveryConfigured ? 'Delivery configured' : 'Delivery not configured'}</Pill>
        <Pill tone={config.testEmailConfigured ? 'ok' : 'warn'}>{config.testEmailConfigured ? 'Test inbox configured' : 'Test inbox missing'}</Pill>
        <Pill tone="unknown">{formatCount(s.userSummary.unsubscribed)} unsubscribed</Pill>
      </div>

      {s.campaigns.map((c) => (
        <DockSection key={c.id} title={c.name} action={<Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>}>
          <div className="fd-card fd-campaign">
            <div className="fd-campaign-copy">
              <p className="fd-campaign-subject">{c.subject}</p>
              <p className="fd-campaign-preview">{c.previewText}</p>
              <p className="fd-campaign-id">
                <code>{c.id}</code>
              </p>
            </div>

            <dl className="fd-kv-grid">
              <div>
                <dt>Accepted by Resend</dt>
                <dd>{formatCount(c.delivery.sent)}</dd>
              </div>
              <div>
                <dt>Pending</dt>
                <dd className={c.delivery.pending ? 'fd-tone-warn' : undefined}>{formatCount(c.delivery.pending)}</dd>
              </div>
              <div>
                <dt>Last sent</dt>
                <dd>{formatDateTime(c.delivery.lastSentAt)}</dd>
              </div>
              <div>
                <dt>Eligible now · All</dt>
                <dd>{formatCount(c.eligible.all)}</dd>
              </div>
              <div>
                <dt>Eligible · Active</dt>
                <dd>{formatCount(c.eligible.active)}</dd>
              </div>
              <div>
                <dt>Eligible · Dormant</dt>
                <dd>{formatCount(c.eligible.dormant)}</dd>
              </div>
            </dl>

            <CampaignActions
              campaignId={c.id}
              campaignName={c.name}
              eligible={c.eligible}
              sendsEnabled={config.sendsEnabled}
              testEmailConfigured={config.testEmailConfigured}
              deliveryConfigured={config.deliveryConfigured}
            />
          </div>
        </DockSection>
      ))}

      <DockSection
        title="Email samples"
        hint="Sends a [TEST] Pro or founder email to the test inbox using sample data. No account, subscription, payment or support request is changed."
      >
        <EmailSamples testEmailConfigured={config.testEmailConfigured} />
      </DockSection>

      <p className="fd-footnote">
        Safeguards: founder-only, kill switch (MARKETING_CAMPAIGN_SENDS_ENABLED), typed campaign confirmation, exact recipient
        count check, unsubscribed and tester accounts excluded, one send per user per campaign, batched delivery.
      </p>
    </>
  )
}
