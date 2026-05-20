# Cursor Target Notes (v2)

When the UnifiedSpec lists `cursor` in `targets`, the cursor adapter emits the full Cursor plugin surface defined by https://cursor.com/docs/plugins.

## Emitted primitives

- `rules[]` → `rules/{name}.mdc` with `.mdc` frontmatter (`description`, `alwaysApply`, `globs`).
- `skills[]` → `skills/{name}/SKILL.md` following the open SKILL.md standard.
- `agents[]` → `agents/{name}.md` with `name` / `description` / `tools` frontmatter.
- `commands[]` → `commands/{name}.md` with `name` / `description` / `argument-hint` frontmatter.
- `hooks[]` → `hooks/hooks.json` using Cursor's FLAT schema (`{event: [{command, matcher?}]}`), NOT Claude's nested `{type:"command"}` wrapper.
- `mcpServers[]` → `mcp.json` at the plugin root (not `.mcp.json`).

## Hook event names

Normalize Claude PascalCase to Cursor camelCase:

- `PreToolUse` → `preToolUse`, `PostToolUse` → `postToolUse`
- `SessionStart` → `sessionStart`, `SessionEnd` → `sessionEnd`
- `Stop` → `stop`, `UserPromptSubmit` → `beforeSubmitPrompt`
- `SubagentStop` → `subagentStop`, `PreCompact` → `preCompact`

Cursor-native events pass through verbatim: `workspaceOpen`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeShellExecution`, `afterShellExecution`, `beforeTabFileRead`, `afterTabFileEdit`, `afterAgentResponse`, `afterAgentThought`, `subagentStart`, `postToolUseFailure`.

Drop with warning: `Notification` (claude-only), `PermissionRequest` (codex-only).

## Install hint

Tell end users to install from Cursor Agent chat:

```text
/add-plugin <plugin-name>
```

Or search by name at https://cursor.com/marketplace.

## Authoritative source

Full conversion rules and verification checklist live in `build/docs/SPEC-cursor.md`.
