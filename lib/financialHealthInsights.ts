/**
 * Deterministic financial health insight engine (no AI).
 * Uses weighted liquidity and liability-to-liquid % for advisory bands.
 * Subtype-aware: only mention real estate / investments / MP2 when present.
 */

export type InsightResult = { headline: string; paragraph: string }

const LIQUIDITY_WEIGHTS: Record<string, number> = {
  cash_on_hand: 1,
  bank_account: 1,
  mp2_savings: 0.65,
  investment: 0.6,
  real_estate: 0.15,
  custom: 0.3,
}

export function getWeightedLiquidAssets(
  assets: Array<{ subtype: string; amount: number }>
): number {
  return assets.reduce((sum, a) => {
    const w = LIQUIDITY_WEIGHTS[a.subtype] ?? 0.3
    return sum + Number(a.amount) * w
  }, 0)
}

/**
 * Primary advisory metric: liabilities as % of weighted liquid assets.
 * Rounded for display. When no liquid assets but liabilities exist, treated as 100+.
 */
export function getLiabilityToLiquidPct(
  liabilitiesSum: number,
  weightedLiquidAssets: number
): number {
  if (weightedLiquidAssets <= 0) return liabilitiesSum > 0 ? 100 : 0
  return Math.round((liabilitiesSum / weightedLiquidAssets) * 100)
}

/** Unique asset subtypes present (for subtype-aware wording). Do not mention real_estate / investment / mp2_savings unless present. */
export type SubtypeContext = {
  hasRealEstate: boolean
  hasInvestment: boolean
  hasMp2: boolean
}

export function getAssetSubtypeContext(assets: Array<{ subtype: string }>): SubtypeContext {
  const subs = new Set(assets.map((a) => a.subtype))
  return {
    hasRealEstate: subs.has('real_estate'),
    hasInvestment: subs.has('investment'),
    hasMp2: subs.has('mp2_savings'),
  }
}

/** Subtypes that represent concentration risk when dominant (not fully liquid). */
const CONCENTRATION_SUBTYPES = new Set(['real_estate', 'investment', 'mp2_savings', 'custom'])

/** Subtypes that are fully liquid; only when dominant do we show exact liability-to-liquid %. */
const DOMINANT_LIQUID_SUBTYPES = new Set(['bank_account', 'cash_on_hand'])

/** Subtype of the single largest asset by amount, or null if no assets. */
function getDominantAssetSubtype(assets: Array<{ subtype: string; amount: number }>): string | null {
  if (!assets.length) return null
  const largest = assets.reduce((best, a) =>
    Number(a.amount) > best.amount ? { subtype: a.subtype, amount: Number(a.amount) } : best
  , { subtype: '', amount: 0 })
  return largest.subtype || null
}

/** True only when dominant asset is bank_account or cash_on_hand; then exact % is meaningful. */
function isDominantLiquid(assets: Array<{ subtype: string; amount: number }> | undefined): boolean {
  if (!assets?.length) return false
  const sub = getDominantAssetSubtype(assets)
  return sub !== null && DOMINANT_LIQUID_SUBTYPES.has(sub)
}

/**
 * True only if (1) largest asset > 70% of total assets AND (2) that asset's subtype is
 * real_estate, investment, mp2_savings, or custom. Do not trigger for bank_account or cash_on_hand.
 */
export function hasAssetConcentration(
  assets: Array<{ subtype: string; amount: number }>,
  assetsSum: number
): boolean {
  if (!assets.length || assetsSum <= 0) return false
  const largest = assets.reduce((best, a) => {
    const amt = Number(a.amount)
    return amt > best.amount ? { subtype: a.subtype, amount: amt } : best
  }, { subtype: '', amount: 0 })
  if (largest.amount / assetsSum <= 0.7) return false
  return CONCENTRATION_SUBTYPES.has(largest.subtype)
}

const CONCENTRATION_APPENDIX =
  ' A large share of your current financial strength is concentrated in one long-term asset. While this improves net worth, relying heavily on one asset class can limit flexibility if short-term liquidity is needed.'

