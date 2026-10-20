import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { darkColors, lightColors, type KlaroColors } from '../ui/theme'

type ThemeValue = {
  colors: KlaroColors
  dark: boolean
}

const ThemeContext = createContext<ThemeValue>({ colors: lightColors, dark: false })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const dark = scheme === 'dark'
  const value = useMemo<ThemeValue>(() => ({ colors: dark ? darkColors : lightColors, dark }), [dark])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext)
}
