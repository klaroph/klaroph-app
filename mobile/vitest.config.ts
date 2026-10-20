import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const lottieMock = fileURLToPath(new URL('./src/test/lottieMock.tsx', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'lottie-react-native': lottieMock,
    },
  },
  tsconfig: './tsconfig.vitest.json',
  define: {
    __DEV__: 'true',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
