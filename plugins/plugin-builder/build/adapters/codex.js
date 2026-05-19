'use strict';

const { PluginAdapter, yamlFrontmatter, yamlScalar } = require('./base.js');

const HOOK_COMPAT = require('../schemas/v1/hook-event-compat.json');

// Security-critical skill frontmatter keys that MUST survive the
// Codex SKILL.md fold. Silent drop = privilege widening relative to author intent.
// Single source of truth — iterated by #skillFile to emit frontmatter.
const PRESERVED_SECURITY_KEYS = Object.freeze([
  'allowed-tools',
  'disable-model-invocation',
  'user-invocable',
]);

class CodexAdapter extends PluginAdapter {
  constructor() {
    super('codex');
  }

  render(spec) {
    const files = [];
    const warnings = [];

    files.push({
      path: '.codex-plugin/plugin.json',
      content: this.#manifest(spec, warnings),
    });

    if (spec.commands && spec.commands.length) {
      warnings.push(`commands (${spec.commands.length}) folded into SKILL.md per Codex spec`);
    }

    // Style/perf fields that genuinely have no Codex semantic — warn-drop is fine.
    const droppedStyleKeys = ['model', 'effort', 'paths'];

    // If any command declares `allowed-tools`, union it into the skill where it
    // is folded. Author cannot otherwise re-assert per-command tool scope inside
    // a Codex skill, so silent loss = privilege widening.
    const cmdToolUnion = new Set();
    for (const cmd of spec.commands || []) {
      const fm = cmd.frontmatter || {};
      if (Array.isArray(fm['allowed-tools'])) {
        for (const t of fm['allowed-tools']) cmdToolUnion.add(t);
      }
    }

    for (const sk of spec.skills || []) {
      for (const k of droppedStyleKeys) {
        if (sk[k] != null) warnings.push(`skill '${sk.name}': claude-only key '${k}' dropped from codex target`);
      }
      const skillForCodex = { ...sk };
      // Union folded-command tool scope into skill allowed-tools so authored
      // scope survives the commands→SKILL.md fold.
      if (cmdToolUnion.size) {
        const existing = Array.isArray(sk['allowed-tools']) ? sk['allowed-tools'] : [];
        const merged = Array.from(new Set([...existing, ...cmdToolUnion]));
        skillForCodex['allowed-tools'] = merged;
        warnings.push(`skill '${sk.name}': merged allowed-tools from folded commands (${[...cmdToolUnion].join(',')}); review to confirm scope`);
      }
      files.push({
        path: `skills/${sk.name}/SKILL.md`,
        content: this.#skillFile(skillForCodex, spec.commands || []),
      });
      if (sk.codex) {
        files.push({
          path: `skills/${sk.name}/agents/openai.yaml`,
          content: this.#codexSkillYaml(sk),
        });
      }
    }

    for (const cmd of spec.commands || []) {
      const droppedFm = [];
      if (cmd.frontmatter) {
        for (const k of ['model']) {
          if (cmd.frontmatter[k] != null) droppedFm.push(k);
        }
      }
      if (cmd.argsHint) droppedFm.push('argsHint');
      if (droppedFm.length) {
        warnings.push(`command '${cmd.name}': claude-only key(s) '${droppedFm.join(',')}' dropped when folded into SKILL.md`);
      }
    }

    for (const ag of spec.agents || []) {
      warnings.push(`agent '${ag.name}' has no Codex equivalent; dropped`);
    }

    const hookFile = this.#hooks(spec, warnings);
    if (hookFile) files.push(hookFile);

    if (spec.mcpServers && spec.mcpServers.length) {
      files.push({
        path: '.mcp.json',
        content: this.#mcpFile(spec.mcpServers),
      });
    }

    files.push({
      path: 'README.md',
      content: this.#readme(spec),
    });

    this.assertNoMarketplaceWrite(files);

    return { files, warnings };
  }

