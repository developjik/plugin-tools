'use strict';

// Pure functions producing marketplace entries and root templates for both
// Claude Code and Codex schemas. No IO. Unit-testable.

// CATEGORY_HINT — best-effort kebab-case ↔ PascalCase mapping. Neither
// ecosystem publishes an exhaustive enum, so unknown keys pass through.
const CATEGORY_HINT = Object.freeze({
  productivity: { claude: 'productivity', codex: 'Productivity' },
  'dev-tools':  { claude: 'dev-tools',    codex: 'DevTools' },
  ai:           { claude: 'ai',           codex: 'AI' },
  data:         { claude: 'data',         codex: 'Data' },
  other:        { claude: 'other',        codex: 'Other' },
});

// Codex policy defaults — docs require both fields on every plugin entry.
const POLICY_DEFAULTS = Object.freeze({
  installation: 'AVAILABLE',
  authentication: 'ON_INSTALL',
});

function toPascal(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return raw;
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(s => s[0].toUpperCase() + s.slice(1))
    .join('');
}

function claudeCategory(raw, perTargetOverride) {
  if (perTargetOverride != null) return perTargetOverride;
  if (raw == null) return undefined;
  const hit = CATEGORY_HINT[raw];
  return hit ? hit.claude : raw;
}

function codexCategory(raw, perTargetOverride) {
  if (perTargetOverride != null) return perTargetOverride;
  if (raw == null) return undefined;
  const hit = CATEGORY_HINT[raw];
  return hit ? hit.codex : toPascal(raw);
}

function categoryHintMiss(raw, spec) {
  if (raw == null) return null;
  if (CATEGORY_HINT[raw]) return null;
  if (spec && (spec.claude?.category != null || spec.codex?.category != null)) return null;
  return {
    raw,
    claudeFallback: raw,
    codexFallback: toPascal(raw),
  };
}

function normalizeOwner(author) {
  if (!author) return { name: 'unknown' };
  if (typeof author === 'string') return { name: author };
  if (typeof author === 'object' && author.name) return author;
  return { name: 'unknown' };
}

// Claude marketplace plugin entry. Either flat string source or
// {source:"github", repo:"…"} when --git-remote is provided.
function claudeEntry(spec, opts = {}) {
  const entry = {
    name: spec.name,
    version: spec.version,
    description: spec.description,
  };
  if (opts.gitRemote) {
    entry.source = 'github';
    entry.repo = opts.gitRemote;
  } else {
    entry.source = 'local';
    entry.path = opts.localPath || '.';
  }
  if (spec.author) entry.author = spec.author;
  if (spec.license) entry.license = spec.license;
  const cat = claudeCategory(spec.category, spec.claude?.category);
  if (cat != null) entry.category = cat;
  if (spec.homepage) entry.homepage = spec.homepage;
  if (spec.repository) entry.repository = spec.repository;
  return entry;
}

// Codex marketplace plugin entry. Always emits explicit nested source form
// + policy + category (both policy fields are required by Codex docs).
function codexEntry(spec, opts = {}) {
  const entry = { name: spec.name };
  if (opts.gitRemote) {
    entry.source = { source: 'github', repo: opts.gitRemote };
  } else {
    entry.source = {
      source: 'local',
      path: opts.localPath || `./${spec.name}`,
    };
  }
  entry.version = spec.version;
  entry.description = spec.description;
  // spec.author forward-compat passthrough (Codex deep-merge preserves it).
  if (spec.author) entry.author = spec.author;
  if (spec.license) entry.license = spec.license;
  entry.policy = {
    installation: spec.codex?.policy?.installation || POLICY_DEFAULTS.installation,
    authentication: spec.codex?.policy?.authentication || POLICY_DEFAULTS.authentication,
  };
  const cat = codexCategory(spec.category, spec.codex?.category);
  if (cat != null) entry.category = cat;
  if (spec.homepage) entry.homepage = spec.homepage;
  if (spec.repository) entry.repository = spec.repository;
  return entry;
}

// Claude marketplace root template.
function buildClaudeRoot(opts = {}) {
  return {
    name: opts.name,
    owner: normalizeOwner(opts.owner),
    plugins: [],
  };
}

// Codex marketplace root template.
function buildCodexRoot(opts = {}) {
  const iface = {};
  if (opts.displayName) iface.displayName = opts.displayName;
  return {
    name: opts.name,
    ...(Object.keys(iface).length ? { interface: iface } : {}),
    plugins: [],
  };
}

// Cursor marketplace plugin entry. Cursor marketplace schema:
// { name, owner, plugins: [{ name, source, description }] } per cursor.com docs.
function cursorEntry(spec, opts = {}) {
  const entry = {
    name: spec.name,
    description: spec.description,
  };
  if (opts.gitRemote) {
    entry.source = opts.gitRemote;
  } else {
    entry.source = opts.localPath || spec.name;
  }
  if (spec.version) entry.version = spec.version;
  return entry;
}

// Cursor marketplace root template.
function buildCursorRoot(opts = {}) {
  return {
    name: opts.name,
    owner: normalizeOwner(opts.owner),
    plugins: [],
  };
}

module.exports = {
  CATEGORY_HINT,
  POLICY_DEFAULTS,
  toPascal,
  claudeCategory,
  codexCategory,
  categoryHintMiss,
  normalizeOwner,
  claudeEntry,
  codexEntry,
  cursorEntry,
  buildClaudeRoot,
  buildCodexRoot,
  buildCursorRoot,
};
