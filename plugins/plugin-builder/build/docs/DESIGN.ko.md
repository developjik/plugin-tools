# Plugin Builder — 설계 문서 (v0.7 — root-flat marketplace, 2026-05-19)

> English version: [DESIGN.md](./DESIGN.md)
>
> **v0.7 변경 요약** (breaking):
> - plugin tree 경로 `<root>/plugins/<name>/` → `<root>/<name>/` 로 평탄화. 더 이상 `plugins/` 중간 디렉토리 없음.
> - `marketplace.json` 의 `metadata.pluginRoot` 필드 제거. `plugins[].path` 및 `plugins[].source.path` 는 `./<name>` 으로 emit.
> - **single mode 만 지원**: `SCAFFOLD_MODES` / `pickScaffoldMode` / `renderHybrid` 외 split/split-out/merged 모드 제거. `--merge` / `--allow-overlap` / `--split-out` / `--marketplace-root` / `--marketplace` / `--local-path` 플래그 제거.
> - `scaffold --spec X.json --out <root>` 는 항상 hybrid plugin tree 를 `<root>/<spec.name>/` 으로 emit 하고, `--no-publish` 가 없으면 두 카탈로그 자동 패치.
> - `publish <plugin-dir>` 는 parent 디렉토리가 marketplace root 여야 하며, 두 카탈로그를 항상 동시 패치한다. v0.5 in-plugin marketplace.json 단일 경로는 제거.
> - `marketplace init <root>` 는 더 이상 `<root>/plugins/.gitkeep` 을 만들지 않는다.
> - stale 감지 경로 `<root>/<name>/.claude-plugin/marketplace.json` 으로 재조정.
> - 현재 품질 게이트: 132/132 tests PASS, Plugin Eval 100/100 Grade A, Fix First 항목 없음.
>
> 아래 v0.6 요약은 역사적 컨텍스트로 보존:
>
> **v0.6 변경 요약** (`docs/internal/PLAN-v0.6.md` 기반, 3-round 에이전트 리뷰 반영):
> - 과거 v0.6 스냅샷: 144/144 tests PASS.
> - **멀티 플러그인 marketplace root**: `<root>/plugins/<name>/` 아래 N개 plugin 호스팅. Claude (`<root>/.claude-plugin/marketplace.json`) 와 Codex (`<root>/.agents/plugins/marketplace.json`) 카탈로그를 sequential single-lock transaction 으로 동기화. Codex write 실패 시 Claude 는 pre-transaction 컨텐츠로 롤백.
> - **하이브리드 plugin tree**: 단일 plugin 디렉토리에 `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json` 두 매니페스트, 공유 `skills/`, 공유 `.mcp.json`, target 별 `hooks/{claude,codex}.json` (매니페스트 `hooks` 필드를 target 파일로 재작성 — 양 ecosystem 모두 documented override).
> - **카테고리 hint-only**: 알려진 kebab-case → PascalCase 매핑은 hint, unknown 은 verbatim/PascalCase passthrough. `spec.claude.category` / `spec.codex.category` 로 target 별 override 가능. unknown category 로 validation fail 하지 않음.
> - **Codex policy passthrough**: `spec.codex.policy.installation` / `.authentication` 가 verbatim 으로 흐름. 미지정 시 `AVAILABLE` / `ON_INSTALL` 기본값. 미래 enum 값 대응에 release 불필요.
> - **신규 CLI**: `marketplace init <root>` subcommand, `--marketplace-root <dir>` flag (scaffold / publish 양쪽).
> - **신규 JSON Schema**: `schemas/v1/marketplace-{claude,codex}.schema.json`.
> - **v0.5 stale 감지 (P8)**: `<root>/plugins/<n>/.claude-plugin/marketplace.json` 발견 시 scaffold/publish 가 warning 반환.
>
> 본 한글 문서는 v0.4 시점 스냅샷이다. 최신 v0.5 변경 사항 (frontmatter privilege preservation, dry-run node port, split-default, FLAGS/SCAFFOLD_MODES SSoT, URI allowlist, YAML hardening) 은 [DESIGN.md](./DESIGN.md) 영어판에 반영되어 있다.

