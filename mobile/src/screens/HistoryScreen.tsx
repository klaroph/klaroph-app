import { useRef, useState, type ReactNode } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View, type GestureResponderEvent } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { ScreenHeader } from '../components/Header'
import { useTheme } from '../components/ThemeProvider'
import { Card, Chip, T } from '../components/ui'
import { OLDER_ENTRIES_LINE } from '../ui/copy'
import { filterHistoryRows, groupHistoryByDay, type HistoryDay, type HistoryFilter } from '../ui/historyGroups'
import type { HistoryRow } from '../ui/ledger'
import type { SyncPill } from '../ui/syncStatus'
import { font, space } from '../ui/theme'
import { EntryRow, ignoreEntryPressAfterSwipe, resetEntryPressIgnore } from './HomeScreen'

const FILTERS: readonly { id: HistoryFilter; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'window', label: '90 days' },
]

export function HistoryScreen({
  rows,
  olderLineVisible,
  emptyLabel,
  pill,
  today = '',
  month = null,
  revealFirst = false,
  onOpenSettings,
  onEdit,
  onDelete,
  onLoadMore,
}: {
  rows: HistoryRow[]
  olderLineVisible: boolean
  emptyLabel: string
  pill?: SyncPill
  today?: string
  month?: { start: string; end: string } | null
  revealFirst?: boolean
  onOpenSettings: () => void
  onEdit: (row: HistoryRow) => void
  onDelete: (row: HistoryRow) => void
  onLoadMore?: () => void
}) {
  const { colors } = useTheme()
  const [filter, setFilter] = useState<HistoryFilter>('month')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const visible = filterHistoryRows(rows, filter, query, month)
  const days = groupHistoryByDay(visible, today)
  return (
    <FlatList
      testID="history-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={days}
      keyExtractor={(day) => day.date}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={5}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.header}>
          <ScreenHeader title="History" pill={pill} onAvatar={onOpenSettings} />
          <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            <TextInput
              accessibilityLabel="Search notes, categories"
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes, categories"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text, fontFamily: font.regular }]}
            />
            <View accessibilityRole="image" accessibilityLabel="Filter" style={[styles.filterIcon, { backgroundColor: colors.blue }]}>
              <MaterialCommunityIcons name="filter-variant" size={18} color={colors.onBlue} />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                tone="yellow"
                dense
                selected={filter === item.id}
                onPress={() => setFilter(item.id)}
              />
            ))}
          </ScrollView>
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
      renderItem={({ item, index }) => (
        <DayBlock
          day={item}
          first={index === 0}
          openKey={openKey}
          revealFirst={revealFirst && openKey === null}
          onOpen={(key) => setOpenKey(key)}
          onClose={() => setOpenKey('')}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    />
  )
}

function DayBlock({
  day,
  first,
  openKey,
  revealFirst,
  onOpen,
  onClose,
  onEdit,
  onDelete,
}: {
  day: HistoryDay
  first: boolean
  openKey: string | null
  revealFirst: boolean
  onOpen: (key: string) => void
  onClose: () => void
  onEdit: (row: HistoryRow) => void
  onDelete: (row: HistoryRow) => void
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.day}>
      <View style={styles.dayHead}>
        <T size={12} weight="bold" color={colors.muted}>{day.title}</T>
        <T size={13} weight="bold" color={day.total > 0 ? colors.ok : colors.text}>{day.totalLabel}</T>
      </View>
      <Card style={styles.dayCard}>
        {day.rows.map((row, index) => {
          const key = `${row.kind}-${row.id}`
          const open = openKey === key || (revealFirst && first && index === 0)
          return (
            <SwipeRow
              key={key}
              open={open}
              onOpen={() => onOpen(key)}
              onClose={onClose}
              onDelete={() => onDelete(row)}
              deleteLabel={`Delete ${row.title}`}
            >
              <EntryRow
                row={row}
                grouped
                divider={index < day.rows.length - 1}
                onPress={() => (open ? onClose() : onEdit(row))}
              />
            </SwipeRow>
          )
        })}
      </Card>
    </View>
  )
}

function SwipeRow({
  open,
  onOpen,
  onClose,
  onDelete,
  deleteLabel,
  children,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
  onDelete: () => void
  deleteLabel: string
  children: ReactNode
}) {
  const drag = useRef(0)
  const origin = useRef<{ x: number; y: number } | null>(null)
  function track(event: GestureResponderEvent): { dx: number; dy: number } {
    const x = event.nativeEvent.pageX
    const y = event.nativeEvent.pageY
    if (origin.current == null) origin.current = { x, y }
    return { dx: x - origin.current.x, dy: y - origin.current.y }
  }
  function reset() {
    drag.current = 0
    origin.current = null
  }
  return (
    <View
      style={styles.swipeHost}
      onStartShouldSetResponderCapture={(event) => {
        origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
        drag.current = 0
        resetEntryPressIgnore()
        return false
      }}
      onMoveShouldSetResponderCapture={(event) => {
        const { dx, dy } = track(event)
        return dx < -12 && Math.abs(dx) > Math.abs(dy)
      }}
      onResponderMove={(event) => {
        drag.current = track(event).dx
        if (drag.current < -24) ignoreEntryPressAfterSwipe()
      }}
      onResponderRelease={() => {
        if (drag.current < -48) onOpen()
        else onClose()
        reset()
      }}
      onResponderTerminate={reset}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        aria-hidden={open ? undefined : true}
        onPress={onDelete}
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.delete, { opacity: open ? 1 : 0 }]}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFFFFF" />
        <T size={12} weight="bold" color="#FFFFFF">Delete</T>
      </Pressable>
      <View style={{ transform: [{ translateX: open ? -84 : 0 }] }}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    padding: space.lg,
    paddingBottom: 120,
  },
  header: {
    gap: space.md,
    marginBottom: space.sm,
  },
  search: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
  },
  filterIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  day: {
    gap: 6,
    marginBottom: space.md,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dayCard: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  swipeHost: {
    position: 'relative',
    overflow: 'hidden',
  },
  delete: {
    position: 'absolute',
    right: 0,
    top: 6,
    bottom: 6,
    width: 76,
    borderRadius: 16,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
})
