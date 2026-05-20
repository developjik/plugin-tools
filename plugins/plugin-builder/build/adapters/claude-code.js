'use strict';

const { PluginAdapter, yamlFrontmatter } = require('./base.js');

const HOOK_COMPAT = require('../schemas/v1/hook-event-compat.json');

const SKILL_FRONTMATTER_KEYS = [
  'allowed-tools', 'disable-model-invocation', 'user-invocable',
  'model', 'effort', 'argument-hint', 'paths',
];

const COMMAND_FRONTMATTER_PASSTHROUGH = ['model', 'allowed-tools', 'argument-hint'];

// Per-agent extras keys that lift onto agent frontmatter. Forbidden agent
// frontmatter keys (`hooks`, `mcpServers`, `permissionMode`) are NEVER lifted
// even if user puts them in agentExtras — privilege widening guard.
const AGENT_EXTRA_KEYS = [
  'effort', 'maxTurns', 'skills', 'memory', 'background', 'isolation', 'disallowedTools',
];

class ClaudeCodeAdapter extends PluginAdapter {
  constructor() {
    super('claude-code');
  }

  render(spec) {
    const files = [];
    const warnings = [];

    files.push({
      path: '.claude-plugin/plugin.json',
      content: this.#manifest(spec),
    });

    for (const cmd of spec.commands || []) {
      files.push({
        path: `commands/${cmd.name}.md`,
        content: this.#commandFile(cmd),
      });
    }

    for (const sk of spec.skills || []) {
      files.push({
        path: `skills/${sk.name}/SKILL.md`,
        content: this.#skillFile(sk),
      });
    }

    const agentExtras = (spec.claude && spec.claude.agentExtras) || {};
    for (const ag of spec.agents || []) {
      files.push({
        path: `agents/${ag.name}.md`,
        content: this.#agentFile(ag, agentExtras[ag.name]),
      });
    }

    const hookFile = this.#hooks(spec, warnings);
    if (hookFile) files.push(hookFile);

    if (spec.mcpServers && spec.mcpServers.length) {
      files.push({
        path: '.mcp.json',
        content: this.#mcpFile(spec.mcpServers),
      });
    }

    // claude.* namespace components
    if (spec.claude) {
      for (const lsp of spec.claude.lsp || []) {
        // LSP servers consolidated into single .lsp.json file
      }
      if (Array.isArray(spec.claude.lsp) && spec.claude.lsp.length) {
        files.push({
          path: '.lsp.json',
          content: this.#lspFile(spec.claude.lsp),
        });
      }
      if (Array.isArray(spec.claude.monitors) && spec.claude.monitors.length) {
        files.push({
          path: 'monitors/monitors.json',
          content: JSON.stringify(spec.claude.monitors, null, 2) + '\n',
        });
      }
      for (const bin of spec.claude.bin || []) {
        files.push({
          path: `bin/${bin.path}`,
          content: bin.content || '#!/usr/bin/env bash\n# Placeholder; populate via authoring tools.\n',
          mode: bin.mode || '0755',
        });
      }
      if (spec.claude.settings && Object.keys(spec.claude.settings).length) {
        files.push({
          path: 'settings.json',
          content: JSON.stringify(spec.claude.settings, null, 2) + '\n',
        });
      }
    }

    const interfaceFields = ['displayName', 'composerIcon', 'defaultPrompt'];
    for (const k of interfaceFields) {
      const v = spec[k];
      if (v != null && !(Array.isArray(v) && v.length === 0)) {
        warnings.push(`codex-only '${k}' folded into README; not a structured field on claude-code target`);
      }
    }
    if (spec.interface && Object.keys(spec.interface).length) {
      warnings.push(`codex-only 'interface.${Object.keys(spec.interface).join('/')}' folded into README; not a structured field on claude-code target`);
    }

    // Cross-target namespace warnings: codex.*/cursor.* data dropped from claude-code emit
    if (spec.codex) {
      if (Array.isArray(spec.codex.apps) && spec.codex.apps.length) {
        warnings.push(`codex.apps (${spec.codex.apps.length}) is codex-only; dropped from claude-code target`);
      }
      if (spec.codex.features && Object.keys(spec.codex.features).length) {
        warnings.push(`codex.features.* is codex-only; dropped from claude-code target`);
      }
      if (spec.codex.interfaceMeta && Object.keys(spec.codex.interfaceMeta).length) {
        warnings.push(`codex.interfaceMeta is codex-only; dropped from claude-code target`);
      }
    }
    if (spec.cursor) {
      const cursorOnlyToggles = ['commandExtension', 'inlineHooks', 'inlineMcp', 'publisher', 'tags'];
      for (const k of cursorOnlyToggles) {
        if (spec.cursor[k] != null) {
          warnings.push(`cursor.${k} is cursor-only; dropped from claude-code target`);
        }
      }
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
    if (spec.category) m.category = spec.category;
    if (spec.keywords && spec.keywords.length) m.keywords = spec.keywords;
    if (spec.homepage) m.homepage = spec.homepage;
    if (spec.repository) m.repository = spec.repository;
    if (spec.commands && spec.commands.length) m.commands = './commands/';
    if (spec.skills && spec.skills.length) m.skills = './skills/';
    if (spec.agents && spec.agents.length) m.agents = './agents/';
    if (spec.hooks && spec.hooks.length) m.hooks = './hooks/hooks.json';

    if (spec.claude) {
      if (Array.isArray(spec.claude.lsp) && spec.claude.lsp.length) m.lspServers = './.lsp.json';
      if (Array.isArray(spec.claude.monitors) && spec.claude.monitors.length) m.monitors = './monitors/monitors.json';
      if (spec.claude.userConfig && Object.keys(spec.claude.userConfig).length) m.userConfig = spec.claude.userConfig;
    }

    return JSON.stringify(m, null, 2) + '\n';
  }

  #commandFile(cmd) {
    const fm = { description: cmd.description };
    if (cmd.argsHint) fm['argument-hint'] = cmd.argsHint;
    if (cmd.frontmatter) {
      for (const k of COMMAND_FRONTMATTER_PASSTHROUGH) {
        if (cmd.frontmatter[k] != null) fm[k] = cmd.frontmatter[k];
      }
    }
    return yamlFrontmatter(fm) + (cmd.body || '') + '\n';
  }

