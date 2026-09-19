# 원작 MECCHA CHAMELEON 대비 격차 분석 · 페이즈 업 계획

상태: 초안 (2026-09-19) · 결정 대기
선행 문서: [meccha-reference.md](meccha-reference.md), [gameplay-contract.md](gameplay-contract.md)

## 0. 조사 방법과 신뢰도

- Steam 공식 뉴스(업데이트 노트) 2페이지 열람으로 **공식 확정** 항목을 잡고, 대형 게임 매체(TheGamer·Game Rant·DualShockers·Sportskeeda·Mobalytics·G2A)와 팬 위키·가이드 사이트(mecchaguide, mecchachameleon.io/.help/.wiki 등 15곳 이상)로 세부 규칙을 보강했다. 검색 19회, 링크 열람 30건 이상.
- 팬 위키끼리 **서로 충돌하는 내용**(예: Double 모드가 "술래 2명"인지 "전원 숨고 전원 찾기"인지, 술래 "체력" 페널티 유무, "투시 뷰(3키)")이 있다. 아래 표의 신뢰도는 그 기준이다.
  - **A**: Steam 공식 노트 또는 매체 2곳 이상 일치
  - **B**: 매체 1곳 + 팬 위키 일치
  - **C**: 팬 위키만, 또는 출처 간 충돌

## 1. 원작 규칙 요약 (조사 결과)

### 1.1 라운드 흐름
로비 설정 → 숨는 준비(페인트·자세·위치) → 술래 수색 → **Answer Check Time**(전원 위치 공개) → 결과. 권장 2~10인(상한 24). 술래 1명/4인 권장, 수색 3분 권장. (A)

### 1.2 모드 (A/B)
| 모드 | 규칙 |
|---|---|
| Normal (Basic) | 술래 vs 카멜레온. 잡히면 관전. 시간 내 전원 발견=술래 승, 1명이라도 생존=카멜레온 승 |
| Infection (Increasing Oni) | 잡힌 카멜레온이 즉시 술래로 전환. 눈덩이처럼 술래가 늘어남 |
| Double | **전원이 먼저 숨고**(술래 없음), 시간이 끝나면 **전원이 술래**가 되어 가장 많이·빨리 찾는 사람이 승 (TheGamer·Game Rant 일치. 팬 위키 일부는 "술래 2명"이라 하나 신뢰도 낮음) |
| Reverse Chicken Race (v2.4.0) | 전원 숨은 뒤 한 명씩 "전시실"에서 페인트만 공개 → 나머지가 그 페인트를 단서로 맵에서 찾음. 빨리 찾으면 점수, 안 들키면 점수. 총점 승 |

### 1.3 술래 (A)
- 1인칭 기본, **호스트 옵션으로 Hunter TPS View**(v2.0.0). 우클릭으로 1인칭/3인칭 전환.
- 이동 중인 카멜레온에게는 자유롭게 쏘고, 정지한 대상은 확신할 때만 쏘는 구조.
- **탄약 제한 옵션(v2.3.0)**: 기본 5발(1~99). **빗나가면 1 소모, 맞히면 1 회복, 도망치는(이동 중) 대상에게 쏜 건 무료**. 전원 탄약 소진 = 카멜레온 승.
- 수색 대기 중 술래는 앉기 불가(4.0.1). 대기 중 술래 0명이면 게임 종료(4.1.0).
- (C) "잘못 쏘면 체력 감소", "손전등 좁히기", "투시 뷰(3키)", "이름표 토글(2키)" — 팬 위키만 언급. 공식 확인 안 됨.

