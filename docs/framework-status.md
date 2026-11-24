# 틀과 게임 가르기: 지금의 상태

계획은 [framework-plan.md](framework-plan.md)에 있다(계획을 세울 때의 기록이라 파일 경로와 세부는 그때의 것이다). 이 문서는 **지금 무엇이 끝났고, 틀과 게임이 어디서 만나고, 무엇이 남았는지**를 적는다. 9단계(폴더 이동)를 마친 때를 기준으로 쓴다. 코드를 고치면 이 문서도 함께 고친다.

요약:

- 코드는 두 폴더다. 틀은 `engine/`, 이 게임은 `games/deungbul/`. 방향은 게임 → 틀 하나다.
- 틀이 게임에서 읽는 것은 내용 계약(`engine/shared/contract.ts`)의 이름뿐이고, 별칭 `@game/shared/content`로 읽는다.
- `npm run typecheck:engine`(틀만 타입 검사) 오류 0, `npm test` 모두 통과.
- 플레이어가 겪는 것, 저장 형식, 프로토콜은 0단계부터 지금까지 바뀌지 않았다(4단계의 `me` 메시지는 옛 메시지와 함께 간다).
- 남은 큰 일: 예제 게임과 문서(11), 공개 표면(12), 틀의 시험을 등불지기의 내용에서 떼기(13), 다음 배포에서 호환 코드 끄기, 화면 뼈대 올리기.

## 1. 단계별 상태

| # | 무엇 | 상태 | 합친 커밋 |
|---|---|---|---|
| 0 | 안전망: 맵 지문, 저장 왕복 견본, 프로토콜 번호 | 끝 | `792067b` |
| 1 | 서버의 직접 결합 풀기: 규칙 플러그인(`installDeungbul`), `Channels.extraFoes`, `worldSaves`의 `legacy` | 끝 | `792067b` |
| 2 | 확장 지점: 두 `ext.ts`와 게임의 선언 병합 | 끝 | `f25e0b4` |
| 3 | 게임의 저장 칸을 저장 등록(`g.saves`, `PlayerSave.ext`)으로 **[저장]** | 끝. 옛 칸에도 함께 쓰는 호환이 켜져 있다 | `e99dd58` |
| 4 | 개인 상태 통로(`g.personal`, `me` 메시지) **[프로토콜]** | 끝. 옛 메시지도 함께 보내는 호환이 켜져 있다 | `ad69a00` |
| 5 | 내용 계약(`MapDef`, `FORGES`, `needs: string`, `contract.ts`) | 끝 | `6f468f0` |
| 6a | 클라이언트의 규칙 객체(`rules`), `addNpc`, `onKey` | 끝 | `d5eae30` |
| 6b | 화면 창 가르기(`hud/me.ts`와 게임의 창), 게임의 진입점 | 끝 | `751684d` |
| 7a | 장면의 겉모습을 게임이 넘긴다(`look`, `setMood`, 모델 등록) | 끝 | `8c8daaf` |
| 7b | 게임의 창은 게임이 붙인다(`mountPanel`, `deungbul.css`) | 끝. 뼈대(`index.html`의 body)를 `shell.ts`로 올리는 일은 남았다 | `1049bf3` |
| 8 | 언어 파일을 틀의 문장과 게임의 문장으로(`mergeLocale`) | 끝 | `a67c46e` |
| 9 | **폴더 이동**: `engine/`, `games/deungbul/`, 별칭, 내용 파일 가르기, 틀만 타입 검사 0 | 끝 (이 문서를 쓴 때) | `feat/fw9` |
| 10 | 시험 가르기, `new Game()`의 기본값을 틀만으로 | 끝 | `7c96900` |
| 11 | 예제 게임 `games/sample`과 `docs/making-a-game.md` | **남음** | |
| 12 | 공개 표면(`index.ts` 셋, 깊은 import 금지) | **남음** | |
| 13 | 틀의 시험을 등불지기의 내용에서 떼기 | **남음** (선택) | |

### 9단계에서 한 것

