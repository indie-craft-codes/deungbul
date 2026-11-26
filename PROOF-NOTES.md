# 증명 기록: 문서만 보고 RPG가 아닌 게임(팀 공놀이 "굴림공")을 만든다

처음 보는 개발자의 눈으로 `docs/making-a-game.md`를 처음부터 끝까지 읽고, 문서가 가리키는 본보기
(`engine/test/core/`, `games/sample/`)를 따라 `games/rollball/`을 만들었다. 문서가 답하지 않아 틀의 소스를 열어야 했던 때를 모두 적는다.

칸: **질문** / 본 문서의 자리 / 답을 준 소스

## 소스를 읽어야 했던 때

### 1. 새 게임의 타입 검사를 `package.json`에 더해야 하나?
- 문서: 2절은 "`package.json`은 고치지 않는다 … 타입 검사가 저절로 그 게임을 찾는다", 8절 마지막 항목은 "새 게임을 들이면 뿌리 `package.json`의 `typecheck`에 그 게임의 두 설정을 더한다 … 더하지 않으면 알려 주지 않는다". **서로 어긋난다.**
- 답: `scripts/typecheck.mjs` 머리 주석과 `listGames()`: 저절로 모은다. 8절의 항목이 낡았다.

### 2. 서버에서 플레이어들을 어떻게 고르나 (엔티티 종류의 이름)
- 문서: 12절 예시는 `b.kind === 'ball'`, 8절 시험 조각은 `e.kind === 'm'`(몬스터). 플레이어의 `kind`는 어디에도 적혀 있지 않다. `g.players`에 목록이 있는지도 없다.
- 답: `engine/server/game/entity.ts`의 `Ent` 주석("플레이어('p'), 몬스터('m')")과 `game.ts`의 `defineKind`(이름 'p'·'m'은 틀의 것이라 거절).

### 3. 사람이 들어오고 나가는 사건의 이름
- 문서: 6절 요약표는 `monsterKilled`, `hit`만 예로 들고 "목록은 `engine/server/game/game.ts`의 `Hooks`"라고 가리킨다.
- 답: `game.ts`의 `Hooks`: `playerJoined`(봇 제외), `playerLeft(id)`, `playerDropped`. 공놀이처럼 전투 없는 게임에서 가장 먼저 필요한 사건인데 문서에 이름이 없다.

### 4. 플레이어의 모습(팀 색)을 바꿀 수 있나
- 문서: `setHumanoidBody(look)`의 `look.cloth`(옷 색)만 나온다. 옷 색을 누가 정하는지, 게임이 사람마다 정할 수 있는지는 없다. 12절 `registerKind`는 "플레이어('p')와 몬스터는 틀이 그린다".
- 답: `engine/client/entities.ts`: 옷 색은 `MY_CLOTH`(나) / `CLOTH[id % 길이]`(남)로 틀이 정한다. 게임이 사람마다 색을 줄 길이 없다. 플레이어에게 게임의 값을 실어 보낼 길(`sync`)도 없다(게임 종류만).
- 우회: 팀 표는 공유 상태(`WorldState`)로 보내고, 화면의 `onFrame`에서 `S.me.model.root`·`S.others`의 `model.root`에 팀 색 고리를 붙인다. `S.others`의 모양(`Remote`: `kind`, `model`)은 `engine/client/state.ts`에서 봤다(문서는 "`S.me` 내 캐릭터, 주변"뿐).

### 5. `onKey`의 키 이름은 무엇인가 (스페이스, 대문자)
- 문서: `onKey('f', …)`만 나온다.
- 답: `engine/client/bus.ts`·`input.ts`: `KeyboardEvent.key`를 소문자로 맞춘 값(스페이스는 `' '`). 이동 키를 등록하면 이동에 안 쓰인다는 것도 소스 주석에만 있다.

### 6. 전투가 없는 게임에서 단추를 어디에 붙이나 (`actions` 자리)
- 문서: 6절 (4)는 자리 여덟을 적고, 10절은 "모듈을 고르지 않아 기준 요소가 없는 자리(`meHp`, `meGold`, `actions`)는 다른 자리로 대신 붙는다". **어디로**인지가 없고, 그 대신 자리(`actionsEnd`)는 6절의 목록에 없다.
- 답: `engine/client/hud/shell.ts`의 `SLOTS`: `actions` → `actionsEnd`(지도 단추 줄의 맨 앞), `meHp`·`meGold` → `meRows`.

### 7. 게임이 채워야 하는 뼈대의 글 키는 무엇인가 (`mapLegend`, `intro`, `classHint`)
- 문서: 5절 '문장'은 "틀의 뼈대가 쓰지만 틀에 기본 문장이 없거나 게임의 말이어야 하는 키는 게임이 채운다"고 하고 예제의 줄을 보일 뿐, **목록**이 없다. 12절(공 마당)은 `title`·`hint`조차 채우지 않는다.
- 답: `engine/client/hud/skeleton.ts`(`data-i18n="mapLegend"`, `intro`, `classHint`)와 `engine/client/i18n/ko.ts`(기본 문장이 있는 것: `title`='게임', `hint`). `mapLegend`는 틀에 기본 문장이 없다. 이 게임은 범례를 쓰지 않아 넣지 않았다(빈 칸).

