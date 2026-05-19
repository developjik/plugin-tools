# plugin-builder

Plugin Builder scaffolds Claude Code, OpenAI Codex, and Cursor plugins from one UnifiedSpec.

## Use

Install the marketplace, then ask naturally to create, validate, publish, or initialize a plugin marketplace.

```bash
# Claude Code
/plugin marketplace add developjik/plugin-tools
/plugin install plugin-builder@plugin-builder-official

# Codex
codex plugin marketplace add github:developjik/plugin-tools
codex plugin install plugin-builder

# Cursor (generated plugins install via Cursor Agent chat)
/add-plugin <plugin-name>
```

Cursor target scope (v1): emits `skills`, `hooks`, and `mcp.json` only. `agents`, `commands`, and Cursor `rules` are not emitted. Hook event names are normalised to Cursor camelCase (e.g. `PreToolUse` → `preToolUse`).

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

- Tests: 146/146 pass
- Plugin Eval: 100/100, Grade A, low risk
- Skills: all four bundled skills score 100/100

Measured usage is tracked separately. Keep observed usage JSONL out of the durable baseline until at least 5 representative successful benchmark samples exist; see `.plugin-eval/MEASUREMENT.md`.

Full archived docs are under `build/docs/`.
