---
name: plugin-eval
description: Use when routing skill/plugin evaluation, scoring, fixes, budget checks, benchmarks, usage, or next steps.
---

# Plugin Eval

Umbrella router for local Codex skill and plugin evaluation, budget checks, benchmark setup, and improvement next steps.

## Route

1. Resolve whether the target path is a skill, plugin, or generic folder. For named skills, check `~/.codex/skills/<name>` then repo-local `skills/<name>`.
2. For broad natural-language requests, start with:

```bash
plugin-eval start <path> --request "<user request>" --format markdown
```

3. If intent is explicit, call the matching CLI directly:
   - evaluate, explain score, or fix first: `analyze`
   - token budget: `explain-budget`
   - real usage: `plugin-eval benchmark`, then `plugin-eval measurement-plan`
   - benchmark setup: `init-benchmark`
4. Recognize beginner prompts such as "Give me an analysis of the game dev skill.", "Evaluate this plugin.", and "What should I fix first?"
5. Hand off skill analysis to `../evaluate-skill/SKILL.md`, plugin analysis to `../evaluate-plugin/SKILL.md`, rewrites to `../improve-skill/SKILL.md`, and custom rubrics to `../metric-pack-designer/SKILL.md`.

## Output

- Prefer JSON results as the source of truth.
- Lead with `At a Glance`, `Why It Matters`, `Fix First`, and `Recommended Next Step`.
- Call out whether budget numbers are static estimates or measured harness results.
- For named-skill analysis, do not stop at the report if benchmark setup is still missing.

## References

- `../../references/chat-first-workflows.md`
- `../../references/technical-design.md`
- `../../references/evaluation-result-schema.md`
