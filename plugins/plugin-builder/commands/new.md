---
description: Create a new Claude Code, OpenAI Codex, and Cursor plugin.
argument-hint: "[name]"
allowed-tools: ["AskUserQuestion", "Bash", "Read", "Write"]
---

Invoke the `plugin-builder` skill for the full question flow.

Collect target platforms, name, version, description, category, commands, skills, optional MCP/hooks/interface metadata, and marketplace root. Then scaffold the plugin, auto-publish catalog entries, translate warnings, and return only a clean user-facing summary.
