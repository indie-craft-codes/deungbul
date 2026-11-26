# 증명 노트: 넷이 두는 판 게임 "반딧불 연못"을 문서만으로 만들기

> 이 게임은 2026-11-27에 저장소에서 지웠다. 코드는 커밋 `7e347c9`에 있다 (`git checkout 7e347c9 -- games/<이름>`). 이 기록은 틀을 검증한 기록으로 남긴다.

처음 보는 개발자로서 `docs/making-a-game.md`(1~12절과 14절 '판으로 나뉘는 게임')와 앞의 기록(`docs/proof-stepstone.md`, `docs/proof-dalmuri.md`)을 읽고
틀의 판 모듈(`rooms`)과 턴제 접점으로 `games/pond/`를 만들었다. 바탕 커밋은 `7a67da4`, 가지 `feat/boardgame`. **`engine/`은 한 줄도 고치지 않았다.**
다른 게임의 코드(`games/stepstone`, `games/sample` …)는 읽지 않았다. 문서가 본보기로 가리키는 `engine/test/core/`(12절 '공 마당')와 입구의 타입 선언·주석은 읽었다.
형식: 문서의 빈 곳(찾은 절 / 찾은 것 / 없던 것과 답한 소스), 게임 안의 꼼수, 틀 수리 제안.

걸린 시간: 2026-11-26 23:10쯤 복사본을 만들고 문서를 읽기 시작, 23:30 규칙·서버·화면이 타입 검사를 통과, 23:35 시험 세 묶음 통과, 23:50 화면 확인(PC·폰, 한국어·영어, 사람 셋) 끝. 약 한 시간 반(시험·문서 포함 두 시간 남짓).

## 게임

- **반딧불 연못 (Firefly Pond)**: 넷이 밤의 연못에 둘러앉아 미끼 패를 **엎어** 던져 물고기를 낚는다. 한 판 8번 던지기, 사람끼리 5~8분(컴퓨터 셋과는 1~2분).
  - 미끼 패 1~10이 넷씩(40장). 한 사람에게 여덟 장(손패는 자기만 본다). 연못의 나루 셋(가·나·다)에 물고기가 한 마리씩(크기 = 점수 1~5).
  - 한 번의 던지기: 선 낚시꾼부터 한 사람씩 미끼 한 장을 나루 하나에 엎어 던진다. **누가 어느 나루에 던졌는지는 모두 보지만 수는 모른다.**
  - 모두 던지면 펼친다. 나루마다 **같은 수의 미끼는 서로 얽혀 빠지고**, 남은 미끼 가운데 가장 큰 수가 낚는다. 단 **물고기는 제 크기보다 작은 미끼는 물지 않는다.** 아무도 못 낚은 물고기는 1씩 자란다(8까지), 낚인 자리에는 새 물고기.
  - 던지기마다 선이 왼쪽으로 한 자리 옮긴다(여덟 번이면 누구나 두 번씩 선, 두 번씩 끝). 끝: 점수 → 낚은 수 → 그래도 같으면 비김.
  - 한 차례 20초(넘으면 컴퓨터처럼 대신 던진다), 끊기면 60초 기다림(넘으면 몰수: 그 자리만 빠지고 셋이 이어 간다), 기권, 다시 하기(자리가 한 칸 돈다). 전적(판·승·최고 점수)은 캐릭터 저장.
- 판의 흐름: 들판의 나루터(연못 남쪽) → 틀의 대기실 창('빠른 판' / '자리 펴기' / 목록 / '컴퓨터와 낚기', 20초 기다리면 빈자리에 컴퓨터) → 넷이 연못의 네 귀퉁이에 앉는다(내 자리가 늘 화면 아래: `setCameraYaw`) → 아래의 '내 미끼' 창에서 패를 고르고 나루(창의 단추, 3D의 물고기 누르기, Z·X·C)로 던진다 → 펼치면 가운데 알림과 물고기가 낚은 사람 쪽으로 뛴다 → 결과 창(내 등수).
- 징검돌과 다른 점(이번에 시험한 것): **넷의 차례**, **숨긴 정보**(손패, 엎은 미끼), **바퀴마다 바뀌는 선**, 사람이 셋 이상일 때의 끊김·몰수·기권, 등수가 있는 결과.
- 파일: `shared/content/`(맵·수치·자리), `shared/rules.ts`(틀에 기대지 않는 규칙과 컴퓨터), `shared/pond.ts`(선언과 개인 상태의 모양), `server/pond.ts`(판 모듈에 주는 규칙·엔티티·명령·저장), `client/`(겉모습, 판 화면, 문장 두 벌), `test/`(규칙·판·소켓, 검사 115개).

## 문서의 빈 곳 (중요한 차례)

