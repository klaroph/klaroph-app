import type { Metadata } from 'next'
import SalaryCalculator from '@/components/tools/SalaryCalculator'

const canonicalUrl = 'https://klaroph.com/tools/salary-calculator'
const title = 'Salary Calculator Philippines | Net Pay Estimator | KlaroPH'
const description =
  'Calculate salary deductions, SSS, PhilHealth, Pag-IBIG, and take-home pay in the Philippines.'

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

export default function SalaryCalculatorPublicPage() {
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What does this salary calculator estimate?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'It estimates take-home pay by calculating SSS, PhilHealth, and Pag-IBIG contributions, then estimating withholding tax, and finally adding any non-taxable income you enter.',
            },
          },
          {
            '@type': 'Question',
            name: 'Does it include SSS, PhilHealth, and Pag-IBIG deductions?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Yes. The calculator computes SSS, PhilHealth, and Pag-IBIG based on your gross taxable income inputs, then uses those deductions to produce the net pay estimate.',
            },
          },
          {
            '@type': 'Question',
            name: 'Why might my result differ from my payslip?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Your payslip may include additional adjustments, different exemptions, and payroll rounding. Use this tool as an estimate and compare the main deductions (contributions and withholding tax) with your payslip.',
            },
          },
        ],
      },
      {
        '@type': 'WebApplication',
        name: 'Salary Calculator Philippines',
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
      <SalaryCalculator />
    </>
  )
}

