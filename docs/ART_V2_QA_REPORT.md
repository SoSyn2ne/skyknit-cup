# Art V2 실제 모델·비교 프리뷰 검증

2026-10-08. 드래곤·첫 부유섬의 독립 제작 시안. 본 게임 자산 교체, M46 완료, 실기기/사람 검증 또는 생성 참고 이미지와 동등한 품질을 뜻하지 않는다.

## 실제 산출물

| 모델 | 삼각형 | primitives | 재질 | GLB bytes | gzip bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 드래곤 | 59,520 | 16 | 2 | 1,801,832 | 1,033,296 |
| 부유섬 | 58,308 | 15 | 2 | 4,854,884 | 965,292 |

- Blender 4.5.10 LTS. 원본: `assets/source/art-v2/dragon-v2.blend`, `hub-v2.blend`.
- 실제 GLB: `artifacts/art-v2/dragon-v2.glb`, `hub-v2.glb`. 실제 Blender 렌더: dragon-full/face/wing, hub-overview/detail PNG 5장.
- 두 모델 모두 실제 GLB 재임포트 후 유한 좌표/노멀 검사, 퇴화 삼각형 0, budget 검사 통과. 드래곤 리그 16개의 위치·부모를 확인했다. 부유섬 Keeper/Windmill/AdventureRoot 좌표 유지, 중심14m·정원10m 표면 ray 각각48/48.
- 원본 보고서는 `artifacts/art-v2/dragon-report.json`, `hub-report.json`. 재현 명령은 `docs/ART_V2_SPEC.md` 참조. Python 오류를 종료코드에 반영하도록 `--python-exit-code 1`이 필수다.

## 시각 반복

1. 드래곤의 끊어진 복부색과 가려진 꼬리 → 연속 복부 바탕과 측면 구도. 실제 GLB 검사에서 발견한 퇴화 면 제거. 별도 코 패치를 폐기하고 원래 로프트를 연속 마감.
2. 원판 아래 숨은 타일 → y=0 상면과1cm 몰탈 홈. 둥지를 가리던 바위 → 낮은3단 절벽. 덩굴과 관목은 표면 밖에 배치하고 반복적인 잎을 비대칭 분기로 수정.
3. 과도하게 멀던 프리뷰 카메라 → 실제 정점 투영으로 화면 맞춤. 합본에서 드래곤을 키우고 측면 방향으로 회전.
4. 세로 화면에서 작은 합본 → 드래곤 위/섬 아래의 세로 배치. 최초 실픽셀 높이154px가 요구260.8px에 미달하는 실패를 확인한 뒤 수정했으며, 최종 세로2뷰포트 실픽셀 점유율≥40%와 가로 회전 후 복귀 검사를 통과했다.

## 브라우저 검증

`http://127.0.0.1:4176/art-preview.html` — 개발 서버 전용. 현재 게임/새 모델, 함께/드래곤/부유섬, 회전·확대·모션·와이어프레임·초기화·실패 재시도.

- 첫 전체 검사: `node node_modules/@playwright/test/cli.js test tests/e2e/art-preview.spec.ts --reporter=list` →9 passed,16 skipped. 16건은 로드/오류/미디어/복귀 계약을 데스크톱에서 한 번만 실행하도록 의도한 중복 제외다.
- 1440×900,1280×720,844×390,390×844,320×568에서 캔버스 밝기 차이와1.1초 픽셀 변화, 정지 후 안정성, keyboard/mouse/touch drag 및 pinch,44px·화면 경계·버튼 겹침, 저장 sentinel 보존 확인.
- 실패 주입은 복구를 검증하는 의도적 네트워크 중단이다. 정상 흐름은 콘솔 오류와 unhandled rejection0을 요구한다.
- 스크린샷: `artifacts/art-v2/browser/`. 모바일은 Chromium/CDP 에뮬레이션이며 실제 휴대폰 검증이 아니다.
- 세로 배치 재검증2건 통과 후 전체5뷰포트9건 재통과. 추가로 모델 로딩 중 resize에서 카메라가 원점으로 덮어써지는 문제를 RED로 재현하고, 숨긴 모델의 카메라 맞춤을 건너뛰는 가드로 GREEN을 확인했다.
- 독립 architect 검토는 최신 가드·실제 GLB 보고서·성능 표본까지 확인해 승인했다. 변경 파일 한정 정리와 최종 전체 회귀까지 완료했다.

## 프리뷰 성능 — 소프트웨어 렌더링, 실제 기기 아님

