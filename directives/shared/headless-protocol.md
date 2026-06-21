<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        directives/shared/headless-protocol.md
# description: Headless CLI mode contract — CONTEXT input, JSON output, exit codes, gate-mutation refusal.
# owner:       HUMAN
# update:      manual
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Applies when `--headless` is set** on `plan` / `execute` / `qa` / `review` / `pre-gate` (CI use). CONTEXT block on stdin; stdout = one JSON document; stderr = JSON-lines events. Never prompts.
- **Gates are human-only:** `gate request` / `gate eval` allowed; `approve` / `reject` / `skip` refused with exit 2.
- **Exit codes:** 0 success · 1 internal · 2 gate-mutation-refused · 3 bad/missing CONTEXT · 4 not-initialized · 10 SEND_BACK.
- **Agent rule:** never ask — emit `pending_question` in the output JSON and exit 3.

# Headless Protocol

> **Authoritative reference for:** the `--headless` CLI contract — CONTEXT block input, JSON output envelope, exit-code matrix, gate-mutation refusal, and commit attribution.

## Purpose

Conduit's CLI is interactive by design. Headless mode (`--headless`) is the additive, machine-facing surface for CI pipelines: it suppresses every prompt, takes structured input on stdin, and emits machine-readable JSON. Running any command without the flag behaves identically to today. This directive is the contract both pipeline authors and agents code against.

---

## (a) CONTEXT Block — Input Contract

Headless commands read a single structured CONTEXT block from **stdin**.

- **Format:** YAML by default. JSON is auto-detected when the first non-whitespace character of stdin is `{` or `[`. No format flag; no other formats.
- **No interactive fallback.** A missing required field is a hard error: exit 3 with a JSON error document naming the field. A malformed block is exit 3 with `{"error": "invalid-context", "details": "<parser message>"}`.
- Each command declares its required-field schema in its command file; the context parser validates before the command body runs.

