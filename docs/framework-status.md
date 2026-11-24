# 틀과 게임 가르기: 지금의 상태

계획은 [framework-plan.md](framework-plan.md)에 있다(계획을 세울 때의 기록이라 파일 경로와 세부는 그때의 것이다). 이 문서는 **지금 무엇이 끝났고, 틀과 게임이 어디서 만나고, 무엇이 남았는지**를 적는다. 11단계(예제 게임과 문서)를 마친 때를 기준으로 쓴다. 새 게임을 만드는 차례는 [making-a-game.md](making-a-game.md)에 있다. 코드를 고치면 이 문서도 함께 고친다.

요약:

- 코드는 틀(`engine/`)과 게임들(`games/deungbul/`, 예제 `games/sample/`)이다. 방향은 게임 → 틀 하나다.
- 틀이 게임에서 읽는 것은 내용 계약(`engine/shared/contract.ts`)의 이름뿐이고, 별칭 `@game/shared/content`로 읽는다.
- `npm run typecheck`(전체, 틀만, 틀만을 예제의 내용으로, 예제) 오류 0, `npm test`와 `npm run test:sample` 모두 통과.
- 플레이어가 겪는 것, 저장 형식, 프로토콜은 0단계부터 지금까지 바뀌지 않았다(호환 코드는 2026-11-24 배포에서 껐고 `PROTOCOL`은 2다).
- 장비 칸·옵션·등급·능력치의 id는 이제 게임이 짓는다(2026-11-24, 아래 '틀 수리의 진행'). 갑옷 칸 없이 칸 둘·옵션 둘·능력치 하나인 내용으로도 틀이 컴파일되는 것을 `games/sample/test/empty.test.ts`가 지킨다.
- 게임은 틀을 입구(`@engine/shared`, `@engine/server`, `@engine/client`, `@engine/client/i18n`, `@engine/testing`)로만 읽는다(2026-11-24, 12단계 끝).
- 남은 큰 일: 틀의 시험을 등불지기의 내용에서 떼기(13, 묶음 F), 서버에 남은 색(묶음 D). 아래 '이어 갈 것'.

## 0. 이어 갈 것 (2026-11-24 마감)

틀이 최우선이다(사용자 결정). **2026-11-24 추가 결정: 등불지기는 전통 MMORPG로 두고 새 장르 모드는 만들지 않는다. 작업은 틀만 한다.** 아래 3·4번(안개 균열, 경제의 다음 단계)은 그래서 보류다. 다음 세션은 이 차례로 잇는다.

1. **틀 수리**: [framework-audit.md](framework-audit.md)의 '작업 묶음 제안' A~F. 진행은 아래 '틀 수리의 진행'. A(게임별 tsconfig와 `GAME` 하나로 고르기, 틀을 두 번째 내용으로도 타입 검사) → B(장비 칸·옵션·능력치의 고정 id 풀기)·C(빈 표와 낱개: `ATTEND = []` 버그, `loc.items.potion`, 접속 전 카메라, 개발 포트 등) → E(경계 검사의 구멍과 입구 다섯) ·F(틀의 시험을 fixture로) → D(서버에 남은 색). 예제 게임(`games/sample`)이 이미 있으니 fixture는 그것을 줄여 쓴다.
2. **문서만 보고 새 게임 만들기 검증**: A·C 뒤에(B는 끝났다). 검증자에게 '등불지기와 일부러 다르게'(원점에서 떨어진 지역, 직업 하나, 두 번째 재화 없음, 장비 칸 셋, 상점·던전·출석 없음)를 준다.
3. **(보류) 멈춘 작업**(사용량 한도로 에이전트가 중간에 멈췄다. 검토·시험 전이라 본선에 넣지 않고 가지로만 저장했다):
   - `wip/rift`: 안개 균열 시제품(5분 인스턴스 생존전). 서버·화면·시험 파일이 반쯤 있다. `_seed.ts`처럼 정리할 파일이 섞여 있다.
4. **(보류) 경제의 다음 단계**: [economy.md](economy.md)의 결정대로 강화 규칙(+7부터 하락·보호 부적·재련) → 밝은 등불 → 접속 보상·수수료 → 따라잡기.
5. **플레이어 재검토**: 에이전트가 플레이 도중 멈춰 보고가 없다. 위가 끝난 뒤 다시 맡긴다.

### 틀 수리의 진행

