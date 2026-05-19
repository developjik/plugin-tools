'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ir = require('./ir.js');
const renderer = require('./renderer.js');
const registry = require('../adapters/registry.js');
const validator = require('./validator.js');
const marketplaceWriter = require('./marketplace-writer.js');
const me = require('./marketplace-entry.js');
const log = require('./log.js');
const { execSync } = require('node:child_process');

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file}: invalid JSON — ${e.message}`);
  }
}

const USAGE = `plugin-builder <command> [options]

Commands:
  scaffold --spec <file> [--out <root>] [--no-publish]
                                              Render UnifiedSpec under
                                              <root>/<spec.name>/ as a hybrid
                                              plugin tree and auto-publish to
                                              both marketplace catalogs at
                                              <root>/. Default <root> = cwd.
  validate <plugin-dir> [--spec <file>] [--strict]
                                              Run 6-stage validation.
  publish <plugin-dir> [--git-remote <repo>]
                                              Patch both Claude + Codex
                                              marketplace catalogs at the
                                              parent <root>/ of <plugin-dir>.
  marketplace init <root> [--name <id>] [--display-name <human>]
                          [--owner-name <name>] [--owner-email <email>] [--force]
                                              Create a new marketplace root
                                              with both Claude and Codex
                                              marketplace.json files.
  version                                     Print version
  help                                        Show this message