1. `git mv`로 모든 파일을 `engine/`과 `games/deungbul/`로 옮기고 import 경로와 설정을 고쳤다(내용 변화 없음: 빌드된 js·css가 바이트까지 같았다).
2. 내용 파일을 갈랐다: 모양과 도우미는 `engine/shared/defs/*.ts`, 표와 수치는 `games/deungbul/shared/content/*.ts`. 통로를 둘로 나눴다(아래 2절).
3. 틀이 계약 밖의 이름을 읽던 세 곳을 고쳤다: 대장간 창(`SMITH`·`SMITHY` → `FORGES`의 첫 대장간), 땅의 범위(`MIN_X` 등 → `MAP.areas[0]`), '마을로'의 안내문(`goingTown`: 틀에 기본 문장을 두고 게임이 덮어쓴다). 화면에 보이는 것은 그대로다.
4. 틀만 타입 검사하는 방식을 바꿨다: 게임 파일을 뺀 사본을 만드는 스크립트(`scripts/typecheck-engine.mjs`)를 없애고 `tsc -p tsconfig.engine.json`(`engine/`의 소스만 include)으로. 오류 8 → 0. `npm run typecheck`와 `npm test`가 함께 돌린다.
5. 의존 방향 검사를 폴더 기준으로 바꿨다(`engine/test/framework.test.ts`의 "의존 방향: 폴더").

계획서와 다르게 한 것:

- 게임의 내용을 `games/deungbul/content/`가 아니라 `games/deungbul/shared/content/`에 두었다(옮기기 전의 `shared/content/`와 같은 모양이라 이력이 이어진다).
- `test/all.ts`는 뿌리에 남겼다: 틀의 시험과 게임의 시험을 함께 돌리는 저장소의 도구이고, `npx tsx test/all.ts growth deungbul/quests` 같은 손에 익은 명령이 그대로 돈다. 틀의 폴더에 두면 틀의 파일이 게임의 시험을 가리키게 된다.
- 수치의 기본값 묶음(`engine/shared/defaults.ts`)은 만들지 않았다. 예제 게임이 실제로 필요로 할 때(11단계) 만든다.
- 게임별 `tsconfig.json`은 두지 않았다. 게임이 하나라 뿌리의 `tsconfig.json` 하나가 별칭을 정한다(4절).
- 화면의 뼈대는 올리지 않았다(3절의 "남은 일").
- 틀의 시험은 `tsconfig.engine.json`에 넣지 않았다: 아직 등불지기의 좌표와 id를 쓴다(13단계).

## 2. 지금의 접점

### 폴더와 별칭

| | 틀 | 이 게임 |
|---|---|---|
| 서버 | `engine/server/` (`net/`, `store/`, `game/game.ts`, `game/systems/`, `text.ts`) | `games/deungbul/server/` (`main.ts`, `deungbul.ts`, `systems/{tower,raid,keepers,quests,rest}.ts`) |
| 공용 | `engine/shared/` (`ext, protocol, messages, sim, nav, world, auto, contract, defs.ts, defs/`) | `games/deungbul/shared/` (`deungbul.ts` 선언, `content/`, `defs.ts`·`world.ts` 통로) |
| 화면 | `engine/client/` (`main.ts`의 `startClient`, `hud/`, `scene/`, `i18n/`, `style.css`) | `games/deungbul/client/` (`index.html`, `main.ts`, `hud/`, `scene/`, `i18n/`, `guide/`, `public/`) |
| 시험 | `engine/test/` | `games/deungbul/test/` (`fixtures/`, `load.ts` 포함) |

- 별칭: `@engine/*` → `engine/*`, `@game/*` → `games/deungbul/*`.
  - `tsc`: `tsconfig.json`의 `paths`.
  - `tsx`(서버 실행, 시험, `scripts/econ.ts`): 실행한 폴더의 `tsconfig.json`을 읽어 `paths`를 따른다. **저장소 뿌리에서 실행해야 한다**(`npm` 스크립트와 `scripts/restart.sh`는 뿌리에서 돈다). 다른 폴더에서 `tsx games/deungbul/server/main.ts`를 직접 부르면 별칭을 찾지 못한다.
  - `vite`: `vite.config.ts`의 `resolve.alias`.
