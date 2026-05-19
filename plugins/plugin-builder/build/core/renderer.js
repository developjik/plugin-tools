'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const log = require('./log.js');

function render(template, vars) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const parts = key.split('.');
    let cur = vars;
    for (const p of parts) {
      if (cur == null) return '';
      cur = cur[p];
    }
    if (cur == null) return '';
    if (typeof cur === 'object') return JSON.stringify(cur, null, 2);
    return String(cur);
  });
}

function loadTemplate(tplPath) {
  return fs.readFileSync(tplPath, 'utf8');
}

function assertSafeRelative(baseDir, rel, label) {
  if (path.isAbsolute(rel)) {
    throw new Error(`${label}: absolute path not allowed: ${rel}`);
  }
  const resolved = path.resolve(baseDir, rel);
  const baseResolved = path.resolve(baseDir);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`${label}: path traversal blocked: ${rel}`);
  }
  return resolved;
}

function stageWrite(files, opts = {}) {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-stage-' + crypto.randomBytes(6).toString('hex') + '-'));
  log.debug('renderer: staging to', { stageDir });
  try {
    for (const f of files) {
      const target = assertSafeRelative(stageDir, f.path, 'stageWrite');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content, { mode: f.mode ?? 0o644 });
    }
    return stageDir;
  } catch (e) {
    fs.rmSync(stageDir, { recursive: true, force: true });
    throw e;
  }
}

function promote(stageDir, targetDir, opts = {}) {
  const allowPartial = opts.allowPartial === true;
  fs.mkdirSync(targetDir, { recursive: true });
  // Two-phase: (1) backup any existing target file to <dest>.pb-bak, (2) copy stage→target.
  // On failure: restore from .pb-bak and unlink newly-created files. Clean up .pb-bak on success.
  const actions = []; // { dest, hadExisting, bak }
  try {
    walk(stageDir, (rel, abs) => {
      const dest = assertSafeRelative(targetDir, rel, 'promote');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const hadExisting = fs.existsSync(dest);
      let bak = null;
      if (hadExisting) {
        bak = `${dest}.pb-bak.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
        fs.renameSync(dest, bak);
      }
      try {
        fs.copyFileSync(abs, dest);
      } catch (e) {
        // copy failed — restore backup before recording action
        if (bak) { try { fs.renameSync(bak, dest); } catch {} }
        throw e;
      }
      actions.push({ dest, hadExisting, bak });
    });
  } catch (e) {
    if (!allowPartial) {
      // Roll back in reverse order.
      for (let i = actions.length - 1; i >= 0; i--) {
        const a = actions[i];
        try { fs.unlinkSync(a.dest); } catch {}
        if (a.hadExisting && a.bak) {
          try { fs.renameSync(a.bak, a.dest); } catch {}
        }
      }
    }
    throw e;
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  // Success — discard backups.
  for (const a of actions) {
    if (a.bak) { try { fs.unlinkSync(a.bak); } catch {} }
  }
  return actions.map(a => a.dest);
}

function walk(dir, fn, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const lst = fs.lstatSync(abs);
    if (lst.isSymbolicLink()) {
      throw new Error(`renderer: symlink rejected in staged tree: ${abs}`);
    }
    if (entry.isDirectory()) walk(abs, fn, base);
    else fn(path.relative(base, abs), abs);
  }
}

module.exports = { render, loadTemplate, stageWrite, promote, assertSafeRelative };
