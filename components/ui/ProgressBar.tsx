'use client'

type ProgressBarProps = {
  value: number
  max?: number
  style?: React.CSSProperties
}

export default function ProgressBar({ value, max = 100, style = {} }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0

  return (
    <div
      style={{
        height: 10,
        backgroundColor: 'var(--border)',
        borderRadius: 999,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: 'var(--color-blue)',
          borderRadius: 999,
          transition: 'width 0.35s ease',
        }}
      />
    </div>
  )
}
