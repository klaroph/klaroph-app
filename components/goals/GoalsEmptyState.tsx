'use client'

type GoalsEmptyStateProps = {
  onAddClick?: () => void
}

export default function GoalsEmptyState({ onAddClick }: GoalsEmptyStateProps) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        backgroundColor: '#fafafa',
        border: '1px dashed #d1d5db',
        borderRadius: 12,
      }}
    >
      <p
        style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 17,
          fontWeight: 500,
          color: '#374151',
        }}
      >
        No goals yet
      </p>
      <p
        style={{
          margin: 0,
          marginBottom: 24,
          fontSize: 14,
          color: '#6b7280',
          lineHeight: 1.5,
        }}
      >
        Set your first savings goal and start building momentum.
      </p>
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 500,
            backgroundColor: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
          }}
        >
          Add your first goal
        </button>
      )}
    </div>
  )
}
