'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mw = require('../core/marketplace-writer.js');

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-mw-'));
  return path.join(dir, name);
}

test('marketplace-writer: creates new file with single entry', async () => {
  const p = tmpFile('marketplace.json');
  const spec = {
    name: 'my-plugin', version: '0.1.0', description: 'd',
    author: { name: 'a' },
  };
  const r = await mw.patch(p, spec, { localPath: '.' });
  assert.equal(r.action, 'append');
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(data.plugins.length, 1);
  assert.equal(data.plugins[0].name, 'my-plugin');
  assert.equal(data.plugins[0].source, 'local');
});

test('marketplace-writer: idempotent (re-running with same spec is true no-op)', async () => {
  const p = tmpFile('marketplace.json');
  const spec = { name: 'x', version: '0.1.0', description: 'd', author: { name: 'a' } };
  await mw.patch(p, spec);
  const before = fs.readFileSync(p, 'utf8');
  const r2 = await mw.patch(p, spec);
  const after = fs.readFileSync(p, 'utf8');
  assert.equal(r2.action, 'noop', 'unchanged spec must report noop, not update');
  assert.equal(before, after, 'no-op must produce identical content');
});

test('marketplace-writer: deep-merge preserves unknown keys', async () => {
  const p = tmpFile('marketplace.json');
  const spec = { name: 'x', version: '0.1.0', description: 'd', author: { name: 'a' } };
  await mw.patch(p, spec);

  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  data.plugins[0].futureField = 'preserved';
  data.plugins[0].nestedFuture = { keep: true };
  fs.writeFileSync(p, JSON.stringify(data, null, 2));

  await mw.patch(p, { ...spec, version: '0.2.0' });

  const reread = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(reread.plugins[0].version, '0.2.0');
  assert.equal(reread.plugins[0].futureField, 'preserved');
  assert.deepEqual(reread.plugins[0].nestedFuture, { keep: true });
});

test('marketplace-writer: github source when gitRemote given', async () => {
  const p = tmpFile('marketplace.json');
  const spec = { name: 'x', version: '0.1.0', description: 'd', author: { name: 'a' } };
  await mw.patch(p, spec, { gitRemote: 'owner/repo' });
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(data.plugins[0].source, 'github');
  assert.equal(data.plugins[0].repo, 'owner/repo');
});

test('marketplace-writer: atomic write creates .bak on update', async () => {
  const p = tmpFile('marketplace.json');
  const spec = { name: 'x', version: '0.1.0', description: 'd', author: { name: 'a' } };
  await mw.patch(p, spec);
  await mw.patch(p, { ...spec, version: '0.2.0' });
  assert.equal(fs.existsSync(p + '.bak'), true, '.bak should exist after update');
});

test('marketplace-writer: deepMerge unit', () => {
  const a = { x: 1, nested: { keep: true } };
  const b = { y: 2, nested: { add: 1 } };
  const merged = mw.deepMerge(a, b);
  assert.deepEqual(merged, { x: 1, y: 2, nested: { keep: true, add: 1 } });
});
