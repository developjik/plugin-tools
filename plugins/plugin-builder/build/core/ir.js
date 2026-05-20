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
const HOOK_TYPES = ['command', 'http', 'mcp_tool', 'prompt', 'agent'];
const CURSOR_CMD_EXTS = ['md', 'mdc', 'markdown', 'txt'];
const USER_CONFIG_TYPES = ['string', 'number', 'boolean', 'directory', 'file'];

// Runtime sanity check — adapters and IR both rely on these keys.
for (const required of ['common', 'claudeOnly', 'codexOnly', 'cursorSupported', 'cursorOnly']) {
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
  validateArray(spec.rules, 'rules', validateRule, errs);
  validateArray(spec.hooks, 'hooks', (item, p, e) => validateHook(item, p, e, warnings), errs);
  validateArray(spec.mcpServers, 'mcpServers', validateMcp, errs);

  validateClaudeNamespace(spec.claude, errs, warnings, spec);
  validateCodexNamespace(spec.codex, errs, warnings);
  validateCursorNamespace(spec.cursor, errs, warnings);

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
  if (a.tools != null && !Array.isArray(a.tools)) errs.push(`${p}.tools: must be string[]`);
  if (a.disallowedTools != null && !Array.isArray(a.disallowedTools)) errs.push(`${p}.disallowedTools: must be string[]`);
}

function validateRule(r, p, errs) {
  checkType(r, 'object', errs, p);
  if (typeof r !== 'object' || r === null) return;
  if (!r.name) errs.push(`${p}.name: required`);
  else if (typeof r.name === 'string' && !PATTERNS.name.test(r.name)) {
    errs.push(`${p}.name: must be kebab-case (e.g. 'prefer-const'); got '${r.name}'`);
  }
  if (!r.description) errs.push(`${p}.description: required`);
  if (r.alwaysApply != null && typeof r.alwaysApply !== 'boolean') {
    errs.push(`${p}.alwaysApply: must be boolean`);
  }
  if (r.globs != null) {
    const ok = typeof r.globs === 'string'
      || (Array.isArray(r.globs) && r.globs.every(g => typeof g === 'string'));
    if (!ok) errs.push(`${p}.globs: must be string or string[]`);
  }
}

function validateHook(h, p, errs, warnings) {
  checkType(h, 'object', errs, p);
  if (typeof h !== 'object' || h === null) return;
  if (!h.event) errs.push(`${p}.event: required`);
  if (h.type != null && !HOOK_TYPES.includes(h.type)) {
    errs.push(`${p}.type: must be one of ${HOOK_TYPES.join('|')}; got '${h.type}'`);
  }
  const hookType = h.type || 'command';
  if (hookType === 'command' && !h.command) errs.push(`${p}.command: required (hook type=command)`);
  if (hookType === 'http' && !h.url) errs.push(`${p}.url: required (hook type=http)`);
  if (hookType === 'mcp_tool' && !h.toolName) errs.push(`${p}.toolName: required (hook type=mcp_tool)`);
  if (hookType === 'prompt' && !h.prompt) errs.push(`${p}.prompt: required (hook type=prompt)`);
  if (hookType === 'agent' && !h.agent) errs.push(`${p}.agent: required (hook type=agent)`);
  if (h.url && typeof h.url === 'string' && !isSafeUri(h.url)) {
    errs.push(`${p}.url: must be a URI with allowed scheme (one of ${[...URI_SCHEMES].join('|')})`);
  }
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
  if (m.args != null && !(Array.isArray(m.args) && m.args.every(a => typeof a === 'string'))) {
    errs.push(`${p}.args: must be string[]`);
  }
  if (m.env != null) {
    if (typeof m.env !== 'object' || Array.isArray(m.env)) errs.push(`${p}.env: must be object`);
    else for (const [k, v] of Object.entries(m.env)) {
      if (typeof v !== 'string') errs.push(`${p}.env.${k}: must be string`);
    }
  }
  if (m.headers != null) {
    if (typeof m.headers !== 'object' || Array.isArray(m.headers)) errs.push(`${p}.headers: must be object`);
    else for (const [k, v] of Object.entries(m.headers)) {
      if (typeof v !== 'string') errs.push(`${p}.headers.${k}: must be string`);
    }
  }
}

