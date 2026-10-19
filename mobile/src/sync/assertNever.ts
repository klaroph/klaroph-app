export function assertNever(value: never, label = 'value'): never {
  throw new Error(`Unhandled ${label}: ${String(value)}`)
}
