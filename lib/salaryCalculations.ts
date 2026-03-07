/**
 * Philippine salary calculator logic (SSS, PhilHealth, Pag-IBIG, withholding tax).
 * Shared by Salary Calculator page and modal so formulas stay in sync.
 */

/** SSS 2026: MSC brackets, employee share 5% of MSC. */
export function computeSSS(monthly: number): number {
  const msc =
    monthly <= 5000 ? 5000
    : monthly <= 10000 ? 10000
    : monthly <= 15000 ? 15000
    : monthly <= 20000 ? 20000
    : monthly <= 25000 ? 25000
    : monthly <= 30000 ? 30000
    : monthly < 34750 ? 30000
    : 35000
  return msc * 0.05
}

/** PhilHealth 2024-2026: 5% rate, floor ₱10k (₱500 total), ceiling ₱100k (₱5,000 total). Employee share = half. */
export function computePhilHealth(monthly: number): number {
  if (monthly <= 10000) return 250
  if (monthly >= 100000) return 2500
  return (monthly * 0.05) / 2
}

/** Pag-IBIG 2026: ≤₱1,500 → 1% (cap ₱100); above → 2% (cap ₱200). Max comp ₱10,000. */
export function computePagIBIG(monthly: number): number {
  if (monthly <= 1500) return Math.min(monthly * 0.01, 100)
  return Math.min(monthly * 0.02, 200)
}

/** 2026 monthly withholding tax (BIR). */
export function computeMonthlyWithholdingTax(monthlyTaxable: number): number {
  if (monthlyTaxable <= 20833) return 0
  if (monthlyTaxable <= 33333) return (monthlyTaxable - 20833) * 0.15
  if (monthlyTaxable <= 66667) return 1875 + (monthlyTaxable - 33333) * 0.2
  if (monthlyTaxable <= 166667) return 8541.8 + (monthlyTaxable - 66667) * 0.25
  if (monthlyTaxable <= 666667) return 35416.8 + (monthlyTaxable - 166667) * 0.3
  return 203416.8 + (monthlyTaxable - 666667) * 0.35
}

export type SalaryInputs = {
  grossVal: number
  inputMode: 'monthly' | 'annual'
  nonTaxableMonthly: number
}

export type SalaryResult = {
  hasInput: boolean
  monthlyGross: number
  annualGross: number
  nonTaxableMonthly: number
  nonTaxableAnnual: number
  sss: number
  philHealth: number
  pagIBIG: number
  totalContrib: number
  monthlyTax: number
  annualTax: number
  netPayMonthly: number
  netPaySemiMonthly: number
  netPayAnnual: number
}

export function computeSalaryResult({ grossVal, inputMode, nonTaxableMonthly }: SalaryInputs): SalaryResult {
  const monthlyGross = grossVal > 0 ? (inputMode === 'annual' ? grossVal / 12 : grossVal) : 0
  const sss = computeSSS(monthlyGross)
  const philHealth = computePhilHealth(monthlyGross)
  const pagIBIG = computePagIBIG(monthlyGross)
  const totalContrib = sss + philHealth + pagIBIG
  const monthlyTaxable = Math.max(0, monthlyGross - totalContrib)
  const monthlyTax = computeMonthlyWithholdingTax(monthlyTaxable)
  const annualTax = monthlyTax * 12
  const takeHomeFromTaxable = monthlyGross - totalContrib - monthlyTax
  const netPayMonthly = takeHomeFromTaxable + nonTaxableMonthly

  return {
    hasInput: grossVal > 0,
    monthlyGross,
    annualGross: monthlyGross * 12,
    nonTaxableMonthly,
    nonTaxableAnnual: nonTaxableMonthly * 12,
    sss,
    philHealth,
    pagIBIG,
    totalContrib,
    monthlyTax,
    annualTax,
    netPayMonthly,
    netPaySemiMonthly: netPayMonthly / 2,
    netPayAnnual: netPayMonthly * 12,
  }
}
