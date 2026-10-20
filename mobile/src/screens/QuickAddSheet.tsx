import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../components/ThemeProvider'
import { T } from '../components/ui'
import { orderCategoryChips, repeatChips, type RepeatChip } from '../ui/chips'
import { iconForCategory, type CategoryIconName, type EntryKind } from '../ui/categories'
import { errorText, formatPesoShort, formatPrettyDate } from '../ui/format'
import { canShiftEntryDate, shiftIsoDate } from '../ui/historyWindow'
import type { HistoryRow } from '../ui/ledger'
import { canSaveQuickAdd, categoryForNewEntry, parseQuickAmount, sanitizeAmountInput, type EntryDraft } from '../ui/quickAdd'
import { previewLeftAfter } from '../ui/saveToast'
import type { SyncPill } from '../ui/syncStatus'
import { font, space } from '../ui/theme'

const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
] as const

export function QuickAddSheet({
  initial,
  today,
  cutoff,
  lastExpense,
  lastIncome,
  recent,
  moneyLeft,
  status,
  onClose,
  onSave,
  onDelete,
}: {
  initial: EntryDraft
  today: string
  cutoff: string | null
  lastExpense: string | null
  lastIncome: string | null
  recent: readonly HistoryRow[]
  moneyLeft: number | null
  status: SyncPill
  onClose: () => void
  onSave: (draft: EntryDraft) => void
  onDelete?: () => void
}) {
  const { colors } = useTheme()
  const [draft, setDraft] = useState(initial)
  const [showDate, setShowDate] = useState(false)
  const [noteOpen, setNoteOpen] = useState(initial.description.trim().length > 0)
  const [focusNote, setFocusNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = draft.id != null
  const chips = orderCategoryChips(draft.kind, draft.category, recent)
  const repeats = editing ? [] : repeatChips(recent.filter((row) => row.kind === draft.kind))
  const atMin = !canShiftEntryDate(draft.date, -1, today, cutoff)
  const atMax = !canShiftEntryDate(draft.date, 1, today, cutoff)
  const amount = parseQuickAmount(draft.amount)
  const preview = previewLeftAfter(moneyLeft, draft.kind, amount)
  const shown = draft.amount.length > 0 ? draft.amount : '0'
  const saveLabel = amount == null
    ? 'Save'
    : preview == null
      ? `Save ${formatPesoShort(amount)}`
      : `Save ${formatPesoShort(amount)} · ${formatPesoShort(preview)} left`

  function chooseKind(kind: EntryKind) {
    const last = kind === 'expense' ? lastExpense : lastIncome
    setDraft((current) => ({
      ...current,
      kind,
      category: categoryForNewEntry(kind, last),
    }))
  }

  function pushKey(key: string) {
    setDraft((current) => ({ ...current, amount: sanitizeAmountInput(`${current.amount}${key}`) }))
    setError(null)
  }

  function backspace() {
    setDraft((current) => ({ ...current, amount: current.amount.slice(0, -1) }))
  }

  function save(next: EntryDraft = draft) {
    if (!canSaveQuickAdd(next)) {
      setError('Enter an amount to save.')
      return
    }
    try {
      onSave(next)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  function repeat(chip: RepeatChip) {
    save({
      kind: chip.kind,
      amount: chip.amount.toFixed(2),
      category: chip.category,
      date: today,
      description: chip.kind === 'expense' ? chip.description : '',
    })
  }

  const offlineOk = status.tone === 'local' || status.tone === 'offline' || status.tone === 'off'
  const statusLabel = offlineOk ? 'Offline OK' : status.label

  return (
    <Sheet tall onClose={onClose} testID="quick-add-sheet" header={(
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[styles.iconButton, { backgroundColor: colors.background }]}>
          <MaterialCommunityIcons name="close" size={22} color={colors.text} />
        </Pressable>
        {editing ? (
          <T weight="bold">Edit entry</T>
        ) : (
          <View style={[styles.kinds, { backgroundColor: colors.background }]}>
            <KindButton label="Expense" selected={draft.kind === 'expense'} onPress={() => chooseKind('expense')} />
            <KindButton label="Income" selected={draft.kind === 'income'} onPress={() => chooseKind('income')} />
          </View>
        )}
        <View style={[styles.status, { backgroundColor: offlineOk ? colors.yellow : colors.okSoft }]}>
          <T size={12} weight="bold" color={offlineOk ? colors.onYellow : colors.ok}>{statusLabel}</T>
        </View>
      </View>
    )}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} style={styles.scroll}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change date" onPress={() => setShowDate((open) => !open)}>
          <T center color={colors.muted} weight="semibold">
            {`${draft.category} · ${draft.date === today ? 'Today' : formatPrettyDate(draft.date, true)}`}
          </T>
        </Pressable>
        <View style={styles.amountRow}>
          <T size={32} weight="bold" color={colors.blue}>₱</T>
          <TextInput
            accessibilityLabel="Amount"
            testID="quick-add-amount"
            value={draft.amount}
            onChangeText={(value) => {
              setDraft((current) => ({ ...current, amount: sanitizeAmountInput(value) }))
              setError(null)
            }}
            keyboardType="decimal-pad"
            inputMode="decimal"
            showSoftInputOnFocus={false}
            placeholder="0"
            placeholderTextColor={colors.blue}
            cursorColor={colors.yellow}
            selectionColor={colors.yellow}
            style={[styles.amount, { color: colors.blue, fontFamily: font.bold, width: Math.min(220, Math.max(28, shown.length * 24)) }]}
          />
        </View>
        {showDate ? (
          <View style={styles.stepper}>
            <Step label="Previous day" glyph="−" disabled={atMin} onPress={() => setDraft((current) => ({ ...current, date: shiftIsoDate(current.date, -1) }))} />
            <T weight="semibold">{formatPrettyDate(draft.date, true)}</T>
            <Step label="Next day" glyph="+" disabled={atMax} onPress={() => setDraft((current) => ({ ...current, date: shiftIsoDate(current.date, 1) }))} />
          </View>
        ) : null}
        {cutoff && showDate ? <T size={13} color={colors.muted} center>{`Dates start at ${formatPrettyDate(cutoff, true)} on Free.`}</T> : null}
        <View style={styles.flexGap} />
        {draft.kind === 'expense' ? (
          noteOpen ? (
            <TextInput
              accessibilityLabel="Note"
              value={draft.description}
              onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
              placeholder="Note"
              placeholderTextColor={colors.muted}
              autoFocus={focusNote}
              style={[styles.note, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, fontFamily: font.regular }]}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add note"
              onPress={() => {
                setNoteOpen(true)
                setFocusNote(true)
              }}
              style={[styles.noteButton, { backgroundColor: colors.background }]}
            >
              <T weight="bold" color={colors.blue}>+ Add note (optional)</T>
            </Pressable>
          )
        ) : null}
        {repeats.length > 0 ? (
          <View style={styles.section}>
            <T size={12} weight="bold" color={colors.muted} style={styles.kicker}>REPEAT RECENT</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repeatRow}>
              {repeats.map((chip) => (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Repeat ${chip.label}`}
                  onPress={() => repeat(chip)}
                  style={[styles.repeat, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <CategoryDot name={chip.icon} />
                  <T size={14} weight="semibold">{chip.label}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <View style={styles.section}>
          <T size={12} weight="bold" color={colors.muted} style={styles.kicker}>CATEGORY</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            {chips.map((chip) => (
              <CategoryChoice
                key={chip}
                label={chip}
                icon={iconForCategory(chip, draft.kind)}
                selected={draft.category === chip}
                onPress={() => setDraft((current) => ({ ...current, category: chip }))}
              />
            ))}
          </ScrollView>
        </View>
        {error ? <T color={colors.danger} center>{error}</T> : null}
      </ScrollView>
      <View style={styles.keypad}>
        {KEY_ROWS.map((row) => (
          <View key={row.join('')} style={styles.keyRow}>
            {row.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === 'back' ? 'Backspace' : key}
                onPress={() => (key === 'back' ? backspace() : pushKey(key))}
                style={({ pressed }) => [styles.key, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}
              >
                {key === 'back' ? (
                  <MaterialCommunityIcons name="backspace-outline" size={22} color={colors.text} />
                ) : (
                  <T size={22} weight="bold">{key}</T>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {editing && onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmDelete ? 'Confirm delete' : 'Delete entry'}
          onPress={() => {
            if (!confirmDelete) {
              setConfirmDelete(true)
              return
            }
            onDelete()
          }}
          style={styles.deleteEntry}
        >
          <T weight="bold" color={colors.danger} center>{confirmDelete ? 'Confirm delete' : 'Delete'}</T>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saveLabel}
        testID="quick-add-save"
        onPress={() => save()}
        style={({ pressed }) => [styles.save, { backgroundColor: colors.blue, opacity: pressed ? 0.9 : 1 }]}
      >
        <T size={16} weight="bold" color={colors.onBlue} center numberOfLines={1}>{saveLabel}</T>
      </Pressable>
    </Sheet>
  )
}

function KindButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.kind, { backgroundColor: selected ? colors.blue : 'transparent' }]}
    >
      <T size={14} weight="bold" color={selected ? colors.onBlue : colors.muted}>{label}</T>
    </Pressable>
  )
}

function Step({ label, glyph, disabled, onPress }: { label: string; glyph: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.step, { opacity: disabled ? 0.35 : 1, borderColor: colors.border }]}
    >
      <T size={20} weight="bold">{glyph}</T>
    </Pressable>
  )
}

function CategoryDot({ name }: { name: CategoryIconName }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.dot, { backgroundColor: colors.blueSoft }]}>
      <MaterialCommunityIcons name={name} size={16} color={colors.blue} />
    </View>
  )
}

function CategoryChoice({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string
  icon: CategoryIconName
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={styles.choice}>
      <View style={[styles.choiceIcon, { backgroundColor: selected ? colors.blue : colors.blueSoft }]}>
        <MaterialCommunityIcons name={icon} size={22} color={selected ? colors.onBlue : colors.blue} />
      </View>
      <T size={11} weight="semibold" center color={selected ? colors.blue : colors.muted} style={styles.choiceLabel}>{label}</T>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kinds: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
  },
  kind: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    borderRadius: 999,
    paddingHorizontal: 10,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  body: {
    flexGrow: 1,
    gap: space.sm,
    paddingBottom: 0,
  },
  flexGap: {
    flex: 1,
    minHeight: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  amount: {
    fontSize: 40,
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteButton: {
    alignSelf: 'center',
    borderRadius: 999,
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  section: {
    gap: 8,
  },
  kicker: {
    letterSpacing: 0.6,
  },
  repeatRow: {
    gap: 8,
    paddingVertical: 2,
  },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categories: {
    gap: 10,
    paddingVertical: 2,
  },
  choice: {
    width: 92,
    alignItems: 'center',
    gap: 6,
  },
  choiceIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceLabel: {
    width: 92,
  },
  deleteEntry: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypad: {
    gap: 8,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  save: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
})
