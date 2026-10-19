/** "1 budget kept from your account" / "2 budgets kept from your account". */
export function budgetsKeptFromAccountLine(count: number): string | null {
  if (count <= 0) return null
  const noun = count === 1 ? 'budget' : 'budgets'
  return `${count} ${noun} kept from your account`
}
