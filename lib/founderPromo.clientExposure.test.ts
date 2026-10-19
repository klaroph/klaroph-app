import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib']
const FOUNDER_CODE = 'FNDRUSER1299'

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

function isClientModule(file: string): boolean {
  return /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'))
}

function importSpecifiers(src: string): string[] {
  const specs: string[] = []
  const fromRe = /from\s+['"]([^'"]+)['"]/g
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const re of [fromRe, dynamicRe]) {
    let match = re.exec(src)
    while (match) {
      specs.push(match[1])
      match = re.exec(src)
    }
  }
  return specs
}

function materialize(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@/')) return materialize(path.join(ROOT, spec.slice(2)))
  if (spec.startsWith('.')) return materialize(path.resolve(path.dirname(fromFile), spec))
  return null
}

/** Local modules reachable from a client file, including the file itself. */
function clientImportClosure(start: string): string[] {
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
      const resolved = resolveSpecifier(file, spec)
      if (resolved) queue.push(resolved)
    }
  }
  return [...seen]
}

const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
const clientFiles = files.filter(isClientModule)

describe('founder promo code stays out of the client bundle', () => {
  it('no client module imports a module that contains the founder code', () => {
    const offenders = clientFiles.flatMap((start) =>
      clientImportClosure(start)
        .filter((file) => readFileSync(file, 'utf8').includes(FOUNDER_CODE))
        .map((file) => `${path.relative(ROOT, start)} -> ${path.relative(ROOT, file)}`)
    )
    expect(offenders).toEqual([])
  })

  it('client components do not contain the founder code', () => {
    const offenders = clientFiles
      .filter((file) => readFileSync(file, 'utf8').includes(FOUNDER_CODE))
      .map((file) => path.relative(ROOT, file))
    expect(offenders).toEqual([])
  })
})
