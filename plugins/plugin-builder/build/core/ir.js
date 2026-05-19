'use strict';

const fs = require('node:fs');
const path = require('node:path');
const specVersion = require('./spec-version.js');

const SCHEMA = require('../schemas/v1/unified-spec.schema.json');
const HOOK_COMPAT = require('../schemas/v1/hook-event-compat.json');

const PATTERNS = {
  name: /^[a-z][a-z0-9-]*[a-z0-9]$/,
  commandName: /^[a-z][a-z0-9-]*$/,
  version: /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/,
};

// Allowlist of URI schemes accepted in spec.homepage/repository/mcpServers[].url.
// Rejects javascript:/data:/file:/vbscript: (XSS, exfiltration, local file disclosure).
// Tracks RFC 3986 + common VCS schemes.
// Note: `mailto:` intentionally excluded. homepage/repository are URLs to
// human-readable docs/source — a mailto would never be correct there, and
// allowing it would defang the allowlist as a defence-in-depth measure.
const URI_SCHEMES = new Set([
  'http', 'https',
  'git', 'git+http', 'git+https', 'git+ssh', 'git+file',
  'ssh', 'svn', 'hg',
  'ws', 'wss',
]);

function isSafeUri(s) {
  if (typeof s !== 'string' || s.length === 0) return false;
  if (/\s/.test(s)) return false;
  const m = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!m) return false;
  const scheme = m[1].toLowerCase();
  if (!URI_SCHEMES.has(scheme)) return false;
  const rest = s.slice(m[0].length);
  if (rest.length === 0) return false;
  // ASCII printable only; defends against control chars / encoded payloads.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(s)) return false;
  return true;
}

// Hint-only — v0.6 passes raw through. Marketplace writer applies hint mapping
// per target. Unknown values surface as scaffold warnings, never errors.
const CATEGORIES = ['productivity', 'dev-tools', 'ai', 'data', 'other'];
const TARGETS = ['claude-code', 'codex', 'cursor'];
const TRANSPORTS = ['stdio', 'http', 'sse'];

// Runtime sanity check — adapters and IR both rely on these keys.
for (const required of ['common', 'claudeOnly', 'codexOnly']) {
  if (!Array.isArray(HOOK_COMPAT[required])) {
    throw new Error(`hook-event-compat.json missing array '${required}'`);
  }
}

function load(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const spec = JSON.parse(raw);
  return spec;
}

function checkType(value, expected, errs, path) {
  if (expected === 'array') {
    if (!Array.isArray(value)) errs.push(`${path}: expected array`);
    return;
  }
  if (expected === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) errs.push(`${path}: expected object`);
    return;
  }
  if (typeof value !== expected) errs.push(`${path}: expected ${expected}, got ${typeof value}`);
}

function validate(spec) {
  const errs = [];
  const warnings = [];

  const sv = specVersion.check(spec);
  if (!sv.ok) {
    errs.push(`specVersion: ${sv.reason}`);
    return { ok: false, errors: errs, warnings };
  }

  for (const req of SCHEMA.required) {
    if (spec[req] == null) errs.push(`${req}: required`);
  }

  if (spec.name && !PATTERNS.name.test(spec.name)) {
    errs.push(`name: must be kebab-case starting with a letter (e.g. 'my-plugin'); got '${spec.name}'`);
  }
  if (spec.version && !PATTERNS.version.test(spec.version)) {
    errs.push(`version: must be semver (e.g. '1.2.3' or '1.2.3-beta.1'); got '${spec.version}'`);
  }
  if (spec.description) {
    checkType(spec.description, 'string', errs, 'description');
    if (typeof spec.description === 'string' && spec.description.length > 200) {
      errs.push(`description: max 200 chars (got ${spec.description.length})`);
    }
  }
  if (spec.category != null) {
    checkType(spec.category, 'string', errs, 'category');
    if (typeof spec.category === 'string' && !CATEGORIES.includes(spec.category)) {
      warnings.push(`category: '${spec.category}' not in CATEGORY_HINT — emitted verbatim for Claude, PascalCase for Codex. Set spec.claude.category / spec.codex.category to override.`);
    }
  }
  if (spec.homepage && typeof spec.homepage === 'string' && !isSafeUri(spec.homepage)) {
    errs.push(`homepage: must be a URI with allowed scheme (one of ${[...URI_SCHEMES].join('|')})`);
  }
  if (spec.repository && typeof spec.repository === 'string' && !isSafeUri(spec.repository)) {
    errs.push(`repository: must be a URI with allowed scheme (one of ${[...URI_SCHEMES].join('|')})`);
  }
  if (spec.targets) {
    checkType(spec.targets, 'array', errs, 'targets');
    if (Array.isArray(spec.targets)) {
      if (spec.targets.length === 0) errs.push('targets: minItems 1');
      for (const t of spec.targets) {
        if (!TARGETS.includes(t)) errs.push(`targets: ${t} not in ${TARGETS.join('|')}`);
      }
    }
  }

  validateArray(spec.commands, 'commands', validateCommand, errs);
  validateArray(spec.skills, 'skills', validateSkill, errs);
  validateArray(spec.agents, 'agents', validateAgent, errs);
  validateArray(spec.hooks, 'hooks', (item, p, e) => validateHook(item, p, e, warnings), errs);
  validateArray(spec.mcpServers, 'mcpServers', validateMcp, errs);

  return { ok: errs.length === 0, errors: errs, warnings };
}

