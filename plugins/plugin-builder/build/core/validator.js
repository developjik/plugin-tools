'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ir = require('./ir.js');
const dryRun = require('./dry-run.js');

const STAGES = ['a', 'b', 'c', 'd', 'e', 'f'];

const NATIVE_MANIFESTS = Object.freeze([
  { target: 'claude-code', rel: path.join('.claude-plugin', 'plugin.json') },
  { target: 'codex', rel: path.join('.codex-plugin', 'plugin.json') },
  { target: 'cursor', rel: path.join('.cursor-plugin', 'plugin.json') },
]);

function runAll(pluginDir, opts = {}) {
  const strict = opts.strict === true;
  const results = [];

  let spec = null;
  if (opts.spec) {
    spec = opts.spec;
  } else {
    try {
      spec = inferSpecFromPluginDir(pluginDir);
    } catch (e) {
      return {
        ok: false,
        strict,
        failed: 1,
        skipped: 0,
        results: [{ stage: 'a', name: 'Manifest schema', status: 'FAIL', reason: e.message }],
      };
    }
  }

  results.push(stageA(spec, opts.spec));
  results.push(stageB(pluginDir, opts.spec));
  results.push(stageC(pluginDir, opts.spec));
  results.push(stageD(pluginDir, opts.spec));
  results.push(stageE(pluginDir, opts.spec));
  results.push(stageF(pluginDir, spec));

  const failed = results.filter(r => r.status === 'FAIL');
  const skipped = results.filter(r => r.status === 'SKIP');
  let ok = failed.length === 0;
  if (strict && skipped.length) ok = false;

  return { ok, results, strict, failed: failed.length, skipped: skipped.length };
}

function inferSpecFromPluginDir(pluginDir) {
  const found = [];
  for (const m of NATIVE_MANIFESTS) {
    const file = path.join(pluginDir, m.rel);
    if (!fs.existsSync(file)) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`${file}: invalid JSON — ${e.message}`);
    }
    found.push({ target: m.target, data });
  }
  if (!found.length) return null;

  const spec = { ...found[0].data };
  for (const { data } of found.slice(1)) {
    for (const key of ['name', 'version', 'description', 'author', 'license', 'category', 'homepage', 'repository', 'keywords']) {
      if (spec[key] == null && data[key] != null) spec[key] = data[key];
    }
  }
  spec.targets = found.map(x => x.target);
  return spec;
}

const SAFE_NAME = /^[a-z][a-z0-9-]*[a-z0-9]$/;

function stageA(spec, fullSpec) {
  const s = fullSpec || spec;
  if (!s) return { stage: 'a', name: 'Manifest schema', status: 'FAIL', reason: 'no manifest or spec to validate' };
  // Always validate name pattern (defends against path-traversal via dry-run scripts).
  if (s.name != null && (typeof s.name !== 'string' || !SAFE_NAME.test(s.name))) {
    return { stage: 'a', name: 'Manifest schema', status: 'FAIL', reason: `name: must be kebab-case starting with a letter (e.g. 'my-plugin'); got '${s.name}'` };
  }
  if (!s.specVersion && !fullSpec) {
    return { stage: 'a', name: 'Manifest schema', status: 'SKIP', reason: 'native manifest has no specVersion; IR schema not applicable (name pattern checked)' };
  }
  const v = ir.validate(s);
  if (v.ok) return { stage: 'a', name: 'Manifest schema', status: 'PASS' };
  return { stage: 'a', name: 'Manifest schema', status: 'FAIL', reason: v.errors.join('; ') };
}

function stageB(pluginDir, spec) {
  if (!spec) return { stage: 'b', name: 'File structure', status: 'SKIP', reason: 'no spec provided' };
  const missing = [];
  for (const c of spec.commands || []) {
    if (spec.targets?.includes('claude-code') && !fs.existsSync(path.join(pluginDir, 'commands', `${c.name}.md`))) {
      missing.push(`commands/${c.name}.md`);
    }
  }
  for (const s of spec.skills || []) {
    if (!fs.existsSync(path.join(pluginDir, 'skills', s.name, 'SKILL.md'))) {
      missing.push(`skills/${s.name}/SKILL.md`);
    }
  }
  if (missing.length) return { stage: 'b', name: 'File structure', status: 'FAIL', reason: `missing: ${missing.join(', ')}` };
  return { stage: 'b', name: 'File structure', status: 'PASS' };
}

