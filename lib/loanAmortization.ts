/** Standard fixed-rate amortization — shared by the Loan Calculator tools and Ask Klaro. */
export type LoanAmortization = {
  hasInput: boolean
  monthly: number
  totalPayment: number
  totalInterest: number
  principal: number
  months: number
}

export function computeLoanAmortization(
  principal: number,
  annualRatePercent: number,
  termMonths: number
): LoanAmortization {
  const p = principal
  const r = annualRatePercent / 100 / 12
  const n = termMonths
  const hasInput = p > 0 && n > 0
  let monthly = 0
  let totalInterest = 0
  if (hasInput) {
    if (r === 0) {
      monthly = p / n
      totalInterest = 0
    } else {
      monthly = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      totalInterest = monthly * n - p
    }
  }
  return { hasInput, monthly, totalPayment: monthly * n, totalInterest, principal: p, months: n }
}
