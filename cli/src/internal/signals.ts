// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/internal/signals.ts
// description: Repo Signal parsing and runtime permission enforcement for repo-targeting commands.
// owner:       BOTH
// update:      Manual when Repo Signal semantics or enforcement rules change.
// schema:      highways/repo-signals.schema.yaml
// last_update: 2026-04-18
// ─────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { ConduitNotInitializedError } from '../utils.js';

export type OperationalStatus = 'ACTIVE' | 'READ-ONLY' | 'OBSERVE' | 'QUARANTINE';
export type SystemClass = 'MODERN' | 'LEGACY' | 'MAINFRAME' | 'INTEGRATION' | 'EXTERNAL';
export type Intent = 'read' | 'write' | 'execute' | 'comms';
export type ContentSignalValue = 'yes' | 'no' | 'scoped';

export interface ContentSignals {
  ai_input: ContentSignalValue;   // agents may use content for in-context work
  ai_modify: ContentSignalValue;  // agents may modify files (scoped = agent-managed only)
  ai_train: ContentSignalValue;   // content available for external model training
}

export interface RepoSignals {
  operational_status: OperationalStatus;
  system_class: SystemClass;
  escalation_contacts: {
    owner: string;
    architect: string;
    security: string;
    compliance?: string;
    specialist?: string;
  };
  content_signals?: ContentSignals;
  highway_init_date: string;
  last_context_update: string;
  prod_pipeline_id?: number;
  staging_pipeline_id?: number;
}

export function extractRepoSignalBlock(content: string): string {
  const headingIdx = content.indexOf('## Repo Signals');
  if (headingIdx < 0) throw new Error('missing ## Repo Signals heading');

  const afterHeading = content.slice(headingIdx);
  const fenceStart = afterHeading.indexOf('```yaml');
  if (fenceStart < 0) throw new Error('missing ```yaml fence after ## Repo Signals');

  const blockStart = fenceStart + '```yaml'.length;
  const afterFence = afterHeading.slice(blockStart);
  const fenceEnd = afterFence.indexOf('```');
  if (fenceEnd < 0) throw new Error('missing closing ``` fence for Repo Signals');

  const block = afterFence.slice(0, fenceEnd).trim();
  if (!block) throw new Error('Repo Signals block is empty');
  return block;
}

export function parseSignalsFromFile(conduitMdPath: string): RepoSignals {
  let content: string;
  try {
    content = fs.readFileSync(conduitMdPath, 'utf-8');
  } catch (err) {
    throw new Error(`reading CONDUIT.md: ${(err as Error).message}`);
  }

  const block = extractRepoSignalBlock(content);
  const signals = yaml.load(block) as RepoSignals;

  if (!signals?.operational_status) {
    throw new Error('operational_status is missing from Repo Signals block');
  }
  return signals;
}

/**
 * Compute and store a SHA-256 hash of the Repo Signals block.
 * Called after CONDUIT.md is created/updated during init.
 */
export function storeSignalsHash(repoPath: string): void {
  const conduitMd = path.join(repoPath, 'CONDUIT.md');
  if (!fs.existsSync(conduitMd)) return;

  try {
    const content = fs.readFileSync(conduitMd, 'utf-8');
    const block = extractRepoSignalBlock(content);
    const hash = crypto.createHash('sha256').update(block).digest('hex');
    const hashPath = path.join(repoPath, '.conduit', 'signals.hash');
    fs.mkdirSync(path.dirname(hashPath), { recursive: true });
    fs.writeFileSync(hashPath, hash, 'utf-8');
  } catch {
    // Non-fatal — hash storage is best-effort during init
  }
}

