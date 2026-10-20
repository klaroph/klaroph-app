import { useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { font } from '../ui/theme'
import { useTheme } from './ThemeProvider'

type Weight = 'regular' | 'semibold' | 'bold'

export function T({
  children,
  size = 15,
  weight = 'regular',
  color,
  style,
  center,
  numberOfLines,
}: {
  children: ReactNode
  size?: number
  weight?: Weight
  color?: string
  style?: StyleProp<TextStyle>
  center?: boolean
  numberOfLines?: number
}) {
  const { colors } = useTheme()
  const family = weight === 'bold' ? font.bold : weight === 'semibold' ? font.semibold : font.regular
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: family, fontSize: size, color: color ?? colors.text, textAlign: center ? 'center' : 'left' },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

export function ScreenScroll({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useTheme()
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>
}

export function Pill({ label, tone }: { label: string; tone: 'local' | 'off' | 'syncing' | 'offline' | 'pending' | 'synced' }) {
  const { colors } = useTheme()
  const palette = {
    local: { bg: colors.blueSoft, fg: colors.blue },
    off: { bg: colors.background, fg: colors.muted },
    syncing: { bg: colors.blueSoft, fg: colors.blue },
    offline: { bg: colors.dangerSoft, fg: colors.danger },
    pending: { bg: colors.yellow, fg: colors.onYellow },
    synced: { bg: colors.okSoft, fg: colors.ok },
  }[tone]
  return (
    <View testID="sync-pill" style={[styles.pill, { backgroundColor: palette.bg }]}>
      <T size={12} weight="bold" color={palette.fg}>{label}</T>
    </View>
  )
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  testID?: string
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.blue, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 },
      ]}
    >
      <T size={16} weight="bold" color={colors.onBlue} center>{label}</T>
    </Pressable>
  )
}

export function DangerButton({
  label,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string
  onPress: () => void
  accessibilityLabel?: string
  testID?: string
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.danger, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <T size={16} weight="bold" color={colors.background} center>{label}</T>
    </Pressable>
  )
}

export function YellowButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.yellow, opacity: pressed ? 0.88 : 1 }]}
    >
      <T size={16} weight="bold" color={colors.onYellow} center>{label}</T>
    </Pressable>
  )
}

export function GhostButton({
  label,
  onPress,
  danger,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  danger?: boolean
  accessibilityLabel?: string
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.7 : 1 }]}
    >
      <T size={15} weight="bold" color={danger ? colors.danger : colors.blue}>{label}</T>
    </Pressable>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoFocus,
  testID,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  keyboardType?: TextInputProps['keyboardType']
  autoFocus?: boolean
  testID?: string
}) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.field}>
      <T size={13} weight="semibold" color={colors.muted}>{label}</T>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.card,
            borderColor: focused ? colors.blue : colors.border,
            fontFamily: font.semibold,
          },
        ]}
      />
    </View>
  )
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.blue : colors.card, borderColor: selected ? colors.blue : colors.border },
      ]}
    >
      <T size={14} weight="semibold" color={selected ? colors.onBlue : colors.text}>{label}</T>
    </Pressable>
  )
}

export function Banner({ message }: { message: string }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.banner, { backgroundColor: colors.blueSoft }]}>
      <T size={14} color={colors.blue}>{message}</T>
    </View>
  )
}

export function IconButton(props: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { children, style, ...rest } = props
  return (
    <Pressable {...rest} style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}>
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 48,
    gap: 12,
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghost: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  field: {
    gap: 6,
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
})
