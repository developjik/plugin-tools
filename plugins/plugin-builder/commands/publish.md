---
description: Patch Claude, Codex, and (when targets include cursor) Cursor marketplace catalogs for a plugin.
argument-hint: "<plugin-dir> [--git-remote <owner/repo>]"
allowed-tools: ["Bash", "Read"]
---

Use this command to register or refresh an existing plugin in its parent marketplace root.

Validate that the plugin manifest exists, confirm the parent root has a marketplace catalog, run publish, and summarize whether each catalog (Claude, Codex, and Cursor when present) was appended, updated, or unchanged. Keep output localized and hide raw JSON.
