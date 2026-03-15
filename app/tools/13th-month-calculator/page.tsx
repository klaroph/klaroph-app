import type { Metadata } from 'next'
import ThirteenthMonthCalculator from '@/components/tools/ThirteenthMonthCalculator'

const canonicalUrl = 'https://klaroph.com/tools/13th-month-calculator'
const title = '13th Month Pay Calculator Philippines 2026 | KlaroPH'
const description = 'Calculate your 13th month pay instantly using monthly salary and months worked. Free calculator for Filipino workers.'

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

export default function ThirteenthMonthCalculatorPublicPage() {
  return <ThirteenthMonthCalculator />
}
