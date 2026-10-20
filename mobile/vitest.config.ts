import { defineConfig } from 'vitest/config'

export default defineConfig({
  tsconfig: './tsconfig.vitest.json',
  define: {
    __DEV__: 'true',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
