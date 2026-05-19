# Plugin Builder — Multi-Agent Code Review (ARCHIVED, v0.3)

> 2026-05-18 · **audit snapshot as of v0.3 (preserved for history)** · 5 agents in parallel
>
> Korean version: [REVIEW.ko.md](./REVIEW.ko.md)
>
> **Status**: v0.4 closed the document's core P0 items via H1/H2/H3 + M1–M5 + 11 new tests + CI. v0.5 added a further round of 10-point hardening covering frontmatter privilege preservation, dry-run node port, dual-target split default, FLAGS / SCAFFOLD_MODES single-source-of-truth, YAML emitter, and URI allowlist. This document is preserved as history. Current v0.7 state lives in DESIGN.md §0 build notes, README quality gates, and `.plugin-eval/MEASUREMENT.md`.
>
> The document records evaluation findings and the resulting work list by priority (P0/P1/P2). Each row is `file:line — finding — fix`.
>
> ## Distribution model
>
> **Public surface = plugin only.** Users invoke via `/plugin-builder:new|:validate|:publish` slash commands and 4 skills. The `bin/plugin-builder` Node CLI is treated as **internal implementation detail** and is not surfaced in user-facing README/docs. The slash commands spawn the CLI internally, but only "plugin" is shown to users.
>
> **Impact on this review:**
> - User-facing CLI documentation drift (README CLI usage, exposure of `--resolve/--json/--allow-partial`) → **remove** first. Unimplemented flags must not appear in user docs.
> - `commands/*.md` (slash command bodies) and `skills/*/SKILL.md` are **the real public surface** → quality priorities raised.
> - `core/cli.js` itself is internal, but slash commands invoke it, so robustness stays P0/P1.
> - `plugin-builder version|help` and other CLI subcommands are for contributors/devs. They appear only in internal docs like `docs/internal/`.

---

## 0. Executive summary

| Area | Assessment | Notes |
|---|---|---|
| Architecture (UnifiedSpec IR + 2 adapters) | Good | Code matches the DESIGN.md decisions; marketplace single-writer contract enforced both ways |
| Code quality | Good | Some duplication (yaml helper) + a few dead exports |
| Security | **Needs attention** | Path traversal · symlink follow · `$HOME` not isolated in `dry-run-claude` · prototype pollution |
| Atomicity / locks | **Needs attention** | Stale locks undetected, atomic write order is not SIGKILL-resilient |
| Schema / IR | Attention | Embedded validator ignores many JSON Schema features; schema↔IR pattern mismatch |
| Tests | Insufficient | CLI ~10%, lockfile ~30%, atomic rollback 0% |
| Docs / UX | Attention | **Version drift (0.2.0 vs 0.3.0)** across 4 files; multiple unimplemented flags documented |

33/33 tests PASS covers only the happy path. The 12 P0 items must be addressed before real use and release.

---

## 1. P0 — Release blockers

### 1.1 Version drift (fix immediately)

README/DESIGN declare `0.3.0`. The following 4 files are still `0.2.0`:

| file | line | Current | → | user-facing? |
|---|---|---|---|---|
| `.claude-plugin/plugin.json` | 3 | 0.2.0 | 0.3.0 | **YES — shown on plugin install** |
| `.codex-plugin/plugin.json` | 3 | 0.2.0 | 0.3.0 | **YES — shown on plugin install** |
| `.claude-plugin/marketplace.json` | 9 | 0.2.0 | 0.3.0 | **YES — marketplace registration** |
| `package.json` | 3 | 0.2.0 | 0.3.0 | NO (internal — but the source of the CLI `version` subcommand the slash command invokes) |

Per the distribution model the three user-facing manifests are critical. package.json is internal but must be bumped alongside since it's the version source for the CLI invoked by the slash command.

### 1.2 Security

