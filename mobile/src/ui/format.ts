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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function monthKicker(month: string): string {
  const name = (MONTHS[Number(month.slice(5, 7)) - 1] ?? month).toUpperCase()
  return `THIS MONTH · ${name} ${month.slice(0, 4)}`
}

export function formatWeekdayShort(iso: string): string {
  const utc = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))
  return WEEKDAYS[utc.getUTCDay()] ?? ''
}

/** Rounded to the nearest peso. The sign stays on the amount. */
export function formatWholePeso(amount: number): string {
  const negative = amount < 0
  const whole = Math.round(Math.abs(amount))
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}₱${grouped}`
}

/** Whole pesos when the amount has no centavos, otherwise the full amount. */
export function formatPesoShort(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100) % 100
  if (cents !== 0) return formatPeso(amount)
  const negative = amount < 0
  const grouped = String(Math.round(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}₱${grouped}`
}

/** Leading plus, or a minus, so a day total reads the same way as a row. */
export function signedPeso(amount: number): string {
  if (amount > 0) return `+${formatPeso(amount)}`
  if (amount < 0) return `−${formatPeso(Math.abs(amount))}`
  return formatPeso(0)
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Something went wrong.'
}
