'use strict';

const { PluginAdapter, yamlFrontmatter } = require('./base.js');

const HOOK_COMPAT = require('../schemas/v1/hook-event-compat.json');

const SKILL_FRONTMATTER_KEYS = [
  'allowed-tools', 'disable-model-invocation', 'user-invocable',
  'model', 'effort', 'argument-hint', 'paths',
];

const COMMAND_FRONTMATTER_PASSTHROUGH = ['model', 'allowed-tools', 'argument-hint'];

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

    for (const ag of spec.agents || []) {
      files.push({
        path: `agents/${ag.name}.md`,
        content: this.#agentFile(ag),
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
    if (spec.homepage) m.homepage = spec.homepage;
    if (spec.repository) m.repository = spec.repository;
    if (spec.commands && spec.commands.length) m.commands = './commands/';
    if (spec.skills && spec.skills.length) m.skills = './skills/';
    if (spec.agents && spec.agents.length) m.agents = './agents/';
    if (spec.hooks && spec.hooks.length) m.hooks = './hooks/hooks.json';
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

  #agentFile(ag) {
    const fm = { name: ag.name, description: ag.description };
    if (ag.tools) fm.tools = ag.tools;
    return yamlFrontmatter(fm) + (ag.body || '') + '\n';
  }

  #hooks(spec, warnings) {
    const claudeOnly = new Set(HOOK_COMPAT.claudeOnly);
    const codexOnly = new Set(HOOK_COMPAT.codexOnly);
    const common = new Set(HOOK_COMPAT.common);

    const allowed = [];
    for (const h of spec.hooks || []) {
      if (codexOnly.has(h.event)) {
        warnings.push(`hook event '${h.event}' is codex-only; dropped from claude-code target`);
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
      if (s.transport) e.type = s.transport;
      if (s.command) e.command = s.command;
      if (s.url) e.url = s.url;
      out.mcpServers[s.name] = e;
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

Generated by [plugin-builder](https://github.com/developjik/plugin-builder).

Claude-only fields (\`disable-model-invocation\`, \`user-invocable\`, etc.) are dropped when emitting to Codex.
Codex-only \`interface.*\` fields fold into this README header when emitting to Claude.
Round-trip is not guaranteed.
`;
  }
}

module.exports = { ClaudeCodeAdapter };
