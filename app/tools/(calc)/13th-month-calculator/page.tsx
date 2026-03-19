import type { Metadata } from 'next'
import ThirteenthMonthCalculator from '@/components/tools/ThirteenthMonthCalculator'

const canonicalUrl = 'https://klaroph.com/tools/13th-month-calculator'
const title = '13th Month Pay Calculator Philippines | KlaroPH'
const description = 'Compute 13th month pay instantly using Philippine salary rules and formulas.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title,
    description,
    url: canonicalUrl,
    siteName: 'KlaroPH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function ThirteenthMonthCalculatorPublicPage() {
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Is 13th month pay taxable in the Philippines?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'This calculator flags taxable situations when your estimated 13th month pay exceeds ₱90,000, and it shows the taxable excess portion above that threshold.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do months worked affect the result?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Your estimate is computed as (basic monthly salary × months worked) ÷ 12. Enter fewer months worked to get a proportionally lower estimate.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I use this calculator for my own 13th month pay?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'It estimates using your basic monthly salary and months worked. For variable pay or other special payroll adjustments, treat the result as an estimate and verify with your payslip or HR.',
            },
          },
          {
            '@type': 'Question',
            name: 'Who is entitled to 13th month pay in the Philippines?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Rank-and-file private employees who worked at least one month during the calendar year are generally entitled to receive 13th month pay.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I calculate 13th month pay for partial months?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'The most accurate way is total basic salary earned during the year divided by 12.',
            },
          },
        ],
      },
      {
        '@type': 'WebApplication',
        name: '13th Month Pay Calculator Philippines',
        url: canonicalUrl,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires Javascript',
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }} />
      <ThirteenthMonthCalculator />
    </>
  )
}

