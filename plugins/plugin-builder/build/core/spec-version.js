'use strict';

const SUPPORTED = ['1.0', '1.1'];
const CURRENT = '1.1';

function check(spec) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, reason: 'spec must be object' };
  }
  if (!spec.specVersion) {
    return { ok: false, reason: 'specVersion missing; expected one of: ' + SUPPORTED.join(',') };
  }
  if (!SUPPORTED.includes(spec.specVersion)) {
    return { ok: false, reason: `specVersion ${spec.specVersion} unsupported; supported: ${SUPPORTED.join(',')}` };
  }
  return { ok: true };
}

module.exports = { SUPPORTED, CURRENT, check };
