import { defineConfig } from 'vitest/config'

export default defineConfig({
  tsconfig: './tsconfig.vitest.json',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
