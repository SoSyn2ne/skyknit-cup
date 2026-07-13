# SKYKNOT CUP · 하늘매듭배

브라우저에서 주홍빛 드래곤을 조종해 세 개의 하늘 군도를 탐험하고, 공중 레이스와 하늘동전 기록 도전에 참여하는 3D 아케이드 비행 게임입니다.

## 현재 콘텐츠

- 10~12개 관문의 싱글 플레이 타임 트라이얼
- 같은 코스를 활용한 로컬 챌린지 미션 6종
- 축제 중심섬, 바람 협곡, 구름 유적지 오픈월드 탐험
- 세 지역 × 10개, 총 30개의 순서형 하늘동전 기록 도전
- 지역별 거리 LOD와 프로젝트 자체 제작 Blender/GLB 구조물
- 키보드와 모바일 터치, 가로·세로 화면 지원
- 레이스·미션·탐험·지역별 동전 최고 기록 로컬 저장

## 기술 구성

- Vite + vanilla TypeScript
- Three.js / WebGL
- Vitest 단위 테스트
- Playwright 5뷰포트 E2E·픽셀·성능·프로덕션 검증
- Blender 4.5 LTS 기반 드래곤·월드 GLB 제작 도구

Unity로 이전하지 않고 Blender에서 제작한 GLB를 Three.js 런타임에 직접 로드합니다.

## 실행

```bash
npm install
npm run dev
```

프로덕션 빌드와 주요 검증:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run test:performance
npm run test:production
```

## 조작

| 동작 | 키보드 | 터치 |
| --- | --- | --- |
| 선회·상승/하강 | 방향키 또는 WASD | 왼쪽 조이스틱 |
| 돌풍 부스트 | Space | 돌풍 버튼 |
| 탐험 감속/호버 | C 또는 Ctrl | 감속 버튼 |
| 착륙·재이륙 | E | 상황 동작 버튼 |
| 지도 | M | 지도 버튼 |
| 일시정지 | Esc | 일시정지 버튼 |

## 현재 상태

**RC6 / 하늘동전 기록 도전 자동 검증 완료 / 실기기·사람 플레이테스트 대기**

- 단위 테스트 298개 통과
- 필수 뷰포트: `1440x900`, `1280x720`, `844x390`, `390x844`, `320x568`
- 레이스·탐험 데스크톱/모바일 30초 측정 중앙값 60fps
- 프로덕션 gzip 약 1.86MiB

상세 결과는 [RC6 자동 QA 보고서](docs/MILESTONE_25_RC6_AUTOMATED_QA_REPORT.md), 사람 검증 항목은 [RC6 플레이테스트 인계](docs/RC6_COIN_RUN_PLAYTEST_HANDOFF.md)를 참고하세요.
