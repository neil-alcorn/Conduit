import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { quadrant, addInitiative, loadInitiatives } from '../internal/initiatives.js';

test('quadrant maps all four corners', () => {
  assert.equal(quadrant({ id:'a', title:'a', urgency:'high', importance:'high', status:'active' }), 'do');
  assert.equal(quadrant({ id:'b', title:'b', urgency:'low',  importance:'high', status:'active' }), 'schedule');
  assert.equal(quadrant({ id:'c', title:'c', urgency:'high', importance:'low',  status:'active' }), 'delegate');
  assert.equal(quadrant({ id:'d', title:'d', urgency:'low',  importance:'low',  status:'active' }), 'delete');
});

test('addInitiative persists and loadInitiatives reads back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-'));
  const created = addInitiative(root, { title: 'Ship MVP', urgency: 'high', importance: 'high' });
  assert.equal(created.status, 'active');
  assert.match(created.id, /ship-mvp/);
  const all = loadInitiatives(root);
  assert.equal(all.length, 1);
  assert.equal(all[0].title, 'Ship MVP');
});

test('loadInitiatives returns [] when no registry exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-'));
  assert.deepEqual(loadInitiatives(root), []);
});