1. **바퀴마다 먼저 두는 자리를 돌리는 길** (이 게임의 핵심 규칙)
   - 찾은 절: 14절 '서버' — "자리 번호(0부터)가 곧 편이고, 자리 0이 먼저 둔다", `againSwap`(다시 하기에서 자리 돌리기), `Room`의 칸 목록에 `first`.
   - 없던 것: 한 판 안에서 바퀴마다 선을 바꾸는 법. `room.first`를 게임이 바꿔도 되는지, 틀이 바퀴를 무엇으로 세는지, `turnStart` 안에서 `g.rooms.pass`를 불러도 되는지.
   - 답한 소스: `engine/server/game/systems/rooms.ts`의 `pass`(마친 자리의 `turnEnd`를 **먼저** 부르고, 그 뒤 `room.first`에 대해 상대 자리로 바퀴를 센다)와 `begin`(`turnStart`가 마지막 줄).
   - 꼼수: 아래 '게임 안의 꼼수' 1.
2. **셋 이상의 판에서 기권·몰수가 어떻게 되나**
   - 찾은 절: 14절 표 "기권(`'resign'`)", "지나면 몰수(까닭 `'left'`)"; `RoomDef.graceS`의 주석 "두는 중이면 몰수".
   - 없던 것: 넷 가운데 하나가 빠지면 판이 끝나는지 이어지는지. 남은 자리가 하나면? 빠진 자리의 차례는?
   - 답한 소스: `rooms.ts`의 `forfeit`("남은 자리가 하나면 그 자리가 이기고, 없으면 비김. 남은 자리가 여럿이면 차례만 건너뛴다"), `RoomSeat.out`.
3. **넷이 하는 판의 결과가 '이김/짐/비김'뿐이다**
   - 찾은 절: 14절 `finish(room, 이긴 자리 | -2 비김, 까닭)`, 안내문 `roomResult`(0 이김 1 짐 2 비김).
   - 없던 것: 등수(2등·3등)를 알리는 길, 1등이 둘일 때. 문서에 없다기보다 틀에 없다(문서는 그렇다고 적지 않는다).
   - 꼼수: 아래 2.
4. **자리 수가 판마다 하나로 고정이다** ('셋~넷'을 만들 수 없다)
   - 찾은 절: 14절 `RoomDef.seats`(기본 2), `g.rooms.define`을 "한 번" 부른다.
   - 없던 것: 셋이 모이면 셋으로 시작하는 판, 판을 열 때 자리 수 고르기. 소스(`define`이 두 번째에 던지고, `host`가 `this.size`로 자리를 만든다)를 보고 없다는 것을 확인했다.
   - 우회: 넷으로 고정하고 빈자리는 컴퓨터(`cpuAfterS`, '컴퓨터와 낚기'). 셋의 판은 넷 가운데 하나가 몰수·기권한 판으로만 생긴다(시험이 본다).
5. **좁은 화면에서 판의 막대가 어디에 뜨는가**
   - 찾은 절: 14절 표 "좁은 화면 배치", 6절 (4) "판 모듈의 창은 좁은 화면에서 틀이 아래쪽에 띄운다"(proof-stepstone의 메운 것).
   - 없던 것: 자리와 높이(아래 108px, `z-index` 12)와, 게임이 아래쪽에 창을 두면 겹친다는 경고. 실제로 폰에서 나루 단추를 누른 손가락이 막대의 '기권'에 닿아 판이 2차례 만에 끝났다(헤드리스 폰 화면에서 겪음).
   - 답한 소스: `engine/client/style.css`의 `@media` 안 `#topmid #roomBar { position: fixed; bottom: 108px … }`, `hud/rooms.ts`의 `body.in-room`.
   - 꼼수: 아래 3.
6. **컴퓨터 자리의 이름이 모두 같다**
   - 찾은 절: 14절 '화면' — `roomCpu`(컴퓨터의 이름)를 게임의 말로 덮어쓴다, `roomSeatName`.
   - 없던 것: 컴퓨터가 셋일 때 서로 가르는 법. 막대에 '컴퓨터 컴퓨터 컴퓨터'가 뜨고, 펼친 결과의 '누가 낚았나'를 적을 수 없다.
   - 꼼수: 아래 4.
7. **틀의 안내문 `roomStart`가 둘의 판을 전제한다**: 값이 '먼저 두면 1, **상대 이름**' 하나다(14절의 목록). 넷이면 이름 하나만 나온다. 게임의 `msg.roomStart`로 덮어써 "넷이 낚시를 시작합니다"로.
8. **카메라 돌리기의 0이 어느 쪽인가**
   - 찾은 절: 5절 '카메라' — `setCameraYaw(라디안)`(0이 틀의 쿼터뷰, π면 반대편).
   - 없던 것: yaw 0에서 카메라가 월드의 어느 쪽(화면 아래가 어느 방향)에 있는지, 각이 어느 쪽으로 도는지. 네 귀퉁이 자리마다 '내 자리가 화면 아래'가 되게 하려면 필요하다.
   - 답한 소스: `engine/client/scene/view.ts`의 `CAM_DIR = (1, 1.25, 1)`(카메라는 +x+z 쪽), `applyAxisAngle(UP, yaw)`. 자리를 같은 회전으로 놓았다(`shared/content/pond.ts`의 `turn`).
