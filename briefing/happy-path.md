# Happy path (reviewer briefing)

One pipeline. Clone → configure one key → prove the loop.

## 1. Install (no API key)

```sh
cp .env.example .env
npm install
npm test
npm run typecheck
```

All unit/evals use a mock model. They must stay green offline.

## 2. Live demo (two LLM `/log`s + HITL park)

Set `LLM_API_KEY` (and optional `LLM_BASE_URL` / `LLM_MODEL`) in `.env`.

```sh
npm run demo
```

What happens:

1. **`/log` (ambiguous)** — live extract on “Meridian at the fuel dock”; usually **`needs_clarification`** (no inventing ids). Trace under `var/traces/`. No self note yet.
2. **`/log` (successful)** — clear ids (`vessel V-101`, `slip D4`); allowlist + `log_event`; a **self** note lands in `var/memory.json`; `status: "ok"`.
3. **`/notice`** — clerk drafts a gale warning, critic checks grounding, **`send_notice` parks** under `var/pending/<operationId>.json`. Default path does **not** send. Console ends with `Approve with: …`.

Approve the parked notice (separate command):

```sh
npm run approve -- <operationId>
```

That moves the notice to `var/outbound/` with status `sent`.

Escape hatch only (not the reviewer story): `npm run demo -- --yes`.

## 3. What this proves

| Claim                              | Where                                           |
| ---------------------------------- | ----------------------------------------------- |
| Graph owns the loop                | `evaluateInbound` + classifier                  |
| LLM fills JSON; catalog owns truth | extract → allowlist → units                     |
| Clarification over invention       | 1st `/log` → `needs_clarification`              |
| Match-before-mint                  | `match_vessel_or_slip` proposals                |
| Human sends outbound               | HITL park + `approve`                           |
| Traces are inspectable             | `var/traces/*.json`                             |
| Memory write + retrieve policy     | 2nd `/log` → `var/memory.json`; exclude-`other` |

## 4. Three files to open first

1. `src/orchestration/run.ts`
2. `src/tools/runSpecialistPath.ts`
3. `ARCHITECTURE.md`

Narrative walkthrough (examples + how to read `var/traces/`): [`flow.md`](flow.md).

Human review trail for this final PR (what had to be asked / changed): [`human-review-pr5.md`](human-review-pr5.md).
