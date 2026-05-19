---
name: evaluate-skill
description: Use when evaluating a local Codex skill, explaining score, fixing issues, setting up benchmarks, or measuring usage.
---

# Evaluate Skill

Use when the target is a local skill directory or `SKILL.md` file.

## Workflow

1. Treat "Evaluate this skill." as the default entrypoint.
2. Resolve named skills via `~/.codex/skills/<name>`, then repo-local `skills/<name>`.
3. For natural chat, first run `plugin-eval start <skill-path> --request "<user request>" --format markdown`.
4. Run `plugin-eval analyze <skill-path> --format markdown`.
5. Lead with `At a Glance`, `Why It Matters`, `Fix First`, and `Recommended Next Step`.
6. Separate structural, budget, and code findings.
7. For "analysis" requests, also run `plugin-eval init-benchmark <skill-path>` and show benchmark setup questions.
8. For real usage numbers, benchmark, then run `plugin-eval measurement-plan <skill-path> --observed-usage <usage.jsonl> --format markdown`.
9. For rewrite planning, route to `../improve-skill/SKILL.md`.

## Skill-Specific Priorities

- frontmatter validity
- `name` and `description` quality
- progressive disclosure and reference usage
- broken relative links
- oversized `SKILL.md` or descriptions
- helper script quality for TypeScript and Python files

## Chat Requests To Recognize

- `Evaluate this skill.`
- `Give me an analysis of the game dev skill.`
- `Audit this skill.`
- `Why did this skill score that way?`
- `What should I fix first?`
- `Measure the real token usage of this skill.`

## Commands

```bash
plugin-eval start <skill-path> --request "Evaluate this skill." --format markdown
plugin-eval analyze <skill-path> --format markdown
plugin-eval explain-budget <skill-path> --format markdown
plugin-eval measurement-plan <skill-path> --format markdown
plugin-eval init-benchmark <skill-path>
plugin-eval benchmark <skill-path>
```

## Reference

- `../../references/chat-first-workflows.md`
