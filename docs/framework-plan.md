> **기록: 그때의 상태** (틀과 게임을 가르기 전의 계획, 2026-11-23~24). 지금 대응하는 문서: [framework-status.md](framework-status.md), [making-a-game.md](making-a-game.md), 문서 지도 [README.md](README.md).
>
> 틀과 게임을 가르기 전에 세운 계획이다. 파일 경로와 세부는 그때의 것이고, 계획은 0~13단계로 모두 이루어졌다. 지금의 상태와 남은 일은 [framework-status.md](framework-status.md)에, 새 게임을 만드는 법은 [making-a-game.md](making-a-game.md)에 있다(2026-11-25 현행화).

> **그 뒤 (2026-11-26, 가지 `feat/neutral`)**: 이 계획이 만든 틀은 "쿼터뷰 탭 타깃 RPG 전용 틀"이었다(계약의 이름이 모두 RPG 개념, 시스템 24개가 늘 돈다). 그 뒤 틀을 **장르와 무관한 핵심 + 선택 모듈 열여섯**으로 다시 짰다: 내용 계약을 핵심(MAP, MODULES)과 모듈마다의 선택 계약으로 쪼개고, 서버·화면이 고른 모듈만 만들고, 게임이 엔티티 종류를 등록한다. 아래의 '틀'은 그 전의 모양이다. 지금의 짜임은 [framework-status.md](framework-status.md)의 '장르 중립 틀'과 [making-a-game.md](making-a-game.md) 1절.

> 기준 커밋 d090317, 조사 시점 이후 harden(서버 악용 방지)과 ux(화면 정리) 브랜치가 합쳐졌으므로 파일·심볼의 세부는 달라졌을 수 있다.

# 등불지기 프레임워크화 조사 보고

코드를 틀과 게임으로 나누는 일은 가능하고, 서버 쪽은 이미 거의 떼어져 있습니다. 남은 결합은 클라이언트와 "게임 칸이 틀의 자료형에 박힌 것"에 몰려 있습니다. 조사 기준은 복사본 `%TEMP%\dg-work\fw-audit`(커밋 `d090317`)이고, 실험은 `fw-audit-try`에서만 했습니다. 원본 `C:\gamedev`와 복사본 소스는 고치지 않았습니다.

표시: **[실험]** 은 실제로 돌려 확인한 것, **[읽음]** 은 코드를 읽고 판단한 것, **[grep]** 은 검색 결과만 본 것입니다.

---

## 1. 한눈에

### 실험 수치 [실험]

| 단계 | 결과 |
|---|---|
| 기준선 | `tsc` 오류 0, `npm test` 검사 423개 모두 통과 (테스트 파일 20개) |
| 규칙 시스템 5개와 내용 정의 4개를 지움 (`game.ts`, `defs.ts`에서 해당 줄 제거) | `tsc` 오류 **99개, 파일 27개, 원인 묶음 11개** (서버·공용 9개, 클라이언트 34개, 테스트 56개) |
| 서버·공용을 고침 (파일 7개, 고친 곳 9군데) | 서버·공용 `tsc` 오류 **0**. `new Game()`이 만들어지고 200틱이 돈다. 공유 상태는 `{}`, 월드 저장 칸은 `mailbox, rank, market, guilds` |
| 그 상태에서 테스트를 고치지 않고 돌림 | **212 / 423 통과**. 온전히 통과한 파일 7개: move 3, monsters 3, growth 21, build 13, market 74, guild 22, dungeon 18 |
| 테스트 세 곳만 손봄 (`harness.ts` 한 줄, `channel.test.ts`의 습격·보스 블록 삭제, `nav.test.ts`의 퀘스트 목적지 검사 삭제) | **272 / 423 통과**. security 23/23, channel 43/59, nav 8/9 |
| 클라이언트: `WorldState`를 넓힌 뒤 | 오류 62개, 파일 12개 (`hud/panels.ts`가 29개) |
| 클라이언트: `hud/quest.ts`, `hud/marks.ts`, `scene/scenery.ts`까지 지움 | 오류 59개, 파일 12개. 고치지는 않았고 브라우저로도 확인하지 않았다 |

- 부분 통과: party 16/17, shop 8/14, classes 6/7, combat 9/14, boss 5/9.
- import나 `g.tower`에서 죽어 0개: craft, keepers, quests, zone2, server.
- `tsc`가 잡지 못하는 결합이 더 많습니다. 불씨·기여·휴식·퀘스트 칸은 틀의 자료형에 그대로 남아 컴파일은 통과합니다. 3절의 묶음 12~17입니다.

### 가장 큰 결합 다섯 가지

1. **게임의 칸이 틀의 자료형에 박혀 있다.** `Ent`(`sparks, contrib, tier, rested, qc/qs/qn, questDirty, raid`), `PlayerSave`, `ServerMsg`의 `stat`·`quest`, `WorldState`, `MsgKey`, `Hooks`(`offered, residentReturned, raidWon`)가 그렇습니다. 지워도 컴파일은 되지만 틀이 게임의 낱말을 압니다.
2. **맵 정의가 계약과 내용이 한 파일이다.** `shared/world.ts`의 `buildWorld`가 `POND, TOWERS, HOUSES, PILLARS`를 이름으로 읽습니다. 클라이언트의 `scene/view.ts`(땅 색)와 `hud/minimap.ts`(바탕)는 `TOWERS, onPath, POND, ZONE_SPLIT`을 직접 읽습니다.
3. **틀이 내용을 직접 import한다.** `shared/defs.ts`를 거쳐 60여 곳에서 가져옵니다. 내용 파일 안에서는 틀의 타입·도우미와 이 게임의 수치가 한 파일에 있습니다 (`growth.ts`, `social.ts`, `combat.ts`, `items.ts`, `monsters.ts`, `dungeons.ts`).
4. **클라이언트의 바탕 화면이 게임과 한 덩어리다.** `hud/panels.ts`는 내 정보·기술 단추·접속 화면과 등탑 창·습격 알림·구역 배너가 한 파일입니다. `index.html`은 마크업 전부, `state.ts`의 `S.world`·`stage()`, `entities.ts`의 `syncNpcs`·`speedFor(stage())`, `main.ts`의 `initQuest/questFrame/renderForge` 직접 호출도 같습니다.
5. **언어 파일과 테스트.** `ko.ts`·`en.ts`는 `Locale` 객체 하나이고 `ResidentId`, `QuestId`로 타입이 묶여 있습니다. 틀 테스트는 `g.tower.load(...)`, `TOWER` 좌표, `'slime'`, `SHOP`에 기대고, `test/harness.ts`의 `Peer`가 `m.s.tower.glow`를 읽습니다.

서버 시스템끼리의 결합은 이미 얕습니다. 틀 시스템이 게임 시스템을 직접 부르는 곳은 `channels.ts`의 `g.raid` 세 군데뿐입니다 [실험].

---

## 2. 파일 분류표

판단 기준은 "등탑·불씨·주민이 없고 맵·몬스터·직업이 다른 사냥 게임에서 그대로 쓸 수 있는가"입니다. 기호는 틀 / 게임 / 섞임입니다.

### 서버

