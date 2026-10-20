export const font = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
} as const

export const radius = {
  card: 26,
  control: 16,
  icon: 14,
  pill: 999,
} as const

/** Rounded sans sizes. Screens use these instead of one-off font sizes. */
export const typeScale = {
  caption: 12,
  label: 13,
  body: 15,
  button: 16,
  section: 18,
  title: 22,
  hero: 28,
  screen: 32,
  amount: 40,
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const

/** Durations in milliseconds. The save toast is on screen before `toast` elapses. */
export const motion = {
  press: 120,
  toast: 220,
  sheet: 280,
  dismiss: 4200,
} as const

export type KlaroColors = {
  background: string
  card: string
  text: string
  muted: string
  blue: string
  blueSoft: string
  onBlue: string
  yellow: string
  onYellow: string
  border: string
  danger: string
  dangerSoft: string
  ok: string
  okSoft: string
}

/** Light is the primary palette. Dark follows the system appearance. */
export const lightColors: KlaroColors = {
  background: '#F7F4EC',
  card: '#FFFFFF',
  text: '#1B1A17',
  muted: '#5E584E',
  blue: '#0038A8',
  blueSoft: '#E7EEFB',
  onBlue: '#FFFFFF',
  yellow: '#FCD116',
  onYellow: '#1B1A17',
  border: '#E6DFD2',
  danger: '#9B1C1C',
  dangerSoft: '#F8E8E8',
  ok: '#1F7A4D',
  okSoft: '#E5F6EC',
}

export const darkColors: KlaroColors = {
  background: '#12140F',
  card: '#1E2118',
  text: '#F7F4EC',
  muted: '#C8BFAE',
  blue: '#0038A8',
  blueSoft: '#1A2A4A',
  onBlue: '#FFFFFF',
  yellow: '#FCD116',
  onYellow: '#1B1A17',
  border: '#34382C',
  danger: '#F0B4B4',
  dangerSoft: '#3A2222',
  ok: '#8FD9B0',
  okSoft: '#1A3326',
}
