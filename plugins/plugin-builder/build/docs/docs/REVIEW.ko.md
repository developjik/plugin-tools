# Plugin Builder — Multi-Agent Code Review (ARCHIVED, v0.3)

> 2026-05-18 · **v0.3 시점 audit (보존용)** · 5 agent 병렬 평가
>
> English version: [REVIEW.md](./REVIEW.md)
>
> **상태**: v0.4에서 H1/H2/H3 + M1~M5 + 11개 신규 테스트 + CI로 본 문서의 핵심 P0 항목들 closed. 본 문서는 history 보존 목적으로 archive. 현재 v0.7 상태는 DESIGN.md §0 빌드 노트, README 품질 게이트, `.plugin-eval/MEASUREMENT.md` 참조.
>
> 본 문서는 평가 결과와 수정 작업 목록을 우선순위(P0/P1/P2)별로 정리한다. 각 항목은 `file:line — finding — fix` 형식.
>
> ## 배포 모델 (Distribution Policy)
>
> **공개 표면 = plugin only.** 사용자는 `/plugin-builder:new|:validate|:publish` slash command 와 4 skill 로만 호출. `bin/plugin-builder` Node CLI 는 **내부 구현 디테일**로 취급하며 README/공식 사용자 문서에서 노출 X. slash command 가 내부적으로 CLI 를 spawn 하는 구조는 유지하되, 사용자에게는 "plugin 만" 보여준다.
>
> **본 review 의 영향:**
> - CLI 의 user-facing 문서 drift (README CLI 사용법, `--resolve/--json/--allow-partial` 노출) → **제거** 우선. 미구현 flag 가 user 문서에 있으면 안 됨.
> - `commands/*.md` (slash command 본문) 와 `skills/*/SKILL.md` 가 **진짜 공개 표면** → 품질 우선순위 상향.
> - `core/cli.js` 자체는 내부이지만 slash command 가 호출하므로 robustness 는 P0/P1 그대로 유지.
> - `plugin-builder version|help` 등 CLI subcommand 자체는 contributor/dev 용. `docs/internal/` 같은 내부 문서로만 노출.

---

## 0. Executive Summary

| 영역 | 평가 | 비고 |
|---|---|---|
| 아키텍처 (UnifiedSpec IR + 2 adapter) | 양호 | DESIGN.md 결정과 코드 일치, marketplace 단일 writer contract 양방향 enforce |
| 코드 품질 | 양호 | 중복(yaml helper) + dead export 일부 |
| 보안 | **주의 요** | path traversal·symlink follow·dry-run-claude `$HOME` 무격리·prototype pollution |
| 원자성/락 | **주의 요** | 락 stale 미감지, atomic write 순서가 SIGKILL 내성 부족 |
| 스키마/IR | 주의 | 임베디드 validator가 JSON Schema 기능 다수 무시; schema↔IR pattern 불일치 |
| 테스트 | 부족 | CLI ~10%, lockfile ~30%, atomic rollback 0% |
| 문서/UX | 주의 | **version drift (0.2.0 vs 0.3.0)** 4 file, 미구현 flag 다수 문서화 |

전체 33/33 test PASS은 **happy path 커버**일 뿐. 실사용·배포 전 P0 12건 해결 필수.

---

## 1. P0 — Release Blocker

### 1.1 Version drift (배포 전 즉시 수정)

README/DESIGN: `0.3.0` 선언. 그러나 다음 4 파일 `0.2.0`:

| file | line | 현재 | → | user-facing? |
|---|---|---|---|---|
| `.claude-plugin/plugin.json` | 3 | 0.2.0 | 0.3.0 | **YES — plugin 설치 시 표시** |
| `.codex-plugin/plugin.json` | 3 | 0.2.0 | 0.3.0 | **YES — plugin 설치 시 표시** |
| `.claude-plugin/marketplace.json` | 9 | 0.2.0 | 0.3.0 | **YES — marketplace 등록** |
| `package.json` | 3 | 0.2.0 | 0.3.0 | NO (내부, CLI `version` subcommand 출처) |

