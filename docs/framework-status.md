# 틀과 게임 가르기: 지금의 상태

이 문서는 **지금 무엇이 끝났고, 틀과 게임이 어디서 만나고, 무엇이 남았는지**를 적는다. 2026-11-25(커밋 `98de4cf` 무렵)을 기준으로 현행화했다. 코드를 고치면 이 문서도 함께 고친다.

함께 보는 문서:

- [making-a-game.md](making-a-game.md): 새 게임을 만드는 차례와 틀의 접점 전체(새 게임을 만드는 사람은 이것부터).
- [framework-audit.md](framework-audit.md): 2026-11-24의 점검 보고(기록). 거기 적힌 문제들의 처리는 아래 '틀 수리의 진행'.
- [framework-plan.md](framework-plan.md): 틀을 가를 때의 계획(기록. 파일 경로와 세부는 그때의 것).
- [economy.md](economy.md), [modes.md](modes.md), [ideas.md](ideas.md): 등불지기의 경제, 보류한 장르 모드, 보류한 아이디어.

## 요약

- 코드는 틀(`engine/`)과 게임들(`games/deungbul/` 등불지기, 예제 `games/sample/`)이다. 방향은 게임 → 틀 하나다.
- 틀이 게임에서 읽는 것은 내용 계약(`engine/shared/contract.ts`)의 이름뿐이고, 별칭 `@game/shared/content`로 읽는다. 게임은 틀을 입구(`@engine/shared`, `@engine/server`, `@engine/client`, `@engine/client/i18n`, `@engine/testing`)로만 읽는다.
- 확인: `npm run typecheck`(전체, 등불지기, 틀만, 틀만을 시험용 내용으로, 틀만을 예제의 내용으로, 예제) 오류 0, `npm test`(틀의 시험과 두 게임의 시험, 검사 1148개) 모두 통과.
- 틀의 시험은 게임 없이 돈다: 시험용 내용(`engine/test/fx/`) 위에서. `games/`를 지운 복사본에서도 틀의 타입 검사와 시험이 통과한다(2026-11-25에 확인).
- 틀 수리 묶음 A~F(점검 보고의 31개 항목 가운데 문서로 남긴 것 말고 모두)가 끝났다(2026-11-25).
- 그 뒤 틀에 더한 기능(2026-11-25, 아래 '틀에 더한 기능'): 전체 지도와 자동 이동, 손 모양·날아가는 것·사람형 모델 등록, 기술 효과 여섯 가지, 메뉴 탭 고르기.
- 등불지기의 플레이, 저장 형식은 가르는 동안 바뀌지 않았다. 프로토콜은 2다(호환 코드는 2026-11-24에 지웠다). 그 뒤 더한 사건(`buff`, `stun`)은 옛 화면이 모르는 채 무시한다.

## 0. 이어 갈 것

틀이 최우선이다(사용자 결정). **2026-11-24 결정: 등불지기는 전통 MMORPG로 두고 새 장르 모드는 만들지 않는다. 작업은 틀만 한다.**

1. **문서만 보고 새 게임 만들기: 1차 끝(2026-11-25), 다시 검증이 다음 차례.** 1차: 독립 에이전트가 문서만 보고 "얼음 동굴"(먼 지역, 직업 하나·창, 기절·돌진·강화, 두 번째 재화·상점·던전·출석 없음, 장비 칸 셋)을 끝까지 만들었다(시험 1160 통과). 드러난 빈틈 13개(막힘 1: 입구 규칙이 문서에 없었다)와 틀의 문제 3개(쓰러짐 안내의 빈 장소 이름, 물약이 없어도 보이는 물약 단추, 상점·제작이 없어도 그것을 말하는 강화 안내)를 고쳤다. 그 게임은 검증용 복사본에만 있다. **2차 끝(2026-11-25)**: 새 에이전트가 고친 문서로 "사막 오아시스"(들판과 던전·우두머리, 직업 둘·새 투창 손 모양과 날아가는 것, 지속 피해·범위 지속 피해·아군 강화, 두 번째 재화, 대장간 제작, 게임의 메뉴 탭, 물약·상점 없음)를 만들었다(시험 1170 통과). 문서 때문에 막힌 곳은 없었다. 드러난 것: 경계 검사가 새 게임의 id와 같은 틀의 낱말(`hex`)을 잘못 잡았다(→ 본보기 셋의 id만 실패로, 나머지는 알림), 던전 지역에 땅이 없었다(→ 지역마다 깐다), 두 번째 재화의 보유량이 화면에 없었다(→ 내 정보 창 `#coin`), 물약이 없어도 가방에 물약 머리줄(→ 숨긴다), 문서의 헷갈림 다섯·사소함 넷(선언 파일의 `export {}`, 던전·지역·문의 관계, 선택 기능의 예, 시험의 명령, 이름표의 모양 …)을 고쳤다. 두 게임은 검증용 복사본에만 있다. 처음 맡길 때의 조건: 틀을 처음 보는 사람이 [making-a-game.md](making-a-game.md)만 보고 작은 게임을 만들 수 있는지. 검증자에게 '등불지기와 일부러 다르게'(원점에서 떨어진 지역, 직업 하나, 두 번째 재화 없음, 장비 칸 셋, 상점·던전·출석 없음, 새 기술 효과와 손 모양 하나씩)를 준다. 독립 에이전트에게 맡길지 직접 할지는 사용자가 정한다.
2. **플레이어 재검토**: 실제 플레이로 막히는 곳과 큰 불편을 찾는다(전에 맡긴 검토는 도중에 멈춰 보고가 없다).
3. **아래 '3. 남은 일'**의 작은 것들. 2026-11-25에 끝낸 것: 운영 스크립트를 게임마다(`games/<게임>/deploy.json`), 등불지기의 서버 진입점도 틀의 `runServer`로, 틀 css의 박힌 색을 변수로(`--ink-rgb`, `--cover-rgb`, `--on-gold`, `--good`, `--bad`, `--ally`).
4. **(보류)** 사용자가 다시 말할 때까지:
   - 경제의 다음 단계: [economy.md](economy.md)의 강화 규칙(+7부터 하락·보호 부적·재련) → 밝은 등불 → 접속 보상·수수료 → 따라잡기.
   - 가지 `wip/rift`: 안개 균열 시제품(반쯤 된 채 멈춤. 지우지 않는다). [modes.md](modes.md).
   - [ideas.md](ideas.md)의 아이디어(AI 채팅으로 하는 루틴·정보 조회, 사용자가 만드는 코스튬).

