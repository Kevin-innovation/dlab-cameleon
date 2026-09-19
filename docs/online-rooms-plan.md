# 온라인 방 시스템 개편 계획서

상태: Phase 3 완료 (2026-09-19) · 다음 Phase 4 (대기실 방장·인원 UX)
선행 문서: [gameplay-contract.md](gameplay-contract.md), [meccha-reference.md](meccha-reference.md)

이 문서는 단일 통합 룸 구조를 **채널 1개 + 여러 방** 구조로 바꾸고, 그 과정에서 발견된 온라인 게임성 버그를 함께 고치기 위한 페이즈별 작업 목록이다. 각 태스크는 ID(`P2-T3` 형식)로 참조하며, 작업은 이 순서를 따른다.

---

## 0. 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 방 목록·인원 표시 | **Redis 디렉터리 API** (Vercel Marketplace Upstash Redis). 방 호스트가 heartbeat를 쓰고 홈 화면이 폴링. 게임 데이터는 저장하지 않으며 TTL 캐시로만 사용 → "DB 없음" 정책 유지 |
| 채널 구조 | **채널 1개(한국 서버) + 방 여러 개**. 채널 추가가 가능하도록 `channelId`를 키에 포함하되 UI는 1개만 노출 |
| 방 생성 옵션 | 방 이름, 최대 인원(2~8), 비공개 방(목록 비노출·코드 입장만). 비밀번호 없음 |
| 방장 권한 | 강퇴. 방장 이탈 시 자동 승계(Playroom 기본, 입장 순서). 수동 위임·강제 시작은 이번 범위 제외 |
| 라운드 중 입장 | **관전자(유령)로 입장, 다음 라운드부터 참가**. 목록에는 "게임 중" 표시하되 입장 허용 |
| 테스트 | **Vitest** 추가. 순수 로직(round, 디렉터리, 방 코드)만 단위 테스트. Three.js·Playroom은 제외 |

---

## 1. 현재 상태 분석

### 1.1 구조

- 온라인은 Playroom Kit 단일 룸 (`DEFAULT_ROOM_CODE = DLABCMKR11`, `ROOMS_PER_SERVER = 1`).
- 방 생성/목록/선택 UI 없음. 닉네임 → 즉시 통합 룸 입장.
- 호스트는 Playroom이 지정하고 이탈 시 자동 승계된다(`isHost()`가 바뀜). 그러나 `hostId`가 방 상태에 없어 **본인 외에는 누가 방장인지 알 수 없다**.
- 방 상태(`RoomState`)는 호스트만 쓰고, 클라이언트는 RPC(`shot`, `door`, `chat`)로 명령을 보낸다.

### 1.2 Playroom Kit 제약 (v0.0.97 기준 확인)

| 가능 | 불가능 |
|---|---|
| `insertCoin({ roomCode, maxPlayersPerRoom })` 임의 코드로 방 생성/입장 | **방 목록·인원 조회 API 없음** |
| `matchmaking: true` 빈 공개 방 자동 입장 | 영구 저장(`setPersistentData`)은 **방 단위**라 방 디렉터리로 못 씀 |
| `transferHost(playerId)`, `player.kick()` | 한 페이지에서 `insertCoin` 재호출 불가 → 방 이동은 페이지 리로드 |
| `onDisconnect(cb)` 강퇴·끊김 감지 | 호스트 ID를 직접 조회하는 API 없음 (호스트가 직접 상태에 써야 함) |
| `reconnectGracePeriod` 내 재접속 시 동일 ID 유지 | |

### 1.3 발견된 버그·문제