배포 모델상 user-facing 3 manifest 가 critical. package.json 은 내부지만 slash command 가 호출하는 CLI 의 `version` 출력원이라 함께 bump 필수.

### 1.2 Security

- **`core/renderer.js:32,49`** — `f.path` path traversal 미차단. 악의·버그 adapter가 `../../etc/x` 반환 시 plugin dir 밖에 write. **Fix:** write 직전 `path.relative(targetDir, dest).startsWith('..')` assertion + 절대경로 reject.
- **`core/renderer.js:48-53`** — `readdirSync` + `copyFileSync` 가 symlink follow. staged 트리에 `/etc/shadow` 심볼릭이 있으면 target에 복사됨. **Fix:** `fs.lstatSync` 로 symlink 거부 또는 `O_NOFOLLOW`.
- **`scripts/dry-run-claude.sh`** — `$HOME` 격리 부재 (DESIGN §5.2 위반). codex.sh 와 달리 `claude` CLI 가 실제 `$HOME` 의 settings/MCP/OAuth 토큰 접근. **Fix:** `export HOME="$TMP/home"; mkdir -p "$HOME"` 추가 (codex script 패턴 그대로).
- **`scripts/dry-run-claude.sh:13` / `dry-run-codex.sh:19`** — `cp -R` symlink follow → secrets 가 `/tmp` (world-readable) 로 복사 가능. **Fix:** `cp -RP` 또는 `rsync --safe-links`.
- **`core/marketplace-writer.js:30-40`** — `deepMerge` 가 `__proto__/constructor/prototype` 키 거부 안 함 → prototype pollution. **Fix:** key whitelist + `Object.create(null)`.

### 1.3 Atomic write / lockfile

- **`core/lockfile.js:10-33`** — stale lock 미감지. 죽은 PID 의 락이 영구 차단. signal handler 도 없어서 mid-run SIGKILL → 영구 leak. **Fix:** lockfile 안에 PID 기록 + EEXIST 시 `process.kill(pid, 0)` (ESRCH = stale → reclaim) + `process.on('exit')` 에서 release.
- **`core/marketplace-writer.js:98-111`** — atomic 순서가 DESIGN §6.1 와 어긋남:
  1. `.bak` 이 이미 있으면 무조건 덮어씀 — 이전 crashed run 의 유일한 intact copy 소실.
  2. tmp → target rename 실패 시 catch 안에서 tmp 정리 X → 매 재시도마다 orphan 누적.
  3. `fsync(dirfd)` 부재로 power loss 내성 부족.
  **Fix:** `fs.existsSync(bak)` 우선 검사 후 move-aside, catch 에 `fs.unlinkSync(tmp)`, 부모 디렉토리 fd `fsync`.

### 1.4 Dry-run SKIP 가 FAIL 마스킹

- **`scripts/dry-run-claude.sh:27`** — `set -e` + `if ... ; then ... fi` 구조상 `rc=$?` 가 unreachable. timeout(124)·crash 가 SKIP 으로 보고 → CI 가 grin pass. **Fix:** `if cmd ; then ...; else rc=$?; fi` 형태로 재구성, 124 → FAIL, exec-not-found → SKIP.
- **`scripts/dry-run-codex.sh:21-33`** — 동일 패턴. `codex plugin list --json` 실패 시 manifest 만 보고 SKIP. 진짜 FAIL 신호 소실. **Fix:** exit code 분기 (124 = FAIL timeout, 127 = SKIP, 그 외 = FAIL).

### 1.5 Validator stage A 가 native manifest 를 무조건 PASS

- **`core/validator.js:40-49`** — manifest 가 `specVersion` 없으면 schema validation 자체 skip 하고 PASS 반환. 필수 필드 누락된 plugin 도 green. **Fix:** manifest 존재 시 항상 `ir.validate` 수행, specVersion 없으면 SKIP (PASS 아님).

---

## 2. P1 — 출시 후 단기 수정

