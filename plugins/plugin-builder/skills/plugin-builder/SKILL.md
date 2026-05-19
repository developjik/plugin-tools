---
name: plugin-builder
description: Use when the user wants to create, validate, publish, or initialize marketplaces for Claude Code and OpenAI Codex plugins from one UnifiedSpec.
allowed-tools: ["AskUserQuestion", "Bash", "Read", "Write"]
---

# plugin-builder

User-facing orchestrator for dual-target plugin work. Detect Korean from the user message and answer in that language; otherwise answer in English.

## Create

For `/plugin-builder:new` or natural plugin creation requests:
1. Ask one question at a time for targets, kebab-case name, version, description, category, commands, skills, optional MCP/hooks/interface metadata, and marketplace root.
2. Build a UnifiedSpec JSON file in a temporary path.
3. Initialize the marketplace root when missing.
4. Scaffold the plugin and publish both catalog entries.
5. Summarize location, warnings, catalog action, and install hints. Do not show raw JSON.

## Validate

For validation requests, run the validator on the requested plugin directory. Report the six stages as PASS, FAIL, or SKIP and include the reason for any non-PASS result.

## Publish

For publish requests, confirm the plugin directory and parent marketplace root, publish both catalogs, then summarize append, update, or noop for each catalog.

## Marketplace Init

For `/plugin-builder:marketplace-init` or natural marketplace bootstrap requests, confirm the target root, create both Claude and Codex marketplace catalogs, and summarize the catalog paths plus the next install step.

## Output Rules

- Keep CLI flags and raw JSON out of the final user message.
- Translate warnings into the user's language.
- Treat marketplace initialization, scaffold, validate, and publish failures as user-facing errors with a short reason and next step.
- Keep generated plugin layout flat: `<root>/<plugin-name>/`.
