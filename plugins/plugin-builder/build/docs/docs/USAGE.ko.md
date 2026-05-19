# plugin-builder — 사용법

> 단일 UnifiedSpec → Claude Code + OpenAI Codex 양쪽 플러그인 생성기.
>
> 빠른 진입: `./bin/plugin-builder help`
>
> English version: [USAGE.md](./USAGE.md)

---

## 0. 사전 조건

- Node ≥ 20
- (선택) `claude` CLI — stage (d) dry-run 활성화
- (선택) `codex` CLI — stage (e) dry-run 활성화

> v0.5: dry-run 은 node 로 포팅되어 bash/jq/timeout 의존 제거됨 (cross-platform).

설치:
```bash
git clone https://github.com/developjik/plugin-builder
cd plugin-builder
npm test        # 132 tests PASS 확인
```

npm 의존성 0. `npm install` 불필요. 현재 v0.7 번들은 132개 테스트와 Plugin Eval 구조 평가로 검증합니다.

---

## 1. CLI 명령어

### 1.1 `scaffold` — Spec 으로부터 파일 생성

```bash
plugin-builder scaffold --spec <spec.json> [--out <root>] [--no-publish] [--git-remote <owner/repo>]
```

- `--spec` (필수): UnifiedSpec JSON 경로 (`--spec=path` 형식도 허용)
- `--out <root>` (선택, 기본 `.`): marketplace root 디렉토리. plugin tree 는 `<root>/<spec.name>/` 으로 emit.
- `--no-publish` (선택): auto-publish 단계 skip (파일 생성만).
- `--git-remote <owner/repo>` (선택): marketplace entry 에 `source: github` + `repo` 기록. 미지정 시 `source: local` + `path: ./<name>`.

동작:
1. spec 로드 + `core/ir.js` validate (스키마 위반 시 abort)
2. `targets[]` 각각에 대해 adapter 호출 → 한 hybrid tree 로 병합 (두 manifest, 공유 skills/, target 별 hooks/{claude,codex}.json)
3. `$TMPDIR/pb-stage-XXXXXXXXXX/` 에 staged write
4. `<root>/<spec.name>/` 으로 promote
5. `--no-publish` 가 아니면 `<root>/.claude-plugin/marketplace.json` 와 `<root>/.agents/plugins/marketplace.json` 두 카탈로그를 single-lock transaction 으로 패치
6. stdout 에 결과 JSON 출력 (`root`, `files`, `warnings[]`, `publish`)

예시:
```bash
# 1. marketplace root 1회 init
plugin-builder marketplace init ./my-market --owner-name "Me"

# 2. plugin scaffold + auto-publish
plugin-builder scaffold --spec X.json --out ./my-market
# → ./my-market/<X.name>/ (두 매니페스트, 공유 skills, hooks/{claude,codex}.json)
# → ./my-market/.claude-plugin/marketplace.json + ./my-market/.agents/plugins/marketplace.json 패치

# 3. marketplace 패치 미루기:
plugin-builder scaffold --spec X.json --out ./my-market --no-publish
```

### 1.1.1 `marketplace init` — 멀티 플러그인 root 생성

```bash
plugin-builder marketplace init <root> [--name <id>] [--display-name <human>]
                                       [--owner-name <name>] [--owner-email <email>] [--force]
```

- `<root>/.claude-plugin/marketplace.json` 생성 (Claude 스키마: `name`, `owner`, `plugins: []`)
- `<root>/.agents/plugins/marketplace.json` 생성 (Codex 스키마: `name`, 선택 `interface.displayName`, `plugins: []`)
- 기존 Claude 카탈로그 파일이 있으면 `--force` 없이는 덮어쓰기 거부
- 기본값: `--name` ← `basename(root)`, `--display-name` ← name Title Case, owner ← `git config user.name|email` → `"unknown"` fallback

출력 예:
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

### 1.2 `validate` — 6단계 검증

```bash
plugin-builder validate <plugin-dir> [--spec <spec.json>] [--strict]
```

- `<plugin-dir>` (필수): 검증 대상 디렉토리
- `--spec` (선택): 원본 UnifiedSpec. 있으면 stage (b)/(c) 가 더 정확
- `--strict`: SKIP → FAIL 승격 (CI 용)