> **v0.4 빌드 노트** (보안·robustness 강화):
> - 44/44 tests PASS (Node 20.x / 22.x). 신규 테스트: `dedup`, `lockfile`, `promote`, `dry-run-isolation`.
> - **H1 path traversal 차단**: `validator.stageA` native manifest 모드에서도 name pattern 강제, `scripts/dry-run-{claude,codex}.sh`가 NAME을 kebab-case 정규식으로 sanitize.
> - **H2 promote atomic**: `renderer.promote`가 per-file `.pb-bak.<pid>.<rand>` 백업 + 실패 reverse-order rollback, 성공 시 백업 청소.
> - **H3 cross-target overlap hard error**: `cli.dedupFiles`가 content diff시 `EOVERLAP` throw. opt-in `--allow-overlap`로 Codex-wins 수용.
> - **M1 validator stage gate**: stage D/E가 `spec.targets` 또는 manifest 폴더 존재로 가드. 단일 target spec에서 false FAIL 방지.
> - **M2 mcp transport 필수화**, **M5 agent name kebab-case 검증**, friendly error messages (raw regex 미노출).
> - **lockfile 강건화**: SIGINT/SIGTERM/SIGHUP 핸들러 + signal re-raise, 엄격 `^\d+$` PID, reclaim TOCTOU 완화, malformed PID 보존(silent unlink 금지), non-ownership release no-op.
> - **marketplace no-op 감지**: 동일 내용 publish 재실행 시 `action: "noop"` 반환, write skip.
> - **CI**: `.github/workflows/test.yml` (Node 20/22 매트릭스).
>
> **v0.3 빌드 노트** (이전):
> - P1~P5.5 구현 완료. End-to-end smoke 통과: scaffold sample-spec → 8 files emitted (양 target) + warnings 정확.
> - validate: stage a/b/c PASS, d/e SKIP (CLI 환경 제약), f PASS/SKIP 케이스별. publish: append/update idempotent + atomic + .bak.
>
> **빌드 시점 deviation**:
> - `vendor/` 폴더 미생성. ajv 번들 대신 **embedded 단순 validator** (`core/ir.js`의 hand-rolled type/pattern/enum 검증). 의존성 0 유지.
> - `proper-lockfile` npm 의존 대신 **자체 `core/lockfile.js`** (`fs.openSync` exclusive flag 기반 락).
> - 대화형 Q1–Q8 흐름은 **skill body 측 AskUserQuestion** 으로 수행 (전용 `core/prompter.js` 없음). slash command가 spec 파일을 만들어 `scaffold --spec` 호출. `commands/new.md`와 `skills/plugin-builder/SKILL.md`에 Q1~Q8 인라인 정의.
> - Cross-target 동시 emit 시 동일 경로 파일 (SKILL.md, hooks.json, README.md, .mcp.json)은 v0.4부터 **EOVERLAP hard error**. opt-in `--allow-overlap` 또는 target별 `--out` 분리 권장.

> Claude Code와 OpenAI Codex 양쪽 플러그인 생성을 도와주는 메타 플러그인.
>
> **v0.2 변경 요약** (2026-05-18, 4-agent audit 반영):
> - UnifiedSpec `specVersion` 필수화, `$id` 버전 segment 추가 (forward-compat)
> - SkillSpec 키를 Claude 실제 frontmatter(`disable-model-invocation` 등)로 정렬 + 누락 필드 추가
> - Codex `interface` 메타데이터 위치 정정 (`.codex-plugin/plugin.json::interface`; `agents/openai.yaml` 아님)
> - Hooks 호환성 매트릭스 확장 + `[features].plugin_hooks` opt-in 명시
> - Dry-run 스크립트 격리 강화 (`CODEX_HOME` override, `jq -er`, `timeout`, 구조화 출력)
> - Marketplace patch atomic 순서 수정 + file lock + merge 의미 정의
> - Marketplace.json 소유권 단일화: `core/marketplace-writer.js`만
> - 운영 concerns (engines.node, ajv vendor, SKIP semantics) §10에 신설

---

## 0. 결정 사항 (Decisions)

| 항목 | 결정 |
|---|---|
| Shell 형태 | **Plugin + Skill 하이브리드** (`skill-creator` 선례 따름) |
| 구현 언어 | **Bash + Node.js** (런타임 의존 최소화) |
| MVP 스코프 | Claude Code + Codex 양쪽 target, Validation 6단계 전부, Marketplace auto-patch 포함 |
| 배포 | 자체 marketplace 등록 + GitHub 공개 |
| 라이선스 | MIT (잠정) |

### 핵심 trade-off (요약)

1. **Plugin+Skill 하이브리드** — `plugin.json`과 `SKILL.md` 이중 유지 비용 vs marketplace 배포 + 자연어 트리거 둘 다 얻음.
2. **UnifiedSpec IR** — 사용자 1회 입력으로 양쪽 emit. 단, Codex 미지원 필드(hooks 일부)는 lossy 매핑이며 validator가 경고.
3. **Dry-run 격리 환경** — 사용자 환경 오염 방지 위해 `$TMPDIR/plugin-builder-dryrun-<rand>/` 사용, cleanup 보장.
4. **Codex commands fold** — Codex엔 **user-defined** slash command 없음 (built-in `/skills`, `$skill-*`는 있음). Claude의 `commands/*.md`를 SKILL.md "Commands" 섹션으로 fold (drop ❌).
5. **Marketplace auto-patch** — Claude 측은 idempotent 자동 patch, Codex 측은 marketplace 표준이 약해 README install snippet만 자동 생성.

---

## 1. 호환성 매트릭스 (조사 결과)