- **`core/renderer.js:32,49`** — no path-traversal block on `f.path`. A malicious/buggy adapter returning `../../etc/x` would write outside the plugin dir. **Fix:** before write, assert `path.relative(targetDir, dest).startsWith('..')` is false, and reject absolute paths.
- **`core/renderer.js:48-53`** — `readdirSync` + `copyFileSync` follow symlinks. If the staged tree contains a link to `/etc/shadow`, it gets copied into the target. **Fix:** `fs.lstatSync` to reject symlinks, or `O_NOFOLLOW`.
- **`scripts/dry-run-claude.sh`** — no `$HOME` isolation (violates DESIGN §5.2). Unlike `codex.sh`, this lets the `claude` CLI touch the real `$HOME`'s settings/MCP/OAuth tokens. **Fix:** add `export HOME="$TMP/home"; mkdir -p "$HOME"` (mirror the codex script).
- **`scripts/dry-run-claude.sh:13` / `dry-run-codex.sh:19`** — `cp -R` follows symlinks → secrets could be copied into `/tmp` (world-readable). **Fix:** `cp -RP` or `rsync --safe-links`.
- **`core/marketplace-writer.js:30-40`** — `deepMerge` doesn't reject `__proto__/constructor/prototype` keys → prototype pollution. **Fix:** key whitelist + `Object.create(null)`.

### 1.3 Atomic write / lockfile

- **`core/lockfile.js:10-33`** — stale locks not detected. A dead PID's lock blocks forever. No signal handler — a mid-run SIGKILL leaks the lock permanently. **Fix:** record PID inside the lockfile, on EEXIST check `process.kill(pid, 0)` (ESRCH = stale → reclaim), release in `process.on('exit')`.
- **`core/marketplace-writer.js:98-111`** — atomic ordering disagrees with DESIGN §6.1:
  1. If `.bak` already exists, it is unconditionally overwritten — destroying the only intact copy of a previous crashed run.
  2. tmp → target rename failure does not clean up tmp → orphans accumulate on every retry.
  3. Lacks `fsync(dirfd)` for power-loss durability.
  **Fix:** check `fs.existsSync(bak)` first and move it aside, `fs.unlinkSync(tmp)` in catch, fsync the parent directory fd.

### 1.4 Dry-run SKIP masking FAIL

- **`scripts/dry-run-claude.sh:27`** — the `set -e` + `if ... ; then ... fi` shape makes `rc=$?` unreachable. timeouts (124) and crashes get reported as SKIP → CI grins-and-passes. **Fix:** restructure as `if cmd ; then ...; else rc=$?; fi`; 124 → FAIL, exec-not-found → SKIP.
- **`scripts/dry-run-codex.sh:21-33`** — same shape. When `codex plugin list --json` fails it falls back to manifest-only SKIP. Real FAIL signal lost. **Fix:** branch on exit code (124 = FAIL timeout, 127 = SKIP, otherwise = FAIL).

### 1.5 Validator stage A passes a native manifest unconditionally

- **`core/validator.js:40-49`** — when the manifest has no `specVersion`, schema validation is skipped and PASS returned. Plugins missing required fields go green. **Fix:** if a manifest exists, always run `ir.validate`; absent `specVersion` → SKIP (not PASS).

---

## 2. P1 — short-term post-release fixes

### 2.1 Remove CLI exposure from README (distribution-model alignment)

**Distribution model correction**: under plugin-only policy, the README only explains plugin install/use. CLI usage moves into a contributor-facing doc such as `docs/internal/CLI.md`.

- **`README.md:30-38`** ("CLI" section + the `plugin-builder scaffold|validate|publish` block) — users don't invoke the CLI directly. Remove or demote to a contributor section. The user-facing install surface is the plugin marketplace flow (`/plugin install plugin-builder@plugin-builder-official`).
- **`README.md:56-60`** ("Slash commands when installed as plugin") — this is the actual user-facing surface. Promote to the top.
- **`README.md:23-26`** — current install step is `git clone && node --test`, a contributor flow. Replace with the user install flow (plugin marketplace add → /plugin install). Move the old steps into `docs/internal/DEVELOPMENT.md`.
- **`docs/USAGE.md` entire file** — currently CLI-flag centric. Either mark it explicitly as an internal reference (`> This document is the internal CLI reference; ordinary users only use the plugin slash commands`) or rename it to `docs/internal/CLI-REFERENCE.md`.

### 2.2 Unimplemented CLI flags — move to internal backlog

The following flags appear in docs but are not implemented in `core/cli.js`. Since users don't invoke them directly, remove from user docs and keep only as internal v0.4 backlog:

