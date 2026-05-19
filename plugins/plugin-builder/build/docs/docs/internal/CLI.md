# Internal CLI Reference — `bin/plugin-builder`

> **Audience:** plugin-builder contributors and the slash commands that wrap this CLI.
>
> End users must not invoke this CLI directly. The user-facing distribution surface is the slash commands and skill documented in [README.md](../../README.md) and [USER_FLOW.md](../USER_FLOW.md). This reference exists so that contributors editing `commands/*.md`, `core/cli.js`, or `scripts/dry-run-*.sh` know the exact contract.

## Commands (v0.7)

```bash
plugin-builder scaffold --spec <file> [--out <root>] [--no-publish] [--git-remote <owner/repo>]
plugin-builder validate <plugin-dir> [--spec <file>] [--strict]
plugin-builder publish  <plugin-dir> [--git-remote <owner/repo>]
plugin-builder marketplace init <root> [--name <id>] [--display-name <human>]
                                        [--owner-name <name>] [--owner-email <email>] [--force]
plugin-builder version
plugin-builder help
```

## Removed in v0.7 (breaking)

| Flag | Replacement |
|---|---|
| `--merge` | none — only one scaffold mode (hybrid) remains |
| `--allow-overlap` | none |
| `--split-out` | none |
| `--marketplace-root <dir>` | use `--out <root>` instead; scaffolding is always marketplace-root-scoped |
| `--marketplace <path>` (publish) | publish always patches both root catalogs |
| `--local-path` (publish) | computed as `./<name>` automatically |
| `SCAFFOLD_MODES` descriptor / `pickScaffoldMode` exports | removed; `renderHybrid` is the sole path |

## Global flags

| flag | purpose |
|---|---|
| `--verbose` | set log level to debug; print stack traces on error |
| `--quiet` | set log level to warn |

## Exit codes

| code | meaning |
|---|---|
| `0` | success / SKIP-only result |
| `1` | command failure (validation FAIL, scaffold error, etc.) |
| `2` | unknown command |
| `78` | configuration / environment guard (Node < 20, missing CLI in dry-run script) |

## Subcommand contracts

### `scaffold`

- Reads `--spec <file>` (UnifiedSpec JSON), normalizes via `core/ir.js`, validates.
- `--out <root>` (default `.`): marketplace root. The plugin tree is emitted at `<root>/<spec.name>/`.
- Always produces a **hybrid** plugin tree: both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, shared `skills/` + `.mcp.json`, per-target `hooks/{claude,codex}.json`. Manifest `hooks` field is rewritten to point at the per-target file.
- Files are staged in `$TMPDIR/pb-stage-*/`, then promoted on success.
- Symlinks rejected (`renderer.js::walk`).
- Path traversal in `file.path` rejected (`renderer.js::assertSafeRelative`).
- Unless `--no-publish`, runs `patchMarketplaceRoot` to update both catalogs in a single sequential single-lock transaction.
- Output: JSON to stdout `{status, targets, root, files, warnings, publish?}`.

### `validate`

- Runs 6 stages (a–f) defined in `core/validator.js`.
- `--spec <file>`: passes a UnifiedSpec to enable stages b and c (cross-ref).
- `--strict`: promotes SKIP → FAIL; exit 1 if any stage is not PASS.
- Stage A returns SKIP (not PASS) for native manifests without `specVersion`.
- Stage D/E (Claude/Codex dry-run): SKIP if CLI absent. FAIL on timeout (124); exit 127 (CLI vanished mid-exec) → SKIP; other non-zero exits → FAIL.

### `publish`

- `<plugin-dir>` must be a direct child of a marketplace root (parent has `.claude-plugin/marketplace.json`). Otherwise the command errors out.
- Always patches both `<root>/.claude-plugin/marketplace.json` and `<root>/.agents/plugins/marketplace.json` in a sequential single-lock transaction (Claude first, then Codex). Codex write failure rolls Claude back to its pre-transaction content.
- Acquires file lock via `core/lockfile.js` (PID-aware: stale lockfiles from dead processes are reclaimed). At most one lock alive at any time.
- Atomic write: prior `.bak` is preserved (move-aside), then tmp → fsync → rename(orig→.bak) → rename(tmp→orig). Failure paths restore prior state and clean orphan tmp files.
- `deepMerge` rejects `__proto__`/`constructor`/`prototype` keys.
- `--git-remote owner/repo` → marketplace entry uses `source: github` + `repo`. Otherwise `source: local` + `path: ./<name>`.

### `marketplace init`

- Creates `<root>/.claude-plugin/marketplace.json` (Claude schema — `name`, `owner`, `plugins: []`; **no `metadata.pluginRoot`** in v0.7).
- Creates `<root>/.agents/plugins/marketplace.json` (Codex schema — `name`, optional `interface.displayName`, `plugins: []`).
- Does **not** create `<root>/plugins/` (removed in v0.7 — plugins live directly at `<root>/<name>/`).
- Defaults: `--name` falls back to `path.basename(root)`; `--display-name` falls back to Title Case of the name; `--owner-name`/`--owner-email` fall back to `git config user.name|email`, then `"unknown"`.
- Refuses to overwrite an existing Claude marketplace file unless `--force`.

## Scaffold mode (single mode in v0.7)

| Mode | Layout |
|---|---|
| `hybrid` (sole mode) | `<root>/<spec.name>/` — both manifests, shared `skills/` + `.mcp.json`, per-target `hooks/{claude,codex}.json`, manifest `hooks` field rewritten to point at its target file |

The v0.5/v0.6 modes `split`, `split-out`, `merged` are removed. So is the `SCAFFOLD_MODES` exported descriptor table.

## Output path conventions (v0.7)

- Plugin tree: `<root>/<spec.name>/`
- Catalog entry path (local): `./<spec.name>` (was `./plugins/<spec.name>` in v0.6)
- Stale detection scans `<root>/<name>/.claude-plugin/marketplace.json` (was `<root>/plugins/<n>/...`)

## v0.4 backlog (currently undocumented in user surface)

- `--resolve <stage> <option-id>` — re-call with selected resolution option (DESIGN §5.3)
- `--json` — emit structured JSON-only output suitable for machine consumption (DESIGN §10.3)
- `--allow-partial` — skip rollback on promote failure (DESIGN §10.4)

These flags must remain undocumented in `commands/*.md` and `skills/*/SKILL.md` until implemented.

## Calling convention from slash commands

`commands/{new,validate,publish,marketplace-init}.md` invoke this CLI via Bash. Each command's `argument-hint` and `allowed-tools` frontmatter must match the CLI flags it forwards. Slash commands pass `$ARGUMENTS` (full token list) — they must not use positional `$1 $2 $3 $4` because multi-token flags like `--git-remote owner/repo` would be split incorrectly.

The slash command bodies are responsible for **translating CLI output into user-facing language** (Korean / English) and **hiding raw JSON / CLI invocations** from the user. See [`skills/plugin-builder/SKILL.md`](../../skills/plugin-builder/SKILL.md) for the translation table.

## Dry-run script isolation

Both `scripts/dry-run-*.sh` isolate sensitive state from the operator's real environment:

- `$HOME` is overridden to `$TMP/home` (claude script) so `~/.claude` is never read or written.
- `CODEX_HOME` is overridden to `$TMP/codex-home` (codex script) so `~/.codex` is never read or written.
- `cp -RP` preserves symlinks rather than dereferencing them, preventing secret exfiltration into the staged tree.
- All traps include `EXIT INT TERM HUP QUIT`.
