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

Cursor target scope (v3, UnifiedSpec v1.1): emits `rules`, `skills`, `agents`, `commands`, `hooks`, and `mcp.json`. Hook event names are normalised to Cursor camelCase (e.g. `PreToolUse` → `preToolUse`). Command file extension and inline-vs-file emit are controlled by `spec.cursor.commandExtension` / `inlineHooks` / `inlineMcp`.

## UnifiedSpec v1.1 (additive over v1.0)

Common surface promotions: `mcpServers[].args/env/headers`, `agents[].disallowedTools/model`, `hooks[].type` (`command|http|mcp_tool|prompt|agent`) + `statusMessage`, top-level `keywords`.

Target-namespace extensions:

- `spec.claude.{lsp,monitors,bin,settings,userConfig,agentExtras}`
- `spec.codex.{apps,features,interfaceMeta}`
- `spec.cursor.{commandExtension,inlineHooks,inlineMcp,displayName,publisher,tags}`

All v1.1 fields are optional. v1.0 specs continue to validate and emit byte-identical output. Adapters surface a cross-target warning whenever the user enables a namespace field that the other selected targets cannot honor — the interactive `/plugin-builder:new` flow uses `skills/plugin-builder/references/capability-matrix.md` as the canonical lookup.

User-facing commands:

| Command | Purpose |
|---|---|
| `/plugin-builder:new [name]` | Create a Claude Code, Codex, and Cursor plugin and register it in a marketplace root |
| `/plugin-builder:marketplace-init <root>` | Create Claude, Codex, and (optional) Cursor marketplace catalogs |
| `/plugin-builder:validate <plugin-dir>` | Run the 6-stage validator |
| `/plugin-builder:publish <plugin-dir>` | Patch every selected marketplace catalog (Claude, Codex, and Cursor when present) at the parent root |

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
plugin-eval analyze . --format markdown
```

Target: tests green, Plugin Eval grade A with no failing checks across the plugin and every bundled skill. Measured usage is tracked separately — keep observed usage JSONL out of the durable baseline until at least 5 representative successful benchmark samples exist; see `.plugin-eval/MEASUREMENT.md`.

Full archived docs are under `build/docs/`.
