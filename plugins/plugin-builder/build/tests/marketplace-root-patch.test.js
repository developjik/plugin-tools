'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mw = require('../core/marketplace-writer.js');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pb-root-'));
}

const spec = {
  name: 'my-plugin', version: '0.1.0', description: 'd',
  author: { name: 'me' },
};

test('patchMarketplaceRoot: writes both files', async () => {
  const root = tmpRoot();
  const r = await mw.patchMarketplaceRoot(root, spec);
  assert.equal(r.name, 'my-plugin');
  const claude = JSON.parse(fs.readFileSync(path.join(root, mw.CLAUDE_MARKETPLACE_REL), 'utf8'));
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.equal(claude.plugins[0].name, 'my-plugin');
  assert.equal(codex.plugins[0].name, 'my-plugin');
  assert.equal(codex.plugins[0].policy.installation, 'AVAILABLE');
  assert.equal(codex.plugins[0].policy.authentication, 'ON_INSTALL');
});

test('patchMarketplaceRoot: idempotent re-run = noop', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, spec);
  const before = fs.readFileSync(path.join(root, mw.CLAUDE_MARKETPLACE_REL), 'utf8');
  const r2 = await mw.patchMarketplaceRoot(root, spec);
  const after = fs.readFileSync(path.join(root, mw.CLAUDE_MARKETPLACE_REL), 'utf8');
  assert.equal(r2.action, 'noop');
  assert.equal(before, after);
});

test('patchMarketplaceRoot: appends second plugin', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, spec);
  await mw.patchMarketplaceRoot(root, { ...spec, name: 'second' });
  const claude = JSON.parse(fs.readFileSync(path.join(root, mw.CLAUDE_MARKETPLACE_REL), 'utf8'));
  const codex = JSON.parse(fs.readFileSync(path.join(root, mw.CODEX_MARKETPLACE_REL), 'utf8'));
  assert.equal(claude.plugins.length, 2);
  assert.equal(codex.plugins.length, 2);
});

test('patchMarketplaceRoot: rollback on Codex write fail restores Claude', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, spec);
  const claudePath = path.join(root, mw.CLAUDE_MARKETPLACE_REL);
  const codexPath = path.join(root, mw.CODEX_MARKETPLACE_REL);
  const claudeBefore = fs.readFileSync(claudePath, 'utf8');

  // Make codex parse-fail by writing corrupt JSON.
  fs.writeFileSync(codexPath, '{not valid json');

  let threw = false;
  try {
    await mw.patchMarketplaceRoot(root, { ...spec, version: '0.2.0' });
  } catch (e) {
    threw = true;
    assert.match(e.message, /codex|parse/i);
  }
  // Parse error happens in buildCodexContent → before any write → Claude untouched naturally.
  // Verify Claude still pre-write state.
  const claudeAfter = fs.readFileSync(claudePath, 'utf8');
  assert.equal(claudeAfter, claudeBefore, 'Claude must be unchanged when Codex pre-validation fails');
  assert.equal(threw, true);
});

test('patchMarketplaceRoot: rollback on Codex atomicWrite fail', async () => {
  const root = tmpRoot();
  await mw.patchMarketplaceRoot(root, spec);
  const claudePath = path.join(root, mw.CLAUDE_MARKETPLACE_REL);
  const codexPath = path.join(root, mw.CODEX_MARKETPLACE_REL);
  const claudeBefore = fs.readFileSync(claudePath, 'utf8');

  // Block codex write by making its parent dir read-only.
  // Instead, monkey-patch fs.renameSync briefly to inject Codex write failure.
  const realRename = fs.renameSync;
  let injected = false;
  fs.renameSync = function (a, b) {
    // Only fail when promoting tmp into codex marketplace target.
    if (!injected && typeof b === 'string' && b.endsWith(path.join('.agents', 'plugins', 'marketplace.json'))) {
      injected = true;
      const err = new Error('injected codex rename fail');
      throw err;
    }
    return realRename.call(this, a, b);
  };
  let threw = false;
  try {
    await mw.patchMarketplaceRoot(root, { ...spec, version: '0.2.0' });
  } catch (e) {
    threw = true;
  } finally {
    fs.renameSync = realRename;
  }
  assert.equal(threw, true, 'must throw on injected Codex write fail');
  const claudeAfter = fs.readFileSync(claudePath, 'utf8');
  assert.equal(claudeAfter, claudeBefore, 'Claude must roll back to pre-transaction content');
});

test('detectStaleInPluginMarketplace: warns when stale file present', () => {
  const root = tmpRoot();
  const stale = path.join(root, 'p1', '.claude-plugin');
  fs.mkdirSync(stale, { recursive: true });
  fs.writeFileSync(path.join(stale, 'marketplace.json'), '{}');
  const msg = mw.detectStaleInPluginMarketplace(root, 'p1');
  assert.match(msg, /stale in-plugin marketplace/);
});

test('detectStaleInPluginMarketplace: null when absent', () => {
  const root = tmpRoot();
  assert.equal(mw.detectStaleInPluginMarketplace(root, 'p1'), null);
});
