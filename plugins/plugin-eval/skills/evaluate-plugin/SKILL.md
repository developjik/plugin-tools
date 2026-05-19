---
name: evaluate-plugin
description: Use when evaluating a local Codex plugin, explaining score, fixing issues, setting up benchmarks, or comparing reports.
---

# Evaluate Plugin

Use when the target is a plugin root with `.codex-plugin/plugin.json`.

## Workflow

1. Treat "Evaluate this plugin." as the default entrypoint.
2. For natural chat, first run `plugin-eval start <plugin-root> --request "<user request>" --format markdown`.
3. Run `plugin-eval analyze <plugin-root> --format markdown`.
4. Lead with `Fix First`, then cover manifest, nested skill, budget, code, and coverage findings.
5. For multi-skill plugins, name strongest and weakest skills.
6. For measured usage, initialize benchmark setup.
7. For trend data, compare JSON outputs with `plugin-eval compare`.

## Chat Requests To Recognize

- `Evaluate this plugin.`
- `Audit this plugin.`
- `Why did this score that way?`
- `What should I fix first?`
- `Help me benchmark this plugin.`
- `What should I run next?`

## Commands

```bash
plugin-eval start <plugin-root> --request "Evaluate this plugin." --format markdown
plugin-eval analyze <plugin-root> --format markdown
plugin-eval start <plugin-root> --request "What should I run next?" --format markdown
plugin-eval compare before.json after.json
plugin-eval report result.json --format html --output ./plugin-eval-report.html
plugin-eval init-benchmark <plugin-root>
plugin-eval benchmark <plugin-root>
```

## Reference

- `../../references/chat-first-workflows.md`
