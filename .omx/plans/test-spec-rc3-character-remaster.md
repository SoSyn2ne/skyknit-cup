# RC3 캐릭터 리마스터 테스트 명세

## 단위

- 필수 피벗 유지와 선택 피벗 fallback
- 결정적 호흡/눈 깜빡임 범위
- boost/상승/충돌 자세와 정상 복귀
- pause에서 표현 시간이 진행되지 않음
- 원래 emissive 색과 강도 복구

## 에셋

- Blender headless 재생성 성공
- 18,000~22,000 triangles
- render meshes 14 이하, primitives 18 이하, materials 3 이하
- 필수 노드 9개와 vertex color 존재

## 브라우저

- 5뷰포트 준비/레이스 구도, nonblank/시간 변화 픽셀
- 드래곤·바람실·금빛 관문 동시 프레이밍
- 키보드/터치 시작·완주·재시도 회귀 없음
- console/page/unhandled/network 오류 0

## 성능과 프로덕션

- desktop/high median 55fps 이상, minimum 50fps 이상
- mobile/low median 30fps 이상
- high draw calls 120 이하, gzip 10MiB 미만
- 개발 QA/실패 훅 프로덕션 제거
