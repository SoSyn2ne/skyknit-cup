# Art V2 source set (`하늘섬 드래곤`)

- `reference/skyknit-rebuild-target.png`: 전체 분위기·색감 목표를 정의하는 무드보드 콘셉트 이미지.
- `reference/dragon-v2-turnaround-sheet.png`: AI 3D 생성기(Tripo / Meshy / Rodin / VARCO) 입력 및 Blender 비례 검사용 **단색 배경·중립 포즈(T-Pose) 드래곤 턴어라운드 레퍼런스 시트**.
- `dragon-v2.blend`: `tools/blender/build_dragon_art_v2.py`(절차 생성 베이스라인) 또는 `tools/blender/process_ai_dragon_v2.py`(AI 3D 초안 후처리·리깅·정규화 파이프라인)로 생성.
- `hub-v2.blend`: `tools/blender/build_hub_art_v2.py`로 생성하는 거점 베이스 지형 및 프롭 조립 원본.

GLB 내보내기, 렌더 이미지, 자동 감사 리포트(`dragon-report.json`, `hub-report.json`)는 `artifacts/art-v2/`에 저장되며, 정식 게임 교체 전까지 프로덕션 번들과 분리된다. 상세 규격과 실행 명령은 `docs/ART_V2_SPEC.md`를 따른다.
