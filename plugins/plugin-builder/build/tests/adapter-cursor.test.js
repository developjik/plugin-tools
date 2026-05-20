'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ir = require('../core/ir.js');
const { CursorAdapter } = require('../adapters/cursor.js');

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-spec.json'), 'utf8'));

function specWithTarget() {
  return { ...SAMPLE, targets: ['cursor'] };
}

test('cursor adapter: emits manifest at .cursor-plugin/plugin.json', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const m = files.find(f => f.path === '.cursor-plugin/plugin.json');
  assert.ok(m, '.cursor-plugin/plugin.json must be emitted');
  const obj = JSON.parse(m.content);
  assert.equal(obj.name, 'my-i18n-guard');
  assert.equal(obj.version, '0.1.0');
  assert.equal(obj.skills, './skills/');
  assert.equal(obj.mcpServers, './mcp.json');
});

test('cursor adapter: never writes .claude-plugin or .codex-plugin manifests', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  assert.equal(files.find(f => f.path === '.claude-plugin/plugin.json'), undefined);
  assert.equal(files.find(f => f.path === '.codex-plugin/plugin.json'), undefined);
});

test('cursor adapter: emits commands as commands/<name>.md with frontmatter', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const c = files.find(f => f.path === 'commands/check.md');
  assert.ok(c, 'commands/check.md must be emitted');
  assert.match(c.content, /name: check/);
  assert.match(c.content, /description:/);
});

test('cursor adapter: emits agents as agents/<name>.md with frontmatter', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    agents: [{ name: 'reviewer-bot', description: 'reviewer agent for cursor target' }],
  });
  const { files } = a.render(spec);
  const ag = files.find(f => f.path === 'agents/reviewer-bot.md');
  assert.ok(ag, 'agents/reviewer-bot.md must be emitted');
  assert.match(ag.content, /name: reviewer-bot/);
});

test('cursor adapter: emits rules as rules/<name>.mdc with .mdc frontmatter', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    rules: [{
      name: 'prefer-const',
      description: 'Prefer const over let for variables never reassigned',
      alwaysApply: true,
      globs: ['**/*.ts', '**/*.tsx'],
      body: 'Always use const.',
    }],
  });
  const { files } = a.render(spec);
  const r = files.find(f => f.path === 'rules/prefer-const.mdc');
  assert.ok(r, 'rules/prefer-const.mdc must be emitted');
  assert.match(r.content, /description: Prefer const/);
  assert.match(r.content, /alwaysApply: true/);
  assert.match(r.content, /globs:/);
});

test('cursor adapter: manifest references rules/agents/commands paths when present', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    rules: [{ name: 'r1', description: 'rule one description here long enough' }],
    agents: [{ name: 'a1', description: 'agent one' }],
  });
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.cursor-plugin/plugin.json').content);
  assert.equal(m.rules, './rules/');
  assert.equal(m.agents, './agents/');
  assert.equal(m.commands, './commands/');
  assert.equal(m.skills, './skills/');
});

test('cursor adapter: emits SKILL.md preserving security frontmatter', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const s = files.find(f => f.path === 'skills/i18n-key-guard/SKILL.md');
  assert.ok(s);
  assert.match(s.content, /name: i18n-key-guard/);
  assert.match(s.content, /disable-model-invocation:/);
  assert.match(s.content, /user-invocable:/);
  assert.match(s.content, /allowed-tools:/);
});

test('cursor adapter: hook event names rewritten to camelCase', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const h = files.find(f => f.path === 'hooks/hooks.json');
  assert.ok(h);
  const obj = JSON.parse(h.content);
  assert.ok(obj.hooks.preToolUse, 'PreToolUse must be rewritten to preToolUse');
  assert.equal(obj.hooks.PreToolUse, undefined, 'PascalCase must not survive');
});

test('cursor adapter: hooks.json uses flat {event: [{command, matcher?}]} schema, not Claude nested wrapper', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const h = files.find(f => f.path === 'hooks/hooks.json');
  const obj = JSON.parse(h.content);
  const entries = obj.hooks.preToolUse;
  assert.ok(Array.isArray(entries), 'event value must be array');
  for (const e of entries) {
    assert.equal(typeof e.command, 'string', 'entry must carry .command directly');
    assert.equal(e.type, undefined, 'cursor entries must NOT carry Claude-style {type: "command"} wrapper');
    assert.equal(e.hooks, undefined, 'cursor entries must NOT carry Claude-style nested .hooks[] wrapper');
  }
});