| 파일 | 분류 | 섞인 곳 (심볼) | 근거 |
|---|---|---|---|
| `server/main.ts` | 섞임 | `RAID_EVERY_MIN` → `GameOptions.raid`. `dist`·`data` 경로를 저장소 뿌리 기준으로 셈 | 실험 |
| `server/net/server.ts` | 섞임 | `flush`의 `stat`(sparks, contrib, rested, tier)와 `quest` 전송, `savePlayer`의 `touched`(sparks, qc/qs/qn), `join`의 `'Keeper'` 이름과 `kept.questDirty`, `dist` 경로 계산 | 읽음 |
| `server/net/snapshot.ts` | 틀 (약한 섞임) | `snapshotFor`의 `if (e.raid) info.r = 1` | 읽음 |
| `server/net/moderation.ts`, `static.ts` | 틀 | 금칙어 목록은 언어에 달렸지만 게임과 무관 | grep |
| `server/store/types.ts` | 섞임 | `PlayerSave`의 `sparks, contrib, quest, rested, tier` | 읽음 |
| `server/store/memory.ts`, `sqlite.ts`, `index.ts` | 틀 | JSON 덩어리로 저장하므로 칸을 옮겨도 스키마는 그대로 | grep |
| `server/game/game.ts` | 섞임 | 시스템 필드와 생성자, `Hooks`의 `offered/residentReturned/raidWon`, `GameOptions.raid`, `importWorld`의 `legacy && s.name === 'tower'`, `create`의 초기값, `ModName`의 `'sparkBonus'`, `shared`의 `name: keyof WorldState` | 실험·읽음 |
| `server/game/entity.ts` | 섞임 | `Ent`의 게임 칸 (4절 표) | 읽음 |
| `server/game/layers.ts` | 틀 | | 읽음 |
| `systems/movement.ts`, `combat.ts`, `classes.ts`, `away.ts`, `party.ts`, `build.ts`, `gear.ts`, `market.ts`, `rank.ts` | 틀 | 서로를 직접 부름(`g.build.skillScale`, `g.party.share`, `g.gear.acquire`). 틀 안의 결합이라 그대로 둠. `gear.ts`는 `def.boss`이면 반드시 떨어뜨림 | 읽음·grep |
| `systems/players.ts` | 섞임 | `spawn`의 퀘스트 복원(`QUESTS`, `goalCount`), `sparks/contrib/tier/rested` 읽기, `export`, `monsterKilled`의 휴식 보너스(`REST`), `grant(p, exp, sparks)` | 실험 |
| `systems/monsters.ts` | 틀 (습격 몹 개념 포함) | `raid` 인자, `atTower`, `TOWER_ATTACK_RANGE`, `g.rules.siege`, `def.boss`이면 `bossUp` 알림, `m.windup` | 읽음 |
| `systems/shop.ts` | 틀 | `stocked`는 `g.rules.unlocked`를 거침 | 읽음 |
| `systems/craft.ts` | 틀 (약한 섞임) | `SMITH`, `SMITHY`: 대장간이 하나이고 주민 id로 잠김 | 실험 |
| `systems/mail.ts`, `idle.ts` | 틀 (약한 섞임) | `Reward.sparks`, `players.grant(p, exp, sparks)` | grep |
| `systems/daily.ts` | 섞임 | `g.on('offered', ...)`, `DailyKind`의 `'offer'` | 읽음 |
| `systems/dungeon.ts` | 틀 | `g.rules.respawn`을 감싸고 `g.daily.roll`, `g.mail`, `g.gear`를 부름 | grep |
| `systems/channels.ts` | 섞임 | `foes()`와 `tick()`의 `g.raid.phase`, `g.raid.foesAt` | 실험 |
| `systems/guild.ts` | 틀 | `server/net/moderation`을 import: README의 "game은 net을 모른다"에 어긋남 | grep |
| `systems/bots.ts` | 틀 (약한 섞임) | `think`의 돌아다닐 범위 `MIN_X/MAX_X`, z ±42가 맵에 박힘 | 읽음 |
| `systems/tower.ts`, `raid.ts`, `keepers.ts`, `quests.ts` | 게임 | | 읽음 |
| `systems/boss.ts` | **범용 규칙** | 이 게임의 id를 하나도 모른다(`def.boss`, `BOSS` 수치만). 지워도 `tsc` 오류 0 | 실험 |

보스는 틀의 "켜고 끄는 표준 시스템"으로 올리기를 권합니다. 잿빛 트롤이라는 내용만 게임의 것입니다.

### 공용

| 파일 | 분류 | 섞인 곳 |
|---|---|---|
| `shared/sim.ts`, `nav.ts` | 틀 | `world.ts`를 거쳐 `AREAS, EDGE, GRID`를 읽음 |
| `shared/world.ts` | 섞임 | `buildWorld`가 `POND, TOWERS, HOUSES, PILLARS, PORTALS, SCATTER, isFree`를 이름으로 읽음. `export * from './content/map'` |
| `shared/auto.ts` | 섞임 | `pickPotion`의 `'tonic'`, `'potion'`. `AUTO`, `AWAY` 수치 |
| `shared/protocol.ts` | 섞임 | `WorldState`, `stat`, `quest`, `offer`, `EnterInfo.r`, `channels.foes`. `content/growth`, `social`, `raid`에서 타입을 import |
| `shared/messages.ts` | 섞임 | `MsgKey` 111개 가운데 20여 개가 게임 것 (`offered, stageChanged, towerLit, residentBack, raid*, quest*, tierUp, rested, towerFull, noResident, offerFar, noSparks, forgeClosed`) |
| `shared/defs.ts` | 통로 | 내용을 통째로 다시 내보냄 |
| `content/map.ts` | 섞임 | 틀의 계약: `AREAS, areaAt, GRID, EDGE, PORTALS, PILLARS, SCATTER, MAP_SEED`. 게임: `TOWERS, TOWER, TOWN, POND, HOUSES, CLEARINGS, ZONE_*, zoneOf, onPath, isFree` |
| `content/combat.ts` | 섞임 | 틀: `SkillEffect, SkillDef, ClassDef, classOf, maxHpFor, handOf`. 게임: `SKILL_DEFS, CLASSES, SPAWN, DEFAULT_CLASS` |
| `content/monsters.ts` | 섞임 | 틀: `MonsterDef`(단 `sparks` 칸), `BOSS`. 게임: `MONSTERS, CAMPS` |
| `content/items.ts` | 섞임 | 틀: `ItemDef, nearShop`. 게임: `ITEMS, SHOPS, SHOP`, `needs?: ResidentId`, `REST`, `restGain` |
| `content/craft.ts` | 섞임 | 틀: `Recipe`. 게임: `RECIPES, DROPS, SMITH, SMITHY` |
| `content/growth.ts` | 섞임 | 틀: `Gear, Reward, Mail, MailKind, DailyState, RankRow, baseOpt, gearScore, mailKept` 등. 수치: `STATS, RARITIES, GEAR(weaponFor의 'sword1'~'sword4'), ENHANCE, BUILD, IDLE, DAILIES(offer10), ATTEND` |
| `content/social.ts`, `party.ts` | 섞임 | 틀: `GuildView, MarketItem, marketFee, MARKET_FILTERS`. 수치: `CHANNEL, GUILD, MARKET, PARTY`. `CHANNEL.tellRaidS`는 습격 낱말 |
| `content/dungeons.ts` | 섞임 | 틀: `DungeonDef, runKey, PORTAL_REACH`. 게임: `DUNGEONS` |
| `content/tower.ts`, `raid.ts`, `residents.ts`, `quests.ts` | 게임 | |

### 클라이언트

| 파일 | 분류 | 섞인 곳 |
|---|---|---|
| `net.ts`, `bus.ts`, `modules.ts`(목록), `app.ts`, `social.ts`, `fx.ts`, `hud/tags.ts`, `hud/chat.ts`, `hud/party.ts`, `hud/channel.ts`, `hud/classes.ts`, `hud/bag.ts`, `hud/dungeon.ts` | 틀 | `modules.ts`의 `initMarks`만 게임 것. `fx.ts`의 `sparks`는 불티 입자라 무관. `hud/channel.ts`의 "적 N" 표시는 습격에서 옴 |
| `main.ts` | 섞임 | `onMsg('stat')`의 `sparks/contrib/rested/tier`, `onMsg('quest')`, `onMsg('world')`의 `syncNpcs/renderWorld`, `initQuest/questFrame/renderQuest`, `spawnMerchant`, 프레임 루프와 250ms 주기에 박힌 `shopSlow/forgeSlow/classSlow` |
| `state.ts` | 섞임 | `S.world` 초기값(`GLOW_START, TOWERS, RESIDENTS`), `S.quest`, `Me`의 `sparks/contrib/rested/tier`, `Remote.raid`, `myZone, zoneGlow, stage, raidLeft`, `inDungeon`의 `'field'` |
| `entities.ts` | 섞임 | `syncNpcs`(주민), `spawnMerchant`(`TOWERS[s.tower]`), `monsterName`의 `raidFoe`, 꼬리표 `'mon raid'`, 예측 걸음의 `speedFor(stage())`, `'slam'` 이펙트와 `BOSS` |
| `actions.ts` | 섞임 | `offer()`, '마을로'의 `TOWN`, 물약 고르기의 `'tonic'/'potion'` |
| `auto.ts`, `input.ts`, `sound.ts` | 틀 (약한 섞임) | `input.ts`가 `goToQuest`를 import. `sound.ts`의 `questDone, raidWon, residentBack, raidStart, raidLost` 대응표 |
| `hud/panels.ts` | 섞임 (가장 심함) | 틀: `showGate, hideGate, setMyName`, 기술 단추, 이름 바꾸기, 언어 선택, `hudFrame`. 게임: `renderWorld` 전부, `hudSlow`의 습격·구역 배너·등탑 창, `initPanels`의 바치기 단추 |
| `hud/notify.ts` | 섞임 | `residentHint`, 안내문 분류표의 게임 종류 |
| `hud/shop.ts`, `hud/forge.ts` | 섞임 | 잠금을 `S.world.tower.residents`로 직접 판정 (`residentIndex`, `open`) |
| `hud/menu.ts` | 틀 (약한 섞임) | `rewardText`의 `r.sparks` |
| `hud/minimap.ts` | 섞임 | 바탕 그림의 `ZONE_SPLIT, POND`, `COLOR.forest/pond/tower`, `MARK.lit/dark/quest` |
| `hud/near.ts` | 섞임 | `PLACES`의 `tower, shop, forge` |
| `hud/quest.ts`, `hud/marks.ts`, `scene/scenery.ts` | 게임 | `marks.ts`의 상인·문 표식은 틀로 올릴 수 있음 |
| `scene/view.ts` | 섞임 | 땅 색칠(`TOWERS, onPath, POND, ZONE_SPLIT`), 구역별 잎 색, `setTowerGlow`, `setMood(stage, raid, dark)`, `goalBeam` |
| `scene/models.ts` | 섞임 | 틀: `makeHumanoid, animate, setFlash, part, mat`. 게임: `makeMonster`의 종류별 분기, `BLADES`의 `sword1~4`, `setArmor` |
| `i18n/index.ts` | 틀 | `LOCALES = [ko, en]`를 직접 import |
| `i18n/ko.ts`, `en.ts` | 섞임 | 한 객체. 어림으로 `ui` 128개 가운데 14개, `fmt` 71개 가운데 12개, `msg` 111개 가운데 19개에 게임 낱말이 있고 `residents, towers, zones, stages, quests`는 통째로 게임 것 [grep] |
| `index.html` | 섞임 | `#tower`, `#villageBox`, `#keepBox`, `#quest`, `#goalArrow`, `#raid`, `#towerMini`, `#raidMini`, `#contrib`, `#rested`, `#sparks`, `#townBtn`, `<title>` |
| `style.css` | 섞임 | `#quest` 22곳, `#tower` 18곳, `#raid` 7곳 등 [grep] |
| `public/` | 게임 | 아이콘, manifest |

