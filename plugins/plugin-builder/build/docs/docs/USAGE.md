# plugin-builder — Usage

> Single UnifiedSpec → plugin generator for both Claude Code and OpenAI Codex.
>
> Quick entry: `./bin/plugin-builder help`
>
> 한국어 버전: [USAGE.ko.md](./USAGE.ko.md)

---

## 0. Prerequisites

- Node ≥ 20
- (optional) `claude` CLI — enables stage (d) dry-run
- (optional) `codex` CLI — enables stage (e) dry-run

> v0.5: dry-run is ported to node — no bash/jq/timeout dependency (cross-platform).

Install:
```bash
git clone https://github.com/developjik/plugin-builder
cd plugin-builder
npm test        # 132 tests must PASS
```

Zero npm dependencies. `npm install` not required. The current v0.7 bundle is validated with 132 tests plus Plugin Eval structural checks.

---

## 1. CLI commands

### 1.1 `scaffold` — generate files from a spec

```bash
plugin-builder scaffold --spec <spec.json> [--out <root>] [--no-publish] [--git-remote <owner/repo>]
```

- `--spec` (required): path to a UnifiedSpec JSON (`--spec=path` form also accepted)
- `--out <root>` (optional, default `.`): marketplace root directory. The plugin tree is emitted at `<root>/<spec.name>/`.
- `--no-publish` (optional): skip the auto-publish step (scaffold-only).
- `--git-remote <owner/repo>` (optional): record `source: github` + `repo` in the marketplace entry. When omitted, `source: local` + `path: ./<name>`.

Behaviour:
1. Load the spec and validate it via `core/ir.js` (abort on schema violation).
2. For each `targets[]`, invoke the matching adapter and merge into a single hybrid tree (both manifests, shared `skills/`, per-target `hooks/{claude,codex}.json`).
3. Stage writes into `$TMPDIR/pb-stage-XXXXXXXXXX/`.
4. Promote to `<root>/<spec.name>/`.
5. Unless `--no-publish`, patch both `<root>/.claude-plugin/marketplace.json` and `<root>/.agents/plugins/marketplace.json` in a single-lock transaction.
6. stdout reports JSON: `root`, `files`, `warnings[]`, `publish`.

Examples:
```bash
# 1. Initialize a marketplace root once
plugin-builder marketplace init ./my-market --owner-name "Me"

# 2. Scaffold + auto-publish
plugin-builder scaffold --spec X.json --out ./my-market
# → ./my-market/<X.name>/ (both manifests, shared skills, hooks/{claude,codex}.json)
# → ./my-market/.claude-plugin/marketplace.json + ./my-market/.agents/plugins/marketplace.json patched

# 3. Defer marketplace patching:
plugin-builder scaffold --spec X.json --out ./my-market --no-publish
```

### 1.1.1 `marketplace init` — create a marketplace root

```bash
plugin-builder marketplace init <root> [--name <id>] [--display-name <human>]
                                       [--owner-name <name>] [--owner-email <email>] [--force]
```

- Creates `<root>/.claude-plugin/marketplace.json` (Claude schema: `name`, `owner`, `plugins: []`).
- Creates `<root>/.agents/plugins/marketplace.json` (Codex schema: `name`, optional `interface.displayName`, `plugins: []`).
- Refuses to overwrite an existing Claude catalog file unless `--force` is set.
- Defaults: `--name` ← `basename(root)`; `--display-name` ← Title Case of the name; owner ← `git config user.name|email` then `"unknown"`.

Example output:
```json
{
  "status": "OK",
  "targets": ["claude-code", "codex"],
  "root": "/abs/path/to/my-market",
  "outDirs": ["/abs/path/to/my-market/my-plugin"],
  "files": 12,
  "warnings": [
    "[claude-code] hook event 'PermissionRequest' is codex-only; dropped from claude-code target",
    "[codex] commands (2) folded into SKILL.md per Codex spec",
    "[codex] skill 'i18n-key-guard': merged allowed-tools from folded commands (Read,Bash); review to confirm scope"
  ],
  "publish": { "action": "append", "name": "my-plugin", "claude": { "action": "append" }, "codex": { "action": "append" } }
}
```

### 1.2 `validate` — 6-stage validation

```bash
plugin-builder validate <plugin-dir> [--spec <spec.json>] [--strict]
```

