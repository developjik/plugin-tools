---
name: plugin-builder
description: Use when the user wants to create, validate, publish, or initialize marketplaces for Claude Code, OpenAI Codex, and Cursor plugins from one UnifiedSpec.
allowed-tools: ["AskUserQuestion", "Bash", "Read", "Write"]
---

# plugin-builder

Chat router for cross-platform plugin creation, validation, publishing, and marketplace setup. Detect Korean from the user message and answer in that language; otherwise answer in English.

## Routes

- Create/new: ask one missing spec question at a time, render a temporary UnifiedSpec, initialize the marketplace root when needed, scaffold, publish catalogs, then summarize location, warnings, catalog actions, and install hints. Do not show raw JSON.
- Validate: run the validator on the requested plugin directory and report the six stages as PASS, FAIL, or SKIP with reasons for non-PASS results.
- Publish: confirm the plugin directory and parent marketplace root, publish catalog entries, then summarize append, update, or noop per catalog.
- Marketplace init: confirm the target root, create platform catalogs for the requested targets, and summarize catalog paths plus the next install step.

## Guardrails

- Keep generated plugin layout flat: `<root>/<plugin-name>/`.
- Use each plugin's local commands from its package root for plugin-specific debugging; use root scripts for workspace validation.
- Root marketplace paths must start with `./plugins/`.
- Translate warnings into the user's language.
- Treat marketplace initialization, scaffold, validate, and publish failures as user-facing errors with a short reason and next step.
- For Cursor-specific scope and install details, read [cursor-target.md](references/cursor-target.md).