function validateClaudeNamespace(c, errs, warnings, spec) {
  if (c == null) return;
  checkType(c, 'object', errs, 'claude');
  if (typeof c !== 'object' || c === null) return;

  if (c.lsp != null) {
    if (!Array.isArray(c.lsp)) errs.push('claude.lsp: must be array');
    else c.lsp.forEach((item, i) => {
      const p = `claude.lsp[${i}]`;
      if (!item || typeof item !== 'object') { errs.push(`${p}: expected object`); return; }
      if (!item.language) errs.push(`${p}.language: required`);
      if (!item.command) errs.push(`${p}.command: required`);
    });
  }

  if (c.monitors != null) {
    if (!Array.isArray(c.monitors)) errs.push('claude.monitors: must be array');
    else c.monitors.forEach((item, i) => {
      const p = `claude.monitors[${i}]`;
      if (!item || typeof item !== 'object') { errs.push(`${p}: expected object`); return; }
      if (!item.name) errs.push(`${p}.name: required`);
      if (!item.command) errs.push(`${p}.command: required`);
    });
  }

  if (c.bin != null) {
    if (!Array.isArray(c.bin)) errs.push('claude.bin: must be array');
    else c.bin.forEach((item, i) => {
      const p = `claude.bin[${i}]`;
      if (!item || typeof item !== 'object') { errs.push(`${p}: expected object`); return; }
      if (!item.path) errs.push(`${p}.path: required`);
      if (typeof item.path === 'string' && (item.path.startsWith('/') || item.path.includes('..'))) {
        errs.push(`${p}.path: must be plugin-relative; absolute or '..' rejected`);
      }
    });
  }

  if (c.userConfig != null) {
    if (typeof c.userConfig !== 'object' || Array.isArray(c.userConfig)) {
      errs.push('claude.userConfig: must be object');
    } else {
      for (const [k, v] of Object.entries(c.userConfig)) {
        const p = `claude.userConfig.${k}`;
        if (!v || typeof v !== 'object') { errs.push(`${p}: expected object`); continue; }
        if (!v.type || !USER_CONFIG_TYPES.includes(v.type)) {
          errs.push(`${p}.type: must be one of ${USER_CONFIG_TYPES.join('|')}`);
        }
        if (!v.title) errs.push(`${p}.title: required`);
      }
    }
  }

  if (c.agentExtras != null) {
    if (typeof c.agentExtras !== 'object' || Array.isArray(c.agentExtras)) {
      errs.push('claude.agentExtras: must be object');
    } else {
      const agentNames = new Set((spec.agents || []).map(a => a && a.name).filter(Boolean));
      for (const [k, v] of Object.entries(c.agentExtras)) {
        const p = `claude.agentExtras.${k}`;
        if (!agentNames.has(k)) warnings.push(`${p}: no matching top-level agents[name='${k}']; overlay ignored`);
        if (v && typeof v === 'object') {
          if (v.isolation != null && v.isolation !== 'worktree') {
            errs.push(`${p}.isolation: only 'worktree' allowed`);
          }
          if (v.maxTurns != null && (!Number.isInteger(v.maxTurns) || v.maxTurns < 1)) {
            errs.push(`${p}.maxTurns: must be integer >=1`);
          }
          // Privilege widening guard: disallowedTools ∩ tools must be empty.
          // Use top-level agent's tools list when overlay redefines.
          const agent = (spec.agents || []).find(a => a && a.name === k);
          const agentTools = new Set(Array.isArray(agent && agent.tools) ? agent.tools : []);
          const overlayDis = Array.isArray(v.disallowedTools) ? v.disallowedTools : [];
          const conflict = overlayDis.filter(t => agentTools.has(t));
          if (conflict.length) errs.push(`${p}.disallowedTools: conflict with agents[${k}].tools (${conflict.join(',')})`);
        }
      }
    }
  }
}

function validateCodexNamespace(c, errs, warnings) {
  if (c == null) return;
  checkType(c, 'object', errs, 'codex');
  if (typeof c !== 'object' || c === null) return;

  if (c.apps != null) {
    if (!Array.isArray(c.apps)) errs.push('codex.apps: must be array');
    else c.apps.forEach((item, i) => {
      const p = `codex.apps[${i}]`;
      if (!item || typeof item !== 'object') { errs.push(`${p}: expected object`); return; }
      if (!item.name) errs.push(`${p}.name: required`);
      if (!item.provider) errs.push(`${p}.provider: required`);
    });
  }

  if (c.features != null) {
    if (typeof c.features !== 'object' || Array.isArray(c.features)) {
      errs.push('codex.features: must be object');
    } else {
      for (const k of Object.keys(c.features)) {
        if (!/^[a-z][a-z0-9_]*$/.test(k)) {
          warnings.push(`codex.features.${k}: key should be snake_case`);
        }
      }
    }
  }

  if (c.interfaceMeta != null) {
    if (typeof c.interfaceMeta !== 'object' || Array.isArray(c.interfaceMeta)) {
      errs.push('codex.interfaceMeta: must be object');
    } else {
      for (const urlKey of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
        const v = c.interfaceMeta[urlKey];
        if (v != null && typeof v === 'string' && !isSafeUri(v)) {
          errs.push(`codex.interfaceMeta.${urlKey}: must be safe URI`);
        }
      }
    }
  }
}

function validateCursorNamespace(c, errs, warnings) {
  if (c == null) return;
  checkType(c, 'object', errs, 'cursor');
  if (typeof c !== 'object' || c === null) return;

  if (c.commandExtension != null && !CURSOR_CMD_EXTS.includes(c.commandExtension)) {
    errs.push(`cursor.commandExtension: must be one of ${CURSOR_CMD_EXTS.join('|')}`);
  }
  if (c.inlineHooks != null && typeof c.inlineHooks !== 'boolean') errs.push('cursor.inlineHooks: must be boolean');
  if (c.inlineMcp != null && typeof c.inlineMcp !== 'boolean') errs.push('cursor.inlineMcp: must be boolean');
  if (c.tags != null && !(Array.isArray(c.tags) && c.tags.every(t => typeof t === 'string'))) {
    errs.push('cursor.tags: must be string[]');
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
    keywords: spec.keywords || null,
    targets: spec.targets || ['claude-code'],
    commands: spec.commands || [],
    skills: spec.skills || [],
    agents: spec.agents || [],
    rules: spec.rules || [],
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

module.exports = { load, validate, normalize, SCHEMA, isSafeUri, URI_SCHEMES, HOOK_TYPES, CURSOR_CMD_EXTS };