- `<plugin-dir>` (required): directory to validate
- `--spec` (optional): original UnifiedSpec. If supplied, stages (b)/(c) become more precise.
- `--strict`: promote SKIP → FAIL (for CI gating)

Stages:

| Stage | Name | SKIP condition |
|---|---|---|
| a | Manifest schema | — |
| b | File structure | `--spec` not provided |
| c | Cross-reference | `--spec` not provided |
| d | Claude dry-run | `claude` CLI missing or lacks `--plugin-dir`/`--print` |
| e | Codex dry-run | `codex` CLI missing or lacks `plugin list --json` |
| f | Marketplace | no `.claude-plugin/marketplace.json` |

Exit codes:
- `0` — all PASS (SKIPs permitted)
- `1` — one or more FAIL (or `--strict` + any SKIP)

Examples:
```bash
plugin-builder validate ./my-plugin --spec ./my-spec.json
plugin-builder validate ./my-plugin --strict        # CI gating
```

Example output (dual target, only one CLI installed):
```
================ Plugin Builder Report ================
  (a) Manifest schema      PASS
  (b) File structure       PASS
  (c) Cross-reference      PASS
  (d) Claude dry-run       SKIP — claude --print does not surface plugin loader state in this environment
  (e) Codex dry-run        SKIP — codex CLI not installed
  (f) Marketplace          PASS
-------------------------------------------------------
Result: PASS (failed=0, skipped=2, strict=false)
=======================================================
```

Status meanings:
- **PASS** — stage succeeded.
- **FAIL** — deterministic error. Exit code 1 regardless of `--strict`.
- **SKIP** — prerequisites for the stage were not met. Counts as PASS by default; promoted to FAIL under `--strict`.

### 1.3 `publish` — marketplace patch

```bash
plugin-builder publish <plugin-dir> [--git-remote <owner/repo>]
```

- `<plugin-dir>` (required): plugin directory (must contain `.claude-plugin/plugin.json`). Its parent directory must be a marketplace root (`.claude-plugin/marketplace.json` present).
- `--git-remote` (optional): present → `source: github` + `repo`; absent → `source: local` + `path: ./<name>`.

Behaviour: patches both `<root>/.claude-plugin/marketplace.json` and `<root>/.agents/plugins/marketplace.json` in a sequential single-lock transaction.

Properties:
- File lock (`.lock` file) → concurrent publishes are safe
- Atomic write (tmp → fsync → rename original→.bak → rename tmp→original)
- Deep-merge → unknown keys in existing entries are preserved (forward-compat)
- Idempotent (rerunning with the same spec is a no-op)
- At most one lock alive at a time; Codex-write failure rolls Claude back to its pre-transaction content (single sequential writer).

Example:
```bash
plugin-builder publish ./my-market/my-plugin --git-remote myorg/my-plugin
```

### 1.4 `version` / `help`

```bash
plugin-builder version
plugin-builder help
plugin-builder --verbose <command>    # debug logging
plugin-builder --quiet <command>      # warnings and above only
```

---

## 2. Authoring a UnifiedSpec

### 2.1 Minimal spec

```json
{
  "specVersion": "1.0",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "One-line summary (≤200 chars)",
  "targets": ["claude-code"]
}
```

Required: `specVersion`, `name`, `version`, `description`, `targets`.

- `name`: `^[a-z][a-z0-9-]*[a-z0-9]$` (kebab-case)
- `version`: semver `0.1.0` / `0.1.0-beta.1`
- `targets`: `["claude-code"]` / `["codex"]` / `["claude-code","codex"]`

### 2.2 Commands

```json
"commands": [
  {
    "name": "check",
    "description": "Run lint on staged files",
    "argsHint": "[files...]",
    "body": "Run linter. Report violations.",
    "frontmatter": { "model": "sonnet", "allowed-tools": ["Read", "Bash"] }
  }
]
```

- Claude target: emitted as `commands/<name>.md`
- Codex target: folded into the SKILL.md "Commands" section (frontmatter is downgraded to description text — lossy)

### 2.3 Skills

```json
"skills": [
  {
    "name": "i18n-key-guard",
    "description": "≥20-char description packed with trigger keywords.",
    "allowed-tools": ["Read", "Grep"],
    "disable-model-invocation": false,
    "user-invocable": true,
    "model": "sonnet",
    "argument-hint": "<file>",
    "body": "# Skill body markdown\n\n..."
  }
]
```

