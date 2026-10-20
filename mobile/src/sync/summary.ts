/** "1 budget kept from your account" / "2 budgets kept from your account". */
export function budgetsKeptFromAccountLine(count: number): string | null {
  if (count <= 0) return null
  const noun = count === 1 ? 'budget' : 'budgets'
  return `${count} ${noun} kept from your account`
}

/**
 * First line after phone-only rows are assigned to the signed-in account.
 * "Moved 1 entry and 2 goals to your account."
 */
export function movedToAccountLine(entries: number, goals: number): string | null {
  if (entries <= 0 && goals <= 0) return null
  const entryWord = entries === 1 ? 'entry' : 'entries'
  const goalWord = goals === 1 ? 'goal' : 'goals'
  return `Moved ${entries} ${entryWord} and ${goals} ${goalWord} to your account.`
}
