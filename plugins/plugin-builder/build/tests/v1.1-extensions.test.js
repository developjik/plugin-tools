'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ir = require('../core/ir.js');
const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');
const { CodexAdapter } = require('../adapters/codex.js');
const { CursorAdapter } = require('../adapters/cursor.js');

// Minimal v1.1 spec body. Each test overlays a namespace section.
function base(overrides = {}) {
  return {
    specVersion: '1.1',
    name: 'ext-test-plugin',
    version: '0.1.0',
    description: 'v1.1 extension surface test plugin.',
    license: 'MIT',
    targets: ['claude-code', 'codex', 'cursor'],
    skills: [{
      name: 'demo-skill',
      description: 'Demonstration skill for v1.1 extension surface tests.',
      body: '# demo',
    }],
    ...overrides,
  };
}

// ---------- MCP args/env/headers ----------

test('mcp args/env emit on claude-code .mcp.json', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    mcpServers: [{
      name: 'demo-srv', transport: 'stdio', command: 'demo-mcp',
      args: ['--port', '8080'], env: { TOKEN: 'xyz' },
    }],
  }));
  const { files } = a.render(spec);
  const mcp = JSON.parse(files.find(f => f.path === '.mcp.json').content);
  assert.deepEqual(mcp.mcpServers['demo-srv'].args, ['--port', '8080']);
  assert.deepEqual(mcp.mcpServers['demo-srv'].env, { TOKEN: 'xyz' });
});

test('mcp args/env emit on codex .mcp.json', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({
    mcpServers: [{
      name: 'demo-srv', transport: 'stdio', command: 'demo-mcp',
      args: ['--debug'], env: { LOG: '1' },
    }],
  }));
  const { files } = a.render(spec);
  const mcp = JSON.parse(files.find(f => f.path === '.mcp.json').content);
  assert.deepEqual(mcp.mcpServers['demo-srv'].args, ['--debug']);
  assert.deepEqual(mcp.mcpServers['demo-srv'].env, { LOG: '1' });
});

test('mcp headers emit on http transport (cursor mcp.json)', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    mcpServers: [{
      name: 'remote-srv', transport: 'http', url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer xyz' },
    }],
  }));
  const { files } = a.render(spec);
  const mcp = JSON.parse(files.find(f => f.path === 'mcp.json').content);
  assert.deepEqual(mcp.mcpServers['remote-srv'].headers, { Authorization: 'Bearer xyz' });
});

test('ir.validate rejects mcp env value with non-string type', () => {
  const v = ir.validate({
    ...base(),
    mcpServers: [{ name: 'bad', transport: 'stdio', command: 'x', env: { TOKEN: 123 } }],
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('env.TOKEN')));
});

// ---------- Agent disallowedTools/model ----------

test('agent disallowedTools/model lift to claude frontmatter', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    agents: [{
      name: 'reviewer', description: 'Reviewer agent for tests.',
      tools: ['Read', 'Grep'], disallowedTools: ['Bash'], model: 'sonnet',
    }],
  }));
  const { files } = a.render(spec);
  const ag = files.find(f => f.path === 'agents/reviewer.md');
  assert.match(ag.content, /disallowedTools:/);
  assert.match(ag.content, /model: sonnet/);
  assert.match(ag.content, /- Bash/);
});

test('agent disallowedTools also lift on cursor', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    agents: [{
      name: 'reviewer', description: 'Reviewer agent.',
      disallowedTools: ['Write'], model: 'opus',
    }],
  }));
  const { files } = a.render(spec);
  const ag = files.find(f => f.path === 'agents/reviewer.md');
  assert.match(ag.content, /disallowedTools:/);
  assert.match(ag.content, /model: opus/);
});

// ---------- claude.* namespace ----------

test('claude.lsp emits .lsp.json + manifest pointer', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    claude: { lsp: [{ language: 'go', command: 'gopls', args: ['serve'], extensionToLanguage: { '.go': 'go' } }] },
  }));
  const { files } = a.render(spec);
  const lsp = files.find(f => f.path === '.lsp.json');
  assert.ok(lsp);
  const obj = JSON.parse(lsp.content);
  assert.equal(obj.go.command, 'gopls');
  const m = JSON.parse(files.find(f => f.path === '.claude-plugin/plugin.json').content);
  assert.equal(m.lspServers, './.lsp.json');
});

test('claude.monitors emits monitors/monitors.json + manifest pointer', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    claude: { monitors: [{ name: 'err-log', command: 'tail -F ./logs/error.log' }] },
  }));
  const { files } = a.render(spec);
  const mon = files.find(f => f.path === 'monitors/monitors.json');
  assert.ok(mon);
  const arr = JSON.parse(mon.content);
  assert.equal(arr[0].name, 'err-log');
  const m = JSON.parse(files.find(f => f.path === '.claude-plugin/plugin.json').content);
  assert.equal(m.monitors, './monitors/monitors.json');
});

