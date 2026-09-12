# 카멜론

메챠 카멜레온 룰을 브라우저로 옮긴 IO 숨바꼭질입니다. 닉네임을 정하고 서버를 고른 뒤 방에 들어가면, 라운드마다 술래와 카멜레온이 무작위로 나뉩니다.

- DB 없음 (방 상태는 메모리·실시간 세션에만 존재, 모두 나가면 사라집니다)
- Vercel 배포용 Next.js 앱
- 실시간은 [Playroom Kit](https://joinplayroom.com/) 세션 (우리 서버/DB가 아님)

## 룰

1. **위장 시간** — 카멜레온만 맵에 있습니다. 자리를 고르고, 스포이드로 배경 색을 찍고, 몸을 칠하고, 자세를 맞춥니다.
2. **수색** — 술래가 입장합니다. 가까이 가서 클릭하면 태그됩니다.
3. **노말** — 잡히면 그 라운드 아웃. 한 명이라도 끝까지 남으면 카멜레온 승.
4. **감염** — 잡히면 술래가 됩니다. 마지막까지 숨은 사람이 이깁니다.

조작: `WASD` 이동, `Shift` 살금, `F` 페인트, `E` 스포이드, `R` / `1-6` 자세, `T` 도발, 클릭 태그(술래).

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000  
멀티플레이는 탭/기기 두 개에서 **같은 서버·같은 방**을 고르면 됩니다. 혼자 페인트 연습은 홈의 **혼자 연습**으로.

## Vercel 배포

1. 이 저장소를 GitHub에 올립니다.
2. [Vercel](https://vercel.com)에서 Import → Framework Preset은 Next.js.
3. 환경 변수는 필요 없습니다.
4. Deploy.

원하면 Playroom 개발자 포털에서 게임 ID를 받아 `NEXT_PUBLIC_PLAYROOM_GAME_ID`를 넣을 수 있습니다. 없어도 동작합니다.

## 구조

- `src/components/GameApp.tsx` — 닉네임 / 서버 / 방
- `src/components/GameView.tsx` — 대기실, 페인트, 라운드
- `src/lib/maps.ts` — 저택 / 농장 / 하수도
- `src/lib/round.ts` — 역할 배정, 태그, 승패
- `src/lib/session.ts` — Playroom 세션 + 로컬 연습
