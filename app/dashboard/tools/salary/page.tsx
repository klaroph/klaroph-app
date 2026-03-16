'use client'

import SalaryCalculator from '@/components/tools/SalaryCalculator'
import SalaryCalculatorInfoCard from '@/components/tools/SalaryCalculatorInfoCard'

export default function SalaryCalculatorPage() {
  return (
    <div className="salary-tool-layout">
      <div className="salary-tool-calc-col">
        <SalaryCalculator />
      </div>
      <div className="salary-tool-guide-col">
        <SalaryCalculatorInfoCard />
      </div>
    </div>
  )
}
