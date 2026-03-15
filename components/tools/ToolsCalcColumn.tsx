'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TOOL_LINKS = [
  { href: '/tools/salary-calculator', label: 'Salary Calculator' },
  { href: '/tools/loan-calculator', label: 'Loan Calculator' },
  { href: '/tools/13th-month-calculator', label: '13th Month Calculator' },
] as const

export default function ToolsCalcColumn({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const otherTools = TOOL_LINKS.filter(({ href }) => pathname !== href)

  return (
    <div className="tools-calc-column">
      <h2 className="tools-section-title tools-section-title-calc">Free Financial Tool</h2>
      {children}
      <p className="tools-explore-label">Explore other free tools:</p>
      <div className="tools-explore-chips">
        {otherTools.map(({ href, label }) => (
          <Link key={href} href={href} className="tools-explore-chip">
            {label}
          </Link>
        ))}
      </div>
      <div className="tools-cta-block">
        <p className="tools-cta-text">Want to track this automatically every month?</p>
        <div className="tools-cta-buttons">
          <Link href="/#login" className="tools-cta-primary">
            Create Free Account
          </Link>
          <Link href="/#pricing" className="tools-cta-secondary">
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
