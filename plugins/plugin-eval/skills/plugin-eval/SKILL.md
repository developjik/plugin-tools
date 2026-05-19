---
name: plugin-eval
description: Use when routing skill/plugin evaluation, scoring, fixes, budget checks, benchmarks, usage, or next steps.
---

# Plugin Eval

Umbrella entrypoint for local Codex skill and plugin evaluation.

## Start Here

1. Resolve whether the target path is a skill, plugin, or generic folder.
2. For natural-language requests, start with:

```bash
plugin-eval start <path> --request "<user request>" --format markdown
```

3. Route by intent:
   - "Give me an analysis of the game dev skill." -> resolve the skill, run `analyze`, then initialize benchmark setup.
   - "Evaluate this skill/plugin.", "Why did this score that way?", "What should I fix first?" -> run `analyze`.
   - "Explain the token budget..." -> run `explain-budget`.
   - "Measure the real token usage..." -> benchmark, then `plugin-eval measurement-plan`.
   - "Help me benchmark this plugin." -> initialize benchmark setup.
   - "What should I run next?" -> use `plugin-eval start` with that request.
4. Route rewrite help to `../improve-skill/SKILL.md` and custom rubrics to `../metric-pack-designer/SKILL.md`.
5. For named skills, check `~/.codex/skills/<name>` then repo-local `skills/<name>`.

## Chat Requests To Recognize

- `Give me an analysis of the game dev skill.`
- `Evaluate this skill.`
- `Evaluate this plugin.`
- `Why did this score that way?`
- `What should I fix first?`
- `Explain the token budget for this skill.`
- `Measure the real token usage of this skill.`
- `Help me benchmark this plugin.`
- `What should I run next?`

## Matching Commands

```bash
plugin-eval start <path> --request "Evaluate this skill." --format markdown
plugin-eval start <path> --request "Give me a full analysis of this skill, including benchmark setup." --format markdown
plugin-eval analyze <path> --format markdown
plugin-eval explain-budget <path> --format markdown
plugin-eval measurement-plan <path> --format markdown
plugin-eval init-benchmark <path>
plugin-eval benchmark <path>
```

## Output Expectations

- Prefer the JSON result as the source of truth.
- Lead with `At a Glance`, `Why It Matters`, `Fix First`, and `Recommended Next Step`.
- Call out whether budget numbers are static estimates or measured harness results.
- For named-skill analysis, do not stop at the report if benchmark setup is still missing.
- Hand off skill-specific work to `../evaluate-skill/SKILL.md` and plugin-wide work to `../evaluate-plugin/SKILL.md`.

## References

- `../../references/chat-first-workflows.md`
- `../../references/technical-design.md`
- `../../references/evaluation-result-schema.md`
