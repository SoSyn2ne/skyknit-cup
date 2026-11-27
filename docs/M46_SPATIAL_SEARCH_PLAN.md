# M46 공간 탐색 보강 — 두 방향의 메아리

2026-09-08. 설계만 작성. **현재 M46 성능 stopline을 통과하기 전에는 구현하지 않는다.**

## 결정과 범위

의뢰 3의 정확한 좌표 방문·E 확인을, 서로 다른 두 위치에서 메아리를 듣고 숨은 비석을 찾아 깨우는 공간 탐색으로 교체한다. 새로운 의뢰, 관문, 채집품, 메뉴 퍼즐은 만들지 않는다. 수호수의 기존 비행·고도 조절·호버를 그대로 사용한다.

가정: 기존 세 발견 비석 위치는 현재 실제 입력으로 도달한 안전한 지점이므로 유지한다. 먼저 안내하는 **탐색 구역 중심**만 비석과 분리한다. 새 건물·GLB·의존성은 추가하지 않는다. 주변 지형을 활용할 수 있는지는 성능 통과 후 실제 화면에서 재검증하며, 지형 관통을 난이도로 사용하지 않는다.

현재 근거: `artifacts/browser-qa/m46-adventure/desktop-real-input.json`의 활성 시간 253초, 터치 204초. 첫 보상은 22.624초/21.736초. 기존 감지 시작부터 정원 발견까지 106초/101초다. 이는 정답을 아는 자동 입력이고 사람의 첫 플레이 시간이 아니다. 아래 설계도 10~15분 달성 증거를 대신하지 않는다.

## 한 가지 플레이 규칙

1. 항로 의뢰 이후, HUD와 금빛 안내는 첫 **탐색 구역**까지만 안내한다. 구역 안에서는 비석까지의 정확한 거리·좌표·직선 길을 보여주지 않는다.
2. `E` 또는 기존 유적 감지 버튼을 누르면 현재 위치에서 8방향·상하·신호 세기의 메아리가 나타난다. 첫 관측 위치가 저장된다. 비행은 멈추지 않으며 감속/호버는 선택이다.
3. 다른 위치로 직접 날아가 다시 듣는다. 두 위치 간 거리 24 units 이상이고 비석을 바라본 두 방향의 각도 차가 20도 이상이면 위치가 드러난다. 멀리 일직선으로 가는 것보다 옆이나 위아래로 시점을 바꾸는 것이 유효하다.
4. 드러난 실제 비석에 10 units 이내로 접근해 `E · 흔적 깨우기`를 누른다. 이때만 기존 `search-*` 방문 ID와 유대 +0.25를 한 번 기록한다. **감지 버튼 자체는 방문·보상·재료를 지급하지 않는다.**
5. 발견 룬은 세계에 영구적으로 남는다. 세 비석을 깨우면 기존 숨은 유적·햇실·풍차 복구·비밀 정원 흐름으로 연결한다.

두 관측은 횟수 채우기가 아니라 위치를 알아내는 최소 기하 조건이다. 같은 자리에 연타하거나 일시정지에서 기다려도 해결되지 않는다. 정답을 알아 빨리 해결하는 것을 막는 최소 소요 시간, 쿨다운, 소모 재화, 실패 페널티는 없다. 한 구역에서 유효한 두 관측 이상을 요구하지 않는다.

## 공간 데이터

모든 구역은 중심 기준 3D 반경 110 units. 비석 위치는 기존 `ADVENTURE_POINTS`를 참조하고 중복 저장하지 않는다. 첫/두 번째 관측 위치는 구역 안의 유한 좌표만 허용한다.

| ID | 안내 중심 (x,y,z) | 기존 비석 위치 | 읽어야 할 공간 차이 |
| --- | --- | --- | --- |
| search-canyon | (740,105,-400) | (760,75,-350) | 구역보다 낮은 절벽 쪽 메아리; 하강과 측면 이동 |
| search-cloud | (550,35,-25) | (580,70,0) | 구역보다 높은 구름 층의 메아리; 상승과 다른 시점 |
| search-garden | (420,72,315) | (380,62,300) | 정원 옆으로 돌아 들리는 메아리; 수평 측면 탐색 |

위 중심들은 먼 지역으로 왕복시키지 않는 초기 제안 좌표다. 중심은 착륙장·충돌체·필수 통과점이 아니다. 반경에 들어오는 방향과 관측 지점은 플레이어가 고른다. 실제 구현 전 기존 충돌·프레이밍 검사에서 불리한 중심만 같은 구역 안에서 조정하고 근거를 기록한다.

