# plugin-builder

Plugin Builder scaffolds Claude Code and OpenAI Codex plugins from one UnifiedSpec.

## Use

Install the marketplace, then ask naturally to create, validate, publish, or initialize a plugin marketplace.

```bash
# Claude Code
/plugin marketplace add developjik/plugin-builder
/plugin install plugin-builder@plugin-builder-official

# Codex
codex plugin marketplace add github:developjik/plugin-builder
codex plugin install plugin-builder
```

User-facing commands:

| Command | Purpose |
|---|---|
| `/plugin-builder:new [name]` | Create a Claude Code + Codex plugin and register it in a marketplace root |
| `/plugin-builder:marketplace-init <root>` | Create Claude and Codex marketplace catalogs |
| `/plugin-builder:validate <plugin-dir>` | Run the 6-stage validator |
| `/plugin-builder:publish <plugin-dir>` | Patch both marketplace catalogs at the parent root |

Generated plugins use the v0.7 root-flat layout: `<root>/<plugin-name>/`.

## Developer Notes

Development source, tests, and long-form design history live under `build/` so the plugin root stays close to the installable bundle. The CLI entrypoint remains `bin/plugin-builder`.

```bash
npm test
npm run lint
```

## Quality Gate

Current structural gate:

```bash
npm test
node /Users/developjik/.codex/plugins/cache/openai-curated/plugin-eval/eed16198/scripts/plugin-eval.js analyze . --format markdown
```

Expected current result:

- Tests: 132/132 pass
- Plugin Eval: 100/100, Grade A, low risk
- Skills: all four bundled skills score 100/100

Measured usage is tracked separately. Keep observed usage JSONL out of the durable baseline until at least 5 representative successful benchmark samples exist; see `.plugin-eval/MEASUREMENT.md`.

Full archived docs are under `build/docs/`.