9. **`onFrame`의 인자**: 11절은 "매 프레임"뿐. 인자가 `(now, dt)` 차례이고 `now`는 ms(`performance.now`), `dt`는 초(0.05로 자름)라는 것은 `engine/client/bus.ts`·`main.ts`에서 찾았다(처음에 `(dt, now)`로 적어 반딧불이 멈춰 있었다).
10. **엔티티 종류의 이름표는 실려 온 값을 받지 못한다**: 12절 `registerKind`의 `label`. `label(e: KindInfo)`만이라 물고기의 크기(바뀌는 값)를 이름표에 쓸 수 없다(`engine/client/kinds.ts`의 타입). 꼼수: 모델 안에 캔버스 글자(`client/scene.ts`의 `textSprite`), 컴퓨터 낚시꾼은 놓을 때의 `type`에 자리를 담아 이름표에.
11. **`[[PC용|터치용]]`은 `t()`와 `data-i18n`에서만 풀린다**: 5절 '문장'은 그 표기만 말한다. `L().ui.x`로 읽어 `textContent`에 넣으면 대괄호가 그대로 보였다(헤드리스 화면에서 발견). `forInput`(`@engine/client/i18n`)을 거쳐야 한다(`engine/client/i18n/index.ts`).
12. **시험에서 판의 시계를 옮기는 법**: 8절은 `startServer(0, { now: () => t })`를 말하지만 그것은 대화·이름 바꾸기 간격의 시계다. 판의 기한·컴퓨터의 간격은 게임의 시계라 `startServer(0, { game: { plugins, now } })`로 준다(`engine/server/net/server.ts`의 `Options`, `GameOptions.now`).
13. **서버 없는 시험에서 끊김과 돌아옴**: 8절은 `g.players.spawn('이름', false)`뿐. 저장 키를 주는 넷째 인자 `spawn(이름, false, null, pid)`와 끊김 `g.players.leave(id)`는 `systems/players.ts`에서 찾았다. 판 모듈은 `pid`로 자리를 기억하므로 이것 없이는 돌아옴을 시험할 수 없다.
14. **`Room`의 칸 `cpuAt`**: 펼친 뒤 컴퓨터가 2.6초 쉬게 하려고 늦췄다. 14절의 `Room` 칸 목록에 없고 입구의 타입(`Room`)에서 찾았다(바꿔도 되는지는 `begin`이 `turnStart`보다 먼저 정한다는 소스로 확인).
16. **판의 모양 타입(`RoomView`, `RoomLobby`)을 어디서 가져오나**
    - 찾은 절: 11절 '공용' 표 "`defs/rooms.ts`의 `RoomView`, `RoomLobby`, `RoomRow` … (14절)"와 1절 "입구로만 읽는다".
    - 없던 것: 그 타입을 내보내는 입구. `@engine/shared`·`@engine/shared/defs`·`@engine/client` 어디에도 없다. 처음에 `@engine/shared/defs/rooms`에서 가져왔더니 타입 검사와 이 게임의 시험은 통과하고 **`npm test`의 경계 검사만 실패**했다(10절에 적힌 그대로의 증상).
    - 우회: `type RoomView = NonNullable<ReturnType<typeof myRoom>>`(`@engine/client`의 `myRoom`에서 끌어냄), 대기실의 줄은 시험에서 손으로 적었다.
15. **등록**: 맡은 일은 `package.json`의 스크립트·`build:all`·`npm test`의 목록·`scripts/typecheck.mjs`·`scripts/restart.mjs`에 등록하라고 했지만, 문서(2절, 8절)는 "`package.json`은 고치지 않는다: 게임 폴더에 `deploy.json`이나 `server/main.ts`가 있으면 저절로 찾는다. 손으로 하는 것은 `.gitignore`의 `dist-<게임>/` 한 줄뿐"이라고 한다. 확인해 보니 맞다(`npm run games`, `npm run typecheck` 설정 20 → 22, `npm test`의 `pond`, `build:all`, `restart.mjs`는 인자의 게임 폴더와 `deploy.json`). 문서에 없던 등록 둘: 4절의 포트 표(손으로 한 줄 더했다), **부하 도구 `scripts/load/server.ts`의 `PLUGINS` 표**(게임마다 플러그인 파일과 이름을 손으로 적는다: 문서는 9절에도 8절에도 부하 도구를 말하지 않는다).

