'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mw = require('../core/marketplace-writer.js');
const me = require('../core/marketplace-entry.js');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pb-mc-'));
}

test('codex policy: defaults emitted when spec.codex absent', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, { name: 'p', version: '0.1.0', description: 'd' });
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.deepEqual(codex.plugins[0].policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
});

test('codex policy: spec.codex.policy passthrough verbatim', async () => {
  const root = tmpRoot();
  const spec = {
    name: 'p', version: '0.1.0', description: 'd',
    codex: { policy: { installation: 'INSTALLED_BY_DEFAULT', authentication: 'ON_INSTALL' } },
  };
  await mw.patchMarketplaceRoot(root, spec);
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.equal(codex.plugins[0].policy.installation, 'INSTALLED_BY_DEFAULT');
});

test('codex policy: NOT_AVAILABLE installation passthrough', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, {
    name: 'p', version: '0.1.0', description: 'd',
    codex: { policy: { installation: 'NOT_AVAILABLE' } },
  });
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.equal(codex.plugins[0].policy.installation, 'NOT_AVAILABLE');
  assert.equal(codex.plugins[0].policy.authentication, 'ON_INSTALL');
});

test('codex policy: authentication passthrough for future enum values', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, {
    name: 'p', version: '0.1.0', description: 'd',
    codex: { policy: { authentication: 'NEVER' } },
  });
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.equal(codex.plugins[0].policy.authentication, 'NEVER');
});

test('codexEntry: spec.author forward-compat passthrough', () => {
  const e = me.codexEntry({
    name: 'p', version: '0.1.0', description: 'd',
    author: { name: 'me', email: 'me@e' },
  });
  assert.deepEqual(e.author, { name: 'me', email: 'me@e' });
});

test('codex category: per-target override survives roundtrip', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, {
    name: 'p', version: '0.1.0', description: 'd',
    category: 'ai-tools',
    codex: { category: 'AITools' },
  });
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.equal(codex.plugins[0].category, 'AITools');
});
