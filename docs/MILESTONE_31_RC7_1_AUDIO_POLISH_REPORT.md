# Milestone 31 RC7.1 비행 오디오 감각 보정 보고서

> 상태: **자동 검증 완료 / 실기기·사람 청취 테스트 대기**
>
> 완료일: 2026-07-14

## 플레이어 결과

- 실제 재생 곡은 사용자 제공 `Sovereign of the Sunrise Skies` 루프 마스터다.
- 자동재생은 하지 않으며 `비행 시작` 또는 `하늘 탐험` 동작에서 재생을 시작한다.
- 첫 시작 뒤에는 레이스, 탐험, 미션 선택을 오가도 재생 위치를 유지한다.
- 탭 숨김, 음소거, 0% 볼륨, 그래픽 오류와 dispose에서는 안전하게 멈춘다.
- 날갯짓은 렌더된 날개가 하강 스트로크로 넘어갈 때 한 번만 짧은 필터드 에어 펄스를 낸다.
- 돌풍 부스트는 기존 `180Hz / 0.22초 sawtooth` 단음을 제거하고 `0.78초` 동안 `2.1kHz -> 260Hz`로 내려오는 필터드 노이즈 `슈우웅`으로 교체했다.

## 구현 경계

- BGM은 스트리밍 `HTMLAudioElement`를 유지해 곡 전체를 메모리 디코딩하지 않는다.
- 날갯짓과 돌풍은 AudioContext당 한 번 생성한 2초 노이즈 버퍼를 공유한다.
- 날갯짓 이벤트는 60Hz 고정 스텝의 실제 `DragonPoseState` 부호 전환을 사용한다.
- 준비, 일시정지, 완주, 착륙과 음소거 중에는 새 날갯짓 큐를 만들지 않는다.
- 키보드와 터치 시작은 엄격한 브라우저 자동재생 정책을 위해 원래 사용자 이벤트 안에서 음악을 활성화하고 unlock한다.

## 자동 검증

- unit: 33 files / 321 tests
- typecheck: 통과
- lint: 통과
- build: 통과
- audio E2E: 6 active passed / 9 intentional skips / 0 failed
- recovery E2E: 4 passed / 0 failed
- 코드 리뷰: 남은 이슈 0 / 승인
- 30초 성능:
  - race desktop/high: median 60fps / minimum bucket 60fps / 62 draw calls
  - race mobile/low: median 60fps / minimum bucket 60fps / 36 draw calls
  - explore desktop/high: median 60fps / minimum bucket 60fps / 65 draw calls
  - explore mobile/low: median 60fps / minimum bucket 60fps / 40 draw calls

## 남은 위험

- 자동 테스트는 실제 스피커의 음량, 저역 재생과 사람의 음색 선호를 판정할 수 없다.
- 실기기에서 BGM 대비 날갯짓과 돌풍 음량을 듣고 필요하면 gain 값만 좁게 조정한다.
