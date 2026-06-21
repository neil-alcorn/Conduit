<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        docs/onboarding/install.md
# description: Single source of truth for the new-developer Conduit install command.
# owner:       HUMAN
# update:      When scripts/install-conduit.sh flags or prerequisites change.
#              The snippets here MUST stay in lock-step with install-conduit.sh,
#              install-conduit.ps1, and install-conduit.cmd.
# schema:      none
# last_update: 2026-06-11
# ─────────────────────────────────────────────────────────────────────
-->

# Installing Conduit on a new machine

Conduit is an operating system for AI-assisted software delivery. This page is the canonical entry point — any onboarding doc, wiki page, or chat post that asks a new developer to install Conduit should link here and **not** copy the command.

**The whole install is 3 steps**: clone, run the installer, and (optionally) configure a registry. Works the same on Windows and macOS.

## Prerequisites

- **Node.js 20 or newer** (`node --version` must report `v20.*` or higher — older versions are rejected by the installer)
- **Git** (any recent version; Git Bash on Windows is sufficient)
- **Read access to your Conduit remote** (`<your-conduit-remote>`)

## Step 1 + 2 — clone and run the installer

### macOS / Linux / Git Bash on Windows

```bash
git clone <your-conduit-remote> "$HOME/Repos/conduit"
cd "$HOME/Repos/conduit" && ./scripts/install-conduit.sh
```

### Native Windows PowerShell

```powershell
git clone <your-conduit-remote> "$env:USERPROFILE\Repos\conduit"
& "$env:USERPROFILE\Repos\conduit\scripts\install-conduit.cmd"
```

> `install-conduit.cmd` is a self-contained wrapper — it invokes the PowerShell installer with `-ExecutionPolicy Bypass` itself, so there is no policy flag to remember (a bare `.\scripts\install-conduit.ps1` is blocked by default execution policy). Double-clicking the file in Explorer works too.

The installer:

1. builds the CLI (npm install + build from the repo root),
2. seeds `.conduit/config.yaml` from `config.yaml.example` — it prompts for your developer name / email when run interactively, and falls back to `git config user.name` / `user.email` and your OS username otherwise,
3. triggers bootstrap, which writes the `~/.claude/bin/conduit` shim (plus `conduit.cmd` on Windows) and a managed `## Conduit CLI` block into `~/.claude/CLAUDE.md`,
4. puts `~/.claude/bin` on your **user PATH** (Windows) so plain `conduit <command>` works in PowerShell, cmd, and Git Bash — open a new terminal after install,
5. registers the checkout as your **central conduit repo** (`conduit init --global <path>`), so conduit commands resolve correctly from *any* repo,
6. if a registry is configured, installs registry-approved skills and rules immediately. The registry is optional — Step 3 below explains how to set it up if you want it.

If you already have the repo somewhere else, run the script in place — it reuses the existing checkout and re-wires the shim and central path:

```bash
cd /path/to/existing/conduit && ./scripts/install-conduit.sh --in-place
```

```powershell
.\scripts\install-conduit.cmd -InPlace
```

## Step 3 — Optional registry

Conduit runs fully **without** any backend. The registry is an **optional** provider-neutral sync target: when configured, it lets gate events, skills, and rules sync to a shared dashboard so a team can see convoy state and run an approval workflow. For purely local or personal use, skip this step entirely.

To enable it, set two environment variables pointing at your registry:

**macOS / Linux / Git Bash** — add to your shell profile (`.bashrc`, `.zshrc`, or `~/.profile`):

```bash
export CONDUIT_REGISTRY_URL="<your-registry-url>"
export CONDUIT_REGISTRY_API_KEY="<your-registry-key>"
```

**Windows (user env vars, persists across sessions):**

```powershell
[Environment]::SetEnvironmentVariable('CONDUIT_REGISTRY_URL', '<your-registry-url>', 'User')
[Environment]::SetEnvironmentVariable('CONDUIT_REGISTRY_API_KEY', '<your-registry-key>', 'User')
```

Once set, `conduit context` syncs approved skills and rules on every session start.

## Verifying the install

Open a **new** terminal (so the PATH entry takes effect) and run:

```bash
conduit doctor
```

Doctor is the single post-install verifier — it checks git state, the CLI build, both shims, the PATH entry, and (if configured) your registry connection, and prints the exact fix for anything red. `0 fail` means your install is wired end to end. Then:

```bash
conduit --version
conduit context
```

If plain `conduit` doesn't resolve (PATH entry not yet active), invoke the shim directly — the form differs per shell:

```powershell
~/.claude/bin/conduit.cmd --version    # PowerShell / cmd — the .cmd extension is REQUIRED
```

```bash
~/.claude/bin/conduit --version        # Bash / Git Bash
```

