'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  filterUsers,
  isPro,
  PLAN_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  USER_FILTERS,
  type FounderUser,
  type UserFilter,
} from '@/lib/founder/userList'
import { formatDate, formatRelative } from '@/lib/founder/format'
import { ActionResultNote, Pill, type ActionResult } from '@/components/founder/DockUI'
import UserManageDialog from '@/components/founder/UserManageDialog'

const FILTER_LABELS: Record<UserFilter, string> = {
  all: 'All',
  free: 'Free',
  pro: 'Pro',
  new: 'New',
  active: 'Active',
  dormant: 'Dormant',
  testers: 'Testers',
}

type Props = { users: FounderUser[]; now: string; founderId: string; initialFilter: UserFilter; initialQuery: string }

/** Filters the already-loaded snapshot in the browser: typing never refetches or reloads. */
export default function UsersExplorer({ users, now: nowIso, founderId, initialFilter, initialQuery }: Props) {
  const [filter, setFilter] = useState<UserFilter>(initialFilter)
  const [query, setQuery] = useState(initialQuery)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<ActionResult | null>(null)
  const now = useMemo(() => new Date(nowIso), [nowIso])

  const counts = useMemo(
    () => Object.fromEntries(USER_FILTERS.map((f) => [f, filterUsers(users, f).length])) as Record<UserFilter, number>,
    [users]
  )
  const rows = useMemo(() => filterUsers(users, filter, query), [users, filter, query])
  const selected = selectedId ? users.find((u) => u.id === selectedId) ?? null : null

  useEffect(() => {
    const qs = new URLSearchParams()
    if (filter !== 'all') qs.set('filter', filter)
    if (query.trim()) qs.set('q', query.trim())
    const str = qs.toString()
    window.history.replaceState(null, '', `/admin/founder/users${str ? `?${str}` : ''}`)
  }, [filter, query])

  return (
    <>
      <div className="fd-toolbar">
        <div className="fd-chips" role="group" aria-label="Filter users">
          {USER_FILTERS.map((f) => (
            <button key={f} type="button" className={`fd-chip${f === filter ? ' is-active' : ''}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
              <span className="fd-chip-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="fd-search">
          <svg className="fd-search-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden>
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 100))}
            placeholder="Search name or email…"
            aria-label="Search users by name or email"
            className="fd-input"
          />
        </label>
      </div>

      <ActionResultNote result={notice} />

      <div className="fd-card fd-table-card">
        {rows.length === 0 ? (
          <p className="fd-empty">No users match this view.</p>
        ) : (
          <table className="fd-table fd-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th className="fd-col-secondary">Signed up</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th className="fd-col-secondary">Product updates</th>
                <th aria-label="Actions" />
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
                  <td data-label="Signed up" className="fd-col-secondary">
                    {formatDate(u.signedUpAt)}
                  </td>
                  <td data-label="Last sign-in">{formatRelative(u.lastSignInAt, now)}</td>
                  <td data-label="Status">
                    <Pill tone={STATUS_TONES[u.status]}>{STATUS_LABELS[u.status]}</Pill>
                  </td>
                  <td data-label="Product updates" className="fd-col-secondary">
                    <Pill tone={u.unsubscribed ? 'unknown' : 'ok'}>{u.unsubscribed ? 'Unsubscribed' : 'Subscribed'}</Pill>
                  </td>
                  <td data-label="Actions" className="fd-row-actions">
                    <button
                      type="button"
                      className="fd-btn fd-btn-ghost fd-btn-sm"
                      onClick={() => {
                        setNotice(null)
                        setSelectedId(u.id)
                      }}
                      aria-label={`Manage ${u.name ?? u.email}`}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <UserManageDialog
          key={selected.id}
          user={selected}
          isFounder={selected.id === founderId}
          onClose={() => setSelectedId(null)}
          onDeleted={(result) => {
            setSelectedId(null)
            setNotice(result)
          }}
        />
      )}
    </>
  )
}
