# Plugin Tools

이 워크스페이스는 두 개의 독립 플러그인을 한 프로젝트에서 관리합니다.

| 플러그인 | 역할 |
|---|---|
| `plugins/plugin-builder` | UnifiedSpec 하나로 Claude Code와 Codex 플러그인을 생성, 검증, 등록합니다. |
| `plugins/plugin-eval` | 로컬 스킬과 플러그인을 평가하고 점수, 개선 우선순위, 후속 검증 흐름을 제공합니다. |

핵심 경계는 단순합니다. `plugin-builder`는 만들고, `plugin-eval`은 평가합니다. 두 기능은 같은 제작 생애주기에 있지만 배포 단위와 스킬 네임스페이스는 분리합니다.

## 구조

```text
plugins/
  plugin-builder/
  plugin-eval/
```

루트는 설치 가능한 플러그인이 아니라 관리용 워크스페이스와 로컬 marketplace 역할을 합니다.

## 자주 쓰는 명령

```bash
npm test
npm run lint
npm run eval:all
npm run validate:claude
```

개별 평가:

```bash
npm run eval:builder
npm run eval:eval
```

## 관리 원칙

- `plugin-builder`와 `plugin-eval`은 독립 플러그인으로 유지합니다.
- 루트 디렉터리는 installable plugin bundle로 만들지 않습니다.
- 공통 코드가 실제로 생기기 전까지는 `packages/`를 만들지 않습니다.
- 문서와 marketplace 경로는 루트 기준 `./plugins/<plugin-name>`을 기준으로 최신 상태를 유지합니다.

## 현재 평가 상태

2026-05-19 기준 `plugin-eval` 평가 결과는 모두 정리된 상태입니다.

- `plugin-builder`: 100/A, low risk, 필수/권장 개선 0건
- `plugin-eval`: 100/A, low risk, 필수/권장 개선 0건
- 전체 9개 bundled skill: 100/A, low risk, 필수/권장 개선 0건

상세 표는 `docs/evaluation-summary.md`에 있습니다.
