import Link from 'next/link'
import { loadFounderSnapshot } from '@/lib/founder/data'
import { filterUsers, isPro, isUserFilter, PLAN_LABELS, USER_FILTERS, type AccountStatus, type UserFilter } from '@/lib/founder/metrics'
import { formatCount, formatDate, formatRelative } from '@/lib/founder/format'
import { DockHeader, Pill, UnavailableNote } from '@/components/founder/DockUI'

const FILTER_LABELS: Record<UserFilter, string> = {
  all: 'All',
  free: 'Free',
  pro: 'Pro',
  new: 'New',
  active: 'Active',
  dormant: 'Dormant',
  testers: 'Testers',
}

const STATUS_TONES: Record<AccountStatus, 'ok' | 'unknown' | 'warn' | 'bad'> = {
  active: 'ok',
  dormant: 'unknown',
  unconfirmed: 'warn',
  banned: 'bad',
}

type PageProps = { searchParams: Promise<{ filter?: string; q?: string }> }

export default async function FounderUsersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filter: UserFilter = isUserFilter(params.filter) ? params.filter : 'all'
  const query = (params.q ?? '').slice(0, 100)
  const s = await loadFounderSnapshot()
  const now = new Date(s.now)
  const rows = filterUsers(s.users, filter, query)

  const href = (f: UserFilter) => {
    const qs = new URLSearchParams()
    if (f !== 'all') qs.set('filter', f)
    if (query) qs.set('q', query)
    const str = qs.toString()
    return `/admin/founder/users${str ? `?${str}` : ''}`
  }

  return (
    <>
      <DockHeader
        eyebrow="Users"
        title={`${formatCount(s.userSummary.total)} KlaroPH users`}
        subtitle="Account and plan visibility only — no financial records."
      />
      <UnavailableNote sources={s.unavailable} />

      <div className="fd-toolbar">
        <nav className="fd-chips" aria-label="Filter users">
          {USER_FILTERS.map((f) => (
            <Link key={f} href={href(f)} className={`fd-chip${f === filter ? ' is-active' : ''}`} aria-current={f === filter ? 'true' : undefined}>
              {FILTER_LABELS[f]}
              <span className="fd-chip-count">{filterUsers(s.users, f).length}</span>
            </Link>
          ))}
        </nav>
        <form className="fd-search" action="/admin/founder/users" method="get">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <input type="search" name="q" defaultValue={query} placeholder="Search name or email" aria-label="Search users" className="fd-input" />
        </form>
      </div>

      <div className="fd-card fd-table-card">
        {rows.length === 0 ? (
          <p className="fd-empty">No users match this view.</p>
        ) : (
          <table className="fd-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Signed up</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th>Product updates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td data-label="User">
                    <span className="fd-user-name">
                      {u.name ?? <span className="fd-muted">No name</span>}
                      {u.isTester && <span className="fd-tag">Tester</span>}
                      {u.isNew && !u.isTester && <span className="fd-tag fd-tag-new">New</span>}
                    </span>
                    <span className="fd-user-email">{u.email}</span>
                  </td>
                  <td data-label="Plan">
                    <Pill tone={isPro(u.plan) ? 'info' : 'unknown'}>
                      {PLAN_LABELS[u.plan]}
                      {u.planType ? ` · ${u.planType}` : ''}
                    </Pill>
                    {u.proEndsAt && <span className="fd-cell-sub">Until {formatDate(u.proEndsAt)}</span>}
                  </td>
                  <td data-label="Signed up">{formatDate(u.signedUpAt)}</td>
                  <td data-label="Last sign-in">{formatRelative(u.lastSignInAt, now)}</td>
                  <td data-label="Status">
                    <Pill tone={STATUS_TONES[u.status]}>{u.status[0].toUpperCase() + u.status.slice(1)}</Pill>
                  </td>
                  <td data-label="Product updates">{u.unsubscribed ? 'Unsubscribed' : 'Subscribed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="fd-footnote">
        Active = signed in within 30 days (same rule as campaign segments). Testers never count toward founder numbers.
      </p>
    </>
  )
}
