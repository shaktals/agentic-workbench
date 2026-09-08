# How the harbor desk flow works

This guide is for someone running the demo and wanting to follow what happens after a message arrives — including how to read the JSON files under `var/traces/`.

**Short version:** one inbound message becomes one `operationId`. A deterministic policy graph decides whether to act. The model may fill JSON; the `catalog` specialist and the `critic` agent decide what is real. Outbound notices park for a human unless you opt into auto-approve.

> **Aside — why it feels “small”:** production uses workers, Redis leases, and databases. The demo collapses that to an in-process `run()` with files under `var/`. The _contracts_ (one message → one operation, park before send, allowlist after extract) are the point.

---

## The loop at a glance

```text
inbound message
    │
    ▼
evaluateInbound          ← pure rules, no model
    │
    ├─ skip              (pier chatter not addressed → stop)
    ├─ /log ──────────► extract → allowlist → log_event → maybe memory
    ├─ /notice ───────► clerk specialist → draft → critic → send_notice (park)
    └─ continue ──────► free-text: classify → one specialist
                        (`catalog` | `scribe` | `clerk`)
                              │
                              └─ same tool paths as above when relevant
    │
    ▼
write var/traces/<operationId>.json
```

**`continue`’s role (policy decision, not a loop):**

`evaluateInbound` returns one of a few actions. `continue` is the branch for “this message is allowed free-text — keep processing it.” It is **not** “keep iterating,” “resume a parked job,” or a while-loop. Think of it as the opposite of `skip`:

| Decision         | Plain English                                                                    |
| ---------------- | -------------------------------------------------------------------------------- |
| `skip`           | Stop. Do not classify, do not call tools.                                        |
| `log` / `notice` | Command shortcut — go straight to that path.                                     |
| `continue`       | Not a command, but we should act — hand the body to `classify` → one specialist. |

So in the diagram, `continue` is just the free-text on-ramp into the specialist seats.

Each run also stamps a **trace**: a pretty-printed JSON array you can open in an editor. That is the best “flight recorder” for understanding a run.

---

## Step 1 — Inbound policy (`evaluateInbound`)

Before any specialist or LLM call, the graph answers: _do we act, and how?_

| Kind of message | Channel / shape                             | Decision   | What happens next                                                |
| --------------- | ------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Pier chatter    | `pier`, no “desk” / `@harbor` / reply       | `skip`     | Trace ends as `skipped`; no tools                                |
| Pier addressed  | e.g. `desk — which slip for Meridian?`      | `continue` | Classifier picks a specialist                                    |
| Radio free-text | e.g. `need a berth hold for Aurora tonight` | `continue` | Same specialist path — see address gate below                    |
| Explicit log    | `/log fuel 40 L on Meridian…`               | `log`      | `scribe` extract path (needs LLM for live demo)                  |
| Explicit notice | `/notice gale warning…`                     | `notice`   | `clerk` specialist path (no model required for the canned draft) |

Commands win over free-text. Empty `/log` or `/notice` stop early instead of inventing work.

### Address gate (pier only)

The **address gate** is a pier-only filter: “did this group message actually talk to the desk?”

- On **`pier`**, the desk only acts if the body contains a hint like `desk` / `@harbor`, or `replyToDesk` is set. Otherwise → `skip` (noise in a shared channel).
- On **`radio`**, that filter is **not run**. A radio message is treated like a direct line to the desk, so free-text can go straight to `continue` without saying “desk”.

“Radio free-text skips the address gate” means: radio never has to pass the pier naming check — not that radio messages are ignored.

**Examples**

```text
# pier — address gate applies
anyone seen the fuel truck?          → skip (pier, not addressed)
desk — which slip for Meridian?      → continue → catalog specialist (lookup)

# radio — address gate does not apply
need a berth hold for Aurora tonight → continue → scribe (no need to say "desk")

# commands (either channel) — parsed before the gate
/log fuel 40 L vessel V-104          → log → extract + allowlist
/notice gale warning for outer basin → notice → clerk specialist + HITL park
thanks                               → continue → ignore (chatter; classifier)
```

> **Aside — pier vs radio:** both can be RF in the fiction. **`pier`** ≈ shared close-range dockside channel (walkie / open group chatter) — noisy, so the desk only wakes when addressed. **`radio`** ≈ a directed call to the desk (DM-like) — no address gate. Same production idea: don’t wake the agent for every group message, but do wake for direct traffic.

---

