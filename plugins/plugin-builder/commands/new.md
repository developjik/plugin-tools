---
description: Create a new Claude Code, OpenAI Codex, and Cursor plugin.
argument-hint: "[name]"
allowed-tools: ["AskUserQuestion", "Bash", "Read", "Write"]
---

Invoke the `plugin-builder` skill and follow its interactive new-plugin flow.

The flow MUST start by asking the user which target platforms to build for, using `AskUserQuestion` with `multiSelect: true` and one option per supported platform (Claude Code, OpenAI Codex, Cursor). Carry the selected set through every later prompt and only collect fields that apply to the chosen targets.

For each platform-specific extension (Claude `lsp`/`monitors`/`bin`/`settings`/`userConfig`/`agentExtras`, Codex `apps`/`features`/`interfaceMeta`, Cursor `commandExtension`/`inlineHooks`/`inlineMcp`/`displayName`/`publisher`/`tags`), surface a clear in-chat warning if the user requests a feature that the other selected platforms do not support, citing which platforms will drop the field. Use the capability matrix in `skills/plugin-builder/references/capability-matrix.md` as the source of truth.

After collecting the spec, scaffold the plugin, publish marketplace catalogs for the selected targets, and return a user-facing summary that lists: output directory, per-target conversion warnings, marketplace catalog actions, and install hints for each chosen target. Never paste raw JSON in the summary.
