# 틀(engine/) 완성도 점검 보고

> **기록 문서**: 2026-11-24의 점검 보고다. 여기 적힌 문제는 작업 묶음 A~F로 모두 처리했다(문서로 남긴 몇 가지 빼고). 지금의 상태와 남은 일은 [framework-status.md](framework-status.md)에, 새 게임을 만드는 법은 [making-a-game.md](making-a-game.md)에 있다(2026-11-25 현행화).

기준: `a8188b7`의 복사본(`$TEMP/dg-work/audit2`). 원본은 건드리지 않았다. 표의 "확인"은 복사본에서 돌려 본 것, "읽음"은 코드를 읽기만 한 것, "추측"은 둘 다 아닌 것이다. 화면은 브라우저로 보지 않았다(빌드와 코드로만 판단).

## 결론

**지금 이 틀로 다른 게임을 만들 수는 있지만, "등불지기와 뼈대가 같은 게임"만 틀을 고치지 않고 만들 수 있다.** 최소 내용만 가진 임시 게임(`games/mini`: 원점에서 떨어진 지역 하나, 직업 하나, 몬스터 하나, 상점·대장간·던전·일일 임무·출석·두 번째 재화 없음)을 만들어 보니, 틀을 한 줄도 고치지 않고 `tsc` 0, `new Game()`, `startServer`(3971), 접속·사냥·저장, `vite build`까지 됐다. 플러그인만으로 "직업 자동 지정", "죽으면 골드 절반", "길드·거래소 명령 끄기"도 됐다. 그러나 거기까지 가려면 내용을 등불지기 쪽으로 맞춰야 했다: 장비 옵션은 정확히 `dmg·guard·crit·hp`, 능력치는 정확히 `pow·vit·luck`, 장비 칸은 정확히 `weapon·armor·ring·amulet·charm`, 아이템 id `potion`이 있어야 하고, 직업의 기술은 정확히 셋이다. 이것들은 지금의 어떤 검사에도 걸리지 않는다(틀의 타입 검사가 등불지기의 내용 위에서 돌기 때문이다). 경계를 지키는 장치는 import 방향과 선언 병합은 잘 잡지만, 문자열로 쓴 id·복사한 수치·`as` 캐스팅·깊은 import는 전부 통과한다(20가지를 넣어 9가지만 잡혔다).

가장 먼저 고칠 것 다섯 가지:

1. **틀을 두 번째 내용으로도 타입 검사하기** (`tsc -p <예제 또는 fixture>`를 `npm run typecheck`에). 지금 숨어 있는 63개 오류가 여기서만 드러난다. 작음.
2. **장비 칸·옵션·능력치의 고정 id 풀기** (이름은 이름표 `ContentNames`로, 서버의 `'dmg'`·`'pow'` 직접 참조는 내용의 표로). 이것이 안 되면 모든 게임이 등불지기의 장비 체계를 그대로 가져야 한다. 중간.
3. **빈 표와 낱개 버그 고치기**: `ATTEND = []`면 받을 수 없는 우편이 생기고 받기에서 예외, `loc.items.potion`, `{} as const` 표의 컴파일 실패, 접속 전 카메라 (0, 3), `need: 60`, `'field'`, 개발 포트 3001. 작음.
4. **게임 고르기를 한곳으로**: `games/deungbul`이 `package.json` 3줄·`tsconfig.json` 2줄·`vite.config.ts` 2줄·`test/all.ts` 4줄·`framework.test.ts` 63줄에 박혀 있다. 게임별 `tsconfig.json` + `GAME` 환경 변수 하나로. 중간.
5. **경계 검사의 구멍 막기 + 공개 표면**: id 문자열 검사, 틀 전체의 낱말 검사, 깊은 import 금지, 화면→서버 import 금지. 지금은 게임이 틀의 42개 경로를 140번 깊게 읽는다. 중간.

---

## 1. 틀에 남아 있는 "등불지기"

### 1-1. 다른 내용으로 컴파일하면 드러나는 것 (확인: `tsc -p games/mini/tsconfig.json`, 오류 63개를 원인별로 묶음)

| # | 어디 | 무엇 | 다른 게임에서 | 제안 | 크기 |
|---|---|---|---|---|---|
| 1 | `engine/server/game/systems/gear.ts:34-37`, `engine/shared/defs/growth.ts:42-43`(`baseOpt`), `engine/client/i18n/ko.ts:182-185`·`en.ts` 같은 자리, `engine/client/hud/menu.ts:83` | 장비 옵션 id `dmg, guard, crit, hp`가 코드와 틀의 언어 파일에 있다 | `STATS`를 다르게 하면 컴파일 실패. **더해도 실패**(틀의 문장에 이름이 없다), 빼도 실패. 정확히 이 넷이어야 한다 | 계약: `STATS[id] = { base, mod: 보정 이름, unit }`으로 넓혀 `gear.ts`가 표를 돈다. 이름은 `ContentNames.stats` | 중간 |
| 2 | `systems/build.ts:14-16`, `ko.ts:172-174`, `menu.ts:154`(`BUILD[k]`), 계약의 `BUILD.pow/vit/luck` | 능력치 id `pow, vit, luck` | 정확히 이 셋이어야 한다 | 1과 같은 방식 (`BUILD_STATS[id] = { mod, per }`), 이름은 이름표 | 중간 |
| 3 | `ko.ts:32`, `en.ts:153`(칸 이름 다섯 개가 틀에), `gear.ts:63,97,104,124,170,177,187`, `menu.ts:103` | 장비 칸 `weapon, armor, ring, amulet, charm` | 칸을 셋으로(`weapon, armor, chip`) 하면 틀의 언어 파일에서 실패. `weapon`·`armor`가 없으면 `gear.ts`에서 실패 | 칸 이름은 `ContentNames.gearSlots`. "무기 칸은 반드시 있고 `ItemDef.kind`와 같은 이름"이라는 약속은 계약에 적는다 | 중간 |
| 4 | `engine/client/hud/shop.ts:73` | `loc.items.potion.name`: 아이템 id `potion` | `potion`이라는 id의 아이템이 없으면 컴파일 실패 | `t('bagPotions')` 같은 틀의 문장으로 | 작음 |
| 5 | `engine/client/auto.ts:44`, `hud/dungeon.ts:31-72`, `ko.ts:234,312-317`, `en.ts:220,283-288`, `systems/daily.ts:55-58`, `systems/dungeon.ts:195`, `menu.ts:179` | 빈 표(`DUNGEONS`, `DAILIES`)를 `{} as const satisfies …`로 쓰면 id 타입이 `never` | 던전·일일 임무 없는 게임이 컴파일되지 않는다. `Readonly<Record<string, DungeonDef>> = {}`로 쓰면 컴파일되고 실행도 된다(확인) | 틀이 `dungeonDef(id)`처럼 넓힌 타입으로 읽게 하거나, 최소한 문서에 쓰는 법을 적는다 | 작음 |
| 6 | `hud/bag.ts:49,52`, `menu.ts:321`, `hud/shop.ts:71`, `systems/mail.ts:16`, `market.ts:27`, `players.ts:75`, `engine/shared/auto.ts:49` | `ITEMS[id].kind === 'potion'`처럼 좁은 리터럴에 견준다 | 물약·재료·갑옷 종류가 없는 게임에서 TS2367 | `itemDef(id).kind`(넓은 `ItemDef`)로 읽는다 | 작음 |
| 7 | `ko.ts:33` | 등급 이름 `common, uncommon, rare, epic`이 틀에 있다(`Record<string,string>`이라 컴파일은 된다) | 다른 등급 id는 화면에 id가 그대로 나온다(읽음) | `ContentNames.rarities` | 작음 |
| 8 | `engine/shared/defs/combat.ts:37` | `skills: readonly [SkillId, SkillId, SkillId]`인데 `SKILL_SLOTS`는 수 | 기술 칸을 2나 4로 할 수 없다 (읽음) | `readonly SkillId[]`와 길이 검사 | 작음 |