- 별칭은 폴더를 넘을 때만 쓴다. 같은 폴더 안은 상대 경로다.
- 뿌리에 남은 것: `test/all.ts`(시험을 돌리는 도구), `scripts/`, `docs/`, `tsconfig*.json`, `vite.config.ts`, `package.json`, 그리고 git에 넣지 않는 `data/`(저장)와 `dist/`(빌드).

### 서버

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 규칙 플러그인 | `GameOptions.plugins: ((g) => void)[]`. `new Game()`의 기본값은 틀만 | `server/deungbul.ts`의 `installDeungbul(g, { raid })`. 서버는 `server/main.ts`, 시험은 `test/game.ts`가 넘긴다 |
| 시스템 칸 | `engine/server/game/ext.ts`의 `GameSystems` | `server/deungbul.ts`의 선언 병합 (`g.tower`, `g.raid`, `g.keepers`, `g.quests`, `g.rest`) |
| 엔티티 칸 | `EntExt`, `g.entInit` | 규칙 시스템들 (`contrib`, `tier`, `rested`, `qc/qs/qn` 등) |
| 사건 | `HooksExt`, `g.on`·`g.fire` | `offered`, `residentReturned`, `raidWon` |
| 기본 규칙 | `g.rules` (`respawn, speed, canChangeClass, unlocked, siege, touched?`)와 `RulesExt` | 등탑과 습격 시스템 |
| 수치 보정 | `g.mods`와 `ModsExt` | 등탑의 회복·속도, `sparkBonus` |
| 등록 통로 | `g.commands, g.ticks, g.saves, g.worldSaves, g.shared, g.personal, g.out, g.notify, g.announce, g.killBonus, g.ready` | 규칙 시스템의 생성자 |
| 틀의 시스템이 묻는 선택 접점 | `Channels.extraFoes`·`busy`, `worldSaves[].legacy`, `Saver.legacy`·`legacySave` | `raid.ts`, `tower.ts`, 저장을 맡은 시스템들 |
| 호환(다음 배포에서 뺀다) | `g.oldMsgs`, `players.ts`의 `WRITE_OLD_CELLS` | `server/deungbul.ts`의 `SEND_OLD_MSGS` |
| 실행 | `startServer(port, { bots, store, game, staticDir })` | `server/main.ts` (환경 변수, 저장소, 종료 처리, `data/stop.flag`) |

### 공용

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 내용 계약 | `engine/shared/contract.ts`의 `ContentContract` (이름 61개: 맵, 직업·기술, 몬스터, 아이템·상점·제작, 장비와 성장, 던전, 파티·채널·길드·거래소, 경제 장부) | `shared/content/index.ts`가 그 이름들을 내보낸다 |
| 내용의 모양과 도우미 | `engine/shared/defs/*.ts` | 게임의 내용 파일이 타입만 가져온다 |
| 틀의 내용 통로 | `engine/shared/defs.ts`: 틀의 타입·도우미 + 계약의 이름만 `@game/shared/content`에서 다시 내보낸다 | |
| 게임의 내용 통로 | | `shared/defs.ts`, `shared/world.ts`: 틀의 통로 + 이 게임에만 있는 내용. 게임의 파일은 여기서 읽는다 |
| 안내문·메시지·공유 상태 | `engine/shared/ext.ts`의 `MsgMap, ServerMsgs, ClientMsgs, WorldState` | `shared/deungbul.ts`의 선언 병합. 개인 상태의 모양 `MeState`도 여기 있다 |
| 맵 | `MapDef`, `buildWorld`가 `MAP`만 읽는다 | `shared/content/map.ts`의 `MAP`. 등탑·연못·빈터·길·구역은 게임만 읽는다 |
| 잠금 | `ItemDef.needs`, `ForgeDef.needs`: 뜻 없는 열쇠 | 주민 id (`satisfies ResidentId`) |