function validateArray(value, name, itemFn, errs) {
  if (value == null) return;
  checkType(value, 'array', errs, name);
  if (!Array.isArray(value)) return;
  value.forEach((item, i) => itemFn(item, `${name}[${i}]`, errs));
}

function validateCommand(c, p, errs) {
  checkType(c, 'object', errs, p);
  if (typeof c !== 'object' || c === null) return;
  if (!c.name) errs.push(`${p}.name: required`);
  else if (!PATTERNS.commandName.test(c.name)) errs.push(`${p}.name: must be kebab-case (e.g. 'check'); got '${c.name}'`);
  if (!c.description) errs.push(`${p}.description: required`);
}

function validateSkill(s, p, errs) {
  checkType(s, 'object', errs, p);
  if (typeof s !== 'object' || s === null) return;
  if (!s.name) errs.push(`${p}.name: required`);
  else if (!PATTERNS.name.test(s.name)) errs.push(`${p}.name: must be kebab-case (e.g. 'i18n-key-guard'); got '${s.name}'`);
  if (!s.description) errs.push(`${p}.description: required`);
  else if (s.description.length < 20) errs.push(`${p}.description: must be at least 20 chars so triggers work reliably (got ${s.description.length})`);
}

function validateAgent(a, p, errs) {
  checkType(a, 'object', errs, p);
  if (typeof a !== 'object' || a === null) return;
  if (!a.name) errs.push(`${p}.name: required`);
  else if (typeof a.name === 'string' && !PATTERNS.name.test(a.name)) {
    errs.push(`${p}.name: must be kebab-case (e.g. 'reviewer-bot'); got '${a.name}'`);
  }
  if (!a.description) errs.push(`${p}.description: required`);
}

function validateHook(h, p, errs, warnings) {
  checkType(h, 'object', errs, p);
  if (typeof h !== 'object' || h === null) return;
  if (!h.event) errs.push(`${p}.event: required`);
  if (!h.command) errs.push(`${p}.command: required`);
  if (h.event && typeof h.event === 'string' && warnings) {
    const known = HOOK_COMPAT.common.includes(h.event)
      || HOOK_COMPAT.claudeOnly.includes(h.event)
      || HOOK_COMPAT.codexOnly.includes(h.event)
      || (HOOK_COMPAT.cursorOnly || []).includes(h.event);
    if (!known) warnings.push(`${p}.event: '${h.event}' not in HookEventCompat table; will emit with warning`);
  }
}

function validateMcp(m, p, errs) {
  checkType(m, 'object', errs, p);
  if (typeof m !== 'object' || m === null) return;
  if (!m.name) errs.push(`${p}.name: required`);
  else if (typeof m.name === 'string' && !PATTERNS.name.test(m.name)) {
    errs.push(`${p}.name: must be kebab-case (e.g. 'my-server'); got '${m.name}'`);
  }
  if (!m.transport) {
    errs.push(`${p}.transport: required (one of ${TRANSPORTS.join('|')})`);
  } else if (!TRANSPORTS.includes(m.transport)) {
    errs.push(`${p}.transport: must be ${TRANSPORTS.join('|')}; got '${m.transport}'`);
  }
  if (m.transport === 'stdio' && !m.command) {
    errs.push(`${p}.command: required when transport=stdio`);
  }
  if ((m.transport === 'http' || m.transport === 'sse') && !m.url) {
    errs.push(`${p}.url: required when transport=${m.transport}`);
  }
  if (m.url && typeof m.url === 'string' && !isSafeUri(m.url)) {
    errs.push(`${p}.url: must be a URI with allowed scheme (one of ${[...URI_SCHEMES].join('|')})`);
  }
}

function normalize(spec) {
  return {
    specVersion: spec.specVersion || '1.0',
    name: spec.name,
    version: spec.version,
    description: spec.description,
    author: spec.author || null,
    homepage: spec.homepage || null,
    repository: spec.repository || null,
    license: spec.license || 'MIT',
    category: spec.category || 'other',
    targets: spec.targets || ['claude-code'],
    commands: spec.commands || [],
    skills: spec.skills || [],
    agents: spec.agents || [],
    hooks: spec.hooks || [],
    mcpServers: spec.mcpServers || [],
    displayName: spec.displayName || null,
    composerIcon: spec.composerIcon || null,
    defaultPrompt: spec.defaultPrompt || [],
    interface: spec.interface || null,
    claude: spec.claude || null,
    codex: spec.codex || null,
    cursor: spec.cursor || null,
  };
}

module.exports = { load, validate, normalize, SCHEMA, isSafeUri, URI_SCHEMES };
