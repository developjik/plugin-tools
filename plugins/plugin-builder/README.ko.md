# plugin-builder

Plugin Builder는 하나의 UnifiedSpec으로 Claude Code와 OpenAI Codex 플러그인을 생성합니다.

## 사용

마켓플레이스를 설치한 뒤 자연어로 플러그인 생성, 검증, 등록, marketplace 초기화를 요청하면 됩니다.

```bash
# Claude Code
/plugin marketplace add developjik/plugin-tools
/plugin install plugin-builder@plugin-builder-official

# Codex
codex plugin marketplace add github:developjik/plugin-tools
codex plugin install plugin-builder
```

사용자 표면 명령:

| 명령 | 용도 |
|---|---|
| `/plugin-builder:new [name]` | Claude Code + Codex 플러그인 생성 후 marketplace root에 등록 |
| `/plugin-builder:marketplace-init <root>` | Claude와 Codex marketplace catalog 생성 |
| `/plugin-builder:validate <plugin-dir>` | 6단계 검증 실행 |
| `/plugin-builder:publish <plugin-dir>` | parent root의 두 marketplace catalog 패치 |

생성된 플러그인은 v0.7 root-flat layout인 `<root>/<plugin-name>/`에 위치합니다.

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
node /Users/developjik/.codex/plugins/cache/openai-curated/plugin-eval/eed16198/scripts/plugin-eval.js analyze . --format markdown
```

현재 기대 결과:

- 테스트: 132/132 pass
- Plugin Eval: 100/100, Grade A, low risk
- 스킬: 포함된 4개 스킬 모두 100/100

실측 사용량은 별도 관리합니다. 대표 성공 benchmark 샘플이 5개 이상 모이기 전에는 observed usage JSONL을 durable baseline으로 보관하지 않습니다. 기준은 `.plugin-eval/MEASUREMENT.md`를 따릅니다.

전체 보관 문서는 `build/docs/` 아래에 있습니다.