### 테스트 (기준선 검사 수)

| 파일 | 분류 | 게임에 기대는 곳 | 틀만으로 [실험] |
|---|---|---|---|
| move 3, monsters 3, growth 21, build 13, market 74, guild 22, dungeon 18 | 틀 | 내용 id와 좌표(`TOWER, POND`, 집 좌표 `-9,9`, `'slime'`, `DUNGEONS.crypt`)만 | 전부 통과 |
| security 23 | 틀 | `harness.ts`의 `Peer`가 `m.s.tower.glow`를 읽어 죽음 | 14, 한 줄 고치면 23 |
| nav 9 | 틀 + 게임 1 | 퀘스트 목적지 검사(`QUESTS, TOWER_REACH`) | 블록을 빼면 8 |
| channel 59 | 틀 43 + 게임 16 | 습격 블록(`g.raid, g.tower, RAID`), 보스 블록(`ash_troll, BOSS`) | 블록을 빼면 43 |
| party 17 | 틀 16 + 게임 1 | "퀘스트 진행도 함께 오른다" | 16 |
| combat 14 | 틀 | "등탑에서 멀면 직업을 못 바꾼다"가 등탑 규칙이고, 뒤의 검사 5개가 줄줄이 실패 | 9 |
| classes 7 | 틀 + 게임 1 | "브람이 돌아오기 전에는 쇠 갑옷이 없다", `SHOP` | 6 |
| shop 14 | 섞임 | `g.tower.load({residents})`, `REST`, `restGain` | 8 뒤에 죽음 |
| boss 9 | 범용 규칙 | `MONSTERS.ash_troll`, `ZONE_SPLIT` | 5 (보스 시스템을 뺐으므로) |
| craft 9 | 틀인데 죽음 | `RESIDENTS` import, `g.tower.load` | 0 |
| keepers 10, quests 17, zone2 15 | 게임 | | 0 |
| server 66 | 섞임 | 통합 테스트 한 파일에 접속·이동·저장·자리 비움과 등탑·퀘스트·습격이 섞임. `FORGE, GLOW_START, RAID, nextRaidAt` | 0 |
| `harness.ts` | 섞임 | `Peer`의 `sparks, contrib, glow, residents, raid, quest` | |
| `load.ts`, `load-clients.ts` | 섞임 | `server.game.raid.start()` | |

---

## 3. 결합 목록 (원인 묶음별)

### `tsc`가 잡은 것 (묶음 1~11) [실험]

| # | 결합 | 오류 수 | 후보 | 권하는 해법 |
|---|---|---|---|---|
| 1 | `channels.ts`의 `foes()`, `tick()` → `g.raid.phase`, `g.raid.foesAt` | 3 | (a) `Channels.extraFoes?: () => number[] \| undefined`를 두고 습격이 채움 (b) 사건으로 뒤집기 (c) `g.rules`에 추가 | **(a)**. 실험에서 세 줄로 됐다. `CHANNEL.tellRaidS`는 `tellBusyS` 같은 중립 이름으로 |
| 2 | `game.ts`의 `GameOptions.raid: Partial<RaidConfig>`, `main.ts`의 `RAID_EVERY_MIN` | 2 | (a) 플러그인 목록을 받고 설정은 플러그인 생성 인자로 (b) `opts.ext: Record<string, unknown>` | **(a)** `GameOptions.plugins`. `RAID_EVERY_MIN`은 게임의 `main.ts`가 읽는다 |
| 3 | `players.ts`의 `spawn`이 `QUESTS`, `goalCount`로 퀘스트 진행을 복원 | 2 | (a) `Quests`가 `g.saves`에 등록하고 옛 칸을 읽는 길을 둠 (b) 그대로 두고 타입만 넓힘 | **(a)**. 저장 호환은 6절 |
| 4 | `items.ts`의 `needs?: ResidentId`, `craft.ts`의 `SMITH`, `SMITHY = RESIDENTS[0]` | 2 (+클라이언트 연쇄) | (a) `needs?: string`(잠금 열쇠), 대장간은 `FORGES: {x, z, needs?}[]` (b) 제네릭으로 열쇠 타입을 넘김 | **(a)**. 열쇠의 오타는 게임 쪽에서 `needs: 'bram' satisfies ResidentId`로 잡는다 |
| 5 | `protocol.ts`의 `WorldState` 고정 모양과 `RaidPhase` import, `game.ts`의 `shared: { name: keyof WorldState }` | 2 (+클라이언트 `S.world.*` 약 10) | (a) 빈 `interface WorldState {}`를 게임이 선언 병합으로 채움 (b) `Record<string, unknown>` | **(a)**. 타입이 남는다. (b)는 실험에서 클라이언트 읽기가 전부 `unknown`이 됐다 |
| 6 | 클라이언트의 주민을 통한 잠금: `hud/shop.ts`의 `residentIndex`, `hud/forge.ts`의 `open`, `hud/notify.ts`의 `residentHint`, `entities.ts`의 `syncNpcs` | 11 | (a) 클라이언트 규칙 `rules.unlocked(key)`, `rules.lockNote(key)`를 게임이 채움 (b) 서버가 잠금 상태를 따로 보냄 | **(a)**. 서버의 `g.rules`와 짝이 맞고 프로토콜이 안 바뀐다. `syncNpcs`는 게임 모듈로 옮기고 틀에는 `addNpc(x, z, model, name)`만 둔다 |
| 7 | 등탑 밝기 단계 → 속도 예측과 분위기: `state.ts`의 `stage/zoneGlow/myZone`, `entities.ts`의 `speedFor(stage())`, `view.ts`의 `setMood(Stage, …)`, `scenery.ts`의 `stageOf` | 8 | (a) 클라이언트 `rules.speed()`와 `view.setMood({fog, sky, light})` (b) 서버가 속도를 보냄 | **(a)**. 예측식이 서버와 같은 공유 함수를 쓰는 지금 방식을 지킨다 |
| 8 | `hud/panels.ts`: 바탕 HUD와 등탑 창·습격 알림이 한 파일 | 9 (넓힌 뒤 29) | 파일 쪼개기 | `hud/me.ts`(틀: 접속 화면, 내 정보, 기술 단추, 대상 창)와 게임의 `hud/tower.ts`, `hud/raid.ts`, `hud/zone.ts`로. 게임 것은 `bus.onMsg('world')`, `bus.onSlow`로 스스로 등록 |
| 9 | 퀘스트 화면이 바탕에서 직접 불림: `main.ts`의 `initQuest/questFrame/renderQuest`, `input.ts`의 `goToQuest`, `modules.ts`의 `initMarks`, `view.goalBeam` | 7 | (a) 버스에 스스로 등록하고 단축키도 `onKey('f', fn)`으로 (b) 그대로 | **(a)**. 같은 손질로 `shop`, `forge`, `classes`의 직접 호출(`renderShop, shopSlow, forgeSlow, classSlow`)도 버스로 옮겨 `main.ts`를 틀로 만든다 |
| 10 | 언어 파일: `ko.ts`, `en.ts`가 `QuestId`, `ResidentId`를 import하고 `Locale`이 한 덩어리 | 4 | 4절 "언어 파일" | 틀의 바탕 문장 + 게임 문장을 합치는 방식 |
| 11 | 테스트: `g.tower`, `g.raid`, `RAID`, `QUESTS`, `RESIDENTS`, `FORGE`, `harness.ts`의 `Peer` | 56 | 6절 단계 10 | 게임 테스트를 게임 폴더로. 틀 테스트의 "주민이 돌아온 상태"는 `g.rules.unlocked = () => true`로 바꾼다 |

