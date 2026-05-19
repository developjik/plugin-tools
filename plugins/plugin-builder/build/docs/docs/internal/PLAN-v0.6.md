# plugin-builder v0.6 — Plan (multi-plugin marketplace root)

> Status: **SHIPPED 2026-05-18 — P1–P8 all delivered, 138/138 tests PASS, self-host roundtrip green (see `tests/self-host-v0.6.test.js`).**
>
> Previous status: revision 3 — after round 2 agent review (arch 8.8 / impl 8.4 / spec 8.4 with 1 spec blocker: manifest hooks override needed docs citation).
>
> Target audience: contributors. Not a user-facing doc.
>
> Round-1 deltas applied (see §12 Changelog):
> 1. Category mapping → no longer enforced; CATEGORY_MAP is a hint, raw passthrough is allowed (resolves spec blocker #1).
> 2. Hybrid hooks.json assumption → dropped; hooks are always **target-split** even in hybrid plugin trees (resolves spec blocker #2 + arch concern #5).
> 3. Transaction lock model → single sequential lock writer with explicit signal handler ownership (resolves arch concern #2 + impl concern #2).
> 4. P4 (hooks empirical verification) → removed; replaced by P4 (Codex `policy` enum verification, lower-risk doc fetch).
> 5. Effort estimate → 20h → 30h (impl concern #5).
> 6. Stale v0.5 in-plugin marketplace.json → auto-detect + warn on migration (arch concern #3 follow-up).

## 1. Motivation

v0.5 generates a self-contained plugin tree per scaffold invocation. The `marketplace.json` it patches lives **inside the plugin tree** (`<plugin>/.claude-plugin/marketplace.json`). That mirrors a 1-plugin-per-marketplace topology — fine for solo plugins, mismatched with the *official* recommended layout where **a single marketplace catalogs N plugins** sitting under `<root>/plugins/<name>/`.

Confirmed from official docs:

- **Claude Code** (`code.claude.com/docs/en/plugin-marketplaces`):
  ```
  my-marketplace/
  ├── .claude-plugin/marketplace.json
  └── plugins/
      └── quality-review-plugin/
          ├── .claude-plugin/plugin.json
          └── skills/quality-review/SKILL.md
  ```
- **Codex** (`developers.openai.com/codex/plugins/build?install-scope=workspace`):
  ```
  $REPO_ROOT/.agents/plugins/marketplace.json
  $REPO_ROOT/plugins/<name>/
  ```

Both ecosystems agree on `<root>/plugins/<name>/` for the plugin tree. They disagree on the marketplace.json schema and on its location. v0.6 supports both.

## 2. Goals (v0.6)

1. **Multi-plugin marketplace root** — one git repo hosts N plugins; both Claude and Codex marketplace files live at the repo root and are kept in sync.
2. **Hybrid plugin layout** — each `<root>/plugins/<name>/` contains both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (when both targets are enabled). `skills/`, `hooks/hooks.json`, `.mcp.json` are shared.
3. **Idempotent multi-plugin add** — `scaffold --marketplace-root <root> --spec X.json` appends `<name>` to both marketplace files. Re-running with the same spec = no-op.
4. **Backward compatibility** — v0.5 single-plugin scaffold + `<plugin>/.claude-plugin/marketplace.json` patch path stays functional. The new flow is opt-in via `--marketplace-root`.
5. **No new dependencies** — still zero-npm.

## 3. Non-goals (v0.6)

- Migrating existing v0.5 plugins to the new layout (manual; we provide docs only).
- Cursor / Continue adapters (deferred to v0.7+).
- npm or url plugin sources for the Codex side until those schemas are confirmed.
- Cross-marketplace dependency declarations.

## 4. Public surface (CLI + slash commands)

### 4.1 New CLI command: `marketplace init`

```bash
plugin-builder marketplace init <root> [--name <id>] [--display-name <human>]
                                       [--owner-name <name>] [--owner-email <email>]
```

Effect:
- Create `<root>/`.
- Create `<root>/.claude-plugin/marketplace.json` with `owner`, `metadata.pluginRoot: "./plugins"`, `plugins: []`.
- Create `<root>/.agents/plugins/marketplace.json` with `interface.displayName`, `plugins: []`.
- Create `<root>/plugins/` (empty dir, .gitkeep).
- Refuse if `<root>/.claude-plugin/marketplace.json` already exists (use `--force` to overwrite).

Defaults: `--name` falls back to `path.basename(root)`. `--display-name` falls back to a Title-Case of `--name`. `--owner-name` / `--owner-email` from `git config user.name|email` if unset (with a final fallback to `"unknown"`).

### 4.2 Extended scaffold

```bash
plugin-builder scaffold --spec <spec.json> --marketplace-root <root>
                        [--no-publish]                 # opt-out of auto-catalog
                        [--split-out]                  # legacy split layout (debugging)
```

Behaviour when `--marketplace-root` is provided:
- `--out` is computed as `<root>/plugins/<spec.name>/` (override is rejected — single source of truth).
- Mode is **always `hybrid`** (both manifests in one tree, skill/hooks/mcp shared).
- After successful render: automatically invoke marketplace patch (both files), unless `--no-publish` is set.
- `--split-out` available only for debugging; emits to `<root>/.split/<spec.name>/{claude-code,codex}/`. Not for production use.

Backward-compat: when `--marketplace-root` is **not** provided, v0.5 behaviour is preserved verbatim (single-plugin scaffold, no implicit marketplace patch).

### 4.3 Extended publish

```bash
plugin-builder publish <plugin-dir> [--marketplace-root <root>]
                                    [--git-remote <owner/repo>]
                                    [--marketplace <path>]
```

When `--marketplace-root` is given:
- `<plugin-dir>` must be inside `<root>/plugins/`. Path traversal blocked.
- Both `<root>/.claude-plugin/marketplace.json` and `<root>/.agents/plugins/marketplace.json` are patched in a single transactional pass.
- `--marketplace` overrides the Claude marketplace path only (escape hatch; intentionally narrow).
- `--git-remote` switches source to github-shape on both schemas (Claude `source: {source:"github", repo:...}`, Codex same).

When `--marketplace-root` is omitted:
- v0.5 behaviour (single Claude marketplace patch at `<plugin-dir>/.claude-plugin/marketplace.json`).

### 4.4 Slash commands (user-facing layer)

- `/plugin-builder:new` — Q1–Q8 unchanged. **New Q9**: "Add to existing marketplace root?" (yes/no). If yes, ask for marketplace root path (validate `.claude-plugin/marketplace.json` exists).
- `/plugin-builder:marketplace-init` — new. Wraps `marketplace init`.
- `/plugin-builder:publish` — accepts an optional marketplace root via Q.

## 5. Internal architecture changes

### 5.1 `core/marketplace-writer.js` — split into two patchers

```js
// Current (v0.5)
async function patch(marketplacePath, spec, opts) { ... }

// v0.6
async function patchClaude(marketplacePath, spec, opts) { ... }   // renamed from patch
async function patchCodex(marketplacePath, spec, opts) { ... }    // new
async function patchMarketplaceRoot(rootDir, spec, opts) {
  // Sequential single-lock transaction (revised after round 1):
  // — Build BOTH new contents in memory first (pure, no IO).
  // — Then take Claude lock, write Claude atomically, release.
  // — Then take Codex lock, write Codex atomically, release.
  // — If Codex write fails: re-acquire Claude lock and restore from .bak.
  //   The Claude .bak from the just-completed write is the rollback anchor.
}
```

**Why sequential, not two-locks-at-once** (round 1 arch/impl finding):
- `core/lockfile.js` SIGINT handler assumes a single owned lock. Holding two locks across a signal window invites partial-release bugs.
- Two-lock concurrent take requires deadlock-avoidance ordering AND retry-with-backoff. Sequential single-lock writer eliminates both.
- A reader observing "Claude updated, Codex about to update" is the same exposure as today's single-file writer between fsync and rename — accepted as small window. Reader-side staleness is not a correctness issue, only a discoverability lag.

Lock ordering is fixed (`.claude-plugin` first, then `.agents/plugins`) — Claude lands first because it's the more-widely-consumed schema. Failure path always rolls back Claude so callers never observe Codex-only success.

The transaction wrapper algorithm:
1. Build new Claude content + new Codex content in memory. Validate both. Bail before any IO if either fails.
2. Acquire Claude lock → atomicWrite Claude → release Claude lock.
3. Acquire Codex lock → atomicWrite Codex → release Codex lock.
4. On step-3 failure: re-acquire Claude lock → restore Claude from its `.bak` (still on disk from step 2) → release. Surface the original Codex error.
5. Idempotent no-op: if both serialised contents equal current on-disk contents, skip both writes; return `{ action: 'noop' }`.

Signal handling: each `atomicWrite` already owns SIGINT/SIGTERM/SIGHUP via `lockfile.js`. Sequential ownership means at most one lock is alive at any moment — the existing handler is sufficient unchanged.

### 5.2 New module: `core/marketplace-entry.js`

Hosts schema-specific entry builders. Pure functions. Unit-testable.

```js
function claudeEntry(spec, opts) { /* flat source string OR {source:"github",...} */ }
function codexEntry(spec, opts) {
  // {source: {source:"local", path:"./plugins/<name>"}, policy:{...}, category}
  // category Camel→PascalCase per CATEGORY_MAP
}
function buildClaudeRoot(opts) { /* {name, owner, metadata.pluginRoot, plugins:[]} */ }
function buildCodexRoot(opts) { /* {name, interface.displayName, plugins:[]} */ }
```

**Category mapping** (revised after round 1 spec finding):

Neither Claude Code nor Codex officially publishes an exhaustive category enum. Claude's docs use lowercase example values (`"productivity"`); Codex examples show PascalCase (`"Productivity"`). plugin-builder treats `spec.category` as a **raw string** and applies only a best-effort transform:

```js
// Hint table — NOT enforcement. Unknown keys pass through untouched.
const CATEGORY_HINT = Object.freeze({
  productivity: { claude: 'productivity', codex: 'Productivity' },
  'dev-tools':  { claude: 'dev-tools',    codex: 'DevTools' },
  ai:           { claude: 'ai',           codex: 'AI' },
  data:         { claude: 'data',         codex: 'Data' },
  other:        { claude: 'other',        codex: 'Other' },
});

function claudeCategory(raw, perTargetOverride) {
  if (perTargetOverride) return perTargetOverride;
  return CATEGORY_HINT[raw]?.claude ?? raw;          // passthrough on miss
}
function codexCategory(raw, perTargetOverride) {
  if (perTargetOverride) return perTargetOverride;
  return CATEGORY_HINT[raw]?.codex ?? toPascal(raw); // best-effort transform
}
```

Rationale: we can't validate against an enum that doesn't exist. We help authors write one `spec.category` and emit the convention each ecosystem expects, but never fail validation on an unknown category.

**Per-target override** (round 2 arch finding follow-up):

The spec may opt out of the hint by declaring per-target categories:

```json
{
  "category": "ai-tools",
  "claude": { "category": "ai-tools" },
  "codex":  { "category": "AITools" }
}
```

When `spec.claude.category` / `spec.codex.category` is set, it wins. The hint table is only consulted when no per-target override is provided.

**Hint-miss warning**: when `CATEGORY_HINT[raw]` returns undefined AND no per-target override exists, scaffold emits a warning:

```
[category] 'ai-tools' is not in CATEGORY_HINT — emitting verbatim for Claude and 'AiTools' (PascalCase fallback) for Codex.
Consider setting spec.claude.category / spec.codex.category explicitly.
```

Authors keep an audit trail, but no scaffold ever fails over an unknown category.

### 5.3 `core/cli.js` changes

- New `FLAGS` entries: `marketplace-root`, `name`, `display-name`, `owner-name`, `owner-email`, `force`, `no-publish`, `split-out`.
- New subcommand `marketplace` (with `init` subsubcommand). Dispatch table grows: `marketplace init` → `cmdMarketplaceInit`.
- `cmdScaffold` branches: `args.opts['marketplace-root']` triggers the new code path; otherwise unchanged.
- `cmdPublish` likewise.

**Nested dispatcher spike** (round 2 impl finding): the existing top-level switch in `main()` is flat (`scaffold` / `validate` / `publish` / `version` / `help`). Adding `marketplace init` (and future `marketplace remove` etc.) needs a 2-deep dispatch. Keep data-driven:

```js
const SUBCOMMANDS = Object.freeze({
  marketplace: {
    init: cmdMarketplaceInit,
    // future: remove, list, ...
  },
});

function dispatch(args) {
  const top = args._[0];
  if (SUBCOMMANDS[top]) {
    const sub = args._[1];
    const handler = SUBCOMMANDS[top][sub];
    if (!handler) throw new Error(`unknown ${top} subcommand: ${sub}`);
    return handler(args);
  }
  // existing top-level switch
}
```

Allocate the first 0.5h of P3 to this spike (verifying parseArgs handles `marketplace init` cleanly — args._[0]='marketplace', args._[1]='init').

### 5.4 New tests

| File | Coverage |
|---|---|
| `tests/marketplace-init.test.js` | init creates both files, defaults applied, refuses overwrite, --force overwrites |
| `tests/marketplace-codex.test.js` | codex entry shape, category mapping, policy defaults, github source variant |
| `tests/marketplace-root-patch.test.js` | both files patched, idempotent, rollback on second-write fail, lock ordering |
| `tests/scaffold-marketplace-root.test.js` | scaffold writes `<root>/plugins/<name>/` hybrid layout, both manifests, shared skills, auto-publish, --no-publish |
| `tests/marketplace-entry.test.js` | pure entry builder unit tests |

Target: 93 → ~115 tests.

### 5.5 Schema additions

`schemas/v1/marketplace-codex.schema.json` — new file. Validates the Codex marketplace shape (`interface.displayName`, plugin entries with nested source + policy + category).

`schemas/v1/marketplace-claude.schema.json` — extract from current inline validation. Validates Claude marketplace shape.

Both consumed by `core/marketplace-writer.js` for the validate step.

## 6. Plugin tree layout (hybrid mode, revised after round 1)

When `--marketplace-root` is used, the tree at `<root>/plugins/<name>/` looks like:

```
<root>/plugins/<name>/
├── .claude-plugin/
│   └── plugin.json                 # Claude manifest, "hooks": "./hooks/claude.json"
├── .codex-plugin/
│   └── plugin.json                 # Codex manifest, "hooks": "./hooks/codex.json"
├── hooks/                          # AT PLUGIN ROOT — not inside .claude-plugin/
│   ├── claude.json                 # Claude-target events (claudeOnly + common)
│   └── codex.json                  # Codex-target events (codexOnly + common)
├── skills/
│   └── <skill-name>/
│       └── SKILL.md                # Codex variant (commands fold + tool union)
│                                   # — Claude tolerates extra ## Commands section
├── commands/                       # only if spec.commands and targets includes claude-code
│   └── <command-name>.md
├── .mcp.json                       # shared (identical across both targets)
└── README.md
```

### Why `hooks/` at plugin root, not inside `.claude-plugin/`

Claude Code's plugins reference explicitly forbids non-manifest dirs inside `.claude-plugin/`:

> "The `.claude-plugin/` directory contains the `plugin.json` file. All other directories (commands/, agents/, skills/, output-styles/, themes/, monitors/, hooks/) must be at the plugin root, not inside `.claude-plugin/`."
> — code.claude.com/docs/en/plugins-reference

So hooks live at `<plugin-root>/hooks/`, with `claude.json` and `codex.json` as **separate files** in that one shared dir. Each manifest points at its file via the `hooks` field.

### Manifest `hooks` field override — both runtimes officially support it

**Claude Code** plugins-reference, "File locations reference":
> `hooks` (string|array|object) — "Hook config paths or inline config" — example `"./my-extra-hooks.json"`
>
> "When a plugin has both a default folder and the matching manifest key, Claude Code v2.1.140 and later flags the ignored folder in `/doctor`... The plugin still loads using the manifest paths."

→ `.claude-plugin/plugin.json` declares `"hooks": "./hooks/claude.json"` and Claude loads that file instead of the default `hooks/hooks.json`. Documented and supported.

**Codex** plugins/build docs:
> "If you define `hooks` in `.codex-plugin/plugin.json`, Codex uses that manifest entry instead of the default `hooks/hooks.json`."
>
> "The manifest field can be a single path, an array of paths, an inline hooks object, or an array of inline hooks objects."

→ `.codex-plugin/plugin.json` declares `"hooks": "./hooks/codex.json"` and Codex loads that file. Documented and supported.

### What is shared, what is split

| File / dir | Shared in hybrid? | Reason |
|---|---|---|
| `.claude-plugin/plugin.json` | no — Claude-only path | Different manifest schemas |
| `.codex-plugin/plugin.json` | no — Codex-only path | Different manifest schemas |
| `skills/<n>/SKILL.md` | **yes (Codex variant)** | Body markdown — Claude reads extra "## Commands" section as harmless context |
| `commands/*.md` | **yes (Claude reads; Codex ignores)** | Codex doesn't define a discovery rule for top-level `commands/` |
| `hooks/claude.json` | Claude-only file | Per-target file in shared `hooks/` dir; Claude manifest's `hooks` field points to it |
| `hooks/codex.json` | Codex-only file | Per-target file in shared `hooks/` dir; Codex manifest's `hooks` field points to it |
| `.mcp.json` | **yes** | Byte-identical for both targets (confirmed in v0.5 demo) |
| `README.md` | **yes** | One README, Codex interface metadata folded into header |

### Manifest `hooks` field assignments

Both plugin manifests reference their target-specific file inside the shared `hooks/` dir at plugin root:
- `.claude-plugin/plugin.json`: `"hooks": "./hooks/claude.json"`
- `.codex-plugin/plugin.json`: `"hooks": "./hooks/codex.json"`

Paths are relative to the **plugin root** (per docs in both ecosystems), not relative to the manifest's containing directory. No new runtime behaviour — we exercise an existing, documented override knob.

### Tool union widening — still relevant for SKILL.md

The Codex variant SKILL.md still widens `allowed-tools` to include command-level tools (union). When Claude reads this variant:
- Claude's command-level frontmatter (`commands/*.md`) still carries `allowed-tools` independently.
- The widening only applies to the **skill** in Claude's view — i.e. the skill is granted union scope.
- We continue to emit a `[codex] merged allowed-tools from folded commands` warning at scaffold time so authors see the widening.

If the author explicitly opts out (`spec.skills[].codexFoldCommands: false`, **new optional field**), we emit two separate SKILL.md files (Codex variant in a per-target overlay) and keep Claude's skill scope unwidened. Default remains "fold + union" for one-tree simplicity.

## 7. Migration

For users on v0.5 wanting to adopt v0.6 layout:

1. `plugin-builder marketplace init ./my-marketplace`
2. `mv ./old-plugin ./my-marketplace/plugins/old-plugin`
3. Delete `./my-marketplace/plugins/old-plugin/.claude-plugin/marketplace.json` (old in-plugin marketplace).
4. `plugin-builder publish ./my-marketplace/plugins/old-plugin --marketplace-root ./my-marketplace`
5. Repeat per plugin.

No automated migration command. Manual steps documented in USAGE.

## 8. Open questions (after round 1 — narrowed)

1. ~~**Hook unknown-event behaviour**~~ — **RESOLVED**. We no longer assume silent-ignore; hooks are always per-target split (§6).
2. **Codex marketplace `policy.installation` enum** — **RESOLVED**. Codex docs explicitly list `AVAILABLE | INSTALLED_BY_DEFAULT | NOT_AVAILABLE`. Plan emits `AVAILABLE` as default; `spec.codex.policy.installation` overrides.
3. **Codex marketplace `policy.authentication` enum** — partial. Only `ON_INSTALL` documented in examples. Plan emits `ON_INSTALL` as default; `spec.codex.policy.authentication` overrides. Both fields are required per docs ("Always include `policy.installation`, `policy.authentication`, and `category` on each plugin entry"), so we never omit them.
4. **Codex `metadata.pluginRoot` analogue**: docs allow plain string `source: "plugin-a"` shorthand for relative paths. plugin-builder always emits the nested explicit form `{source:"local", path:"./plugins/<name>"}` — verbose but unambiguous, matches the official example faithfully.
5. **Lock contention corner case**: with sequential single-lock writer (§5.1 revision), `.agents/plugins/marketplace.json` locked by another writer simply causes its `acquire()` to retry per the existing lockfile retry policy. No new corner case. (Original concern about two-lock deadlock is moot.)
6. ~~**`--split-out` value**~~ — **RESOLVED**: debugging-only, undocumented in user-facing docs. Available via `--split-out` flag.
7. **`spec.author` → Codex marketplace entry**: forward-compat — emit `plugins[].author` on Codex side too even though current Codex examples don't show it; Codex deep-merge preserves unknown keys, so worst case is harmless extra field.

All gating items are resolved. The only remaining unknowns (additional values in the `policy.authentication` enum beyond `ON_INSTALL`) are mitigated by author-side passthrough (`spec.codex.policy = { installation, authentication }`) — plugin-builder doesn't need a release to accept future enum values.

## 9. Phase plan (v0.6 development, revised after round 1)

| Phase | Deliverable | Gate |
|---|---|---|
| P0 | This plan reviewed and approved by 3 agents (impl / arch / spec) | all 3 ≥ 9/10 |
| P1 | `core/marketplace-entry.js` + unit tests (entry builders, category hint, root templates) | pure-function tests pass |
| P2 | `core/marketplace-writer.js` split + `patchMarketplaceRoot` (sequential single-lock) + rollback tests | fault injection: Codex write fail → Claude restored from .bak |
| P3 | `cli.js` FLAGS extension + `marketplace init` subcommand + `cmdScaffold --marketplace-root` branch + E2E tests | scaffold → both manifests + plugin tree + both marketplace.json entries; --no-publish opt-out works |
| P4 | Codex policy enum passthrough verified (Q8 #2/#3) — docs fetch + sample passthrough; **no external CLI required** | `spec.codex.policy` override emitted verbatim; defaults emitted when absent |
| P5 | Slash command updates + Q9 in `/plugin-builder:new` + `/plugin-builder:marketplace-init` | user surface test passes |
| P6 | Docs (USAGE, DESIGN, README) updated + Korean translations | doc agent re-evaluates: ≥ 9/10 |
| P7 | Self-host migration: plugin-builder becomes 1-plugin entry in a marketplace root | self-host test passes |
| P8 | Stale v0.5 marketplace.json detection — warn when an in-plugin `.claude-plugin/marketplace.json` is found inside `<root>/plugins/<n>/` | stale detect test passes |

## 10. Risks (revised after round 1)

| Risk | Mitigation |
|---|---|
| ~~Codex runtime errors on unknown hook events~~ | **Resolved**: hooks always target-split (§6). No assumption to verify. |
| Two-marketplace write race | Sequential single-lock writer (§5.1 revision) eliminates two-lock deadlock entirely. Rollback via Claude `.bak` covers Codex-write failure. |
| Surface area inflation (3 layouts: v0.5, hybrid, split-out) | `--split-out` is debugging-only and undocumented in user-facing docs. v0.5 default unchanged unless `--marketplace-root` is passed. |
| Schema drift between Claude/Codex official specs | Two separate JSON Schema files (`schemas/v1/marketplace-claude.schema.json`, `marketplace-codex.schema.json`) version-pinned. Category mapping is hint-only, not enforced. |
| Migration friction for v0.5 users | Manual migration doc + P8 stale-detect warning + per-plugin marketplace.json left untouched on opt-out. |
| Codex `policy` enum evolves over time | `spec.codex.policy` passthrough lets authors emit any future enum value without a plugin-builder release. |
| `--marketplace-root` + `--out` user confusion | Reject `--out` when `--marketplace-root` is set; error message explains the auto-computed path. |
| EN/KO docs drift after edits | P6 builds both languages in the same phase; CI lint job (planned for v0.7) will diff section headings to detect drift. |
| Per-target category override forgotten in author specs | Hint-miss warning surfaces unknown categories during scaffold; author can opt in to `spec.{claude,codex}.category` next iteration. |

## 11. Estimated effort (revised after round 2 impl finding)

| Phase | Hours |
|---|---|
| P1 (entry builders + category hint + per-target override + schema files) | 3 |
| P2 (writer split + sequential transaction + rollback fault-injection tests + lock contention test) | 8 |
| P3 (nested dispatcher spike 0.5h + CLI subcommand dispatch + flags + scaffold/publish branches + E2E tests) | 5 |
| P4 (Codex policy passthrough + schema file + docs sample) | 1 |
| P5 (slash command Q9 + marketplace-init wrapper + Q tests) | 3 |
| P6 (USAGE/DESIGN/README × EN+KO sync + per-target override docs) | 12 |
| P7 (self-host migration test) | 2 |
| P8 (stale v0.5 marketplace.json detect + warning + test) | 2 |
| **Total** | **~36h** (excluding agent eval iterations) |

## 12. Changelog (round 1 → revision 2)

Applied 2026-05-18 after the first 3-agent review (arch / impl / spec).

| Concern | Round 1 finding | Revision 2 response |
|---|---|---|
| Hybrid hooks.json silent-ignore assumption | spec BLOCKER #2 + arch concern #5 — no official basis | §6 rewritten: hooks always per-target split inside `.claude-plugin/hooks/` and `.codex-plugin/hooks/`. Manifests point at their own dirs. |
| Category enum invented | spec BLOCKER #1 — Claude has no kebab enum | §5.2 rewritten: `CATEGORY_HINT` replaces `CATEGORY_MAP`; raw passthrough on unknown keys; never fails. |
| Two-lock SIGINT race | arch concern #2 + impl concern #2 — current lockfile.js owns a single lock | §5.1 rewritten: sequential single-lock writer. At most one lock alive at a time. SIGINT handler unchanged. |
| P4 (hooks empirical verification) blocks RC without external runtime | impl concern #4 | P4 redefined to docs-fetch + `policy` passthrough verification. No external CLI required. |
| 20h estimate optimistic | impl concern #5 — DESIGN.md i18n + lockfile test infra heavier than assumed | §11 revised to 30h with per-phase breakdown. |
| Stale v0.5 in-plugin marketplace.json on migration | arch concern #3 follow-up | New P8 phase: detect & warn when `<root>/plugins/<n>/.claude-plugin/marketplace.json` is present. |
| Codex `metadata.pluginRoot` analogue (§8 #3) | spec round 1 — uncertain | Resolved: always emit explicit nested form. Verbose but unambiguous. |

### Round 2 → revision 3 deltas (this revision)

Applied 2026-05-18 after the second 3-agent review.

| Concern | Round 2 finding | Revision 3 response |
|---|---|---|
| Manifest `hooks` field override unverified | spec BLOCKER — docs not cited | §6 rewritten: explicit citation from Claude plugins-reference (`hooks: string|array|object`) and Codex plugins/build ("If you define hooks in .codex-plugin/plugin.json, Codex uses that manifest entry"). |
| Hooks layout violated "no dirs under .claude-plugin/" | discovered while citing | §6 layout moved hooks to `<plugin-root>/hooks/{claude,codex}.json` (shared dir, target-specific files). Manifests point at their file. |
| Codex `policy.installation` enum | round 2 spec — open | RESOLVED: docs list `AVAILABLE | INSTALLED_BY_DEFAULT | NOT_AVAILABLE`. Default `AVAILABLE`. Passthrough via `spec.codex.policy.installation`. |
| Codex `policy.authentication` enum | round 2 spec — partial | Partial. Only `ON_INSTALL` documented in examples. Default `ON_INSTALL`. Passthrough via `spec.codex.policy.authentication`. Both fields required per docs (always emit). |
| Category hint miss with no warning | round 2 arch | §5.2 adds hint-miss scaffold warning. Per-target override `spec.{claude,codex}.category` documented. |
| Nested dispatcher spike risk | round 2 impl | §5.3 adds explicit dispatcher pattern + first-0.5h spike in P3. |
| 30h estimate optimistic | round 2 impl | §11: P2 6→8h (lock contention test), P6 8→12h (EN+KO sync). Total 30→36h. |
| EN/KO doc drift | round 2 impl follow-up | §10 risk row added; P6 builds both languages in same phase; CI lint job tracked as v0.7. |

### Carry-forward (still open)

- §8 #7 — Whether to forward `spec.author` into Codex `plugins[].author`. Lean: yes, with passthrough.
