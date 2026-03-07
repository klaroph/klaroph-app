'use client'

type CardProps = {
  children: React.ReactNode
  style?: React.CSSProperties
}

export default function Card({ children, style = {} }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
