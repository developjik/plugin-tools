# plugin-builder

> Meta-plugin: scaffold Claude Code + OpenAI Codex plugins from a single UnifiedSpec.
>
> 한국어판: [README.ko.md](./README.ko.md)

Version: 0.8.1 | License: MIT | Node: >=20 | Zero npm dependencies

---

## User guide

> No CLI knowledge required. Just follow four steps.

### 1. Add the marketplace (once)

**Claude Code:**
```
/plugin marketplace add developjik/plugin-tools
```

**Codex:**
```
codex plugin marketplace add github:developjik/plugin-tools
```

### 2. Install the plugin (once)

**Claude Code:**
```
/plugin install plugin-builder@plugin-builder-official
```

**Codex:**
```
codex plugin install plugin-builder
```

### 3. Run the skill (natural language or slash command)

Natural language:
> "Create a plugin that lints i18n keys. Should support both Claude Code and Codex."

Or a slash command:
```
/plugin-builder:new my-i18n-guard
```

The skill auto-triggers and walks you through nine questions (in your language — Korean detected automatically):

| # | Question |
|---|---|
| Q1 | Which targets? `claude-code` / `codex` / both |
| Q2 | Plugin name (kebab-case, e.g. `my-plugin`) |
| Q3 | Version (default `0.1.0`) |
| Q4 | One-line description (20–200 chars) |
| Q5 | Category (productivity / dev-tools / ai / data / other) |
| Q6 | Add slash commands? |
| Q7 | Add skills? |
| Q8 | Advanced: MCP servers / hooks / interface? |
| Q9 | Marketplace root path (auto-init if missing) |

Just answer. The skill handles the rest internally.

### 4. Use the generated plugin

The skill writes this layout:

```
<root>/                                    # ← from Q9
├── .claude-plugin/marketplace.json        # Claude catalog (auto-registered)
├── .agents/plugins/marketplace.json       # Codex catalog (auto-registered)
└── <plugin-name>/                         # your new plugin
    ├── .claude-plugin/plugin.json
    ├── .codex-plugin/plugin.json
    ├── commands/, skills/, hooks/, .mcp.json, README.md
```

Then install it into your own environment:

```
# Claude Code
/plugin marketplace add <root>
/plugin install <plugin-name>@<root-basename>

# Codex
codex plugin marketplace add file://<abs-root>
codex plugin install <plugin-name>
```

### Other commands

| Command | Purpose |
|---|---|
| `/plugin-builder:new [name]` | Create a new plugin (walks Q1–Q9) |
| `/plugin-builder:marketplace-init <root>` | Create a new marketplace root |
| `/plugin-builder:validate <plugin-dir>` | Run the 6-stage validator |
| `/plugin-builder:publish <plugin-dir>` | Patch both catalogs at the parent root |

Natural-language phrases like "validate this plugin" or "publish to marketplace" auto-trigger them too.

---

## Contributor guide

> For code contributions and CI integration. **End users should follow the user guide above** — the CLI is an implementation detail.

```bash
git clone https://github.com/developjik/plugin-tools
cd plugin-tools/plugins/plugin-builder
npm test        # expect 132 tests PASS
```

Zero npm dependencies. `npm install` is not required.

### Quality gates

Current structural quality checks:

```bash
npm test
node /Users/developjik/.codex/plugins/cache/openai-curated/plugin-eval/eed16198/scripts/plugin-eval.js analyze . --format markdown
```

Expected result:

- Tests: 132/132 pass
- Plugin Eval plugin report: 100/100, Grade A, low risk
- Nested skills: all four bundled skills report 100/100

Observed usage is a separate benchmark signal. Do not keep a usage JSONL as the durable baseline until at least 5 representative successful benchmark samples exist. See [MEASUREMENT.md](../../.plugin-eval/MEASUREMENT.md).

### Docs

| Doc | Scope |
|---|---|
| [docs/USER_FLOW.md](./docs/USER_FLOW.md) | End-to-end user journey (natural language + slash command) |
| [docs/USAGE.md](./docs/USAGE.md) | Spec field reference + common flows |
| [docs/REVIEW.md](./docs/REVIEW.md) | Review summary and current quality status |
| [DESIGN.md](./DESIGN.md) | Architecture, IR schema, validation policy, lossy mappings |

### v0.7 breaking changes (summary)

- Plugin tree at `<root>/<name>/` (the `<root>/plugins/<name>/` intermediate folder is removed)
- Marketplace entry `path: "./<name>"`; `metadata.pluginRoot` field removed
- Single mode only: split/merged/split-out modes and related flags removed
- `publish` always patches both catalogs

Details in [DESIGN.md](./DESIGN.md) and [docs/USAGE.md](./docs/USAGE.md).

### Translations

- [한국어 README](./README.ko.full.md), [DESIGN](./DESIGN.ko.md), [USAGE](./docs/USAGE.ko.md), [USER_FLOW](./docs/USER_FLOW.ko.md), [REVIEW](./docs/REVIEW.ko.md)

---

## License

MIT