문서대로 그대로 된 것: 2절 설정 셋(`tsconfig.json`, `tsconfig.engine.json`, `vite.config.ts`), `MODULES = ['rooms']`, `HOME_KEY = false`, `CHANNEL`, `CAMERA`, `withIdNames`, 6절의 선언 병합(`MsgMap`·`ClientMsgs`·`GameSystems`·`EntExt`·`LocaleExt`), `g.personal`(개인 상태: 손패를 본인에게만), `g.defineKind` + `g.rooms.place`, `g.playerSync` + `setPlayerLook`(자리 색 옷), `g.effect`/`onEffect`, `setTapHandler` + `view.pick`, `setCameraAim`의 `center`, `fitZoom`, `setCameraYaw`, `setRoomLook`(자리 색·막대 아래 글·결과의 큰 글·대기실의 전적), `addNotices`의 `quiet`·`feed`, 판의 `save`/`load`, `startServer(0)` + `connect` + `until`, 피어의 `lines`·`sys`, 14절 `RoomDef`의 칸 모두(`pass: false`, `timeout`, `cpu`, `cpuAfterS`, `outOfRounds`, `finished`).

## 게임 안의 꼼수

1. **바퀴마다 선 돌리기**: 펼칠 때(마지막 사람의 `turnEnd`) `room.first`를 새 선으로 바꾼다. 틀의 `pass`가 그 뒤에 다음 자리(옛 선)를 고르면 `turnStart`에서 "이번 던지기에 던질 자리가 아니면" 곧바로 `g.rooms.pass(room)`로 넘긴다(한 던지기에 한 번). 그러면 틀의 바퀴가 곧 던지기 번호가 되어 막대의 '던지기 3 / 8'과 `rounds: 8`이 맞는다(시험 `pond/room`이 `room.round === data.cast`를 본다). 넘기는 자리의 `turnEnd`도 불리므로 `turnEnd`는 '모두 던졌으면 펼치기'만 한다. 순간이지만 그 자리의 `turnStart`가 불리고 `touch`가 한 번 더 오른다(화면에는 같은 전송 안이라 보이지 않는다).
2. **등수**: 결과는 틀의 `finish(1등 자리 | 비김)`. 등수는 게임의 개인 상태 `pond.rank`에 싣고 `setRoomLook.title`로 결과 창의 큰 글을 "2등 · 15점"으로 바꾼다. 안내문 `roomResult`는 2등도 '졌습니다'다(대화창에 남는다).
3. **폰의 판 막대**: `@media (max-width: 720px) { body.in-room #topmid #roomBar { bottom: auto; top: 96px } }`로 막대를 내 정보 창 아래(위쪽)로 올렸다. 틀이 막대의 자리를 바꾸면 깨진다.
4. **컴퓨터 자리의 이름**: 게임의 글(내 미끼 창, 펼친 알림, 막대 아래 줄)은 `fmt.pondCpu(자리)`('컴퓨터(파랑)')로, 3D의 컴퓨터 낚시꾼은 놓을 때 `type: 's2'`로 자리를 실어 이름표에 쓴다. 틀의 막대는 '컴퓨터' 셋 그대로(색으로만 가른다).
5. **엎은 미끼의 수 숨기기**: 찌(엔티티 `bait`)의 `sync`는 `[자리, 펼친 수(엎어 있으면 0), 나루]`. 수는 펼칠 때에야 싣는다. 엔티티의 `sync`는 그 층의 시야 안 모두에게 가므로, 사람마다 다른 값을 실을 수는 없다(그래서 내 미끼의 수는 개인 상태 `pond.mine`으로만).
6. **컴퓨터의 공정함**: 컴퓨터는 판 상태가 아니라 `sightOf(판, 자리)`(제 손패·물고기·남이 던진 나루·뒤에 던질 사람 수·펼쳐진 수)만 보고 고른다. 시간이 다 된 사람도 같은 함수로 대신 던진다.

## 균형: 자리 차례별 승률 (컴퓨터끼리)

- 처음 규칙(물고기가 미끼의 크기를 가리지 않음): 4000판에서 자리 0·1·2·3의 이김 **1061 / 962 / 849 / 1018**(26.5% / 24.1% / 21.2% / 25.5%, 비김 110). 선은 돌지만 던지기의 차례마다 값이 다르다: 앞쪽 던지기에서는 끝에 던지는 사람이 빈 나루에 작은 패로 낚는 몫이 크고(첫 던지기에서 끝 2.22점 대 셋째 1.57점), 뒤쪽 던지기에서는 선이 손해다(1.5점). 자리마다 그 조합이 달라 쏠렸다.
- 견준 것: 선의 차례를 바꾸기(0123 3210처럼 거꾸로: 어림 차이 1.11 → 0.60점, 가장 고른 차례도 0.13점이지만 사람에게 설명할 수 없는 차례), 그리고 규칙 하나.
- 고른 규칙: **물고기는 제 크기보다 작은 미끼는 물지 않는다.** 빈 나루에 작은 패를 던져 줍는 몫이 사라지자 끝에 던지는 이점이 줄었다. 2000판에서 **483 / 482 / 504 / 471**(24.2% / 24.1% / 25.2% / 23.6%), 시험(`pond/rules`)의 1000판에서 243 / 233 / 240 / 257(25.0% / 23.9% / 24.7% / 26.4%, 비김 27). 평균 점수 14.5~14.7로 고르다.
- 시험은 1000판의 자리별 승률이 넷 모두 21~29%인지 본다(1000판의 표준 편차는 약 1.4%p).