## 틀에 더한 기능 (2026-11-25)

| 기능 | 틀 쪽 | 게임이 하는 일 | 지키는 것 |
|---|---|---|---|
| 전체 지도 | `engine/client/hud/worldmap.ts`: 지역 전체, 확대·끌기·두 손가락, 장소 목록과 정보 카드, 표식 위의 이름, 축척, 걸어가는 길. 상점·대장간(잠금)·던전의 문·사냥터(`CAMPS`: 몬스터와 수, 경험치·골드)·우두머리는 내용에서 스스로 모은다. 열기: N 키, 미니맵, '지도' 단추(폰 포함) | 바탕(`setMapPaint`), 큰 이름(`addMapLabels`), 자기 장소(`addMapPlaces`, 갈래 `PlaceKind`) | 화면으로 확인(PC·폰 가로세로·두 게임) |
| 자동 이동 | `travelTo(장소, hunt)`, `stopTravel`: 길을 찾아 걷고 도착을 알린다. hunt면 도착해서 자동 사냥을 켠다. 직접 움직이면 그치고, 닿지 못하면 몇 번 다시 걷다 그친다 | 목록·카드의 단추가 부른다 | 화면으로 확인(가서 자동 사냥 → 처치까지) |
| 손 모양·날아가는 것·사람형 | `registerHand(id, build)`, `registerShot(id, look)`, `setHumanoidBody(look => Model)`. 직업의 `hand`·`shot`은 문자열(틀에는 sword·bow·staff, arrow·bolt). 아이템 이름표는 손 모양 id의 칸을 읽는다(`ItemNames`) | 예제: 나무꾼의 도끼(`registerHand('axe', …)`) | 타입 검사, 화면 |
| 기술 효과 여섯 | `SkillEffect`: `hit`(slow·stun), `area`, `heal`, `buff`(damage·guard·regen·crit, allies), `dash`, `dot`(area). 서버 `g.combat.cast`, 시간은 `tickEffects`, 사건 `buff`·`stun`. 화면: 내 정보 창의 강화와 남은 시간(`hud/buffs.ts`), 기절 글자, 돌진 먼지. 자동 사냥과 도감도 종류를 안다 | 기술 표에 한 줄. 예제: 내려찍기에 `stun: 1` | `engine/test/fx/skills.test.ts`(20개) |
| 메뉴 탭 | 탭 id(`MENU_TABS`), `setMenuTabs(ids)`, `addMenuTab({ id, label, draw, dot, open, sig }, after)`, `openMenu(id)`. 일일 임무·출석이 없으면 일일 탭이 숨는다 | 예제: 거래소·길드를 감추고 모닥불 탭을 더했다 | 화면 |
| 상인 | `setMerchant((shop, i) => ({ model, name, look }) \| null)` | 등불지기: 곁의 등탑을 바라본다, 이름 '길 상인' | 화면 |
| 재화 | 저장을 읽을 때도 `CURRENCIES.max`(`g.wallet.limit`), 첫 재화의 이름은 이름표 `currency1` | 이름표 | `fx/wallet` |
| 그림 | `addIconSheet(src, 열, 행, keys, hand?)`, `itemIcon(열쇠, 직업)`, `gearIcon`: 시트의 한 칸을 가방·상점·대장간·물약 단추·메뉴의 장비와 우편·내 정보 창의 재화에 그린다. 열쇠는 아이템 id, `slot:칸`, `cur:gold`·`cur:second`, `ui:mail`. hand를 주면 그 손 모양의 직업에게만(무기). 칸 뒤의 바탕은 `--icon-bg`. 없는 것은 글자만 | 등불지기: 투명 webp 넷(소모품·재료, 검·갑옷, 활·지팡이, 장신구·재화·우편), 모두 340KB | `fx/icons`(4개), 화면(PC, 전사·궁수·마법사) |
| 운영 스크립트를 게임마다 | `games/<게임>/deploy.json`(port, db, dist, bots, pages)을 `scripts/deploy.mjs`가 읽고, `restart.sh`·`publish.sh`(`GAME=`)와 `pilot.mjs`(인자)가 그것으로 돈다. `restart.sh`의 `DRY=1` | 자기 `deploy.json` | 예제로 실제 재시작(깃발로 저장하고 끄기 → 다시 띄우기) |
| 시험을 게임마다 | `test/all.ts`가 `games/<게임>/test/all.ts`를 저마다의 tsconfig로 돌린다. `node scripts/game.mjs test [게임] [이름…]` | 자기 `test/all.ts`와 `tsconfig.json` | `npm test` |

