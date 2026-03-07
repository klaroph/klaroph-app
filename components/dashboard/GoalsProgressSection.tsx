'use client'

import { useState } from 'react'
import GoalList from '../goals/GoalList'
import NewGoalModal from './NewGoalModal'

type GoalsProgressSectionProps = {
  refreshTrigger: number
  onGoalCreated: () => void
}

export default function GoalsProgressSection({ refreshTrigger, onGoalCreated }: GoalsProgressSectionProps) {
  const [newGoalModalOpen, setNewGoalModalOpen] = useState(false)

  const handleGoalCreated = () => {
    setNewGoalModalOpen(false)
    onGoalCreated()
  }

  return (
    <section
      style={{
        marginBottom: 24,
        padding: 24,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        borderLeft: '4px solid #059669',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
          Goals & progress
        </h2>
        <button
          type="button"
          onClick={() => setNewGoalModalOpen(true)}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            border: 'none',
            borderRadius: 8,
            backgroundColor: '#059669',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          New goal
        </button>
      </div>
      <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
        Savings come first. Set goals and watch your progress—one step at a time.
      </p>
      <GoalList refreshTrigger={refreshTrigger} />
      <NewGoalModal
        isOpen={newGoalModalOpen}
        onClose={() => setNewGoalModalOpen(false)}
        onGoalCreated={handleGoalCreated}
      />
    </section>
  )
}
