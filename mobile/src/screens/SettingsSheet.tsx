import { useState } from 'react'
import { Pressable, StyleSheet, Switch, View } from 'react-native'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../components/ThemeProvider'
import { Card, DangerButton, Field, GhostButton, Pill, PrimaryButton, T } from '../components/ui'
import { DELETE_UNSYNCED_LABEL, MISSING_SUPABASE_CONFIG, SIGN_OUT_WARNING, UNINSTALL_WARNING, unsyncedSignOutLine } from '../ui/copy'
import { errorText } from '../ui/format'
import type { SyncPill } from '../ui/syncStatus'

export function SettingsSheet({
  syncEnabled,
  signedIn,
  configured,
  notices,
  pill,
  onClose,
  onToggleSync,
  onSignIn,
  onSignOut,
  unsyncedCount,
  onDeleteUnsynced,
}: {
  syncEnabled: boolean
  signedIn: boolean
  configured: boolean
  notices: string[]
  pill: SyncPill
  unsyncedCount: number
  onClose: () => void
  onToggleSync: (enabled: boolean) => void
  onSignIn: (email: string, password: string) => Promise<void>
  onSignOut: () => void
  onDeleteUnsynced: () => void
}) {
  const { colors } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await onSignIn(email, password)
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Settings" onClose={onClose} testID="settings-sheet">
      <View style={styles.row}>
        <View style={styles.copy}>
          <T weight="bold">Sync</T>
          <T size={13} color={colors.muted}>Uploads and downloads changes for the signed-in account.</T>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Sync"
          accessibilityState={{ checked: syncEnabled }}
          onPress={() => onToggleSync(!syncEnabled)}
          style={styles.switchHit}
        >
          <Switch
            pointerEvents="none"
            value={syncEnabled}
            onValueChange={onToggleSync}
            trackColor={{ false: colors.border, true: colors.blue }}
            thumbColor={colors.card}
          />
        </Pressable>
      </View>
      <Pill label={pill.label} tone={pill.tone} />
      {notices.map((notice) => (
        <T key={notice} size={14} color={colors.blue}>{notice}</T>
      ))}
      {signedIn ? (
        unsyncedCount > 0 ? (
          <View style={styles.block}>
            <T weight="bold" color={colors.danger}>{unsyncedSignOutLine(unsyncedCount)}</T>
            {confirmDelete ? (
              <>
                <T size={14} color={colors.muted}>Deleting them signs you out and clears the entries on this phone.</T>
                <DangerButton
                  label={DELETE_UNSYNCED_LABEL}
                  accessibilityLabel="Confirm delete unsynced entries"
                  onPress={onDeleteUnsynced}
                />
                <GhostButton label="Cancel" onPress={() => setConfirmDelete(false)} />
              </>
            ) : (
              <DangerButton label={DELETE_UNSYNCED_LABEL} onPress={() => setConfirmDelete(true)} />
            )}
          </View>
        ) : (
          <View style={styles.block}>
            <T size={14} color={colors.muted}>{SIGN_OUT_WARNING}</T>
            <GhostButton label="Sign out" danger onPress={onSignOut} />
          </View>
        )
      ) : configured ? (
        <View style={styles.block}>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoFocus />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <T color={colors.danger}>{error}</T> : null}
          <PrimaryButton label={busy ? 'Signing in…' : 'Sign in'} onPress={() => void signIn()} disabled={busy} />
        </View>
      ) : (
        <T size={14} color={colors.muted}>{MISSING_SUPABASE_CONFIG}</T>
      )}
      <Card>
        <T weight="bold">Uninstalling</T>
        <T size={14} color={colors.muted}>{UNINSTALL_WARNING}</T>
      </Card>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  block: {
    gap: 10,
  },
  switchHit: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})