## 틀 수리의 진행 (점검 보고의 묶음 A~F: 모두 끝)

| 묶음 | 상태 |
|---|---|
| A. 두 번째 내용과 게임 고르기 | **끝(2026-11-25).** 틀을 두 번째 내용(예제)으로 타입 검사하는 것과 빈 표 변형 셋(`bare`, `weaponOnly`, `otherGear`)은 예제 작업 때 들어갔다. 게임 고르기는 `scripts/game.mjs <start\|watch\|client\|build> [게임]`(인자, `GAME`, 기본 `deungbul`) 한곳으로: 뿌리의 `vite.config.ts`를 `games/deungbul/vite.config.ts`로 옮겼고 `package.json`의 서버·화면 스크립트는 전부 이것을 부른다. 시험도 게임마다: `games/<게임>/test/all.ts`가 그 게임의 목록이고(`node scripts/game.mjs test [게임] [이름…]`, `npm run test:game`·`test:sample`), 뿌리의 `test/all.ts`는 틀의 시험 뒤에 `test/all.ts`가 있는 게임을 모두 저마다의 `tsconfig.json`으로 따로 된 프로세스에서 돌린다(`npm test`가 예제의 시험도 함께 돈다). 등불지기도 자기 `games/deungbul/tsconfig.json`을 가졌다. 뿌리의 `tsconfig.json`은 편집기와 `scripts/`·`test/`를 위해 등불지기를 기본으로 두었다(저장소의 본 게임) |
| B. 장비·능력치·이름의 고정 풀기 | **끝(2026-11-24).** `STATS[id] = { base, mod }`, `BUILD_STATS[id] = { mod, per }`(전에는 id 목록과 `BUILD.pow/vit/luck`). `mod`는 틀의 효과 넷(`StatMod`: `damage`, `guard`, `crit`, `hp`)이고 서버의 보정(`modValue`, `wornMod`)과 화면의 문장은 효과로 만든다. 칸·등급·능력치의 이름은 이름표(`ContentNames`)의 `gearSlots`, `rarities`, `buildStats`로 게임에. 무기·갑옷 바탕의 기본 수치는 그 효과에 드는 첫 옵션(`statFor`)으로 보인다. 저장을 읽을 때의 옵션 수·장비 레벨 상한도 내용에서(`OPTS_MAX`) 또는 넉넉하게(999). 화면의 문장은 견본과 글자까지 같다. 안내문 `rested`는 D에서 게임으로 옮겼다. 첫 번째 재화의 이름은 이름표의 `currency1`(`{ name, unit }`, 없으면 골드)로: 틀의 문장 스물여덟 곳(한국어·영어 각각)이 그것을 쓴다(점검 26번, 2026-11-25) |
| C. 빈 표와 낱개 | **끝(2026-11-25).** `ATTEND = []`면 출석을 세지 않는다, 처음 필요 경험치는 `needFor(1)`, 접속 전 카메라는 `MAP.spawn` 둘레, 대장간 창은 닿는 곳의 잠금 풀린 대장간이면 어느 것이나(서버와 같은 규칙), 직업의 기술 수는 `SKILL_SLOTS`를 따른다(`readonly SkillId[]`). `loc.items.potion`·`'field'`·개발 포트·`itemDef().kind`는 예제 작업 때 고쳤다. 상인은 게임이 세운다(20번): `setMerchant((shop, i) => ({ model, name, look }) | null)`, 빈 칸은 틀의 기본, `null`이면 그 자리에 아무도 세우지 않는다. 틀의 상인 이름은 '상인'/'Merchant'이고 등불지기는 '길 상인'으로 덮어쓴다(`ui.shop`, `msg.shopFar`). 재화의 상한은 저장을 읽을 때도 `CURRENCIES.max`에서(24번, `g.wallet.limit`): 시험용 내용의 상한을 1e9와 다르게(5e10) 두어 시험이 이를 지킨다. 레벨(999)과 우편 한 통의 보상(1e7)은 깨진 저장을 막는 틀의 상수로 남겼다 |
| E. 경계 검사와 공개 표면 | **끝(2026-11-24, 마지막 조각은 F와 함께 2026-11-25).** 새 시험 `engine/test/boundary.test.ts`: (1) 틀의 소스가 게임의 내용 id를 문자열로 적는가(틀의 낱말 9개와 기본값 묶음은 뺀다), (2) 틀의 모든 소스의 문자열과 css에 이 게임의 낱말이 있는가(알고 남긴 것 4가지: `sparks`·`sparkBonus`(두 번째 재화의 칸), `raid`(점검 14번에서 지운다), `crypto`), (3) 타입 검사를 피하는 캐스팅이 지금(6개)보다 늘었는가, (4) 층을 넘는 import(화면 → 서버, 게임 규칙 → 저장소 구현, 공용 → 서버·화면). 지갑 검사는 `p['gold']`와 `Object.assign(p, { gold })`도 잡는다. 검사마다 스스로를 시험하고, 틀의 파일에 위반 넷을 일부러 넣어 넷 다 잡히는 것을 확인했다. 장부의 한 줄 요약은 재화를 `ECON_CURS`의 id로 찍는다(점검 10번의 반). **입구도 끝(같은 날)**: `engine/shared/index.ts`, `engine/server/index.ts`, `engine/client/index.ts`, `engine/testing.ts`가 이름을 하나씩 적어 내놓고(이것이 게임에 약속한 표면이다), 게임의 import 131줄을 입구로 옮겼다(67줄로 합쳐짐). `boundary.test.ts`의 5번이 깊은 import를 막는다: 허용은 입구, 언어 묶음(`i18n`, `i18n/ko·en·names·merge`), 내용 통로(`shared/defs`, `shared/world`), 확장 지점 셋, 그리고 내용 파일만 `shared/defs/*`의 `import type`과 `shared/defaults`. 구조 시험의 경로 풀이는 폴더의 `index.ts`를 따라간다. 두 게임을 브라우저에서 띄워 콘솔 오류 없이 도는 것을 봤다(화면 모듈의 읽히는 차례가 바뀌었기 때문). 옛 `framework.test.ts`는 F에서 셋으로 갈랐다 |
| F. 틀의 시험을 시험용 내용으로 | **끝(2026-11-25).** 틀의 시험용 내용 `engine/test/fx/shared/content`("시험 들판": 어느 게임의 것도 아니다. id와 맵은 등불지기·예제와 모두 다르고 수치는 시험의 기대값대로 등불지기를 따른다. 대장간·잠금·던전·필드 보스·두 번째 재화·분해·가방 넓히기·상인 둘을 모두 켠다)과 자기 tsconfig(`@game` → 그 폴더). 틀의 기능 시험 24개(`bare`와 옮긴 23개)가 그 위에서 따로 된 프로세스로 돈다(`engine/test/fx/all.ts`, 이름은 `fx/…`). 그 프로세스가 끝에 "게임(games/ 아래)의 파일이 하나도 로드되지 않았다"를 확인한다. 옛 `engine/test/framework.test.ts`는 셋으로 갈랐다: 틀만의 게임·서버·프로토콜 → `engine/test/fx/bare.test.ts`, 예전과 같다는 검사(맵 지문, 옮긴 수치, 저장 견본) → `games/deungbul/test/baseline.test.ts`, 이 게임과 틀의 경계(폴더·import·확장 지점·언어·화면) → `games/deungbul/test/split.test.ts`. 어느 게임에나 맞는 규칙(틀은 내용 통로 말고는 게임을 읽지 않는다, 게임의 id는 저장소의 모든 게임과 시험용 내용에서 모은다)은 `engine/test/boundary.test.ts`로. **확인: 저장소를 복사해 `games/`를 통째로 지우고도 틀의 타입 검사(`tsc -p engine/test/fx`)가 0이고 틀의 시험 704개가 모두 통과했다.** 검사 수는 1089(옮기기 전 1085 + 새 경계 검사 셋 + 매번 도는 '틀만' 검사 하나) |
| D. 서버에 남은 색 | **끝(2026-11-25).** (12) `PlayerSave`에서 이 게임의 옛 칸 넷(`contrib, quest, rested, tier`)을 뺐다: `Saver.legacy`는 옛 저장을 이름-값 묶음으로 받는다. (13) 안내문 `rested`를 이 게임의 `MsgMap`으로. (27) `addBannedWords`(`@engine/server`): 게임이 금칙어를 더한다. (10) 장부의 한 줄 요약은 `ECON_CURS`의 id로(앞서), 사람이 읽는 보고 도구는 이 게임의 것이라 `games/deungbul/scripts/econ.ts`로 옮겼다(`npm run econ` 그대로). 지갑의 세 칸(골드·두 번째 재화·경험치)을 장부가 따라가는 것은 지갑과 같은 약속이라 둔다(계획 7절). (14) 습격 몹을 중립 이름으로: `Ent.raid` → `Ent.swarm`(몰려온 적), `monsters.atTower` → `atSiege`, `TOWER_ATTACK_RANGE` → `SIEGE_REACH`, 문장 키 `fmt.raidFoe` → `fmt.swarmFoe`, 이름표 클래스 `raid` → `swarm`. 줄 위의 칸 이름(`EnterInfo.r`)은 그대로라 열려 있던 화면도 그대로 돈다. 경계 검사에 남겨 두었던 예외 `raidFoe`, `raid`가 없어졌다 |

