/**
 * Shared description matching for transaction suggestions (expense categories + income sources).
 * Deterministic only; no network.
 */

export type SuggestionConfidence = 'high' | 'medium' | 'low'

export type PhraseRule = { phrase: string; value: string; weight: number }

export type SuggestionResult = {
  suggestions: { category: string }[]
  confidence: SuggestionConfidence
}

const HIGH_THRESHOLD = 0.65
const MEDIUM_THRESHOLD = 0.2

/** Lowercase, strip accents and punctuation, collapse whitespace. "Paid Meralco Bill!!" → "paid meralco bill". */
export function normalizeDescription(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Conservative singular form: "groceries" → "grocery", "bills" → "bill". Leaves "sss", "bus", "gas" alone. */
function singularizeToken(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

type CompiledPhrase = { tokens: string[]; targets: { value: string; weight: number }[] }

/**
 * Group rules by normalized phrase and order longest first, so a matched
 * phrase ("grab food") consumes its words before shorter phrases ("grab", "food") are checked.
 */
export function compilePhraseRules(rules: PhraseRule[]): CompiledPhrase[] {
  const byPhrase = new Map<string, CompiledPhrase>()
  for (const rule of rules) {
    const key = normalizeDescription(rule.phrase)
    if (!key) continue
    const entry = byPhrase.get(key) ?? { tokens: key.split(' ').map(singularizeToken), targets: [] }
    entry.targets.push({ value: rule.value, weight: rule.weight })
    byPhrase.set(key, entry)
  }
  return [...byPhrase.entries()]
    .sort(([a, pa], [b, pb]) => pb.tokens.length - pa.tokens.length || b.length - a.length)
    .map(([, compiled]) => compiled)
}

/** Whole-word phrase scoring. Each word counts toward at most one phrase. */
export function scoreDescription(description: string, compiled: CompiledPhrase[]): { value: string; score: number }[] {
  const normalized = normalizeDescription(description)
  if (!normalized) return []
  const words = normalized.split(' ')
  const singular = words.map(singularizeToken)
  const consumed = new Array<boolean>(words.length).fill(false)
  const scores = new Map<string, number>()

  for (const { tokens, targets } of compiled) {
    for (let i = 0; i + tokens.length <= words.length; i++) {
      const hit = tokens.every((t, j) => !consumed[i + j] && (words[i + j] === t || singular[i + j] === t))
      if (!hit) continue
      for (let j = 0; j < tokens.length; j++) consumed[i + j] = true
      for (const { value, weight } of targets) scores.set(value, (scores.get(value) ?? 0) + weight)
      break
    }
  }

  return [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([value, score]) => ({ value, score }))
}

/** High = 1 chip, medium = up to 3 chips, low = none. */
export function toSuggestionResult(weighted: { value: string; score: number }[]): SuggestionResult {
  const top = weighted[0]?.score ?? 0
  const second = weighted[1]?.score ?? 0
  if (top >= HIGH_THRESHOLD && second < MEDIUM_THRESHOLD) {
    return { suggestions: [{ category: weighted[0].value }], confidence: 'high' }
  }
  if (top >= MEDIUM_THRESHOLD) {
    return { suggestions: weighted.slice(0, 3).map((w) => ({ category: w.value })), confidence: 'medium' }
  }
  return { suggestions: [], confidence: 'low' }
}

/**
 * Payment rails, generic verbs and filler that say nothing about what the money was for.
 * A description made only of these (plus numbers) is ambiguous: "GCash 1500", "Transfer 2000", "SM 1500".
 */
const NON_DESCRIPTIVE_WORDS = new Set([
  'gcash', 'maya', 'paymaya', 'cash', 'transfer', 'transferred', 'payment', 'pay', 'paid', 'bayad',
  'sm', 'grab', 'bpi', 'bdo', 'bank', 'atm', 'withdraw', 'withdrawal', 'send', 'sent', 'fund', 'funds',
  'misc', 'other', 'others', 'expense', 'expenses', 'income', 'money', 'php', 'peso', 'pesos', 'p',
  'for', 'to', 'the', 'a', 'via', 'thru', 'through', 'from', 'sa', 'ng', 'po',
])

/** True when the description has no word that could identify a category. */
export function isAmbiguousDescription(description: string): boolean {
  const words = normalizeDescription(description)
    .split(' ')
    .filter((w) => w && !/^\d+$/.test(w))
  return words.every((w) => NON_DESCRIPTIVE_WORDS.has(w))
}