스테이지:

| 단계 | 이름 | SKIP 조건 |
|---|---|---|
| a | Manifest schema | — |
| b | File structure | `--spec` 없을 때 |
| c | Cross-reference | `--spec` 없을 때 |
| d | Claude dry-run | `claude` CLI 없거나 `--plugin-dir/--print` 미지원 |
| e | Codex dry-run | `codex` CLI 없거나 `plugin list --json` 미지원 |
| f | Marketplace | `.claude-plugin/marketplace.json` 없을 때 |

종료 코드:
- `0` — 전체 PASS (SKIP 허용)
- `1` — 1개 이상 FAIL (또는 `--strict` + SKIP)

예시:
```bash
plugin-builder validate ./my-plugin --spec ./my-spec.json
plugin-builder validate ./my-plugin --strict        # CI 용
```

출력 예 (양 target, CLI 일부만 설치):
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

상태 의미:
- **PASS** — 해당 stage 통과
- **FAIL** — 결정적 오류. 종료 코드 1. `--strict` 무관.
- **SKIP** — 검증할 조건이 갖춰지지 않음. 통상 PASS 로 간주. `--strict` 시 FAIL 로 승격.

### 1.3 `publish` — Marketplace 패치

```bash
plugin-builder publish <plugin-dir> [--git-remote <owner/repo>]
```

- `<plugin-dir>` (필수): plugin 디렉토리 (`.claude-plugin/plugin.json` 필수). parent 디렉토리가 marketplace root (`.claude-plugin/marketplace.json` 존재) 여야 함.
- `--git-remote` (선택): 줄 경우 `source: github`, 안 줄 경우 `source: local` + `path: ./<name>`.

동작: parent root 의 `<root>/.claude-plugin/marketplace.json` + `<root>/.agents/plugins/marketplace.json` 두 카탈로그를 sequential single-lock transaction 으로 패치.

특성:
- File lock (`.lock` 파일) → 동시 publish 안전
- Atomic write (tmp → fsync → rename original→.bak → rename tmp→original)
- Deep-merge → 기존 entry 의 unknown key 보존 (forward-compat)
- Idempotent (동일 spec 재실행 = no-op)
- 동시 lock 1개 한도. Codex write 실패 시 Claude 는 pre-transaction 내용으로 롤백 (sequential single writer).

예시:
```bash
plugin-builder publish ./my-market/my-plugin --git-remote myorg/my-plugin
```

### 1.4 `version` / `help`

```bash
plugin-builder version
plugin-builder help
plugin-builder --verbose <command>    # debug 로그
plugin-builder --quiet <command>      # warn 이상만
```

---

## 2. UnifiedSpec 작성

### 2.1 최소 spec

```json
{
  "specVersion": "1.0",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "한 줄 설명 (≤200자)",
  "targets": ["claude-code"]
}
```

필수: `specVersion`, `name`, `version`, `description`, `targets`.

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

- Claude target: `commands/<name>.md` 파일로 emit
- Codex target: SKILL.md "Commands" 섹션으로 fold (frontmatter는 description 으로 강등 — lossy)

### 2.3 Skills

```json
"skills": [
  {
    "name": "i18n-key-guard",
    "description": "20자 이상의 트리거 키워드 포함 description.",
    "allowed-tools": ["Read", "Grep"],
    "disable-model-invocation": false,
    "user-invocable": true,
    "model": "sonnet",
    "argument-hint": "<file>",
    "body": "# Skill body markdown\n\n..."
  }
]
```

- `description` 최소 20자
- **Security-critical frontmatter** (`allowed-tools`, `disable-model-invocation`, `user-invocable`)는 Codex target 시에도 **보존**. Silent drop = privilege escalation 이라 정책상 금지.
- **Style/perf frontmatter** (`model`, `effort`, `paths`)는 Codex target 시 drop + warning
- Codex fold 중 command 의 `allowed-tools` 가 skill 의 `allowed-tools` 에 **union** 으로 흡수 (warning 으로 명시)
- Codex 전용 invocation policy: `"codex": { "allow_implicit_invocation": true }` 블록 추가 → `skills/<name>/agents/openai.yaml` 생성

### 2.4 Hooks

