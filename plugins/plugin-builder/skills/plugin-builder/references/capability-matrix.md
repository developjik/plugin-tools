# Cross-target Capability Matrix (UnifiedSpec v1.1)

Use this table when the user enables a feature in the interactive new-plugin flow. If the user has selected multiple targets and a chosen feature is unsupported on any of them, surface an in-chat warning naming the target(s) that will drop the field.

## Common (top-level) components

| Field | Claude Code | Codex | Cursor | Notes |
|---|:---:|:---:|:---:|---|
| `commands[]` | ✅ `commands/<name>.md` | ⚠️ folded into SKILL.md | ✅ `commands/<name>.<ext>` | Codex has no native commands — they merge into the first matching skill. Cursor extension controlled by `cursor.commandExtension`. |
| `skills[]` | ✅ | ✅ | ✅ | Universal. Security frontmatter (`allowed-tools`, `disable-model-invocation`, `user-invocable`) preserved on all three. |
| `agents[]` | ✅ | ❌ drop (warn) | ✅ | Codex has no native agents. |
| `rules[]` | ❌ drop (warn) | ❌ drop (warn) | ✅ `rules/<name>.mdc` | Cursor-only. |
| `hooks[]` (`command`/`http`/`mcp_tool`/`prompt`/`agent`) | ✅ Claude nested wrapper | ✅ Claude nested wrapper | ✅ Cursor flat schema (camelCase events) | Hook `type=http/mcp_tool/prompt/agent` v1.1 only. |
| `mcpServers[]` | ✅ `.mcp.json` | ✅ `.mcp.json` | ✅ `mcp.json` | `args` / `env` / `headers` supported on all three. |

## Hook events

`claudeOnly` events (`Notification`, `SubagentStop`, `PreCompact`, `SessionEnd`) drop on Codex and Cursor (Cursor remaps the supported subset). `codexOnly` (`PermissionRequest`) drops on Claude and Cursor. `cursorOnly` (`workspaceOpen`, `before*`/`after*` variants) pass through verbatim on Cursor and drop on the other two. See `build/schemas/v1/hook-event-compat.json`.

## Platform-specific namespace fields

| Field | Claude Code | Codex | Cursor | Emit |
|---|:---:|:---:|:---:|---|
| `claude.lsp[]` | ✅ | ❌ warn-drop | ❌ warn-drop | `.lsp.json` + manifest `lspServers` |
| `claude.monitors[]` | ✅ | ❌ warn-drop | ❌ warn-drop | `monitors/monitors.json` + manifest `monitors` |
| `claude.bin[]` | ✅ | ❌ warn-drop | ❌ warn-drop | `bin/<path>` files |
| `claude.settings` | ✅ | ❌ warn-drop | ❌ warn-drop | `settings.json` |
| `claude.userConfig` | ✅ | ❌ warn-drop | ❌ warn-drop | manifest `userConfig` block |
| `claude.agentExtras` | ✅ overlay onto `agents[]` | ❌ warn-drop | ❌ warn-drop | Frontmatter merge (`effort`, `maxTurns`, `skills`, `memory`, `background`, `isolation`, `disallowedTools`). Privilege widening blocked: `disallowedTools ∩ tools` must be empty. |
| `codex.apps[]` | ❌ warn-drop | ✅ | ❌ warn-drop | `.app.json` |
| `codex.features` | ❌ warn-drop | ✅ | ❌ warn-drop | manifest `features.*` merge |
| `codex.interfaceMeta` | ❌ warn-drop | ✅ | ❌ warn-drop | manifest `interface.shortDescription` etc. |
| `codex.policy` | ❌ ignored | ✅ marketplace policy | ❌ ignored | marketplace catalog entry |
| `cursor.commandExtension` | ❌ warn-drop | ❌ warn-drop | ✅ controls `commands/<name>.<ext>` |
| `cursor.inlineHooks` | ❌ warn-drop | ❌ warn-drop | ✅ embeds hooks into manifest |
| `cursor.inlineMcp` | ❌ warn-drop | ❌ warn-drop | ✅ embeds mcp into manifest |
| `cursor.displayName` / `publisher` / `tags` | ❌ warn-drop | ❌ warn-drop | ✅ manifest fields |

## Agent frontmatter (Claude Code + Cursor)

| Key | Claude Code | Cursor | Codex |
|---|:---:|:---:|:---:|
| `tools` | ✅ | ✅ | ❌ drop (warn) |
| `disallowedTools` | ✅ | ✅ | ❌ drop (warn) |
| `model` | ✅ | ✅ | ❌ drop (warn) |
| `effort` / `maxTurns` / `skills` / `memory` / `background` / `isolation` | ✅ via `claude.agentExtras` | ❌ silent drop | ❌ silent drop |

## How to warn

When the user enables one of the warn-drop fields in the new-plugin flow, surface a single line per affected target. Example:

> ⚠️ `claude.monitors` is Claude Code only — Codex and Cursor builds will silently drop this. Keep it only if you intend the file to be no-op on those targets.

If the user is targeting only one platform, suppress the warning.