### 8. 카메라를 멀리 둘 수 있나 (공이 화면 밖으로 나간다)
- 문서: 1절 '안 되는 것'에 "카메라와 장면이 쿼터뷰를 전제한다"뿐. 카메라의 거리, 따라가는 대상을 게임이 정하는 길은 문서에 없다.
- 답: `engine/client/scene/view.ts`의 `follow(x, z, zoom)`(거리 46×zoom), `engine/client/main.ts`(늘 내 캐릭터를 따라간다), `engine/client/input.ts`(휠·핀치가 `S.zoom`을 0.6~1.15로 자른다).
- 우회: 접속할 때 `S.zoom = 1.15`(휠의 최대)로 두고, 공이 화면 밖이면 가장자리에 화살표를 띄운다(`view.camera`로 투영). 48m 경기장의 3분의 1쯤만 보인다: 공놀이에는 아쉽다.

## 틀을 고치지 않았다

`engine/`은 고치지 않았다. 막힌 곳은 모두 게임 코드로 돌아갔다(4: 팀 색 고리, 8: 화살표).

## 문서대로 되었던 것 (막히지 않은 것)

- 폴더를 만들기만 하면 `npm run games`, `npm run typecheck`, `npm test`가 저절로 찾았다(2절).
- `MODULES = []`, `withIdNames`, `g.defineKind`/`g.place`/`registerKind`, `g.shared`/`g.personal`, `MsgMap`/`ClientMsgs`/`WorldState` 선언 병합, `addNotices`, `mountPanel`, `onKey`, `new Game({ plugins })` + `g.tick`, `startServer(0)` + `connect`: 문서의 조각 그대로 됐다.
- 고르지 않은 모듈의 화면(체력 막대, 골드, 가방, 기술 단추, 대상 창, 메뉴의 RPG 탭)은 하나도 뜨지 않았다(헤드리스 Chrome에서 보이는 요소 id를 모아 확인).
- 공의 이름표가 없는 게임 종류도 `label`을 빼면 된다(12절).

## 작은 것들

- `NET.aoi`(시야, 기본 32m)는 12절 조각에만 나온다: 경기장이 시야보다 넓으면 반대편의 공과 사람이 사라진다. 3절 '기본값으로 받는 이름'의 목록에 `NET`이 빠져 있다(문장 안에는 있다).
- 6절 요약표 '시간이 흐르면'에 게임 종류의 `tick`과 `g.ticks`의 차례(어느 것이 먼저 도는가)가 없다. 이 게임은 차례에 기대지 않게 짰다.
- 4절: `runServer`의 기본 포트는 다른 게임과 겹치지 않게 고르라고만 한다. 쓰는 포트의 목록이 없어 `games/*/deploy.json`을 열어 3001~3005를 피해 3007로 했다.
- `.gitignore`의 `dist-<게임>/`은 문서가 말한 대로 손으로 더했다(빼먹기 쉽다: 자동으로 찾는 것과 달리 이것만 손이다).
- 화면의 `onMsg('me', …)`의 `m.s`가 `unknown`이라 게임이 좁힌다(5·6절에 적혀 있다).
- 폰 세로에서 가운데 위 창(`topmid`)이 오른쪽 위 대화창과 겹칠 때가 있다(팀을 고르기 전, 내 정보 창이 짧을 때). 자리는 틀이 잡는다.
- 8절: 게임의 시험이 실제 접속 둘을 쓰면 **두 연결의 명령 차례가 정해지지 않는다**(둘 다 같은 팀을 고르면 누가 먼저인지 모른다). `npm test`는 여러 시험을 함께 돌려 느려지므로 `until`의 기본 3초로는 모자랄 때가 있었다. 처음 `npm test`에서 이 게임의 시험이 4건 실패했고(혼자 돌리면 통과), 차례를 기다리고 시간을 늘려 고쳤다. 문서에 "가짜 클라이언트 여럿의 명령은 차례대로 기다려 보낸다, `npm test`에서는 넉넉히 기다린다"는 한 줄이 있으면 좋다.
- `npm test`의 끝 줄이 "실패 0건 (따로 돈 시험에도 실패가 있다: rollball …)"이었다: 첫 낱말만 보면 통과로 읽힌다(종료 코드는 1로 맞다).

## 확인한 것

- `npm run typecheck`: 설정 15개 모두 통과(굴림공의 두 설정이 저절로 들어갔다).
- `npm test` 두 번: 두 번 모두 통과, 검사 1570개(굴림공 33개).
- `node scripts/game.mjs build rollball`, `npm run build:all`(게임 여섯) 통과.
- 포트 3015에 띄워 봇(ws 스크립트) 둘과 헤드리스 Chrome(실제 GPU)으로 골을 넣었다. 화면: PC 1280×720과 폰 390×844(터치 흉내), 한국어·영어.