### `tsc`가 잡지 못한 것 (묶음 12~17) [읽음·grep]

| # | 결합 | 어디 | 권하는 해법 |
|---|---|---|---|
| 12 | 틀의 자료형에 박힌 게임 칸 | `Ent`, `PlayerSave`, `ServerMsg`의 `stat`·`quest`, `ClientMsg`의 `offer`, `MsgKey`, `Hooks`, `EnterInfo.r` | 4절의 확장 지점(선언 병합) |
| 13 | 불씨가 보상 전반에 엮임 | `MonsterDef.sparks`, `Reward.sparks`, `players.grant(p, exp, sparks)`, `mail.ts`의 `claim`, `IDLE.reward`, `ATTEND`, `DUNGEONS.crypt.reward`, `'kill'`과 `'mailGot'`의 값, `ModName`의 `'sparkBonus'`, `fmt.reward` | **이번에는 일반화하지 않는다.** 틀에 "두 번째 재화 한 가지"로 남기고 `MonsterDef.sparks`를 선택 칸으로 바꾼 뒤, 화면 표시(`#sparks`, `fmt.sparks`)만 게임으로 옮긴다. 이유는 7절 |
| 14 | 휴식 보너스 | `players.ts`의 `monsterKilled` 처리(`p.rested`), `spawn`의 `restGain`, `items.ts`의 `REST` | 틀의 표준 시스템 `rest.ts`로 뗀다. 자기 저장 칸, 자기 안내문, 처치 경험치에 덧붙는 값은 `g.killBonus.push((p, m) => n)` 같은 목록 하나 |
| 15 | 맵 | `world.ts`의 `buildWorld`, `view.ts`의 땅 색칠, `minimap.ts` 바탕, `bots.ts` 범위, `actions.ts`의 `TOWN`, `state.ts`의 `'field'` | `MAP: MapDef` 계약 (4절) |
| 16 | 틀 코드에 박힌 내용 id | `shared/auto.ts`의 `pickPotion`, `actions.ts`의 물약 순서, `server.ts`의 `'Keeper'`, `models.ts`의 `makeMonster`와 `BLADES`, `entities.ts`의 `'slam'` | 물약은 `ITEMS`에서 `kind === 'potion'`인 것을 회복량 순으로. 이름 머리말은 내용의 `GUEST_NAME`. 모델은 게임이 `registerMonsterModel(type, fn)`, `registerWeaponLook(id, look)`로 등록. `'slam'`은 보스가 틀이면 그대로 |
| 17 | 틀 시스템이 게임의 사건을 구독 | `daily.ts`의 `g.on('offered')`, `Hooks`의 세 사건 | `Daily.add(p, kind, n)`은 이미 공개돼 있으니 등탑 시스템이 직접 부른다. `DailyKind`는 `string`. 세 사건은 게임이 `Hooks`에 병합으로 더하고, `Game`의 `hooks`는 이름을 미리 나열하지 않고 처음 `on` 할 때 만든다 |

### `g.tower / g.raid / g.quests / g.keepers / g.boss` 직접 호출 전체 [grep]

| 방향 | 곳 |
|---|---|
| 틀 → 게임 | `channels.ts`의 `foes()`와 `tick()` (`g.raid.phase` 두 번, `g.raid.foesAt` 한 번). 이것뿐 |
| 게임 → 게임 | `keepers.ts`의 `open`(`g.tower.returned('halmeom')`), `raid.ts`의 `start`(`g.tower.glow`)와 `finish`(`g.tower.changeGlow`) |
| 게임 → 틀 (정상 방향) | `raid.ts`가 `g.monsters.asleep/spawn/atTower`, `g.players.grant`. `quests.ts`가 `g.players.grant`. `boss.ts`가 `g.combat.damage`. `tower.ts`가 `g.rules.*`, `g.mods`, `g.shared`, `g.worldSaves` |
| 통신 계층 → 게임 | 직접 호출은 없고 `flush`가 `me.qc/qs/qn/questDirty/sparks/contrib/rested/tier`를 읽음 |
| 테스트 | `g.tower` 9곳, `g.raid`와 `game.raid` 25곳 안팎 (channel, keepers, zone2, quests, craft, shop, server, load) |
| `g.quests`, `g.keepers`, `g.boss` | 밖에서 부르는 곳 없음 |

---

## 4. 목표 구조

### 폴더 구조: 세 후보

| 안 | 모양 | 장점 | 단점 |
|---|---|---|---|
| **A (권함)** | `engine/{shared,server,client,test}` + `games/deungbul/{content,shared,server,client,test}` + `games/sample/…` | 소유가 폴더 하나로 보인다. 두 번째 게임이 같은 모양으로 들어간다. "틀은 `games/`를 import하지 않는다"를 검색 한 줄로 검사한다 | 거의 모든 파일이 옮겨지고 설정을 고친다 |
| B | 지금 최상위를 두고 안에서 가름 (`server/core`와 `server/game`, `shared/core`와 `shared/content`, `client/src/core`와 `client/src/game`) | 옮기는 것이 적다 | 한 게임이 세 곳에 흩어진다. 두 번째 게임의 자리가 어색하다 |
| C | npm 워크스페이스 (`packages/engine`, `packages/game-*`) | 공개 표면을 `exports`로 강제한다 | 지금 필요한 것보다 도구가 는다. A에서 나중에 옮길 수 있다 |

A안의 모양:

```
engine/
  shared/   world.ts sim.ts nav.ts auto.ts protocol.ts messages.ts
            ext.ts                 확장 지점 (게임이 선언 병합으로 넓히는 interface만)
            defs/                  타입과 도우미: combat monsters items craft gear mail social dungeon map
            defaults.ts            수치 기본값 (GEAR ENHANCE BUILD IDLE RANK MAIL_MAX CHANNEL GUILD MARKET PARTY BOSS AUTO AWAY)
            contract.ts            게임 내용이 갖춰야 하는 export의 목록(타입)
            index.ts               공개 표면
  server/   main.ts(runServer) net/ store/ game/{game.ts,entity.ts,layers.ts,ext.ts,systems/…} index.ts
            systems: 지금의 틀 20개 + boss.ts + rest.ts
  client/   start.ts(startClient) bus.ts net.ts state.ts entities.ts actions.ts auto.ts fx.ts input.ts sound.ts
            hud/{shell.ts,me.ts,chat,tags,bag,menu,minimap,party,channel,classes,shop,forge,dungeon,notify,near}
            scene/{view.ts,models.ts}  i18n/{index.ts,ko.ts,en.ts}  style.css  index.ts
  test/     틀 테스트 + boundary.test.ts
games/deungbul/
  content/  index.ts map.ts combat.ts monsters.ts items.ts craft.ts dungeons.ts numbers.ts
  shared/   tower.ts raid.ts residents.ts quests.ts ext.d.ts
  server/   main.ts install.ts systems/{tower,raid,keepers,quests}.ts
  client/   index.html main.ts state.ts hud/{tower,raid,quest,zone,marks}.ts scene/{scenery,models,ground}.ts
            i18n/{ko,en}.ts style.css public/
  test/     keepers quests zone2 raid-channel server-game
  tsconfig.json
games/sample/   (5절)
docs/making-a-game.md
```

### 빌드 설정

- **경로 별칭 둘**: `@engine/*` → `engine/*`, `@game/*` → 고른 게임 폴더. 게임마다 `tsconfig.json`이 `paths`를 정합니다.
- **[실험]** `tsx --tsconfig <게임>/tsconfig.json`과 `tsc -p <게임>` 모두 별칭을 따라가고, 게임 b에서 게임 a의 id를 쓰면 컴파일 오류가 납니다. 이 TypeScript 버전은 `baseUrl` 없이 `paths`가 tsconfig 위치 기준입니다. Vite의 `resolve.alias`는 돌려 보지 않았습니다.
- **`package.json` 스크립트**: 이름은 그대로 둡니다(`scripts/restart.sh`가 `npm start`를, `scripts/pilot.mjs`가 `npm run build`와 `dist/`를 씁니다).
  - `start`: `tsx --tsconfig games/deungbul/tsconfig.json games/deungbul/server/main.ts`
  - `typecheck`: `tsc -p games/deungbul && tsc -p games/sample && tsc -p engine`
  - `test`: 틀 테스트 → 등불지기 테스트 → 예제 테스트
  - 새로: `start:sample`, `build:sample`, `test:engine`
