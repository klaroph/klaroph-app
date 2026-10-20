import { StyleSheet, View } from 'react-native'
import { ScreenHeader } from '../components/Header'
import { useTheme } from '../components/ThemeProvider'
import { Card, GhostButton, ScreenScroll, T } from '../components/ui'
import { OLDER_ENTRIES_LINE } from '../ui/copy'
import type { HistoryRow } from '../ui/ledger'
import { EntryRow } from './HomeScreen'

export function HistoryScreen({
  rows,
  olderLineVisible,
  emptyLabel,
  onOpenSettings,
  onEdit,
  onDelete,
}: {
  rows: HistoryRow[]
  olderLineVisible: boolean
  emptyLabel: string
  onOpenSettings: () => void
  onEdit: (row: HistoryRow) => void
  onDelete: (row: HistoryRow) => void
}) {
  const { colors } = useTheme()
  return (
    <ScreenScroll testID="history-screen">
      <ScreenHeader title="History" onAvatar={onOpenSettings} />
      {olderLineVisible ? (
        <View testID="older-entries">
          <T size={14} color={colors.blue}>{OLDER_ENTRIES_LINE}</T>
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Card>
          <T color={colors.muted}>{emptyLabel}</T>
        </Card>
      ) : (
        rows.map((row) => (
          <View key={`${row.kind}-${row.id}`} style={styles.block}>
            <EntryRow row={row} onPress={() => onEdit(row)} />
            <View style={styles.actions}>
              <GhostButton label="Edit" accessibilityLabel={`Edit ${row.title}`} onPress={() => onEdit(row)} />
              <GhostButton label="Delete" accessibilityLabel={`Delete ${row.title}`} danger onPress={() => onDelete(row)} />
            </View>
          </View>
        ))
      )}
    </ScreenScroll>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: 0,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: -4,
  },
})
