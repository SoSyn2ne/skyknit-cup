# RC4 소형 오픈월드 테스트 명세

## Unit: exploration flight

- brake false에서 순항 18에 수렴하고 brake true에서 0으로 감속
- boost 잔량이 있을 때 30에 수렴하고 기존 부스트 소비/회복 계약 유지
- 정지 후 brake 해제 시 순항 재개
- yaw/pitch와 고정 60Hz 결정성
- pause `dt=0`에서 동일 객체/상태 반환
- 유효/무효 착륙 요청, 0.9초 landing, landed 정지, 재이륙

## Unit: regions and streaming

- 시작 위치는 festival-hub만 선택
- 420 경계 안 로드, 420~500 기존 로드 유지, 500 밖 언로드
- 미지 region id 무시
- 140 이내 발견, 중복 발견 없음
- 목적지 bearing/distance와 현재 지역 선택

## Unit: persistence v4

- v3 설정/등급을 v4로 마이그레이션
- 탐험 위치/heading/발견/목적지 round trip
- NaN/Infinity/과도한 좌표와 알 수 없는 region id 기본값 복구
- storage read/write 실패가 게임을 막지 않음

## Integration

- race mode는 기존 자동 전진과 3초 countdown 유지
- explore start는 race timer/checkpoint를 진행하지 않음
- 비콘 밖 challenge 거부, 안에서 선택 미션 countdown 시작
- context recovery가 mode, 탐험 위치, 발견, 목적지와 레이스 진행을 보존
- blur/hidden은 탐험 이동과 landing 진행을 정지

## Browser: 5 viewports

- 탐험 시작, 감속/호버, 지도 열기, 목적지 선택
- 각 지역 강제 이동 QA 경로에서 이름/발견/로드 지역 검증
- 착륙/재이륙과 레이스 도전
- keyboard/touch 각각 완결 흐름
- 44x44, safe-area, no scroll/overlap, accessible names
- canvas nonblank/hash change, console/page/unhandled/network 0

## Performance and production

- desktop/high median 55, minimum 50
- mobile/low median 30
- high draw calls 120 이하, gzip 10MiB 미만
- production에서 QA teleport/hook 제거
