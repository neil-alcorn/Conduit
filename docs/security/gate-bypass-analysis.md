# Gate Bypass Attack Surface Analysis

> **Scope:** Security review for gate evaluation logic — `conduit gate eval`, `conduit gate approve`, `conduit gate reject` commands

---

## Summary

The gate command surface is low-risk: all operations are local filesystem reads/writes with no network calls, no remote state, and no privilege escalation. The primary risk is human process bypass — nothing here requires a kernel exploit. All findings are Low or Medium severity.

---

## Attack Surface Inventory

### 1. Manual YAML Edit

**Description:** An actor edits `convoys/active/<id>/convoy.yaml` directly to advance the stage field without going through `conduit gate approve`.

**Severity:** Medium

**Current mitigation:**
- None. The YAML file is mutable by anyone with filesystem write access.
- `conduit gate approve` writes to `audit/gate-log.jsonl`; a manual edit leaves no audit trail.

**Recommendation:**
- On every `conduit gate eval` or `conduit status`, cross-check the stage in convoy.yaml against the count of `gate_passed` events in gate-log.jsonl. Alert if they diverge.
- Future: add a `sync_hash` (SHA of yaml content) to each gate event, so tampering is detectable.

---

### 2. CLI Argument Injection

**Description:** A malicious actor crafts convoy-id or gate-type arguments containing shell metacharacters or path traversal sequences (e.g., `../../etc/passwd`, `; rm -rf`).

**Severity:** Low

**Current mitigation:**
- The CLI does not invoke any shell commands with user-supplied arguments. All file path construction uses `path.join()` which normalizes traversal sequences.
- `path.resolve()` in `resolveRepoPath()` resolves the final absolute path safely.
- `fs.existsSync` / `fs.readFileSync` operate on the resolved path, not a shell expansion.

**Recommendation:**
- Add explicit validation that convoy-id matches `/^[a-z0-9-]+$/` before file path construction. Reject IDs with slashes, dots, or non-alphanumeric characters.

---

### 3. Repo Signal Bypass

**Description:** An actor removes or modifies `CONDUIT.md` to eliminate the `READ-ONLY` or `QUARANTINE` signal, then runs `conduit gate approve` on a locked repo.

**Severity:** Medium

**Current mitigation:**
- `checkPermission()` in `signals.ts` reads `CONDUIT.md` at the path resolved from `--repo` or cwd. It fails closed: missing file defaults to `ACTIVE` (permissive), which is a gap.
- A `QUARANTINE` signal correctly blocks all writes. A `READ-ONLY` signal blocks write intent.

**Recommendation:**
- Change the missing-file default from permissive (`ACTIVE`) to restrictive (`READ-ONLY`). Require explicit `ACTIVE` signal to allow writes.
- Log a warning when `CONDUIT.md` is absent so the actor is aware they're in an unregistered repo.

---

### 4. Audit Log Tampering

**Description:** An actor deletes or edits `audit/gate-log.jsonl` after a gate approval to remove evidence of a rejection or to forge an approval.

**Severity:** Medium

**Current mitigation:**
- None. The JSONL file is writable by anyone with filesystem access.
- There is no hash chaining or external witness.

**Recommendation:**
- On `conduit gate eval`, verify gate-log.jsonl exists when the stage is > 0. Alert if the log is missing or empty for a non-zero stage.
- Future: emit gate events to a secondary store (optional registry / database) as an independent audit witness.

---

### 5. Unauthorized Approver

**Description:** Any user who can run the `conduit` binary and has write access to the repo can approve a gate, regardless of the gate's defined approver roles in `gates/protocols/*.yaml`.

**Severity:** Medium

**Current mitigation:**
- None. `currentActor()` reads `USERNAME` / `USER` env var — trivially spoofable.
- Gate protocol YAML files define required approver roles but are not enforced by the CLI.

**Recommendation:**
- Add approver validation: read the gate protocol for the given gate type and check that the current actor matches a required role. Fail if not.
- Enforce at the optional registry level (authenticated caller) for stronger guarantees.

---

### 6. Replay Attack

**Description:** An actor captures a valid `gate approve` command invocation and re-runs it to double-advance the stage (or re-approve a gate that was rejected).

**Severity:** Low

**Current mitigation:**
- `conduit gate approve` always increments stage by 1 regardless of what stage the gate is for. There is no idempotency check.
- Running it twice will advance the stage twice.

**Recommendation:**
- Before incrementing, verify that `stage < expected_max_stage`. Alternatively, record the gate type in convoy.yaml as the last-approved gate and refuse to approve the same gate type twice.

---

## No High-Severity Findings

No code changes are required from this review. All findings are Low or Medium, process-level risks. Recommended hardening (convoy-id validation, missing-file default to READ-ONLY, approver enforcement) should be tracked as follow-on work items.
