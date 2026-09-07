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

**PR4 seats + HITL.** Classifier → one specialist; critic; `send_notice` parks for `npm run approve`.

## How to run (so far)

```sh
cp .env.example .env   # optional until the live demo script lands
npm install
npm test
npm run typecheck
```

Approve a parked notice (after a run that created `var/pending/<operationId>.json`):

```sh
npm run approve -- <operationId>
```

Live `npm run demo` arrives in a later PR.

## What a reviewer should look at first

1. [`src/orchestration/run.ts`](src/orchestration/run.ts) — policy → log / notice / classifier path
2. [`src/tools/runSpecialistPath.ts`](src/tools/runSpecialistPath.ts) — one specialist + maxSteps
3. [`src/hitl/port.ts`](src/hitl/port.ts) — park `send_notice` until approve

## Mapping (preview)

| Production pattern              | Demo module                                |
| ------------------------------- | ------------------------------------------ |
| Ops classifier → one seat       | `src/agents/classify.ts`                   |
| Draft vs human send             | `src/hitl/` + `send_notice`                |
| Claim / allowlist critic        | `src/agents/critic.ts` + `src/guardrails/` |
| Inbound policy                  | `src/orchestration/evaluateInbound.ts`     |
| Zod extract + match-before-mint | `src/tools/`                               |
| Provider chat completion        | `src/llm/`                                 |

Full architecture diagram and prod→demo collapse: coming in `ARCHITECTURE.md`.

## License

MIT © Talles Hentges