| 항목 | Claude Code | Codex | 처리 |
|---|---|---|---|
| Manifest 위치 | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` | 두 파일 동시 생성 |
| Manifest 포맷 | JSON | JSON | 동일 |
| Marketplace | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` (또는 `~/.agents/...`; Claude 경로 legacy fallback 지원) | **단일 `.claude-plugin/marketplace.json`으로 양쪽 커버** (legacy fallback 활용) |
| Skills 위치 | `skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` (선택적 per-skill `skills/<name>/agents/openai.yaml`) | 동일. Codex per-skill YAML은 optional invocation policy만 (`allow_implicit_invocation` 등) |
| Commands | `commands/<name>.md` | 없음 (user-defined) | Codex는 SKILL.md "Commands" 섹션으로 fold |
| Hooks 위치 | `hooks/hooks.json` | `hooks/hooks.json`, **opt-in via `[features].plugin_hooks = true`** | 동일 위치, **이벤트명 일부 차이** |
| Hooks 이벤트 (CC 전용) | `Notification`, `SubagentStop`, `PreCompact`, `SessionEnd` | — | target=codex에서 drop+warning |
| Hooks 이벤트 (Codex 전용) | — | `PermissionRequest` | target=claude에서 drop+warning |
| Hooks 공통 | `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `UserPromptSubmit` | 동일 | 그대로 |
| MCP | `.mcp.json` (또는 plugin.json inline) | `.mcp.json` | 동일 (`openai.yaml::dependencies`는 미사용 — 추측이었음) |
| Env vars | `CLAUDE_PLUGIN_ROOT` (`CLAUDE_PLUGIN_DATA`는 docs 미확인 — 사용 시 fallback path 명시) | 동일 alias 주입됨 | 훅 스크립트 1벌로 OK |
| Interface metadata | (없음 — README 헤더로 fold) | **`.codex-plugin/plugin.json::interface`** (NOT `agents/openai.yaml`) — `displayName`, `composerIcon`, `defaultPrompt`, `logo`, `screenshots`, `brandColor`, `category`, `capabilities` | Codex 전용 필드 |

> **Hooks 이벤트 v0.2 노트**: `UserPromptSubmit`은 Claude/Codex 양쪽 존재 (이전 v0.1은 Codex-only로 오분류). 추가 Claude-only 이벤트 후보(`SubagentStart`, `PreCompact`, `SessionEnd` 등)는 Claude Code docs에서 실측 확인된 것만 등재. 미확인 이벤트는 UnifiedSpec `HookSpec.event` enum에서 **string-with-warn** 모드로 허용 (validator가 unknown event는 warning만 발생, 차단하지 않음).

→ **divergence는 얕다.** UnifiedSpec → 두 adapter로 충분.

---

## 2. 폴더 구조 (Plugin Builder 자체)

```
plugin-builder/
├── .claude-plugin/
│   └── plugin.json
├── .codex-plugin/
│   └── plugin.json                              # 자기 자신도 두 target 지원
├── README.md
├── LICENSE
├── package.json                                 # ajv, ejs 정도만
├── commands/
│   ├── new.md                                   # /plugin-builder:new
│   ├── validate.md                              # /plugin-builder:validate <path>
│   └── publish.md                               # /plugin-builder:publish <path>
├── skills/
│   ├── plugin-builder/
│   │   └── SKILL.md                             # 메인 오케스트레이터 (자연어 트리거)
│   ├── plugin-builder-scaffold/
│   │   └── SKILL.md                             # 파일 생성 단계
│   ├── plugin-builder-validate/
│   │   └── SKILL.md                             # 검증 단계
│   └── plugin-builder-marketplace/
│       └── SKILL.md                             # marketplace 패치
├── adapters/
│   ├── base.js                                  # PluginAdapter 인터페이스
│   ├── claude-code.js
│   ├── codex.js
│   └── registry.js                              # { 'claude-code': ..., 'codex': ... }
├── schemas/v1/
│   ├── unified-spec.schema.json                 # IR 검증 (v0.3 기준 embedded validator 사용)
│   └── hook-event-compat.json                   # 선언적 hook 호환 매트릭스
├── core/
│   ├── cli.js                                   # bin/plugin-builder 실제 진입점
│   ├── ir.js                                    # UnifiedSpec 빌더 (embedded validator)
│   ├── spec-version.js                          # specVersion 마이그레이션
│   ├── renderer.js                              # staged write + atomic promote (.pb-bak rollback)
│   ├── validator.js                             # 6단계 검증
│   ├── marketplace-writer.js                    # idempotent patch + no-op 감지 (단일 소유자)
│   ├── lockfile.js                              # 자체 fs.openSync('wx') 락 + SIGINT/SIGTERM
│   └── log.js                                   # 레벨 (debug/info/warn/error)
├── scripts/
│   ├── dry-run-claude.sh                        # Claude dry-run + HOME 격리 + NAME sanitize
│   └── dry-run-codex.sh                         # Codex dry-run + CODEX_HOME 격리 + NAME sanitize
├── bin/
│   └── plugin-builder                           # CLI entrypoint (engines.node check)
├── .github/workflows/
│   └── test.yml                                 # Node 20/22 매트릭스
└── tests/
    ├── fixtures/
    │   ├── sample-spec.json
    │   └── self-host-spec.json
    ├── ir.test.js
    ├── validator.test.js
    ├── marketplace-writer.test.js
    ├── adapter-claude.test.js
    ├── adapter-codex.test.js
    ├── cli.test.js
    ├── self-host.test.js
    ├── dedup.test.js                            # v0.4: EOVERLAP + --allow-overlap
    ├── lockfile.test.js                         # v0.4: stale PID / malformed / non-ownership
    ├── promote.test.js                          # v0.4: .pb-bak rollback
    └── dry-run-isolation.test.js                # v0.4: NAME path-traversal reject
```

> v0.3 deviation: `templates/`, `vendor/`, `core/prompter.js` 등 설계 초기 항목은 미사용. 대화형 Q1~Q8은 skill body의 `AskUserQuestion`이 담당.

### 핵심 컴포넌트 다이어그램

```
[User] /plugin-builder:new  또는  "plugin 만들어줘"
   │
   ▼
skills/plugin-builder/SKILL.md   ← 오케스트레이터
   │
   ▼
skill body (AskUserQuestion)   ← 대화형 Q1~Q8 수집 → UnifiedSpec JSON 작성
   │
   ▼
core/ir.js → UnifiedSpec (JSON, schemas/v1/unified-spec.schema.json 검증)
   │
   ├─────────┬─────────┐
   ▼         ▼         ▼
ClaudeCode  Codex   (Future: Cursor/Continue)
Adapter     Adapter
   │         │
   └────┬────┘
        ▼
