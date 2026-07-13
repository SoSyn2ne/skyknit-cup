# Milestone 0 검증 기록

> 상태: **완료 검증됨**
>
> 검증일: 2026-07-10

## 결과

- Vite vanilla TypeScript와 Three.js 기반의 전체 화면 WebGL 골격을 구성했다.
- 레이스 상태 전이와 관문 선분 교차를 렌더링 코드와 분리된 순수 함수로 구현했다.
- 개발 전용 강제 WebGL 실패 화면과 같은 탭에서의 재시도 복구를 구현했다.
- 기존 Blender 원본, 컨셉 시트, 블록아웃 생성 스크립트는 변경하지 않았다.

## 도구 체인

로컬 기준 런타임은 Node.js `22.20.0`, npm `10.9.3`이다.

| 패키지 | 고정 버전 |
| --- | --- |
| `three` | `0.185.1` |
| `vite` | `8.1.4` |
| `typescript` | `6.0.3` |
| `vitest` | `4.1.10` |
| `eslint` | `10.6.0` |
| `@eslint/js` | `10.0.1` |
| `typescript-eslint` | `8.63.0` |
| `globals` | `17.7.0` |
| `@types/three` | `0.185.1` |

TypeScript의 npm 최신 태그는 `7.0.2`였지만, `typescript-eslint 8.63.0`의 공식 지원 범위가 `>=4.8.4 <6.1.0`이므로 전체 도구 체인의 최신 호환 안정판인 `6.0.3`을 선택했다.

공식 근거:

- [Vite Node.js 요구사항](https://vite.dev/guide/#scaffolding-your-first-vite-project)
- [Vitest 4 요구사항](https://vitest.dev/guide/migration.html#migrating-to-vitest-4-0)
- [typescript-eslint 지원 범위](https://typescript-eslint.io/users/dependency-versions/)
- [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files)

## 테스트 우선 증거

1. `raceState.test.ts`와 `checkpoint.test.ts`를 구현 파일보다 먼저 작성했다.
2. 첫 `npm test`에서 `./raceState`와 `./checkpoint` 모듈 부재로 2개 스위트가 실패하는 것을 확인했다.
3. 최소 규칙 구현 후 테스트를 통과시켰다.
4. 리뷰 중 발견한 비유한 관문 입력은 회귀 테스트 3개가 실패하는 것을 다시 확인한 뒤 유한값 검사로 통과시켰다.

최종 테스트는 2개 파일, 30개 시나리오다. 상태 표의 모든 허용 전이와 미등록 조합 거부, 시작/완주 가드, 재시작 초기화, 중심 통과, 반경 밖, 평행, 역방향, 선분 밖, 비유한 관문 입력을 포함한다.

## 브라우저 검증

정상 경로에서 캔버스의 CSS 경계와 문서 크기가 각 뷰포트와 정확히 일치했다.

| 뷰포트 | 정상 캔버스 | 문서 스크롤 | 실패 화면 |
| --- | --- | --- | --- |
| `1440x900` | 통과 | 없음 | 통과 |
| `1280x720` | 통과 | 없음 | 통과 |
| `844x390` | 통과 | 없음 | 통과 |
| `390x844` | 통과 | 없음 | 통과 |
| `320x568` | 통과 | 없음 | 통과 |

- 모든 정상 캡처는 배경과 다른 색상 픽셀을 포함했다.
- 1.1초 간격 정상 캡처의 SHA-256이 달라 애니메이션 픽셀 변화를 확인했다.
- `?forceWebglFailure=1`에서 한국어 `alert`, 자동 포커스된 `120x48` 다시 시도 버튼, 캔버스 부재를 확인했다.
- 다시 시도 후 실패 쿼리가 제거되고 정상 캔버스가 한 개만 생성됐다.
- 정상, 실패, 재시도 경로의 브라우저 `warn`과 `error` 로그는 모두 0개였다.
- 프로덕션 빌드에는 강제 실패 쿼리와 `__DRAGON_RACE_TEST__` 문자열이 남지 않았고, 프로덕션 미리보기에서 실패 쿼리가 무시되는 것을 확인했다.
- 최종 시각 판정은 `98/100`, `pass`다.

세부 수치와 캡처는 무시 대상인 `artifacts/browser-qa/`에 저장했다.

## 품질 명령

```text
npm test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

모든 명령이 성공했고 npm audit 결과는 취약점 0개다.

## 단순화와 남은 위험

- 레이스 규칙은 Three.js 타입을 사용하지 않아 단위 테스트가 WebGL에 의존하지 않는다.
- M0 장면은 금빛 링, 주홍 표식, 두 가닥 바람실만 사용하며 비행·코스·HUD를 앞당겨 구현하지 않았다.
- 실패 UI는 별도 프레임워크 없이 DOM 경계 하나로 유지했다.
- Three.js가 포함된 프로덕션 JS는 약 `531KB` minified, `135KB` gzip이며 Vite의 기본 500KB 청크 경고가 발생한다. 초기 10MB 예산에는 충분히 들어오며 실제 분할 판단은 런타임 구조가 생긴 뒤 측정한다.
