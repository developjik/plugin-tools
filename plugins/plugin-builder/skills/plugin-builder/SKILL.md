---
name: plugin-builder
description: Use when the user wants to create, validate, publish, or initialize marketplaces for Claude Code, OpenAI Codex, and Cursor plugins from one UnifiedSpec.
allowed-tools: ["AskUserQuestion", "Bash", "Read", "Write"]
---

# plugin-builder

Chat router for cross-platform plugin creation, validation, publishing, and marketplace setup. Detect the user's language from their message; if Korean, answer in Korean; otherwise English.

## Routes

- **Create / new** — drive the interactive new-plugin flow (see "New plugin flow" below).
- **Validate** — run the 6-stage validator on the requested plugin directory and report each stage as PASS, FAIL, or SKIP with reasons for non-PASS results.
- **Publish** — confirm the plugin directory and parent marketplace root, publish catalog entries, then summarize append, update, or noop per catalog.
- **Marketplace init** — confirm the target root, create platform catalogs for the requested targets, and summarize catalog paths plus the next install step.

## New plugin flow

The new-plugin route is **always interactive** and must use `AskUserQuestion`. Steps:

### Step 1 — pick target platforms (multi-select, REQUIRED first)

Ask: "어떤 플랫폼의 플러그인을 생성할까요?" (or English equivalent). Use `multiSelect: true` and offer:

- Claude Code
- OpenAI Codex
- Cursor

The selected set becomes `spec.targets`. Carry it through every following question — never collect fields for an unselected target.

### Step 2 — common identity

Ask one question at a time (use `AskUserQuestion` with single-select or free text via the "Other" option) for: `name`, `version`, `description`, `category`, optional `keywords`, optional `author`, optional `homepage` / `repository`.

### Step 3 — common components

For each component below, offer to add or skip. If the user adds entries, collect minimal frontmatter:

- `commands[]` — `name`, `description`, optional `argsHint`, optional body
- `skills[]` — `name`, `description` (≥20 chars), optional security keys (`allowed-tools`, `disable-model-invocation`, `user-invocable`)
- `agents[]` — `name`, `description`, optional `tools`, optional `disallowedTools`, optional `model`
- `rules[]` — `name`, `description`, optional `globs`, optional `alwaysApply` *(Cursor-only — warn if Cursor not selected)*
- `hooks[]` — `event`, `command`, optional `matcher`, optional `type` (`command|http|mcp_tool|prompt|agent`), optional `statusMessage`
- `mcpServers[]` — `name`, `transport`, `command|url`, optional `args`, `env`, `headers`

### Step 4 — platform-specific extensions

Only ask if the corresponding target is selected. For each extension the user enables, **immediately warn in-chat about which other selected platforms will drop it**, citing the capability matrix in `references/capability-matrix.md`.

**Claude Code only** (`spec.claude.*`):

- `lsp[]` — `language`, `command`, `args`, `extensionToLanguage`
- `monitors[]` — `name`, `command`, optional `description`, optional `when`
- `bin[]` — plugin-relative executable paths
- `settings` — `agent`, `subagentStatusLine`
- `userConfig` — typed user-configurable settings (string|number|boolean|directory|file)
- `agentExtras` — per-agent overlay: `effort`, `maxTurns`, `skills`, `memory`, `background`, `isolation: "worktree"`, `disallowedTools`

**Codex only** (`spec.codex.*`):

- `apps[]` — `.app.json` connector entries (`name`, `provider`, `auth`, `scopes`)
- `features` — additional `features.*` manifest toggles (snake_case keys)
- `interfaceMeta` — App-directory publish metadata (`shortDescription`, `longDescription`, `developerName`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`)
- `policy` — installation / authentication policy
- `interface` — `logo`, `screenshots`, `brandColor`, `capabilities`

**Cursor only** (`spec.cursor.*`):

- `commandExtension` — `md` (default) | `mdc` | `markdown` | `txt`
- `inlineHooks` — embed hooks into `.cursor-plugin/plugin.json` instead of `hooks/hooks.json`
- `inlineMcp` — embed mcpServers into manifest instead of `mcp.json`
- `displayName`, `publisher`, `tags`, `logo`, `keywords`

### Step 5 — confirm + scaffold

Render the temporary UnifiedSpec, initialize the marketplace root if it does not exist, run `plugin-builder scaffold`, then `plugin-builder publish` for the chosen targets. Surface every warning from the validator and the adapters in plain language. Tell the user:

- Where the plugin tree was written.
- Which catalogs were appended or updated.
- Per-target install hints.
- Any fields that were silently dropped due to platform-incompatibility.

## Capability matrix (always honor when warning the user)

See `references/capability-matrix.md` for the canonical cross-target support table. Whenever a user enables a feature in the new-plugin flow, look it up in the matrix and warn about every selected target that will drop it.

## Guardrails

- Keep generated plugin layout flat: `<root>/<plugin-name>/`.
- Use each plugin's local commands from its package root for plugin-specific debugging; use root scripts for workspace validation.
- Root marketplace paths must start with `./plugins/`.
- Translate warnings into the user's language.
- Treat marketplace initialization, scaffold, validate, and publish failures as user-facing errors with a short reason and next step.
- For Cursor-specific scope and install details, read [cursor-target.md](references/cursor-target.md).
- For cross-target capability lookup, read [capability-matrix.md](references/capability-matrix.md).
