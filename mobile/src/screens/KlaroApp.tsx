import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AppRuntime } from '../runtime/runtime'
import { useTheme } from '../components/ThemeProvider'
import { TabBar, type TabId } from '../components/TabBar'
import { commitDeleteEntry, commitDeleteGoal, commitDeposit, commitEntry, commitGoal } from '../ui/actions'
import type { SignInResult } from '../ui/accountFlow'
import { ISOLATED_ACCOUNT_NOTICE, SIGN_OUT_WARNING } from '../ui/copy'
import { errorText } from '../ui/format'
import { canAddGoal, engineGoalMessage, visibleGoalBanner } from '../ui/goalCopy'
import { hasUnsyncedChanges, loadLedger, type GoalCard, type HistoryRow } from '../ui/ledger'
import { emptyDraft, type EntryDraft } from '../ui/quickAdd'
import { reportLooksOffline, syncNotices, syncPill, uniqueLines } from '../ui/syncStatus'
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
  const refresh = () => setRevision((value) => value + 1)
  const now = useMemo(() => new Date(), [revision])
  const snapshot = useMemo(() => loadLedger(repo, now), [repo, now])
  const pending = useMemo(() => hasUnsyncedChanges(repo), [repo, revision])
  const signedIn = repo.sessionUserId() != null
  const syncEnabled = prefs.syncEnabled()
  const pill = syncPill({ signedIn, syncEnabled, syncing, offline, pending })
  const banner = visibleGoalBanner({
    grace: snapshot.grace,
    engineMessage,
    capMessage: snapshot.capMessage,
  })
  const introDone = prefs.firstRunDone()
  const syncingRef = useRef(false)
  const syncAgain = useRef(false)
  const launched = useRef(false)
  const syncRef = useRef<() => Promise<void>>(async () => undefined)

  const runSync = async () => {
    if (!repo.sessionUserId() || !prefs.syncEnabled()) return
    if (syncingRef.current) {
      syncAgain.current = true
      return
    }
    syncingRef.current = true
    setSyncing(true)
    try {
      const report = await runtime.sync()
      if (!report) {
        setNotices((current) => uniqueLines([...current, 'Sync needs a signed-in account and the publishable Supabase key.']))
        return
      }
      setEngineMessage(engineGoalMessage(report.errors))
      setOffline(reportLooksOffline(report))
      setNotices(syncNotices(report))
    } catch (error) {
      setOffline(true)
      setNotices([errorText(error)])
    } finally {
      syncingRef.current = false
      setSyncing(false)
      refresh()
      if (syncAgain.current) {
        syncAgain.current = false
        void syncRef.current()
      }
    }
  }

  syncRef.current = runSync

  useEffect(() => {
    if (!prefs.firstRunDone()) return
    if (launched.current) return
    launched.current = true
    if (repo.sessionUserId() && prefs.syncEnabled()) void syncRef.current()
  }, [revision, prefs, repo])

  function finishWrite() {
    setOverlay(null)
    refresh()
    if (repo.sessionUserId() && prefs.syncEnabled()) void syncRef.current()
  }

  function applySignIn(outcome: SignInResult) {
    const extra = [
      outcome.isolated ? ISOLATED_ACCOUNT_NOTICE : '',
      outcome.goalLimitMessage ?? '',
    ]
    setEngineMessage(outcome.goalLimitMessage ?? (outcome.report ? engineGoalMessage(outcome.report.errors) : null))
    setOffline(outcome.report ? reportLooksOffline(outcome.report) : false)
    setNotices(uniqueLines([...extra, ...(outcome.report ? syncNotices(outcome.report) : [])]))
    refresh()
  }

  function confirmDeleteEntry(row: HistoryRow) {
    Alert.alert('Delete entry?', 'This removes it from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            commitDeleteEntry(repo, row.kind, row.id, new Date())
            finishWrite()
          } catch (error) {
            setNotices([errorText(error)])
          }
        },
      },
    ])
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
            finishWrite()
          } catch (error) {
            setNotices([errorText(error)])
          }
        },
      },
    ])
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
            refresh()
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
          refresh()
        }}
      />
    )
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.body}>
        {tab === 'home' ? (
          <HomeScreen
            snapshot={snapshot}
            pill={pill}
            onOpenSettings={() => setOverlay({ type: 'settings' })}
            onOpenEntry={(row) => setOverlay({ type: 'edit-entry', row })}
          />
        ) : null}
        {tab === 'history' ? (
          <HistoryScreen
            rows={snapshot.history}
            olderLineVisible={snapshot.olderLineVisible}
            emptyLabel={snapshot.freeHistory ? 'No entries in the last 90 days.' : 'No entries yet.'}
            onOpenSettings={() => setOverlay({ type: 'settings' })}
            onEdit={(row) => setOverlay({ type: 'edit-entry', row })}
            onDelete={confirmDeleteEntry}
          />
        ) : null}
        {tab === 'goals' ? (
          <GoalsScreen
            goals={snapshot.goals}
            banner={banner}
            canAdd={canAddGoal(banner)}
            onOpenSettings={() => setOverlay({ type: 'settings' })}
            onAdd={() => setOverlay({ type: 'add-goal' })}
            onDeposit={(goal) => setOverlay({ type: 'deposit', goal })}
            onEdit={(goal) => setOverlay({ type: 'edit-goal', goal })}
            onDelete={confirmDeleteGoal}
          />
        ) : null}
      </View>
      <TabBar
        tab={tab}
        onTab={setTab}
        onAdd={() => setOverlay({ type: 'quick-add' })}
      />
      {overlay ? (
        <OverlaySheet
          overlay={overlay}
          today={snapshot.today}
          cutoff={snapshot.freeHistory ? snapshot.cutoff : null}
          onClose={() => setOverlay(null)}
          onSaveEntry={(draft) => {
            commitEntry(repo, draft, new Date())
            finishWrite()
          }}
          onSaveGoal={(name, target, id) => {
            commitGoal(repo, { id, name, target })
            finishWrite()
          }}
          onDeposit={(goalId, amount) => {
            commitDeposit(repo, goalId, amount)
            finishWrite()
          }}
          settings={{
            syncEnabled,
            signedIn,
            configured: runtime.configured,
            notices,
            pill,
            onToggleSync: (enabled) => {
              prefs.setSyncEnabled(enabled)
              refresh()
              if (enabled && repo.sessionUserId()) void syncRef.current()
            },
            onSignIn: async (email, password) => {
              const outcome = await runtime.signIn(email, password)
              applySignIn(outcome)
            },
            onSignOut: confirmSignOut,
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
  onSaveEntry,
  onSaveGoal,
  onDeposit,
  settings,
}: {
  overlay: Overlay
  today: string
  cutoff: string | null
  onClose: () => void
  onSaveEntry: (draft: EntryDraft) => void
  onSaveGoal: (name: string, target: string, id?: string) => void
  onDeposit: (goalId: string, amount: string) => void
  settings: {
    syncEnabled: boolean
    signedIn: boolean
    configured: boolean
    notices: string[]
    pill: ReturnType<typeof syncPill>
    onToggleSync: (enabled: boolean) => void
    onSignIn: (email: string, password: string) => Promise<void>
    onSignOut: () => void
  }
}) {
  switch (overlay.type) {
    case 'settings':
      return <SettingsSheet {...settings} onClose={onClose} />
    case 'quick-add':
      return (
        <QuickAddSheet
          initial={emptyDraft(today)}
          today={today}
          cutoff={cutoff}
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
          onClose={onClose}
          onSave={onSaveEntry}
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

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
})