## Step 2 — Seats (classifier → one specialist)

On `continue` (and when `/notice` reuses the specialist runner), a **deterministic classifier** picks exactly one seat — the model does not choose the specialist.

| Seat                 | Typical triggers                           | Job                                                              |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `catalog` specialist | “which slip”, “look up”, “where is…”       | Search / match vessels & slips; never mint unknown ids silently  |
| `scribe` specialist  | fuel, berth hold, operational log-ish text | Extract structured events; write via `log_event` after allowlist |
| `clerk` specialist   | notice, gale, weather, advisory            | Draft outbound text → `critic` → park send                       |

The **`critic`** is not a seat. It is a separate claim-check agent that runs before outbound send (and the allowlist step is traced with `type: "critic"` on the log path too). Soft chatter (`thanks`, `lol`, empty) becomes `ignore` — no invented work.

> **Aside — `clerk` vs HITL:** the `clerk` specialist drafts and calls `send_notice`. **HITL** is the human approval step (`npm run approve`), not another agent named clerk. Trace steps for park still show `agent: "clerk"` because that seat invoked the tool.

---

## Path A — `/log` ambiguous (`scribe` specialist)

This is the first operation simulated by `npm run demo` — intentionally underspecified so you can see clarification:

```text
— 1st operation: Live /log — often needs clarification (calls the model) —
Radio message: "/log fuel 40 L on Meridian at the fuel dock"
```

1. Policy decides `log` and strips the remainder (`fuel 40 L on Meridian…`).
2. Memory: append one **scratch** line for this thread (think ephemeral chat-thread history for the current Node process — lost when the process exits; not `var/memory.json`), then retrieve **self** long-term notes only (not `attribution: 'other'`).
3. LLM extracts JSON events (Zod-shaped). If the text is ambiguous (e.g. vessel **name** without a clear catalog id, or missing fields), the model should return `needs_clarification` and stop instead of inventing an id.
4. On clarification: no allowlist write, no `log_event`, **no** self note. Trace ends `needs_clarification`.

**Expected live outcome:** `status: "needs_clarification"`. Look for:

- Console: `clarification: …` (printed by `npm run demo`)
- Trace `llm` step: `result.kind: "clarification"` and `result.question`

That is expected behavior, not a crash. Operation 2 shows the same path succeeding with clearer ids.

> **Aside — “LLM fills JSON; catalog owns truth”:** the model proposes structure; ids and metrics must still pass server checks. That is why goldens test allowlist failure _after_ a mock LLM invents a bad id.

---

## Path B — `/log` successful (`scribe` + self note)

This is the second operation simulated by `npm run demo` — clear catalog ids so extract + allowlist can commit:

```text
— 2nd operation: Live /log — successful commit + self note (calls the model) —
Radio message: "/log fuel 40 L on vessel V-101 at slip D4"
```

(`V-101` / Meridian and slip `D4` are in `fixtures/catalog.json`.)

1. Same policy + scratch + retrieve as Path A.
2. LLM extracts structured events (Zod-shaped).
3. Server **allowlist** + unit conversion. Match-before-mint resolves names/registrations to catalog ids.
4. `log_event` stores the event in the in-memory event store.
5. A **self** long-term note appends to `var/memory.json` (trace step `memory` / `note_written`).
6. Trace `status: "ok"` with `llm` then `tool` (`log_event`) steps.

After this op, open `var/memory.json` — that is the durable self-note path in action.

---

## Path C — `/notice` (`clerk` specialist + HITL)

This is the third operation simulated by `npm run demo` (printed last so the approve hint is the final console line):

```text
— 3rd operation: /notice (HITL park; no model required) —
Radio message: "/notice gale warning for outer basin near slip C3"
```

1. Policy decides `notice`.
2. The runner still records a classifier-shaped step, but for explicit `/notice` the seat is **forced** to the `clerk` specialist (`classifyOverride`) so the same draft → critic → park path is reused — it is not re-guessing the route from free-text.
3. `draft_notice` builds a draft (subject/body; may attach `slipId` / `vesselId` from catalog text match).
4. The **`critic`** agent checks claims are grounded in the source text (no invented vessels/numbers).
5. `send_notice` **parks** the draft at `var/pending/<operationId>.json`. Default path does **not** send.
6. Trace `status: "needs_approval"` (snapshot at park time — see below).

Approve (human step):

```sh
npm run approve -- <operationId>
```

