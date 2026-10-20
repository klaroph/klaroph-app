const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatPeso(amount: number): string {
  const negative = amount < 0
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}₱${grouped}.${fraction}`
}

export function formatPrettyDate(iso: string, withYear = false): string {
  const year = iso.slice(0, 4)
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const label = `${MONTHS[month - 1] ?? iso} ${day}`
  return withYear ? `${label}, ${year}` : label
}

export function formatPeriodRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  if (sameYear) return `${formatPrettyDate(start)} – ${formatPrettyDate(end)}`
  return `${formatPrettyDate(start, true)} – ${formatPrettyDate(end, true)}`
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Something went wrong.'
}
