# Human review notes (PR5)

What the human reviewer had to push back on, clarify, and reshape after the agent’s first pass on **memory + docs + live demo**. This is the review trail for the final portfolio PR — not the earlier scaffold/policy/catalog/HITL PRs.

Thesis of this note: the agent can ship a working slice; a reviewer still has to make the **story readable**, the **demo prove every claim**, and the **docs match what the files actually contain**.

---

## Starting point (agent draft)

PR5 initially landed:

- Memory store + exclude-`other` retrieve policy
- JSON trace persistence under `var/traces/`
- `npm run demo` with two ops: ambiguous `/log`, then parked `/notice`
- `README` / `ARCHITECTURE` / short happy-path briefing

That was enough to run. It was not enough to **explain** or to **demonstrate** every claim in the docs (especially durable self notes).

---

## Review asks → outcomes

### 1. Opaque memory wording

**Asked:** `ARCHITECTURE.md` said retrieve-for-self “drops `other`” — what does that mean?

**Why it mattered:** Portfolio readers hit memory policy early; jargon without intent is a trust leak.

**Outcome:** Bullet expanded: omit `attribution: 'other'` notes from the desk’s own prompt context; third-party notes stay stored; writes of `other` still require `otherName`.

---

### 2. Missing user-facing flow guide

**Asked:** Write a briefing that explains how the flow works for a user — more detail, more examples, side comments on system behavior — plus how to read `var/traces/` envelopes.

**Why it mattered:** `ARCHITECTURE.md` is a map; reviewers needed a walkthrough tied to demo ops and real JSON.

**Outcome:** [`flow.md`](flow.md) — loop diagram, inbound policy, seats, `/log` / `/notice` / free-text paths, `var/` layout, run/step envelope shapes, status table, mini-walkthroughs.

Wired from `README.md`, `happy-path.md`, and `ARCHITECTURE.md`.

---

### 3. First pass on `flow.md` was still too insider

**Asked (batch):**

| Review point                | Gap                                                                  |
| --------------------------- | -------------------------------------------------------------------- |
| Style `catalog` / `critic`  | Not obvious they are specialist / claim-check roles                  |
| What is `continue`?         | Read like a loop keyword                                             |
| “Skip the address gate”     | Unclear for radio free-text                                          |
| Path intros                 | Tie each path to `npm run demo` operations                           |
| CLI                         | Print titled ops + the simulated radio body                          |
| “Scratch line”              | Unexplained                                                          |
| Ambiguous `/log`            | Confirm it fails open toward clarification because vessel id is weak |
| Clarification in the trace  | Question not visible in the JSON (only `kind`)                       |
| `/notice` “classifier” step | Why label again if command already chose notice?                     |
| Self notes                  | Is the write path real? Does the demo actually write one?            |
| Trace after approve         | Still `needs_approval` though outbound exists                        |
| `clerk` vs HITL             | Easy to confuse seat with human approval                             |

**Outcomes:**

- Role styling (`catalog` specialist, `critic` agent, `clerk` specialist vs HITL aside)
- `continue` explained as policy “keep processing free-text” (opposite of `skip`), not a loop
- Address gate section: pier-only naming check; radio never runs it (DM-like)
- Demo CLI titles + `Radio message: "…"`
- Scratch = ephemeral in-process chat-thread history
- LLM step result now includes `question` on clarification (not only `kind`)
- `/notice` documents `classifyOverride` (forced `clerk` seat for the shared runner)
- Docs state: self-note path is wired, but a clarification-only demo never created `var/memory.json`
- Docs state: approve updates outbound, **not** the frozen trace snapshot
- Explicit aside: last park step is the `clerk` specialist invoking HITL, not a second “clerk” agent

---

### 4. Second pass — still fuzzy; make the docs carry the answers

**Asked:** Put `continue` and address-gate clarity into the file itself; confirm scratch ≈ ephemeral thread history and write that down; confirm self-note / trace / clerk understandings.

**Outcome:** Expanded sections in [`flow.md`](flow.md) (decision table for `continue`, “Address gate (pier only)”, scratch wording, memory write conditions). Q&A closed in chat; durable answers live in the briefing.

---

### 5. Demo must exercise the memory claim

**Asked:** Add a third example — a **successful** `/log` — so `var/memory.json` is actually created and the write path is used. Update all docs.

**Why it mattered:** Docs claimed durable self notes; the live script never produced one. Reviewers who only run `npm run demo` would never see the feature.

**Outcome:**

1. Ambiguous `/log` → usually `needs_clarification`
2. Successful `/log` (`V-101` + slip `D4`) → `log_event` + self note → `var/memory.json`
3. `/notice` → park (order adjusted again in the next ask)

Docs (`flow.md`, `happy-path.md`, `README`, `ARCHITECTURE`) updated to match.

---

### 6. Channel fiction + CLI polish

**Asked:** Quote radio/pier bodies in the CLI; confirm all three demo messages are radio; is pier close-range walkie-talkie chatter?

**Outcome:** Quoted `Radio message: "…"` (and `Pier message:` when channel is pier). All three live demo ops use `channel: 'radio'`. Aside in `flow.md`: pier ≈ shared dockside / walkie group channel; radio ≈ directed desk traffic — both RF in fiction, different social rules (address gate only on pier).

---

### 7. Demo UX: memory mid-script, approve last + readable color

**Asked:** Make successful `log_event` the **2nd** operation so `Approve with: …` is the last line printed; add light color to logs.

**Outcome:** Final live order:

1. Ambiguous `/log`
2. Successful `/log` (+ memory file line)
3. `/notice` → parked → **`Approve with: npm run approve -- <id>`** last

TTY ANSI: cyan headers, status colors, yellow clarification / park, green approve hint. Docs renumbered again.

---

## Also fixed along the way (agent / review spillover)

| Issue                                                                      | Fix                                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Trace step `type` collided with envelope `type` when spreading `TraceStep` | Nested `{ record, step }` (later pretty JSON array under `var/traces/<id>.json`) |
| Clarification text only on stdout                                          | Persist `result.question` on the `llm` step                                      |

---

## What this showcases (human role)

On this final PR the human had to:

1. **Catch opaque language** before it shipped as “architecture.”
2. **Demand a narrative artifact** (`flow.md`) aimed at readers, not only module maps.
3. **Interrogate every abstract claim** against the live demo (`continue`, address gate, scratch vs long-term, clerk vs HITL, trace vs approve).
4. **Insist the demo prove memory**, not only implement the port.
5. **Tune operator UX** (op order, quoted bodies, color, approve as last line) so the happy path is obvious in a terminal.

The agent implemented; the reviewer made the portfolio **legible and honest**.

---

## Related files

- Narrative walkthrough: [`flow.md`](flow.md)
- Short clone → demo checklist: [`happy-path.md`](happy-path.md)
- Trust boundaries / prod→demo: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Live script: [`../scripts/demo.ts`](../scripts/demo.ts)
