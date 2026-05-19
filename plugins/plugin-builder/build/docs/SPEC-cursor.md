# Cursor Target Spec (v1)

UnifiedSpec → Cursor plugin conversion rules. Source of truth for `build/adapters/cursor.js`.

## Scope (v1)

Cursor target emits **skills + hooks + mcp.json** only.

| UnifiedSpec primitive | Cursor v1 |
|---|---|
| `skills[]` | Emitted as `skills/{name}/SKILL.md` |
| `hooks[]` | Emitted as `hooks/hooks.json` (renamed to `hooks/cursor.json` in hybrid scaffold) with camelCase events |
| `mcpServers[]` | Emitted as `mcp.json` at plugin root |
| `commands[]` | **Dropped** with warning — out of scope v1 |
| `agents[]` | **Dropped** with warning — out of scope v1 |
| Cursor `rules` primitive | **Not modelled in UnifiedSpec** — deferred to a future spec bump |

## Output layout

```
.cursor-plugin/plugin.json
skills/{name}/SKILL.md
hooks/hooks.json       # camelCase events
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

Cursor does not use `category`. UnifiedSpec category folds to a single-item `keywords` array.

## Skill frontmatter

Cursor follows the open SKILL.md standard. The following keys are **preserved**:

- `name`, `description` (required)
- `argument-hint`
- `allowed-tools`
- `disable-model-invocation`
- `user-invocable`

Dropped with warning (no Cursor semantics):

- `model`
- `effort`
- `paths`

## Hook event name mapping

Cursor uses camelCase event names. Mapping applied during conversion:

| Claude PascalCase | Cursor camelCase |
|---|---|
| `PreToolUse` | `preToolUse` |
| `PostToolUse` | `postToolUse` |
| `SessionStart` | `sessionStart` |
| `SessionEnd` | `sessionEnd` |

Cursor-only events (pass-through verbatim):

- `afterFileEdit`
- `beforeTabFileRead`
- `beforeShellExecution`
- `afterShellExecution`

Dropped with warning (no Cursor equivalent):

- `Stop`
- `UserPromptSubmit`
- `Notification` (claude-only)
- `SubagentStop` (claude-only)
- `PreCompact` (claude-only)
- `PermissionRequest` (codex-only)

When emitting to Claude or Codex targets, `cursorOnly` events are now also dropped with a warning so the same UnifiedSpec is safe to fan out to all three targets.

## MCP servers

Cursor reads `mcp.json` at plugin root. Fields supported:

- `command`, `args`, `env` (stdio)
- `url`, `headers` (remote — http/sse auto-detect by presence of `url`)

UnifiedSpec `transport` is not emitted as a structured field for Cursor (auto-detected by Cursor at install time).

## Marketplace catalog

Single-plugin marketplace root format follows `cursor.com/docs/plugins/building`:

```json
{
  "name": "<marketplace-id>",
  "owner": { "name": "...", "email": "..." },
  "plugins": [
    { "name": "<plugin-name>", "source": "<path-or-repo>", "description": "...", "version": "..." }
  ]
}
```

Emitted to `<marketplace-root>/.cursor-plugin/marketplace.json`. Only patched when `spec.targets` includes `cursor` — existing 2-target build flows are unchanged.

## Install (end user)

```text
/add-plugin <plugin-name>
```

Or search by name in the Cursor plugin marketplace.

## References

- Cursor plugin building reference: https://cursor.com/docs/plugins/building
- Cursor marketplace: https://cursor.com/marketplace
- Compound Engineering Cursor spec (cross-reference): https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/specs/cursor.md