### 2.1 README 의 CLI 노출 제거 (배포 모델 정합)

**배포 모델 정정:** plugin only 정책상 README 는 plugin 설치/사용만 안내. CLI 사용법은 `docs/internal/CLI.md` 같은 contributor 문서로 분리.

- **`README.md:30-38`** ("CLI" 섹션 + `plugin-builder scaffold|validate|publish` 블록) — 사용자가 직접 CLI 호출하지 않으므로 제거 또는 contributor 섹션으로 강등. user 가 보는 install 표면은 `/plugin install plugin-builder@plugin-builder-official` 같은 plugin marketplace 흐름.
- **`README.md:56-60`** ("Slash commands when installed as plugin") — 이게 진짜 user-facing 표면. 본문 상단으로 끌어올리기.
- **`README.md:23-26`** — install 단계가 `git clone && node --test` 로 contributor 흐름. user 입장 install 흐름 (plugin marketplace add → /plugin install) 으로 교체. 기존 단계는 `docs/internal/DEVELOPMENT.md` 로 이동.
- **`docs/USAGE.md` 전체** — 현재 CLI flag 중심. 내부 reference 로 위치 명시 (`> 본 문서는 CLI 내부 reference 이며 일반 사용자는 plugin slash command 만 사용`) 또는 `docs/internal/CLI-REFERENCE.md` 로 rename.

### 2.2 미구현 CLI flag — 내부 backlog 이동

다음 flag 가 docs 에 있지만 `core/cli.js` 미구현. 배포 모델상 user 가 직접 호출 안 함 → user 문서에서 제거하고 v0.4 내부 backlog 만 남김:

| flag | 문서 위치 | 처리 |
|---|---|---|
| `--resolve <stage> <option-id>` | `docs/USAGE.md:249`, `commands/validate.md:8`, DESIGN §5.3 | **commands/validate.md 에서는 제거** (user-facing). DESIGN §5.3·USAGE 는 v0.4 backlog 표시 후 유지 |
| `--json` | DESIGN §10.3, USAGE §10.3 | 내부 reference 만 유지, v0.4 backlog |
| `--allow-partial` | DESIGN §10.4, `skills/plugin-builder-scaffold/SKILL.md:25` | **skill 본문에서 제거** (user-facing). DESIGN 은 backlog 표시 |

**핵심:** `commands/*.md` 와 `skills/*/SKILL.md` 본문에 미구현 CLI flag 언급 0건이 되어야 함. 내부 문서 (DESIGN, USAGE) 는 v0.4 backlog 로 명시.

### 2.3 lossy 매핑 warning 누락

DESIGN §10.6 가 "drop+warn" 으로 명시했으나 adapter 가 silent drop:

- **`adapters/codex.js:96-113`** (`#skillFile`) — `disable-model-invocation`, `user-invocable`, `model`, `effort`, `paths` silent drop. **Fix:** key 별 warning push.
- **`adapters/codex.js:23-25`** — commands fold 시 `frontmatter.{model,allowed-tools}`, `argsHint` 손실 itemize 안 함. **Fix:** per-command warning.
- **`adapters/claude-code.js:159-188`** — `displayName/composerIcon/defaultPrompt/interface.*` README 로 fold 하면서 warning 0건. **Fix:** 최소 1건 warning + README "Cross-target conversion notes" 자동 섹션.

### 2.4 Schema ↔ IR pattern 불일치

- **`schemas/v1/unified-spec.schema.json:55`** (`SkillSpec.name`) — `^[a-z][a-z0-9-]*$` (trailing dash 허용)
- **`core/ir.js:103`** — `PATTERNS.name` (`^[a-z][a-z0-9-]*[a-z0-9]$`) 적용

`my-skill-` 이 schema 통과 / IR FAIL. P6 dogfood 시 round-trip 깨짐. **Fix:** 둘 다 stricter 패턴 (`...[a-z0-9]$`) 으로 통일.

### 2.5 Schema 에 `format: "uri"` 누락

