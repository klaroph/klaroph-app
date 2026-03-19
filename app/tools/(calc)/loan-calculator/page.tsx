import type { Metadata } from 'next'
import LoanCalculator from '@/components/tools/LoanCalculator'

const canonicalUrl = 'https://klaroph.com/tools/loan-calculator'
const title = 'Loan Calculator Philippines | Monthly Amortization Tool | KlaroPH'
const description =
  'Free loan calculator in the Philippines. Estimate monthly amortization, total interest, and repayment instantly with KlaroPH.'

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

export default function LoanCalculatorPublicPage() {
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How is monthly amortization calculated in the Philippines?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'This calculator uses the standard loan amortization formula based on your principal, annual interest rate, and loan term (months) to estimate your monthly payment and total interest over the loan period.',
            },
          },
          {
            '@type': 'Question',
            name: 'What should I compare besides the interest rate?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Compare both the monthly amortization and the total repayment (principal plus total interest) for the full loan term. A lower rate with a longer term can still cost more overall.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I use this calculator for car, personal, and housing loans?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Yes. Enter the loan amount, interest rate, and term for the loan you’re planning, and this tool will estimate monthly amortization and total interest.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I use this for car loan computation?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Yes. Choose Car Loan in the selector and enter the car loan amount, interest rate, and term to estimate your monthly amortization and total interest. Remember that your down payment and bank fees can affect your real total cost.',
            },
          },
          {
            '@type': 'Question',
            name: 'Why does longer loan term reduce monthly payment?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'Because the principal repayment is spread across more months. While your monthly amortization may drop, the total interest you pay usually increases when the term is longer.',
            },
          },
          {
            '@type': 'Question',
            name: 'Does this include bank fees?',
            acceptedAnswer: {
              '@type': 'Answer',
              text:
                'No. This calculator estimates monthly amortization and total interest based on the loan amount, interest rate, and term. Bank fees, insurance, and other charges may be added by lenders.',
            },
          },
        ],
      },
      {
        '@type': 'WebApplication',
        name: 'Loan Calculator Philippines',
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
      <LoanCalculator />
    </>
  )
}

