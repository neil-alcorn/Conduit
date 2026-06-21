# scripts/install-conduit.ps1
# Installs Conduit as the standard Claude Code configuration.
# Run: scripts\install-conduit.cmd [-InPlace]   <- preferred (no policy flag needed)
#  or: powershell -ExecutionPolicy Bypass -File install-conduit.ps1 [-InPlace]
#
# -Dest     Destination checkout path (default: $env:USERPROFILE\Repos\Conduit,
#           or $env:CONDUIT_DEST). If the repo is not present there it is cloned
#           from $env:CONDUIT_REPO_URL (default: https://github.com/neil-alcorn/Conduit).
# -InPlace  Skip the clone/`git pull` step. Useful when the user has moved the
#           checkout or wants to re-wire the shim offline. Flag parity with
#           install-conduit.sh --in-place.
#
# What it does (parity with install-conduit.sh):
#   1. Clones (if missing) / pulls latest (unless -InPlace)
#   2. npm install + npm run build from the REPO ROOT
#   3. Seeds .conduit/config.yaml from config.yaml.example (prompts when
#      interactive; falls back to git config user.name/user.email + $env:USERNAME)
#   4. Triggers bootstrap (writes ~/.claude/bin/conduit + ~/.claude/CLAUDE.md block)
#   5. Registers this checkout as the central conduit repo (conduit init --global)
#   6. Optionally installs approved skills + rules from a remote registry
#      (only when a registry URL + key are configured — skipped otherwise)
#
# PowerShell 5.1 compatible — no `&&`, no ternary, no null-coalescing.

param(
    [string]$Dest,
    [switch]$InPlace
)

$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess {
    param([string]$What)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $What failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

if (-not $Dest) {
    if ($env:CONDUIT_DEST) { $Dest = $env:CONDUIT_DEST }
    else { $Dest = (Join-Path $env:USERPROFILE "Repos\Conduit") }
}
$RepoUrl = $env:CONDUIT_REPO_URL
if (-not $RepoUrl) { $RepoUrl = "https://github.com/neil-alcorn/Conduit" }

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "   CONDUIT — Claude Code Setup" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$ConduitRepo = $Dest
$ConduitNode = Join-Path $ConduitRepo "dist\cli\src\index.js"

# ── Step 0: Preflight ────────────────────────────────────────────────
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) { Write-Host "ERROR: git not found in PATH" -ForegroundColor Red; exit 1 }
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Write-Host "ERROR: node not found in PATH (Node 20+ required)" -ForegroundColor Red; exit 1 }
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) { Write-Host "ERROR: npm not found in PATH" -ForegroundColor Red; exit 1 }

# No embedded quotes: PS 5.1 strips inner double quotes when passing args to
# native commands, so `node -p 'x.split(".")'` reached node as `x.split(.)`
# and the installer died at preflight.
$nodeVersionRaw = (node --version)
Assert-NativeSuccess "node version check"
$nodeMajor = [int]($nodeVersionRaw.Trim().TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    Write-Host "ERROR: Node 20+ required (found v$nodeMajor)" -ForegroundColor Red
    exit 1
}

