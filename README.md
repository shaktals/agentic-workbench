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

**PR2 policy graph.** Deterministic inbound evaluate → decision trace; tools/specialists next.

## How to run (so far)

```sh
cp .env.example .env   # optional until the live demo script lands
npm install
npm test
npm run typecheck
```

Live `npm run demo` arrives in a later PR.

## What a reviewer should look at first

1. [`src/orchestration/run.ts`](src/orchestration/run.ts) — one inbound → decision step (entrypoint)
2. [`src/orchestration/evaluateInbound.ts`](src/orchestration/evaluateInbound.ts) — pier gating + `/log` / `/notice`
3. [`examples/inbound-fixtures.json`](examples/inbound-fixtures.json) — expected policy outcomes

## Mapping (preview)

| Production pattern                         | Demo module                             |
| ------------------------------------------ | --------------------------------------- |
| Inbound policy (group only when addressed) | `src/orchestration/evaluateInbound.ts`  |
| Slash-command parse before free-text       | `src/orchestration/parseCommands.ts`    |
| Claimed message → worker decision          | `src/orchestration/run.ts` (in-process) |
| Provider chat completion + timeout         | `src/llm/`                              |
| `{ error, data }` result envelope          | `src/result.ts`                         |
| operationId + step traces                  | `src/tracing/types.ts`                  |

Full architecture diagram and prod→demo collapse: coming in `ARCHITECTURE.md`.

## License

MIT © Talles Hentges