| ID | 심각도 | 내용 | 위치 |
|---|---|---|---|
| B1 | **높음** | 라운드 진행 중 입장한 플레이어가 `roleOf()`에서 `hider`로 판정 → 살아있는 카멜레온으로 계산되어 술래가 전원 잡아도 라운드가 안 끝나고, 늦게 들어온 사람이 생존 점수(+150)를 받음 | `round.ts:roleOf/hiderAlive`, `GameView.tsx` `seenRound` 초기화 |
| B2 | 중간 | 호스트 승계 시 새 호스트의 `hostTauntSeq`가 비어 있어 모든 플레이어의 마지막 도발이 1회씩 재생됨 | `GameView.tsx` 게임 루프 |
| B3 | 중간 | `reconnectGracePeriod: 4000` — 모바일 새로고침이 4초를 넘기면 새 ID로 입장되어 점수·역할 초기화 | `session.ts` |
| B4 | 중간 | 재접속 시 URL 해시(`#r=CODE`)의 코드를 무시하고 항상 `DEFAULT_ROOM_CODE`로 접속 | `GameApp.tsx` |
| B5 | 중간 | 준비 안 한 AFK 플레이어 1명이 있으면 호스트가 시작 불가 (강퇴 수단 없음) | `Lobby` |
| B6 | 낮음 | `result → lobby` 전환 시 `ammo`, `doors`, `lastTag`, `feed`가 남음 | `round.ts:tickRoom` |
| B7 | 낮음 | 닉네임 중복 허용 → 같은 이름 2명 구분 불가 | `session.ts` |
| B8 | 낮음 | HUD `setInterval(120ms)`가 `blobs` 포함 전체 스냅샷을 React state로 밀어 넣어 초당 8회 전체 리렌더 | `GameView.tsx` |
| B9 | 낮음 | 강퇴·연결 끊김 시 사용자에게 이유가 표시되지 않음 (`onDisconnect` 미사용) | `session.ts` |
| S1 | 구조 | `GameView.tsx` 2,260줄, `world.ts` 1,494줄. 로비/결과/소셜 패널이 한 파일에 있어 방 UI 확장이 어려움 | — |
| S2 | 구조 | 테스트 러너 없음(`audit-gameplay` 스크립트만). round 로직 회귀를 잡을 수단 없음 | — |

---

## 2. 목표 아키텍처

### 2.1 화면 흐름

```text
홈(닉네임)
  └─> 방 목록 (한국 서버)
        ├─ 빠른 참가        → 공개 방 중 자리 있는 방 (없으면 새 방 생성)
        ├─ 방 만들기        → 이름·인원·비공개 설정 → 코드 발급 → 대기실
        ├─ 코드로 참가      → 비공개 방 포함
        └─ 목록에서 선택    → 대기실 (게임 중이면 관전 입장)
대기실 ─> 라운드 ─> 결과 ─> 대기실 …
나가기 ─> 방 목록 (페이지 리로드, 닉네임 유지)
```

### 2.2 방 코드

- 형식: `{채널}{6자 랜덤}` 예) `KR7F3K9Q`. 혼동 문자(`0 O 1 I L`) 제외.
- Playroom은 URL 해시를 `#r=R{code}`(앞에 `R` 하나 추가)로 쓴다. `parseRoomCode`가 해시 분기에서만 이 `R`을 제거한다. 초대 링크는 `/#r={code}` 형식으로 만든다.
- `makeRoomCode`는 제거하고 `src/lib/rooms/code.ts`에 `generateRoomCode(channelId)`, `parseRoomCode(input)`(대소문자·공백·`#r=` 허용)를 둔다.
- URL: 입장 후 Playroom이 `#r=CODE`를 유지하므로 재접속·공유 링크로 그대로 사용.

### 2.3 방 디렉터리 (Redis)

**저장 단위** — `cm:room:{code}` (JSON `{ token, listing }` 한 값, TTL 25초). 토큰과 리스팅을 한 키에 두어 heartbeat 1회 = Redis 명령 2개(최초 등록만 3개)로 유지한다 — Upstash 무료 한도(월 50만 명령) 대응.

```ts
type RoomListing = {
  code: string;
  channelId: string;
  name: string;          // 1~20자
  hostName: string;
  players: number;
  maxPlayers: number;    // 2~8
  phase: Phase;
  mapId: string;
  mode: Mode;
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
};
```

**인덱스** — `cm:rooms:{channelId}` (Set of code). 목록 조회 시 `SMEMBERS` → `MGET`(2명령) → 없는(만료된) 코드는 `SREM`으로 지연 제거.

**쓰기 권한** — 방을 만든 클라이언트가 `ownerToken`(랜덤 32자)을 생성해 첫 heartbeat에 함께 보내면 Redis에 `room:{..}:token`으로 저장(TTL 동일). 이후 heartbeat는 토큰이 일치해야 한다. 토큰은 Playroom 방 상태 `room.directoryToken`에도 저장해 **호스트가 승계돼도 새 호스트가 이어서 heartbeat**할 수 있게 한다. 방 밖의 클라이언트는 토큰을 모르므로 남의 방 목록을 조작할 수 없다.