- **`vite.config.ts`**: `GAME` 환경 변수(기본 `deungbul`)로 `root: games/<GAME>/client`, 별칭 둘, `outDir`은 등불지기는 지금처럼 `dist/`, 예제는 `dist-sample/`.
- **`server.ts`**: `startServer`의 `dist` 경로(`import.meta.url` 기준 `'..','..','dist'`)를 `Options.staticDir`로 받습니다. 폴더를 옮기면 지금 계산은 틀립니다.
- **`engine/tsconfig.json`**: `@game`을 `games/sample`로 잡아 틀과 틀 테스트를 예제 내용으로 타입 검사합니다. 틀 코드에 박힌 등불지기 id가 여기서 오류로 드러납니다.

### 접점 목록과 형태

| 접점 | 지금 | 덜 고치는 길 | 깔끔한 길 | 권함 |
|---|---|---|---|---|
| **내용 정의** | 틀이 `shared/defs`를 직접 import | **경로 별칭 `@game/content`**. 틀은 지금처럼 `import { CLASSES, ITEMS, type ItemId } from '@game/content'`. import 경로만 바뀐다 | 게임이 정의 객체를 실행 중에 넘김(`createGame(content)`). `Game<C>` 제네릭이 60여 곳에 퍼지고, 모듈 최상위 계산(`GRID`, 클라이언트 `world = buildWorld()`)의 초기화 순서를 다 고쳐야 한다 | **별칭** |
| **규칙 플러그인** | `Game` 생성자에 `new Tower(this)` 줄, 필드 `g.tower` | `GameOptions.plugins: ((g: Game) => void)[]`. 게임의 `install.ts`가 `g.tower = new Tower(g)`를 하고, `interface GameSystems { tower: Tower }`를 병합으로 선언. 기존 `g.tower`, `g.raid` 코드와 테스트가 그대로 컴파일된다 | 생성자 주입(`new Raid(g, tower)`)으로 `g.tower`를 없앰. 테스트 30여 곳을 고친다 | **플러그인 목록 + 병합** |
| **`g.rules`** | `respawn, speed, canChangeClass, unlocked, siege` | 그대로. 클라이언트에 짝이 되는 `rules = { speed(), unlocked(key), lockNote(key) }`를 더함 | | 그대로 + 클라이언트 짝 |
| **안내문 종류** | `MsgKey` 유니언 | `interface MsgMap { joined: [name: string]; … }`, `type MsgKey = keyof MsgMap`. 게임이 병합으로 더한다. `Locale.msg`가 `{ [K in MsgKey]: … }`라서 문장을 빠뜨리면 지금처럼 컴파일 오류 | 값의 타입까지 전부 엄격히 | 병합. 값 타입은 처음엔 `MsgArg[]`로 느슨하게, 나중에 조인다 |
| **메시지** | `ClientMsg`, `ServerMsg` 유니언 | `interface ServerMsgs`, `interface ClientMsgs` + 병합. 게임 전용(`quest`, `offer`)은 게임이 선언. `bus.onMsg('quest', …)`의 타입이 살아 있다 | 이름 붙은 개인 상태 통로 `g.personal.push({ name, dirty, state })`: 공유 상태의 `g.shared`와 짝 | 1차는 병합만. `stat`의 게임 칸과 `quest`는 2차에서 `g.personal`로 (프로토콜 변경) |
| **공유 상태** | `WorldState` 고정 | 빈 `interface WorldState {}` + 병합. `g.shared` 등록은 지금 그대로 | | 병합 |
| **캐릭터 저장** | `PlayerSave`의 고정 칸 + `ext` | `Saver`에 `legacy?: (old: PlayerSave) => unknown`을 더해, `ext[name]`이 없으면 옛 칸으로 읽는다 | | 6절의 호환 절차 |
| **월드 저장** | `worldSaves` + `importWorld`의 `'tower'` 특례 | `worldSaves` 항목에 `legacy?: (whole: WorldSave) => unknown`. 특례는 등탑 쪽으로 | | 그대로 |
| **엔티티 칸** | `Ent`의 고정 칸, `create`의 리터럴 | `interface EntExt {}` + 병합, `g.entInit.push((e) => { e.contrib = 0; … })` | 시스템별 `WeakMap<Ent, T>` | 병합 |
| **사건** | `Hooks` 고정 | `interface Hooks`에 병합. 저장 객체는 처음 `on` 할 때 만든다 | | 병합 |
| **화면 조각** | `modules.ts`에 init 줄 | 게임의 `client/main.ts`가 `startClient({ modules: [initTower, initQuest, …], locales, … })`. 모듈은 지금처럼 `bus.onMsg/onFrame/onSlow`, `onLangChange`에 등록. 덧붙일 것: `onKey`, `rules`, `addNpc`, `registerMonsterModel`, `addMarks`(이미 있음), `mountPanel(slot, html)`, `near.addPlace` | 컴포넌트 틀 도입 | 지금 방식 + 등록 함수 몇 개 |
| **건물·땅** | `scenery.ts`는 따로지만 `view.ts`가 직접 `new`. 땅 색은 `view.ts` 안 | `startClient({ scenery: (scene, world) => …, ground: (x, z, rnd) => color, leaf: (x) => color, mapPaint: (ctx, …) => … })` | 맵 데이터로 색까지 서술 | 함수로 넘김 |
| **마크업** | `index.html` 하나 | 틀의 `hud/shell.ts`가 바탕 마크업을 문자열로 갖고 `startClient`가 끼워 넣는다. 자리표(`#rightcol`, `#me` 줄, `#topmid`)에 게임이 `mountPanel`. 게임의 `index.html`은 `<title>`, 아이콘, `<div id="app">`, script 한 줄 | 게임마다 `index.html` 전체를 복사 | **shell**. 복사는 틀의 id가 바뀌면 조용히 깨진다 |
| **스타일** | `style.css` 하나 | `engine/client/style.css` + 게임 css를 게임의 `main.ts`에서 `import` | | 둘로 |
| **언어** | `ko`, `en` 한 객체 | 아래 | | |

**`ext.ts`를 따로 두는 이유.** 선언 병합은 interface가 선언된 그 모듈을 가리켜야 합니다. 그래서 넓힐 수 있는 interface만 `engine/shared/ext.ts`(`MsgMap, ServerMsgs, ClientMsgs, WorldState`)와 `engine/server/game/ext.ts`(`EntExt, Hooks, GameSystems`)에 모으고, 게임은 이 두 파일만 `declare module`로 넓힙니다.

**[실험]** 작은 모형(`fw-audit-try/aug`)에서 확인한 것:
- 게임이 엔티티 칸, 안내문, 시스템 필드, 사건을 병합으로 더하고 실행까지 됩니다.
- 틀만 타입 검사하면 틀 안의 `g.tower` 참조가 "Property 'tower' does not exist"로 떨어집니다. 의존 방향을 타입 검사가 지켜 줍니다.
- 게임의 언어 파일이 자기 안내문 문장을 빠뜨리면 컴파일 오류가 납니다.

**내용 계약.** `engine/shared/contract.ts`에 게임 내용이 내보내야 하는 이름을 적습니다: `MAP, CLASSES, SKILL_DEFS, MONSTERS, CAMPS, ITEMS, SHOPS, SHOP_STOCK, START_WEAPON, RECIPES, DROPS, FORGES, DUNGEONS, GUEST_NAME`과 수치 묶음들. 틀의 한 곳에서 `import * as C from '@game/content'; C satisfies ContentContract`를 해 두면, 빠진 export를 읽기 쉬운 오류 하나로 알려 줍니다. 수치 묶음은 예제가 `export * from '@engine/shared/defaults'` 한 줄로 채웁니다.

**맵.** `MAP: MapDef = { areas, edge, seed, spawn, obstacles, scatter, isFree(x, z), portals, portalClear }`. `buildWorld`는 `MAP.obstacles`와 `MAP.scatter`만 읽고, 등불지기의 `map.ts`가 연못·등탑·집·기둥을 `obstacles`에 지금과 같은 순서로 넣습니다. `TOWERS, CLEARINGS, ZONE_SPLIT, zoneOf, onPath, TOWN`은 게임의 것으로 남습니다. 순서가 바뀌면 난수열과 충돌 판정이 달라지므로 단계 0의 지문 검사를 먼저 둡니다.