### 1-2. 컴파일은 되지만 실행에서 걸리는 것

| # | 어디 | 무엇 | 확인 | 제안 | 크기 |
|---|---|---|---|---|---|
| 9 | `systems/daily.ts:42-45`, `systems/mail.ts:153` | `ATTEND = []`면 접속할 때 보상이 `undefined`인 출석 우편이 생기고, `mailClaim`에서 `TypeError: … reading 'gear'`. 우편은 받을 수 없이 남는다 | 확인 | `ATTEND.length === 0`이면 출석을 건너뛴다 | 작음 |
| 10 | `systems/ledger.ts:438`(`'골드 … 불씨 … 경험치'`), `:289,304-306`, `scripts/econ.ts:73,90,159-161,187` | 장부가 `ECON_CURS`를 무시하고 세 재화를 코드에 적었고, 한 줄 요약이 한글이다 | 확인 (`ECON_CURS = ['gold']`인데 `불씨 +0 -0` 출력) | `ECON_CURS`를 돌고 재화의 id를 찍는다 | 작음 |
| 11 | `Ent.sparks`(`entity.ts:30`), `store/types.ts:5`, `protocol.ts:142`, `wallet.ts:26`(`Cur`), `players.ts:37,45,72,143`, `away.ts:17,49,62`, `mail.ts:31,145,171`, `game.ts:98`(`sparkBonus`), `client/state.ts:38`, `client/main.ts:35`, `menu.ts:49`, `ko.ts:270,360` | 두 번째 재화. 없는 게임에서도 처치 안내문이 `… + +0, 골드 +2`를 찍는다(이름표가 없을 때의 이름이 `'+'`) | 읽음 (칸이 0으로 남는 것은 확인) | 일반화는 하지 않는다(계획 7절). 0이면 문장에서 빼는 것만 | 작음 |
| 12 | `engine/server/store/types.ts:5,9,17,19` | `PlayerSave`에 이 게임의 옛 칸 `contrib, quest, rested, tier` | 읽음 | `legacy(whole: Record<string, unknown>)`로 넓히고 칸을 지운다 | 작음 |
| 13 | `engine/shared/messages.ts:33`, `ko.ts:361`, `en.ts:332`, `hud/notify.ts:21` | 안내문 `rested`("휴식 보너스 … 처치 경험치 2배"). 휴식은 게임의 시스템(`games/deungbul/server/systems/rest.ts`)이다 | 읽음 | 게임의 `MsgMap`으로 옮긴다 | 작음 |
| 14 | `systems/monsters.ts:8,20,33,41-44,51,78,85,88,102-107`, `game.ts:86`, `protocol.ts`의 `EnterInfo.r`, `client/entities.ts:58-60,82,88`, `ko.ts:240` | 습격 몹(`Ent.raid`, `atTower`, `TOWER_ATTACK_RANGE = 3.2`, `rules.siege`는 점 하나) | 읽음 | 이름을 중립으로(`swarm`, `rules.siege` → 목표 함수) | 중간 |
| 15 | `client/state.ts:77` | `inDungeon()`이 지역 id `'field'`에 견준다 | 읽음 (틀 안에서는 쓰지 않고 게임만 쓴다) | `areaAt(…) !== 0` | 작음 |
| 16 | `client/state.ts:83` | `need: 60` (등불지기의 `LEVEL.firstNeed`) | 읽음 | `LEVEL.firstNeed` | 작음 |
| 17 | `client/main.ts:117` | 접속 전 카메라가 (0, 3) 둘레를 돈다 (등불지기의 마을) | 읽음 (mini의 맵은 x 200~260이라 빈 곳을 본다) | `MAP.spawn` | 작음 |
| 18 | `client/net.ts:20` | 개발 서버 포트 3001 | 읽음 | `VITE_DEV_PORT`나 `startClient`의 옵션 | 작음 |
| 19 | `engine/shared/world.ts:271-281`, `client/scene/view.ts:80`, `systems/bots.ts:7,26-27`, `systems/monsters.ts:18,24`, `systems/dungeon.ts:75-79` | "0번 지역이 들판"이라는 가정: 나무·바위·땅·봇·무리가 0번에만. 봇의 여백 12/18은 좁은 맵에서 범위가 뒤집힌다 | 읽음 (60×40 맵에서는 정상) | 약속으로 두고 문서화. 땅은 지역마다 깔게 | 중간 |
| 20 | `client/entities.ts:41-43`, `ko.ts:152,279`('길 상인') | `SHOPS`의 자리마다 사람 모델이 서고 이름이 '길 상인' | 읽음 | 상인을 세우는 일을 게임에게(`addNpc`) | 작음 |
| 21 | `client/hud/forge.ts:14` | 대장간 창은 `FORGES`의 첫 대장간만 | 읽음 | 가까운 대장간을 찾는다 | 작음 |
| 22 | `client/scene/models.ts:57-80`(허리춤의 등불 `:78-80`, 고깔모자 `:72`), `defs/combat.ts:39,41`(`hand`, `shot`), `i18n/names.ts:10`(`bow`, `staff`) | 사람 모델과 손 모양 셋이 틀에 고정. 플레이어 모델을 등록하는 접점이 없다 | 읽음 | `registerHand`/`registerPlayerModel` | 중간 |
| 23 | `systems/gear.ts:12,64-65` | 저장을 읽을 때의 상한: 옵션 4개, 장비 레벨 20, 값 500 | 읽음. 장비 레벨이 20을 넘는 게임은 읽을 때 장비가 조용히 사라진다 | `RARITIES`·`GEAR`에서 구한다 | 작음 |
| 24 | `players.ts:62,72-73`, `mail.ts:19` | 레벨 999, 골드·불씨 1e9, 우편 보상 1e7 | 읽음 | `CURRENCIES.max`에서 | 작음 |
| 25 | `engine/shared/auto.ts`(`AUTO`, `AWAY`: 최소 레벨 3, 하루 8시간), `world.ts:243-251`(`PLAYER_SPEED 6.2`, `AOI`, `NAME_MAX`), `players.ts:53` | 틀에 든 조율 값. 계약에 없어 게임이 못 바꾼다 | 읽음 | 문서에 "틀의 상수"로 적는다. 필요해질 때 계약으로 | 문서 |
| 26 | `ko.ts`·`en.ts` | '골드'가 스물다섯 문장쯤에, '대장간에서 쓸 수 있습니다'(`:286`), '우두머리', '자정에', 'Q: 물약' | 읽음 | 첫 번째 재화의 이름을 이름표로. 나머지는 게임이 덮어쓰면 된다(문서화) | 작음 |
| 27 | `engine/server/text.ts:4-9` | 금칙어가 한국어·영어로 고정, 더하는 접점 없음 | 읽음 | `addBannedWords` | 작음 |
| 28 | `client/hud/minimap.ts:13,28` | 색 이름 `tower`, `MARK.lit/dark/quest` | 읽음 | 이름만 | 작음 |
| 29 | `client/style.css`(441줄) | 색 변수 11개, 변수 밖의 색이 든 줄 40개쯤, 글꼴이 한글 글꼴 | 읽음 | 문서화 | 문서 |
| 30 | `games/deungbul/client/index.html`(151줄, id 79개) | 뼈대가 게임 폴더에 있다 | 확인 (mini는 통째로 베껴야 빌드됐다. 제목 '등불지기'와 아이콘 경로가 따라온다) | 알려진 일: `shell.ts`로 올린다 | 중간 |
| 31 | `engine/`의 주석 | `games/deungbul/…` 경로가 25개 파일 27줄에 | 확인 (grep) | 틀을 떼어 낼 때 정리 | 작음 |