Per-command required fields (minimal contract; fields marked *TBD* are finalized at Wave 2 implementation against each command's actual `readPrompt` surface):

| Command | Required fields | Optional / TBD |
|---|---|---|
| `plan` | `convoy_id` | `requirements` (freeform intent text), `constraints` — *TBD at implementation* |
| `execute` | `convoy_id` | `workstream_id` (defaults to all ready workstreams), `wave` — *TBD* |
| `qa` | `convoy_id` | `target_url`, `suite` (e.g. `e2e`, `a11y`, `visual`) — *TBD* |
| `review` | `convoy_id` | `depth` (review tier), `scope` (paths/commit range) — *TBD* |
| `pre-gate` | `convoy_id` | `gate` (defaults to the convoy's current stage gate) |

Example (YAML on stdin):

```yaml
convoy_id: conduit-sdlc-headless
gate: gate-3
```

---

## (b) Output Contract

**stdout = exactly one JSON document.** No banners, tables, ANSI colors, or spinners. Every headless result conforms to the base envelope:

```json
{
  "command": "plan | execute | qa | review | pre-gate",
  "convoy_id": "<convoy id>",
  "verdict": "SUCCESS | SEND_BACK | ERROR",
  "artifacts": ["<repo-relative paths written or updated>"],
  "timestamp": "<ISO 8601>"
}
```

Command-specific fields extend (never replace) this base — e.g. `gate eval` adds the GATE EVALUATION REPORT fields as JSON; `qa` adds suite results; error documents add `error` / `message` / `details`.

**stderr = JSON-lines events**, one JSON object per line, for CI log collectors (Splunk, DataDog):

```json
{"event": "<event name>", "timestamp": "<ISO 8601>", "...": "..."}
```

stderr is **never plain text** in headless mode — warnings included (see commit attribution below). `--json` alongside `--headless` is a harmless no-op alias.

---

## (c) Exit-Code Matrix

| Code | Meaning | Typical pipeline branch |
|---|---|---|
| 0 | Success | Continue |
| 1 | Internal error (unexpected exception) — `{"error": "internal", "exception": "<class>", "message": "<msg>"}`; never a stack trace on stdout | Fail the job; file a defect |
| 2 | Gate-mutation refused — headless attempted `gate approve` / `reject` / `skip` | Fix the pipeline; this call should not exist |
| 3 | Validation error — missing required CONTEXT field, malformed CONTEXT block (`invalid-context`), or agent `pending_question` | Fix the CONTEXT block / route the question to a human |
| 4 | Not Conduit-initialized — no CONDUIT.md / `convoys/` at cwd — `{"error": "not-conduit-initialized"}` | Check checkout path and working directory |
| 10 | `gate eval` returned SEND_BACK (advisory verdict, not an error) | Branch: do not request the gate; surface the findings |

Pipelines branch on these codes; the JSON error document on stdout carries the detail.

---

## (d) Gate-Mutation Refusal

**Gates are human-only.** Headless mode can *request* a gate (`gate request`) and *evaluate* one (`gate eval` — advisory, no state mutation), but it can NEVER approve, reject, or skip one. Any headless invocation of `gate approve` / `gate reject` / `gate skip` exits 2 with:

```json
{"error": "gate-mutation-refused", "message": "Gate approvals are human-only; headless mode can only request gates"}
```

No state is mutated. The refusal is enforced **at the CLI layer** — a deterministic check at the top of each gate-mutation entry point — not as a directive-layer rule an agent could reinterpret around. This is Conduit's "CLI enforces, directives describe" split applied to its most important invariant.

**Rationale:** gate approval is the segregation-of-duties boundary. A pipeline that could approve its own gates would collapse requester and approver into one identity and silently void four-eyes review. Keeping approval as a separate human action — even when everything else is automated — preserves exactly the audit posture the gate system exists to provide.

---

## (e) Agent Rule — No Prompts in Headless Mode (AC-12)

An agent operating in headless mode **must never emit an interactive prompt** — not on stdout, not on stderr, not by blocking on input. When the agent reaches a point where it needs a human decision or a missing piece of information:

1. Write the question into the output JSON as a `pending_question` field (string; include enough context for a human to answer asynchronously).
2. Exit with code **3**.

The pipeline surfaces `pending_question` to a human, who answers by enriching the CONTEXT block and re-running. Headless never degrades to interactive; an unanswerable question is a validation failure, not a conversation.

---

## (f) Headless Commit Attribution

Commits made by headless runs (convoy.yaml, living-spec.md, `audit/` writes) are distinguishable in the audit trail:

- **Message prefix:** `conduit (headless): ` on every commit message.
- **Author resolution**, in priority order:
  1. `GITHUB_ACTOR` (GitHub Actions)
  2. A CI-provided requester identity env var (e.g. `BUILD_REQUESTEDFOR` or your pipeline's equivalent)
  3. A CI-provided commit-author env var (e.g. `BUILD_SOURCEVERSIONAUTHOR` or your pipeline's equivalent)
  4. Fallback: `conduit-headless@local`, with a **JSON-formatted warning on stderr** (e.g. `{"event": "warning", "message": "no CI identity env var found; using conduit-headless@local", "timestamp": "..."}`).

Reviewers and auditors can therefore apply the appropriate scrutiny: `conduit (headless):` commits were made by automation under a CI identity; everything else was a human-driven interactive session.

---

## (g) Actor Identity Trust Boundary (SEC-L1)

**`currentActor()` returns the OS username (`$USERNAME` / `$USER`) and is spoofable.** Any user who can set an environment variable before invoking the CLI can impersonate another actor. This means:

- **Gate approvals, event timestamps, and convoy metadata attribute to whoever the OS says is running the process.** On a shared workstation, CI runner, or container the value may be misleading or generic (`root`, `vsts`, `ContainerAdministrator`).
- **The actor may be upgraded to a verified tracker identity when your work tracker's auth token is set in the environment.** This is stronger — the token is validated against the tracker's endpoint — but optional today.
- **Neither mechanism is cryptographic.** There is no signing, no token binding, no device attestation.

**What this means for gate audit:**
- Four-eyes review is enforced by process (two distinct sessions, two human prompts), not by cryptographic proof that different humans were present.
- A single human with two terminal sessions could self-approve a gate by setting `USERNAME` to a colleague's value. The audit log would record the spoofed name.

**Roadmap — device-flow authentication:** The real fix is device-flow auth, where the CLI obtains a short-lived token via browser redirect and the actor identity is the authenticated principal from your identity provider. This eliminates env-var spoofing entirely. Tracked as a future convoy (not yet filed). Until then, `currentActor()` is a best-effort identity — sufficient for attribution in a trust-the-developer model, insufficient for compliance-grade non-repudiation.