## 1. 단계별 상태

| # | 무엇 | 상태 | 합친 커밋 |
|---|---|---|---|
| 0 | 안전망: 맵 지문, 저장 왕복 견본, 프로토콜 번호 | 끝 | `792067b` |
| 1 | 서버의 직접 결합 풀기: 규칙 플러그인(`installDeungbul`), `Channels.extraFoes`, `worldSaves`의 `legacy` | 끝 | `792067b` |
| 2 | 확장 지점: 두 `ext.ts`와 게임의 선언 병합 | 끝 | `f25e0b4` |
| 3 | 게임의 저장 칸을 저장 등록(`g.saves`, `PlayerSave.ext`)으로 **[저장]** | 끝. 옛 칸에 함께 쓰던 호환은 2026-11-24에 지웠다(읽는 길 `Saver.legacy`는 남았다) | `e99dd58` |
| 4 | 개인 상태 통로(`g.personal`, `me` 메시지) **[프로토콜]** | 끝. 옛 메시지를 함께 보내던 호환은 2026-11-24에 지웠다(`PROTOCOL` 2) | `ad69a00` |
| 5 | 내용 계약(`MapDef`, `FORGES`, `needs: string`, `contract.ts`) | 끝 | `6f468f0` |
| 6a | 클라이언트의 규칙 객체(`rules`), `addNpc`, `onKey` | 끝 | `d5eae30` |
| 6b | 화면 창 가르기(`hud/me.ts`와 게임의 창), 게임의 진입점 | 끝 | `751684d` |
| 7a | 장면의 겉모습을 게임이 넘긴다(`look`, `setMood`, 모델 등록) | 끝 | `8c8daaf` |
| 7b | 게임의 창은 게임이 붙인다(`mountPanel`, `deungbul.css`) | 끝. 뼈대는 11단계에서 올렸다 | `1049bf3` |
| 8 | 언어 파일을 틀의 문장과 게임의 문장으로(`mergeLocale`) | 끝 | `a67c46e` |
| 9 | **폴더 이동**: `engine/`, `games/deungbul/`, 별칭, 내용 파일 가르기, 틀만 타입 검사 0 | 끝 | `feat/fw9` |
| 10 | 시험 가르기, `new Game()`의 기본값을 틀만으로 | 끝 | `7c96900` |
| 11 | 예제 게임 `games/sample`과 `docs/making-a-game.md`, 뼈대 올리기, 예제의 내용으로 드러난 틀의 수리 | 끝 | `feat/fw11` |
| 12 | 공개 표면(입구 넷 + 언어, 깊은 import 금지) | 끝 (2026-11-24) | |
| 13 | 틀의 시험을 등불지기의 내용에서 떼기 | 끝 (2026-11-25, 묶음 F) | |

