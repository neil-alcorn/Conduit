# RUNBOOK — Archived Convoy Status Migration

**Script:** `scripts/migrate-archived-status.ts`
**Purpose:** One-time backfill of `status: released` (or `status: withdrawn`, manual) on every archived convoy whose `convoy.yaml` predates the released/withdrawn vocabulary.
**Audience:** A single operator who runs this once after the CLI release ships, then reviews the resulting commit and follows up on any reclassifications.
**Safety:** Idempotent, dry-run-first, single git commit per run, archive-only (never touches `convoys/active/`).

---

## When to run this

Run **once** per local clone of the conduit repo, after the release that ships the new schema enum (`released`, `withdrawn`, `planned`) and the new `conduit convoy close --withdrawn --reason "..."` flag pair has landed on `master`. The script does not need to be re-run; running it again is a no-op.

If multiple operators have local clones, each operator runs it locally — but only one push lands on `master`. The script defaults to `--no-commit`-equivalent unless you opt in. See the "Step 4 — Commit and push" section.

---

## Pre-flight

1. You have pulled the latest `master` of conduit:
   ```bash
   git -C "$CONDUIT_REPO" fetch origin
   git -C "$CONDUIT_REPO" checkout master
   git -C "$CONDUIT_REPO" pull --ff-only
   ```
2. The CLI has been built so the compiled migration script exists at `dist/scripts/migrate-archived-status.js`:
   ```bash
   cd "$CONDUIT_REPO" && npm run build
   ```
3. `convoys/archive/` exists and contains the convoys you expect. Spot-check by listing it.

---

## Step 1 — Dry run

The dry-run flag prints exactly what the script would change without touching disk or git. Always run this first.

```bash
node "$CONDUIT_REPO/dist/scripts/migrate-archived-status.js" --dry-run --repo "$CONDUIT_REPO"
```

Expected output: a per-convoy list with `MIGRATE` / `ok` / `ok-w` rows and a summary count. Read it. If anything is surprising — a convoy that *should* be `withdrawn` but the script has it as `MIGRATE → released` — note its ID for Step 5 (manual reclassification).

If the dry-run shows zero `MIGRATE` rows, every archived convoy is already on the new vocabulary and there is nothing to do.

---

## Step 2 — Apply

Once the dry-run output looks correct:

```bash
node "$CONDUIT_REPO/dist/scripts/migrate-archived-status.js" --repo "$CONDUIT_REPO"
```

This will:
1. Update each migrating `convoys/archive/<id>/convoy.yaml` — set `status: released` and bump the `# last_update:` line.
2. Update `convoys/registry.yaml` — set `status: released` on the matching `archived[]` entries.
3. Write a per-run log file at `scripts/migrate-archived-status-<ts>.log` listing every outcome.
4. Stage all touched files and create a single git commit:
   ```
   migrate: backfill archived convoy status as released
   ```

It will **not** push by default. The commit is local until you explicitly push it.

---

## Step 3 — Review the commit

Before pushing, review the commit:

```bash
git -C "$CONDUIT_REPO" log -1 --stat
git -C "$CONDUIT_REPO" show HEAD
```

Confirm:
- The diff only touches `convoys/archive/*/convoy.yaml` and `convoys/registry.yaml`.
- No `convoys/active/` files were touched.
- The status changes look right against your expectations from Step 1.
- The per-run log file is included.

If anything is wrong, `git reset --hard HEAD~1` rolls the commit back, and you can investigate before re-running.

---

## Step 4 — Commit and push

If the review passes, push the commit:

```bash
git -C "$CONDUIT_REPO" push origin master
```

Or run the migration with `--push` from the start (only if you trust the dry-run output completely):

```bash
node "$CONDUIT_REPO/dist/scripts/migrate-archived-status.js" --repo "$CONDUIT_REPO" --push
```

---

## Step 5 — Manual reclassification of withdrawn convoys

The migration **defaults every legacy `closed` convoy to `released`**. It does not infer withdrawn-vs-released from event history — inference produces wrong answers in edge cases.

If any archived convoy in your repo was actually abandoned mid-flight — i.e., `withdrawn` is the correct terminal state, not `released` — open a manual follow-up commit per convoy:

1. Edit `convoys/archive/<id>/convoy.yaml`:
   ```yaml
   status: withdrawn
   withdrawn_at: "<ISO-8601 timestamp, e.g. 2026-04-30T12:00:00.000Z>"
   withdrawn_reason: "<≥10-char description of why this convoy was abandoned for the audit trail>"
   ```
2. Edit `convoys/registry.yaml` — find the matching `archived[]` entry and update:
   ```yaml
   - id: <convoy-id>
     path: convoys/archive/<convoy-id>/
     status: withdrawn
     withdrawn_at: "<same timestamp>"
     withdrawn_reason: "<same reason>"
   ```
3. Commit with a descriptive message naming the convoy and reason. Push.

Each reclassification is its own commit so it shows up clearly in `git blame` as an intentional act.

---

## Re-running

The script is **idempotent**: re-running against an already-migrated repo is a no-op. It checks each convoy's `status` field; convoys already at `released` or `withdrawn` are skipped without changes. If nothing changes, no commit is created.

---

## Optional flags

| Flag | Effect |
|---|---|
| `--dry-run` | Print proposed changes; touch no files; create no commit. Always run this first. |
| `--repo <path>` | Path to conduit repo root. Defaults to current working directory. |
| `--no-commit` | Apply file changes but skip the git commit step. Useful when batching with other changes. |
| `--push` | After committing, push to `origin` automatically. Off by default. |
| `--help` / `-h` | Show usage. |

---

## Failure modes

- **`git commit failed: nothing to commit`** — the script ran but nothing was migrated. Treat as success.
- **Dry-run shows expected migrations but apply step fails to commit** — files were modified on disk; the script attempted `git add` + `commit` but git rejected. Inspect with `git status` and re-stage/commit manually. Re-running the script in this state is safe (it will be a no-op for the already-migrated files).
- **Script reports a convoy YAML it cannot parse** — the script only uses regex on the `status:` line, so it will not throw on parse, but if `status:` is genuinely missing it will append a new line. Inspect the diff before pushing to confirm the file shape is still readable as YAML.

---

## Related references

- Convoy schema: `convoys/schema/convoy.schema.json` — the `status` enum now contains `released, withdrawn, planned, closed` (closed retained during a 3-release deprecation window).
- CLI for new closes (forward-going): `conduit convoy close <id>` (Gate-8-approved → released) or `conduit convoy close <id> --withdrawn --reason "..."`.