- `schemas/v1/unified-spec.schema.json:20-21` — `homepage`, `repository` URI 검증 X
- `schemas/v1/unified-spec.schema.json:95` — `McpSpec.url` 검증 X

DESIGN §3.1 와 schema 본문 drift. **Fix:** `"format": "uri"` 추가 + 임베디드 validator 에 format 핸들러 추가 (또는 ajv 도입).

### 2.6 임베디드 validator 가 JSON Schema 다수 무시

| 기능 | 현 처리 | 영향 |
|---|---|---|
| `additionalProperties` | 무시 | `descriptoin` 같은 오타가 silent pass |
| `$ref` / `$defs` | 수동 함수로 분기 (drift 위험) | schema 변경 시 IR 자동 반영 안 됨 |
| `format` (uri/email) | 무시 | 임의 문자열 pass |
| `oneOf` / `anyOf` / `dependentRequired` | 무시 | `stdio` MCP 가 `command` 없이 pass |
| nested `items.type` | 무시 | `defaultPrompt[]`, `paths[]` 등 non-string pass |

**Fix 옵션 A**: 임베디드 validator 보강 (4–6h).
**Fix 옵션 B**: DESIGN §10.2 의 `vendor/ajv` 번들 실행 (1–2h, recommended).

### 2.7 IR `validate` 가 hook event 검증 안 함

- **`core/ir.js`** — `HookSpec.event` 를 `hook-event-compat.json` 으로 분류·warn 하지 않음. adapter render 시점에야 분류. DESIGN §3.1:264 와 어긋남.
- **`schemas/v1/hook-event-compat.json`** — meta-schema 없음. 누군가 `common` 키를 지우면 양 adapter 가 silent break.

**Fix:** IR validate 안에서 `event` 분류 + `common/claudeOnly/codexOnly` 키 존재 assertion.

### 2.8 marketplace writer normalize

- **`core/marketplace-writer.js:54-57`** — `spec.author` 가 string 형태로도 들어옴 (claude-code adapter passthrough). owner shape 깨진 채 기록. stage F validator 도 truthy 만 검사하여 못 잡음. **Fix:** `typeof spec.author === 'string' ? {name: spec.author} : (spec.author || {name:'unknown'})`.

### 2.9 (승격) Slash command 본문 결함 — 진짜 user 표면

> 배포 모델상 `commands/*.md` 는 user 가 매번 호출하는 인터페이스. 결함은 즉시 노출. P1 상단 처리.

- **`commands/publish.md:6`** — `$1 $2 $3 $4` 사용. `/plugin-builder:publish ./out --git-remote owner/repo` 입력 시 `--git-remote` 는 `$2` 한 토큰만 들어가서 값 (`owner/repo`) 손실. **Fix:** `$ARGUMENTS` 로 변경.
- **`commands/{new,validate,publish}.md`** — frontmatter 에 `allowed-tools` 부재. 실제로는 Bash/Read 호출. **Fix:** 각 command 에 `allowed-tools: ["Bash", "Read"]` 추가.
- **`commands/validate.md:8`** — `--resolve` 언급 제거 (§2.2 참조). 미구현 flag 가 user 표면에 노출되면 안 됨.
- **`skills/plugin-builder-scaffold/SKILL.md:25`** — `--allow-partial` 언급 제거 (§2.2 참조).
- **`skills/plugin-builder-{scaffold,validate,marketplace}/SKILL.md`** — description 이 내부 jargon-heavy ("scaffold 단계", "marketplace 패치"). 사용자 자연어 발화로는 fire 안 됨. 의도가 orchestrator 만 호출하는 sub-skill 이면 description 첫 줄에 명시 (`> Internal sub-skill, invoked only by [[plugin-builder]] orchestrator`). 아니면 trigger phrase 추가.

---

## 3. P2 — 코드 위생 / nits

### 3.1 코드 중복 / dead code