core/renderer.js  → adapter가 emit한 files[] → stage→promote (atomic, .pb-bak rollback)
        │
        ▼
core/validator.js → 6단계 검증 (스키마/구조/cross-ref/dry-run-cc/dry-run-codex/marketplace)
        │
        ▼
core/marketplace-writer.js → marketplace.json idempotent patch
        │
        ▼
Report (console + 파일)
```

---

## 3. UnifiedSpec IR (단일 진실 소스)

### 3.1 JSON Schema (요약)

> **버전 정책**: `specVersion` 필수, instance에 명시. `$id`에 `/v1/` segment 포함 — v2 도입 시 별도 schema 파일 (`unified-spec.v2.schema.json`) + `core/spec-version.js` 마이그레이션 헬퍼.

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
        "frontmatter": { "type": "object", "description": "Claude 명령 frontmatter passthrough (model, allowed-tools 등). lossy하게 Codex SKILL.md Commands 섹션으로 fold됨" }
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
        "disable-model-invocation": { "type": "boolean", "description": "Claude-only. Codex target에서 drop+warn" },
        "user-invocable":           { "type": "boolean", "description": "Claude-only" },
        "model":                    { "type": "string", "description": "Claude-only frontmatter" },
        "effort":                   { "type": "string", "description": "Claude-only frontmatter" },
        "argument-hint":            { "type": "string" },
        "paths":                    { "type": "array", "items": { "type": "string" }, "description": "Claude-only" },
        "codex":                    { "type": "object", "description": "per-skill optional Codex policy (e.g. allow_implicit_invocation) — agents/openai.yaml로 emit" }
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
        "event":   { "type": "string", "description": "validator가 HookEventCompat 테이블로 known/unknown 판정. unknown은 warn." },
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
      "description": ".codex-plugin/plugin.json::interface로 emit. Claude target에서는 README fold.",
      "properties": {
        "logo":         { "type": "string" },
        "screenshots":  { "type": "array", "items": { "type": "string" } },
        "brandColor":   { "type": "string" },
        "capabilities": { "type": "array", "items": { "type": "string" } }
      }
    },
    "HookEventCompat": {
      "description": "Validator가 참조하는 declarative 호환성 테이블. adapter 하드코딩 금지.",
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

### 3.2 매핑 규칙 (UnifiedSpec → Target)

| UnifiedSpec | Claude Code 출력 | Codex 출력 |
|---|---|---|
| `specVersion` | (emit X — 메타) | (emit X — 메타) |
| `name, version, description` | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| `author, license, homepage, repository` | 동일 | 동일 |
| `commands[]` | `commands/<name>.md` (frontmatter passthrough) | **fold → SKILL.md "Commands" 섹션** + 변환 로그 (frontmatter는 description으로 강등) |
| `skills[]` | `skills/<name>/SKILL.md` (frontmatter: name/description/allowed-tools/disable-model-invocation/user-invocable/model/effort/argument-hint/paths) | `skills/<name>/SKILL.md` (필수 필드만) + `codex` 블록 있을 때 한해 `skills/<name>/agents/openai.yaml` 생성 |
| `skills[].disable-model-invocation` | frontmatter | **drop + warning** (Codex 미지원) |
| `agents[]` | `agents/<name>.md` (subagent) | (Codex 동등 개념 정리 전까지 drop + warning) |
| `hooks[]` (common) | `hooks/hooks.json` + `scripts/` | 동일 + `.codex-plugin/plugin.json::features.plugin_hooks = true` 활성 |
| `hooks[]` (claudeOnly) | `hooks/hooks.json` | **drop + warning** |
| `hooks[]` (codexOnly) | **drop + warning** | `hooks/hooks.json` |
| `hooks[]` (unknown event) | warning만, emit | warning만, emit |
| `mcpServers[]` | `.mcp.json` | `.mcp.json` |
| `displayName, composerIcon, defaultPrompt, interface.*` | README.md 헤더로 fold (lossy — 양방향 round-trip 불가, 문서화됨) | `.codex-plugin/plugin.json::interface` 블록으로 emit |

---

## 4. UX 흐름

### 4.1 시퀀스

```
[User]                       [plugin-builder]                [Validators]
  │ /plugin-builder:new           │                              │
  ├──────────────────────────────►│                              │
  │                               │ Q1 target multi-select        │
  │◄──────────────────────────────┤                              │
  │ "both"                        │                              │
  ├──────────────────────────────►│                              │
  │                               │ Q2~Q6 메타데이터 batch         │
  │◄═══════════════════════════════╝                              │
  │                               │ Q7 컴포넌트 multi-select       │
  │                               │ 각 컴포넌트 sub-flow            │
  │◄═══════════════════════════════╝                              │
  │                               │ 자동 추론 (디렉토리/README)     │
  │                               │ adapter render                 │
  │                               │ validation 6단계               │
  │                               ├─────────────────────────────►│
  │                               │◄─────────────────────────────┤
  │                               │ Report + next steps           │
  │◄──────────────────────────────┤                              │
