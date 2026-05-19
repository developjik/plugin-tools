'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ir = require('../core/ir.js');
const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-spec.json'), 'utf8'));

test('claude adapter: produces plugin.json', () => {
  const a = new ClaudeCodeAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  const m = files.find(f => f.path === '.claude-plugin/plugin.json');
  assert.ok(m, 'plugin.json must be emitted');
  const obj = JSON.parse(m.content);
  assert.equal(obj.name, 'my-i18n-guard');
  assert.equal(obj.version, '0.1.0');
  assert.equal(obj.commands, './commands/');
  assert.equal(obj.skills, './skills/');
});

test('claude adapter: emits commands as markdown with frontmatter', () => {
  const a = new ClaudeCodeAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  const c = files.find(f => f.path === 'commands/check.md');
  assert.ok(c);
  assert.match(c.content, /^---/);
  assert.match(c.content, /description:/);
  assert.match(c.content, /model:/);
});

test('claude adapter: emits skill with frontmatter', () => {
  const a = new ClaudeCodeAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  const s = files.find(f => f.path === 'skills/i18n-key-guard/SKILL.md');
  assert.ok(s);
  assert.match(s.content, /name: i18n-key-guard/);
  assert.match(s.content, /disable-model-invocation:/);
});

test('claude adapter: drops codex-only hook with warning', () => {
  const a = new ClaudeCodeAdapter();
  const { files, warnings } = a.render(ir.normalize(SAMPLE));
  const h = files.find(f => f.path === 'hooks/hooks.json');
  assert.ok(h);
  const obj = JSON.parse(h.content);
  assert.ok(obj.hooks.PreToolUse);
  assert.ok(obj.hooks.Notification);
  assert.equal(obj.hooks.PermissionRequest, undefined, 'PermissionRequest is codex-only');
  assert.ok(warnings.some(w => w.includes('PermissionRequest')), 'warning expected');
});

test('claude adapter: never writes marketplace.json', () => {
  const a = new ClaudeCodeAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  assert.equal(files.find(f => f.path.endsWith('marketplace.json')), undefined);
});

test('claude adapter: emits .mcp.json', () => {
  const a = new ClaudeCodeAdapter();
  const { files } = a.render(ir.normalize(SAMPLE));
  const m = files.find(f => f.path === '.mcp.json');
  assert.ok(m);
  const obj = JSON.parse(m.content);
  assert.ok(obj.mcpServers.lokalise);
});
