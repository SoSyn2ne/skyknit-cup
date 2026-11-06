# Art V2 — 드래곤과 하늘 둥지 상세 제작 시안

2026-10-07. 사용자의 생성 콘셉트 승인과 “해봐, 더 디테일하게” 요청에 따른 첫 Blender 제작 세트.

## 목표와 가정

AI 예시를 실제 편집 가능한 3D 원본으로 옮기는 첫 수직 슬라이스다. 대상은 주홍 드래곤과 첫 둥지/풍차/공중섬이다. 레이스·의뢰 확장이나 나머지 수호수/지역 전체 교체는 이번 범위가 아니다.

참고: assets/source/art-v2/reference/skyknit-rebuild-target.png. 이 이미지는 목표 외형이지 현재 게임 화면이나 Blender 산출물이 아니다.

## 결과물과 소유권

- 드래곤: tools/blender/build_dragon_art_v2.py, assets/source/art-v2/dragon-v2.blend, artifacts/art-v2/dragon-v2.glb 및 dragon-*.png.
- 거점: tools/blender/build_hub_art_v2.py, assets/source/art-v2/hub-v2.blend, artifacts/art-v2/hub-v2.glb 및 hub-*.png.
- 루트: art-preview.html, src/artPreview.ts/.css, 프리뷰 테스트, 공통 검사·보고서.
- 기존 생성기의 실제 유틸리티를 재사용하되 원본 출력 경로를 호출하지 않는다. 새 파일에만 저장한다.

## 모델 기준

- 드래곤: 연속적인 몸통/목 실루엣, 읽히는 눈·콧구멍·턱선, 뿔과 귀, 정확히 네 다리와 두 날개, 두꺼운 어깨/날개뿌리, 관절형 날개 손가락·곡면 날개막, 길고 가는 꼬리, 선택적으로 배치한 겹비늘과 복부판. 원시 도형을 붙인 모습이나 비늘만 추가한 재색칠은 피한다.
- 리그: 가능한 기존 DragonRoot/HeadRig/JawRig/EyeRig_L/R/WingRig_L/R/TailRig_1..5 이름과 축을 보존한다. 원본 mesh와 리그를 실제로 검사하며, 자동으로 게임 호환을 선언하지 않는다.
- 거점: 불규칙한 절벽 층, 명확한 착륙 마당, 옆으로 분리한 녹지와 테라스/계단, 실제 가지로 엮은 둥지, 목재 구조·창·벽돌·돛살이 읽히는 풍차, 제한된 풀/꽃/덩굴과 랜턴. 랜드마크 밀도는 높이되 비행로와 착륙 중심을 가리지 않는다.
- 거점의 기존 의미 노드와 중심 착륙 반경14, 누리·풍차 회전축·비밀 정원 위치는 가능한 유지하고 변경이 필요하면 보고한다.
- 자체 제작 geometry/vertex color/PBR를 기본으로 한다. 새로운 외부 에셋·의존성은 넣지 않는다. 고해상도 미세 디테일은 무한한 개별 오브젝트 대신 제한된 merged geometry로 표현한다.

## 경계와 예산

- 기본 게임/저장/물리/기록과 기존 미커밋 셰이더 변경은 보존한다.
- 모델별 목표: 드래곤60k triangles/24 primitives 이하, 거점60k triangles/24 primitives 이하. 목표를 넘으면 결과를 보고하고 무작정 더하지 않는다.
- 현재 production gzip10MiB 예산은 유지한다. 새 GLB는 production 경로에 넣지 않으며, 프리뷰 자체의 실제 전송량/성능을 별도 측정한다. 이 분리는 성능 통과를 의미하지 않는다.
- 커밋·푸시·배포, 기존 원본 삭제/덮어쓰기, 신규 패키지 설치는 하지 않는다.

## 프리뷰

Three.js full-bleed 캔버스가 주 콘텐츠다. 장면/드래곤/거점 선택, 회전·확대, 모션 정지와 와이어프레임 정도만 제공한다. 기존 팔레트의 의미 토큰을 사용하고 44px 터치·키보드 접근·로딩/오류 상태를 갖춘다. 로그인이나 저장 마이그레이션은 없다.

## 명령

`& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --threads 2 --python-exit-code 1 --python tools/blender/build_dragon_art_v2.py`
`& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --threads 2 --python-exit-code 1 --python tools/blender/build_hub_art_v2.py`
`npm test`; `npm run typecheck`; `npm run lint`; `npm run build`
`npm run dev -- --host 127.0.0.1 --port 4176`

## 코드와 검증

기존 Python/vanilla TypeScript 스타일과 순수 데이터 함수를 사용한다. 예: `const mode: PreviewMode = 'scene'`처럼 모드와 렌더 객체를 분리하고 새 프레임워크를 만들지 않는다.

완료 기준: 두 blend/GLB 생성, 오류 없는 실제 GLB 재로드, 유한 정점·노멀/리그/의미 노드·삼각형·재질·용량 보고, 실제 모델 렌더3장 이상, 프리뷰 세 모드/회전/모션/와이어프레임 동작, 1440×900·1280×720·844×390·390×844·320×568에서 canvas nonblank/시간 변화·UI 가독성·오류0 검증. 실제 렌더를 보고 형태 개선을 판정한다.

프리뷰 검증과 본 게임 완주/성능 검증은 구분한다. 사람·실기기와 정식 게임 적용이 미검증이면 그대로 명시한다.