```

### 4.2 질문 리스트 (최대 8개, 컴포넌트별 sub-flow 별도)

| # | Prompt | 기본값 | 비고 |
|---|---|---|---|
| Q1 | "타겟 플랫폼은?" (Claude Code / Codex / Both) | Both | multi-select |
| Q2 | "플러그인 이름?" (kebab-case) | cwd 디렉토리명 | 필수 |
| Q3 | "한 줄 설명? (≤120자)" | — | 필수 |
| Q4 | "Author?" (name / email) | `git config user.*` 자동 | enter로 채택 |
| Q5 | "License?" | MIT | |
| Q6 | "초기 버전?" | 0.1.0 | |
| Q7 | "포함할 컴포넌트는?" (commands / skills / hooks / agents / mcp) | commands+skills | multi-select |
| Q8 | "Marketplace 등록?" (이번 / 나중) | 이번 | |

### 4.3 컴포넌트별 Sub-flow

**Command**:
- `name?` (`/<plugin>:<name>`)
- `description?`
- `arguments 받나?` Y/N → schema
- `호출 도구?` (Read/Bash/...) — 기본 auto

**Skill**:
- `name?`
- `description (= 트리거 키워드 포함, 20자↑)` — **핵심**
- `allowed-tools?` (선택)
- `disable-model-invocation?` (수동 호출만 허용?)
- `참조 docs 경로?` (선택)

**Hook**:
- `event?` (target 호환성 자동 표시)
- `matcher?` (regex, 선택)
- `script 언어?` (bash/node)
- `script 본문?` (또는 placeholder 채택)

**MCP Server**:
- `name?`
- `transport?` (stdio/http/sse)
- `command 또는 url?`

---

## 5. Validation 6단계

### 5.1 단계 정의

| 단계 | 이름 | 도구 | 통과 기준 | SKIP 조건 |
|---|---|---|---|---|
| (a) | Manifest schema | ajv (vendored) + `schemas/*.schema.json` | required 100%, type 일치, 0 error | — |
| (b) | 파일 구조 | fs check | 선언 컴포넌트 == 디렉토리 존재 | — |
| (c) | Cross-reference | fs scan + manifest parse | 양방향 누락 0 (manifest entry ↔ 실제 파일) | — |
| (d) | Claude dry-run | `scripts/dry-run-claude.sh` (timeout 30s) | exit 0, JSON 출력에 plugin name 존재 | `command -v claude` 실패 OR `claude --version` 실패 → SKIP |
| (e) | Codex dry-run | `scripts/dry-run-codex.sh` (timeout 30s, `CODEX_HOME` 격리) | exit 0 | `command -v codex` 실패 OR Codex CLI JSON 리스트 미지원 → SKIP |
| (f) | Marketplace | ajv + 중복 검사 | id unique, source 유효 | — |

> **SKIP 의미**: 외부 CLI 미설치 시 `FAIL` 대신 `SKIP`. 최종 리포트에 SKIP 단계 명시 + exit code 0 (CI에서 `--strict` 플래그로 SKIP→FAIL 승격 가능).

### 5.2 Dry-run 스크립트 (의사코드)

> **격리 원칙 (§0 #3 강제)**: `$HOME` 및 사용자 실제 CLI 설정 경로 (`~/.codex`, `~/.claude`) 절대 비파괴 접근. 모든 임시 상태는 `$TMPDIR/plugin-builder-dryrun-XXXXXXXXXX/`로 격리. SIGINT/TERM/HUP 처리.

`scripts/dry-run-claude.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${1:?path required}"

# CLI 가용성 — 없으면 SKIP (exit 78 = EX_CONFIG)
command -v claude >/dev/null 2>&1 || { echo '{"status":"SKIP","reason":"claude CLI not installed"}'; exit 78; }
claude --version >/dev/null 2>&1 || { echo '{"status":"SKIP","reason":"claude --version failed (auth/install issue)"}'; exit 78; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/plugin-builder-dryrun-XXXXXXXXXX")
[[ -d "$TMP" ]] || { echo '{"status":"FAIL","reason":"mktemp failed"}'; exit 1; }
trap 'rm -rf "$TMP"' EXIT INT TERM HUP

cp -R "$PLUGIN_DIR" "$TMP/plugin"
NAME=$(jq -er .name "$PLUGIN_DIR/.claude-plugin/plugin.json") || { echo '{"status":"FAIL","reason":"plugin.json name field missing"}'; exit 1; }
[[ -n "$NAME" && "$NAME" != "null" ]] || { echo '{"status":"FAIL","reason":"plugin name empty"}'; exit 1; }

# 30s timeout. JSON 출력 가능하면 그것 사용, 아니면 plain text + 이름 grep (false-positive 위험 명시)
if timeout 30s claude --plugin-dir "$TMP/plugin" --print --output-format json "/plugins" > "$TMP/out.json" 2>&1; then
  jq -e --arg n "$NAME" '.plugins[]? | select(.name == $n)' "$TMP/out.json" > /dev/null \
    && echo '{"status":"PASS"}' \
    || { echo "{\"status\":\"FAIL\",\"reason\":\"plugin $NAME not in /plugins output\"}"; exit 1; }
else
  rc=$?
  [[ $rc == 124 ]] && { echo '{"status":"FAIL","reason":"dry-run timeout 30s"}'; exit 1; }
  echo "{\"status\":\"FAIL\",\"reason\":\"claude CLI exit $rc\"}"; exit 1
fi
```

`scripts/dry-run-codex.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${1:?path required}"

command -v codex >/dev/null 2>&1 || { echo '{"status":"SKIP","reason":"codex CLI not installed"}'; exit 78; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/plugin-builder-dryrun-XXXXXXXXXX")
[[ -d "$TMP" ]] || { echo '{"status":"FAIL","reason":"mktemp failed"}'; exit 1; }
trap 'rm -rf "$TMP"' EXIT INT TERM HUP

NAME=$(jq -er .name "$PLUGIN_DIR/.codex-plugin/plugin.json") || { echo '{"status":"FAIL","reason":"codex plugin.json name missing"}'; exit 1; }
[[ -n "$NAME" && "$NAME" != "null" ]] || { echo '{"status":"FAIL","reason":"plugin name empty"}'; exit 1; }

# CODEX_HOME 격리 — ~/.codex 비파괴
export CODEX_HOME="$TMP/codex-home"
mkdir -p "$CODEX_HOME/plugins"
cp -R "$PLUGIN_DIR" "$CODEX_HOME/plugins/$NAME"

# Codex CLI JSON 리스트 명령은 TBD — 아래는 후보. 미지원 시 SKIP.
if codex plugin list --json > "$TMP/out.json" 2>&1; then
  jq -e --arg n "$NAME" '.[]? | select(.name == $n)' "$TMP/out.json" > /dev/null \
    && echo '{"status":"PASS"}' \
    || { echo "{\"status\":\"FAIL\",\"reason\":\"plugin $NAME not in list\"}"; exit 1; }
else
  # JSON 미지원 → manifest 존재만 확인 (degraded mode)
  [[ -f "$CODEX_HOME/plugins/$NAME/.codex-plugin/plugin.json" ]] \
    && echo '{"status":"SKIP","reason":"codex JSON list unsupported; manifest-only verified"}' \
    && exit 78 \
    || { echo '{"status":"FAIL","reason":"manifest staging failed"}'; exit 1; }
fi
```

> **메모**: `codex plugin list --json` 존재 여부는 v0.2 시점 미확인. P3 진행 시 Codex CLI 실측 후 확정. 그 전까지는 (e)는 SKIP-degraded 모드 (manifest 존재만 확인) 으로 운용.

### 5.3 실패 메시지 템플릿

**TTY 모드** (`bin/plugin-builder` 직접 실행):
```
[FAIL] (c) Cross-reference 검증
  └─ manifest의 `commands[2].name = "deploy"` 가 commands/deploy.md 파일로 존재하지 않음
  └─ 해결 옵션:
       1) 파일 생성: commands/deploy.md (boilerplate 자동 생성)
       2) manifest에서 항목 제거
       3) 다른 파일명으로 매핑 변경
  → 어떤 옵션? (1/2/3 또는 skip)
```

**Non-TTY 모드** (slash command wrapper — Claude/Codex 내부, stdin 없음):
대화형 prompt 금지. 대신 구조화된 `RESOLUTION_REQUIRED` 블록을 stdout JSON으로 emit하고 exit 65 (EX_DATAERR):
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
호스트(slash command body)가 사용자에게 옵션 제시 → 사용자 선택 → `bin/plugin-builder --resolve <stage> <option-id>` 재호출.

원칙:
- **무엇이/어디서/왜** 1줄 요약
- 자동 수정 가능한 옵션을 1번에 배치
- skip 허용, 최종 리포트에 "unresolved" 표기
- TTY 감지: `process.stdin.isTTY` true → 대화형, else → JSON emit

### 5.4 최종 보고서

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
  .claude-plugin/marketplace.json   (entry index 7 추가)
  commands/check.md
  commands/sync.md
  skills/i18n-key-guard/SKILL.md
  ...

Warnings (1)
  - hook `Notification` (claude-only) 은 codex target에서 drop됨

Next steps
  1) git add . && git commit -m "feat: scaffold my-i18n-guard"
  2) 로컬 테스트: claude --plugin-dir .
  3) PR: gh pr create -B main
========================================================
```

---

## 6. Marketplace Auto-patch

### 6.1 알고리즘 (idempotent, atomic, lock-protected)

```
입력: spec: UnifiedSpec, marketplace_path: string

전제: marketplace_path의 유일한 writer는 core/marketplace-writer.js
      adapters/* 는 marketplace.json 절대 안 씀 (소유권 §6.3)

1. file lock 획득 (proper-lockfile, 5s timeout × 3 retry)
   - lock 실패 시 EX_TEMPFAIL (75) — "다른 publish 진행 중" 메시지
2. marketplace.json 없으면 → { "name": <auto from cwd>, "owner": {...}, "plugins": [] } 으로 메모리 초기화
3. ajv로 schema 검증 (기존 파일 손상 감지)
4. plugins[] 에서 entry.name == spec.name 검색
   - 없으면: append 새 항목
   - 있으면: **deep-merge** — spec에 있는 키만 덮어쓰기, unknown 키는 보존 (forward-compat)
     ※ 절대 entire object replace 금지
5. ajv 재검증
6. atomic write 순서:
   a. tmp = `${path}.tmp.${pid}.${rand}` 작성 + fsync
   b. 원본 존재 시 → rename(original, original.bak)  ← rename은 원자적
   c. rename(tmp, original)
   d. 실패 시: rename(original.bak, original) 으로 복구
7. lock 해제
8. diff 출력 (사람 review 가능하게)
```

**관찰**:
- rename 자체가 POSIX atomic이므로 `.bak` 없이도 손상은 없음. `.bak`는 사용자 복구 용도 (사람이 의도적으로 롤백)
- 단계 6의 b/c가 실패하면 6d 복구. EXIT/INT/TERM trap으로 cleanup 보장

### 6.2 Source 선택 로직

- 사용자가 `--git-remote` 옵션 줬으면 → `{ "source": "github", "repo": "<owner>/<name>" }`
- 그 외 → `{ "source": "local", "path": "./<name>" }` (v0.7 부터; 이전 `./plugins/<name>`)
- Codex 측은 (legacy `.claude-plugin/marketplace.json` 호환되므로) 같은 파일에 동일 entry 1개로 충분.
  추가로 README에 `codex plugin marketplace add ...` 스니펫 자동 삽입 (이건 marketplace.json 자체가 미사용인 환경 대비 — 양립이지 중복 아님).

### 6.3 marketplace.json 소유권 (Contract)

| 책임 | 모듈 | 행동 |
|---|---|---|
| 읽기/쓰기 단일 권한 | `core/marketplace-writer.js` | 6.1 알고리즘 수행 |
| Adapter | `adapters/claude-code.js`, `adapters/codex.js` | marketplace.json 절대 미접근. 위반 시 `adapters/base.js`의 `assertNoMarketplaceWrite()` 가 throw |
| 자기-호스팅 (P6) | 동일 — plugin-builder가 자기 자신을 발행할 때도 marketplace-writer 통과 | — |

---

## 7. Phase Plan

| Phase | 목표 | 산출물 | 게이트 |
|---|---|---|---|
| P0 | 설계 확정 | DESIGN.md v0.2 (이 문서, 4-agent audit 반영) | ✅ 완료 |
| P1 | Skeleton + CLI 진입 | plugin.json, 4개 skill, 3개 command 골격, `bin/plugin-builder` + `core/cli.js`, `vendor/ajv` 번들 | engines.node 체크 동작 확인 |
| P2 | UnifiedSpec + Claude Adapter | `core/ir.js`, `core/spec-version.js`, `adapters/claude-code.js`, `templates/claude/*`, `schemas/v1/*.json` | ir.test.js + adapter-claude.test.js PASS |
| P3 | Codex Adapter + CLI 실측 | `adapters/codex.js`, `templates/codex/*`. Codex CLI JSON list 명령 실측 확인 후 (e) dry-run 확정 | adapter-codex.test.js PASS + Codex CLI 동작 1건 검증 |
| P3.5 | CI matrix 결정 | `.github/workflows/*` — claude/codex CLI 가용성 매트릭스, SKIP 정책 명시 | — |
| P4 | Validation 6단계 + 격리 dry-run | `core/validator.js`, `scripts/dry-run-*.sh` (CODEX_HOME 격리, timeout, JSON 출력) | validator.test.js PASS, dry-run scripts SKIP/PASS/FAIL 3-상태 검증 |
| P5 | Marketplace patch + lock | `core/marketplace-writer.js`, `core/lockfile.js`, `adapters/base.js`의 assertion | marketplace-writer.test.js PASS, 동시 publish 락 충돌 시뮬레이션 PASS |
| P5.5 | Self-host fixture 검증 | `tests/fixtures/self-host-spec.json` 가 (a)+(b)+(c) PASS | IR이 hybrid plugin 표현 가능 확인 — P6 전제 |
| P6 | Self-host | plugin-builder가 자기 자신을 scaffold (dogfood). 결과물이 v0.2 자신과 byte-diff 최소 | self-host CI job GREEN |
| P7 | 공개 + i18n | GitHub repo, README.md (en) + README.ko.md, 데모 영상, plugin-builder-official marketplace repo | — |

---

## 8. 결정 사항 (Resolved — 2026-05-18)

| # | 항목 | 결정 | 영향 |
|---|---|---|---|
| 1 | CLI 분리 | **둘 다** — `bin/plugin-builder` Node script가 단일 진입점, slash command가 wrapper | 외부 CI/script 호출 가능. §2 폴더 구조 그대로. |
| 2 | Test runner | **Node native** (`node:test`) | 의존성 0. Node 20+ 요구. `package.json` devDeps 최소. |
| 3 | README i18n | **한/영 동시 생성** | `templates/*/README.md.ejs` + `README.ko.md.ejs` 양벌. P1부터 적용. |
| 4 | Marketplace 배포 | **자체 `plugin-builder-official` marketplace** | 독립 repo. discoverability 마케팅 별도. community PR은 미루기. |
| 5 | Codex `version` | **단일 version 공유** (UnifiedSpec.version 그대로) | 분기 없음. target override 필드 도입 X. |

---

## 9. 참조

- Claude Code Plugins: https://code.claude.com/docs/en/plugins
- Claude Code Plugins Reference: https://code.claude.com/docs/en/plugins-reference
- Marketplace: https://code.claude.com/docs/en/plugin-marketplaces
- Codex Build Plugins: https://developers.openai.com/codex/plugins/build
- Codex Skills: https://developers.openai.com/codex/skills
- Codex Hooks: https://developers.openai.com/codex/hooks
- `skill-creator` (선례): `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/`

---

## 10. 운영 Concerns (v0.2 신설)

### 10.1 런타임 가드

- `package.json`: `"engines": { "node": ">=20" }`
- `bin/plugin-builder` 1번째 라인:
  ```js
  const [maj] = process.versions.node.split('.').map(Number);
  if (maj < 20) { console.error('plugin-builder requires Node >= 20'); process.exit(78); }
  require('../core/cli.js');
  ```
- `node:test` 사용 (`devDependencies` 거의 비움)

### 10.2 ajv & schema 오프라인-우선

- `ajv` + `ajv-formats` 를 `vendor/` 에 번들. `require('../vendor/ajv')` — npm install 없이 첫 실행 가능
- ajv 인스턴스화 시 `addSchema()` 로 로컬 schema 등록. `$id` 의 `https://` 는 식별자일 뿐, 네트워크 fetch 비활성 (`loadSchema` 미설정)
- 네트워크 의존 0