### 9단계에서 한 것 (기록: 그때의 사실이다. 뒤에 바뀐 것은 괄호에 적었다)

1. `git mv`로 모든 파일을 `engine/`과 `games/deungbul/`로 옮기고 import 경로와 설정을 고쳤다(내용 변화 없음: 빌드된 js·css가 바이트까지 같았다).
2. 내용 파일을 갈랐다: 모양과 도우미는 `engine/shared/defs/*.ts`, 표와 수치는 `games/deungbul/shared/content/*.ts`. 통로를 둘로 나눴다(아래 2절).
3. 틀이 계약 밖의 이름을 읽던 세 곳을 고쳤다: 대장간 창(`SMITH`·`SMITHY` → `FORGES`의 첫 대장간), 땅의 범위(`MIN_X` 등 → `MAP.areas[0]`), '마을로'의 안내문(`goingTown`: 틀에 기본 문장을 두고 게임이 덮어쓴다). 화면에 보이는 것은 그대로다.
4. 틀만 타입 검사하는 방식을 바꿨다: 게임 파일을 뺀 사본을 만드는 스크립트(`scripts/typecheck-engine.mjs`)를 없애고 `tsc -p tsconfig.engine.json`(`engine/`의 소스만 include)으로. 오류 8 → 0. `npm run typecheck`와 `npm test`가 함께 돌린다.
5. 의존 방향 검사를 폴더 기준으로 바꿨다(그때의 `engine/test/framework.test.ts`. 지금은 `engine/test/boundary.test.ts`와 `games/deungbul/test/split.test.ts`).

계획서와 다르게 한 것:

- 게임의 내용을 `games/deungbul/content/`가 아니라 `games/deungbul/shared/content/`에 두었다(옮기기 전의 `shared/content/`와 같은 모양이라 이력이 이어진다).
- `test/all.ts`는 뿌리에 남겼다: 틀의 시험과 게임마다의 시험을 함께 돌리는 저장소의 도구다(`npx tsx test/all.ts fx/growth deungbul/quests`). 게임의 시험 목록은 그 게임의 `test/all.ts`에 있고, 뿌리의 도구는 `games/` 아래를 둘러보아 찾는다.
- 수치의 기본값 묶음(`engine/shared/defaults.ts`)은 만들지 않았다. (11단계에서 만들었다.)
- 게임별 `tsconfig.json`은 두지 않았다. (예제는 11단계에서, 등불지기는 2026-11-25에 자기 것을 가졌다. 4절.)
- 화면의 뼈대는 올리지 않았다. (11단계에서 `engine/client/hud/skeleton.ts`로 올렸다.)
- 틀의 시험은 `tsconfig.engine.json`에 넣지 않았다: 아직 등불지기의 좌표와 id를 쓴다. (13단계에서 시험용 내용으로 옮겼고, 자기 설정 `engine/test/fx/tsconfig.json`으로 검사한다.)

### 11단계에서 한 것 (기록)

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
6. 새로 생긴 틀의 파일: `engine/shared/defaults.ts`(수치의 기본값 묶음: 계약의 이름 61개 가운데 게임의 id가 들지 않는 것. 등불지기는 쓰지 않는다), `engine/server/run.ts`(`runServer`: 등불지기의 `server/main.ts`가 하는 절차를 옮겨 적은 것. 2026-11-25부터 등불지기도 이것을 쓴다), `engine/client/hud/skeleton.ts`.
7. `npm run typecheck`가 넷을 차례로 돌린다: 전체, 틀만, 틀만(예제의 내용), 예제. 틀이나 계약을 고치면 예제도 함께 고쳐야 통과한다. (지금은 여섯: 등불지기의 설정과 시험용 내용이 더해졌다.)

등불지기의 플레이, 저장 형식, 프로토콜은 바뀌지 않았다.

## 2. 지금의 접점

### 폴더와 별칭