**타입과 수치 가르기.** `growth.ts`, `social.ts`, `combat.ts`, `items.ts`, `monsters.ts`, `dungeons.ts`의 타입과 도우미(`Gear, Reward, baseOpt, gearScore, marketFee, classOf, maxHpFor, nearShop, runKey` 등)는 `engine/shared/defs/`로 가고, 표와 수치는 게임의 `content/`로 갑니다. 틀의 도우미는 자료를 `@game/content`에서 값으로 읽고, 게임 내용은 틀에서 **타입만** import합니다. 값은 잎 모듈인 `engine/shared/consts.ts`에서만 가져오게 해 초기화 순환을 피합니다.

**언어 파일.**
- 틀: `engine/client/i18n/ko.ts`의 `koBase`. `ui, fmt, msg`의 틀 몫과 `build, gear`.
- 게임: `games/<g>/client/i18n/ko.ts`가 `mergeLocale(koBase, { ui, fmt, msg, monsters, items, classes, skills, dungeons, …게임 묶음 })`.
- `ui, fmt, msg`는 한 단계 깊이로 합치고 게임 것이 이깁니다(틀의 문장을 덮어쓸 수 있습니다). 결과에 `satisfies Locale`을 겁니다.
- `Locale = EngineLocale & GameLocale`. `EngineLocale`의 `monsters: Record<MonsterId, string>` 같은 칸은 `@game/content`의 id 타입을 쓰므로, 이름을 빠뜨리면 컴파일 오류인 지금의 성질이 남습니다.
- 틀의 `i18n/index.ts`는 `LOCALES`를 import하지 않고 `startClient({ locales })`로 받습니다. 틀 코드는 `L()`을 `EngineLocale`로 보고, 게임 코드는 자기 `GL = () => L() as Locale`을 씁니다.
- `applyDom`의 `data-i18n` 방식은 그대로입니다.

### 공개 표면

- 게임은 `@engine/shared`, `@engine/server`, `@engine/client`(각 `index.ts`)와 두 `ext.ts`에서만 import합니다.
- `engine/test/boundary.test.ts`가 검색으로 지킵니다: (1) `engine/` 아래 파일이 `games/`를 import하면 실패, (2) `games/` 아래 파일이 `@engine/<영역>/<깊은 경로>`를 import하면 실패(`ext`는 예외). ESLint는 들이지 않습니다.
- 안정으로 내놓을 것: `Game`의 등록 통로(`commands, on/fire, mods, rules, ticks, saves, worldSaves, shared, out, notify, announce, entInit`), 표준 시스템의 공개 메서드(`players.grant`, `mail.send/sendTo`, `gear.give/roll`, `monsters.spawn/asleep`, `daily.add`, `combat.damage`, `movement.goTo`), `startServer/runServer`, `Store`, 클라이언트의 `bus`, `startClient`, `S`(읽기), `actions`, `view`의 등록 함수, `L/t/onLangChange/mergeLocale`.
- 그 밖(예: `net/snapshot`, `scene/view`의 내부 메시)은 내부입니다.

---

## 5. 두 번째 게임(예제)의 사양

`games/sample`, 가칭 "모닥불 사냥터". 접점을 한 번씩 쓰되 가장 작게 잡았습니다.

| 파일 | 내용 | 쓰는 접점 | 줄 수(어림) |
|---|---|---|---|
| `content/index.ts` | `MAP`(지역 하나 80×80, 바위 뿌리기 규칙 하나, 장애물 둘), `CLASSES`(사냥꾼 하나), `SKILL_DEFS`(셋), `MONSTERS`(토끼, 곰), `CAMPS`(둘), `ITEMS`(창 하나, 물약 하나, 재료 하나), `SHOPS`(하나), `RECIPES = []`, `DUNGEONS = {}`, `export * from '@engine/shared/defaults'` | 내용 계약, 빈 표도 되는지 | 90 |
| `shared/ext.d.ts` | `MsgMap`에 `bonfireLit`, `WorldState`에 `bonfire: { heat: number }`, `EntExt`에 `logs: number`, `ClientMsgs`에 `feed`, `GameSystems`에 `bonfire` | 선언 병합 전부 | 20 |
| `server/systems/bonfire.ts` | 틀에 없는 규칙: 곰을 잡으면 장작(`p.logs`)을 얻고, 모닥불 곁에서 `feed` 명령으로 넣으면 서버 전체의 온기가 오르고, 온기가 있으면 회복이 빨라진다 | `g.commands, g.on, g.mods, g.shared, g.saves, g.worldSaves, g.entInit, g.rules.respawn, g.notify` | 60 |
| `server/main.ts` | `runServer({ plugins: [(g) => { g.bonfire = new Bonfire(g); }] })` | 서버 진입 | 15 |
| `client/index.html`, `client/main.ts` | `startClient({ locales: [ko], modules: [initBonfire], scenery, ground, monsterModels })` | 클라이언트 진입 | 15 + 25 |
| `client/hud/bonfire.ts` | 온기 막대와 '장작 넣기' 단추, 미니맵 표식 하나 | `mountPanel, bus.onMsg('world'), onSlow, addMarks, send` | 45 |
| `client/scene.ts` | 모닥불 메시 하나, 땅 색 한 가지, 토끼와 곰 모델 | `scenery, ground, registerMonsterModel` | 60 |
| `client/i18n/ko.ts` | `mergeLocale(koBase, {…})`: 직업 1, 기술 3, 몬스터 2, 아이템 3, 자기 문장 5개 안팎 | 언어 합치기, 언어 하나 | 45 |
| `test/sample.test.ts` | 틀 + 플러그인으로 `Game`을 만든다. 접속, 이동, 토끼 처치로 경험치·골드, 상점에서 물약 구매, 곰 처치로 장작, `feed`로 온기와 공유 상태, 저장 왕복(`logs`, `bonfire`), 서버를 띄운 접속 한 번 | 틀이 바뀌어 예제가 깨지면 잡는다 | 80 |
| `tsconfig.json` | 별칭 | | 8 |

합계 약 460줄입니다. `npm run typecheck`가 예제도 검사하고, `npm test`가 예제 테스트를 돌립니다.

일부러 넣지 않는 것: 던전, 길드·거래소 전용 내용(틀의 기본으로 그냥 됩니다), 두 번째 언어, 두 번째 직업. 던전 없는 게임이 뜨는지는 예제가 확인해 주는 셈입니다.

---

## 6. 단계별 작업 계획

- 단계 0~8은 제자리에서 고치는 **내용 수정**입니다.
- 단계 9만 **이동**이고, 그 한 커밋에는 내용 변화를 넣지 않습니다.
- 다른 두 에이전트의 작업이 끝나 나무가 조용해진 때 단계 9를 합니다. 그 전 단계들은 지금 구조 위에서 하나씩 합칠 수 있습니다.
- 표시: 저장 형식이 바뀌면 **[저장]**, 프로토콜이 바뀌면 **[프로토콜]**.