**API (Next.js Route Handler, Node 런타임)**

| 메서드 | 경로 | 역할 | 제한 |
|---|---|---|---|
| `GET` | `/api/rooms?channel=kr1` | 공개 방 목록 (`isPrivate=false`만) | `Cache-Control: no-store`, 응답 ≤ 50개 |
| `POST` | `/api/rooms/heartbeat` | 호스트가 **10초**마다 `RoomListing + ownerToken` 전송 (페이즈·인원 변화 시 즉시 1회 추가) | 코드당 2초 미만 반복 거부(429), 본문 2KB 초과 413, 스키마 검증 400, 토큰 불일치 401 |
| `DELETE` | `/api/rooms/{code}` | 호스트가 방을 닫을 때 즉시 제거 (선택, 없어도 TTL로 소멸) | 토큰 필요 |
| `GET` | `/api/rooms/{code}` | 코드 입장 전 존재·인원·비공개 여부 확인 | 비공개 방도 코드가 정확하면 응답 |

- 클라이언트 라이브러리: `@upstash/redis` (REST, 서버리스 친화). 환경 변수는 Marketplace 연동이 주입하는 `KV_REST_API_URL` / `KV_REST_API_TOKEN`(또는 `UPSTASH_REDIS_REST_*`)를 사용하며 시작 시 존재 여부를 검증한다.
- Redis가 없을 때(로컬 개발): `process.env`가 비어 있으면 in-memory Map 어댑터로 대체하고 콘솔에 경고 1회. 배포 환경에서는 필수.
- 폴링: 방 목록 화면이 **5초** 간격 `GET`. 탭이 숨겨지면 중단.
- 비용 추정(무료 한도 월 50만 명령): 방 1개가 하루 8시간 열려 있으면 heartbeat 2,880회 × 2 = 5,760명령/일 ≈ 17만/월. 목록 폴링은 보는 동안만 12회/분 × 2명령. 동시 방 3개 + 상시 열람 몇 명 수준까지 무료 범위.

### 2.4 RoomState 확장

```ts
type RoomState = {
  // 기존 필드 유지
  hostId: string;               // 호스트가 매 틱 자신의 id로 갱신
  hostName: string;
  roomName: string;             // 방 만들기에서 입력
  maxPlayers: number;           // 2~8
  isPrivate: boolean;
  channelId: string;
  directoryToken: string;       // 디렉터리 heartbeat 토큰
  participantIds: string[];     // 이번 라운드 참가자 (beginRound에서 고정)
  system: SystemMessage[];      // "OOO님이 방장이 되었습니다" 등, chat와 분리
};
```

- `roleOf(room, id)`: `phase !== "lobby"`이고 `participantIds`에 없으면 `spectator`.
- `hiderAlive`, `isHunter`, `tickRoom`의 승패 판단은 `participantIds` 기준으로만 계산한다.
- `sanitizeRoom`이 새 필드의 범위·길이를 검증한다.

### 2.5 호스트 승계

- 호스트 게임 루프: `isHost() && room.hostId !== myId`이면 `hostId/hostName` 갱신 + `system` 메시지 추가 + `hostTauntSeq`·`lastShotSeq`를 현재 플레이어 상태값으로 **초기화**(B2).
- 새 호스트는 `room.directoryToken`으로 heartbeat를 이어받는다.
- 대기실·소셜 패널·Tab 현황에서 방장 표시(왕관 아이콘 + "방장").

### 2.6 강퇴·끊김

- 방장이 나갈 때는 항상 `closeRoom`으로 리스팅을 지운다. 남은 사람이 있으면 새 방장의 `hostName` 변경이 heartbeat 시그니처를 바꿔 수 초 안에 다시 등록된다. (Playroom이 나간 플레이어를 재접속 유예 20초 동안 참가자로 유지해 "마지막 1명" 판정이 불가능하기 때문.)
- 호스트 전용 `session.kick(playerId)` → `player.kick()`.
- 모든 클라이언트는 `onDisconnect((e) => …)`를 등록하고 `sessionStorage`에 사유(`kicked | lost | left`)를 남긴 뒤 `/`로 이동. 홈이 사유에 맞는 안내를 1회 표시한다.
- 강퇴된 플레이어의 코드 재입장은 막지 않는다(비공개 방은 코드를 바꿀 수 없으므로 범위 밖으로 둔다).