| | 틀 | 이 게임 |
|---|---|---|
| 서버 | `engine/server/` (`net/`, `store/`, `game/game.ts`, `game/systems/`, `text.ts`) | `games/deungbul/server/` (`main.ts`, `deungbul.ts`, `systems/{tower,raid,keepers,quests,rest}.ts`) |
| 공용 | `engine/shared/` (`ext, protocol, messages, sim, nav, world, auto, contract, defs.ts, defs/`) | `games/deungbul/shared/` (`deungbul.ts` 선언, `content/`, `defs.ts`·`world.ts` 통로) |
| 화면 | `engine/client/` (`main.ts`의 `startClient`, `hud/`(뼈대 `skeleton.ts` 포함), `scene/`, `i18n/`, `style.css`) | `games/deungbul/client/` (`index.html`, `main.ts`, `hud/`, `scene/`, `i18n/`, `guide/`, `public/`) |
| 시험 | `engine/test/` | `games/deungbul/test/` (`fixtures/`, `load.ts` 포함) |

- 별칭: `@engine/*` → `engine/*`, `@game/*` → 그 게임의 폴더. 게임마다 자기 `tsconfig.json`(`games/deungbul/`, `games/sample/`)이 있고, 틀의 시험은 `engine/test/fx/tsconfig.json`(시험용 내용)이다. 뿌리의 `tsconfig.json`은 편집기와 `scripts/`·`test/`를 위해 등불지기를 가리킨다.
  - `tsc`: `tsconfig.json`의 `paths` (예제: `games/sample/tsconfig.json`).
  - `tsx`(서버 실행, 시험, `games/deungbul/scripts/econ.ts`): `scripts/game.mjs`가 그 게임의 `tsconfig.json`을 `--tsconfig`로 준다(`npm start`, `npm run test:game` 등). 저장소 뿌리에서 돈다. 직접 부를 때 `--tsconfig`를 빼면 뿌리의 설정을 읽어 **등불지기의 내용으로 오류 없이 뜬다**(예제는 플러그인 파일의 맨 위에서 이것을 잡아 던지고, 틀의 시험 도구는 첫 줄에서 별칭을 확인한다).
  - `vite`: 게임 폴더의 `vite.config.ts`의 `resolve.alias` (`games/deungbul/vite.config.ts`, `games/sample/vite.config.ts`). 어느 것을 쓸지는 `scripts/game.mjs`가 고른다.
- 별칭은 폴더를 넘을 때만 쓴다. 같은 폴더 안은 상대 경로다.
- 뿌리에 남은 것: `test/all.ts`(시험을 돌리는 도구), `scripts/`(`game.mjs` 게임 고르기, 배포 스크립트), `docs/`, `tsconfig*.json`, `package.json`, 그리고 git에 넣지 않는 `data/`(저장)와 `dist/`·`dist-sample/`(빌드).

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
| 기술 효과 | `g.combat.cast(p, id, target)`, `tickEffects`, `Ent.buffs`·`dots`·`stunUntil`. 강화는 `g.mods`의 보정으로 들어간다 | 기술 표(`SKILL_DEFS`)만 |
| 금칙어 | `addBannedWords`(`@engine/server`) | (쓰지 않는다) |
| 실행 | `startServer(port, { bots, store, game, staticDir })`, 그 절차를 묶은 `runServer({ port, db, dist, plugins })`(`engine/server/run.ts`) | `server/main.ts`: `runServer`에 규칙 플러그인(습격 간격은 `RAID_EVERY_MIN`을 읽어 넘긴다)과 폴더를 넘긴다. 예제도 같다 |

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
| 겉모습 | `Look`의 `ground, leaf, scenery`, `view.setMood`, `registerMonsterModel`·`registerBlade`·`registerArmor`, `registerHand`·`registerShot`, `setHumanoidDeco`·`setHumanoidBody`, `addNpc`, `setMerchant`, `addPlace` | `client/scene/*`, `client/deungbul.ts`, `client/hud/tower.ts` |
| 지도 | `setMapPaint`, `addMarks`(미니맵과 전체 지도), `addMapLabels`, `addMapPlaces`, `travelTo` | `client/scene/paint.ts`, `client/hud/marks.ts` |
| 메뉴 | `setMenuTabs`, `addMenuTab`, `openMenu` | (틀의 일곱 탭을 그대로 쓴다) |
| 창 | `engine/client/hud/shell.ts`의 `mountPanel(자리, html)`과 `SLOTS` | `client/markup.ts`, `client/deungbul.css` |
| 문장 | `koBase(names)`·`enBase(names)`, `mergeLocale`, `setLocales`, `LocaleExt`, `addNotices`, `addMsgSounds`. 이름표(`ContentNames`)의 `currency1`(없으면 골드)·`currency2`는 선택 칸 | `client/i18n/*`, `client/words.ts` |
| 상태 | `S` (틀의 칸만) | `client/state.ts`의 `GS`(공유), `G`(개인) |
| 뼈대 | `engine/client/hud/skeleton.ts`(마크업), `hud/shell.ts`의 `mountShell`(읽히는 때에 붙인다) | `client/index.html`의 머리와 script. body에는 script만 둔다 |
| 스타일 | `engine/client/style.css` (틀의 진입 모듈이 읽는다) | `client/deungbul.css` (틀의 것 뒤에 읽혀 덮어쓴다) |
| 빌드 | 개발 서버의 화면이 붙을 포트는 `VITE_DEV_PORT`(없으면 3001) | `games/deungbul/vite.config.ts`(`scripts/game.mjs`가 고른다): 뿌리 `games/deungbul/client`, 결과 `dist/`. 도감은 게임 빌드 뒤에 따로. 예제는 `games/sample/vite.config.ts`: 결과 `dist-sample/` |

