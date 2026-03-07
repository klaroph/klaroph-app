'use client'

const MOCK_ARTICLES = [
  { title: 'Start with one goal', desc: 'Small steps build lasting habits.' },
  { title: 'Needs vs wants', desc: 'Learn to tell the difference and save more.' },
  { title: 'Your net worth', desc: 'Understanding assets and liabilities.' },
]

export default function LearningSection() {
  return (
    <section
      style={{
        marginBottom: 24,
        padding: 24,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        borderLeft: '4px solid #8b5cf6',
      }}
    >
      <h2 style={{ margin: 0, marginBottom: 8, fontSize: 18, fontWeight: 600, color: '#111827' }}>
        Learning
      </h2>
      <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
        Build your money mindset. Small lessons today lead to lasting financial habits.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {MOCK_ARTICLES.map((a, i) => (
          <div
            key={i}
            style={{
              padding: 20,
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
              {a.title}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>{a.desc}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
