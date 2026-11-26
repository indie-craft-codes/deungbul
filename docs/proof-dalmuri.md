# 증명 노트: 수집형·방치형 RPG "달무리 원정대"를 문서만으로 만들기

처음 보는 개발자로서 `docs/making-a-game.md`(전부, 특히 1절의 모듈 표와 13절)를 읽고 `games/dalmuri/`를 만들었다.
아래는 **문서가 답하지 못해 틀의 소스를 읽어야 했던 곳**의 기록이다. 형식: 질문 / 본 문서의 자리 / 답한 소스.

## 소스를 읽은 기록

1. **13절의 본보기 플러그인을 새 게임으로 옮길 때 무엇을 어느 입구에서 가져오나** (`CLASS_IDS`, `Plugin`)
   - 문서: 13절 '본보기'는 "틀의 파일은 입구로 가져온다"고만 한다. 본보기 `engine/test/collect/server/heath.ts`는 상대 경로(`../../../shared/defs`, `../../../server/game/game`)로 가져온다.
   - 소스: `engine/server/index.ts`(`Plugin`, `Game`, `Ent`, `dist`의 다시 내보내기), `engine/shared/defs.ts`(`CLASS_IDS`, `heroDef`가 `@engine/shared/defs`에 있는지).
   - 고칠 것: 본보기에 "새 게임에서는 이렇게 가져온다"는 import 줄 둘을 적는다.

2. **방치 보상은 화면에 어떻게 보이나 (다시 접속했을 때의 창이 있나)**
   - 문서: 1절 모듈 표의 `idle` 줄은 '화면에 생기는 것'이 비어 있다. 13절 '단계'의 방치 보상은 식만 말한다.
   - 소스: `engine/server/game/systems/idle.ts`. 접속할 때 **우편으로만** 보낸다(안내문·창 없음). 우편 탭의 점만 바뀐다.
   - 우회: 게임이 `g.ready`에서 `playerJoined`를 (틀의 idle 처리기 뒤에) 걸고, 새로 온 `idle` 우편을 찾아 게임 메시지 `idleGain`을 보낸다. 화면이 창을 띄우고 '받기'가 `mailClaim`을 보낸다(`games/dalmuri/server/dalmuri.ts`, `client/expedition.ts`).
   - 문서에 처리기의 차례(플러그인의 `playerJoined`는 틀의 시스템보다 **먼저** 불린다)가 적혀 있지 않아 이것도 소스(`engine/server/game/game.ts`의 `on`/`fire`, 플러그인이 시스템 앞에서 불린다는 6절 (2)의 말과 합쳐)로 확인했다.

3. **실패한 뒤의 자동 진행, 그리고 던전에서 나온 뒤 단계로 돌아가나**
   - 문서: 13절 '단계'는 실패하면 자동 진행을 끈다고 적는다. 던전에서 나온 뒤에 어떻게 되는지는 없다.
   - 소스: `engine/server/game/systems/stages.ts`(`start`는 들판에서만, 던전에서 나와도 다시 시작하지 않는다), `engine/server/game/systems/dungeon.ts`(`leave`는 문 앞으로 옮길 뿐).
   - 우회: 게임의 틱이 던전에서 나온 사람을 `RETURN_S`초 뒤 `g.stages.start`로 돌려보낸다.

4. **던전 안에서 대장(플레이어)도 대신 싸우나**
   - 문서: 13절 '단계'의 `leaderAuto`는 단계 안만 말한다. 던전은 3절 '던전 만들기'에 걷는 사람 기준으로만 있다.
   - 소스: `stages.ts`의 `aim`(단계 안에서만), `dungeon.ts`(대장을 움직이는 것이 없다).
   - 우회: 게임의 틱이 던전 안의 대장에게 가장 가까운 몬스터를 대상으로 준다(`p.targetId`). 그러면 틀의 전투가 다가가 친다는 것은 문서 어디에도 없어 `stages.ts`의 같은 셈을 보고 따라 했다.

