import Link from 'next/link'
import type { AttentionItem, HealthSignal, HealthTone } from '@/lib/founder/metrics'

export function DockHeader({
  eyebrow,
  title,
  subtitle,
  meta,
}: {
  eyebrow: string
  title: string
  subtitle?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <header className="fd-header">
      <p className="fd-eyebrow">{eyebrow}</p>
      <h1 className="fd-title">{title}</h1>
      {subtitle && <p className="fd-subtitle">{subtitle}</p>}
      {meta && <p className="fd-header-meta">{meta}</p>}
    </header>
  )
}

export function DockSection({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="fd-section">
      <div className="fd-section-head">
        <div>
          <h2 className="fd-section-title">{title}</h2>
          {hint && <p className="fd-section-hint">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function StatCard({ label, value, context }: { label: string; value: React.ReactNode; context?: React.ReactNode }) {
  return (
    <div className="fd-card fd-stat">
      <p className="fd-stat-label">{label}</p>
      <p className="fd-stat-value">{value}</p>
      {context && <p className="fd-stat-context">{context}</p>}
    </div>
  )
}

export function Pill({ tone, children }: { tone: HealthTone | 'info'; children: React.ReactNode }) {
  return <span className={`fd-pill fd-pill-${tone}`}>{children}</span>
}

export function SignalList({ signals }: { signals: HealthSignal[] }) {
  return (
    <ul className="fd-signals">
      {signals.map((s) => (
        <li key={s.label} className="fd-signal">
          <span className="fd-signal-label">{s.label}</span>
          <span className={`fd-signal-value fd-tone-${s.tone}`}>
            <span className="fd-dot" aria-hidden />
            {s.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="fd-attention-clear">
        <span className="fd-dot" aria-hidden />
        <div>
          <p className="fd-attention-title">No action needed</p>
          <p className="fd-attention-detail">Nothing in KlaroPH needs a founder decision right now.</p>
        </div>
      </div>
    )
  }
  return (
    <ul className="fd-attention">
      {items.map((item) => {
        const body = (
          <>
            <span className="fd-dot" aria-hidden />
            <div className="fd-attention-text">
              <p className="fd-attention-title">{item.title}</p>
              <p className="fd-attention-detail">{item.detail}</p>
            </div>
            {item.href && <span className="fd-attention-go" aria-hidden>→</span>}
          </>
        )
        return (
          <li key={item.id} className={`fd-attention-item fd-attention-${item.tone}`}>
            {item.href ? (
              <Link href={item.href} className="fd-attention-row">
                {body}
              </Link>
            ) : (
              <div className="fd-attention-row">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Outcome of a founder action. `warning` = it succeeded but something secondary (like an email) did not. */
export type ActionResult = { ok: boolean; message: string; warning?: boolean }

export function ActionResultNote({ result }: { result: ActionResult | null }) {
  if (!result) return null
  const tone = !result.ok ? 'is-error' : result.warning ? 'is-warn' : 'is-ok'
  return (
    <p className={`fd-action-result ${tone}`} role="status">
      {result.message}
    </p>
  )
}

export function UnavailableNote({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null
  return (
    <p className="fd-unavailable" role="status">
      Some data could not be loaded: {sources.join(', ')}. Affected numbers may be incomplete.
    </p>
  )
}
