import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { FREE_PLAN_FEATURES, PRO_PLAN_FEATURES, PRO_PLAN_TOOLS } from '@/lib/planFeatures'
import { renderComplimentaryProEmail, renderPaidProEmail } from '@/lib/email/proEmails'
import { PRO_ONE_TIME_LINE } from '@/lib/planPricing'

/** Price suffixes and the banned words. A following letter keeps paths such as /monthMoneySummary. */
const FORBIDDEN = /\/month(?![A-Za-z])|\/year(?![A-Za-z])|\brenew|\blifetime\b/i

function filesUnder(dir: string): string[] {
  const abs = path.resolve(process.cwd(), dir)
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    if (entry === 'founder' || entry === 'admin' || entry === 'api' || entry === 'node_modules') continue
    const full = path.join(abs, entry)
    if (statSync(full).isDirectory()) {
      out.push(...filesUnder(path.relative(process.cwd(), full)))
      continue
    }
    if (/\.(tsx|ts)$/.test(entry) && !/\.test\.(tsx|ts)$/.test(entry)) out.push(full)
  }
  return out
}

const CUSTOMER_FILES = [
  ...filesUnder('components'),
  ...filesUnder('app'),
  ...filesUnder('lib/email'),
  path.resolve(process.cwd(), 'lib/planFeatures.ts'),
  path.resolve(process.cwd(), 'lib/planPricing.ts'),
]

describe('customer-facing Pro copy', () => {
  it('does not use lifetime, /month, /year, or renew', () => {
    const hits = CUSTOMER_FILES.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const match = source.match(FORBIDDEN)
      return match ? [`${path.relative(process.cwd(), file)}: ${match[0]}`] : []
    })
    expect(hits).toEqual([])
  })

  it('keeps the same ban in rendered Pro emails', () => {
    const paid = renderPaidProEmail({
      firstName: 'Juan',
      planType: 'annual',
      isLifetime: true,
      activeUntil: '2026-10-26T04:00:00.000Z',
      amountPaid: { centavos: 99_900, currency: 'PHP' },
    })
    const dated = renderPaidProEmail({
      firstName: 'Juan',
      planType: 'monthly',
      isLifetime: false,
      activeUntil: '2026-10-26T04:00:00.000Z',
      amountPaid: { centavos: 99_900, currency: 'PHP' },
    })
    const complimentary = renderComplimentaryProEmail({
      firstName: 'Juan',
      validUntil: '2026-12-26T04:00:00.000Z',
    })
    for (const email of [paid, dated, complimentary]) {
      expect(`${email.subject}\n${email.text}\n${email.html}`).not.toMatch(FORBIDDEN)
    }
    expect(paid.text).toContain(PRO_ONE_TIME_LINE)
  })

  it('lists only gated Pro features and keeps CSV export on the free list', () => {
    const labels = PRO_PLAN_FEATURES.map((feature) => feature.label)
    expect(labels).toEqual([
      '20 Active Goals',
      'Financial Health Insights',
      'Monthly Budgeting',
      'Unlimited History & Insights',
      'Unlimited CSV import (Income and Expenses)',
      'Advanced Charts',
      'Ask Klaro (Beta) — 30 messages/day',
      'Klaro Insight — 20 per day',
    ])
    expect(PRO_PLAN_TOOLS).toEqual([])
    expect(FREE_PLAN_FEATURES).toContain('Export CSV (Income and Expenses)')
    expect(labels.join('\n')).not.toContain('Export CSV')
  })

  it('states the one-time Pro terms and the Gemini disclosure', () => {
    const terms = readFileSync(path.resolve(process.cwd(), 'app/terms/page.tsx'), 'utf8').replace(/\s+/g, ' ')
    const privacy = readFileSync(path.resolve(process.cwd(), 'app/privacy/page.tsx'), 'utf8').replace(/\s+/g, ' ')
    expect(terms).toContain(PRO_ONE_TIME_LINE)
    expect(terms).toContain('full refund within 7 days of purchase')
    expect(terms).toContain('Refunds are handled manually')
    expect(terms).toContain('A chargeback removes Pro')
    expect(terms).toContain('at least 45 days ahead by email and with an in-app banner')
    expect(terms).toContain('stays open until the service shuts down')
    expect(terms).toContain('Deleting your account ends Pro')
    expect(privacy).toContain('Google Gemini')
    expect(privacy).toContain('free Gemini tier')
    expect(privacy).toContain('improve its products')
  })
})
