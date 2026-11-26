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

## 시험 중에 고친 실수 (문서와 상관없는 내 실수)
- `keyrun`이 들어갈 수 없을 때(레벨·열쇠)도 단계에서 먼저 나와, 5초마다 단계가 처음부터 다시 시작했다. 시뮬레이션으로 찾았다.
- 실제 화면에서 원정 탭의 '들어가기'가 레벨이 모자라도 켜져 있었다 → 레벨 안내와 막기.

## 실제로 돌린 결과 (3015, 헤드리스 Chrome, 화면의 단추만 누르는 봇)
- 10분(실제 시간): 1-5 우두머리를 약 9분에 깨고 1-6 진행 중. 10번 뽑기 1번(약 3분), 열쇠 던전 넷(황금 광맥·별의 샘 각 둘), 대장 레벨 10, 편성 모루·갈대·번개손·이슬.
14. **전투 모듈의 '가까운 대상 공격' 단추를 끄는 길**
    - 문서: 1절 표는 `combat`이 '대상 공격 단추'를 만든다고만 한다. 방치형(서버가 대신 싸움)에서 끄는 칸이 없다.
    - 소스: `engine/client/hud/skeleton.ts`(`#tabBtn`). 게임의 css로 감췄다. Tab 키는 그대로다.
