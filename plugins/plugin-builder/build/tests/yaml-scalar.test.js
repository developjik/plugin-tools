'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { yamlScalar, yamlFrontmatter, needsYamlQuote } = require('../adapters/base.js');

test('yamlScalar: simple ASCII pass-through', () => {
  assert.equal(yamlScalar('hello'), 'hello');
  assert.equal(yamlScalar('kebab-case-key'), 'kebab-case-key');
});

test('yamlScalar: quotes anchor/alias indicators (* &)', () => {
  // pre-fix bug: '*evil' was emitted bare, parsed by YAML as alias reference
  assert.equal(yamlScalar('*evil'), '"*evil"');
  assert.equal(yamlScalar('&anchor'), '"&anchor"');
});

test('yamlScalar: quotes tag indicator (!)', () => {
  // pre-fix bug: '!!python/object' would be parsed as tag → arbitrary type
  assert.equal(yamlScalar('!!python/object'), '"!!python/object"');
  assert.equal(yamlScalar('!Tag'), '"!Tag"');
});

test('yamlScalar: quotes flow indicators ([ ] { } ,)', () => {
  assert.equal(yamlScalar('[evil'), '"[evil"');
  assert.equal(yamlScalar('a,b'), '"a,b"');
});

test('yamlScalar: quotes block scalar indicators (| >)', () => {
  assert.equal(yamlScalar('|multiline'), '"|multiline"');
  assert.equal(yamlScalar('>fold'), '">fold"');
});

test('yamlScalar: quotes YAML 1.1 boolean keywords', () => {
  assert.equal(yamlScalar('yes'), '"yes"');
  assert.equal(yamlScalar('no'), '"no"');
  assert.equal(yamlScalar('on'), '"on"');
  assert.equal(yamlScalar('off'), '"off"');
  assert.equal(yamlScalar('true'), '"true"');
  assert.equal(yamlScalar('null'), '"null"');
  assert.equal(yamlScalar('~'), '"~"');
});

test('yamlScalar: quotes numeric-looking strings to prevent type coercion', () => {
  assert.equal(yamlScalar('1.0'), '"1.0"');
  assert.equal(yamlScalar('0x10'), '"0x10"');
  assert.equal(yamlScalar('.inf'), '".inf"');
});

test('yamlScalar: quotes leading/trailing whitespace', () => {
  assert.equal(yamlScalar(' lead'), '" lead"');
  assert.equal(yamlScalar('trail '), '"trail "');
});

test('yamlScalar: quotes embedded comment (` #`) to prevent truncation', () => {
  assert.equal(yamlScalar('value # not comment'), '"value # not comment"');
});

test('yamlScalar: quotes empty string', () => {
  assert.equal(yamlScalar(''), '""');
});

test('yamlScalar: quotes control chars', () => {
  assert.equal(yamlScalar('a\x00b'), JSON.stringify('a\x00b'));
});

test('yamlFrontmatter: produces safe quoted output for malicious skill name', () => {
  // Even though skill names go through kebab-case validation upstream, the
  // frontmatter emitter must be safe in isolation.
  const out = yamlFrontmatter({ name: '*injection', description: 'safe' });
  assert.match(out, /name: "\*injection"/);
});

test('yamlScalar: U+2028 (line separator) is escaped, not emitted literally', () => {
  const out = yamlScalar('a b');
  assert.equal(out.includes(' '), false, 'literal U+2028 must not survive');
  assert.match(out, /\\u2028/);
});

test('yamlScalar: U+2029 (paragraph separator) is escaped', () => {
  const out = yamlScalar('a b');
  assert.equal(out.includes(' '), false);
  assert.match(out, /\\u2029/);
});

test('needsYamlQuote: exposed predicate', () => {
  assert.equal(needsYamlQuote('plain'), false);
  assert.equal(needsYamlQuote('yes'), true);
  assert.equal(needsYamlQuote('a:b'), true);
});

test('yamlScalar: integration — claude SKILL.md uses same emitter (SSoT)', () => {
  // Regression: every yaml emit site in the codebase must funnel through
  // yamlFrontmatter/yamlScalar — no parallel ad-hoc YAML stringifier.
  // Verify by rendering a skill whose name is a YAML special token.
  const ir = require('../core/ir.js');
  const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');
  const spec = ir.normalize({
    specVersion: '1.0', name: 'yaml-host', version: '0.1.0',
    description: 'yaml emitter SSoT regression covering claude skill frontmatter',
    targets: ['claude-code'],
    skills: [{
      name: 'a-b-c',
      description: 'description containing trailing colon: should be quoted by emitter',
      body: '# body',
    }],
  });
  const { files } = new ClaudeCodeAdapter().render(spec);
  const sk = files.find(f => f.path === 'skills/a-b-c/SKILL.md');
  assert.ok(sk);
  // description had a `:` so it must be quoted in frontmatter, not bare.
  assert.match(sk.content, /description: "description containing trailing colon: should be quoted by emitter"/);
});
