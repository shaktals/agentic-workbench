/**
 * Persist a TraceRun as a pretty-printed JSON array (run header + steps).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { TraceRun } from './types.ts'

export function tracesDir(rootDir = 'var'): string {
  return join(rootDir, 'traces')
}

export function traceFilePath(operationId: string, rootDir = 'var'): string {
  return join(tracesDir(rootDir), `${operationId}.json`)
}

/**
 * Write run metadata + each step as a JSON array.
 * Entry 0: `{ "record": "run", ... }`
 * Following: `{ "record": "step", "step": TraceStep }`
 */
export function writeTraceJson(
  run: TraceRun,
  rootDir = 'var',
): { path: string } {
  const dir = tracesDir(rootDir)
  mkdirSync(dir, { recursive: true })
  const path = traceFilePath(run.operationId, rootDir)

  const entries: unknown[] = [
    {
      record: 'run',
      operationId: run.operationId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      stepCount: run.steps.length,
    },
  ]

  for (const step of run.steps) {
    entries.push({
      record: 'step',
      operationId: run.operationId,
      step,
    })
  }

  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
  return { path }
}

/** Compact stdout summary for operators (no secrets). */
export function formatTraceSummary(run: TraceRun): string {
  const parts = [
    `operationId=${run.operationId}`,
    `status=${run.status ?? 'unknown'}`,
    `steps=${run.steps.length}`,
  ]
  const llmSteps = run.steps.filter(s => s.type === 'llm')
  if (llmSteps.length > 0) {
    const tokens = llmSteps.reduce(
      (n, s) => n + (s.tokens?.totalTokens ?? 0),
      0,
    )
    const latency = llmSteps.reduce((n, s) => n + (s.latencyMs ?? 0), 0)
    parts.push(
      `llmCalls=${llmSteps.length}`,
      `tokens≈${tokens}`,
      `llmMs≈${latency}`,
    )
  }
  return parts.join(' ')
}
