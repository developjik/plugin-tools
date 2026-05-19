---
name: plugin-builder-marketplace
description: Use when the plugin-builder orchestrator needs the internal marketplace writer for atomic catalog patching. Do not trigger for ordinary users.
---

# plugin-builder-marketplace

Internal sub-skill. Users should call `/plugin-builder:publish`.

Responsibilities:
- Patch Claude and Codex marketplace catalogs.
- Serialize writes with the file lock.
- Preserve unknown fields while rejecting unsafe merge keys.
- Report append, update, or noop.
