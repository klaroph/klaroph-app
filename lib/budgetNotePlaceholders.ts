/** Category-specific reminder placeholder examples for budget note inputs. Keys match EXPENSE_CATEGORIES.value */
export const BUDGET_NOTE_PLACEHOLDERS: Record<string, string> = {
  'Rent / Mortgage': 'House rent + assoc dues',
  Utilities: 'Meralco, water, internet',
  Groceries: 'Weekly market + essentials',
  Transportation: 'Gas + toll + parking',
  Health: 'Vitamins + checkup',
  Education: 'Tuition + school fees',
  'Loan Payment': 'Card + personal loan',
  Insurance: 'Life + HMO',
  'Family Support': 'Parents + allowance',
  'Dining Out': 'Coffee + weekend meals',
  Shopping: 'Clothes + essentials',
  Entertainment: 'Movies + subscriptions',
  Travel: 'Flights + hotel',
  Subscriptions: 'Netflix + apps',
  Hobbies: 'Sports + hobbies',
  'Personal Upgrade': 'Gym + self-learning',
  'Others (Needs)': 'e.g. breakdown',
  'Others (Wants)': 'e.g. breakdown',
}

export function getBudgetNotePlaceholder(categoryValue: string): string {
  return BUDGET_NOTE_PLACEHOLDERS[categoryValue] ?? 'e.g. breakdown'
}