```json
"hooks": [
  { "event": "PreToolUse", "matcher": "Edit", "command": "scripts/check.sh" },
  { "event": "Notification", "command": "scripts/notify.sh" },
  { "event": "PermissionRequest", "command": "scripts/codex.sh" }
]
```

이벤트 호환성 (`schemas/v1/hook-event-compat.json`):

| 분류 | 이벤트 |
|---|---|
| common | `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `UserPromptSubmit` |
| claudeOnly | `Notification`, `SubagentStop`, `PreCompact`, `SessionEnd` |
| codexOnly | `PermissionRequest` |

- claudeOnly → codex target 시 drop + warning
- codexOnly → claude target 시 drop + warning
- 미등록 이벤트 → 양쪽 emit + unknown warning

### 2.5 MCP Servers

```json
"mcpServers": [
  { "name": "lokalise", "transport": "stdio", "command": "lokalise-mcp" },
  { "name": "remote", "transport": "http", "url": "https://api.example.com/mcp" }
]
```

양 target 모두 `.mcp.json` 에 emit. Transport: `stdio` / `http` / `sse`.

**URI scheme 허용 목록** (homepage / repository / mcpServers[].url 공통):

`http`, `https`, `git`, `git+http`, `git+https`, `git+ssh`, `git+file`, `ssh`, `svn`, `hg`, `ws`, `wss`.

차단되는 scheme (defence-in-depth, XSS/exfiltration 차단):
- `javascript:` (XSS), `data:` (inline payload), `file:` (local 파일 노출), `vbscript:`, `mailto:` (homepage 부적합)

거부 시 메시지: `homepage: must be a URI with allowed scheme (one of http|https|git|...)`.

### 2.6 Codex Interface (Codex 전용)

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

- Codex target: `.codex-plugin/plugin.json::interface` 블록으로 emit
- Claude target: README.md 헤더로 fold (lossy round-trip 불가)

### 2.7 전체 예시

`build/tests/fixtures/sample-spec.json` 참조. `i18n-key-guard` plugin 의 cross-target 완전 spec.

---

## 3. Slash Command 사용 (Claude/Codex 안에서)

plugin-builder 가 plugin 으로 설치된 경우:

### 3.1 `/plugin-builder:new [name]`

신규 plugin scaffold. AskUserQuestion 으로 Q1~Q8 수집 → UnifiedSpec 빌드 → `bin/plugin-builder scaffold` 호출.

### 3.2 `/plugin-builder:validate <plugin-dir>`

6단계 검증. `RESOLUTION_REQUIRED` JSON 블록이 stdout 에 나오면 host (slash command body) 가 사용자에게 옵션 제시 → `--resolve` 재호출.

### 3.3 `/plugin-builder:publish <plugin-dir> [--git-remote owner/repo]`

Marketplace 패치. Idempotent.

---

## 4. 자주 쓰는 flow

### 4.1 신규 plugin 만들기

```bash
# 1. marketplace root 1회 init
plugin-builder marketplace init ./my-market --owner-name "Me"

# 2. spec 작성
cat > my-spec.json <<'EOF'
{
  "specVersion": "1.0",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "...",
  "targets": ["claude-code", "codex"],
  "skills": [
    { "name": "my-skill", "description": "20자 이상 트리거 설명입니다." }
  ]
}
EOF

# 3. scaffold + auto-publish
plugin-builder scaffold --spec my-spec.json --out ./my-market

# 4. 검증
plugin-builder validate ./my-market/my-plugin --spec my-spec.json
```

### 4.2 기존 plugin 점검

```bash
plugin-builder validate ./my-market/existing-plugin --strict
```

`--strict` 로 CI 게이트.

### 4.3 marketplace 만 idempotent update

```bash
# version 만 0.1.0 → 0.2.0 으로 올렸을 때
plugin-builder publish ./my-market/my-plugin
# → entry.version 만 deep-merge, unknown 키 보존
# → .bak 자동 생성
```

---

## 5. 출력물 구조

`plugin-builder marketplace init <root>` 후 `plugin-builder scaffold --spec X.json --out <root>` 실행하면 다음과 같이 emit:

```
<root>/
├── .claude-plugin/
│   └── marketplace.json        # Claude 카탈로그 (auto-patched)
├── .agents/plugins/
│   └── marketplace.json        # Codex 카탈로그 (auto-patched)
└── <spec.name>/                # hybrid plugin tree
    ├── .claude-plugin/plugin.json     # hooks: ./hooks/claude.json
    ├── .codex-plugin/plugin.json      # hooks: ./hooks/codex.json, interface 블록 포함
    ├── commands/                       # Claude 전용
    │   ├── check.md
    │   └── sync.md
    ├── skills/
    │   └── i18n-key-guard/
    │       ├── SKILL.md                # Codex variant 가 Commands 섹션 fold 후 wins
    │       └── agents/openai.yaml      # Codex 전용 invocation policy 있을 때만
    ├── hooks/
    │   ├── claude.json                 # claude target 이벤트만
    │   └── codex.json                  # codex target 이벤트만
    ├── .mcp.json                       # 양 target 공통
    └── README.md