5. **영웅의 겉모습을 등급마다 다르게 할 수 있나**
   - 문서: 13절 '편성'의 '화면' 줄: "역할의 옷 색·손 모양의 사람, 발밑에 등급 색 고리". 게임이 영웅 모델에 끼어드는 접점은 말하지 않는다.
   - 소스: `engine/client/hud/collect.ts`의 `registerKind('hero')`. `makeHumanoid(옷 색, 손 모양)`만 넘기므로 `setHumanoidBody`는 영웅 id도 등급도 모른다.
   - 우회: 영웅마다 옷 색(`HeroDef.cloth`)을 다르게 두고, `setHumanoidBody` 안에서 옷 색 → 등급의 표로 알아봐 희귀에 망토, 전설에 금관·빛고리를 얹는다(`client/scene.ts`). 옷 색이 겹치면 깨지는 꼼수다.

6. **영웅을 키우는 '재료'(던전 보상)를 쓸 수 있나**
   - 문서: 13절 '영웅'의 표: `levelCur`는 `gold` 또는 `sparks`, 별은 조각. 재료(아이템)로 키우는 길은 없다고 읽힌다.
   - 소스: `engine/shared/defs/collect.ts`(`Coin = 'gold' | 'sparks'`), `engine/server/game/systems/roster.ts`(조각을 더하는 길은 `grant`뿐).
   - 우회: '별의 샘'이 아이템 `essence`(별정수)를 주고, 게임의 명령 `essence`가 별정수를 가방에서 빼고 `g.roster.grant`(가진 영웅이면 그 등급의 조각 한 묶음)를 부른다.

7. **빈 `CAMPS`를 적지 않으면 타입 검사가 틀 안에서 걸린다**
   - 문서: 3절의 표는 `CAMPS`를 "`[]` 가능"이라고만 한다. 10절의 '내 내용은 계약을 지키는데 engine/ 안의 파일에서 타입 오류'가 비슷한 경우를 말하지만 이 경우는 목록에 없다.
   - 증상: `engine/server/game/systems/monsters.ts(77)`: `string`을 몬스터 id에 넣을 수 없다. 틀의 기본 `CAMPS`(types: `string[]`)가 이 게임의 `MONSTERS`(id의 합집합)와 맞지 않는다.
   - 우회: `export const CAMPS: readonly { …; types: readonly MonsterId[] }[] = [];`

8. **무기 하나 + 재료 하나(갑옷 없음)인 아이템 표도 틀 안에서 걸린다**
   - 문서: 10절은 '아이템이 무기 하나뿐'은 시험이 지킨다고 한다. 무기 + 재료는 말하지 않는다.
   - 증상: `engine/server/game/systems/gear.ts(122)`, `shop.ts(74)`: `'mat'`과 `'armor'`는 겹치지 않는다 (as const 표의 종류가 좁아져서).
   - 우회: `essence: { kind: 'mat' as ItemDef['kind'], … }`로 그 칸의 종류를 넓힌다.

9. **메뉴 탭의 줄 만들기(`row`, `button`)를 게임이 쓸 수 있나**
   - 문서: 11절 '화면'의 표는 `addMenuTab`만 있다. 틀의 탭이 쓰는 `menu/parts.ts`의 `row`·`button`·`el`은 입구(`@engine/client`)에 없다.
   - 소스: `engine/client/hud/menu/parts.ts`, `engine/client/style.css`(`mrow`, `what`, `iname`, `note`, `acts`, `baghead`). 게임이 같은 class로 손수 만들었다.

10. **던전 이름을 게임의 화면에서 읽는 법**
    - 문서: 5절 '문장'은 이름표 칸을 말하지만 화면에서 던전의 이름을 읽는 함수는 말하지 않는다(`L().names` 같은 것이 없다).
    - 소스: `engine/client/i18n/names.ts`의 `dungeonLabel(L(), id)`.

11. **명령 처리기 안에서 플레이어를 옮기는 법 (`g.emit(['r', id])`)**
    - 문서: 6절·11절에 엔티티의 자리를 바꾼 뒤 화면에 알리는 법이 없다(`g.movement.goTo`는 걷기).
    - 소스: `engine/server/game/systems/stages.ts`의 `place`, `dungeon.ts`의 `move`. 게임의 `keyrun`이 같은 꼴(`p.x/z/tx/tz`, `p.path = null`, `g.emit(['r', p.id])`)로 문 앞에 세운다.

