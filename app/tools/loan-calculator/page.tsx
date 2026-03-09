import type { Metadata } from 'next'
import LoanCalculator from '@/components/tools/LoanCalculator'

export const metadata: Metadata = {
  title: 'Loan Calculator Philippines | KlaroPH',
  description: 'Free loan calculator for the Philippines. Estimate monthly amortization, total interest, and total payment for personal, housing, and car loans.',
}

export default function LoanCalculatorPublicPage() {
  return <LoanCalculator />
}
