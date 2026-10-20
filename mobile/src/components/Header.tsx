import { Pressable, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { SyncPill, SyncPillTone } from '../ui/syncStatus'
import { space } from '../ui/theme'
import { useTheme } from './ThemeProvider'
import { Pill, T } from './ui'

function pillIcon(tone: SyncPillTone): 'cloud-check-outline' | 'cellphone' | 'cloud-off-outline' | 'cloud-upload-outline' | 'cloud-sync-outline' {
  switch (tone) {
    case 'synced':
      return 'cloud-check-outline'
    case 'local':
      return 'cellphone'
    case 'offline':
      return 'cloud-off-outline'
    case 'pending':
      return 'cloud-upload-outline'
    case 'syncing':
      return 'cloud-sync-outline'
    case 'off':
      return 'cloud-off-outline'
    default: {
      const neverTone: never = tone
      return neverTone
    }
  }
}

export function ScreenHeader({
  title,
  greeting,
  pill,
  onAvatar,
}: {
  title: string
  greeting?: string
  pill?: SyncPill
  onAvatar: () => void
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.block}>
      {greeting ? <T size={14} weight="semibold">{greeting}</T> : null}
      <View style={styles.row}>
        <T size={32} weight="bold" color={colors.blue} style={styles.title}>{title}</T>
        <View style={styles.tools}>
          {pill ? (
            <Pill
              label={pill.label}
              tone={pill.tone}
              icon={<MaterialCommunityIcons name={pillIcon(pill.tone)} size={14} color={pill.tone === 'synced' ? colors.ok : pill.tone === 'local' ? colors.muted : colors.blue} />}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            testID="open-settings"
            onPress={onAvatar}
            style={({ pressed }) => [styles.sun, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialCommunityIcons name="white-balance-sunny" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: 2,
    marginBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: {
    flexShrink: 1,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  sun: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
