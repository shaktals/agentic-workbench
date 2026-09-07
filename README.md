# agentic-workbench

A small, readable **harbor-desk** agent loop by Talles Hentges.

Sanitized showcase of agentic patterns from a private production system: deterministic control flow, typed tools, specialist seats, a critic, human-in-the-loop park for outbound sends, structured traces, and mock-model evals.

## What this is / is not

| Is                                               | Is not                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| One working pipeline you can read in one sitting | A dump of a product codebase                         |
| Patterns: policy graph, allowlists, HITL, traces | Training / wellness / companion product domain       |
| Clone → one API key → run                        | Postgres, Redis, Expo, Docker, k8s, or a message bus |

## Status

**PR3 catalog + `/log` tools.** Extract → allowlist → units → `log_event`. Notice/specialists next.

## How to run (so far)

```sh
cp .env.example .env   # optional until the live demo script lands
npm install
npm test
npm run typecheck
```

Live `npm run demo` arrives in a later PR.

## What a reviewer should look at first

1. [`src/orchestration/run.ts`](src/orchestration/run.ts) — policy decision, then `/log` tool path
2. [`src/tools/handleLog.ts`](src/tools/handleLog.ts) — extract → match-before-mint → allowlist → `log_event`
3. [`evals/log-extract.goldens.json`](evals/log-extract.goldens.json) — right keys / clarify / reject invented ids

## Mapping (preview)

| Production pattern                         | Demo module                                         |
| ------------------------------------------ | --------------------------------------------------- |
| Inbound policy (group only when addressed) | `src/orchestration/evaluateInbound.ts`              |
| Slash-command parse before free-text       | `src/orchestration/parseCommands.ts`                |
| Claimed message → worker decision          | `src/orchestration/run.ts` (in-process)             |
| Zod extract + server allowlist             | `src/tools/extractLogEvents.ts` + `src/guardrails/` |
| Match-before-mint (no silent invent)       | `src/tools/catalogTools.ts`                         |
| Provider chat completion + timeout         | `src/llm/`                                          |
| `{ error, data }` result envelope          | `src/result.ts`                                     |
| operationId + step traces                  | `src/tracing/types.ts`                              |

Full architecture diagram and prod→demo collapse: coming in `ARCHITECTURE.md`.

## License

MIT © Talles Hentges
