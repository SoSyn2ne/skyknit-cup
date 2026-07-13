# Milestone 27 RC7 탐험 BGM 보고서

> 상태: **자동 오디오 게이트 통과 / 헤드폰 반복 청취·Safari 폴백 확인 대기**
>
> 검증일: 2026-07-14

## 결론

사용자가 제공한 `Sovereign of the Sunrise Skies.m4a` 원본을 변경하지 않고 보존하면서, 4초 equal-power tail/head crossfade로 탐험 전용 순환 마스터를 재현 가능하게 만들었다. Chromium은 Ogg Vorbis를 우선 스트리밍하고 지원하지 않는 브라우저는 AAC/M4A를 선택한다. 레이스, 탭 숨김, WebGL 오류 화면에서는 음악이 멈추며 탐험과 복구로 돌아오면 기존 위치에서 이어진다.

## 재생 계약

- 준비 화면의 첫 사용자 동작 전에는 오디오 컨텍스트, 미디어 요소와 재생 시도를 만들지 않는다.
- 탐험, 지도, 착륙, 지역 이동과 하늘동전 기록 도전 중에는 한 곡을 계속 재생한다.
- 레이스 전환, 숨겨진 탭, WebGL 복구 화면과 dispose에서는 즉시 pause한다.
- 탭 복귀와 WebGL 재시도는 이전 재생 위치를 보존한다.
- 기존 음소거는 SFX와 BGM을 함께 제어하는 마스터 스위치다.
- `musicVolume`은 BGM에만 적용하며 기본값은 35%, 저장 범위는 0~100%다.
- 거부된 자동재생과 늦게 완료된 `play()` Promise는 게임을 중단하거나 더 최신 재생을 다시 멈추지 않는다.

## 원본과 생성 자산

| 파일 | codec | duration | bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| source M4A | AAC stereo 48kHz | 112.469333s | 1,433,660 | `be57b9dad42a425b98f9d0f0bdb27bef5cecc55d2f391ff533c199beabb42a1b` |
| loop Ogg | Vorbis stereo 48kHz | 108.469333s | 2,043,970 | `0cbe75cc1a785fe4a9c39e6c88f2b314d2a911e5c1f692591d67897a2c3468f7` |
| loop M4A | AAC stereo 48kHz | 108.469000s | 2,207,091 | `fd8ad12a8a34aed2c4a6aaf16161de5f8271a9c0d198f5e52264ffaf027d79e5` |

`node tools/audio/build-bgm.mjs`를 격리된 임시 출력에서 두 번 실행했으며 같은 FFmpeg 환경에서 두 결과와 저장소 파일의 해시가 모두 일치했다. 루프는 원본 tail에서 head로 전환한 뒤 변경하지 않은 middle 구간을 이어, 파일 끝과 다음 파일 시작이 같은 원본 위치에서 만난다.

## 자동 검증

```text
npm test                              # 33 files, 317 tests passed
audio/state focused                   # passed
audio E2E desktop + 320x568           # 3 passed, 1 intentional skip
audio + recovery independent E2E      # 6 passed, 4 device-specific skips
WebGL recovery-position E2E           # passed
production desktop + 320x568          # 2 passed, clean console/network
npm run typecheck                     # passed
npm run lint                          # passed
npm run build                         # passed
git diff --check                      # passed
```

프로덕션 서버에서 Ogg는 HTTP 200 / `audio/ogg`, M4A는 HTTP 200 / `audio/mp4`로 전달됐다. 숨김 탭, 복귀, 지도, 지역 이동, 동전 도전, 레이스 전환과 WebGL 복구를 실제 Chromium에서 확인했다.

## 모바일 UI 수정

첫 320x568 검사에서 동전 기록이 BGM 컨트롤 아래에 겹치는 문제가 발견됐다. 420px 이하에서는 지역·음악·지도와 동전 기록·일시정지를 두 행으로 분리했다.

- 지역, 오디오 컨트롤과 동전 HUD 사이 겹침 0
- mute 44x44, volume 68x44, map 44x48
- 가로 overflow 0
- 키보드 방향키로 35→40%, Space로 mute 전환
- 터치 슬라이더로 35→90%, 터치 mute 전환
- 증거: `artifacts/browser-qa/rc7/audio-touch-minimum.png`

## 성능

BGM을 실제 재생한 30초 탐험 측정에서 desktop/high와 mobile/low 모두 중앙값과 최저 bucket 60fps를 유지했다. HTML media streaming을 사용해 약 41MiB의 전체 PCM을 Web Audio 메모리에 디코딩하지 않는다.

## 변경 파일과 단순화

- `tools/audio/build-bgm.mjs`: 별도 npm 의존성 없이 설치된 FFmpeg로 두 배포 형식을 만든다.
- `src/game/audio/GameAudio.ts`: SFX와 스트리밍 BGM 수명주기를 한 경계에서 관리한다.
- `src/game/persistence/records.ts`: 저장 스키마 v6과 이전 버전의 안전한 기본 볼륨 마이그레이션을 담당한다.
- `src/game/ui/RaceHud.ts`, `src/game/ui/ExplorationHud.ts`: 같은 mute/volume 계약을 레이스 준비와 탐험에 노출한다.
- `src/game/createRenderer.ts`: 게임 모드, 페이지 가시성, WebGL 복구와 오디오를 연결한다.
- 새 런타임 의존성, 오디오 라이브러리, 서버와 대용량 PCM 버퍼를 추가하지 않았다.

## 남은 위험

- 헤드폰과 스피커로 여러 루프 경계를 직접 들어 음악적 이음새와 SFX 대비 음량을 판단해야 한다.
- AAC 폴백은 선택 단위 테스트와 프로덕션 MIME은 통과했지만 Safari 실재생은 아직 확인하지 않았다.
- 음원의 법적 소유는 프로젝트 소유자가 직접 제공했다는 출처 기록을 근거로 하며 별도 법무 감사는 하지 않았다.
- 기존 JavaScript raw 500kB 경고는 남지만 gzip과 프레임 예산에는 영향을 주지 않았다.
