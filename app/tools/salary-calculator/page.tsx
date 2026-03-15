import type { Metadata } from 'next'
import SalaryCalculator from '@/components/tools/SalaryCalculator'

const canonicalUrl = 'https://klaroph.com/tools/salary-calculator'
const title = 'Salary Calculator Philippines 2026 | Net Pay, Tax, SSS, PhilHealth, Pag-IBIG | KlaroPH'
const description = 'Compute your net salary in the Philippines instantly. Includes tax, SSS, PhilHealth, and Pag-IBIG deductions for employees and freelancers.'

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

export default function SalaryCalculatorPublicPage() {
  return <SalaryCalculator />
}