## 타입과 순수 함수 계약

`adventureWorld.ts`에 다음 데이터 타입과 `ADVENTURE_SEARCH_AREAS`만 추가한다.

```ts
export type AdventureSearchPointId = typeof ADVENTURE_SEARCH_POINT_IDS[number]
export interface AdventureSearchArea {
  readonly id: AdventureSearchPointId
  readonly center: Vec3Value
  readonly radius: number
  readonly discoveryRadius: number
}
```

새 `adventureSearch.ts`는 `adventureWorld.ts`와 Vec3 타입에만 의존한다. `adventureState.ts`를 역으로 import하지 않는다.

```ts
export interface AdventureSearchDraft {
  readonly pointId: AdventureSearchPointId
  readonly samples: readonly Vec3Value[] // 정규화 후 길이 1 또는 2
}
export interface AdventureEcho {
  readonly bearingSector: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
  readonly elevation: 'above' | 'level' | 'below'
  readonly strength: 'faint' | 'clear' | 'near'
}

export declare function normalizeAdventureSearchDraft(value: unknown, area: AdventureSearchArea): AdventureSearchDraft | null
export declare function sampleAdventureSearch(draft: AdventureSearchDraft | null, area: AdventureSearchArea, position: Vec3Value): AdventureSearchDraft | null
export declare function isAdventureSearchResolved(draft: AdventureSearchDraft | null, area: AdventureSearchArea): boolean
export declare function getAdventureEcho(area: AdventureSearchArea, position: Vec3Value, headingRadians: number): AdventureEcho
```

- 첫 관측은 유효 위치를 복제해 저장한다. 두 번째가 기준에 못 미치면 기존 첫 관측을 유지하고, HUD에서 옆/위아래로 이동하라고 설명한다. 관측 2개가 해결 조건을 만족한 뒤에는 추가 관측이 초안을 변경하지 않는다.
- 각도는 비석→관측 위치의 3D 벡터 사이 각도다. 비석과 1 unit 미만인 퇴화 벡터는 관측으로 받지 않고 한 발 떨어진 위치를 안내한다. 입력 좌표·각도는 유한 값만 처리한다.
- 신호는 수호수 방향 기준 45도 구간으로 양자화한다. 고도 차 절댓값 12 이내는 `level`, 거리는 30 미만 `near`, 70 미만 `clear`, 나머지는 `faint`. 정확한 숨은 위치·거리·각도를 HUD 모델에 넘기지 않는다.
- 해결 여부는 두 관측으로 파생한다. 저장된 `resolved: true` 같은 필드로 해결/보상을 위조할 수 없게 한다.

`AdventureProgress`에는 optional `search?: AdventureSearchDraft | null` 하나만 추가하고 canonical 출력은 항상 null 또는 유효 초안이다. 새 stage/reward/item/XP 규칙은 만들지 않는다.

`adventureState.ts`의 소유 함수:

- `getCurrentAdventureSearchArea(progress)` — 미완료인 현재 `search-*` 구역만 반환한다.
- `getAdventureNavigationObjective(progress)` — 탐색 미해결이면 안내 중심·구역 문구, 해결 뒤에는 실제 비석, 다른 단계는 기존 목표를 반환한다. 기존 `getAdventureObjective`는 내부 판정용 좌표 계약을 유지한다.
- `getAdventureSearchView(progress, context, headingRadians, pulseActive)` — `phase: 'unheard' | 'one-bearing' | 'located' | 'remembered'`, `canSense`, `canDiscover`, `echo: AdventureEcho | null`, 짧은 이동 안내를 반환한다. 해당 탐색이 없으면 null.
- `canUseAdventureSense/useAdventureSense` — 기존 모드·중지·지도·경쟁 가드를 유지하면서 24-unit 목표 근접 대신 110-unit 탐색 구역을 검사한다. 감지는 초안만 갱신한다.
- `interactAdventure` — `search-*`에서는 해결된 초안과 실제 비석 10-unit 근접이 모두 있어야 기존 방문을 한 번 기록한다. 다음 구역으로 넘어갈 때 초안을 null로 정리한다. 세 기존 방문 이후의 `ruinsRevealed` 파생 규칙은 그대로 둔다.
- 이미 발견한 구역에서 감지는 `remembered` 표시만 허용한다. 기존 룬을 잠깐 강조할 뿐 방문·XP·재료를 다시 지급하지 않는다. 완료 후에도 배운 감지가 삭제된 버튼이 되지 않게 한다.