시험이 기대는 내용은 4절에 따로 적었다.

---

## 2. 접점의 완결성

| 하려는 일 | 판정 | 근거 | 필요한 접점 (크기) |
|---|---|---|---|
| 죽으면 벌 | **된다** | `g.on('playerDied', …)`에서 `g.wallet.take` (확인: 골드 100 → 50) | |
| 직업 없는 게임 | **된다(플러그인)** | `g.on('playerJoined', (p) => g.classes.apply(p, 'pilot'))` (확인). 하지 않으면 직업 창이 강제로 뜨고(`hud/classes.ts:51`) 자리 비움 사냥이 안 된다(`server.ts:137,348`) | 직업이 하나면 틀이 스스로 정하게 (작음) |
| 표준 기능 끄기 (길드, 거래소) | **부족** | 서버는 `g.ready`에서 `g.commands.delete(…)`로 된다(확인). 화면의 탭은 `menu.ts:14-21`의 상수라 숨길 수 없다 | `startClient({ tabs })`나 `hideTab(key)` (작음). 시스템을 선택형으로 만드는 것은 7절대로 하지 않는다 |
| 새 저장소 | **부족** | `startServer({ store })`. 그런데 `Store`가 전부 동기다(`store/types.ts:41-61`): PostgreSQL처럼 비동기인 곳은 그대로 못 붙인다 | 읽기를 미리 올려 두는 덮개를 게임이 만들거나 `Store`를 비동기로 (큼). 필요해질 때 |
| 새 언어 | **된다** | 게임이 `Locale` 모양의 묶음을 만들어 `setLocales`에 넣는다. 다만 틀의 문장 수백 개를 게임 폴더에서 번역해 들고 있어야 한다 | 틀에 `ja.ts`를 두는 것이 낫다 (문서화) |
| 날짜 넘김의 시간대 | **부족** | `daily.ts:30-33`, `ledger.ts:385-389`가 프로세스의 지역 시간·자정 고정 | 지금은 `TZ` 환경 변수뿐. `GameOptions.dayOf` (작음) |
| 레벨 없는 게임 | **부족** | `LEVEL.firstNeed`를 아주 크게 하면 오르지 않지만, 화면의 레벨·경험치 막대와 능력치 점수·순위가 남는다 (읽음) | 필요해질 때 |
| 몬스터가 사람 아닌 것을 공격 | **부족** | `rules.siege`(점 하나)와 `monsters.atTower`, 피해는 게임이 센다(`games/deungbul/server/systems/raid.ts:224`). 목표 여럿이나 엔티티 목표는 안 된다 | 1절 14번과 같이: 목표를 함수로 (중간) |
| 맵이 여럿 (마을과 필드가 다른 지역) | **부족** | `MAP.areas`는 여럿이지만 오가는 길이 던전(인스턴스, 제한 시간)뿐이다. 플러그인이 좌표를 옮기고 `g.emit(['r', id])`를 할 수는 있으나, 0번 밖의 지역은 던전으로 친다(`dungeon.ts:75-79`, 1절 19번) | `g.movement.teleport`와 지역의 종류 (중간) |
| 화면의 뼈대 바꾸기 | **부족** | 붙는 자리 8곳(`shell.ts`의 `SLOTS`)과 css 덮어쓰기. 뼈대 자체는 게임이 베낀 파일 | 뼈대를 틀로 올린 뒤에 (중간) |
| 새 재화 하나 더 | **틀을 고쳐야** | `wallet.ts:26`의 `Cur`이 셋으로 고정. 게임이 `EntExt` 칸 + `g.saves` + `g.personal`로 자기 재화를 가질 수는 있지만(등불지기의 기여가 그렇다) 지갑·장부·우편 보상·거래소가 모른다 | 7절: 지금은 하지 않는다 |
| 장비 칸의 종류, 능력치의 종류 | **틀을 고쳐야** | 1절 1~3번 (확인) | 중간. **지금 해야 한다** |
| 사람끼리 싸우는 구역 | **틀을 고쳐야** | `combat.ts:15`(대상은 몬스터만), `:64`(범위도 몬스터만) | `g.rules.canHit(src, dst)` (중간). 필요해질 때 |
| 기술 효과의 새 종류 | **틀을 고쳐야** | `defs/combat.ts:8-14`의 세 종류와 `combat.ts:37-55`의 `switch`. 플러그인은 `g.commands.set('skill', …)`로 통째로 갈아 끼울 수만 있다 | 7절: 지금은 하지 않는다. 필요해지면 `skillUsed` 사건 하나 (작음) |
| 탈것·펫 | **틀을 고쳐야** | 속도는 `g.rules.speed`로 된다. 모델을 바꾸는 접점이 없고 엔티티 종류가 `'p' \| 'm'`뿐 | 필요해질 때 |
| 계정 붙이기 | **틀을 고쳐야** | `server.ts:227-228`이 토큰을 직접 해시한다 | `Options.auth?: (msg) => key \| null` (중간, `docs/accounts.md`와 함께) |
| 조작 방식 | **틀을 고쳐야** | `input.ts:84-95`: 틀의 키(1~3, Q, R, H, B, M, Tab)가 게임의 `onKey`보다 먼저라 바꾸거나 끌 수 없다. 카메라는 `view.ts:8,32,146`의 상수 | 키 표를 등록식으로 (작음), 카메라 옵션 (작음) |