| 묶음 | 상태 |
|---|---|
| A. 두 번째 내용과 게임 고르기 | **거의 끝(2026-11-24).** 틀을 두 번째 내용(예제)으로 타입 검사하는 것과 빈 표 변형 셋(`bare`, `weaponOnly`, `otherGear`)은 예제 작업 때 들어갔다. 게임 고르기는 `scripts/game.mjs <start\|watch\|client\|build> [게임]`(인자, `GAME`, 기본 `deungbul`) 한곳으로: 뿌리의 `vite.config.ts`를 `games/deungbul/vite.config.ts`로 옮겼고 `package.json`의 서버·화면 스크립트는 전부 이것을 부른다. 남은 것: 시험 도구(`test/all.ts`)와 뿌리 `tsconfig.json`은 아직 등불지기를 기본으로 안다(F에서 틀의 시험을 떼면서 함께) |
| B. 장비·능력치·이름의 고정 풀기 | **끝(2026-11-24).** `STATS[id] = { base, mod }`, `BUILD_STATS[id] = { mod, per }`(전에는 id 목록과 `BUILD.pow/vit/luck`). `mod`는 틀의 효과 넷(`StatMod`: `damage`, `guard`, `crit`, `hp`)이고 서버의 보정(`modValue`, `wornMod`)과 화면의 문장은 효과로 만든다. 칸·등급·능력치의 이름은 이름표(`ContentNames`)의 `gearSlots`, `rarities`, `buildStats`로 게임에. 무기·갑옷 바탕의 기본 수치는 그 효과에 드는 첫 옵션(`statFor`)으로 보인다. 저장을 읽을 때의 옵션 수·장비 레벨 상한도 내용에서(`OPTS_MAX`) 또는 넉넉하게(999). 화면의 문장은 견본과 글자까지 같다. 남은 것: 안내문 `rested`를 게임으로, 첫 번째 재화의 이름 '골드'를 이름표로(점검 13·26번) |
| C. 빈 표와 낱개 | **거의 끝.** `ATTEND = []`면 출석을 세지 않는다, 처음 필요 경험치는 `needFor(1)`, 접속 전 카메라는 `MAP.spawn` 둘레, 대장간 창은 닿는 곳의 잠금 풀린 대장간이면 어느 것이나(서버와 같은 규칙), 직업의 기술 수는 `SKILL_SLOTS`를 따른다(`readonly SkillId[]`). `loc.items.potion`·`'field'`·개발 포트·`itemDef().kind`는 예제 작업 때 고쳤다. 남은 것: 상인 NPC를 게임에게(20번), 레벨·재화 상한을 `CURRENCIES.max`에서(24번) |
| E. 경계 검사와 공개 표면 | **반쯤(2026-11-24).** 새 시험 `engine/test/boundary.test.ts`: (1) 틀의 소스가 게임의 내용 id를 문자열로 적는가(틀의 낱말 9개와 기본값 묶음은 뺀다), (2) 틀의 모든 소스의 문자열과 css에 이 게임의 낱말이 있는가(알고 남긴 것 4가지: `sparks`·`sparkBonus`(두 번째 재화의 칸), `raid`(점검 14번에서 지운다), `crypto`), (3) 타입 검사를 피하는 캐스팅이 지금(6개)보다 늘었는가, (4) 층을 넘는 import(화면 → 서버, 게임 규칙 → 저장소 구현, 공용 → 서버·화면). 지갑 검사는 `p['gold']`와 `Object.assign(p, { gold })`도 잡는다. 검사마다 스스로를 시험하고, 틀의 파일에 위반 넷을 일부러 넣어 넷 다 잡히는 것을 확인했다. 장부의 한 줄 요약은 재화를 `ECON_CURS`의 id로 찍는다(점검 10번의 반). **입구도 끝(같은 날)**: `engine/shared/index.ts`, `engine/server/index.ts`, `engine/client/index.ts`, `engine/testing.ts`가 이름을 하나씩 적어 내놓고(이것이 게임에 약속한 표면이다), 게임의 import 131줄을 입구로 옮겼다(67줄로 합쳐짐). `boundary.test.ts`의 5번이 깊은 import를 막는다: 허용은 입구, 언어 묶음(`i18n`, `i18n/ko·en·names·merge`), 내용 통로(`shared/defs`, `shared/world`), 확장 지점 셋, 그리고 내용 파일만 `shared/defs/*`의 `import type`과 `shared/defaults`. 구조 시험(`framework.test.ts`)의 경로 풀이는 폴더의 `index.ts`를 따라간다. 두 게임을 브라우저에서 띄워 콘솔 오류 없이 도는 것을 봤다(화면 모듈의 읽히는 차례가 바뀌었기 때문). 남은 것: `framework.test.ts`를 셋으로 가르기(F와 함께) |
| F. 틀의 시험을 시험용 내용으로 | **진행 중(2026-11-24).** 틀의 시험용 내용 `engine/test/fx/shared/content`("시험 들판": 어느 게임의 것도 아니다. id와 맵은 등불지기·예제와 모두 다르고 수치는 시험의 기대값대로 등불지기를 따른다. 대장간·잠금·던전·필드 보스·두 번째 재화·분해·가방 넓히기를 모두 켠다)과 자기 tsconfig(`@game` → 그 폴더)를 두었다. `npm run typecheck`가 틀 전체를 이 내용으로도 검사하고(세 번째 내용), `npm test`가 그 위의 시험을 따로 된 프로세스로 돈다(`engine/test/fx/all.ts`, 이름은 `fx/…`). 옮긴 것 23개: monsters, move, nav, classes, shop, craft, party, build, guild, boss, combat, growth, dungeon, compare, bag, salvage, wallet, ledger, market, channel, security, harden, server. 틀의 기능을 도는 시험은 이제 모두 시험용 내용 위에서 돈다(검사 수는 옮기기 전과 같다: `npm test`의 통과 1085). 옮기며 시험이 등불지기의 맵에 기대던 곳(들판과 던전 사이의 벽, 들판의 경계, 지역 id 'field', 둘째 상인)은 지역의 경계와 시험용 내용에서 구하게 바꿨다. 남은 것: 소스를 읽는 구조 검사 둘(`framework.test.ts`, `boundary.test.ts`)이 아직 `games/deungbul`의 경로와 등불지기의 이름을 직접 안다. `framework.test.ts`를 셋으로 가르기(예전 식과 같다는 검사 → 게임으로, 틀만의 게임 → 시험용 내용으로, 폴더 검사 → 게임 폴더 이름을 받게) |
| D | 아직 |

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
| 7b | 게임의 창은 게임이 붙인다(`mountPanel`, `deungbul.css`) | 끝. 뼈대는 11단계에서 올렸다 | `1049bf3` |
| 8 | 언어 파일을 틀의 문장과 게임의 문장으로(`mergeLocale`) | 끝 | `a67c46e` |
| 9 | **폴더 이동**: `engine/`, `games/deungbul/`, 별칭, 내용 파일 가르기, 틀만 타입 검사 0 | 끝 | `feat/fw9` |
| 10 | 시험 가르기, `new Game()`의 기본값을 틀만으로 | 끝 | `7c96900` |
| 11 | 예제 게임 `games/sample`과 `docs/making-a-game.md`, 뼈대 올리기, 예제의 내용으로 드러난 틀의 수리 | 끝 (이 문서를 쓴 때) | `feat/fw11` |
| 12 | 공개 표면(입구 넷 + 언어, 깊은 import 금지) | 끝 (2026-11-24) | |
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

