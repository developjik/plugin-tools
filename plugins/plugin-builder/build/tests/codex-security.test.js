'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ir = require('../core/ir.js');
const { CodexAdapter, PRESERVED_SECURITY_KEYS } = require('../adapters/codex.js');

function baseSpec(extra = {}) {
  return ir.normalize({
    specVersion: '1.0',
    name: 'sec-demo',
    version: '0.1.0',
    description: 'security regression fixture covering frontmatter preservation',
    targets: ['codex'],
    ...extra,
  });
}

test('codex: preserves allowed-tools on skill (no silent drop = no privesc)', () => {
  const spec = baseSpec({
    skills: [{
      name: 'guard',
      description: 'guard skill description above twenty chars',
      'allowed-tools': ['Read'],
      body: '# Guard',
    }],
  });
  const { files } = new CodexAdapter().render(spec);
  const skill = files.find(f => f.path === 'skills/guard/SKILL.md');
  assert.ok(skill);
  assert.match(skill.content, /allowed-tools:/);
  assert.match(skill.content, /Read/);
});

test('codex: preserves disable-model-invocation and user-invocable', () => {
  const spec = baseSpec({
    skills: [{
      name: 'guarded',
      description: 'skill that explicitly disables model invocation safely',
      'disable-model-invocation': true,
      'user-invocable': false,
      body: '# Guarded',
    }],
  });
  const { files, warnings } = new CodexAdapter().render(spec);
  const skill = files.find(f => f.path === 'skills/guarded/SKILL.md');
  assert.match(skill.content, /disable-model-invocation: true/);
  assert.match(skill.content, /user-invocable: false/);
  // These keys must NOT appear in dropped-warning list anymore.
  for (const w of warnings) {
    assert.doesNotMatch(w, /claude-only key 'disable-model-invocation' dropped/);
    assert.doesNotMatch(w, /claude-only key 'user-invocable' dropped/);
  }
});

test('codex: unions command allowed-tools into skill scope when folded', () => {
  const spec = baseSpec({
    commands: [{
      name: 'check',
      description: 'check cmd',
      frontmatter: { 'allowed-tools': ['Bash', 'Edit'] },
    }],
    skills: [{
      name: 'merged',
      description: 'skill that absorbs commands during codex fold',
      'allowed-tools': ['Read'],
      body: '# m',
    }],
  });
  const { files, warnings } = new CodexAdapter().render(spec);
  const skill = files.find(f => f.path === 'skills/merged/SKILL.md');
  // All three tools must be present after union.
  assert.match(skill.content, /Read/);
  assert.match(skill.content, /Bash/);
  assert.match(skill.content, /Edit/);
  assert.ok(warnings.some(w => /merged allowed-tools/.test(w)), 'union warning must be emitted');
});

test('codex: PRESERVED_SECURITY_KEYS allowlist is the single source of truth', () => {
  // Regression: adding a new security-critical key must require editing the
  // allowlist in exactly one place. Verify expected contents.
  assert.deepEqual([...PRESERVED_SECURITY_KEYS].sort(), [
    'allowed-tools', 'disable-model-invocation', 'user-invocable',
  ].sort());
});

test('codex: every key in PRESERVED_SECURITY_KEYS round-trips through SKILL.md', () => {
  // Data-driven assertion — if a new key is appended to PRESERVED_SECURITY_KEYS
  // it must be emitted by #skillFile without further code changes.
  const skill = {
    name: 'roundtrip',
    description: 'roundtrip skill description above twenty chars long enough',
    body: '# r',
  };
  // Set each preserved key to a recognisable scalar.
  for (const k of PRESERVED_SECURITY_KEYS) {
    skill[k] = k === 'allowed-tools' ? ['Read'] : true;
  }
  const spec = baseSpec({ skills: [skill] });
  const { files } = new CodexAdapter().render(spec);
  const sk = files.find(f => f.path === 'skills/roundtrip/SKILL.md');
  assert.ok(sk);
  for (const k of PRESERVED_SECURITY_KEYS) {
    assert.match(sk.content, new RegExp(k));
  }
});

test('codex: still drops genuinely codex-incompatible style keys (model/effort/paths)', () => {
  const spec = baseSpec({
    skills: [{
      name: 'styled',
      description: 'skill with claude-only style hints that codex cannot honor',
      model: 'sonnet',
      effort: 'high',
      paths: ['src/'],
      body: '# s',
    }],
  });
  const { warnings } = new CodexAdapter().render(spec);
  for (const k of ['model', 'effort', 'paths']) {
    assert.ok(warnings.some(w => w.includes(`'${k}' dropped`)), `${k} drop warning expected`);
  }
});
