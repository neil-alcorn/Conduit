// SEC-M2: convoy_id argv segment validation — path traversal and shell
// metacharacter injection must be rejected before the ID reaches path.join().

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateConvoyId, InvalidConvoyIdError } from '../utils.js';

describe('validateConvoyId (SEC-M2)', () => {
  const VALID = [
    'CNV-0003',
    'conduit-install-experience-v1',
    'hmc-documents-v1',
    'myaccount-quick-actions-v1',
    'some.dotted.name',
    'under_score',
    'MiXeD-CaSe.123',
  ];

  for (const id of VALID) {
    it(`accepts valid ID: ${id}`, () => {
      assert.doesNotThrow(() => validateConvoyId(id));
    });
  }

  const INVALID = [
    ['', 'empty string'],
    ['../etc/passwd', 'path traversal with ..'],
    ['foo/bar', 'forward slash'],
    ['foo\\bar', 'backslash'],
    ['foo bar', 'space'],
    ['foo;rm -rf', 'semicolon shell injection'],
    ['foo$(cmd)', 'shell substitution'],
    ['foo`cmd`', 'backtick injection'],
    ['foo\nbar', 'newline'],
    ['foo\tbar', 'tab'],
    ['convoy|cat /etc/passwd', 'pipe injection'],
    ['convoy&bg', 'ampersand'],
    ['<script>', 'angle brackets'],
    ['.', 'bare dot (current dir)'],
    ['..', 'bare double dot (parent dir)'],
  ];

  for (const [id, label] of INVALID) {
    it(`rejects invalid ID (${label}): ${JSON.stringify(id)}`, () => {
      assert.throws(
        () => validateConvoyId(id),
        (err: Error) => err instanceof InvalidConvoyIdError,
      );
    });
  }
});