### 1.4 카멜레온 (A/B)
- **페인트 모드(F)**: 색상환, RGB/HSV 슬라이더, 팔레트, **Metallic/Roughness 슬라이더**, 3D 스포이드(가운데 클릭 / Space 홀드). 술래가 나온 뒤에도 계속 칠할 수 있음. (B)
- **자세 11종**(6월 업데이트) + 이모트. 벽 붙기: 포즈 메뉴(R)에서 선택, E 위 / Q 아래 / Space 떼기. (B)
- **휘파람/도발(1키)**: 위치 근처를 소리로 알림. **강제 도발**: 기본 45초마다 자동, 호스트가 간격 조정(30~90). 도발 쿨다운 1초 → 강제 최소 간격 5초로 상향(4.1.0). (A)
- **클론(Q)**: 현재 페인트·자세 복제, 최대 2개, X로 삭제, 쿨다운 30초. **클론이 맞으면 본체도 탈락**. 충돌체 있음, 중력 무시(공중 배치 가능). 본체가 자기 클론과 겹쳐도 경고 없음. (B)
- **빨간 점멸**: 몸이 오브젝트에 파고들면 빨갛게 깜빡여 술래에게 드러남. (B)
- **체형**: Blob/Cube, 크기 Petit ×0.5(4.0.0, 호스트 허용 시)·Normal·Plump(3.3.0), Cube 1.4×/1.7×(2.2.0). (A)
- 잡힌 뒤: **자유 카메라 관전 + 휘파람 가능**. 4키 자유 카메라, 5키 술래 따라가기. (B)

### 1.5 점수 (A/B)
- **Missed Spot Ranking**(v1.2.0): 술래 시야 안에 있으면서 들키지 않은 시간·거리로 카멜레온 점수. **이동 중에는 적립 안 됨(v1.5.0)**. 술래 화면에는 30초마다만 갱신(위치 추적 방지). 발견 +점수, 라운드 누적 총점으로 승자.
- Reverse Chicken Race 점수 1000 → 500 (2.4.1).

### 1.6 로비·네트워크 (A)
- 4.1.0에서 **서버 브라우저를 5자리 참가 코드로 교체**, **진행 중 게임은 공개 검색에서 숨김**. 음성 채팅 + 끄기 옵션(4.1.1). 크로스플레이(Switch 2).
- 맵: Mansion, Indoor Country, Sewer, Backrooms, Penguin Hotel, Osaka, Greece, Egypt, Kyoto, Art Museum + 워크숍 모드 맵. 신고 기능(1.7.0). 화면 필터(흑백·호러·모자이크).

## 2. 우리 구현과의 격차

| 영역 | 원작 | 우리 (현재) | 격차 | 신뢰도 | 우선순위 |
|---|---|---|---|---|---|
| 탄약 규칙 | 기본 5, 빗나감 −1, 명중 +1, 이동 중 대상은 무료, 1~99 | 기본 6, 모든 발사 −1, 회복 없음, 3~12 | **규칙 자체가 다름** | A | 높음 |
| 강제 도발 | 기본 45초, 호스트 조정 | 22초 고정 | 옵션 없음, 너무 잦음 | A | 높음 |
| 도발 쿨다운 | 1초(강제 최소 5초) | 8초 | 과도 | A | 중 |
| 술래 TPS | 호스트 옵션 | 항상 우클릭 허용 | 호스트 토글 없음 | A | 중 |
| 점수 | 시야 내 미발견 시간·거리(정지 시) + 발견 점수, 술래 표시 30초 지연 | 발견 +80, 생존 +150, 술래 승 +40 | **핵심 재미(가까이서 속이기)가 점수에 없음** | A/B | 높음 |
| Double 모드 | 전원 숨기 → 전원 찾기 | 없음 | 모드 부재 | A | 중 |
| Reverse Chicken Race | 페인트 공개 → 추리 | 없음 | 모드 부재 | A | 낮음(복잡) |
| 클론 | Q 최대 2, X 삭제, 30초, 클론 피격=탈락 | 없음 | **핵심 심리전 도구 부재** | B | 높음 |
| 재질 슬라이더 | Metallic/Roughness가 위장도에 영향 | 색·범위만 | 위장 축 하나 부족 | B | 중 |
| 색 선택 UI | 색상환·HSV·팔레트 | `<input type=color>` | 모바일에서 특히 불편 | B | 중 |
| 자세 | 11종 + 이모트 | 7종 | 수 부족 | B | 낮음 |
| 벽 붙기 키 | E 위 / Q 아래 / Space 떼기 | Space 위 / Ctrl 아래 / Shift 떼기 | 원작과 다름(이미 안정화된 입력이라 변경 비용 큼) | B | 낮음 |
| 체형·크기 | Petit/Normal/Plump, 호스트 허용 | 단일 | 실루엣 전략 부재 | A | 중 |
| 빨간 점멸 | 오브젝트 침범 시 | 충돌로 애초에 못 들어감 | 해당 없음(설계 차이) | B | — |
| 관전 | 잡힌 뒤 자유 카메라 + 휘파람, 술래 추적 카메라 | 유령 자유 카메라, 휘파람 불가 | 술래 추적·휘파람 없음 | B | 낮음 |
| 진행 중 방 | 공개 검색에서 숨김 | 목록에 표시(관전 입장) | 정책 차이(우리는 관전 입장이 장점) — 호스트 옵션으로 | A | 낮음 |
| 술래 0명 종료 | 있음 | 있음 | — | A | — |
| 대기 중 술래 앉기 금지 | 있음 | 술래는 아예 정지 | — | A | — |
| Answer Check | 있음 | 공개 라운드 10~60초 | — | A | — |
| 음성 채팅 | 있음(끄기 옵션) | 없음 | WebRTC 필요 | A | 낮음 |
| 신고 | 있음 | 없음 | — | A | 낮음 |
| 맵 수 | 10개+ | 4개 | — | A | 별도 계획 |

