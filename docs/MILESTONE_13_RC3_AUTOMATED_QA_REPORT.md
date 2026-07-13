# Milestone 13 RC3 자동 QA 기록

> 상태: **RC3 / 캐릭터 리마스터 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
>
> 검증일: 2026-07-12

## 결론

Dragon v3 캐릭터 디자인, Blender 자동화, 표정 피벗, 준비/레이스 카메라와 기존 비행·미션·키보드·터치 흐름을 포함한 RC3 자동 QA를 완료했다. 사람 또는 실기기 결과는 없으므로 출시 완료를 선언하지 않는다.

## 최종 자동 게이트

```text
npm test                         # 24 files, 261 tests passed
npm run test:e2e                # 97 passed, 43 device-specific skips
RC3 final visual matrix          # ready/race/boost-hit, 15 passed
canvas pixel matrix              # 5 passed
npm run test:performance        # 1 passed, desktop/high + mobile/low 30s
npm run test:production         # 5 passed
npm run typecheck               # passed
npm run lint                    # passed
npm run build                   # passed
npm audit --audit-level=high    # 0 vulnerabilities
Blender GLB inspection          # passed
production hook string scan     # 0 matches
```

## Dragon v3

| 지표 | RC2 v2 | RC3 v3 | 변화 |
| --- | ---: | ---: | ---: |
| triangles | 17,660 | 19,748 | +2,088 |
| render meshes | 9 | 12 | +3 expression meshes |
| primitives | 12 | 16 | +4 |
| materials | 2 | 2 | 동일 |
| GLB raw | 2,385,716 | 2,648,668 | +262,952 bytes |

필수 기존 피벗 9개를 유지하고 `JawRig`, `EyeRig_L/R`를 추가했다. 홍채/동공/하이라이트, 눈썹 능선, 콧구멍, 입선, 턱, 날개 손가락, 발가락 마디, 발톱과 꼬리 곡선을 보강했다.

## 30초 성능

측정 파일: `artifacts/browser-qa/m13/performance-30s.json`

| 지표 | desktop/high | mobile/low |
| --- | ---: | ---: |
| viewport | 1440x900 | 844x390 |
| median | 60fps | 60fps |
| minimum bucket | 54fps | 60fps |
| host frames | 1,752 | 1,802 |
| fixed steps | 1,802 | 1,802 |
| max steps/frame | 6 | 6 |
| draw calls | 34 | 31 |
| triangles | 31,972 | 28,068 |
| geometries | 47 | 42 |
| textures | 1 | 1 |

드래곤 cast-shadow와 실루엣에 기여하지 않는 구형 부위의 과도한 세분화를 제거해 얼굴과 구조 디테일은 유지하면서 성능 게이트를 회복했다.

## 5뷰포트 WebGL 픽셀

| viewport | luma | first hash | second hash |
| --- | --- | ---: | ---: |
| 1440x900 | 1~229 | 458,132,785 | 1,102,766,298 |
| 1280x720 | 1~229 | 1,843,928,095 | 2,813,871,820 |
| 844x390 | 1~219 | 1,737,612,045 | 54,744,401 |
| 390x844 | 0~229 | 3,817,666,806 | 403,522,965 |
| 320x568 | 0~222 | 2,878,371,699 | 2,037,825,768 |

모든 캔버스가 충분한 휘도 범위와 500ms 프레임 변화를 만족했다. console/page/unhandled/network 오류도 전체 E2E에서 0이었다.

## 전송량

| 파일군 | raw | gzip |
| --- | ---: | ---: |
| HTML | 404 | 267 |
| CSS | 13,529 | 2,972 |
| JavaScript | 667,757 | 172,562 |
| model README | 727 | 439 |
| Dragon GLB | 2,648,668 | 479,493 |
| 합계 | 3,331,085 | 655,733 |

gzip 합계는 10MiB 예산의 약 6.3%다.

## 단순화와 남은 위험

- 새 런타임 의존성, 코스, 전투, NPC, 퀘스트, 백엔드를 추가하지 않았다.
- 전신 스키닝 전환 대신 기존 rigid pivot 계약을 확장해 위험과 draw calls를 제한했다.
- 실제 iOS/Android GPU, 고DPR, notch, 열 throttling, 손가락 피로와 멀미는 자동화로 대체할 수 없다.
- 얼굴 표정과 캐릭터 매력, 미션 재미는 사람 플레이테스트가 필요하다.
- 커밋, push, deploy는 수행하지 않았다.

> **RC3 / 캐릭터 리마스터 자동 검증 완료 / 실기기·사람 플레이테스트 대기**
