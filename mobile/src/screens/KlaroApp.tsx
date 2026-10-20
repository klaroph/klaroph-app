import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AppRuntime } from '../runtime/runtime'
import { SaveToast } from '../components/SaveToast'
import { useTheme } from '../components/ThemeProvider'
import { TabBar, type TabId } from '../components/TabBar'
import { roundMoney } from '../domain/money'
import { payPeriodAt } from '../domain/payPeriod'
import { commitDeleteEntry, commitDeleteGoal, commitDeposit, commitEntry, commitGoal, commitPeriodBudget } from '../ui/actions'
import type { SignInResult } from '../ui/accountFlow'
import { ISOLATED_ACCOUNT_NOTICE, SIGN_OUT_WARNING } from '../ui/copy'
import { errorText } from '../ui/format'
import { canAddGoal, engineGoalMessage, scrubGoalCopy, visibleGoalBanner } from '../ui/goalCopy'
import { haptic } from '../ui/haptics'
import { manilaToday, shiftIsoDate } from '../ui/historyWindow'
import {
  applyHistoryChange,
  hasUnsyncedChanges,
  HISTORY_PAGE_SIZE,
  loadLedger,
  pageHistory,
  patchHome,
  type EntryChange,
  type GoalCard,
  type HistoryCursor,
  type HistoryRow,
  type LedgerSnapshot,
} from '../ui/ledger'
import { manilaGreeting } from '../ui/payday'
import { newEntryDraft, type EntryDraft } from '../ui/quickAdd'
import { moneyLeft, toastForSave, undoSavedEntry } from '../ui/saveToast'
import { SUGGESTED_PERIOD_BUDGET, type StarterGoal } from '../ui/starters'
import { motion } from '../ui/theme'
import { subscribeSyncActivity } from '../sync/activity'
import { budgetsKeptFromAccountLine, movedToAccountLine } from '../sync/summary'
import { reportLooksOffline, syncNotices, syncPill, uniqueLines } from '../ui/syncStatus'
import { BudgetSheet } from './BudgetSheet'
import { FirstRun } from './FirstRun'
import { DepositSheet, GoalSheet } from './GoalSheets'
import { GoalsScreen } from './GoalsScreen'
import { HistoryScreen } from './HistoryScreen'
import { HomeScreen } from './HomeScreen'
import { QuickAddSheet } from './QuickAddSheet'
import { SettingsSheet } from './SettingsSheet'

type Overlay =
  | { type: 'settings' }
  | { type: 'quick-add' }
  | { type: 'edit-entry'; row: HistoryRow }
  | { type: 'budget' }
  | { type: 'add-goal' }
  | { type: 'edit-goal'; goal: GoalCard }
  | { type: 'deposit'; goal: GoalCard }

function historyDraft(row: HistoryRow): EntryDraft {
  return {
    kind: row.kind,
    id: row.id,
    amount: row.amount.toFixed(2),
    category: row.category,
    date: row.date,
    description: row.description,
  }
}

const SYNC_DEBOUNCE_MS = 1500
let historySeedStarted = false
let v2ShotStarted = false

type SaveNotice = { row: HistoryRow; message: string }

