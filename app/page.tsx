import type { Metadata } from 'next'
import LandingPageClient from '@/components/landing/LandingPageClient'

const canonicalUrl = 'https://klaroph.com'

export const metadata: Metadata = {
  title: 'KlaroPH | Expense Tracker, Budget Planner, and Financial Tools for Filipinos',
  description:
    'KlaroPH helps Filipinos track expenses, manage budgets, calculate salary, loan amortization, and 13th month pay in one simple financial platform.',
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: 'KlaroPH | Expense Tracker, Budget Planner, and Financial Tools for Filipinos',
    description:
      'KlaroPH helps Filipinos track expenses, manage budgets, calculate salary, loan amortization, and 13th month pay in one simple financial platform.',
    url: canonicalUrl,
    siteName: 'KlaroPH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KlaroPH | Expense Tracker, Budget Planner, and Financial Tools for Filipinos',
    description:
      'KlaroPH helps Filipinos track expenses, manage budgets, calculate salary, loan amortization, and 13th month pay in one simple financial platform.',
  },
}

export default function HomePage() {
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'KlaroPH',
        url: canonicalUrl,
      },
      {
        '@type': 'WebSite',
        name: 'KlaroPH',
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: 'KlaroPH', url: canonicalUrl },
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }}
      />
      <LandingPageClient />
    </>
  )
}

