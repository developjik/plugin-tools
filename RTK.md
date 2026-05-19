# Runtime Kit

This repository is a workspace for two independent dual-platform plugins:

- `plugins/plugin-builder`
- `plugins/plugin-eval`

## Project Shape

- Keep the repository root as the workspace and marketplace management surface.
- Keep installable plugin bundles under `plugins/<plugin-name>/`.
- Keep each plugin's Codex metadata in `plugins/<plugin-name>/.codex-plugin/plugin.json`.
- Keep each plugin's Claude Code metadata in `plugins/<plugin-name>/.claude-plugin/plugin.json`.
- Keep root marketplace files at `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`.
- Do not put a root `.codex-plugin/plugin.json` or root `.claude-plugin/plugin.json`; the root is not an installable plugin.

## Compatibility Rules

- Keep `plugin-builder` and `plugin-eval` as separate plugin identities.
- Do not move one plugin's chat-facing skills into the other plugin.
- Use root marketplace paths that start with `./plugins/`.
- Use each plugin's local commands from its own package root when debugging plugin-specific behavior.
- Prefer root scripts only for workspace-wide validation and evaluation.

## Validation

- Run `npm test`.
- Run `npm run lint`.
- Run `npm run eval:all`.
- Run `npm run validate:claude` when the Claude Code CLI is available.
- Validate root marketplace JSON with `python3 -m json.tool .agents/plugins/marketplace.json` and `python3 -m json.tool .claude-plugin/marketplace.json`.