That moves the notice to `var/outbound/` with `status: "sent"`. It does **not** rewrite the earlier `var/traces/<operationId>.json`; the trace stays a record of the agent run that ended in “needs approval.” Treat outbound as the approval receipt.

Escape hatch only: `npm run demo -- --yes` auto-approves. Reviewers should prefer the park.

**Example remainder:** `/notice gale warning for outer basin near slip C3`  
→ draft mentions slip C3 → `critic` ok → parked → approve when you are ready.

> **Aside — why park is the story:** the portfolio claim is “humans send outbound,” not “agents blast radios.” Auto-approve exists so CI/demo scripts can finish without a second process.

---

## Path D — Free-text `continue` (more examples)

These never start with `/log` or `/notice`; the classifier routes them:

| Inbound body                           | Likely seat          | Rough outcome                                     |
| -------------------------------------- | -------------------- | ------------------------------------------------- |
| `desk — which slip for Meridian?`      | `catalog` specialist | Match / search; proposals for unknowns            |
| `fuel 40 L on Aurora` (radio)          | `scribe` specialist  | Same extract path as `/log` if an LLM is provided |
| `need a berth hold for Aurora tonight` | `scribe` specialist  | Berth-hold style handling via scribe tools        |
| `gale advisory for the outer basin`    | `clerk` specialist   | Draft → `critic` → park                           |

If no LLM is configured, paths that need extract fail closed rather than guessing.

---

## Memory: scratch vs long-term notes

| Kind                      | Where                           | Lifetime              | Written when                                                                                                                      |
| ------------------------- | ------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Scratchpad                | In-process map (per `threadId`) | Process lifetime only | Every run with memory enabled appends a short inbound preview line — like a tiny ephemeral chat-thread history for that thread id |
| Long-term **self** notes  | `var/memory.json`               | Durable on disk       | After a successful `log_event` (demo **2nd** operation). Not written on `needs_clarification`, skip, or `/notice` alone           |
| Long-term **other** notes | same file                       | Durable on disk       | API supports `attribution: 'other'` + `otherName`; the live demo script does not write these                                      |

`npm run demo` therefore creates `var/memory.json` on the **successful** `/log` (operation 2). The first `/log` usually clarifies and writes no note. The `/notice` (operation 3) ends with the approve hint as the last console line.

Retrieve-for-self drops `attribution: 'other'` so third-party notes are not injected into the desk’s own prompt context.

---

## Files under `var/` after a run

| Path                              | Meaning                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `var/traces/<operationId>.json`   | Full step timeline for that run (not updated by later approve) |
| `var/pending/<operationId>.json`  | Notice waiting for `npm run approve`                           |
| `var/outbound/<operationId>.json` | Approved / sent notice                                         |
| `var/memory.json`                 | Long-term notes (`self` / `other`)                             |

`var/` is local scratch — do not commit it.

---

## Making sense of `var/traces/*.json`

### Shape

Each file is a **JSON array**:

1. **Entry 0** — run envelope (`"record": "run"`).
2. **Entries 1…n** — step envelopes (`"record": "step"`), each wrapping one `TraceStep`.

```json
[
  {
    "record": "run",
    "operationId": "01M1Z…",
    "startedAt": "…",
    "finishedAt": "…",
    "status": "needs_approval",
    "stepCount": 6
  },
  {
    "record": "step",
    "operationId": "01M1Z…",
    "step": { "index": 0, "type": "decision", "agent": "supervisor", "…": "…" }
  }
]
```

> **Aside — why `record` + nested `step`?** Each `TraceStep` already has a `type` (`decision`, `llm`, `tool`, …). Nesting avoids colliding with the envelope’s own discriminator. Read `entry.record` first, then `entry.step.type`.

### Run status (`entry[0].status`)