function stageC(pluginDir, spec) {
  if (!spec) return { stage: 'c', name: 'Cross-reference', status: 'SKIP', reason: 'no spec' };
  const errs = [];

  if (spec.targets?.includes('claude-code')) {
    const cmdsDir = path.join(pluginDir, 'commands');
    if (fs.existsSync(cmdsDir)) {
      const onDisk = fs.readdirSync(cmdsDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
      const declared = new Set((spec.commands || []).map(c => c.name));
      for (const f of onDisk) if (!declared.has(f)) errs.push(`orphan file: commands/${f}.md`);
      for (const d of declared) if (!onDisk.includes(d)) errs.push(`orphan manifest entry: commands[${d}]`);
    }
  }

  const skillsDir = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const onDisk = fs.readdirSync(skillsDir).filter(f => {
      try { return fs.statSync(path.join(skillsDir, f)).isDirectory(); } catch { return false; }
    });
    const declared = new Set((spec.skills || []).map(s => s.name));
    for (const f of onDisk) if (!declared.has(f)) errs.push(`orphan dir: skills/${f}`);
    for (const d of declared) if (!onDisk.includes(d)) errs.push(`orphan manifest entry: skills[${d}]`);
  }

  if (errs.length) return { stage: 'c', name: 'Cross-reference', status: 'FAIL', reason: errs.join('; ') };
  return { stage: 'c', name: 'Cross-reference', status: 'PASS' };
}

function targetEnabled(spec, pluginDir, target, manifestSubdir) {
  // Explicit spec targets take precedence.
  if (spec && Array.isArray(spec.targets)) {
    return spec.targets.includes(target);
  }
  // No spec — infer from on-disk manifest presence.
  return fs.existsSync(path.join(pluginDir, manifestSubdir, 'plugin.json'));
}

function stageD(pluginDir, spec) {
  if (!targetEnabled(spec, pluginDir, 'claude-code', '.claude-plugin')) {
    return { stage: 'd', name: 'Claude dry-run', status: 'SKIP', reason: 'target claude-code not enabled' };
  }
  const r = dryRun.runClaude(pluginDir);
  return { stage: 'd', name: 'Claude dry-run', status: r.status, reason: r.reason };
}

function stageE(pluginDir, spec) {
  if (!targetEnabled(spec, pluginDir, 'codex', '.codex-plugin')) {
    return { stage: 'e', name: 'Codex dry-run', status: 'SKIP', reason: 'target codex not enabled' };
  }
  const r = dryRun.runCodex(pluginDir);
  return { stage: 'e', name: 'Codex dry-run', status: r.status, reason: r.reason };
}