export function KlaroApp({ runtime }: { runtime: AppRuntime }) {
  const { repo, prefs } = runtime
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<TabId>('home')
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [engineMessage, setEngineMessage] = useState<string | null>(null)
  const [home, setHome] = useState<LedgerSnapshot>(() => readHome(repo, prefs))
  const [toast, setToast] = useState<SaveNotice | null>(null)
  const [quickRows, setQuickRows] = useState<HistoryRow[]>([])
  const [revealHistory, setRevealHistory] = useState(false)
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([])
  const [, setHistoryCursor] = useState<HistoryCursor | null>(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const refreshMeta = () => setRevision((value) => value + 1)
  const pending = hasUnsyncedChanges(repo)
  const unsyncedCount = repo.countUnsyncedRows()
  const signedIn = repo.sessionUserId() != null
  const plan = signedIn ? repo.knownPlan() : null
  const syncEnabled = prefs.syncEnabled()
  const pill = syncPill({ signedIn, syncEnabled, syncing, offline, pending })
  const banner = visibleGoalBanner({
    grace: home.grace,
    engineMessage,
    capMessage: home.capMessage,
    plan,
  })
  const introDone = prefs.firstRunDone()
  const syncingRef = useRef(false)
  const syncAgain = useRef(false)
  const launched = useRef(false)
  const syncRef = useRef<() => Promise<void>>(async () => undefined)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyReady = useRef(false)
  const historyHasMoreRef = useRef(false)
  const historyCursorRef = useRef<HistoryCursor | null>(null)
  const tabRef = useRef(tab)
  const loadingMore = useRef(false)
  const showHistoryPageRef = useRef<(before: HistoryCursor | null, append: boolean) => void>(() => undefined)

  const replaceHome = useCallback(() => {
    setHome(readHome(repo, prefs))
    setRevision((value) => value + 1)
  }, [repo, prefs])

  const showHistoryPage = useCallback((before: HistoryCursor | null, append: boolean) => {
    const page = pageHistory(repo, new Date(), before, HISTORY_PAGE_SIZE)
    historyReady.current = true
    setHistoryRows((current) => (append ? [...current, ...page.rows] : page.rows))
    setHistoryCursor(page.cursor)
    historyCursorRef.current = page.cursor
    setHistoryHasMore(page.hasMore)
    historyHasMoreRef.current = page.hasMore
  }, [repo])

  const noteHistoryStale = useCallback(() => {
    historyReady.current = false
    if (tabRef.current === 'history') showHistoryPage(null, false)
    else {
      setHistoryRows([])
      setHistoryCursor(null)
      historyCursorRef.current = null
      setHistoryHasMore(false)
      historyHasMoreRef.current = false
    }
  }, [showHistoryPage])

  function applyEntry(change: EntryChange) {
    const refill = change.type === 'delete' ? pageHistory(repo, new Date(), null, 5).rows : undefined
    setHome((current) => patchHome(current, change, refill))
    if (!historyReady.current) return
    setHistoryRows((current) => applyHistoryChange(current, change, historyHasMoreRef.current))
  }

  useEffect(() => subscribeSyncActivity((next) => {
    setSyncing(next === 'syncing')
  }), [])

  const runSync = useCallback(async () => {
    if (!repo.sessionUserId() || !prefs.syncEnabled()) return
    if (syncingRef.current) {
      syncAgain.current = true
      return
    }
    syncingRef.current = true
    try {
      const report = await runtime.sync()
      if (!report) {
        setNotices((current) => uniqueLines([...current, 'Sync needs a signed-in account and the publishable Supabase key.']))
        return
      }
      const known = repo.knownPlan()
      setEngineMessage(engineGoalMessage(report.errors, known))
      setOffline(reportLooksOffline(report))
      setNotices(uniqueLines(syncNotices(report).map((line) => scrubGoalCopy(line, known))))
    } catch (error) {
      setOffline(true)
      setNotices([scrubGoalCopy(errorText(error), repo.knownPlan())])
    } finally {
      syncingRef.current = false
      replaceHome()
      noteHistoryStale()
      if (syncAgain.current) {
        syncAgain.current = false
        void syncRef.current()
      }
    }
  }, [noteHistoryStale, prefs, replaceHome, repo, runtime])

  function scheduleSync() {
    if (!repo.sessionUserId() || !prefs.syncEnabled()) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null
      void syncRef.current()
    }, SYNC_DEBOUNCE_MS)
  }

  useEffect(() => {
    tabRef.current = tab
    historyHasMoreRef.current = historyHasMore
    syncRef.current = runSync
    showHistoryPageRef.current = showHistoryPage
  }, [tab, historyHasMore, runSync, showHistoryPage])

  useEffect(() => () => {
    if (syncTimer.current) clearTimeout(syncTimer.current)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), motion.dismiss)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!prefs.firstRunDone()) return
    if (launched.current) return
    launched.current = true
    if (repo.sessionUserId() && prefs.syncEnabled()) void syncRef.current()
  }, [revision, prefs, repo])

  useEffect(() => {
    if (tab !== 'history' || historyReady.current) return
    showHistoryPageRef.current(null, false)
  }, [tab])

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return
    const bench = globalThis as {
      __klaroBench?: (adds: number) => Promise<{ median: number; max: number; times: number[]; count: number }>
    }
    bench.__klaroBench = async (adds: number) => {
      const today = readHome(repo, prefs).today
      if (repo.countVisibleEntries() < 1000) repo.seedExpenses(1000 - repo.countVisibleEntries(), today)
      let view = readHome(repo, prefs)
      const times: number[] = []
      for (let index = 0; index < adds; index += 1) {
        const started = performance.now()
        const row = commitEntry(repo, { ...newEntryDraft(view.today, 'expense', prefs.lastCategory('expense')), amount: '12.50' }, new Date())
        view = patchHome(view, { type: 'insert', row })
        times.push(performance.now() - started)
        await new Promise((resolve) => { setTimeout(resolve, 0) })
      }
      const sorted = [...times].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length === 0 ? 0 : sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
      return { median, max: sorted[sorted.length - 1] ?? 0, times, count: repo.countVisibleEntries() }
    }
    const pullBench = globalThis as {
      __klaroPull?: (count: number) => Promise<{ count: number }>
    }
    pullBench.__klaroPull = async (count: number) => {
      const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      repo.setSessionUserId(userId)
      for (let index = 0; index < count; index += 1) {
        repo.applyServerRow('expenses', {
          table: 'expenses',
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          user_id: userId,
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          deleted_at: null,
          values: {
            category: 'Fare',
            type: 'needs',
            amount: '10.00',
            date: '2026-10-16',
            description: null,
          },
        })
        if ((index + 1) % 10 === 0) await new Promise((resolve) => { setTimeout(resolve, 0) })
      }
      noteHistoryStale()
      replaceHome()
      return { count: repo.countVisibleEntries() }
    }
    if (typeof location === 'undefined') return
    const shot = new URLSearchParams(location.search).get('shot')
    if (!shot) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!prefs.firstRunDone()) prefs.setFirstRunDone(true)
      repo.setSessionUserId(null)
      refreshMeta()
      const today = readHome(repo, prefs).today
      if (shot === 'cap') {
        const userId = repo.sessionUserId()
        const have = (userId ? repo.listLive('goals', userId).length : 0) + repo.listLive('goals', null).length
        for (let index = have; index < 2; index += 1) {
          repo.createGoal({ userId, name: index === 0 ? 'Emergency fund' : 'Tuition', targetAmount: 10000 })
        }
        replaceHome()
        setTab('goals')
      } else if (shot === 'total') {
        repo.createExpense({
          userId: repo.sessionUserId(),
          category: 'Rent',
          type: 'needs',
          amount: 1234567.89,
          date: today,
        })
        replaceHome()
      } else if (shot === 'history') {
        const seed = !historySeedStarted
        historySeedStarted = true
        void (async () => {
          try {
            if (seed) {
              await new Promise((resolve) => { setTimeout(resolve, 300) })
              const userId = repo.sessionUserId()
              while (repo.countVisibleEntries() < 1000) {
                repo.createExpense({
                  userId,
                  category: 'Groceries',
                  type: 'needs',
                  amount: 10,
                  date: today,
                })
                await new Promise((resolve) => { setTimeout(resolve, 0) })
              }
            } else {
              while (repo.countVisibleEntries() < 1000) {
                await new Promise((resolve) => { setTimeout(resolve, 50) })
              }
            }
            historyReady.current = false
            setTab('history')
          } catch (error) {
            setNotices([errorText(error)])
          }
        })()
      } else if (shot === 'v2-empty') {
        replaceHome()
      } else if (shot === 'v2-home' || shot === 'v2-add' || shot === 'v2-toast' || shot === 'v2-history') {
        if (v2ShotStarted) return
        v2ShotStarted = true
        seedV2Sample(repo, prefs)
        if (shot === 'v2-toast') {
          const now = new Date()
          const before = readHome(repo, prefs)
          const row = commitEntry(repo, {
            ...newEntryDraft(before.today, 'expense', 'Dining Out'),
            amount: '250',
            category: 'Dining Out',
            description: 'Jollibee',
          }, now)
          setHome(readHome(repo, prefs))
          setToast({
            row,
            message: toastForSave({ budget: before.budget, spentBefore: before.spent, row, period: before.period }).message,
          })
        } else {
          replaceHome()
        }
        if (shot === 'v2-add') {
          prefs.setLastCategory('expense', 'Groceries')
          setQuickRows(pageHistory(repo, new Date(), null, 100).rows)
          setOverlay({ type: 'quick-add' })
        }
        if (shot === 'v2-history') {
          historyReady.current = false
          setRevealHistory(true)
          setTab('history')
        }
      } else if (shot === 'merge') {
        const moved = movedToAccountLine(12, 2)
        const kept = budgetsKeptFromAccountLine(1)
        setNotices([moved, kept].filter((line): line is string => line != null))
        setOverlay({ type: 'settings' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [noteHistoryStale, prefs, replaceHome, repo])

  function finishLocal() {
    setOverlay(null)
    refreshMeta()
    scheduleSync()
  }

  function applySignIn(outcome: SignInResult) {
    const extra = [
      outcome.isolated ? ISOLATED_ACCOUNT_NOTICE : '',
      outcome.goalLimitMessage ?? '',
    ]
    const known = repo.knownPlan()
    setEngineMessage(outcome.goalLimitMessage ?? (outcome.report ? engineGoalMessage(outcome.report.errors, known) : null))
    setOffline(outcome.report ? reportLooksOffline(outcome.report) : false)
    setNotices(uniqueLines([...extra, ...(outcome.report ? syncNotices(outcome.report) : [])].map((line) => scrubGoalCopy(line, known))))
    replaceHome()
    noteHistoryStale()
  }

  function openAdd() {
    haptic('add')
    setQuickRows(pageHistory(repo, new Date(), null, 100).rows)
    setOverlay({ type: 'quick-add' })
  }

  function openEdit(row: HistoryRow) {
    setQuickRows(pageHistory(repo, new Date(), null, 100).rows)
    setOverlay({ type: 'edit-entry', row })
  }

  function deleteEntry(row: HistoryRow) {
    try {
      commitDeleteEntry(repo, row.kind, row.id, new Date())
      applyEntry({ type: 'delete', previous: row })
      setToast((current) => (current && current.row.id === row.id && current.row.kind === row.kind ? null : current))
      haptic('delete')
      finishLocal()
    } catch (error) {
      setNotices([errorText(error)])
    }
  }

  function undoToast() {
    if (!toast) return
    const current = toast
    setToast(null)
    try {
      undoSavedEntry(repo, current.row, new Date())
      applyEntry({ type: 'delete', previous: current.row })
      haptic('delete')
      scheduleSync()
    } catch (error) {
      setNotices([errorText(error)])
    }
  }

  function addStarter(goal: StarterGoal) {
    try {
      commitGoal(repo, { name: goal.name, target: goal.target })
      replaceHome()
      scheduleSync()
    } catch (error) {
      setNotices([errorText(error)])
    }
  }

  function useSuggestedBudget() {
    commitPeriodBudget(prefs, home.period.start, String(SUGGESTED_PERIOD_BUDGET))
    replaceHome()
  }

  function confirmDeleteGoal(goal: GoalCard) {
    Alert.alert('Delete goal?', 'This removes the goal and its deposits from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            commitDeleteGoal(repo, goal.id)
            replaceHome()
            setOverlay(null)
            scheduleSync()
          } catch (error) {
            setNotices([errorText(error)])
          }
        },
      },
    ])
  }

  function deleteUnsyncedAndSignOut() {
    repo.discardUnsyncedRows()
    void runtime.signOut().then(() => {
      setEngineMessage(null)
      setNotices([])
      setOffline(false)
      setOverlay(null)
      setTab('home')
      replaceHome()
      noteHistoryStale()
    })
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', SIGN_OUT_WARNING, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void runtime.signOut().then(() => {
            setEngineMessage(null)
            setNotices([])
            setOffline(false)
            setOverlay(null)
            setTab('home')
            replaceHome()
            noteHistoryStale()
          })
        },
      },
    ])
  }

  if (!introDone) {
    return (
      <FirstRun
        onDone={() => {
          prefs.setFirstRunDone(true)
          replaceHome()
        }}
      />
    )
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.body}>
        {tab === 'home' ? (
          <HomeScreen
            snapshot={home}
            pill={pill}
            greeting={manilaGreeting(new Date())}
            onOpenSettings={() => setOverlay({ type: 'settings' })}
            onOpenEntry={openEdit}
            onEditBudget={() => setOverlay({ type: 'budget' })}
            onUseSuggestedBudget={useSuggestedBudget}
            onSeeAll={() => setTab('history')}
            onAdd={openAdd}
            onAddStarter={addStarter}
            onCustomGoal={() => setOverlay({ type: 'add-goal' })}
          />
        ) : null}
        {tab === 'history' ? (
          <HistoryScreen
            rows={historyRows}
            olderLineVisible={home.olderLineVisible}
            emptyLabel={home.freeHistory ? 'No entries in the last 90 days.' : 'No entries yet.'}
            pill={pill}
            today={home.today}
            period={home.period}
            revealFirst={revealHistory}
            onOpenSettings={() => setOverlay({ type: 'settings' })}
            onEdit={openEdit}
            onDelete={deleteEntry}
            onLoadMore={() => {
              if (loadingMore.current || !historyHasMoreRef.current || !historyCursorRef.current) return
              loadingMore.current = true
              showHistoryPage(historyCursorRef.current, true)
              loadingMore.current = false
            }}
          />
        ) : null}
        {tab === 'goals' ? (
          <GoalsScreen
            goals={home.goals}
            banner={banner}
            canAdd={canAddGoal(banner)}
            pill={pill}
            onOpenSettings={() => setOverlay({ type: 'settings' })}
            onAdd={() => setOverlay({ type: 'add-goal' })}
            onAddStarter={addStarter}
            onDeposit={(goal) => setOverlay({ type: 'deposit', goal })}
            onEdit={(goal) => setOverlay({ type: 'edit-goal', goal })}
            onDelete={confirmDeleteGoal}
          />
        ) : null}
      </View>
      <TabBar
        tab={tab}
        onTab={setTab}
        onAdd={openAdd}
      />
      {toast ? (
        <View pointerEvents="box-none" style={styles.toastSlot}>
          <SaveToast message={toast.message} onUndo={undoToast} />
        </View>
      ) : null}
      {overlay ? (
        <OverlaySheet
          overlay={overlay}
          today={home.today}
          cutoff={home.freeHistory ? home.cutoff : null}
          lastExpense={prefs.lastCategory('expense')}
          lastIncome={prefs.lastCategory('income')}
          localBudget={formatStoredBudget(prefs.periodBudget(home.period.start))}
          recent={quickRows}
          moneyLeft={draftMoneyLeft(home, overlay.type === 'edit-entry' ? overlay.row : null)}
          status={pill}
          onClose={() => setOverlay(null)}
          onSaveEntry={(draft) => {
            const previous = draft.id
              ? historyRows.find((row) => row.id === draft.id && row.kind === draft.kind)
                ?? home.recent.find((row) => row.id === draft.id && row.kind === draft.kind)
              : undefined
            const row = commitEntry(repo, draft, new Date())
            prefs.setLastCategory(draft.kind, draft.category)
            if (draft.id && previous) applyEntry({ type: 'update', row, previous })
            else if (draft.id) replaceHome()
            else {
              applyEntry({ type: 'insert', row })
              setToast({
                row,
                message: toastForSave({
                  budget: home.budget,
                  spentBefore: home.spent,
                  row,
                  period: home.period,
                }).message,
              })
            }
            haptic('save')
            finishLocal()
          }}
          onSaveBudget={(amount) => {
            commitPeriodBudget(prefs, home.period.start, amount)
            replaceHome()
            setOverlay(null)
          }}
          onSaveGoal={(name, target, id) => {
            commitGoal(repo, { id, name, target })
            replaceHome()
            setOverlay(null)
            scheduleSync()
          }}
          onDeposit={(goalId, amount) => {
            commitDeposit(repo, goalId, amount)
            replaceHome()
            setOverlay(null)
            scheduleSync()
          }}
          settings={{
            syncEnabled,
            signedIn,
            configured: runtime.configured,
            notices,
            pill,
            onToggleSync: (enabled) => {
              prefs.setSyncEnabled(enabled)
              refreshMeta()
              if (enabled && repo.sessionUserId()) void syncRef.current()
            },
            onSignIn: async (email, password) => {
              const outcome = await runtime.signIn(email, password)
              applySignIn(outcome)
            },
            onSignOut: confirmSignOut,
            unsyncedCount,
            onDeleteUnsynced: deleteUnsyncedAndSignOut,
          }}
        />
      ) : null}
    </View>
  )
}

