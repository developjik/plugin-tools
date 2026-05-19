'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../core/cli.js');

test('cli.parseArgs: positional + flags', () => {
  const r = parseArgs(['scaffold', '--spec', 'x.json', '--out', './a']);
  assert.deepEqual(r._, ['scaffold']);
  assert.equal(r.opts.spec, 'x.json');
  assert.equal(r.opts.out, './a');
});

test('cli.parseArgs: boolean flags', () => {
  const r = parseArgs(['validate', './p', '--strict', '--verbose']);
  assert.deepEqual(r._, ['validate', './p']);
  assert.equal(r.opts.strict, true);
  assert.equal(r.opts.verbose, true);
});

test('cli.parseArgs: --key=value form', () => {
  const r = parseArgs(['scaffold', '--spec=x.json', '--out=./a', '--no-publish=true']);
  assert.equal(r.opts.spec, 'x.json');
  assert.equal(r.opts.out, './a');
  assert.equal(r.opts['no-publish'], true);
});

test('cli.parseArgs: boolean followed by positional preserves positional', () => {
  // Pre-fix bug: '--strict ./p' captured './p' as the value of --strict.
  const r = parseArgs(['validate', '--strict', './p']);
  assert.deepEqual(r._, ['validate', './p']);
  assert.equal(r.opts.strict, true);
});

test('cli.parseArgs: unknown long flag throws', () => {
  assert.throws(() => parseArgs(['scaffold', '--unknown-thing', 'x']), /unknown flag/);
});

test('cli.parseArgs: value flag missing value throws', () => {
  assert.throws(() => parseArgs(['scaffold', '--spec']), /requires a value/);
});

test('cli.parseArgs: -- terminator passes through following tokens as positional', () => {
  const r = parseArgs(['scaffold', '--', '--spec', 'value']);
  assert.deepEqual(r._, ['scaffold', '--spec', 'value']);
});

test('cli.parseArgs: short alias resolves to long form', () => {
  const r = parseArgs(['scaffold', '-s', 'x.json', '-o', './a']);
  assert.equal(r.opts.spec, 'x.json');
  assert.equal(r.opts.out, './a');
});

test('cli.parseArgs: boolean=false explicit', () => {
  const r = parseArgs(['validate', './p', '--strict=false']);
  assert.equal(r.opts.strict, false);
});

test('cli.parseArgs: invalid boolean inline value throws', () => {
  assert.throws(() => parseArgs(['validate', './p', '--strict=maybe']), /boolean/);
});

test('cli.parseArgs: clustered short boolean flags (-Vq)', () => {
  const r = parseArgs(['validate', './p', '-Vq']);
  assert.equal(r.opts.verbose, true);
  assert.equal(r.opts.quiet, true);
});

test('cli.parseArgs: clustered short with unknown char throws', () => {
  assert.throws(() => parseArgs(['validate', './p', '-Vx']), /unknown short/);
});

test('cli.parseArgs: FLAGS single source of truth', () => {
  // BOOLEAN_FLAGS / VALUE_FLAGS / SHORT_ALIASES all derive from FLAGS.
  // Regression: adding a new flag should be a single FLAGS row edit.
  const cli = require('../core/cli.js');
  // exported indirectly via parseArgs behavior — verify a representative
  // sample of each kind round-trips correctly.
  assert.equal(parseArgs(['x', '--no-publish']).opts['no-publish'], true); // boolean
  assert.equal(parseArgs(['x', '--git-remote', 'a/b']).opts['git-remote'], 'a/b'); // value
  assert.equal(parseArgs(['x', '-h']).opts.help, true); // short alias
});
