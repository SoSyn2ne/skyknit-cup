# M39 → M40 48시간 계획 · goal 모드 실행 프롬프트

아래 블록을 그대로 복사해 goal 모드에 붙여넣는다.
계획 원본은 [M39_TO_M40_48H_PLAN.md](M39_TO_M40_48H_PLAN.md).

---

## 목표

`C:\ProjectsSY\dragon-race` (저장소 `SoSyn2ne/skyknit-cup`, public)에서 M39를 main에 안착시키고,
CI와 GitHub Pages 배포를 갖춰 **실기기 플레이테스트가 가능한 상태까지** 만든다.
계획 원본은 `docs/M39_TO_M40_48H_PLAN.md`이며, 이 문서의 블록·완료 조건을 기준으로 삼는다.

## 프로젝트 사실 (검증 완료, 다시 조사하지 말 것)

- PR #1 `codex/m39-volcanic-archipelago` → `main`, 56커밋, main이 조상이라 충돌 없음.
- `.github` 폴더 없음. CI도 배포 파이프라인도 처음부터 만든다.
- Node engines `>=22.20 <23`. 스크립트: `lint`, `typecheck`, `test`(vitest run), `build`, `test:e2e`, `test:performance`, `test:production`.
- **vite.config 파일이 없다.** base가 `/` 기본값이라 Pages 하위 경로(`/skyknit-cup/`)에 그대로 올리면 에셋이 전부 깨진다. base 설정은 필수다.
- `public/` 에셋 21.1MB. 소스 106파일, TODO/FIXME 0건.
- M39까지 자동 검증은 전부 통과 상태. 남은 빚은 사람이 폰으로 해야 하는 확인뿐이다.

## 실행 순서

**블록 A — PR #1 머지**
머지 전에 사용자에게 확인을 받는다. 머지 후 `codex/m39-volcanic-archipelago` 브랜치는 삭제하지 않는다(문서가 참조함).
완료 조건: main HEAD가 `20735af`를 포함하고 열린 PR이 0개.

**블록 B — CI 워크플로**
`.github/workflows/ci.yml`을 만든다. main push와 모든 PR에서 `npm ci` → `lint` → `typecheck` → `test`. Node 22.x 고정.
E2E·성능·production·asset audit는 **CI에 올리지 않는다.** 브라우저·GPU 의존 게이트는 flaky 실패로 신뢰를 깎는다. 로컬 게이트로 유지한다.
완료 조건: main에서 CI 녹색.

**블록 C — GitHub Pages 배포**
`.github/workflows/deploy.yml`을 만든다. main push 시 `vite build --base=/skyknit-cup/` → Pages artifact 업로드 → 배포.
푸시 전에 로컬에서 `vite preview --base=/skyknit-cup/`로 하위 경로 로드를 먼저 확인한다. 여기서 GLB·오디오 경로가 깨지면 배포하지 말고 먼저 고친다.
Pages Source를 GitHub Actions로 설정한다(`gh api` 시도, 실패하면 사용자에게 웹에서 1회 설정을 요청).
**공개 배포 직전에 사용자 확인을 받는다.** public 저장소이므로 배포는 곧 공개다.
배포 후 실제 URL을 열어 콘솔 오류 없이 레이스 시작까지 도달하는지 확인하고, 첫 로딩 시간을 측정해 기록한다.
완료 조건: `https://sosyn2ne.github.io/skyknit-cup/`가 정상 동작.

**블록 D — 여기서 멈춘다**
실기기 플레이테스트는 자동화할 수 없다. 블록 C가 끝나면 **작업을 멈추고** 사용자에게 다음을 전달한다.
- 배포된 URL과 첫 로딩 실측값
- `docs/M39_VOLCANIC_ARCHIPELAGO_PLAYTEST_HANDOFF.md`의 15분 동선을 PC / Android / iPhone Safari에서 진행할 것
- 최우선 미검증 항목: 10분 이상 비행 시 발열·프레임 저하
- 결과를 `docs/M39_PLAYTEST_RESULT.md`에 기록할 것
플레이테스트 결과를 받기 전에는 블록 E(수정)·F(M40 범위 결정)로 넘어가지 않는다.

## 제약

- 새 게임 기능을 만들지 않는다. 이 작업의 범위는 머지·CI·배포뿐이다.
- 21MB 에셋 최적화를 시도하지 않는다. 실측만 기록하고 M40 판단 근거로 넘긴다.
- 머지·공개 배포·Pages 설정 변경은 각각 사용자 확인을 받고 진행한다.
- 각 블록이 끝날 때마다 무엇이 통과했고 무엇이 남았는지 한 줄로 보고한다.
- 게이트가 실패하면 우회하거나 비활성화하지 말고 멈춰서 실패 출력을 그대로 보고한다.

## 산출물

1. `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
2. base 경로가 설정된 빌드 구성
3. 동작하는 공개 URL과 첫 로딩 실측값
4. 사용자에게 넘기는 플레이테스트 착수 안내
