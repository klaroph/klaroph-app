/**
 * Payday summary copy and ledger math.
 * Amounts choose the top category, then they are dropped.
 * Nothing rendered here may contain a peso amount, a percentage, or an amount digit sequence.
 */

import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { manilaDateInRange, type ManilaHalfMonthWindow } from '@/lib/email/manilaHalfMonth'
import type { CampaignLinkConfig } from '@/lib/email/campaignSender'
import { renderOperationalEmail } from '@/lib/email/transactionalLayout'
import type { CampaignMessage } from '@/lib/email/resend'
import {
  buildOneClickUnsubscribeUrl,
  buildUnsubscribePageUrl,
  createUnsubscribeToken,
} from '@/lib/email/unsubscribeToken'

export const PAYDAY_SUMMARY_SUBJECT = 'Your payday summary from KlaroPH'
export const PAYDAY_SUMMARY_PREVIEW = 'A short recap of what you logged this pay period.'
export const PAYDAY_SUMMARY_CTA = 'See your payday summary in KlaroPH'

const INTRO = 'Here is a quick look at this pay period.'
const FOOTER_REASON = "You're receiving this because you have a KlaroPH account."
const DEFAULT_EXPENSE_CATEGORIES = new Set(EXPENSE_CATEGORIES.map((category) => category.value))

/** Safe to render. No amounts. */
export type PaydaySummaryFacts = {
  /** Distinct YYYY-MM-DD values with an income or expense row in the window. */
  loggedDays: number
  windowDays: number
  topCategory: string | null
}

export type LedgerEntry = {
  userId: string
  date: string
  kind: 'income' | 'expense'
  category?: string | null
  amount?: number | string | null
}

export type PaydaySummaryLinks = { dashboardUrl: string; unsubscribeUrl: string }

export type RenderedPaydaySummary = { subject: string; previewText: string; html: string; text: string }

export function paydayDashboardUrl(appUrl: string): string {
  return `${appUrl}/dashboard`
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toCentavos(amount: number): number {
  return Math.round(amount * 100)
}

export function loggedDaysLine(loggedDays: number, windowDays: number): string {
  const unit = windowDays === 1 ? 'day' : 'days'
  return `You logged on ${loggedDays} of ${windowDays} ${unit}.`
}

function categoryLine(category: string): string {
  return `Your top spending category was ${category}.`
}

function topCategory(expenses: readonly { category: string | null; amount: number }[]): string | null {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    const name = expense.category?.trim()
    if (!name) continue
    totals.set(name, (totals.get(name) ?? 0) + toCentavos(expense.amount))
  }
  let top: string | null = null
  let topValue: number | null = null
  for (const [name, value] of totals) {
    const earlier = top !== null && value === topValue && name.localeCompare(top, 'en') < 0
    if (topValue === null || value > topValue || earlier) {
      top = name
      topValue = value
    }
  }
  return top && DEFAULT_EXPENSE_CATEGORIES.has(top) ? top : null
}

/**
 * Distinct logged dates in the covered half-month, across income and expenses.
 * Returns null when that set is empty.
 */
export function summarizePayday(
  entries: readonly LedgerEntry[],
  userId: string,
  window: ManilaHalfMonthWindow,
): PaydaySummaryFacts | null {
  const dates = new Set<string>()
  const expenses: { category: string | null; amount: number }[] = []

  for (const entry of entries) {
    if (entry.userId !== userId || !manilaDateInRange(entry.date, window.covered)) continue
    switch (entry.kind) {
      case 'income':
        dates.add(entry.date)
        break
      case 'expense':
        dates.add(entry.date)
        expenses.push({ category: entry.category ?? null, amount: toNumber(entry.amount) })
        break
      default: {
        const exhaustive: never = entry.kind
        throw new Error(exhaustive)
      }
    }
  }

  if (dates.size === 0) return null
  return { loggedDays: dates.size, windowDays: window.dayCount, topCategory: topCategory(expenses) }
}

export function partitionPaydayActivity<T extends { userId: string }>(
  recipients: readonly T[],
  entries: readonly LedgerEntry[],
  window: ManilaHalfMonthWindow,
): { skippedNoActivity: T[]; wouldSend: { recipient: T; facts: PaydaySummaryFacts }[] } {
  const skippedNoActivity: T[] = []
  const wouldSend: { recipient: T; facts: PaydaySummaryFacts }[] = []
  for (const recipient of recipients) {
    const facts = summarizePayday(entries, recipient.userId, window)
    if (!facts) skippedNoActivity.push(recipient)
    else wouldSend.push({ recipient, facts })
  }
  return { skippedNoActivity, wouldSend }
}

function greeting(name: string | null): string {
  return name ? `Hi ${name},` : 'Hi there,'
}

export function renderPaydaySummaryEmail(input: {
  facts: PaydaySummaryFacts
  greetingName: string | null
  links: PaydaySummaryLinks
}): RenderedPaydaySummary {
  const paragraphs = [greeting(input.greetingName), INTRO, loggedDaysLine(input.facts.loggedDays, input.facts.windowDays)]
  const category = input.facts.topCategory?.trim()
  if (category && DEFAULT_EXPENSE_CATEGORIES.has(category)) paragraphs.push(categoryLine(category))

  const { html, text } = renderOperationalEmail({
    preheader: PAYDAY_SUMMARY_PREVIEW,
    label: 'Payday summary',
    headline: PAYDAY_SUMMARY_SUBJECT,
    tone: 'neutral',
    intro: paragraphs,
    sections: [],
    cta: { label: PAYDAY_SUMMARY_CTA, url: input.links.dashboardUrl },
    footerReason: FOOTER_REASON,
    unsubscribeUrl: input.links.unsubscribeUrl,
  })

  return { subject: PAYDAY_SUMMARY_SUBJECT, previewText: PAYDAY_SUMMARY_PREVIEW, html, text }
}

export function buildPaydaySummaryMessage(
  facts: PaydaySummaryFacts,
  recipient: { userId: string; email: string; greetingName: string | null },
  links: CampaignLinkConfig,
  campaignId: string,
): CampaignMessage {
  const token = createUnsubscribeToken(recipient.userId, links.unsubscribeSecret)
  const rendered = renderPaydaySummaryEmail({
    facts,
    greetingName: recipient.greetingName,
    links: {
      dashboardUrl: paydayDashboardUrl(links.appUrl),
      unsubscribeUrl: buildUnsubscribePageUrl(links.appUrl, token),
    },
  })
  return {
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      'List-Unsubscribe': `<${buildOneClickUnsubscribeUrl(links.appUrl, token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'category', value: 'marketing' },
      { name: 'campaign', value: campaignId },
    ],
  }
}