12. **사람의 대상(`p.targetId`)을 주면 서버가 다가가 친다**
    - 문서: 없다(대상 공격은 화면의 단추로만 말한다).
    - 소스: `engine/server/game/systems/combat.ts`의 사람 틱(사거리 밖이면 대상으로 걷는다).

13. **가방 단추를 감추는 길**
    - 문서: 1절 표: `items`를 고르면 가방 단추·창이 생긴다. 던전(`dungeon → gear → items`) 때문에 고를 수밖에 없는데, 단추를 끄는 내용 칸은 없다.
    - 소스: `engine/client/hud/skeleton.ts`(`#bagBtn`). 게임의 css로 `#bagBtn { display: none; }`. B 키는 그대로 가방을 연다.

14. **전투 모듈의 '가까운 대상 공격' 단추를 끄는 길**
    - 문서: 1절 표는 `combat`이 '대상 공격 단추'를 만든다고만 한다. 방치형(서버가 대신 싸움)에서 끄는 칸이 없다.
    - 소스: `engine/client/hud/skeleton.ts`(`#tabBtn`). 게임의 css로 감췄다. Tab 키는 그대로다.

## 시험 중에 고친 실수 (문서와 상관없는 내 실수)
- `keyrun`이 들어갈 수 없을 때(레벨·열쇠)도 단계에서 먼저 나와, 5초마다 단계가 처음부터 다시 시작했다. 시뮬레이션으로 찾았다.
- 실제 화면에서 원정 탭의 '들어가기'가 레벨이 모자라도 켜져 있었다 → 레벨 안내와 막기.

## 실제로 돌린 결과 (3015, 헤드리스 Chrome, 화면의 단추만 누르는 봇)
- 10분(실제 시간, 새 캐릭터 Runner2): 10번 뽑기 1번(약 3분), 1-5 우두머리를 약 9분에 깨고 1-6 진행 중, 열쇠 던전 넷(황금 광맥·별의 샘 각 둘), 대장 레벨 10, 편성 모루·갈대·번개손·이슬. 콘솔 오류 없음.
- 시뮬레이션(틀의 게임 그대로 30분, 정해진 난수, 씨앗 1·2·3): 처음 10번 뽑기 2:50, 처음 우두머리 7:56~8:15, 2장 14:25 / 22:27 / 25:08, 30분에 2-2~2-3.
- 화면: `$TEMP/dg-work/idlegame-shots/` (PC 1280×720·폰 390×844, 한국어·영어): stage, gacha-rates, pull10, roster, squad, boss, expedition, dungeon, mail, idle, stage-cam.
- 새지 않은 RPG 화면: 실제 화면의 보이는 요소에 가방·대상 공격·자동 사냥·물약·상점·대장간·파티·길드·직업 고르기가 없다. 메뉴 탭은 영웅·뽑기·편성·단계·원정·우편·일일·기기.

## 문서의 빈 곳 (큰 것부터)
1. 13절에 '대장이 던전·들판에서 어떻게 되는가'가 없다: 단계를 벗어나면 방치형이 멈춘다(던전 안 대장 자동 전투 없음, 던전에서 나와도 단계로 돌아가지 않음, 열쇠 던전은 들판의 문까지 걸어가야 한다). → 13절에 '단계 밖' 소절, 틀에 `STAGE_RULES.returnAfterDungeon`·던전의 `leaderAuto`·메뉴에서 열쇠 던전 들어가기를 권한다.
2. 방치 보상의 화면이 없다는 것(우편뿐)이 어디에도 적혀 있지 않다. → 1절 표 `idle`의 '화면' 칸에 "없음: 우편으로만 온다"와 게임이 창을 띄우는 법.
3. 13절의 본보기 플러그인이 상대 경로로 가져온다. → 새 게임용 import 줄을 함께 적는다.
4. 영웅 모델에 끼어드는 접점, 영웅을 키우는 재료의 길이 없다는 것('남은 것'에 일부만). → '남은 것'에 둘을 더하고 우회법을 적는다.
5. 10절 '틀 안의 타입 오류'의 목록에 빈 `CAMPS`와 '무기 + 재료(갑옷 없음)'가 없다.
6. 의존으로 딸려 오는 모듈(던전 → 장비 → 아이템)의 화면(가방 단추, 대상 공격 단추)을 끄는 법이 없다.

## 메운 것 (2026-11-26, 가지 `feat/idleflow`)

