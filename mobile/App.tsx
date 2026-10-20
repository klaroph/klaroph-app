import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular'
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold'
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import migrations from './drizzle/migrations.js'
import { createAppRuntime } from './src/app/runtime'
import { ThemeProvider, useTheme } from './src/components/ThemeProvider'
import { klaroDb } from './src/db/client'
import { KlaroApp } from './src/screens/KlaroApp'
import { T } from './src/components/ui'

const runtime = createAppRuntime()

export default function App() {
  const { success, error } = useMigrations(klaroDb, migrations)
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  })
  const ready = success && (fontsLoaded || fontError != null)

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root ready={ready} migrationError={error?.message ?? null} />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function Root({ ready, migrationError }: { ready: boolean; migrationError: string | null }) {
  const { colors, dark } = useTheme()
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {migrationError ? <T color={colors.danger}>{migrationError}</T> : null}
      {!ready && !migrationError ? <ActivityIndicator color={colors.blue} /> : null}
      {ready && !migrationError ? <KlaroApp runtime={runtime} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
