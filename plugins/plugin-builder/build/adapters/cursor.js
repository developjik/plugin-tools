'use strict';

const { PluginAdapter, yamlFrontmatter } = require('./base.js');

const HOOK_COMPAT = require('../schemas/v1/hook-event-compat.json');

// Security-critical skill frontmatter keys preserved in Cursor SKILL.md.
// Cursor follows the open SKILL.md standard, so these survive verbatim.
const PRESERVED_SECURITY_KEYS = Object.freeze([
  'allowed-tools',
  'disable-model-invocation',
  'user-invocable',
]);

// Claude-only skill frontmatter keys dropped on Cursor (no defined semantics).
const DROPPED_STYLE_KEYS = Object.freeze(['model', 'effort', 'paths']);

class CursorAdapter extends PluginAdapter {
  constructor() {
    super('cursor');
  }

  render(spec) {
    const files = [];
    const warnings = [];

    files.push({
      path: '.cursor-plugin/plugin.json',
      content: this.#manifest(spec),
    });

    // Scope: skills + hooks + mcp only. agents/commands are explicitly out of
    // scope for the cursor adapter; warn-drop is intentional.
    if (spec.commands && spec.commands.length) {
      warnings.push(`cursor adapter v1: commands (${spec.commands.length}) dropped — out of scope`);
    }
    if (spec.agents && spec.agents.length) {
      for (const ag of spec.agents) {
        warnings.push(`agent '${ag.name}' dropped from cursor target (out of scope in v1)`);
      }
    }

    for (const sk of spec.skills || []) {
      for (const k of DROPPED_STYLE_KEYS) {
        if (sk[k] != null) warnings.push(`skill '${sk.name}': claude-only key '${k}' dropped from cursor target`);
      }
      files.push({
        path: `skills/${sk.name}/SKILL.md`,
        content: this.#skillFile(sk),
      });
    }

    const hookFile = this.#hooks(spec, warnings);
    if (hookFile) files.push(hookFile);

    if (spec.mcpServers && spec.mcpServers.length) {
      files.push({
        path: 'mcp.json',
        content: this.#mcpFile(spec.mcpServers),
      });
    }

    // Codex-only interface metadata folded into README for transparency, not
    // emitted as a structured Cursor field (Cursor has no equivalent).
    const codexOnlyInterfaceKeys = ['displayName', 'composerIcon', 'defaultPrompt'];
    for (const k of codexOnlyInterfaceKeys) {
      const v = spec[k];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        warnings.push(`codex-only '${k}' folded into README; not a structured field on cursor target`);
      }
    }
    if (spec.interface && Object.keys(spec.interface).length) {
      warnings.push(`codex-only 'interface.${Object.keys(spec.interface).join('/')}' folded into README; not a structured field on cursor target`);
    }

    files.push({
      path: 'README.md',
      content: this.#readme(spec),
    });

    this.assertNoMarketplaceWrite(files);

    return { files, warnings };
  }

  #manifest(spec) {
    const m = {
      name: spec.name,
      version: spec.version,
      description: spec.description,
    };
    if (spec.author) m.author = spec.author;
    if (spec.license) m.license = spec.license;
    if (spec.homepage) m.homepage = spec.homepage;
    if (spec.repository) m.repository = spec.repository;

    // Cursor manifest uses `keywords` (array). UnifiedSpec `category` (string)
    // folds in as a single-item array unless spec.cursor.keywords overrides.
    const cursorExtras = spec.cursor || {};
    const keywords = Array.isArray(cursorExtras.keywords) && cursorExtras.keywords.length
      ? cursorExtras.keywords
      : (spec.category ? [spec.category] : null);
    if (keywords && keywords.length) m.keywords = keywords;

    if (cursorExtras.logo) m.logo = cursorExtras.logo;

    if (spec.skills && spec.skills.length) m.skills = './skills/';
    if ((spec.hooks || []).some(h => isCursorSupportedEvent(h.event))) {
      m.hooks = './hooks/hooks.json';
    }
    if (spec.mcpServers && spec.mcpServers.length) m.mcpServers = './mcp.json';
    return JSON.stringify(m, null, 2) + '\n';
  }

  #skillFile(sk) {
    const fm = { name: sk.name, description: sk.description };
    if (sk['argument-hint'] != null) fm['argument-hint'] = sk['argument-hint'];
    for (const k of PRESERVED_SECURITY_KEYS) {
      if (sk[k] != null) fm[k] = sk[k];
    }
    return yamlFrontmatter(fm) + (sk.body || '') + '\n';
  }

  #hooks(spec, warnings) {
    const cursorSupported = new Set(HOOK_COMPAT.cursorSupported || []);
    const cursorOnly = new Set(HOOK_COMPAT.cursorOnly || []);
    const claudeToCursor = HOOK_COMPAT.claudeToCursor || {};

    const allowed = [];
    for (const h of spec.hooks || []) {
      const claudeEvent = h.event;
      if (cursorOnly.has(claudeEvent)) {
        // Cursor-native event name; pass through verbatim.
        allowed.push({ ...h, event: claudeEvent });
        continue;
      }
      if (cursorSupported.has(claudeEvent)) {
        // Claude PascalCase → Cursor camelCase rename.
        const mapped = claudeToCursor[claudeEvent] || claudeEvent;
        allowed.push({ ...h, event: mapped });
        continue;
      }
      warnings.push(`hook event '${claudeEvent}' is not supported by cursor target; dropped`);
    }
    if (!allowed.length) return null;

    const hooksByEvent = {};
    for (const h of allowed) {
      hooksByEvent[h.event] ??= [];
      const entry = { hooks: [{ type: 'command', command: h.command }] };
      if (h.matcher) entry.matcher = h.matcher;
      hooksByEvent[h.event].push(entry);
    }
    return {
      path: 'hooks/hooks.json',
      content: JSON.stringify({ hooks: hooksByEvent }, null, 2) + '\n',
    };
  }

  #mcpFile(servers) {
    const out = { mcpServers: {} };
    for (const s of servers) {
      const e = {};
      if (s.command) e.command = s.command;
      if (Array.isArray(s.args)) e.args = s.args;
      if (s.env && typeof s.env === 'object') e.env = s.env;
      if (s.url) e.url = s.url;
      if (s.headers && typeof s.headers === 'object') e.headers = s.headers;
      out.mcpServers[s.name] = e;
    }
    return JSON.stringify(out, null, 2) + '\n';
  }

  #readme(spec) {
    const skillList = (spec.skills || []).map(s => `- **${s.name}** — ${s.description}`).join('\n') || '_none_';
    return `# ${spec.name}

> ${spec.description}

Version: ${spec.version}
License: ${spec.license || 'MIT'}

## Skills

${skillList}

## Install (Cursor)

In Cursor Agent chat:

\`\`\`text
/add-plugin ${spec.name}
\`\`\`

Or search "${spec.name}" in the Cursor plugin marketplace.

## Cross-target conversion notes

Generated by [plugin-builder](https://github.com/developjik/plugin-tools/tree/main/plugins/plugin-builder).

Scope: cursor target v1 emits skills, hooks, and mcp.json only.
Claude/Codex agents and commands are dropped with warnings.
Hook event names are normalised to Cursor camelCase (e.g. \`PreToolUse\` → \`preToolUse\`).
`;
  }
}

function isCursorSupportedEvent(event) {
  return (HOOK_COMPAT.cursorSupported || []).includes(event)
    || (HOOK_COMPAT.cursorOnly || []).includes(event);
}

module.exports = { CursorAdapter, PRESERVED_SECURITY_KEYS };
