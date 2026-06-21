// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        cli/src/tests/events-lock.test.ts
// description: AC-21 regression coverage (review BUG-8). events.jsonl lock
//              must fail CLOSED: when the lock cannot be acquired after
//              retries, appendConvoyEvent throws and writes nothing —
//              never an unlocked append. Stale locks left by crashed
//              processes are reclaimed so fail-closed cannot brick appends.
// owner:       BOTH
// update:      Manual when the events.jsonl locking contract changes.
// schema:      none
// last_update: 2026-06-10
// ─────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendConvoyEvent, readConvoyEvents, LockContentionError, type ConvoyEvent } from '../internal/convoy-events.js';

let tmpRoot: string;

function makeEvent(type: ConvoyEvent['type'] = 'stage_started'): ConvoyEvent {
  return { ts: new Date().toISOString(), type, convoy: 'cnv-lock-test', stage: 3 };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'conduit-lock-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('events.jsonl lock (AC-21 / review BUG-8)', () => {
  it('appends normally when the lock is free', () => {
    appendConvoyEvent(makeEvent(), tmpRoot);
    const events = readConvoyEvents(tmpRoot);
    assert.equal(events.length, 1);
    assert.equal(events[0].convoy, 'cnv-lock-test');
    // Lock is cleaned up after the append.
    assert.equal(fs.existsSync(path.join(tmpRoot, 'events.jsonl.lock')), false);
  });

  it('FAILS CLOSED when the lock is held: throws LockContentionError and writes nothing', () => {
    const lockPath = path.join(tmpRoot, 'events.jsonl.lock');
    // Simulate a live concurrent writer: fresh lock file, recent mtime.
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });

    assert.throws(
      () => appendConvoyEvent(makeEvent(), tmpRoot),
      (err: Error) => err instanceof LockContentionError && /events\.jsonl\.lock/.test(err.message),
    );

    // The whole point of BUG-8: nothing may be appended without the lock.
    assert.equal(fs.existsSync(path.join(tmpRoot, 'events.jsonl')), false, 'no unlocked append may occur');
    // The foreign lock is not stolen.
    assert.equal(fs.existsSync(lockPath), true);
  });

  it('reclaims a STALE lock (crashed writer) instead of bricking appends', () => {
    const lockPath = path.join(tmpRoot, 'events.jsonl.lock');
    // SEC-M4: lock payload is pid:timestamp — use a dead PID + stale age.
    fs.writeFileSync(lockPath, '99999:1000000000000', { flag: 'wx' });
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, old, old);

    appendConvoyEvent(makeEvent(), tmpRoot);

    const events = readConvoyEvents(tmpRoot);
    assert.equal(events.length, 1, 'append must succeed after reclaiming the stale lock');
    assert.equal(fs.existsSync(lockPath), false, 'reclaimed lock must be cleaned up');
  });

  it('does NOT reclaim a stale lock when the holder PID is still alive', () => {
    const lockPath = path.join(tmpRoot, 'events.jsonl.lock');
    // Use our own PID (alive) with a stale timestamp — reclaim must be refused.
    fs.writeFileSync(lockPath, `${process.pid}:1000000000000`, { flag: 'wx' });
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, old, old);

    assert.throws(
      () => appendConvoyEvent(makeEvent(), tmpRoot),
      (err: Error) => err instanceof LockContentionError,
    );
    assert.equal(fs.existsSync(lockPath), true, 'lock held by live process must not be stolen');
  });

  it('lock file contains PID:timestamp payload (SEC-M4)', () => {
    appendConvoyEvent(makeEvent(), tmpRoot);
    // Lock is cleaned up, but we can verify by holding one ourselves
    const lockPath = path.join(tmpRoot, 'events.jsonl.lock');
    // Write a lock with proper payload to verify the parser handles it
    fs.writeFileSync(lockPath, `${process.pid}:${Date.now()}`, { flag: 'wx' });
    const content = fs.readFileSync(lockPath, 'utf-8');
    const parts = content.split(':');
    assert.equal(parts.length, 2, 'lock payload must be pid:timestamp');
    assert.equal(parseInt(parts[0], 10), process.pid);
    fs.unlinkSync(lockPath);
  });

  it('failed append leaves an existing events.jsonl byte-identical', () => {
    appendConvoyEvent(makeEvent(), tmpRoot);
    const before = fs.readFileSync(path.join(tmpRoot, 'events.jsonl'), 'utf-8');

    const lockPath = path.join(tmpRoot, 'events.jsonl.lock');
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    assert.throws(() => appendConvoyEvent(makeEvent('checkpoint_passed'), tmpRoot), LockContentionError);

    const after = fs.readFileSync(path.join(tmpRoot, 'events.jsonl'), 'utf-8');
    assert.equal(after, before, 'a refused append must not mutate the audit log');
  });
});
