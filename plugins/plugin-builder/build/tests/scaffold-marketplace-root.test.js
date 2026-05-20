'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin', 'plugin-builder');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pb-smr-'));
}

function dualSpec(name) {
  return {
    specVersion: '1.0',
    name: name || 'mr-demo',
    version: '0.1.0',
    description: 'multi-marketplace-root demo fixture for scaffold tests',
    targets: ['claude-code', 'codex'],
    skills: [{
      name: 'one-skill',
      description: 'demo skill description satisfying twenty char minimum',
      body: '# One',
    }],
    hooks: [
      { event: 'PreToolUse', command: '/bin/true' },
      { event: 'Notification', command: '/bin/true' }, // claudeOnly
    ],
  };
}

function triSpec(name) {
  return {
    ...dualSpec(name || 'tri-demo'),
    specVersion: '1.1',
    targets: ['claude-code', 'codex', 'cursor'],
    commands: [{ name: 'check', description: 'Run a tri-target smoke check', body: 'Check.' }],
    rules: [{ name: 'tri-rule', description: 'Rule description for Cursor target tests.' }],
  };
}

function writeSpec(spec) {
  const dir = tmpDir();
  const file = path.join(dir, 'spec.json');
  fs.writeFileSync(file, JSON.stringify(spec));
  return { dir, file };
}

function runInit(root) {
  return spawnSync('node', [BIN, 'marketplace', 'init', root, '--owner-name', 'Tester'],
    { encoding: 'utf8' });
}
function runScaffold(specFile, root, extra = []) {
  return spawnSync('node', [BIN, 'scaffold', '--spec', specFile, '--out', root, ...extra],
    { encoding: 'utf8' });
}

test('scaffold: hybrid layout under <root>/<name>/, both manifests, auto-publish', () => {
  const root = path.join(tmpDir(), 'mp');
  assert.equal(runInit(root).status, 0);
  const { file } = writeSpec(dualSpec());
  const r = runScaffold(file, root);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.ok(report.publish, 'should auto-publish');

  const pluginDir = path.join(root, 'mr-demo');
  assert.ok(fs.existsSync(path.join(pluginDir, '.claude-plugin', 'plugin.json')));
  assert.ok(fs.existsSync(path.join(pluginDir, '.codex-plugin', 'plugin.json')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'one-skill', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'hooks', 'claude.json')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'hooks', 'codex.json')));

  // Manifest hooks field points to per-target file.
  const claude = JSON.parse(fs.readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(claude.hooks, './hooks/claude.json');
  const codex = JSON.parse(fs.readFileSync(path.join(pluginDir, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(codex.hooks, './hooks/codex.json');

  // Marketplace catalogs updated with root-relative path.
  const mpClaude = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const mpCodex = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  assert.equal(mpClaude.plugins[0].name, 'mr-demo');
  assert.equal(mpClaude.plugins[0].path, './mr-demo');
  assert.equal(mpCodex.plugins[0].name, 'mr-demo');
  assert.equal(mpCodex.plugins[0].source.path, './mr-demo');
  assert.equal(mpCodex.plugins[0].policy.installation, 'AVAILABLE');
});

test('scaffold --no-publish: skips marketplace patch', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit(root);
  const { file } = writeSpec(dualSpec());
  const r = runScaffold(file, root, ['--no-publish']);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.publish, undefined, '--no-publish must skip auto-publish');
  // Marketplace catalogs untouched (still empty).
  const mp = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.deepEqual(mp.plugins, []);
});

test('scaffold: re-run is idempotent (publish noop)', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit(root);
  const { file } = writeSpec(dualSpec());
  runScaffold(file, root);
  const r2 = runScaffold(file, root);
  assert.equal(r2.status, 0, r2.stderr);
  const report = JSON.parse(r2.stdout);
  assert.equal(report.publish.action, 'noop');
});

test('publish: patches both marketplaces under parent root', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit(root);
  const { file } = writeSpec(dualSpec());
  runScaffold(file, root, ['--no-publish']);
  const pluginDir = path.join(root, 'mr-demo');
  const r = spawnSync('node',
    [BIN, 'publish', pluginDir],
    { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.root);
  const mp = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(mp.plugins.length, 1);
});

test('publish: patches cursor marketplace when generated plugin has cursor manifest', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit(root);
  const { file } = writeSpec(triSpec());
  runScaffold(file, root, ['--no-publish']);
  const pluginDir = path.join(root, 'tri-demo');
  const r = spawnSync('node',
    [BIN, 'publish', pluginDir],
    { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.cursor.action, 'append');
  const mp = JSON.parse(fs.readFileSync(path.join(root, '.cursor-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(mp.plugins.length, 1);
  assert.equal(mp.plugins[0].name, 'tri-demo');
  assert.equal(mp.plugins[0].source, './tri-demo');
});

test('publish: errors when parent root lacks marketplace catalog', () => {
  const elsewhere = path.join(tmpDir(), 'plug');
  fs.mkdirSync(path.join(elsewhere, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(elsewhere, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'p', version: '0.1.0', description: 'd' }));
  const r = spawnSync('node',
    [BIN, 'publish', elsewhere],
    { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /marketplace catalog not found/);
});

test('scaffold: stale in-plugin marketplace.json warns', () => {
  const root = path.join(tmpDir(), 'mp');
  runInit(root);
  // Plant stale in-plugin marketplace.json before scaffold.
  const stale = path.join(root, 'mr-demo', '.claude-plugin');
  fs.mkdirSync(stale, { recursive: true });
  fs.writeFileSync(path.join(stale, 'marketplace.json'), '{}');
  const { file } = writeSpec(dualSpec());
  const r = runScaffold(file, root);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  const joined = report.warnings.join(' ');
  assert.match(joined, /stale in-plugin marketplace/);
});