### 2.7 재접속

- `reconnectGracePeriod`를 **20000ms**로 상향(B3).
- 홈 진입 시 `#r=CODE`가 있고 닉네임이 저장돼 있으면 그 코드로 자동 재접속(B4). 코드가 디렉터리에 없어도(비공개 방) Playroom 접속을 시도한다.
- 접속 실패 코드별 메시지: 방 없음 / 가득 참 / 타임아웃 / 네트워크.

---

## 3. 페이즈별 태스크

각 페이즈 완료 규칙은 `gameplay-contract.md` §7을 따른다: 로컬 검증 → 데스크톱·모바일 확인 → 변경 파일·잔여 위험 기록 → 커밋.

### Phase 0 — 기반 정비

목표: 테스트 러너와 타입 기반을 먼저 세워 이후 페이즈가 TDD로 진행되게 한다.

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| P0-T1 | Vitest 설치·설정. `npm test`, `npm run test:watch` 스크립트. `tsconfig` 경로 별칭(`@/`) 인식 | `package.json`, `vitest.config.ts` | `npm test`가 빈 상태로 통과 |
| P0-T2 | `round.ts` 현재 동작 회귀 테스트 작성 (`hunterCountFor`, `beginRound` 역할 배정, `processFire` 사거리·탄약, `tickRoom` 페이즈 전이·승패, `sanitizeRoom` 경계값) | `src/lib/__tests__/round.test.ts` | 기존 동작 기준 전부 통과 (B1 케이스는 `todo`로 표시) |
| P0-T3 | `RoomState` 확장 필드 추가 + `emptyRoom`/`sanitizeRoom` 반영 (§2.4). 기본값은 기존 동작을 바꾸지 않게 설정 | `types.ts`, `round.ts` | `npm run build`, `npm test` 통과 |
| P0-T4 | `config.ts` 정리: `ROOMS_PER_SERVER`, `DEFAULT_ROOM_NUMBER`, `makeRoomCode`, `DEFAULT_ROOM_CODE` 제거 예정 표시. `CHANNELS = [{ id: "kr1", name: "한국 서버" }]`, `MIN_PLAYERS = 2`, `ROOM_NAME_MAX = 20`, `DIRECTORY_HEARTBEAT_MS = 4000`, `DIRECTORY_TTL_S = 12`, `RECONNECT_GRACE_MS = 20000` 추가 | `config.ts` | 참조 깨짐 없음 |
| P0-T5 | 이 문서를 README 구조 섹션과 `gameplay-contract.md` §5 시스템 경계에 링크 | `README.md`, `docs/gameplay-contract.md` | — |

### Phase 1 — 게임 로직 버그 수정 (방 시스템과 무관하게 먼저 고침)

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| P1-T1 | **B1** `beginRound`가 `participantIds`를 고정하고 `roleOf/hiderAlive/isHunter/tickRoom/finishRound/processFire`가 이를 기준으로 계산. 라운드 중 입장자는 `spectator` | `round.ts` | 테스트: 라운드 중 참가자 추가 시 승패·점수에 영향 없음 |
| P1-T2 | **B1** 클라이언트: 마운트 시 `phase !== "lobby"`이면 유령 모드로 스폰(관전 안내 오버레이 "다음 라운드부터 참가"). `seenRound` 초기화 로직을 `participantIds` 포함 여부로 변경 | `GameView.tsx` | 2탭 시나리오: 수색 중 3번째 탭 입장 → 유령, 술래가 2번째 탭 잡으면 즉시 술래 승 |
| P1-T3 | **B2** 호스트 획득 시점에 `hostTauntSeq`·`lastShotSeq`·`lastDoorAt`를 현재 플레이어 상태로 초기화하는 `onBecomeHost` 훅 추가 | `GameView.tsx`, `session.ts` | 호스트 탭 닫은 뒤 새 호스트 화면에 도발 재생 없음 |
| P1-T4 | **B6** `result → lobby` 전환 시 `ammo`, `doors`, `lastTag`, `feed`, `taunts`, `participantIds` 초기화 | `round.ts` | 테스트 추가 |
| P1-T5 | **B7** 입장 시 같은 이름이 있으면 `이름#2` 형태로 접미. 호스트가 `name` 충돌을 검사해 `displayName` 플레이어 상태에 기록, UI는 `displayName` 우선 | `session.ts`, `readSnap` | 같은 닉네임 2탭 입장 시 구분 표시 |
| P1-T6 | **B8** HUD 인터벌에서 `blobs`를 제외한 경량 스냅샷을 만들고, 이전 값과 얕은 비교로 변경된 경우에만 `setPeople`. 페인트 미리보기는 별도 구독 | `GameView.tsx`, `session.ts` (`lightSnapsFrom`) | React Profiler로 대기실 idle 리렌더 ≤ 1회/초 |

