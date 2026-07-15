# Milestone 37 비행 생명체 작업실 자동 QA 기록

> 상태: **RC11 / 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 검증일: 2026-07-15
>
> 브랜치: `codex/m37-character-workshop`

## 결론

하늘매듭배의 플레이어 외형을 단일 드래곤에서 `해뜰녘 드래곤`, `폭풍 그리핀`, `구름 하늘가오리`로 확장했다. 세 팔레트와 세 장식을 독립적으로 조합할 수 있어 총 27개 조합을 만들며, 준비 화면과 `Esc` 일시정지에서 실제 3D 장면을 보면서 초안을 바꿀 수 있다.

외형은 비행 물리, 충돌 반경, 코스, 미션, 동전과 기록 경쟁에 영향을 주지 않는다. `적용`한 선택만 v9 저장에 남고 취소는 원래 외형으로 되돌아간다. v1~v8 저장, WebGL context recovery, 빠른 선택 전환과 GLB 실패 fallback도 기존 진행을 잃지 않고 통과했다.

## 최종 자동 게이트

| 게이트 | 결과 |
| --- | --- |
| 단위 테스트 | 45 files, 511 tests passed |
| 타입 검사 | `npm run typecheck` passed |
| 린트 | `npm run lint` passed |
| 빌드 | passed; JS 765.13kB raw / 201.90kB gzip, CSS 36.16kB raw / 5.96kB gzip |
| 전체 E2E | 340 total: 171 passed, 169 device/feature-specific skips, 0 failed |
| 공방 5뷰포트 E2E | 상태 흐름 10/10 passed + 경합 회귀 1 passed, 4 intentional project skips, 0 failed |
| 프로덕션 5뷰포트 | 5 passed, console/page/network 오류 0 |
| 30초 성능 | 기본 4개 프로필과 그리핀·가오리 4개 프로필 모두 예산 통과 |
| Blender 검사 | 캐릭터 3개와 장식 2개 모두 `errors: []`, 결정적 재-export 일치 |
| 독립 시각 판정 | 94/100 pass |
| 보안 감사 | `npm audit --audit-level=high`: 0 vulnerabilities |
| 배포 크기 | 19 files, 14,567,067 raw bytes / 7,066,544 gzip-9 bytes (6.739MiB) |
| 프로덕션 QA 훅 | 배포 출력 문자열 0건 |

빌드의 500kB raw JavaScript 경고는 남지만 gzip JavaScript는 201.90kB이고, 전체 전송·FPS·draw-call 예산을 모두 통과했다.

## 캐릭터와 장식 자산

| 자산 | triangles | render meshes | primitives | gzip-9 | SHA-256 앞 12자 |
| --- | ---: | ---: | ---: | ---: | --- |
| 해뜰녘 드래곤 | 19,628 | 12 | 18 | 377,946 B | `f98a9a82927e` |
| 폭풍 그리핀 | 18,188 | 12 | 12 | 184,659 B | `1726557d3c5b` |
| 구름 하늘가오리 | 18,112 | 12 | 12 | 190,274 B | `9c44c9388d23` |
| 바람 고글 | 2,132 | 2 | 2 | 18,022 B | `10cf8bb08a29` |
| 축제 리본 | 2,280 | 2 | 2 | 24,037 B | `d7e6f5d6fc24` |

- 모든 자산은 Blender 4.5.10 LTS로 프로젝트 안에서 생성했고 `project-authored` 라이선스 메타데이터를 가진다.
- 세 캐릭터는 공통 날개·머리·꼬리 Rig, 유한 transform/normal, 12개 vertex-color render mesh와 세 역할 재질을 가진다.
- 그리핀은 부리·깃털·사자형 뒷다리, 가오리는 납작한 원반·넓은 지느러미·채찍 꼬리로 실루엣이 구분된다.
- 14 meshes와 18 primitives는 목표 개수가 아니라 상한이다. 그리핀과 가오리는 시각 형태를 유지하면서 12 primitives로 병합해 draw call을 줄였다.
- 최종 파일과 같은 입력의 두 번째 export SHA-256이 다섯 자산 모두 일치했다.

검사 원본은 `artifacts/m37-character-assets/inspection-final.json`과 `inspection-repeat-final.json`에 있다.

## 공방과 저장 계약

- ready와 paused에서만 `캐릭터 꾸미기`가 보이며 비행 중에는 열리지 않는다.
- 공방은 `캐릭터 꾸미기`라는 별도 `aria-modal`이며 `캐릭터 형태`, `색상`, `장식` native select와 44px 이상 동작을 제공한다.
- 변경은 초안 3D 미리보기만 갱신한다. `돌아가기`와 공방 내부 `Esc`는 저장하지 않고 적용된 외형을 복원한다.
- `적용`은 정규화된 loadout을 v9에 저장하고 새로고침과 WebGL context recovery 뒤에도 유지한다.
- Tab/Shift+Tab은 공방 안에 머물고 닫으면 준비 또는 일시정지의 원래 버튼으로 포커스가 돌아간다.
- 일시정지 중 미리보기는 elapsed, 관문, 미션 시도와 기록을 바꾸지 않는다.
- 손상된 각 ID는 해당 축만 기본값으로 고치고 다른 유효한 선택과 기존 기록은 보존한다.
- 미래 버전, storage 읽기/쓰기 실패와 모델 로드 실패는 게임을 막지 않고 안전한 기본값/간소화 모델로 복구한다.