> In PowerShell, the extensionless `~/.claude/bin/conduit` is the *bash* shim — invoking it opens a window that flashes and closes with no output. Claude Code picks the right form automatically via the `## Conduit CLI` block that bootstrap adds to `~/.claude/CLAUDE.md`.

## Staying current

You do **not** need to manually update Conduit day-to-day. Two mechanisms keep an installed machine fresh:

1. **Daily auto-update (every CLI invocation).** The first conduit command of the day attempts a fast-forward-only `git pull` of the central checkout and, when new commits arrived, rebuilds the CLI. It is silent on failure (offline, diverged history) and rate-limited via a timestamp file at `~/.conduit/auto-pull-stamp`. Opt out with `CONDUIT_AUTO_PULL=0`.
2. **Session-start sync (`conduit context`).** Pulls the central repo (behavior `context.auto_pull`) and, when a registry is configured, refreshes approved skills and rules into your host skill home, showing a `NEW SINCE LAST SESSION` banner.

To force an update right now:

```bash
cd "$HOME/Repos/conduit" && git pull --ff-only && npm run build
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Anything looks off after install | Run `conduit doctor` first — it diagnoses git, build, shim, PATH, and registry state and prints the fix per finding. |
| `.\scripts\install-conduit.ps1` does nothing or is blocked | PowerShell execution policy. Use `scripts\install-conduit.cmd` instead — it bakes in `-ExecutionPolicy Bypass`. |
| `~/.claude/bin/conduit --version` in PowerShell opens a window that flashes and closes | You invoked the bash shim. PowerShell/cmd need `~/.claude/bin/conduit.cmd` — or just `conduit` once the PATH entry is active (new terminal). |
| `conduit` not recognized in any shell | `~/.claude/bin` is not on your PATH. Re-run the installer (it registers the user-PATH entry), then open a new terminal. |
| `ERROR: Node 20+ required` | Upgrade Node. On Windows: install from nodejs.org. On macOS: `brew install node@20`. |
| `ERROR: git not found in PATH` | Install Git. On Windows: install Git for Windows (includes Git Bash). |
| `bash\r: No such file or directory` or `$'\r': command not found` when running `install-conduit.sh` | CRLF line endings — the script was checked out with Windows endings. Fix: `git -C <conduit> checkout -- scripts/` after `git config core.autocrlf false`, or run `sed -i 's/\r$//' scripts/install-conduit.sh`. The repo's `.gitattributes` forces LF for `*.sh` on fresh clones. |
| Shim exists but runs against an old checkout path | Re-run the installer with `--in-place` / `-InPlace` from the new location. Bootstrap rewrites `~/.claude/bin/conduit` against the new path and `conduit init --global --force` re-points the central config. |
| `conduit context` prints `⚠ registry unreachable` repeatedly | Expected when offline or when no registry is configured. The warning is rate-limited to once per 30 minutes per session. |
| `conduit context` prints `⚠ registry auth failed` | Your `CONDUIT_REGISTRY_API_KEY` is missing or expired. Set a valid key for your registry. |
| `conduit qa` / visual regression fails with a missing browser | Playwright browsers are not installed by the conduit installer. Run `npx playwright install chromium` once from the conduit repo. |
| Using OpenAI Codex CLI instead of Claude Code | Codex reads `AGENTS.md` at the conduit repo root (a sibling shim of `CLAUDE.md` — both point at the same shared operating instructions). Bundled skills install into `~/.codex/skills/` automatically when the Codex host is detected. |

## What gets installed

- `~/.claude/bin/conduit` (and `.cmd` on Windows) — the CLI shims. On Windows the installer also adds `~/.claude/bin` to your **user** PATH so plain `conduit` resolves in every shell.
- `~/.claude/CLAUDE.md` — a managed `## Conduit CLI` block is added (your existing content is preserved; the block is replaced on version bumps).
- `~/.conduit/config.json` — `central` points at your conduit checkout (written by `conduit init --global`); also holds the daily auto-update timestamp.
- `<conduit>/.conduit/config.yaml` — your developer identity (gitignored; seeded from `config.yaml.example`).
- `~/.claude/skills/conduit-*` and `~/.codex/skills/conduit-*` when those hosts are present — bundled Conduit launcher skills. On first `conduit context` with a registry configured, every approved skill from the registry joins the active host skill home.
- `~/.claude/conduit-rules/` or `~/.codex/conduit-rules/` — mirror of the approved rules tree from the registry for the active host (directives, standards, CLAUDE.md, CONDUIT.md, highway yaml).
- `~/.claude/conduit-state/last-seen.json` or `~/.codex/conduit-state/last-seen.json` — local state for the `NEW SINCE LAST SESSION` banner.

Third-party skills and files under host skill homes that Conduit does **not** manage are never touched — the installer and auto-refresh both write only to names they own.
