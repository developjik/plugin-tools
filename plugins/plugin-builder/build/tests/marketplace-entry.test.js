'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const me = require('../core/marketplace-entry.js');

test('claudeEntry: local source default', () => {
  const e = me.claudeEntry({ name: 'x', version: '0.1.0', description: 'd' });
  assert.equal(e.source, 'local');
  assert.equal(e.path, '.');
});

test('claudeEntry: github source when gitRemote', () => {
  const e = me.claudeEntry(
    { name: 'x', version: '0.1.0', description: 'd' },
    { gitRemote: 'o/r' }
  );
  assert.equal(e.source, 'github');
  assert.equal(e.repo, 'o/r');
});

test('claudeEntry: known category maps to hint', () => {
  const e = me.claudeEntry({ name: 'x', version: '0.1.0', description: 'd', category: 'dev-tools' });
  assert.equal(e.category, 'dev-tools');
});

test('claudeEntry: per-target override wins over hint', () => {
  const e = me.claudeEntry({
    name: 'x', version: '0.1.0', description: 'd',
    category: 'productivity',
    claude: { category: 'custom-claude-cat' },
  });
  assert.equal(e.category, 'custom-claude-cat');
});

test('claudeEntry: unknown category passthrough', () => {
  const e = me.claudeEntry({ name: 'x', version: '0.1.0', description: 'd', category: 'ai-tools' });
  assert.equal(e.category, 'ai-tools');
});

test('codexEntry: nested local source default', () => {
  const e = me.codexEntry({ name: 'my-plugin', version: '0.1.0', description: 'd' });
  assert.deepEqual(e.source, { source: 'local', path: './my-plugin' });
});

test('codexEntry: policy defaults', () => {
  const e = me.codexEntry({ name: 'x', version: '0.1.0', description: 'd' });
  assert.deepEqual(e.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
});

test('codexEntry: policy passthrough', () => {
  const e = me.codexEntry({
    name: 'x', version: '0.1.0', description: 'd',
    codex: { policy: { installation: 'INSTALLED_BY_DEFAULT', authentication: 'ON_INSTALL' } },
  });
  assert.equal(e.policy.installation, 'INSTALLED_BY_DEFAULT');
});

test('codexEntry: kebab→PascalCase category for known key', () => {
  const e = me.codexEntry({ name: 'x', version: '0.1.0', description: 'd', category: 'dev-tools' });
  assert.equal(e.category, 'DevTools');
});

test('codexEntry: unknown category best-effort PascalCase', () => {
  const e = me.codexEntry({ name: 'x', version: '0.1.0', description: 'd', category: 'ai-tools' });
  assert.equal(e.category, 'AiTools');
});

test('codexEntry: per-target override beats hint and transform', () => {
  const e = me.codexEntry({
    name: 'x', version: '0.1.0', description: 'd',
    category: 'ai-tools',
    codex: { category: 'AITools' },
  });
  assert.equal(e.category, 'AITools');
});

test('codexEntry: github source variant', () => {
  const e = me.codexEntry(
    { name: 'x', version: '0.1.0', description: 'd' },
    { gitRemote: 'o/r' }
  );
  assert.deepEqual(e.source, { source: 'github', repo: 'o/r' });
});

test('buildClaudeRoot: defaults applied', () => {
  const r = me.buildClaudeRoot({ name: 'mp', owner: { name: 'me' } });
  assert.equal(r.name, 'mp');
  assert.equal(r.owner.name, 'me');
  assert.equal(r.metadata, undefined, 'pluginRoot metadata removed (no plugins/ folder)');
  assert.deepEqual(r.plugins, []);
});

test('buildCodexRoot: displayName optional', () => {
  const r1 = me.buildCodexRoot({ name: 'mp' });
  assert.equal(r1.name, 'mp');
  assert.equal(r1.interface, undefined);
  const r2 = me.buildCodexRoot({ name: 'mp', displayName: 'My MP' });
  assert.equal(r2.interface.displayName, 'My MP');
});

test('categoryHintMiss: returns null for known', () => {
  assert.equal(me.categoryHintMiss('productivity', {}), null);
});

test('categoryHintMiss: returns null when override set', () => {
  assert.equal(me.categoryHintMiss('ai-tools', { claude: { category: 'x' }, codex: { category: 'y' } }), null);
});

test('categoryHintMiss: reports unknown', () => {
  const m = me.categoryHintMiss('ai-tools', {});
  assert.equal(m.raw, 'ai-tools');
  assert.equal(m.claudeFallback, 'ai-tools');
  assert.equal(m.codexFallback, 'AiTools');
});

test('normalizeOwner: handles missing/string/object', () => {
  assert.deepEqual(me.normalizeOwner(null), { name: 'unknown' });
  assert.deepEqual(me.normalizeOwner('Jane'), { name: 'Jane' });
  assert.deepEqual(me.normalizeOwner({ name: 'Jane', email: 'j@e' }), { name: 'Jane', email: 'j@e' });
});

test('toPascal: handles kebab, snake, spaces', () => {
  assert.equal(me.toPascal('ai-tools'), 'AiTools');
  assert.equal(me.toPascal('foo_bar_baz'), 'FooBarBaz');
  assert.equal(me.toPascal('hello world'), 'HelloWorld');
});
