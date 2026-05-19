# Development — plugin-builder

> Contributor setup. End users install via plugin marketplace (see [README.md](../../README.md)).

## Local checkout

```bash
git clone https://github.com/developjik/plugin-builder
cd plugin-builder
node --version    # require >= 20
```

Zero npm dependencies. No `npm install` step.

## Run the test suite

```bash
npm test
# or
node --test build/tests/*.test.js
```

Currently 132/132 tests PASS.

## Layout

| dir | purpose |
|---|---|
| `bin/plugin-builder` | Node CLI entrypoint (engines.node guard + delegate to `core/cli.js`) |
| `build/core/` | CLI, IR, validator, renderer, marketplace writer, lockfile, log |
| `build/adapters/` | Per-target rendering (`claude-code.js`, `codex.js`) |
| `build/schemas/v1/` | UnifiedSpec JSON schema + hook event compat table |
| `commands/` | User-facing slash command definitions |
| `skills/` | User-facing skill orchestrator + internal sub-skills |
| `build/tests/` | `node:test` test files + `fixtures/` |
| `build/docs/` | Archived full docs and design history |
| `build/docs/docs/internal/` | Contributor docs (this directory) |
| `.claude-plugin/` | Claude Code plugin manifest + marketplace entry |
| `.codex-plugin/` | OpenAI Codex plugin manifest |
| `.plugin-eval/` | Plugin Eval benchmark config and measurement policy |

## End-to-end smoke

```bash
node bin/plugin-builder scaffold \
  --spec build/tests/fixtures/sample-spec.json \
  --out /tmp/pb-smoke-out

node bin/plugin-builder validate /tmp/pb-smoke-out/my-i18n-guard \
  --spec build/tests/fixtures/sample-spec.json

node bin/plugin-builder publish /tmp/pb-smoke-out/my-i18n-guard \
  --git-remote testowner/sample
```

### v0.7 root-flat marketplace smoke

```bash
node bin/plugin-builder marketplace init /tmp/pb-mp \
  --owner-name "Test User"

node bin/plugin-builder scaffold \
  --spec build/tests/fixtures/sample-spec.json \
  --out /tmp/pb-mp

# Re-run = no-op (idempotent).
node bin/plugin-builder scaffold \
  --spec build/tests/fixtures/sample-spec.json \
  --out /tmp/pb-mp
```

## Plugin Eval quality gate

```bash
node /Users/developjik/.codex/plugins/cache/openai-curated/plugin-eval/eed16198/scripts/plugin-eval.js analyze . --format markdown
```

Expected current result:

- Plugin report: 100/100, Grade A, low risk
- Nested skills: 4/4 skills score 100/100
- No Fix First items and no checks

Observed usage is a separate benchmark baseline. Keep usage JSONL files out of durable state until at least 5 representative successful samples exist; see `../../../../.plugin-eval/MEASUREMENT.md`.

## Releasing

1. Bump `version` in **four** places (they must agree):
   - `package.json`
   - `.claude-plugin/plugin.json`
   - `.codex-plugin/plugin.json`
   - `.claude-plugin/marketplace.json` (the `plugins[0].version` entry)
2. Update `DESIGN.md` title + §0 build notes.
3. Tag the commit (`git tag v<version>`).
4. Verify `npm test` is green.
5. Confirm `node bin/plugin-builder version` prints the new version.

## See also

- [CLI.md](./CLI.md) — internal CLI contract
- [../REVIEW.md](../REVIEW.md) — open review items / known gaps
- [../../DESIGN.md](../../DESIGN.md) — architecture, IR schema, phase plan
