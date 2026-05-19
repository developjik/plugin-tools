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

const SPEC_PATH = path.join(__dirname, 'fixtures', 'self-host-spec.json');

test('self-host: plugin-builder scaffolds its own skeleton and passes (a)+(b)+(c)', () => {
  const raw = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const v = ir.validate(raw);
  assert.equal(v.ok, true, 'spec invalid: ' + v.errors.join('; '));
  const spec = ir.normalize(raw);

  const allFiles = [];
  const warnings = [];
  for (const t of spec.targets) {
    const a = registry.get(t);
    const r = a.render(spec);
    allFiles.push(...r.files);
    warnings.push(...r.warnings);
  }

  const seen = new Map();
  for (const f of allFiles) seen.set(f.path, f);

  const stage = renderer.stageWrite([...seen.values()]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-self-host-'));
  try {
    renderer.promote(stage, out);

    assert.ok(fs.existsSync(path.join(out, '.claude-plugin', 'plugin.json')));
    assert.ok(fs.existsSync(path.join(out, '.codex-plugin', 'plugin.json')));
    assert.ok(fs.existsSync(path.join(out, 'commands', 'new.md')));
    assert.ok(fs.existsSync(path.join(out, 'commands', 'validate.md')));
    assert.ok(fs.existsSync(path.join(out, 'commands', 'publish.md')));
    assert.ok(fs.existsSync(path.join(out, 'commands', 'marketplace-init.md')));
    assert.ok(fs.existsSync(path.join(out, 'skills', 'plugin-builder', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(out, 'skills', 'plugin-builder-scaffold', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(out, 'skills', 'plugin-builder-validate', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(out, 'skills', 'plugin-builder-marketplace', 'SKILL.md')));

    const res = validator.runAll(out, { spec });
    const a = res.results.find(x => x.stage === 'a');
    const b = res.results.find(x => x.stage === 'b');
    const c = res.results.find(x => x.stage === 'c');
    assert.equal(a.status, 'PASS', a.reason);
    assert.equal(b.status, 'PASS', b.reason);
    assert.equal(c.status, 'PASS', c.reason);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