test('claude.bin writes file under bin/', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    claude: { bin: [{ path: 'my-tool', content: '#!/usr/bin/env bash\necho hi\n' }] },
  }));
  const { files } = a.render(spec);
  const bin = files.find(f => f.path === 'bin/my-tool');
  assert.ok(bin);
  assert.match(bin.content, /echo hi/);
});

test('ir.validate rejects claude.bin absolute or .. path', () => {
  const v1 = ir.validate({ ...base(), claude: { bin: [{ path: '/abs/path' }] } });
  assert.equal(v1.ok, false);
  const v2 = ir.validate({ ...base(), claude: { bin: [{ path: '../escape' }] } });
  assert.equal(v2.ok, false);
});

test('claude.settings emits settings.json', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    claude: { settings: { agent: 'security-reviewer' } },
  }));
  const { files } = a.render(spec);
  const s = files.find(f => f.path === 'settings.json');
  assert.ok(s);
  assert.equal(JSON.parse(s.content).agent, 'security-reviewer');
});

test('claude.userConfig lifts into manifest userConfig', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    claude: {
      userConfig: {
        api_key: { type: 'string', title: 'API Key', sensitive: true, required: true },
      },
    },
  }));
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.claude-plugin/plugin.json').content);
  assert.equal(m.userConfig.api_key.title, 'API Key');
  assert.equal(m.userConfig.api_key.sensitive, true);
});

test('claude.agentExtras overlays onto top-level agent frontmatter', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    agents: [{ name: 'reviewer', description: 'Reviewer with overlay extras.' }],
    claude: {
      agentExtras: {
        reviewer: { effort: 'high', maxTurns: 5, isolation: 'worktree' },
      },
    },
  }));
  const { files } = a.render(spec);
  const ag = files.find(f => f.path === 'agents/reviewer.md');
  assert.match(ag.content, /effort: high/);
  assert.match(ag.content, /maxTurns:/);
  assert.match(ag.content, /isolation: worktree/);
});

test('claude.agentExtras blocks tools∩disallowedTools privilege conflict', () => {
  const v = ir.validate({
    ...base(),
    agents: [{ name: 'r', description: 'Reviewer agent for conflict test.', tools: ['Bash', 'Read'] }],
    claude: { agentExtras: { r: { disallowedTools: ['Bash'] } } },
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('conflict with agents[r]')));
});

// ---------- codex.* namespace ----------

test('codex.apps emits .app.json + manifest apps pointer', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({
    codex: { apps: [{ name: 'github', provider: 'github', auth: 'oauth', scopes: ['repo'] }] },
  }));
  const { files } = a.render(spec);
  const app = files.find(f => f.path === '.app.json');
  assert.ok(app);
  const obj = JSON.parse(app.content);
  assert.equal(obj.apps[0].name, 'github');
  assert.equal(obj.apps[0].auth, 'oauth');
  const m = JSON.parse(files.find(f => f.path === '.codex-plugin/plugin.json').content);
  assert.equal(m.apps, './.app.json');
});

test('codex.features merges into manifest features', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({
    codex: { features: { custom_flag: true } },
  }));
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.codex-plugin/plugin.json').content);
  assert.equal(m.features.custom_flag, true);
  assert.equal(m.features.plugin_hooks, false);
});

test('codex.interfaceMeta lifts into manifest interface block', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({
    codex: {
      interfaceMeta: {
        shortDescription: 'Short blurb',
        developerName: 'developjik',
        websiteURL: 'https://example.com',
      },
    },
  }));
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.codex-plugin/plugin.json').content);
  assert.equal(m.interface.shortDescription, 'Short blurb');
  assert.equal(m.interface.developerName, 'developjik');
  assert.equal(m.interface.websiteURL, 'https://example.com');
});

test('ir.validate rejects codex.interfaceMeta unsafe URL', () => {
  const v = ir.validate({
    ...base(),
    codex: { interfaceMeta: { websiteURL: 'javascript:alert(1)' } },
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('websiteURL')));
});

// ---------- cursor.* namespace ----------

test('cursor.commandExtension switches commands extension', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    targets: ['cursor'],
    commands: [{ name: 'do-it', description: 'Do something.' }],
    cursor: { commandExtension: 'mdc' },
  }));
  const { files } = a.render(spec);
  assert.ok(files.find(f => f.path === 'commands/do-it.mdc'));
  assert.equal(files.find(f => f.path === 'commands/do-it.md'), undefined);
});

test('cursor.inlineHooks embeds hooks into manifest, suppresses hooks.json', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    targets: ['cursor'],
    hooks: [{ event: 'PreToolUse', command: 'scripts/x.sh' }],
    cursor: { inlineHooks: true },
  }));
  const { files } = a.render(spec);
  assert.equal(files.find(f => f.path === 'hooks/hooks.json'), undefined);
  const m = JSON.parse(files.find(f => f.path === '.cursor-plugin/plugin.json').content);
  assert.ok(m.hooks.preToolUse);
  assert.equal(m.hooks.preToolUse[0].command, 'scripts/x.sh');
});

