/**
 * Expense category suggestion from description text.
 * Weighted keyword matching (EN + Filipino). Maps only to existing app categories.
 * Returns up to 3 suggestions with confidence for chip UI. Expandable for AI fallback.
 */

import { EXPENSE_CATEGORIES } from './expenseCategories'

export type SuggestionConfidence = 'high' | 'medium' | 'low'

export type CategorySuggestionResult = {
  suggestions: { category: string }[]
  confidence: SuggestionConfidence
}

/** Valid category values from the app (single source of truth). */
const VALID_CATEGORIES = new Set(EXPENSE_CATEGORIES.map((c) => c.value))

/**
 * Weighted rules: phrase → category + weight.
 * Longer phrases first (sort by length desc) so "grab food" beats "grab".
 * Same phrase can appear for multiple categories (ambiguous e.g. "grab" → Transport + Dining).
 */
const WEIGHTED_RULES: { phrase: string; category: string; weight: number }[] = [
  // Disambiguate: specific phrase → single category (high weight)
  { phrase: 'grab ride', category: 'Transportation', weight: 1 },
  { phrase: 'grab car', category: 'Transportation', weight: 1 },
  { phrase: 'grab food', category: 'Dining Out', weight: 1 },
  { phrase: 'angkas', category: 'Transportation', weight: 1 },
  { phrase: 'joyride', category: 'Transportation', weight: 1 },
  { phrase: 'food panda', category: 'Dining Out', weight: 1 },
  { phrase: 'shell gas', category: 'Transportation', weight: 1 },
  { phrase: 'shell station', category: 'Transportation', weight: 1 },
  { phrase: 'gas station', category: 'Transportation', weight: 1 },
  { phrase: 'meralco', category: 'Utilities', weight: 1 },
  { phrase: 'maynilad', category: 'Utilities', weight: 1 },
  { phrase: 'manila water', category: 'Utilities', weight: 1 },
  { phrase: 'shopee', category: 'Shopping', weight: 1 },
  { phrase: 'lazada', category: 'Shopping', weight: 1 },
  { phrase: 'tinapa', category: 'Groceries', weight: 0.9 },
  { phrase: 'palengke', category: 'Groceries', weight: 1 },
  { phrase: 'puregold', category: 'Groceries', weight: 1 },
  // Groceries — Filipino/English food & market keywords
  { phrase: 'rice', category: 'Groceries', weight: 0.85 },
  { phrase: 'bangus', category: 'Groceries', weight: 0.9 },
  { phrase: 'galunggong', category: 'Groceries', weight: 0.9 },
  { phrase: 'tuyo', category: 'Groceries', weight: 0.9 },
  { phrase: 'danggit', category: 'Groceries', weight: 0.9 },
  { phrase: 'itlog', category: 'Groceries', weight: 0.9 },
  { phrase: 'egg', category: 'Groceries', weight: 0.85 },
  { phrase: 'manok', category: 'Groceries', weight: 0.9 },
  { phrase: 'baboy', category: 'Groceries', weight: 0.9 },
  { phrase: 'baka', category: 'Groceries', weight: 0.9 },
  { phrase: 'isda', category: 'Groceries', weight: 0.9 },
  { phrase: 'hipon', category: 'Groceries', weight: 0.9 },
  { phrase: 'pusit', category: 'Groceries', weight: 0.9 },
  { phrase: 'gulay', category: 'Groceries', weight: 0.9 },
  { phrase: 'talong', category: 'Groceries', weight: 0.9 },
  { phrase: 'kamatis', category: 'Groceries', weight: 0.9 },
  { phrase: 'sibuyas', category: 'Groceries', weight: 0.9 },
  { phrase: 'bawang', category: 'Groceries', weight: 0.9 },
  { phrase: 'luya', category: 'Groceries', weight: 0.9 },
  { phrase: 'patatas', category: 'Groceries', weight: 0.9 },
  { phrase: 'sayote', category: 'Groceries', weight: 0.9 },
  { phrase: 'kalabasa', category: 'Groceries', weight: 0.9 },
  { phrase: 'repolyo', category: 'Groceries', weight: 0.9 },
  { phrase: 'pechay', category: 'Groceries', weight: 0.9 },
  { phrase: 'sitaw', category: 'Groceries', weight: 0.9 },
  { phrase: 'okra', category: 'Groceries', weight: 0.9 },
  { phrase: 'ampalaya', category: 'Groceries', weight: 0.9 },
  { phrase: 'kangkong', category: 'Groceries', weight: 0.9 },
  { phrase: 'malunggay', category: 'Groceries', weight: 0.9 },
  { phrase: 'mais', category: 'Groceries', weight: 0.9 },
  { phrase: 'saging', category: 'Groceries', weight: 0.9 },
  { phrase: 'mangga', category: 'Groceries', weight: 0.9 },
  { phrase: 'papaya', category: 'Groceries', weight: 0.9 },
  { phrase: 'pakwan', category: 'Groceries', weight: 0.9 },
  { phrase: 'melon', category: 'Groceries', weight: 0.85 },
  { phrase: 'pinya', category: 'Groceries', weight: 0.9 },
  { phrase: 'calamansi', category: 'Groceries', weight: 0.9 },
  { phrase: 'labanos', category: 'Groceries', weight: 0.9 },
  { phrase: 'pipino', category: 'Groceries', weight: 0.9 },
  { phrase: 'toyo', category: 'Groceries', weight: 0.9 },
  { phrase: 'suka', category: 'Groceries', weight: 0.9 },
  { phrase: 'asin', category: 'Groceries', weight: 0.85 },
  { phrase: 'asukal', category: 'Groceries', weight: 0.9 },
  { phrase: 'paminta', category: 'Groceries', weight: 0.9 },
  { phrase: 'mantika', category: 'Groceries', weight: 0.9 },
  { phrase: 'gatas', category: 'Groceries', weight: 0.9 },
  { phrase: 'milk', category: 'Groceries', weight: 0.85 },
  { phrase: 'kape', category: 'Groceries', weight: 0.85 },
  { phrase: 'coffee', category: 'Groceries', weight: 0.85 },
  { phrase: 'tinapay', category: 'Groceries', weight: 0.9 },
  { phrase: 'bread', category: 'Groceries', weight: 0.85 },
  { phrase: 'pandesal', category: 'Groceries', weight: 0.9 },
  { phrase: 'monay', category: 'Groceries', weight: 0.9 },
  { phrase: 'ensaymada', category: 'Groceries', weight: 0.9 },
  { phrase: 'biscuit', category: 'Groceries', weight: 0.85 },
  { phrase: 'noodles', category: 'Groceries', weight: 0.85 },
  { phrase: 'pancit', category: 'Groceries', weight: 0.9 },
  { phrase: 'mami', category: 'Groceries', weight: 0.9 },
  { phrase: 'lugaw', category: 'Groceries', weight: 0.9 },
  { phrase: 'champorado', category: 'Groceries', weight: 0.9 },
  { phrase: 'arroz caldo', category: 'Groceries', weight: 0.9 },
  { phrase: 'sopas', category: 'Groceries', weight: 0.9 },
  { phrase: 'adobo', category: 'Groceries', weight: 0.85 },
  { phrase: 'sinigang', category: 'Groceries', weight: 0.9 },
  { phrase: 'nilaga', category: 'Groceries', weight: 0.9 },
  { phrase: 'menudo', category: 'Groceries', weight: 0.9 },
  { phrase: 'afritada', category: 'Groceries', weight: 0.9 },
  { phrase: 'caldereta', category: 'Groceries', weight: 0.9 },
  { phrase: 'paksiw', category: 'Groceries', weight: 0.9 },
  { phrase: 'dinuguan', category: 'Groceries', weight: 0.9 },
  { phrase: 'lechon', category: 'Groceries', weight: 0.85 },
  { phrase: 'sisig', category: 'Groceries', weight: 0.9 },
  { phrase: 'pares', category: 'Groceries', weight: 0.9 },
  { phrase: 'bulalo', category: 'Groceries', weight: 0.9 },
  { phrase: 'batchoy', category: 'Groceries', weight: 0.9 },
  { phrase: 'goto', category: 'Groceries', weight: 0.9 },
  { phrase: 'bbq', category: 'Groceries', weight: 0.85 },
  { phrase: 'ihaw', category: 'Groceries', weight: 0.9 },
  { phrase: 'hotdog', category: 'Groceries', weight: 0.85 },
  { phrase: 'tocino', category: 'Groceries', weight: 0.9 },
  { phrase: 'longganisa', category: 'Groceries', weight: 0.9 },
  { phrase: 'ham', category: 'Groceries', weight: 0.85 },
  { phrase: 'corned beef', category: 'Groceries', weight: 0.9 },
  { phrase: 'sardinas', category: 'Groceries', weight: 0.9 },
  { phrase: 'tuna', category: 'Groceries', weight: 0.85 },
  { phrase: 'delata', category: 'Groceries', weight: 0.9 },
  { phrase: 'yakult', category: 'Groceries', weight: 0.9 },
  { phrase: 'juice', category: 'Groceries', weight: 0.85 },
  { phrase: 'softdrinks', category: 'Groceries', weight: 0.85 },
  { phrase: 'coke', category: 'Groceries', weight: 0.85 },
  { phrase: 'sprite', category: 'Groceries', weight: 0.85 },
  { phrase: 'royal', category: 'Groceries', weight: 0.85 },
  { phrase: 'water', category: 'Groceries', weight: 0.8 },
  { phrase: 'tubig', category: 'Groceries', weight: 0.7 },
  { phrase: 'ice cream', category: 'Groceries', weight: 0.85 },
  { phrase: 'sabaw', category: 'Groceries', weight: 0.9 },
  { phrase: 'baon', category: 'Groceries', weight: 0.9 },
  { phrase: 'lunch', category: 'Groceries', weight: 0.5 },
  { phrase: 'dinner', category: 'Groceries', weight: 0.5 },
  { phrase: 'breakfast', category: 'Groceries', weight: 0.5 },
  { phrase: 'meryenda', category: 'Groceries', weight: 0.9 },
  { phrase: 'snack', category: 'Groceries', weight: 0.6 },
  { phrase: 'jollibee', category: 'Dining Out', weight: 1 },
  { phrase: 'mcdo', category: 'Dining Out', weight: 1 },
  { phrase: 'mcdonald', category: 'Dining Out', weight: 1 },
  { phrase: 'kfc', category: 'Dining Out', weight: 1 },
  { phrase: 'starbucks', category: 'Dining Out', weight: 1 },
  { phrase: 'mercury drug', category: 'Health', weight: 1 },
  { phrase: 'tuition', category: 'Education', weight: 1 },
  { phrase: 'padala', category: 'Family Support', weight: 0.9 },
  { phrase: 'remittance', category: 'Family Support', weight: 1 },
  { phrase: 'netflix', category: 'Subscriptions', weight: 0.9 },
  { phrase: 'spotify', category: 'Subscriptions', weight: 1 },
  { phrase: 'rent', category: 'Rent / Mortgage', weight: 0.8 },
  { phrase: 'upa', category: 'Rent / Mortgage', weight: 1 },
  { phrase: 'apartment', category: 'Rent / Mortgage', weight: 1 },
  { phrase: 'dorm', category: 'Rent / Mortgage', weight: 1 },
  { phrase: 'lrt', category: 'Transportation', weight: 1 },
  { phrase: 'mrt', category: 'Transportation', weight: 1 },
  { phrase: 'uv express', category: 'Transportation', weight: 1 },
  { phrase: 'toll fee', category: 'Transportation', weight: 1 },
  { phrase: 'gasolina', category: 'Transportation', weight: 1 },
  { phrase: 'pamasahe', category: 'Transportation', weight: 1 },
  { phrase: 'tricycle', category: 'Transportation', weight: 1 },
  { phrase: 'taxi', category: 'Transportation', weight: 1 },
  { phrase: 'electric bill', category: 'Utilities', weight: 1 },
  { phrase: 'water bill', category: 'Utilities', weight: 1 },
  { phrase: 'internet bill', category: 'Utilities', weight: 1 },
  { phrase: 'pldt', category: 'Utilities', weight: 1 },
  { phrase: 'globe', category: 'Utilities', weight: 1 },
  { phrase: 'converge', category: 'Utilities', weight: 1 },
  { phrase: 'kuryente', category: 'Utilities', weight: 1 },
  { phrase: 'tubig', category: 'Utilities', weight: 1 },
  { phrase: 'grocery', category: 'Groceries', weight: 0.9 },
  { phrase: 'supermarket', category: 'Groceries', weight: 1 },
  { phrase: 'bigas', category: 'Groceries', weight: 0.8 },
  { phrase: 'ulam', category: 'Groceries', weight: 0.5 },
  { phrase: 'wet market', category: 'Groceries', weight: 1 },
  { phrase: 'restaurant', category: 'Dining Out', weight: 1 },
  { phrase: 'cafe', category: 'Dining Out', weight: 1 },
  { phrase: 'karinderia', category: 'Dining Out', weight: 1 },
  { phrase: 'carenderia', category: 'Dining Out', weight: 1 },
  { phrase: 'turo-turo', category: 'Dining Out', weight: 1 },
  { phrase: 'gamot', category: 'Health', weight: 1 },
  { phrase: 'pharmacy', category: 'Health', weight: 1 },
  { phrase: 'doctor', category: 'Health', weight: 1 },
  { phrase: 'hospital', category: 'Health', weight: 1 },
  { phrase: 'vaccine', category: 'Health', weight: 1 },
  { phrase: 'school', category: 'Education', weight: 0.7 },
  { phrase: 'enrollment', category: 'Education', weight: 1 },
  { phrase: 'loan payment', category: 'Loan Payment', weight: 1 },
  { phrase: 'home credit', category: 'Loan Payment', weight: 1 },
  { phrase: 'hulog', category: 'Loan Payment', weight: 0.8 },
  { phrase: 'installment', category: 'Loan Payment', weight: 0.7 },
  { phrase: 'philhealth', category: 'Insurance', weight: 1 },
  { phrase: 'sss', category: 'Insurance', weight: 1 },
  { phrase: 'pag-ibig', category: 'Insurance', weight: 1 },
  { phrase: 'insurance', category: 'Insurance', weight: 0.9 },
  { phrase: 'family support', category: 'Family Support', weight: 1 },
  { phrase: 'ayuda', category: 'Family Support', weight: 0.8 },
  { phrase: 'lease', category: 'Rent / Mortgage', weight: 0.8 },
  { phrase: 'mall', category: 'Shopping', weight: 0.7 },
  { phrase: 'online order', category: 'Shopping', weight: 0.9 },
  { phrase: 'sine', category: 'Entertainment', weight: 1 },
  { phrase: 'movie', category: 'Entertainment', weight: 0.8 },
  { phrase: 'cinema', category: 'Entertainment', weight: 1 },
  { phrase: 'flight', category: 'Travel', weight: 1 },
  { phrase: 'hotel', category: 'Travel', weight: 1 },
  { phrase: 'bakasyon', category: 'Travel', weight: 1 },
  { phrase: 'subscription', category: 'Subscriptions', weight: 0.8 },
  // Ambiguous: single word can map to multiple categories (lower weight each)
  { phrase: 'grab', category: 'Transportation', weight: 0.45 },
  { phrase: 'grab', category: 'Dining Out', weight: 0.45 },
  { phrase: 'shell', category: 'Transportation', weight: 0.5 },
  { phrase: 'shell', category: 'Shopping', weight: 0.35 },
  { phrase: 'tinapa', category: 'Dining Out', weight: 0.3 },
  // Generic
  { phrase: 'transport', category: 'Transportation', weight: 0.4 },
  { phrase: 'commute', category: 'Transportation', weight: 0.4 },
  { phrase: 'bill', category: 'Utilities', weight: 0.35 },
  { phrase: 'bili', category: 'Shopping', weight: 0.3 },
  { phrase: 'order', category: 'Shopping', weight: 0.35 },
  { phrase: 'food', category: 'Dining Out', weight: 0.35 },
  { phrase: 'kain', category: 'Dining Out', weight: 0.4 },
  { phrase: 'meal', category: 'Dining Out', weight: 0.3 },
  { phrase: 'market', category: 'Groceries', weight: 0.35 },
  { phrase: 'groceries', category: 'Groceries', weight: 0.5 },
  { phrase: 'health', category: 'Health', weight: 0.4 },
  { phrase: 'medical', category: 'Health', weight: 0.4 },
  { phrase: 'study', category: 'Education', weight: 0.3 },
  { phrase: 'books', category: 'Education', weight: 0.35 },
  { phrase: 'utang', category: 'Loan Payment', weight: 0.4 },
  { phrase: 'support', category: 'Family Support', weight: 0.3 },
  { phrase: 'house', category: 'Rent / Mortgage', weight: 0.25 },
  { phrase: 'room', category: 'Rent / Mortgage', weight: 0.25 },
  { phrase: 'streaming', category: 'Entertainment', weight: 0.4 },
  { phrase: 'music', category: 'Entertainment', weight: 0.3 },
  { phrase: 'travel', category: 'Travel', weight: 0.4 },
  { phrase: 'vacation', category: 'Travel', weight: 0.4 },
  { phrase: 'trip', category: 'Travel', weight: 0.35 },
  { phrase: 'hobby', category: 'Hobbies', weight: 0.5 },
  { phrase: 'hobbies', category: 'Hobbies', weight: 0.5 },
  { phrase: 'personal upgrade', category: 'Personal Upgrade', weight: 0.6 },
]