| flag | Doc location | Handling |
|---|---|---|
| `--resolve <stage> <option-id>` | `docs/USAGE.md:249`, `commands/validate.md:8`, DESIGN §5.3 | **Remove from commands/validate.md** (user-facing). Keep in DESIGN §5.3 / USAGE marked as v0.4 backlog. |
| `--json` | DESIGN §10.3, USAGE §10.3 | Keep in internal reference, marked v0.4 backlog. |
| `--allow-partial` | DESIGN §10.4, `skills/plugin-builder-scaffold/SKILL.md:25` | **Remove from skill body** (user-facing). Keep in DESIGN as backlog. |

**Bottom line:** zero mentions of unimplemented CLI flags in `commands/*.md` and `skills/*/SKILL.md`. Internal docs (DESIGN, USAGE) flag them explicitly as v0.4 backlog.

### 2.3 Lossy mapping warnings missing

DESIGN §10.6 says "drop+warn", but the adapter currently silent-drops:

- **`adapters/codex.js:96-113`** (`#skillFile`) — `disable-model-invocation`, `user-invocable`, `model`, `effort`, `paths` silent drop. **Fix:** per-key warning push.
- **`adapters/codex.js:23-25`** — when folding commands, losses of `frontmatter.{model,allowed-tools}` and `argsHint` are not itemised. **Fix:** per-command warning.
- **`adapters/claude-code.js:159-188`** — `displayName/composerIcon/defaultPrompt/interface.*` folded into README without any warning. **Fix:** at least one warning + auto-emit a "Cross-target conversion notes" section into the README.

### 2.4 Schema ↔ IR pattern mismatch

- **`schemas/v1/unified-spec.schema.json:55`** (`SkillSpec.name`) — `^[a-z][a-z0-9-]*$` (trailing dash allowed)
- **`core/ir.js:103`** — `PATTERNS.name` (`^[a-z][a-z0-9-]*[a-z0-9]$`) is applied

`my-skill-` passes the schema but fails the IR. P6 dogfood would break round-trip. **Fix:** unify both on the stricter pattern (`...[a-z0-9]$`).

### 2.5 Schema missing `format: "uri"`

- `schemas/v1/unified-spec.schema.json:20-21` — no URI validation on `homepage`, `repository`
- `schemas/v1/unified-spec.schema.json:95` — no validation on `McpSpec.url`

Schema drifts from DESIGN §3.1. **Fix:** add `"format": "uri"` + a format handler in the embedded validator (or adopt ajv).

### 2.6 Embedded validator ignores many JSON Schema features

| Feature | Current | Impact |
|---|---|---|
| `additionalProperties` | Ignored | Typos like `descriptoin` silently pass |
| `$ref` / `$defs` | Branched by hand (drift risk) | Schema changes don't propagate to IR |
| `format` (uri/email) | Ignored | Arbitrary strings pass |
| `oneOf` / `anyOf` / `dependentRequired` | Ignored | `stdio` MCP without `command` passes |
| nested `items.type` | Ignored | `defaultPrompt[]`, `paths[]` accept non-strings |

**Fix option A**: harden the embedded validator (4–6h).
**Fix option B**: execute the `vendor/ajv` bundle from DESIGN §10.2 (1–2h, recommended).

### 2.7 IR `validate` doesn't validate hook events

- **`core/ir.js`** — does not classify/warn `HookSpec.event` against `hook-event-compat.json`. Classification only happens during adapter render. Conflicts with DESIGN §3.1:264.
- **`schemas/v1/hook-event-compat.json`** — no meta-schema. Deleting the `common` key would silently break both adapters.

**Fix:** classify `event` inside IR validate; assert presence of `common/claudeOnly/codexOnly` keys.

### 2.8 marketplace writer normalisation

- **`core/marketplace-writer.js:54-57`** — `spec.author` can arrive as a string (claude-code adapter passthrough). The owner shape gets recorded broken. Stage F validator only checks truthiness so this slips through. **Fix:** `typeof spec.author === 'string' ? {name: spec.author} : (spec.author || {name:'unknown'})`.

### 2.9 (Promoted) Slash command body defects — the real user surface

> Under the distribution model, `commands/*.md` is the interface users hit on every call. Defects are immediately user-visible. Handled near the top of P1.

