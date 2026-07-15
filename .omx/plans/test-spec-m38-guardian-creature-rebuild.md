# Test Spec: Milestone 38 수호수 아트 리빌드와 첫 하늘매듭 서막

> 상태: 구현 진행 중

## RED 1 — 새 카탈로그와 v10 이전

- 카탈로그 ID는 `sunrise-dragon`, `ember-phoenix`, `storm-white-tiger`이고 형태 3 × 팔레트 3 × 장식 3 = 27개다.
- 각 새 ID는 고유 GLB URL, 설명과 `dragon | avian | feline` 시각 포즈를 가진다.
- `isCharacterId('storm-griffin' | 'cloud-manta')`는 false다.
- `normalizeCharacterLoadout`은 구 ID를 각각 봉황·백호로 이전하고 유효한 팔레트·장식은 유지한다.
- 알 수 없는 ID만 기본 드래곤으로 복구된다.
- 완전한 v9 fixture 두 개는 구 종족만 교체하고 Top 10, 미션, 코인, 고스트, 탐험, BGM, 품질을 보존한 채 v10으로 다시 저장된다.
- v10 round-trip은 새 종족을 보존하고 v11 이상은 안전하게 거부한다.

## RED 2 — 캐릭터 시각 계약

- 세 ID는 고유 GLB source를 보고하고 필수 Rig 누락·로드 실패에는 현재 검증된 시각을 유지한다.
- `avian`은 긴 꼬리 흐름, 빠른 wing cadence와 작은 body bob을 사용한다.
- `feline`은 어깨에서 움직이는 큰 날개, 안정된 몸통과 네 다리 비행 자세를 사용한다.
- 물리 입력, 속도, 충돌 반경과 미션 상태에는 pose profile이 영향을 주지 않는다.
- 고글은 머리 소켓, 리본은 꼬리 소켓에 붙고 고스트는 현재 종족 실루엣에 동일한 반투명 재질만 적용한다.

## Blender/GLB 자산 게이트

- 세 종족은 `DragonRoot`, 좌우 WingRig, HeadRig, TailRig 1~5, JawRig, 양 EyeRig, 세 accessory socket을 가진다.
- 봉황은 22,000~28,000, 백호는 24,000~30,000 triangles, 14 meshes 이하, 18 primitives 이하, 정확히 세 역할 재질, gzip-9 600KiB 이하이다.
- 모든 render mesh는 vertex color, 유한 위치/normal/transform과 프로젝트 제작 메타데이터를 가진다.
- 봉황 메타데이터와 profile은 `beak`, `crown`, `three-layer-feather`, `talon`, `triple-plume`를 증명한다.
- 백호 메타데이터와 profile은 `feline-muzzle`, `rounded-ear`, `four-leg`, `stripe`, `shoulder-wing`을 증명한다.
- 새 종족의 최저 Z는 `-0.02..0.08`이고 같은 입력의 두 export SHA-256이 같다.
- 콘셉트와 Blender preview는 3층 깃털, 얼굴/몸 비율과 전체 실루엣을 유지한다.

## RED 3 — 공방 설명과 서막 dialog

- 형태 select가 바뀌면 해당 수호수 설명이 같은 dialog 안에서 즉시 갱신된다.
- 설명 변경은 preview만 호출하고 apply를 호출하지 않는다.
- ready와 paused에서 `서막 보기` 버튼을 제공하고 countdown/racing/finished에서는 숨긴다.
- 서막 dialog accessible name은 `첫 하늘매듭 서막`, 세 수호수 이름과 `비행의 메아리` 설명을 포함한다.
- open은 첫 동작 버튼에 포커스하고 Escape/닫기는 한 번 닫은 뒤 opener로 복귀한다.
- Tab/Shift+Tab은 dialog 안에 머물고 서막 open/close는 게임 상태·저장·elapsed를 바꾸지 않는다.
- 공방과 서막은 동시에 열리지 않는다.

## RED 4 — 세계관 문구

- 준비 화면은 끊어진 첫 매듭과 세 군도의 새벽을 한 줄로 설명한다.
- 기존 여섯 미션의 ID, unlock, grade threshold와 판정 조건은 동일하고 objective만 햇실 복원 단계로 바뀐다.
- 고스트가 없을 때 `메아리 없음`, 있을 때 접근 가능한 이름 `비행의 메아리와 기록 차이`를 사용한다.
- 세계관 문서는 하늘동전, 관문, 고스트, 세 지역과 세 수호수의 의미를 단일하게 정의한다.

## Playwright — 다섯 뷰포트

각 `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`에서:

1. ready에서 서막을 열고 전체 문구·포커스·Escape·opener 복귀와 phase 불변을 확인한다.
2. 공방에서 봉황·백호 설명과 GLB source가 형태 변경에 따라 바뀌는지 확인한다.
3. 구 v9 백호/봉황 fixture를 주입한 reload가 새 종족과 v10 저장을 만드는지 확인한다.
4. 새 종족·팔레트·장식을 적용하고 reload와 WebGL context recovery 뒤 유지되는지 확인한다.
5. pause에서 서막과 공방을 각각 열고 elapsed·미션 시도·관문 수가 멈춰 있는지 확인한다.
6. 모든 dialog/action이 viewport 안, 최소 44px, overflow 0이고 3D 전체 bounds가 control sheet 위에 있는지 확인한다.
7. race/mission ghost는 선택 종족 실루엣으로 보이고 console/page/network 오류가 0인지 확인한다.

## 전체 회귀와 완료

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: 실패·skip/only 추가 0
- 집중 M38 Playwright와 전체 `npm run test:e2e`: 실패 0
- `npm run test:production`: 다섯 뷰포트, nonblank/시간 변화 픽셀과 runtime 오류 0
- 새 종족별 30초 high/low 성능: desktop 55/50fps, mobile 30fps, high 120 draw calls 이내
- `npm audit --audit-level=high`, 전체 gzip-9 10MiB 이하, 새 GLB 600KiB 이하
- 콘셉트 시트·Blender preview·다섯 뷰포트 screenshot의 독립 `visual-verdict >= 90`
- 기존 M37 역사 보고서는 수정하지 않고 M38 보고서와 플레이테스트 인계를 새로 남긴다.
