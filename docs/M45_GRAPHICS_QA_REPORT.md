# M45 수호수·군도 그래픽 고도화

2026-09-07. 구현·시각·정적·완주·성능·production 검증 완료. 사람·실기기 미실시.

## 적용 결과

- 드래곤: 연속 곡면 몸통, 어깨 비늘, 손가락 뼈 사이의 볼륨 있는 날개막과 밝은 호박색 그라데이션. 기존 v07은 유지하고 `assets/source/dragon/skyknit-dragon-v08.blend`를 생성했다.
- 봉황: 가슴·관우·날개·꼬리에 깃털별 잿불→금빛 색과 가장자리 음영.
- 백호: 부드러운 피부 명암, 곡선 줄무늬·얼굴, 진주색→먹빛 깃털 층.
- 네 지역: 기존 지형 면에 지역별 석재 색과 층, 밝은 윗면·차가운 하부 음영. 착륙장·동전 경로·semantic origins는 그대로다.
- 레이스 배경: 청록 하늘과 국소적인 따뜻한 햇빛, 불규칙한 바위층·초록 윗면, 볼륨 있는 구름. 기존 9개 인스턴스 배치를 사용한다.

기존 M43/M44 변경은 보존했다. 6관문, 활성 미션 6개, 비행 물리·충돌·저장·고스트 규칙에는 변경이 없다. 작업 전 모델은 `artifacts/m45/baseline-assets`에 보관했다. 모든 모델은 기존 프로젝트 제작 Blender 원본을 수정한 것이며 외부 에셋·텍스처·의존성을 추가하지 않았다.

## 자산 검사

| 자산 | triangles | meshes / primitives | 재질 |
| --- | ---: | --- | ---: |
| 드래곤 | 19,012 | 12 / 18 | 3 |
| 봉황 | 25,748 | 14 / 14 | 3 |
| 백호 | 26,004 | 12 / 12 | 3 |
| 축제 high / low | 20,196 / 6,368 | primitives 11 | 기존 유지 |
| 협곡 high / low | 16,848 / 4,632 | primitives 10 | 기존 유지 |
| 유적 high / low | 15,724 / 4,988 | primitives 11 | 기존 유지 |
| 화산 high / low | 33,548 / 10,596 | primitives 11 | 기존 유지 |

기존 Blender inspector를 수정하지 않고 통과했다. 봉황·백호의 노드·피벗·소켓·경계, 네 지역 삼각형 좌표·semantic nodes는 기준선과 일치한다. 별도 코드 리뷰에서 GLB 11개의 위치·법선·색 유한값, 텍스처 미사용, 원본/내보내기 일치를 확인했다.

월드의 면별 색 때문에 내보낸 정점과 압축 용량은 늘었다. 전체 `dist` 23파일의 Node gzip-9 합계는 10,199,466 bytes(약 9.73MiB)로 10MiB 예산 안이다. 백호 raw GLB는 2,389,288→1,639,324 bytes로 줄었다.

## 검증

- 단위: 53파일, 631개 통과.
- typecheck, lint, build 통과. 기존 대형 JS 청크 경고는 유지된다.
- 개선 전 desktop/portrait 시각·canvas: 8개 통과.
- 파일 변경을 마친 뒤 통합 브라우저: 60개 통과. 5뷰포트의 3수호수 비행, 공방 미리보기, 4지역 진입, canvas nonblank/시간 변화, console/page/network, HUD 크기·타이머를 검사했다.
- 실제 입력 완주: desktop 키보드 61.933초, 가로 터치 61.650초. 0→6 순서·결과·재도전 정상, console/page/response 오류 0.
- production: 5뷰포트 5개 통과.
- 성능: 기존 `test:performance`의 두 테스트 모두 통과(7.2분). 12개 30초 프로필 모두 중앙값/최저 1초 60fps. 한 번의 최종 통합 측정 결과이며 실기기 GPU 성능을 의미하지 않는다.

| 성능 프로필 | desktop draw calls | mobile draw calls |
| --- | ---: | ---: |
| 첫 하늘매듭 | 63 | 39 |
| 축제 탐험 | 67 | 32 |
| 화산 탐험 | 45 | 27 |
| 화산 미션 | 64 | 40 |
| 봉황 | 58 | 37 |
| 백호 | 55 | 35 |

성능 원본: `artifacts/browser-qa/m45-performance/performance-30s.json`, `performance-characters-30s.json`. 이전 M44의 단일 버킷 변동은 이번 최종 측정에서 재현되지 않았다.

증거는 `artifacts/browser-qa/m45-before`, `artifacts/browser-qa/m45-after`, `artifacts/browser-qa/m45-playthrough`, `artifacts/world-m45/world-glb-report.json`, `artifacts/m45/creature-inspection.json`에 있다. 모델·배경의 기준선 대비 시각 판정은 92/90이며 `.omx/state/m45-graphics/ralph-progress.json`에 기록했다.

## 재생성

기존 Blender 4.5.10 LTS로 다음 생성기를 사용한다.

- 드래곤: `build_dragon_blockout.py -- --skip-renders` → v08 blend → `export_dragon_glb.py` → characters/skyknit-dragon.glb.
- 봉황·백호: `build_character_assets.py -- --asset <asset-id>` → `export_character_asset.py`.
- 네 지역: `build_world_art.py`, `build_volcanic_archipelago.py`.
- 검사: `inspect_dragon_glb.py`, `inspect_character_assets.py`, `inspect_world_glb.py -- --scope m45`.

커밋·푸시·배포와 사람·실기기 검증은 수행하지 않았다. 브라우저 검증은 Chromium 자동화와 소프트웨어 WebGL 환경이다. 세로 준비 화면의 기존 큰 메뉴 배치는 이번 모델·배경 작업 범위 밖이며 비행/공방 프레이밍과 구분한다.
