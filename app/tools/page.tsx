import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import Footer from '@/components/Footer'

const canonicalUrl = 'https://klaroph.com/tools'

export const metadata: Metadata = {
  title: 'Financial Tools Philippines | Salary, Loan, 13th Month Calculator | KlaroPH',
  description:
    'Free financial tools for Filipinos including salary calculator, loan calculator, and 13th month pay calculator designed for everyday financial decisions.',
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: 'Financial Tools Philippines | Salary, Loan, 13th Month Calculator | KlaroPH',
    description:
      'Free financial tools for Filipinos including salary calculator, loan calculator, and 13th month pay calculator designed for everyday financial decisions.',
    url: canonicalUrl,
    siteName: 'KlaroPH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Financial Tools Philippines | Salary, Loan, 13th Month Calculator | KlaroPH',
    description:
      'Free financial tools for Filipinos including salary calculator, loan calculator, and 13th month pay calculator designed for everyday financial decisions.',
  },
}

export default function ToolsHubPage() {
  return (
    <div className="tools-hub-wrap">
      <header className="tools-hub-header">
        <Link href="/" className="tools-hub-logo" aria-label="KlaroPH home">
          <Image
            src="/logo-klaroph-blue.png"
            alt=""
            width={120}
            height={32}
            priority={false}
            style={{ display: 'block', height: 32, width: 'auto' }}
          />
        </Link>
        <Link href="/" className="tools-hub-back">
          ← Back to home
        </Link>
      </header>

      <main className="tools-hub-main">
        <section className="tools-hub-hero">
          <h1 className="tools-hub-title">Financial Tools for Everyday Filipino Money Decisions</h1>
          <p className="tools-hub-subtitle">
            Explore free KlaroPH financial calculators designed for salary planning, loan estimation, payroll understanding, and
            financial clarity in the Philippines.
          </p>
        </section>

        <section className="tools-hub-grid" aria-label="KlaroPH financial tools">
          <Link href="/tools/salary-calculator" className="landing-tool-card">
            <h3>Salary Calculator Philippines</h3>
            <p>Estimate take-home pay using Philippine tax tables, SSS, PhilHealth, and Pag-IBIG deductions.</p>
          </Link>

          <Link href="/tools/loan-calculator" className="landing-tool-card">
            <h3>Loan Calculator Philippines</h3>
            <p>Estimate monthly amortization, total interest, and repayment planning for personal, car, and housing loans.</p>
          </Link>

          <Link href="/tools/13th-month-calculator" className="landing-tool-card">
            <h3>13th Month Pay Calculator Philippines</h3>
            <p>Compute simple or prorated 13th month pay using Philippine labor rules and salary basis.</p>
          </Link>
        </section>

        <section className="tools-hub-seo" aria-label="Why Filipinos use financial calculators">
          <h2 className="tools-hub-seo-title">Why Filipinos Use Financial Calculators</h2>
          <p className="tools-hub-seo-paragraph">
            Financial calculators help workers, employees, and households estimate salary deductions, loan repayments, and payroll
            benefits before making decisions.
          </p>
        </section>

        <section className="tools-hub-cta" aria-label="Create free KlaroPH account">
          <p className="tools-hub-cta-text">Want full financial tracking? Create your free KlaroPH account.</p>
          <Link href="/login" className="tools-hub-cta-link">
            Go to login
          </Link>
        </section>
      </main>

      <Footer variant="default" />
    </div>
  )
}