## 3. 페이즈 업 계획

각 페이즈는 `round.ts` 순수 로직 + 테스트 → UI → headless 검증 순으로 진행한다.

### R1 — 규칙 정합 (원작 A등급 규칙 맞추기)

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| R1-T1 | 탄약: 기본 5, 범위 1~99. `processFire`에서 **명중 시 +1(상한 = 설정값), 빗나감 −1, 대상이 이동 중이면 소모 없음**. `PlayerSnap`에 `moving`(최근 0.4초 이동) 동기화 | `round.ts`, `session`, `GameView` | 테스트: 명중 후 탄 회복, 이동 대상 빗나감 무료 |
| R1-T2 | 강제 도발 간격을 방 옵션 `forcedTauntSec`(기본 45, 15~90)으로. 수동 도발 쿨다운 8초 → 5초(원작 강제 최소 5초와 동일) | `round.ts`, `Lobby`, `GameView` | 대기실에 옵션 노출 |
| R1-T3 | 술래 3인칭을 방 옵션 `hunterTps`(기본 켬)로. 꺼진 방은 우클릭 무시 | `round.ts`, `world.ts` | — |
| R1-T4 | 진행 중 방 목록 숨김을 방 옵션 `listWhilePlaying`(기본 켬=표시)로 | `listing`, `useRoomDirectorySync`, `RoomBrowser` | — |
| R1-T5 | 잡힌 관전자도 휘파람 가능(원작), 술래 따라가기 카메라(숫자 5) | `GameView`, `world.ts` | — |

### R2 — Missed Spot 점수 (원작 점수 철학 이식)

| ID | 태스크 | 완료 조건 |
|---|---|---|
| R2-T1 | 호스트가 매 틱 각 술래 시야(전방 60°, 12m, 시선 차단 검사)에 들어온 **정지한** 카멜레온에게 `가까울수록 높은 점수/초` 적립(`missedPoints[id]`). 이동 중·잡힌 뒤 적립 없음 | 테스트: 시야 안 정지 2초 = N점, 이동 시 0 |
| R2-T2 | 점수표: 발견 +80 유지, 생존 보너스 축소(+60), Missed Spot 누적을 라운드 점수에 합산. 결과 화면에 "속인 시간·최근접 거리" 표시 | 결과 패널 갱신 |
| R2-T3 | 술래 HUD의 Missed Spot 순위는 30초 지연 갱신(위치 추적 방지). 카멜레온 HUD는 "술래 시야 안" 표시 없음(원작과 동일하게 감으로) | — |
| R2-T4 | 계약서 §7 점수 절 갱신 | — |

