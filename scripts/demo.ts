#!/usr/bin/env node
/**
 * Live demo: ambiguous `/log` → successful `/log` (memory) → `/notice` (HITL park).
 *
 *   cp .env.example .env   # set LLM_API_KEY
 *   npm run demo
 *   npm run approve -- <operationId>   # optional: complete the parked notice
 *
 * Escape hatch (skips the park): npm run demo -- --yes
 */
import { resolve } from 'node:path'

import { completeChat } from '../src/llm/completeChat.ts'
import { readLlmRuntimeEnv } from '../src/llm/env.ts'
import { run, type RunOutput } from '../src/orchestration/run.ts'
import type { Result } from '../src/result.ts'

const autoApprove = process.argv.includes('--yes')
const varRoot = resolve(process.cwd(), 'var')
const useColor = process.stdout.isTTY === true

const c = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  green: useColor ? '\x1b[32m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  red: useColor ? '\x1b[31m' : '',
  magenta: useColor ? '\x1b[35m' : '',
}

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'ok':
      return c.green
    case 'needs_clarification':
    case 'needs_approval':
      return c.yellow
    case 'failed':
    case 'skipped':
      return c.red
    default:
      return c.dim
  }
}

function printRun(
  label: string,
  channel: 'radio' | 'pier',
  body: string,
  result: Result<RunOutput>,
) {
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  const out = result.data
  const channelLabel = channel === 'pier' ? 'Pier message' : 'Radio message'
  console.log(`${c.bold}${c.cyan}— ${label} —${c.reset}`)
  console.log(`${c.dim}${channelLabel}:${c.reset} "${body}"\n`)
  console.log(`${c.dim}${out.traceSummary}${c.reset}`)
  if (out.tracePath) {
    console.log(`${c.dim}trace:${c.reset} ${out.tracePath}`)
  }
  console.log(
    `status: ${statusColor(out.trace.status)}${out.trace.status}${c.reset}`,
  )
  if (out.loggedEvents?.length) {
    console.log(
      `${c.green}logged:${c.reset} ${out.loggedEvents.map(e => e.eventTypeId).join(', ')}`,
    )
  }
  if (out.clarificationQuestion) {
    console.log(
      `${c.yellow}clarification:${c.reset} ${out.clarificationQuestion}`,
    )
  }
  const noteStep = out.trace.steps.find(
    s => s.type === 'memory' && s.summary === 'note_written',
  )
  if (noteStep) {
    console.log(
      `${c.magenta}self note written:${c.reset} ${JSON.stringify(noteStep.result)}`,
    )
  }
  console.log('')
  return out
}

async function main() {
  const env = readLlmRuntimeEnv()
  if (!env.configured) {
    console.error(
      'LLM_API_KEY is not set. Copy .env.example → .env (or use: node --env-file=.env …).',
    )
    process.exit(1)
  }

  const llm = {
    completeChat: (input: Parameters<typeof completeChat>[0]) =>
      completeChat(input),
  }

  const ambiguousLog = '/log fuel 40 L on Meridian at the fuel dock'
  const successLog = '/log fuel 40 L on vessel V-101 at slip D4'
  const noticeRadio = '/notice gale warning for outer basin near slip C3'

  printRun(
    '1st operation: Live /log — often needs clarification (calls the model)',
    'radio',
    ambiguousLog,
    await run({
      inbound: {
        id: 'demo-log-ambiguous',
        channel: 'radio',
        body: ambiguousLog,
      },
      llm,
      varRootDir: varRoot,
      threadId: 'demo-thread',
      autoApprove,
    }),
  )

  printRun(
    '2nd operation: Live /log — successful commit + self note (calls the model)',
    'radio',
    successLog,
    await run({
      inbound: {
        id: 'demo-log-ok',
        channel: 'radio',
        body: successLog,
      },
      llm,
      varRootDir: varRoot,
      threadId: 'demo-thread',
      autoApprove,
    }),
  )

  console.log(
    `${c.dim}Memory file: ${resolve(varRoot, 'memory.json')}${c.reset}`,
  )
  console.log('')

  const noticeOut = printRun(
    '3rd operation: /notice (HITL park; no model required)',
    'radio',
    noticeRadio,
    await run({
      inbound: {
        id: 'demo-notice',
        channel: 'radio',
        body: noticeRadio,
      },
      varRootDir: varRoot,
      threadId: 'demo-thread',
      autoApprove,
    }),
  )

  if (noticeOut.trace.status === 'needs_approval') {
    console.log(
      `${c.yellow}Notice parked${c.reset} (default happy path — did not send).`,
    )
    console.log(`${c.dim}pending:${c.reset} ${noticeOut.pendingPath}`)
    console.log(
      `${c.bold}${c.green}Approve with: npm run approve -- ${noticeOut.operationId}${c.reset}`,
    )
  } else if (autoApprove && noticeOut.trace.status === 'ok') {
    console.log(
      `${c.green}Auto-approved via --yes${c.reset} (escape hatch; not the default reviewer path).`,
    )
  }

  console.log('\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