- `adapters/{claude-code,codex}.js` 의 `yamlFrontmatter`, `yamlScalar` 함수 byte-identical. → `adapters/base.js` 로 이동.
- `core/renderer.js:9-21` — `render()`, `loadTemplate()` export 되지만 호출 없음. 제거 또는 wiring.
- `core/ir.js:7` — `SCHEMA.required` 만 사용, 나머지 export dead. 제거 가능.
- `adapters/claude-code.js:3` / `codex.js:3,5` — 미사용 `path` / `log` import 제거.
- `core/cli.js:31` — `parseArgs` 가 `--out --next` 같은 case 에서 `--out=true` 로 잘못 파싱. value 가 `--` 로 시작하면 reject.

### 3.2 에러 메시지 품질

- `core/cli.js:86,133,159` — `JSON.parse(readFileSync(...))` 직접. 잘못된 JSON 시 raw `Unexpected token` 만 출력. **Fix:** `try/catch` 로 file path 포함.
- `core/spec-version.js:13` — error message 가 supported 버전 목록 미포함. `SUPPORTED.join(',')` 사용.

### 3.3 DESIGN.md 자체 drift

- `DESIGN.md:1, §0` v0.3 / `§7 P0 row` 와 `§10 heading` "v0.2 신설" → cosmetic.
- `DESIGN.md §2` 가 `templates/*.ejs`, `vendor/` 언급. 실제는 `.tpl` + vendor 없음. §0 build note 일부 deviation 만 적힘. **Fix:** §2 트리 갱신.

### 3.4 임베디드 hardening nits

- `core/validator.js:100,110` — `spawnSync timeout` 가 grandchild 안 죽임. `killSignal:'SIGKILL'` + `detached`.
- `core/validator.js:143-153` — `parseReason` 가 마지막 line 만 봄. multi-line JSON 시 raw blob 반환.
- `core/marketplace-writer.js:78` — content fsync 후 directory fd fsync 누락 (power loss durability).
- `core/lockfile.js:6-8` — NFS/SMB 경고 docstring 추가.

### 3.5 테스트 보강 (요약)

| 영역 | 현재 추정 | 우선 추가 테스트 |
|---|---|---|
| `core/cli.js` | ~10% | subprocess + temp dir 6건 (scaffold/validate/publish/unknown/missing arg/version) |
| `core/lockfile.js` | ~30% | contention 3건 (retry, ELOCKED, stale) |
| `core/marketplace-writer.js` | ~65% | atomic rollback, prototype pollution, non-array plugins, parse error |
| `core/renderer.js` | ~60% | stageWrite 중간 crash, promote rollback, allowPartial, path traversal reject |
| `core/validator.js` | ~50% | stage B FAIL, stage C orphan, stage F (parse error, no owner, source-or-path missing), strict-skip flip |
| `core/ir.js` | ~45% | category/targets/mcp transport/hook missing event/agent missing fields |
| `adapters/claude-code.js` | ~55% | agents emit, unknown-event warn, http/sse MCP, no-hooks |
| `adapters/codex.js` | ~50% | sk.codex YAML, plugin_hooks=false, agent-drop warn, interface sub-fields |

### 3.6 Fixture 보강

- `sample-spec.json` 에 unknown hook event 추가 (warning path 커버).
- MCP transport `http`, `sse` 추가.
- `agents[]` 1건 추가 (claude emit + codex drop warn 양쪽 커버).
- `skills[].codex` 블록 1건 (`agents/openai.yaml` 분기 커버).
- `interface.{logo,screenshots,brandColor,capabilities}` 모두 채운 fixture.
- `tests/fixtures/invalid/*.json` 폴더 신설 → 음성 케이스 일괄 loop.

### 3.7 Brittle test refactor

- `tests/adapter-{claude,codex}.test.js` 의 regex 기반 frontmatter assertion → YAML parse 후 deepEqual.
- `tests/marketplace-writer.test.js:72` `.bak should exist` → 구현 의존; behavior(atomicity) 검증으로 변경.
- `tests/ir.test.js` error message regex (`/specVersion/`, `/minLength 20/`) → structured error `{field, code}`.

---

## 4. 강점 (regression 방지 목록)