| Status                | Meaning                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ok`                  | Finished successfully (logged and/or sent if auto-approved)                                                |
| `skipped`             | Policy said do not act (e.g. pier not addressed)                                                           |
| `needs_clarification` | Extract asked a question; nothing durable written for that log                                             |
| `needs_approval`      | Notice parked under `var/pending/` when the run finished. Approving later updates outbound, not this field |
| `failed`              | Hard failure (tool error, allowlist reject, `critic` deny, etc.)                                           |

`stepCount` should match the number of `"record": "step"` entries.

### Step fields (inside `step`)

| Field                            | What to look for                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `index`                          | Order within the run (0-based)                                                                    |
| `type`                           | Kind of work — see table below                                                                    |
| `agent`                          | Who “owns” the step: `supervisor`, `classifier`, `catalog`, `scribe`, `clerk`, `critic`, `system` |
| `summary`                        | Short, log-safe label (`log`, `parked`, `extract_log`, …)                                         |
| `tool`                           | Present when `type` is `tool` or HITL tool (`draft_notice`, `send_notice`, `log_event`, …)        |
| `args` / `result`                | Inputs and outcomes (previews, ids, outcomes — avoid secrets)                                     |
| `latencyMs` / `tokens` / `model` | Especially on `llm` steps                                                                         |

### Step `type` values

| `type`     | Typical meaning                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `decision` | Policy or classifier choice (`supervisor` inbound action, or `classifier` → specialist)                         |
| `memory`   | Scratch / self-context retrieve or a later self-note write                                                      |
| `llm`      | Model call (e.g. extract); often has `tokens` and `latencyMs`                                                   |
| `tool`     | `catalog` match helpers, `log_event`, `draft_notice`, etc.                                                      |
| `critic`   | Claim / allowlist check (`ok: true` or flags) — the `critic` agent                                              |
| `hitl`     | Human-in-the-loop boundary — usually `send_notice` with `outcome: "parked"` (invoked by the `clerk` specialist) |
| `thought`  | Reserved / light reasoning breadcrumbs when present                                                             |
| `error`    | Surfaced failure for that branch                                                                                |

### How to read a file in practice

1. Open the array; read **entry 0** — `status` and `operationId`.
2. Scan steps in order; the first `decision` from `supervisor` tells you the inbound branch (`log` / `notice` / `continue` / `skip`).
3. For `/log`, look for `type: "llm"` then later `type: "tool"` with `log_event` (and optionally `memory` / `note_written`). If status is `needs_clarification`, the `llm` result has `kind: "clarification"` and `question`.
4. For `/notice`, expect `draft_notice` → `critic` → `hitl` with `summary: "parked"` and a `pendingPath`.
5. Sum LLM cost casually via `tokens.totalTokens` and `latencyMs` on `llm` steps (stdout also prints a one-line `formatTraceSummary`).

### Mini-walkthrough: parked notice

From a real demo trace (abbreviated):

| index | type       | agent      | What it tells you                         |
| ----- | ---------- | ---------- | ----------------------------------------- |
| 0     | `decision` | supervisor | Inbound was `/notice`                     |
| 1     | `memory`   | system     | Thread scratch touched; no self notes yet |
| 2     | `decision` | classifier | Forced `notice` → `clerk` specialist      |
| 3     | `tool`     | clerk      | `draft_notice` ok                         |
| 4     | `critic`   | critic     | `claim_ok`                                |
| 5     | `hitl`     | clerk      | `send_notice` → `parked` + pending path   |

Run header `status: "needs_approval"` matches that last HITL step. After `npm run approve`, look in `var/outbound/` — the trace file stays as-is.

### Mini-walkthrough: log that asked for clarification

| index | type       | agent      | What it tells you                                                       |
| ----- | ---------- | ---------- | ----------------------------------------------------------------------- |
| 0     | `decision` | supervisor | Inbound was `/log`                                                      |
| 1     | `memory`   | system     | Scratch / empty self context                                            |
| 2     | `llm`      | scribe     | `extract_log` → `kind: "clarification"` + `question` (+ tokens / model) |

Run header `status: "needs_clarification"` — no `log_event` tool step followed. Older traces may only have `kind` without `question`; newer runs include the question text.

### Mini-walkthrough: successful `/log` + self note

| index | type       | agent      | What it tells you                                     |
| ----- | ---------- | ---------- | ----------------------------------------------------- |
| 0     | `decision` | supervisor | Inbound was `/log`                                    |
| 1     | `memory`   | system     | Scratch / maybe prior self notes from earlier in demo |
| …     | `llm`      | scribe     | `extract_log` → `kind: "ok"` (events)                 |
| …     | `tool`     | scribe     | `log_event` committed                                 |
| …     | `memory`   | scribe     | `note_written` → durable `var/memory.json`            |

Run header `status: "ok"`.

---

## Related reading

- Quick clone → test → demo checklist: [`happy-path.md`](happy-path.md)
- Human review trail for the final docs/demo PR: [`human-review-pr5.md`](human-review-pr5.md)
- Trust boundaries and prod→demo map: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Code entrypoints: `src/orchestration/run.ts`, `src/tools/runSpecialistPath.ts`
