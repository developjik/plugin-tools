'use strict';

const { PluginAdapter, yamlFrontmatter } = require('./base.js');

const HOOK_COMPAT = require('../schemas/v1/hook-event-compat.json');

// Skill frontmatter keys preserved verbatim — Cursor follows the open SKILL.md
// standard so security-relevant invocation gates survive cross-target.
const PRESERVED_SECURITY_KEYS = Object.freeze([
  'allowed-tools',
  'disable-model-invocation',
  'user-invocable',
]);

// Claude-only skill frontmatter keys with no defined Cursor semantics.
const DROPPED_STYLE_KEYS = Object.freeze(['model', 'effort', 'paths']);

// Codex-only top-level UnifiedSpec interface fields. Folded into README only.
const CODEX_ONLY_INTERFACE_KEYS = Object.freeze(['displayName', 'composerIcon', 'defaultPrompt']);

class CursorAdapter extends PluginAdapter {
  constructor() {
    super('cursor');
  }

  render(spec) {
    const files = [];
    const warnings = [];

    const cursorExtras = spec.cursor || {};
    const cmdExt = cursorExtras.commandExtension || 'md';
    const inlineHooks = cursorExtras.inlineHooks === true;
    const inlineMcp = cursorExtras.inlineMcp === true;

    files.push({
      path: '.cursor-plugin/plugin.json',
      content: this.#manifest(spec, { cmdExt, inlineHooks, inlineMcp, warnings }),
    });

    for (const r of spec.rules || []) {
      files.push({
        path: `rules/${r.name}.mdc`,
        content: this.#ruleFile(r),
      });
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

    for (const ag of spec.agents || []) {
      files.push({
        path: `agents/${ag.name}.md`,
        content: this.#agentFile(ag),
      });
    }

    for (const cmd of spec.commands || []) {
      files.push({
        path: `commands/${cmd.name}.${cmdExt}`,
        content: this.#commandFile(cmd),
      });
    }

    if (!inlineHooks) {
      const hookFile = this.#hooks(spec, warnings);
      if (hookFile) files.push(hookFile);
    } else {
      // Suppress hooks file emit; manifest carries inline object instead.
      // Still emit warnings for unsupported events.
      this.#hooks(spec, warnings);
    }

    if (!inlineMcp && spec.mcpServers && spec.mcpServers.length) {
      files.push({
        path: 'mcp.json',
        content: this.#mcpFile(spec.mcpServers),
      });
    }

    for (const k of CODEX_ONLY_INTERFACE_KEYS) {
      const v = spec[k];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        warnings.push(`codex-only '${k}' folded into README; not a structured field on cursor target`);
      }
    }
    if (spec.interface && Object.keys(spec.interface).length) {
      warnings.push(`codex-only 'interface.${Object.keys(spec.interface).join('/')}' folded into README; not a structured field on cursor target`);
    }

    // Cross-target warnings: claude.*/codex.* data dropped from cursor emit
    if (spec.claude) {
      if (Array.isArray(spec.claude.lsp) && spec.claude.lsp.length) {
        warnings.push(`claude.lsp (${spec.claude.lsp.length}) is claude-only; dropped from cursor target`);
      }
      if (Array.isArray(spec.claude.monitors) && spec.claude.monitors.length) {
        warnings.push(`claude.monitors (${spec.claude.monitors.length}) is claude-only; dropped from cursor target`);
      }
      if (Array.isArray(spec.claude.bin) && spec.claude.bin.length) {
        warnings.push(`claude.bin (${spec.claude.bin.length}) is claude-only; dropped from cursor target`);
      }
      if (spec.claude.userConfig && Object.keys(spec.claude.userConfig).length) {
        warnings.push(`claude.userConfig is claude-only; dropped from cursor target`);
      }
      if (spec.claude.settings && Object.keys(spec.claude.settings).length) {
        warnings.push(`claude.settings is claude-only; dropped from cursor target`);
      }
      if (spec.claude.agentExtras && Object.keys(spec.claude.agentExtras).length) {
        warnings.push(`claude.agentExtras is claude-only; dropped from cursor target`);
      }
    }
    if (spec.codex) {
      if (Array.isArray(spec.codex.apps) && spec.codex.apps.length) {
        warnings.push(`codex.apps (${spec.codex.apps.length}) is codex-only; dropped from cursor target`);
      }
      if (spec.codex.features && Object.keys(spec.codex.features).length) {
        warnings.push(`codex.features.* is codex-only; dropped from cursor target`);
      }
      if (spec.codex.interfaceMeta && Object.keys(spec.codex.interfaceMeta).length) {
        warnings.push(`codex.interfaceMeta is codex-only; dropped from cursor target`);
      }
    }

    files.push({
      path: 'README.md',
      content: this.#readme(spec),
    });

    this.assertNoMarketplaceWrite(files);

    return { files, warnings };
  }