### Phase 2 — 방 디렉터리 백엔드

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| P2-T1 | Upstash Redis 연동: `vercel:marketplace` 스킬 절차로 Vercel 프로젝트에 Upstash Redis 설치, `vercel env pull`로 로컬 `.env.local` 생성. Vercel CLI가 구버전(44.x)이므로 먼저 `npm i -g vercel@latest` | — | `KV_REST_API_URL`이 로컬·Preview·Production에 존재 |
| P2-T2 | `@upstash/redis` 추가. `src/lib/rooms/store.ts`에 `RoomDirectoryStore` 인터페이스(`upsert`, `list`, `get`, `remove`)와 Redis 구현 + in-memory 구현. 환경 변수 없으면 메모리 + 경고 | `src/lib/rooms/store.ts` | 메모리 구현으로 단위 테스트 통과 |
| P2-T3 | `src/lib/rooms/listing.ts`: `RoomListing` 타입, `validateListing(input): RoomListing \| Error`(길이·범위·enum 검증), `isStale(listing, now)`, 정렬(대기실 우선 → 인원 많은 순) | `src/lib/rooms/listing.ts` | 테스트: 경계값·잘못된 입력 거부 |
| P2-T4 | `src/lib/rooms/code.ts`: `generateRoomCode`, `parseRoomCode`, `isValidRoomCode` | `src/lib/rooms/code.ts` | 테스트: 혼동 문자 미포함, `#r=kr7f3k9q ` 파싱 |
| P2-T5 | Route Handlers 구현 (§2.3 표). 토큰 검증, 코드당 heartbeat 최소 간격, 본문 크기 제한(2KB), 실패 시 `{ ok:false, error }` 일관 응답 | `src/app/api/rooms/route.ts`, `src/app/api/rooms/[code]/route.ts`, `src/app/api/rooms/heartbeat/route.ts` | 테스트: 핸들러를 메모리 스토어로 호출해 200/400/401/429 확인 |
| P2-T6 | 클라이언트 `src/lib/rooms/client.ts`: `fetchRooms(channel)`, `fetchRoom(code)`, `sendHeartbeat(listing, token)`, `closeRoom(code, token)`; 네트워크 실패는 throw 대신 `Result` 반환 | `src/lib/rooms/client.ts` | — |