### 11단계에서 한 것

1. **예제 게임** `games/sample`("모닥불 사냥터"): 직업 둘, 몬스터 셋, 아이템 다섯, 지역 하나, 상인 하나, 이 게임만의 규칙 하나(모닥불). 던전·대장간·보스·두 번째 재화가 없다. 한국어와 영어. 자기 `tsconfig.json`(별칭 `@game` → `games/sample`)과 `vite.config.ts`, 시험(`npm run test:sample`)을 갖는다.
2. **문서** `docs/making-a-game.md`: 새 게임을 만드는 차례. 코드 조각은 예제에서 따왔고 `games/sample/test/docs.test.ts`가 일치를 검사한다.
3. **뼈대를 틀로 올렸다**: 틀의 창 마크업은 `engine/client/hud/skeleton.ts`에 있고 `hud/shell.ts`의 `mountShell`이 붙인다. 게임의 `index.html`은 머리와 script만 남았다. `shell.ts`는 읽히는 때에 뼈대를 붙이고, 요소를 잡는 길(`$`)이 있는 `app.ts`가 `shell.ts`를 맨 먼저 import한다: 어느 파일이 읽히는 때에 요소를 잡아도 그때는 뼈대가 있다. 붙인 뒤의 문서와 계산된 스타일은 전과 같다(여섯 화면 구성에서 다른 값 0). 스크립트가 돌기 전의 화면은 접속 화면과 같은 어둑한 바탕이다(`style.css`의 `body:not(:has(#gate))::before`).
4. **틀만 타입 검사를 예제의 내용으로도 돌린다**(`npm run typecheck:engine:sample`, `games/sample/tsconfig.engine.json`). 여기서 드러나 고친 것:
   - 던전이 없으면(`DUNGEONS = {}`) `DungeonId`가 `never`가 되어 틀의 던전 창·자동 사냥·문장·서버가 컴파일되지 않았다 → 표를 문자열 id로 읽는 `DUNGEON_TABLE`·`dungeonDef(id: string)`(`engine/shared/defs/dungeons.ts`)과 이름표를 읽는 `dungeonLabel`(`engine/client/i18n/names.ts`).
   - 상점 창이 아이템 id `potion`의 이름을 읽었다(`hud/shop.ts`의 물약 단추) → 가장 순한 물약의 이름(`POTIONS`의 끝), 물약이 없으면 `ui.bagPotions`.
   - `GEAR.armorFor(lv)`: 게임이 인자 없는 함수로 적으면 틀의 호출이 컴파일되지 않았다 → 계약의 모양으로 부른다(`systems/gear.ts`).
   - 예제보다 더 비운 내용(`games/sample/test/empty.test.ts`가 변형을 만들어 검사한다): 일일 임무가 없으면(`DAILIES = {}`) `DAILIES[id]`가, 아이템의 종류가 한 가지뿐이면 `ITEMS[id].kind === 'potion'` 같은 비교가 컴파일되지 않았다 → 넓은 모양으로 읽는 `dailyDef(id)`, `itemDef(id).kind`로 바꿨다(`hud/bag.ts`, `hud/menu.ts`, `hud/shop.ts`, `shared/auto.ts`, `systems/daily.ts`, `systems/mail.ts`, `systems/market.ts`, `systems/players.ts`: 식은 그대로이고 읽는 길만 바꿨다). 몬스터가 하나도 없는 내용(`MONSTERS = {}`)은 지금도 컴파일되지 않는다.