  #manifest(spec, { cmdExt, inlineHooks, inlineMcp, warnings }) {
    const m = {
      name: spec.name,
      version: spec.version,
      description: spec.description,
    };
    if (spec.author) m.author = spec.author;
    if (spec.license) m.license = spec.license;
    if (spec.homepage) m.homepage = spec.homepage;
    if (spec.repository) m.repository = spec.repository;

    const cursorExtras = spec.cursor || {};
    const keywords = Array.isArray(cursorExtras.keywords) && cursorExtras.keywords.length
      ? cursorExtras.keywords
      : (Array.isArray(spec.keywords) && spec.keywords.length
        ? spec.keywords
        : (spec.category ? [spec.category] : null));
    if (keywords && keywords.length) m.keywords = keywords;

    if (cursorExtras.logo) m.logo = cursorExtras.logo;
    if (cursorExtras.displayName) m.displayName = cursorExtras.displayName;
    if (cursorExtras.publisher) m.publisher = cursorExtras.publisher;
    if (Array.isArray(cursorExtras.tags) && cursorExtras.tags.length) m.tags = cursorExtras.tags;

    if (spec.rules && spec.rules.length) m.rules = './rules/';
    if (spec.skills && spec.skills.length) m.skills = './skills/';
    if (spec.agents && spec.agents.length) m.agents = './agents/';
    if (spec.commands && spec.commands.length) m.commands = './commands/';

    const cursorHooks = (spec.hooks || []).filter(h => isCursorSupportedEvent(h.event));
    if (cursorHooks.length) {
      if (inlineHooks) {
        m.hooks = this.#hooksInline(cursorHooks);
      } else {
        m.hooks = './hooks/hooks.json';
      }
    }

