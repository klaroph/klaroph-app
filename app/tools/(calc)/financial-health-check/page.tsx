import type { Metadata } from 'next'
import FinancialHealthCheckPublic from '@/components/tools/FinancialHealthCheckPublic'

const canonicalUrl = 'https://klaroph.com/tools/financial-health-check'
const title = 'Financial Health Check | KlaroPH'
const description = 'Quickly assess your net worth by comparing total assets and liabilities. Free tool for Filipinos.'

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

export default function FinancialHealthCheckPublicPage() {
  return <FinancialHealthCheckPublic />
}

