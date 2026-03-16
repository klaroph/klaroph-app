'use client'

import { usePathname } from 'next/navigation'
import { ToolsPricingFree, ToolsPricingPro } from '@/components/tools/ToolsPricingPanel'
import SalaryCalculatorInfoCard from '@/components/tools/SalaryCalculatorInfoCard'

/**
 * Renders right-side content for public tools layout.
 * Salary Calculator: single sticky informational card.
 * Other tools: Free + Pro pricing cards.
 */
export default function ToolsRightColumn() {
  const pathname = usePathname() ?? ''
  const isSalaryCalculator = pathname.includes('salary-calculator')

  if (isSalaryCalculator) {
    return (
      <div className="tools-right-col tools-right-col-salary">
        <SalaryCalculatorInfoCard />
      </div>
    )
  }

  return (
    <>
      <ToolsPricingFree />
      <ToolsPricingPro />
    </>
  )
}