5. 그 밖에 예제가 걸려서 고친 것:
   - `inDungeon()`이 지역 id `'field'`를 읽었다 → 0번 지역인가로 본다(`engine/client/state.ts`).
   - 두 번째 재화를 쓰지 않는 게임: 이름표의 `currency2`를 선택 칸으로 하고, 없으면 틀의 문장(처치, 우편, 자리 비움, 보상 글)에서 그 몫을 뺀다. 이름표 없이 띄웠을 때의 기본 이름표(`idNames`)에서도 뺐다.
   - 사람 모델의 허리춤 등불을 게임의 꾸밈으로 옮겼다(`setHumanoidDeco`, 등불지기는 `games/deungbul/client/scene/models.ts`가 등록한다). 모습은 그대로다.
   - 개발 서버의 화면이 붙는 포트(3001)를 게임의 vite 설정이 정하게 했다(`VITE_DEV_PORT`). 정하지 않으면 3001이다.
6. 새로 생긴 틀의 파일: `engine/shared/defaults.ts`(수치의 기본값 묶음: 계약의 이름 61개 가운데 게임의 id가 들지 않는 것. 등불지기는 쓰지 않는다), `engine/server/run.ts`(`runServer`: 등불지기의 `server/main.ts`가 하는 절차를 옮겨 적은 것. 등불지기는 아직 자기 것을 쓴다), `engine/client/hud/skeleton.ts`.
7. `npm run typecheck`가 넷을 차례로 돌린다: 전체, 틀만, 틀만(예제의 내용), 예제. 틀이나 계약을 고치면 예제도 함께 고쳐야 통과한다.

등불지기의 플레이, 저장 형식, 프로토콜은 바뀌지 않았다.

## 2. 지금의 접점

### 폴더와 별칭

| | 틀 | 이 게임 |
|---|---|---|
| 서버 | `engine/server/` (`net/`, `store/`, `game/game.ts`, `game/systems/`, `text.ts`) | `games/deungbul/server/` (`main.ts`, `deungbul.ts`, `systems/{tower,raid,keepers,quests,rest}.ts`) |
| 공용 | `engine/shared/` (`ext, protocol, messages, sim, nav, world, auto, contract, defs.ts, defs/`) | `games/deungbul/shared/` (`deungbul.ts` 선언, `content/`, `defs.ts`·`world.ts` 통로) |
| 화면 | `engine/client/` (`main.ts`의 `startClient`, `hud/`(뼈대 `skeleton.ts` 포함), `scene/`, `i18n/`, `style.css`) | `games/deungbul/client/` (`index.html`, `main.ts`, `hud/`, `scene/`, `i18n/`, `guide/`, `public/`) |
| 시험 | `engine/test/` | `games/deungbul/test/` (`fixtures/`, `load.ts` 포함) |

