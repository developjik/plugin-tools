# Plugin Tools

This workspace manages two independent dual-platform plugins:

| Plugin | Purpose |
|---|---|
| `plugins/plugin-builder` | Scaffold, validate, and publish Claude Code plus Codex plugins from one UnifiedSpec. |
| `plugins/plugin-eval` | Evaluate local skills and plugins, explain scores, and guide improvement work. |

The project keeps build and evaluation as separate plugin surfaces. `plugin-builder` creates and validates plugin bundles; `plugin-eval` reviews those bundles and their skills.

## Layout

```text
plugins/
  plugin-builder/
    .codex-plugin/
    .claude-plugin/
    skills/
    bin/
    build/
  plugin-eval/
    .codex-plugin/
    .claude-plugin/
    skills/
    src/
    scripts/
```

## Common Commands

```bash
npm test
npm run lint
npm run eval:all
npm run validate:claude
```

Run a single plugin evaluation:

```bash
npm run eval:builder
npm run eval:eval
```

Run a single plugin's own tests:

```bash
npm run test:builder
npm run test:eval
```

## Local Marketplace

The root marketplace catalogs expose both plugins from this workspace:

- Codex: `.agents/plugins/marketplace.json`
- Claude Code: `.claude-plugin/marketplace.json`

Each plugin also keeps its own internal manifests and local marketplace metadata so it can still be developed, validated, or packaged independently.

## Development Rule

Keep plugin identity separate:

- do not merge `plugin-eval` skills into `plugin-builder`
- do not make the root directory an installable plugin
- only place truly shared runtime code in a future `packages/` directory

## Current Evaluation Status

As of 2026-05-19, both plugins and all bundled skills evaluate cleanly with `plugin-eval`:

- `plugin-builder`: 100/A, low risk, no required or recommended fixes
- `plugin-eval`: 100/A, low risk, no required or recommended fixes
- all 9 bundled skills: 100/A, low risk, no required or recommended fixes

The detailed status table lives in `docs/evaluation-summary.md`.
