import type { Metadata } from 'next'
import ThirteenthMonthCalculator from '@/components/tools/ThirteenthMonthCalculator'

export const metadata: Metadata = {
  title: '13th Month Pay Calculator Philippines | KlaroPH',
  description: 'Free 13th month pay calculator for Filipino workers. Calculate your 13th month from basic monthly salary and months worked. Tax threshold explained.',
}

export default function ThirteenthMonthCalculatorPublicPage() {
  return <ThirteenthMonthCalculator />
}