- 별칭: `@engine/*` → `engine/*`, `@game/*` → 그 게임의 폴더. 뿌리의 설정은 등불지기를, `games/sample/`의 설정은 예제를 가리킨다.
  - `tsc`: `tsconfig.json`의 `paths` (예제: `games/sample/tsconfig.json`).
  - `tsx`(서버 실행, 시험, `scripts/econ.ts`): 실행한 폴더의 `tsconfig.json`을 읽어 `paths`를 따른다. **저장소 뿌리에서 실행해야 한다**(`npm` 스크립트와 `scripts/restart.sh`는 뿌리에서 돈다). 다른 폴더에서 `tsx games/deungbul/server/main.ts`를 직접 부르면 별칭을 찾지 못한다. 다른 게임은 `tsx --tsconfig games/<게임>/tsconfig.json`으로 실행한다: 주지 않으면 뿌리의 설정을 읽어 **등불지기의 내용으로 오류 없이 뜬다**(예제는 플러그인 파일의 맨 위에서 이것을 잡아 던진다).
  - `vite`: 게임 폴더의 `vite.config.ts`의 `resolve.alias` (`games/deungbul/vite.config.ts`, `games/sample/vite.config.ts`). 어느 것을 쓸지는 `scripts/game.mjs`가 고른다.
- 별칭은 폴더를 넘을 때만 쓴다. 같은 폴더 안은 상대 경로다.
- 뿌리에 남은 것: `test/all.ts`(시험을 돌리는 도구), `scripts/`, `docs/`, `tsconfig*.json`, `package.json`, 그리고 git에 넣지 않는 `data/`(저장)와 `dist/`(빌드).

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
| 실행 | `startServer(port, { bots, store, game, staticDir })`, 그 절차를 묶은 `runServer({ port, db, dist, plugins })`(`engine/server/run.ts`) | `server/main.ts` (환경 변수, 저장소, 종료 처리, `data/stop.flag`). 예제는 `runServer`를 쓴다 |

### 공용

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 내용 계약 | `engine/shared/contract.ts`의 `ContentContract` (이름 61개: 맵, 직업·기술, 몬스터, 아이템·상점·제작, 장비와 성장, 던전, 파티·채널·길드·거래소, 경제 장부) | `shared/content/index.ts`가 그 이름들을 내보낸다 |
| 내용의 모양과 도우미 | `engine/shared/defs/*.ts` | 게임의 내용 파일이 타입만 가져온다 |
| 수치의 기본값 | `engine/shared/defaults.ts` (아무것도 import하지 않는 값 파일) | 게임의 내용 통로가 `export *`로 받는다(예제). 등불지기는 자기 값을 갖는다 |
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
| 겉모습 | `Look`의 `ground, leaf, scenery`, `view.setMood`, `setMapPaint`, `addMarks`, `registerMonsterModel`·`registerBlade`·`registerArmor`, `setHumanoidDeco`, `addNpc`, `addPlace` | `client/scene/*`, `client/hud/marks.ts`, `client/hud/tower.ts` |
| 창 | `engine/client/hud/shell.ts`의 `mountPanel(자리, html)`과 `SLOTS` | `client/markup.ts`, `client/deungbul.css` |
| 문장 | `koBase(names)`·`enBase(names)`, `mergeLocale`, `setLocales`, `LocaleExt`, `addNotices`, `addMsgSounds`. 이름표(`ContentNames`)의 `currency2`는 선택 칸 | `client/i18n/*`, `client/words.ts` |
| 상태 | `S` (틀의 칸만) | `client/state.ts`의 `GS`(공유), `G`(개인) |
| 뼈대 | `engine/client/hud/skeleton.ts`(마크업), `hud/shell.ts`의 `mountShell`(읽히는 때에 붙인다) | `client/index.html`의 머리와 script. body에는 script만 둔다 |
| 스타일 | `engine/client/style.css` (틀의 진입 모듈이 읽는다) | `client/deungbul.css` (틀의 것 뒤에 읽혀 덮어쓴다) |
| 빌드 | 개발 서버의 화면이 붙을 포트는 `VITE_DEV_PORT`(없으면 3001) | `games/deungbul/vite.config.ts`(`scripts/game.mjs`가 고른다): 뿌리 `games/deungbul/client`, 결과 `dist/`. 도감은 게임 빌드 뒤에 따로. 예제는 `games/sample/vite.config.ts`: 결과 `dist-sample/` |

### 시험

