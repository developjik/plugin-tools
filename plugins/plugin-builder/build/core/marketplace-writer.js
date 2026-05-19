'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lockfile = require('./lockfile.js');
const log = require('./log.js');
const me = require('./marketplace-entry.js');

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const CLAUDE_MARKETPLACE_REL = '.claude-plugin/marketplace.json';
const CODEX_MARKETPLACE_REL = '.agents/plugins/marketplace.json';

function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])
        && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      target[k] = deepMerge({ ...target[k] }, source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

// Back-compat alias used by external callers.
function defaultEntry(spec, opts = {}) {
  return me.claudeEntry(spec, opts);
}

function buildClaudeContent(marketplacePath, spec, opts) {
  let data;
  if (fs.existsSync(marketplacePath)) {
    try {
      data = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    } catch (e) {
      throw new Error(`marketplace.json parse error: ${e.message}`);
    }
  } else {
    data = {
      name: opts.marketplaceName || `${spec.name}-marketplace`,
      owner: me.normalizeOwner(spec.author),
      plugins: [],
    };
  }
  if (!Array.isArray(data.plugins)) {
    throw new Error('marketplace.plugins[] must be an array');
  }

  const newEntry = me.claudeEntry(spec, opts);
  const idx = data.plugins.findIndex(p => p && p.name === spec.name);
  if (idx === -1) data.plugins.push(newEntry);
  else data.plugins[idx] = deepMerge({ ...data.plugins[idx] }, newEntry);

  const seen = new Set();
  for (const p of data.plugins) {
    if (seen.has(p.name)) throw new Error(`duplicate plugin in marketplace: ${p.name}`);
    seen.add(p.name);
  }
  return { data, action: idx === -1 ? 'append' : 'update', content: JSON.stringify(data, null, 2) + '\n' };
}

function buildCodexContent(marketplacePath, spec, opts) {
  let data;
  if (fs.existsSync(marketplacePath)) {
    try {
      data = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    } catch (e) {
      throw new Error(`codex marketplace.json parse error: ${e.message}`);
    }
  } else {
    data = me.buildCodexRoot({
      name: opts.marketplaceName || `${spec.name}-marketplace`,
      displayName: opts.displayName,
    });
  }
  if (!Array.isArray(data.plugins)) {
    throw new Error('codex marketplace.plugins[] must be an array');
  }

  const newEntry = me.codexEntry(spec, opts);
  const idx = data.plugins.findIndex(p => p && p.name === spec.name);
  if (idx === -1) data.plugins.push(newEntry);
  else data.plugins[idx] = deepMerge({ ...data.plugins[idx] }, newEntry);

  const seen = new Set();
  for (const p of data.plugins) {
    if (seen.has(p.name)) throw new Error(`duplicate plugin in codex marketplace: ${p.name}`);
    seen.add(p.name);
  }
  return { data, action: idx === -1 ? 'append' : 'update', content: JSON.stringify(data, null, 2) + '\n' };
}

async function patchClaude(marketplacePath, spec, opts = {}) {
  const release = await lockfile.acquire(marketplacePath, { retries: opts.retries ?? 3 });
  try {
    const built = buildClaudeContent(marketplacePath, spec, opts);
    let currentContent = '';
    try {
      if (fs.existsSync(marketplacePath)) currentContent = fs.readFileSync(marketplacePath, 'utf8');
    } catch {}
    if (currentContent === built.content) {
      return { action: 'noop', name: spec.name };
    }
    atomicWrite(marketplacePath, built.content);
    return { action: built.action, name: spec.name };
  } finally {
    release.release();
  }
}

async function patchCodex(marketplacePath, spec, opts = {}) {
  const release = await lockfile.acquire(marketplacePath, { retries: opts.retries ?? 3 });
  try {
    const built = buildCodexContent(marketplacePath, spec, opts);
    let currentContent = '';
    try {
      if (fs.existsSync(marketplacePath)) currentContent = fs.readFileSync(marketplacePath, 'utf8');
    } catch {}
    if (currentContent === built.content) {
      return { action: 'noop', name: spec.name };
    }
    atomicWrite(marketplacePath, built.content);
    return { action: built.action, name: spec.name };
  } finally {
    release.release();
  }
}

// Back-compat: v0.5 callers used `patch(<claude-marketplace>, spec, opts)`.
async function patch(marketplacePath, spec, opts = {}) {
  return patchClaude(marketplacePath, spec, opts);
}

// Sequential single-lock transaction across both marketplaces. See PLAN-v0.6 §5.1.
// Build both contents in memory → write Claude (lock, atomicWrite, release) →
// write Codex (lock, atomicWrite, release). On Codex write failure, re-acquire
// Claude and restore from .bak. At most one lock alive at any moment.
async function patchMarketplaceRoot(rootDir, spec, opts = {}) {
  const claudePath = path.join(rootDir, CLAUDE_MARKETPLACE_REL);
  const codexPath = path.join(rootDir, CODEX_MARKETPLACE_REL);

  // Both catalogs keep source.path relative to the marketplace root.
  const codexOpts = { ...opts };
  if (!codexOpts.gitRemote && !codexOpts.codexLocalPath) {
    codexOpts.localPath = `./${spec.name}`;
  }
  const claudeOpts = { ...opts };
  if (!claudeOpts.gitRemote) {
    claudeOpts.localPath = opts.localPath || `./${spec.name}`;
  }

  // Build & validate both in memory (no IO yet beyond reads).
  const claudeBuilt = buildClaudeContent(claudePath, spec, claudeOpts);
  const codexBuilt = buildCodexContent(codexPath, spec, codexOpts);

  const claudeBefore = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8') : '';
  const codexBefore = fs.existsSync(codexPath) ? fs.readFileSync(codexPath, 'utf8') : '';
  const claudeNoop = claudeBefore === claudeBuilt.content;
  const codexNoop = codexBefore === codexBuilt.content;
  if (claudeNoop && codexNoop) {
    return { action: 'noop', name: spec.name, claude: { action: 'noop' }, codex: { action: 'noop' } };
  }

  let claudeResult = { action: 'noop' };
  if (!claudeNoop) {
    fs.mkdirSync(path.dirname(claudePath), { recursive: true });
    const release = await lockfile.acquire(claudePath, { retries: opts.retries ?? 3 });
    try {
      atomicWrite(claudePath, claudeBuilt.content);
      claudeResult = { action: claudeBuilt.action };
    } finally {
      release.release();
    }
  }

  let codexResult = { action: 'noop' };
  if (!codexNoop) {
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    const release = await lockfile.acquire(codexPath, { retries: opts.retries ?? 3 });
    try {
      atomicWrite(codexPath, codexBuilt.content);
      codexResult = { action: codexBuilt.action };
    } catch (e) {
      try { release.release(); } catch {}
      // Rollback Claude. Use `.bak` if write happened; else restore prior content.
      await rollbackClaude(claudePath, claudeBefore, opts);
      const err = new Error(`codex marketplace write failed: ${e.message}`);
      err.code = 'ECODEX_WRITE';
      err.cause = e;
      throw err;
    }
    release.release();
  }

  return { action: 'append', name: spec.name, claude: claudeResult, codex: codexResult };
}

async function rollbackClaude(claudePath, claudeBefore, opts) {
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  const release = await lockfile.acquire(claudePath, { retries: opts.retries ?? 3 });
  try {
    if (claudeBefore === '') {
      try { fs.unlinkSync(claudePath); } catch {}
    } else {
      atomicWrite(claudePath, claudeBefore);
    }
  } finally {
    release.release();
  }
}

function atomicWrite(target, content) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } catch (e) {
    if (fd != null) { try { fs.closeSync(fd); } catch {} fd = null; }
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }

  const bak = target + '.bak';
  const bakPrev = target + '.bak.prev';
  let movedPriorBak = false;
  let backupCreated = false;

  if (fs.existsSync(bak)) {
    try { fs.renameSync(bak, bakPrev); movedPriorBak = true; } catch {}
  }

  if (fs.existsSync(target)) {
    fs.renameSync(target, bak);
    backupCreated = true;
  }

  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    if (backupCreated) {
      try { fs.renameSync(bak, target); } catch {}
    }
    if (movedPriorBak) {
      try { fs.renameSync(bakPrev, bak); } catch {}
    }
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }

  if (movedPriorBak) {
    try { fs.unlinkSync(bakPrev); } catch {}
  }

  try {
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } catch {}
    fs.closeSync(dfd);
  } catch {}
}

// Stale in-plugin marketplace.json detection. Returns warning string when
// a marketplace catalog is found inside <root>/<name>/ instead of at the root.
function detectStaleInPluginMarketplace(rootDir, name) {
  const stale = path.join(rootDir, name, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(stale)) {
    return `stale in-plugin marketplace.json detected at ${stale}; the marketplace catalog lives only at <root>/.claude-plugin/marketplace.json. Delete the in-plugin file to silence this warning.`;
  }
  return null;
}

module.exports = {
  patch,
  patchClaude,
  patchCodex,
  patchMarketplaceRoot,
  defaultEntry,
  deepMerge,
  atomicWrite,
  detectStaleInPluginMarketplace,
  CLAUDE_MARKETPLACE_REL,
  CODEX_MARKETPLACE_REL,
};
