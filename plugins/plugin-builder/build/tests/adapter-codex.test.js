'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ir = require('../core/ir.js');
const { CodexAdapter } = require('../adapters/codex.js');

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-spec.json'), 'utf8'));

test('codex adapter: produces .codex-plugin/plugin.json with interface block', () => {
  const a = new CodexAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  const m = files.find(f => f.path === '.codex-plugin/plugin.json');
  assert.ok(m);
  const obj = JSON.parse(m.content);
  assert.equal(obj.name, 'my-i18n-guard');
  assert.ok(obj.interface, 'interface block expected');
  assert.equal(obj.interface.displayName, 'i18n Guard');
  assert.deepEqual(obj.interface.defaultPrompt, ['Lint i18n keys in this repo', 'Find missing translations']);
});

test('codex adapter: folds commands into SKILL.md', () => {
  const a = new CodexAdapter();
  const { files, warnings } = a.render(ir.normalize(SAMPLE));
  const s = files.find(f => f.path === 'skills/i18n-key-guard/SKILL.md');
  assert.ok(s);
  assert.match(s.content, /## Commands \(folded from Claude target\)/);
  assert.match(s.content, /### \/check/);
  assert.ok(warnings.some(w => w.includes('folded into SKILL.md')), 'fold warning expected');
});

test('codex adapter: drops claude-only hooks with warning', () => {
  const a = new CodexAdapter();
  const { files, warnings } = a.render(ir.normalize(SAMPLE));
  const h = files.find(f => f.path === 'hooks/hooks.json');
  assert.ok(h);
  const obj = JSON.parse(h.content);
  assert.ok(obj.hooks.PreToolUse);
  assert.ok(obj.hooks.PermissionRequest);
  assert.equal(obj.hooks.Notification, undefined);
  assert.ok(warnings.some(w => w.includes('Notification')));
});

test('codex adapter: features.plugin_hooks enables when hooks present', () => {
  const a = new CodexAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  const m = files.find(f => f.path === '.codex-plugin/plugin.json');
  const obj = JSON.parse(m.content);
  assert.equal(obj.features.plugin_hooks, true);
});

test('codex adapter: never emits commands/<name>.md', () => {
  const a = new CodexAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  assert.equal(files.find(f => f.path.startsWith('commands/')), undefined);
});

test('codex adapter: never writes marketplace.json', () => {
  const a = new CodexAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  assert.equal(files.find(f => f.path.endsWith('marketplace.json')), undefined);
});