function OverlaySheet({
  overlay,
  today,
  cutoff,
  onClose,
  lastExpense,
  lastIncome,
  localBudget,
  recent,
  moneyLeft: remainder,
  status,
  onSaveEntry,
  onSaveGoal,
  onSaveBudget,
  onDeposit,
  settings,
}: {
  overlay: Overlay
  today: string
  cutoff: string | null
  lastExpense: string | null
  lastIncome: string | null
  localBudget: string
  recent: HistoryRow[]
  moneyLeft: number | null
  status: ReturnType<typeof syncPill>
  onClose: () => void
  onSaveEntry: (draft: EntryDraft) => void
  onSaveGoal: (name: string, target: string, id?: string) => void
  onSaveBudget: (amount: string) => void
  onDeposit: (goalId: string, amount: string) => void
  settings: {
    syncEnabled: boolean
    signedIn: boolean
    configured: boolean
    notices: string[]
    pill: ReturnType<typeof syncPill>
    unsyncedCount: number
    onToggleSync: (enabled: boolean) => void
    onSignIn: (email: string, password: string) => Promise<void>
    onSignOut: () => void
    onDeleteUnsynced: () => void
  }
}) {
  switch (overlay.type) {
    case 'settings':
      return <SettingsSheet {...settings} onClose={onClose} />
    case 'quick-add':
      return (
        <QuickAddSheet
          initial={newEntryDraft(today, 'expense', lastExpense)}
          today={today}
          cutoff={cutoff}
          lastExpense={lastExpense}
          lastIncome={lastIncome}
          recent={recent}
          moneyLeft={remainder}
          status={status}
          onClose={onClose}
          onSave={onSaveEntry}
        />
      )
    case 'edit-entry':
      return (
        <QuickAddSheet
          initial={historyDraft(overlay.row)}
          today={today}
          cutoff={cutoff}
          lastExpense={lastExpense}
          lastIncome={lastIncome}
          recent={recent}
          moneyLeft={remainder}
          status={status}
          onClose={onClose}
          onSave={onSaveEntry}
        />
      )
    case 'budget':
      return (
        <BudgetSheet
          initialAmount={localBudget}
          onClose={onClose}
          onSave={onSaveBudget}
        />
      )
    case 'add-goal':
      return (
        <GoalSheet
          title="New goal"
          initialName=""
          initialTarget=""
          onClose={onClose}
          onSave={(name, target) => onSaveGoal(name, target)}
        />
      )
    case 'edit-goal':
      return (
        <GoalSheet
          title="Edit goal"
          initialName={overlay.goal.name}
          initialTarget={overlay.goal.target.toFixed(2)}
          onClose={onClose}
          onSave={(name, target) => onSaveGoal(name, target, overlay.goal.id)}
        />
      )
    case 'deposit':
      return (
        <DepositSheet
          goalName={overlay.goal.name}
          onClose={onClose}
          onSave={(amount) => onDeposit(overlay.goal.id, amount)}
        />
      )
    default: {
      const neverOverlay: never = overlay
      return neverOverlay
    }
  }
}

