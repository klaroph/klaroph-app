import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Financial Health | KlaroPH',
  description: 'Track your assets, liabilities, and net worth. Get a clear snapshot and premium insights on your financial position.',
}

export default function FinancialHealthLayout({ children }: { children: React.ReactNode }) {
  return children
}