| | 틀 | 이 게임 |
|---|---|---|
| 자리 | `engine/test/이름.test.ts`, `harness.ts` | `games/deungbul/test/이름.test.ts`, `game.ts`, `peer.ts`, `locale-snapshot.ts`, `fixtures/`. 예제는 `games/sample/test/`(`sample.test.ts`, `docs.test.ts`, `all.ts`)이고 `npm run test:sample`로 따로 돈다 |
| 게임 만들기 | `new Game()`, `startServer()` | `newGame()`, `startDeungbul()` |
| 명령 | `npm run test:engine` | `npm run test:game`, 이름 앞에 `deungbul/` |
| 지키는 것 | 게임의 규칙·선언·화면·시험을 import하지 않는다(따라 들어오는 것까지). 실행 중에도 `games/deungbul/server/`와 `test/`가 로드되지 않는다 | |
| 아직 기대는 것 | 등불지기의 내용: `@game/shared/defs`·`world`(시험 파일 9개)와 `games/deungbul/test/fixtures/`의 저장 견본 | |

방향을 지키는 검사는 `engine/test/framework.test.ts`에 모여 있다: 폴더 규칙 일곱 가지, 서버와 공용, 확장 지점과 선언 병합, 틀의 시험, 틀의 언어·알림·소리 파일의 낱말, 화면 파일이 가져오는 이름, 뼈대와 스타일(뼈대는 틀이 붙이고 `app.ts`가 `shell.ts`를 맨 먼저 읽는다). 이 검사들은 등불지기의 폴더를 본다. 예제의 폴더는 예제의 시험이 본다.

## 3. 남은 일

### 호환 코드 (끝)

옛 저장 칸에 함께 쓰기(`WRITE_OLD_CELLS`)와 옛 메시지 함께 보내기(`SEND_OLD_MSGS`, `g.oldMsgs`)는 2026-11-24 배포에서 지웠고 `PROTOCOL`을 2로 올렸다. 옛 저장을 읽는 길(`Saver.legacy`)은 남아 있다.

### 새 게임을 만들 때

차례와 걸리는 곳은 [making-a-game.md](making-a-game.md)에 옮겨 적었다(10절 "자주 걸리는 곳"). 이 문서에는 틀 쪽에 남은 일만 둔다.

- **틀이나 계약을 고치면 예제도 함께 고친다.** `npm run typecheck`가 예제까지 검사하므로, 계약에 이름을 더하면 `engine/shared/defaults.ts`에 기본값을 두거나 `games/sample/shared/content/index.ts`에 그 이름을 더해야 통과한다.
- **틀의 시험은 등불지기의 내용을 쓴다.** `test/all.ts`의 `ENGINE`은 `@game`이 등불지기일 때만 통과한다. 예제의 설정으로 틀의 시험을 돌리려면 13단계가 먼저다. 지금 예제 쪽에서 틀을 지키는 것은 `typecheck:engine:sample`과 `games/sample/test/sample.test.ts`다.
- **`ECON_CURS`**: 계약은 문자열 목록으로 받지만 장부(`ledger.ts`)는 `gold, sparks, exp` 세 가지를 코드에 적어 두었다.
- **`vite`의 뿌리 밖 파일**: 틀의 코드가 뿌리(`games/<게임>/client`) 밖에 있어 `server.fs.allow`에 저장소 뿌리를 넣어야 하고, `index.html`의 `<link>`로는 뿌리 밖의 css를 개발 서버가 내주지 못한다(그래서 틀의 스타일은 틀의 진입 모듈이 import한다).
- **배포 스크립트**(`scripts/pilot.mjs`, `publish.sh`, `restart.sh`)는 등불지기의 포트·폴더·저장소를 적어 두었다. 게임을 인자로 받게 하는 일이 남았다.
- **등불지기의 서버 진입점**은 `runServer`를 쓰지 않고 같은 절차를 자기 파일에 갖고 있다(습격 설정, 장부의 한 줄 요약이 더 있다). 합치려면 `runServer`에 "시작한 뒤에 할 일"을 넘기는 자리가 필요하다.
- **등불지기의 내용**도 `defaults.ts`를 받게 할 수 있다(같은 값이 두 곳에 있다). 값이 갈리기 전에 정하는 편이 낫다.

### 12단계: 공개 표면

**끝(2026-11-24).** 입구는 `engine/shared/index.ts`(`@engine/shared`), `engine/server/index.ts`(`@engine/server`), `engine/client/index.ts`(`@engine/client`), `engine/testing.ts`(`@engine/testing`), 그리고 언어 `@engine/client/i18n`이다. 입구의 목록과 각각에 무엇이 있는지는 `engine/shared/index.ts`의 머리 주석에 있다. 입구에 없는 것은 틀의 내부다: 게임에 새로 내놓을 것이 생기면 입구에 이름을 더한다. 검사는 `engine/test/boundary.test.ts`의 5번.

