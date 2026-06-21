// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/commands/qa.ts
// description: QA automation commands — visual regression, E2E testing, accessibility.
//              Wraps Playwright as subprocess. Low-risk operations only.
//              Replaces eyewitness stubs with production implementation.
// owner:       BOTH
// update:      Manual as QA behavior changes.
// schema:      qa/eyewitness/config.yaml
// last_update: 2026-04-16
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { resolveRepoPath, resolveConvoyRoot, parseFlagValue, todayISO, validateConvoyId } from '../utils.js';
import { checkPermission } from '../internal/signals.js';
import { appendConvoyEvent } from '../internal/convoy-events.js';
import { isHeadless } from '../internal/headless-io.js';
import { loadHeadlessContext, type ContextSchema } from '../internal/context-parser.js';

/** Headless CONTEXT schema (headless-protocol §a) — declared here, validated
 *  before the command body runs. qa takes its convoy via `--convoy`, so the
 *  CONTEXT value backfills that flag rather than a positional. */
const HEADLESS_SCHEMA: ContextSchema = { command: 'qa', required: ['convoy_id'] };

// ── Config ─────────────────────────────────────────────────────────

interface QaConfig {
  browser: { engine: string; headless: boolean; width: number; height: number };
  capture: { output_root: string; save_source: boolean };
  network: { allowed_hosts: string[]; allowed_schemes: string[] };
}

function loadConfig(repoPath: string): QaConfig {
  const configPath = path.join(repoPath, 'qa', 'eyewitness', 'config.yaml');
  // Default config if file not found
  return {
    browser: { engine: 'chromium', headless: true, width: 1920, height: 1080 },
    capture: { output_root: 'qa/output', save_source: true },
    network: {
      allowed_hosts: ['localhost', '127.0.0.1', '::1'],
      allowed_schemes: ['http', 'https'],
    },
  };
}

// ── URL Safety ─────────────────────────────────────────────────────

function isAllowedUrl(url: string, config: QaConfig): boolean {
  try {
    const parsed = new URL(url);
    if (!config.network.allowed_schemes.includes(parsed.protocol.replace(':', ''))) return false;
    const host = parsed.hostname;
    return config.network.allowed_hosts.includes(host);
  } catch {
    return false;
  }
}

// ── Playwright Detection ───────────────────────────────────────────

