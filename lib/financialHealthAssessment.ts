/**
 * Shared assessment logic for Financial Health Check.
 * Used by dashboard tool and public /tools/financial-health-check.
 */
export function getAssessmentText(
  assetsSum: number,
  liabilitiesSum: number,
  netWorth: number
): string {
  if (assetsSum === 0 && liabilitiesSum === 0) {
    return "You haven't entered assets or liabilities yet. Add your numbers above to get a clear read on your financial health."
  }
  const ratio = liabilitiesSum > 0 ? assetsSum / liabilitiesSum : 2
  if (netWorth < 0) {
    return "Your liabilities currently exceed your assets. Focus on paying down high-interest debt first and building a small emergency fund. You're taking the right step by tracking — clarity is the first step to change."
  }
  if (netWorth === 0) {
    return "Your assets and liabilities are balanced. Next step: build a buffer. Even a small emergency fund (e.g. 1–2 months of expenses) will improve your financial resilience."
  }
  if (ratio < 1.5 && netWorth > 0) {
    return "You have positive net worth — good. Consider reducing liabilities or growing assets so your ratio improves. Aim for at least 3–6 months of expenses in liquid assets as an emergency fund."
  }
  if (netWorth > 0 && ratio >= 1.5) {
    return "Your financial position looks solid: positive net worth and a healthy assets-to-liabilities ratio. Keep building your emergency fund and goals. Review this snapshot regularly to stay on track."
  }
  return "You're building clarity. Keep updating your assets and liabilities so you can see progress over time. Small steps add up."
}
