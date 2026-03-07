'use client'

export default function WelcomeSection() {
  return (
    <div
      style={{
        marginBottom: 24,
        padding: 24,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        borderLeft: '4px solid var(--color-warning)',
      }}
    >
      <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        You're building your financial future. Every goal you set brings you closer.
      </p>
    </div>
  )
}