/** Sorted by phrase length descending so longer matches win first. */
const RULES_BY_LENGTH = [...WEIGHTED_RULES].sort(
  (a, b) => b.phrase.length - a.phrase.length
)

const HIGH_THRESHOLD = 0.65
const MEDIUM_THRESHOLD = 0.2
const LOW_CONFIDENCE_MAX_SUGGESTIONS = 0

/**
 * Aggregate weighted scores per category from description.
 * Only includes categories that exist in EXPENSE_CATEGORIES.
 */
function getWeightedSuggestions(description: string): { category: string; score: number }[] {
  const normalized = (description || '').trim().toLowerCase()
  if (!normalized) return []

  const scores = new Map<string, number>()

  for (const rule of RULES_BY_LENGTH) {
    if (!normalized.includes(rule.phrase.toLowerCase())) continue
    if (!VALID_CATEGORIES.has(rule.category)) continue
    const current = scores.get(rule.category) ?? 0
    scores.set(rule.category, current + rule.weight)
  }

  return Array.from(scores.entries())
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, score]) => ({ category, score }))
}

/**
 * Returns up to 3 suggestions with confidence.
 * High = 1 chip, medium = 2–3 chips, low = no chips.
 */
export function suggestCategoriesFromDescription(
  description: string
): CategorySuggestionResult {
  const weighted = getWeightedSuggestions(description)
  if (weighted.length === 0) {
    return { suggestions: [], confidence: 'low' }
  }

  const topScore = weighted[0].score
  const secondScore = weighted[1]?.score ?? 0
  const thirdScore = weighted[2]?.score ?? 0

  let confidence: SuggestionConfidence = 'low'
  let take = 0

  if (topScore >= HIGH_THRESHOLD && secondScore < MEDIUM_THRESHOLD) {
    confidence = 'high'
    take = 1
  } else if (topScore >= MEDIUM_THRESHOLD) {
    confidence = 'medium'
    take = Math.min(3, weighted.length)
  }

  const suggestions = weighted.slice(0, take).map((w) => ({ category: w.category }))

  return { suggestions, confidence }
}

/**
 * Legacy single-suggestion API for callers that need it.
 * Uses first suggestion from weighted result when confidence is high.
 */
export function suggestCategoryFromDescription(
  description: string
): { category: string; confidence: 'high' | 'weak' } | null {
  const result = suggestCategoriesFromDescription(description)
  if (result.confidence === 'high' && result.suggestions.length > 0) {
    return { category: result.suggestions[0].category, confidence: 'high' }
  }
  if (result.confidence === 'medium' && result.suggestions.length > 0) {
    return { category: result.suggestions[0].category, confidence: 'weak' }
  }
  return null
}

/**
 * Placeholder for future AI fallback.
 */
export async function suggestCategoryFromDescriptionAsync(
  _description: string
): Promise<CategorySuggestionResult | null> {
  return null
}