### 10.3 로깅

- `core/log.js`: 레벨 `debug` < `info` < `warn` < `error`
- 환경변수 `PLUGIN_BUILDER_LOG=debug|info|warn|error` (기본 `info`)
- CLI `--verbose` = `debug`, `--quiet` = `warn`
- JSON 출력 모드 (`--json`) 시 로그는 stderr, 결과는 stdout

### 10.4 Staged render (atomic)

- `core/renderer.js` 가 파일을 곧바로 target 디렉토리에 쓰지 않고 `$TMPDIR/pb-stage-XXXXXXXXXX/` 에 먼저 쓴다
- (a)~(f) 전부 통과 시 staged tree 를 target 으로 promote (디렉토리 rename 또는 파일별 rename)
- 실패 시 staged 폐기, target 무손상
- `--allow-partial` 플래그로 우회 가능 (디버깅용)

### 10.5 CI 매트릭스 (P3.5에서 확정)

| Job | Node | claude CLI | codex CLI | (d) | (e) |
|---|---|---|---|---|---|
| unit-only | 20.x | — | — | SKIP | SKIP |
| claude-integration | 20.x | latest | — | PASS 강제 | SKIP |
| codex-integration | 20.x | — | latest | SKIP | PASS 강제 |
| full | 20.x | latest | latest | PASS | PASS |

