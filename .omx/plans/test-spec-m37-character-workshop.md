# Test Spec: Milestone 37 비행 생명체 작업실

> 상태: 자동 검증 완료 / 실기기·사람 플레이테스트 대기

## RED 1 — 카탈로그와 v9 저장

- 기본 loadout은 `sunrise-dragon / sunrise / none`이다.
- 카탈로그는 형태 3, 팔레트 3, 장식 3개와 정확히 27개 유효 조합을 제공한다.
- 각 ID의 독립 손상은 해당 축 기본값으로 복구되고 다른 유효 축은 유지된다.
- v8 전체 fixture는 등급, Top 10, 고스트, 동전, 탐험, BGM과 품질을 보존한 채 v9 기본 loadout을 받는다.
- v9 round-trip은 loadout을 보존하고 v10 이상·읽기/쓰기 실패는 기존 안전 계약을 따른다.

## RED 2 — 영구 상태와 복구

- `SET_CHARACTER_LOADOUT`은 ready/paused에서만 적용되고 countdown/racing/finished에서는 상태를 바꾸지 않는다.
- 적용은 기존 기록·미션·탐험·설정을 동일 참조 값으로 보존하고 loadout 객체만 안전하게 교체한다.
- WebGL recovery 복제는 loadout 값을 보존하되 객체 참조를 분리한다.

## RED 3 — 캐릭터 시각 계약

- 각 character ID는 고유 GLB URL을 가지며 공통 pose/Rig 애니메이션 계약을 사용한다.
- 로더는 공통 필수 Rig를 검사하고 역할별 cloned material에만 팔레트를 적용한다.
- 기본 드래곤, 그리핀, 하늘가오리의 debug snapshot은 서로 다른 character ID와 GLB source를 보고한다.
- 고글은 머리 소켓, 리본은 꼬리 소켓에 붙으며 `none`은 장식 mesh가 0개다.
- 최신 load request만 swap되고 실패/오래된 요청은 현재 비주얼을 유지한다.
- 성공 swap은 새 root를 먼저 장면에 넣고 효과 root를 보존한 뒤 이전 자원만 한 번 dispose한다.
- 고스트 데이터 스키마는 바뀌지 않고 현재 종족 실루엣에 ghost material만 적용된다.

## Blender/GLB 자산 게이트

- 캐릭터 3종 모두 필수 9개 피벗, 유한 transform/normal, vertex color와 프로젝트 제작 라이선스를 가진다.
- 각 캐릭터는 18,000~20,500 triangles, 14 meshes 이하, 18 primitives 이하, 3 materials 이하, gzip-9 450KiB 이하이다.
- inspector bounds/profile과 5뷰포트 스크린샷에서 세 실루엣이 구분되며 그리핀은 부리·깃털, 가오리는 납작한 몸·지느러미·채찍 꼬리를 가진다.
- 고글·리본은 각각 3,000 triangles 이하, 2 primitives 이하, gzip-9 100KiB 이하이며 유한 transform/normal을 가진다.
- 같은 입력을 두 번 export한 SHA-256이 동일하다.

## RED 4 — CharacterWorkshop DOM

- ready와 paused에서 `캐릭터 꾸미기` 버튼을 제공하고 다른 단계에서는 숨긴다.
- dialog accessible name은 사용자 동작명과 같은 `캐릭터 꾸미기`, 세 native select label은 `캐릭터 형태`, `색상`, `장식`이다.
- open은 현재 적용값으로 초안을 만들고 첫 select에 포커스한다.
- select 변경은 preview callback만 호출하고 apply callback은 호출하지 않는다.
- `돌아가기`와 dialog 내부 Escape는 cancel을 한 번 호출하고 propagation을 막는다.
- `적용`은 현재 초안을 한 번 전달한다.
- Tab/Shift+Tab은 dialog 안에 머물고 close는 opener에 포커스를 복구한다.

## Playwright — 다섯 뷰포트

각 `desktop 1440x900`, `desktop-compact 1280x720`, `touch-landscape 844x390`, `touch-portrait 390x844`, `touch-minimum 320x568`에서:

1. ready 공방을 열고 race phase가 유지되는지 확인한다.
2. 그리핀·달빛·고글 초안이 debug snapshot과 스크린샷을 바꾸되 localStorage는 바꾸지 않는지 확인한다.
3. 돌아가기와 Escape가 현재 적용된 외형을 복구하는지 확인한다. 새 저장에서는 이것이 기본 드래곤이다.
4. 가오리·폭풍·리본을 적용하고 v9 localStorage, reload와 context recovery 뒤 유지되는지 확인한다.
5. pause에서 열어 초안·취소하고 elapsed, 관문, 미션 시도와 포커스가 유지되는지 확인한다.
6. dialog와 모든 control/action이 viewport 안, 최소 44px, document overflow 0이며 Apply/Back이 보이는지 확인한다.
7. 별도 프로덕션 5뷰포트 스위트에서 console/page/unhandled/network 오류가 0이고 nonblank/시간 변화 픽셀이 유지되는지 확인한다.

## 전체 회귀와 완료

- `npm test`: 전체 통과, skip/only 추가 없음
- `npm run typecheck`, `npm run lint`, `npm run build`: 통과
- 집중 공방 Playwright와 전체 `npm run test:e2e`: 실패 0
- `npm run test:production`: 다섯 프로덕션 뷰포트와 console/page/network 오류 0 통과
- `npm audit --audit-level=high`, 배포 QA 훅 문자열 검사와 gzip-9 전송 예산 통과
- 캐릭터별 30초 high/low 성능: desktop 55/50fps, mobile 30fps, high 120 draw calls 이내
- 전체 gzip-9 10MiB 이하
- 다섯 뷰포트 screenshot 묶음의 독립 종합 `visual-verdict >= 90`
- 비행·코스·미션 평가 파일은 변경하지 않거나 변경 시 회귀 근거를 별도 기록
