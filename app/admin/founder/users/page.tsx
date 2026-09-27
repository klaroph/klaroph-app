import { requireFounder } from '@/lib/founder/access'
import { loadFounderSnapshot } from '@/lib/founder/data'
import { filterUsers, isUserFilter, type UserFilter } from '@/lib/founder/userList'
import { formatCount } from '@/lib/founder/format'
import { DockHeader, UnavailableNote } from '@/components/founder/DockUI'
import UsersExplorer from '@/components/founder/UsersExplorer'

type PageProps = { searchParams: Promise<{ filter?: string; q?: string }> }

export default async function FounderUsersPage({ searchParams }: PageProps) {
  const founder = await requireFounder()
  const params = await searchParams
  const filter: UserFilter = isUserFilter(params.filter) ? params.filter : 'all'
  const query = (params.q ?? '').slice(0, 100)
  const s = await loadFounderSnapshot()
  const { total, active, pro } = s.userSummary

  return (
    <>
      <DockHeader
        eyebrow="Users"
        title={`${formatCount(total)} KlaroPH users`}
        subtitle="Account and plan visibility only — no financial records."
        meta={`${formatCount(pro.total)} Pro · ${formatCount(active)} active · ${formatCount(filterUsers(s.users, 'dormant').length)} dormant`}
      />
      <UnavailableNote sources={s.unavailable} />
      <UsersExplorer users={s.users} now={s.now} founderId={founder.id} initialFilter={filter} initialQuery={query} />
      <p className="fd-footnote">
        Active = signed in within 30 days (same rule as campaign segments). Testers never count toward founder numbers.
      </p>
    </>
  )
}
