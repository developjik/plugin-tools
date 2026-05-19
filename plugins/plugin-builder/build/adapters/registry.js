'use strict';

const { ClaudeCodeAdapter } = require('./claude-code.js');
const { CodexAdapter } = require('./codex.js');
const { CursorAdapter } = require('./cursor.js');

const REGISTRY = {
  'claude-code': () => new ClaudeCodeAdapter(),
  'codex': () => new CodexAdapter(),
  'cursor': () => new CursorAdapter(),
};

function get(target) {
  const factory = REGISTRY[target];
  if (!factory) throw new Error(`unknown target: ${target}`);
  return factory();
}

function all() {
  return Object.keys(REGISTRY);
}

module.exports = { get, all };
