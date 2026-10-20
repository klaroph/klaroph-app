import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular'
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold'
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import migrations from './drizzle/migrations.js'
import { createAppRuntime } from './src/runtime/runtime'
import { ThemeProvider, useTheme } from './src/components/ThemeProvider'
import { klaroDb, loadKlaroDatabase } from './src/db/client'
import { KlaroApp } from './src/screens/KlaroApp'
import { T } from './src/components/ui'

export default function App() {
  if (Platform.OS === 'web') return <WebRoot />
  return <NativeRoot db={klaroDb} />
}

function WebRoot() {
  const [db, setDb] = useState<typeof klaroDb | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadKlaroDatabase()
      .then((opened) => {
        if (!cancelled) setDb(opened)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setOpenError(caught instanceof Error ? caught.message : 'Could not open the database.')
      })
    return () => {
      cancelled = true
    }
  }, [])
  if (openError) {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <OpenError message={openError} />
        </ThemeProvider>
      </SafeAreaProvider>
    )
  }
  if (!db) {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <Opening />
        </ThemeProvider>
      </SafeAreaProvider>
    )
  }
  return <NativeRoot db={db} />
}

function NativeRoot({ db }: { db: typeof klaroDb }) {
  const runtime = useMemo(() => createAppRuntime(db), [db])
  const { success, error } = useMigrations(db, migrations)
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  })
  const ready = success && (fontsLoaded || fontError != null)

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root ready={ready} migrationError={error?.message ?? null} runtime={runtime} />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function Root({
  ready,
  migrationError,
  runtime,
}: {
  ready: boolean
  migrationError: string | null
  runtime: ReturnType<typeof createAppRuntime>
}) {
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

function Opening() {
  const { colors } = useTheme()
  return (
    <View style={[styles.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={colors.blue} />
    </View>
  )
}

function OpenError({ message }: { message: string }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.root, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
      <T color={colors.danger}>{message}</T>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