## 틀 수리 제안 (중요한 차례)

1. **선 돌리기**: `RoomDef.rotateFirst`(바퀴마다 `first`를 다음 살아 있는 자리로) 또는 `roundEnd(room)` 훅에서 게임이 `g.rooms.setFirst(room, i)`. 차례 건너뛰기를 `turnStart`의 `pass`가 아니라 `RoomDef.skip(room, seat) → boolean`으로.
2. **등수가 있는 결과**: `finish(room, win, why, ranks?)`, `RoomView.ranks`, `roomResult`의 값에 등수, 결과 창이 등수를 적는다. 1등이 여럿인 '함께 이김'.
3. **자리 수의 범위**: `seats: { min: 3, max: 4 }`처럼 판을 연 사람이 '이만큼 모이면 시작'을 누르거나, `cpuAfterS` 대신 '사람이 min 이상이면 시작'.
4. **좁은 화면의 판 막대 자리**: `setRoomLook({ barAt: 'top' | 'bottom' })` 또는 게임의 아래 창 높이를 받는 css 변수(`--room-bottom`). 문서 6절 (4)의 자리 표에 판 막대·대기실의 좁은 화면 자리와 높이.
5. **컴퓨터 자리의 이름**: `setRoomLook({ seatName(view, i) })` 또는 `RoomSeatView`에 컴퓨터의 번호. `roomStart`의 값을 '상대 수'와 이름 목록으로.
6. **`KindLook.label(e, vals)`**: 실려 온 값으로 이름표(크기, 남은 수).
7. **입구**: `RoomView`·`RoomLobby`·`RoomRow`를 `@engine/shared`(또는 `@engine/client`)에서 다시 내보낸다.
8. **문서**: `onFrame(now, dt)`의 인자와 단위, yaw 0의 방향(카메라는 +x+z 쪽, 화면 아래가 +x+z), `forInput`(`L().ui`의 `[[|]]`), 게임의 시계 `game: { now }`, `g.players.spawn`의 `pid`와 `g.players.leave`, 셋 이상의 판에서 `forfeit`의 동작, `Room.cpuAt`, 부하 도구의 `PLUGINS` 표.

## 평가 (5점 만점): **4.0**

- 좋았던 것: 판 모듈 하나로 대기실·짝짓기·컴퓨터 채우기·차례·초읽기·시간 넘김·끊김과 돌아옴·몰수·다시 하기·판의 저장까지 **게임 코드 없이** 됐다. 서버의 게임 쪽은 약 270줄(규칙 220줄은 틀과 무관). 숨긴 정보는 `g.personal` 하나로 깔끔했고, 정해진 시계 덕에 20초 넘김·60초 몰수·되살리기를 결정적으로 시험했다. 등록은 문서대로 `.gitignore` 한 줄로 끝났다. 틀 내부를 읽어 '우회'한 곳은 있어도 틀을 고쳐야만 하는 곳은 없었다.
- 깎인 것: 넷의 판에서 꼭 필요한 셋(선 돌리기, 셋 이상의 기권, 등수)이 문서에 없어 `rooms.ts`를 읽었고, 선 돌리기는 틀의 차례 셈에 기대는 꼼수다. 폰에서 틀의 막대와 게임의 창이 겹쳐 실제로 잘못 눌리는 문제를 화면으로 보고서야 알았다. 작은 빈 곳(`onFrame` 인자, yaw 방향, `forInput`, 게임 시계, `pid`로 spawn)이 다섯.

## 확인한 것