- `description` minimum 20 characters
- **Security-critical frontmatter** (`allowed-tools`, `disable-model-invocation`, `user-invocable`) is **preserved** even on Codex target. Silent drop would be privilege escalation, which is policy-forbidden.
- **Style/perf frontmatter** (`model`, `effort`, `paths`) is dropped + warned on Codex target.
- During the Codex commands→SKILL.md fold, a command's `allowed-tools` is **unioned** into the skill's `allowed-tools` (announced via warning).
- Codex-specific invocation policy: add a `"codex": { "allow_implicit_invocation": true }` block → emits `skills/<name>/agents/openai.yaml`.

### 2.4 Hooks

```json
"hooks": [
  { "event": "PreToolUse", "matcher": "Edit", "command": "scripts/check.sh" },
  { "event": "Notification", "command": "scripts/notify.sh" },
  { "event": "PermissionRequest", "command": "scripts/codex.sh" }
]
```

Event compatibility (`schemas/v1/hook-event-compat.json`):

| Class | Events |
|---|---|
| common | `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `UserPromptSubmit` |
| claudeOnly | `Notification`, `SubagentStop`, `PreCompact`, `SessionEnd` |
| codexOnly | `PermissionRequest` |

- claudeOnly → dropped + warned on Codex target
- codexOnly → dropped + warned on Claude target
- Unknown events → emitted on both targets + unknown warning

### 2.5 MCP Servers

```json
"mcpServers": [
  { "name": "lokalise", "transport": "stdio", "command": "lokalise-mcp" },
  { "name": "remote", "transport": "http", "url": "https://api.example.com/mcp" }
]
```

Emitted into `.mcp.json` for both targets. Transports: `stdio` / `http` / `sse`.

**URI scheme allowlist** (shared across homepage / repository / mcpServers[].url):

`http`, `https`, `git`, `git+http`, `git+https`, `git+ssh`, `git+file`, `ssh`, `svn`, `hg`, `ws`, `wss`.

Rejected schemes (defence-in-depth against XSS / exfiltration):
- `javascript:` (XSS), `data:` (inline payload), `file:` (local file disclosure), `vbscript:`, `mailto:` (not a valid homepage)

Rejection message: `homepage: must be a URI with allowed scheme (one of http|https|git|...)`.

### 2.6 Codex Interface (Codex-only)

```json
"displayName": "My Plugin",
"composerIcon": "icon.svg",
"defaultPrompt": ["Run X", "Find Y"],
"interface": {
  "logo": "logo.png",
  "brandColor": "#FF0000",
  "capabilities": ["search", "lint"]
}
```

- Codex target: emitted as `.codex-plugin/plugin.json::interface`
- Claude target: folded into the README.md header (lossy — not round-trippable)

### 2.7 Full example

See `build/tests/fixtures/sample-spec.json` — a complete cross-target spec for the `i18n-key-guard` plugin.

---

## 3. Slash command usage (inside Claude / Codex)

If `plugin-builder` is installed as a plugin:

### 3.1 `/plugin-builder:new [name]`

Scaffold a new plugin. Collects Q1–Q8 via `AskUserQuestion`, synthesises a UnifiedSpec, then invokes `bin/plugin-builder scaffold`.

### 3.2 `/plugin-builder:validate <plugin-dir>`

Six-stage validation. If a `RESOLUTION_REQUIRED` JSON block appears on stdout, the host (slash command body) presents options to the user, then re-invokes with `--resolve`.

### 3.3 `/plugin-builder:publish <plugin-dir> [--git-remote owner/repo]`

Marketplace patch. Idempotent.

---

## 4. Common flows

### 4.1 Create a new plugin

```bash
# 1. Initialize a marketplace root once
plugin-builder marketplace init ./my-market --owner-name "Me"

# 2. Author the spec
cat > my-spec.json <<'EOF'
{
  "specVersion": "1.0",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "...",
  "targets": ["claude-code", "codex"],
  "skills": [
    { "name": "my-skill", "description": "≥20-char trigger description goes here." }
  ]
}
EOF

# 3. Scaffold + auto-publish
plugin-builder scaffold --spec my-spec.json --out ./my-market

