// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/agent-name.test.ts
// description: Tests for the agentName() helper that branding strings in
//              CLI output use to refer to the agent host. Verifies the
//              CONDUIT_AGENT_NAME env-var contract and the agent-neutral
//              default behavior.
// owner:       BOTH
// update:      Manual when the env-var contract changes.
// schema:      none
// last_update: 2026-05-13
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { agentName } from '../internal/agent-name.js';

const ENV_KEY = 'CONDUIT_AGENT_NAME';
let originalValue: string | undefined;

describe('agentName() — CONDUIT_AGENT_NAME env-var contract', () => {
  beforeEach(() => {
    originalValue = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalValue === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalValue;
  });

  it('defaults to "the agent layer" when CONDUIT_AGENT_NAME is unset', () => {
    assert.equal(agentName(), 'the agent layer');
  });

  it('returns the env var value when set to "Claude Code"', () => {
    process.env[ENV_KEY] = 'Claude Code';
    assert.equal(agentName(), 'Claude Code');
  });

  it('returns the env var value when set to "Codex"', () => {
    process.env[ENV_KEY] = 'Codex';
    assert.equal(agentName(), 'Codex');
  });

  it('falls back to default when env var is the empty string', () => {
    process.env[ENV_KEY] = '';
    assert.equal(agentName(), 'the agent layer');
  });

  it('falls back to default when env var is whitespace only', () => {
    process.env[ENV_KEY] = '   ';
    assert.equal(agentName(), 'the agent layer');
  });

  it('trims surrounding whitespace from a real value', () => {
    process.env[ENV_KEY] = '  Cursor  ';
    assert.equal(agentName(), 'Cursor');
  });
});
