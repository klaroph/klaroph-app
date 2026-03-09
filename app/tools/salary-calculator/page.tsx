import type { Metadata } from 'next'
import SalaryCalculator from '@/components/tools/SalaryCalculator'

export const metadata: Metadata = {
  title: 'Salary Calculator Philippines | KlaroPH',
  description: 'Free Philippine salary calculator. Estimate net pay after SSS, PhilHealth, Pag-IBIG, and withholding tax. For Filipino employees and freelancers.',
}

export default function SalaryCalculatorPublicPage() {
  return <SalaryCalculator />
}