### Phase 3 — 방 생성·입장 흐름 (프론트)

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| P3-T1 | `GameApp.tsx`를 화면별로 분리: `screens/Home.tsx`(닉네임), `screens/RoomBrowser.tsx`(목록), `screens/CreateRoomModal.tsx`, `screens/JoinByCodeModal.tsx`. `Screen` 타입에 `rooms` 추가 | `src/components/screens/*` | 기존 홈 동작 유지, 빌드 통과 |
| P3-T2 | 방 목록 화면: 3초 폴링, 카드에 방 이름·방장·인원 `n/max`·맵·"대기 중/게임 중"·입장 버튼. 가득 찬 방은 비활성. 빈 목록 안내. 탭 숨김 시 폴링 중단 | `RoomBrowser.tsx` | 2탭에서 방 만들면 다른 탭 목록에 4초 내 표시 |
| P3-T3 | 방 만들기: 이름(기본 `{닉네임}의 방`)·최대 인원(2~8, 기본 8)·비공개 토글 → `generateRoomCode` → `connectOnline({ roomCode, maxPlayers, roomMeta })` → 호스트가 초기 `RoomState`에 `roomName/maxPlayers/isPrivate/channelId/directoryToken` 기록 | `CreateRoomModal.tsx`, `session.ts` | 생성 직후 대기실 헤더에 방 이름·코드 표시 |
| P3-T4 | 코드로 참가: 입력 → `parseRoomCode` → `fetchRoom(code)`로 존재·인원 확인(없으면 Playroom 직접 시도) → 접속. 오류 메시지 세분화 | `JoinByCodeModal.tsx` | 비공개 방 코드로 입장 성공 |
| P3-T5 | 빠른 참가: 목록에서 `phase==="lobby" && players<maxPlayers`인 첫 공개 방, 없으면 기본 설정으로 새 방 생성. (Playroom `matchmaking`은 우리 디렉터리와 불일치할 수 있어 사용하지 않음) | `RoomBrowser.tsx` | — |
| P3-T6 | **B4** `#r=CODE` 해시 기반 자동 재접속. 홈에서 해시가 있고 닉네임이 있으면 해당 코드로 접속, 실패하면 해시 제거 후 목록으로 | `GameApp.tsx` | 라운드 중 새로고침 → 20초 내 같은 ID로 복귀 |
| P3-T7 | 호스트 heartbeat 루프: `session.kind==="online" && isHost()`일 때 4초마다 `sendHeartbeat`. 페이즈·인원 변화 시 즉시 1회 추가 전송(최소 간격 준수). `leave()`·`beforeunload`에서 마지막 호스트면 `closeRoom` | `GameView.tsx` 또는 `useRoomDirectorySync` 훅 | 목록의 인원·페이즈가 실제와 4초 내 일치 |
| P3-T8 | `config.ts`에서 `DEFAULT_ROOM_CODE`·`makeRoomCode`·`ROOMS_PER_SERVER` 제거, 참조 정리 | `config.ts`, `GameApp.tsx` | grep 결과 0건 |

### Phase 4 — 대기실 방장·인원 UX

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| P4-T1 | `Lobby`, `RoomSocialPanel`, `ScoreTab`, `ResultPanel`을 `src/components/game/` 아래 개별 파일로 분리 (S1 1단계) | `src/components/game/*` | 동작 변화 없음, `GameView.tsx` < 1,400줄 |
| P4-T2 | 호스트가 `hostId/hostName`을 갱신하고 승계 시 `system` 메시지 추가 (§2.5). 채팅 로그에 시스템 메시지를 구분 스타일로 표시 | `GameView.tsx`, `round.ts`, `RoomSocialPanel.tsx` | 호스트 탭 종료 → 다른 탭 모두에 "OOO님이 방장이 되었습니다" |
| P4-T3 | 방장 표시: 대기실 목록·소셜 패널·Tab 현황에 왕관 아이콘 + "방장" 라벨. 헤더에 `방 이름 · n/max · 코드` 표시, 코드 복사 버튼 | `Lobby.tsx`, `RoomSocialPanel.tsx`, `ScoreTab.tsx` | 모든 탭에서 동일한 방장 표시 |
| P4-T4 | **B5** 강퇴: 방장에게만 각 플레이어 행에 "강퇴" 버튼(확인 1회). `session.kick(id)` 구현 | `Lobby.tsx`, `session.ts` | 강퇴된 탭이 홈으로 이동하고 안내 표시 |
| P4-T5 | **B9** `onDisconnect` 등록 → 사유 저장 → 홈 안내("강퇴되었습니다" / "연결이 끊겼습니다 · 다시 입장"). 재입장 버튼은 마지막 코드로 연결 | `session.ts`, `Home.tsx` | — |
| P4-T6 | 관전 입장 안내: 라운드 중 입장자 화면 상단에 "관전 중 · 다음 라운드부터 참가 (남은 시간 n초)" 오버레이. 대기실 목록에 "관전" 상태 표시 | `GameView.tsx`, `presenceStatus` | — |
| P4-T7 | `maxPlayers`를 UI 전반의 `MAX_PLAYERS` 하드코딩 대신 `room.maxPlayers`로 교체 (접속자 `n/max`, 가득 참 메시지) | `GameView.tsx`, `GameApp.tsx` | grep `MAX_PLAYERS` 사용처가 상한 검증에만 남음 |

### Phase 5 — 안정화·최적화