- **`commands/publish.md:6`** — uses `$1 $2 $3 $4`. With `/plugin-builder:publish ./out --git-remote owner/repo`, `--git-remote` lands as a single `$2` token and the value (`owner/repo`) is dropped. **Fix:** switch to `$ARGUMENTS`.
- **`commands/{new,validate,publish}.md`** — frontmatter missing `allowed-tools`. The commands actually invoke Bash/Read. **Fix:** add `allowed-tools: ["Bash", "Read"]` per command.
- **`commands/validate.md:8`** — remove the `--resolve` mention (see §2.2). Unimplemented flags must not appear on the user surface.
- **`skills/plugin-builder-scaffold/SKILL.md:25`** — remove the `--allow-partial` mention (see §2.2).
- **`skills/plugin-builder-{scaffold,validate,marketplace}/SKILL.md`** — descriptions are internal-jargon-heavy ("scaffold step", "marketplace patch"). Natural-language utterances by users won't fire them. If these are intended as sub-skills only invoked by the orchestrator, state so explicitly in line one (`> Internal sub-skill, invoked only by [[plugin-builder]] orchestrator`); otherwise add trigger phrases.

---

## 3. P2 — code hygiene / nits

### 3.1 Code duplication / dead code

- `adapters/{claude-code,codex}.js` `yamlFrontmatter`, `yamlScalar` are byte-identical. → move into `adapters/base.js`.
- `core/renderer.js:9-21` — `render()`, `loadTemplate()` are exported but unused. Remove or wire up.
- `core/ir.js:7` — only `SCHEMA.required` is used, the rest of the export is dead. Removable.
- `adapters/claude-code.js:3` / `codex.js:3,5` — unused `path` / `log` imports.
- `core/cli.js:31` — `parseArgs` mis-parses `--out --next` as `--out=true`. Reject when value starts with `--`.

### 3.2 Error message quality

- `core/cli.js:86,133,159` — direct `JSON.parse(readFileSync(...))`. On bad JSON the raw `Unexpected token` is printed. **Fix:** wrap with try/catch and include the file path.
- `core/spec-version.js:13` — error message omits the supported version list. Use `SUPPORTED.join(',')`.

### 3.3 DESIGN.md drift

- `DESIGN.md:1, §0` is v0.3 while `§7 P0 row` and `§10 heading` say "new in v0.2" → cosmetic.
- `DESIGN.md §2` mentions `templates/*.ejs`, `vendor/`. Reality is `.tpl` + no vendor. Only a subset of deviations are captured in §0 build notes. **Fix:** refresh the §2 tree.

### 3.4 Embedded hardening nits

- `core/validator.js:100,110` — `spawnSync timeout` doesn't kill grandchildren. Add `killSignal:'SIGKILL'` + `detached`.
- `core/validator.js:143-153` — `parseReason` only looks at the last line. Multi-line JSON yields a raw blob.
- `core/marketplace-writer.js:78` — content fsync done, directory fd fsync missing (power-loss durability).
- `core/lockfile.js:6-8` — add NFS/SMB warning docstring.

### 3.5 Test reinforcement (summary)

| Area | Current (est.) | Priority test additions |
|---|---|---|
| `core/cli.js` | ~10% | 6 subprocess + temp-dir cases (scaffold/validate/publish/unknown/missing arg/version) |
| `core/lockfile.js` | ~30% | 3 contention cases (retry, ELOCKED, stale) |
| `core/marketplace-writer.js` | ~65% | atomic rollback, prototype pollution, non-array plugins, parse error |
| `core/renderer.js` | ~60% | mid-stageWrite crash, promote rollback, allowPartial, path traversal reject |
| `core/validator.js` | ~50% | stage B FAIL, stage C orphan, stage F (parse error, no owner, missing source-or-path), strict-skip flip |
| `core/ir.js` | ~45% | category/targets/mcp transport/hook missing event/agent missing fields |
| `adapters/claude-code.js` | ~55% | agents emit, unknown-event warn, http/sse MCP, no-hooks |
| `adapters/codex.js` | ~50% | sk.codex YAML, plugin_hooks=false, agent-drop warn, interface sub-fields |

### 3.6 Fixture reinforcement

