'use strict';

const path = require('node:path');

const MARKETPLACE_FILES = new Set([
  '.claude-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
  '.cursor-plugin/marketplace.json',
]);

class PluginAdapter {
  constructor(target) {
    this.target = target;
  }

  render(spec) {
    throw new Error('render() must be implemented by subclass');
  }

  assertNoMarketplaceWrite(files) {
    for (const f of files) {
      const rel = f.path.replace(/^\/+/, '').replace(/\\/g, '/');
      if (MARKETPLACE_FILES.has(rel)) {
        throw new Error(
          `adapter '${this.target}' attempted to write marketplace file '${rel}'; ` +
          `marketplace.json is owned exclusively by core/marketplace-writer.js`
        );
      }
    }
  }
}

// YAML 1.2 special characters at start, plus indicator chars anywhere.
// Strings matching boolean/null/numeric YAML keywords MUST also be quoted
// to prevent silent type coercion downstream.
const YAML_RESERVED_SCALARS = new Set([
  '', 'null', 'Null', 'NULL', '~',
  'true', 'True', 'TRUE', 'false', 'False', 'FALSE',
  'yes', 'Yes', 'YES', 'no', 'No', 'NO',
  'on', 'On', 'ON', 'off', 'Off', 'OFF',
]);

// Build regexes via the constructor so the source file stays plain ASCII —
// embedding literal U+2028 / U+2029 in a `/.../` literal would terminate the
// regex token because both characters are recognised as line terminators by
// the JS lexer.
const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);
const U2028_RE = new RegExp(U2028, 'g');
const U2029_RE = new RegExp(U2029, 'g');
const LINE_SEPS_RE = new RegExp('[' + U2028 + U2029 + ']');

function needsYamlQuote(s) {
  if (s.length === 0) return true;
  if (YAML_RESERVED_SCALARS.has(s)) return true;
  // numeric forms (int, float, hex, octal, infinity, NaN)
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return true;
  if (/^[-+]?0x[0-9a-fA-F]+$/.test(s)) return true;
  if (/^[-+]?0o?[0-7]+$/.test(s)) return true;
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return true;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return true;
  // leading indicator characters
  if (/^[-?:,\[\]{}#&*!|>'"%@`\s]/.test(s)) return true;
  // trailing whitespace
  if (/\s$/.test(s)) return true;
  // structural / flow / comment / anchor / tag / alias / merge / directive markers
  // anywhere inside the value
  if (/[:#\n\r\t\f\v"'\\]/.test(s)) return true;
  if (/[\[\]{},]/.test(s)) return true;
  if (/\s#/.test(s)) return true;
  // non-printable / control chars
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(s)) return true;
  // U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) — YAML 1.2 §5.4
  // treats these as line breaks inside flow scalars; leaving them bare can
  // split a frontmatter value across lines.
  if (LINE_SEPS_RE.test(s)) return true;
  return false;
}

// JSON-encode then patch U+2028 / U+2029 which JSON.stringify leaves literal.
// Both YAML and downstream consumers treat those as hard line breaks.
function safeJsonString(v) {
  return JSON.stringify(v)
    .replace(U2028_RE, '\\u2028')
    .replace(U2029_RE, '\\u2029');
}

function yamlScalar(v) {
  if (typeof v === 'string') {
    if (needsYamlQuote(v)) return safeJsonString(v);
    return v;
  }
  if (v === null) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return safeJsonString(String(v));
    return safeJsonString(v);
  }
  if (typeof v === 'boolean') return safeJsonString(v);
  return safeJsonString(v);
}

function yamlFrontmatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else if (typeof v === 'object' && v !== null) {
      lines.push(`${k}: ${safeJsonString(v)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

module.exports = { PluginAdapter, MARKETPLACE_FILES, yamlScalar, yamlFrontmatter, needsYamlQuote };