`;

const FLAGS = Object.freeze({
  'strict':           { kind: 'boolean' },
  'verbose':          { kind: 'boolean', short: 'V' },
  'quiet':            { kind: 'boolean', short: 'q' },
  'help':             { kind: 'boolean', short: 'h' },
  'version':          { kind: 'boolean', short: 'v' },
  'force':            { kind: 'boolean' },
  'no-publish':       { kind: 'boolean' },
  'spec':             { kind: 'value',   short: 's' },
  'out':              { kind: 'value',   short: 'o' },
  'git-remote':       { kind: 'value' },
  'name':             { kind: 'value' },
  'display-name':     { kind: 'value' },
  'owner-name':       { kind: 'value' },
  'owner-email':      { kind: 'value' },
});
const BOOLEAN_FLAGS = new Set(Object.entries(FLAGS).filter(([, m]) => m.kind === 'boolean').map(([k]) => k));
const VALUE_FLAGS = new Set(Object.entries(FLAGS).filter(([, m]) => m.kind === 'value').map(([k]) => k));
const SHORT_ALIASES = Object.fromEntries(
  Object.entries(FLAGS).filter(([, m]) => m.short).map(([k, m]) => [m.short, k])
);

function parseArgs(argv, opts = {}) {
  const args = { _: [], opts: {} };
  const strict = opts.strict !== false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--') {
      for (let j = i + 1; j < argv.length; j++) args._.push(argv[j]);
      break;
    }

    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      let key, inlineValue;
      if (eq >= 0) {
        key = body.slice(0, eq);
        inlineValue = body.slice(eq + 1);
      } else {
        key = body;
        inlineValue = undefined;
      }
      if (key.length === 0) {
        if (strict) throw new Error(`malformed flag: '${a}'`);
        continue;
      }
      if (strict && !BOOLEAN_FLAGS.has(key) && !VALUE_FLAGS.has(key)) {
        throw new Error(`unknown flag: --${key}`);
      }
      if (BOOLEAN_FLAGS.has(key)) {
        if (inlineValue !== undefined) {
          if (inlineValue === 'true' || inlineValue === '1') args.opts[key] = true;
          else if (inlineValue === 'false' || inlineValue === '0') args.opts[key] = false;
          else throw new Error(`flag --${key} is boolean; got '--${key}=${inlineValue}'`);
        } else {
          args.opts[key] = true;
        }
        continue;
      }
      if (inlineValue !== undefined) {
        args.opts[key] = inlineValue;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next === '--') {
        throw new Error(`flag --${key} requires a value`);
      }
      args.opts[key] = next;
      i++;
      continue;
    }

    if (a.startsWith('-') && a.length > 1 && a !== '-') {
      const shortBody = a.slice(1);
      const wholeLong = SHORT_ALIASES[shortBody];
      if (wholeLong) {
        if (BOOLEAN_FLAGS.has(wholeLong)) {
          args.opts[wholeLong] = true;
          continue;
        }
        const next = argv[i + 1];
        if (next === undefined) throw new Error(`flag -${shortBody} (--${wholeLong}) requires a value`);
        args.opts[wholeLong] = next;
        i++;
        continue;
      }

      const chars = shortBody.split('');
      const longs = chars.map(c => SHORT_ALIASES[c]);
      const allKnownBool = longs.every(l => l && BOOLEAN_FLAGS.has(l));
      if (allKnownBool) {
        for (const l of longs) args.opts[l] = true;
        continue;
      }

      if (strict) throw new Error(`unknown short flag: -${shortBody}`);
      args._.push(a);
      continue;
    }

    args._.push(a);
  }
  return args;
}

// Nested subcommand dispatch. Top-level commands stay in the main switch;
// commands with subsubcommands (e.g. `marketplace init`) live here.
const SUBCOMMANDS = Object.freeze({
  marketplace: {
    init: cmdMarketplaceInit,
  },
});

async function main(argv) {
  const args = parseArgs(argv);
  if (args.opts.verbose) log.setLevel('debug');
  if (args.opts.quiet) log.setLevel('warn');

  const cmd = args._[0];

  try {
    if (SUBCOMMANDS[cmd]) {
      const sub = args._[1];
      const handler = SUBCOMMANDS[cmd][sub];
      if (!handler) {
        const known = Object.keys(SUBCOMMANDS[cmd]).join('|');
        throw new Error(`unknown ${cmd} subcommand: ${sub || '(none)'} (expected ${known})`);
      }
      return await handler(args);
    }

    switch (cmd) {
      case 'scaffold':
        return await cmdScaffold(args);
      case 'validate':
        return await cmdValidate(args);
      case 'publish':
        return await cmdPublish(args);
      case 'version':
      case '--version':
      case '-v':
        process.stdout.write(require('../../package.json').version + '\n');
        return 0;
      case 'help':
      case undefined:
      case '--help':
      case '-h':
        process.stdout.write(USAGE);
        return 0;
      default:
        process.stderr.write(`unknown command: ${cmd}\n${USAGE}`);
        process.exit(2);
    }
  } catch (e) {
    log.error(e.message);
    if (args.opts.verbose) process.stderr.write((e.stack || '') + '\n');
    process.exit(1);
  }
}

// Hybrid scaffold — both manifests inside one plugin tree, shared skills/mcp,
// per-target hooks files under shared hooks/ dir, manifest `hooks` field points
// at its target's file.
function renderHybrid(spec, out) {
  const files = [];
  const warnings = [];
  const seenPaths = new Map(); // path → owner target (for dedup detection)

  for (const t of spec.targets) {
    const adapter = registry.get(t);
    const r = adapter.render(spec);
    warnings.push(...r.warnings.map(w => `[${t}] ${w}`));
    for (const f of r.files) {
      let outFile = { ...f };

      // Rewrite hooks file path to target-specific name under shared hooks/.
      if (f.path === 'hooks/hooks.json') {
        if (t === 'claude-code') outFile.path = 'hooks/claude.json';
        else if (t === 'codex') outFile.path = 'hooks/codex.json';
        else if (t === 'cursor') outFile.path = 'hooks/cursor.json';
        else outFile.path = `hooks/${t}.json`;
      }

      // Rewrite manifest hooks field to point at the per-target file.
      if (f.path === '.claude-plugin/plugin.json') {
        outFile.content = rewriteManifestHooksField(f.content, './hooks/claude.json');
      }
      if (f.path === '.codex-plugin/plugin.json') {
        outFile.content = rewriteManifestHooksField(f.content, './hooks/codex.json');
      }
      if (f.path === '.cursor-plugin/plugin.json') {
        outFile.content = rewriteManifestHooksField(f.content, './hooks/cursor.json');
      }

      // README.md: Claude emits first; Codex overwrites with its variant (shared file).
      // Identical-content dedup is silent; differing-content overlap is intentional in hybrid:
      // Codex variant wins so install instructions match the multi-target spec.
      if (seenPaths.has(outFile.path)) {
        const prevIdx = files.findIndex(x => x.path === outFile.path);
        if (prevIdx >= 0) {
          if (files[prevIdx].content !== outFile.content) {
            // README.md, .mcp.json — Codex wins. Skills SKILL.md — Codex variant
            // is intentionally chosen (carries folded commands + tool union).
            files[prevIdx] = outFile;
          }
          continue;
        }
      }
      seenPaths.set(outFile.path, t);
      files.push(outFile);
    }
  }

  const stage = renderer.stageWrite(files);
  const written = renderer.promote(stage, out);
  return { written, warnings, extra: { outDirs: [out] } };
}

function rewriteManifestHooksField(json, hooksPath) {
  let m;
  try { m = JSON.parse(json); } catch { return json; }
  if (m.hooks != null) m.hooks = hooksPath;
  return JSON.stringify(m, null, 2) + '\n';
}

async function cmdScaffold(args) {
  const specFile = args.opts.spec;
  if (!specFile) throw new Error('--spec <file> required');
  const noPublish = !!args.opts['no-publish'];

  const raw = readJson(specFile);
  const v = ir.validate(raw);
  if (!v.ok) throw new Error('spec invalid: ' + v.errors.join('; '));
  if (v.warnings && v.warnings.length) {
    for (const w of v.warnings) log.warn(`spec: ${w}`);
  }
  const spec = ir.normalize(raw);

  const root = args.opts.out || '.';
  const out = path.join(root, spec.name);

  const { written, warnings, extra } = renderHybrid(spec, out);

  // Surface category hint-miss for marketplace consumers.
  const hintMiss = me.categoryHintMiss(spec.category, raw);
  if (hintMiss) {
    warnings.push(`[category] '${hintMiss.raw}' not in CATEGORY_HINT — emitting verbatim for Claude and '${hintMiss.codexFallback}' (PascalCase fallback) for Codex. Consider setting spec.claude.category / spec.codex.category explicitly.`);
  }

  const result = {
    status: 'OK',
    targets: spec.targets,
    root: path.resolve(root),
    ...extra,
    files: written.length,
    warnings,
  };

  if (!noPublish) {
    const publishResult = await marketplaceWriter.patchMarketplaceRoot(
      path.resolve(root),
      raw, // pass raw spec to preserve claude/codex per-target overrides
      {
        gitRemote: args.opts['git-remote'] || null,
      }
    );
    result.publish = publishResult;
    const stale = marketplaceWriter.detectStaleInPluginMarketplace(
      path.resolve(root), spec.name);
    if (stale) warnings.push(stale);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}

async function cmdValidate(args) {
  const dir = args._[1];
  if (!dir) throw new Error('plugin-dir required');
  let spec = null;
  if (args.opts.spec) {
    spec = readJson(args.opts.spec);
  }
  const out = validator.runAll(dir, { spec, strict: !!args.opts.strict });
  process.stdout.write(formatReport(out) + '\n');
  process.exit(out.ok ? 0 : 1);
}

function formatReport(out) {
  const lines = [];
  lines.push('================ Plugin Builder Report ================');
  for (const r of out.results) {
    const tag = r.status.padEnd(4);
    const reason = r.reason ? ` — ${r.reason}` : '';
    lines.push(`  (${r.stage}) ${r.name.padEnd(20)} ${tag}${reason}`);
  }
  lines.push('-------------------------------------------------------');
  lines.push(`Result: ${out.ok ? 'PASS' : 'FAIL'} (failed=${out.failed}, skipped=${out.skipped}, strict=${out.strict})`);
  lines.push('=======================================================');
  return lines.join('\n');
}

async function cmdPublish(args) {
  const dir = args._[1];
  if (!dir) throw new Error('plugin-dir required');
  const manifestPath = path.join(dir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) throw new Error('plugin-dir has no .claude-plugin/plugin.json');
  const spec = readJson(manifestPath);

  const absDir = path.resolve(dir);
  const absRoot = path.dirname(absDir);
  const claudeCatalog = path.join(absRoot, marketplaceWriter.CLAUDE_MARKETPLACE_REL);
  if (!fs.existsSync(claudeCatalog)) {
    throw new Error(`marketplace catalog not found at ${claudeCatalog}; run 'plugin-builder marketplace init ${absRoot}' first`);
  }

  const result = await marketplaceWriter.patchMarketplaceRoot(absRoot, spec, {
    gitRemote: args.opts['git-remote'] || null,
  });
  const stale = marketplaceWriter.detectStaleInPluginMarketplace(absRoot, spec.name);
  const out = { status: 'OK', root: absRoot, ...result };
  if (stale) out.warnings = [stale];
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

async function cmdMarketplaceInit(args) {
  const root = args._[2];
  if (!root) throw new Error('marketplace init <root> required');
  const force = !!args.opts.force;
  const claudePath = path.join(root, marketplaceWriter.CLAUDE_MARKETPLACE_REL);
  const codexPath = path.join(root, marketplaceWriter.CODEX_MARKETPLACE_REL);
  if (!force && fs.existsSync(claudePath)) {
    throw new Error(`${claudePath} already exists; use --force to overwrite`);
  }

  const name = args.opts.name || path.basename(path.resolve(root));
  const displayName = args.opts['display-name'] || toTitleCase(name);
  const ownerName = args.opts['owner-name'] || gitConfig('user.name') || 'unknown';
  const ownerEmail = args.opts['owner-email'] || gitConfig('user.email') || null;
  const owner = ownerEmail ? { name: ownerName, email: ownerEmail } : { name: ownerName };

  const claudeRoot = me.buildClaudeRoot({ name, owner });
  const codexRoot = me.buildCodexRoot({ name, displayName });

  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.writeFileSync(claudePath, JSON.stringify(claudeRoot, null, 2) + '\n');
  fs.writeFileSync(codexPath, JSON.stringify(codexRoot, null, 2) + '\n');

  process.stdout.write(JSON.stringify({
    status: 'OK',
    root: path.resolve(root),
    claude: claudePath,
    codex: codexPath,
  }, null, 2) + '\n');
  return 0;
}

function toTitleCase(s) {
  return s.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function gitConfig(key) {
  try {
    return execSync(`git config --get ${key}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null;
  } catch {
    return null;
  }
}

module.exports = { main, parseArgs, formatReport, SUBCOMMANDS };
