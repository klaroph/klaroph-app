import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Loan Calculator | KlaroPH',
  description: 'Free loan calculator. Estimate monthly amortization, total interest, and total payment for personal, housing, and car loans.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
