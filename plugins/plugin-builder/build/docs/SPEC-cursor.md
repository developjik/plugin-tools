# Cursor Target Spec (v3 — UnifiedSpec v1.1)

UnifiedSpec → Cursor plugin conversion rules. Source of truth for `build/adapters/cursor.js`.

Authoritative external references:
- https://cursor.com/docs/plugins
- https://cursor.com/docs/reference/plugins

## Scope (v3, additive over v2)

Cursor target emits the full Cursor plugin surface:

| UnifiedSpec primitive | Cursor output |
|---|---|
| `rules[]` | `rules/{name}.mdc` with `description` / `alwaysApply` / `globs` frontmatter |
| `skills[]` | `skills/{name}/SKILL.md` (open SKILL.md standard) |
| `agents[]` | `agents/{name}.md` with `name` / `description` / `tools` / `disallowedTools` / `model` frontmatter |
| `commands[]` | `commands/{name}.<ext>` — extension controlled by `spec.cursor.commandExtension` (`md` default, `mdc`/`markdown`/`txt` accepted) |
| `hooks[]` | `hooks/hooks.json` (camelCase events, flat schema) OR inlined into manifest when `spec.cursor.inlineHooks=true` |
| `mcpServers[]` | `mcp.json` at plugin root (with `args` / `env` / `headers`) OR inlined into manifest when `spec.cursor.inlineMcp=true` |

### v1.1 cursor-only manifest extensions

`spec.cursor.*` fields lift into `.cursor-plugin/plugin.json`:

- `displayName`, `publisher`, `tags`, `logo`, `keywords` — manifest metadata
- `commandExtension` — switches the file extension for emitted commands
- `inlineHooks` / `inlineMcp` — opt-in inline mode; the corresponding `hooks/hooks.json` or `mcp.json` file is suppressed

### Marketplace catalog entry

`core/marketplace-entry.js::cursorEntry` emits `{ name, description, source }` only. **`version` was removed in v0.8** — the official Cursor marketplace.schema.json does not declare it and strict validators may reject. The plugin's own `.cursor-plugin/plugin.json` still carries `version`.

v1's "drop agents/commands" behaviour was a bug: Cursor's reference plugin schema documents agents and commands as first-class primitives, so dropping them silently produced incomplete plugins. v2+ emits them.

## Output layout

```
.cursor-plugin/plugin.json
rules/{name}.mdc
skills/{name}/SKILL.md
agents/{name}.md
commands/{name}.md
hooks/hooks.json       # camelCase events, FLAT schema (see below)
mcp.json               # NOT .mcp.json (claude/codex)
README.md
```

In hybrid scaffold (multi-target builds), `hooks/hooks.json` is renamed to `hooks/cursor.json` and the manifest `hooks` field is rewritten to point at it.

## Manifest field mapping

| UnifiedSpec | Cursor `.cursor-plugin/plugin.json` |
|---|---|
| `name` | `name` (required, kebab-case) |
| `version` | `version` |
| `description` | `description` |
| `author` | `author` |
| `license` | `license` |
| `homepage` | `homepage` |
| `repository` | `repository` |
| `category` | folded into `keywords[0]` unless `cursor.keywords` overrides |
| `cursor.keywords` | `keywords` (explicit override) |
| `cursor.logo` | `logo` |
| `rules[]` (non-empty) | `rules: "./rules/"` |
| `skills[]` (non-empty) | `skills: "./skills/"` |
| `agents[]` (non-empty) | `agents: "./agents/"` |
| `commands[]` (non-empty) | `commands: "./commands/"` |
| `hooks[]` w/ any cursor-supported event | `hooks: "./hooks/hooks.json"` |
| `mcpServers[]` (non-empty) | `mcpServers: "./mcp.json"` |

## Rule frontmatter (`.mdc`)

Per https://cursor.com/docs/reference/plugins:

- `description` (required)
- `alwaysApply` (boolean — applies to all files when true)
- `globs` (string or string[] — file patterns the rule applies to)

## Skill frontmatter (open SKILL.md standard)

Preserved:
- `name`, `description` (required)
- `argument-hint`
- `allowed-tools`
- `disable-model-invocation`
- `user-invocable`