---

## 3. 경계를 지키는 장치의 구멍

복사본에 일부러 넣어 본 20가지 (모두 확인. "타입"은 `npm run typecheck`, "시험"은 `tsx test/all.ts framework wallet`):

| 넣은 것 | 타입 | 시험 | 결과 |
|---|---|---|---|
| 틀의 파일이 게임을 상대 경로로 import | 통과 | 실패 2 | **잡힘** |
| 통로가 아닌 틀 파일이 `@game/shared/content`를 import | 통과 | 실패 2 | **잡힘** |
| 틀의 통로에 계약 밖의 이름(`SMITHY`) 더하기 | 통과 | 실패 2 | **잡힘** |
| 틀의 알림 분류표에 게임의 안내문 키(`raidWon`) | 오류 1 | 실패 3 | **잡힘** |
| 틀의 언어 파일에 '등탑' | 통과 | 실패 1 | **잡힘** |
| 틀의 css에 `#tower` | 통과 | 실패 1 | **잡힘** |
| 틀의 시험이 `@game/shared/content/tower`를 직접 import | 통과 | 실패 1 | **잡힘** |
| `declare module`로 확장 지점 밖의 틀 파일 넓히기 | 통과 | 실패 1 | **잡힘** |
| 틀에서 `p.gold += 0` | 통과 | 실패 1 | **잡힘** |
| 틀의 서버 코드에 `m.type === 'ash_troll' && p.cls === 'mage'` | 통과 | 통과 | 놓침 |
| `g.notify(p, 'raidWon' as never)` | 통과 | 통과 | 놓침 |
| 게임의 수치·좌표를 틀에 복사 (`{ x: 0, z: 0, reach: 6, glowMax: 100 }`) | 통과 | 통과 | 놓침 |
| 틀의 hud 파일(언어 파일 아님)에 `'불씨를 등탑에 바치세요'` | 통과 | 통과 | 놓침 |
| 틀의 css에 `.lampglow, .raidwarn { color: #f0bb55 }` | 통과 | 통과 | 놓침 |
| 틀에서 `(g as unknown as { tower? }).tower` | 통과 | 통과 | 놓침 |
| 틀의 화면에서 `(S as unknown as { world: { tower } })` | 통과 | 통과 | 놓침 |
| `p['gold'] += 0`, `Object.assign(p, { sparks })` | 통과 | 통과 | 놓침 |
| 게임이 틀의 내부를 깊게 import (`@engine/server/net/snapshot`) | 통과 | 통과 | 놓침 |
| 틀의 화면이 틀의 서버를 import (`../server/game/layers`) | 통과 | 통과 | 놓침 |
| 틀의 게임 규칙이 저장소 구현을 import (`../../store/memory`) | 통과 | 통과 | 놓침 |

그 밖에 알아 둘 것:

- **예제 내용으로 타입 검사해도 문자열 id는 잡히지 않는다.** `Ent.type`, `cls`, `weapon`이 `string`이라 `m.type === 'ash_troll'`은 어떤 내용에서도 컴파일된다. README의 "id가 박혀 있는지는 예제 게임의 내용으로 검사할 때 드러난다"는 표의 키로 타입이 잡힌 곳(1절 1~6번)에만 맞다.
- 틀의 시험이 게임만의 이름을 읽는 것은 통로 둘(`@game/shared/defs`, `world`)을 거치면 통과한다(설계대로). 개수(지금 10개 파일 13곳)는 찍기만 하고 상한으로 지키지 않는다.
- `npm run test:engine`의 로드 검사는 `games/deungbul/(server|test)/`만 본다. 게임의 `shared/content/tower.ts` 같은 게임만의 내용이 로드되는 것은 보지 않는다.

놓치는 것을 잡을 검사 (모두 `framework.test.ts`의 폴더 블록에 넣을 수 있는 글자 검사):

| 검사 | 잡는 것 | 메모 |
|---|---|---|
| **id 문자열 검사**: 게임의 표(`CLASSES, MONSTERS, ITEMS, SKILL_DEFS, DUNGEONS, DAILIES`, 지역 id, 등급 id)의 키를 모아, 틀의 소스(주석 제외)에 따옴표로 싸였거나 `.id`로 쓰인 것이 있으면 실패 | 문자열 id | 객체의 키까지 본다. 지금 돌리면 진짜는 `shop.ts:73`의 `potion`, `state.ts:77`의 `'field'`, `ko.ts:32-33`의 칸·등급 이름이고, 허용 목록에 넣을 것은 종류 이름 `'potion'`과 보정 이름 `guard, crit, hp`, 미니맵 모양 `'ring'`뿐이다(확인) |
| 낱말 검사를 틀의 모든 소스의 문자열과 css로 넓히기 (지금은 8개 파일) | hud·서버의 문장 | 지금 돌리면 `ledger.ts:438`이 걸린다(진짜) |
| `as unknown as`·`as never`·`as any`의 개수를 상한으로 | 캐스팅으로 돌아가기 | 줄어들기만 하게 |
| 층 규칙 둘: `engine/client`는 `engine/server`를 import하지 않는다, `engine/server/game`은 `store/`에서 타입만 | 층 넘기 | 지금은 `net` 방향만 본다 |
| 깊은 import 금지 (5절) | 내부 새어 나감 | |
| 지갑 검사의 정규식에 `['gold']`와 `Object.assign` | 지갑 돌아가기 | |
| 틀의 css의 선택자는 틀의 뼈대·틀의 소스에 나오는 id·class만 | css의 게임 요소 | 뼈대를 올린 뒤에 |
| 틀의 시험의 `@game` 개수를 상한으로 | 13단계가 뒤로 가는 것 | 지금 13 |
| 틀을 두 번째 내용으로 타입 검사 | 1절 1~6번 | 가장 값싸고 효과가 크다 |

---

## 4. 틀의 시험이 기대는 내용 (13단계)

묶음별로 센 것 (주석 제외. 숫자는 그 종류의 id가 나온 횟수):