`--strict` 플래그로 SKIP → FAIL 승격, integration job 들은 `--strict` 적용.

### 10.6 알려진 lossy 변환 (문서화 의무)

- `commands[].frontmatter` (Claude) → SKILL.md Commands 섹션 (Codex): 양방향 round-trip 불가
- `displayName/composerIcon/defaultPrompt/interface.*` (Codex) → README 헤더 (Claude): 양방향 round-trip 불가
- `disable-model-invocation` / `user-invocable` (Claude) → Codex 없음, drop+warn
- `PermissionRequest` (Codex only) → Claude target 시 drop+warn
- 사용자 문서 (README.md) 에 "Cross-target conversion notes" 섹션 자동 생성

---

## 11. Ready-to-build 체크리스트 (P0 종료 게이트)

- [x] §0 핵심 결정 5건 확정 (v0.1)
- [x] §8 미정사항 5건 확정 (v0.1 마지막 단계)
- [x] §1 호환성 매트릭스 docs 실측 정정 (v0.2)
- [x] §3 UnifiedSpec schema specVersion + 누락 필드 보강 (v0.2)
- [x] §3.2 매핑 Codex interface 위치 정정 (v0.2)
- [x] §5.2 dry-run 격리/timeout/JSON/SKIP 의미 정의 (v0.2)
- [x] §5.3 non-TTY 모드 정의 (v0.2)
- [x] §6.1 atomic 순서 + file lock + deep-merge (v0.2)
- [x] §6.3 marketplace.json 소유권 contract (v0.2)
- [x] §7 phase plan 게이트 명시 (v0.2)
- [x] §10 운영 concerns (engines/ajv/log/staged/CI) (v0.2)

