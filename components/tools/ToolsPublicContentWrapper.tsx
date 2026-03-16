'use client'

import { usePathname } from 'next/navigation'

/**
 * Wraps tools public content so grid can switch to 2 columns on salary calculator.
 */
export default function ToolsPublicContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isSalary = pathname.includes('salary-calculator')
  return (
    <div
      className={`tools-public-content${isSalary ? ' tools-public-content-salary' : ''}`}
      id="tools-public-content"
    >
      {children}
    </div>
  )
}
