import { v2LaunchCampaign } from './v2Launch'

export type MarketingCampaign = {
  /** Stable id used for duplicate-send protection and Resend tags. Never reuse for new content. */
  id: string
  subject: string
  previewText: string
  headline: string
  intro: string[]
  flow: string[]
  featuresTitle: string
  features: { title: string; body: string }[]
  /** `path` is appended to the app URL, e.g. '/dashboard'. */
  cta: { label: string; path: string }
  closing: string[]
  signoff: string
  postscript?: string
}

const CAMPAIGNS: readonly MarketingCampaign[] = [v2LaunchCampaign]

export function getMarketingCampaign(id: string): MarketingCampaign | null {
  return CAMPAIGNS.find((c) => c.id === id) ?? null
}