- `npm run typecheck`: 설정 22개(바탕 20 + 이 게임 둘) 오류 0.
- `npm test` 두 번 통과: `모두 통과 (검사 2495개 …)` (바탕 2380 + 이 게임 115). 처음 돌렸을 때는 경계 검사 1건이 실패했다(빈 곳 16). 이 게임의 시험(`node scripts/game.mjs test pond`): `rules`(나누기·차례와 선·빠진 자리·얽힘과 크기·끝과 순위·컴퓨터의 시야·1000판 승률), `room`(정해진 시계: 컴퓨터와 낚기·숨긴 손패·찌의 수 0·선과 틀의 바퀴·20초 넘김·끝과 전적·다시 하기의 자리 돌림·대기실로 판 닫힘·사람 셋 빠른 판과 컴퓨터 채우기·끊김과 같은 자리로 돌아옴·60초 몰수 뒤 셋이 이어 감·기권 둘로 컴퓨터가 이김·판 저장과 되살리기·깨진 저장), `net`(실제 서버와 소켓 셋, 게임의 시계를 옮긴다: 대기실의 줄·빠른 판 셋·컴퓨터 채우기·차례 아닌 수 거절·엎은 찌의 수 0·시간 넘김·펼침·끊고 같은 토큰으로 이어 앉기·끝까지·결과·받은 개인 상태 전부에 남의 것 0건·대기실로 판 닫힘).
- `npm run build:all` 통과.
- 등불지기 황금 실행(`turnfw-tools/golden.mts sim`): 바탕과 바이트까지 같다(7,489,205바이트, sha256 `ba83af30d07f…`). 다른 게임의 코드는 바뀌지 않았다(바뀐 것은 `.gitignore` 한 줄, 문서, 부하 도구의 표 한 줄).
- 실제로 두어 본 결과 (임시 서버 3015, 헤드리스 Chrome(GPU), 실제 마우스·터치 사건):
  - PC 한국어·영어, 폰(390×844) 한국어·영어: 컴퓨터 셋과 끝까지(8차례, 65~67초. 넷째 차례는 두지 않아 초읽기와 20초 넘김을 확인). 3D 물고기 누르기(`setTapHandler`)로 첫 미끼를 던졌다. 콘솔 오류 없음.
  - 사람 셋: 브라우저 하나 + 소켓 스크립트 둘(`다람`·`여울`, 빠른 판으로 합류, 다람은 둘째 차례에 두지 않아 시간 넘김) → 브라우저가 '컴퓨터와 낚기'로 넷째를 채움 → 끝까지 83초. 셋의 결과 등수가 같다(2·4·3·1). 콘솔 오류 없음.