틀의 소스에서 `@game`을 import하는 파일은 정해져 있다: `engine/shared/defs.ts`, `engine/shared/defs/*.ts`, `engine/shared/contract.ts`, `engine/shared/world.ts`. 그 밖의 틀 파일은 `defs`와 `world`를 거친다.

### 화면

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 진입 | `engine/client/main.ts`의 `startClient({ look, modules })` | `client/main.ts` (그 전에 `mountMarkup()`) |
| 화면 규칙 | `engine/client/rules.ts`의 `rules` (`speed, unlocked, lockNote, lockHint, home`) | `client/deungbul.ts`의 `initDeungbul` |
| 끼어드는 자리 | `bus.onMsg, onFrame, onSlow, onKey`, `onLangChange` | 게임의 모듈들 (init 안에서 등록) |
| 겉모습 | `Look`의 `ground, leaf, scenery`, `view.setMood`, `setMapPaint`, `addMarks`, `registerMonsterModel`·`registerBlade`·`registerArmor`, `addNpc`, `addPlace` | `client/scene/*`, `client/hud/marks.ts`, `client/hud/tower.ts` |
| 창 | `engine/client/hud/shell.ts`의 `mountPanel(자리, html)`과 `SLOTS` | `client/markup.ts`, `client/deungbul.css` |
| 문장 | `koBase(names)`·`enBase(names)`, `mergeLocale`, `setLocales`, `LocaleExt`, `addNotices`, `addMsgSounds` | `client/i18n/*`, `client/words.ts` |
| 상태 | `S` (틀의 칸만) | `client/state.ts`의 `GS`(공유), `G`(개인) |
| 뼈대 | (아직 게임의 `index.html`의 body에 있다) | `client/index.html`의 머리와 script |
| 스타일 | `engine/client/style.css` (틀의 진입 모듈이 읽는다) | `client/deungbul.css` (틀의 것 뒤에 읽혀 덮어쓴다) |
| 빌드 | | `vite.config.ts`: 뿌리 `games/deungbul/client`, 결과 `dist/`. 도감은 게임 빌드 뒤에 따로 |

### 시험

| | 틀 | 이 게임 |
|---|---|---|
| 자리 | `engine/test/이름.test.ts`, `harness.ts` | `games/deungbul/test/이름.test.ts`, `game.ts`, `peer.ts`, `locale-snapshot.ts`, `fixtures/` |
| 게임 만들기 | `new Game()`, `startServer()` | `newGame()`, `startDeungbul()` |
| 명령 | `npm run test:engine` | `npm run test:game`, 이름 앞에 `deungbul/` |
| 지키는 것 | 게임의 규칙·선언·화면·시험을 import하지 않는다(따라 들어오는 것까지). 실행 중에도 `games/deungbul/server/`와 `test/`가 로드되지 않는다 | |
| 아직 기대는 것 | 등불지기의 내용: `@game/shared/defs`·`world`(시험 파일 9개)와 `games/deungbul/test/fixtures/`의 저장 견본 | |

방향을 지키는 검사는 `engine/test/framework.test.ts`에 모여 있다: 폴더 규칙 일곱 가지, 서버와 공용, 확장 지점과 선언 병합, 틀의 시험, 틀의 언어·알림·소리 파일의 낱말, 화면 파일이 가져오는 이름, 뼈대와 스타일.

## 3. 남은 일

### 다음 배포에서 끌 호환 코드

지금 운영 서버는 옛 형식을 함께 쓰고 함께 보낸다. 새 코드를 한 번 배포해 문제가 없으면 다음 배포에서 끈다.