틀에서 메웠다(모두 선택 칸). 달무리를 새 칸으로 옮긴 것은 아래 '옮긴 것'(가지 `feat/dalmig`). 쓰는 법은 [making-a-game.md](making-a-game.md) 13절 '단계 밖', 틀 쪽의 자세한 것은 [framework-status.md](framework-status.md)의 같은 이름의 절.

| 항목 | 어떻게 메웠나 | 달무리에서 지울 우회 |
|---|---|---|
| 1. 새 게임의 import 줄 | 13절 '본보기'에 새 게임에서 그대로 쓰는 줄(`@engine/shared/defs`, `@engine/server`, `@engine/client`, `@engine/client/i18n/names`) | 없음 |
| 2. 방치 보상의 화면 | `IDLE.popup: true` → 메시지 `idleBack`과 틀의 창(`hud/idleback.ts`: 받기는 그 우편의 `mailClaim`, 나중에는 우편에 남김). 1절 표 `idle`의 화면 칸. 처리기의 차례(플러그인이 먼저)는 13절 '단계 밖'에 | `g.ready`의 `playerJoined`와 `idleGain`, `#idlePop` |
| 3. 던전 뒤 단계로 | `STAGE_RULES.returnAfterDungeon: 초`(사건 `dungeonExited`) | 틱의 `returning`·`inside` |
| 4. 던전 안의 대장 | `DungeonDef.auto: true`(단계와 같은 셈 `leaderFight`) | 틱의 대상 고르기 |
| 5. 영웅의 겉모습 | `setHeroModel(({ id, rarity, look }) => …)`, 또는 `setHumanoidBody`의 `look.hero`·`look.rarity` | `RARITY_BY_CLOTH`(옷 색 → 등급) |
| 6. 재료로 키우기 | `HERO_RULES.trade: { essence: { cost: (r) => [3, 6, 15][r] } }`(조각은 그 등급의 한 묶음), 명령 `{ t: 'hero', a: 'trade', id, item }`, 원인 `cmd:hero:trade`, '영웅' 탭의 단추 | 게임 명령 `essence`, 안내문 `essence*`, 원정 탭의 별정수 줄 |
| 7. 빈 `CAMPS` | 틀이 무리의 종류를 몬스터 id로 넓혀 읽는다(`monsters.ts`). 10절 목록 | `CAMPS`의 타입 적기(적지 않아도 된다) |
| 8. 무기 + 재료 | 틀이 아이템의 종류를 넓혀 읽는다(`gear.ts`, `shop.ts`). 10절 목록. 시험 `collect/idleflow`가 그런 내용으로 틀을 타입 검사한다 | `kind: 'mat' as ItemDef['kind']` |
| 9. 메뉴 줄 도우미 | `@engine/client`의 `menuRow`, `menuButton`, `menuEl`, `menuSpan`, `menuChips`, `redrawMenu`, `closeMenu` | 손수 만든 `el`·`btn`·`row`, `#menuClose` 누르기 |
| 10. 던전의 이름 | 13절 '단계 밖'에 `dungeonLabel(L(), id).name`(`@engine/client/i18n/names`) | 없음 |
| 11. 사람을 옮기는 법 | 메뉴에서 들어가기(`DungeonDef.fromMenu`, 명령 `dungeonGo`)가 틀 안에서 한다. 손수 할 때의 꼴은 13절 '단계 밖'에 | 게임 명령 `keyrun` |
| 12. `p.targetId`를 주면 다가가 친다 | 13절 '단계 밖'에 적었다. 틀의 셈은 `leaderFight`(입구 `@engine/server`) | 없음 |
| 13. 가방 단추 | `HUD: { hide: ['bag'] }` | css `#bagBtn` |
| 14. 대상 공격 단추 | `HUD: { hide: ['attackNearest'] }` | css `#tabBtn` |

## 옮긴 것 (2026-11-26, 가지 `feat/dalmig`)

달무리를 위의 칸으로 옮기고, 그 뒤에 생긴 수집형의 칸(소탕·오프라인 진행·픽업 배너·영웅의 성장)도 쓰게 했다. 게임의 코드는 **처음 온 대장의 준비와 일일 임무의 셈뿐**이다(`games/dalmuri/server/dalmuri.ts` 113줄 → 32줄). 공용 선언 파일 `games/dalmuri/shared/dalmuri.ts`(게임의 명령·메시지·안내문)는 더할 것이 없어 지웠다.