### R3 — 클론

| ID | 태스크 | 완료 조건 |
|---|---|---|
| R3-T1 | 방 상태 `clones: Record<ownerId, Clone[]>`(위치·자세·fill·blobs·y). Q로 생성(최대 2), X로 삭제, 쿨다운 30초. 호스트 검증 RPC | 테스트: 3개째 거부, 쿨다운 거부 |
| R3-T2 | 렌더: 클론은 캐릭터 리그 재사용(이름표 없음), 충돌체 있음, 중력 없음(점프 중 생성 시 공중) | 캡처 |
| R3-T3 | 술래 발사가 클론에 맞으면 **본체 탈락** + 피드에 "클론 발견" | `processFire` 테스트 |
| R3-T4 | AI 봇도 라운드당 1회 클론 사용 | 연습전 확인 |

### R4 — 위장 도구 확장

| ID | 태스크 | 완료 조건 |
|---|---|---|
| R4-T1 | `PlayerSnap`에 `roughness`(0~1) 추가, 페인트 패널 슬라이더. 표면 샘플 시 표면 재질(패턴별 기본 거칠기표)도 함께 저장 | — |
| R4-T2 | `camouflageMeter`에 재질 일치도 축 추가(색 0.6 / 범위 0.25 / 재질 0.15). `hunterVisibility`에 반영 | 테스트 |
| R4-T3 | 색 선택: 색상환 + HSV 슬라이더 + 최근 색 팔레트(모바일 우선) | 캡처 |
| R4-T4 | 체형 크기 옵션 Petit(0.5)·Normal·Plump(1.25), 호스트 허용 토글. 충돌 반지름·자세 높이·카메라 높이 스케일 | 테스트 |
| R4-T5 | 자세 4종 추가(11종): 기대기, 웅크리기, 팔 벌리기, 거꾸로 | — |

### R5 — 모드 추가

| ID | 태스크 | 완료 조건 |
|---|---|---|
| R5-T1 | **Double**: `mode: "double"`. hide 단계는 전원 카멜레온, hunt 단계는 전원 술래(자기 몸은 남겨둔 클론처럼 맵에 고정). 발견 순서·시간으로 점수, 전원 발견 또는 시간 종료로 끝 | 테스트 + 2탭 검증 |
| R5-T2 | **Reverse Chicken Race**: 전원 숨기 → 한 명씩 "전시" 단계(페인트 미리보기 캔버스 공개) → 수색 → 반복. 큰 작업이라 R5-T1 이후 별도 판단 | — |

### R6 — 운영·부가

| ID | 태스크 |
|---|---|
| R6-T1 | 신고(방 채팅에서 플레이어 신고 → 서버 로그 없음이므로 클라이언트 차단 목록 + 방장 강퇴 유도) |
| R6-T2 | 화면 필터(흑백·호러·모자이크) — 포스트프로세싱, 모바일 제외 |
| R6-T3 | 음성 채팅(WebRTC, Playroom 외부) — 범위 밖 후보 |

## 4. 결정 필요 사항

| # | 질문 | 권장 |
|---|---|---|
| Q1 | R1 탄약 규칙을 원작대로 바꿀지(명중 회복·이동 중 무료) | 바꿈 — 현재 규칙은 "확신 사격"을 유도하지 못함 |
| Q2 | R2 점수: Missed Spot을 넣고 생존 보너스를 줄일지 | 넣음 — 원작의 핵심 재미 |
| Q3 | R3 클론을 R2보다 먼저 할지 | R1 → R2 → R3 순 (점수 없이 클론은 재미가 반감) |
| Q4 | R4-T4 체형 크기: 캐릭터 스케일만 바꿀지, 실제 실루엣(뚱뚱/작음) 모델을 만들지 | 스케일 + 비율(x/z만 키우기)로 시작 |
| Q5 | 벽 붙기 키를 원작(E/Q/Space)으로 바꿀지 | 유지 — 모바일 버튼과 이미 정합 |
| Q6 | Double 모드에서 hunt 단계 시작 시 "자기 몸"을 남기는 방식(클론 시스템 의존) | R3 이후 |

