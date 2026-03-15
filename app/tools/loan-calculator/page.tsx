import type { Metadata } from 'next'
import LoanCalculator from '@/components/tools/LoanCalculator'

const canonicalUrl = 'https://klaroph.com/tools/loan-calculator'
const title = 'Loan Calculator Philippines 2026 | Monthly Payment & Interest | KlaroPH'
const description = 'Estimate monthly loan payments, total interest, and total payment instantly for personal, housing, and car loans in the Philippines.'

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
}

export default function LoanCalculatorPublicPage() {
  return <LoanCalculator />
}
