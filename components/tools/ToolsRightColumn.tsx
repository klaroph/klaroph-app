'use client'

import { usePathname } from 'next/navigation'
import { ToolsPricingFree, ToolsPricingPro } from '@/components/tools/ToolsPricingPanel'
import SalaryCalculatorInfoCard from '@/components/tools/SalaryCalculatorInfoCard'
import LoanCalculatorGuideCard from '@/components/tools/LoanCalculatorGuideCard'
import ThirteenthMonthPayGuideCard from '@/components/tools/ThirteenthMonthPayGuideCard'

/**
 * Renders right-side content for public tools layout.
 * Salary Calculator: single sticky informational card.
 * Other tools: Free + Pro pricing cards.
 */
export default function ToolsRightColumn() {
  const pathname = usePathname() ?? ''
  const isSalaryCalculator = pathname.includes('salary-calculator')
  const isLoanCalculator = pathname.includes('loan-calculator')
  const isThirteenthMonthCalculator = pathname.includes('13th-month-calculator')

  if (isSalaryCalculator) {
    return (
      <div className="tools-right-col tools-right-col-salary">
        <SalaryCalculatorInfoCard />
      </div>
    )
  }

  if (isLoanCalculator) {
    return (
      <div className="tools-right-col tools-right-col-guide">
        <LoanCalculatorGuideCard />
      </div>
    )
  }

  if (isThirteenthMonthCalculator) {
    return (
      <div className="tools-right-col tools-right-col-guide">
        <ThirteenthMonthPayGuideCard />
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