- Add an unknown hook event to `sample-spec.json` (covers the warning path).
- Add MCP transports `http`, `sse`.
- Add an `agents[]` entry (covers Claude emit + Codex drop warn).
- Add a `skills[].codex` block (covers the `agents/openai.yaml` branch).
- A fixture filling in every `interface.{logo,screenshots,brandColor,capabilities}`.
- New `tests/fixtures/invalid/*.json` folder → loop all negative cases.

### 3.7 Brittle test refactor

- `tests/adapter-{claude,codex}.test.js` regex-based frontmatter asserts → YAML parse + deepEqual.
- `tests/marketplace-writer.test.js:72` `.bak should exist` → implementation-dependent; convert to behaviour (atomicity) assertion.
- `tests/ir.test.js` error message regexes (`/specVersion/`, `/minLength 20/`) → structured `{field, code}` errors.

---

## 4. Strengths (regression-protection list)

- Marketplace.json single-writer contract — `adapters/base.js:19-29` assertion + writer code both enforce.
- Hook compat table is declarative JSON — no adapter hard-coding.
- `core/cli.js:74-78` top-level try/catch hides stack traces unless `--verbose` is set.
- Validator has clean 4-state (PASS/FAIL/SKIP/strict).
- DESIGN §0 build notes honestly disclose vendor/, prompter, lockfile deviations.
- The orchestrator skill description carries trigger keywords so natural-language utterances fire it.
- `bin/plugin-builder` Node version guard + exit 78 is correct.

---

## 5. Recommended fix order (reflecting plugin-only distribution)

```
Step 1 (P0, 0.5d)  Clean up the user-facing surface
                   - bump 3 manifest versions (0.3.0): plugin.json × 2 + marketplace.json
                   - bump package.json too (CLI internal call source)
                   - convert commands/publish.md to $ARGUMENTS
                   - add allowed-tools to commands/*
                   - remove --resolve from commands/validate.md
                   - remove --allow-partial from skills/plugin-builder-scaffold SKILL.md

Step 2 (P0, 1.5d)  Five security items
                   - renderer path-traversal/symlink reject
                   - dry-run-claude HOME isolation
                   - cp -RP (both dry-run scripts)
                   - marketplace deepMerge prototype-pollution guard

Step 3 (P0, 1d)    Atomic / lockfile
                   - lockfile PID liveness + signal handler
                   - marketplace atomic ordering + .bak protection + dir fsync

Step 4 (P0, 0.5d)  Restructure SKIP/FAIL branching in dry-run shell (both scripts)

Step 5 (P0, 0.5d)  Fix validator stage A native-manifest path

—— v0.3.1 release (plugin marketplace registration candidate) ——

Step 6 (P1, 1d)    Surface separation in docs
                   - move README CLI section → docs/internal/CLI.md
                   - rewrite README top with plugin install flow (slash commands)
                   - add "internal reference" disclaimer to docs/USAGE.md
                   - mark sub-skills as "internal sub-skill" or add trigger phrases

Step 7 (P1, 1d)    Add lossy warnings (codex skillFile, claude readme fold)
Step 8 (P1, 1d)    Unify schema/IR patterns + add format:uri
Step 9 (P1, 2d)    Adopt vendor ajv or harden the embedded validator
Step 10 (P1, 1d)   Integrate hook event classification into IR validate

—— v0.4 release ——

Step 11 (P2, 3d)   Strengthen test coverage (cli, lockfile, atomic, fixtures)
Step 12 (P2, 1d)   Nit cleanup (dead code, yaml helper duplication, design.md drift)
Step 13 (P2, 2d)   Implement the unimplemented CLI flags (--resolve, --json, --allow-partial)
                   → expose only in the internal reference (USAGE.md/DESIGN). Still off the user surface.
```

---

## 6. Agent attribution

This document integrates the parallel output of 5 review agents:

1. **Core/Adapters review** — `core/*.js` + `adapters/*.js` for logic, contract violations, duplication
2. **Validator & Security review** — `core/validator.js`, marketplace-writer, lockfile, renderer, dry-run scripts
3. **Schema & IR review** — `schemas/v1/*`, `core/ir.js`, `core/spec-version.js`, fixtures
4. **Test Coverage review** — `tests/*` against production files, branch/failure-mode/fixture gaps
5. **Docs & UX review** — README, DESIGN, docs/, commands/, skills/, manifests (uncovered the version drift)

Each agent's cited file:line is reflected here. Duplicates were deduped and prioritised.
