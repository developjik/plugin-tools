'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin', 'plugin-builder');

function tmpDir(prefix = 'pb-mi-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runInit(args) {
  return spawnSync('node', [BIN, 'marketplace', 'init', ...args], { encoding: 'utf8' });
}

test('marketplace init: creates both catalog files', () => {
  const root = path.join(tmpDir(), 'mp');
  const r = runInit([root, '--owner-name', 'Test User']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(root, '.claude-plugin', 'marketplace.json')));
  assert.ok(fs.existsSync(path.join(root, '.agents', 'plugins', 'marketplace.json')));
  assert.equal(fs.existsSync(path.join(root, 'plugins')), false, 'no plugins/ dir — plugins live at <root>/<name>/');
  const claude = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(claude.owner.name, 'Test User');
  assert.equal(claude.metadata, undefined, 'pluginRoot metadata removed');
  assert.deepEqual(claude.plugins, []);
  const codex = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  assert.deepEqual(codex.plugins, []);
});

test('marketplace init: name defaults to basename(root)', () => {
  const root = path.join(tmpDir(), 'mymarket');
  runInit([root, '--owner-name', 'X']);
  const claude = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(claude.name, 'mymarket');
});

test('marketplace init: refuses overwrite without --force', () => {
  const root = path.join(tmpDir(), 'mp');
  const r1 = runInit([root, '--owner-name', 'X']);
  assert.equal(r1.status, 0);
  const r2 = runInit([root, '--owner-name', 'X']);
  assert.notEqual(r2.status, 0);
  assert.match(r2.stderr, /already exists|--force/);
});

test('marketplace init: --force overwrites', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit([root, '--owner-name', 'X']);
  const r2 = runInit([root, '--owner-name', 'Y', '--force']);
  assert.equal(r2.status, 0, r2.stderr);
  const claude = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(claude.owner.name, 'Y');
});

test('marketplace init: display-name flows into Codex interface', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit([root, '--owner-name', 'X', '--display-name', 'My Pretty Market']);
  const codex = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  assert.equal(codex.interface.displayName, 'My Pretty Market');
});
