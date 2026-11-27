# Art V2 — 드래곤과 하늘 둥지 상세 제작 및 AI 3D → Blender 보정 파이프라인

2026-10-07 첫 시안 수립, 2026-11-23 `2D 단품 시트 → AI 3D 초안 → Blender 4.5 보정·리깅·PBR → GLB 감사` 파이프라인으로 개편.

## 1. 목표와 핵심 철학

- **파이썬 절차 조형의 한계 돌파**: 코드 좌표만으로 유기체(드래곤 얼굴·근육·날개막)와 자연물(절벽·둥지·풍차)을 조형하고 vertex color만 입히면 6만 폴리곤을 써도 장난감처럼 보인다.
- **“AI 티 지우기” 파이프라인**:
  1. **설계 규격 고정**: 축(`-Z` 전방, `+Y` 상방), 스케일, 런타임 리그 피벗, 착륙/상호작용 좌표와 폴리곤·텍스처 예산을 먼저 고정한다.
  2. **3D 생성 전용 2D 레퍼런스 시트**: 복합 배경 일러스트(`skyknit-rebuild-target.png`)는 전체 무드보드로만 쓰고, 3D 생성기 입력에는 **단색 배경·중립 포즈(T/A-Pose)·단품 턴어라운드 시트**(`dragon-v2-turnaround-sheet.png`)를 사용한다.
  3. **AI 3D 초안 생성 (Tripo / Meshy / Rodin / VARCO)**: 단품 이미지를 입력해 고밀도 형태와 PBR 텍스처(Albedo / Normal / Roughness) 초안을 생성한다.
  4. **Blender 4.5 후처리·리깅 (`tools/blender/process_ai_dragon_v2.py`)**:
     - 방향·원점·스케일 정규화 및 좌우 대칭·아티팩트(눈·발톱·날개막 두께) 보정
     - 게임 예산에 맞춘 리토폴로지/Decimate(드래곤 목표 15k~25k, 상한 60k triangles) 및 1024px PBR 텍스처 정리
     - 런타임 필수 피벗(`DragonRoot`, `HeadRig`, `JawRig`, `EyeRig_L/R`, `WingRig_L/R`, `LegRig_Fore/Hind_L/R`, `TailRig_1..5`) 바인딩
     - GLB 내보내기 및 재임포트 자동 감사(`dragon-report.json`)

## 2. 결과물과 소유권

- **무드보드 참고**: `assets/source/art-v2/reference/skyknit-rebuild-target.png`
- **드래곤 3D 생성용 2D 턴어라운드 시트**: `assets/source/art-v2/reference/dragon-v2-turnaround-sheet.png`
- **드래곤 생성·후처리**:
  - 절차 생성 베이스라인: `tools/blender/build_dragon_art_v2.py`
  - AI 3D 임포트·정규화·리깅·감사 파이프라인: `tools/blender/process_ai_dragon_v2.py`
  - 출력물: `assets/source/art-v2/dragon-v2.blend`, `artifacts/art-v2/dragon-v2.glb`, `artifacts/art-v2/dragon-report.json`, `artifacts/art-v2/dragon-*.png`
- **거점(부유섬) 모듈 파이프라인**:
  - 섬 전체를 AI 3D로 통짜 생성하지 않는다(착륙장 평탄도·풍차 회전축·충돌 판정 붕괴 방지).
  - **베이스 지형**: `tools/blender/build_hub_art_v2.py`에서 `AdventureRoot`, `LandingPad`(반경 14), `Keeper`, `WindmillTower`, `WindmillRotor`, 비밀 정원 좌표를 고정한다.
  - **히어로 프롭(풍차, 나뭇가지 둥지, 석조 아치, 절벽 바위 모듈)**: 단품 AI 3D 생성 → Blender 로우폴리(512~1024px PBR) 보정 후 베이스 지형에 조합한다.
- **독립 3D 비교 프리뷰**: `art-preview.html`, `src/artPreview.ts`, `src/artPreview.css`, `tests/e2e/art-preview.spec.ts`

## 3. 모델·텍스처·용량 예산 및 라이선스 정책

- **폴리곤 예산**:
  - 드래곤: 권장 `15,000 ~ 25,000` triangles (프리뷰 상한 `60,000` triangles), `24` primitives 이하
  - 거점(지형 + 프롭 합산): 상한 `60,000` triangles, `24` primitives 이하
- **재질 및 텍스처**:
  - Art V2부터 `vertex color 전용` 제약을 해제하고 **PBR 텍스처(BaseColor, Normal, Roughness/Metallic — 캐릭터 최대 1024×1024, 프롭 512×512~1024×1024)** 및 vertex color 병행을 허용한다.
- **번들 및 로딩 정책**:
  - 본 게임의 초기 프로덕션 gzip `10MiB` 예산은 유지한다.
  - 미검증 Art V2 GLB는 `artifacts/art-v2/`에만 두어 프로덕션 빌드에 바로 포함하지 않는다.
  - 본 게임 정식 교체 단계에서는 Draco/Meshopt 및 WebP/KTX2 압축을 적용하고, 시작 화면에 필요한 활성 수호수 1종 + 첫 거점만 선로드하며 나머지 지역·수호수는 지연 로딩한다.
- **라이선스 및 출시 공시**:
  - 외부 AI 3D 도구(Tripo, Meshy, Rodin, VARCO 등) 사용 시 반드시 **상업적 이용이 허용된 유료 플랜 생성물**만 사용하고, 도구명·플랜·생성일자를 `dragon-report.json` / `hub-report.json`의 `license` 및 `source_tool` 메타데이터에 기록한다.
  - 스팀(Steam) 등 스토어 출시 시 게임 내 AI 생성 3D/텍스처/오디오 사용 내역을 상점 페이지 AI 공시란에 명시한다.

## 4. 실행 명령

```powershell
# 1) 절차 생성 베이스라인 빌드
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --threads 2 --python-exit-code 1 --python tools/blender/build_dragon_art_v2.py
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --threads 2 --python-exit-code 1 --python tools/blender/build_hub_art_v2.py

# 2) AI 3D 원본(Tripo/Meshy/Rodin/VARCO GLB·OBJ·FBX) 후처리·리깅·감사 파이프라인
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --threads 2 --python-exit-code 1 --python tools/blender/process_ai_dragon_v2.py -- --input path/to/raw-ai-dragon.glb --target-triangles 24000 --source-tool "Tripo3D-Pro"

# 3) 후처리 파이프라인 자체 검증 (Self-Test)
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --threads 2 --python-exit-code 1 --python tools/blender/process_ai_dragon_v2.py -- --self-test --skip-renders

# 4) 앱 검증 및 프리뷰 서버
npm test
npm run typecheck
npm run lint
npm run build
npm run dev -- --host 127.0.0.1 --port 4176
```
