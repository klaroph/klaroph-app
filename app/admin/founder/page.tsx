import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type FounderMetrics = {
  total_users?: number
  new_users_today?: number
  dau?: number
  wau?: number
  mau?: number
  pro_users?: number
  free_to_pro_conversion?: number
  seven_day_retention?: number
  seven_day_retention_activity?: number
  auth_audit?: {
    auth_users_count?: number
    profiles_count?: number
    auth_minus_profiles?: number
    auth_without_profile?: number
  }
  first_value_moment?: {
    avg_days_to_first_expense?: number | null
    avg_hours_to_first_expense?: number | null
  }
}

function MetricCard({
  title,
  value,
  sub,
}: {
  title: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--color-card)] p-4 shadow-sm">
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
      {sub != null && sub !== '' && (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{sub}</p>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
      {children}
    </h2>
  )
}

export default async function FounderDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    redirect('/')
  }

  const founderEmail = process.env.FOUNDER_EMAIL
  if (founderEmail && session.user.email !== founderEmail) {
    redirect('/dashboard')
  }

  let baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    const h = await headers()
    const host = h.get('host') ?? 'localhost:3000'
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'
    baseUrl = `${protocol}://${host}`
  }

  const secret = process.env.FOUNDER_DASHBOARD_SECRET
  const requestHeaders: HeadersInit = {
    ...(secret && { Authorization: `Bearer ${secret}` }),
  }

  let data: FounderMetrics | null = null
  let fetchError: string | null = null

  try {
    const res = await fetch(`${baseUrl}/api/founder-dashboard`, {
      cache: 'no-store',
      headers: requestHeaders,
    })
    if (!res.ok) {
      fetchError = `API ${res.status}: ${res.statusText}`
    } else {
      data = await res.json()
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : 'Failed to load metrics'
  }

  if (fetchError || !data) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] p-4 md:p-6">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            ← Back to dashboard
          </Link>
          <div className="mt-6 rounded-xl border border-[var(--color-danger)] bg-[var(--color-error-bg)] p-6 text-center">
            <p className="font-medium text-[var(--color-danger)]">Unable to load founder metrics</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{fetchError ?? 'No data'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Founder dashboard</h1>
            <p className="text-sm text-[var(--text-muted)]">Internal metrics (live)</p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard title="Total users" value={data.total_users ?? '—'} />
          <MetricCard title="New users today" value={data.new_users_today ?? '—'} />
          <MetricCard title="DAU" value={data.dau ?? '—'} sub="Daily active users" />
          <MetricCard title="WAU" value={data.wau ?? '—'} sub="Weekly active users" />
          <MetricCard title="MAU" value={data.mau ?? '—'} sub="Monthly active users" />
          <MetricCard title="Pro users" value={data.pro_users ?? '—'} />
          <MetricCard
            title="Free → Pro conversion"
            value={data.free_to_pro_conversion != null ? `${data.free_to_pro_conversion}%` : '—'}
          />
          <MetricCard
            title="7-day retention (login)"
            value={data.seven_day_retention != null ? `${data.seven_day_retention}%` : '—'}
          />
          <MetricCard
            title="7-day retention (activity)"
            value={data.seven_day_retention_activity != null ? `${data.seven_day_retention_activity}%` : '—'}
          />
        </div>

        {data.auth_audit && (
          <div className="mt-8">
            <SectionTitle>Auth audit</SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="auth.users count" value={data.auth_audit.auth_users_count ?? '—'} />
              <MetricCard title="profiles count" value={data.auth_audit.profiles_count ?? '—'} />
              <MetricCard
                title="auth − profiles"
                value={data.auth_audit.auth_minus_profiles ?? '—'}
                sub="Should be 0"
              />
              <MetricCard
                title="auth without profile"
                value={data.auth_audit.auth_without_profile ?? '—'}
              />
            </div>
          </div>
        )}

        {data.first_value_moment && (
          <div className="mt-8">
            <SectionTitle>First value moment</SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetricCard
                title="Avg days to first expense"
                value={
                  data.first_value_moment.avg_days_to_first_expense != null
                    ? data.first_value_moment.avg_days_to_first_expense
                    : '—'
                }
              />
              <MetricCard
                title="Avg hours to first expense"
                value={
                  data.first_value_moment.avg_hours_to_first_expense != null
                    ? data.first_value_moment.avg_hours_to_first_expense
                    : '—'
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
