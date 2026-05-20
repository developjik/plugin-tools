'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ir = require('../core/ir.js');
const renderer = require('../core/renderer.js');
const registry = require('../adapters/registry.js');
const validator = require('../core/validator.js');

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-spec.json'), 'utf8'));

function specFor(name, targets = ['claude-code', 'codex']) {
  return {
    specVersion: '1.0',
    name,
    version: '0.1.0',
    description: 'validator marketplace fixture',
    targets,
  };
}

function scaffoldToTmp(spec) {
  const normalized = ir.normalize(spec);
  const allFiles = [];
  const warnings = [];
  for (const t of normalized.targets) {
    const a = registry.get(t);
    const r = a.render(normalized);
    allFiles.push(...r.files);
    warnings.push(...r.warnings);
  }
  const seen = new Map();
  for (const f of allFiles) seen.set(f.path, f);
  const stage = renderer.stageWrite([...seen.values()]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-out-'));
  renderer.promote(stage, out);
  return { out, warnings };
}

test('validator: stage A passes on valid spec', () => {
  const r = validator.runAll('/nonexistent', { spec: SAMPLE });
  const a = r.results.find(x => x.stage === 'a');
  assert.equal(a.status, 'PASS', a.reason);
});

test('validator: stage B/C pass on freshly scaffolded plugin', () => {
  const { out } = scaffoldToTmp(SAMPLE);
  try {
    const r = validator.runAll(out, { spec: SAMPLE });
    const b = r.results.find(x => x.stage === 'b');
    const c = r.results.find(x => x.stage === 'c');
    assert.equal(b.status, 'PASS', b.reason);
    assert.equal(c.status, 'PASS', c.reason);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validator: stage D/E SKIP when CLIs missing', () => {
  const { out } = scaffoldToTmp(SAMPLE);
  try {
    const r = validator.runAll(out, { spec: SAMPLE });
    const d = r.results.find(x => x.stage === 'd');
    const e = r.results.find(x => x.stage === 'e');
    assert.ok(['PASS', 'SKIP'].includes(d.status), `d=${d.status}: ${d.reason}`);
    assert.ok(['PASS', 'SKIP'].includes(e.status), `e=${e.status}: ${e.reason}`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validator: stage F passes when valid marketplace.json present', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-mp-'));
  try {
    fs.mkdirSync(path.join(out, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(out, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'test',
      owner: { name: 'x' },
      plugins: [{ name: 'p1', source: 'local', path: '.' }],
    }));
    const r = validator.runAll(out, { spec: specFor('p1', ['claude-code']) });
    const f = r.results.find(x => x.stage === 'f');
    assert.equal(f.status, 'PASS', f.reason);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validator: stage F passes when both Claude and Codex marketplaces are valid', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-dual-mp-'));
  try {
    fs.mkdirSync(path.join(out, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(out, '.agents', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(out, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'test',
      owner: { name: 'x' },
      plugins: [{ name: 'p1', source: 'local', path: './p1' }],
    }));
    fs.writeFileSync(path.join(out, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
      name: 'test',
      interface: { displayName: 'Test' },
      plugins: [{ name: 'p1', source: { source: 'local', path: './p1' } }],
    }));
    const r = validator.runAll(out, { spec: specFor('p1') });
    const f = r.results.find(x => x.stage === 'f');
    assert.equal(f.status, 'PASS', f.reason);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validator: stage F passes for v0.7 plugin dir with catalogs in parent root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-parent-mp-'));
  const pluginDir = path.join(root, 'p1');
  try {
    fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(root, '.agents', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'p1' }));
    fs.writeFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'test',
      owner: { name: 'x' },
      plugins: [{ name: 'p1', source: 'local', path: './p1' }],
    }));
    fs.writeFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
      name: 'test',
      plugins: [{ name: 'p1', source: { source: 'local', path: './p1' } }],
    }));
    const r = validator.runAll(pluginDir, { spec: specFor('p1') });
    const f = r.results.find(x => x.stage === 'f');
    assert.equal(f.status, 'PASS', f.reason);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validator: stage F FAILS when cursor target lacks cursor marketplace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-missing-cursor-mp-'));
  const pluginDir = path.join(root, 'p1');
  try {
    fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginDir, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginDir, '.cursor-plugin'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(root, '.agents', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'p1' }));
    fs.writeFileSync(path.join(pluginDir, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'p1' }));
    fs.writeFileSync(path.join(pluginDir, '.cursor-plugin', 'plugin.json'), JSON.stringify({ name: 'p1' }));
    fs.writeFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'test',
      owner: { name: 'x' },
      plugins: [{ name: 'p1', source: 'local', path: './p1' }],
    }));
    fs.writeFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
      name: 'test',
      plugins: [{ name: 'p1', source: { source: 'local', path: './p1' } }],
    }));
    const r = validator.runAll(pluginDir, { spec: specFor('p1', ['claude-code', 'codex', 'cursor']) });
    const f = r.results.find(x => x.stage === 'f');
    assert.equal(f.status, 'FAIL');
    assert.match(f.reason, /Cursor: missing marketplace catalog/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validator: stage F FAILS on duplicate plugin entry', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-mp-dup-'));
  try {
    fs.mkdirSync(path.join(out, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(out, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'test',
      owner: { name: 'x' },
      plugins: [
        { name: 'p1', source: 'local', path: '.' },
        { name: 'p1', source: 'local', path: '.' },
      ],
    }));
    const r = validator.runAll(out, { spec: SAMPLE });
    const f = r.results.find(x => x.stage === 'f');
    assert.equal(f.status, 'FAIL');
    assert.match(f.reason, /duplicate/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validator: stage F FAILS on invalid Codex marketplace entry', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-test-codex-mp-bad-'));
  try {
    fs.mkdirSync(path.join(out, '.agents', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(out, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({
      name: 'test',
      plugins: [{ name: 'p1', source: { source: 'local' } }],
    }));
    const r = validator.runAll(out, { spec: SAMPLE });
    const f = r.results.find(x => x.stage === 'f');
    assert.equal(f.status, 'FAIL');
    assert.match(f.reason, /source\.path/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