| 시험 | 줄/검사 | `@game`에서 읽는 이름 | 직업 | 몬스터 | 아이템 | 그 밖 |
|---|---|---|---|---|---|---|
| monsters | 23/3 | | 1 | 1 | | |
| move | 24/3 | `POND, TOWER` | | | | 좌표 (집 -9, 9) |
| classes | 32/7 | `SHOP` | | 1 | 8 | |
| craft | 48/9 | `SMITHY, RECIPES` | | 1 | 23 | 주민 1 |
| shop | 52/11 | `SHOP` | | | 26 | 주민 2 |
| nav | 57/8 | `POND` | | | | 좌표 11 |
| boss | 61/9 | `ZONE_SPLIT` | | 2 | | |
| party | 65/16 | | | 2 | | |
| build | 66/13 | | 1 | 1 | | 기술 9, 능력치 11 |
| guild | 81/22 | | 1 | 1 | | |
| combat | 84/14 | `TOWER` | 16 | 2 | | 좌표 8 |
| dungeon | 133/21 | | 2 | | | 던전 18, 좌표 8 |
| growth | 134/23 | | 2 | | 5 | 일일 5, 칸 3 |
| security | 182/23 | | 5 | | | 던전 2, 좌표 10 |
| server | 187/37 | `MIN_X…MAX_Z` | 1 | 3 | 4 | 좌표 10 |
| ledger | 256/36 | | 4 | 10 | 6 | 한글 문장 9 |
| wallet | 279/54 | `SHOP, SMITHY` | 1 | 4 | 12 | |
| channel | 306/47 | | 3 | 16 | | 좌표 12 |
| market | 360/74 | | 2 | | 76 | 칸 7 |
| harden | 527/82 | | 11 | 2 | | 좌표 5 |
| framework | 789/85 | 30개쯤 (`RAID, raidFoes, speedFor, GLOW_*` 등) | 2 | 9 | 17 | 저장 견본, 맵 지문, `games/deungbul` 경로 63줄 |

### 시험 삼아 옮겨 본 것 (복사본에서, 확인)

`engine/test/fixture/`를 만들었다: `shared/content/index.ts`(지역 둘, 직업 둘, 몬스터 셋, 무기·물약·재료), `tsconfig.json`(`@game` → fixture), `index.ts`(시험이 읽는 이름 `FX`). `monsters.test.ts`와 `move.test.ts`를 옮겨 `npx tsx --tsconfig engine/test/fixture/tsconfig.json engine/test/monsters.test.ts`로 6개 검사가 모두 통과했다. 겪은 일:

1. **fixture를 뿌리의 `tsc`에 넣으면 안 된다.** 뿌리의 `include`가 `engine` 전체라 fixture의 내용이 등불지기 별칭으로 검사되어 오류 6개가 났다(`ClassDef.skills`의 `SkillId`가 등불지기의 기술 id가 된다). 뿌리 `tsconfig.json`에 `exclude: ["engine/test/fixture"]`를 넣고 fixture는 자기 `tsconfig`로 따로 검사한다. `games/sample`도 같은 일을 겪는다.
2. **옮긴 시험은 등불지기 별칭에서는 죽는다**(`e.type === 'fierce'`인 몬스터가 없다). `test/all.ts`가 한 프로세스에서 다 돌리는 지금의 방식으로는 섞어 돌릴 수 없다: 틀의 시험을 fixture 별칭의 프로세스로 따로 돌리게 `test/all.ts`를 먼저 고쳐야 한다.
3. **fixture도 등불지기의 장비 체계를 그대로 가져야 한다**(1절 1~4번). 그것을 먼저 풀지 않으면 fixture가 "등불지기의 축소판"이 된다.
4. 남은 18개 시험을 고치지 않고 fixture 위에서 돌리면 **하나도 통과하지 못한다**: 8개는 `@game/shared/defs`·`world`가 없어 import에서, 10개는 없는 id로 `TypeError`.
5. `TSX_TSCONFIG_PATH` 환경 변수로도 별칭이 바뀐다(다른 폴더에서 실행해도 된다).

### 순서와 크기

| 차례 | 무엇 | 크기 |
|---|---|---|
| 0 | fixture 내용과 `FX`, 뿌리 `tsconfig`의 `exclude`, `test/all.ts`가 틀의 시험을 fixture 별칭의 프로세스로 돌리게. `tsc -p engine/test/fixture`를 `typecheck`에 (이것이 결론 1번이다) | 작음 |
| 1 | 작은 것 열한 개: monsters, move, nav, party, guild, build, classes, shop, craft, boss, combat. id와 좌표를 `FX`로 바꾸는 기계적인 일 | 중간 |
| 2 | 내용이 두꺼운 것: growth, dungeon, wallet, ledger, market(아이템 id 76곳이지만 되풀이) | 중간 |
| 3 | 서버를 띄우는 것: channel, security, server, harden | 중간 |
| 4 | `framework.test.ts`를 셋으로 가른다: (가) "예전 식과 같다"는 검사(`:57-195`: 맵 지문 411/448/80, `LEVEL 60 × 1.35`, 물약 `tonic,potion`, 습격의 식)와 저장 견본 → `games/deungbul/test/`로. (나) 틀만의 게임이 도는지(`:226-373`) → fixture로. (다) 폴더·import 검사(`:396` 이후, `games/deungbul` 경로 63줄) → 게임 폴더의 이름을 받는 함수로 | 큼 |

가장 어려운 것은 4번이다(세 가지가 한 파일에 섞여 있고, 게임 쪽 `framework.test.ts`와 겹친다). 다음은 3번의 `harden`(527줄).

---

## 5. 공개 표면 (12단계)

게임이 틀에서 읽는 것: **import 문 140개, 경로 42개, 파일 57개** (서버 18, 공용 18, 화면 64, 시험 40). 문서의 "143곳"은 지금 140이다. 입구 파일(`index.ts`)은 하나도 없으므로 `ext` 셋과 `shared/defs`·`shared/world`·`server/store`·`client/i18n`을 빼면 전부 깊은 경로다.

| 경로 | 읽는 이름 | 가름 |
|---|---|---|
| `server/game/game` | `Game, GameOptions` | 약속 |
| `server/game/entity` | `Ent`, `readInt, dist, clamp` | `Ent`는 약속. 도우미 셋은 새어 나온 것(내놓을 만하다) |
| `server/game/layers` | `channelOf, isField, notifyLayer, fieldLayer` | 내놓을 만하다 |
| `server/net/server` | `startServer, Options, Running` | 약속 |
| `server/store` | `MemoryStore, SqliteStore, Store, PlayerSave, WorldSave, EconRow` | 약속 |
| `shared/defs`, `shared/defs/*` (8개 파일) | 타입(`ClassDef, ItemDef, MapDef, MonsterDef, DungeonDef, Reward` …)과 `export *` | 약속. 내용 파일은 통로가 아니라 `defs/*.ts`를 직접 읽어야 한다(초기화 순서) |
| `shared/world` | `PLAYER_SPEED`, `export *` | 약속 |
| `shared/protocol`, `messages`, `ext` | `ServerMsg, ClientMsg, WorldState, MsgKey, MsgArg, MsgMap` | 약속 |
| `shared/auto` | `AUTO, AWAY` | 새어 나온 것(도감이 수치를 읽는다) |
| `client/main` | `startClient` | 약속 |
| `client/bus` | `onMsg, onFrame, onSlow, onKey` | 약속 |
| `client/rules` | `rules` | 약속 |
| `client/i18n`, `i18n/merge`, `i18n/names` | `L, t, onLangChange, setLocales, clock, mergeLocale, overlaps, ContentNames, itemNameOf` | 약속 |
| `client/i18n/ko`, `i18n/en` | `koBase, enBase, Locale, UiKey`, 그리고 `josa, num, signed, count, keyHints, itemInfo` | 앞의 넷은 약속. 뒤의 도우미는 새어 나온 것(게임의 문장이 쓰므로 내놓아야 한다) |
| `client/hud/shell`, `near`, `minimap`, `notify` | `mountPanel`, `addPlace`, `addMarks, setMapPaint, MARK, Mark, MapBrush`, `addNotices, banner` | 약속 |
| `client/scene/models` | `registerMonsterModel, registerBlade, registerArmor`와 타입들, 그리고 `makeHumanoid, makeBlob, limb, part, mat` | 등록 함수는 약속. 만드는 도우미는 새어 나온 것("모델 도구"로 내놓을 만하다) |
| `client/entities` | `addNpc, setMerchantLook` | 약속 |
| `client/actions` | `moveTo, goToTown` | 약속 |
| `client/sound` | `addMsgSounds, sfx` | 약속 |
| `client/scene/view` | `Mood` | 약속 |
| `client/app` | `$`, `view` | **내부**: `view` 객체 전체가 나간다. `setMood`와 장면에 더하는 것만 내놓는다 |
| `client/state` | `S`, `inDungeon` | **내부**: 고칠 수 있는 상태 전체. 읽기 전용 타입으로 |
| `client/net` | `send` | 내놓아야 한다 |
| `client/hud/me`, `hud/classes` | `hudSlow`, `openClasses` | 새어 나온 것(`hudSlow`는 틀의 사정이다) |
| `test/harness` | `check, connect, sleep, until, Peer` | 시험 도구: `engine/testing.ts` 같은 입구로 |

