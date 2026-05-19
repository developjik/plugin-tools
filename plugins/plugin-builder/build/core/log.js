'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const envLvl = (process.env.PLUGIN_BUILDER_LOG || 'info').toLowerCase();
let current = LEVELS[envLvl] ?? LEVELS.info;

function setLevel(name) {
  if (LEVELS[name] != null) current = LEVELS[name];
}

function emit(level, msg, extra) {
  if (LEVELS[level] < current) return;
  const line = extra
    ? `[${level}] ${msg} ${JSON.stringify(extra)}`
    : `[${level}] ${msg}`;
  process.stderr.write(line + '\n');
}

module.exports = {
  setLevel,
  debug: (m, e) => emit('debug', m, e),
  info: (m, e) => emit('info', m, e),
  warn: (m, e) => emit('warn', m, e),
  error: (m, e) => emit('error', m, e),
};
