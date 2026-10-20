import { FlatList, StyleSheet, View } from 'react-native'
import { ScreenHeader } from '../components/Header'
import { useTheme } from '../components/ThemeProvider'
import { Card, GhostButton, T } from '../components/ui'
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
  onLoadMore,
}: {
  rows: HistoryRow[]
  olderLineVisible: boolean
  emptyLabel: string
  onOpenSettings: () => void
  onEdit: (row: HistoryRow) => void
  onDelete: (row: HistoryRow) => void
  onLoadMore?: () => void
}) {
  const { colors } = useTheme()
  return (
    <FlatList
      testID="history-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(row) => `${row.kind}-${row.id}`}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={5}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.header}>
          <ScreenHeader title="History" onAvatar={onOpenSettings} />
          {olderLineVisible ? (
            <View testID="older-entries">
              <T size={14} color={colors.blue}>{OLDER_ENTRIES_LINE}</T>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Card>
          <T color={colors.muted}>{emptyLabel}</T>
        </Card>
      }
      renderItem={({ item }) => (
        <View style={styles.block}>
          <EntryRow row={item} onPress={() => onEdit(item)} />
          <View style={styles.actions}>
            <GhostButton label="Edit" accessibilityLabel={`Edit ${item.title}`} onPress={() => onEdit(item)} />
            <GhostButton label="Delete" accessibilityLabel={`Delete ${item.title}`} danger onPress={() => onDelete(item)} />
          </View>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    padding: 20,
    paddingBottom: 48,
  },
  header: {
    gap: 12,
    marginBottom: 12,
  },
  block: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
})