export function checkPermission(repoPath: string, intent: Intent): void {
  const conduitMd = path.join(repoPath, 'CONDUIT.md');
  let signals: RepoSignals;
  try {
    signals = parseSignalsFromFile(conduitMd);
  } catch (err) {
    // Missing/unreadable CONDUIT.md IS the not-initialized condition —
    // typed so the headless exit matrix maps it to exit 4 (AC-15). Same
    // message and interactive behavior as before.
    throw new ConduitNotInitializedError(
      `CONDUIT: cannot read Repo Signals from ${conduitMd} - failing closed. ` +
      `Ensure CONDUIT.md exists and contains a valid ## Repo Signals block. Error: ${(err as Error).message}`
    );
  }

  // Integrity check: verify signals block hasn't been tampered with
  const hashPath = path.join(repoPath, '.conduit', 'signals.hash');
  if (fs.existsSync(hashPath)) {
    try {
      const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
      const content = fs.readFileSync(conduitMd, 'utf-8');
      const block = extractRepoSignalBlock(content);
      const currentHash = crypto.createHash('sha256').update(block).digest('hex');
      if (currentHash !== storedHash) {
        throw new Error(
          `CONDUIT: CONDUIT.md signals block was modified — integrity check failed. ` +
          `Stored hash: ${storedHash.slice(0, 8)}... Current: ${currentHash.slice(0, 8)}... ` +
          `Run 'conduit init' to re-hash after verifying the change is intentional.`
        );
      }
    } catch (err) {
      if ((err as Error).message.includes('integrity check failed')) throw err;
      // Hash file unreadable — skip check silently
    }
  }

  switch (signals.operational_status) {
    case 'QUARANTINE':
      throw new Error(
        `CONDUIT: repo at ${repoPath} has status QUARANTINE. No operations permitted ` +
        `until Highway Init is complete and status is changed to ACTIVE by the repo owner.`
      );
    case 'OBSERVE':
      if (intent !== 'read') {
        throw new Error(
          `CONDUIT: repo at ${repoPath} has status OBSERVE. Only read operations are permitted. ` +
          `Contact ${signals.escalation_contacts.owner} to change status.`
        );
      }
      break;
    case 'READ-ONLY':
      if (intent === 'write' || intent === 'execute') {
        throw new Error(
          `CONDUIT: repo at ${repoPath} has status READ-ONLY. Write and execute operations are not permitted. ` +
          `Contact ${signals.escalation_contacts.owner} to change status.`
        );
      }
      break;
    case 'ACTIVE':
      checkSystemClassConstraints(signals, intent, repoPath);
      checkContentSignals(signals, intent, repoPath);
      break;
    default:
      throw new Error(
        `CONDUIT: unknown operational_status '${signals.operational_status}' in ${conduitMd} - ` +
        `failing closed. Valid values: ACTIVE, READ-ONLY, OBSERVE, QUARANTINE`
      );
  }
}

function checkSystemClassConstraints(signals: RepoSignals, intent: Intent, repoPath: string): void {
  switch (signals.system_class) {
    case 'MAINFRAME':
      if (intent === 'execute') {
        throw new Error(
          `CONDUIT: repo at ${repoPath} is class MAINFRAME. Automated execution is not permitted. ` +
          `All work requires specialist human lead. Contact specialist: ${signals.escalation_contacts.specialist ?? 'unset'}`
        );
      }
      break;
    case 'EXTERNAL':
      if (intent === 'write' || intent === 'execute') {
        throw new Error(
          `CONDUIT: repo at ${repoPath} is class EXTERNAL. Write and execute operations are not permitted on external systems.`
        );
      }
      break;
  }
}

function checkContentSignals(signals: RepoSignals, intent: Intent, repoPath: string): void {
  const cs = signals.content_signals;
  if (!cs) return; // content_signals is optional — no block means no constraints

  if (intent === 'read' && cs.ai_input === 'no') {
    throw new Error(
      `CONDUIT: repo at ${repoPath} has content_signals.ai_input: no. ` +
      `Agent read operations are not permitted. Contact ${signals.escalation_contacts.owner}.`
    );
  }

  if (intent === 'write' && cs.ai_modify === 'no') {
    throw new Error(
      `CONDUIT: repo at ${repoPath} has content_signals.ai_modify: no. ` +
      `Agent write operations are not permitted. Contact ${signals.escalation_contacts.owner}.`
    );
  }
}
