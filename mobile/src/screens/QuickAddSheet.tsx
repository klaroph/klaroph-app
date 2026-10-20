import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../components/ThemeProvider'
import { Chip, PrimaryButton, T } from '../components/ui'
import {
  chipOptions,
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_INCOME_SOURCE,
  type EntryKind,
} from '../ui/categories'
import { errorText, formatPrettyDate } from '../ui/format'
import { shiftIsoDate } from '../ui/historyWindow'
import { canSaveQuickAdd, sanitizeAmountInput, type EntryDraft } from '../ui/quickAdd'
import { font } from '../ui/theme'

export function QuickAddSheet({
  initial,
  today,
  cutoff,
  onClose,
  onSave,
}: {
  initial: EntryDraft
  today: string
  cutoff: string | null
  onClose: () => void
  onSave: (draft: EntryDraft) => void
}) {
  const { colors } = useTheme()
  const [draft, setDraft] = useState(initial)
  const [showDate, setShowDate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editing = draft.id != null
  const chips = chipOptions(draft.kind, draft.category)
  const atMin = cutoff != null && draft.date <= cutoff

  function chooseKind(kind: EntryKind) {
    setDraft((current) => ({
      ...current,
      kind,
      category: chipOptions(kind, '').includes(current.category)
        ? current.category
        : kind === 'expense' ? DEFAULT_EXPENSE_CATEGORY : DEFAULT_INCOME_SOURCE,
    }))
  }

  function save() {
    if (!canSaveQuickAdd(draft)) {
      setError('Enter an amount to save.')
      return
    }
    setSaving(true)
    try {
      onSave(draft)
    } catch (caught) {
      setSaving(false)
      setError(errorText(caught))
    }
  }

  return (
    <Sheet title={editing ? 'Edit entry' : 'Add entry'} onClose={onClose} testID="quick-add-sheet">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <TextInput
          accessibilityLabel="Amount"
          testID="quick-add-amount"
          value={draft.amount}
          onChangeText={(amount) => setDraft((current) => ({ ...current, amount: sanitizeAmountInput(amount) }))}
          keyboardType="decimal-pad"
          autoFocus={!editing}
          placeholder="0.00"
          placeholderTextColor={colors.muted}
          style={[styles.amount, { color: colors.text, fontFamily: font.bold }]}
        />
        {editing ? null : (
          <View style={styles.kinds}>
            <Chip label="Expense" selected={draft.kind === 'expense'} onPress={() => chooseKind('expense')} />
            <Chip label="Income" selected={draft.kind === 'income'} onPress={() => chooseKind('income')} />
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((chip) => (
            <Chip
              key={chip}
              label={chip}
              selected={draft.category === chip}
              onPress={() => setDraft((current) => ({ ...current, category: chip }))}
            />
          ))}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Change date" onPress={() => setShowDate((open) => !open)}>
          <T weight="semibold" color={colors.blue}>
            {draft.date === today ? 'Today' : formatPrettyDate(draft.date, true)}
          </T>
        </Pressable>
        {showDate ? (
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              accessibilityState={{ disabled: atMin }}
              disabled={atMin}
              onPress={() => setDraft((current) => ({ ...current, date: shiftIsoDate(current.date, -1) }))}
              style={[styles.step, { opacity: atMin ? 0.35 : 1, borderColor: colors.border }]}
            >
              <T size={20} weight="bold">−</T>
            </Pressable>
            <T weight="semibold">{formatPrettyDate(draft.date, true)}</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              onPress={() => setDraft((current) => ({ ...current, date: shiftIsoDate(current.date, 1) }))}
              style={[styles.step, { borderColor: colors.border }]}
            >
              <T size={20} weight="bold">+</T>
            </Pressable>
          </View>
        ) : null}
        {cutoff && showDate ? <T size={13} color={colors.muted}>Dates start at {formatPrettyDate(cutoff, true)} on Free.</T> : null}
        {editing && draft.kind === 'expense' ? (
          <TextInput
            accessibilityLabel="Note"
            value={draft.description}
            onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
            placeholder="Note"
            placeholderTextColor={colors.muted}
            style={[styles.note, { color: colors.text, borderColor: colors.border, fontFamily: font.regular }]}
          />
        ) : null}
        {error ? <T color={colors.danger}>{error}</T> : null}
      </ScrollView>
      <PrimaryButton label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} testID="quick-add-save" />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
    paddingBottom: 8,
  },
  amount: {
    fontSize: 40,
    minHeight: 56,
  },
  kinds: {
    flexDirection: 'row',
    gap: 8,
  },
  chips: {
    gap: 8,
    paddingVertical: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
  },
})