# ── Step 1: Clone / pull latest (or skip in -InPlace mode) ───────────
Write-Host "`n[1/6] Fetching Conduit..." -ForegroundColor Yellow
if ($InPlace) {
    if (-not (Test-Path (Join-Path $ConduitRepo ".git"))) {
        Write-Host "ERROR: -InPlace expects an existing conduit checkout at $ConduitRepo — not found." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Skipped clone/pull (-InPlace) — reusing existing checkout at $ConduitRepo." -ForegroundColor DarkGray
} elseif (Test-Path (Join-Path $ConduitRepo ".git")) {
    Push-Location $ConduitRepo
    git pull --ff-only
    $pullExit = $LASTEXITCODE
    Pop-Location
    if ($pullExit -ne 0) {
        Write-Host "ERROR: git pull --ff-only failed (exit code $pullExit)." -ForegroundColor Red
        Write-Host "  Resolve the divergence (or re-run with -InPlace to skip the pull)." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  Done." -ForegroundColor Green
} else {
    $parent = Split-Path -Parent $ConduitRepo
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Write-Host "  Cloning $RepoUrl -> $ConduitRepo" -ForegroundColor DarkGray
    git clone $RepoUrl $ConduitRepo
    Assert-NativeSuccess "git clone"
    Write-Host "  Done." -ForegroundColor Green
}

# ── Step 2: Install dependencies + build (from the REPO ROOT) ───────
Write-Host "[2/6] Installing dependencies..." -ForegroundColor Yellow
Push-Location $ConduitRepo
if (-not (Test-Path (Join-Path $ConduitRepo "node_modules"))) {
    npm install
    Assert-NativeSuccess "npm install"
} else {
    Write-Host "  node_modules present — skipping npm install." -ForegroundColor DarkGray
}

Write-Host "[3/6] Building Conduit CLI..." -ForegroundColor Yellow
npm run build
Assert-NativeSuccess "npm run build"
Pop-Location
Write-Host "  Done." -ForegroundColor Green

# ── Step 3: Seed .conduit/config.yaml ────────────────────────────────
Write-Host "[4/6] Seeding developer config (.conduit/config.yaml)..." -ForegroundColor Yellow
$ConfigFile  = Join-Path $ConduitRepo ".conduit\config.yaml"
$ExampleFile = Join-Path $ConduitRepo ".conduit\config.yaml.example"
if ((Test-Path $ConfigFile) -or (-not (Test-Path $ExampleFile))) {
    Write-Host "  Config already present (or example missing) — leaving it untouched." -ForegroundColor DarkGray
} else {
    $gitName = ""
    $gitEmail = ""
    try { $gitName = (git config user.name) } catch {}
    try { $gitEmail = (git config user.email) } catch {}
    $fallbackUser = $env:USERNAME
    if (-not $fallbackUser) { $fallbackUser = "developer" }
    $devName = $gitName
    if (-not $devName) { $devName = $fallbackUser }
    $devEmail = $gitEmail
    if (-not $devEmail) { $devEmail = "$fallbackUser@example.com" }

    # Prompt only when a human is attached; -NonInteractive / redirected input
    # falls back to the git-config/username defaults above.
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        try {
            $answer = Read-Host "Developer name [$devName]"
            if ($answer) { $devName = $answer }
            $answer = Read-Host "Email [$devEmail]"
            if ($answer) { $devEmail = $answer }
        } catch {
            Write-Host "  (prompting unavailable — using defaults)" -ForegroundColor DarkGray
        }
    }

    $content = Get-Content $ExampleFile -Raw
    $content = $content.Replace('Your Name', $devName)
    $content = $content.Replace('you@example.com', $devEmail)
    # BOM-less UTF-8 (PS 5.1 Set-Content -Encoding utf8 writes a BOM)
    [System.IO.File]::WriteAllText($ConfigFile, $content)
    Write-Host "  Seeded $ConfigFile (developer: $devName <$devEmail>)" -ForegroundColor Green
}

# ── Step 4: Trigger bootstrap + register central path ────────────────
Write-Host "[5/6] Bootstrapping shim + registering central conduit path..." -ForegroundColor Yellow
node $ConduitNode --version
Assert-NativeSuccess "conduit bootstrap (--version)"
# PORT-1: write `central` into ~/.conduit/config.json so conduit commands
# resolve this checkout from ANY repo. --force re-points a moved checkout.
node $ConduitNode init --global $ConduitRepo --force
Assert-NativeSuccess "conduit init --global"

$ShimCmd = Join-Path $env:USERPROFILE ".claude\bin\conduit.cmd"
if (Test-Path $ShimCmd) {
    Write-Host "  Shim ready: $ShimCmd" -ForegroundColor Green
} else {
    Write-Host "  Warning: expected shim at $ShimCmd was not created — manual inspection needed" -ForegroundColor Yellow
}

# Put ~/.claude/bin on the USER PATH so plain `conduit` resolves in every
# shell (PowerShell/cmd via PATHEXT -> conduit.cmd, Git Bash via the bash
# shim). Idempotent: skipped when already present; user scope only.
$BinDir = Join-Path $env:USERPROFILE ".claude\bin"
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$onPath = ($userPath -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') }) -contains $BinDir.TrimEnd('\')
if ($onPath) {
    Write-Host "  $BinDir already on user PATH." -ForegroundColor DarkGray
} else {
    $newPath = $userPath.TrimEnd(';')
    if ($newPath) { $newPath = "$newPath;$BinDir" } else { $newPath = $BinDir }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "  Added $BinDir to user PATH — open a NEW terminal for plain 'conduit' to resolve." -ForegroundColor Green
}
# Make `conduit` work in THIS session too, without a restart.
if (($env:Path -split ';') -notcontains $BinDir) { $env:Path = "$env:Path;$BinDir" }

# ── Step 5: Optional — install approved skills + rules from registry ──
# Fully optional. Requires BOTH a registry URL and an API key. If either is
# missing, this step is skipped cleanly.
Write-Host "[6/6] Registry skills + rules (optional)..." -ForegroundColor Yellow

$RegistryUrl = $env:CONDUIT_REGISTRY_URL
if (-not $RegistryUrl -and (Test-Path $ConfigFile)) {
    $urlLine = Get-Content $ConfigFile | Where-Object { $_ -match '^\s*api_url\s*:' } | Select-Object -First 1
    if ($urlLine) {
        $parsed = ($urlLine -replace '^\s*api_url\s*:\s*', '').Trim().Trim('"').Trim("'")
        if ($parsed -and $parsed -match '^https?://') { $RegistryUrl = $parsed }
    }
}

$RegistryConfigured = $false
if ($RegistryUrl -and $env:CONDUIT_REGISTRY_API_KEY) {
    $env:CONDUIT_REGISTRY_URL = $RegistryUrl
    Write-Host "  Fetching approved skills from the registry..." -ForegroundColor Yellow
    node $ConduitNode skill install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: skill install failed (exit $LASTEXITCODE) — continuing." -ForegroundColor Yellow
    } else {
        Write-Host "  Skills installed." -ForegroundColor Green
    }
    Write-Host "  Fetching approved rules from the registry..." -ForegroundColor Yellow
    node $ConduitNode rules install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: rules install failed (exit $LASTEXITCODE) — continuing." -ForegroundColor Yellow
    } else {
        Write-Host "  Rules installed." -ForegroundColor Green
    }
    $RegistryConfigured = $true
} else {
    Write-Host "  Registry not configured (need CONDUIT_REGISTRY_URL + CONDUIT_REGISTRY_API_KEY) — skipping." -ForegroundColor DarkGray
    Write-Host "  To enable: set both env vars (or add a registry section to .conduit\config.yaml) and re-run." -ForegroundColor DarkGray
}

# ── Summary ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "" -ForegroundColor Cyan
Write-Host "   CLI shim:   $ShimCmd" -ForegroundColor Cyan
Write-Host "   Direct:     node $ConduitNode <command>" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "   Next steps:" -ForegroundColor White
Write-Host "     1. Open a NEW terminal and run: conduit doctor" -ForegroundColor White
Write-Host "        All green = your install is verified end to end." -ForegroundColor White
Write-Host "     2. Open Claude Code in any repo and type /conduit-context" -ForegroundColor White
if (-not $RegistryConfigured) {
    Write-Host "     (Optional) Set CONDUIT_REGISTRY_URL + CONDUIT_REGISTRY_API_KEY to sync skills/rules." -ForegroundColor White
}
Write-Host "" -ForegroundColor Cyan
Write-Host "   Staying current: the CLI fast-forwards + rebuilds itself" -ForegroundColor DarkGray
Write-Host "   once a day on first use." -ForegroundColor DarkGray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