## 5. 출처

공식: [Steam 뉴스](https://steamcommunity.com/app/4704690/allnews/) (4.1.1, 4.1.0, 4.0.x, 3.9.1)
매체: [TheGamer 모드](https://www.thegamer.com/meccha-chameleon-game-modes-guide/), [TheGamer 클론](https://www.thegamer.com/meccha-chameleon-clone-mechanics-guide/), [TheGamer Missed Spot](https://www.thegamer.com/meccha-chameleon-missed-spot-ranking-guide/), [Game Rant 탄약](https://gamerant.com/meccha-chameleon-ammo-limit-settings-explained/), [Game Rant Missed Spot](https://gamerant.com/meccha-chameleon-missed-spot-ranking-points/), [Game Rant 팁](https://gamerant.com/meccha-chameleon-tips-tricks-strategies/), [Game Rant 모드](https://gamerant.com/meccha-chameleon-all-modes/), [Game Rant TPS](https://gamerant.com/meccha-chameleon-hunter-camera-third-person-button/), [Game Rant RCR](https://gamerant.com/meccha-chameleon-reverse-chicken-race-explained/), [Game Rant 맵](https://gamerant.com/all-maps-in-meccha-chameleon/), [DualShockers](https://www.dualshockers.com/meccha-chameleon-tips-and-tricks-we-wish-we-knew-sooner/), [Sportskeeda](https://www.sportskeeda.com/esports/7-best-meccha-chameleon-seeking-tricks-know), [Mobalytics 술래](https://mobalytics.gg/news/guides/meccha-chameleon-seeker-guide), [Mobalytics 카멜레온](https://mobalytics.gg/gamebase/guides/meccha-chameleon-hiding-guide), [G2A 멀티](https://www.g2a.com/news/features/meccha-chameleon-multiplayer-guide-how-to-play-with-friends-host-rooms-and-check-crossplay/), [allthings.how 모드](https://allthings.how/meccha-chameleon-modes-normal-infection-and-double-explained/), [allthings.how 클론](https://allthings.how/meccha-chameleon-clones-why-hitting-a-clone-kills-the-hider/), [allthings.how Plump](https://allthings.how/meccha-chameleon-update-3-3-0-adds-the-plump-body-type/)
팬 위키·가이드(신뢰도 B/C): [mecchaguide 모드](https://mecchaguide.com/guides/game-modes/), [mecchaguide 휘파람](https://mecchaguide.com/guides/whistle-guide/), [mecchaguide 클론](https://mecchaguide.com/guides/clone-system/), [mecchaguide TPS](https://mecchaguide.com/guides/hunter-tps-view/), [mecchachameleon.io 설정](https://mecchachameleon.io/best-settings/), [mecchachameleon.help 모드](https://mecchachameleon.help/articles/game-modes-and-lobby-settings), [mecchachameleonwiki 술래](https://mecchachameleonwiki.com/en/seeker-guide/), [mecchachameleon.best 빨간 점멸](https://mecchachameleon.best/gameplay/why-am-i-blinking-red-in-meccha-chameleon), [games.gg 조작](https://games.gg/meccha-chameleon/guides/meccha-chameleon-controls-guide/), [meccha.wiki 조작](https://meccha.wiki/guides/controls-guide), [mecchachameleon.net 점수](https://mecchachameleon.net/scoring), [Steam 토론: 탄약 회복](https://steamcommunity.com/app/4704690/discussions/0/562535204979426227/), [Steam 토론: Missed Spot](https://steamcommunity.com/app/4704690/discussions/0/572666820169882578/), [Steam 토론: 3인칭](https://steamcommunity.com/app/4704690/discussions/0/571541539431590615/)