| 무엇 | 어디 | 끌 때 함께 할 것 |
|---|---|---|
| 캐릭터 저장의 옛 최상위 칸에도 쓰기 | `engine/server/game/systems/players.ts`의 `WRITE_OLD_CELLS` | `games/deungbul/test/framework.test.ts`의 "옛 최상위 칸이 함께 적힌다" 검사를 고친다. 끈 뒤에는 3단계 이전 코드로 되돌리면 퀘스트·기여·기여 단계·휴식을 잃는다. 읽는 길(`legacy`)은 지우지 않는다 |
| 옛 `quest` 메시지와 `stat`의 `contrib·rested·tier` 칸도 보내기 | `games/deungbul/server/deungbul.ts`의 `SEND_OLD_MSGS`, 틀의 `g.oldMsgs`와 `server.ts`의 `flush` 두 곳 | `engine/shared/protocol.ts`의 `PROTOCOL`을 올린다. 화면 쪽의 `onMsg('quest')`·`onMsg('stat')` 호환 처리기, `games/deungbul/shared/deungbul.ts`의 `ServerMsgs.quest`·`OldStatCells`를 지운다. 서버를 먼저 재시작하고 곧바로 화면을 올린다 |

### 11단계: 예제 게임과 문서

`games/sample`과 `docs/making-a-game.md`. 새 게임 폴더에 채워야 하는 것의 가장 작은 목록:

1. **내용**: `shared/content/index.ts`가 계약의 이름 61개를 내보낸다. 빠뜨리면 `engine/shared/contract.ts`의 맨 아래에서 컴파일 오류가 난다. 틀의 타입은 `import type`으로만 가져온다.
2. **선언**(필요할 때만): `shared/<게임>.ts`에서 `@engine/shared/ext`를, 서버 플러그인 파일에서 `@engine/server/game/ext`를 넓힌다.
3. **서버**: `server/main.ts`가 `startServer(port, { store, staticDir, game: { plugins: [...] } })`를 부른다. 규칙이 없으면 `plugins: []`.
4. **화면**: `client/index.html`(지금은 등불지기의 body를 그대로 베껴야 한다), `client/main.ts`가 `startClient({ look, modules })`를 부른다. 그 전에 언어 묶음을 `setLocales`로 등록해야 한다.
5. **언어**: `mergeLocale(koBase(이름표), 게임의 문장)`. 이름표(`ContentNames`)에 몬스터·아이템·직업·기술·던전의 이름과 두 번째 재화의 이름이 든다.
6. **모양**: 몬스터와 무기·갑옷의 모델 등록. 하지 않으면 덩어리 모양으로 뜬다.
7. **설정**: 별칭 `@game`이 가리키는 폴더를 바꾸는 `tsconfig`(게임마다 하나)와 `vite` 설정(뿌리, `publicDir`, 결과 폴더), `package.json`의 스크립트.

걸릴 만한 곳:

- **한 `tsc` 프로그램에 두 게임을 넣으면 안 된다.** 선언 병합이 서로 섞이고 `@game`은 한 곳만 가리킨다. 지금 뿌리의 `tsconfig.json`은 `include`에 `games/deungbul`을 적어 두었다: `games/sample`을 더하지 말고 `games/sample/tsconfig.json`을 따로 두어 `include: ["../../engine", "."]`와 자기 `paths`를 갖게 한다. 그 설정에서 `engine/shared/contract.ts`가 예제의 내용을 검사한다.
- **`tsx`는 실행한 폴더의 `tsconfig.json`을 읽는다.** 예제는 `tsx --tsconfig games/sample/tsconfig.json games/sample/server/main.ts`로 띄운다(계획서의 실험에서 확인된 방식. 이번에는 돌려 보지 않았다).
- **틀의 시험은 등불지기의 내용을 쓴다.** `test/all.ts`의 `ENGINE`은 `@game`이 등불지기일 때만 통과한다. 예제의 설정으로 틀의 시험을 돌리려면 13단계가 먼저다.
- **틀에 남은 등불지기의 id**는 지금의 `typecheck:engine`으로는 드러나지 않는다(등불지기의 내용으로 검사하므로). 예제의 내용으로 `engine/`을 타입 검사하면 드러난다. 알려진 것은 아래 "틀에 남은 이 게임의 색".
- **빈 표**: `RECIPES = []`, `DUNGEONS = {}`, `FORGES = []`, `ECON_NOTICES = {}`가 되는지는 돌려 봐야 안다. 대장간 창은 `FORGES`가 비면 열리지 않게 해 두었다. `DUNGEONS`가 비면 `DungeonId`가 `never`가 되어 틀의 코드가 컴파일되지 않을 수 있다.
- **`ECON_CURS`**: 계약은 문자열 목록으로 받지만 장부(`ledger.ts`)는 `gold, sparks, exp` 세 가지를 코드에 적어 두었다.
- **화면의 뼈대**: 예제가 body를 베끼면 틀의 id가 바뀔 때 조용히 깨진다. 예제를 만들기 전에 뼈대를 올리는 것이 낫다(아래).
- **`vite`의 뿌리 밖 파일**: 틀의 코드가 뿌리(`games/<게임>/client`) 밖에 있어 `server.fs.allow`에 저장소 뿌리를 넣어야 하고, `index.html`의 `<link>`로는 뿌리 밖의 css를 개발 서버가 내주지 못한다(그래서 틀의 스타일은 틀의 진입 모듈이 import한다).

