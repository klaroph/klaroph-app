import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../components/ThemeProvider'
import { Field, PrimaryButton, T } from '../components/ui'
import { PERIOD_BUDGET_LINE } from '../ui/copy'
import { errorText } from '../ui/format'
import { sanitizeAmountInput } from '../ui/quickAdd'

export function BudgetSheet({
  initialAmount,
  onClose,
  onSave,
}: {
  initialAmount: string
  onClose: () => void
  onSave: (amount: string) => void
}) {
  const { colors } = useTheme()
  const [amount, setAmount] = useState(initialAmount)
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
    <Sheet title="Pay period budget" onClose={onClose} testID="budget-sheet">
      <View style={styles.body}>
        <Field
          label="Amount"
          value={amount}
          onChangeText={(value) => setAmount(sanitizeAmountInput(value))}
          keyboardType="decimal-pad"
          autoFocus
          placeholder="0.00"
        />
        <T size={14} color={colors.muted}>{PERIOD_BUDGET_LINE}</T>
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