### 13단계: 틀의 시험을 등불지기의 내용에서 떼기

- 틀의 시험 파일 9개가 `@game/shared/defs`·`world`에서 이 게임만의 이름을 읽는다: `TOWER, TOWERS, POND, PILLARS, ZONE_SPLIT, MIN_X…MAX_Z`(좌표), `SHOP, SMITHY`(자리), `RAID, raidFoes, raidTowerHp, speedFor, GLOW_BRIGHT_*, FULL_TOWER_OFFER`(`framework.test.ts`가 옮긴 수치와 식을 확인하는 데 쓴다: 이 검사들은 게임의 시험으로 옮기는 편이 맞다).
- 그 밖의 틀 시험도 틀의 통로를 거쳐 등불지기의 id(`'slime'`, `'sword3'`, `'crypt'`, `'warrior'`)와 맵 좌표를 쓴다.
- 저장 견본(`games/deungbul/test/fixtures/players.json`, `worlds.json`)을 틀의 `framework.test.ts`가 읽는다.
- 끝나면 `tsconfig.engine.json`에 `engine/test`를 넣을 수 있다.

### 틀에 남은 이 게임의 색

컴파일은 되지만 다른 게임에서는 어색한 것들. 급하지 않고, 예제 게임이 실제로 걸릴 때 고친다.

| 무엇 | 어디 | 메모 |
|---|---|---|
| 두 번째 재화 `sparks` | `Ent.sparks`, `PlayerSave`, `stat` 메시지, `MonsterDef.sparks`, `Reward.sparks`, `players.grant(p, exp, sparks)`, `mail.ts`, `away.ts`, `ledger.ts`(`ECON_CURS`와 한 줄 요약의 '불씨'), `hud/menu.ts`의 보상 글, `fx.ts`(불티 입자는 무관) | 계획서 7절: 일반화하지 않는다. 틀의 "두 번째 재화 한 가지"로 두고, 이름은 게임의 이름표가 준다. 쓰지 않는 게임은 이름표에 `currency2`를 적지 않으면 틀의 문장에서 빠진다(11단계). 값은 0으로 계속 오간다(`stat`, 저장, 처치 안내문의 셋째 값). `ledger.ts`의 `line()`에 한글 '불씨'가 박혀 있다(`runServer`는 그 줄을 찍지 않는다) |
| 보정 이름 `sparkBonus` | `g.mods` | 이름만 |
| 습격 몹 개념 | `Ent.raid`, `monsters.spawn(…, raid)`, `Monsters.atTower`, `TOWER_ATTACK_RANGE`, `g.rules.siege`, 스냅샷의 `EnterInfo.r`, 화면의 `Remote.raid`, 꼬리표 `'mon raid'`, `fmt.raidFoe` | 틀의 기능으로 남길지 정해야 한다(계획서 8절). 남기면 이름을 중립으로(`swarm`, `rules.siege` → 목표), 빼려면 `monsters.tick`에 몹별 행동을 덮어쓰는 자리가 하나 필요하다 |
| 사람 모델 | `engine/client/scene/models.ts`의 `makeHumanoid`(지팡이 직업의 고깔모자, 옷 색의 목록, 손 모양 셋) | 허리춤의 등불은 게임의 꾸밈으로 옮겼다(`setHumanoidDeco`). 사람 모델 자체를 게임이 넘기는 접점은 없다 |
| 장면의 하늘빛 | `engine/client/scene/view.ts`의 `SKY`(하늘과 안개의 처음 색) | css의 `--sky`는 문서의 바탕색일 뿐이고 장면의 하늘은 `view.setMood`로 바꾼다. 둘이 따로다 |
| 미니맵의 상인 표식 | `hud/minimap.ts` | 틀은 상인을 찍지 않는다. 게임이 `addMarks`로 찍는다(등불지기의 `marks.ts`, 예제의 `bonfire.ts`). 범례(`ui.mapLegend`)도 게임이 준다 |
| 뼈대가 쓰는데 틀에 기본 문장이 없는 키 | `ui.intro`, `ui.classHint`, `ui.mapLegend` | 게임이 주지 않으면 빈 채로 뜬다(컴파일은 된다). 틀에 기본 문장을 두거나 계약처럼 강제할 수 있다 |
| 메뉴의 탭 | `hud/menu.ts`의 `TABS` | 내용과 무관하게 일곱 탭이 모두 보인다(길드·거래소는 내용 없이도 돈다). 게임이 탭을 빼는 접점은 없다 |
| 개발 서버의 기본 포트 | `engine/client/net.ts` | `VITE_DEV_PORT`가 없으면 3001(등불지기의 포트)이다 |
| css에 박힌 색과 모양 | `engine/client/style.css` | 색 변수(`--gold`, `--panel` 등)는 게임이 덮어쓰지만 변수로 빠지지 않은 색이 남아 있다. 메뉴 창의 바탕은 `var(--ink)`로 바꿨다(11단계). 남은 것: `--ink`를 투명도만 달리해 적은 색(`rgba(14, 34, 39, …)`: 알림 줄, 조작 안내, 조이스틱, 가방, 미니맵 범례, 폰의 대화창), 접속 화면의 어둑한 바탕, 던전 창 제목과 장비 등급의 색. 색을 다르게 정한 게임(예제)에서는 이 자리들이 등불지기의 청록빛으로 남는다 |
| 대장간이 하나 | `engine/client/hud/forge.ts`(`FORGES`의 첫 대장간만), `engine/server/game/systems/craft.ts` | 계약은 목록(`FORGES`)이다 |
| '마을로' | `actions.ts`의 `goToTown`, `input.ts`의 H 키, 문장 키 `goingTown` | 틀의 이름이 '마을'을 말한다. 기본 목적지는 `MAP.spawn` |
| 일일 임무의 종류 | `DailyKind`는 문자열이지만 주석이 이 게임의 `'offer'`를 든다 | 주석만 |
| 채널의 '바쁜 때' | `CHANNEL.tellBusyS`, `Channels.busy`, `channels` 메시지의 `foes` 칸 | 습격에서 온 개념이 중립 이름으로 남았다 |
| 손님 이름, 금칙어 | `GUEST_NAME`(계약), `engine/server/text.ts`의 금칙어 목록 | 금칙어는 언어에 달렸다 |
| 틀의 문장 속 낱말 | `engine/client/i18n/ko.ts`·`en.ts` | 낱말 검사(`framework.test.ts`의 `WORDS_*`)가 지키지만, 상점('길 상인')·대장간·물약·길드·거래소 같은 낱말은 틀의 것으로 남아 있다. 게임이 같은 키로 덮어쓴다(예제: `ui.bagPotions`, `fmt.potions`, `msg.loot`, `msg.noPotion`) |
| 아이콘·manifest·제목 | `games/deungbul/client/public/`, `index.html`의 머리 | 게임의 것이 맞다. 틀에는 기본이 없다 |

