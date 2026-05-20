# plugin-builder

Plugin Builder는 하나의 UnifiedSpec으로 Claude Code, OpenAI Codex, Cursor 플러그인을 생성합니다.

UnifiedSpec **v1.1** (v0.8)부터 플랫폼별 전용 기능이 모두 1급으로 표현 가능합니다. v1.0 spec은 byte 단위로 동일하게 계속 emit되며, v1.1 신규 필드는 모두 선택입니다.

## 사용

마켓플레이스를 설치한 뒤 자연어로 플러그인 생성, 검증, 등록, marketplace 초기화를 요청하면 됩니다.

```bash
# Claude Code
/plugin marketplace add developjik/plugin-tools
/plugin install plugin-builder@plugin-builder-official

# Codex
codex plugin marketplace add github:developjik/plugin-tools
codex plugin install plugin-builder

# Cursor (생성된 플러그인은 Cursor Agent chat에서 설치)
/add-plugin <plugin-name>
```

Cursor target 범위 (v3, UnifiedSpec v1.1): `rules`, `skills`, `agents`, `commands`, `hooks`, `mcp.json`을 emit합니다. Hook 이벤트 이름은 Cursor camelCase로 정규화됩니다 (예: `PreToolUse` → `preToolUse`). Command 파일 확장자와 inline-vs-file 출력은 `spec.cursor.commandExtension` / `inlineHooks` / `inlineMcp`로 제어합니다.

사용자 표면 명령:

| 명령 | 용도 |
|---|---|
| `/plugin-builder:new [name]` | Claude Code + Codex + Cursor 플러그인 생성 후 marketplace root에 등록 |
| `/plugin-builder:marketplace-init <root>` | Claude / Codex / Cursor marketplace catalog 생성 |
| `/plugin-builder:validate <plugin-dir>` | 6단계 검증 실행 |
| `/plugin-builder:publish <plugin-dir>` | parent root의 marketplace catalog 패치 |

`/plugin-builder:new` 흐름은 가장 먼저 `AskUserQuestion`(multiSelect)로 어떤 플랫폼을 빌드할지 묻고, 이후 모든 질문이 그 선택 집합에 맞춰 좁아집니다. 사용자가 한 플랫폼 전용 기능(예: `claude.lsp`, `codex.apps`, `cursor.commandExtension`)을 켜면 다른 선택 플랫폼이 그 필드를 drop한다는 사실을 화면 경고로 안내합니다. 매트릭스 출처는 `skills/plugin-builder/references/capability-matrix.md`.

생성된 플러그인은 v0.7 root-flat layout인 `<root>/<plugin-name>/`에 위치합니다.

## UnifiedSpec v1.1 추가 필드 (모두 선택, additive)

- 공통 1급 승격: `mcpServers[].args/env/headers`, `agents[].disallowedTools/model`, `hooks[].type` (`command|http|mcp_tool|prompt|agent`) + `statusMessage`, top-level `keywords`.
- `spec.claude.*` 확장: `lsp[]`, `monitors[]`, `bin[]`, `settings`, `userConfig`, `agentExtras`.
- `spec.codex.*` 확장: `apps[]` (`.app.json`), `features.*`, `interfaceMeta` (`shortDescription` / `longDescription` / `developerName` / `websiteURL` / `privacyPolicyURL` / `termsOfServiceURL`).
- `spec.cursor.*` 확장: `commandExtension` (`md|mdc|markdown|txt`), `inlineHooks`, `inlineMcp`, `displayName`, `publisher`, `tags`.

다른 플랫폼에서 지원되지 않는 namespace 필드는 어댑터가 "namespace.field is X-only; dropped from <this>-target" 형식의 경고를 발행합니다.

## 개발 메모

개발 소스, 테스트, 긴 설계 문서는 `build/` 아래에 두어 루트는 설치 가능한 플러그인 번들 표면만 유지합니다. CLI 진입점은 `bin/plugin-builder`입니다.

```bash
npm test
npm run lint
```

## 품질 게이트

현재 구조 품질 게이트:

```bash
npm test
plugin-eval analyze . --format markdown
```

목표: 테스트 green, 플러그인과 포함된 모든 스킬 Plugin Eval Grade A에 fail 없음. 실측 사용량은 별도 관리합니다 — 대표 성공 benchmark 샘플이 5개 이상 모이기 전에는 observed usage JSONL을 durable baseline으로 보관하지 않습니다. 기준은 `.plugin-eval/MEASUREMENT.md`를 따릅니다.

전체 보관 문서는 `build/docs/` 아래에 있습니다.