그 밖에, import 문에는 안 보이지만 게임이 부르는 것이 표면이다: `g.players.grant`, `g.mail.send`, `g.daily.add`, `g.monsters.spawn/atTower/asleep`, `g.channels.extraFoes/busy`, `g.wallet.*`, `g.ledger.note`, `g.classes.apply`, `g.movement.goTo`, `players.devSpawn`. 계획서의 "안정으로 내놓을 것" 목록에 `wallet`, `ledger.note`, `channels`의 두 접점, `classes.apply`를 더해 문서에 적어야 한다.

입구는 셋이 아니라 **다섯**이어야 한다:

- `engine/shared/index.ts`: `defs`, `world`, `protocol`·`messages`의 타입, `auto`의 `AUTO`·`AWAY`. 단, 계약의 내용 파일은 계속 `defs/*.ts`에서 타입만 읽는다(입구를 값으로 읽으면 순서가 꼬인다).
- `engine/server/index.ts`: `Game, GameOptions, Plugin, Ent`, `startServer, Options, Running`, 저장소, `layers`의 넷, `entity`의 도우미, `text.ts`의 `mask, isClean`.
- `engine/client/index.ts`: 위 표의 화면 쪽 약속 전부.
- `engine/client/i18n`(지금 있는 것): **따로 둬야 한다.** 도감과 게임의 시험(`guide.test.ts`, `locale-snapshot.ts`)이 node와 정적 페이지에서 읽는다. 화면 입구에 합치면 three.js와 모듈 최상단의 요소 잡기가 따라 들어온다.
- `engine/testing`(`harness`): 시험 도구.

깊은 import를 막는 검사: `framework.test.ts`의 폴더 블록에서 `games/` 아래 파일의 import 가운데 `@engine/(shared|server|client)/.+`인 것을 모아, 허용 목록(`@engine/shared/ext`, `@engine/server/game/ext`, `@engine/client/i18n`, `@engine/client/i18n/ext`, 내용 파일에 한해 `@engine/shared/defs/*`의 `import type`)에 없으면 실패. 지금은 이 검사가 없다(3절에서 통과한 것).

---

## 6. 가져다 쓰는 과정의 걸림돌

저장소를 통째로 복사해 새 게임을 시작할 때 손대야 하는 곳:

| 파일 | 줄 | 무엇 |
|---|---|---|
| `package.json` | 2, 8, 11, 18 | 이름, `dev:server`, `start`, `load`가 `games/deungbul/…` |
| `tsconfig.json` | 15, 18 | `@game`의 `paths`, `include`의 `games/deungbul` |
| `tsconfig.engine.json` | | 뿌리의 `@game`을 물려받는다: 틀만 검사해도 등불지기의 내용으로 |
| `vite.config.ts` | 7, 12, 20-33 | 뿌리, 별칭, 도감 페이지(`guide.html`: 다른 게임에는 없다) |
| `test/all.ts` | 13, 15, 17, 36 | `GAME` 목록, `GAME_RULES` 정규식, 이름의 `deungbul/` 머리 |
| `engine/test/framework.test.ts` | 63줄 | `games/deungbul`의 파일 경로와 이름들: **게임 폴더를 지우면 틀의 시험이 실패한다** |
| `engine/test/*.test.ts` | | 등불지기의 내용 (4절) |
| `scripts/pilot.mjs` | 15, 16 | Pages 저장소 `indie-craft-codes/deungbul-play`, 포트 3001 |
| `scripts/restart.sh` | 6, 7, 20 | 포트 3001, `data/`, `BOTS=6`, `npm start` |
| `scripts/publish.sh` | | `.pages/`와 `dist/` 고정. 게임과는 무관하지만 하나만 올린다 |
| `scripts/econ.ts` | 73, 90, 159-161, 187 | 재화 셋과 한글 이름, `data/game.db` |
| `engine/client/net.ts` | 20 | 개발 포트 3001 |
| `games/<게임>/client/index.html` | | body를 베낀다 |
| `README.md` | | 전체가 등불지기의 문서다 |

**한곳에서 고르게 하려면** (확인한 것: `tsx --tsconfig`, `TSX_TSCONFIG_PATH`, `tsc -p games/mini`, 별칭만 바꾼 `vite build`):

1. 게임마다 `games/<게임>/tsconfig.json`(`extends` 뿌리, 자기 `paths`, `include: [틀의 소스, "."]`). 뿌리 `tsconfig.json`에는 공통 옵션만 남긴다. 등불지기도 같은 모양으로.
2. `GAME` 환경 변수(기본 `deungbul`) 하나를 읽는 작은 실행 도구(`scripts/run.mjs`): `TSX_TSCONFIG_PATH=games/$GAME/tsconfig.json`을 세우고 `tsx games/$GAME/server/main.ts`를 부른다. `package.json`의 스크립트는 이것만 부른다.
3. `vite.config.ts`가 `process.env.GAME`으로 뿌리·별칭·결과 폴더를 정하고, 도감은 그 게임에 `guide.html`이 있을 때만.
4. `typecheck` = 게임마다 `tsc -p games/<게임>` + fixture.
5. `test/all.ts`: 틀의 시험은 fixture 별칭으로, 게임의 시험 목록은 `games/<게임>/test/list.ts`에서.
6. `framework.test.ts`의 폴더 검사는 게임 폴더 이름을 받는 함수로.