## 4. 설정 파일

- `tsconfig.json`: 전체. `include: ["engine", "games/deungbul", "test", "scripts"]`. 게임의 선언 파일(`games/deungbul/shared/deungbul.ts`)은 아무도 import하지 않고 이 `include`로 컴파일에 들어간다: `include`에서 `games/deungbul`을 빼면 선언 병합이 사라져 게임의 코드가 컴파일되지 않는다.
- `games/sample/tsconfig.json`: 예제. 뿌리의 설정을 물려받아 `paths`의 `@game`만 자기 폴더로 바꾸고 `include`는 틀의 소스와 자기 폴더다. `games/sample/tsconfig.engine.json`은 거기서 `include`를 틀의 소스로 줄인 것이다(틀만을 예제의 내용으로).
- `tsconfig.engine.json`: 틀만. `include: ["engine/shared", "engine/server", "engine/client"]`. 별칭은 `tsconfig.json`의 것을 물려받아 `@game`이 등불지기의 내용을 가리킨다: 틀의 통로가 import하는 내용 파일은 따라 들어오지만 게임의 선언 파일과 규칙은 들어오지 않는다.
- `games/deungbul/vite.config.ts`(2026-11-24에 뿌리에서 옮겼다): `root`는 `games/deungbul/client`, `publicDir`은 그 안의 `public/`, `outDir`은 뿌리의 `dist/`, `base: './'`. 도감은 게임 빌드가 끝난 뒤 같은 `dist/`에 따로 빌드한다.
- `package.json`의 스크립트 이름은 옮기기 전과 같다: `dev, dev:server, dev:client, build, start, pilot, typecheck, typecheck:engine, test, test:engine, test:game, load, econ`. `typecheck`는 전체, 틀만, 틀만(예제의 내용), 예제를 차례로 돌린다. 11단계에서 더한 것: `typecheck:engine:sample, typecheck:sample, test:sample, build:sample, start:sample, dev:sample`. 예제의 기본 포트는 3002, 저장은 `data/sample/game.db`, 빌드 결과는 `dist-sample/`이라 등불지기의 것과 섞이지 않는다.

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
