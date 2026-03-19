'use client'

import { usePathname } from 'next/navigation'

/**
 * Wraps tools public content so grid can switch to 2 columns on salary calculator.
 */
export default function ToolsPublicContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isTwoColumnGuide =
    pathname.includes('salary-calculator') ||
    pathname.includes('loan-calculator') ||
    pathname.includes('13th-month-calculator')
  return (
    <div
      className={`tools-public-content${isTwoColumnGuide ? ' tools-public-content-salary' : ''}`}
      id="tools-public-content"
    >
      {children}
    </div>
  )
}