### 시험

| | 틀 | 이 게임 |
|---|---|---|
| 자리 | `engine/test/boundary.test.ts`, `engine/test/fx/`(시험용 내용과 `all.ts`), `harness.ts` | `games/deungbul/test/이름.test.ts`, `all.ts`(목록), `game.ts`, `peer.ts`, `locale-snapshot.ts`, `fixtures/`. 예제는 `games/sample/test/`(`sample.test.ts`, `empty.test.ts`, `docs.test.ts`, `all.ts`). 게임의 시험은 그 게임의 `tsconfig.json`으로 따로 된 프로세스에서 돈다 |
| 게임 만들기 | `new Game()`, `startServer()` | `newGame()`, `startDeungbul()` |
| 명령 | `npm run test:engine`, 이름 앞에 `fx/` | `npm run test:game [-- 이름]`(`GAME`, 기본 등불지기), `npm run test:sample`, `test/all.ts`에서는 이름 앞에 `<게임>/` |
| 지키는 것 | 시험용 내용(`engine/test/fx/shared/content`) 위에서 돈다. 실행이 끝나면 `games/` 아래의 파일이 하나도 로드되지 않았는지 확인한다(`fx/틀만`) | |

방향을 지키는 검사:

- `engine/test/boundary.test.ts`(모든 게임에 맞는 규칙): 틀의 소스에 게임의 내용 id나 게임의 낱말이 문자열로 없는가, 타입 검사를 피하는 캐스팅이 늘지 않았는가, 층을 넘는 import(화면 → 서버 등)가 없는가, 게임이 틀을 입구로만 읽는가, 틀이 내용 통로 말고는 게임을 읽지 않는가.
- `games/deungbul/test/split.test.ts`(등불지기와 틀의 경계): 폴더·import의 방향, 확장 지점과 선언 병합, 틀의 언어·알림·소리 파일의 낱말, 화면 파일이 가져오는 이름, 뼈대와 스타일.
- `games/deungbul/test/baseline.test.ts`: 가르기 전과 같은가(맵 지문, 옮긴 수치, 저장 견본).
- 예제의 폴더는 예제의 시험(`games/sample/test/`)이 본다. `docs.test.ts`는 문서의 코드 조각이 예제의 파일과 같은지 본다.

## 3. 남은 일

틀 쪽에 남은 작은 일들. 급하지 않고, 실제로 걸릴 때 고친다. 새 게임을 만드는 차례와 자주 걸리는 곳은 [making-a-game.md](making-a-game.md)에 있다.

- **틀이나 계약을 고치면 예제도 함께 고친다.** `npm run typecheck`가 예제까지 검사하므로, 계약에 이름을 더하면 `engine/shared/defaults.ts`에 기본값을 두거나 `games/sample/shared/content/index.ts`에 그 이름을 더해야 통과한다. 문서의 코드 조각을 바꾸면 예제의 파일도 같게.
- **등불지기의 내용**도 `defaults.ts`를 받게 할 수 있다(같은 값이 두 곳에 있다). 값이 갈리기 전에 정하는 편이 낫다.
- **`vite`의 뿌리 밖 파일**: 틀의 코드가 뿌리(`games/<게임>/client`) 밖에 있어 `server.fs.allow`에 저장소 뿌리를 넣어야 하고, `index.html`의 `<link>`로는 뿌리 밖의 css를 개발 서버가 내주지 못한다(그래서 틀의 스타일은 틀의 진입 모듈이 import한다).
- **자동 이동은 지역 안에서만**: 들판에서 던전 안으로 곧장 가지 못하고 던전의 문까지 간다. 지역을 넘는 길(문을 지나 들어가기)은 아직 없다.
- **지도에 보이는 몬스터와 사람**은 서버가 보내 주는 내 둘레(시야 `AOI`)의 것뿐이다. 먼 곳은 사냥터 표식으로 대신한다.
- **강화를 쓰는 직업이 아직 없다**: 효과는 시험(`fx/skills`)으로 지키지만, 내 정보 창의 강화 표시는 실제 게임 화면에서 본 적이 없다.

### 틀에 남은 이 게임의 색

컴파일은 되지만 다른 게임에서는 어색할 수 있는 것들.

