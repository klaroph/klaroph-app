import Link from 'next/link'
import { requireFounder } from '@/lib/founder/access'
import { loadSupportThreads } from '@/lib/founder/supportData'
import {
  filterSupportThreads,
  isStalePending,
  isSupportFilter,
  isUuid,
  sortSupportThreads,
  SUPPORT_FILTERS,
  SUPPORT_REPLY_MAX,
  type SupportFilter,
  type SupportThread,
} from '@/lib/founder/support'
import { formatCountOf, formatDateTime, formatRelative } from '@/lib/founder/format'
import { DockHeader, Pill, UnavailableNote } from '@/components/founder/DockUI'
import { RetryReplyButton, SupportReplyForm, SupportStatusButton } from '@/components/founder/SupportControls'

const FILTER_LABELS: Record<SupportFilter, string> = { open: 'Open', resolved: 'Resolved', all: 'All' }
const DAY_MS = 24 * 60 * 60 * 1000

function waitingLabel(createdAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(createdAt)) / DAY_MS)
  return days < 1 ? 'Waiting less than a day' : `Waiting ${formatCountOf(days, 'day')}`
}

type PageProps = { searchParams: Promise<{ filter?: string; q?: string; id?: string }> }

export default async function FounderSupportPage({ searchParams }: PageProps) {
  await requireFounder()
  const params = await searchParams
  const filter: SupportFilter = isSupportFilter(params.filter) ? params.filter : 'open'
  const query = (params.q ?? '').slice(0, 100)
  const now = new Date()

  let threads: SupportThread[] = []
  let loadFailed = false
  try {
    threads = sortSupportThreads(await loadSupportThreads())
  } catch (e) {
    console.error(`[founder-dock] Support requests failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    loadFailed = true
  }

  const rows = filterSupportThreads(threads, filter, query)
  const selected = (isUuid(params.id) ? threads.find((t) => t.id === params.id) : undefined) ?? rows[0]
  const openCount = filterSupportThreads(threads, 'open', '').length

  const href = (next: { filter?: SupportFilter; id?: string }) => {
    const qs = new URLSearchParams()
    const f = next.filter ?? filter
    if (f !== 'open') qs.set('filter', f)
    if (query) qs.set('q', query)
    if (next.id) qs.set('id', next.id)
    const str = qs.toString()
    return `/admin/founder/support${str ? `?${str}` : ''}`
  }

  return (
    <>
      <DockHeader
        eyebrow="Support"
        title={openCount === 0 ? 'Support inbox is clear' : `${formatCountOf(openCount, 'open request')}`}
        subtitle="Replies are emailed to the address on the request. Only the request and its replies are shown here."
      />
      <UnavailableNote sources={loadFailed ? ['Support requests'] : []} />

      <div className="fd-toolbar">
        <nav className="fd-chips" aria-label="Filter support requests">
          {SUPPORT_FILTERS.map((f) => (
            <Link key={f} href={href({ filter: f })} className={`fd-chip${f === filter ? ' is-active' : ''}`} aria-current={f === filter ? 'true' : undefined}>
              {FILTER_LABELS[f]}
              <span className="fd-chip-count">{filterSupportThreads(threads, f, '').length}</span>
            </Link>
          ))}
        </nav>
        <form className="fd-search" action="/admin/founder/support" method="get">
          {filter !== 'open' && <input type="hidden" name="filter" value={filter} />}
          <input type="search" name="q" defaultValue={query} placeholder="Search name, email or message" aria-label="Search support requests" className="fd-input" />
        </form>
      </div>

      <div className="fd-support">
        <nav className="fd-card fd-support-list" aria-label="Support requests">
          {rows.length === 0 ? (
            <p className="fd-empty">No requests match this view.</p>
          ) : (
            <ul>
              {rows.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`${href({ id: t.id })}#request`}
                    className={`fd-support-item${t.id === selected?.id ? ' is-active' : ''}`}
                    aria-current={t.id === selected?.id ? 'true' : undefined}
                  >
                    <span className="fd-support-item-head">
                      <span className="fd-user-name">
                        {t.name ?? <span className="fd-muted">No name</span>}
                        {t.isTester && <span className="fd-tag">Tester</span>}
                        {t.hasUnconfirmedReply && <span className="fd-tag">Unconfirmed reply</span>}
                      </span>
                      <Pill tone={t.status === 'open' ? 'warn' : 'ok'}>{t.status === 'open' ? 'Open' : 'Resolved'}</Pill>
                    </span>
                    <span className="fd-support-item-title">{t.title}</span>
                    <span className="fd-cell-sub">
                      {t.email ?? 'No email'} ·{' '}
                      {t.awaitingReply ? waitingLabel(t.createdAt, now) : `Last activity ${formatRelative(t.lastActivityAt, now)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <section className="fd-card fd-support-detail" id="request" aria-label="Selected support request">
          {selected ? <SupportDetail thread={selected} now={now} /> : <p className="fd-empty">Select a request to read it.</p>}
        </section>
      </div>
    </>
  )
}

function SupportDetail({ thread, now }: { thread: SupportThread; now: Date }) {
  return (
    <>
      <div className="fd-support-detail-head">
        <div>
          <h2 className="fd-support-detail-title">{thread.title}</h2>
          <Pill tone={thread.status === 'open' ? 'warn' : 'ok'}>{thread.status === 'open' ? 'Open' : 'Resolved'}</Pill>
        </div>
        <SupportStatusButton key={`${thread.id}-${thread.status}`} requestId={thread.id} status={thread.status} />
      </div>

      <dl className="fd-support-meta">
        <div>
          <dt>Requester</dt>
          <dd>
            {thread.name ?? 'No name'}
            {thread.isTester && <span className="fd-tag">Tester</span>}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{thread.email ?? 'No email'}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatDateTime(thread.createdAt)}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>{formatDateTime(thread.lastActivityAt)}</dd>
        </div>
      </dl>

      <ol className="fd-thread" aria-label="Conversation">
        <li className="fd-msg fd-msg-user">
          <p className="fd-msg-meta">
            {thread.name ?? 'User'} · {formatDateTime(thread.createdAt)}
          </p>
          <p className="fd-msg-body">{thread.message}</p>
        </li>
        {thread.replies.map((r) => {
          const stale = r.delivery === 'pending' && isStalePending(r.createdAt, now)
          return (
            <li key={r.id} className="fd-msg fd-msg-founder">
              <p className="fd-msg-meta">
                KlaroPH Support · {formatDateTime(r.createdAt)}
                {r.delivery === 'pending' && <Pill tone={stale ? 'bad' : 'warn'}>{stale ? 'Delivery not confirmed' : 'Sending…'}</Pill>}
              </p>
              <p className="fd-msg-body">{r.body}</p>
              {stale && <RetryReplyButton requestId={thread.id} replyId={r.id} body={r.body} />}
            </li>
          )
        })}
      </ol>

      {thread.email ? (
        <SupportReplyForm key={thread.id} requestId={thread.id} recipient={thread.email} maxLength={SUPPORT_REPLY_MAX} />
      ) : (
        <p className="fd-muted">This request has no email address, so it cannot be answered by email.</p>
      )}
    </>
  )
}