Dropped with warning (no Cursor semantics):
- `model`
- `effort`
- `paths`

## Agent / Command frontmatter

- Agent: `name`, `description`, `tools[]` (optional)
- Command: `name`, `description`, `argument-hint` (optional, mapped from UnifiedSpec `argsHint`)

## Hook event name mapping

Cursor uses camelCase event names. Conversion table:

| Claude PascalCase | Cursor camelCase |
|---|---|
| `PreToolUse` | `preToolUse` |
| `PostToolUse` | `postToolUse` |
| `SessionStart` | `sessionStart` |
| `SessionEnd` | `sessionEnd` |
| `Stop` | `stop` |
| `UserPromptSubmit` | `beforeSubmitPrompt` |
| `SubagentStop` | `subagentStop` |
| `PreCompact` | `preCompact` |

Cursor-only events (pass-through verbatim):

- `postToolUseFailure`
- `subagentStart`
- `beforeShellExecution`, `afterShellExecution`
- `beforeMCPExecution`, `afterMCPExecution`
- `beforeReadFile`, `afterFileEdit`
- `beforeSubmitPrompt`
- `afterAgentResponse`, `afterAgentThought`
- `beforeTabFileRead`, `afterTabFileEdit`
- `workspaceOpen`

Dropped with warning (no Cursor equivalent):

- `Notification` (claude-only)
- `PermissionRequest` (codex-only)

When emitting to Claude or Codex targets, `cursorOnly` events are dropped with a warning so the same UnifiedSpec can fan out to all three targets safely.

## hooks.json schema (CRITICAL: flat, not Claude nested)

Cursor `hooks/hooks.json` uses a flat per-event array:

```json
{
  "hooks": {
    "afterFileEdit": [
      { "command": "./scripts/format-code.sh" }
    ],
    "beforeShellExecution": [
      { "command": "./scripts/validate-shell.sh", "matcher": "rm|curl|wget" }
    ],
    "sessionEnd": [
      { "command": "./scripts/audit.sh" }
    ]
  }
}
```

Entries carry `command` (required) and `matcher` (optional regex) directly.

**Do NOT** emit Claude's nested wrapper:

```json
"PreToolUse": [{ "hooks": [{ "type": "command", "command": "…" }] }]
```

Cursor's loader silently ignores entries wrapped in `{type:"command"}` — this was the v1 bug.

## MCP servers (`mcp.json`)

Located at plugin root (NOT `.mcp.json`). Fields:

- `command`, `args`, `env` (stdio)
- `url`, `headers` (remote — http/sse auto-detected by `url` presence)

UnifiedSpec `transport` is omitted as a structured field for Cursor (auto-detected at install).

## Marketplace catalog

Single-plugin marketplace root format follows `cursor.com/docs/plugins`:

```json
{
  "name": "<marketplace-id>",
  "owner": { "name": "...", "email": "..." },
  "plugins": [
    { "name": "<plugin-name>", "source": "<path-or-repo>", "description": "..." }
  ]
}
```

Emitted to `<marketplace-root>/.cursor-plugin/marketplace.json`. Only patched when `spec.targets` includes `cursor`.

## Install (end user)

```text
/add-plugin <plugin-name>
```

Or search by name in the Cursor plugin marketplace at cursor.com/marketplace.

## Verification checklist

Against https://cursor.com/docs/plugins:

- [x] `.cursor-plugin/plugin.json` at plugin root
- [x] Manifest `name` is kebab-case
- [x] Manifest references `rules` / `skills` / `agents` / `commands` / `hooks` / `mcpServers` paths when populated
- [x] `keywords[]` (not `category`)
- [x] Rules emitted as `.mdc` with `description` / `alwaysApply` / `globs`
- [x] Skills follow open SKILL.md standard
- [x] Agents emitted as `agents/{name}.md`
- [x] Commands emitted as `commands/{name}.md`
- [x] `hooks/hooks.json` uses FLAT `{event: [{command, matcher?}]}` schema
- [x] camelCase hook event names
- [x] Cursor-only events (`workspaceOpen`, `beforeMCPExecution`, ...) pass through
- [x] `mcp.json` at root (not `.mcp.json`)
- [x] Marketplace catalog at `.cursor-plugin/marketplace.json`