| ID | 태스크 | 파일 | 완료 조건 |
|---|---|---|---|
| P5-T1 | 디렉터리 API 남용 방지: heartbeat/코드 조회에 IP 기준 간단 레이트리밋(Redis `INCR`+`EXPIRE`, 분당 60회) | `src/app/api/rooms/*` | 테스트: 초과 시 429 |
| P5-T2 | 목록 폴링 백오프: 실패 시 3→6→12초, 성공 시 복귀. 오프라인이면 폴링 중단 + 안내 | `RoomBrowser.tsx` | — |
| P5-T3 | `session.ts` 분리: `session/online.ts`, `session/practice.ts`, `session/types.ts` (S1 2단계) | `src/lib/session/*` | import 경로만 변경, 동작 동일 |
| P5-T4 | 방 상태 크기 점검: `chat` 60개 + `system` 30개 상한, `feed`·`taunts` 기존 상한 유지. `setState("room")` 페이로드가 16KB를 넘지 않는지 로그로 확인 | `round.ts` | — |
| P5-T5 | (보류) `GameView` 게임 루프를 `useGameLoop` 훅으로 추출 — 입력 처리 회귀 위험 대비 이득이 작아 이번 개편 범위에서 제외 | `src/components/game/useGameLoop.ts` | 별도 작업 |

### Phase 6 — 검증·문서

| ID | 태스크 | 완료 조건 |
|---|---|---|
| P6-T1 | 시나리오 검증 (데스크톱 2탭 + iPhone Safari 1대): 방 생성 → 목록 노출 → 입장 → 인원 표시 → 라운드 → 호스트 이탈 → 승계 → 강퇴 → 재접속 → 방 닫힘(목록 소멸) | 체크리스트 전부 통과, 결과를 이 문서 §5에 기록 |
| P6-T2 | `README.md`, `gameplay-contract.md` §1·§5·§12를 새 방 구조로 갱신. `meccha-reference.md` §4 "통합 방 1개" 문구 수정 | 문서와 UI 문구 일치 |
| P6-T3 | `npm run lint`, `npm test`, `npm run build`, `npm run audit:gameplay` 전부 통과 후 커밋·푸시 | — |

---

## 4. 리스크·확인 필요 사항

| 리스크 | 대응 |
|---|---|
| Playroom `maxPlayersPerRoom`이 방 생성자 값으로 서버에 고정되는지, 입장자 값이 덮어쓰는지 미확인 | P3-T3에서 2탭으로 실험: 생성자 4, 입장자 8로 넣고 5번째 입장이 거부되는지 확인. 덮어쓰면 디렉터리의 `maxPlayers`를 입장 시 그대로 전달 |
| `insertCoin`에 `roomCode`와 URL 해시가 동시에 있을 때 우선순위 | P3-T6에서 확인. 필요하면 접속 전 해시를 직접 세팅 |
| 강퇴된 클라이언트가 `onDisconnect`의 `reason`으로 강퇴를 구분할 수 있는지 미확인 | P4-T5에서 실제 `code/reason` 값을 로그로 확인 후 매핑. 구분 불가하면 호스트가 강퇴 직전 대상 플레이어 상태에 `kickedAt`을 써서 클라이언트가 읽게 함 |
| 호스트 heartbeat가 클라이언트에서 오므로 인원 수를 조작할 수 있음 | 토큰으로 방 밖 조작은 차단. 방 안 사용자의 조작은 목록 표시에만 영향 → 허용 범위 |
| Upstash 무료 티어 명령 수 제한(월 50만) | P2에서 heartbeat당 명령 2개·주기 10초·폴링 5초로 조정해 방 1개 8h/일 기준 월 ~17만. 리소스 `camelon-rooms`가 Free 플랜인지 대시보드에서 확인 필요 (CLI에 `--plan` 미지정 → 기본 플랜) |
| 한 페이지에서 `insertCoin` 재호출 불가 | 방 이동은 항상 리로드. 닉네임·사유는 `sessionStorage`로 전달 |

---

## 5. 진행 기록

