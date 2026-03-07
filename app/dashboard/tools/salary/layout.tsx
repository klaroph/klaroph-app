import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Philippine Salary Calculator | KlaroPH',
  description: 'Free Philippine salary calculator. Estimate net pay after SSS, PhilHealth, Pag-IBIG, and withholding tax. For Filipino employees and freelancers.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