Chromium ANGLE/SwiftShader, 각30초, 다른 Blender·브라우저 검증과 직렬 실행. 새 두 모델 합본, 모션 켜짐,52 draw calls,233,840 rendered triangles(그림자 패스 포함),DPR1.

| 프로필 | 그림자2048 평균FPS | 그림자1024 평균FPS | 최종 p95 프레임시간 |
| --- | ---: | ---: | ---: |
| 1440×900 desktop | 19.24 | 20.38 | 50.1ms |
| 844×390 touch emulation | 29.00 | 31.22 | 33.4ms |

1024 그림자 예산으로 경량화했지만 데스크톱 고프레임 목표를 통과하지는 못했다. 두 표본의 콘솔/page 오류는0. 측정 테스트 성공은 수집 절차의 성공이며 성능 합격을 뜻하지 않는다.

- 두 GLB 실제 HTTP 전송량:6,657,316 bytes. Vite 개발 페이지 전체 약13.42MB(압축되지 않은 개발 모듈 포함). 배포 전송량이나 gzip 합계와 혼동하지 않는다.
- 보고서: `artifacts/browser-qa/art-v2/desktop-performance.json`, `touch-landscape-performance.json`. 2048 기준은 `*-performance-shadow2048.json`으로 보존.
- 재현: `$env:ART_V2_PERFORMANCE='1'; node node_modules/@playwright/test/cli.js test tests/e2e/art-preview-performance.spec.ts --project=desktop --project=touch-landscape --reporter=list --trace=off`.
- 실제 GPU·휴대폰과 본 게임에서의 성능, 리그 모션 및 카메라 호환성은 미검증이다.

## 정리·최종 회귀

변경 파일 한정 STANDARD cleanup 완료. 로더/캐시/요청 세대/자원 해제와 모델의 수치 데이터에는 실제 역할이 있어 불필요하게 추상화하거나 삭제하지 않았다. 현재 게임 모델 비교에도 실픽셀 확인·스크린샷 증거를 보강했다. 퇴화 면·버려진 별도 코 패치는 제작 반복에서 제거했고, 허브 잎은6삼각형으로 단순화했다.

정리 후 최종 결과:

- `npm test`:59 files /782 tests PASS.
- `npm run typecheck`, `npm run lint`, `npm run build`:PASS.
- `art-preview.spec.ts`:10 passed /20 intentionally skipped,1.4분. 다섯 뷰포트의 렌더/조작은 모두 실행했다.20건은 공통 비동기·오류·resize·미디어·복귀 계약의 중복 실행 제외다.
- `art-preview-performance.spec.ts`:두30초 표본 수집 PASS. 성능 한계는 위 표를 그대로 유지한다.
- `git diff --check`:PASS. 기존 production 번들 경고(500kB 초과)와 Windows CRLF 안내는 남아 있다. production 출력은 기존 `index-xnSppDKa.js`이며 새 Art V2 GLB/entry가 들어가지 않았다.
- 프리뷰 HTTP200 확인. Vite4176 서버를 유지했다. 기존 게임 전체 E2E/완주와 실제 GPU/휴대폰 검증은 이 시안 범위에서 재실행하지 않았다.

## 변경 파일 묶음

- 제작: `tools/blender/build_dragon_art_v2.py`, `build_hub_art_v2.py`, `assets/source/art-v2/`의 두 blend 및 출처 README.
- 프리뷰: `art-preview.html`, `src/artPreview.ts`, `src/artPreview.css`.
- 검증: `tests/e2e/art-preview.spec.ts`, `art-preview-performance.spec.ts`.
- 기록: `docs/ART_V2_SPEC.md`, 이 보고서, `docs/PRODUCT_GOAL.md`·`IMPLEMENTATION_PLAN.md`의 Art V2 항목.

이번 독립 제작·비교 시안은 완료했다. 최종 게임 적용 및 고해상도 텍스처/식생 아트, 하드웨어 성능 검증은 완료로 처리하지 않는다.

## 보존 경계와 한계

- 새 모델은 `public` 및 production entry에 추가하지 않았다. 기존 게임의 저장·비행·충돌·관문·기록과 이전 미커밋 셰이더/E2E 변경은 수정하지 않았다. 커밋·푸시·배포하지 않았다.
- 로컬 PBR/vertex color와 병합된 geometry를 사용한다. 생성 콘셉트의 고해상도 텍스처·조밀한 식생·영화적 조명은 달성했다고 주장하지 않는다.
- 완성 모델/카메라와 실제 플레이의 카메라·조명·판정·성능 호환은 별도 통합 검증 대상이다. 기존 M46 pacing/전역 성능 문제를 이번 프리뷰가 해결한 것은 아니다.
