import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import migrations from './drizzle/migrations.js'
import { klaroDb } from './src/db/client'

export default function App() {
  const { success, error } = useMigrations(klaroDb, migrations)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Klaro Native</Text>
      <Text style={styles.body}>Offline-first. An account is optional.</Text>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {!success && !error ? <ActivityIndicator /> : null}
      {success ? <Text style={styles.ready}>Local database ready.</Text> : null}
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  body: {
    marginTop: 8,
    fontSize: 16,
    textAlign: 'center',
  },
  ready: {
    marginTop: 16,
    fontSize: 14,
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    color: '#9b1c1c',
    textAlign: 'center',
  },
})
