#!/usr/bin/env node
/**
 * Approve a parked send_notice: var/pending/<operationId>.json → var/outbound/
 *
 * Usage: npm run approve -- <operationId>
 */
import { resolve } from 'node:path'

import { approvePendingNotice } from '../src/hitl/port.ts'

const operationId = process.argv[2]?.trim()
if (!operationId) {
  console.error('Usage: npm run approve -- <operationId>')
  process.exit(1)
}

const rootDir = resolve(process.cwd(), 'var')
const result = approvePendingNotice({ rootDir, operationId })

if (!result.ok) {
  console.error(result.message)
  process.exit(1)
}

console.log(`Approved. Outbound written to ${result.outboundPath}`)
