/**
 * Expense categories and income sources match the web app
 * (`lib/expenseCategories.ts`, `lib/incomeSources.ts`). Icons are local glyphs.
 */

export type ExpenseTypeName = 'needs' | 'wants'
export type EntryKind = 'expense' | 'income'

export type CategoryIconName =
  | 'home-outline'
  | 'flash-outline'
  | 'cart-outline'
  | 'bus'
  | 'heart-pulse'
  | 'school-outline'
  | 'bank-outline'
  | 'shield-check-outline'
  | 'account-group-outline'
  | 'dots-horizontal'
  | 'silverware-fork-knife'
  | 'shopping-outline'
  | 'ticket-confirmation-outline'
  | 'airplane'
  | 'autorenew'
  | 'palette-outline'
  | 'star-outline'
  | 'cash'
  | 'gift-outline'
  | 'laptop'
  | 'store-outline'
  | 'bank-transfer'
  | 'chart-line'
  | 'hand-coin-outline'
  | 'tag-outline'
  | 'flag-outline'

type ExpenseCategory = { value: string; type: ExpenseTypeName; icon: CategoryIconName }

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  { value: 'Rent / Mortgage', type: 'needs', icon: 'home-outline' },
  { value: 'Utilities', type: 'needs', icon: 'flash-outline' },
  { value: 'Groceries', type: 'needs', icon: 'cart-outline' },
  { value: 'Transportation', type: 'needs', icon: 'bus' },
  { value: 'Health', type: 'needs', icon: 'heart-pulse' },
  { value: 'Education', type: 'needs', icon: 'school-outline' },
  { value: 'Loan Payment', type: 'needs', icon: 'bank-outline' },
  { value: 'Insurance', type: 'needs', icon: 'shield-check-outline' },
  { value: 'Family Support', type: 'needs', icon: 'account-group-outline' },
  { value: 'Others (Needs)', type: 'needs', icon: 'dots-horizontal' },
  { value: 'Dining Out', type: 'wants', icon: 'silverware-fork-knife' },
  { value: 'Shopping', type: 'wants', icon: 'shopping-outline' },
  { value: 'Entertainment', type: 'wants', icon: 'ticket-confirmation-outline' },
  { value: 'Travel', type: 'wants', icon: 'airplane' },
  { value: 'Subscriptions', type: 'wants', icon: 'autorenew' },
  { value: 'Hobbies', type: 'wants', icon: 'palette-outline' },
  { value: 'Personal Upgrade', type: 'wants', icon: 'star-outline' },
  { value: 'Others (Wants)', type: 'wants', icon: 'dots-horizontal' },
]

const INCOME_ICONS: Record<string, CategoryIconName> = {
  Salary: 'cash',
  'Bonus / 13th Month': 'gift-outline',
  'Freelance / Online Work': 'laptop',
  'Business Income': 'store-outline',
  'Remittance / Support': 'bank-transfer',
  'Passive Income': 'chart-line',
  'Gift / Refund': 'hand-coin-outline',
  Other: 'tag-outline',
}

export const INCOME_SOURCES: readonly string[] = [
  'Salary',
  'Bonus / 13th Month',
  'Freelance / Online Work',
  'Business Income',
  'Remittance / Support',
  'Passive Income',
  'Gift / Refund',
  'Other',
]

export const DEFAULT_EXPENSE_CATEGORY = 'Groceries'
export const DEFAULT_INCOME_SOURCE = 'Salary'

export function expenseTypeFor(category: string, current?: string | null): ExpenseTypeName {
  const found = EXPENSE_CATEGORIES.find((item) => item.value === category)
  if (found) return found.type
  if (current === 'needs' || current === 'wants') return current
  return 'needs'
}

export function iconForCategory(category: string, kind: EntryKind): CategoryIconName {
  if (kind === 'income') return INCOME_ICONS[category] ?? 'cash'
  return EXPENSE_CATEGORIES.find((item) => item.value === category)?.icon ?? 'tag-outline'
}

export function chipOptions(kind: EntryKind, current: string): string[] {
  const base = kind === 'expense' ? EXPENSE_CATEGORIES.map((item) => item.value) : [...INCOME_SOURCES]
  if (current && !base.includes(current)) return [current, ...base]
  return base
}