| 날짜 | 페이즈 | 결과 | 잔여 위험 |
|---|---|---|---|
| 2026-09-19 | 계획 | 결정 사항 확정, 문서 작성 | — |
| 2026-09-19 | P3 | `GameApp`을 `screens/Home`, `RoomBrowser`, `CreateRoomModal`, `JoinByCodeModal` + `useRoomList`(5초 폴링, 탭 숨김 시 중단, 실패 백오프)로 분리. 방 만들기(이름·인원 2~8·비공개) → `generateRoomCode` → `connectOnline({ roomCode, maxPlayers, meta })`; 빈 방의 첫 호스트가 `roomName/maxPlayers/isPrivate/channelId/directoryToken/createdAt` 시드. 코드 입장(디렉터리 조회 → 404면 안내, 서버 불통이면 직접 시도), 빠른 참가(대기실+빈자리 우선, 없으면 생성), `#r=` 해시 재접속(B4), `useRoomDirectorySync` 호스트 heartbeat(10초 + 변경 시 즉시), 방장 퇴장 시 `closeRoom`. 대기실 제목=방 이름, 인원 `n/max`, 코드 복사(초대 링크). 구 상수(`DEFAULT_ROOM_CODE` 등) 제거. headless 검증: 생성→목록 노출(1/4)→목록 입장(2/4)→코드 입장(3/4)→목록 반영→전원 퇴장 시 목록 소멸 9/9, 새로고침 재접속·방장 승계·리스팅 부활 4/4 | Playroom `maxPlayersPerRoom` 우선순위(§4)는 미실험. 비호스트 퇴장 직후 인원은 유예 20초 동안 1 많게 표시될 수 있음. 시스템 메시지 UI는 P4-T2 |
| 2026-09-19 | P2 | `src/lib/rooms/`: `code.ts`(코드 생성·파싱), `listing.ts`(검증·정렬), `store.ts`(인터페이스 + 메모리 + Redis 구현, 가짜 클라이언트로 명령 수까지 테스트), `api.ts`(핸들러 로직), `server.ts`(env → 스토어, 미설정 시 dev는 메모리·prod는 503), `client.ts`(Result 반환 fetch 래퍼). Route: `GET /api/rooms`, `POST /api/rooms/heartbeat`, `GET/DELETE /api/rooms/[code]`. Vercel CLI 59로 `dlab-cameleon` 링크 + Upstash `camelon-rooms` 프로비저닝·연결·`.env.local` pull. 메모리·실 Redis 양쪽으로 API 왕복(200/429/401/400/404) 확인. 테스트 107개 | Homebrew `vercel`(44)이 PATH를 가림 → nvm 경로 `~/.nvm/versions/node/v23.11.0/bin/vercel` 사용. 설치기가 `.agents/`, `.claude/`, `skills-lock.json`(Upstash 스킬 문서)을 추가함 — 커밋 여부는 사용자 결정. Free 플랜 여부 대시보드 확인 필요 |
| 2026-09-19 | P1 | B1: `participantIds` 기반 `isParticipant/roleOf/hiderAlive/isGhost`, 라운드 중 입장자는 유령 관전("관전 중 · 다음 라운드부터 참가" 오버레이, 접속자 목록 "관전"). B2: 호스트 획득 시 `hostTauntSeq` 초기화. `claimHost`로 `hostId/hostName` 기록 + 승계 시스템 메시지, 대기실 "방장" 라벨 전원 표시. B3: 재접속 유예 20초. B6: result→lobby에서 ammo/doors/lastTag/feed/taunts/participantIds 초기화. B7: `uniqueNickname` (`이름#2`, 동시 충돌은 큰 id만 변경). B8: HUD 상태는 내용 변경 시에만 갱신, Lobby/RoomSocialPanel/ScoreTab `memo`, nowTick 500ms. 테스트 56개. headless 2탭+늦은 입장 시나리오로 닉네임 중복·방장 라벨·관전 오버레이·술래 이탈 시 라운드 종료 확인 | 실기기 검증은 사용자가 사이트에서 직접 수행 예정. 시스템 메시지 UI 표시는 P4-T2 |
| 2026-09-19 | P0 | Vitest 설정(`npm test`), round 회귀 테스트 39개 + B1 todo, `RoomState` 메타 필드·`system` 메시지 추가 및 `sanitizeRoom` 검증, config 상수 추가(구 상수는 `@deprecated`), 문서 링크. `safeIds`가 slice 후 dedupe 하던 순서를 dedupe 후 slice로 수정 | 새 필드는 아직 UI·세션에서 쓰이지 않음(P1~P4에서 연결) |
