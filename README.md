# FFXIV 마물 디스코드 알림기

ACT + OverlayPlugin 로그를 받아서 A/S급 마물 발견 시:

- 디스코드 웹훅 전송
- 지역명 / 좌표 표시
- 지도 배경 위 핀 이미지 생성

까지 처리하는 로컬 실행형 도구입니다.

현재 구조는 다음 흐름으로 동작합니다.

1. OverlayPlugin 커스텀 오버레이가 게임 로그를 수집
2. 로컬 Node 서버가 `03 / 04 / 25 / 40 / 261` 로그를 파싱
3. 마물 테이블과 대조해 A/S급 여부를 판별
4. 월드 좌표를 인게임 맵 좌표로 변환
5. 디스코드 웹훅으로 텍스트 + 지도 핀 이미지를 전송

## 주요 기능

- A급 / S급 BNpcNameID 화이트리스트 기반 감지
- 일반 몹 / NPC를 이용한 테스트 모드
- 디스코드 웹훅 알림
- 지역명 / 맵 좌표 / 월드 좌표 기록
- Dawntrail 6개 지역 공식 지도 배경 합성
- 로컬 디버그 엔드포인트 제공

## 지원 지도

- 오르코 파차
- 코자말루 카
- 야크텔 밀림
- 샬로니 황야
- 헤리티지 파운드
- 리빙 메모리

## 폴더 구조

- `src/server.mjs`: HTTP 서버 엔트리
- `src/lib/parser.mjs`: ACT 로그 파서
- `src/lib/hunts.mjs`: 마물 매칭 로직
- `src/lib/projector.mjs`: 월드 좌표 -> 맵 좌표 / 픽셀 좌표 변환
- `src/lib/png-renderer.mjs`: 지도 이미지 렌더링
- `src/lib/discord.mjs`: 디스코드 웹훅 전송
- `overlay/ingest-bridge.html`: OverlayPlugin에서 불러올 커스텀 오버레이
- `config/local.config.example.json`: 실사용 설정 템플릿
- `config/hunts.as-whitelist.json`: A/S급 BNpcNameID 화이트리스트
- `config/tracked-targets.outrunner.json`: 일반 몹 테스트용 예시

## 시작하기

### 1. 로컬 설정 파일 만들기

먼저 템플릿을 복사합니다.

```powershell
Copy-Item config/local.config.example.json config/local.config.json
```

그 다음 `config/local.config.json` 에서 아래 값을 채웁니다.

- `identity.detectedBy`: 디코에 표시할 감지자 이름
- `discord.webhookUrl`: 디스코드 웹훅 주소

## 2. 라이브 서버 실행

A/S급 화이트리스트 감지 모드:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restart-live-server.ps1
```

일반 테스트 대상 모드:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restart-local-server.ps1
```

## 3. ACT / OverlayPlugin에 브리지 오버레이 등록

ACT에서:

1. `Plugins -> OverlayPlugin.dll -> New`
2. `Custom` 타입 선택
3. URL에 아래 경로 입력

```text
file:///C:/Users/Administrator/Desktop/ffxiv_mamul_codex/overlay/ingest-bridge.html
```

정상 연결되면 브리지 오버레이에서 연결 상태를 확인할 수 있습니다.

## 디스코드 알림 형식

예시:

```text
[A급 발견] 마물명
지역: 리빙 메모리
좌표: X 12.4 / Y 13.6
감지: 무냥
```

추가로:

- 지도 배경 이미지
- 핀 표시
- 월드 좌표

가 함께 첨부됩니다.

## 테스트 방법

### 1. 시뮬레이션 이벤트 테스트

샘플 스폰 이벤트:

```powershell
node src/server.mjs --config config/example.config.json --hunts config/hunts.sample.json
```

```powershell
Invoke-WebRequest http://127.0.0.1:5055/simulate/spawn `
  -Method POST `
  -ContentType 'application/json' `
  -InFile samples/simulated_spawn.json
```

### 2. 일반 몹 테스트

예시 테스트 대상:

- 아웃러너
- 네크로시스

관련 설정 파일:

- `config/tracked-targets.outrunner.json`

## 디버그 명령

상태 확인:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/debug-local-state.ps1
```

플레이어 좌표 확인:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/debug-player.ps1
```

헬스 체크:

```powershell
Invoke-WebRequest http://127.0.0.1:5059/health | Select-Object -Expand Content
```

## 지도 자산

Dawntrail 공식 지도 배경은 아래 스크립트로 받을 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-official-dawntrail-maps.ps1
```

저장 위치:

- `maps/official`

## 설정 개요

`config/local.config.example.json` 기준으로:

- `server`: 로컬 서버 주소 / 포트
- `identity`: 감지자 이름, 인스턴스 표시값
- `discord`: 웹훅 설정
- `storage`: 기록 파일 / 이미지 출력 폴더 / 중복 제한 시간
- `parser`: ACT 로그 필드 인덱스
- `maps`: 지도별 좌표 변환 설정

## 마물 감지 방식

`config/hunts.as-whitelist.json` 에는:

- A급 BNpcNameID 화이트리스트
- S급 BNpcNameID 화이트리스트

가 들어 있습니다.

실제 디스코드에 표시되는 몹 이름은 고정 테이블명이 아니라, **실시간 로그의 `name` 값**을 사용합니다.  
즉 마물별 이름 사전이 없어도 실사용 가능한 알림을 만들 수 있습니다.

## 참고 사항

- 이 프로젝트는 로컬에서 실행되는 구조입니다.
- 중앙 서버형 서비스보다, ACT / OverlayPlugin 옆에서 같이 돌리는 도구에 가깝습니다.
- `config/local.config.json`, `data/` 등 로컬 민감 정보와 산출물은 git에서 제외되어 있습니다.

## 현재 상태

현재는 다음이 동작합니다.

- OverlayPlugin 브리지 수집
- A/S급 BNpcNameID 감지
- 일반 몹 테스트
- 리빙 메모리 / 야크텔 밀림 좌표 검증
- 실제 지도 배경 핀 렌더링
- 디스코드 웹훅 전송

추가로 다듬을 수 있는 부분:

- 지역별 핀 위치 미세보정
- `blockHunts`, `insHunts` 처리
- 더 쉬운 배포용 런처 / exe 패키징