## HUD와 실제 3D 신호

- 현재 목표는 한 개다. 구역 밖: `협곡 주변의 메아리 찾기 · 탐색 구역까지 N m`. 구역 안: `E · 메아리 듣기`; 첫 관측 뒤: `다른 방향에서 들어보세요 · 오른쪽/아래/선명함`; 해결 뒤: `흔적을 깨우기`와 실제 비석 거리.
- `AdventureHudView`에 optional `search` 모델을 추가한다. `[data-adventure-search]`에는 phase, `[data-adventure-echo]`에는 **보이는 신호의 동일한 양자화 값**만 제공한다. 숨은 좌표를 data attribute에 넣지 않는다. 현 유적 감지 버튼과 E를 함께 사용하고 새 조작·팝업은 추가하지 않는다.
- E 분기: 탐색 구역 미해결이면 감지, 해결되어 비석 근처면 발견, 나머지는 기존 착륙/의뢰 동작이다. 따라서 미해결 상태에서 우연히 실제 좌표에 도착해도 기존 정확한 목표 버튼이 먼저 노출되지 않는다.
- 감지 pulse는 기존 8초 시각 시간만 재사용한다. 시간은 성공 조건이 아니며 다시 눌러 즉시 들을 수 있다. 두 관측과 해결 상태는 pulse가 사라져도 유지된다. pause/map/경쟁 중에는 pulse와 입력을 숨긴다.
- 구역 안 미해결 상태에서는 정확한 목표 비콘·직선 10개 가이드를 숨긴다. 기존 guide 인스턴스 중 최대 3개를 수호수 근처 8/12/16 units의 **양자화 방향**으로 보내 메아리의 방향·고도를 표현한다. 첫 관측 위치는 같은 인스턴스 풀의 희미한 기억 표식 하나로 구분한다.
- 해결 뒤에만 현재 비석 메시와 정확한 금빛 비콘을 보인다. 발견 뒤에는 현재 비석 메시를 정리하되 그 위치에 기존 `M46_ActivatedRunes`의 룬 한 개를 지속 표시한다. 모든 `visitedPointIds`의 search ID를 순회해 stage와 무관하게 복원한다. 이는 이미 확보된 `RUNE_CAPACITY`의 3개 발견 슬롯을 사용한다.
- 새로운 GLB·메시 풀·후처리·광원은 추가하지 않는다. 기존 guides/runes draw call을 재사용한다. **추가 draw calls 0**을 목표로 하되 구현 후 실제 high 최대 120 및 성능 전체 기준을 다시 검사한다.

## 저장 호환과 실패 경계

- v12의 additive optional 초안이다. 현재 진행 중인 M46의 이전 저장에는 `search`가 없어도 읽히며 완료한 기존 `search-*`, 유대, 보상, 복구, 장식은 절대로 회수하지 않는다.
- `visitedPointIds`가 기존 권위다. 이전 저장에 세 발견이 있으면 새로운 관측 단계를 역으로 요구하지 않는다. 남은 구역만 새 방식으로 플레이한다. 이미 `ruins`/`repair`/`secret-garden`을 지난 저장의 search 초안은 버리고 완료를 보존한다.
- 초안은 현재 미완료 구역 ID, 길이 1~2의 dense 배열, 유한 좌표, 구역 반경을 검사하고 깊게 복제한다. malformed/future/다른 항로·단계 초안은 초안만 null로 정리한다. 길이 2가 기하 조건을 만족하지 않으면 첫 유효 관측 하나만 보존한다.
- 기존 v11 전체 저장→v12, v12 이전 M46 완료 저장, 회로 초안·새 감지 초안의 저장/복구 소유권을 각각 검증한다. `records.ts`의 기존 top-level schema와 기록/고스트/설정은 건드리지 않는다.

## 작은 구현 순서 — 성능 통과 후