## 시각·반응형 결과

필수 뷰포트는 `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`이다. 모든 화면에서 dialog와 적용 동작이 viewport 안에 있고 문서 overflow가 0이며, 캔버스는 비어 있지 않고 시간에 따라 변했다.

세로 화면은 공방을 bottom sheet로 두고 캐릭터 전용 미리보기 카메라를 사용한다. 최소 `320x568`에서는 드래곤·그리핀·가오리의 투영된 전체 경계가 날갯짓 중에도 sheet 위 12px 이상을 유지한다. 일반 레이스와 탐험 카메라는 변경하지 않았다.

`visual-verdict` 최종 결과는 94/100 pass다. 근거 상태는 `.omx/state/m37-character-workshop/ralph-progress.json`, 스크린샷은 `artifacts/browser-qa/m37-character-workshop/`에 있다.

## 최종 30초 성능

| 프로필 | median/min fps | draw calls | triangles | fixed steps |
| --- | ---: | ---: | ---: | ---: |
| 기본 레이스 desktop/high | 60/60 | 61 | 67,616 | 1,802 |
| 기본 레이스 mobile/low | 60/60 | 37 | 37,740 | 1,803 |
| 기본 탐험 desktop/high | 60/60 | 67 | 89,964 | 1,803 |
| 기본 탐험 mobile/low | 60/60 | 32 | 37,780 | 1,803 |
| 그리핀+고글 desktop/high | 60/60 | 54 | 70,024 | 1,802 |
| 그리핀+고글 mobile/low | 60/60 | 33 | 38,432 | 1,803 |
| 가오리+리본 desktop/high | 60/60 | 54 | 70,168 | 1,802 |
| 가오리+리본 mobile/low | 60/60 | 32 | 37,480 | 1,802 |

desktop/high 중앙값 55fps·하한 50fps, mobile/low 중앙값 30fps와 high 120 draw-call 예산을 모두 통과했다. 원본 측정은 `artifacts/browser-qa/m33/performance-30s.json`과 `performance-characters-30s.json`에 있다.

## 변경 영역과 단순화

- 닫힌 ID 카탈로그와 순수 정규화 함수 하나가 UI, 저장, 런타임의 외형 계약을 공유한다.
- 새 루트가 완전히 준비된 뒤에만 장면에 교체하고 이전 geometry/material/texture를 한 번 해제한다. 늦게 끝난 요청은 현재 선택을 덮지 않는다.
- 초기 기본 모델의 늦은 실패 안내도 같은 요청 generation으로 막아, 이미 성공한 새 미리보기 위에 오래된 fallback 상태가 나타나지 않는다.
- 기존 `createDragon` 경계를 공통 비행 생명체 로더로 확장하되 이름과 비행 API를 유지해 물리·코스 변경을 피했다.
- 팔레트는 project-authored vertex color를 보존하면서 역할 재질에 곱해 입체 음영을 유지한다.
- 새 라이브러리, Unity, 백엔드, 계정, 유료·랜덤 외형을 추가하지 않았다.

## 독립 검토

- 코드 리뷰는 초기 모델 실패와 새 미리보기 사이의 안내문 경합 1건을 발견했다. Playwright RED로 재현한 뒤 동일 generation guard에 묶었고 회귀 테스트를 통과했다.
- 수정 후 코드 재검토는 blocking/high/medium 잔여 0건, TypeScript 진단 0건으로 `APPROVE`했다.
- 독립 완료 검증은 저장·자산·시각·성능·프로덕션 증거를 다시 대조해 `PASS`했다.
- 자동화로 대체할 수 없는 실기기·사람 체감만 아래 인계 항목으로 남겼다.

## 사람만 확인할 수 있는 남은 항목

- 실제 iOS/Android에서 가로·세로 공방, safe area, 터치 피로와 GPU 발열 확인
- 세 종족을 번갈아 10~15분 비행하며 장식 흔들림, 실루엣 선호와 멀미 여부 판단
- 키보드와 화면 읽기 도구로 공방의 말투, 선택 순서와 포커스 이동 체감 확인
- 다음 수직 슬라이스에서 네 번째 종족, 세부 파츠와 이름 짓기 중 무엇을 우선할지 사람 플레이 결과로 결정

> **RC11 / 비행 생명체 작업실 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
