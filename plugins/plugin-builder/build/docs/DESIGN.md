# Plugin Builder — Design Document (v0.7 — root-flat marketplace, 2026-05-19)

> Korean version: [DESIGN.ko.md](./DESIGN.ko.md)

> **v0.7 build notes** (breaking layout change):
> - Plugin trees move from `<root>/plugins/<name>/` to `<root>/<name>/`. The `plugins/` intermediate folder is gone everywhere — file system, `marketplace.json` `path` / `source.path` fields, and the `metadata.pluginRoot` field (removed).
> - **Single mode only**: the `SCAFFOLD_MODES` descriptor and the split/split-out/merged variants are removed; scaffolding always renders the hybrid layout. The `--merge`, `--allow-overlap`, `--split-out`, `--marketplace-root`, `--marketplace`, and `--local-path` flags are removed.
> - `scaffold --spec X.json --out <root>` always emits the hybrid plugin tree to `<root>/<spec.name>/` and (unless `--no-publish`) auto-patches both catalogs.
> - `publish <plugin-dir>` requires the parent directory to be a marketplace root and always patches both catalogs. The v0.5 single-marketplace path is removed.
> - `marketplace init <root>` no longer creates `<root>/plugins/.gitkeep`.
> - Stale-detection path is rebased to `<root>/<name>/.claude-plugin/marketplace.json`.
> - Current quality gate: 132/132 tests PASS and Plugin Eval reports 100/100 Grade A with no Fix First items.
>
> The v0.6 notes below are retained for historical context:
>
> **v0.6 build notes** (multi-plugin marketplace root, after 3-round agent review — see `docs/internal/PLAN-v0.6.md`):
> - Historical v0.6 snapshot: 144/144 tests PASS (Node 20.x / 22.x).
> - **Multi-plugin marketplace root**: a single git repo hosts N plugins under `<root>/plugins/<name>/`; both Claude (`<root>/.claude-plugin/marketplace.json`) and Codex (`<root>/.agents/plugins/marketplace.json`) catalog files are kept in sync via a sequential single-lock transaction (Claude first, then Codex; Codex-write failure rolls Claude back from its pre-transaction content). v0.5 single-plugin behaviour is preserved verbatim when `--marketplace-root` is omitted.
> - **Hybrid plugin layout**: `<root>/plugins/<name>/` contains both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, shared `skills/`, shared `.mcp.json`, and per-target `hooks/{claude,codex}.json` (both manifests' `hooks` field is rewritten to point at their target file — documented override in both ecosystems).
> - **Category mapping is hint-only**: `core/marketplace-entry.js::CATEGORY_HINT` maps known kebab-case → PascalCase; unknown values pass through verbatim for Claude and best-effort PascalCase for Codex. Per-target override (`spec.claude.category` / `spec.codex.category`) wins. Unknown categories never fail validation.
> - **Codex policy passthrough**: `spec.codex.policy.installation` / `spec.codex.policy.authentication` flow through verbatim; defaults emit `AVAILABLE` / `ON_INSTALL` when absent. Future enum values require no plugin-builder release.
> - **Two new CLI surfaces**: `marketplace init <root>` subcommand and `--marketplace-root <dir>` flag on both `scaffold` and `publish`. Nested dispatch table (`SUBCOMMANDS` in `core/cli.js`).
> - **Two new JSON schemas**: `schemas/v1/marketplace-{claude,codex}.schema.json`.
> - **Stale v0.5 detection (P8)**: when an in-plugin `.claude-plugin/marketplace.json` is found inside `<root>/plugins/<n>/`, scaffold/publish surface a warning string in their report.
>
> **v0.5 build notes** (after the all-axis ten-point audit):
> - 93/93 tests PASS (Node 20.x / 22.x).
> - **Codex frontmatter privilege preservation**: `allowed-tools`, `disable-model-invocation`, `user-invocable` are kept on the Codex SKILL.md instead of silent-drop, with command `allowed-tools` unioned into the host skill (warned).
> - **Dual-target default = split**: scaffold now writes `<out>/<target>/` per target by default; `--merge` opts back into a shared dir, `--allow-overlap` adds last-write-wins.
> - **dry-run ported to node** (`core/dry-run.js`): no bash/jq/timeout dependency. `TARGETS` descriptor table replaces parallel functions — adding a new target is one entry.
> - **URI scheme allowlist** (`core/ir.js`): only `http(s)/git/git+*/ssh/svn/hg/ws(s)` accepted; `javascript`, `data`, `file`, `vbscript`, `mailto` rejected.
> - **YAML emitter hardening**: `needsYamlQuote` / `yamlScalar` quote every YAML 1.2 indicator, YAML 1.1 boolean keyword, numeric form, control char, plus U+2028/U+2029. `safeJsonString` escapes line separators that `JSON.stringify` leaves literal.
> - **parseArgs SSoT**: every known flag declared once in `FLAGS`; `BOOLEAN_FLAGS`, `VALUE_FLAGS`, `SHORT_ALIASES` auto-derive. Unknown flags throw. Cluster short flags (`-Vq`) supported.
> - **SCAFFOLD_MODES descriptor table** for layouts. Adding a new mode = one entry.
>
> **v0.4 build notes** (security / robustness):
> - 44/44 tests PASS. New tests: `dedup`, `lockfile`, `promote`, `dry-run-isolation`.
> - **H1 path-traversal block**: `validator.stageA` enforces the name pattern even on native manifest mode; `scripts/dry-run-{claude,codex}.sh` (since superseded in v0.5) sanitised NAME against a kebab-case regex.
> - **H2 atomic promote**: `renderer.promote` writes per-file `.pb-bak.<pid>.<rand>` backups, rolls back in reverse order on failure, cleans up on success.
> - **H3 cross-target overlap hard error**: `cli.dedupFiles` throws `EOVERLAP` on diverging content. Opt-in `--allow-overlap` accepts Codex-wins.
> - **M1 validator stage gating**: stages D/E gate on `spec.targets` or manifest-subdir presence — no false FAIL for single-target specs.
> - **M2 mcp transport required**, **M5 agent name kebab-case**, friendly error messages (no raw regex leak).
> - **lockfile hardening**: SIGINT/SIGTERM/SIGHUP handlers + signal re-raise, strict `^\d+$` PID, TOCTOU-aware reclaim, malformed PID preserved (no silent unlink), no-op release if non-owner.
> - **marketplace no-op detection**: rerunning publish with identical content returns `action: "noop"`, skips write.
> - **CI**: `.github/workflows/test.yml` (Node 20/22 matrix).
>
> **v0.3 build notes** (earlier):
> - P1–P5.5 implemented. End-to-end smoke passes: scaffolding `sample-spec` emits 8 files (both targets) with accurate warnings.
> - validate: stages a/b/c PASS, d/e SKIP (CLI environment limits), f varies by case. publish: append/update idempotent + atomic + .bak.
>
> **Deviations from the original design**:
> - `vendor/` directory never created. Instead of bundling ajv, `core/ir.js` ships a hand-rolled type/pattern/enum validator. Zero dependencies preserved.
> - Instead of `proper-lockfile`, a homegrown `core/lockfile.js` uses `fs.openSync` with the exclusive flag.
> - The interactive Q1–Q8 flow lives in the skill body (`AskUserQuestion`); there is no dedicated `core/prompter.js`. The slash command builds a spec file and calls `scaffold --spec`. Q1–Q8 are inlined in `commands/new.md` and `skills/plugin-builder/SKILL.md`.
> - Same-path files on dual-target merge (`SKILL.md`, `hooks.json`, `README.md`, `.mcp.json`) were a v0.4 `EOVERLAP` hard error. v0.5 turns that off by default — `--merge` is needed to re-trigger the legacy behaviour, and `--allow-overlap` to accept conflicts.

> Meta plugin that scaffolds plugins for both Claude Code and OpenAI Codex.
>
> **v0.2 change summary** (2026-05-18, after 4-agent audit):
> - `specVersion` required in UnifiedSpec, `$id` carries a version segment (forward-compat)
> - SkillSpec keys aligned with the real Claude frontmatter (`disable-model-invocation`, etc.); missing fields filled in
> - Codex `interface` metadata location corrected (`.codex-plugin/plugin.json::interface`; not `agents/openai.yaml`)
> - Hook compatibility matrix expanded + `[features].plugin_hooks` opt-in documented
> - Dry-run scripts: tighter isolation (`CODEX_HOME` override, `jq -er`, `timeout`, structured output)
> - Marketplace patch: correct atomic ordering + file lock + merge semantics
> - marketplace.json ownership funnelled through `core/marketplace-writer.js`
> - Operational concerns (engines.node, ajv vendor, SKIP semantics) added in §10

---

## 0. Decisions

| Item | Decision |
|---|---|
| Shell shape | **Plugin + Skill hybrid** (following the `skill-creator` precedent) |
| Implementation language | **Bash + Node.js** (minimise runtime dependencies) |
| MVP scope | Both Claude Code and Codex targets, full 6-stage validation, marketplace auto-patch included |
| Distribution | Self-hosted marketplace + public GitHub |
| License | MIT (tentative) |

### Core trade-offs (summary)

1. **Plugin+Skill hybrid** — pays the cost of maintaining both `plugin.json` and `SKILL.md`, in exchange for marketplace distribution + natural-language triggering.
2. **UnifiedSpec IR** — one author input, two emissions. Codex-unsupported fields (some hooks) are lossy and warned by the validator.
3. **Dry-run isolation** — to avoid polluting the user's environment, runs in `$TMPDIR/plugin-builder-dryrun-<rand>/` with guaranteed cleanup.
4. **Codex commands fold** — Codex has no **user-defined** slash command (built-in `/skills`, `$skill-*` exist). Claude `commands/*.md` folded into the SKILL.md "Commands" section (not dropped).
5. **Marketplace auto-patch** — Claude side: idempotent auto-patch. Codex side: the marketplace standard is weak, so only an install snippet in README is auto-generated.

---

## 1. Compatibility matrix (survey results)

| Item | Claude Code | Codex | Handling |
|---|---|---|---|
| Manifest location | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` | both files emitted in parallel |
| Manifest format | JSON | JSON | identical |
| Marketplace | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` (or `~/.agents/...`; Claude path supported as legacy fallback) | **a single `.claude-plugin/marketplace.json` covers both** (leveraging the legacy fallback) |
| Skills location | `skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` (optional per-skill `skills/<name>/agents/openai.yaml`) | identical. The Codex per-skill YAML only carries optional invocation policy (`allow_implicit_invocation`, etc.) |
| Commands | `commands/<name>.md` | none (user-defined) | folded into the Codex SKILL.md "Commands" section |
| Hooks location | `hooks/hooks.json` | `hooks/hooks.json`, **opt-in via `[features].plugin_hooks = true`** | same location, **some event names differ** |
| Hook events (CC-only) | `Notification`, `SubagentStop`, `PreCompact`, `SessionEnd` | — | drop+warn on target=codex |
| Hook events (Codex-only) | — | `PermissionRequest` | drop+warn on target=claude |
| Hook events (common) | `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `UserPromptSubmit` | identical | passed through |
| MCP | `.mcp.json` (or inline in plugin.json) | `.mcp.json` | identical (`openai.yaml::dependencies` is not used — earlier speculation) |
| Env vars | `CLAUDE_PLUGIN_ROOT` (`CLAUDE_PLUGIN_DATA` not confirmed in docs — surface a fallback path on use) | same alias injected | one hook script set covers both |
| Interface metadata | (none — folded into the README header) | **`.codex-plugin/plugin.json::interface`** (NOT `agents/openai.yaml`) — `displayName`, `composerIcon`, `defaultPrompt`, `logo`, `screenshots`, `brandColor`, `category`, `capabilities` | Codex-only fields |

> **Hook events v0.2 note**: `UserPromptSubmit` exists on both Claude and Codex (v0.1 incorrectly classified it as Codex-only). Other Claude-only candidates (`SubagentStart`, `PreCompact`, `SessionEnd`, etc.) are listed only when actually observed in Claude Code docs. Unknown events are accepted in **string-with-warn** mode by `HookSpec.event` — the validator surfaces a warning but does not block.

→ **The divergence is shallow.** UnifiedSpec + two adapters is enough.

---

## 2. Folder structure (the plugin-builder itself)

```
plugin-builder/
├── .claude-plugin/
│   └── plugin.json
├── .codex-plugin/
│   └── plugin.json                              # plugin-builder also supports both targets
├── README.md
├── LICENSE
├── package.json                                 # just ajv, ejs and similar
├── commands/
│   ├── new.md                                   # /plugin-builder:new
│   ├── validate.md                              # /plugin-builder:validate <path>
│   └── publish.md                               # /plugin-builder:publish <path>
├── skills/
│   ├── plugin-builder/
│   │   └── SKILL.md                             # primary orchestrator (natural-language trigger)
│   ├── plugin-builder-scaffold/
│   │   └── SKILL.md                             # file generation step
│   ├── plugin-builder-validate/
│   │   └── SKILL.md                             # validation step
│   └── plugin-builder-marketplace/
│       └── SKILL.md                             # marketplace patch
├── adapters/
│   ├── base.js                                  # PluginAdapter interface
│   ├── claude-code.js
│   ├── codex.js
│   └── registry.js                              # { 'claude-code': ..., 'codex': ... }
├── schemas/v1/
│   ├── unified-spec.schema.json                 # IR validation (embedded validator from v0.3)
│   └── hook-event-compat.json                   # declarative hook compatibility matrix
├── core/
│   ├── cli.js                                   # real entrypoint for bin/plugin-builder
│   ├── ir.js                                    # UnifiedSpec builder (embedded validator)
│   ├── spec-version.js                          # specVersion migration
│   ├── renderer.js                              # staged write + atomic promote (.pb-bak rollback)
│   ├── validator.js                             # 6-stage validation
│   ├── marketplace-writer.js                    # idempotent patch + no-op detection (sole owner)
│   ├── lockfile.js                              # fs.openSync('wx') lock + SIGINT/SIGTERM
│   ├── dry-run.js                               # v0.5: node port of dry-run scripts (TARGETS descriptor)
│   └── log.js                                   # levels (debug/info/warn/error)
├── bin/
│   └── plugin-builder                           # CLI entrypoint (engines.node check)
├── .github/workflows/
│   └── test.yml                                 # Node 20/22 matrix
└── tests/
    ├── fixtures/
    │   ├── sample-spec.json
    │   └── self-host-spec.json
    ├── ir.test.js
    ├── validator.test.js
    ├── marketplace-writer.test.js
    ├── adapter-claude.test.js
    ├── adapter-codex.test.js
    ├── codex-security.test.js                   # v0.5: frontmatter preservation + tool union
    ├── cli.test.js
    ├── self-host.test.js
    ├── dedup.test.js                            # v0.4: EOVERLAP + --allow-overlap
    ├── lockfile.test.js                         # v0.4: stale PID / malformed / non-ownership
    ├── promote.test.js                          # v0.4: .pb-bak rollback
    ├── dry-run.test.js                          # v0.5: replaces dry-run-isolation
    ├── scaffold-modes.test.js                   # v0.5: split / merged / overlap modes
    └── yaml-scalar.test.js                      # v0.5: YAML emitter SSoT
```

> v0.3 deviation: `templates/`, `vendor/`, `core/prompter.js`, etc. were never materialised. Interactive Q1–Q8 lives in the skill body via `AskUserQuestion`.
> v0.5 deviation: `scripts/dry-run-{claude,codex}.sh` removed — replaced by `core/dry-run.js` (node port).

### Component diagram

```
[User] /plugin-builder:new  or  "scaffold me a plugin"
   │
   ▼
skills/plugin-builder/SKILL.md   ← orchestrator
   │
   ▼
skill body (AskUserQuestion)   ← collects Q1–Q8 → writes a UnifiedSpec JSON
   │
   ▼
core/ir.js → UnifiedSpec (JSON, validated by schemas/v1/unified-spec.schema.json)
   │
   ├─────────┬─────────┐
   ▼         ▼         ▼
ClaudeCode  Codex   (Future: Cursor/Continue)
Adapter     Adapter
   │         │
   └────┬────┘
        ▼
core/renderer.js  → adapter-emitted files[] → stage→promote (atomic, .pb-bak rollback)
        │
        ▼
core/validator.js → 6-stage validation (schema/structure/cross-ref/dry-run-cc/dry-run-codex/marketplace)
        │
        ▼
core/marketplace-writer.js → idempotent marketplace.json patch
        │
        ▼
Report (console + file)
```

---

## 3. UnifiedSpec IR (single source of truth)

### 3.1 JSON Schema (summary)

> **Version policy**: `specVersion` required, declared on the instance. `$id` includes a `/v1/` segment — when v2 lands, ship a separate schema file (`unified-spec.v2.schema.json`) + a migration helper in `core/spec-version.js`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://plugin-builder/schemas/v1/unified-spec.schema.json",
  "type": "object",
  "required": ["specVersion", "name", "version", "description", "targets"],
  "properties": {
    "specVersion": { "const": "1.0" },
    "name":        { "type": "string", "pattern": "^[a-z][a-z0-9-]*[a-z0-9]$" },
    "version":     { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+(-[a-z0-9.]+)?$" },
    "description": { "type": "string", "maxLength": 200 },
    "author":      { "type": "object", "properties": { "name": {"type":"string"}, "email": {"type":"string"}, "url": {"type":"string"} } },
    "homepage":    { "type": "string", "format": "uri" },
    "repository":  { "type": "string", "format": "uri" },
    "license":     { "type": "string" },
    "category":    { "type": "string", "enum": ["productivity","dev-tools","ai","data","other"] },
    "targets":     { "type": "array", "items": { "enum": ["claude-code","codex"] }, "minItems": 1 },

    "commands":    { "type": "array", "items": { "$ref": "#/$defs/CommandSpec" } },
    "skills":      { "type": "array", "items": { "$ref": "#/$defs/SkillSpec" } },
    "agents":      { "type": "array", "items": { "$ref": "#/$defs/AgentSpec" } },
    "hooks":       { "type": "array", "items": { "$ref": "#/$defs/HookSpec" } },
    "mcpServers":  { "type": "array", "items": { "$ref": "#/$defs/McpSpec" } },

    "displayName":   { "type": "string" },
    "composerIcon":  { "type": "string" },
    "defaultPrompt": { "type": "array", "items": { "type": "string" } },
    "interface":     { "$ref": "#/$defs/CodexInterfaceExtras" }
  },
  "$defs": {
    "CommandSpec": {
      "type": "object",
      "required": ["name", "description"],
      "properties": {
        "name":        { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
        "description": { "type": "string" },
        "argsHint":    { "type": "string" },
        "body":        { "type": "string" },
        "frontmatter": { "type": "object", "description": "Claude command frontmatter passthrough (model, allowed-tools, ...). Folded lossily into the Codex SKILL.md Commands section." }
      }
    },
    "SkillSpec": {
      "type": "object",
      "required": ["name", "description"],
      "properties": {
        "name":                     { "type": "string" },
        "description":              { "type": "string", "minLength": 20 },
        "body":                     { "type": "string" },
        "allowed-tools":            { "type": "array", "items": { "type": "string" } },
        "disable-model-invocation": { "type": "boolean", "description": "Claude-only field. Preserved on Codex target so privilege scope is not silently widened (v0.5)." },
        "user-invocable":           { "type": "boolean", "description": "Claude-only. Preserved on Codex target (v0.5)." },
        "model":                    { "type": "string", "description": "Claude-only frontmatter — dropped on Codex target with warning." },
        "effort":                   { "type": "string", "description": "Claude-only frontmatter — dropped on Codex target with warning." },
        "argument-hint":            { "type": "string" },
        "paths":                    { "type": "array", "items": { "type": "string" }, "description": "Claude-only" },
        "codex":                    { "type": "object", "description": "per-skill optional Codex policy (e.g. allow_implicit_invocation) — emitted as agents/openai.yaml" }
      }
    },
    "AgentSpec": {
      "type": "object",
      "required": ["name", "description"],
      "properties": {
        "name":        { "type": "string" },
        "description": { "type": "string" },
        "body":        { "type": "string" },
        "tools":       { "type": "array", "items": { "type": "string" } }
      }
    },
    "HookSpec": {
      "type": "object",
      "required": ["event", "command"],
      "properties": {
        "event":   { "type": "string", "description": "The validator marks events known/unknown via the HookEventCompat table. Unknown events produce a warning." },
        "matcher": { "type": "string" },
        "command": { "type": "string" },
        "scriptPath": { "type": "string" }
      }
    },
    "McpSpec": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name":      { "type": "string" },
        "transport": { "enum": ["stdio","http","sse"] },
        "command":   { "type": "string" },
        "url":       { "type": "string", "format": "uri" }
      }
    },
    "CodexInterfaceExtras": {
      "type": "object",
      "description": "Emitted at .codex-plugin/plugin.json::interface. Folded into the README header on the Claude target.",
      "properties": {
        "logo":         { "type": "string" },
        "screenshots":  { "type": "array", "items": { "type": "string" } },
        "brandColor":   { "type": "string" },
        "capabilities": { "type": "array", "items": { "type": "string" } }
      }
    },
    "HookEventCompat": {
      "description": "Declarative compatibility table consulted by the validator. Adapters never hard-code these.",
      "type": "object",
      "properties": {
        "common":     { "enum": ["PreToolUse","PostToolUse","Stop","SessionStart","UserPromptSubmit"] },
        "claudeOnly": { "enum": ["Notification","SubagentStop","PreCompact","SessionEnd"] },
        "codexOnly":  { "enum": ["PermissionRequest"] }
      }
    }
  }
}
```

### 3.2 Mapping rules (UnifiedSpec → target)

| UnifiedSpec | Claude Code output | Codex output |
|---|---|---|
| `specVersion` | (not emitted — meta) | (not emitted — meta) |
| `name, version, description` | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| `author, license, homepage, repository` | same | same |
| `commands[]` | `commands/<name>.md` (frontmatter passthrough) | **folded → SKILL.md "Commands" section** + conversion log (frontmatter demoted to description); command-level `allowed-tools` is unioned into the host skill's `allowed-tools` (v0.5) |
| `skills[]` | `skills/<name>/SKILL.md` (frontmatter: name/description/allowed-tools/disable-model-invocation/user-invocable/model/effort/argument-hint/paths) | `skills/<name>/SKILL.md` (security-critical frontmatter **preserved** as of v0.5: allowed-tools/disable-model-invocation/user-invocable) + an `agents/openai.yaml` if a `codex` block is present |
| `skills[].disable-model-invocation` | frontmatter | **preserved on Codex frontmatter (v0.5)** — silent drop would be privilege widening |
| `agents[]` | `agents/<name>.md` (subagent) | (drop + warning until a Codex equivalent is defined) |
| `hooks[]` (common) | `hooks/hooks.json` + `scripts/` | same + `.codex-plugin/plugin.json::features.plugin_hooks = true` |
| `hooks[]` (claudeOnly) | `hooks/hooks.json` | **drop + warning** |
| `hooks[]` (codexOnly) | **drop + warning** | `hooks/hooks.json` |
| `hooks[]` (unknown event) | warning only, emit | warning only, emit |
| `mcpServers[]` | `.mcp.json` | `.mcp.json` |
| `displayName, composerIcon, defaultPrompt, interface.*` | folded into the README.md header (lossy — no round-trip, documented) | emitted as `.codex-plugin/plugin.json::interface` |

---

## 4. UX flow

### 4.1 Sequence

```
[User]                       [plugin-builder]                [Validators]
  │ /plugin-builder:new           │                              │
  ├──────────────────────────────►│                              │
  │                               │ Q1 target multi-select        │
  │◄──────────────────────────────┤                              │
  │ "both"                        │                              │
  ├──────────────────────────────►│                              │
  │                               │ Q2–Q6 metadata batch          │
  │◄═══════════════════════════════╝                              │
  │                               │ Q7 components multi-select    │
  │                               │ per-component sub-flow        │
  │◄═══════════════════════════════╝                              │
  │                               │ auto-infer (directories/README)│
  │                               │ adapter render                 │
  │                               │ 6-stage validation             │
  │                               ├─────────────────────────────►│
  │                               │◄─────────────────────────────┤
  │                               │ Report + next steps           │
  │◄──────────────────────────────┤                              │
```

### 4.2 Question list (max 8, per-component sub-flows separate)

| # | Prompt | Default | Notes |
|---|---|---|---|
| Q1 | "Target platforms?" (Claude Code / Codex / Both) | Both | multi-select |
| Q2 | "Plugin name?" (kebab-case) | cwd directory name | required |
| Q3 | "One-line description (≤120 chars)?" | — | required |
| Q4 | "Author?" (name / email) | inferred from `git config user.*` | enter accepts |
| Q5 | "License?" | MIT | |
| Q6 | "Initial version?" | 0.1.0 | |
| Q7 | "Components to include?" (commands / skills / hooks / agents / mcp) | commands+skills | multi-select |
| Q8 | "Register in marketplace?" (now / later) | now | |

### 4.3 Per-component sub-flows

**Command**:
- `name?` (`/<plugin>:<name>`)
- `description?`
- `Takes arguments?` Y/N → schema
- `Invokes which tools?` (Read/Bash/...) — auto by default

**Skill**:
- `name?`
- `description (must include trigger keywords, ≥20 chars)` — **critical**
- `allowed-tools?` (optional)
- `disable-model-invocation?` (manual invocation only?)
- `Reference docs path?` (optional)

**Hook**:
- `event?` (target compatibility shown automatically)
- `matcher?` (regex, optional)
- `Script language?` (bash/node)
- `Script body?` (or accept placeholder)

**MCP Server**:
- `name?`
- `transport?` (stdio/http/sse)
- `command or url?`

---

## 5. The 6-stage validation

### 5.1 Stage definitions

| Stage | Name | Tooling | Pass criteria | SKIP condition |
|---|---|---|---|---|
| (a) | Manifest schema | ajv (vendored) + `schemas/*.schema.json` | 100% required, types match, 0 errors | — |
| (b) | File structure | fs check | declared components ↔ directory existence | — |
| (c) | Cross-reference | fs scan + manifest parse | zero mismatch in both directions (manifest entries ↔ files on disk) | — |
| (d) | Claude dry-run | `core/dry-run.js::runClaude` (timeout 30s) | exit 0, JSON output contains the plugin name | `command -v claude` fails OR `claude --version` fails → SKIP |
| (e) | Codex dry-run | `core/dry-run.js::runCodex` (timeout 30s, `CODEX_HOME` isolated) | exit 0 | `command -v codex` fails OR Codex CLI JSON list unsupported → SKIP |
| (f) | Marketplace | ajv + duplicate check | unique id, valid source | — |

> **SKIP semantics**: when an external CLI is missing, return `SKIP` rather than `FAIL`. The final report lists skipped stages explicitly; the exit code is 0 (a CI gate can promote SKIP→FAIL via `--strict`).

### 5.2 Dry-run runner (v0.5: node port)

> **Isolation principle (enforces §0 #3)**: never touch `$HOME` or the user's real CLI config paths (`~/.codex`, `~/.claude`) in a destructive way. All transient state is isolated into `$TMPDIR/plugin-builder-dryrun-XXXXXXXXXX/`. SIGINT/TERM/HUP handled.

`core/dry-run.js` exposes a `TARGETS` descriptor table. Each entry declares:
- `cli` — the binary name to execute (`claude` / `codex`)
- `manifestSubdir` — the manifest sub-directory (`.claude-plugin` / `.codex-plugin`)
- `buildInvocation(staged, tmpRoot, name)` — produces `{ args, env }` for the spawn; sets up HOME / CODEX_HOME isolation
- `interpretSuccess(stdout, name)` — interprets a 0-exit JSON payload
- `interpretFailure(result, stagedManifestExists)` — turns a known non-zero into a degraded SKIP if appropriate

The shared `runDryRun(target, pluginDir)` function:
1. `commandExists(cli)` → SKIP when missing.
2. Read + JSON-parse the manifest. Reject `name` that fails the kebab-case regex (`^[a-z][a-z0-9-]*[a-z0-9]$`).
3. `mkdtemp` an isolated working directory.
4. `copyTreeNoSymlinks(pluginDir, staged)` — refuses symlinks and non-regular files, blocking secret exfiltration via attacker-supplied symlinks.
5. `buildInvocation(...)` + `spawnSync(cli, args, { env, timeout: 30000 })`.
6. Status code 0 → `interpretSuccess`; 127 → SKIP; otherwise `interpretFailure` → fallback to FAIL with last ~200 chars of stderr/stdout.
7. Cleanup the tmp dir in `finally`.

Adding a new dry-run target (e.g. cursor) is one `TARGETS` entry — `runDryRun` is unchanged.

### 5.3 Failure message template

**TTY mode** (`bin/plugin-builder` direct):
```
[FAIL] (c) Cross-reference
  └─ manifest `commands[2].name = "deploy"` has no commands/deploy.md
  └─ Resolution options:
       1) create commands/deploy.md (boilerplate generated)
       2) remove the manifest entry
       3) remap to a different filename
  → Which option? (1/2/3 or skip)
```

**Non-TTY mode** (slash command wrapper — running inside Claude/Codex, no stdin):
Interactive prompts are forbidden. Instead, emit a structured `RESOLUTION_REQUIRED` block as JSON on stdout and exit 65 (EX_DATAERR):
```json
{
  "status": "RESOLUTION_REQUIRED",
  "stage": "c",
  "finding": "manifest commands[2].name='deploy' has no commands/deploy.md",
  "options": [
    { "id": 1, "label": "create commands/deploy.md (boilerplate)", "autoApplicable": true },
    { "id": 2, "label": "remove manifest entry", "autoApplicable": true },
    { "id": 3, "label": "remap to existing file", "autoApplicable": false }
  ]
}
```
The host (slash command body) presents the options to the user → user picks → `bin/plugin-builder --resolve <stage> <option-id>` is re-invoked.

Principles:
- one-line **what/where/why** summary
- the auto-applicable option goes first
- skip permitted; the final report carries an "unresolved" marker
- TTY detection: `process.stdin.isTTY` true → interactive, otherwise → JSON emit

### 5.4 Final report

```
================ Plugin Builder Report ================
Plugin: my-i18n-guard  v0.1.0  (targets: claude-code, codex)

Components
  - commands/    2 files  (/my-i18n-guard:check, /my-i18n-guard:sync)
  - skills/      1 dir    (i18n-key-guard)
  - hooks/       1 file   (PreToolUse: bash)

Validation
  (a) Manifest schema ............. PASS
  (b) File structure .............. PASS
  (c) Cross-reference ............. PASS
  (d) Claude Code dry-run ......... PASS  (0 warn)
  (e) Codex dry-run ............... PASS
  (f) Marketplace entry ........... PASS

Files written (11)
  .claude-plugin/plugin.json
  .codex-plugin/plugin.json
  .claude-plugin/marketplace.json   (entry index 7 appended)
  commands/check.md
  commands/sync.md
  skills/i18n-key-guard/SKILL.md
  ...

Warnings (1)
  - hook `Notification` (claude-only) dropped from the codex target

Next steps
  1) git add . && git commit -m "feat: scaffold my-i18n-guard"
  2) local test: claude --plugin-dir .
  3) PR: gh pr create -B main
========================================================
```

---

## 6. Marketplace auto-patch

### 6.1 Algorithm (idempotent, atomic, lock-protected)

```
Input: spec: UnifiedSpec, marketplace_path: string

Invariant: core/marketplace-writer.js is the sole writer of marketplace_path.
           adapters/* never touch marketplace.json (ownership in §6.3).

1. acquire file lock (proper-lockfile, 5s timeout × 3 retries)
   - on failure → EX_TEMPFAIL (75) and "another publish is in progress"
2. marketplace.json missing → initialise an in-memory { "name": <auto from cwd>, "owner": {...}, "plugins": [] }
3. schema validation (catches corruption in the existing file)
4. look up entry.name == spec.name in plugins[]
   - not present: append a new entry
   - present: **deep-merge** — overwrite keys mentioned in the spec, preserve unknown keys (forward-compat)
     ※ never whole-object replace
5. re-validate
6. atomic write order:
   a. write tmp `${path}.tmp.${pid}.${rand}` + fsync
   b. if original exists → rename(original, original.bak)  ← rename is atomic
   c. rename(tmp, original)
   d. on failure: rename(original.bak, original) to recover
7. release the lock
8. emit diff (so a human can review)
```

**Observations**:
- POSIX rename is atomic by itself, so corruption is impossible even without `.bak`. The `.bak` is for user-driven recovery (intentional rollback).
- Failures during 6b/6c are recovered in 6d. EXIT/INT/TERM traps guarantee cleanup.

### 6.2 Source selection

- `--git-remote` provided → `{ "source": "github", "repo": "<owner>/<name>" }`
- otherwise → `{ "source": "local", "path": "./<name>" }` (v0.7; previously `./plugins/<name>`)
- Codex (legacy `.claude-plugin/marketplace.json` compatible) is covered by the same single entry. Additionally, README inserts a `codex plugin marketplace add ...` snippet — for environments that don't use marketplace.json at all. Coexistence, not duplication.

### 6.3 marketplace.json ownership (contract)

| Responsibility | Module | Behaviour |
|---|---|---|
| Sole read/write authority | `core/marketplace-writer.js` | executes the §6.1 algorithm |
| Adapter | `adapters/claude-code.js`, `adapters/codex.js` | must never touch marketplace.json. Violations throw via `assertNoMarketplaceWrite()` in `adapters/base.js` |
| Self-hosting (P6) | identical — plugin-builder publishing itself also goes through marketplace-writer | — |

---

## 7. Phase plan

| Phase | Goal | Deliverables | Gate |
|---|---|---|---|
| P0 | Lock the design | DESIGN.md v0.2 (this document, with 4-agent audit) | ✅ done |
| P1 | Skeleton + CLI entry | plugin.json, 4 skills, 3 command scaffolds, `bin/plugin-builder` + `core/cli.js`, `vendor/ajv` bundle | engines.node check works |
| P2 | UnifiedSpec + Claude Adapter | `core/ir.js`, `core/spec-version.js`, `adapters/claude-code.js`, `templates/claude/*`, `schemas/v1/*.json` | ir.test.js + adapter-claude.test.js PASS |
| P3 | Codex Adapter + CLI measurement | `adapters/codex.js`, `templates/codex/*`. Confirm the Codex CLI JSON list command via measurement, then finalise stage (e) | adapter-codex.test.js PASS + one Codex CLI execution confirmed |
| P3.5 | Lock down the CI matrix | `.github/workflows/*` — claude/codex CLI availability matrix, SKIP policy documented | — |
| P4 | 6-stage validation + isolated dry-run | `core/validator.js`, `scripts/dry-run-*.sh` (CODEX_HOME isolation, timeout, JSON output) | validator.test.js PASS, dry-run scripts verified across SKIP/PASS/FAIL |
| P5 | Marketplace patch + lock | `core/marketplace-writer.js`, `core/lockfile.js`, the `adapters/base.js` assertion | marketplace-writer.test.js PASS, concurrent-publish lock collision simulation PASS |
| P5.5 | Self-host fixture verified | `tests/fixtures/self-host-spec.json` passes (a)+(b)+(c) | confirms the IR can represent a hybrid plugin — prerequisite to P6 |
| P6 | Self-host | plugin-builder scaffolds itself (dogfood). Output byte-diff against v0.2 self minimised | self-host CI job GREEN |
| P7 | Public release + i18n | GitHub repo, README.md (en) + README.ko.md, demo video, `plugin-builder-official` marketplace repo | — |

---

## 8. Resolved items (2026-05-18)

| # | Item | Decision | Impact |
|---|---|---|---|
| 1 | CLI separation | **Both** — `bin/plugin-builder` Node script is the single entrypoint; the slash command is a wrapper | External CI/scripts can invoke directly. §2 folder structure unchanged. |
| 2 | Test runner | **Node native** (`node:test`) | Zero dependencies. Node 20+ required. `package.json` devDeps minimal. |
| 3 | README i18n | **Generate both Korean and English** | `templates/*/README.md.ejs` + `README.ko.md.ejs` pair. Active from P1. |
| 4 | Marketplace distribution | **Self-hosted `plugin-builder-official` marketplace** | Separate repo. Discoverability marketing separate. Community PRs deferred. |
| 5 | Codex `version` | **Share a single version** (UnifiedSpec.version) | No branching. No target-override field. |

---

## 9. References

- Claude Code Plugins: https://code.claude.com/docs/en/plugins
- Claude Code Plugins Reference: https://code.claude.com/docs/en/plugins-reference
- Marketplace: https://code.claude.com/docs/en/plugin-marketplaces
- Codex Build Plugins: https://developers.openai.com/codex/plugins/build
- Codex Skills: https://developers.openai.com/codex/skills
- Codex Hooks: https://developers.openai.com/codex/hooks
- `skill-creator` (precedent): `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/`

---

## 10. Operational concerns (added in v0.2)

### 10.1 Runtime guard

- `package.json`: `"engines": { "node": ">=20" }`
- First line of `bin/plugin-builder`:
  ```js
  const [maj] = process.versions.node.split('.').map(Number);
  if (maj < 20) { console.error('plugin-builder requires Node >= 20'); process.exit(78); }
  require('../core/cli.js');
  ```
- Use `node:test` (`devDependencies` near-empty)

### 10.2 ajv & schemas — offline first

- Bundle `ajv` + `ajv-formats` into `vendor/`. `require('../vendor/ajv')` — first run without `npm install`.
- Instantiate ajv and register local schemas via `addSchema()`. The `https://` in `$id` is just an identifier — network fetch is disabled (`loadSchema` not set).
- Zero network dependency.

### 10.3 Logging

- `core/log.js`: levels `debug` < `info` < `warn` < `error`
- Environment variable `PLUGIN_BUILDER_LOG=debug|info|warn|error` (default `info`)
- CLI flags `--verbose` = `debug`, `--quiet` = `warn`
- In JSON output mode (`--json`): logs to stderr, results to stdout

### 10.4 Staged render (atomic)

- `core/renderer.js` does not write directly into the target — it writes into `$TMPDIR/pb-stage-XXXXXXXXXX/` first.
- After (a)–(f) all pass, it promotes the staged tree into the target (directory rename or per-file rename).
- On failure: the staged tree is discarded; the target is untouched.
- `--allow-partial` flag bypasses this for debugging.

### 10.5 CI matrix (locked down in P3.5)

| Job | Node | claude CLI | codex CLI | (d) | (e) |
|---|---|---|---|---|---|
| unit-only | 20.x | — | — | SKIP | SKIP |
| claude-integration | 20.x | latest | — | PASS required | SKIP |
| codex-integration | 20.x | — | latest | SKIP | PASS required |
| full | 20.x | latest | latest | PASS | PASS |

`--strict` promotes SKIP → FAIL. Integration jobs apply `--strict`.

### 10.6 Known lossy conversions (must document)

- `commands[].frontmatter` (Claude) → SKILL.md Commands section (Codex): no round-trip.
- `displayName/composerIcon/defaultPrompt/interface.*` (Codex) → README header (Claude): no round-trip.
- `disable-model-invocation` / `user-invocable` (Claude) → as of v0.5, **preserved** on the Codex SKILL frontmatter (silent drop = privilege widening, forbidden).
- `PermissionRequest` (Codex-only) → drop+warn on Claude target.
- A "Cross-target conversion notes" section is auto-generated in the user-facing README.md.

---

## 11. Ready-to-build checklist (P0 close-out gate)

- [x] §0 five core decisions locked (v0.1)
- [x] §8 five open decisions resolved (end of v0.1)
- [x] §1 compatibility matrix corrected against docs (v0.2)
- [x] §3 UnifiedSpec schema gains specVersion + missing fields (v0.2)
- [x] §3.2 mapping corrects the Codex interface location (v0.2)
- [x] §5.2 dry-run isolation/timeout/JSON/SKIP semantics defined (v0.2)
- [x] §5.3 non-TTY mode defined (v0.2)
- [x] §6.1 atomic ordering + file lock + deep-merge (v0.2)
- [x] §6.3 marketplace.json ownership contract (v0.2)
- [x] §7 phase plan gates spelled out (v0.2)
- [x] §10 operational concerns (engines/ajv/log/staged/CI) (v0.2)

→ **P1–P5.5 complete (v0.3). v0.4: H1/H2/H3 + M1–M5 security/robustness hardening + 11 new tests + CI. v0.5: dual-target split default, frontmatter privilege preservation, dry-run node port, FLAGS / SCAFFOLD_MODES SSoT, 49 additional regression tests. P6 full dogfood still pending.**

---

## 12. Build verification (2026-05-18)

```
$ npm test
# tests 93
# pass 93
# fail 0
```

| Checked item | Result |
|---|---|
| `ir.validate` (sample + self-host + invalid cases + URI allowlist) | PASS |
| Claude adapter (manifest, commands, skills, hooks, mcp, marketplace block) | PASS |
| Codex adapter (interface block, commands fold, claude-only drop, features.plugin_hooks, no commands/, marketplace block) | PASS |
| Codex security (allowed-tools / disable-model-invocation / user-invocable preserved, command→skill union, style-key drop) | PASS |
| Validator (stage a, b/c, d/e SKIP, f PASS+FAIL) | PASS |
| Marketplace writer (create, idempotent no-op, deep-merge, github source, .bak atomic, deepMerge unit) | PASS |
| CLI parseArgs (FLAGS SSoT, cluster shorts, unknown flag rejection, `=` form, terminator) | PASS |
| Scaffold modes (single / split / merge / overlap + SCAFFOLD_MODES descriptor) | PASS |
| YAML scalar (1.2 indicators, 1.1 keywords, numeric, control chars, U+2028/U+2029, claude SKILL integration) | PASS |
| Dry-run (TARGETS descriptor shape, traversal reject, symlink reject, manifest missing FAIL-or-SKIP) | PASS |
| Self-host fixture (scaffold → file exists → validate a+b+c) | PASS |

End-to-end smoke (`scaffold tests/fixtures/sample-spec.json --out X`) auto-splits to `X/claude-code/` and `X/codex/`; warnings are accurate, including the v0.5 allowed-tools union notice.

CLI publish smoke: `--git-remote testowner/my-i18n-guard` → `marketplace.json` gains `source: github, repo: testowner/my-i18n-guard` idempotently.

### 12.1 Known limits (post v0.5)

1. **`claude --plugin-dir` / `codex plugin list --json`** still unverified across versions, so stages (d)/(e) frequently SKIP. Will widen to PASS once the CLIs stabilise.
2. **Interactive prompter not in the CLI itself**: spec JSON authoring still happens externally. The skill body handles the `AskUserQuestion`-driven Q1–Q8 flow.
3. **ajv vendor still unused**: the embedded validator is sufficient for v1.0; full JSON Schema draft-2020-12 conformance would require pulling in ajv.
