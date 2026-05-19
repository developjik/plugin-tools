'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dryRun = require('../core/dry-run.js');

function mkPlugin(subdir, manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-dryrun-test-'));
  fs.mkdirSync(path.join(dir, subdir), { recursive: true });
  fs.writeFileSync(path.join(dir, subdir, 'plugin.json'), JSON.stringify(manifest));
  return dir;
}

test('dry-run.runClaude: rejects unsafe plugin name (path traversal)', () => {
  const dir = mkPlugin('.claude-plugin', { name: '../etc' });
  try {
    const r = dryRun.runClaude(dir);
    assert.equal(r.status, 'FAIL');
    assert.match(r.reason, /unsafe|kebab/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run.runCodex: rejects unsafe plugin name (path traversal)', () => {
  const dir = mkPlugin('.codex-plugin', { name: '../../boom' });
  try {
    const r = dryRun.runCodex(dir);
    assert.equal(r.status, 'FAIL');
    assert.match(r.reason, /unsafe|kebab/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run.runClaude: missing manifest → FAIL not SKIP (no false PASS)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-dryrun-empty-'));
  try {
    const r = dryRun.runClaude(dir);
    // If claude CLI is missing this returns SKIP; if claude exists the manifest
    // load must fail loudly, never silently PASS.
    assert.ok(['SKIP', 'FAIL'].includes(r.status), `expected SKIP|FAIL got ${r.status}`);
    if (r.status === 'FAIL') assert.match(r.reason, /missing|invalid/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run.TARGETS: descriptor table is the extension point (no parallel fns)', () => {
  // Regression: adding a new dry-run target should be a TARGETS entry, not a
  // top-level function copy. Verify both shipped targets share descriptor shape.
  const { TARGETS } = require('../core/dry-run.js');
  const keys = Object.keys(TARGETS).sort();
  assert.deepEqual(keys, ['claude-code', 'codex']);
  for (const t of keys) {
    const d = TARGETS[t];
    assert.equal(typeof d.cli, 'string');
    assert.equal(typeof d.manifestSubdir, 'string');
    assert.equal(typeof d.buildInvocation, 'function');
    assert.equal(typeof d.interpretSuccess, 'function');
    assert.equal(typeof d.interpretFailure, 'function');
  }
});

test('dry-run.runDryRun: unknown target → FAIL with explicit reason', () => {
  const r = dryRun.runDryRun('not-a-target', '/tmp');
  assert.equal(r.status, 'FAIL');
  assert.match(r.reason, /unknown dry-run target/);
});

test('dry-run rejects symlinks in plugin tree (no secret exfiltration)', () => {
  const dir = mkPlugin('.claude-plugin', { name: 'safe-name' });
  try {
    // Symlink to /etc/passwd inside plugin tree — must be refused at staging.
    fs.symlinkSync('/etc/passwd', path.join(dir, 'evil-link'));
    const r = dryRun.runClaude(dir);
    // Either SKIP (CLI missing) or FAIL (staging refused symlink) — never PASS.
    if (r.status === 'PASS') {
      assert.fail('symlink in plugin tree must not produce PASS');
    }
    if (r.status === 'FAIL') assert.match(r.reason, /symlink|staging/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
