---
name: plugin-builder-validate
description: Use when the plugin-builder orchestrator needs internal six-stage validation for a rendered plugin. Do not trigger for ordinary users.
---

# plugin-builder-validate

Internal sub-skill. Users should call `/plugin-builder:validate`.

Stages:
- Manifest schema.
- File structure.
- Cross-reference.
- Claude dry-run.
- Codex dry-run.
- Marketplace catalog.

Strict mode promotes environment SKIP results to FAIL for CI.