**틀만 따로 떼어 쓰는 길**은 아직 멀다. (1) 틀은 `@game/shared/content`를 정적으로 읽으므로 내용 없이는 컴파일도 실행도 안 된다(설계대로다: 쓰는 쪽이 별칭을 줘야 한다). (2) 틀의 시험과 경계 검사가 `games/deungbul`의 경로에 묶여 있다. (3) `engine/`에 자기 `package.json`·`tsconfig`가 없고 의존성(`three`, `ws`)이 뿌리에 있다. (4) `startServer`의 `staticDir` 기본값이 `engine`에서 세 단계 위의 `dist/`다(`server.ts:165`). (5) 화면은 `vite`의 별칭과 `server.fs.allow`가 필요하다. 하위 폴더로 넣어 쓰는 것은 4절과 6절의 일이 끝나면 `engine/` 폴더 복사 + 별칭 둘로 된다. 패키지 배포는 계획 7절대로 하지 않는다.

---

## 7. 문서의 정확성

줄 번호는 `a8188b7`의 것이다.

### `README.md`

| 줄 | 지금 | 고칠 것 |
|---|---|---|
| 10-11 | "직업은 전사, 궁수, 마법사 세 가지다"가 두 번 | 한 줄로 |
| 149 | 틀의 시험 이름 목록 | `wallet`이 빠졌다(`test/all.ts:12`) |
| 179-180, 242 | 표준 시스템 목록 | `wallet`이 빠졌다(`game.ts:198,224`) |
| 243, 286 | "별칭이 가리키는 폴더(`tsconfig.json`의 `paths`, `vite.config.ts`의 `alias`)를 바꾸면 다른 게임의 내용이 끼워진다", "별칭은 세 곳" | 모자라다. `tsconfig.json`의 `include`, `vite.config.ts`의 뿌리, `package.json`의 스크립트 셋, `test/all.ts`도 바꿔야 한다(6절의 표) |
| 250 | "지역은 여럿일 수 있다" | 덧붙인다: 0번이 들판이고 나무·바위·땅·봇·무리는 0번에만 놓인다. 나머지 지역은 id가 던전 id와 같아야 한다(`dungeon.ts:76-77`) |
| 257-269 | 등록하는 곳의 표 | 빠진 줄: `g.personal.push`, `g.entInit.push`, `g.killBonus.push`, `g.ready.push`, `g.wallet.add/take`와 `g.wallet.scale.push`, `g.ledger.note` |
| 261 | "(피해, 받는 피해, 회복, 치명타, 체력, 불씨)" | 경험치(`exp`)가 빠졌다(`game.ts:98`) |
| 273 | init 안에서 등록하는 것 | `bus.onKey`가 빠졌다(246줄에는 있다) |
| 288 | "틀의 코드에 등불지기의 id가 박혀 있는지는 예제 게임의 내용으로 검사할 때 드러난다" | "표의 키로 타입이 잡힌 곳만 드러난다. 문자열로 견준 id(`Ent.type`, `cls`)는 드러나지 않는다"로 |
| 359 | "새로운 손 모양이 필요하면 `engine/client/scene/models.ts`에 더한다" | 틀을 고치는 일임을 적는다: `ClassDef.hand`의 종류(`engine/shared/defs/combat.ts:39`)와 이름표의 `bow`·`staff`(`names.ts:10`)도 함께 |
| 369 | "`GEAR_SLOTS`, `STATS` …에 더하고 언어 파일에 이름을 넣는다. 새 옵션은 `systems/gear.ts`에서" | 틀린다. 칸과 옵션의 이름은 **틀의** 언어 파일(`engine/client/i18n/ko.ts:32,182`, `en.ts:153`)에 있고, 경로는 `engine/server/game/systems/gear.ts`다: 지금은 틀을 고쳐야 한다. 능력치(`BUILD_STATS`)도 같다 |
| 379 | "`Store`를 구현하고 … 고른다" | `Store`가 동기 인터페이스라는 것을 적는다 |

"틀과 이 게임의 규칙" 절의 나머지(확장 지점 열 개의 이름과 파일, `g.rules`의 여섯 칸, `rules`의 다섯 칸, `Look`의 세 칸, `SLOTS`, `mountPanel`, `addPlace`, `PROTOCOL` 2, 호환 코드를 지웠다는 322-323줄)는 코드와 맞았다. 문서에 없는 접점: `setMerchantLook`, `banner`, `sfx`, `send`, `clock`, `itemNameOf`, `players.devSpawn`, `Monsters.asleep`.

### `docs/framework-status.md`

| 어디 | 지금 | 고칠 것 |
|---|---|---|
| 요약 | "4단계의 `me` 메시지는 옛 메시지와 함께 간다", "남은 큰 일: … 다음 배포에서 호환 코드 끄기" | 낡았다. `a8188b7`에서 껐고 `PROTOCOL`이 2다 |
| 1절 표의 3, 4단계 | "옛 칸에도 함께 쓰는 호환이 켜져 있다", "옛 메시지도 함께 보내는 호환이 켜져 있다" | "껐다"로 |
| 80줄 | `Saver.legacy·legacySave` | `legacySave`는 없다 |
| 81줄 | 호환 행(`g.oldMsgs`, `WRITE_OLD_CELLS`, `SEND_OLD_MSGS`) | 지운다. 코드에 없다 |
| 3절 "다음 배포에서 끌 호환 코드" (133-134줄의 표) | 할 일로 적혀 있다 | 끝난 일로 옮긴다. `OldStatCells`, `onMsg('quest')` 처리기도 없다 |
| 12단계 | "깊은 경로를 143곳" | 140문장, 경로 42개, 파일 57개 |
| 시험 표와 13단계 | "시험 파일 9개" | 10개 13곳(`framework`의 출력) |
| 11단계 "걸릴 만한 곳" | "`tsx --tsconfig` … 이번에는 돌려 보지 않았다" | 된다(확인). `TSX_TSCONFIG_PATH`도 된다 |
| 같은 곳 | "빈 표가 되는지는 돌려 봐야 안다" | 결과: `RECIPES, FORGES, SHOPS, SHOP_STOCK, DROPS, ECON_MOVES, ECON_LEVEL_MARKS`는 비워도 된다. `DUNGEONS`·`DAILIES`는 `as const`로 쓰면 컴파일 실패, 넓은 타입으로 쓰면 된다. `ATTEND = []`는 버그(1절 9번) |
| 같은 곳 | "`games/sample/tsconfig.json`을 따로" | 덧붙인다: 뿌리의 `include`에 걸리는 폴더(`engine/` 아래의 fixture 포함)에 두 번째 내용을 두면 뿌리 `tsc`가 깨진다 |
| "틀에 남은 이 게임의 색" 표 | | 빠진 것: 장비 칸·옵션·능력치의 고정, `loc.items.potion`, 안내문 `rested`, `PlayerSave`의 옛 칸 넷, `need: 60`, 접속 전 카메라, 포트 3001, 등급 이름, 장비 검증의 상한, 상인 NPC, 기술 셋 고정 (1절) |
| 2절 서버 표 | 등록 통로 | `g.entInit`, `g.wallet`(`scale`, `seen`), `g.ledger.note`가 빠졌다 |