test('cursor adapter: maps Stop/UserPromptSubmit/SubagentStop/PreCompact to camelCase Cursor events', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    hooks: [
      { event: 'Stop', command: 'scripts/stop.sh' },
      { event: 'UserPromptSubmit', command: 'scripts/prompt.sh' },
      { event: 'SubagentStop', command: 'scripts/subagent.sh' },
      { event: 'PreCompact', command: 'scripts/precompact.sh' },
    ],
  });
  const { files } = a.render(spec);
  const obj = JSON.parse(files.find(f => f.path === 'hooks/hooks.json').content);
  assert.ok(obj.hooks.stop);
  assert.ok(obj.hooks.beforeSubmitPrompt);
  assert.ok(obj.hooks.subagentStop);
  assert.ok(obj.hooks.preCompact);
});

test('cursor adapter: workspaceOpen + new cursor-only events pass through verbatim', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    hooks: [
      { event: 'workspaceOpen', command: 'scripts/ws.sh' },
      { event: 'beforeMCPExecution', command: 'scripts/mcp-pre.sh' },
      { event: 'afterAgentResponse', command: 'scripts/resp.sh' },
      { event: 'beforeReadFile', command: 'scripts/read.sh' },
    ],
  });
  const { files } = a.render(spec);
  const obj = JSON.parse(files.find(f => f.path === 'hooks/hooks.json').content);
  assert.ok(obj.hooks.workspaceOpen);
  assert.ok(obj.hooks.beforeMCPExecution);
  assert.ok(obj.hooks.afterAgentResponse);
  assert.ok(obj.hooks.beforeReadFile);
});

test('cursor adapter: drops codex-only and claude-only hook events with warnings', () => {
  const a = new CursorAdapter();
  const { warnings } = a.render(ir.normalize(specWithTarget()));
  assert.ok(warnings.some(w => w.includes('PermissionRequest')), 'codex-only event drop warning');
  assert.ok(warnings.some(w => w.includes('Notification')), 'claude-only event drop warning');
});

test('cursor adapter: passes through cursor-only events verbatim', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    hooks: [
      { event: 'afterFileEdit', command: 'scripts/fmt.sh' },
      { event: 'beforeShellExecution', command: 'scripts/audit.sh' },
    ],
  });
  const { files } = a.render(spec);
  const h = files.find(f => f.path === 'hooks/hooks.json');
  assert.ok(h);
  const obj = JSON.parse(h.content);
  assert.ok(obj.hooks.afterFileEdit);
  assert.ok(obj.hooks.beforeShellExecution);
});

test('cursor adapter: mcp.json emitted at repository root, not .mcp.json', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const mcp = files.find(f => f.path === 'mcp.json');
  assert.ok(mcp, 'mcp.json at root expected');
  assert.equal(files.find(f => f.path === '.mcp.json'), undefined, '.mcp.json must not be emitted for cursor');
  const obj = JSON.parse(mcp.content);
  assert.ok(obj.mcpServers.lokalise);
  assert.equal(obj.mcpServers.lokalise.command, 'lokalise-mcp');
});

test('cursor adapter: never writes marketplace.json', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  assert.equal(files.find(f => f.path.endsWith('marketplace.json')), undefined);
});

test('cursor adapter: README emitted with /add-plugin install hint', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize(specWithTarget()));
  const r = files.find(f => f.path === 'README.md');
  assert.ok(r);
  assert.match(r.content, /\/add-plugin my-i18n-guard/);
});

test('cursor adapter: drops claude-only skill style keys with warnings', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({
    ...specWithTarget(),
    skills: [{
      name: 'styled-skill',
      description: 'Skill with claude-only style keys for testing drop behavior.',
      model: 'sonnet',
      effort: 'low',
      paths: ['src/**'],
    }],
  });
  const { warnings } = a.render(spec);
  assert.ok(warnings.some(w => w.includes("'model'")), "model key drop warning");
  assert.ok(warnings.some(w => w.includes("'effort'")), "effort key drop warning");
  assert.ok(warnings.some(w => w.includes("'paths'")), "paths key drop warning");
});

test('cursor adapter: keywords folded from category', () => {
  const a = new CursorAdapter();
  const { files } = a.render(ir.normalize({ ...specWithTarget(), category: 'dev-tools' }));
  const m = JSON.parse(files.find(f => f.path === '.cursor-plugin/plugin.json').content);
  assert.deepEqual(m.keywords, ['dev-tools']);
});

test('cursor adapter: spec.cursor.keywords overrides category fold', () => {
  const a = new CursorAdapter();
  const spec = ir.normalize({ ...specWithTarget(), category: 'dev-tools', cursor: { keywords: ['ai', 'lint'] } });
  // ir.normalize doesn't preserve spec.cursor — pass through raw for this test.
  spec.cursor = { keywords: ['ai', 'lint'] };
  const { files } = a.render(spec);
  const m = JSON.parse(files.find(f => f.path === '.cursor-plugin/plugin.json').content);
  assert.deepEqual(m.keywords, ['ai', 'lint']);
});