export function getFinancialHealthInsight(
  assetsSum: number,
  liabilitiesSum: number,
  netWorth: number,
  weightedLiquidAssets: number,
  assets?: Array<{ subtype: string; amount: number }>
): InsightResult {
  const hasData = assetsSum > 0 || liabilitiesSum > 0
  if (!hasData) {
    return {
      headline: 'Add Your Numbers to Get Started',
      paragraph:
        "You haven't entered any assets or liabilities yet. Once you add your accounts and balances, we can give you a clear read on your net worth, liquidity, and debt pressure. Tracking is the first step toward better financial decisions.",
    }
  }

  const liabilityToLiquidPct = getLiabilityToLiquidPct(liabilitiesSum, weightedLiquidAssets)
  const ctx = assets ? getAssetSubtypeContext(assets) : null
  const concentration = assets && hasAssetConcentration(assets, assetsSum)
  const liquidShareOfWealth = assetsSum > 0 ? weightedLiquidAssets / assetsSum : 1
  const realEstateWithModestLiquid = ctx?.hasRealEstate && liquidShareOfWealth < 0.5
  const dominantLiquid = isDominantLiquid(assets)
  const dominantIlliquid = assets?.length && !dominantLiquid && CONCENTRATION_SUBTYPES.has(getDominantAssetSubtype(assets) ?? '')

  const appendConcentration = (p: string) =>
    concentration ? p + CONCENTRATION_APPENDIX : p

  // Negative net worth
  if (netWorth < 0) {
    return {
      headline: 'Liabilities Exceed Assets',
      paragraph:
        "Your current position shows that your total liabilities exceed your total assets, so your net worth is negative. That means debt and obligations are greater than what you own. Focusing on paying down high-interest debt first—such as credit card balances—then building a small emergency fund from future cash inflows will put you on stronger footing. Even partial repayment frees up breathing room and reduces pressure. Clarity is the first step; you're already taking it by tracking.",
    }
  }

  // Zero net worth
  if (netWorth === 0) {
    return {
      headline: 'Assets and Liabilities Are Balanced',
      paragraph: appendConcentration(
        "Your assets and liabilities are in balance, so your net worth is zero. The next step is to build a buffer. Even a small emergency fund (for example one to two months of expenses) in liquid assets will improve your resilience. Allocating a portion of future income to savings and reducing high-cost debt will move you into positive net worth and give more flexibility."
      ),
    }
  }

  // High priority: positive net worth but liquidity pressure >= 90%
  if (liabilityToLiquidPct >= 90) {
    const headline = 'Liquidity Is Tight Despite Positive Net Worth'
    // Real estate + debt: use narrative wording (no exact %), subtype-accurate
    if (ctx?.hasRealEstate && dominantIlliquid) {
      return {
        headline,
        paragraph: appendConcentration(
          "Your net worth remains positive because real estate contributes significant asset value, but most of that strength is tied to a long-term asset rather than immediately accessible funds. Current liabilities are far greater than your short-term financial buffer, which means short-term flexibility is limited if debt obligations need to be addressed quickly. Reducing revolving balances such as credit card debt through future cash inflows would materially improve breathing room. Over time, building liquid reserves alongside long-term assets will create a more balanced financial position."
        ),
      }
    }
    // Illiquid-dominant (investment, mp2, custom): narrative, no exact %
    if (dominantIlliquid) {
      return {
        headline,
        paragraph: appendConcentration(
          "Current liabilities are far greater than your immediately accessible financial buffer, so most of your liquidity is effectively committed to existing obligations. Although your net worth may be positive, short-term flexibility is limited because much of your asset base is in long-term or less liquid holdings. Reducing high-cost debt such as credit card balances through future cash inflows would improve breathing room. Building liquid reserves alongside these assets will create more flexibility over time."
        ),
      }
    }
    // Dominant liquid (bank/cash): show exact % — meaningful and readable
    return {
      headline,
      paragraph: appendConcentration(
        `Your liabilities currently consume approximately ${liabilityToLiquidPct}% of your liquid assets, which means most of your immediately accessible funds are already offset by existing obligations. Although your net worth remains positive, short-term flexibility is tight because a large share of available cash or bank balances may already be financially committed. Reducing high-cost balances such as credit card debt using future cash inflows would quickly improve your liquidity position. Even partial repayment can create more breathing room and reduce financial pressure.`
      ),
    }
  }

  // Tight liquidity: 70% to 90%
  if (liabilityToLiquidPct >= 70 && liabilityToLiquidPct < 90) {
    return {
      headline: 'Positive Net Worth with Tight Financial Flexibility',
      paragraph: appendConcentration(
        "Your liquid assets still support your liabilities, but debt is absorbing a meaningful share of your short-term financial capacity. This means your financial position remains stable today, yet flexibility could tighten if new obligations appear before balances improve. Gradually reducing liabilities while continuing to build accessible reserves can strengthen both confidence and resilience."
      ),
    }
  }

  // Manageable pressure: 40% to 70%
  if (liabilityToLiquidPct >= 40 && liabilityToLiquidPct < 70) {
    return {
      headline: 'Positive Position with Manageable Debt Pressure',
      paragraph: appendConcentration(
        "Your assets currently stay ahead of your liabilities, and your liquid reserves still provide reasonable short-term support. Debt is present but remains within a manageable range relative to accessible funds. Continuing to reduce obligations while preserving liquid savings will steadily strengthen financial flexibility."
      ),
    }
  }

  // No liabilities recorded — explicit wording: liquid uncommitted, strong short-term flexibility
  if (liabilitiesSum === 0 && netWorth > 0) {
    return {
      headline: 'No Liabilities Recorded; Strong Short-Term Flexibility',
      paragraph: appendConcentration(
        "You have no liabilities recorded, so your liquid assets are fully uncommitted to debt. That gives you strong short-term flexibility: you can cover expenses or opportunities without drawing on credit or selling long-term assets. Keeping a portion of savings in accessible form will help you maintain this flexibility while you grow net worth."
      ),
    }
  }

  // Strong liquidity: below 40% — qualify when real estate exists and liquid share is modest
  if (liabilityToLiquidPct < 40 && netWorth > 0) {
    if (realEstateWithModestLiquid) {
      return {
        headline: 'Strong Net Worth; Liquidity Modest Relative to Wealth',
        paragraph: appendConcentration(
          "Your net worth is strong and your liabilities are well covered by liquid assets. A large portion of your wealth, however, is in long-term assets such as real estate, so your immediately accessible funds remain modest relative to your total position. Building liquid reserves alongside these assets will improve day-to-day flexibility without reducing your overall strength."
        ),
      }
    }
    return {
      headline: 'Strong Position with Healthy Liquidity',
      paragraph: appendConcentration(
        "Your assets exceed your liabilities and your liquid funds remain comfortably ahead of current obligations. One important advantage here is liquidity—the ability to access funds quickly when needed without disturbing long-term assets or relying on new debt. This gives stronger day-to-day financial flexibility and improves resilience against unexpected expenses."
      ),
    }
  }

  // Positive net worth, fallback (e.g. low liability share)
  if (netWorth > 0) {
    if (realEstateWithModestLiquid) {
      return {
        headline: 'Strong Net Worth; Liquidity Modest Relative to Wealth',
        paragraph: appendConcentration(
          "Your net worth is strong and your liabilities are well covered by liquid assets. A large portion of your wealth, however, is in long-term assets such as real estate, so your immediately accessible funds remain modest relative to your total position. Building liquid reserves alongside these assets will improve day-to-day flexibility without reducing your overall strength."
        ),
      }
    }
    return {
      headline: 'Strong Position with Healthy Liquidity',
      paragraph: appendConcentration(
        "Your assets exceed your liabilities and your liquid funds remain comfortably ahead of current obligations. One important advantage here is liquidity—the ability to access funds quickly when needed without disturbing long-term assets or relying on new debt. This gives stronger day-to-day financial flexibility and improves resilience against unexpected expenses."
      ),
    }
  }

  return {
    headline: 'Keep Building Clarity',
    paragraph:
      "You're building clarity by tracking your assets and liabilities. Keep updating your numbers so you can see progress over time and make informed decisions. Small steps add up.",
  }
}
