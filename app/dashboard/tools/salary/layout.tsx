import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Philippine Salary Calculator | KlaroPH',
  description: 'Estimate monthly take-home pay using Philippine tax tables, SSS, PhilHealth, and Pag-IBIG contributions, with official government references and payroll context.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
