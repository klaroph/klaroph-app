import type { Metadata } from 'next'
import FinancialHealthCheckPublic from '@/components/tools/FinancialHealthCheckPublic'

export const metadata: Metadata = {
  title: 'Financial Health Check | KlaroPH',
  description: 'Free financial health check. Enter your assets and liabilities for a quick assessment. No account required. Built for Filipinos.',
}

export default function FinancialHealthCheckPublicPage() {
  return <FinancialHealthCheckPublic />
}