- 화면: `%TEMP%\dg-work\boardgame-shots\` — `pc-ko-cpu-*`, `pc-en-cpu-*`, `phone-ko-cpu-*`, `phone-en-cpu-*`(각각 `lobby`, `start`, `select`, `cast`, `foe-turn`, `reveal`, `countdown`, `timeout`, `over`, `back`), `pc-ko-pvp-*`(`waiting`, `waiting3`, `foe-timeout` 더함).

## 확인하지 못한 것

- 실제 폰의 터치(헤드리스의 터치 흉내뿐), 폰 가로 화면.
- 사람 넷이 저마다 브라우저로 생각하며 끝까지 둔 판(한 판 5~8분은 어림: 사람 한 차례 10초 × 4 × 8).
- 서버를 실제로 껐다 켠 뒤 브라우저가 두던 판으로 돌아오는 것(시험의 `exportWorld`/`importWorld`로만).
- 부하(`scripts/load`에 등록만 했다. 판의 방식 `room`은 둘씩 짝짓는 봇이라 넷의 판은 `roomcpu`가 맞다).
- 소리.

## 메운 것 (2026-11-27, 가지 `feat/roomfix`)

위의 '문서의 빈 곳'·'게임 안의 꼼수'·'틀 수리 제안'을 틀(`engine/`)에서 메웠다. 칸은 모두 선택이고 예전의 쓰는 법은 그대로 된다(`finish(room, 이긴 자리 | -2, 까닭)`, `seats: 2`, 하나의 컴퓨터, 아래 막대). 쓰는 법은 [making-a-game.md](making-a-game.md) 14절. 저장소 안의 본보기는 틀의 시험의 '별 줍기'(`engine/test/core/server/stars.ts`, `client/stars.ts`, 시험 `engine/test/core/rooms.test.ts`).

| 빈 곳 (위의 번호) | 틀의 칸 (파일) | 호환 | 연못에서 지운 꼼수 |
|---|---|---|---|
| 바퀴마다 선 돌리기 (1, 꼼수 1, 제안 1) | `RoomDef.rotateFirst`(바퀴마다 `room.first`를 다음의 빠지지 않은 자리로), `RoomDef.roundEnd(room)`(바퀴의 끝: 펼치기·점수, 여기서 `finish`나 `room.first`를 바꿔도 된다), `RoomDef.skip(room, i)`(그 자리를 이번에 건너뛰기). `pass`가 '이번 바퀴에 남은 자리' → '바퀴의 끝'으로 나뉘었다 (`engine/server/game/systems/rooms.ts`) | 셋 다 주지 않으면 차례·바퀴의 셈이 예전과 같다 (시험: 둘의 판에서 바퀴가 바뀌어도 자리 0이 먼저) | 펼칠 때 `room.first = t.leader`, `turnStart`에서 '던질 자리가 아니면 `g.rooms.pass`', `turnEnd`의 펼치기 → `rotateFirst: true`와 `roundEnd: 펼치기`. `turnStart`는 컴퓨터 쉬기(`room.cpuAt`)만 |
| 셋 이상의 기권·몰수 (2) | 동작을 문서에 적고(14절 '셋 이상의 판'), `RoomDef.outEnds`(true면 판을 끝낸다: 남은 자리 함께 1등, 빠진 자리 그다음)와 `RoomDef.out(room, i, why)`(여기서 `finish`를 불러 끝을 정해도 된다) | 기본(false)은 예전 그대로 남은 사람끼리 잇는다 | (연못은 기본: 셋이 이어 간다) |
| 등수 (3, 꼼수 2, 제안 2) | `g.rooms.finish(room, 등수 배열, 까닭, 점수?)`: `room.ranks`·`room.scores`, `RoomView.ranks`·`scores`, 1등이 하나면 `room.win`, 여럿이면 -2. `roomResult`의 값 [이김/짐/비김, 까닭, 내 등수, 등수를 받은 자리 수, 같은 등수]. 결과 창은 셋 이상이면 큰 글이 내 등수('2등', '함께 1등', 1등 하나면 '이겼습니다!'), 아래에 모든 자리의 등수·이름·점수(`fmt.roomRankTitle`·`roomRankRow`·`roomScore`), 안내문은 'n명 가운데 k등입니다'. 전적은 `g.rooms.rankOf(room, i)` (`engine/client/hud/rooms.ts`, 언어 파일) | `finish(room, 이긴 자리 | -2, 까닭)`은 그대로: `ranks`·`scores`는 빈 배열, 안내문의 앞 둘이 같고 화면도 이김/짐/비김 | `setRoomLook.title`의 '2등 · 15점', `winner()`로 1등 하나만 틀에 주던 것 → `finish(room, 등수, 'score', 점수)`. 전적의 승은 `rankOf(...) === 1` |
| 자리 수 범위 (4, 제안 3) | `RoomDef.seats: { min, max }`, `startAfterS`(기다림 뒤 모인 만큼으로), `cpuFill: 'max' | 'min'`(컴퓨터가 채우는 만큼), 명령 `room a:'start'`(가장 먼저 앉은 사람의 '지금 시작 (n명)' 단추, 모자라면 안내문 `roomFewer`), `RoomView.min`, `RoomLobby.startAfterS`. 모인 만큼으로 시작하면 빈 자리를 빼고 당긴다. 판의 저장은 자리 수가 `min`~`max`인 판을 받는다 | `seats`가 수 하나면 예전과 같다 | 넷으로 고정 → `seats: { min: 3, max: 4 }, startAfterS: 20`(셋이 모여 20초면 셋으로, 둘 이하면 20초에 컴퓨터가 넷까지). 판 상태의 크기를 `POND.seats` 대신 `room.seats.length`로 |
| 폰의 판 막대 (5, 꼼수 3, 제안 4) | `setRoomLook({ barAt: 'top' })`(좁은 화면에서 위쪽 내 정보 창 밑), css 변수 `--room-bar-bottom`·`--room-bar-top`, 기권은 한 번 누르면 '한 번 더 누르면 기권'(3초 안에 다시 눌러야 기권: `ui.roomResignSure`, PC는 Click·폰은 Tap). 문서에 막대의 자리와 높이(아래 108px, `z-index` 12) | `barAt`을 주지 않으면 예전 자리. 기권의 확인은 모든 판에 (한 번 더 누른다) | `pond.css`의 `body.in-room #topmid #roomBar { … top: 96px }` → `barAt: 'top'` |
| 컴퓨터 자리의 이름 (6, 꼼수 4, 제안 5) | 서버 `RoomDef.cpuName(room, i)`(이름을 `RoomSeatView.name`·`roomTimeout`에 싣는다), 화면 `setRoomLook({ seatName(view, i) })`(언어마다), 아무것도 주지 않으면 컴퓨터가 둘 이상일 때 틀이 번호를 붙인다(`fmt.roomCpuN`: '컴퓨터 1·2·3', 'Computer 1·2·3') | 컴퓨터가 하나면 예전처럼 `roomCpu` | 연못의 글 밖에서만 쓰던 `fmt.pondCpu(i)` → `seatName`으로 틀의 막대·결과 창·차례 글에도 '컴퓨터(파랑)' |
| `roomStart`가 둘을 전제 (7) | 셋째 값 '자리 수'. 틀의 문장은 셋 이상이면 'n명이 둡니다' | 앞 둘은 그대로 | '넷이 낚시를 시작합니다' → `${a[2]}명이 낚시를 시작합니다` |
| 카메라 yaw의 방향 (8) | 문서: 5절 '카메라'와 14절 '화면'(yaw 0에서 카메라는 +x+z 쪽, 각만큼 `applyAxisAngle(위, yaw)`, 자리마다 `i × 2π / 자리 수`) | 문서만 | |
| `onFrame`의 인자 (9) | 문서: 11절 일람표와 14절 '작은 것들'(`(now ms, dt 초)`) | 문서만 | |
| 이름표가 실려 온 값을 받기 (10, 제안 6) | `KindLook.label(e, vals)`: 놓일 때(빈 배열), 값이 바뀔 때(글이 바뀔 때만 쓴다), 언어가 바뀔 때 (`engine/client/kinds.ts`, `entities.ts`) | `label(e)`는 그대로 된다 | (연못의 캔버스 글자는 그대로 두었다: 모델 안의 큰 숫자라 이름표와 다르다) |
| `[[PC|터치]]`와 `forInput` (11) | 문서: 5절 '문장' | 문서만 | |
| 시험의 시계 `game: { now }` (12) | 문서: 8절과 14절 '작은 것들' | 문서만 | |
| `spawn`의 `pid`와 `players.leave` (13) | 문서: 8절과 14절 '작은 것들' | 문서만 | |
| `Room.cpuAt` (14) | `Room`의 칸 목록과 주석(차례가 시작될 때 `turnStart`보다 먼저 정해진다: `turnStart`에서 늦춰도 된다) | 문서만 | |
| 타입의 입구 (16, 제안 7) | `@engine/shared`와 `@engine/client`가 `RoomView`, `RoomLobby`, `RoomRow`, `RoomSeatView`, `RoomPhase`를 `export type`으로 | 새 내보내기 | `type RoomView = NonNullable<ReturnType<typeof myRoom>>` → `import { type RoomView } from '@engine/client'` |
| 부하 도구의 플러그인 표 (15) | 문서: 14절 '작은 것들'(`scripts/load/server.ts`의 `PLUGINS`에 한 줄, 셋 이상의 판은 `mode=roomcpu`) | 문서만 | |

