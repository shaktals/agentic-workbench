import { z } from 'zod'

import { buildCatalogMarkdown, type HarborCatalog } from '#domain/catalog.ts'
import type { CompleteChatInput, LlmCompletion, LlmError } from '#llm/types.ts'
import { err, ok, type Result } from '#result.ts'

export type LlmPort = {
  completeChat(
    input: CompleteChatInput,
  ): Promise<Result<LlmCompletion, LlmError>>
}

const metricSchema = z
  .object({
    metricKey: z.string().trim().min(1),
    numberValue: z.number().optional(),
    rawNumberValue: z.number().optional(),
    booleanValue: z.boolean().optional(),
    userUnit: z.string().trim().min(1).optional(),
    rawUnitToken: z.string().trim().min(1).optional(),
  })
  .superRefine((row, ctx) => {
    if (row.numberValue !== undefined && row.rawNumberValue === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'rawNumberValue is required when numberValue is present.',
        path: ['rawNumberValue'],
      })
    }
  })

const eventSchema = z.object({
  eventTypeId: z.string().trim().min(1),
  vesselId: z.string().trim().min(1).optional(),
  slipId: z.string().trim().min(1).optional(),
  metrics: z.array(metricSchema).min(1),
})

export const extractLogLlmSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('needs_clarification'),
    clarificationQuestion: z.string().trim().min(1),
  }),
  z.object({
    status: z.literal('ok'),
    events: z.array(eventSchema).min(1),
  }),
])

export type ExtractLogLlmOutput = z.infer<typeof extractLogLlmSchema>

export type ExtractLogResult =
  | { kind: 'events'; events: z.infer<typeof eventSchema>[] }
  | { kind: 'clarification'; question: string }

function parseJsonObject(
  text: string,
): Result<unknown, { code: string; message: string }> {
  let candidate = text.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1]!.trim()

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidate = candidate.slice(start, end + 1)
  }

  try {
    return ok(JSON.parse(candidate) as unknown)
  } catch {
    return err({
      code: 'EXTRACT_NON_JSON',
      message: 'Model returned non-JSON.',
    })
  }
}

function buildSystemPrompt(catalog: HarborCatalog): string {
  return [
    'You map harbor desk log text to structured JSON only.',
    'Use ONLY ids and metricKey values from the catalog below.',
    'Never invent vesselId, slipId, eventTypeId, or metricKey values.',
    'For numeric metrics set numberValue equal to rawNumberValue (do not convert units).',
    'If ambiguous, return needs_clarification with one short question.',
    '',
    'Catalog:',
    buildCatalogMarkdown(catalog),
    '',
    'Return exactly one JSON object:',
    '{ "status": "ok", "events": [ { "eventTypeId": "...", "vesselId": "...", "slipId": "...", "metrics": [ { "metricKey": "...", "numberValue": 1, "rawNumberValue": 1, "userUnit": "liter", "rawUnitToken": "L" } ] } ] }',
    'or { "status": "needs_clarification", "clarificationQuestion": "..." }',
  ].join('\n')
}

/**
 * LLM extract for `/log` remainder. Output is still untrusted — allowlist next.
 */
export async function extractLogEvents(input: {
  llm: LlmPort
  catalog: HarborCatalog
  userText: string
  subjectId?: string
}): Promise<
  Result<ExtractLogResult, { code: string; message: string; details?: unknown }>
> {
  const llmResult = await input.llm.completeChat({
    systemPrompt: buildSystemPrompt(input.catalog),
    messages: [{ role: 'user', content: input.userText }],
    temperature: 0,
    responseFormatJsonObject: true,
    observability: {
      caller: 'extract-log',
      subjectId: input.subjectId,
    },
  })

  if (llmResult.error) {
    return err({
      code: 'EXTRACT_LLM_FAILED',
      message: llmResult.error.message,
      details: { llmCode: llmResult.error.code },
    })
  }

  const parsed = parseJsonObject(llmResult.data.text)
  if (parsed.error) return parsed

  const shaped = extractLogLlmSchema.safeParse(parsed.data)
  if (!shaped.success) {
    return err({
      code: 'EXTRACT_SCHEMA',
      message: 'Model JSON did not match the extract schema.',
      details: shaped.error.issues.slice(0, 5),
    })
  }

  if (shaped.data.status === 'needs_clarification') {
    return ok({
      kind: 'clarification',
      question: shaped.data.clarificationQuestion,
    })
  }

  return ok({ kind: 'events', events: shaped.data.events })
}