| 지운 꼼수 | 쓴 칸 |
|---|---|
| 게임 명령 `keyrun`(단계에서 나와 문 앞으로 옮기고 틀의 던전 명령), 틱의 대상 고르기, `returning`·`inside`·`RETURN_S` | `DungeonDef.fromMenu`·`auto`, 틀 명령 `dungeonGo`, `STAGE_RULES.returnAfterDungeon: 3` |
| 게임 명령 `essence`, 안내문 `essenceUsed`·`essenceShort`·`essenceNoHero`, 원정 탭의 별정수 줄, `ESSENCE` | `HERO_RULES.trade: { essence: { cost: [3, 6, 15] } }`, '영웅' 탭의 교환 단추 |
| 메시지 `idleGain`, `g.ready`의 `playerJoined`, 창 `#idlePop`과 그 문장·css | `IDLE.popup: true`(틀의 `idleBack`, `hud/idleback.ts`) |
| 옷 색 → 등급의 표 `RARITY_BY_CLOTH`(`setHumanoidBody`) | `setHeroModel(({ rarity, look }) => …)`. 옷 색은 영웅마다 다른 겉모습으로만 남았다 |
| css `#bagBtn`·`#tabBtn { display: none }` | `HUD: { hide: ['bag', 'attackNearest'] }` |
| 손수 만든 `el`·`btn`·`row`, `#menuClose` 누르기 | `menuRow`, `menuButton`, `menuEl`, `closeMenu`, `myKeys`(`@engine/client`) |
| 빈 `CAMPS`의 타입 적기, `kind: 'mat' as ItemDef['kind']` | 적지 않는다(틀이 넓혀 읽는다) |

'원정' 탭은 열쇠 사기와 들어가기(`dungeonGo`)만 남았다. '단계' 탭 끝의 틀의 '던전' 줄(들어가기·소탕)에 열쇠 사기가 없어서다.

새로 쓰게 된 기능과 정한 수치 (달무리는 시제품이라 경제 승인 대상이 아니다. 기준은 '처음 30분의 흐름이 그대로 목표 안에 있을 것'):