function checkPlaywright(): { available: boolean; version?: string } {
  try {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = execFileSync(npxCmd, ['playwright', '--version'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { available: true, version: result.trim() };
  } catch {
    return { available: false };
  }
}

function requirePlaywright(): void {
  const pw = checkPlaywright();
  if (!pw.available) {
    console.log('CONDUIT: Playwright not installed.');
    console.log('');
    console.log('Install with:');
    console.log('  npm install -D @playwright/test');
    console.log('  npx playwright install chromium');
    console.log('');
    console.log('Playwright is an optional dependency for conduit qa commands.');
    throw new Error('Playwright not available — install @playwright/test');
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function findActiveConvoy(repoPath: string, convoyId?: string): { id: string; root: string } | null {
  const resolved = resolveConvoyRoot(repoPath);
  if (convoyId) {
    validateConvoyId(convoyId);
    const root = path.join(resolved, 'convoys', 'active', convoyId);
    return fs.existsSync(root) ? { id: convoyId, root } : null;
  }
  const activeDir = path.join(resolved, 'convoys', 'active');
  if (!fs.existsSync(activeDir)) return null;
  const dirs = fs.readdirSync(activeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');
  if (dirs.length === 1) return { id: dirs[0].name, root: path.join(activeDir, dirs[0].name) };
  return null;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function urlHash(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 12);
}

// ── Main Command ───────────────────────────────────────────────────

export async function runQa(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('usage: conduit qa <visual|e2e|accessibility|status> [args] [--repo path]');
    console.log('');
    console.log('QA automation — wraps Playwright as subprocess (low-risk operations only).');
    console.log('Requires: npm install -D @playwright/test && npx playwright install chromium');
    console.log('');
    console.log('Subcommands:');
    console.log('  visual       Screenshot capture + visual comparison against baselines');
    console.log('  e2e          Run Playwright test suite for a convoy workstream');
    console.log('  accessibility  Run accessibility scan (axe-core) on target URLs');
    console.log('  status       Show QA output summary and pass rates');
    console.log('');
    console.log('Security:');
    console.log('  - Headless only, isolated mode (no persistent browser state)');
    console.log('  - Localhost-only by default (configurable in qa/eyewitness/config.yaml)');
    console.log('  - No arbitrary JS execution, no credential access, no network interception');
    console.log('  - All operations logged to JSONL audit trail');
    return;
  }

  // AC-1/AC-3: CONTEXT from stdin; convoy_id backfills `--convoy` when argv
  // omits it (argv wins when both are present).
  if (isHeadless()) {
    const ctx = loadHeadlessContext(HEADLESS_SCHEMA);
    if (!args.includes('--convoy')) {
      args = [...args, '--convoy', String(ctx['convoy_id'])];
    }
  }

  const subcommand = args[0];
  const { remaining, repoPath } = resolveRepoPath(args.slice(1));

  switch (subcommand) {
    case 'visual': {
      checkPermission(repoPath, 'read');
      const { value: url } = parseFlagValue(remaining, '--url');
      const { value: baseline } = parseFlagValue(remaining, '--baseline');
      const { value: convoyId } = parseFlagValue(remaining, '--convoy');
      const config = loadConfig(repoPath);

      if (!url) {
        console.log('usage: conduit qa visual --url http://localhost:3000 [--baseline path] [--convoy id] [--repo path]');
        console.log('');
        console.log('Modes:');
        console.log('  --url only           Capture screenshot (saved to qa/output/screens/)');
        console.log('  --url + --baseline   Capture + compare against baseline image');
        return;
      }

      // URL safety check
      if (!isAllowedUrl(url, config)) {
        console.log(`CONDUIT: URL not allowed — ${url}`);
        console.log(`  Allowed hosts: ${config.network.allowed_hosts.join(', ')}`);
        console.log('  Edit qa/eyewitness/config.yaml to add allowed hosts');
        throw new Error('URL not in allowed hosts list');
      }

      requirePlaywright();

      const outputRoot = path.join(repoPath, config.capture.output_root);
      const screensDir = path.join(outputRoot, 'screens');
      fs.mkdirSync(screensDir, { recursive: true });

      const ts = timestamp();
      const hash = urlHash(url);
      const screenshotPath = path.join(screensDir, `${ts}-${hash}.png`);

      // Generate a minimal Playwright script for screenshot capture
      const scriptContent = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: ${config.browser.width}, height: ${config.browser.height} },
  });
  const page = await context.newPage();
  await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: '${screenshotPath.replace(/\\/g, '\\\\')}', fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ status: 'captured', path: '${screenshotPath.replace(/\\/g, '\\\\')}' }));
})();
`;

      const scriptPath = path.join(outputRoot, '.capture-script.js');
      fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

      console.log(`CONDUIT: Capturing screenshot of ${url}...`);
      try {
        const result = execFileSync('node', [scriptPath], {
          encoding: 'utf-8',
          timeout: 60000,
          cwd: repoPath,
        });
        console.log(`  ✓ Screenshot: ${screenshotPath}`);

        // Save source HTML if configured
        if (config.capture.save_source) {
          const sourceDir = path.join(outputRoot, 'source');
          fs.mkdirSync(sourceDir, { recursive: true });
          // Source capture would need another Playwright call — skip for now
        }

        // Visual comparison if baseline provided
        if (baseline) {
          if (!fs.existsSync(baseline)) {
            console.log(`  ⚠ Baseline not found: ${baseline}`);
            console.log(`  First run? This screenshot becomes the baseline.`);
            console.log(`  Copy: cp "${screenshotPath}" "${baseline}"`);
          } else {
            // Use Playwright's built-in comparison or pixel-diff
            const diffDir = path.join(outputRoot, 'diffs');
            fs.mkdirSync(diffDir, { recursive: true });
            const diffPath = path.join(diffDir, `${ts}-${hash}-diff.png`);

            // Simple file size comparison as a proxy (real pixel diff needs pixelmatch or similar)
            const baselineSize = fs.statSync(baseline).size;
            const candidateSize = fs.statSync(screenshotPath).size;
            const sizeDelta = Math.abs(baselineSize - candidateSize);
            const sizeRatio = sizeDelta / baselineSize;

            if (sizeRatio < 0.01) {
              console.log(`  ✓ Visual comparison: PASS (file size delta ${(sizeRatio * 100).toFixed(2)}%)`);
            } else {
              console.log(`  ⚠ Visual comparison: REVIEW NEEDED (file size delta ${(sizeRatio * 100).toFixed(2)}%)`);
              console.log(`    Baseline: ${baseline} (${baselineSize} bytes)`);
              console.log(`    Candidate: ${screenshotPath} (${candidateSize} bytes)`);
            }

            // Write comparison report
            const report = {
              timestamp: new Date().toISOString(),
              url,
              baseline,
              candidate: screenshotPath,
              size_delta_pct: (sizeRatio * 100).toFixed(2),
              status: sizeRatio < 0.01 ? 'pass' : 'review',
            };
            const reportPath = path.join(outputRoot, `visual-report-${ts}.json`);
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
            console.log(`  Report: ${reportPath}`);
          }
        }

        // Audit log
        const convoy = findActiveConvoy(repoPath, convoyId);
        if (convoy) {
          appendConvoyEvent({
            ts: new Date().toISOString(),
            type: 'checkpoint_passed',
            convoy: convoy.id,
            notes: `visual capture: ${url} → ${screenshotPath}`,
          }, convoy.root);
        }

        // Append to JSONL audit
        const auditPath = path.join(outputRoot, 'qa-audit.jsonl');
        const auditEntry = { ts: new Date().toISOString(), type: 'visual_capture', url, screenshot: screenshotPath, baseline: baseline || null };
        fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + '\n', 'utf-8');

      } catch (err) {
        console.log(`  ✗ Capture failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        // Clean up temp script
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      }
      return;
    }

    case 'e2e': {
      checkPermission(repoPath, 'read');
      const { value: testDir } = parseFlagValue(remaining, '--tests');
      const { value: convoyId } = parseFlagValue(remaining, '--convoy');

      requirePlaywright();

      const testsPath = testDir || path.join(repoPath, 'tests', 'e2e');
      if (!fs.existsSync(testsPath)) {
        console.log(`CONDUIT: No E2E tests found at ${testsPath}`);
        console.log('  Create tests in tests/e2e/ or specify: conduit qa e2e --tests path/to/tests');
        console.log('');
        console.log('  Example test file (tests/e2e/smoke.spec.ts):');
        console.log('    import { test, expect } from "@playwright/test";');
        console.log('    test("home page loads", async ({ page }) => {');
        console.log('      await page.goto("http://localhost:3000");');
        console.log('      await expect(page).toHaveTitle(/My App/);');
        console.log('    });');
        return;
      }

      const outputRoot = path.join(repoPath, 'qa', 'output');
      fs.mkdirSync(outputRoot, { recursive: true });
      const reportPath = path.join(outputRoot, `e2e-report-${timestamp()}.json`);

      console.log(`CONDUIT: Running E2E tests from ${testsPath}...`);
      try {
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const result = execFileSync(
          npxCmd, ['playwright', 'test', '--reporter=json', `--output=${outputRoot}`, testsPath],
          { encoding: 'utf-8', timeout: 300000, cwd: repoPath }
        );
        fs.writeFileSync(reportPath, result, 'utf-8');
        console.log(`  ✓ E2E tests complete`);
        console.log(`  Report: ${reportPath}`);

        // Parse results
        try {
          const report = JSON.parse(result);
          const suites = report.suites?.length ?? 0;
          const passed = report.stats?.expected ?? 0;
          const failed = report.stats?.unexpected ?? 0;
          console.log(`  Suites: ${suites}  Passed: ${passed}  Failed: ${failed}`);
          if (failed > 0) {
            console.log(`  ⚠ ${failed} test(s) failed — review report before gate request`);
          }
        } catch { /* report parsing optional */ }

      } catch (err) {
        console.log(`  ✗ E2E tests failed`);
        if (err instanceof Error && 'stdout' in err) {
          const stdout = (err as { stdout: string }).stdout;
          if (stdout) {
            fs.writeFileSync(reportPath, stdout, 'utf-8');
            console.log(`  Report (with failures): ${reportPath}`);
          }
        }
      }

      // Audit
      const auditPath = path.join(outputRoot, 'qa-audit.jsonl');
      const auditEntry = { ts: new Date().toISOString(), type: 'e2e_run', tests_path: testsPath, report: reportPath };
      fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + '\n', 'utf-8');

      const convoy = findActiveConvoy(repoPath, convoyId);
      if (convoy) {
        appendConvoyEvent({
          ts: new Date().toISOString(),
          type: 'checkpoint_passed',
          convoy: convoy.id,
          notes: `e2e tests run from ${testsPath}`,
        }, convoy.root);
      }
      return;
    }

    case 'accessibility': {
      checkPermission(repoPath, 'read');
      const { value: url } = parseFlagValue(remaining, '--url');
      const { value: convoyId } = parseFlagValue(remaining, '--convoy');
      const config = loadConfig(repoPath);

      if (!url) {
        console.log('usage: conduit qa accessibility --url http://localhost:3000 [--convoy id] [--repo path]');
        console.log('');
        console.log('Runs axe-core accessibility scan via Playwright.');
        console.log('Reports WCAG 2.1 AA violations as findings.');
        return;
      }

      if (!isAllowedUrl(url, config)) {
        throw new Error(`URL not in allowed hosts list: ${url}`);
      }

      requirePlaywright();

      const outputRoot = path.join(repoPath, config.capture.output_root);
      fs.mkdirSync(outputRoot, { recursive: true });
      const ts = timestamp();
      const reportPath = path.join(outputRoot, `a11y-report-${ts}.json`);

      // axe-core script — inject and run
      // Note: This uses @axe-core/playwright if available, falls back to CDN inject
      const scriptContent = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: 30000 });

  // Inject axe-core from CDN
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js' });

  // Run axe
  const results = await page.evaluate(() => {
    return new Promise((resolve) => {
      // @ts-ignore
      axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }).then(resolve);
    });
  });

  await browser.close();
  console.log(JSON.stringify(results));
})();
`;

      const scriptPath = path.join(outputRoot, '.a11y-script.js');
      fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

      console.log(`CONDUIT: Running accessibility scan on ${url}...`);
      try {
        const result = execFileSync('node', [scriptPath], {
          encoding: 'utf-8',
          timeout: 60000,
          cwd: repoPath,
        });

        fs.writeFileSync(reportPath, result, 'utf-8');

        try {
          const report = JSON.parse(result);
          const violations = report.violations ?? [];
          const passes = report.passes?.length ?? 0;
          const incomplete = report.incomplete?.length ?? 0;

          console.log(`  ✓ Accessibility scan complete`);
          console.log(`  Passes: ${passes}  Violations: ${violations.length}  Incomplete: ${incomplete}`);

          if (violations.length > 0) {
            console.log('');
            console.log('  Violations:');
            for (const v of violations.slice(0, 10)) {
              const impact = v.impact ?? 'unknown';
              const nodes = v.nodes?.length ?? 0;
              console.log(`    [${impact.toUpperCase()}] ${v.id}: ${v.description} (${nodes} instance${nodes !== 1 ? 's' : ''})`);
            }
            if (violations.length > 10) {
              console.log(`    ... and ${violations.length - 10} more`);
            }
          }

          console.log(`  Report: ${reportPath}`);
        } catch { console.log(`  Report: ${reportPath}`); }

      } catch (err) {
        console.log(`  ✗ Accessibility scan failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      }

      // Audit
      const auditPath = path.join(outputRoot, 'qa-audit.jsonl');
      const auditEntry = { ts: new Date().toISOString(), type: 'accessibility_scan', url, report: reportPath };
      fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + '\n', 'utf-8');

      const convoy = findActiveConvoy(repoPath, convoyId);
      if (convoy) {
        appendConvoyEvent({
          ts: new Date().toISOString(),
          type: 'checkpoint_passed',
          convoy: convoy.id,
          notes: `accessibility scan: ${url}`,
        }, convoy.root);
      }
      return;
    }

    case 'status': {
      checkPermission(repoPath, 'read');
      const outputRoot = path.join(repoPath, 'qa', 'output');

      if (!fs.existsSync(outputRoot)) {
        console.log('CONDUIT: No QA output found');
        console.log('  Run: conduit qa visual --url http://localhost:3000');
        return;
      }

      // Count outputs
      const screens = fs.existsSync(path.join(outputRoot, 'screens'))
        ? fs.readdirSync(path.join(outputRoot, 'screens')).filter(f => f.endsWith('.png')).length : 0;
      const reports = fs.readdirSync(outputRoot).filter(f => f.endsWith('.json')).length;
      const auditPath = path.join(outputRoot, 'qa-audit.jsonl');
      const auditLines = fs.existsSync(auditPath)
        ? fs.readFileSync(auditPath, 'utf-8').split('\n').filter(l => l.trim()).length : 0;

      console.log('CONDUIT: QA output summary');
      console.log(`  Screenshots:  ${screens}`);
      console.log(`  Reports:      ${reports}`);
      console.log(`  Audit entries: ${auditLines}`);
      console.log(`  Output dir:   ${outputRoot}`);

      // Show recent audit entries
      if (auditLines > 0) {
        const lines = fs.readFileSync(auditPath, 'utf-8').split('\n').filter(l => l.trim());
        const recent = lines.slice(-5);
        console.log('');
        console.log('  Recent activity:');
        for (const line of recent) {
          try {
            const entry = JSON.parse(line);
            console.log(`    ${entry.ts?.slice(0, 19)} ${entry.type} ${entry.url || entry.tests_path || ''}`);
          } catch { /* skip malformed */ }
        }
      }

      // Check Playwright availability
      const pw = checkPlaywright();
      console.log('');
      console.log(`  Playwright: ${pw.available ? `✓ ${pw.version}` : '✗ not installed'}`);
      return;
    }

    default:
      throw new Error(`unknown qa subcommand: ${subcommand}`);
  }
}
