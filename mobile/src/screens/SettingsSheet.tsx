import { useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../components/ThemeProvider'
import { Card, Field, GhostButton, Pill, PrimaryButton, T } from '../components/ui'
import { MISSING_SUPABASE_CONFIG, SIGN_OUT_WARNING, UNINSTALL_WARNING } from '../ui/copy'
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
}: {
  syncEnabled: boolean
  signedIn: boolean
  configured: boolean
  notices: string[]
  pill: SyncPill
  onClose: () => void
  onToggleSync: (enabled: boolean) => void
  onSignIn: (email: string, password: string) => Promise<void>
  onSignOut: () => void
}) {
  const { colors } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        <Switch
          accessibilityLabel="Sync"
          value={syncEnabled}
          onValueChange={onToggleSync}
          trackColor={{ false: colors.border, true: colors.blue }}
          thumbColor={colors.card}
        />
      </View>
      <Pill label={pill.label} tone={pill.tone} />
      {notices.map((notice) => (
        <T key={notice} size={14} color={colors.blue}>{notice}</T>
      ))}
      {signedIn ? (
        <View style={styles.block}>
          <T size={14} color={colors.muted}>{SIGN_OUT_WARNING}</T>
          <GhostButton label="Sign out" danger onPress={onSignOut} />
        </View>
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
})