| # | 종류 | 무엇을 | 끝났을 때의 검사 | 위험 | 순서 |
|---|---|---|---|---|---|
| 0 | 수정 | **안전망.** (1) `buildWorld()` 결과(장애물·나무·바위 좌표)의 지문을 고정하는 검사. (2) 지금 형식의 `PlayerSave`와 `WorldSave` 견본을 읽고 `export`가 같은 값을 내는 왕복 검사. 견본은 운영 `data/game.db`를 복사해 읽기 전용으로 뽑는다. (3) `welcome`에 프로토콜 번호 `v`를 넣고, 클라이언트는 다르면 "새로고침" 안내 | `tsc`, `npm test` 423 + 새 검사 | `v`는 덧붙는 칸이라 옛 클라이언트에 무해 | 먼저 |
| 1 | 수정 | **서버의 직접 결합 풀기.** `Channels.extraFoes`. `GameOptions.plugins`와 `server/game/deungbul.ts`의 `installDeungbul`(tower, raid, keepers, quests). `Game` 생성자에서 네 줄 제거. `main.ts`가 `RAID_EVERY_MIN`을 플러그인 인자로. `Daily`의 `'offered'` 구독을 등탑의 `g.daily.add` 호출로. `Hooks` 저장을 처음 `on` 할 때 만들게. `importWorld`의 `'tower'` 특례를 `worldSaves[].legacy`로. `'Keeper'`를 내용 상수로. `guild.ts`가 쓰는 `isClean/mask/tidy`를 `net` 밖으로. `players.devSpawn` 유지 | 423 통과. 새 검사: `new Game({ plugins: [] })`로 200틱 | 시스템 생성 순서가 바뀌면 `g.ticks`와 사건의 불리는 순서가 달라진다(예: `Monsters`의 습격 적 제거와 `Raid`의 `fighters` 집계). 지금 순서를 그대로 지키고 왕복 검사로 확인 | 0 뒤 |
| 2 | 수정 | **확장 지점.** 두 `ext.ts`. `MsgKey`를 `keyof MsgMap`으로, `ServerMsg`와 `ClientMsg`를 맵에서 유도. `WorldState`, `Hooks`, `EntExt`, `GameSystems`를 빈 interface + 등불지기의 병합 선언 파일 하나로. `g.entInit`. 아직 값은 안 옮긴다 | `tsc` 0, 423. 동작 변화 없음(타입만) | `bus.onMsg`의 `Extract` 타입이 맵 방식에서도 좁혀지는지. 안 되면 맵에서 `{ t: K } & …`로 유도 | 1 뒤 |
| 3 | 수정 **[저장]** | **게임의 저장 칸을 저장 등록으로.** `Saver.legacy` 추가. `quests`가 `{ name: 'quest' }`(옛 `save.quest`), 등탑·등탑지기가 `contrib, tier`, 새 `rest.ts`가 `rested`와 `seen`으로 셈하는 `restGain`을 맡는다. `players.spawn/export`에서 그 칸을 뺀다. `Ent`의 `qc/qs/qn/questDirty/contrib/tier/rested`를 `EntExt` 병합으로. `server.ts`의 `touched`는 `g.rules.touched?.(e)`를 더해 묻는다 | 왕복 검사: 옛 견본 → 같은 `Ent` 상태 → 새 형식으로 저장 → 다시 같은 상태. 423 통과 | **호환**: 한 번의 배포 동안은 옛 최상위 칸도 함께 쓴다. 코드를 되돌려도 진행이 남는다. 다음 배포에서 쓰기를 멈추고, 읽기(`legacy`)는 계속 둔다. 스키마는 JSON이라 그대로 | 2 뒤 |
| 4 | 수정 **[프로토콜]** | **개인 상태 통로.** `g.personal.push({ name, dirty, state })` → `{ t: 'me', k, s }`. `quest` 메시지와 `stat`의 `contrib, rested, tier`를 옮긴다(`sparks`는 `stat`에 남는다). `flush`의 `questDirty` 분기 제거. 클라이언트는 `onMsg('me')`를 게임 모듈이 받고, `Me`의 게임 칸을 게임 상태로. `harness.ts`의 `Peer`도 | 423 (하네스 수정 포함), 프로토콜 번호 올림. 브라우저: 퀘스트 창, 기여, 휴식 표시 | **서버와 화면을 같은 때 올려야 한다**(`scripts/restart.sh` + `npm run build && bash scripts/publish.sh`). Pages 반영이 1~2분 늦으므로 한 배포 동안은 서버가 옛 `quest`와 `stat` 칸도 함께 보낸다 | 3 뒤. 3과 한 배포로 묶어도 된다 |
| 5 | 수정 | **내용 계약, 서버·공용 몫.** `MapDef`와 `MAP`, `buildWorld`가 `MAP`만 읽게. `needs?: string`. `SMITH/SMITHY`를 `FORGES`로. `pickPotion`을 `ITEMS` 기반으로(서버 `away.ts`, 클라이언트 `actions.ts`가 함께). `MonsterDef.sparks` 선택 칸. `bots.ts` 범위를 `MAP.areas[0]`에서. `contract.ts`의 `satisfies` 검사. 내용 파일 안에서 타입·도우미와 수치를 구역 주석으로 갈라 둔다(파일 가르기는 9에서) | 단계 0의 **맵 지문이 그대로**. 423. `nav.test` 통과 | 장애물 순서나 난수 소비가 바뀌면 맵 전체가 달라진다. 물약 고르는 순서가 지금(진한 것 먼저)과 같아야 한다 | 1 뒤. 2~4와 병렬 가능 |
| 6 | 수정 | **클라이언트 바탕 가르기 (가장 큰 단계, 둘로 나눈다).** 6a: `rules` 객체(`speed, unlocked, lockNote`), `hud/shop.ts`·`forge.ts`·`notify.ts`가 그것을 쓰게, `entities.ts`의 `speedFor(stage())`를 `rules.speed()`로, `syncNpcs`를 `addNpc` + 게임 모듈로, `spawnMerchant`의 `TOWERS` 참조 제거, `onKey`. 6b: `panels.ts`를 `hud/me.ts`(틀)와 게임의 `hud/tower.ts, raid.ts, zone.ts`로, `main.ts`의 `quest/shop/forge/classes` 직접 호출을 버스 등록으로, `state.ts`에서 `stage/zoneGlow/myZone/raidLeft/S.quest`를 게임 상태 파일로, `near.ts`의 `PLACES`를 등록식으로 | `tsc` 0, `npm run build`. 브라우저 확인(PC와 폰 가로·세로): 접속, 등탑 창 열림·닫힘, 바치기, 주민 NPC, 상점 잠금 문구, 대장간, 습격 알림, 구역 배너, 퀘스트 길잡이와 F 키, 환한 구역의 걸음 속도(되감김 없음) | 그리는 순서와 `hudSlow` 주기에 기대던 것(예: `renderWorld` 뒤에 `renderShop`). 좁은 화면의 `data-near` 규칙. 다른 에이전트가 지금 고치는 메뉴·폰 배치와 충돌 가능성이 가장 크다 | 그쪽 작업이 합쳐진 뒤. 2, 4 뒤 |
| 7 | 수정 | **장면과 마크업.** `view.ts`의 땅 색칠·잎 색·`setMood`·`setTowerGlow`·`goalBeam`을 게임이 넘기는 함수와 게임 모듈로. `minimap.ts` 바탕을 `mapPaint`로. `models.ts`의 `makeMonster`와 `BLADES`를 등록식으로. `hud/shell.ts`와 `mountPanel`, `index.html`을 얇게. `style.css`를 틀과 게임으로 | `npm run build`. 브라우저: 땅·나무 색, 등탑 불빛 단계, 습격 중 안개, 던전 안 어둠, 몬스터 모델 전부(트롤, 지하묘 주인 포함), 미니맵, 폰 배치 | 겉모습이 조금이라도 달라지기 쉽다. 전후 화면을 캡처해 비교. css는 선택자 우선순위가 파일 순서에 달려 있다 | 6 뒤 |
| 8 | 수정 | **언어 파일.** `koBase`·`enBase`(틀)와 게임 몫으로 가르기, `mergeLocale`, `Locale = EngineLocale & GameLocale`, `LOCALES`를 `startClient`로. `fmt.kill`, `fmt.reward`처럼 불씨를 말하는 틀 문장은 게임이 덮어쓴다 | `tsc` 0(빠진 문장이 없음). 브라우저: 한국어·영어 전환, `?lang=en` | 키를 옮기다 빠뜨리면 컴파일이 잡지만, 틀과 게임에 같은 키가 있으면 조용히 덮인다. 합칠 때 겹친 키를 개발 중에만 경고 | 6, 7 뒤. 다른 에이전트의 문장 작업이 끝난 뒤 |
| 9 | **이동** | `git mv`만. 4절의 폴더로 옮기고 내용 파일을 타입·도우미(`engine/shared/defs/`)와 수치(`games/deungbul/content/`)로 가른다. import 경로를 별칭으로 일괄 치환. `tsconfig` 셋, `vite.config.ts`, `package.json` 스크립트, `Options.staticDir`, `.gitignore`, README의 구조 절 | `npm run typecheck`, `npm test` 전부, `npm run build`의 `dist/`가 전과 같은 구성, `npm start` 뒤 `scripts/restart.sh`·`pilot.mjs`·`publish.sh`가 그대로 도는지(경로만 확인, 실제 배포는 사람이) | 이름 바꾸기가 대부분이라 그때 열려 있는 다른 가지와 충돌한다. **나무가 조용할 때 한 번에**. 파일을 가르는 일은 이동 커밋과 다른 커밋으로 | 1~8 뒤 |
| 10 | 수정 | **테스트 가르기.** 게임 테스트(keepers, quests, zone2, channel의 습격 블록, party·nav·classes·shop의 게임 검사, `server.test`의 등탑·퀘스트·습격 부분)를 `games/deungbul/test/`로. 틀 테스트는 `new Game({ plugins: [표준] })`. `combat.test`의 "등탑에서 멀면"은 시험용 `g.rules.canChangeClass` 대입으로, `shop`·`craft`의 주민은 `g.rules.unlocked` 대입으로. `harness.ts`의 `Peer`에서 게임 칸 분리. `boundary.test.ts` | `npm run test:engine`이 **게임 플러그인 없이** 통과(실험 기준으로 272개 이상). 전체 합계는 423 이상 유지 | 검사를 옮기다 빠뜨리는 것: 옮기기 전후의 "통과" 줄 수를 맞춘다 | 9 뒤 (1 뒤에 제자리에서 먼저 해도 된다) |
| 11 | 수정 | **예제 게임과 문서.** `games/sample`(5절), `docs/making-a-game.md`. 예제는 문서의 차례 그대로 만든다 | `tsc -p games/sample`, `sample.test.ts`, `npm run build:sample`, 브라우저에서 예제 접속(다른 포트) | 예제를 만들다 보면 틀에 남은 등불지기 id가 드러난다(`tsc -p engine`이 예제 내용으로 검사). 그 수리는 이 단계에 포함 | 9, 10 뒤 |
| 12 | 수정 | **공개 표면.** 세 `index.ts`, `boundary.test.ts`의 깊은 import 금지, README의 "다른 게임으로 가져갈 때"와 "넓히는 방법"을 새 구조로 | 전부 통과 | 없음 | 마지막 |
| 13 (선택) | 수정 | 틀 테스트의 내용을 등불지기에서 떼기: `engine/test/fixture/`(직업 둘, 몬스터 셋, 무기·재료·던전 하나)로 옮기고 좌표 상수를 이름 붙은 점으로 | `test:engine`이 `games/deungbul` 없이 돈다 | 300여 검사를 건드린다. 하루 이상 | 필요해질 때 |