test('cursor.inlineMcp embeds mcpServers into manifest, suppresses mcp.json', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    targets: ['cursor'],
    mcpServers: [{ name: 'demo', transport: 'stdio', command: 'demo-mcp' }],
    cursor: { inlineMcp: true },
  }));
  const { files } = a.render(spec);
  assert.equal(files.find(f => f.path === 'mcp.json'), undefined);
  const m = JSON.parse(files.find(f => f.path === '.cursor-plugin/plugin.json').content);
  assert.equal(m.mcpServers.demo.command, 'demo-mcp');
});

test('cursor.displayName/publisher/tags emit to manifest', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    targets: ['cursor'],
    cursor: { displayName: 'My Plugin', publisher: 'developjik', tags: ['ai', 'lint'] },
  }));
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.cursor-plugin/plugin.json').content);
  assert.equal(m.displayName, 'My Plugin');
  assert.equal(m.publisher, 'developjik');
  assert.deepEqual(m.tags, ['ai', 'lint']);
});

test('ir.validate rejects cursor.commandExtension outside enum', () => {
  const v = ir.validate({ ...base(), cursor: { commandExtension: 'rs' } });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('commandExtension')));
});

// ---------- Cross-target warnings ----------

test('claude-code adapter warns when codex.apps present', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    codex: { apps: [{ name: 'gh', provider: 'github' }] },
  }));
  const { warnings } = a.render(spec);
  assert.ok(warnings.some(w => w.includes('codex.apps')));
});

test('codex adapter warns when claude.lsp present', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({
    claude: { lsp: [{ language: 'go', command: 'gopls' }] },
  }));
  const { warnings } = a.render(spec);
  assert.ok(warnings.some(w => w.includes('claude.lsp')));
});

test('cursor adapter warns when codex.interfaceMeta present', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize(base({
    targets: ['cursor'],
    codex: { interfaceMeta: { shortDescription: 'x' } },
  }));
  const { warnings } = a.render(spec);
  assert.ok(warnings.some(w => w.includes('codex.interfaceMeta')));
});

test('codex adapter warns when cursor.commandExtension set', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({
    cursor: { commandExtension: 'mdc' },
  }));
  const { warnings } = a.render(spec);
  assert.ok(warnings.some(w => w.includes('cursor.commandExtension')));
});

test('claude adapter warns when cursor.publisher set', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    cursor: { publisher: 'developjik' },
  }));
  const { warnings } = a.render(spec);
  assert.ok(warnings.some(w => w.includes('cursor.publisher')));
});

// ---------- Hook type extension ----------

test('hook type=prompt emits prompt body in inner hook block', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    hooks: [{ event: 'PreToolUse', type: 'prompt', prompt: 'Confirm intent.' }],
  }));
  const { files } = a.render(spec);
  const h = JSON.parse(files.find(f => f.path === 'hooks/hooks.json').content);
  const inner = h.hooks.PreToolUse[0].hooks[0];
  assert.equal(inner.type, 'prompt');
  assert.equal(inner.prompt, 'Confirm intent.');
});

test('hook statusMessage propagates to inner block', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({
    hooks: [{ event: 'SessionStart', command: 'scripts/init.sh', statusMessage: 'Loading' }],
  }));
  const { files } = a.render(spec);
  const h = JSON.parse(files.find(f => f.path === 'hooks/hooks.json').content);
  const inner = h.hooks.SessionStart[0].hooks[0];
  assert.equal(inner.statusMessage, 'Loading');
});

test('ir.validate rejects hook type=http without url', () => {
  const v = ir.validate({
    ...base(),
    hooks: [{ event: 'PreToolUse', type: 'http' }],
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('url') && e.includes('http')));
});

// ---------- spec v1.0 backward compat ----------

test('v1.0 spec still accepted by validator', () => {
  const v = ir.validate({
    specVersion: '1.0',
    name: 'compat-plugin',
    version: '0.1.0',
    description: 'Backward compat test plugin.',
    targets: ['claude-code'],
  });
  assert.equal(v.ok, true);
});

// ---------- spec.keywords passthrough ----------

test('spec.keywords appears in claude manifest', () => {
  const a = new ClaudeCodeAdapter();
  const spec = ir.normalize(base({ keywords: ['lint', 'i18n'] }));
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.claude-plugin/plugin.json').content);
  assert.deepEqual(m.keywords, ['lint', 'i18n']);
});

test('spec.keywords appears in codex manifest', () => {
  const a = new CodexAdapter();
  const spec = ir.normalize(base({ keywords: ['lint', 'i18n'] }));
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.codex-plugin/plugin.json').content);
  assert.deepEqual(m.keywords, ['lint', 'i18n']);
});