  #manifest(spec, warnings) {
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
    if (spec.skills && spec.skills.length) m.skills = './skills/';

    const hasHooks = (spec.hooks || []).some(h => !HOOK_COMPAT.claudeOnly.includes(h.event));
    m.features = { plugin_hooks: hasHooks };
    if (hasHooks) m.hooks = './hooks/hooks.json';

    const iface = {};
    if (spec.displayName) iface.displayName = spec.displayName;
    if (spec.composerIcon) iface.composerIcon = spec.composerIcon;
    if (spec.defaultPrompt && spec.defaultPrompt.length) iface.defaultPrompt = spec.defaultPrompt;
    if (spec.interface) {
      if (spec.interface.logo) iface.logo = spec.interface.logo;
      if (spec.interface.screenshots) iface.screenshots = spec.interface.screenshots;
      if (spec.interface.brandColor) iface.brandColor = spec.interface.brandColor;
      if (spec.interface.capabilities) iface.capabilities = spec.interface.capabilities;
    }
    if (Object.keys(iface).length) m.interface = iface;

    return JSON.stringify(m, null, 2) + '\n';
  }

  #skillFile(sk, commands) {
    const fm = { name: sk.name, description: sk.description };
    if (sk['argument-hint']) fm['argument-hint'] = sk['argument-hint'];
    // Iterate the single-source-of-truth allowlist so adding a new
    // security-critical key only requires editing PRESERVED_SECURITY_KEYS.
    for (const k of PRESERVED_SECURITY_KEYS) {
      if (sk[k] != null) fm[k] = sk[k];
    }
    let body = sk.body || '';
    if (commands.length) {
      const cmdSection = ['', '## Commands (folded from Claude target)', ''];
      for (const c of commands) {
        cmdSection.push(`### /${c.name}`);
        cmdSection.push('');
        cmdSection.push(c.description);
        if (c.body) cmdSection.push('', c.body);
        cmdSection.push('');
      }
      body += '\n' + cmdSection.join('\n');
    }
    return yamlFrontmatter(fm) + body + '\n';
  }

  #codexSkillYaml(sk) {
    const out = { skill: { name: sk.name } };
    if (sk.codex) Object.assign(out.skill, sk.codex);
    return toYaml(out);
  }

  #hooks(spec, warnings) {
    const claudeOnly = new Set(HOOK_COMPAT.claudeOnly);
    const codexOnly = new Set(HOOK_COMPAT.codexOnly);
    const common = new Set(HOOK_COMPAT.common);

    const allowed = [];
    for (const h of spec.hooks || []) {
      if (claudeOnly.has(h.event)) {
        warnings.push(`hook event '${h.event}' is claude-only; dropped from codex target`);
        continue;
      }
      if (!common.has(h.event) && !codexOnly.has(h.event)) {
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
    const skillList = (spec.skills || []).map(s => `- **${s.name}** — ${s.description}`).join('\n') || '_none_';
    return `# ${spec.name}

> ${spec.description}

Version: ${spec.version}
License: ${spec.license || 'MIT'}

## Skills

${skillList}

## Install (Codex)

\`\`\`bash
codex plugin marketplace add ${spec.repository ? spec.repository.replace(/^https:\/\/github\.com\//, '') : '<owner>/<repo>'}
\`\`\`

Generated by [plugin-builder](https://github.com/developjik/plugin-tools/tree/main/plugins/plugin-builder).
`;
  }
}

function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return yamlScalar(obj);
  if (Array.isArray(obj)) {
    return obj.map(item => `${pad}- ${typeof item === 'object' ? '\n' + toYaml(item, indent + 1) : yamlScalar(item)}`).join('\n');
  }
  return Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'object' && v !== null) {
      return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
    }
    return `${pad}${k}: ${yamlScalar(v)}`;
  }).join('\n') + '\n';
}

module.exports = { CodexAdapter, PRESERVED_SECURITY_KEYS };
