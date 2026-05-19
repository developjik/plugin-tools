# plugin-builder

> 단일 UnifiedSpec 으로 Claude Code + OpenAI Codex 양쪽 플러그인을 생성하는 메타 플러그인.
>
> English version: [README.md](./README.md)

버전: 0.7.0 | 라이선스: MIT | Node: >=20 | npm 의존성 0

---

## 사용자 가이드

> CLI 명령어를 알 필요 없어요. 4단계만 따라가면 됩니다.

### 1. Marketplace 추가 (1회)

**Claude Code:**
```
/plugin marketplace add developjik/plugin-builder
```

**Codex:**
```
codex plugin marketplace add github:developjik/plugin-builder
```

### 2. Plugin 설치 (1회)

**Claude Code:**
```
/plugin install plugin-builder@plugin-builder-official
```

**Codex:**
```
codex plugin install plugin-builder
```

### 3. Skill 실행 (자연어 또는 slash command)

자연어 예시:
> "i18n 검사하는 플러그인 만들어줘. Claude 랑 Codex 둘 다 지원."

또는 slash command:
```
/plugin-builder:new my-i18n-guard
```

스킬이 자동으로 트리거되고, 질문 9개를 차례로 물어봅니다 (한국어 메시지면 한국어로):

| # | 질문 |
|---|---|
| Q1 | 어느 타겟? claude-code / codex / 둘 다 |
| Q2 | 플러그인 이름 (kebab-case, 예: `my-plugin`) |
| Q3 | 버전 (기본 `0.1.0`) |
| Q4 | 한 줄 설명 (20~200자) |
| Q5 | 카테고리 (productivity / dev-tools / ai / data / other) |
| Q6 | 슬래시 명령 추가? |
| Q7 | 스킬 추가? |
| Q8 | 고급: MCP 서버 / hooks / interface? |
| Q9 | marketplace root 경로 (없으면 자동 생성) |

답변만 입력하면 끝. 내부 처리는 스킬이 알아서 합니다.

### 4. 생성된 플러그인 사용

스킬이 다음 구조로 파일을 만들어요:

```
<root>/                                    # ← Q9 답변 경로
├── .claude-plugin/marketplace.json        # Claude 카탈로그 (자동 등록)
├── .agents/plugins/marketplace.json       # Codex 카탈로그 (자동 등록)
└── <plugin-name>/                         # 새 플러그인
    ├── .claude-plugin/plugin.json
    ├── .codex-plugin/plugin.json
    ├── commands/, skills/, hooks/, .mcp.json, README.md
```

이후 본인 환경에 설치:

```
# Claude Code
/plugin marketplace add <root>
/plugin install <plugin-name>@<root-basename>

# Codex
codex plugin marketplace add file://<abs-root>
codex plugin install <plugin-name>
```

### 부가 명령

| 명령 | 용도 |
|---|---|
| `/plugin-builder:new [name]` | 새 플러그인 생성 (Q1~Q9 안내) |
| `/plugin-builder:marketplace-init <root>` | 새 marketplace root 생성 |
| `/plugin-builder:validate <plugin-dir>` | 6단계 검증 실행 |
| `/plugin-builder:publish <plugin-dir>` | parent root 두 카탈로그 패치 |

자연어로 "이 플러그인 검증해줘", "마켓플레이스 등록" 같은 표현도 자동 트리거됩니다.

---

## Contributor 가이드

> 코드 기여 / CI 통합용. **일반 사용자는 위 사용자 가이드만 보세요** — CLI 는 implementation detail 입니다.

```bash
git clone https://github.com/developjik/plugin-builder
cd plugin-builder
npm test        # 132 tests PASS 확인
```

npm 의존성 0. `npm install` 불필요.

### 품질 게이트

현재 구조 품질 검사:

```bash
npm test
node /Users/developjik/.codex/plugins/cache/openai-curated/plugin-eval/eed16198/scripts/plugin-eval.js analyze . --format markdown
```

기대 결과:

- 테스트: 132/132 pass
- Plugin Eval 플러그인 평가: 100/100, Grade A, low risk
- 포함 스킬: 4개 스킬 모두 100/100

실측 사용량은 별도 benchmark 신호입니다. 대표 성공 benchmark 샘플이 5개 이상 모이기 전에는 usage JSONL을 durable baseline으로 보관하지 않습니다. 기준은 [MEASUREMENT.md](../../.plugin-eval/MEASUREMENT.md)를 따릅니다.

### 문서

| 문서 | 내용 |
|---|---|
| [docs/USER_FLOW.ko.md](./docs/USER_FLOW.ko.md) | 사용자 end-to-end 여정 (자연어 + slash command) |
| [docs/USAGE.ko.md](./docs/USAGE.ko.md) | spec 필드 reference + 자주 쓰는 흐름 |
| [docs/REVIEW.ko.md](./docs/REVIEW.ko.md) | 리뷰 요약과 현재 품질 상태 |
| [DESIGN.ko.md](./DESIGN.ko.md) | 아키텍처, IR schema, 검증 정책, lossy 매핑 |

### v0.7 breaking 변경 요약

- plugin tree: `<root>/<name>/` (이전 `<root>/plugins/<name>/` 제거)
- marketplace entry `path: "./<name>"`, `metadata.pluginRoot` 필드 제거
- 단일 mode: split/merged/split-out 모드 + 관련 플래그 모두 제거
- `publish` 는 항상 두 카탈로그 동시 패치

상세는 [DESIGN.ko.md](./DESIGN.ko.md) 와 [docs/USAGE.ko.md](./docs/USAGE.ko.md).

---

## 라이선스

MIT
