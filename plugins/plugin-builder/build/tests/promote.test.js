'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const renderer = require('../core/renderer.js');

function mkOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pb-promote-'));
}

test('promote: success path overwrites and discards .pb-bak files', () => {
  const out = mkOut();
  fs.writeFileSync(path.join(out, 'README.md'), 'OLD');
  const stage = renderer.stageWrite([{ path: 'README.md', content: 'NEW' }]);
  const written = renderer.promote(stage, out);
  assert.equal(fs.readFileSync(path.join(out, 'README.md'), 'utf8'), 'NEW');
  assert.equal(written.length, 1);
  // No leftover .pb-bak.*
  const stragglers = fs.readdirSync(out).filter(n => n.includes('.pb-bak.'));
  assert.deepEqual(stragglers, [], 'no .pb-bak leftovers on success');
});

test('promote: failure mid-write restores prior content (no data loss)', () => {
  const out = mkOut();
  fs.writeFileSync(path.join(out, 'a.md'), 'A-OLD');
  // Block nested mkdir: create a FILE at out/sub so promote's mkdirSync(out/sub) fails on file 2.
  fs.writeFileSync(path.join(out, 'sub'), 'BLOCKING-FILE');

  const stage = renderer.stageWrite([
    { path: 'a.md', content: 'A-NEW' },
    { path: 'sub/x.md', content: 'X-NEW' }, // mkdir(out/sub) will fail (exists as file)
  ]);
  assert.throws(() => renderer.promote(stage, out));
  // a.md must be restored to original
  assert.equal(fs.readFileSync(path.join(out, 'a.md'), 'utf8'), 'A-OLD',
    'file 1 must be restored after rollback');
  // blocking file untouched
  assert.equal(fs.readFileSync(path.join(out, 'sub'), 'utf8'), 'BLOCKING-FILE');
  const stragglers = fs.readdirSync(out).filter(n => n.includes('.pb-bak.'));
  assert.deepEqual(stragglers, [], 'no .pb-bak leftovers on failure rollback');
});