    if (spec.mcpServers && spec.mcpServers.length) {
      if (inlineMcp) {
        m.mcpServers = this.#mcpInline(spec.mcpServers);
      } else {
        m.mcpServers = './mcp.json';
      }
    }
    return JSON.stringify(m, null, 2) + '\n';
  }

  #ruleFile(r) {
    const fm = { description: r.description };
    if (r.alwaysApply != null) fm.alwaysApply = r.alwaysApply;
    if (r.globs != null) fm.globs = r.globs;
    return yamlFrontmatter(fm) + (r.body || '') + '\n';
  }

  #skillFile(sk) {
    const fm = { name: sk.name, description: sk.description };
    if (sk['argument-hint'] != null) fm['argument-hint'] = sk['argument-hint'];
    for (const k of PRESERVED_SECURITY_KEYS) {
      if (sk[k] != null) fm[k] = sk[k];
    }
    return yamlFrontmatter(fm) + (sk.body || '') + '\n';
  }

  #agentFile(ag) {
    const fm = { name: ag.name, description: ag.description };
    if (ag.tools) fm.tools = ag.tools;
    if (ag.disallowedTools) fm.disallowedTools = ag.disallowedTools;
    if (ag.model) fm.model = ag.model;
    return yamlFrontmatter(fm) + (ag.body || '') + '\n';
  }

  #commandFile(cmd) {
    const fm = { name: cmd.name, description: cmd.description };
    if (cmd.argsHint) fm['argument-hint'] = cmd.argsHint;
    return yamlFrontmatter(fm) + (cmd.body || '') + '\n';
  }

  // Cursor hooks.json schema (per cursor.com/docs/reference/plugins):
  //
  //   { "hooks": { "<event>": [ { "command": "...", "matcher"?: "..." }, ... ] } }
  //
  // Flat array of entries per event — NOT the Claude-style nested
  // { hooks: [{ type: 'command', command }] } wrapper. Emitting that wrapper
  // for Cursor causes the loader to silently ignore the hook.
  #hooks(spec, warnings) {
    const cursorSupported = new Set(HOOK_COMPAT.cursorSupported || []);
    const cursorOnly = new Set(HOOK_COMPAT.cursorOnly || []);
    const claudeToCursor = HOOK_COMPAT.claudeToCursor || {};

    const allowed = [];
    for (const h of spec.hooks || []) {
      const claudeEvent = h.event;
      if (cursorOnly.has(claudeEvent)) {
        // Cursor-native camelCase event; pass through verbatim.
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
      const entry = { command: h.command };
      if (h.matcher) entry.matcher = h.matcher;
      hooksByEvent[h.event].push(entry);
    }
    return {
      path: 'hooks/hooks.json',
      content: JSON.stringify({ hooks: hooksByEvent }, null, 2) + '\n',
    };
  }

  #hooksInline(cursorHooks) {
    const cursorSupported = new Set(HOOK_COMPAT.cursorSupported || []);
    const cursorOnly = new Set(HOOK_COMPAT.cursorOnly || []);
    const claudeToCursor = HOOK_COMPAT.claudeToCursor || {};
    const hooksByEvent = {};
    for (const h of cursorHooks) {
      let ev = h.event;
      if (!cursorOnly.has(ev) && cursorSupported.has(ev)) ev = claudeToCursor[ev] || ev;
      hooksByEvent[ev] ??= [];
      const entry = { command: h.command };
      if (h.matcher) entry.matcher = h.matcher;
      hooksByEvent[ev].push(entry);
    }
    return hooksByEvent;
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

  #mcpInline(servers) {
    const out = {};
    for (const s of servers) {
      const e = {};
      if (s.command) e.command = s.command;
      if (Array.isArray(s.args)) e.args = s.args;
      if (s.env && typeof s.env === 'object') e.env = s.env;
      if (s.url) e.url = s.url;
      if (s.headers && typeof s.headers === 'object') e.headers = s.headers;
      out[s.name] = e;
    }
    return out;
  }

  #readme(spec) {
    const ruleList = (spec.rules || []).map(r => `- **${r.name}** — ${r.description}`).join('\n') || '_none_';
    const skillList = (spec.skills || []).map(s => `- **${s.name}** — ${s.description}`).join('\n') || '_none_';
    const agentList = (spec.agents || []).map(a => `- **${a.name}** — ${a.description}`).join('\n') || '_none_';
    const cmdList = (spec.commands || []).map(c => `- **/${c.name}** — ${c.description}`).join('\n') || '_none_';
    return `# ${spec.name}

> ${spec.description}

Version: ${spec.version}
License: ${spec.license || 'MIT'}

## Rules

${ruleList}

## Skills

${skillList}

## Agents

${agentList}

## Commands

${cmdList}

## Install (Cursor)

In Cursor Agent chat:

\`\`\`text
/add-plugin ${spec.name}
\`\`\`

Or search "${spec.name}" in the Cursor plugin marketplace.

## Cross-target conversion notes

Generated by [plugin-builder](https://github.com/developjik/plugin-tools/tree/main/plugins/plugin-builder).

Cursor target emits rules, skills, agents, commands, hooks, and mcp.json per cursor.com/docs/plugins.
Hook event names normalised to Cursor camelCase (e.g. \`PreToolUse\` → \`preToolUse\`, \`UserPromptSubmit\` → \`beforeSubmitPrompt\`).
Codex-only \`interface.*\` and Claude-only skill style keys (\`model\`, \`effort\`, \`paths\`) are dropped with warnings.
`;
  }
}

function isCursorSupportedEvent(event) {
  return (HOOK_COMPAT.cursorSupported || []).includes(event)
    || (HOOK_COMPAT.cursorOnly || []).includes(event);
}

module.exports = { CursorAdapter, PRESERVED_SECURITY_KEYS };