| 기능 | 칸 | 정한 값 | 이유 |
|---|---|---|---|
| 단계 소탕 | `STAGE_RULES.sweep` | 소탕권 1장에 1번, 한 번에 10번까지 | 본보기와 같은 모양. 소탕권이 드물어(처음 3, 임무 '단계 15번' 3, 출석 3일째 5) 하루 열 번 남짓 |
| 던전 소탕 | `DungeonDef.sweep` | 열쇠 1개에 1번, 한 번에 2번까지(끝낸 적이 있어야) | 열쇠 상한이 2라 그 이상은 뜻이 없다 |
| 오프라인 진행 | `STAGE_RULES.offline` | 15분에 한 단계, 12시간까지, 한 번에 10단계까지, 권장 전투력 이상만 | 방치 보상의 상한(12시간)과 같게. 본보기(10분)보다 느리게: 접속해 싸우는 쪽(단계 하나 1~3분)이 늘 빠르게 |
| 돌아왔을 때의 창 | `IDLE.popup` | 켬 | 예전 `idleGain` 창을 틀의 창으로 |
| 픽업 배너 | `BannerDef.pickup`·`fiftyFifty`·`pityGroup`·`start`·`end` | '월식 소환' 셋(달방패 → 별비 → 새벽 성녀, 2026-11-20부터 3주씩). 판은 달무리 소환과 같고(전설 3%) 픽업이 그 반(1.5%), 반반, 천장 60을 셋이 함께 센다(`eclipse`). 값은 다른 배너와 같은 100 / 900 | 늘 있는 배너와 값·천장이 같아 고르는 기준은 픽업뿐. 실효 확률(천장·반반 포함)은 2.38% |
| 영웅 선택권 | `GACHA_RULES.select` | 전설 셋 가운데 하나. 출석 7일째(그날의 월석을 500 → 300으로) | 이레를 이어 온 사람에게 전설 하나 |
| 영웅 장비 | 모듈 `herogear`, `HERO_RULES.gear` | 칸 셋(무기·갑옷·부적). 일반 셋, 희귀 세트 둘(달빛: 2개 체력 +12%, 3개 받는 피해 −12% / 성휘: 2개 공격 +10%, 3개 주는 피해 +15%), 전설 무기 월식검(공격 20·체력 30). 강화 상한 5 + 등급 × 5, 강화마다 +12%, 값 금화 60 × (강화 + 1) × (등급 + 1)과 운철, 성공 확률 +3부터 10%씩 내려 50%까지. 단계를 깨면 30%로 하나(일반 10 : 희귀 1의 무게), 우두머리 단계는 희귀 확정(2장부터 월식검도), 황금 광맥 50% 희귀 | 일반 장비 한 벌이 1레벨 영웅의 전투력을 20~30% 올리는 정도. 운철은 단계를 깰 때마다 1(장마다 +1) |
| 기술 레벨 | `HERO_RULES.skill` | 상한 1 + 별 + 각성 × 2, 값 금화 100 × 레벨 × (등급 + 1)과 별자리 서책(레벨만큼), 레벨마다 기술 +10% | 서책은 별의 샘(3)과 임무 '몬스터 120마리'(2) |
| 각성 | `HERO_RULES.awaken` | 별 6에서 셋: 조각 20·40·80, 금화 5천·1만·2만, 달 조각 1·2·4, 배율 1.12·1.25·1.4. 1단계 '달빛 장막'(받는 피해 −8%), 3단계 '보름달'(주는 피해 +12%) | 별 6은 긴 목표다. 달 조각은 우두머리 단계를 처음 깰 때 1(여섯), 별의 샘 1 |
| 진형 | `SQUAD_RULES.rows` | 앞줄 둘(받는 피해 −20%, 9m 안의 적을 끈다), 뒷줄 둘(주는 피해 +8%) | 수호를 앞에, 술사·치유를 뒤에 두는 뜻 |
| 시너지 | `HeroDef.tag`, `SQUAD_RULES.synergy` | 진영 셋, 넷씩. 해: 둘 공격 +8%, 셋 공격 +12%·체력 +8% / 달: 둘이면 편성 모두 받는 피해 −8% / 별: 둘 주는 피해 +10%, 넷 +20% | 처음 영웅 둘(모루 해, 갈대 달)로는 켜지지 않고, 뽑기로 같은 진영을 모으면 켜진다 |
| 전투력 | `HERO_RULES.power` | 적지 않았다(틀의 기본 셈) | 단계의 권장 전투력(`stageRec`)이 그 셈에 맞춰져 있다 |

처음 30분의 흐름(시뮬레이션: 사람의 몫에 별정수 교환·장비 끼기·메뉴의 던전을 넣었다. 씨앗 1·2·3):

| | 옮기기 전 | 옮긴 뒤 |
|---|---|---|
| 처음 10번 뽑기 | 2:50 | 2:50 |
| 처음 우두머리(1-5) | 7:56~8:15 | 7:18~7:32 |
| 2장에 듦 | 14:25 / 22:27 / 25:08 | 12:38 / 13:41 / 13:26 |
| 30분에 | 2-2~2-3 | 2-3~2-4 |
| 처음 열쇠 던전 | 3:54~3:57 | 3:40~3:46 |

장비·진형·시너지로 조금 빨라졌다(2장에 드는 때가 씨앗마다 2~12분 앞당겨졌다). 시험의 목표(처음 우두머리 6~12분, 2장은 10분 뒤·30분 안)는 그대로 안에 있다. 셋 모두 2장에 들어 '하나는 1-10에서 막혀도 된다'의 벽은 없어졌다.

틀에서 함께 고친 것(선택 칸을 켠 게임에만 바뀐다): 돌아왔을 때의 창의 바탕이 반투명(`rgba(…, .97)`)이라 폰에서 뒤의 글자가 비쳤다 → 메뉴·가방과 같은 `--ink`. 오프라인 진행이 안내문 `stageAway`와 창에 두 번 나왔다 → `IDLE.popup`을 켠 게임은 창 하나로만(창이 뜨지 않을 만큼 짧게 비웠으면 안내문). 자세한 것은 [framework-status.md](framework-status.md)의 '달무리 옮기기'.
