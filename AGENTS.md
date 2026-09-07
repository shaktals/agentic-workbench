# AGENTS.md

How an AI coding agent should work in this repo.

## Scope

- This directory is a **standalone public portfolio repo**. Treat it as the only workspace.
- Do **not** directly copy code, prompts, schemas, or brand copy from any private sibling checkout.
- Extract **patterns and interfaces**, then reimplement them in the harbor-desk domain.
- Prefer one working pipeline over many half-demos. No stub features that pretend to work.

## PR discipline

- One focused PR at a time (scaffold → policy → catalog → agents/HITL → memory/docs).
- Ship tests in the same PR as the code they cover.
- `npm test` must stay green without network or a paid API key.
- Only `scripts/demo.ts` (later) may call a live model.
- **Do not commit, push, or open a GitHub PR unless the user explicitly asks in that message.** “Implement PR N” / “go ahead with PR N” means code for Cursor review only — instruction to commit/push/PR from an earlier turn does not carry forward.

## Stack conventions

- TypeScript, ESM (`"type": "module"`), Zod, `ulid`.
- Imports from `src/`: use `#…` (package `imports`); avoid multi-level `../`.
- Results: `{ error, data }` via `src/result.ts`. Convert throws at the boundary; do not nest `try/catch`. `try/finally` for cleanup is fine — extract throw-site mapping (`fetch`, `JSON.parse`) into a helper that returns `Result`, then early-return `err(...)` in the caller.
- Tests: `node:test` under `test/`, mirroring `src/`. No Jest/Vitest.
- Prettier: no semicolons, single quotes, `arrowParens: avoid`.
- LLM: one OpenAI-compatible adapter (`LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL`). No vendor-specific clients.

## Trust boundaries

- Catalog allowlists and the policy graph own truth; the model fills JSON.
- Risky tools (outbound send) park for human approval; do not auto-send in the default path.
- Never commit secrets, `.env`, or `var/`.

## When unsure

Leave identifying or proprietary detail out. Describe the pattern in docs instead of inventing product-shaped stubs.