---

## 작업 묶음 제안

파일이 겹치지 않게 여섯으로 나눴다.

| 묶음 | 목표 | 고칠 파일 | 통과할 검사 | 크기 | 순서 |
|---|---|---|---|---|---|
| **A. 두 번째 내용과 게임 고르기** | fixture 내용, 게임별 `tsconfig`, `GAME` 환경 변수, `typecheck`가 fixture로도 틀을 검사 | `engine/test/fixture/**`(새로), `games/deungbul/tsconfig.json`(새로), `tsconfig*.json`, `package.json`, `vite.config.ts`, `test/all.ts`, `scripts/{pilot.mjs,restart.sh,publish.sh}` | `npm run typecheck`(등불지기 0. fixture는 B·C가 끝날 때까지 알려진 오류 목록과 같은지), `npm test`, `npm run build`의 결과가 전과 같다 | 중간 | 맨 먼저. 예제 게임 작업과 같은 파일(`package.json`, `vite.config.ts`)을 건드리므로 그 작업을 합친 뒤에 |
| **B. 장비·능력치·이름의 고정 풀기** | 1절 1~3, 7, 13, 23, 26번: 칸·옵션·능력치·등급·첫 번째 재화의 이름을 이름표로, `rested`를 게임으로 | `engine/shared/contract.ts`, `defs/growth.ts`, `defs/social.ts`, `systems/gear.ts`, `systems/build.ts`, `engine/client/i18n/*`, `hud/menu.ts`, `hud/notify.ts`, `shared/messages.ts`, `games/deungbul/shared/content/growth.ts`, `games/deungbul/client/i18n/*`, `games/deungbul/shared/deungbul.ts` | 문장 견본(`locale-snapshot`)이 글자까지 같다, 저장 왕복, fixture에 칸 셋·옵션 둘을 넣고 `tsc` | 중간 | A 다음. 장비 분해 작업(`gear.ts`, `menu.ts`, `ko.ts`)을 합친 뒤에 |
| **C. 빈 표와 화면·서버의 낱개** | 1절 4~6(`menu.ts`와 언어 파일의 줄은 B에서), 8, 9, 15~18, 20, 21, 24번 | `systems/{daily,dungeon,mail,market,players}.ts`, `shared/auto.ts`, `shared/defs/combat.ts`, `client/{auto,state,main,net,entities}.ts`, `hud/{shop,bag,dungeon,forge}.ts` | `npm test`, fixture의 `tsc` 0, 빈 표 게임의 서버 기동 스크립트를 시험으로 | 작음 | A 다음. B와 나란히 할 수 있다(파일이 다르다) |
| **D. 서버에 남은 색** | 1절 10, 12, 14, 27번: 장부의 재화, `PlayerSave`의 옛 칸, 습격 몹 이름, 금칙어 접점 | `systems/{ledger,monsters}.ts`, `server/store/types.ts`, `server/text.ts`, `server/game/{game,entity}.ts`, `shared/protocol.ts`, `scripts/econ.ts`, `games/deungbul/server/systems/raid.ts` | `ledger`·`wallet` 시험, 저장 견본, `npm run econ`의 출력이 같다 | 중간 | B, C 다음(습격 몹의 이름은 `entities.ts`와 언어 파일에도 걸린다). 새 놀이 시제품이 `monsters.ts`를 건드리는지 먼저 본다. 급하지 않다 |
| **E. 경계 검사와 공개 표면** | 3절의 검사 아홉 가지, 입구 다섯, 깊은 import 금지, `framework.test.ts`를 셋으로 | `engine/test/framework.test.ts`, `engine/test/wallet.test.ts`(소스 검사 부분), `engine/{shared,server,client}/index.ts`·`engine/testing.ts`(새로), `games/deungbul/**`의 import 줄 | 3절의 20가지를 다시 넣어 모두 잡히는지, 빌드 결과가 같다 | 큼 | B, C 다음(같은 게임 파일의 import 줄을 건드린다) |
| **F. 틀의 시험을 fixture로** | 4절의 1~3번 차례 (4번은 E에서) | `engine/test/*.test.ts`(`framework`, `wallet`의 소스 검사 제외) | `npm run test:engine`이 fixture 별칭에서 통과, `@game` 0곳, `tsconfig.engine.json`에 `engine/test` | 큼 | A, B 다음. E와 나란히 |

문서(`README.md`, `docs/framework-status.md`의 7절 항목)는 코드를 건드리지 않으므로 지금 진행 중인 `docs/making-a-game.md` 작업에 얹는 것이 낫다.

**진행 중인 작업과 잇는 법**:

- 예제 게임(`games/sample`)이 합쳐지면 fixture를 따로 만들지 말고 예제의 내용을 줄인 것을 fixture로 쓴다. 예제 작업이 이미 겪었을 것(게임별 `tsconfig`, 빈 표, 장비 칸 고정, `potion`)과 이 보고의 1절을 견줘서, 예제가 **틀을 고쳐서 넘어간 것**과 **내용을 등불지기에 맞춰서 넘어간 것**을 가른다. 뒤쪽이 B와 C의 할 일이다.
- "문서만 보고 다른 게임 만들어 보기" 검증은 **A와 C가 끝난 뒤, B는 끝났거나 문서에 '지금은 등불지기의 장비 체계를 그대로 써야 한다'고 적은 뒤**에 한다. 그렇지 않으면 검증하는 사람이 1절의 1~9번을 다시 찾는 데 시간을 쓴다.
- 그 검증에 "등불지기와 일부러 다르게"의 목록을 준다: 지역이 원점에서 떨어져 있다, 직업 하나, 두 번째 재화 없음, 장비 칸 셋, 상점·던전·출석 없음. 이번 실험에서 틀의 가정이 드러난 것이 이 조건들이다.

---

## 뒷정리

- 띄운 서버는 `games/mini/server/try.ts`의 3971번 하나였고 스크립트가 스스로 닫았다(`closed` 출력). 끝난 뒤 3971~3979에 듣는 프로세스가 없음을 `netstat`으로 확인했다. 틀의 시험들은 포트 0(임시)으로 뜨고 스스로 닫는다.
- `$TEMP/dg-work/audit2`(복사본, 그 안의 `games/mini`, `dist-mini`, fixture 포함)와 내 로그·스크립트를 모두 지웠다. 임시 DB 폴더 `audit2-data`는 만들지 않았다(전부 `MemoryStore`). `$TEMP/dg-work`의 다른 폴더는 다른 작업자의 것이라 건드리지 않았다.
- 원본 `C:\gamedev`에서는 아무것도 실행하거나 고치지 않았고, `data/`는 열지 않았다. 3001번·trycloudflare·github.io에는 접속하지 않았다. 커밋·푸시도 없다.
- 남긴 것은 이 보고서 하나다: `C:\Users\MINLOL~1\AppData\Local\Temp\dg-work\audit2-report.md`.
