'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Card from '../ui/Card'
import Button from '../ui/Button'

type GoalFormProps = {
  onGoalCreated: () => void
}

export default function GoalForm({ onGoalCreated }: GoalFormProps) {
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('You must be logged in to create a goal.')
        setLoading(false)
        return
      }

      const amount = parseFloat(targetAmount)
      if (!name.trim() || isNaN(amount) || amount <= 0) {
        setError('Please enter a valid name and target amount.')
        setLoading(false)
        return
      }

      const { count } = await supabase
        .from('goals')
        .select('*', { count: 'exact', head: true })
      if ((count ?? 0) >= 3) {
        setError('Maximum 3 goals per user. Delete a goal to add another.')
        setLoading(false)
        return
      }

      const { error: insertError } = await supabase.from('goals').insert({
        user_id: user.id,
        name: name.trim(),
        target_amount: amount,
      })

      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }

      setName('')
      setTargetAmount('')
      onGoalCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    width: '100%',
    maxWidth: 280,
    fontSize: 14,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fff',
    fontFamily: 'inherit',
  }

  return (
    <Card style={{ padding: 24, marginBottom: 24 }}>
      <form onSubmit={handleSubmit}>
        <h3
          style={{
            margin: 0,
            marginBottom: 20,
            fontSize: 16,
            fontWeight: 600,
            color: '#6b7280',
          }}
        >
          New goal
        </h3>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="goal-name"
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 13,
              color: '#4b5563',
            }}
          >
            Goal name
          </label>
          <input
            id="goal-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="target-amount"
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 13,
              color: '#4b5563',
            }}
          >
            Target amount (₱)
          </label>
          <input
            id="target-amount"
            type="number"
            min="1"
            step="any"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            disabled={loading}
            style={inputStyle}
          />
        </div>
        {error && (
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 13,
              color: '#b91c1c',
            }}
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} variant="primary">
          {loading ? 'Adding...' : 'Add goal'}
        </Button>
      </form>
    </Card>
  )
}