- Marketplace.json 단일 writer contract — `adapters/base.js:19-29` assertion + writer 코드 양방향.
- Hook compat table 이 JSON 으로 declarative — adapter hard-code 없음.
- `core/cli.js:74-78` 최상위 try/catch 가 `--verbose` 없으면 stack trace 숨김.
- Validator 4-state (PASS/FAIL/SKIP/strict) 분명.
- DESIGN §0 build notes 가 vendor/, prompter, lockfile deviation 정직 공시.
- Skill 오케스트레이터 description 이 trigger 키워드 포함하여 자연어 발화 fire.
- `bin/plugin-builder` Node 버전 가드 + exit 78 정확.

---

## 5. 권장 수정 순서 (plugin-only 배포 모델 반영)

```
Step 1 (P0, 0.5d)  User-facing 표면 정리
                   - 3 manifest version bump (0.3.0): plugin.json × 2 + marketplace.json
                   - package.json 도 함께 bump (CLI 내부 호출원)
                   - commands/publish.md $ARGUMENTS 화
                   - commands/* allowed-tools 추가
                   - commands/validate.md 의 --resolve 제거
                   - skills/plugin-builder-scaffold SKILL.md 의 --allow-partial 제거

Step 2 (P0, 1.5d)  Security 5건
                   - renderer path-traversal/symlink reject
                   - dry-run-claude HOME 격리
                   - cp -RP (양 dry-run script)
                   - marketplace deepMerge prototype pollution 가드

Step 3 (P0, 1d)    Atomic / lockfile
                   - lockfile PID liveness + signal handler
                   - marketplace atomic 순서 + .bak 보호 + dir fsync

Step 4 (P0, 0.5d)  dry-run shell 의 SKIP/FAIL 분기 재구성 (양 script)

Step 5 (P0, 0.5d)  validator stage A native-manifest 경로 수정

—— v0.3.1 release (plugin marketplace 등록 후보) ——

Step 6 (P1, 1d)    문서 표면 분리
                   - README 의 CLI 섹션 → docs/internal/CLI.md 로 이동
                   - README 상단을 plugin install 흐름 (slash command 안내) 으로 재작성
                   - docs/USAGE.md 상단에 "내부 reference" disclaimer 추가
                   - skills/*/SKILL.md sub-skill 들에 "internal sub-skill" 명시 또는 trigger phrase 추가

Step 7 (P1, 1d)    Lossy warning 추가 (codex skillFile, claude readme fold)
Step 8 (P1, 1d)    Schema/IR pattern 통일 + format:uri 추가
Step 9 (P1, 2d)    Vendor ajv 도입 또는 임베디드 validator 보강
Step 10 (P1, 1d)   IR validate 단계에 hook event 분류 통합

—— v0.4 release ——

Step 11 (P2, 3d)   테스트 커버리지 보강 (cli, lockfile, atomic, fixtures)
Step 12 (P2, 1d)   nits 정리 (dead code, yaml helper 중복, design.md drift)
Step 13 (P2, 2d)   미구현 CLI flag (--resolve, --json, --allow-partial) 구현
                   → 내부 reference 인 USAGE.md/DESIGN 에만 노출. user 표면엔 여전히 미노출.
```

---

## 6. Agent 5건 산출물 출처

본 문서는 다음 5개 review agent 의 평행 산출물을 통합:

1. **Core/Adapters review** — `core/*.js` + `adapters/*.js` 로직·계약 위반·중복
2. **Validator & Security review** — `core/validator.js`, marketplace-writer, lockfile, renderer, dry-run scripts
3. **Schema & IR review** — `schemas/v1/*`, `core/ir.js`, `core/spec-version.js`, fixtures
4. **Test Coverage review** — `tests/*` vs production 파일, 브랜치/실패 모드/fixture 갭
5. **Docs & UX review** — README, DESIGN, docs/, commands/, skills/, manifests (version drift 발견)

각 agent 가 인용한 file:line 모두 본 문서에 반영. 중복은 dedupe 후 우선순위 부여.