단계 12까지에서 틀 테스트는 "틀 + 등불지기의 **내용**(규칙 플러그인 없이)"으로 돕니다. 목표 2("이 게임의 규칙 없이 서버가 뜨고 기본 기능 테스트가 통과")는 채우지만, 테스트 설정이 등불지기의 내용 폴더를 가리키는 의존은 남습니다. 소스 import로는 없고 tsconfig의 별칭에만 있습니다. 완전히 없애려면 단계 13이 필요합니다.

---

## 7. 하지 말아야 할 것

- **실행 중 내용 주입과 `Game<Content>` 제네릭.** 별칭으로 같은 타입 안전을 얻습니다 [실험]. 한 프로세스에서 게임 둘을 돌릴 일이 없습니다.
- **틀 시스템을 낱낱이 선택형으로 만들기.** `players ↔ classes ↔ gear ↔ channels ↔ rank ↔ build ↔ party ↔ dungeon ↔ daily ↔ mail`은 서로 직접 부르고 `server.ts`의 `flush`도 `game.rank.power`, `game.build.left`를 부릅니다. 길드 없는 게임, 거래소 없는 게임은 화면에서 탭을 숨기면 됩니다. 선택형은 `boss`, `rest`와 게임 플러그인까지만.
- **재화 일반화 (`sparks`를 `Record<CurrencyId, number>`로).** `MonsterDef, Reward`, 우편, 방치, 출석, 던전 보상, `kill`과 `mailGot`의 값, 저장, `stat`을 모두 건드리는데, 예제는 `[0, 0]`과 문장 덮어쓰기로 충분합니다. 재화가 셋 이상인 게임이 실제로 생길 때 합니다.
- **기술 효과·AI·퀘스트 목표의 플러그인화.** `SkillEffect` 세 가지와 `QuestGoal`은 지금대로 둡니다.
- **ECS, DI 컨테이너, 이벤트 버스 라이브러리, UI 틀(React 등), ESLint 경계 규칙, npm 워크스페이스·패키지 배포.** 검색 한 줄짜리 경계 테스트와 병합 선언으로 충분합니다.
- **맵을 데이터 언어로 서술하기** (길, 땅 색, 건물까지 JSON). 함수(`isFree`, `ground`)로 넘기면 됩니다.
- **이진 프로토콜, 메시지 스키마 검증기.** 이 작업과 무관합니다.
- **`g.rules`를 미리 늘리기.** 지금 다섯 개와 클라이언트 짝 세 개면 됩니다. 예제가 필요로 할 때만 더합니다.
- **이동과 수정을 한 커밋에 섞기, 다른 작업이 열려 있을 때 단계 9를 하기.**

---

## 8. 확신이 없는 것, 더 조사가 필요한 것

- **클라이언트는 오류를 세기만 했습니다.** 단계 6~8의 범위와 위험은 읽고 판단한 것이고 브라우저로 돌려 보지 않았습니다. `entities.ts`(321줄), `view.ts`, `menu.ts`(380줄), `style.css`는 검색과 부분 읽기만 했습니다. `menu.ts` 안의 게임 문장·수치 참조는 `rewardText` 말고 더 있을 수 있습니다.
- **Vite 별칭과 `GAME` 환경 변수로 뿌리를 바꾸는 빌드**는 돌려 보지 않았습니다. `client/public`의 위치, `base: './'`, Pages 배포 스크립트와의 맞물림은 단계 9에서 확인해야 합니다.
- **끝까지 읽지 않은 서버 파일**: `gear.ts, mail.ts, market.ts, guild.ts, build.ts, party.ts, dungeon.ts`, `shared/nav.ts`. 이 파일들에 대한 "틀" 판정은 import와 `g.<시스템>` 호출, 게임 낱말 검색에 근거합니다. 지운 뒤 `tsc` 오류가 0이고 해당 테스트가 통과한 것은 실험으로 확인했습니다.
- **보스를 틀로 올리는 판단**은 "게임 id를 모른다"와 "지워도 컴파일된다"에 근거한 제 판단입니다. 요청서는 보스를 게임 규칙으로 꼽았으므로 정해 주셔야 합니다. 게임 쪽에 둬도 계획은 같고, `monsters.ts`의 `bossUp` 알림과 `m.windup` 참조, `gear.ts`의 `def.boss`, `entities.ts`의 `'slam'`만 사건과 훅으로 더 빼면 됩니다.
- **"습격 몹" 개념**(`Ent.raid`, `g.rules.siege`, `Monsters.atTower`, `EnterInfo.r`)을 틀의 기능으로 남기는 것도 같은 성격의 결정입니다. 남기면 이름만 중립으로 바꾸고, 빼려면 `monsters.tick`에 "몹별 행동 덮어쓰기" 자리가 하나 필요합니다.
- **선언 병합이 실제 크기에서도 편한지**는 모형으로만 확인했습니다. `ServerMsg`를 맵에서 유도한 뒤 `bus.onMsg`의 `Extract`, `satisfies ServerMsg`, `snapshotFor`의 수동 JSON이 그대로 맞는지는 단계 2에서 드러납니다. 등불지기와 예제의 병합 선언이 한 `tsc` 프로그램에 함께 들어가면 서로 섞이므로, 게임별 tsconfig의 `include`가 다른 게임을 넣지 않아야 합니다.
- **저장 호환**은 형식(JSON 덩어리, `ext`)만 보고 세운 절차입니다. 운영 중인 `data/game.db`의 실제 내용(아주 옛 형식 `{ glow, residents }`의 월드, `ext`가 없는 캐릭터)은 열어 보지 않았습니다. 단계 0의 견본은 운영 파일의 복사본에서 뽑아야 합니다.
- **지금 진행 중인 두 작업**(서버 악용 방지, 클라이언트 메뉴·폰 배치·문장)이 `raid.ts, boss.ts, rank.ts`, 저장, `menu.ts, panels.ts, ko.ts`를 고치고 있어 3절 표의 세부는 조금 달라질 수 있습니다. 묶음의 원인은 그대로일 것입니다.
- **실험 폴더의 한계**: 실험 폴더는 줄 끝을 LF로 바꾼 사본이라, 그 안의 줄 번호나 diff를 원본에 그대로 대면 안 됩니다. 테스트 한 파일씩 따로 돌리면 `tsx` 기동 때문에 매우 느려(20개에 수 분) 수치는 한 번씩만 쟀습니다.

### 실험 흔적 (모두 임시 폴더, 저장소 밖)

- `%TEMP%\dg-work\fw-audit-try`: 틀만 남긴 서버 (고친 파일: `shared/content/items.ts`, `craft.ts`, `shared/protocol.ts`, `server/game/game.ts`, `systems/channels.ts`, `systems/players.ts`, `server/main.ts`, `test/harness.ts`, `test/channel.test.ts`, `test/nav.test.ts`)
- `%TEMP%\dg-work\fw-audit-try\alias-try`: 별칭으로 내용 갈아 끼우기 모형
- `%TEMP%\dg-work\fw-audit-try\aug`: 선언 병합 모형
- `%TEMP%\dg-work\tsc1.txt`: 오류 99개의 원문. `tsc2.txt`, `tsc3.txt`: 클라이언트 단계별 오류
