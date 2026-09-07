#!/usr/bin/env node
/**
 * Runs unit tests via Node's built-in test runner + --experimental-strip-types.
 * Tests live under test/, mirroring src/.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const root = join(scriptDir, '..', '..')
const testRoot = join(root, 'test')

function collectTests(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'scripts') continue
      collectTests(p, out)
    } else if (name.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

const files = collectTests(testRoot)

if (files.length === 0) {
  console.error('No test/**/*.test.ts files found')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--experimental-strip-types',
    '--test',
    ...files,
  ],
  {
    stdio: 'inherit',
    cwd: root,
  },
)

process.exit(result.status ?? 1)
