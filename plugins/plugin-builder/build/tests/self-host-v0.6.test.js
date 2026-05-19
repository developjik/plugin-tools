'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin', 'plugin-builder');
const SPEC = path.join(REPO, 'tests', 'fixtures', 'self-host-spec.json');

test('v0.6 self-host: plugin-builder becomes 1-plugin entry under marketplace root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-selfhost-v6-'));

  const init = spawnSync('node', [BIN, 'marketplace', 'init', root,
    '--owner-name', 'developjik',
    '--owner-email', 'developjik@colosseum.kr',
    '--display-name', 'Plugin Builder Official'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);

  const sc = spawnSync('node', [BIN, 'scaffold', '--spec', SPEC, '--out', root],
    { encoding: 'utf8' });
  assert.equal(sc.status, 0, sc.stderr);
  const report = JSON.parse(sc.stdout);
  assert.ok(report.publish, 'auto-publish must run');

  // Plugin tree lives under <root>/plugin-builder/
  const pluginDir = path.join(root, 'plugin-builder');
  assert.ok(fs.existsSync(path.join(pluginDir, '.claude-plugin', 'plugin.json')));
  assert.ok(fs.existsSync(path.join(pluginDir, '.codex-plugin', 'plugin.json')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'plugin-builder', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'commands', 'new.md')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'commands', 'marketplace-init.md')));

  // Both marketplace catalogs hold a single entry.
  const claudeMp = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const codexMp = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  assert.equal(claudeMp.plugins.length, 1);
  assert.equal(claudeMp.plugins[0].name, 'plugin-builder');
  assert.equal(claudeMp.plugins[0].path, './plugin-builder');
  assert.equal(codexMp.plugins.length, 1);
  assert.equal(codexMp.plugins[0].name, 'plugin-builder');
  assert.equal(codexMp.plugins[0].source.path, './plugin-builder');
  assert.equal(codexMp.plugins[0].policy.installation, 'AVAILABLE');
  assert.equal(codexMp.plugins[0].category, 'DevTools');

  // Validator runs against the rendered plugin tree — overall PASS expected.
  const v = spawnSync('node', [BIN, 'validate', pluginDir, '--spec', SPEC], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /Result: PASS/);
  assert.match(v.stdout, /\(a\) Manifest schema\s+PASS/);
  assert.match(v.stdout, /\(b\) File structure\s+PASS/);
  assert.match(v.stdout, /\(f\) Marketplace\s+PASS/);

  fs.rmSync(root, { recursive: true, force: true });
});
