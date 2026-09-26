'use client'

import Link from 'next/link'

const TOOLS = [
  {
    href: '/dashboard/tools/salary',
    label: 'Salary Calculator',
    tone: 'sky' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: '/dashboard/tools/loan',
    label: 'Loan Calculator',
    tone: 'coral' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      </svg>
    ),
  },
  {
    href: '/dashboard/tools/thirteenth-month',
    label: '13th Month',
    tone: 'peach' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: '/dashboard/financial-health',
    label: 'Financial Health',
    tone: 'lavender' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
]

export default function DashboardQuickTools() {
  return (
    <section className="dash-quick-tools dash-quick-tools--compact" aria-label="Quick tools">
      <div className="dash-quick-tools-header">
        <h3 className="dash-quick-tools-title">Quick Tools</h3>
        <Link href="/dashboard/tools/salary" className="card-outline-link dash-quick-tools-all">
          View all →
        </Link>
      </div>
      <ul className="dash-quick-tools-list">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link href={tool.href} className={`dash-quick-tools-item dash-quick-tools-item--${tool.tone}`}>
              <span className="dash-quick-tools-icon">{tool.icon}</span>
              <span className="dash-quick-tools-label">{tool.label}</span>
              <span className="dash-quick-tools-chevron" aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
