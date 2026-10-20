import { StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { budgetPercent, budgetRingLabel, ringProgress } from '../ui/budgetMath'
import { useTheme } from './ThemeProvider'
import { T } from './ui'

const SIZE = 116
const STROKE = 10

export function BudgetRing({ spent, budget }: { spent: number; budget: number | null }) {
  const { colors } = useTheme()
  const ring = ringProgress(spent, budget)
  const radius = (SIZE - STROKE) / 2
  const circ = 2 * Math.PI * radius
  const percent = budgetPercent(spent, budget)
  const center = percent == null ? (budget == null ? '—' : ring.over ? 'Over' : '0%') : `${percent}%`
  const label = budgetRingLabel(spent, budget, ring.over)
  const fill = ring.over ? colors.danger : colors.blue
  return (
    <View accessibilityRole="image" accessibilityLabel={label} testID="budget-ring" style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          stroke={colors.blueSoft}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          stroke={fill}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ring.progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <T size={18} weight="bold" center>{center}</T>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
