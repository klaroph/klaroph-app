import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../components/ThemeProvider'
import { Field, PrimaryButton, T } from '../components/ui'
import { errorText } from '../ui/format'
import { sanitizeAmountInput } from '../ui/quickAdd'

export function GoalSheet({
  title,
  initialName,
  initialTarget,
  onClose,
  onSave,
}: {
  title: string
  initialName: string
  initialTarget: string
  onClose: () => void
  onSave: (name: string, target: string) => void
}) {
  const { colors } = useTheme()
  const [name, setName] = useState(initialName)
  const [target, setTarget] = useState(initialTarget)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function save() {
    setSaving(true)
    try {
      onSave(name, target)
    } catch (caught) {
      setSaving(false)
      setError(errorText(caught))
    }
  }

  return (
    <Sheet title={title} onClose={onClose} testID="goal-sheet">
      <View style={styles.body}>
        <Field label="Name" value={name} onChangeText={setName} autoFocus />
        <Field
          label="Target"
          value={target}
          onChangeText={(value) => setTarget(sanitizeAmountInput(value))}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        {error ? <T color={colors.danger}>{error}</T> : null}
        <PrimaryButton label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
      </View>
    </Sheet>
  )
}

export function DepositSheet({
  goalName,
  onClose,
  onSave,
}: {
  goalName: string
  onClose: () => void
  onSave: (amount: string) => void
}) {
  const { colors } = useTheme()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function save() {
    setSaving(true)
    try {
      onSave(amount)
    } catch (caught) {
      setSaving(false)
      setError(errorText(caught))
    }
  }

  return (
    <Sheet title={`Deposit to ${goalName}`} onClose={onClose} testID="deposit-sheet">
      <View style={styles.body}>
        <Field
          label="Amount"
          value={amount}
          onChangeText={(value) => setAmount(sanitizeAmountInput(value))}
          keyboardType="decimal-pad"
          autoFocus
          placeholder="0.00"
        />
        {error ? <T color={colors.danger}>{error}</T> : null}
        <PrimaryButton label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
})
