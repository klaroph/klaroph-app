import type { MarketingCampaign } from './index'

/**
 * KlaroPH V2 launch / re-engagement campaign.
 * Copy only — edit freely. Never add balances, transactions, or AI insights here.
 */
export const v2LaunchCampaign: MarketingCampaign = {
  id: 'v2-launch-2026',
  subject: 'KlaroPH V2 is here — your money, made Klaro.',
  previewText:
    "Your account is still here. We've rebuilt the experience around how you earn, plan, spend, and grow.",
  headline: 'Your money, made Klaro.',
  intro: [
    'KlaroPH has grown up.',
    "Your account and financial data are still here — but we've rebuilt the experience to make managing your money clearer, calmer, and more useful.",
  ],
  flow: ['Earn', 'Plan', 'Spend', 'Grow'],
  featuresTitle: "What's new",
  features: [
    {
      title: 'A clearer dashboard',
      body: 'See your money, budget, goals, and financial health in one place.',
    },
    {
      title: 'Better goal management',
      body: 'Allocate money to goals, review your allocations, and make changes without losing track.',
    },
    {
      title: 'Ask Klaro',
      body: 'Ask questions about your finances and get useful answers based on your KlaroPH data.',
    },
    {
      title: 'A more connected experience',
      body: 'Your income, expenses, budget, and goals now work together more naturally.',
    },
    {
      title: 'A better mobile experience',
      body: 'KlaroPH is designed to feel much better on the device you actually use every day.',
    },
  ],
  cta: { label: 'Open KlaroPH →', path: '/dashboard' },
  closing: ["Your money doesn't need to be complicated.", 'It just needs to be Klaro.'],
  signoff: '— The KlaroPH Team',
  postscript:
    "P.S. We didn't just give KlaroPH a new coat of paint. We rebuilt the experience around how you actually manage your money.",
}
