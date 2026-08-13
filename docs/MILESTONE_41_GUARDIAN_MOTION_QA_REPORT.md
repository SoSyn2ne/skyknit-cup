# Milestone 41 수호수 3D 모션 QA 기록

> 상태: **자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 측정일: 2026-08-10 · 브랜치: `codex/m41-guardian-motion`

## 구현 범위

- 공통 Rig 위에서만 동작하는 순수 포즈 상태에 활공·순항·상승·하강·돌풍 상태를 추가했다.
- 어깨 선행 뱅크 뒤 몸통·머리·꼬리가 따라오며, 봉황은 빠르고 넓게, 백호는 느리고 무겁게, 드래곤은 중간 리듬으로 움직인다.
- 부스트 시작에는 한 번만 발생하는 강한 하강 날갯짓과 접힘을 적용했다.
- 비행 물리, 카메라 목표, 관문, 충돌, 미션, 기록, 저장 및 외부 자산·의존성은 바꾸지 않았다.

## 첫 화산 프레임 회귀 보정

- `heart-of-sun` 선택 시 새 코스의 시작 지점으로 `flightState`를 먼저 바꾼 뒤 스트리밍을 동기화한다. 따라서 이전 축제 시작점에서 시작되던 불필요한 festival GLB 요청이 사라진다.
- 용암 파도는 ready/countdown에서 한 번만 투명 draw로 40개 high 인스턴스 행렬을 올린다. 다음 프레임부터 정상 불투명도로 복귀하며, 위험 프레임·충돌·물리·타이밍은 바꾸지 않는다.
- 지역 스트리밍 컨테이너는 GLB 해석 완료 전에 등록되므로, 늦은 GLB 응답에도 카운트다운 예열은 유지된다. 이를 응답 지연 E2E로 고정했다.

## 회귀 테스트와 시각 증거

- `preloads Heart of Sun from its volcanic start without a festival request`는 미션 선택 뒤 festival GLB 요청이 없는지 검사한다.
- `keeps the lava-wave draw primed when Heart of Sun GLB finishes after countdown`는 volcanic GLB 응답을 카운트다운 뒤까지 보류한 뒤에도 용암 파도 draw가 예열됐는지 검사한다.
- `primes the first lava-wave draw invisibly before active gameplay`는 투명 예열 뒤 실제 텔레그래프 프레임이 정상 opacity/count로 복귀하는지 검사한다.
- 실제 비행 스크린샷은 `artifacts/browser-qa/m41-guardian-motion/` 아래의 `sunrise-dragon-flight.png`, `ember-phoenix-flight.png`, `storm-white-tiger-flight.png`에 저장했다. 각 장면은 수호수·다음 금빛 관문·두 바람실을 동시에 보인다.

## 자동 및 브라우저 검증

| 항목 | 결과 |
| --- | --- |
| 전체 단위 테스트 | 53 files / 616 passed |
| typecheck / lint / build | 통과 |
| 전체 E2E | 184 passed, 206 조건부 skipped (13.4분) |
| production E2E | 5 passed — 필수 5개 뷰포트 |
| 실제 브라우저 화면 | 수호수 3종의 실제 레이스 진입 후 스크린샷, 관문·두 바람실 가독성 확인 |
| 캔버스 | 1440×900 nonblank, 시간 변화 hash 확인; 전체 E2E에서 키보드·터치와 5개 뷰포트 검증 |
| 전송량 | JS gzip 215.24KiB, CSS gzip 6.55KiB — 전체 10MiB 예산 이내 |

기준 원본 이미지가 제공되지 않아 visual-verdict 점수 비교는 수행하지 않았다. 대신 실제 브라우저 스크린샷과 WebGL 픽셀·시간 변화 검사를 사용했다.

## 성능 결과

`npm run test:performance`는 2개 성능 테스트를 통과했다. 아래 값은 30초 샘플의 중앙값/최저 1초 버킷이다.

| 프로필 | FPS | Draw calls | Triangles |
| --- | ---: | ---: | ---: |
| desktop/high | 60 / 60 | 62 | 68,640 |
| mobile/low | 60 / 60 | 37 | 37,740 |
| 화산 desktop/high 미션 | 60 / 56 | 62 | 86,604 |
| 화산 mobile/low 미션 | 60 / 60 | 40 | 40,984 |
| 잿불 봉황 desktop/high | 60 / 60 | 57 | 84,120 |
| 폭풍 백호 desktop/high | 60 / 60 | 53 | 84,928 |

모든 값이 desktop 55fps 중앙값·50fps 최저, mobile 30fps, high 120 draw-call 예산 안에 있다.

## 10분 soak

`M39_SOAK=1` 실행은 실제 611,068ms(10.18분), 총 732,590ms 동안 60회 측정 사이클을 통과했다. 지역 왕복 120회, 미션 실행 120회, 재시도·일시정지 재개·수호수 교체 각 60회, high/low LOD 로드 각 30회를 수행했다. 콘솔·페이지·요청 오류는 모두 0건이며, 최종 resident geometry 72개와 rendered resident geometry 72개가 일치하고 7,396개 교체 geometry가 해제됐다.

## 단순화와 남은 위험

- 포즈와 예열은 기존 공통 Rig·VFX 풀·렌더 루프만 사용했으며 새 에셋, 의존성, 후처리, 저장 형식 또는 게임 규칙을 추가하지 않았다.
- 카메라 흔들림·FOV 연출을 추가하지 않아 reduced-motion과 관문 가독성 계약을 유지했다.
- 자동 검증의 남은 실패는 없다. 실제 휴대기기 GPU와 사람 플레이테스트에서 종족별 리듬·체감 조작을 확인하는 일만 남았다.