**되살린 연못·징검돌로 확인한 것** (이 가지의 복사본 안에서만 `git checkout 7e347c9 -- games/pond games/stepstone`, 꼼수를 새 칸으로 바꾼 뒤 돌리고 지웠다. 저장소에는 넣지 않았다):

- 시험: 연못 115 → 124개 통과(사람 셋의 판이 이제 20초에 셋으로 시작하므로 '컴퓨터 채우기'는 '컴퓨터와 낚기' 단추로 바꾸고, 셋으로 시작·선 0·1·2 돌기와 `room.first`·`round`가 규칙의 선·던지기 번호와 늘 같음·등수와 점수·`roomResult`의 등수·전적의 승·둘이면 컴퓨터 둘·`rankOf`를 더했다). 징검돌 87개는 고치지 않고 그대로 통과(둘의 판의 호환).
- 화면(임시 서버 3017·3018, 헤드리스 Chrome GPU, 실제 마우스·터치 사건, 콘솔 오류 없음):
  - PC 한국어·영어, 컴퓨터 셋과 끝까지: 막대에 '컴퓨터(파랑)·(분홍)·(초록)', 결과 창 '4등'/'3rd'와 네 줄의 등수·점수, 대화창 '4명 가운데 4등입니다.'/'You finished 3rd of 4.'
  - 사람 셋(브라우저 + 소켓 둘): 대기실 '(3/4) 3명부터 시작할 수 있습니다. 12초 뒤에 모인 만큼으로 시작합니다.'와 '지금 시작 (3명)' → 눌러 셋으로 시작 → 한 사람이 다섯째 차례에 기권(막대 '여울 (떠남)', 둘이 끝까지) → 결과 '이겼습니다!'와 1·2·3등(기권한 사람은 점수가 더 많아도 3등: 연못의 규칙). 소켓 둘의 `roomResult`도 같은 등수.
  - 폰(390×844) 한국어·영어: 막대가 위(위에서 96~223px)이고 내 미끼 창(610~838px)과 겹치지 않는다. 기권을 한 번 누르면 붉은 '한 번 더 누르면 기권'/'Tap again to resign', 3초 뒤 되돌아간다. 영어에서 두 번 눌러 기권 → 컴퓨터 셋이 끝내고 결과 '4th'.
  - 게임의 `seatName`을 빼고 지은 연못: 막대가 '컴퓨터 1 | 컴퓨터 2 | 컴퓨터 3'(영어 'Computer 1 …').
  - 징검돌(둘): 막대 '이름 | 돌부처(컴퓨터)', 결과 '졌습니다'/'You lost'(등수 줄 없음), 폰에서 막대는 예전처럼 아래.
- 부하(`npm run load:game`, 30초, 포트 3017, 같은 PC에서 바탕 `a517a06`의 작업 트리와 번갈아 두 번씩): 사람끼리 판 100개(징검돌 200명, `mode=room`) 틱 평균 바탕 0.19·0.20ms → 이 가지 0.18·0.21ms(99% 0.39·0.43 → 0.35·0.43), 컴퓨터와 둔 넷의 판 100개(연못 100명, `mode=roomcpu`) 0.87·0.81ms → 0.83·0.77ms(99% 6.61·6.67 → 6.79·6.10). 느려지지 않았다(차이는 잴 때마다의 흔들림 안).
