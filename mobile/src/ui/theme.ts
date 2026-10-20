export const font = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
} as const

export const radius = {
  card: 26,
  control: 16,
  icon: 14,
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