function readHome(repo: AppRuntime['repo'], prefs: AppRuntime['prefs']): LedgerSnapshot {
  const now = new Date()
  return loadLedger(repo, now, prefs.periodBudget(payPeriodAt(now).start))
}

function formatStoredBudget(amount: number | null): string {
  return amount == null ? '' : amount.toFixed(2)
}

function draftMoneyLeft(home: LedgerSnapshot, editing: HistoryRow | null): number | null {
  if (home.budget == null) return null
  let spent = home.spent
  if (editing && editing.kind === 'expense' && editing.date >= home.period.start && editing.date <= home.period.end) {
    spent = roundMoney(spent - editing.amount)
  }
  return moneyLeft(home.budget, spent)
}

function seedV2Sample(repo: AppRuntime['repo'], prefs: AppRuntime['prefs']) {
  const now = new Date()
  const today = manilaToday(now)
  const period = payPeriodAt(now)
  commitPeriodBudget(prefs, period.start, '12000')
  const userId = repo.sessionUserId()
  const on = (delta: number) => shiftIsoDate(today, delta)
  repo.createExpense({
    userId,
    category: 'Groceries',
    type: 'needs',
    amount: 2305.49,
    date: shiftIsoDate(period.start, -1),
    description: 'Last kinsena market',
  })
  repo.createIncome({ userId, totalAmount: 18500, date: period.start, incomeSource: 'Salary' })
  repo.createExpense({ userId, category: 'Rent / Mortgage', type: 'needs', amount: 3000, date: on(-4), description: 'October rent' })
  repo.createExpense({ userId, category: 'Family Support', type: 'needs', amount: 2000, date: on(-3), description: 'Padala kay Nanay' })
  repo.createExpense({ userId, category: 'Shopping', type: 'wants', amount: 572.5, date: on(-3), description: 'Shopee 10.10 haul' })
  repo.createExpense({ userId, category: 'Transportation', type: 'needs', amount: 24, date: on(-3), description: 'Grab to Makati' })
  repo.createExpense({ userId, category: 'Utilities', type: 'needs', amount: 1000, date: on(-2), description: 'Meralco October' })
  repo.createExpense({ userId, category: 'Dining Out', type: 'wants', amount: 650, date: on(-1), description: 'Jollibee with family' })
  repo.createExpense({ userId, category: 'Groceries', type: 'needs', amount: 1240.5, date: today, description: 'Puregold weekly' })
  repo.createExpense({ userId, category: 'Transportation', type: 'needs', amount: 13, date: today, description: 'Jeep to Ortigas' })
  const goal = repo.createGoal({ userId, name: 'Emergency fund', targetAmount: 30000 })
  repo.createDeposit({ userId, goalId: goal.id, amount: 18600 })
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  toastSlot: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    zIndex: 20,
  },
})
