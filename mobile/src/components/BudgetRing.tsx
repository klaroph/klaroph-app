import { StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { budgetPercent, budgetRingLabel, ringProgress } from '../ui/budgetMath'
import { useTheme } from './ThemeProvider'
import { T } from './ui'

const SIZE = 116
const HERO_SIZE = 108
const STROKE = 10

export function BudgetRing({ spent, budget, tone = 'default' }: { spent: number; budget: number | null; tone?: 'default' | 'hero' }) {
  const { colors } = useTheme()
  const ring = ringProgress(spent, budget)
  const size = tone === 'hero' ? HERO_SIZE : SIZE
  const radius = (size - STROKE) / 2
  const circ = 2 * Math.PI * radius
  const percent = budgetPercent(spent, budget)
  const center = percent == null ? (budget == null ? '—' : ring.over ? 'Over' : '0%') : `${percent}%`
  const label = budgetRingLabel(spent, budget, ring.over)
  const hero = tone === 'hero'
  const fill = ring.over ? (hero ? '#FFE08A' : colors.danger) : (hero ? colors.yellow : colors.blue)
  const track = hero ? 'rgba(255,255,255,0.28)' : colors.blueSoft
  const ink = hero ? colors.onBlue : colors.text
  return (
    <View accessibilityRole="image" accessibilityLabel={label} testID="budget-ring" style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fill}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ring.progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <T size={hero ? 22 : 18} weight="bold" color={ink} center>{center}</T>
        {hero ? <T size={12} color={ink} center>used</T> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
