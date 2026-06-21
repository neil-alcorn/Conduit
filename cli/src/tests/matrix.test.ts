import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMatrix } from '../commands/matrix.js';
import { Initiative } from '../internal/initiatives.js';

const items: Initiative[] = [
  { id: 'a', title: 'Do Now', urgency: 'high', importance: 'high', status: 'active' },
  { id: 'b', title: 'Plan It', urgency: 'low', importance: 'high', status: 'active' },
  { id: 'c', title: 'Old Idea', urgency: 'low', importance: 'low', status: 'active' },
];

test('renderMatrix groups items under the right quadrant headers', () => {
  const out = renderMatrix(items);
  assert.match(out, /DO NOW/i);
  assert.match(out, /SCHEDULE/i);
  assert.match(out, /Do Now/);
  assert.match(out, /Plan It/);
});

test('renderMatrix highlights a top "do" item', () => {
  const out = renderMatrix(items);
  assert.match(out, /Next:\s*Do Now/);
});

test('renderMatrix on empty list shows guidance, not error', () => {
  const out = renderMatrix([]);
  assert.match(out, /no initiatives/i);
});