# 4. Validate
plugin-builder validate ./my-market/my-plugin --spec my-spec.json
```

### 4.2 Audit an existing plugin

```bash
plugin-builder validate ./my-market/existing-plugin --strict
```

`--strict` for CI gating.

### 4.3 Idempotent marketplace update only

```bash
# After bumping version 0.1.0 → 0.2.0
plugin-builder publish ./my-market/my-plugin
# → only entry.version is deep-merged, unknown keys preserved
# → .bak created automatically
```

---

## 5. Output layout

After `plugin-builder marketplace init <root>` followed by `plugin-builder scaffold --spec X.json --out <root>`:

```
<root>/
├── .claude-plugin/
│   └── marketplace.json        # Claude catalog (auto-patched)
├── .agents/plugins/
│   └── marketplace.json        # Codex catalog (auto-patched)
└── <spec.name>/                # hybrid plugin tree
    ├── .claude-plugin/plugin.json     # hooks: ./hooks/claude.json
    ├── .codex-plugin/plugin.json      # hooks: ./hooks/codex.json, contains interface block
    ├── commands/                       # Claude-only
    │   ├── check.md
    │   └── sync.md
    ├── skills/
    │   └── i18n-key-guard/
    │       ├── SKILL.md                # Codex variant wins after folding the Commands section
    │       └── agents/openai.yaml      # only when a Codex-specific invocation policy is set
    ├── hooks/
    │   ├── claude.json                 # claude target events only
    │   └── codex.json                  # codex target events only
    ├── .mcp.json                       # shared by both targets
    └── README.md
```

Multiple plugins live side-by-side at `<root>/<name-1>/`, `<root>/<name-2>/`, … and both catalogs hold their entries simultaneously. The v0.6 `<root>/plugins/<name>/` intermediate folder is removed in v0.7.

---

## 6. Environment variables

| Variable | Meaning | Default |
|---|---|---|
| `PLUGIN_BUILDER_LOG` | log level (`debug`/`info`/`warn`/`error`) | `info` |
| `TMPDIR` | location for staged writes + dry-run isolation | `/tmp` |
| `CODEX_HOME` | overridden internally by codex dry-run | — |

---

## 7. Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (for validate: every stage PASS or SKIP) |
| 1 | General failure (spec invalid, render error, validate FAIL, publish error) |
| 2 | Bad usage (unknown command, missing required arg) |
| 78 (EX_CONFIG) | SKIP signal from a dry-run path (externally: CLI not installed) |

---

## 8. Troubleshooting

**Q. `plugin-builder requires Node >= 20`**
→ Check `node --version`. Using nvm is recommended.

**Q. `spec invalid: name: must match /^[a-z]...`**
→ Only kebab-case is allowed. `MyPlugin` ❌, `my-plugin` ✓.

**Q. `description: minLength 20`** (skill)
→ Skill descriptions must be ≥20 chars so they carry enough trigger keywords.

**Q. Stage (d)/(e) always SKIP**
→ The CLI is missing, or doesn't yet support `--plugin-dir` / `plugin list --json`. As of v0.5 the node-ported dry-run prints an explicit SKIP/FAIL reason on stdout. Unless `--strict` is set, SKIP counts as PASS.

**Q. `unknown flag: --xxx`**
→ Since v0.5, unknown flags are a hard error so typos surface immediately. Usual cause: `--key=value` typos (e.g. `--specs` vs `--spec`).

**Q. `homepage: must be a URI with allowed scheme`**
→ See the URI allowlist in §2.5. The SSH shorthand `git@github.com:foo/bar` is rejected because it has no scheme. Use `git+ssh://git@github.com/foo/bar` or `https://github.com/foo/bar` instead.

**Q. `EEXIST` lock error**
→ Another publish is in progress. There's an automatic retry after ~5 seconds. If you suspect a stale lock file: `rm marketplace.json.lock`.

**Q. `.bak` files piling up after publish**
→ Normal — every update keeps the previous version. Clean up with `rm *.bak`.

---

## 9. Related material

- [README.full.md](../README.full.md) — full at-a-glance overview
- [DESIGN.md](../DESIGN.md) — architecture, decisions, mapping rules
- [build/tests/fixtures/sample-spec.json](../../tests/fixtures/sample-spec.json) — spec using every field
- [build/tests/fixtures/self-host-spec.json](../../tests/fixtures/self-host-spec.json) — the spec plugin-builder uses to describe itself
