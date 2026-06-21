import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadInitiatives } from '../internal/initiatives.js';
import { runInitiative } from '../commands/initiative.js';

test('initiative new creates an active initiative', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'initcmd-'));
  await runInitiative(['new', '--title', 'Cut release', '--urgency', 'high', '--importance', 'high'], root);
  const all = loadInitiatives(root);
  assert.equal(all.length, 1);
  assert.equal(all[0].urgency, 'high');
  assert.equal(all[0].status, 'active');
});

test('initiative set updates status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'initcmd-'));
  await runInitiative(['new', '--title', 'Docs'], root);
  const id = loadInitiatives(root)[0].id;
  await runInitiative(['set', id, '--status', 'done'], root);
  const after = loadInitiatives(root)[0];
  assert.equal(after.status, 'done');
  // urgency and importance must not be clobbered by the set (should remain 'low', the addInitiative default)
  assert.equal(after.urgency, 'low');
  assert.equal(after.importance, 'low');
});
