import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FIRST_RUN_PAGES } from '../ui/copy'
import { useTheme } from '../components/ThemeProvider'
import { PrimaryButton, T, YellowButton } from '../components/ui'

export function FirstRun({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState<0 | 1>(0)
  const current = FIRST_RUN_PAGES[page]

  return (
    <View
      testID="first-run"
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 }]}
    >
      <T size={15} weight="bold" color={colors.blue}>Klaro</T>
      <T size={32} weight="bold" style={styles.title}>{current.title}</T>
      {page === 0 ? <T size={17} color={colors.muted}>{FIRST_RUN_PAGES[0].body}</T> : null}
      {page === 1 ? (
        <View style={styles.points}>
          {FIRST_RUN_PAGES[1].points.map((point) => (
            <View key={point} style={[styles.point, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <T size={15}>{point}</T>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.spacer} />
      <View style={styles.dots}>
        {[0, 1].map((dot) => (
          <View key={dot} style={[styles.dot, { backgroundColor: dot === page ? colors.blue : colors.border }]} />
        ))}
      </View>
      {page === 0 ? <PrimaryButton label={current.action} onPress={() => setPage(1)} /> : null}
      {page === 1 ? <YellowButton label={current.action} onPress={onDone} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    lineHeight: 38,
  },
  points: {
    gap: 10,
  },
  point: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
  },
  spacer: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