```

`<root>` 아래에 plugin 여러 개 두면 `<root>/<name-1>/`, `<root>/<name-2>/` 식으로 나란히 들어가고 두 카탈로그는 각 plugin 의 entry 를 동시에 보유. v0.6 의 `<root>/plugins/<name>/` 한 단계는 v0.7 에서 제거.

---

## 6. 환경변수

| 변수 | 의미 | 기본 |
|---|---|---|
| `PLUGIN_BUILDER_LOG` | 로그 레벨 (`debug`/`info`/`warn`/`error`) | `info` |
| `TMPDIR` | staged write + dry-run 격리 위치 | `/tmp` |
| `CODEX_HOME` | (codex dry-run 내부에서 override) | — |

---

## 7. Exit codes

| code | 의미 |
|---|---|
| 0 | 성공 (validate 의 경우 모든 stage PASS or SKIP) |
| 1 | 일반 실패 (spec invalid, render error, validate FAIL, publish error) |
| 2 | 잘못된 사용 (unknown command, missing required arg) |
| 78 (EX_CONFIG) | dry-run script 내부 SKIP 시그널 (외부 호출 시 CLI 미설치 의미) |

---

## 8. Troubleshooting

**Q. `plugin-builder requires Node >= 20`**
→ `node --version` 확인. nvm 사용 권장.

**Q. `spec invalid: name: must match /^[a-z]...`**
→ kebab-case 만 허용. `MyPlugin` ❌, `my-plugin` ✓.

**Q. `description: minLength 20`** (skill)
→ skill description 은 트리거 키워드 풍부히 포함하라는 의미로 20자 강제.

**Q. Stage (d)/(e) 가 항상 SKIP**
→ CLI 미설치 또는 해당 CLI 가 아직 `--plugin-dir`/`plugin list --json` 미지원. v0.5 부터 node 포팅된 dry-run 이 명확한 SKIP/FAIL 메시지를 stdout 으로 출력. `--strict` 가 아닌 한 SKIP → PASS 처리됨.

**Q. `unknown flag: --xxx`**
→ v0.5 부터 unknown flag 는 typo 노출을 위해 hard error. 보통 위치: `--key=value` 오타 (예: `--specs` vs `--spec`).

**Q. `homepage: must be a URI with allowed scheme`**
→ §2.5 의 URI 허용 목록 참고. SSH shorthand `git@github.com:foo/bar` 는 scheme 이 없어 거부됨. `git+ssh://git@github.com/foo/bar` 또는 `https://github.com/foo/bar` 사용.

**Q. `EEXIST` lock 에러**
→ 다른 publish 가 진행 중. 5초~ 대기 후 자동 retry. 영구 lock 파일 잔재 의심 시 `rm marketplace.json.lock`.

**Q. publish 후 `.bak` 파일 누적**
→ 정상. 매 update 마다 직전 버전 보존. 정리 원하면 `rm *.bak`.

---

## 9. 다음 자료

- [README.ko.full.md](../README.ko.full.md) — 전체 한눈에 보기
- [DESIGN.md](../DESIGN.md) — 아키텍처 + 결정 + 매핑 규칙
- [build/tests/fixtures/sample-spec.json](../../tests/fixtures/sample-spec.json) — 전체 필드 사용한 spec 예시
- [build/tests/fixtures/self-host-spec.json](../../tests/fixtures/self-host-spec.json) — plugin-builder 가 자기 자신 표현한 spec
