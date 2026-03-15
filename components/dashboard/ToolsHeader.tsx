'use client'

import Link from 'next/link'

const TOOLS = [
  { id: 'salary', label: 'Salary Calculator', href: '/dashboard/tools/salary', color: 'salary' },
  { id: '13th', label: '13th Month Pay', href: '/dashboard/tools/thirteenth-month', color: '13th' },
  { id: 'loan', label: 'Loan Calculator', href: '/dashboard/tools/loan', color: 'loan' },
] as const

const ICONS: Record<string, React.ReactNode> = {
  salary: (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  '13th': (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  ),
  loan: (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
    </svg>
  ),
}

export default function ToolsHeader() {
  return (
    <div className="tools-header-wrap">
      <p className="tools-header-tagline">Financial Clarity Tools</p>
      <div className="tools-header">
        {TOOLS.map((tool) => (
          <Link key={tool.id} href={tool.href} className={`tool-link-btn tool-link-btn-${tool.color}`}>
            {ICONS[tool.id]}
            {tool.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