### 화면의 뼈대 (`index.html`)

`games/deungbul/client/index.html`의 body는 틀의 창 마크업이다. 계획은 틀의 `engine/client/hud/shell.ts`가 그 마크업을 문자열로 갖고 `startClient`가 붙이게 하는 것이다. 9단계에서 하지 않은 까닭:

- 모듈 최상단에서 틀의 요소를 잡는 파일이 여럿이다(`app.ts`, `auto.ts`, `hud/bag.ts`, `channel.ts`, `chat.ts`, `classes.ts`, `dungeon.ts`, `forge.ts`, `menu.ts`, `minimap.ts`, `near.ts`, `notify.ts`, `shop.ts`, `tags.ts`, `party.ts`). 지금은 마크업이 스크립트보다 먼저 있어서 된다. 뼈대를 스크립트가 붙이면 이 파일들이 import되기 전에 붙어야 하므로, 붙이는 모듈을 틀의 진입 모듈의 첫 import로 두거나 요소 잡기를 init 안으로 옮겨야 한다.
- 게임의 `mountMarkup()`은 틀의 요소가 있어야 하므로 그 뒤여야 한다.
- 붙인 뒤의 DOM이 지금과 같은지(요소의 차례, 공백, 계산된 스타일)를 전후로 견줘야 한다.

올린 뒤에는 게임의 `index.html`이 머리(제목, 아이콘, manifest, 색)와 `<canvas>`·script만 남는다.

### 12단계: 공개 표면

`engine/shared/index.ts`, `engine/server/index.ts`, `engine/client/index.ts`를 두고 게임은 거기와 `ext.ts`에서만 import한다. 지금 게임은 `@engine/…`의 깊은 경로를 143곳에서 읽는다. 깊은 import를 막는 검사를 `framework.test.ts`의 폴더 블록에 더한다.

### 13단계: 틀의 시험을 등불지기의 내용에서 떼기

- 틀의 시험 파일 9개가 `@game/shared/defs`·`world`에서 이 게임만의 이름을 읽는다: `TOWER, TOWERS, POND, PILLARS, ZONE_SPLIT, MIN_X…MAX_Z`(좌표), `SHOP, SMITHY`(자리), `RAID, raidFoes, raidTowerHp, speedFor, GLOW_BRIGHT_*, FULL_TOWER_OFFER`(`framework.test.ts`가 옮긴 수치와 식을 확인하는 데 쓴다: 이 검사들은 게임의 시험으로 옮기는 편이 맞다).
- 그 밖의 틀 시험도 틀의 통로를 거쳐 등불지기의 id(`'slime'`, `'sword3'`, `'crypt'`, `'warrior'`)와 맵 좌표를 쓴다.
- 저장 견본(`games/deungbul/test/fixtures/players.json`, `worlds.json`)을 틀의 `framework.test.ts`가 읽는다.
- 끝나면 `tsconfig.engine.json`에 `engine/test`를 넣을 수 있다.

### 틀에 남은 이 게임의 색

컴파일은 되지만 다른 게임에서는 어색한 것들. 급하지 않고, 예제 게임이 실제로 걸릴 때 고친다.

