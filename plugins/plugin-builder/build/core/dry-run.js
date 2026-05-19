'use strict';

// Cross-platform dry-run runner. Replaces scripts/dry-run-{claude,codex}.sh so
// validator stages d/e don't depend on bash, jq, or POSIX coreutils, and so the
// SKIP vs FAIL contract is owned by a single decision tree.
//
// Each target supplies a small descriptor in TARGETS — adding a new dry-run
// target (e.g. cursor, gemini) is a single entry, not a parallel function copy.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SAFE_NAME = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const TIMEOUT_MS = 30000;

function commandExists(cmd) {
  const which = process.platform === 'win32' ? 'where' : 'sh';
  const args = process.platform === 'win32' ? [cmd] : ['-c', `command -v ${cmd}`];
  const r = spawnSync(which, args, { encoding: 'utf8' });
  return r.status === 0;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-' + crypto.randomBytes(6).toString('hex') + '-'));
}

// Recursive copy that REFUSES symlinks (matches renderer.js walk() behaviour).
// Prevents secret exfiltration via symlinks pointing outside the plugin tree
// — important because the staged copy is fed to an external CLI we don't
// fully control.
function copyTreeNoSymlinks(src, dst) {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    throw new Error(`symlink rejected in plugin tree: ${src}`);
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTreeNoSymlinks(path.join(src, entry), path.join(dst, entry));
    }
  } else if (st.isFile()) {
    fs.copyFileSync(src, dst);
  } else {
    throw new Error(`non-regular file rejected in plugin tree: ${src}`);
  }
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function skip(reason) { return { status: 'SKIP', reason }; }
function pass(extra) { return { status: 'PASS', ...extra }; }
function fail(reason) { return { status: 'FAIL', reason }; }

// Target descriptors. Each entry is a closed shape — the generic runDryRun
// uses only these fields. To add a new target, append a new entry; no other
// code in this file needs to change.
const TARGETS = Object.freeze({
  'claude-code': {
    cli: 'claude',
    manifestSubdir: '.claude-plugin',
    tmpPrefix: 'pb-dryrun-claude',
    // Build the command line + env. `staged` is the isolated copy of the plugin tree.
    buildInvocation(staged, tmpRoot, name) {
      const home = path.join(tmpRoot, 'home');
      fs.mkdirSync(home, { recursive: true });
      return {
        args: ['--plugin-dir', staged, '--print', '--output-format', 'json', '/plugins'],
        env: { ...process.env, HOME: home },
      };
    },
    // Interpret the JSON the CLI emits. Returns a result OR null to mean
    // "I don't know; fall through to the generic degraded-mode SKIP".
    interpretSuccess(stdout, name) {
      let out;
      try { out = JSON.parse(stdout); } catch { return fail('claude /plugins output not JSON'); }
      const plugins = Array.isArray(out?.plugins) ? out.plugins : null;
      if (plugins) {
        if (plugins.some(p => p?.name === name)) return pass({ plugin: name });
        return fail(`plugin ${name} not in /plugins output`);
      }
      const resultStr = typeof out?.result === 'string' ? out.result : '';
      if (/isn'?t available|not available/i.test(resultStr)) {
        return skip('claude --print does not surface plugin loader state in this environment');
      }
      return skip('claude --print returned no plugins[] field; cannot certify plugin load');
    },
    interpretFailure(/* r, stagedManifestExists */) {
      return null;
    },
  },

  'codex': {
    cli: 'codex',
    manifestSubdir: '.codex-plugin',
    tmpPrefix: 'pb-dryrun-codex',
    buildInvocation(staged, tmpRoot, name) {
      const codexHome = path.join(tmpRoot, 'codex-home');
      fs.mkdirSync(path.join(codexHome, 'plugins'), { recursive: true });
      // Codex resolves plugins from CODEX_HOME/plugins/<name>.
      const target = path.join(codexHome, 'plugins', name);
      // Re-stage into the codex-expected layout.
      copyTreeNoSymlinks(staged, target);
      return {
        args: ['plugin', 'list', '--json'],
        env: { ...process.env, CODEX_HOME: codexHome },
      };
    },
    interpretSuccess(stdout, name) {
      let out;
      try { out = JSON.parse(stdout); } catch { return fail('codex plugin list output not JSON'); }
      const list = Array.isArray(out) ? out : (Array.isArray(out?.plugins) ? out.plugins : []);
      if (list.some(p => p?.name === name)) return pass({ plugin: name });
      return fail(`plugin ${name} not in codex plugin list`);
    },
    // Older codex builds lack `plugin list --json`; treat that one specific
    // failure as SKIP, not FAIL, since the staging manifest itself loaded.
    interpretFailure(r, stagedManifestExists) {
      const stderr = (r.stderr || '') + (r.stdout || '');
      if (stagedManifestExists && /unknown|unrecognized|invalid/i.test(stderr)) {
        return skip(`codex plugin list --json unsupported (exit ${r.status}); manifest staging verified`);
      }
      return null;
    },
  },
});

function runDryRun(targetName, pluginDir) {
  const desc = TARGETS[targetName];
  if (!desc) return fail(`unknown dry-run target: ${targetName}`);

  if (!commandExists(desc.cli)) return skip(`${desc.cli} CLI not installed`);

  const manifestPath = path.join(pluginDir, desc.manifestSubdir, 'plugin.json');
  const manifest = readJsonSafe(manifestPath);
  if (!manifest) return fail(`${desc.manifestSubdir}/plugin.json missing or invalid`);
  const name = manifest.name;
  if (!name || typeof name !== 'string') return fail(`${desc.manifestSubdir}/plugin.json name missing`);
  if (!SAFE_NAME.test(name)) return fail(`plugin name unsafe (expected kebab-case): ${name}`);

  const tmp = mkTmp(desc.tmpPrefix);
  try {
    const staged = path.join(tmp, 'plugin');
    try { copyTreeNoSymlinks(pluginDir, staged); }
    catch (e) { return fail(`staging copy failed: ${e.message}`); }

    let invocation;
    try { invocation = desc.buildInvocation(staged, tmp, name); }
    catch (e) { return fail(`staging copy failed: ${e.message}`); }

    const r = spawnSync(desc.cli, invocation.args, {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: invocation.env,
    });

    if (r.signal === 'SIGTERM' || r.error?.code === 'ETIMEDOUT') {
      return fail(`dry-run timeout ${TIMEOUT_MS}ms`);
    }
    if (r.status === 0) {
      return desc.interpretSuccess(r.stdout, name);
    }
    if (r.status === 127) return skip(`${desc.cli} CLI not found at exec time`);

    // Per-target failure interpretation hook (e.g. codex degraded mode).
    const stagedManifestExists = fs.existsSync(path.join(staged, desc.manifestSubdir, 'plugin.json'));
    const degraded = desc.interpretFailure(r, stagedManifestExists);
    if (degraded) return degraded;

    const stderr = (r.stderr || '') + (r.stdout || '');
    return fail(`${desc.cli} CLI exit ${r.status ?? '?'}${stderr ? ': ' + stderr.trim().slice(0, 200) : ''}`);
  } finally {
    cleanup(tmp);
  }
}

const runClaude = (pluginDir) => runDryRun('claude-code', pluginDir);
const runCodex = (pluginDir) => runDryRun('codex', pluginDir);

module.exports = { runClaude, runCodex, runDryRun, commandExists, TARGETS };