function stageF(pluginDir, spec) {
  const marketplaceRoot = findMarketplaceRoot(pluginDir);
  if (!marketplaceRoot) return { stage: 'f', name: 'Marketplace', status: 'SKIP', reason: 'no marketplace.json' };

  const catalogs = [
    { target: 'claude-code', label: 'Claude', mp: path.join(marketplaceRoot, '.claude-plugin', 'marketplace.json'), validate: validateClaudeMarketplace },
    { target: 'codex', label: 'Codex', mp: path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'), validate: validateCodexMarketplace },
    { target: 'cursor', label: 'Cursor', mp: path.join(marketplaceRoot, '.cursor-plugin', 'marketplace.json'), validate: validateCursorMarketplace },
  ];
  const requiredTargets = spec && Array.isArray(spec.targets) ? new Set(spec.targets) : null;
  const paths = [];
  const errors = [];
  for (const c of catalogs) {
    const required = requiredTargets ? requiredTargets.has(c.target) : false;
    const exists = fs.existsSync(c.mp);
    if (required && !exists) {
      errors.push(`${c.label}: missing marketplace catalog at ${c.mp}`);
    }
    if (exists) {
      paths.push([c.label, c.mp, c.validate, required ? spec.name : null]);
    }
  }
  if (paths.length === 0 && errors.length === 0) {
    return { stage: 'f', name: 'Marketplace', status: 'SKIP', reason: 'no marketplace.json' };
  }

  for (const [label, mp, validate, expectedName] of paths) {
    const err = validate(mp, expectedName);
    if (err) errors.push(`${label}: ${err}`);
  }
  if (errors.length) return { stage: 'f', name: 'Marketplace', status: 'FAIL', reason: errors.join('; ') };
  return { stage: 'f', name: 'Marketplace', status: 'PASS' };
}

function findMarketplaceRoot(pluginDir) {
  const candidates = [pluginDir, path.dirname(path.resolve(pluginDir))];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, '.claude-plugin', 'marketplace.json')) ||
      fs.existsSync(path.join(dir, '.agents', 'plugins', 'marketplace.json')) ||
      fs.existsSync(path.join(dir, '.cursor-plugin', 'marketplace.json'))
    ) {
      return dir;
    }
  }
  return null;
}

function readMarketplace(mp) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(mp, 'utf8'));
  } catch (e) {
    return { error: `parse error: ${e.message}` };
  }
  return { data };
}

function validateClaudeMarketplace(mp, expectedName = null) {
  const r = readMarketplace(mp);
  if (r.error) return r.error;
  const data = r.data;
  if (!data.name) return 'marketplace.name required';
  if (!data.owner) return 'marketplace.owner required';
  if (!Array.isArray(data.plugins)) return 'marketplace.plugins[] required';
  const seen = new Set();
  for (const p of data.plugins) {
    if (!p.name) return 'plugin entry missing name';
    if (seen.has(p.name)) return `duplicate plugin: ${p.name}`;
    seen.add(p.name);
    if (!p.source && !p.path) return `plugin ${p.name}: source or path required`;
  }
  if (expectedName && !seen.has(expectedName)) return `plugin entry missing: ${expectedName}`;
  return null;
}

function validateCursorMarketplace(mp, expectedName = null) {
  const r = readMarketplace(mp);
  if (r.error) return r.error;
  const data = r.data;
  if (!data.name) return 'marketplace.name required';
  if (!data.owner) return 'marketplace.owner required';
  if (!Array.isArray(data.plugins)) return 'marketplace.plugins[] required';
  const seen = new Set();
  for (const p of data.plugins) {
    if (!p.name) return 'plugin entry missing name';
    if (seen.has(p.name)) return `duplicate plugin: ${p.name}`;
    seen.add(p.name);
    if (!p.source && !p.path) return `plugin ${p.name}: source or path required`;
  }
  if (expectedName && !seen.has(expectedName)) return `plugin entry missing: ${expectedName}`;
  return null;
}

function validateCodexMarketplace(mp, expectedName = null) {
  const r = readMarketplace(mp);
  if (r.error) return r.error;
  const data = r.data;
  if (!data.name) return 'marketplace.name required';
  if (!Array.isArray(data.plugins)) return 'marketplace.plugins[] required';
  const seen = new Set();
  for (const p of data.plugins) {
    if (!p.name) return 'plugin entry missing name';
    if (seen.has(p.name)) return `duplicate plugin: ${p.name}`;
    seen.add(p.name);
    if (!p.source && !p.path) return `plugin ${p.name}: source or path required`;
    if (p.source && typeof p.source === 'object' && !p.source.source) {
      return `plugin ${p.name}: source.source required`;
    }
    if (p.source && typeof p.source === 'object' && p.source.source === 'local' && !p.source.path) {
      return `plugin ${p.name}: source.path required`;
    }
    if (p.source && typeof p.source === 'object' && p.source.source === 'github' && !p.source.repo) {
      return `plugin ${p.name}: source.repo required`;
    }
  }
  if (expectedName && !seen.has(expectedName)) return `plugin entry missing: ${expectedName}`;
  return null;
}

module.exports = { runAll, STAGES };