| 무엇 | 어디 | 메모 |
|---|---|---|
| 두 번째 재화 `sparks` | `Ent.sparks`, `PlayerSave`, `stat` 메시지, `MonsterDef.sparks`, `Reward.sparks`, `players.grant(p, exp, sparks)`, `mail.ts`, `away.ts`, `ledger.ts`(`ECON_CURS`와 한 줄 요약의 '불씨'), `hud/menu.ts`의 보상 글, `fx.ts`(불티 입자는 무관) | 계획서 7절: 일반화하지 않는다. 틀의 "두 번째 재화 한 가지"로 두고, 이름은 게임의 이름표가 준다. `ledger.ts`의 `line()`에 한글 '불씨'가 박혀 있다 |
| 보정 이름 `sparkBonus` | `g.mods` | 이름만 |
| 습격 몹 개념 | `Ent.raid`, `monsters.spawn(…, raid)`, `Monsters.atTower`, `TOWER_ATTACK_RANGE`, `g.rules.siege`, 스냅샷의 `EnterInfo.r`, 화면의 `Remote.raid`, 꼬리표 `'mon raid'`, `fmt.raidFoe` | 틀의 기능으로 남길지 정해야 한다(계획서 8절). 남기면 이름을 중립으로(`swarm`, `rules.siege` → 목표), 빼려면 `monsters.tick`에 몹별 행동을 덮어쓰는 자리가 하나 필요하다 |
| 들판의 id `'field'` | `engine/client/state.ts`의 `inDungeon` | `MAP.areas[0]`이 들판이라는 약속으로 바꾸면 된다(`areaAt(…) !== 0`) |
| 사람 모델의 등불과 고깔모자 | `engine/client/scene/models.ts`의 `makeHumanoid`(허리춤의 등불, 지팡이 직업의 고깔모자) | 모델의 틀이 이 게임의 겉모습이다. 게임이 사람 모델을 넘기거나 꾸미는 접점이 없다 |
| css에 박힌 색과 모양 | `engine/client/style.css` | 색 변수(`--gold`, `--panel` 등)는 게임이 덮어쓰지만 변수로 빠지지 않은 색이 남아 있다 |
| 대장간이 하나 | `engine/client/hud/forge.ts`(`FORGES`의 첫 대장간만), `engine/server/game/systems/craft.ts` | 계약은 목록(`FORGES`)이다 |
| '마을로' | `actions.ts`의 `goToTown`, `input.ts`의 H 키, 문장 키 `goingTown` | 틀의 이름이 '마을'을 말한다. 기본 목적지는 `MAP.spawn` |
| 일일 임무의 종류 | `DailyKind`는 문자열이지만 주석이 이 게임의 `'offer'`를 든다 | 주석만 |
| 채널의 '바쁜 때' | `CHANNEL.tellBusyS`, `Channels.busy`, `channels` 메시지의 `foes` 칸 | 습격에서 온 개념이 중립 이름으로 남았다 |
| 손님 이름, 금칙어 | `GUEST_NAME`(계약), `engine/server/text.ts`의 금칙어 목록 | 금칙어는 언어에 달렸다 |
| 틀의 문장 속 낱말 | `engine/client/i18n/ko.ts`·`en.ts` | 낱말 검사(`framework.test.ts`의 `WORDS_*`)가 지키지만, 상점·대장간·길드·거래소 같은 낱말은 틀의 것으로 남아 있다 |
| 계약에 든 조율 값 | `ECON_WATCH`, `ECON_LEVEL_MARKS`, `ECON_FRESH_DAYS`, `GUEST_NAME` | 게임마다 다를 수 있어 계약에 두었지만 기본값이 있으면 예제가 편하다(`defaults.ts`) |
| 화면의 뼈대 | `games/deungbul/client/index.html`의 body | 위 "화면의 뼈대" |
| 아이콘·manifest·제목 | `games/deungbul/client/public/`, `index.html`의 머리 | 게임의 것이 맞다. 틀에는 기본이 없다 |

## 4. 설정 파일

