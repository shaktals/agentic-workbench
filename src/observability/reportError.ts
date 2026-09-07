import { inspect } from 'node:util'

export type ReportErrorInput = {
  /** Short scope tag for grep, e.g. `llm.network`. */
  scope: string
  /** Safe structured context (no secrets / prompt bodies). */
  meta?: Record<string, unknown>
  /** Original thrown value or failure payload. */
  error: unknown
}

export type ReportErrorSink = (input: ReportErrorInput) => void

function formatError(error: unknown): unknown {
  if (error instanceof Error) return error
  return inspect(error, { depth: 8, breakLength: 120 })
}

function defaultSink(input: ReportErrorInput): void {
  const { scope, meta, error } = input
  if (meta && Object.keys(meta).length > 0) {
    console.error(`[${scope}]`, meta, formatError(error))
    return
  }
  console.error(`[${scope}]`, formatError(error))
}

let sink: ReportErrorSink = defaultSink

/**
 * Report a failure for operators (stderr today).
 * Swap the sink later for PostHog / Datadog / Rollbar without changing call sites.
 */
export function reportError(input: ReportErrorInput): void {
  sink(input)
}

/** Test / integration hook. Pass `undefined` to restore the default stderr sink. */
export function setReportErrorSink(next?: ReportErrorSink): void {
  sink = next ?? defaultSink
}
