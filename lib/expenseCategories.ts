export type ExpenseType = 'needs' | 'wants'

export const EXPENSE_CATEGORIES: { value: string; label: string; type: ExpenseType }[] = [
  { value: 'Rent / Mortgage', label: 'Rent / Mortgage', type: 'needs' },
  { value: 'Utilities', label: 'Utilities', type: 'needs' },
  { value: 'Groceries', label: 'Groceries', type: 'needs' },
  { value: 'Transportation', label: 'Transportation', type: 'needs' },
  { value: 'Health', label: 'Health', type: 'needs' },
  { value: 'Education', label: 'Education', type: 'needs' },
  { value: 'Loan Payment', label: 'Loan Payment', type: 'needs' },
  { value: 'Insurance', label: 'Insurance', type: 'needs' },
  { value: 'Family Support', label: 'Family Support', type: 'needs' },
  { value: 'Others (Needs)', label: 'Others (Needs)', type: 'needs' },
  { value: 'Dining Out', label: 'Dining Out', type: 'wants' },
  { value: 'Shopping', label: 'Shopping', type: 'wants' },
  { value: 'Entertainment', label: 'Entertainment', type: 'wants' },
  { value: 'Travel', label: 'Travel', type: 'wants' },
  { value: 'Subscriptions', label: 'Subscriptions', type: 'wants' },
  { value: 'Hobbies', label: 'Hobbies', type: 'wants' },
  { value: 'Personal Upgrade', label: 'Personal Upgrade', type: 'wants' },
  { value: 'Others (Wants)', label: 'Others (Wants)', type: 'wants' },
]

export function getTypeForCategory(categoryValue: string): ExpenseType {
  const found = EXPENSE_CATEGORIES.find((c) => c.value === categoryValue)
  return found ? found.type : 'needs'
}