1. **순수 공간 탐색**: `adventureWorld.ts`, `adventureSearch.ts/.test.ts`, `adventureState.ts/.test.ts`. 첫 관측·기하 해결·도달 발견을 각각 분리하고 기존 완료 저장 보존을 고정한다. 완료 조건: 감지는 보상 불가, 다른 위치/각도에서만 해결, 발견 한 번만 지급.
2. **첫 협곡 수직 슬라이스**: `AdventureHud.ts/.test.ts`, `createRenderer.ts`, `adventure.css`. 동일한 데이터 계약으로 한 구역만 실제 E·터치로 동작시키며 현재 exact-waypoint 노출을 제거한다. 완료 조건: 비행을 멈추지 않고 관측→이동→해결→실제 비석 도달 가능.
3. **3D 연결과 세 구역**: `createAdventureWorld.ts/.test.ts` 및 renderer 연결. 기존 인스턴싱으로 pulse·기억·영구 룬을 표시한다. 완료 조건: 미해결 좌표가 보이지 않고, 발견 후 다른 단계/reload에서도 룬이 남으며, 경쟁에서는 안내가 사라진다.
4. **실제 입력·호환·시각·성능 감사**: 해당 E2E와 보고서. 각 단계는 검증 후 다음으로 간다. 기존 dirty work를 보존하고 커밋·푸시·배포하지 않는다.

## 검증 계약

- 단위: 한 자리 연타/직선으로 부족한 시차/24-unit 경계/20-degree 경계/고도 시차/퇴화 벡터/범위 밖/NaN/중지/지도/race/coin; 해결만으로 방문이 늘지 않음; 실제 비석 근접 발견; 다음 초안 정리; legacy earned visits 보존; deep clone; dense array 검사.
- 화면 모델: 미해결 navigation 위치는 구역 중심이고 HUD/DOM에는 실제 비석 좌표가 없다. 해결 후에만 실제 목표가 노출된다. 세 구역의 과거 발견 룬은 완료·reload에서 유지된다.
- 실제 입력: 기존 `adventure.spec.ts`의 무조건 `adventure.objective.position` 조종을 탐색 구간에서 금지한다. 구역까지는 공개 navigation으로 가고, E/터치 감지 후 DOM에 보이는 8방향/고도/신호와 현재 수호수 방향으로 비행한다. 한 관측 뒤 측면/고도 이동, 두 번째 관측, 발견된 뒤 공개 navigation으로 실제 비석에 도달한다. 미발견 좌표/정답 import·QA 상태 변경·순간이동은 쓰지 않는다.
- 로그: `area-enter`, `sense-first`, `sense-rejected-geometry`, `sense-located`, `clue-found`의 활성 시간·입력 장치·실제 비행 위치·화면 신호를 남긴다. 첫 관측 후 reload하여 진행을 이어 하고 마지막 발견 뒤 모든 보상·세계 변화 재접속을 확인한다.
- 기존 회로 정답을 아는 기능 E2E는 계속 **known-answer**로 표시한다. 새 공간 탐색 UI가 노출한 정보만 쓰더라도 사람 플레이 증거는 아니다. 사람/실기기 미검증을 명시한다.
- 캔버스: 동일 위치·카메라에서 미감지→pulse→비석 해금→발견 후 룬→reload를 비교한다. 다섯 필수 뷰포트와 reduced-motion, 오류 0을 검증한다. postprocessing 없이 움직이는 표식을 최소화한다.

명령: `npm test -- src/game/adventure`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e -- tests/e2e/adventure.spec.ts tests/e2e/adventure-visual.spec.ts`, `npm run test:production`, `npm run test:performance`.

## 10~15분 첫 챕터의 판정

설계상 시간 배분은 구조·귀환 0.5~1분, 항로·네 회로 4.5~6분, 세 구역의 공간 탐색 3.5~5분, 복구·정원·꾸미기 1.5~3분이다. 합계 10~15분은 **첫 플레이 가설**이며 아직 통과가 아니다. 빠른 해법을 아는 재플레이가 이보다 짧은 것은 허용한다.

이 보강의 최소 실질 증거는 숨은 좌표를 모르는 입력이 세 구역에서 총 여섯 개의 유효 관측 위치를 스스로 선택하고, 고도·측면 탐색과 실제 비석 접근을 수행하는 것이다. 구역마다 요구 관측 수를 늘려 시간을 맞추지 않는다.

전체 시간은 일시정지/지도/경쟁을 제외하고 실제 이동·판단·회로 해결·발견 시간을 구간별 기록한다. 검증용 sleep·입력 지연·설명 읽기 강제 대기를 추가하지 않는다. 추정 합계나 기능 테스트의 성공만으로 10~15분을 완료 처리하지 않는다. 보강 후에도 첫 노출 플레이의 실측이 목표를 뒷받침하지 못하면 그 요구를 열린 상태로 남기고 실제 부족 구간의 행동 밀도를 다시 판단한다.
