import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

export type HapticKind = 'save' | 'delete' | 'add'

export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web') return
  try {
    const pending = kind === 'save'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(kind === 'delete' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
    void Promise.resolve(pending).catch(() => undefined)
  } catch {
    // Devices without a vibrator still save, delete, and add.
  }
}
