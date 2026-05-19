---
name: evaluate-skill
description: Use when evaluating a local Codex skill, explaining score, fixing issues, setting up benchmarks, or measuring usage.
---

# Evaluate Skill

Use for a local skill directory or `SKILL.md` file.

## Workflow

1. Resolve named skills via `~/.codex/skills/<name>`, then repo-local `skills/<name>`.
2. For natural chat, start with `plugin-eval start <skill-path> --request "<user request>" --format markdown`.
3. For direct evaluation, run `plugin-eval analyze <skill-path> --format markdown`.
4. Lead with `At a Glance`, `Why It Matters`, `Fix First`, and `Recommended Next Step`.
5. Separate structural, budget, and code findings.
6. For broad analysis or benchmark requests, initialize benchmark setup.
7. For measured usage, benchmark first, then run `measurement-plan` with the observed usage file.
8. For rewrite planning, route to `../improve-skill/SKILL.md`.

## Priorities

- frontmatter validity
- trigger description quality
- broken relative links
- progressive disclosure and reference usage
- oversized always-loaded skill text
- helper script quality

## Reference

- `../../references/chat-first-workflows.md`