  #skillFile(sk) {
    const fm = { name: sk.name, description: sk.description };
    for (const k of SKILL_FRONTMATTER_KEYS) {
      if (sk[k] != null) fm[k] = sk[k];
    }
    return yamlFrontmatter(fm) + (sk.body || '') + '\n';
  }

  #agentFile(ag, extras) {
    const fm = { name: ag.name, description: ag.description };
    if (ag.tools) fm.tools = ag.tools;
    if (ag.disallowedTools) fm.disallowedTools = ag.disallowedTools;
    if (ag.model) fm.model = ag.model;
    if (extras && typeof extras === 'object') {
      for (const k of AGENT_EXTRA_KEYS) {
        if (extras[k] != null) fm[k] = extras[k];
      }
    }
    return yamlFrontmatter(fm) + (ag.body || '') + '\n';
  }

  #hooks(spec, warnings) {
    const claudeOnly = new Set(HOOK_COMPAT.claudeOnly);
    const codexOnly = new Set(HOOK_COMPAT.codexOnly);
    const cursorOnly = new Set(HOOK_COMPAT.cursorOnly || []);
    const common = new Set(HOOK_COMPAT.common);

    const allowed = [];
    for (const h of spec.hooks || []) {
      if (codexOnly.has(h.event)) {
        warnings.push(`hook event '${h.event}' is codex-only; dropped from claude-code target`);
        continue;
      }
      if (cursorOnly.has(h.event)) {
        warnings.push(`hook event '${h.event}' is cursor-only; dropped from claude-code target`);
        continue;
      }
      if (!common.has(h.event) && !claudeOnly.has(h.event)) {
        warnings.push(`hook event '${h.event}' unknown (allowed but not in compatibility table)`);
      }
      allowed.push(h);
    }
    if (!allowed.length) return null;

    const hooksByEvent = {};
    for (const h of allowed) {
      hooksByEvent[h.event] ??= [];
      const hookType = h.type || 'command';
      const inner = { type: hookType };
      if (hookType === 'command') inner.command = h.command;
      if (hookType === 'http') inner.url = h.url;
      if (hookType === 'mcp_tool') inner.toolName = h.toolName;
      if (hookType === 'prompt') inner.prompt = h.prompt;
      if (hookType === 'agent') inner.agent = h.agent;
      if (h.statusMessage) inner.statusMessage = h.statusMessage;
      const entry = { hooks: [inner] };
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
      if (s.transport) e.type = s.transport;
      if (s.command) e.command = s.command;
      if (Array.isArray(s.args) && s.args.length) e.args = s.args;
      if (s.env && typeof s.env === 'object' && Object.keys(s.env).length) e.env = s.env;
      if (s.url) e.url = s.url;
      if (s.headers && typeof s.headers === 'object' && Object.keys(s.headers).length) e.headers = s.headers;
      out.mcpServers[s.name] = e;
    }
    return JSON.stringify(out, null, 2) + '\n';
  }

  #lspFile(lspList) {
    const out = {};
    for (const l of lspList) {
      const e = { command: l.command };
      if (Array.isArray(l.args) && l.args.length) e.args = l.args;
      if (l.env && Object.keys(l.env).length) e.env = l.env;
      if (l.extensionToLanguage && Object.keys(l.extensionToLanguage).length) e.extensionToLanguage = l.extensionToLanguage;
      if (l.initializationOptions) e.initializationOptions = l.initializationOptions;
      if (l.settings) e.settings = l.settings;
      out[l.language] = e;
    }
    return JSON.stringify(out, null, 2) + '\n';
  }

  #readme(spec) {
    const cmdList = (spec.commands || []).map(c => `- \`/${spec.name}:${c.name}\` — ${c.description}`).join('\n') || '_none_';
    const skillList = (spec.skills || []).map(s => `- **${s.name}** — ${s.description}`).join('\n') || '_none_';
    const interfaceNote = spec.displayName || spec.defaultPrompt?.length
      ? `\n\n## Interface metadata (Codex-only, shown here as reference)\n\n- displayName: ${spec.displayName || '(none)'}\n- defaultPrompt: ${(spec.defaultPrompt || []).join(' | ') || '(none)'}\n`
      : '';
    return `# ${spec.name}

> ${spec.description}

Version: ${spec.version}
License: ${spec.license || 'MIT'}

## Commands

${cmdList}

## Skills

${skillList}${interfaceNote}

## Cross-target conversion notes

Generated by [plugin-builder](https://github.com/developjik/plugin-tools/tree/main/plugins/plugin-builder).

Claude-only fields (\`disable-model-invocation\`, \`user-invocable\`, etc.) are dropped when emitting to Codex.
Codex-only \`interface.*\` fields fold into this README header when emitting to Claude.
Round-trip is not guaranteed.
`;
  }
}

module.exports = { ClaudeCodeAdapter };