- `tsconfig.json`: 전체. `include: ["engine", "games/deungbul", "test", "scripts", "vite.config.ts"]`. 게임의 선언 파일(`games/deungbul/shared/deungbul.ts`)은 아무도 import하지 않고 이 `include`로 컴파일에 들어간다: `include`에서 `games/deungbul`을 빼면 선언 병합이 사라져 게임의 코드가 컴파일되지 않는다.
- `tsconfig.engine.json`: 틀만. `include: ["engine/shared", "engine/server", "engine/client"]`. 별칭은 `tsconfig.json`의 것을 물려받아 `@game`이 등불지기의 내용을 가리킨다: 틀의 통로가 import하는 내용 파일은 따라 들어오지만 게임의 선언 파일과 규칙은 들어오지 않는다.
- `vite.config.ts`: `root`는 `games/deungbul/client`, `publicDir`은 그 안의 `public/`, `outDir`은 뿌리의 `dist/`, `base: './'`. 도감은 게임 빌드가 끝난 뒤 같은 `dist/`에 따로 빌드한다.
- `package.json`의 스크립트 이름은 옮기기 전과 같다: `dev, dev:server, dev:client, build, start, pilot, typecheck, typecheck:engine, test, test:engine, test:game, load, econ`. `typecheck`는 전체와 틀만을 차례로 돌린다.

## 5. 운영 서버에 올릴 때 (9단계)

9단계는 저장 형식과 프로토콜을 건드리지 않았다. 서버만 올려도, 화면만 올려도, 어느 쪽을 먼저 올려도 된다. 그래도 파일의 자리가 모두 바뀌었으므로 이렇게 한다.

1. 원본 폴더에서 **실행 중인 다른 작업이 없는지** 확인하고, `git status`가 깨끗한 상태에서 `feat/fw9`를 합친다. 옛 폴더(`client/`, `server/`, `shared/`)에 git이 모르는 파일이 남아 있으면 빈 폴더가 지워지지 않으니 눈으로 확인한다.
2. `npm ci`는 필요 없다(의존성은 그대로다). `npm run typecheck`와 `npm test`를 돌린다.
3. `npm run build`로 `dist/`를 새로 만든다. 서버는 뿌리의 `dist/`를 그대로 내보낸다.
4. 이 PC에만 있는 실행 파일(`start.ps1`, `resume.ps1`, `.claude/`의 설정)이 **옛 경로를 직접 부르지 않는지** 본다: `server/main.ts`, `test/load.ts`, `scripts/typecheck-engine.mjs`, `client/…`를 직접 가리키는 줄이 있으면 고친다. `npm` 스크립트(`npm start`, `npm run pilot` 등)와 `scripts/*.sh`를 부르는 것은 그대로 돈다.
5. `bash scripts/restart.sh`로 서버를 저장하고 다시 띄운다. 로그의 첫 줄에서 저장 파일의 경로가 전과 같은지(`…\data\game.db`) 본다.
6. 화면은 `bash scripts/publish.sh`(터널이 켜져 있을 때) 또는 `npm run pilot`.

알아 둘 것 (옮기기 전부터 그랬던 것):

- 서버를 끄는 깃발 `stop.flag`는 **저장 파일의 옆**에 놓인다(`DB`를 주지 않으면 `data/stop.flag`). 저장 파일을 같은 폴더에 둔 서버가 여럿이면 깃발을 먼저 본 서버 하나만 꺼진다: 확인용 서버 여럿의 DB를 한 임시 폴더에 모아 두고 그 폴더에 깃발을 만들면 남의 서버가 꺼질 수 있다. 확인용 서버는 DB마다 폴더를 따로 주거나 `DB=memory`로 띄우고 프로세스를 직접 끈다.
- `scripts/restart.sh`는 `data/` 폴더가 있어야 로그를 쓴다(운영 폴더에는 있다). 새로 받은 복사본에서는 `mkdir data`가 먼저다.

되돌리는 법: `git revert`로 세 커밋을 되돌리거나 합치기 전의 커밋으로 돌아간 뒤 `npm run build`와 `bash scripts/restart.sh`. 저장 파일은 양쪽 코드가 같은 형식으로 읽고 쓰므로 손댈 것이 없다.
