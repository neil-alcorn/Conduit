## TL;DR
- **Apply on runtime judgment calls no directive, behaviors.yaml, or user instruction covers** (existing resource, two valid approaches, ambiguous intent before a destructive act).
- **Pattern:** explain the ambiguity and consequences → ask the user with one-letter options → log via `appendDecision` to `decisions.log` → honor the response.
- **Do NOT apply for:** clear errors, gate decisions (always human), or anything resolvable from convoy.yaml/behaviors.yaml.
- Recurring log patterns feed new behaviors.yaml toggles, directive sections, and ACs.

# Decision Learning System

## When to Apply

Apply this pattern when Conduit encounters a runtime judgment call that isn't
covered by an existing directive, behaviors.yaml toggle, or explicit user
instruction. Common triggers:

- A resource (branch, PR, file) already exists when Conduit expected to create it
- Two valid approaches exist and the context doesn't resolve the choice
- An ambiguous user intent must be resolved before a destructive or hard-to-reverse action
- A new failure mode appears that no directive anticipates

**Do NOT apply for:** clear errors, gate decisions (always human), or choices
that can be resolved by reading convoy.yaml or behaviors.yaml.

## Pattern

1. **Explain your reasoning** — print what you found, why it's ambiguous, and
   what the consequences of each path are. Be specific: name the file, branch, or
   resource in question.

2. **Ask the user** — present concrete options with one-letter shortcuts (e.g.,
   `(r) Reuse  (a) Abort`). Print the options before calling `readPrompt`.

3. **Log the decision** — call `appendDecision(convoyDir, entry)` with:
   - `question`: the specific ambiguity encountered
   - `reasoning`: the options and their consequences, as printed to the user
   - `userResponse`: the raw input from the user
   - `action`: what Conduit did as a result

4. **Honor the response** — if the user aborts, throw a clear error with
   remediation steps. If the user proceeds, continue normally.

## Log Format

Decisions are appended to `decisions.log` in the convoy directory as JSONL,
matching the `events.jsonl` pattern. Fields:

```json
{
  "ts": "ISO-8601 timestamp",
  "convoy": "convoy-id",
  "question": "What ambiguity was encountered?",
  "reasoning": "What were the options and their consequences?",
  "userResponse": "What the user typed",
  "action": "What Conduit did"
}
```

## Review Cycle

Run `conduit decisions <convoy-id>` to review the log for a specific convoy.
Run `conduit decisions --all` to see all active-convoy decisions.

Patterns in the log are the primary input for:
- New behaviors.yaml toggles (when a decision recurs, automate it)
- New directive sections (when reasoning was missing, document it)
- New acceptance criteria (when a judgment call reveals a gap in the spec)

## Write Failure Handling

If `decisions.log` cannot be written (permissions, disk full), `appendDecision`
prints the full log entry to stdout and does NOT throw. This ensures the
decision is surfaced even if persistence fails.
