---
name: plugin-builder-scaffold
description: Use when the plugin-builder orchestrator needs the internal renderer for a validated UnifiedSpec. Do not trigger for ordinary users.
---

# plugin-builder-scaffold

Internal sub-skill. Users should call `/plugin-builder:new`.

Responsibilities:
- Select the Claude Code, Codex, and Cursor adapters.
- Render files in a temporary stage directory.
- Deduplicate shared files for hybrid output.
- Promote the stage only after render succeeds.
- Return target-specific conversion warnings.
