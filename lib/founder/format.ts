/** Founder Dock display formatting. KlaroPH runs on Philippine time. */

const TIME_ZONE = 'Asia/Manila'
const DAY_MS = 24 * 60 * 60 * 1000

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-PH')
}

export function formatCountOf(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : plural}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelative(iso: string | null, now: Date): string {
  if (!iso) return 'Never'
  const diff = now.getTime() - Date.parse(iso)
  if (diff < 60 * 60 * 1000) return 'Just now'
  if (diff < DAY_MS) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`
  const days = Math.floor(diff / DAY_MS)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export function founderGreeting(now: Date): string {
  const hour = Number(now.toLocaleString('en-US', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function formatLongDate(now: Date): string {
  return now.toLocaleDateString('en-PH', { timeZone: TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
