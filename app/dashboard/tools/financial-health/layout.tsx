import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Financial Health Check | KlaroPH',
  description: 'Free financial health check. Track assets, liabilities, and net worth. Get a quick assessment of your financial position.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