| 무엇 | 어디 | 메모 |
|---|---|---|
| 두 번째 재화 `sparks` | `Ent.sparks`, `PlayerSave`, `stat` 메시지, `MonsterDef.sparks`, `Reward.sparks`, `players.grant(p, exp, sparks)` | 계획서 7절: 일반화하지 않는다. 틀의 "두 번째 재화 한 가지"로 두고, 이름은 게임의 이름표(`currency2`)가 준다. 쓰지 않는 게임은 이름표에 적지 않으면 틀의 문장에서 빠진다 |
| 보정 이름 `sparkBonus` | `g.mods` | 이름만 |
| 장면의 하늘빛 | `engine/client/scene/view.ts`의 `SKY`(하늘과 안개의 처음 색) | css의 `--sky`는 문서의 바탕색일 뿐이고 장면의 하늘은 `view.setMood`로 바꾼다. 둘이 따로다 |
| 뼈대가 쓰는데 틀에 기본 문장이 없는 키 | `ui.intro`, `ui.classHint`, `ui.mapLegend` | 게임이 주지 않으면 빈 채로 뜬다(컴파일은 된다) |
| 개발 서버의 기본 포트 | `engine/client/net.ts` | `VITE_DEV_PORT`가 없으면 3001(등불지기의 포트)이다 |
| css에 박힌 색 | `engine/client/style.css` | 창의 바탕(`--ink-rgb`), 덮는 막, 금빛 단추 위 글자, 좋음·나쁨·파티원의 색은 변수가 됐다(2026-11-25. 예제는 갈색 바탕). 남은 것: 장비 등급의 색과 몇몇 옅은 색(그림자의 검정 등)은 변수가 아니다 |
| '마을로' | `actions.ts`의 `goToTown`, `input.ts`의 H 키, 문장 키 `goingTown` | 틀의 문장 키 이름이 '마을'을 말한다(문장은 게임이 덮어쓴다). 목적지는 `rules.home`(없으면 `MAP.spawn`) |
| 일일 임무의 종류 | `DailyKind`는 문자열이지만 주석이 이 게임의 `'offer'`를 든다 | 주석만 |
| 채널의 '바쁜 때' | `CHANNEL.tellBusyS`, `Channels.busy`, `channels` 메시지의 `foes` 칸 | 습격에서 온 개념이 중립 이름으로 남았다 |
| 틀의 문장 속 낱말 | `engine/client/i18n/ko.ts`·`en.ts` | 낱말 검사가 등불지기의 낱말을 막지만, 상점·대장간·물약·길드·거래소 같은 낱말은 틀의 것으로 남아 있다. 게임이 같은 키로 덮어쓴다 |
| 레벨과 우편 보상의 읽기 상한 | `players.ts`의 `LV_READ_MAX`(999), `mail.ts`의 `REWARD_MAX`(1e7) | 깨진 저장을 막는 틀의 상수. 넘는 게임이 나오면 올린다 |

## 4. 설정 파일

- `tsconfig.json`(뿌리): 편집기와 `scripts/`·`test/`를 위한 기본. `@game`은 등불지기, `include: ["engine", "games/deungbul", "test", "scripts"]`, `exclude: ["engine/test/fx"]`. 게임의 선언 파일(`games/deungbul/shared/deungbul.ts`)은 아무도 import하지 않고 `include`로 컴파일에 들어간다.
- `games/deungbul/tsconfig.json`, `games/sample/tsconfig.json`: 게임마다. 뿌리의 설정을 물려받아 `@game`만 자기 폴더로 바꾸고 `include`는 틀의 소스와 자기 폴더다. 서버·시험·도구는 이것으로 돈다(`scripts/game.mjs`가 고른다). `games/sample/tsconfig.engine.json`은 `include`를 틀의 소스로 줄인 것(틀만을 예제의 내용으로).
- `engine/test/fx/tsconfig.json`: 틀의 시험. `@game` → 시험용 내용. `include`는 틀의 소스, `harness.ts`, 그 폴더.
- `tsconfig.engine.json`: 틀만(`engine/shared`, `engine/server`, `engine/client`). `@game`은 등불지기의 내용.
- `games/<게임>/vite.config.ts`: `root`는 그 게임의 `client`, 결과는 등불지기 `dist/`, 예제 `dist-sample/`. 등불지기의 도감은 게임 빌드가 끝난 뒤 같은 `dist/`에 따로 빌드한다.
- `package.json`: 서버·화면·시험의 스크립트는 `scripts/game.mjs <start|watch|client|build|test> [게임]`을 부른다(인자, 없으면 `GAME`, 없으면 `deungbul`). `typecheck`는 여섯 설정을 차례로. 예제: `typecheck:sample, typecheck:engine:sample, test:sample, build:sample, start:sample, dev:sample`(포트 3002, 저장 `data/sample/game.db`).

## 5. 운영 서버에 올릴 때

1. `npm run typecheck`, `npm test`(두 번), `npm run test:engine`, `npm run build`가 모두 통과한 뒤에 커밋한다.
2. 화면이 바뀌었으면 확인용 서버(`PORT=3013 DB=<임시 폴더>/check.db npm start`)를 띄워 PC·폰, 한국어·영어로 본다. 운영 서버(3001)에는 시험 캐릭터를 만들지 않는다(확인은 손님으로만).
3. 서버 코드가 바뀌었으면 `data/game.db`를 `data/backup/`에 복사하고 `bash scripts/restart.sh <로그>`(저장하고 끈 뒤 다시 띄운다. 터널은 끊지 않는다). 로그에서 저장 파일의 경로와 '자리 비움 사냥을 이어 갑니다'(그때 사냥 중이던 사람이 있으면)를 본다.
4. 화면은 `bash scripts/publish.sh`. 공개 주소 둘이 200인지 본다.
5. 서버를 끄는 깃발 `stop.flag`는 **저장 파일의 옆**에 놓인다. 확인용 서버는 DB마다 폴더를 따로 주거나 `DB=memory`로 띄우고 프로세스를 포트로 찾아 직접 끈다(운영의 3001은 건드리지 않는다).
6. 되돌리기: `git revert` 뒤 `npm run build`와 `bash scripts/restart.sh`. 저장 형식은 가르는 동안 바뀌지 않았으므로 저장 파일에 손댈 것이 없다(백업으로 되돌릴 수도 있다).
