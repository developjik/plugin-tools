# Runtime Kit

This repository packages `plugin-eval` as a dual-platform plugin for Codex and Claude Code.

## Project Shape

- Keep the repository root as both the marketplace/distribution surface and the actual plugin bundle.
- Keep shared runtime code under `src/`.
- Keep chat-facing skills under `skills/`.
- Keep Codex metadata in `.codex-plugin/plugin.json`.
- Keep Claude Code metadata in `.claude-plugin/plugin.json`.
- Keep platform-specific marketplace files at `.agents/plugins/marketplace.json` for Codex and `.claude-plugin/marketplace.json` for Claude Code.

## Compatibility Rules

- Do not put `skills/`, `commands/`, `agents/`, or `hooks/` inside `.claude-plugin/`.
- Use relative paths that start with `./` in plugin manifests.
- Keep shared skill instructions platform-neutral unless a command or invocation differs.
- Prefer `plugin-eval` on `PATH`; otherwise run `node ./scripts/plugin-eval.js`.
- Do not require network access for `analyze`, `explain-budget`, or `measurement-plan`.
- Treat benchmark execution as explicit opt-in because it runs live local agent sessions.

## Validation

- Run `node ./scripts/plugin-eval.js --help`.
- Run `npm test` from the repository root.
- Run `claude plugin validate .`.
- Validate marketplace JSON with `python3 -m json.tool .agents/plugins/marketplace.json` and `python3 -m json.tool .claude-plugin/marketplace.json`.
