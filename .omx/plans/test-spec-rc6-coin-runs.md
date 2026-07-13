# RC6 하늘동전 기록 도전 테스트 명세

## 데이터 계약

- `COIN_COURSES`는 세 지역을 정확히 한 번씩 포함한다.
- 각 코스는 index 0~9의 고유 동전 10개와 유한 좌표, 양수 반경을 가진다.
- 코스 좌표는 해당 지역 중심 140 units 안에 있고 착륙장 중심과 겹치지 않는다.

## 순수 규칙

- idle에서 1번 동전을 선분으로 통과하면 running, 수집 수 1, 시간 0ms가 된다.
- 현재 순서가 아닌 동전은 상태를 바꾸지 않는다.
- 한 프레임에 동전을 관통해도 이전/현재 위치 선분으로 수집한다.
- running에서 양수 `dtMs`만 시간을 늘리고 pause equivalent인 0/손상 dt는 무시한다.
- 10번 획득 시 completed, 수집 수 10, final time 고정 상태가 된다.
- completed 3초 후 idle로 돌아가며 최고 기록은 규칙 상태와 분리된다.
- 진행 지역에서 500 units 밖이면 idle로 취소된다.

## 저장 v5

- 세 지역의 양수 유한 최고 기록만 round-trip한다.
- v4는 기존 필드 보존 + 빈 동전 기록으로 v5에 마이그레이션한다.
- v1~v3 마이그레이션도 최종 v5 문서를 쓴다.
- 알 수 없는 지역, 0/음수/NaN/무한 기록은 제거한다.
- 더 느린 완주는 기존 기록을 덮지 않는다.

## 런타임/E2E

- QA 훅으로 각 지역 10개를 순서대로 획득해 HUD `10/10`과 완료 시간을 확인한다.
- 세 지역 기록이 서로 독립적이고 reload 후 유지된다.
- map/pause/landing 중 시간이 고정된다.
- 레이스 모드에서 동전 인스턴스와 HUD가 보이지 않는다.
- 모든 필수 뷰포트에서 HUD, 지도, 상황 버튼, 터치 조작이 겹치지 않는다.
- console, pageerror, unhandled rejection, failed network는 0이다.

## 성능/시각

- 동전은 한 `InstancedMesh`, 최대 1 draw call과 공유 geometry/material을 사용한다.
- desktop/high 중앙값 55fps·최저 50fps, mobile/low 중앙값 30fps를 유지한다.
- 활성 high 장면 120 draw calls 이하, 전체 gzip 10MiB 미만이다.
- 세 지역 스크린샷과 5뷰포트 수집 HUD가 visual-verdict 90점 이상이다.
