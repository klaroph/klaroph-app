'use client'

type SectionProps = {
  title?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

export default function Section({ title, children, style = {} }: SectionProps) {
  return (
    <section style={{ marginBottom: 32, ...style }}>
      {title && (
        <h2
          style={{
            margin: 0,
            marginBottom: 16,
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