→ **P1~P5.5 완료 (v0.3). v0.4: H1/H2/H3 + M1~M5 보안·robustness 강화 + 11개 신규 테스트 + CI 추가. P6 완전 dogfood는 차기.**

---

## 12. v0.4 빌드 검증 결과 (2026-05-18)

```
$ npm test
# tests 44
# pass 44
# fail 0
```

| 검증 항목 | 결과 |
|---|---|
| `ir.validate` (sample + self-host + invalid cases) | 7/7 PASS |
| Claude adapter (manifest, commands, skills, hooks, mcp, marketplace 차단) | 6/6 PASS |
| Codex adapter (interface block, commands fold, claude-only drop, features.plugin_hooks, no commands/, marketplace 차단) | 6/6 PASS |
| Validator (stage a, b/c, d/e SKIP, f PASS+FAIL) | 5/5 PASS |
| Marketplace writer (create, idempotent no-op, deep-merge, github source, .bak atomic, deepMerge unit) | 6/6 PASS |
| CLI parseArgs | 2/2 PASS |
| Self-host fixture (scaffold → file exists → validate a+b+c) | 1/1 PASS |

End-to-end smoke (`scaffold tests/fixtures/sample-spec.json` → 8 files emitted, 3 warnings, 모두 정확):
- `[claude-code] hook event 'PermissionRequest' is codex-only; dropped from claude-code target` ✓
- `[codex] commands (2) folded into SKILL.md per Codex spec` ✓
- `[codex] hook event 'Notification' is claude-only; dropped from codex target` ✓

CLI publish smoke: `--git-remote testowner/my-i18n-guard` → `marketplace.json`에 `source: github, repo: testowner/my-i18n-guard` append idempotent.

### 12.1 알려진 제약 (v0.4 작업)

1. **Hybrid mode file collisions**: 동일 plugin 디렉토리에 양 target emit 시 `skills/<n>/SKILL.md`, `hooks/hooks.json`, `README.md` 가 last-write-wins. v0.4 에서 target별 subdir (`./claude/`, `./codex/`) 옵션 추가 예정.
2. **`claude --plugin-dir`/`codex plugin list --json`** 실측 미확정으로 stage (d)/(e) 가 자주 SKIP. CLI 안정화 후 PASS 확장.
3. **Interactive prompter 미구현**: 현재 spec JSON 직접 작성 필요. AskUserQuestion 기반 Q1–Q8 흐름은 skill body가 담당 (CLI 자체에는 없음).
4. **ajv vendor 미반영**: embedded validator로 충분하나, JSON Schema draft 2020-12 호환 완전 검증은 ajv 도입 시 가능.
