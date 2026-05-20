'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ir = require('../core/ir.js');

test('ir.validate: sample-spec passes', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-spec.json'), 'utf8'));
  const v = ir.validate(spec);
  assert.equal(v.ok, true, 'errors: ' + v.errors.join('; '));
});

test('ir.validate: self-host-spec passes', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'self-host-spec.json'), 'utf8'));
  const v = ir.validate(spec);
  assert.equal(v.ok, true, 'errors: ' + v.errors.join('; '));
});

test('ir.validate: missing specVersion fails', () => {
  const v = ir.validate({ name: 'x', version: '0.1.0', description: 'x', targets: ['claude-code'] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /specVersion/);
});

test('ir.validate: invalid name pattern fails', () => {
  const v = ir.validate({ specVersion: '1.0', name: 'Bad_Name', version: '0.1.0', description: 'x', targets: ['claude-code'] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /name:/);
});

test('ir.validate: invalid version pattern fails', () => {
  const v = ir.validate({ specVersion: '1.0', name: 'x', version: 'v1', description: 'x', targets: ['claude-code'] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /version:/);
});

test('ir.validate: skill description too short fails', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'x', version: '0.1.0', description: 'd', targets: ['claude-code'],
    skills: [{ name: 'y', description: 'short' }],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /at least 20 chars/);
});

test('ir.validate: rejects javascript: scheme in homepage (XSS vector)', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'x', version: '0.1.0', description: 'x',
    targets: ['claude-code'], homepage: 'javascript:alert(1)',
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /homepage/);
});

test('ir.validate: rejects file: scheme in repository (local file disclosure)', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'x', version: '0.1.0', description: 'x',
    targets: ['claude-code'], repository: 'file:///etc/passwd',
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /repository/);
});

test('ir.validate: rejects data: scheme in mcpServers.url', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'x', version: '0.1.0', description: 'x',
    targets: ['claude-code'],
    mcpServers: [{ name: 'srv', transport: 'http', url: 'data:text/html,<script>alert(1)</script>' }],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /url/);
});

test('ir.validate: accepts https in homepage and repository', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'safe-name', version: '0.1.0',
    description: 'safe twenty char description here',
    targets: ['claude-code'],
    homepage: 'https://example.com/x',
    repository: 'https://github.com/me/x',
  });
  assert.equal(v.ok, true, v.errors.join(';'));
});

test('ir.isSafeUri: control chars rejected', () => {
  assert.equal(ir.isSafeUri('https://ex.com/\x00'), false);
  assert.equal(ir.isSafeUri('https://ex.com/ok'), true);
});

test('ir.isSafeUri: mailto excluded (defence in depth for homepage/repo)', () => {
  // mailto would never be a correct homepage; keeping the allowlist tight
  // narrows the legitimate scheme surface and keeps the allowlist meaningful.
  assert.equal(ir.isSafeUri('mailto:x@y.com'), false);
});

test('ir.normalize: defaults applied', () => {
  const out = ir.normalize({ specVersion: '1.0', name: 'x', version: '0.1.0', description: 'x', targets: ['claude-code'] });
  assert.equal(out.license, 'MIT');
  assert.equal(out.category, 'other');
  assert.deepEqual(out.commands, []);
  assert.deepEqual(out.skills, []);
  assert.deepEqual(out.rules, []);
});

test('ir.validate: rules accepted with description + alwaysApply + globs', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'xy', version: '0.1.0', description: 'x', targets: ['cursor'],
    rules: [{ name: 'prefer-const', description: 'Prefer const', alwaysApply: true, globs: ['**/*.ts'] }],
  });
  assert.equal(v.ok, true, 'errors: ' + v.errors.join('; '));
});

test('ir.validate: rule name must be kebab-case', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'xy', version: '0.1.0', description: 'x', targets: ['cursor'],
    rules: [{ name: 'BadName', description: 'd' }],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /rules\[0\]\.name/);
});

test('ir.validate: rule.alwaysApply must be boolean', () => {
  const v = ir.validate({
    specVersion: '1.0', name: 'xy', version: '0.1.0', description: 'x', targets: ['cursor'],
    rules: [{ name: 'r4', description: 'd', alwaysApply: 'yes' }],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(';'), /alwaysApply/);
});

test('ir.validate: rule.globs accepts string or string[]', () => {
  const ok1 = ir.validate({
    specVersion: '1.0', name: 'xy', version: '0.1.0', description: 'x', targets: ['cursor'],
    rules: [{ name: 'r1', description: 'd', globs: '**/*.ts' }],
  });
  const ok2 = ir.validate({
    specVersion: '1.0', name: 'xy', version: '0.1.0', description: 'x', targets: ['cursor'],
    rules: [{ name: 'r2', description: 'd', globs: ['**/*.ts', '**/*.tsx'] }],
  });
  assert.equal(ok1.ok, true);
  assert.equal(ok2.ok, true);
  const bad = ir.validate({
    specVersion: '1.0', name: 'xy', version: '0.1.0', description: 'x', targets: ['cursor'],
    rules: [{ name: 'r3', description: 'd', globs: 42 }],
  });
  assert.equal(bad.ok, false);
});
