# 이 틀로 게임 만들기

이 저장소는 두 덩어리다: 다른 게임에서도 그대로 쓰는 **틀**(`engine/`)과 게임들(`games/`). 이 문서는 틀 위에 새 게임을 만드는 차례를 적는다.

> **지운 본보기 게임 (2026-11-27)**: 시제품과 증명 게임 일곱(버섯 동굴 `cave`, 별가루 광산 `starmine`, 돌담 마을 `bastion`, 굴림공 `rollball`, 달무리 원정대 `dalmuri`, 징검돌 전술 `stepstone`, 반딧불 연못 `pond`)은 저장소에서 지웠다. 지금 `games/`에는 등불지기(`deungbul`)와 예제(`sample`)만 있다. 이 문서가 `games/<그 이름>/…`을 예로 들면 커밋 `7e347c9`에서 본다: `git show 7e347c9:games/stepstone/server/duels.ts`, 폴더째 되살리기는 `git checkout 7e347c9 -- games/stepstone`. 틀의 기능(`rooms`, `teams`, 수집형 모듈 …)은 그대로 있고 틀의 시험(`engine/test/core`, `collect`)이 지킨다.

틀은 **장르와 무관한 핵심**과 **고를 수 있는 모듈**로 되어 있다. 새 게임은 이 차례로 만든다.

1. **핵심**: 맵과 쓸 모듈의 목록(`MAP`, `MODULES`)만 적으면 서버와 화면이 뜬다. 접속, 이동, 지도, 대화, 채널, 저장은 늘 있다(1절).
2. **모듈 고르기**: 전투, 직업, 아이템, 장비, 재화, 우편, 파티, 길드, 던전 … 가운데 쓸 것을 내용의 `MODULES` 한 곳에 적는다. 고르지 않은 모듈은 서버의 명령·저장 칸도, 화면의 창·단추·메뉴 탭·단축키도 생기지 않는다(1절).
3. **모듈별 내용**: 고른 모듈의 표(직업, 몬스터, 아이템 …)와 수치를 채운다(3절). 고르지 않은 모듈의 이름은 적지 않는다.
4. **이 게임만의 규칙과 엔티티**: 서버 시스템, 게임이 등록하는 엔티티 종류(공, 구조물, 떨어진 물건 …)와 그 화면(6절, 12절).

본보기는 넷이다.

- **전투가 없는 게임**: 12절의 "공 마당"(`engine/test/core/`). 모듈을 하나도 고르지 않고, 게임이 등록한 엔티티(공)를 줍는다. 약 80줄. **RPG가 아닌 게임을 만든다면 12절부터 읽는다.**
- **수집형·방치형 RPG**(영웅 뽑기, 편성, 단계, 방치 보상, 열쇠 던전): 13절의 "영웅 들판"(`engine/test/collect/`).
- **판으로 나뉘는 턴제·보드 게임**(대기실, 짝짓기, 차례와 기한, 컴퓨터 상대, 셋 이상의 판과 등수): 14절의 판 모듈(`rooms`)과 틀의 시험의 '별 줍기'(`engine/test/core/server/stars.ts`), 지운 본보기 "징검돌 전술"·"반딧불 연못"(커밋 `7e347c9`).
- **RPG 모듈을 쓰는 게임**: 작은 예제 `games/sample`("모닥불 사냥터", 약 580줄. 시험 빼고). 2절부터 이 문서의 차례대로 빈 폴더에서 채운 것이다. 큰 본보기는 `games/deungbul`(등불지기: 모듈 전부).

- 문서의 코드는 본보기에서 그대로 따온 것이다. 코드 울타리의 머리에 적힌 경로가 그 출처다. `npm run test:sample`이 문서의 조각과 그 파일이 같은지 검사한다.
- 조각 안의 `…`만 있는 줄은 건너뛴 자리다.
- 명령은 모두 **저장소 뿌리**에서 실행한다.

## 1. 틀의 짜임: 핵심과 선택 모듈

### 장르의 범위

틀은 **여럿이 함께 접속하는 쿼터뷰(비스듬히 내려다보는) 3D 월드**의 게임을 만든다. 서버가 위치와 결과를 정하고(서버 권위), 화면은 "무엇을 하고 싶다"만 보낸다.

| 되는 것 | 어떻게 |
|---|---|
| 전통적인 탭 타깃 MMORPG (등불지기) | 모듈 전부 |
| 협동 던전, 방치형, 마을 방어 같은 RPG 변형 (`games/cave`, `starmine`, `bastion`) | RPG 모듈 가운데 일부 + 게임의 규칙 |
| 전투 없는 월드: 모으기·줍기, 술래잡기, 꾸미기·농장, 산책·대화 공간, 보물찾기, 가벼운 파티 게임 | 핵심만 + 게임이 등록하는 엔티티 종류(12절)와 명령 |
| 재화·아이템은 있고 전투는 없는 게임 (가게 놀이, 채집과 거래) | `economy`, `items`, `mail` … 만 고른다 (전투·직업 없이) |
| 액션성이 있는 게임 (공·발사체를 다루는 놀이) | 핵심 + 게임의 엔티티 종류. 틱마다 서버가 움직이고 시야 안의 화면에 값을 실어 보낸다 |
| 판으로 나뉘는 턴제 전술·보드·카드 게임 (`games/stepstone`) | `rooms` 모듈(14절): 판마다의 층, 대기실·짝짓기·컴퓨터 상대, 차례와 기한·초읽기, 끊긴 사람의 자리, 판의 저장. 판 위의 규칙과 그림은 게임이 |

| 안 되는 것 (틀을 고쳐야 한다) | 까닭 |
|---|---|
| 1인칭·옆 스크롤·위에서 곧장 내려다보는 시점, 높낮이가 있는 지형 | 카메라와 장면(`engine/client/scene/view.ts`)이 쿼터뷰의 평평한 땅을 전제한다(각도는 고정이다. 거리·배율의 범위와 비추는 곳은 게임이 정한다: 5절 '카메라'). 땅은 지역(네모)들이고 장애물은 둥근 기둥이다 |
| 빠른 반응이 승패를 가르는 액션(격투, 슈팅의 정밀 판정) | 서버는 20Hz로 돌고 화면에 10Hz로 보낸다(`NET`으로 바꿀 수는 있다). 지연 보정·되감기 판정이 없다 |
| 3D 월드를 아예 쓰지 않는 게임(화면 전체가 카드 탁자) | 핵심이 '월드 안의 사람'(이동, 시야, 채널)이다. 판·차례·대기실은 `rooms` 모듈(14절)이 주지만, 장면은 늘 쿼터뷰 3D다 |
| 한 서버에 수천 명이 한 화면에 | 측정된 상한은 접속 300(`docs/infra.md`). 시야(AOI)로 나누지만 샤딩은 없다 |
| 플레이어가 아닌 사람끼리의 물리(밀기, 충돌하는 공) | 길찾기와 장애물 피하기만 있다. 엔티티끼리 부딪히는 물리는 게임이 틱에서 셈한다 |

### 핵심 (늘 있다)

게임이 아무것도 더하지 않아도 되는 것들이다. 모듈을 하나도 고르지 않아도 돈다.

| 묶음 | 기능 |
|---|---|
| 접속 | 이름 없이 바로 접속, 브라우저에 간직한 값으로 캐릭터 이어받기, 끊기면 다시 접속, 이름 바꾸기, 서버 가득 참 안내, 프로토콜 번호(어긋나면 새로고침 안내) |
| 이동 | 땅 누르기·WASD·터치 조이스틱, 길찾기, 서버 판정과 화면 예측, 집으로(H. 가는 곳은 `rules.home`, 내용의 `HOME_KEY = false`로 끈다: 5절 '단축키') |
| 월드 | 맵·지역·장애물·나무와 바위, 엔티티와 시야(AOI) 동기화, 채널(층), 게임이 등록하는 엔티티 종류(`g.defineKind`, `registerKind`) |
| 사람 사이 | 대화와 금칙어·차단·신고, 사람 카드, 봇(시험·부하용) |
| 운영 | 저장(SQLite 또는 메모리)과 저장 형식의 이전·백업, 제재·관리자 통로, 기기 옮기기, `/healthz`·`/metrics`, 재시작 뒤 이어 가기 |
| 화면 | 3D 장면과 카메라(거리·배율·비추는 곳을 게임이 정할 수 있다), 내 이름·접속자 수, 미니맵, 전체 지도(장소 목록, 정보 카드, 걸어가기), 알림 세 가지, 메뉴(소리, '기기' 탭과 게임의 탭), PC와 폰(가로·세로) 배치, 여러 언어 |

### 선택 모듈

게임은 쓸 모듈을 내용의 `MODULES`에 적는다(`engine/shared/modules.ts`의 표). 의존하는 모듈이 빠지면 서버와 화면이 시작할 때 "`market → items`가 빠졌습니다"처럼 무엇이 빠졌는지 오류로 알린다.

| 모듈 | 무엇 | 의존 | 화면에 생기는 것 | 키 |
|---|---|---|---|---|
| `economy` | 재화(골드, 두 번째 재화), 지갑, 경제 장부 | | 내 정보 창의 재화, 메뉴 머리의 골드 | |
| `growth` | 레벨과 경험치 | economy | 경험치 막대, 레벨 | |
| `classes` | 직업 고르기·바꾸기, 직업마다의 체력과 기술 | | 직업 고르기 창, 레벨 옆 직업 이름 | |
| `combat` | 체력·피해·기술·몬스터·리스폰·필드 보스, 쓰러짐, 처치 보상 | classes | 체력 막대, 기술 단추, 대상 창, 대상 공격 단추, 강화 표시 | 1–3(기술), Tab(대상) |
| `build` | 능력치 점수와 기술 강화 | growth, combat, economy | 메뉴의 성장 탭 | |
| `items` | 가방(재료·물약), 상점, 물약, 대장간 제작, 재료 드롭 | economy | 가방 단추·창, 상점·대장간 창, 물약 단추 | Q(물약), B(가방) |
| `gear` | 떨어지는 장비, 끼기·팔기·비교, 강화·재련·분해, 장비 가방 넓히기 | items, economy | 메뉴의 장비 탭 | |
| `mail` | 우편(보상을 맡아 둔다) | items, economy | 메뉴의 우편 탭 | |
| `daily` | 일일 임무와 출석 | mail | 메뉴의 일일 탭 | |
| `idle` | 접속하지 않은 동안의 보상 | mail | 기본은 없음: 보상은 **우편으로만** 온다(우편 탭의 점·메뉴 단추의 수). 내용의 `IDLE.popup: true`면 돌아왔을 때 가운데 창(받은 것, 오프라인 진행, '받기'·'나중에': 13절 '단계 밖') | |
| `party` | 파티 초대, 함께 받는 보상, 파티원 표시 | | 파티 목록, 받은 초대, 사람 카드의 초대 단추 | |
| `guild` | 길드 | economy | 메뉴의 길드 탭, 사람 카드의 길드 초대 | |
| `market` | 거래소 | items, gear, mail, economy | 메뉴의 거래소 탭 | |
| `dungeon` | 던전 인스턴스, 하루 횟수(또는 입장 열쇠: 13절 '던전의 열쇠'), 끝낸 보상 | combat, mail, daily, gear | 던전 창 | |
| `rank` | 전투력 순위 | growth | 메뉴의 순위 탭 | |
| `away` | 자동 사냥, 창을 닫아도 이어지는 자리 비움 사냥 | combat | 자동 사냥 단추, 지도의 '가서 사냥' | R |
| `teams` | 팀 고르기·옮기기(사람 수 균형), 팀과 사람마다의 점수, 점수판, 팀 색 옷. 기본은 저장하지 않는다 (6절 '팀과 점수판') | | 가운데 위 점수판, 팀 고르기 창, 내 정보 창의 '내 팀' 줄과 팀 바꾸기, 팀 색 옷과 발밑 고리 | |
| `roster` | 영웅(동료): 레벨·별·조각, 레벨 업과 별 올리기 (13절) | economy | 메뉴의 영웅 탭 | |
| `gacha` | 뽑기: 배너, 1번·10번, 천장, 10번 보장, 공개 확률표, 기록. 게임 안의 재화만 (13절) | roster, economy | 메뉴의 뽑기 탭(확률 보기), 결과 창 | |
| `squad` | 편성: 영웅이 주인을 따라다니며 함께 싸운다 (13절) | roster, combat | 메뉴의 편성 탭, 영웅(종류 `hero`)의 겉모습 | |
| `stages` | 장과 단계(1-1 …), 물결과 우두머리, 자동 진행과 실패, 방치 보상이 깬 단계로 커진다 (13절) | combat | 가운데 위 단계 막대, 메뉴의 단계 탭 | |
| `rooms` | 판: 판마다의 인스턴스 층, 대기실·짝짓기(컴퓨터 상대), 차례와 기한, 끊긴 사람의 자리, 판의 저장 (14절) | | 대기실 창(오른쪽 위), 판의 막대와 초읽기(가운데 위), 결과 창 | |
| `chars` | 캐릭터 정의: 바깥(AI·사람)이 만든 정의를 검증해 두고(월드 저장, 바꿔 끼우는 저장소) 화면에 보낸다. `roster`와 함께면 정의가 영웅이 된다 (15절) | | 없음(정의를 받아 둔다: `onChars`) | |
| `morph` | 변신: 가진 캐릭터 정의의 겉모습(남에게도)과 게임이 정한 보정, 지속 시간·재사용 대기·전투 중 금지 (15절) | chars | 메뉴의 변신 탭 | |

```ts engine/test/core/shared/content/index.ts
/** 쓸 모듈: 없다 (핵심만) */
export const MODULES: readonly ModuleId[] = [];
```

```ts games/sample/shared/content/index.ts
import type { ModuleId } from '@engine/shared/modules';
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'build', 'items', 'gear', 'mail', 'daily', 'idle', 'party', 'rank', 'away', 'chars', 'morph'];
```

모든 RPG 모듈을 쓰는 게임은 `export const MODULES = RPG_MODULES;`(등불지기, 버섯 동굴)로 적는다. `RPG_MODULES`에는 `teams`, 수집형의 넷(`COLLECT_MODULES`: `roster`, `gacha`, `squad`, `stages`), `herogear`, `rooms`, `chars`, `morph`가 들지 않는다(그 목록을 쓰는 게임에 저절로 생기지 않게).

**의존으로 딸려 온 모듈의 화면 감추기**: 쓰려는 모듈의 의존 때문에 고른 모듈의 단추가 필요 없으면(예: 던전 → 장비 → 아이템이라 생기는 가방 단추, 서버가 대신 싸우는 게임의 '가까운 대상 공격') 내용에 `export const HUD: HudRules = { hide: ['bag', 'attackNearest'] };`(타입은 `@engine/shared/defs/hud`)를 적는다. 감출 뿐이라 기능과 단축키는 그대로다. 이름의 목록은 13절 '단계 밖'의 표.

**고르지 않은 모듈은**:

- 서버: 그 시스템이 만들어지지 않는다. `g.wallet` 같은 칸은 건드리면 "모듈 'economy'를 고르지 않았습니다"를 던지는 자리표다. 명령이 등록되지 않으므로 웹소켓으로 직접 보내도 무시된다. 틱도, 캐릭터·월드 저장의 칸도, 본인에게 보내는 상태(`stat`·`meta`의 그 칸)도 없다.
- 화면: 그 창·단추가 뼈대에서 빠지고(`engine/client/hud/skeleton.ts`의 `data-mod`), 메뉴 탭과 단축키도 없다. 빈 키는 게임이 `onKey`로 쓸 수 있다.
- 저장: 예전에 그 모듈을 쓰던 저장(골드, 거래소에 맡긴 물건 …)은 읽은 그대로 두었다가 다시 적는다. 모듈을 다시 켜면 이어진다.

**고를 수 있는지 묻기**: 게임의 서버 코드가 쓸지 말지 모르는 모듈을 쓸 때는 `g.has('economy')`로 묻는다. 화면은 `hasModule('economy')`(`@engine/client`).

### 틀에서 가져오는 곳 (입구)

**게임은 틀을 아래의 입구로만 import한다.** 11절 일람표의 파일 이름(`game/entity.ts`, `hud/minimap.ts` …)은 그 이름이 **어디에 정의되어 있는지**일 뿐이고, 가져올 때는 그 파일의 층에 맞는 입구를 쓴다. 입구가 아닌 경로(`@engine/server/game/entity` 같은 것)로 가져오면 타입 검사와 그 게임의 시험은 통과해도 `npm test`의 경계 검사(`engine/test/boundary.test.ts`, "게임은 틀을 입구로만 읽는다")가 실패한다.

| 입구 | 무엇이 있나 | 예 |
|---|---|---|
| `@engine/server` | 서버의 모든 것: `Game`(`g.has`, `g.defineKind`, `g.place`), `Ent`, `KindDef`, `startServer`, `runServer`, 저장소(`MemoryStore` …), `dist`·`readInt`·`clamp`·`ri`·`dayOf`, 층 도우미, `addBannedWords`, `WHY`·`mailWhy` | `import { dist, type Ent, type Game, readInt } from '@engine/server';` |
| `@engine/client` | 화면의 모든 것: `startClient`, `bus`(`onMsg`·`onFrame`·`onSlow`·`onKey`), `rules`, `S`, `send`, `hasModule`, 엔티티 종류(`registerKind`, `makeBox`, `makeBall`), 창(`mountPanel`, `addPlace`, `addNotices`), 모델·장면(`registerHand` …), 지도(`addMapPlaces` …), 메뉴(`setMenuTabs`, `closeMenu`, 탭의 줄 만들기 `menuRow`·`menuButton`·`menuEl`·`menuSpan`·`menuChips`·`redrawMenu` …) | `import { addMapPlaces, onMsg, rules, S } from '@engine/client';` |
| `@engine/client/i18n` | 문장: `L`, `t`, `setLocales`, `onLangChange`. 언어 묶음은 `@engine/client/i18n/ko`·`en`·`names`·`merge` | `import { L, t } from '@engine/client/i18n';` |
| `@engine/shared` | 공용: 메시지 타입(`ServerMsg` …), 모듈의 표(`ALL_MODULES`, `RPG_MODULES`, `checkModules`, `ModuleId`), 자동 사냥의 기준(`AUTO`, `AWAY`), 길찾기, `PROTOCOL` | `import type { ServerMsg } from '@engine/shared';` |
| `@engine/shared/defs`, `@engine/shared/world` | 내용 통로: 내용의 타입·도우미(`maxHpFor`, `itemDef` …)와 맵(`AREAS` …) | `import { maxHpFor } from '@engine/shared/defs';` |
| `@engine/testing` | 시험 도구: `check`, `failures`, 가짜 클라이언트 | `import { check } from '@engine/testing';` |
| `@engine/shared/ext`, `@engine/server/game/ext`, `@engine/client/i18n/ext` | 확장 지점(선언 병합만, 6절) | `declare module '@engine/shared/ext' { … }` |

**예외 하나: 내용 파일**(`shared/content/` 아래)만은 `@engine/shared/defs/*`(예: `@engine/shared/defs/combat`)에서 **타입만**(`import type`), `@engine/shared/defaults`에서 기본값(`GEAR_BASE` 같은 것)을, `@engine/shared/modules`에서 모듈의 목록(`RPG_MODULES`, `ModuleId`)을 가져온다. 내용 통로(`@engine/shared/defs`)를 값으로 읽으면 초기화 순서가 꼬이기 때문이다(10절). 문서의 코드 조각은 import 줄을 빼고 적었으니, 머리는 예제의 같은 파일을 본다.

## 2. 폴더와 설정

```
games/sample/
  tsconfig.json            별칭 @game → 이 폴더, 검사 대상(틀 + 이 게임)
  tsconfig.engine.json     틀만 이 게임의 내용으로 검사
  vite.config.ts           화면 빌드
  shared/content/index.ts  내용 (계약의 이름들)
  shared/content/bonfire.ts 이 게임에만 있는 내용
  shared/sample.ts         공용 선언: 안내문, 메시지, 공유 상태
  server/main.ts           서버 진입점
  server/sample.ts         규칙 플러그인과 서버 쪽 선언
  server/bonfire.ts        규칙 시스템
  client/index.html        머리와 진입점
  client/main.ts           화면 진입점
  client/i18n/             문장: ko.ts, en.ts, index.ts
  client/scene.ts          겉모습
  client/bonfire.ts        규칙의 화면
  client/sample.css        스타일
  test/                    시험
```

**예제를 베껴 시작할 때**: `games/sample`을 통째로 `games/<내 게임>`에 복사한 뒤 `test/docs.test.ts`(이 문서와 예제가 같은지 보는 예제 전용 시험)와 `test/empty.test.ts`(예제의 빈 표 검사)는 지우거나 경로를 고친다: 둘은 `games/sample`을 경로로 적어 두었다. **`package.json`은 고치지 않는다**: 게임 폴더에 `deploy.json`이나 `server/main.ts`가 있으면 타입 검사(`npm run typecheck`), 시험(`npm test`), 게임 고르기(`node scripts/game.mjs <일> <게임>`)가 저절로 그 게임을 찾는다(`npm run games`가 찾은 목록). 운영 스크립트를 쓰려면 `deploy.json`(9절). 전투가 없는 게임은 예제 대신 12절의 공 마당에서 시작하는 편이 짧다.

**별칭이 전부다.** `@game`이 어느 폴더를 가리키느냐가 "어느 게임인가"를 정한다. 두 파일에서 같아야 한다: `tsconfig.json`(타입 검사와 `tsx`), `vite.config.ts`(화면 빌드). 게임을 돌리는 도구 `scripts/game.mjs`가 게임 폴더의 이 두 파일을 골라 쓴다: `node scripts/game.mjs <start|watch|client|build> <게임 폴더 이름>`.

```json games/sample/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@engine/*": ["../../engine/*"],
      "@game/*": ["./*"]
    }
  },
  "include": ["../../engine/shared", "../../engine/server", "../../engine/client", "."]
}
```

- `include`에 뿌리의 `test`나 다른 게임 폴더를 넣지 않는다. **한 `tsc` 프로그램에는 한 게임만** 들어간다(10절).
- 틀의 시험 도구(`engine/test/harness.ts`)는 시험 파일이 import하면 따라 들어온다.

```json games/sample/tsconfig.engine.json
{
  "extends": "./tsconfig.json",
  "include": ["../../engine/shared", "../../engine/server", "../../engine/client"]
}
```

이 설정은 틀의 소스만, 그러나 이 게임의 내용으로 검사한다. 틀에 다른 게임의 id가 박혀 있으면 여기서 드러난다.

```ts games/sample/vite.config.ts
const game = import.meta.dirname, repo = resolve(game, '..', '..');
export default defineConfig({
  root: resolve(game, 'client'),
  // 별칭은 tsconfig.json의 paths와 같아야 한다: @game이 이 게임의 폴더를 가리킨다
  resolve: { alias: { '@engine': resolve(repo, 'engine'), '@game': game } },
  // 상대 경로로 빌드한다: 게임 서버가 직접 내보낼 때도, 하위 경로에 올릴 때도 그대로 동작한다
  base: './',
  // client/public/(모델과 소리 파일)이 빌드에 그대로 들어간다. 그런 파일이 없는 게임은 publicDir: false를 둔다
  // 개발 서버의 화면이 붙을 게임 서버의 포트: server/main.ts의 기본 포트와 같아야 한다 (PORT를 주면 서버와 함께 따라간다)
  define: { 'import.meta.env.VITE_DEV_PORT': JSON.stringify(process.env.PORT ?? '3002') },
  build: { outDir: resolve(repo, 'dist-sample'), emptyOutDir: true },
  // 틀의 코드가 뿌리(client/) 밖에 있으므로 저장소 뿌리까지 읽게 한다
  server: { host: true, port: 5174, fs: { allow: [repo] } },
});
```

- `client/public/`의 파일(아이콘, manifest, 그림 시트, 모델과 소리 파일)은 빌드 결과에 그대로 들어간다. 예제는 모델과 소리 파일을 두므로 `publicDir: false` 줄이 없다. 그런 파일이 없는 게임은 `publicDir: false`를 둬도 된다(두면 `client/public/`을 읽지 않는다).
- 빌드 결과 폴더(`dist-sample/`)는 `.gitignore`에 넣는다. **이것만은 손으로 한다**(타입 검사·시험·빌드의 목록과 달리 저절로 더해지지 않는다).

명령(`package.json`은 고치지 않는다: 게임 폴더에 `deploy.json`이나 `server/main.ts`가 있으면 `scripts/game.mjs`·`scripts/typecheck.mjs`(타입 검사: 그 게임의 `tsconfig.json`과 `tsconfig.engine.json`)·`test/all.ts`가 스스로 찾는다. `npm run games`가 찾은 목록을 찍는다. 서버와 화면은 `scripts/game.mjs`를 거친다: 게임 폴더의 `tsconfig.json`이 있으면 `tsx --tsconfig`로 그것을 읽게 한다. 아래의 `:sample` 이름은 예제를 위해 남긴 줄임이고, 새 게임은 `node scripts/game.mjs <일> <게임>`으로 부른다):

| 스크립트 | 하는 일 |
|---|---|
| `npm run typecheck:game -- sample` | `games/sample/tsconfig.json`(틀 + 이 게임)과 `games/sample/tsconfig.engine.json`(틀만, 이 게임의 내용으로). `npm run typecheck`는 모든 게임과 틀의 설정을 함께 |
| `npm run build:sample` | `node scripts/game.mjs build sample`: `vite build -c games/sample/vite.config.ts` → `dist-sample/` |
| `npm run start:sample` | `node scripts/game.mjs start sample`: `tsx --tsconfig games/sample/tsconfig.json games/sample/server/main.ts` (기본 포트 3002) |
| `npm run dev:sample` | `watch`와 `client`를 함께: 서버(3002)와 vite 개발 서버(5174). 파일을 고치면 바로 반영 |
| `npm run test:sample` | `node scripts/game.mjs test sample`: `tsx --tsconfig games/sample/tsconfig.json games/sample/test/all.ts`. 뒤에 시험 이름을 주면 고른 것만. `npm test`도 `games/<게임>/test/all.ts`가 있는 게임을 모두 함께 돌린다 |

`tsx`를 직접 부를 때는 반드시 `--tsconfig`를 준다(`scripts/game.mjs`는 스스로 준다). 주지 않으면 뿌리의 `tsconfig.json`을 읽어 `@game`이 등불지기를 가리키고, 서버가 **오류 없이 다른 게임의 내용으로 뜬다**. 예제는 플러그인 파일의 맨 위에서 이것을 잡는다.

```ts games/sample/server/sample.ts
// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가. tsx는 --tsconfig를 주지 않으면 뿌리의 tsconfig.json을 읽어 다른 게임의 내용으로 조용히 뜬다
if (MAP !== aliased) throw new Error('별칭 @game이 games/sample을 가리키지 않습니다. tsx --tsconfig games/sample/tsconfig.json 으로 실행하세요 (npm run start:sample)');
```

## 3. 내용 채우기

`shared/content/index.ts`가 내용 계약(`engine/shared/contract.ts`)의 이름을 내보낸다. 계약은 둘로 나뉜다.

- **핵심 계약**(`CoreContent`): `MAP`과 `MODULES`. 모든 게임이 반드시 적는다. 빠뜨리면 컴파일 오류가 난다.
- **모듈의 계약**(`CombatContent`, `ItemsContent`, `GearContent`, `GrowthContent`, `MailContent`, `DungeonContent`, `SocialContent`, `EconomyContent`, 핵심의 수치 `CoreTuning`): 모두 선택이다. **적지 않은 이름은 틀이 기본값(`engine/shared/defaults.ts`)으로 채운다**: 받아 오는 줄(`export *`)도 필요 없다. 바꿀 이름만 같은 이름으로 직접 내보낸다. 적은 이름의 모양이 다르면 `contract.ts`의 맨 아래 줄에서 컴파일 오류가 난다.

쓰지 않는 모듈의 이름은 적지 않는다: 전투가 없는 게임은 직업·몬스터·무기를 정의하지 않는다(빈 표가 기본값이다). 핵심의 수치(`GUEST_NAME`, `NET`: 틱·전송 주기와 시야 반경, `CHANNEL`, `REJOIN_KEEP_S`, `CAMERA`: 화면의 카메라, `HOME_KEY`: H 키)도 바꿀 때만 적는다.

> **시야(`NET.aoi`)를 먼저 본다.** 화면은 내 둘레 `NET.aoi`(기본 **32m**) 안의 엔티티(사람, 몬스터, 게임의 종류)만 받는다. 맵이나 경기장이 그보다 넓은데 멀리 있는 것(반대편의 공, 상대 팀)이 보여야 하는 게임은 `NET`을 내보내 넓힌다: 예 `export const NET = { tickMs: 50, snapEvery: 1, aoi: 60, aoiLeave: 64 }`(굴림공. `aoiLeave`는 빠지는 반경이라 `aoi`보다 조금 크게). 넓힐수록 한 사람에게 가는 양이 는다.

```ts games/sample/shared/content/index.ts
import type { ModuleId } from '@engine/shared/modules';
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'build', 'items', 'gear', 'mail', 'daily', 'idle', 'party', 'rank', 'away', 'chars', 'morph'];
export const GUEST_NAME = 'Camper';
```

**규칙 하나**: 내용 파일은 틀에서 **타입만** 가져온다(`import type`). 값을 가져와도 되는 곳은 `@engine/shared/defaults`와 `@engine/shared/modules`다(둘 다 아무것도 읽지 않는 파일이다). 틀의 도우미(`engine/shared/defs/*.ts`)는 게임의 내용을 읽으므로, 내용 파일이 그 도우미의 값을 읽으면 서로 물려 초기화 순서가 꼬인다(실행할 때 `undefined`로 드러난다).

고른 모듈에서 직접 채우는 이름(게임의 id가 드는 것. 적지 않으면 빈 표다):

| 이름 | 모양 | 비워도 되는가 |
|---|---|---|
| `MAP` (핵심) | `MapDef`: 지역(`areas`), 가장자리, 시드, 처음 자리, 장애물, 나무·바위 뿌리는 규칙, `isFree`, 던전의 문 | `areas`는 하나 이상. 0번이 들판이다. `obstacles`, `scatter`, `portals`는 비워도 된다 |
| `CLASSES`, `DEFAULT_CLASS` (classes) | 직업 id → `ClassDef`. 직업마다 기술 id를 `SKILL_SLOTS`개(기본 3) | 전투를 쓰면 하나 이상 |
| `SKILL_DEFS` (combat) | 기술 id → `SkillDef` (효과: `hit` / `area` / `heal` / `buff` / `dash` / `dot`, 3절의 표) | 직업이 쓰는 것은 있어야 한다 |
| `MONSTERS` | 몬스터 id → `MonsterDef`. `sparks`(두 번째 재화)는 선택, `boss: true`면 필드 보스, `gearLv`면 떨어뜨리는 장비의 레벨을 따로 정한다 | `{}` 가능 (몬스터 없는 전투: 게임의 규칙이 적을 놓는다) |
| `CAMPS` (combat) | 무리의 자리와 사는 몬스터 | `[]` 가능 |
| `ITEMS`, `START_WEAPON` (items) | 아이템 id → `ItemDef` (`weapon` / `armor` / `potion` / `mat`). 처음 무기 하나는 있어야 한다 | 물약, 재료는 없어도 된다. 갑옷은 하나 두는 편이 낫다(떨어지는 갑옷 칸 장비의 바탕이 된다) |
| `SHOPS`, `SHOP_STOCK` | 상인의 자리들, 상점에 놓는 아이템 id의 차례 | `[]` 가능 (상점 없음) |
| `DROPS` | 몬스터 id → 떨어뜨리는 재료와 확률 | `{}` 가능 |
| `FORGES`, `RECIPES` | 대장간의 자리, 제작법 | `[]` 가능 (제작 없음) |
| `GEAR` | 떨어지는 장비의 수치 + 장비 레벨에 따른 무기·갑옷의 바탕 | `GEAR_BASE`에 `weaponFor`, `armorFor`를 더한다 |
| `DAILIES` | 임무 id → `{ kind, n, r }`. 틀이 세는 종류는 `kill`, `enhance` | `{}` 가능 |
| `DUNGEONS` | 던전 id → `DungeonDef`(문의 자리, 들어서는 자리, 무리, 우두머리, 하루 횟수, 제한 시간, 보상). 던전 하나는 지역 하나다: 아래 '던전 만들기' | `{}` 가능 (던전 없음) |

기본값으로 받는 이름: 핵심의 `GUEST_NAME`, `NET`(시야), `CHANNEL`, `REJOIN_KEEP_S`, `CAMERA`, `HOME_KEY`와 모듈의 `SKILL_SLOTS`, `HP_PER_LEVEL`, `ATTACK_CD`, `COMBAT`, `SLOW_FACTOR`, `REJOIN_KEEP_S`, `GUEST_NAME`, `MONSTER_ATTACK_RANGE`, `MONSTER_ATTACK_CD`, `LEASH`, `RESPAWN_S`, `MONSTER_AI`, `BOSS`, `SHOP_REACH`, `POTION_MAX`, `POTION_CD`, `MAT_MAX`, `SMITHY_REACH`, `STATS`, `GEAR_SLOTS`, `RARITIES`, `ENHANCE`, `REFORGE`, `SALVAGE`, `BAG_UP`, `BUILD_STATS`, `BUILD`, `LEVEL`, `POWER`, `MAIL_MAX`, `IDLE`, `ATTEND`, `RANK`, `PORTAL_REACH`, `PARTY`, `CHANNEL`, `GUILD`, `MARKET`, `CURRENCIES`, `ECON_*` 열 개. 모양은 `engine/shared/defaults.ts`에서 본다(값마다 주석이 있다).

끄는 법(빈 표로 내보내면 그 기능이 꺼진다):

| 끄려는 것 | 이렇게 | 화면에서 |
|---|---|---|
| 상점 | `SHOPS = []`, `SHOP_STOCK = []` | 상점 창이 열리지 않고 지도에 상점이 없다. 장비 탭의 강화 안내가 상점을 말하지 않는다 |
| 제작 | `FORGES = []`, `RECIPES = []` | 대장간 창이 없다. 강화 안내가 제작을 말하지 않는다 |
| 물약 | `kind: 'potion'`인 아이템을 두지 않는다 | 물약 단추(Q)가 없다 |
| 던전 | `DUNGEONS = {}`, `MAP.portals = {}` | 던전 창과 지도의 문이 없다 |
| 일일 임무 | `DAILIES = {}` | |
| 출석 | `export const ATTEND: readonly Reward[] = []`(7일치 보상의 목록이 비면 세지 않는다. `Reward`는 `@engine/shared/defs/growth`의 타입) | 일일 임무도 출석도 없으면 메뉴의 일일 탭이 숨는다 |
| 두 번째 재화 | 몬스터에 `sparks`를 적지 않고 이름표에 `currency2`를 적지 않는다 | 틀의 문장에서 그 몫이 빠진다 |
| 분해·가방 넓히기 | `SALVAGE`의 `item`을 비운다(기본값이 이미 꺼져 있다) | |
| 강화의 위험·재련·귀속 (켜는 쪽) | 기본값은 모두 꺼져 있다. 켜려면 `ENHANCE`에 `dropFrom`(이 단계부터 실패하면 한 단계 내려감), `charm`(보호 부적: `kind: 'token'`인 아이템의 id. 거래소에 못 올림), `dust`(단계·등급마다 드는 `SALVAGE.item`의 수), `bindPlus`(이 단계 이상은 거래소에 못 올림)를 적고, `REFORGE = { max, gold(rar, n), dust(rar) }`를 내보낸다 | 장비 창에 경고와 부적 쓰기 단추, 재련 단추가 생긴다. 예: `games/deungbul/shared/content/economy.ts` |
| 모듈 하나를 통째로 (거래소, 길드, 던전, 파티, 전투 …) | `MODULES`에서 뺀다(1절). 그 모듈의 이름도 적지 않아도 된다 | 그 창·탭·단추·키가 없다. 서버의 명령도 없다 |
| 메뉴의 탭 차례 | 화면에서 `setMenuTabs([...])`로 고른다(5절). 감추기만 하고 서버의 기능은 그대로다: 기능까지 빼려면 모듈을 뺀다 | |

- `STATS`, `GEAR_SLOTS`, `RARITIES`, `BUILD_STATS`의 id는 게임이 짓는다. 이름은 이름표(`ContentNames`)의 `gearSlots`, `rarities`, `buildStats`에 적는다.
  - 장비 옵션(`STATS`)과 능력치(`BUILD_STATS`)는 `mod`로 틀의 효과 넷 가운데 하나에 든다: `damage`(공격 피해 %), `guard`(받는 피해 감소 %, 한도 `GEAR.guardCap`), `crit`(치명타 %p), `hp`(최대 체력). 옵션과 능력치가 주는 것의 문장("공격 피해 +3%")은 이 효과로 틀이 만든다. 효과의 종류를 새로 만들려면 틀을 고쳐야 한다.
  - 예: `STATS = { atk: { base: 4, mod: 'damage' }, life: { base: 10, mod: 'hp' } }`, `BUILD_STATS = { grit: { mod: 'hp', per: 6 } }`(점수 하나에 최대 체력 +6).
  - 칸에는 `'weapon'`이 반드시 있다. 무기와 갑옷의 바탕 아이템은 `ItemDef.kind`와 같은 이름의 칸(`'weapon'`, `'armor'`)에 낀다. 갑옷 칸이 없는 게임도 된다(`games/sample/test/empty.test.ts`의 `otherGear`가 지킨다).
  - 그 밖의 칸(투구, 장화, 반지 …)에 끼는 것은 **떨어지는 장비뿐**이다: 바탕 아이템 없이 옵션(`STATS`)만 있는 장비다. `ITEMS`에 그 칸의 아이템을 만들지 않는다. 떨어질 때 칸은 `GEAR_SLOTS`에서 고르게 고른다.
  - 바탕 아이템은 `GEAR.weaponFor(lv)`·`GEAR.armorFor(lv)`가 정한다. 갑옷 칸이 없으면 `armorFor`는 불리지 않으니 아무 id(예: 무기 id)를 돌려도 된다.
  - 모양의 예: `GEAR_SLOTS = ['weapon', 'helm', 'boots'] as const`, `RARITIES = [{ id: 'plain', weight: 70, opts: 1, mult: 1 }, { id: 'rare', weight: 30, opts: 2, mult: 1.4 }]`(정확한 칸은 `engine/shared/defaults.ts`의 기본값을 베낀다).
  - 처음 무기 같은 바탕 장비는 등급 이름 `보급형`(`supply`)으로, 만든 장비는 `제작`(`made`)으로 보인다. 다른 이름을 쓰려면 이름표의 `rarities`에 `supply`, `made`를 적는다(틀의 이름을 덮어쓴다).
- `SKILL_SLOTS`는 기본 3이다(화면의 기술 단추와 단축키 1~3). 직업의 `skills`는 이 수만큼 적는다.

맵은 이렇게 생겼다. 지역 하나, 손으로 놓은 장애물 하나(모닥불), 나무와 바위를 뿌리는 규칙 둘.

```ts games/sample/shared/content/index.ts
export const MAP: MapDef = {
  areas: [{ id: 'glade', x0: -40, x1: 40, z0: -40, z1: 40 }],
  edge: 2,
  seed: 11,
  spawn: { x: 0, z: 2 },
  obstacles: [{ x: BONFIRE.x, z: BONFIRE.z, r: BONFIRE.r, tag: 'bonfire' }],
  scatter: [
    { kind: 'tree', count: 70, x0: -52, x1: 52, pad: 12, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 14, x0: -38, x1: 38, pad: -2, s0: 0.6, s1: 0.9 },
  ],
  // 야영지 둘레와 몬스터가 사는 자리는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z) > 13 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 8),
  portals: {},
  portalClear: 0,
};
```

- 칸의 뜻: `areas`의 네모(`x0`~`x1`, `z0`~`z1`)가 걸어 다닐 수 있는 땅이다. `edge`는 그 가장자리에서 이만큼 안쪽까지만 갈 수 있다는 뜻. `scatter`는 나무(`tree`)·바위(`rock`)를 `count`개 뿌리는데, `x0`~`x1`은 **x 범위**이고 z 범위는 맵 전체의 z 범위를 `pad`만큼 넓힌(음수면 좁힌) 것이다. 크기는 `s0 + 난수 × s1`. `isFree(x, z)`가 거짓인 자리에는 놓지 않는다. `portals`(던전의 문) 둘레 `portalClear` 안에도 놓지 않는다.
- **원점에서 떨어진 지역**이면 `scatter`의 `x0`~`x1`과 `spawn`, 무리의 자리를 그 지역에 맞춘다(예제는 원점 둘레라 드러나지 않는다).
- 좌표는 x(동서)와 z(남북)뿐이다. 높이는 없다.
- 같은 시드는 서버와 화면에서 같은 나무와 바위를 만든다. 운영 중에 `seed`, `scatter`의 차례, `obstacles`의 차례를 바꾸면 맵 전체가 달라진다.
- **운영 중에 맵을 넓힐 때**(새 구역): 있는 `scatter` 줄의 범위는 숫자 그대로 두고(맵의 끝 같은 이름을 쓰던 곳은 그때의 숫자로 바꿔 적는다), 새 줄은 맨 뒤에 더한다. `isFree`가 예전에 놓였던 나무 자리를 새로 막으면(늘인 길, 새 터) 난수를 쓰는 차례가 바뀌어 그 뒤가 모두 달라진다: 그 자리는 `isFree`에서 막지 말고 `clearAfter(x, z)`(선택)에 적는다. 다 뿌린 뒤에 그 자리의 나무와 바위만 뺀다(문 둘레를 치우는 것과 같은 때). 예: 등불지기의 잿불 고원(`games/deungbul/shared/content/map.ts`).
- 상인, 처음 자리, 무리의 자리는 `isFree`가 비워 주는 곳에 둔다(나무 속에 서지 않게).

직업, 기술, 몬스터, 아이템은 표다. `as const satisfies …`로 적으면 id가 타입이 되어, 다른 표나 언어 파일에서 id를 잘못 적으면 컴파일되지 않는다.

```ts games/sample/shared/content/index.ts
export const SKILL_DEFS = {
  chop: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [26, 34], stun: 1 } },
  sweep: { cd: 8, radius: 4, effect: { kind: 'area', at: 'self', dmg: [13, 19] } },
  aim: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [28, 38] } },
  snare: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [10, 15], slow: 3 } },
  rest: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  woodcutter: { hp: 200, range: 2.3, basic: [10, 15], skills: ['chop', 'sweep', 'rest'], hand: 'axe' },
  hunter: { hp: 170, range: 9, basic: [9, 13], skills: ['aim', 'snare', 'rest'], hand: 'bow', shot: 'arrow' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'woodcutter';
```

```ts games/sample/shared/content/index.ts
export const MONSTERS = {
  rabbit: { hp: 45, dmg: [2, 4], speed: 4.0, exp: 10, gold: [2, 4], aggro: 0, h: 1.4, behavior: 'flee' }, // 다치면 달아난다
  boar: { hp: 110, dmg: [6, 9], speed: 4.6, exp: 24, gold: [5, 9], aggro: 6, h: 1.8 },
  bear: { hp: 320, dmg: [10, 15], speed: 3.8, exp: 70, gold: [15, 24], aggro: 7, h: 2.8 },
} as const satisfies Record<string, MonsterDef>;
```

**떨어뜨리는 장비의 레벨**(선택): 보통은 경험치로 정한다(`GEAR.levelOf(exp)`, 등불지기는 6에서 멈춘다). 새 사냥터의 몬스터만 더 높은 장비를 떨어뜨리게 하려면 식의 상한을 올리지 말고(그러면 경험치가 많은 예전 몬스터도 함께 오른다) 정의에 `gearLv: 7`처럼 적는다. 서버의 장비 떨어뜨리기와 도감은 `gearLvOf(def)`(= `def.gearLv ?? GEAR.levelOf(def.exp)`, `@engine/shared/defs`)로 읽으므로, 게임이 장비 레벨을 셈하는 곳(도감의 표 같은 것)도 그것을 쓴다. 무기·갑옷의 바탕은 `GEAR.weaponFor/armorFor(lv)`가 그 레벨로 정한다.

**싸우는 법**(선택): 몬스터 정의의 `behavior`. 없으면 쫓아가 붙어서 때린다. 틀의 것은 둘이다.

- `'ranged'`: 사거리 `range`(기본 8m)에서 서서 쏘고, 사거리의 절반보다 붙으면 물러선다. `shot: 'arrow'`를 적으면 화면에 날아가는 것이 보인다(`registerShot`의 id).
- `'flee'`: 체력이 `fleeAt`(기본 0.3) 아래면 대상의 반대쪽으로 달아난다. 거리가 벌어지면 놓치고 집으로 돌아가 회복한다. 예제의 토끼.

게임만의 싸우는 법은 서버의 플러그인에서 `g.monsters.addBehavior('이름', (a) => boolean)`로 등록하고 정의에 그 이름을 적는다. `a`는 `{ g, m, t, d, dt, strike, walkTo }`다: `g` 게임, `m` 몬스터와 `t` 대상(둘 다 `Ent`), `d` 둘 사이의 거리(m), `dt` 이번 틱의 길이(초), `strike()` 쿨다운이 끝났으면 대상을 때리고 true, `walkTo(x, z)` 그쪽으로 한 틱만큼 걷는다(느려짐이 반영된 빠르기). true를 돌려주면 그 틱은 이 행동이 맡고, false면 같은 틱에 기본(다가가서 때리기)이 그대로 돈다. `m.x`·`m.z`를 직접 옮겨도 된다(순간 이동, 덤벼들기). 몬스터마다의 상태는 `WeakMap<Ent, …>`에 둔다. 기절(`stun`) 중이거나 우두머리가 내려치려고 힘을 모으는 동안에는 불리지 않는다. 등록하지 않은 이름을 적으면 서버를 띄울 때 한 번 알리고 기본대로 싸운다. 타입은 `@engine/server`의 `MonsterBehavior`, 예: `engine/test/fx/monsters.test.ts`의 'shove'.

```ts games/sample/shared/content/index.ts
export const ITEMS = {
  axe1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  axe2: { kind: 'weapon', price: 60, damage: 1.25, tier: 2 },
  coat: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  scale: { kind: 'armor', price: 180, guard: 0.8, tier: 2 },
  stew: { kind: 'potion', price: 12, heal: 80 },
  // 장작: 멧돼지와 곰이 떨어뜨리는 재료. 모닥불에 넣는다 (server/bonfire.ts)
  log: { kind: 'mat', price: 0 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'axe1';
export const SHOP_STOCK: readonly ItemId[] = ['stew', 'axe2', 'coat', 'scale'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  boar: { id: 'log', chance: 0.6 },
  bear: { id: 'log', chance: 1 },
};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'axe2' : 'axe1'), armorFor: (): ItemId => 'coat' };
```

- 무기는 한 줄기다. 직업마다 손에 든 모양(`hand`)만 다르고, 이름은 언어 파일이 손 모양마다 따로 준다(아이템 이름표에 손 모양의 id 칸: `bow`, `staff` …. 칸이 없으면 `name`). 틀에는 `sword` / `bow` / `staff`가 있고, 다른 모양은 화면에서 `registerHand`로 등록한다. 예제의 나무꾼은 도끼(`axe`)를 든다(`client/scene.ts`).
- 쏘는 직업의 날아가는 것(`shot`)도 같다: 틀에는 `arrow`, `bolt`가 있고, 다른 것은 `registerShot(id, { shape: 'stick' | 'ball', color, size })`. `size`는 틀의 크기에 곱하는 배율이다(기본 1: 막대는 길이 1m, 공은 반지름 0.22m). 0.35쯤이면 거의 점이 된다.
- `price: 0`은 상점에서 팔지 않는다는 뜻이다.
- 기술의 효과(`SKILL_DEFS`의 `effect`)는 여섯 가지다. 서버·화면·자동 사냥·도감이 종류만 보고 처리하므로 기술은 표에 한 줄 더하면 된다.

| 종류 | 하는 일 | 덧붙일 수 있는 것 |
|---|---|---|
| `hit` | 대상 하나에게 피해 | `slow`(느려짐 초), `stun`(기절 초: 움직이지도 때리지도 못한다) |
| `area` | 나나 대상 둘레(`radius`)의 적 모두에게 피해 | `slow` |
| `heal` | 체력 회복 | `allies`(둘레의 아군도) |
| `buff` | `dur`초 동안 강화: `mod`가 `damage`(주는 피해 ×(1+value)), `guard`(받는 피해 ×(1−value)), `regen`(회복 ×(1+value)), `crit`(치명타 +value) | `allies`. 같은 기술은 겹치지 않고 시간이 새로 흐른다. 화면의 내 정보 창에 남은 시간이 뜬다 |
| `dash` | 대상 앞까지(없으면 바라보는 쪽으로) `dist`만큼 단숨에 | `dmg`, `stun` |
| `dot` | 1초마다 `dps`씩 `dur`초 동안(독, 화상). 맞은 몬스터는 건 사람을 쫓는다 | `area`(대상 둘레 `radius`의 적 모두) |

  강화의 예(아군까지): `rally: { cd: 20, radius: 6, effect: { kind: 'buff', mod: 'damage', value: 0.5, dur: 6, allies: true } }`. `allies`·`area`를 쓰는 효과는 범위 `radius`를 함께 적는다. 예제의 내려찍기는 `hit`에 `stun: 1`을 붙였다. 시험용 내용(`engine/test/fx/shared/content`)에 여섯 가지가 모두 있다(`rally`, `ward`, `charge`, `venom` …).
- 두 번째 재화(`sparks` 칸)를 쓰려면 몬스터에 `sparks: [최소, 최대]`를 적고 이름표에 `currency2: { name: '물방울', one: 'droplet' }`(`name`: 값 앞의 이름, `one`: 영어에서 수를 셀 때의 단수형)을 적는다. 처치·우편·자리 비움의 문장에 그 이름이 들어가고, 내 정보 창의 체력 줄 오른쪽에 가진 양이 보인다(`#coin`. 자기 표시를 따로 그리는 게임은 css로 `#coin { display: none; }`). 쓰지 않으면 둘 다 적지 않는다: 틀의 문장과 화면에서 그 몫이 빠진다.
- 첫 번째 재화(`gold` 칸)의 이름은 이름표의 `currency1`(`{ name, unit }`: 값 앞의 이름 '골드 100', 수 뒤의 낱말 '100골드')로 준다. 적지 않으면 골드다.
- 재화의 상한은 `CURRENCIES`의 `max`다. 틀은 더할 때와 저장을 읽을 때 모두 이 값으로 자른다.
- 계약에 없는 내용(이 게임만의 수치)은 다른 파일에 둔다. 예제의 `games/sample/shared/content/bonfire.ts`가 그렇다. 틀은 읽지 않고 게임의 서버와 화면만 읽는다.

**선택 기능의 완전한 예**(던전과 우두머리, 대장간과 제작법, 두 번째 재화, 필드 보스, 일일 임무, 분해·가방 넓히기)는 예제 게임에는 없고 틀의 시험용 내용 `engine/test/fx/shared/content/index.ts`("시험 들판")에 모두 있다. 그 파일의 해당 줄을 베껴 id와 수치만 바꾸면 된다.

**던전 만들기**: 던전 하나는 지역 하나다.

- `MAP.areas`에 들판과 떨어진 네모를 더하고, 그 **지역 id를 던전 id와 같게** 짓는다. 틀은 내가 서 있는 지역의 id로 던전 정의를 찾는다(밖으로 나갈 때 등).
- 문은 들판 안의 한 자리다: `DungeonDef.portal`과 `MAP.portals[던전 id]`에 같은 좌표를 적는다(앞의 것은 들어가는 곳, 뒤의 것은 그 둘레에서 나무와 바위를 치우는 자리). 상수 하나를 두 곳에 넣으면 어긋나지 않는다.
- `entry`(들어서는 자리), `packs`(무리), `boss`(우두머리)의 좌표는 그 던전 지역 안이다.
- 나머지 칸: `minLv` 이 레벨부터 들어간다, `perDay` 하루에 들어가는 횟수(자정에 새로), `timeS` 제한 시간(초, 넘기면 실패하고 밖으로), `exitS` 우두머리를 잡은 뒤 밖으로 나가기까지(초), `reward` 끝냈을 때 각자 우편으로 받는 보상(`Reward`), `dropRar`·`dropLv` 끝냈을 때 각자 받는 장비의 가장 낮은 등급(`RARITIES`의 번호)과 장비 레벨. 던전의 우두머리 몬스터에는 `boss: true`를 붙이지 않는다(그것은 들판의 필드 보스: 사람 수에 따라 체력이 늘고 내려친다).
- 땅은 지역마다 틀이 깔고 게임의 `look.ground`가 칠한다(5절). 던전의 바닥을 다르게 하려면 `ground`에서 그 지역의 좌표일 때 다른 색을 주거나, `scenery`에서 바닥 판을 조금 위(y 0.02쯤)에 깐다.
- 들어가기는 문 곁에서 던전 창의 '들어가기'(명령 `{ t: 'dungeon', id }`)다.

여기까지 하면 `npm run typecheck:game -- sample`이 통과해야 한다.

## 4. 서버 띄우기

```ts games/sample/server/main.ts
// 저장소 뿌리: 저장(data/)과 빌드된 화면(dist-sample/)은 뿌리에 둔다. 등불지기(3001, data/game.db, dist/)와 겹치지 않는 포트와 폴더를 쓴다
const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3002, db: path.join(root, 'data', 'sample', 'game.db'), dist: path.join(root, 'dist-sample'), plugins: [installSample] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
```

`runServer`(`engine/server/run.ts`)가 환경 변수를 읽고, 저장소를 열고, 종료 신호에 저장하고 끈다. 규칙이 아직 없으면 `plugins: []`로 둔다. 틀만으로 돈다.

| 환경 변수 | 뜻 |
|---|---|
| `PORT` | 포트 (없으면 `runServer`에 준 값) |
| `DB` | 저장 파일. `memory`면 저장하지 않는다 |
| `BOTS` | 돌아다니며 싸우는 봇 수 |
| `DEV_SPAWN=x,z` | 처음 자리 대신 그 좌표에서 접속 |
| `METRICS=10` | 10초마다 서버 지표 한 줄 |
| `BACKUP_EVERY_MIN=360` | 자동 백업 간격(분). 0이면 켜질 때만 (9절 '운영') |
| `BACKUP_KEEP=20` | 남겨 둘 자동 백업 수 |
| `BACKUP=0` | 자동 백업을 끈다 |
| `COMPRESS=0` | WebSocket 압축을 끈다 (기본 켬) |

- **게임마다 포트와 저장 폴더를 따로 준다.** 서버는 저장 파일 옆의 `stop.flag` 파일을 보면 저장하고 꺼진다. 두 서버가 한 폴더를 쓰면 서로를 끈다.
- 이 저장소에서 쓰는 포트(새 게임은 비어 있는 것을 고른다. 서버의 포트는 `server/main.ts`·`deploy.json`·`vite.config.ts`의 `VITE_DEV_PORT` 셋이 같아야 한다):

| 포트 | 쓰는 곳 | vite 개발 서버 |
|---|---|---|
| 3001 | 등불지기 `games/deungbul` (운영) | 5173 |
| 3002 | 예제 `games/sample` | 5174 |
| 3015~3017 | 확인용으로 잠깐 띄우는 서버(공 마당 `engine/test/core`의 기본 3015, 검증 작업). 오래 쓰지 않는다 | |
| 0 | 시험(`startServer(0)`: 빈 포트를 고른다) | |
- 서버는 `dist` 폴더의 화면을 같은 포트로 내보낸다. 화면을 빌드하지 않았으면 접속만 되지 않을 뿐 서버는 돈다.

```
npm run build:sample
npm run start:sample          # http://localhost:3002
```

## 5. 화면 띄우기

### 진입점

`index.html`은 머리와 script뿐이다. body의 마크업(틀의 창 전부)은 틀이 붙인다.

```html games/sample/client/index.html
<body><script type="module" src="./main.ts"></script></body>
```

```ts games/sample/client/main.ts
// 차례가 중요하다: (1) 언어 묶음을 등록하고 (2) 이 게임의 창을 붙인 뒤에 (3) 틀을 시작시킨다. 틀은 시작하면서 화면의 글자를 채운다
setLocales(LOCALES);
mountBonfire();
startClient({
  look,
  // 이 게임의 모듈: 적은 차례대로 init되고, 틀의 덧붙는 모듈(상점, 가방, 메뉴 …)보다 먼저다
  modules: [initBonfire, initScene, initCharStands, initTutorial],
});
```

- `look`도 `modules`도 주지 않으면 기본 색의 빈 들판에 틀의 화면만 뜬다. 내용과 서버만 만든 단계에서 그렇게 띄워 볼 수 있다.
- 모듈은 `() => void` 함수다. 그 안에서 틀의 접점에 스스로 등록한다(11절). **등록한 차례가 불리는 차례이고 그리는 차례다.**
- 화면의 요소는 모듈이 읽히는 때가 아니라 **init 안에서** 잡는다(`$('id')`). 게임의 창은 진입점의 본문에서 붙으므로, 모듈이 읽히는 때에는 아직 없다.

### 문장

화면의 글은 코드에 직접 쓰지 않는다. 언어 파일에 두고 `t('키')`, `L().fmt.키(값)`로 읽는다. 마크업에는 `data-i18n="키"`를 적어 두면 틀이 채우고, 언어를 바꾸면 다시 채운다.

언어 파일 하나는 두 부분이다.

1. **이름표**(`ContentNames`): 내용의 id마다 이름. 틀의 문장이 문장 안에 넣는다. id를 빠뜨리면 컴파일되지 않는다.
2. **게임의 문장**: `ui`(고정 문구), `fmt`(값이 들어가는 문구), `msg`(서버 안내문). 틀의 문장과 같은 키를 적으면 틀의 것을 덮어쓴다.

```ts games/sample/client/i18n/ko.ts
export const koNames: ContentNames = {
  monsters: { rabbit: '산토끼', boar: '멧돼지', bear: '불곰' },
  // bow: 활을 드는 직업(사냥꾼)에게 보이는 이름
  items: {
    axe1: { name: '손도끼', bow: '나무 활', info: '기본 무기' },
    axe2: { name: '벌목 도끼', bow: '사냥 활' },
    coat: { name: '털가죽 옷' },
    scale: { name: '쇠비늘 조끼' },
    stew: { name: '고기 스튜' },
    log: { name: '장작', info: '멧돼지와 불곰이 떨어뜨립니다. 모닥불에 넣습니다' },
  },
```

틀의 뼈대가 쓰지만 틀에 기본 문장이 없거나 게임의 말이어야 하는 키는 게임이 채운다. 뼈대(`engine/client/hud/skeleton.ts`)의 글 가운데 게임이 채울 것:

| 키 | 어디에 | 틀의 기본 | 채우는 게임 |
|---|---|---|---|
| `title` | 접속 화면의 제목, 브라우저 탭 | '게임' / 'Game' | 모든 게임 |
| `hint` | 화면 아래의 조작 안내(PC) | 고른 모듈의 키만 적은 안내(H는 `HOME_KEY`일 때) | 게임의 키(`onKey`)가 있는 게임. 한 줄은 `keyHints([...])`로 잇는다 |
| `mapLegend` | 미니맵 아래의 범례 | 틀이 찍는 점만('가운데 나 · 흰 점 사람', 전투가 있으면 '붉은 점 몬스터', 파티가 있으면 '하늘색 파티원') | `addMarks`로 표식을 찍는 게임 |
| `intro`, `classHint` | 직업 고르기 창의 소개와 아래 안내 | **없다**(빈 칸) | `classes`를 고른 게임 |
| `goingTown` | H(집으로)를 눌렀을 때의 알림 | '처음 자리로 걸어갑니다.' | `rules.home`을 정한 게임 |

```ts games/sample/client/i18n/ko.ts
    // 틀의 뼈대가 쓰는 글 가운데 게임이 채우는 것: 제목, 직업 고르기 창의 소개와 안내, 조작 안내, 미니맵 범례
    title: '모닥불 사냥터',
    intro: '숲속 야영지의 사냥꾼이 됩니다. 짐승을 잡아 장작을 모으고, 모닥불을 지펴 함께 몸을 녹이세요.',
    classHint: '직업은 나중에 모닥불 곁에서 바꿀 수 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 스튜', 'F: 장작 넣기', 'R: 자동 사냥', 'H: 모닥불로', 'B: 가방', 'M: 메뉴', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 모닥불 · 초록 상인',
    // 틀의 기본 문장을 이 게임의 말로 덮어쓴 것
    goingTown: '모닥불로 걸어갑니다.',
```

- 틀의 문장 키(`ui`, `fmt`, `msg`)는 `engine/client/i18n/ko.ts`의 `koBase`에 모두 있다. 게임이 같은 키를 적으면 덮어쓴다(예: `ui.changeClass`, `ui.shop`, `fmt.potions`).
- 이름표의 칸: `monsters`, `items`(손 모양 id 칸 포함), `classes`, `skills`, `dungeons`(`{ name, info }`), `dailies`, `gearSlots`, `rarities`(틀의 `supply`·`made`도 덮어쓸 수 있다), `buildStats`, `places`, `currency1`·`currency2`(선택), `nameA`·`nameB`(처음 접속할 때의 무작위 이름). 모양은 `engine/client/i18n/names.ts`의 `ContentNames`.
- `places`는 **쓰러진 뒤 다시 일어나는 곳의 이름**이다: 서버의 `g.rules.respawn`이 돌려주는 `id`가 열쇠다(예제: 모닥불 앞 `bonfire`). 일어나는 곳을 정하지 않은 게임은 id가 빈 문자열이고, 틀은 '처음 자리'라고 적는다. 다른 이름을 쓰려면 `places: { '': '동굴 입구' }`.
- `[[PC용|터치용]]`으로 적으면 입력 장치에 맞는 쪽이 보인다. `'장작 넣기[[ (F)|]]'`는 폰에서 `(F)`가 빠진다. 푸는 것은 `t()`·`data-i18n`이다: `L().ui.x`를 직접 읽어 화면에 넣을 때는 `forInput(글)`(`@engine/client/i18n`)을 거친다.
- 틀의 문장에서 덮어쓸 만한 것: `ui.shop`(상인의 이름표. 틀의 기본은 '상인'), `msg.shopFar`, `ui.forge`, `ui.bagMats`, `ui.bagPotions`, `fmt.potions`(물약 단추), `msg.loot`(틀의 기본 문장은 "대장간에서 쓸 수 있습니다"로 끝난다), `msg.classFar`, `msg.bossUp`, `msg.died`. 전체는 `engine/client/i18n/ko.ts`에 있다.

합치고, 틀의 타입에 이 게임의 문장 모양을 알린다.

```ts games/sample/client/i18n/index.ts
// 틀의 확장 지점에 이 게임의 문장 모양을 더한다: L()과 t()가 이 게임의 키(t('bonfire'), L().fmt.heat)까지 본다
declare module '@engine/client/i18n/ext' {
  interface LocaleExt extends GameLocale {}
}

/** 이 게임이 갖춘 언어들. 맨 앞이 기본 언어다 */
export const LOCALES: readonly Locale[] = [mergeLocale(koBase(koNames), koGame), mergeLocale(enBase(enNames), enGame)];
```

언어를 하나만 두려면 목록에 하나만 넣는다. 틀의 문장은 한국어(`koBase`)와 영어(`enBase`)가 있다.

### 겉모습

`startClient`의 `look`으로 넘기는 것: 땅의 색, 잎의 색, 건물. 땅은 틀이 **지역마다** 한 장씩 깔고(들판은 둘레 40, 다른 지역은 10을 더 넓게), `ground(x, z, 난수, 색)`이 그 자리의 색을 칠한다. 던전처럼 다른 지역은 좌표로 가려 다른 색을 준다.

```ts games/sample/client/scene.ts
export const look: Look = {
  // 야영지 둘레는 흙바닥, 그 밖은 가을 풀빛
  ground: (x, z, j, c) => { if (Math.hypot(x - BONFIRE.x, z - BONFIRE.z) < 9) c.copy(dirt); else c.copy(grass[0]).lerp(grass[1], j); },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
```

모듈의 init에서 등록하는 것: 몬스터 모델, 사람 모델, 손 모양, 무기와 갑옷의 모습, 분위기, 미니맵의 바탕, 모델과 소리 파일(아래 '모델 파일과 애니메이션', '소리 파일과 배경음').

```ts games/sample/client/scene.ts
export function initScene(): void {
  for (const type of Object.keys(BEASTS)) registerMonsterModel(type, beast);
  // 사람 모델: 틀의 사람형(defaultHumanoid)에 털모자를 얹는다. 머리째 바꾸려면 m.head를 지우고 새로 붙인다. 손 모양은 틀이 이미 붙였다.
  // 부품으로 된 겉모습(look.look: 캐릭터 정의·변신)이면 그 부품대로 그리고 털모자는 얹지 않는다 (모자는 겉모습의 칸이다)
  setHumanoidBody((look) => {
    const m = defaultHumanoid(look);
    if (!look.look) m.head?.add(part(new THREE.CylinderGeometry(0.3, 0.32, 0.22, 6), mat(0x8a3a2a), 0, 0.36, 0));
    return m;
  });
  // 나무꾼의 손 모양(직업 정의의 hand: 'axe'): 오른손에 든 자루와 도끼날. 돌려준 도끼날이 무기의 겉모습(registerBlade)을 따른다
  registerHand('axe', ({ rig }) => {
    const handle = part(new THREE.BoxGeometry(0.09, 1.1, 0.09), mat(0x7a5a3a), 0, -0.7, 0.45);
    handle.rotation.x = Math.PI / 2;
    const head = part(new THREE.BoxGeometry(0.1, 0.34, 0.42), mat(0xd8dde0), 0, 0.42, 0.16);
    handle.add(head);
    rig.ra.add(handle);
    return head;
  });
  registerBlade('axe2', { color: 0xffd9a0, scale: 1.25, glow: false });
  registerArmor('coat', { color: 0x8a6a48, pads: false });
  registerArmor('scale', { color: 0x8f969e, pads: true });
  // …
  // 분위기: 저녁 빛 (하늘과 안개의 색, 두 빛의 세기, 안개의 거리)
  view.setMood({ sky: 0xd9b48a, hemi: 1.9, sun: 2.1, fogNear: 52, fogFar: 115 });
  // 미니맵의 바탕: 지역은 풀빛, 야영지는 흙빛
  setMapPaint((b) => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, '#5d7040'); b.disc(BONFIRE.x, BONFIRE.z, 9, '#8a744e'); });
```

- **그림**(선택): 그림 한 장에 아이콘 여러 개를 고른 칸(열 × 행)으로 담은 시트를 게임의 `client/public/`에 두고(`vite.config.ts`의 `publicDir: false` 줄을 지워야 그 폴더가 빌드에 들어간다: 2절) `addIconSheet('./items/a.webp', 열, 행, [열쇠 …], 손 모양?, filter?)`으로 등록한다(filter: 같은 칸을 css filter로 색만 바꿔 다른 아이템에 쓴다. 예 `'hue-rotate(160deg)'`)(열쇠는 위 줄 왼쪽부터의 차례, 빈 칸은 `null`. `addItemSheet`는 같은 함수). 열쇠: 아이템 id(가방·상점·대장간·물약 단추·메뉴의 장비), `slot:<장비 칸>`(바탕 아이템이 없는 떨어진 장비, 예 `slot:ring`), `cur:gold`·`cur:second`(내 정보 창의 재화), `ui:mail`(우편 줄). 무기는 직업의 손 모양마다 이름이 다르므로 손 모양을 주고 등록한다(`'sword'`로 등록한 그림은 검을 드는 직업에게만, `'bow'`는 활). 등록하지 않은 것은 글자만 보인다. **배경은 투명하게**(PNG도 되고, 줄이려면 WebP: 저장소에 변환 도구는 없다. 그림 도구나 브라우저의 캔버스 `toDataURL('image/webp')`로 바꾼다): 칸 뒤의 바탕색은 css의 `--icon-bg`로 게임이 정하므로, 투명한 그림은 어느 게임의 창 색에서도 자연스럽다(배경을 칠한 그림은 그 색의 창에서만 맞는다). 한 칸 256px쯤이면 폰에서도 선명하다. 등불지기: `games/deungbul/client/public/items/`의 넷(`sheet.webp` 소모품·재료, `gear.webp` 검·갑옷, `hands.webp` 활·지팡이, `trinkets.webp` 장신구·재화·우편), 등록은 `client/scene/models.ts`.
- 사람 모델(플레이어, 상인, NPC, 사람형 몬스터 모두)을 바꾸려면 `setHumanoidBody((look) => Model)`. `look`은 옷 색(`cloth`), 손 모양(`hand`), 살갗(`skin`)이다. 옷 색은 틀이 정한다(나는 붉은 옷, 남은 id마다 열 가지 가운데 하나): 사람마다 게임이 정하려면(팀 색) 6절 '사람마다의 값과 겉모습'의 `setPlayerLook`. 조금만 바꾸려면 위처럼 `defaultHumanoid(look)`을 불러 고치고(`m.head` 머리, `m.rig` 팔다리), 몸을 처음부터 짜려면 팔다리 넷 `rig`(`{ ll, rl, la, ra }`, `limb`으로 만든다)을 두고 손은 `attachHand(look.hand, { root, rig, cloth: 재질 })`로 붙인다(틀의 검·활·지팡이와 게임이 등록한 손 모양이 그대로 붙는다). 무기의 겉모습은 돌려준 `blade`로 따라간다.
- 모델을 등록하지 않은 몬스터는 눈 달린 덩어리로 뜬다. 먼저 띄우고 나중에 꾸며도 된다.
- 모델의 약속: 발이 원점, +Z를 바라본다. `{ root, legs }`를 돌려주면 네발 걸음(`legs`는 `limb()`가 돌려준 다리 묶음 넷의 배열: 앞왼, 앞오른, 뒤왼, 뒤오른), `{ root, rig }`면 사람 걸음(`rig`는 팔다리 넷 `{ ll, rl, la, ra }`), `{ root, blob }`이면 통통 튀는 동작을 틀이 입힌다(`blob`은 묶음이 아니라 **메시 하나**: `part(…)`가 돌려준 것). 크기를 바꾸려면 안쪽 묶음에 준다(틀이 쓰러지는 연출에서 `root`의 크기를 바꾼다).
- 창의 색은 css 변수로 정한다. 게임의 css는 틀의 것 뒤에 읽혀 덮어쓴다(모듈에서 `import './sample.css'`).

```css games/sample/client/sample.css
:root {
  --sky: #d9b48a;
  --ink: #1d1712;
  --ink-rgb: 29, 23, 18;
  --panel: rgba(var(--ink-rgb), .86);
  --cover-rgb: 20, 14, 9;
  --line: rgba(255, 190, 120, .3);
  --gold: #ffb057;
}
```

- 틀의 색 변수: `--sky`(문서 바탕), `--ink`와 `--ink-rgb`(창의 바탕색. 둘을 같은 색으로: 반투명한 바탕들이 `--ink-rgb`를 쓴다), `--panel`, `--cover-rgb`(화면을 덮는 막), `--line`, `--fg`, `--dim`, `--gold`, `--on-gold`(금빛 단추 위의 글자), `--good`·`--bad`·`--ally`(좋음·나쁨·파티원), `--hp`, `--xp`, `--icon-bg`(그림 칸의 바탕), `--font`, `--mono`. 기본값과 뜻은 `engine/client/style.css`의 맨 위.

### 카메라 (선택)

카메라는 각도가 고정된 쿼터뷰이고, 비추는 곳에서 `CAMERA.dist × 배율`(m) 떨어져 있다. 기본은 내 캐릭터를 비추고, 휠·두 손가락이 배율을 바꾼다.

- **거리와 배율의 범위**: 내용에 `CAMERA`를 내보낸다. 기본값(`engine/shared/defaults.ts`)은 `{ dist: 46, zoom: 1, zoomMin: 0.6, zoomMax: 1.15, gate: 1.05 }`: `zoom` 처음 배율, `zoomMin`~`zoomMax` 휠·두 손가락의 범위(작을수록 가깝다), `gate` 접속 전에 처음 자리를 둘러볼 때의 배율. 지금의 배율은 `S.zoom`.
- **비추는 곳**: 화면 모듈의 init에서 `setCameraAim((me, now) => …)`(`@engine/client`). 매 프레임 불리고 `{ x, z, zoom? }`을 돌려주면 그곳을(`zoom`을 주면 그 배율로), `null`이면 그 프레임은 틀의 기본(나, 접속 전에는 처음 자리)이다. `me`는 내 자리(접속 전이면 `null`). 되돌리려면 `setCameraAim(null)`.
- **네모 하나가 다 보이게**: `fitZoom(x0, z0, x1, z1, margin?)`이 그 네모가 화면에 드는 가장 작은 배율을 준다(화면의 비율을 따른다: 폰 세로는 훨씬 크다). 너무 멀면 안개(`view.setMood`의 `fogFar`)와 카메라의 그리는 거리(320m)에 걸리므로 `Math.min(CAMERA.zoomMax, fitZoom(…))`처럼 자른다.
- 예(굴림공 `games/rollball/client/pitch.ts`): 팀을 고르기 전과 V 키를 누른 동안은 경기장 전체(`fitZoom`), 그 밖에는 나와 공 사이(공 쪽으로 40%)를 비추고, 바뀔 때는 게임이 값을 조금씩 옮겨 부드럽게 한다. 내용은 `CAMERA = { dist: 46, zoom: 1.5, zoomMin: 0.8, zoomMax: 2.4, gate: 1.6 }`, 안개는 멀리(`fogNear: 120, fogFar: 240`).
- 그림자는 비추는 곳 둘레 ±36m에만 진다.
- **폰 세로의 밀린 화면**: 폰 세로(높이 > 너비 × 1.3, 너비 < 600)에서 틀은 그리는 범위를 너비의 12%만큼 밀어 둔다(오른쪽에 쌓이는 창과 조이스틱 자리): 비추는 곳이 화면 가운데보다 조금 왼쪽에 그려진다. 판·경기장 전체를 한가운데 두려면 `{ x, z, zoom, center: true }`를 돌려준다(`fitZoom`은 밀린 범위를 이미 따른다).
- **카메라 돌리기**: `setCameraYaw(라디안)`(`@engine/client`, 0이 틀의 쿼터뷰: 카메라가 비추는 곳의 +x+z 쪽 위에 있어 화면 아래가 +x+z다. 각만큼 세로축으로 돌고(`applyAxisAngle(위, yaw)`: π/2면 카메라가 +x−z 쪽), π면 반대편에서 본다. 자리마다 돌리는 예는 14절 '화면'). 내려다보는 각도는 그대로다. 방향키·조이스틱의 걷는 방향, `view.pick`, `fitZoom`이 함께 따른다. 지금 각은 `cameraYaw()`(`view.yaw`). 화면을 늘 보는 것(머리 위 표식)은 `π/4 + view.yaw`를 기준으로 돌린다.
- **방향의 규약**: 엔티티의 `face`는 `atan2(dx, dz)`(모델은 +Z를 바라본다: 화면이 `rotation.y = face`).

### 단축키 (`onKey`)

`onKey(키, fn)`의 키는 `KeyboardEvent.key`를 **소문자로** 맞춘 값이다: 글자는 `'f'`(대문자로 눌러도 같다), 스페이스는 `' '`, 방향키는 `'arrowup'` 같은 이름, 숫자는 `'1'`. 글자를 입력하는 중(대화창)과 접속 전에는 불리지 않는다.

- **틀의 키가 먼저다**: 핵심의 M(메뉴), N(지도), H(집으로), 그리고 고른 모듈의 키(전투: 숫자·Tab, 아이템: Q·B, 자동 사냥: R)는 `onKey`로 등록해도 불리지 않는다. Enter(대화)와 Esc(멈춤, 지도 닫기)는 늘 틀의 것이다.
- **이동 키**(W, A, S, D, 방향키)를 `onKey`로 등록하면 그 키는 더 이상 걷는 데 쓰이지 않는다.
- **H(집으로)**: 가는 곳은 `rules.home`(없으면 `MAP.spawn`), 알림은 `goingTown`, 안내는 게임의 `hint`. 이 게임에 '집'이 없으면 내용에 `export const HOME_KEY = false;`: 틀이 H를 달지 않고 기본 조작 안내에도 없다. H는 비어 게임이 `onKey('h', …)`로 쓸 수 있다. 굴림공은 H를 '우리 진영으로'로 바꿔 쓴다(`rules.home`이 내 팀의 진영 가운데).

### 모델 파일과 애니메이션 (선택)

코드 모델 대신 glTF/GLB 파일을 쓸 수 있다. 몬스터 종류, 사람(직업별 또는 모두), 무기마다 등록하고, **등록하지 않은 것은 지금처럼 코드 모델**이다. 파일은 `client/public/models/`에 둔다(`vite.config.ts`에 `publicDir: false`가 없어야 빌드에 들어간다).

```ts games/sample/client/scene.ts
  // 모델 파일: 곰과 멧돼지는 뼈대 애니메이션 모델 하나를 크기와 털빛만 바꿔 쓴다 (클립 idle/walk/attack/hit/die). 토끼는 위의 코드 모델 그대로
  registerMonsterAsset('bear', { url: './models/beast.glb', height: 2.3, tint: { fur: 0x5a4030 } });
  registerMonsterAsset('boar', { url: './models/beast.glb', height: 1.4, tint: { fur: 0x7b5a44, belly: 0x9a7a5a } });
  // 사람(모든 직업, 상인): 틀의 사람과 같은 크기의 야영꾼. 팔 뼈에 틀의 손 모양(도끼, 활)이 붙고, 옷과 살갗은 사람마다 칠한다.
  // 갑옷: 몸통(재질 torso)을 갑옷 색으로 칠하고, 틀의 덧대기(가슴받이·허리띠·어깨받이)를 등뼈(spine)에 붙인다
  registerHumanoidAsset({
    url: './models/camper.glb', arms: { left: 'arm_l', right: 'arm_r' }, paint: { cloth: ['cloth', 'torso'], skin: 'skin' },
    armor: { tint: ['torso'], attach: 'spine' },
  });
  // 도끼(손 모양 axe의 무기 전부): 도끼날 자리에 양날 도끼 머리
  registerWeaponAsset('axe', { url: './models/axe.glb', height: 0.5 });
```

- **바꿔 끼우기**: 코드 모델(`registerMonsterModel`의 것, 없으면 눈 달린 덩어리. 사람은 `setHumanoidBody`의 것)을 먼저 세우고, 파일을 다 읽으면 그 모델의 안을 파일의 것으로 바꾼다. 접속 화면은 등록한 파일을 다 읽을 때까지(길어도 12초) 진행 막대를 보이며 기다리므로, 보통은 처음부터 파일의 모델이 보인다. **읽지 못하면 콘솔에 경고 한 줄**을 남기고 코드 모델이 그대로 남는다(게임은 그대로 돈다).
- 같은 파일은 한 번만 읽고 엔티티마다 복제한다(뼈대가 있으면 `SkeletonUtils.clone`). 같은 파일을 크기와 색만 바꿔 여러 종류에 쓸 수 있다: `tint`는 재질 이름 → 색.
- **맞추는 값**(`ModelFit`): `height`(경계 상자의 높이를 이 값으로) 또는 `scale`(배율, 기본 1), `lift`(바닥을 땅에 붙인 뒤 더 올리는 높이), `ground`(기본 true: 경계 상자의 바닥을 땅에. false면 파일의 원점이 발), `turn`(돌리는 각, 도. 파일의 앞이 -Z면 180), `shadow`(그림자, 기본 true). 틀의 약속은 코드 모델과 같다: 발이 원점, +Z를 바라본다.
- **사람**: `registerHumanoidAsset(파일, 직업?)`. 직업을 주면 그 직업만, 주지 않으면 모두(직업 것이 없는 직업, 상인, NPC). `arms`는 틀의 손 모양(검·활·지팡이와 `registerHand`의 것)을 붙일 팔 뼈 이름 둘: 뼈는 쉬는 자세에서 회전 없이 어깨에 있어야 한다. 틀의 사람과 같은 크기(키 약 2.1, 어깨 높이 약 1.48, 팔 길이 약 0.7)로 만들면 손 모양의 자리가 그대로 맞는다. `paint`는 사람마다 칠할 재질 이름(`cloth` 옷 색, `skin` 살갗. 여럿이면 목록). `setHumanoidDeco`의 꾸밈은 맨 위 뼈에 붙는다.
- **사람의 갑옷**(`armor`): 입은 갑옷(`registerArmor`의 색과 `pads`)을 파일의 사람에 보이는 법. 주지 않으면 파일의 사람에는 갑옷이 보이지 않는다(코드 사람은 늘 틀의 자리에 덧댄다).
  - `tint: ['torso']`: 갑옷 색으로 칠할 이름들. 메시·노드의 이름(그 아래의 메시 모두)이나 재질의 이름. 갑옷을 벗으면 본래 색(옷 색 포함)으로 돌아간다. 뼈대 모델은 스킨 메시가 뼈 아래에 있지 않으므로 보통 **재질 이름**으로 고른다(예제는 몸통에 재질 `torso`를 따로 두고 `paint.cloth`에도 넣었다).
  - `attach: 'spine'`: 틀의 덧대기(가슴받이·허리띠, `pads`면 어깨받이)를 붙일 뼈·노드. 쉬는 자세에서 코드 사람과 같은 자리(모델 원점 기준, 가슴 높이 약 1.2)에 놓이고 그 뼈를 따라 움직인다. 틀의 사람과 크기가 같은 모델에 맞는다.
  - 둘 다 써도 되고 하나만 써도 된다. 이름이 모델에 없으면 그 부분은 아무것도 하지 않는다(콘솔에 경고 한 줄). 이름은 같은 이름 → 대소문자만 다른 이름 → `Armature|torso`의 `|` 뒤의 차례로 맞춘다.
- **무기**: `registerWeaponAsset(id, 파일)`. id는 무기 아이템의 id(그 무기만) 또는 손 모양의 id(그 손의 무기 전부). 손 모양이 돌려준 부분(칼날·도끼날·활대·지팡이)의 자리에 놓고 그 부분을 숨긴다. 모델은 위가 +Y, 가운데가 그 자리에 온다. 길이는 `height`(기본: 숨긴 부분의 길이), 크기는 `registerBlade`의 `scale`을 따른다. 코드 사람과 파일 사람 모두에 붙는다.
- **애니메이션**: 클립 이름은 `idle`(서 있기), `walk`(걷기), `attack`(공격), `hit`(맞음), `die`(쓰러짐). 다르면 모델마다 `clips: { walk: 'Run' }`, 모든 모델에 `setClipNames({ … })`. 대소문자와 `Armature|Walk`처럼 앞에 붙은 이름은 알아서 맞춘다. 서 있기·걷기는 반복하고, 공격·맞음·쓰러짐은 한 번 튼다. 공격은 서버의 공격 사건(코드 모델이 팔을 휘두르는 바로 그 신호)마다 처음부터 튼다. 맞음은 공격 중이면 끊지 않는다. 상태 사이는 `fade`초(기본 0.2) 섞고, `speed`로 상태마다 빠르기를 바꾼다(`speed: { walk: 1.2 }`).
- **클립이 없는 상태는 틀의 코드 흔들기**: 걸을 때 통통 튀고, 공격할 때 살짝 뛰고, 쓰러질 때 줄어든다. 쓰러짐 클립이 있으면 그것을 다 틀고 0.5초 누워 있다가(모두 2.5초까지) 사라진다. 틀의 걸음은 한 주기 약 0.63초다: 걷기 클립이 이동 속도와 맞지 않아 미끄러져 보이면 `speed.walk`로 맞춘다.
- **성능**: 믹서는 내 캐릭터에서 22m 안이면 매 프레임, 40m 안이면 2프레임, 그 밖은 4프레임, 화면 밖은 8프레임마다 돈다(건너뛴 시간은 모아서 넘긴다). 모델 파일을 하나도 등록하지 않은 게임의 번들에는 읽는 코드와 three.js의 애니메이션 코드가 들어가지 않는다. 읽는 도구(GLTFLoader, 약 46KB)는 처음 읽을 때 따로 받는다.
- **파일의 크기와 형식(권장)**: GLB(파일 하나에 다 든다). 몬스터·사람 하나에 삼각형 수백~2천 개, 뼈 30개 아래, 파일 100KB 아래(텍스처를 쓰면 한 장 256~512px, 여러 엔티티가 나눠 쓴다). 같은 화면에 몇십 마리가 서므로 작을수록 폰에서 부드럽다. Draco·KTX2 압축 파일은 읽지 못한다(그 해독기를 붙이지 않았다).
- 예제의 파일은 스크립트가 만든다: `node scripts/make-sample-assets.mjs`(상자들로 된 모델과 클립을 GLB로, 소리를 WAV로 쓴다. 인터넷에서 받지 않는다). 실제 게임은 그림 도구(Blender 등)에서 glTF 2.0 바이너리로 내보낸다.

### 소리 파일과 배경음 (선택)

효과음은 파일 없이도 틀이 합성음으로 낸다. 키마다 파일을 등록하면 그 키만 파일로 바뀐다.

```ts games/sample/client/scene.ts
  // 소리 파일: 때림과 얻음은 파일로, 나머지 효과음은 틀의 합성음. 배경음은 모닥불 곁(20m 안)에서만
  registerSound('hit', './sounds/hit.wav');
  registerSound('pickup', './sounds/pickup.wav', 0.8);
  registerMusic('camp', './sounds/camp.wav', 0.7);
  setMusicPicker(() => (S.me && Math.hypot(S.me.x - BONFIRE.x, S.me.z - BONFIRE.z) < 20 ? 'camp' : ''));
```

- **효과음 키**: `hit`(내가 때림), `crit`(치명타), `hurt`(내가 맞음), `kill`(노리던 적이 쓰러짐), `skill`(기술), `fanfare`(좋은 소식), `pickup`(얻음), `bad`(나쁜 소식). `registerSound(키, 주소, 음량?)`. 등록하지 않은 키, 아직 읽는 중이거나 읽지 못한 파일은 합성음이다(읽지 못하면 콘솔에 경고 한 줄). 게임의 키(예: `'chop'`)도 등록하고 `playSound('chop')`으로 낼 수 있다(합성음이 없으니 파일이 있어야 들린다). 안내문에 붙이려면 `addMsgSounds({ 안내문: () => playSound('chop') })`.
- **배경음**: `registerMusic(id, 주소, 음량?)`과 `setMusicPicker(() => id)`. 고르는 함수는 0.25초마다 불리고, 돌려준 id가 바뀌면 1.5초에 걸쳐 앞의 것을 줄이고 새것을 키운다(반복해서 튼다). `''`이면 조용히. 구역별이면 `S.me`의 자리로, 상황별이면 `inDungeon()` 같은 것으로 고른다.
- **자동 재생**: 브라우저는 첫 입력 전에는 소리를 막는다. 틀은 첫 입력(누르기, 키) 전에는 소리 장치를 만들지도 틀지도 않는다. 효과음 파일은 접속 화면에서 받아 두고 첫 입력에서 푼다. 배경음은 미리 받지 않고 틀 때 흘려 받는다.
- **음량**: 소리 파일이나 배경음을 하나라도 등록한 게임은 메뉴 머리의 소리 단추 앞에 '음량' 단추가 생긴다(효과음·배경음 막대. 배경음이 없으면 효과음만). 합성음만 쓰는 게임도 `enableVolume()`으로 보일 수 있다. 소리 켜고 끄기와 음량은 이 기기에 저장된다(localStorage `sound`, `soundMix`. 저장소를 못 쓰는 브라우저에서는 기본값으로 돈다). 소리를 끄면 배경음도 줄어들어 멈춘다.
- **형식과 크기(권장)**: 효과음은 MP3 또는 OGG, 0.1~1초, 모노, 한 파일 30KB 아래(풀어 둔 소리는 메모리에 남는다). 배경음은 MP3 또는 OGG 64~128kbps, 1~3분, 끝과 처음이 이어지게(1~3MB). WAV는 크다: 예제의 12초 배경음이 375KB다(시험용으로 스크립트가 만든 것이라 WAV). 모든 브라우저에서 돌리려면 MP3가 가장 넓다.
- 틀의 서버(`engine/server/net/static.ts`의 `MIME`)는 파일에 형식을 붙여 내보낸다: 소리 `.wav` `audio/wav`, `.ogg` `audio/ogg`, `.mp3` `audio/mpeg`, `.m4a` `audio/mp4`, 모델 `.glb` `model/gltf-binary`, `.gltf` `model/gltf+json`, 그 밖에 `.webp`, `.woff2`, `.json`, `.webmanifest` 등. 표에 없는 확장자는 `application/octet-stream`이다.

**방치형**: 접속할 때 자동 사냥을 켜고 시작하려면 게임의 화면 모듈에서 `rules.autoAtStart = () => true`(`@engine/client`의 `rules`). 예: `games/starmine/client/drill.ts`. 금빛 단추를 만들 때 class `gold`는 **글자색**이다(배경이 금빛인 단추는 틀의 `button.on`이나 게임의 css로).

## 6. 이 게임만의 규칙 하나 더하기

예제의 규칙: 멧돼지와 곰이 장작을 떨어뜨린다. 모닥불 곁에서 장작을 넣으면 서버 전체의 온기가 오른다. 온기가 있는 동안 곁에 선 사람은 회복이 빨라진다. 온기는 식는다.

서버에서 화면까지 한 줄기를 따라간다. 파일은 다섯이다.

### (1) 공용 선언: 안내문, 메시지, 공유 상태

틀이 가진 목록을 선언 병합으로 넓힌다. 타입뿐이고, 이 파일은 아무도 import하지 않는다(`tsconfig.json`의 `include`로 컴파일에 들어간다).

**선언 파일에는 `export`가 적어도 하나 있어야 한다.** `declare module …`만 있는 파일은 TypeScript가 모듈로 보지 않아 선언이 합쳐지지 않고, 게임의 칸이 조용히 없는 것이 된다(오류는 그 칸을 쓰는 다른 파일에서 "does not exist on type 'WorldState'" 같은 글로 난다). 예제는 `export interface MeState`가 있어서 괜찮다. 내보낼 것이 없으면 파일 끝에 `export {};`를 둔다.

```ts games/sample/shared/sample.ts
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일(client/i18n)이 만든다 */
  interface MsgMap {
    fed: [n: number, heat: number];
    noLogs: [];
    bonfireFar: [];
    bonfireLit: [name: string];
  }
  /** 화면 → 서버: 모닥불에 장작을 n개 넣는다 */
  interface ClientMsgs { feed: { n: number } }
  /** 모두가 함께 보는 상태: 모닥불의 온기 */
  interface WorldState { bonfire: { heat: number } }
}
```

- `MsgMap`에 안내문을 더하면 **모든 언어 파일의 `msg`에 그 문장이 있어야** 컴파일된다. 언어 파일을 아직 만들지 않았으면 틀의 `engine/client/hud/notify.ts`와 `hud/menu/gear.ts`에서 오류가 난다("Property '…' does not exist on type …": 문장이 없는 안내문의 이름이 '…'에 나온다). 언어 파일의 `msg`에 그 문장을 채우면 사라진다.
- 서버는 문장을 보내지 않는다. 종류와 값만 보낸다.
- 인자가 없는 명령은 빈 칸으로 적는다: `interface ClientMsgs { restore: Record<never, never> }` (화면은 `send({ t: 'restore' })`).
- **명령의 칸 이름에 `t`를 쓰지 않는다**: `t`는 메시지의 종류 칸이라 `{ t: 'duel' } & { t?: number }`가 `never`가 되고, 화면의 `send`에서 "'duel'은 … 넣을 수 없다"는 알아보기 어려운 타입 오류가 난다(징검돌은 친 대상의 칸을 `to`로 했다).

### (2) 서버 쪽 선언과 플러그인

```ts games/sample/server/sample.ts
declare module '@engine/server/game/ext' {
  /** g.bonfire */
  interface GameSystems { bonfire: Bonfire }
  /** p.fed: 지금까지 넣은 장작. 처음 값과 저장은 Bonfire가 맡는다 */
  interface EntExt { fed: number }
  /** 장작을 넣었다 */
  interface HooksExt { fed: (p: Ent, n: number) => void }
}

export function installSample(g: Game): void {
  g.bonfire = new Bonfire(g);
  // 일일 임무 '장작 넣기'(DAILIES의 kind: 'feed')를 센다. 임무 시스템(g.daily)은 플러그인보다 뒤에 만들어지므로, 모두 만들어진 뒤(ready)에 잇는다
  g.ready.push(() => { const daily = g.daily; g.on('fed', (p, n) => daily.add(p, 'feed', n)); });
  // 캐릭터 정의 넷과 변신 (./chars.ts)
  installChars(g);
}
```

플러그인은 틀의 바탕 시스템(이동, 플레이어, 전투, 몬스터) 뒤, 나머지(상점부터 길드까지) 앞에서 불린다. 그래서 플러그인 안에서는 **등록만** 한다. 뒤에 만들어지는 시스템(`g.daily`, `g.mail`, `g.gear`, `g.channels` …)을 그 자리에서 만지려면 `g.ready`에 넣는다. 명령 처리기나 틱 안에서 부르는 것은 괜찮다(그때는 다 만들어져 있다).

### (3) 서버 시스템

생성자에서 필요한 것을 모두 등록한다.

```ts games/sample/server/bonfire.ts
  constructor(private g: Game) {
    // 엔티티 칸(지금까지 넣은 장작)의 처음 값과 저장
    g.entInit.push((e) => { e.fed = 0; });
    g.saves.push({ name: 'bonfire', save: (p) => ({ fed: p.fed }), load: (p, raw) => { p.fed = readInt((raw as { fed?: unknown } | null)?.fed, 0, 1e9, 0); } });
    g.rules.touched = (p) => p.fed > 0;
    // 본인에게만 알리는 값과 모두에게 알리는 값
    g.personal.push({ name: 'fed', state: (p): MeState['fed'] => p.fed });
    g.shared.push({ name: 'bonfire', state: () => ({ heat: Math.ceil(this.heat) }) });
    // 서버를 껐다 켜도 온기가 남는다
    g.worldSaves.push({ name: 'bonfire', save: () => ({ heat: this.heat }), load: (raw) => { this.heat = readInt((raw as { heat?: unknown } | null)?.heat, 0, BONFIRE.heatMax, 0); } });
    g.commands.set('feed', (p, m) => { if (typeof m.n === 'number') this.feed(p, m.n); });
    g.ticks.push((dt) => this.cool(dt));
    // 틀의 규칙과 수치에 끼어든다: 일어나는 자리, 직업을 바꿀 수 있는 곳, 자연 회복의 배율
    g.rules.respawn = () => ({ x: BONFIRE.x, z: BONFIRE.z + 4, id: 'bonfire' });
    g.rules.canChangeClass = (p) => dist(p, BONFIRE) <= BONFIRE.reach;
    g.mods.provide('regen', (p) => (p && this.warms(p) ? BONFIRE.regen : 1));
  }
```

명령 처리기는 검증되지 않은 입력을 받는다. 수인지, 정수인지, 자리가 맞는지, 가진 것이 있는지를 처리기가 확인한다.

```ts games/sample/server/bonfire.ts
  private feed(p: Ent, want: number): void {
    const g = this.g, have = p.items.log ?? 0;
    if (!Number.isInteger(want) || want < 1) return;
    if (dist(p, BONFIRE) > BONFIRE.reach) { g.notify(p, 'bonfireFar'); return; }
    if (have < 1) { g.notify(p, 'noLogs'); return; }
    const n = Math.min(want, have), cold = this.heat <= 0;
    // 장작은 틀의 가방 통로로 뺀다: 장부가 어디로 나갔는지 적고, 아이템 칸을 고치는 곳이 가방 하나로 남는다
    g.bag.takeItem(p, 'log', n, 'cmd:feed');
    p.fed += n; p.dirty = true; p.unsaved = true;
    this.heat = Math.min(BONFIRE.heatMax, this.heat + n * BONFIRE.heatPerLog);
    g.stateDirty = true; g.saveDirty = true;
    if (cold) g.announce('bonfireLit', p.name);
    g.notify(p, 'fed', n, Math.ceil(this.heat));
    g.fire('fed', p, n);
  }
```

값을 바꾼 뒤에 세워야 하는 표시:

| 표시 | 언제 |
|---|---|
| `p.dirty = true` | 틀의 수치(레벨, 골드, 소지품 `p.items`)를 바꿨다: 본인에게 `stat`이 다시 간다 (소지품은 직접 고치지 않고 가방 통로 `g.bag`으로 넣고 뺀다. 통로가 이 표시도 세운다) |
| `p.unsaved = true` | 그 캐릭터에 저장할 것이 생겼다 |
| `p.metaDirty = true` | 장비, 우편, 일일 임무를 바꿨다 |
| `g.stateDirty = true` | 공유 상태(`g.shared`)가 바뀌었다: 모두에게 `world`가 다시 간다 |
| `g.saveDirty = true` | 월드 저장(`g.worldSaves`)이 바뀌었다 |

개인 상태(`g.personal`)는 표시가 필요 없다. 마지막으로 보낸 값과 달라지면 간다.

### (4) 화면의 창

마크업은 틀의 빈 자리에 붙인다. 자리의 이름은 `engine/client/hud/shell.ts`의 `SLOTS`에 있다.

| 자리 | 어디 | 기준 요소가 없으면 (그 모듈을 고르지 않은 게임) |
|---|---|---|
| `meHp` | 내 정보 창의 체력 숫자 옆 | `meRows` (전투가 없다) |
| `meGold` | 내 정보 창의 골드 옆 | `meRows` (재화가 없다) |
| `meRows` | 내 정보 창의 단추 줄 바로 위 | 늘 있다 |
| `rightTop`, `rightBottom` | 오른쪽 위에 쌓이는 창들의 맨 위, 맨 아래 | 늘 있다 |
| `topmid` | 가운데 위 (좁은 화면에서는 내 정보 창 아래 왼쪽) | 늘 있다 |
| `actions` | 기술 단추 위의 단추 줄, 자동 사냥 단추 다음 | `actionsEnd` (자동 사냥 `away`가 없다) |
| `actionsEnd` | 그 단추 줄의 맨 앞 (지도 단추 앞) | 늘 있다 |
| `hud` | 화면 전체에 떠 있는 것 (오른쪽 창들 다음) | 늘 있다 |

```ts games/sample/client/bonfire.ts
export function mountBonfire(): void {
  // 내 정보 창의 한 줄: 가진 장작
  mountPanel('meRows', `<div class="num" id="logsMini"></div>`);
  // 오른쪽 위에 쌓이는 창의 맨 위: 모닥불 창. 모닥불 가까이에서만 열린다
  mountPanel('rightTop', `
    <div class="panel" id="bonfire" hidden>
      <div class="row"><span class="ttitle" data-i18n="bonfire"></span><span class="num" id="heatText"></span></div>
      <div class="bar heat"><i id="heatBar"></i></div>
      <div class="note" id="heatNote"></div>
      <div class="note" id="logsText"></div>
      <div class="btns">
        <button type="button" id="feedOne" data-i18n="feedOne"></button>
        <button type="button" id="feedAll" data-i18n="feedAll"></button>
      </div>
      <button type="button" class="plain" id="classBtn" data-i18n="changeClass"></button>
    </div>`);
}
```

- 틀의 class를 그대로 쓴다: `panel`, `row`, `ttitle`, `num`, `note`, `bar`(안의 `<i>`를 `scaleX`로 늘린다), `btns`, `plain`, `gold`.
- **자리 안의 창은 틀이 쌓는다**: `rightTop`·`rightBottom`(`#rightcol`)과 `topmid`(`#topmid`)의 창은 틀의 css(`#rightcol .panel`, `#topmid .panel`: 아이디 하나 + class)가 `position: static`(오른쪽은 `width: auto`도)으로 쌓는다. 게임의 `#내창 { position: fixed; … }`는 이 규칙보다 약해 먹지 않는다. 창을 자리에서 떼어 띄우려면 마크업에 `class="panel free"`를 준다(틀의 쌓기 규칙을 받지 않는다). 자리 안에 두고 몇 칸만 바꾸려면 `#rightcol #내창`처럼 아이디 둘로 고른다. 좁은 화면(너비 720 이하)에서 오른쪽 칸은 160px, 가운데 위는 내 정보 창 아래로 내려간다(대화창이 그 곁을 덮는다).
- 폰의 조이스틱은 `#stick`이다(감추려면 `body.내클래스 #stick { display: none; }`. 판 모듈은 앉은 동안 스스로 감춘다).
- 직업 고르기 창은 틀의 것이고, 다시 여는 단추는 게임이 둔다(`openClasses`).

나머지는 init 안에서 등록한다.

```ts games/sample/client/bonfire.ts
export function initBonfire(): void {
  // 요소는 init 안에서 잡는다 (모듈이 읽히는 때에는 아직 창이 붙지 않았다)
  const ui = { panel: $('bonfire'), heat: $('heatText'), bar: $('heatBar'), note: $('heatNote'), logs: $('logsText'), mini: $('logsMini'), one: $<HTMLButtonElement>('feedOne'), all: $<HTMLButtonElement>('feedAll') };
  // 서버가 알려 주는 것: 공유 상태(world)의 내 칸, 개인 상태(me)의 내 칸
  onMsg('world', (m) => { G.heat = m.s.bonfire.heat; });
  onMsg('me', (m) => { if (m.k === 'fed') G.fed = m.s as MeState['fed']; });
  // 이 게임의 안내문을 어디에 띄울지: 가운데 알림과 흘러가는 알림 (적지 않으면 대화창에만 남는다)
  addNotices({ banner: { bonfireLit: 'good' }, feed: ['fed', 'noLogs', 'bonfireFar'] });
  // 화면 쪽 규칙: '처음 자리로'(H 키)가 모닥불 앞으로 간다
  rules.home = () => ({ x: BONFIRE.x, z: BONFIRE.z + 4 });
  // 좁은 화면에서는 가까운 창 하나만 남긴다: 이 창이 어디에서 열리는지 알린다
  addPlace('bonfire', [BONFIRE]);
```

```ts games/sample/client/bonfire.ts
  $('classBtn').addEventListener('click', openClasses);
  onKey('f', () => feed(1));

  // 느린 주기(0.25초)마다 글자와 단추를 맞춘다
  onSlow(() => {
    const loc = L(), have = logs();
    ui.mini.textContent = loc.fmt.logsMini(have);
    ui.panel.hidden = !near();
    if (ui.panel.hidden) return;
    ui.heat.textContent = loc.fmt.heat(G.heat, BONFIRE.heatMax);
```

- 개인 상태의 값(`m.s`)은 타입이 `unknown`이다. 모양은 게임이 정하므로(`shared/sample.ts`의 `MeState`) 게임이 좁혀 읽는다.
- 틀의 키는 그 기능의 모듈이 단다: 핵심은 M(메뉴), N(지도), H(집으로: `HOME_KEY`로 끈다), Enter(대화), Esc. 전투(`combat`)는 숫자(기술)와 Tab(대상), 아이템(`items`)은 Q(물약)와 B(가방), 자동 사냥(`away`)은 R. **고른 모듈의 키**는 `onKey`로 등록해도 틀의 것이 먼저라 불리지 않는다. 고르지 않은 모듈의 키는 게임이 쓸 수 있다(전투가 없는 게임은 숫자 키를 쓸 수 있다). 키의 이름(소문자, 스페이스는 `' '`)과 이동 키는 5절 '단축키'.
- 가까운 창 하나만 남기는 것은 css의 몫이다(`addPlace`는 어느 창이 가까운지만 적어 준다). 짝을 지어 숨기는 규칙을 게임의 css에 적는다(예: `#rightcol[data-near="shop"] #bonfire { display: none; }`).

```css games/sample/client/sample.css
#rightcol[data-near="bonfire"] #shop, #rightcol[data-near="shop"] #bonfire { display: none; }
```

### (5) 문장

안내문의 문장과 창의 글을 언어 파일에 더한다. `satisfies`가 "더한 안내문은 모두 문장이 있다"를 검사한다.

```ts games/sample/client/i18n/ko.ts
  msg: {
    fed: (a) => `모닥불에 장작 ${a[0]}개를 넣었습니다. 온기 ${a[1]}`,
    noLogs: () => '장작이 없습니다. 멧돼지나 불곰을 잡으면 얻습니다.',
    bonfireFar: () => '모닥불 가까이에서 넣을 수 있습니다.',
    bonfireLit: (a) => `${a[0]} 님이 모닥불을 살렸습니다. 곁에 있으면 체력이 빨리 찹니다.`,
```

### 규칙에 쓸 수 있는 것의 요약

| 하고 싶은 일 | 서버 | 화면 |
|---|---|---|
| 플레이어가 무엇을 한다 | `ClientMsgs`에 선언, `g.commands.set` | `send({ t: … })` |
| 한 사람에게 결과를 알린다 | `MsgMap`에 선언, `g.notify(p, 종류, 값…)` | 언어 파일의 `msg`, `addNotices` |
| 모두에게 알린다 | `g.announce(종류, 값…)` | 같다 |
| 모두가 보는 값 | `WorldState`에 선언, `g.shared.push` + `g.stateDirty` | `onMsg('world', …)` |
| 본인만 보는 값 | `g.personal.push` | `onMsg('me', …)` |
| 캐릭터에 딸린 값 | `EntExt`에 선언, `g.entInit.push`, `g.saves.push` (아래 '엔티티의 칸') | |
| 다른 모듈의 칸(레벨, 골드, 체력 …)을 읽는다 | 그 모듈을 늘 고르는 게임이면 `p.lv` 그대로. 고르지 않을 수도 있으면 `g.has('growth')`로 묻거나 `g.field(p, 'lv')`(없으면 처음 값) | |
| 서버 전체의 값을 저장 | `g.worldSaves.push` + `g.saveDirty` | |
| 시간이 흐르면 | `g.ticks.push((dt) => …)`. 한 틱의 차례: 엔티티마다(사람의 걷기·전투, 몬스터, 게임의 종류의 `tick`) → `g.ticks`(등록한 차례) | `onFrame`, `onSlow` |
| 사람이 들어오고 나가면 | `g.on('playerJoined', (p) => …)`(봇은 빼고), `g.on('playerLeft', (id) => …)`(월드에서 빠진 뒤: 엔티티 대신 id), `g.on('playerDropped', (p) => …)`(연결이 끊겨 저장하기 직전) | |
| 끊겼다 돌아온 사람을 알아본다 | 끊기면 사람의 엔티티는 **바로** 월드에서 빠지고(`playerLeft`), 다시 들어오면 **새 엔티티 id**다. 같은 사람은 `p.pid`(브라우저의 토큰에서 나온 저장 키. 손님과 봇은 빈 문자열)로 알아본다: 자리·판을 `pid`로 기억했다가 `playerJoined`에서 찾는다(판 모듈이 이렇게 한다: 14절). 내용의 `REJOIN_KEEP_S`는 전투 모듈의 것으로, 그 초 안에 다시 들어오면 나갈 때의 체력·쿨다운으로 시작하고(끊고 붙어 회복하지 못하게) 넘으면 가득 찬 채로 시작한다. 엔티티를 남겨 두지는 않는다 | |
| 순간 이동 | `g.movement.teleport(e, x, z, face?)`: 자리·걷던 목표를 바꾸고 걷기를 멈춘 뒤 화면에 '바로 옮김'(사건 `r`)을 알린다. 층은 바꾸지 않으니 다른 층(채널·판)으로 옮기려면 먼저 `e.layer`를 정한다. 장애물 검사는 하지 않는다 | |
| 엔티티를 없앤다 | `g.remove(id)`: 월드에서 빼고 다른 엔티티가 붙들던 참조(노리던 대상 …)를 정리한다. 사람은 `g.remove`가 아니라 연결이 끊길 때 틀이 뺀다 | |
| 한 번의 연출을 보낸다 (날아가는 돌, 피해 숫자) | `g.effect(엔티티 id, 이름, 수…)` (14절 '연출 사건') | `onEffect(이름, (id, vals) => …)` |
| 판·방으로 나뉘는 게임 (턴제·보드) | `rooms` 모듈: `g.rooms.define({ … })` (14절) | 틀의 판 화면, `myRoom`, `onRoomChange`, `setTapHandler` |
| 사람들을 훑는다 | `for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot) …`: 플레이어의 종류는 `'p'`, 몬스터는 `'m'`, 게임의 종류는 `g.defineKind`의 이름. 따로 된 사람 목록은 없다. 층(채널)이 여럿이면 `e.layer`도 본다 | `S.me`, `S.others`(`r.kind === 'p'`) |
| 사람마다 남이 보는 값(팀, 역할)과 그 겉모습 | `g.playerSync((p) => [수, …])` (아래 '사람마다의 값과 겉모습') | `setPlayerLook({ cloth, update })` |
| 몬스터를 잡으면, 샀으면 … | `g.on('monsterKilled', (m, hitters) => …)`: `hitters`는 그 몬스터를 때린 사람들. `g.on('hit', (p, m, amount) => …)`: 사람이 몬스터를 때려 실제로 깎은 체력(쓰러뜨렸으면 `monsterKilled`보다 먼저). 사건의 목록과 인자: `engine/server/game/game.ts`의 `Hooks` | |
| 적이 한 곳으로 몰려온다 (습격, 물결 막기) | `g.rules.siege = { x, z }`(목표), `g.monsters.spawn(종류, x, z, true)`(셋째 인자 `true`가 '몰려온 적'). 몰려온 적은 집도 줄도 없이 목표로 걸어가고, **스스로 사람에게 덤비지 않으며** 맞으면 때린 사람을 쫓는다. 쓰러지면 다시 나지 않고 사라진다. 목표에 붙었는지는 `g.monsters.atSiege(m)`, 목표의 피해는 게임이 센다. 층은 `spawn`이 돌려준 몬스터의 `layer`로 정한다 | `games/bastion/server/waves.ts`, `games/deungbul/server/systems/raid.ts` |
| 틀의 수치를 바꾼다 | `g.mods.provide('damage' \| 'guard' \| 'regen' \| 'crit' \| 'hp' \| 'exp', (p) => 값)`. `damage`·`guard`·`regen`은 **곱하는 값**(1이 그대로, 1.1이면 10% 더), `crit`·`hp`·`exp`는 **더하는 값**(0이 그대로. `crit`은 확률, `hp`는 최대 체력, `exp`는 처치 경험치에 더하는 비율). 잘못 적어도 오류 없이 엉뚱한 값이 된다 | |
| 틀의 규칙을 바꾼다 | `g.rules.respawn / speed / canChangeClass / unlocked` | `rules.speed / unlocked / lockNote / home` (속도와 잠금은 서버와 같은 답을 내야 한다) |
| 보상을 준다 | `g.players.grant(p, exp, 0)`, `g.wallet.add(p, 'gold', n, 원인)`·`g.wallet.take(…)`(재화는 **지갑으로만** 바꾼다: `p.gold`를 직접 고치면 경제 장부에 '그 밖'으로 남고 `npm test`의 지갑 검사가 잡는다. 원인은 `WHY`의 것이나 영문 낱말), `g.bag.putItem(p, 아이템, n, 원인)`, `g.mail.send(p, 종류, 값, 보상)`, `g.daily.add(p, 종류, n)` | |

### 엔티티의 칸: 핵심, 모듈의 몫, 게임의 칸

엔티티(`Ent`, 사람·몬스터·게임의 종류)의 칸은 세 갈래다. 칸이 엔티티에 **있는지**가 갈래마다 다르다.

| 갈래 | 칸 | 어디에 적혀 있나 | 처음 값을 채우는 곳 | 있는 엔티티 |
|---|---|---|---|---|
| 핵심 | `id`, `kind`, `type`, `name`, `x`, `z`, `face`, 이동과 길(`tx`, `tz`, `moving`, `stuck`, `lastMove`, `lastAct`, `path`, `pgx`, `pgz`, `pat`), `dead`, `layer`, `wait`, `data`, `bot`, `pid`, 표시(`dirty`, `unsaved`, `metaDirty`), `offMs` | `engine/server/game/entity.ts` | `Game.create` | 어느 게임에나 |
| 모듈의 몫 | `economy`: `gold`, `sparks` · `growth`: `lv`, `exp`, `need` · `classes`: `cls` · `combat`: `hp`, `maxHp`, `targetId`, `atkCd`, `lastHurt`, `cds`, `itemCd`, 몬스터의 칸(`def`, `hx`, `hz`, `respawn`, `hitters`, `swarm`, `scale`, `cast`, `windup`, `slowUntil`, `stunUntil`, `buffs`, `dots`, `homing`) · `items`: `weapon`, `armor`, `items` · `gear`: `gear`, `worn`, `gearSeq`, `bagUp`, `lostFull`, `autoSalvage` · `mail`: `mail`, `mailSeq` · `daily`: `daily` · `build`: `stats`, `skillLv` · `away`: `auto`, `away` · `guild`: `guild` | `engine/server/game/parts.ts` (모듈마다 `*Part`) | 그 모듈의 `PARTS[모듈].init` (`Game.create`가 고른 모듈의 것만 부른다) | **그 모듈을 고른 게임에만** |
| 게임의 칸 | 게임이 정한다 (`p.fed` 같은 것) | 게임의 선언 파일: `declare module '@engine/server/game/ext' { interface EntExt { … } }` | 게임의 `g.entInit.push((e) => …)` | 그 게임에 |

- 만드는 차례: 핵심의 칸 → 고른 모듈의 칸(모듈 표의 차례) → 게임의 `g.entInit` → 장애물 밖으로 자리를 맞춤. 그래서 `entInit` 안에서 고른 모듈의 칸(`e.gold`)을 읽을 수 있다. 플러그인보다 먼저 만들어진 엔티티(첫 채널의 몬스터)도 `entInit`을 한 번 거친다.
- 고르지 않은 모듈의 칸은 엔티티에 **없다**(`undefined`). 타입에는 늘 보이므로(`Ent`가 `EntParts`를 이어받는다) 컴파일러가 막아 주지 않는다. 그 모듈을 고르지 않을 수도 있는 코드는 이렇게 쓴다:
  - 읽기만: `g.field(p, 'lv')`. 골랐으면 엔티티의 값, 아니면 그 칸의 처음 값(레벨 1, 직업 `''`, 체력 0, 빈 가방 …)을 돌려준다.
  - 쓰기: 반드시 `if (g.has('combat')) p.targetId = 0;`처럼 묻고 쓴다. 묻지 않고 쓰면 칸이 없던 엔티티에 칸이 새로 생긴다(저장되지도 보내지지도 않지만, 엔티티의 모양이 틀린다).
  - 내 게임이 그 모듈을 늘 고른다면(`MODULES`에 적었다면) 묻지 않고 `p.gold`로 써도 된다.
- `g.place(종류, { hp })`의 `hp`는 전투 모듈의 체력이다: 전투를 고르지 않은 게임에서는 쓰이지 않는다. 게임의 종류에 체력 같은 값이 필요하면 `e.data`나 게임의 칸에 둔다.
- 틀에 칸을 가진 모듈을 새로 더할 때(틀을 고칠 때)는 `parts.ts`에 인터페이스 하나와 `PARTS`의 한 줄을 더하고 `EntParts`에 잇는다. `engine/test/fx/parts.test.ts`가 모듈마다 그 모듈과 의존만 골라 띄워, 고르지 않은 모듈의 칸이 생기지 않는지 본다.

### 사람마다의 값과 겉모습

게임의 엔티티 종류가 `sync`로 값을 싣는 것처럼, 플레이어에게도 수 몇 개를 실을 수 있다. 팀, 역할, 들고 있는 것처럼 **남이 보아야 하는** 사람마다의 값에 쓴다(본인만 볼 값은 `g.personal`).

- 서버: `g.playerSync((p) => [수, …])`(한 게임에 하나). 다른 사람에게는 시야 안 상태 줄의 끝에, 본인에게는 스냅샷 `you`의 끝에 붙는다. 바뀌면 다시 간다(소수 둘째 자리까지).
- 화면: `setPlayerLook({ cloth, update })`(`@engine/client`, 화면 모듈의 init에서).
  - `cloth(p)`: 옷 색. `p`는 `{ id, name, me, vals }`(`vals`가 실려 온 값). `undefined`면 틀의 색. 색이 바뀌면 그 사람의 모델을 새로 만든다(`setHumanoidBody`·`registerHumanoidAsset`의 사람이 그 색을 받는다).
  - `update(model, p)`: 값이 처음 오거나 바뀌었을 때, 그리고 모델을 새로 만들었을 때. 표식을 붙이거나 크기를 바꾼다.
- 팀이 필요하면 이것을 손으로 짜지 말고 `teams` 모듈을 고른다(아래 '팀과 점수판'): 그 모듈이 `g.playerSync`와 `setPlayerLook`을 쓴다(팀 번호를 싣고 팀 색 옷을 입힌다). 게임의 값을 더 실으려면 `g.teams.syncAlso`, 표식을 더하려면 `onTeamLook`.

### 팀과 점수판 (`teams` 모듈)

팀을 나누는 놀이(공놀이, 깃발 뺏기, 팀 대결)는 `MODULES`에 `'teams'`를 넣고 팀의 표를 적는다. 본보기는 굴림공(`games/rollball`).

```ts
// games/rollball/shared/content/index.ts
export const MODULES: readonly ModuleId[] = ['teams'];
export const TEAMS: readonly TeamDef[] = [
  { id: 'ember', color: TEAM_COLOR[0], name: 'teamA' },
  { id: 'tide', color: TEAM_COLOR[1], name: 'teamB' },
];
```

- **`TEAMS`**: 팀마다 `id`(저장에 쓰는 이름: 바꾸지 않는다), `color`(옷·고리·점수판), `name`(이름의 **문장 키**: 게임의 언어 파일 `ui`에 그 키로 이름을 적는다. 예: `teamA: '노을'`). 차례가 곧 번호(0부터)이고 줄 위에서는 번호로 오간다(팀이 없으면 -1). 둘이 흔하지만 셋 이상도 된다(점수판이 팀마다 한 줄로 바뀐다). 타입 `TeamDef`는 `@engine/shared/defs/teams`.
- **`TEAM_RULES`**(선택, 기본 `{ balance: true, switch: true, persist: false }`): `balance` 사람이 더 많은 팀으로는 못 간다(옮길 때는 나를 빼고 센다. 같으면 된다. 팀이 셋 이상이면 가장 적은 다른 팀과 견준다), `switch` 팀이 있는 사람이 옮길 수 있다, `persist` 저장한다(아래).
- **서버** `g.teams`(규칙 플러그인보다 먼저 만들어지므로 플러그인에서 바로 쓴다):

| 하고 싶은 일 | 쓰는 것 |
|---|---|
| 그 사람의 팀 | `g.teams.of(p)`(`TeamDef` 또는 `undefined`), `g.teams.index(p)`(번호, 없으면 -1. 엔티티 id도 된다) |
| 팀의 사람들 | `g.teams.members(번호)`, `g.teams.all()`(`[사람, 번호]`), `g.teams.count(번호, 뺄 사람 id?)`, `g.teams.size` |
| 넣기 | 화면의 고르기 창이 보내는 명령 `{ t: 'team', team: 번호 }`(규칙을 보고, 안 되면 안내문 `teamFull`·`teamStay`, 되면 `teamJoined`). 게임이 정해 주려면 `g.teams.auto(p)`(가장 적은 팀), `g.teams.set(p, 번호)`(규칙을 보지 않는다, -1이면 뺀다), `g.teams.canJoin(p, 번호)` |
| 팀의 점수 | `g.teams.add(번호, n = 1)`, `g.teams.score(번호)`, `g.teams.leader()`(가장 많은 팀, 같으면 -1), `g.teams.reset(사람의 점수도?)`(새 판) |
| 사람마다의 점수 | `g.teams.addPlayer(p, n = 1)`, `g.teams.playerScore(p)` |
| 사람에게 값을 더 싣기 | `g.teams.syncAlso((p) => [수, …])`: 팀 번호 뒤에 붙는다(`g.playerSync`는 이 모듈이 쓴다) |

- 무엇을 하면 점수가 오르는지(골, 깃발, 처치)와 판의 시간은 게임이 정한다. 사람이 나가면(`playerLeft`) 팀과 사람의 점수에서 빠진다. 점수판은 공유 상태 `teams`(`{ score: 팀마다, count: 팀마다의 사람 수 }`), 내 팀은 개인 상태 `team`(`{ i, score }`)으로 간다.
- **화면**(틀이 붙인다): 가운데 위의 점수판(팀이 둘이면 '이름 점수 : 점수 이름', 폰에서는 대화창 왼쪽까지로 줄어든다), 팀이 없을 때 화면 가운데의 고르기 창(사람이 더 많은 팀의 단추는 막힌다), 내 정보 창의 '내 팀 · 점수' 줄과 '팀 바꾸기'(둘이면 곧바로 다른 팀, 셋 이상이면 고르기 창), 팀 색 옷과 발밑 고리(내 것은 크게. 팀이 없으면 회색 옷). 게임이 더하는 것:
  - `setTeamBoardExtra(() => ({ side, note }))`: 점수판 옆의 글(시계, 판의 번호)과 아래 줄(골, 경기 끝). 느린 주기마다 불린다.
  - `onTeamLook((model, p, team) => …)`: 팀 색 옷과 고리 위에 표식을 더한다.
  - `myTeam()`, `myTeamScore()`, `teamBoard()`: 카메라나 `rules.home`이 내 팀을 읽을 때(굴림공: 팀이 없으면 경기장 전체를 비춘다, H는 우리 진영으로).
- **문장**: 틀의 문장(`teamPickTitle`, `teamPickInfo`, `teamPickBalance`, `teamMore`, `teamSwitch`, `teamBoard`, `fmt.teamCount`, `fmt.teamMine`, 안내문 `teamJoined`·`teamFull`·`teamStay`)이 한국어·영어로 있다. 게임은 팀의 이름(`TEAMS`의 `name` 키)을 반드시 적고, 고르기 창의 설명(`teamPickInfo`)이나 '내 팀' 줄(`fmt.teamMine`, 굴림공은 '내 골')을 자기 말로 덮어쓸 수 있다. 게임의 문장에서 팀의 이름은 `teamName(번호)`(`@engine/client/i18n/ko`).
- **저장**: 기본은 아무것도 저장하지 않는다(판마다 새로 고르는 놀이). `TEAM_RULES.persist = true`면 캐릭터 저장의 `ext.teams`(`{ t: 팀 id, s: 내 점수 }`)와 월드 저장의 `teams`(팀 id → 점수)에 적고, 다시 들어온 사람은 같은 팀으로 돌아온다(손님은 저장되지 않는다). 모듈을 빼도 그 칸은 지우지 않는다(`MODULE_SAVES`).

## 7. 저장과 호환

- 캐릭터 저장은 `PlayerSave`(틀의 칸) + `ext[이름]`(시스템마다 한 칸)이다. 게임의 칸은 `g.saves`에 등록한 이름으로 `ext`에 들어간다. 월드 저장은 `g.worldSaves`의 이름마다 한 칸이다.
- **읽을 때는 아무것도 믿지 않는다.** 저장된 값이 깨졌거나 옛 모양이어도 서버가 떠야 한다. 수는 `readInt(값, 최소, 최대, 기본값)`으로 읽는다. 한 칸이 예외를 던지면 틀은 그 칸만 처음 상태로 둔다.
- 칸의 **이름은 바꾸지 않는다.** 바꾸면 옛 저장의 값을 잃는다. 모양을 바꿀 때는 `load`가 옛 모양도 읽게 한다.
- 내용의 id도 저장에 들어간다(낀 무기, 소지품, 장비의 바탕, 직업). 운영 중에 id를 지우면 그 물건은 읽을 때 버려진다. id를 바꾸지 말고 이름(언어 파일)을 바꾼다.
- 아무것도 하지 않은 새 캐릭터는 저장하지 않는다. 틀은 자기 칸(직업, 레벨, 골드 등)만 보므로, 게임의 진행만 있는 캐릭터도 저장하려면 `g.rules.touched`를 채운다(예제: 장작을 넣은 적이 있다).
- 저장 주기, 접속이 끊길 때의 저장, 재시작은 틀이 한다. 게임은 `p.unsaved`와 `g.saveDirty`만 세운다.
- **프로토콜 번호**(`engine/shared/protocol.ts`의 `PROTOCOL`): 서버와 화면이 따로 올라갈 때, 화면이 옛 빌드면 새로고침을 권한다. 틀의 메시지의 모양이나 뜻을 바꾸면 올린다. 게임이 자기 메시지(`ClientMsgs`, `ServerMsgs`, `WorldState`, 개인 상태)의 모양을 바꿀 때도 같은 문제가 생긴다: 칸을 더하기만 하면 괜찮고, 뜻을 바꾸거나 빼면 화면과 서버를 함께 올리고 번호를 올린다.
- 진행을 지우려면 서버를 끄고 그 게임의 저장 폴더(`data/sample/`)를 지운다.

### 저장 형식을 바꿀 때 (버전과 이전)

저장에는 버전 칸이 둘 있다(`engine/server/game/migrate.ts`). **`v`는 틀의 것, `gv`는 게임의 것**이다. 서버는 저장을 읽을 때(`players.spawn`, `importWorld`) 낮은 버전부터 이전 함수를 차례로 돌려 지금의 모양으로 올리고(틀의 목록을 끝까지, 그다음 게임의 목록), 쓸 때 지금의 버전을 적는다. 버전 칸이 없는 저장은 v0이다: 틀의 첫 이전(0 → 1)이 예전의 읽는 길(`Saver.legacy`, `worldSaves`의 `legacy`)을 그대로 거친다.

칸을 **더하기만** 할 때는 이전이 필요 없다: `load`가 칸이 없으면 처음 값을 쓰게 한다. 이미 있는 칸의 **모양이나 뜻을 바꿀 때**는 이렇게 한다.

1. 플러그인에서 `g.migrations.player`(캐릭터) 또는 `g.migrations.world`(월드)의 **끝에** 한 단계를 더한다. `to`는 1부터 하나씩이다(틀리면 게임을 만들 때 멈춘다). 지난 단계는 고치지도 지우지도 않는다(옛 저장이 남아 있는 한).

```ts
// 예: 장작 칸을 수에서 { n, dry } 모양으로 (게임의 플러그인 안)
g.migrations.player.push({
  to: 1, note: 'logs: 수 → { n, dry }',
  up: (save) => {
    const ext = (save.ext ??= {}) as Record<string, unknown>;
    if (typeof ext.logs === 'number') ext.logs = { n: ext.logs, dry: 0 };
  },
});
```

2. 이전 함수는 **저장(복사본)만 고친다.** 시스템의 상태를 건드리지 않는다. 받은 것을 고치고 아무것도 돌려주지 않거나, 새 저장을 돌려준다. 깨진 저장에서 예외를 던지면 그 단계만 건너뛰므로, 모양을 확인하고 고친다.
3. `load`는 **지금의 모양만** 읽으면 된다(옛 모양은 이전이 이미 바꿨다). 그래도 깨진 값은 걸러 낸다(`readInt`).
4. 시험: 옛 모양의 견본 저장을 읽어 다시 저장한 값이 기대와 같은지, 그리고 다시 쓴 저장의 `gv`가 올라갔는지 본다(등불지기: `games/deungbul/test/saves.test.ts`는 옛 견본을 읽은 결과가 이전을 들이기 전과 글자까지 같은지 본다).
5. 운영 서버에 올리기 전에 백업이 있는지 본다(켜질 때 자동 백업이 하나 생긴다: 9절 '운영'). 이전은 읽을 때 메모리에서만 돌고, 저장은 그 캐릭터를 다음에 저장할 때 새 모양으로 적힌다. 그래서 되돌린 배포(옛 서버)가 새 모양을 읽게 될 수 있다: **옛 코드가 새 모양을 읽어도 죽지 않게**(모르는 칸은 무시) 바꾼다. 앞날의 버전(이 서버보다 새 서버가 쓴 저장)은 올리지 않고 그대로 읽으며 로그에 한 번 알린다.

- **DB 스키마**(표와 열)는 따로 센다: `PRAGMA user_version`이 적용한 단계의 수이고, `engine/server/store/sqlite.ts`의 `SCHEMA` 목록의 끝에 단계를 더하면 서버가 켜질 때 차례로 적용한다(한 단계와 번호가 한 묶음). 스키마는 틀의 것이라 게임은 보통 건드리지 않는다.
- 저장소의 쓰기를 한 묶음으로 하려면 `store.transaction(() => { … })`(SQLite는 SAVEPOINT라 겹쳐 열 수 있다). 틀의 저장(`saveTogether`)은 월드·접속 중 캐릭터·자리 비움 캐릭터·재화 흐름 지표를 한 묶음으로 적고, 실패하면 하나도 적히지 않은 채 다시 시도한다.

## 8. 시험

틀의 시험 도구(`engine/test/harness.ts`): `check(조건, 설명)`, `until(조건)`, `sleep`, `connect(포트, 이름, 토큰, onMsg)`(가짜 클라이언트).

규칙만 볼 때는 서버 없이 게임을 만들어 명령을 넣고 틱을 돌린다.

```ts games/sample/test/sample.test.ts
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installSample], now: () => clock });
  const p = g.players.spawn('hunter', false);
  const said = () => g.notices.filter((n) => n.id === p.id);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.announces = []; g.command(p, m); };
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); clock += seconds * 1000; };
```

```ts games/sample/test/sample.test.ts
  at(BONFIRE.x, BONFIRE.z + 3);
  cmd({ t: 'feed', n: 1 });
  check(said().some((n) => n.k === 'noLogs') && g.bonfire.heat === 0, '장작이 없으면 넣을 수 없다');
```

`g.players.spawn(이름, 봇인가, 저장?, 저장 키?)`: 넷째 인자 `pid`를 주면 그 저장 키의 사람으로 들어온다(판 모듈처럼 사람을 저장 키로 기억하는 것을 시험할 때). 끊김은 `g.players.leave(id)`, 같은 저장 키로 다시 `spawn`하면 돌아온 것이다.

저장 왕복과 실제 접속은 서버를 띄워 본다. 포트 0은 빈 포트를 고른다.

```ts games/sample/test/sample.test.ts
  const store = new MemoryStore();
  let server = await startServer(0, { store, game: { plugins: [installSample] } });
```

- `startServer(port, …)`는 `{ port, game, close() }`를 돌려준다(포트 0이면 `port`가 고른 포트). 시험의 끝에 `await server.close()`.
- 가짜 클라이언트 `connect(port, 이름, 토큰, onMsg?)`(`@engine/testing`)는 접속한 피어를 돌려준다. 토큰은 영문·숫자·`-`로 16~64자여야 저장된 캐릭터로 이어진다(아니면 손님으로 들어가 저장되지 않는다). 피어는 `id`, `name`, `lv`, 받은 안내문 `sys`(이름의 목록), `send(메시지)`, 그리고 `ws`(끊을 때 `ws.close()`). 기다릴 때는 `until(() => 조건)`(기본 기한 10초. 참이 되면 바로 끝난다). '아무 일도 없어야 한다'를 볼 때는 `sleep`으로 자지 말고 `settle(피어, 스냅샷 수?)`로: ping을 보내 서버가 앞의 메시지를 다 처리했는지(pong) 보고, 스냅샷 수를 주면 틱이 그만큼 더 돈 뒤에 끝난다. 벽시계로 자는 시험은 바쁜 컴퓨터에서 가끔 실패한다. 대화·이름 바꾸기·신고의 간격은 `startServer(0, { now: () => t })`로 시험의 시계를 주고 `t`를 옮겨 넘긴다. 게임의 시계(`g.now()`: 판의 기한, 열쇠 채움, 게임의 타이머)는 따로 `startServer(0, { game: { plugins, now: () => t } })`로 준다. 임시 폴더는 `removeTemp(폴더)`로 지운다(Windows에서 막 닫은 DB가 잠깐 잠겨도 실패하지 않는다). 모양은 `engine/test/harness.ts`의 `Peer`.
- 피어의 `sys`는 `'종류:값:…'`의 목록이다(값이 없으면 종류만): `'duelStart:Ann:0'`. 종류만 보려면 `p.sys.some((s) => s.split(':')[0] === '종류')`.
- 틀의 가짜 클라이언트는 틀의 메시지만 읽는다. 게임의 메시지(`world`, `me`)는 `connect`의 넷째 인자로 받는다. 스냅샷의 날것은 피어의 `youRaw`(내 상태 전체: `g.playerSync`의 값이 끝에)와 `lines`(엔티티 id → 마지막 상태 줄)에 있다.
- **가짜 클라이언트 여럿의 명령은 차례가 정해지지 않는다**: 두 연결이 보낸 명령 가운데 어느 것이 먼저 처리될지 모른다(둘이 같은 팀을 고르면 누가 먼저인지 모른다). 차례가 중요하면 하나를 보내고 그 결과(안내문, 개인 상태)를 `until`로 기다린 뒤 다음을 보낸다. `npm test`는 여러 시험을 함께 돌려 컴퓨터가 바쁘므로 `until`의 기한은 기본(10초)보다 줄이지 않는다.
- 시험에서 플레이어의 행동은 명령으로 낸다: `g.command(p, { t: '명령', … })`. 틀의 명령은 `engine/shared/protocol.ts`의 `ClientMsg`에 모두 있다(예: `{ t: 'attack', id }`, `{ t: 'skill', n }`, `{ t: 'class', id }`, `{ t: 'dungeon', id }`, `{ t: 'craft', id }`, `{ t: 'buy', id }`).
- 서버 없이 규칙만 볼 때는 `new Game({ plugins: [installSample] })`로 만들고 `g.tick(초)`로 시간을 흘린다. 기술의 효과만 내려면 `g.combat.cast(플레이어, 기술 id, 대상)`(대상이 없으면 `undefined`. 쿨다운·사거리는 보지 않는다. 예: `engine/test/fx/skills.test.ts`).
- 가짜 클라이언트는 실제 화면처럼 **시야**(내 둘레 32) 안의 몬스터와 사람만 받는다. 처음 자리 둘레에 무리가 없으면 보이는 몬스터가 없다: 시험에서는 플레이어를 무리 곁으로 옮긴 뒤 본다.
- 시험도 `tsx --tsconfig`로 돌린다(`npm run test:sample`).
- `npm test`는 틀의 시험(게임 없이 시험용 내용 `engine/test/fx/` 위에서)과 게임마다의 시험이다. `games/<게임>/test/all.ts`와 `tsconfig.json`을 두면 새 게임의 시험도 저절로 함께 돈다(이름은 `<게임>/이름`).
- 틀을 고쳤으면 `npm run typecheck`(틀의 설정 넷과 게임마다의 두 설정: `scripts/typecheck.mjs`가 게임 폴더를 스스로 찾는다)와 `npm test`를 돌린다.
- `npm test`의 끝 줄은 첫 낱말이 곧 결과다: `모두 통과 (검사 N개: …)` 또는 `실패 N건 (검사 M개. 실패가 있는 곳 …)`. 시험 프로세스가 검사 밖에서 죽은 것(예외)도 한 건으로 센다. 실패가 있으면 종료 코드가 1이다.
- 새 게임을 저장소에 들일 때 `package.json`은 고치지 않는다(2절): 타입 검사(`scripts/typecheck.mjs`)도 시험(`test/all.ts`)도 게임 폴더를 스스로 찾는다. 손으로 하는 것은 `.gitignore`의 `dist-<게임>/` 한 줄뿐이다.

화면은 브라우저로 본다. `?lang=en`은 언어, `?auto=이름`은 처음 접속할 때의 이름이다.

## 9. 배포

- **한 곳에 올리기**: 서버가 빌드된 화면을 같은 포트로 내보낸다. Node가 도는 곳 하나면 된다. `npm run build:sample` 뒤 `npm run start:sample`(환경 변수 `PORT`, `DB`).
- **화면만 따로 올리기**(정적 호스팅): 화면은 접속할 때 옆의 `server.json`(`{ "url": "wss://…" }`)을 읽어 서버를 찾는다. 없으면 화면을 내보낸 곳이 곧 서버다. 빌드할 때 `VITE_SERVER_URL=wss://…`로 박아 넣을 수도 있다.
- **운영 설정은 게임 폴더의 `deploy.json` 하나다.** 운영 스크립트 셋이 이것을 읽는다(`scripts/deploy.mjs`). 서버 진입점(`server/main.ts`)의 기본 포트·저장 파일과 같게 적는다.

```json
{ "port": 3002, "db": "data/sample/game.db", "dist": "dist-sample", "bots": 0 }
```

  GitHub Pages에 화면을 올리는 게임은 `"pages": { "repo": "계정/저장소", "dir": ".pages-이름" }`을 더한다(등불지기: `games/deungbul/deploy.json`). 게임마다 포트·저장 폴더·빌드 폴더·Pages 폴더를 따로 둔다(서버를 끄는 깃발 `stop.flag`가 저장 파일 옆에 놓이므로 저장 폴더가 같으면 남의 서버가 꺼진다).

| 스크립트 | 하는 일 | 게임 고르기 |
|---|---|---|
| `node scripts/restart.mjs [게임]` | 저장하고 끈 뒤(`stop.flag`) **감시자 아래에서** 다시 띄운다. 운영체제와 무관하다(Node만). 10초 안에 안 꺼지면 감시자 → 서버 차례로 강제로(cloudflared는 이름을 보고 끄지 않는다). 앞 로그는 `server.log.prev`. 포트가 열리면 `/healthz`가 `ticking:true`가 될 때까지(20초) 다시 묻고 찍는다(막 뜬 서버는 첫 틱 전에 503일 수 있다. 20초 안에 되지 않으면 그 답과 로그의 끝을 찍고 코드 1). `--stop`은 끄기만, `--dry`는 할 일만 | 인자나 `GAME` |
| `node scripts/serve.mjs [게임]` | 감시자: 서버를 자식으로 띄우고, 비정상으로 끝나면 1·2·4…60초 간격으로 다시 띄운다. 코드 0(깃발로 끈 것)이면 멈춘다. 로그를 이어 쓴다. 보통은 `restart.mjs`가 뒤에서 띄운다 | 인자나 `GAME` |
| `bash scripts/restart.sh [로그]` | (예전 것, Windows+Git Bash) 저장하고 끈 뒤(`stop.flag`) 다시 띄운다. 감시자 없이 띄운다. 떠 있지 않으면 그냥 띄운다(처음 띄우는 게임은 저장 폴더를 만든다). 10초 안에 안 꺼지면 강제로. 로그는 저장 파일 옆 `server.log`, 앞 서버의 로그는 `server.log.prev`(저장하고 꺼졌는지 본다). `DRY=1`이면 할 일만 찍는다 | `GAME=sample bash scripts/restart.sh` |
| `bash scripts/stop.sh` | 저장하고 끄기만 한다(강제로 끄지 않는다) | `GAME=sample bash scripts/stop.sh` |
| `node scripts/pilot.mjs [게임]` | 그 게임을 빌드하고 임시 외부 주소(cloudflared)를 붙여 화면과 `server.json`을 Pages에 올린다 | 인자나 `GAME` |
| `bash scripts/publish.sh` | 터널을 그대로 두고 화면만 다시 올린다(먼저 그 게임을 빌드) | `GAME=sample bash scripts/publish.sh` |
| `node scripts/deploy.mjs <칸> [게임]` | 설정의 값 하나를 찍는다(`port`, `db`, `stop`, `dist`, `pagesDir` …) | 인자나 `GAME` |

- 서버와 화면은 같은 순간에 바뀌지 않는다. 열려 있던 탭은 새로고침 전까지 옛 화면이다(7절의 프로토콜 번호).
- 세 스크립트(`restart.mjs`, `serve.mjs`, `restart.sh`)는 환경 변수 `PORT`, `DB`, `BOTS`(그리고 `restart.mjs`·`serve.mjs`는 `LOG`)가 있으면 `deploy.json`보다 그것을 쓴다. `restart.mjs`·`serve.mjs`는 깃발·`serve.pid`·`server.pid`·로그를 **실제 저장 파일(`DB`)의 옆**에 둔다.

### 운영

틀이 서버를 지키는 것. 게임이 따로 할 일은 없다.

- **감시자**: `node scripts/restart.mjs [게임]`으로 띄우면 감시자(`serve.mjs`)가 서버를 지켜본다. 서버가 0이 아닌 코드로 끝나면(처리되지 않은 예외, 강제 종료) 다시 띄우고, 깃발로 저장하고 끈 것(코드 0)이면 함께 멈춘다. 감시자와 서버는 저장 파일 옆에 `serve.pid`, `server.pid`를 적는다.
- **치명적 오류**: 메시지 처리·틱·전송의 예외는 그 자리에서 잡고 계속 돈다. 그 밖의 처리되지 않은 예외(`uncaughtException`)는 로그에 남기고, 저장하고, 코드 1로 끝난다(감시자가 다시 띄운다). 처리되지 않은 거부(`unhandledRejection`)는 로그에 남기고 계속 돈다(틀의 서버는 동기 코드라 거부는 게임이 따로 띄운 비동기 일 하나가 끝났다는 뜻이다).
- **자동 백업**: 켜질 때와 `BACKUP_EVERY_MIN`(기본 360)분마다 저장 파일 옆 `backup/auto-YYYYMMDD-HHMMSS.db`(VACUUM INTO: 그 자체로 열리는 DB). `BACKUP_KEEP`(기본 20)개를 넘으면 가장 오래된 **자동 백업만** 지운다. 이름이 `auto-`로 시작하는 그 꼴이 아닌 파일(사람이 만든 `game.db.<시각>` 같은 것)은 건드리지 않는다. 되돌릴 때는 서버를 끄고 백업 파일을 `game.db`로 복사한다(옆의 `game.db-wal`, `game.db-shm`은 지운다).
- **상태 확인**: `GET /healthz`(JSON: `ok`, 틱이 도는지 `ticking`, 접속 수 `clients`, 마지막 저장 `lastSaveAt`, 저장 실패 수, 마지막 백업)와 `GET /metrics`(텍스트: 틱 시간, 보낸 바이트(압축 전과 뒤), 접속 수, 저장 실패 수, CPU, 메모리). **같은 PC에서 직접 온 요청에만** 답한다: 터널(cloudflared)은 같은 PC에서 들어오므로 프록시 머리말(`cf-connecting-ip`, `cf-ray`, `x-forwarded-for` 등)이 있으면 바깥 요청으로 보고 404를 준다. 틱이 2초 넘게 돌지 않았으면 `/healthz`는 503이다.
- **로그**: 서버의 핵심 줄(켜기, 끄기, 저장, 백업, 오류)에는 시각과 수준이 붙는다(`2026-11-26 07:34:01.777 INFO  [server] …`). 게임도 `log.info/warn/error`(`@engine/server`)를 쓸 수 있다.
- **압축**: WebSocket 압축(perMessageDeflate)이 기본으로 켜져 있다. 회선이 약 1/4로 줄고 CPU를 조금 더 쓴다(수치는 `docs/infra.md` '압축'). 끄려면 `COMPRESS=0`.

### 운영: 관리자 명령

틀에 있으므로 모든 게임이 저절로 갖는다. 서버가 돌고 있는 **같은 PC에서** 보낸다.

```
npm run admin -- [게임] <명령> [인자 …]
npm run admin -- who
npm run admin -- sample ban 아무개 7d 욕설
PORT=3016 DB=/tmp/x/game.db npm run admin -- mute 아무개 30m
```

| 명령 | 하는 일 |
|---|---|
| `who` | 지금 월드에 있는 사람(자리 비움 사냥 포함): 레벨, 주소, 저장 키 앞부분, 말 막힘 |
| `find 이름` | 한 캐릭터의 저장·차단·말 막기·미뤄 둔 지급 |
| `ban 이름 기간 [사유]` / `unban 이름` | 저장 키로 접속 차단. 접속 중이면 끊는다(4003), 자동 사냥으로 남지 않는다. 손님(저장되지 않는 캐릭터)은 `banip`으로 |
| `banip 주소 기간 [사유]` / `unbanip 주소` | 접속 주소 차단 (`::ffff:1.2.3.4`와 `1.2.3.4`는 같다) |
| `mute 이름 기간 [사유]` / `unmute 이름` | 말 막기: 전체 대화와 길드 대화(`gchat`). 막힌 사람은 안내문을 받는다. 손님은 주소로 막힌다 |
| `kick 이름 [사유]` | 내보내기(4002). 화면은 '다시 접속' 단추로만 붙는다 |
| `announce [--chat] 글` | 전체 공지: 가운데 알림(`adminNotice`), `--chat`이면 대화창 한 줄(`adminChat`) |
| `give 이름 무엇 수` / `take 이름 무엇 수` | 지급·회수. 무엇: `gold`, `sparks`, `exp` 또는 아이템 id. 지갑·가방을 지나 장부에 원인 `admin`으로 적힌다(`WHY.admin`). 접속해 있지 않으면 다음 접속 때 적용한다. 회수는 가진 만큼만 |
| `reports [수] [--all]` / `resolve 신고id [메모]` | 신고 목록(처리하지 않은 것, `--all`이면 모두)과 처리 표시 |
| `audit [수]` | 최근 관리자 행동 기록 |
| `errors [수] [--all]` / `errors clear 서명\|all` | 화면 오류 묶음(같은 오류는 한 줄, 최근 순)과 고친 뒤 지우기 (16절 '화면 오류 수집') |
| `erase [list\|log [수]\|ask 이름 [일수]\|cancel 이름\|now 이름\|sweep]` | 내 데이터 삭제 요청: 기다리는 것, 기록, 대신 받기, 거두기, 곧바로 지우기, 때가 된 것 실행 (16절 '약관·처리방침·동의와 내 데이터') |

- 기간: 숫자(시간), `30m`·`12h`·`7d`, `perm`(영구).
- 게임은 첫 인자(게임 폴더 이름) 또는 `GAME`, 포트는 `PORT` 또는 `deploy.json`의 `port`. 토큰은 저장 파일 옆의 `admin.token`(저장 파일은 `DB` 또는 `deploy.json`의 `db`). 다른 곳이면 `ADMIN_TOKEN_FILE`. 기록에 남는 이름은 `ADMIN_BY`, 없으면 PC의 사용자 이름.
- 서버 쪽: `POST /admin`(`engine/server/net/admin.ts`). 같은 PC의 연결만, 터널·프록시의 머리(`CF-Connecting-IP`, `X-Forwarded-For`, `Forwarded`, `CDN-Loop` …)나 브라우저의 머리(`Origin`, `Referer`, `Sec-Fetch-*`)가 있으면 404, 토큰이 틀리면 401. 토큰 파일은 서버가 켜질 때마다 새로 만들고 끌 때 지운다. 저장하지 않는 서버(`DB=memory`)는 통로를 열지 않는다.
- 기록: 모든 명령(읽기만 하는 것도)이 저장 파일 옆 `admin-audit.log`에 처리 전·후 두 줄(JSON)로 남는다. 끄는 설정은 없고, 적지 못하면 명령을 하지 않는다. 끝부분 300줄은 월드 저장에도 남는다.
- 제재와 미뤄 둔 지급, 신고 처리 표시는 월드 저장의 `sanctions` 칸에 있다: 다시 켜도 남는다. 규칙은 `engine/server/game/systems/sanctions.ts`(`g.sanctions`). 귓말이 생기면 그 명령 이름을 거기의 `CHAT_COMMANDS`에 더한다.
- 경제 지표: `npm run econ`의 원인 목록에 `admin` 줄이 따로 보인다.

### 기기 옮기기

메뉴의 '기기' 탭(어느 게임에서나 맨 뒤, `MenuTab.always`)에서 일회용 코드(8자, 10분, 한 번)를 받고, 다른 기기의 직업 고르기 창(새 캐릭터의 첫 화면)이나 같은 탭에 넣으면 그 기기가 새 토큰을 받아 이어받는다. 옛 토큰은 그 뒤로 4001로 거절된다. 받은 코드는 월드 저장에 해시로만 남아, 그 사이에 서버를 다시 켜도(배포) 10분이 지나기 전이면 그대로 쓰인다. 계정이 아니다: [accounts.md](accounts.md)의 '기기 옮기기'. 서버 `engine/server/net/handoff.ts`, 화면 `engine/client/hud/device.ts`.

## 10. 자주 걸리는 곳

| 증상 | 까닭과 고치는 법 |
|---|---|
| 서버가 다른 게임의 몬스터로 뜬다 | `tsx`에 `--tsconfig games/<게임>/tsconfig.json`을 주지 않았다. 그 게임의 스크립트로 띄운다(`npm run start:sample`) |
| 실행하자마자 `undefined`를 읽는다 (`Cannot read properties of undefined`), 내용의 표가 비어 보인다 | 내용 파일이 틀의 도우미에서 **값**을 가져왔다. `import type`으로 바꾼다. 값은 `@engine/shared/defaults`에서만 |
| `contract.ts`의 마지막 줄에서 오류 | 계약의 이름이 빠졌거나 모양이 다르다. 오류 글의 끝에 이름이 있다 |
| `engine/client/hud/notify.ts`나 `hud/menu/gear.ts`에서 "MsgKey로 인덱스할 수 없다", "Property '…' does not exist" | `MsgMap`에 안내문을 더했는데 언어 파일의 `msg`에 문장이 없다(또는 `LocaleExt` 선언을 아직 하지 않았다) |
| 틀의 타입이 게임의 칸(`g.bonfire`, `p.fed`, `m.s.bonfire`)을 모른다 | 선언 파일에 `export`가 하나도 없다(`export {};`를 둔다, 6절 (1)). 또는 선언 파일이 그 `tsconfig`의 `include` 안에 없다. 선언 병합은 인터페이스가 선언된 바로 그 파일(`@engine/shared/ext`, `@engine/server/game/ext`, `@engine/client/i18n/ext`)을 가리켜야 한다 |
| 두 게임의 타입이 섞인다, `@game`이 엉뚱한 곳을 가리킨다 | 한 `tsc` 프로그램에 두 게임을 넣었다. 게임마다 자기 `tsconfig.json`으로만 검사한다. 뿌리의 `tsconfig.json`에 새 게임 폴더를 더하지 않는다 |
| 화면의 글자가 비어 있다 | 그 키가 언어 묶음에 없다. `setLocales`를 `startClient`보다 늦게 불렀거나, 창을 `startClient` 뒤에 붙였다(그때는 `data-i18n`이 이미 채워진 뒤다) |
| `$('내창')`이 `null` | 모듈이 읽히는 때에 요소를 잡았다. init 안에서 잡는다 |
| `mountPanel: '…' 자리의 기준 요소가 화면에 없습니다` | 자리 이름이 틀렸다(`shell.ts`의 `SLOTS`, 6절 (4)의 표). 모듈을 고르지 않아 기준 요소가 없는 자리는 다른 자리로 대신 붙는다: `meHp`·`meGold` → `meRows`, `actions` → `actionsEnd` |
| `g.wallet: 모듈 'economy'를 고르지 않았습니다` (다른 모듈도 같은 꼴) | 고르지 않은 모듈의 시스템을 건드렸다. `MODULES`에 그 모듈을 더하거나, 쓰지 않을 수도 있는 곳이면 `g.has('economy')`로 먼저 묻는다 |
| 서버·화면이 시작하자마자 "고른 모듈이 의존하는 모듈이 빠졌습니다: market → items" | `MODULES`에 의존하는 모듈을 함께 적는다(1절의 표) |
| 내 엔티티 종류가 화면에 회색 상자로 보인다 | 화면에서 `registerKind`를 하지 않았거나 종류의 이름이 서버의 `g.defineKind`와 다르다 |
| 내 엔티티가 보이지 않는다, 멀리 있는 것이 사라진다 | 층(채널)이 다르다: `g.place`의 `layer`를 주지 않으면 1채널의 들판이다. 채널이 여럿이면 채널마다 놓거나 `CHANNEL.count`를 1로 둔다. 또는 시야(`NET.aoi`, 기본 32m) 밖이다: 넓은 맵은 `NET`을 넓힌다(3절) |
| 경기장(맵)의 일부만 보인다, 카메라가 너무 가깝다 | 카메라의 거리·배율 범위는 내용의 `CAMERA`, 비추는 곳은 `setCameraAim`(5절 '카메라') |
| 내 창이 다른 창 뒤에 그려진다, 처리기가 엉뚱한 차례로 불린다 | 등록한 차례가 불리는 차례다. `modules`의 차례를 바꾼다. 게임의 모듈은 틀의 덧붙는 모듈보다 먼저 init된다 |
| 걷다가 뒤로 당겨진다 | 화면의 `rules.speed`와 서버의 `g.rules.speed`가 다른 값을 낸다. 같은 공용 함수로 셈한다 |
| `g.daily`(또는 `g.mail`, `g.gear` …)가 플러그인 안에서 `undefined` | 그 시스템은 플러그인보다 뒤에 만들어진다. `g.ready.push(() => …)` 안에서 쓴다 (그 모듈을 고르지 않았으면 위의 '고르지 않았습니다' 오류다) |
| 값을 바꿨는데 화면에 오지 않는다 | 표시를 세우지 않았다: `p.dirty`(틀의 수치), `g.stateDirty`(공유 상태). 6절의 표 |
| 재시작하면 값이 처음으로 돌아간다 | `g.saves`나 `g.worldSaves`에 등록하지 않았거나, `p.unsaved` / `g.saveDirty`를 세우지 않았다 |
| 내가 띄운 서버가 저절로 꺼진다 | 다른 서버와 저장 폴더가 같다(`stop.flag`). 게임마다, 확인용 서버마다 폴더를 따로 준다 |
| 개발 서버(vite)의 화면이 다른 게임의 서버에 붙는다 | `vite.config.ts`의 `VITE_DEV_PORT`가 그 게임의 서버 포트와 다르다(없으면 3001) |
| `npm test`의 `boundary`가 "알림 …: 'hex' (games/…의 id와 같은 틀의 낱말. 잡지 않는다)"라고 적는다 | 실패가 아니다. 그 게임의 id가 틀이 자기 뜻으로 쓰는 낱말(`hex`, `heal` 같은 것)과 같을 뿐이다. 헷갈리지 않게 다른 id로 짓기를 권한다 |
| 타입 검사와 그 게임의 시험은 통과하는데 `npm test`의 `boundary`에서 "게임은 틀을 입구로만 읽는다"가 실패한다 | 틀의 내부 파일을 깊게 import했다(`@engine/server/game/entity` 같은 것). 1절의 입구(`@engine/server` 등)에서 가져온다. 실패 글이 파일과 줄을 알려 준다 |
| 쓰러지면 "…에서 다시 일어났습니다"의 자리에 엉뚱한 말이 나온다 | 이름표의 `places`에 `g.rules.respawn`이 돌려주는 id의 이름이 없다(5절). 정하지 않았으면 '처음 자리'다 |
| 내 내용은 계약을 지키는데 `engine/` 안의 파일에서 타입 오류가 난다 | 틀은 내용을 계약의 타입이 아니라 **게임이 적은 그대로의 타입**으로 본다. 표를 비웠거나(`{}`의 id는 `never`가 된다) 함수를 계약보다 좁게 적은 자리에서 틀이 걸릴 수 있다. 시험이 지키는 경우: 던전·대장간·보스·두 번째 재화가 없다(예제), 상점·무리·재료·일일 임무가 없다, 아이템이 무기 하나뿐이다(`games/sample/test/empty.test.ts`), **`CAMPS`를 적지 않았다**(예전에는 `monsters.ts`에서 "`string`을 몬스터 id에 넣을 수 없다"), **아이템이 무기와 재료뿐이고 갑옷이 없다**(`as const`의 좁은 종류: 예전에는 `gear.ts`·`shop.ts`에서 "'mat'과 'armor'는 겹치지 않는다". 둘 다 2026-11-26부터 틀이 넓혀 읽는다: `engine/test/collect/idleflow.test.ts`). 그 전의 틀을 쓰는 게임은 `CAMPS: readonly { …; types: readonly MonsterId[] }[] = []`로 적거나 그 칸의 종류를 `kind: 'mat' as ItemDef['kind']`로 넓혀 피한다. 그 밖의 경우(직업이 하나, 몬스터가 한 종류 …)에 걸리면 틀의 수리 대상이다: `npm run typecheck:game -- sample`과 같은 검사를 자기 게임의 설정으로 돌려 자리를 찾는다 |

**틀을 고쳐야 할 때**: 게임에서 할 수 없는 일이면 틀에 접점을 더한다. 틀의 파일이 게임의 폴더를 import하거나 게임의 id를 적으면 안 된다(`games/deungbul/test/split.test.ts`가 검사한다). 고친 뒤에는 8절의 검사를 모두 돌린다. 틀에 남아 있는 등불지기의 흔적과 알려진 한계는 `docs/framework-status.md`에 있다.

알아 둘 한계:

- 엔티티(`Ent`)의 모듈의 칸(레벨, 골드, 장비, 우편 …)은 그 모듈을 고른 게임의 엔티티에만 있지만, 타입(`Ent`)에는 늘 보인다(6절 '엔티티의 칸'). 고르지 않을 수도 있는 모듈의 칸은 `g.has`로 묻거나 `g.field`로 읽는다.
- 엔티티의 상태 한 줄은 `[id, x, z, 방향, 이동 중, 체력, …게임의 값]`이고, **체력 칸은 전투(`combat`)를 고른 게임에만** 있다(없는 게임은 `[id, x, z, 방향, 이동 중, …값]`). 들어올 때의 정보(`EnterInfo`)도 무기(`w`)는 `items`, 직업(`c`)은 `classes`, 체력(`hp`, `maxHp`)은 `combat`을 고른 게임에만 있다. 게임의 값은 수로만 붙는다(글자는 `type`, `name`으로 처음 들어올 때 한 번). 본인의 `you`(`[x, z, 이동 중, 체력, 대상, …]`)는 모양이 고정이다(체력이 없는 게임은 0).
- 엔티티끼리 부딪히는 물리는 없다: 사람은 장애물(둥근 기둥)만 피해 걷는다. 공을 차는 것 같은 일은 게임의 `tick`이 셈한다.
- 재화(`economy`)는 세 칸(`gold`, `sparks`, 경험치)으로 정해져 있다. 두 번째 재화는 한 가지(`sparks`)뿐이다. 이름은 이름표의 `currency1`·`currency2`로 준다.
- 기술의 효과는 여섯 가지다(`engine/shared/defs/combat.ts`의 `SkillEffect`). 이보다 새로운 효과는 틀의 `engine/server/game/systems/combat.ts`의 `cast`를 고쳐야 한다.
- 사람 모델은 틀의 네모난 사람이 기본이다. 꾸밈을 더하거나(`setHumanoidDeco`) 통째로 바꿀 수 있다(`setHumanoidBody`: 옷 색·손 모양·살갗 색을 받아 모델을 돌려준다. 걷는 동작은 `rig`의 팔다리 넷으로, 무기의 겉모습은 `blade`로 따라간다). 손 모양과 날아가는 것은 등록으로 늘린다(`registerHand`, `registerShot`).
- 메뉴의 탭은 틀의 일곱(`gear` 장비, `build` 성장, `mail` 우편, `daily` 일일, `market` 거래소, `guild` 길드, `rank` 순위)과 수집형 모듈의 넷(`heroes` 영웅, `gacha` 뽑기, `squad` 편성, `stages` 단계: 13절)이다. 게임은 `setMenuTabs([...])`로 보일 탭과 차례를 고르고, `addMenuTab({ id, label, draw, dot?, open?, sig? }, 뒤에 올 탭)`으로 자기 탭을 더한다. 일일 임무도 출석도 없으면 일일 탭은 저절로 숨는다. 틀의 탭은 그 모듈을 고른 게임에만 있다: 거래소·길드를 쓰지 않으면 `MODULES`에서 뺀다(탭도 서버의 기능도 없다). `setMenuTabs`로 감추기만 하면 서버의 기능은 그대로 돈다. 예제는 거래소와 길드를 모듈에서 빼고 모닥불 탭을 더했다(`client/bonfire.ts`).
- 장부를 보는 도구(`npm run econ`)는 등불지기의 것이다(`games/deungbul/scripts/econ.ts`). 장부 자체(`g.ledger`)와 서버 지표의 한 줄 요약은 틀의 것이라 어느 게임에서나 돈다.

## 11. 접점 일람표

"접점" 칸의 파일 이름은 그것이 **정의된 곳**이다(모양과 주석을 볼 때 연다). **가져올 때는 1절의 입구를 쓴다**: 서버의 것은 `@engine/server`, 화면의 것은 `@engine/client`, 문장은 `@engine/client/i18n`, 시험 도구는 `@engine/testing`. "예제" 칸은 그 접점을 쓰는 예제의 파일이다(`games/sample/` 아래). 없는 것은 등불지기(`games/deungbul/`)에 쓰임이 있다.

### 공용 (`engine/shared/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `contract.ts`의 `CoreContent`(`MAP`, `MODULES`)와 모듈의 계약(`CombatContent` …) | 게임의 내용이 갖춰야 하는 이름과 모양. 모듈의 것은 선택(적지 않으면 기본값) | `shared/content/index.ts` |
| `modules.ts`의 `MODULE_TABLE`, `RPG_MODULES`, `ModuleId`, `checkModules`, `MODULE_SAVES` | 선택 모듈의 표와 의존, 모듈의 저장 칸 | `shared/content/index.ts` |
| `defaults.ts` | 수치의 기본값 묶음(게임이 적지 않은 이름을 틀이 채운다). `NET`(틱·전송 주기, 시야), `CAMERA`(카메라의 거리·배율), `HOME_KEY`(H 키), `GEAR_BASE` | `shared/content/index.ts` |
| `defs/*.ts`의 타입 | `MapDef`, `ClassDef`, `SkillDef`, `MonsterDef`, `ItemDef`, `ForgeDef`, `Recipe`, `DungeonDef`, `DailyDef`, `Reward` | `shared/content/index.ts` |
| `defs/collect.ts`의 타입과 도우미 | `HeroDef`, `HeroRoleDef`, `HeroRarityDef`, `HeroRules`, `BannerDef`, `ChapterDef`, `StageDef`, `IdleCtx`, `heroStats`, `heroPower`, `bannerOdds`, `poolOdds`, `seededRng`, `STAGES`, `stageIndex` (13절) | `engine/test/collect/shared/content/index.ts` |
| `defs/hud.ts`의 `HudRules`, `HUD_PARTS`, `HudPart` | 내용의 `HUD`: 감출 틀의 요소(가방 단추, '가까운 대상 공격' …: 13절 '단계 밖') | `engine/test/collect/shared/content/index.ts` |
| `defs.ts`, `world.ts` | 틀의 내용 통로: 타입, 도우미(`maxHpFor`, `itemDef` …), 계약의 내용, 엔진 상수. 내용 파일 밖에서는 여기서 읽는다 | `client/scene.ts`, `test/sample.test.ts` |
| `ext.ts`의 `MsgMap` | 안내문의 종류와 값 | `shared/sample.ts` |
| `ext.ts`의 `ClientMsgs` / `ServerMsgs` | 화면 → 서버 / 서버 → 화면 메시지 | `shared/sample.ts` (`ServerMsgs`는 쓰지 않는다) |
| `ext.ts`의 `WorldState` | 공유 상태의 칸 | `shared/sample.ts` |
| `protocol.ts`의 `PROTOCOL` | 프로토콜 번호 | |
| `defs/rooms.ts`의 `RoomView`, `RoomLobby`, `RoomRow`, `RoomSeatView`, `RoomPhase` | 판 모듈이 보내는 상태의 모양 (14절). 입구 `@engine/shared`·`@engine/client`에서 `import type` | `engine/test/core/client/stars.ts` |

### 서버 (`engine/server/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `run.ts`의 `runServer` | 환경 변수, 저장소, 종료 처리까지 한 번에 | `server/main.ts` |
| `net/server.ts`의 `startServer` | 서버만 띄운다 (시험, 손수 다루는 진입점) | `test/sample.test.ts` |
| `GameOptions.plugins` | 규칙 플러그인 `(g) => void` | `server/sample.ts` |
| `GameOptions.modules`, `g.has(모듈)`, `g.modules` | 쓸 모듈(주지 않으면 내용의 `MODULES`), 골랐는가 | |
| `g.defineKind(종류, KindDef)`, `g.place(종류, 자리)`, `Ent.data` | 게임의 엔티티 종류(틱, 화면에 실을 값, 저장)와 놓기 (12절) | `engine/test/core/server/balls.ts` |
| `g.playerSync(fn)` | 플레이어에게 실어 보낼 게임의 값(역할 …): 6절 '사람마다의 값과 겉모습'. 팀은 `teams` 모듈이 쓴다 | |
| `g.teams` (`teams` 모듈: `of`, `index`, `members`, `count`, `auto`, `set`, `add`, `score`, `reset`, `addPlayer`, `playerScore`, `syncAlso`) | 팀과 점수: 6절 '팀과 점수판' | `games/rollball/server/pitch.ts` |
| `g.roster`(`grant`, `owned`, `power`, `levelUp`, `starUp`), `g.gacha`(`draw`, `pityOf`, `rng`), `g.squad`(`set`, `heroes`, `power`), `g.stages`(`start`, `leave`, `inStage`, `cleared`), `g.dungeon`의 `keyCount`·`giveKeys`, 사건 `heroChanged`·`stageCleared` | 수집형·방치형의 넷과 던전의 열쇠: 13절 | `engine/test/collect/server/heath.ts` |
| 단계 밖: `g.dungeon.go(p, id)`(메뉴에서 들어가기, 명령 `dungeonGo`), `g.roster.trade(p, 영웅, 아이템, n)`(재료로 조각), `g.stages.returnIn(p)`, 사건 `dungeonExited(p, id, why)`, `leaderFight(g, p, 적 id들)`(서버가 사람을 대신 싸우게 하는 한 셈) | 13절 '단계 밖' | `engine/test/collect/idleflow.test.ts` |
| `g.monstersIn(층)` | 그 층의 몬스터(만든 차례, 쓰러진 것 포함): 둘레의 몬스터를 찾을 때 엔티티 전부를 훑지 않는다. 몬스터의 층은 `spawn` 바로 뒤에 정한다(편성의 영웅·전투의 범위 기술이 쓴다: [infra.md](infra.md) '부하와 장시간') | `engine/server/game/systems/squad.ts` |
| `g.combat.registerAlly(종류, { owner, down, skillScale? })` | 사람 편에서 싸우는 게임의 종류(소환수, 용병): 몬스터를 때리고 맞는다. 피해는 주인의 것으로 친다 (13절 '편성') | |
| `g.on('playerJoined' \| 'playerLeft' \| 'playerDropped', …)` | 사람이 들어왔다(봇 제외) / 월드에서 빠졌다(id) / 연결이 끊겨 저장하기 직전 | `games/rollball/server/pitch.ts` (`playerLeft`) |
| `g.perFlush` | 전송마다 본인에게 보낼 메시지를 만드는 것 (틀의 `stat`·`meta`가 쓴다) | |
| `game/ext.ts`의 `GameSystems` | `g.내시스템` | `server/sample.ts` |
| `game/ext.ts`의 `EntExt` + `g.entInit` | 엔티티 칸과 처음 값 (고른 모듈의 칸이 채워진 뒤에 불린다) | `server/sample.ts`, `server/bonfire.ts` |
| `game/parts.ts`의 `EntParts`(모듈마다 `CombatPart` 같은 것), `g.field(e, 칸)` | 모듈의 엔티티 칸: 그 모듈을 고른 게임에만 있다. `g.field`는 고르지 않았으면 처음 값 (6절 '엔티티의 칸') | |
| `game/ext.ts`의 `HooksExt` + `g.on` / `g.fire` | 게임의 사건 | `server/sample.ts`, `server/bonfire.ts` |
| `game/ext.ts`의 `RulesExt`, `ModsExt` | `g.rules`와 `g.mods`에 게임의 칸을 더한다 | |
| `g.ready` | 모든 시스템이 만들어진 뒤에 한 번 | `server/sample.ts` |
| `g.commands` | 플레이어 명령 | `server/bonfire.ts` |
| `g.ticks` | 틱마다 | `server/bonfire.ts` |
| `g.saves` / `g.worldSaves` | 캐릭터 저장 / 월드 저장의 한 칸 | `server/bonfire.ts` |
| `g.shared` / `g.personal` | 공유 상태 / 개인 상태의 한 칸 | `server/bonfire.ts` |
| `g.notify` / `g.announce` | 한 사람 / 모두에게 안내문 | `server/bonfire.ts` |
| `g.rules` | `respawn`, `speed`, `canChangeClass`, `unlocked`, `touched`, `siege` | `server/bonfire.ts` (`respawn`, `canChangeClass`, `touched`) |
| `g.mods.provide` | 수치 보정 | `server/bonfire.ts` (`regen`) |
| `g.out` | 한 사람에게 게임의 메시지(`ServerMsgs`) | |
| `g.killBonus` | 처치 경험치에 덧붙는 값 | |
| `g.daily.add`, `g.mail.send`, `g.players.grant` | 틀의 시스템을 부른다 | `server/sample.ts` (`g.daily.add`) |
| `Channels.extraFoes` / `busy`, `Saver.legacy` | 틀의 시스템이 묻는 선택 접점, 옛 저장 읽기 | |
| `g.migrations.player` / `world` (`Migration`) | 게임의 저장 형식 이전 (7절 '저장 형식을 바꿀 때') | |
| `Store.transaction` | 저장소의 쓰기를 한 묶음으로 | |
| `log.info` / `warn` / `error` | 시각과 수준이 붙는 로그 | |
| `game/entity.ts`의 `dist`, `readInt`, `clamp`, `ri` | 작은 도우미 (`readInt(v, 아래, 위, 기본)`은 범위를 벗어난 수를 **자르고**, 기본값은 수가 아닐 때만 쓴다) | `server/bonfire.ts` |
| `g.movement.teleport`, `g.remove`, `g.effect` | 순간 이동, 엔티티 없애기, 연출 사건 (6절 요약표, 14절) | `games/stepstone/server/duels.ts` |
| `g.rooms` (`rooms` 모듈: `define`, `of`, `myTurn`, `place`, `unplace`, `pass`, `finish`, `rankOf`, `touch`, `playerAt`, `players`, `all`, `count` …), `Room`, `RoomDef`, `RoomSeat` | 판: 14절 | `engine/test/core/server/stars.ts` |

### 화면 (`engine/client/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `main.ts`의 `startClient({ look, modules })` | 틀을 시작시킨다 | `client/main.ts` |
| `i18n`의 `setLocales`, `mergeLocale`, `koBase` / `enBase`, `LocaleExt`, `ContentNames` | 언어 묶음 | `client/i18n/index.ts`, `client/i18n/ko.ts` |
| `i18n`의 `t`, `L`, `onLangChange` | 문장 읽기, 언어가 바뀔 때 | `client/bonfire.ts` (`onLangChange`는 쓰지 않는다: 느린 주기가 다시 쓴다) |
| `hud/shell.ts`의 `mountPanel` | 게임의 창을 틀의 빈 자리에 | `client/bonfire.ts` |
| `app.ts`의 `$`, `view` | 요소 잡기, 3D 화면(`view.scene`, `view.setMood`) | `client/bonfire.ts`, `client/scene.ts` |
| `bus.ts`의 `onMsg`, `onFrame`, `onSlow`, `onKey` | 서버 메시지, 매 프레임(`(now, dt)`: `now` ms(`performance.now`), `dt` 초(0.05로 자른다)), 0.25초마다, 단축키(고른 모듈이 쓰지 않는 키. 이름은 소문자 `KeyboardEvent.key`: 5절 '단축키') | `client/bonfire.ts`, `client/scene.ts` |
| `kinds.ts`의 `registerKind`, `scene/models.ts`의 `makeBox`, `makeBall` | 게임의 엔티티 종류의 모습 (12절) | `engine/test/core/client/main.ts` |
| `hud/collect.ts`의 `myHeroes`, `mySquad`, `onGachaResult`. `hud/stagebar.ts`의 `myStage`. `registerKind`의 `hp`, `shot` | 수집형·방치형의 화면이 받은 상태와 뽑기 결과, 게임의 종류의 체력 막대·날아가는 것 (13절) | `engine/test/collect/client/main.ts` |
| 단계 밖: `hud/collect.ts`의 `setHeroModel`(영웅 id·등급으로 영웅의 모델), `hud/idleback.ts`의 `onIdleBack`, `hud/dungeon.ts`의 `myKeys`. `scene/models.ts`의 `HumanoidLook.hero`·`rarity` | 13절 '단계 밖' | `engine/test/collect/client/main.ts` |
| `hud/menu/parts.ts`의 `menuRow`, `menuButton`, `menuEl`, `menuSpan`, `menuChips`, `redrawMenu`(입구의 이름), `hud/menu.ts`의 `closeMenu` | 게임의 메뉴 탭을 틀의 탭과 같은 모양(class `mrow`, `plain` …)으로 만드는 도우미, 메뉴 닫기 | |
| `mods.ts`의 `hasModule`, `anyModule` | 이 게임이 그 모듈을 골랐는가 | |
| `i18n/names.ts`의 `withIdNames` | 적지 않은 이름표는 id 그대로 (쓰지 않는 모듈의 이름을 적지 않아도 된다) | `engine/test/core/client/main.ts` |
| `net.ts`의 `send` | 서버로 명령 | `client/bonfire.ts` |
| `state.ts`의 `S` | 틀의 상태. `S.me`: 내 캐릭터(`Me`: `id`, `name`, `x`, `z`, `model`(`model.root`가 three.js 묶음), `vals`(`g.playerSync`의 값), 모듈의 수치 `hp`·`lv`·`gold`·`items` …. 접속 전이면 `null`). `S.others`: 시야 안의 다른 엔티티(`Map<id, Remote>`: `kind`(`'p'` 사람, `'m'` 몬스터, 게임의 종류), `type`, `name`, `x`, `z`, `model`, `vals`). `S.online`(접속자 수), `S.zoom`(카메라 배율), `S.party`. 그 밖의 칸은 모듈의 것(`engine/client/state.ts`) | `client/bonfire.ts` |
| `rules.ts`의 `rules` | 화면 쪽 규칙 | `client/bonfire.ts` (`home`) |
| `camera.ts`의 `setCameraAim`, `fitZoom`, `CameraAim`(`center`), `setCameraYaw`, `cameraYaw` | 카메라가 비출 곳과 배율, 네모가 다 보이는 배율, 폰 세로에서도 한가운데, 카메라 돌리기 (5절 '카메라') | `games/rollball/client/pitch.ts`, `games/stepstone/client/duel.ts` |
| `actions.ts`의 `setTapHandler`, `scene/view.ts`의 `view.pick`, `view.project` | 땅 누르기를 게임이 받기, 화면 점 → 땅의 점, 월드 → 화면 (14절) | `games/stepstone/client/duel.ts` |
| `entities.ts`의 `onEffect` | 서버의 연출 사건 받기 (14절) | `games/stepstone/client/duel.ts` |
| `hud/rooms.ts`의 `myRoom`, `myRoomTurn`, `onRoomChange`, `roomLeftMs`, `roomSeatName`, `roomSend`, `setRoomLook` | 판 모듈의 화면에 게임이 더하는 것 (14절: 자리 색·이름, 막대 아래 글, 결과의 큰 글, 좁은 화면의 막대 자리 `barAt`) | `engine/test/core/client/stars.ts` |
| `entities.ts`의 `setPlayerLook`, `PlayerLook`, `PlayerInfo` | 사람의 옷 색과 꾸밈을 게임의 값으로 (6절). `teams` 모듈을 고른 게임은 그 모듈이 쓴다 | `engine/client/hud/teams.ts` |
| `hud/teams.ts`의 `setTeamBoardExtra`, `onTeamLook`, `myTeam`, `myTeamScore`, `teamBoard` | 팀 모듈의 화면에 게임이 더하는 것 (6절 '팀과 점수판') | `games/rollball/client/pitch.ts` |
| `hud/notify.ts`의 `addNotices`, `banner`, `feed` | 안내문을 띄울 곳: `banner`(가운데, 색조 `'' \| 'good' \| 'bad'`), `feed`(흘러가는 알림), `quiet`(대화창에 남기지 않는다: 차례마다 오는 알림처럼 대화를 밀어내는 것). 어디에도 적지 않은 안내문은 대화창에 남는다 | `client/bonfire.ts`, `games/stepstone/client/duel.ts`(`quiet`) |
| `hud/icons.ts`의 `addIconSheet`(`addItemSheet`), `itemIcon`, `gearIcon`, `hasItemIcon` | 그림 시트를 등록하고(열쇠: 아이템 id, `slot:칸`, `cur:gold`, `cur:second`, `ui:mail`), 그림 하나의 요소를 만든다(게임의 창에서도 쓸 수 있다) | |
| `hud/menu.ts`의 `setMenuTabs`, `addMenuTab`, `openMenu`, `MENU_TABS` | 메뉴에 보일 탭과 차례(틀의 탭은 그 모듈을 고른 게임에만 있다), 게임의 탭, 탭을 골라 열기 | `client/bonfire.ts` |
| `hud/near.ts`의 `addPlace` | 가까이 가면 열리는 창: id는 **화면에 있는 그 창의 요소 id**(mountPanel로 붙인 것). 창이 없는 곳(지도의 거점)은 부르지 않는다(지도는 `addMapPlaces`) | `client/bonfire.ts` |
| (미니맵에는 틀이 스스로 찍는 표식이 없다: 몬스터·사람·파티원·나만 찍고, 상인·거점·목적지 같은 표식은 게임이 `addMarks`로 찍는다. 색은 `MARK`의 `lit`, `dark`, `shop`, `quest`, `portal`을 쓰거나 아무 색이나 준다. 표식 하나는 `{ x, z, color, shape }`이고 `shape`(`'dot' \| 'square' \| 'ring'`)는 빠뜨리면 안 된다) `hud/minimap.ts`의 `addMarks`, `setMapPaint`, `MARK`, `addMapLabels`. `hud/worldmap.ts`의 `addMapPlaces`, `travelTo`, `stopTravel` | 미니맵과 전체 지도의 표식과 바탕, 전체 지도의 큰 이름(구역)과 장소. 전체 지도(N 키·미니맵·`지도` 단추)는 틀이 그린다: 상점·대장간·던전의 문·사냥터(`CAMPS`)·우두머리는 틀이 내용에서 스스로 장소로 찍고, 게임은 자기 장소(거점, 목적지 …)를 `addMapPlaces`로 더한다(갈래 `PlaceKind`: goal, town, shop, forge, dungeon, hunt, boss, other). 장소를 누르면 정보 카드, 목록에서 '자동 이동'과 '가서 자동 사냥'(`hunt: true`). 모양: `addMapLabels(() => [{ x, z, text, big: true }])`, `addMapPlaces(() => [{ x, z, name, kind: 'town', info?, locked?, hunt? }])`. 함수는 그릴 때마다 불리므로 안에서 `t()`·지금 상태를 읽으면 언어와 상태를 따라간다. 게임이 `travelTo({ x, z, name }, hunt?)`를 직접 불러 다른 지역(던전 안)의 자리를 주면, 들판에서는 그 던전의 문까지 데려가 멈추고(들어가는 것은 사람이: 하루 횟수를 쓴다) 던전 안에서는 먼저 나가라고 알린다 | `client/bonfire.ts`, `client/scene.ts` |
| `hud/classes.ts`의 `openClasses` | 직업 고르기 창 열기 | `client/bonfire.ts` |
| `scene/view.ts`의 `Look` | 땅, 잎, 건물 | `client/scene.ts` |
| `scene/models.ts`의 `registerMonsterModel`, `registerBlade`, `registerArmor`, `mat`, `part`, `limb` | 모델 | `client/scene.ts` |
| `scene/models.ts`의 `setHumanoidDeco`, `setHumanoidBody`, `makeHumanoid`, `registerHand`. `fx.ts`의 `registerShot` | 사람 모델의 꾸밈과 통째로 바꾸기, 사람형 NPC, 손 모양, 날아가는 것 | `client/scene.ts`(`registerHand('axe', …)`) |
| `entities.ts`의 `addNpc`, `setMerchant` | 화면에만 서 있는 사람, 상점 자리마다 세울 상인(모델·이름·바라볼 곳, `null`이면 세우지 않는다) | |
| `scene/gltf.ts`의 `registerMonsterAsset`, `registerHumanoidAsset`, `registerWeaponAsset`. `assets.ts`의 `setClipNames`, `DEFAULT_CLIPS`, 타입 `ModelAsset`·`HumanoidAsset`·`WeaponAsset`·`ModelFit`·`AnimState`. `scene/models.ts`의 `cueAnim` | 모델 파일(glTF/GLB)과 클립 이름, 한 번 도는 동작을 틀기 | `client/scene.ts` |
| `sound.ts`의 `addMsgSounds`, `sfx`, `playSound`, `setMusicPicker`, `enableVolume`. `assets.ts`의 `registerSound`, `registerMusic` | 안내문의 소리, 효과음 파일(키마다, 없으면 합성음), 배경음과 고르기, 음량 단추. `sfx`는 인자 없는 함수들이다(`sfx.hit(crit?)`, `sfx.hurt()`, `sfx.kill()`, `sfx.skill()`, `sfx.fanfare()`, `sfx.bad()`, `sfx.pickup()` …: `engine/client/sound.ts`) | `client/scene.ts` |
| `actions.ts`의 `goToTown`, `autoWalk` | 걸어가게 하기 | |
| `style.css`의 색 변수와 class | 창의 모양 | `client/sample.css` |

### 시험 (`engine/test/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `harness.ts`의 `check`, `failures` | 검사 기록 | `test/sample.test.ts`, `test/all.ts` |
| `harness.ts`의 `connect`, `until`, `sleep`, `settle` | 가짜 클라이언트(피어의 `youRaw`, `lines`: 스냅샷의 날것), 기다리기 | `test/sample.test.ts` |
| `new Game({ plugins, now, modules })` | 서버 없이 규칙만 (모듈을 줄여 볼 수도 있다) | `test/sample.test.ts` |

## 12. 짧은 예시: 전투 없는 게임 (공 마당)

모듈을 하나도 고르지 않고(핵심만), 게임이 등록한 엔티티 "공"을 줍는 게임이다. 전투·직업·장비·몬스터·재화가 없다. 본보기는 틀의 시험용 최소 내용 `engine/test/core/`에 있다(시험과 화면을 함께 쓴다). 새 게임으로 만들 때는 이 파일들을 `games/<게임>/`의 같은 자리(`shared/content/index.ts`, `server/`, `client/`)에 옮기고, 2절의 설정(`tsconfig.json`, `vite.config.ts`, `deploy.json`)을 둔다. 틀의 파일은 입구(`@engine/server`, `@engine/client`)로 가져온다(본보기는 틀 안의 시험이라 상대 경로로 가져온다).

### 내용: 맵과 모듈만

```ts engine/test/core/shared/content/index.ts
/** 쓸 모듈: 없다 (핵심만) */
export const MODULES: readonly ModuleId[] = [];
export const GUEST_NAME = 'Picker';
/** 시야를 기본(32m)과 다르게: 틀이 시야를 박아 두지 않고 내용에서 읽는지 시험이 본다 */
export const NET = { tickMs: 50, snapEvery: 2, aoi: 20, aoiLeave: 24 };
/** 채널은 하나 */
export const CHANNEL = { count: 1, soft: 30, hard: 50, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };
```

```ts engine/test/core/shared/content/index.ts
export const MAP: MapDef = {
  areas: [{ id: 'yard', x0: -40, x1: 40, z0: -40, z1: 40 }],
  edge: 2,
  seed: 5,
  spawn: { x: 0, z: 0 },
  obstacles: [{ x: 10, z: 0, r: 2, tag: 'well' }],
  scatter: [{ kind: 'rock', count: 6, x0: -36, x1: 36, pad: -4, s0: 0.6, s1: 0.5 }],
  isFree: (x, z) => Math.hypot(x, z) > 12,
  portals: {},
  portalClear: 0,
};
```

직업, 몬스터, 아이템, 재화 같은 이름은 적지 않는다. 이 게임만의 값(`BALL_SPOTS`)은 같은 파일에 더해도 된다(틀은 읽지 않는다).

### 서버: 엔티티 종류 하나와 명령 하나

`g.defineKind(종류, { tick, sync, save, load })`로 게임의 엔티티를 등록하고 `g.place(종류, { x, z, type, name, layer })`로 놓는다.

- `sync`: 시야 안의 화면에 실어 보낼 수 몇 개. 바뀌면 다시 간다(엔티티 상태 `[id, x, z, 방향, 이동, …이 값들]`. 전투를 고른 게임은 `이동` 뒤에 체력 칸이 하나 더 있다). 플레이어에게 싣는 값은 `g.playerSync`(6절).
- 플레이어는 종류 `'p'`, 몬스터는 `'m'`이다(그 두 이름은 `defineKind`에 쓸 수 없다). 위의 `pick`처럼 사람들을 훑을 때는 `g.ents`에서 `e.kind === 'p'`를 고른다.
- `save`·`load`: 주면 월드 저장의 `kind.<종류>` 칸에 적히고, 다시 켜면 처음 놓은 것을 지우고 저장에서 되살린다.
- `tick`: 틱마다 그 종류의 엔티티 하나마다. 움직이게 하려면 `x`, `z`를 바꾸거나 `g.movement.goTo`·`walk`를 쓴다.
- 게임의 값은 `e.data`(아무 값이나)나 선언 병합한 칸(`EntExt`, 6절)에 둔다.

```ts engine/test/core/server/balls.ts
export const balls: Plugin = (g) => {
  g.defineKind('ball', {
    tick: (e, dt) => { e.data.age = Number(e.data.age ?? 0) + dt; },
    sync: (e) => [Number(e.data.glow ?? 0), Number(e.data.owner ?? 0)],
    save: (e) => ({ x: e.x, z: e.z, glow: Number(e.data.glow ?? 0) }),
    load: (raw) => {
      const r = raw as { x: number; z: number; glow: number };
      g.place('ball', { x: r.x, z: r.z, type: 'gold' }).data.glow = r.glow;
    },
  });
  for (const s of BALL_SPOTS) g.place('ball', { x: s.x, z: s.z, type: 'gold' }).data.glow = 1;
  g.commands.set('pick', (p) => {
    for (const b of g.ents.values()) if (b.kind === 'ball' && !b.data.owner && dist(p, b) < 2.5) { b.data.owner = p.id; b.data.glow = 0; g.saveDirty = true; }
  });
};
```

서버의 진입점은 RPG 게임과 같다: `runServer({ port, db, dist, plugins: [balls] })`. 명령(`pick`)의 모양을 화면과 함께 쓰려면 6절처럼 `ClientMsgs`에 선언한다(본보기는 줄이려고 하지 않았다).

### 화면: 엔티티의 모습과 단축키

```ts engine/test/core/client/main.ts
setLocales([
  koBase(withIdNames({ nameA: ['빠른', '느긋한', '반짝이는'], nameB: ['공잡이', '마당지기'] })),
  enBase(withIdNames({ nameA: ['Quick', 'Calm', 'Shiny'], nameB: ['Catcher', 'Keeper'] })),
]);
// 서버의 공(g.defineKind('ball'))을 그린다: 빛나는 공은 금빛, 누가 주운 공은 회색으로 작게
registerKind('ball', {
  model: () => makeBall(0xf0c040, 0.45),
  update: (m, [glow]) => { m.root.scale.setScalar(glow ? 1 : 0.6); },
  label: () => '공',
  dot: '#f0c040',
});
// F: 가까운 공 줍기 (게임의 명령)
onKey('f', () => send({ t: 'pick' } as never));
startClient({});
```

- `registerKind(종류, { model, update, label, snap, animate, h, dot })`(`engine/client/kinds.ts`): `model`은 `{ root: THREE.Group }`을 돌려준다(`makeBox`, `makeBall`, `part`, `mat` 또는 three.js). `update`는 실려 온 값이 바뀔 때, `label(e, vals)`은 이름표(없으면 달지 않는다. 실려 온 값이 바뀌면 다시 불린다: 14절 '작은 것들'), `snap`은 보간 없이 바로 그 자리에, `animate`는 틀의 걷기·번쩍임을 쓴다, `dot`은 미니맵·지도의 점 색. 등록하지 않은 종류는 회색 상자로 그린다.
- 이름표는 `withIdNames({ nameA, nameB })`: 쓰지 않는 모듈의 이름(몬스터, 장비 칸 …)을 적지 않아도 된다. 게임의 문장이 있으면 `mergeLocale`로 더한다(5절).
- 화면에 보이는 것: 내 이름과 접속자 수, 메뉴('기기' 탭과 소리), 언어, 대화, 미니맵과 지도, 조작 안내(고른 모듈의 키만), 폰의 조이스틱. 체력 막대·재화·가방·기술 단추·대상 창은 없다.
- 게임이 채울 글: 본보기는 줄이려고 틀의 기본(`title` '게임', 기본 조작 안내, 기본 범례)을 그대로 쓴다. 새 게임은 적어도 `title`과, 게임의 키가 있으면 `hint`를 채운다(5절 '문장'의 표). 화면의 글은 `mergeLocale(koBase(withIdNames({…})), { ui: { title: '…', hint: keyHints([...]) } })`처럼 더한다(게임만의 키를 더하면 5절처럼 `LocaleExt`도 선언한다. 예: `games/rollball/client/i18n/`).
- 넓은 맵: 시야(`NET.aoi`)와 카메라(`CAMERA`, `setCameraAim`)를 함께 본다(3절, 5절). 본보기는 시야를 20m로 줄여 놓았다(시험이 내용에서 읽는지 본다).

### 시험과 띄우기

- 시험: `engine/test/core/core.test.ts`가 접속, 이동, 공의 동기화와 값의 변화, 공의 월드 저장, 고르지 않은 모듈의 명령 20가지가 웹소켓에서 거절되는 것, 캐릭터 저장에 모듈의 칸이 없는 것을 본다(`npm test`의 `core/core`).
- 눈으로 보기: `npx vite build -c engine/test/core/vite.config.ts`(→ `dist-core/`) 뒤에 `PORT=3015 DB=memory npx tsx --tsconfig engine/test/core/tsconfig.json engine/test/core/server/main.ts`.

### 다음에 붙일 것

- 재화가 있는 게임: `MODULES`에 `economy`(그리고 아이템이 있으면 `items`)를 더하면 지갑(`g.wallet.add(p, 'gold', n, '이유')`), 내 정보 창의 재화, 상점이 생긴다. 전투·직업 없이 된다.
- 게임의 창·공유 상태·안내문: 6절과 같다(`mountPanel`, `g.shared`, `MsgMap`).
- 사람 수를 세는 순위·점수판은 게임의 공유 상태로 만든다(`rank` 모듈은 전투력 순위라 전투 게임의 것이다).
- 팀: `teams` 모듈(6절 '팀과 점수판'). 역할처럼 사람마다 남이 보는 다른 값은 `g.playerSync`와 `setPlayerLook`(6절 '사람마다의 값과 겉모습'). 더 큰 본보기는 굴림공(`games/rollball`: 팀 공놀이, 모듈은 `teams` 하나).

## 13. 수집형·방치형 RPG 만들기

"○○ 키우기"(세븐나이츠 키우기, 버섯커 키우기 같은 것)처럼 **동료(영웅)를 뽑아 모으고, 키우고, 편성해 자동으로 싸우며 단계를 차례로 깨고, 접속하지 않은 동안에도 보상이 쌓이는** 게임은 선택 모듈 넷과 던전의 열쇠로 만든다. 본보기는 틀 안의 시험용 내용 "영웅 들판"(`engine/test/collect/`: 영웅 여섯, 상시 배너 하나와 기간 한정 픽업 배너 둘, 영웅 선택권, 장 둘 × 단계 다섯(소탕·오프라인 진행), 열쇠 던전 하나(소탕))이다. 운영하는 게임이 아니라 이 절의 모든 칸을 쓰는 가장 작은 본보기이고, 시험과 화면을 함께 쓴다.

| 모듈 | 무엇 | 의존 | 서버 | 화면 |
|---|---|---|---|---|
| `roster` | 가진 영웅의 레벨·별·조각, 레벨 업(재화)과 별 올리기(조각) | economy | `g.roster` | 메뉴의 '영웅' 탭 |
| `gacha` | 배너에서 1번·10번 뽑기, 천장, 10번 보장, **공개 확률표**, 뽑기 기록 | roster, economy | `g.gacha` | 메뉴의 '뽑기' 탭(확률 보기), 결과 창 |
| `squad` | 가진 영웅 몇을 골라 함께 싸운다: 주인을 따라다니며 몬스터를 친다 | roster, combat | `g.squad`, 엔티티 종류 `hero` | 메뉴의 '편성' 탭, 영웅의 겉모습 |
| `stages` | 장과 단계(1-1, 1-2 …), 물결과 우두머리, 깨면 다음 단계로, 실패하면 깬 단계로. 방치 보상이 깬 단계로 커진다 | combat | `g.stages` | 가운데 위의 단계 막대, 메뉴의 '단계' 탭 |
| (던전의 열쇠) | 던전마다 입장 열쇠: 날마다 채움, 상한, 재화로 사기 | (`dungeon`) | `g.dungeon` | 던전 창의 열쇠 줄 |
| `herogear` | 영웅 장비: 칸, 끼기·강화·분해, 세트, 단계·던전에서 떨어짐 (아래 '영웅의 성장') | roster, items, economy | `g.herogear` | 메뉴의 '영웅 장비' 탭, 영웅 상세의 장비 탭 |
| (소탕) | 깬 단계·끝낸 열쇠 던전을 싸우지 않고 n번 끝내 보통 보상 (소탕권·재화·열쇠) | `stages`, `dungeon`의 선택 칸 | `g.stages.sweep`, `g.dungeon.sweep` | '단계' 탭과 던전 창의 '소탕 ×n', 결과 창 |
| (오프라인 진행) | 접속하지 않은 동안 편성의 전투력으로 단계가 나아간다 | `stages`의 선택 칸 | `g.stages.offline` | 돌아왔을 때의 가운데 알림, 방치 우편의 제목 |
| (픽업·선택권) | 픽업(확률 업)·반반·천장 공유·기간 한정 배너, 영웅 선택권 | `gacha`의 선택 칸 | `g.gacha` | '뽑기' 탭(픽업, 남은 기간, 확률표), 선택권의 줄 |
| (단계 밖) | 던전 안의 자동 전투, 던전 뒤 단계로 돌아가기, 메뉴에서 바로 던전, 돌아왔을 때의 창, 재료로 영웅의 조각, 화면의 틀 요소 감추기 (아래 '단계 밖') | `dungeon`·`stages`·`idle`·`roster`의 선택 칸, `HUD` | `g.dungeon.go`, `g.roster.trade` | '단계' 탭의 '던전' 줄, 돌아왔을 때의 창, '영웅' 탭의 재료 단추 |

```ts engine/test/collect/shared/content/index.ts
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'dungeon', 'roster', 'gacha', 'squad', 'stages', 'herogear'];
```

- 넷은 `RPG_MODULES`에 들지 않는다(`COLLECT_MODULES`로 따로 있다): `MODULES = RPG_MODULES`인 게임(등불지기)은 저절로 뽑기나 단계를 갖지 않는다. 고르지 않으면 서버의 시스템·명령·저장 칸·개인 상태, 엔티티의 칸(`heroes`, `pity`, `pulls`, `squad`, `stage`), 엔티티 종류 `hero`, 화면의 탭·막대가 모두 없다.
- 이끄는 사람(플레이어)은 그대로 직업 하나를 가진 캐릭터다(`classes`·`combat`). 단계 안에서는 서버가 사람도 대신 싸운다(`STAGE_RULES.leaderAuto`). 단계 밖(열쇠 던전)에서도 맡기려면 `DungeonDef.auto`, 던전에서 나오면 단계로 돌려보내려면 `STAGE_RULES.returnAfterDungeon`(아래 '단계 밖'). 사람을 숨기고 영웅만 싸우게 하는 길은 없다(아래 '남은 것').
- **현금은 없다**: 뽑기와 열쇠의 값은 게임 안의 재화(`gold` 또는 두 번째 재화 `sparks`)뿐이고 지갑(`g.wallet`)을 지난다. 틀에는 결제·상점 연동·구매 훅이 없다.
- 이름(영웅, 역할, 배너, 장, 등급)은 모두 **문장 키**다: 게임의 언어 파일 `ui`에 그 키로 적는다(팀의 이름과 같다). 틀의 등급 셋의 이름은 틀의 문장(`heroRarity0`~`heroRarity2`: 일반·희귀·전설)에 있다.

### 영웅 (`roster`)

```ts engine/test/collect/shared/content/index.ts
export const HERO_ROLES: Readonly<Record<string, HeroRoleDef>> = {
  guard: { name: 'roleGuard', hand: 'sword', range: 2.2, atkCd: 1.2, speed: 4.6, skill: 'shieldbash', cloth: 0x5b7fb0 },
  …
export const HEROES: Readonly<Record<string, HeroDef>> = {
  ironwall: { name: 'heroIronwall', rarity: 0, role: 'guard', atk: 9, hp: 220, tag: 'grove' },
```

| 이름 | 모양 (타입은 `@engine/shared/defs/collect`) | 기본값 |
|---|---|---|
| `HEROES` | id → `{ name: 문장 키, rarity: 등급 번호, role: 역할 id, atk: 1레벨의 한 번 피해, hp: 1레벨의 체력, cloth?: 옷 색, tag?: 진영(시너지) }` | 비어 있다 |
| `HERO_RARITIES` | 차례가 번호(0이 가장 흔함): `{ id, name: 문장 키, color, stars: 처음 얻을 때의 별, shards: 또 얻었을 때 받는 조각 }` | 일반(별 1, 조각 5) · 희귀(별 2, 10) · 전설(별 3, 25) |
| `HERO_ROLES` | id → `{ name, hand: 손 모양(sword·bow·staff·게임의 것), shot?: 날아가는 것(arrow·bolt), range, atkCd, speed, skill?: SKILL_DEFS의 id, cloth }` | 비어 있다 (없는 역할은 붙어서 친다) |
| `HERO_RULES` | `{ maxStars, maxLv(별), levelCur: 'gold' 또는 'sparks', levelCost(레벨, 등급), starCost(별), grow, starMul, skill?, awaken?, gear?, power? }` (뒤의 넷은 아래 '영웅의 성장') | 별 6까지, 레벨 상한 10 + 별 × 10, 레벨 값 레벨 × 20 × (등급 + 1) 골드, 별 값 별 × 10 조각, 레벨마다 +10%, 별마다 +25% |

- 능력치: `heroStats(id, 레벨, 별)` = 처음 값 × (1 + grow × (레벨 − 1)) × (1 + starMul × (별 − 등급의 처음 별)). 전투력은 `heroPower` = 공격 × 4 + 체력 ÷ 2. 성장(장비·각성·기술 레벨·시너지)을 켠 게임은 그것까지 넣은 `heroFull`의 한 셈을 쓴다(아래 '영웅의 성장': 성장이 없으면 이 둘과 같다). 서버의 영웅 엔티티와 화면의 카드가 같은 함수를 쓴다.
- 얻기: `g.roster.grant(p, id)` 하나뿐이다(뽑기와 게임의 보상이 부른다). 처음이면 1레벨·처음 별, 이미 가졌으면 그 등급의 조각. 돌려주는 값 `{ dup, shards }`.
- 명령: `{ t: 'hero', a: 'level', id }`(그 별의 상한 아래에서 `levelCur`로 `levelCost`를 치른다, 원인 `cmd:hero:level`), `{ t: 'hero', a: 'star', id }`(조각 `starCost`). 안 되면 안내문 `costShort`·`heroMaxLv`·`heroShards`, 되면 `heroUp`·`heroStar`, 새 영웅은 `heroNew`.
- 서버에서 읽기: `g.roster.owned(p, id)`(`{ lv, stars, shards }` 또는 `undefined`), `g.roster.power(p, id)`. 바뀌면 사건 `heroChanged(p, id)`가 난다.
- 줄 위: 개인 상태 `heroes`(`{ id: [레벨, 별, 조각] }`). 저장은 캐릭터의 `ext.roster`(같은 모양). 내용에서 빠진 영웅과 깨진 값은 읽을 때 버리거나 범위로 자른다.

### 뽑기 (`gacha`)

```ts engine/test/collect/shared/content/index.ts
export const BANNERS: Readonly<Record<string, BannerDef>> = {
  dawn: {
    name: 'bannerDawn', cur: 'sparks', one: 100, ten: 900,
    pool: [
      { hero: 'ironwall', w: 375 }, { hero: 'swiftarrow', w: 375 },
      { hero: 'cinderwitch', w: 110 }, { hero: 'dawnpriest', w: 110 },
      { hero: 'stormblade', w: 15 }, { hero: 'starseer', w: 15 },
    ],
    pity: { after: 50, rarity: 2 },
    tenAtLeast: 1,
  },
  …
};
```

- **확률은 무게로만**: 영웅의 확률 = 그 칸의 `w` ÷ 무게의 합. 등급의 확률은 그 등급 영웅들의 합(위는 일반 75%, 희귀 22%, 전설 3%). 화면의 공개 확률표와 서버의 뽑기가 같은 함수(`poolOdds`, `pickOdds`)를 쓴다: 표와 실제가 어긋날 수 없다.
- **천장** `pity: { after, rarity }`: 이 배너에서 `rarity` 이상이 `after − 1`번 이어서 나오지 않으면 `after`번째 뽑기는 `rarity` 이상의 칸에서만 뽑는다(그 칸들 사이의 비율은 그대로). `rarity` 이상이 나오면 셈이 0으로. 셈은 사람마다·배너마다 저장된다.
- **10번 보장** `tenAtLeast`: 10번 뽑기의 앞 아홉에 그 등급 이상이 없으면 열째는 그 등급 이상에서. 천장과 겹치면 높은 쪽.
- 명령 `{ t: 'gacha', id: 배너, n: 1 또는 10 }`: 값(`one`·`ten`)을 `cur`로 치르고(원인 `cmd:gacha`. 모자라면 `costShort`, 아무것도 바뀌지 않는다), 나온 영웅을 `g.roster.grant`로 준다. 결과는 본인에게 메시지 `{ t: 'gacha', b, got: [{ h, r, dup, n, pity }] }`.
- 기록: 최근 `GACHA_RULES.history`(기본 50)개, 새 것이 앞. 개인 상태 `gacha`(`{ pity: { 배너: 셈 }, log }`), 저장 `ext.gacha`.
- 난수: 서버의 `g.gacha.rng`(기본 `Math.random`). 시험은 `g.gacha.rng = seededRng(씨앗)`(`@engine/shared`)으로 바꿔 같은 결과를 되풀이한다.
- **확률 공개**(한국의 확률형 아이템 표시 의무에 맞춰 모두 보인다): 뽑기 탭의 '확률 보기'가 펼치는 표에 등급별 확률, 영웅별 확률(소수 넷째 자리까지), 천장의 규칙·지금의 셈·천장에 닿은 뽑기의 확률, 10번 보장의 규칙과 그 열째의 확률, '현금 결제가 없다'는 문장이 있다. 셈은 `rateTable(배너)`(`engine/client/hud/collectcalc.ts`, 합이 저마다 1인 것을 시험이 본다).

### 편성 (`squad`)

```ts engine/test/collect/shared/content/index.ts
export const SQUAD_RULES: SquadRules = {
  size: 4, seek: 13, leash: 22, reviveS: 8, regen: 0.06, autoFill: true,
```

- `SQUAD_RULES`: 함께 싸우는 수(`size`), 주인 둘레 몇 m의 몬스터를 노리는가(`seek`), 주인에게서 이만큼 멀어지면 돌아온다(`leash`. 두 배를 넘으면 주인 곁으로 바로 옮긴다), 쓰러진 뒤 다시 일어나기까지(`reviveS`), 싸우지 않을 때 초마다 회복하는 비율(`regen`), 처음 얻은 영웅을 빈 자리에 저절로 넣기(`autoFill`). 기본은 `{ size: 4, seek: 12, leash: 20, reviveS: 10, regen: 0.05, autoFill: true }`. 진형(`rows?`)과 시너지(`synergy?`)는 아래 '영웅의 성장'.
- 편성한 영웅은 월드의 엔티티(종류 `hero`, `type`이 영웅 id)로 주인 뒤에 선다. 주인의 대상이나 주인 둘레의 가장 가까운 몬스터를 노려, 역할의 기본 공격(`atkCd`마다, 공격 ±10%)과 기술(쿨다운마다 `g.combat.cast`: 틀의 기술 효과 여섯을 그대로 쓴다. 피해·회복은 공격 ÷ 10 배)을 쓴다. 주인이 층(채널, 던전, 단계)을 옮기면 따라 옮기고, 주인이 나가면 사라진다. 봇에게는 영웅이 없다.
- 영웅이 준 피해는 **주인이 준 것**으로 친다: 처치 보상·일일 임무·`hit` 사건이 주인의 것이 된다. 몬스터는 자기를 때린 영웅을 노리고, 영웅의 체력이 0이 되면 쓰러졌다가 `reviveS` 뒤 주인 곁에서 일어난다(주인은 쓰러지지 않는다).
- 사람 편의 엔티티는 전투 모듈의 접점 `g.combat.registerAlly(종류, { owner, down, skillScale?, guard? })`로 만든다(`guard`는 받는 피해에 곱하는 값). 편성 모듈이 `hero`를 이것으로 등록한다. 게임이 소환수·용병 같은 자기 종류를 만들 때도 같은 것을 쓴다(등록한 것이 없는 게임의 전투 셈은 예전과 같다). 아군 회복·강화(`allies`)도 등록한 종류에 닿는다.
- 명령 `{ t: 'squad', ids: [영웅 id, …] }`: 가진 영웅만, 겹치지 않게, `size`까지. 틀린 것이 하나라도 있으면 아무것도 바꾸지 않는다. 개인 상태 `squad`(`{ ids, power }`), 저장 `ext.squad`. 서버: `g.squad.set(p, ids)`, `g.squad.heroes(p)`(싸우는 영웅들), `g.squad.power(p)`.
- 화면: 종류 `hero`를 역할의 옷 색·손 모양의 사람(조금 작게)으로, 발밑에 등급 색 고리, 이름표에 영웅 이름과 체력 막대로 그린다. 쏘는 역할은 화살·불꽃이 날아간다. 게임의 종류도 같은 칸을 쓸 수 있다: `registerKind`의 `hp: true`(이름표의 체력 막대), `shot: (e) => 'arrow'`(때릴 때 날아가는 것).

### 단계 (`stages`)

```ts engine/test/collect/shared/content/index.ts
const stage = (ch: number, n: number): StageDef => {
  …
  return {
    waves,
    ...(n === 4 ? { boss: { type: ch === 0 ? 'ogre' : 'golem' } } : {}),
    scale,
    reward: { gold: 40 + k * 20, exp: 30 + k * 15, sparks: 30 + k * 5, items: { gearstone: 2 + ch, skillbook: 1 } },
    first: { sparks: 100, ...(n === 4 ? { items: { awakenstone: 1 } } : {}) },
    rec: Math.round(250 * scale * (n === 4 ? 1.6 : 1)),
    …
  };
};
export const CHAPTERS: readonly ChapterDef[] = [
  { name: 'chapterMeadow', stages: [0, 1, 2, 3, 4].map((n) => stage(0, n)) },
  { name: 'chapterRidge', stages: [0, 1, 2, 3, 4].map((n) => stage(1, n)) },
];
…
export const STAGE_RULES: StageRules = {
  arena: { x: 0, z: 10 }, radius: 9, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: true,
  …
};
```

- `CHAPTERS`: 장마다 `{ name: 문장 키, stages }`. 단계의 id는 '장 번호-단계 번호'(1부터: `1-1` … `2-5`)이고 저장과 줄 위에서 이 id로 오간다(단계를 사이에 끼워 넣으면 뒤의 id가 밀린다: 뒤에 더한다).
- `StageDef`: `waves`(물결들. 물결마다 `{ type: 몬스터 id, n }`의 목록), `boss?`(`{ type, scale? }`: 물결 뒤에 나온다. "다섯째마다 우두머리"는 위처럼 내용에서 정한다), `scale`(몬스터의 체력·피해에 곱한다. 그 몬스터의 정의를 복사해 고치므로 들판의 같은 몬스터는 그대로), `reward`(깰 때마다: 재화는 지갑, 재료는 가방, 장비는 장비 모듈로 **바로** 준다. 원인 `stage`), `first?`(처음 깰 때 더), `rec`(권장 전투력: 화면에만), `timeS?`.
- `STAGE_RULES`: 단계가 벌어지는 자리(`arena`, 물결은 `radius` 둘레의 앞쪽에서), 물결 사이·깬 뒤·실패 뒤의 쉼(초), 제한 시간, `leaderAuto`(단계 안에서 사람도 서버가 대신 싸운다: 가장 가까운 적, 쓸 수 있는 기술. 손으로 움직이면 1.5초는 맡기지 않는다), `enterOnJoin`(접속하면 바로 지금 단계로). 기본은 `{ arena: (0, 0), radius: 8, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: false }`.
- 흐름: 단계는 **그 사람만의 층**(던전과 같은 인스턴스 층: 서로 보이지 않는다)에서 벌어진다. 물결을 다 잡으면 다음 물결 → 우두머리 → **깸**(보상, 가장 멀리 깬 단계, 사건 `stageCleared(p, id, 처음인가)`) → 자동 진행이 켜져 있으면 `nextS` 뒤 다음 단계, 꺼져 있으면 같은 단계를 되풀이(파밍). 마지막 단계는 되풀이한다.
- **실패**(사람이 쓰러짐, 제한 시간): 깬 단계(가장 멀리 깬 단계와 그 단계의 앞 가운데 낮은 쪽)로 돌아가 **자동 진행을 끄고** `retryS` 뒤 되풀이한다. 사람이 '단계' 탭이나 자동 진행 단추로 다시 도전한다. 몬스터는 몰려온 적(`swarm`)으로 놓여 집으로 돌아가지 않고, 대상이 없으면 가장 가까운 사람이나 영웅을 노린다.
- 명령 `{ t: 'stage', a: 'start' | 'leave' | 'auto' | 'go', on?, id? }`: 지금 단계로 들어가기, 들판으로 나오기(들어오기 전의 자리로), 자동 진행 켜고 끄기, 그 단계로(깬 단계와 그다음까지. 더 먼 단계는 `stageLocked`). 던전 안에서는 시작하지 않는다.
- 줄 위: 개인 상태 `stage`(`{ cur, best, auto, run }`, `run`은 진행 중이면 `{ id, wave, waves, foes, total, left, state, boss }`). 저장 `ext.stages`(`{ cur, best, auto }`). 서버: `g.stages.start(p, 번호)`, `g.stages.leave(p, false)`, `g.stages.inStage(p)`, `g.stages.cleared(p)`(깬 단계의 수). 단계의 목록은 `STAGES`(`{ i, id, ch, n, def }`), `stageIndex(id)`, `waveCount(def)`.
- **방치 보상**: `idle` 모듈을 함께 고르면 `IDLE.reward`가 셋째 인자로 `{ stage: 깬 단계의 수 }`를 받는다(단계 모듈이 없으면 0. 예전의 두 인자 식도 그대로 된다):

```ts engine/test/collect/shared/content/index.ts
export const IDLE = {
  minMin: 10, maxMin: 720,
  …
  reward: (minutes: number, lv: number, ctx: IdleCtx): Reward => ({ gold: Math.round(minutes * (4 + ctx.stage * 3)), exp: Math.round(minutes * (2 + lv + ctx.stage)), sparks: Math.floor((minutes * ctx.stage) / 10) }),
};
```

- 화면: 가운데 위(폰은 내 정보 창 아래)의 **단계 막대**: 단계 id(`1-3`)와 장의 이름, 남은 시간, 물결마다의 칸(지난 것 가득·지금 것은 잡은 비율·우두머리 칸은 붉게), 물결과 남은 적, 깸·실패의 큰 글, 자동 진행 단추(켜짐이 금색), 도전/나가기. 던전 안에서는 숨는다. 메뉴의 '단계' 탭: 장마다 단계의 줄(깸·지금·잠김, 우두머리, 권장 전투력과 내 편성의 전투력, 가기).

### 던전의 열쇠 (`dungeon`의 선택 칸)

```ts engine/test/collect/shared/content/index.ts
    gear: false,
    key: { refill: 2, cap: 2, buy: { cur: 'sparks', cost: 50, perDay: 2 } },
```

- `DungeonDef.key`가 있는 던전은 하루 횟수(`perDay`) 대신 **열쇠 하나**를 쓰고 들어간다. 날이 바뀌면 `refill`개가 더해지되 `cap`을 넘지 않는다(며칠 비웠어도 `cap`까지. 산 것으로 `cap` 위에 있으면 그대로). 처음 온 사람은 `min(refill, cap)`개. `buy`가 있으면 그 재화로 하나씩 산다(하루 `perDay`번, 명령 `{ t: 'dungeonKey', id }`, 원인 `cmd:dungeonKey`. 안내문 `dungeonKeyBought`·`dungeonKeyLimit`·`costShort`). 열쇠가 없으면 `dungeonNoKeys`. 보상·이벤트로 주려면 `g.dungeon.giveKeys(p, id, n)`, 읽기는 `g.dungeon.keyCount(p, id)`.
- `DungeonDef.gear: false`는 끝낼 때 장비를 주지 않는다(골드 던전, 재료 던전: `reward`의 골드·재료만 우편으로).
- 열쇠의 저장 넷째 칸 `1`은 '이 던전을 끝낸 적이 있다'(소탕의 조건)이다. 끝낸 적이 없으면 예전처럼 셋이다.
- 열쇠를 쓰는 던전이 하나도 없는 게임(등불지기: `perDay`만)에는 열쇠의 저장 칸·개인 상태·명령이 **생기지 않는다**: 예전과 글자까지 같다. 하루 3번(`perDay: 3`)은 `refill: 3, cap: 3`의 열쇠와 같은 셈이다(쓰지 않은 것이 쌓이지 않는다).
- 줄 위: 개인 상태 `keys`(`{ 던전: { n, bought } }`), 저장 `ext.keys`(`{ 던전: [가진 수, 오늘 산 수, 날] }`). 화면: 문 앞의 던전 창이 '열쇠 n / cap', 채워지는 규칙, 값과 오늘 남은 사기 수, '열쇠 사기' 단추를 보인다.
- 던전 모듈은 파티 모듈 없이도 돈다(파티가 없으면 파티원도 없다).

### 영웅의 성장 (장비·기술 레벨·각성·시너지·진형·전투력)

"키우기"의 깊이: 영웅마다 장비를 끼고 강화하고, 기술 레벨을 올리고, 별이 최대가 된 뒤에는 각성하고, 같은 진영끼리 모아 시너지를 켜고, 앞줄·뒷줄로 세운다. **모두 내용이 적어야 켜진다**: 적지 않은 게임(등불지기, 이 기능 전에 만든 수집형 게임)은 저장·줄 위의 글자·싸움이 예전과 같다. 셈은 한 곳(`engine/shared/defs/herogrow.ts`)에만 있고 서버와 화면이 함께 쓴다.

| 무엇 | 켜는 곳 | 서버 | 저장 | 줄 위 |
|---|---|---|---|---|
| 영웅 장비 | 모듈 `herogear`(의존 roster, items, economy) + `HERO_RULES.gear` | `g.herogear` | `ext.herogear` | 개인 상태 `hgear`, 명령 `hgear` |
| 기술 레벨 | `HERO_RULES.skill` | `g.roster.skillUp` | `ext.roster`의 넷째 칸 | `heroes`의 넷째 칸, 명령 `hero` `a: 'skill'` |
| 각성 | `HERO_RULES.awaken` | `g.roster.awakenUp` | `ext.roster`의 다섯째 칸 | `heroes`의 다섯째 칸, 명령 `hero` `a: 'awaken'` |
| 시너지 | `HeroDef.tag` + `SQUAD_RULES.synergy` | `g.squad.view(p).syn` | (없음: 편성에서 셈) | `squad`의 `syn` |
| 진형 | `SQUAD_RULES.rows` | `g.squad.isBack(p, id)` | `ext.formation` | `squad`의 `back`, 명령 `squad`의 `back` |
| 전투력 | `HERO_RULES.power`(없으면 기본 셈) | `g.roster.power`, `g.squad.power` | — | `squad`의 `power` |

```ts engine/test/collect/shared/content/index.ts
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'dungeon', 'roster', 'gacha', 'squad', 'stages', 'herogear'];
```

- `herogear`는 `COLLECT_MODULES`에도 `RPG_MODULES`에도 들지 않는다: 고르는 게임이 따로 적는다(재료의 가방이 아이템 모듈에 있어서 `items`가 함께 필요하다).
- 값은 `HeroCost` = `{ cur?: 'gold' | 'sparks', n?, items?: { 아이템 id: 수 } }`이고 지갑(`g.wallet`)과 가방(`g.bag`)을 지난다. 하나라도 모자라면 아무것도 치르지 않고 `costShort`(재화)나 `itemShort`(재료, 모자란 수)를 알린다. 장부의 원인은 `cmd:hero:skill`, `cmd:hero:awaken`, `cmd:hgear:enhance`, `cmd:hgear:salvage`.
- 덤은 `HeroBonus` = `{ atk?, hp?, atkPct?, hpPct?, dmg?, guard? }`(더하는 수, 비율, 주는 피해 +, 받는 피해 −). 세트·각성의 패시브·시너지·줄이 모두 이 모양이다. 받는 피해의 덤은 곱으로 합친다(0.2와 0.2 → 0.36).

#### 영웅 장비 (`herogear`)

```ts engine/test/collect/shared/content/index.ts
export const HERO_GEAR: HeroGearRules = {
  slots: [{ id: 'weapon', name: 'hgSlotWeapon' }, { id: 'armor', name: 'hgSlotArmor' }, { id: 'helm', name: 'hgSlotHelm' }, { id: 'charm', name: 'hgSlotCharm' }],
  items: {
    bronzeblade: { name: 'hgBronzeblade', slot: 'weapon', rarity: 0, atk: 6 },
    …
  sets: {
    vanguard: { name: 'setVanguard', tiers: [{ n: 2, bonus: { hpPct: 0.15 } }, { n: 4, bonus: { guard: 0.15 } }] },
    arcane: { name: 'setArcane', tiers: [{ n: 2, bonus: { atkPct: 0.12 } }, { n: 4, bonus: { dmg: 0.2 } }] },
  },
  enhance: {
    max: (r) => 5 + r * 5,
    cost: (lv, r) => ({ cur: 'gold', n: 80 * (lv + 1) * (r + 1), items: { gearstone: 1 + Math.floor(lv / 3) } }),
    per: 0.15,
    chance: (lv) => (lv < 3 ? 1 : Math.max(0.4, 1 - (lv - 2) * 0.1)),
  },
  salvage: (r, lv) => ({ items: { gearstone: 1 + r * 2 + Math.floor(lv / 2) } }),
  bag: 60,
  drops: {
    stage: {
      '*': { chance: 0.6, pool: [...gearPool(COMMON_GEAR, 10), ...gearPool(RARE_GEAR, 2)] },
      '1-5': { chance: 1, n: 2, pool: [...gearPool(RARE_GEAR, 5), { id: 'dawnedge', w: 1 }] },
      …
    dungeon: { goldmine: { chance: 1, pool: gearPool(RARE_GEAR, 1) } },
```

- 표 `HERO_RULES.gear`(`HeroGearRules`): 칸(`slots`: id와 이름 키), 장비(`items`: 이름 키, 칸, 등급 번호(`HERO_RARITIES`의 색·이름을 같이 쓴다), 강화 0의 `atk`·`hp`, `set?`), 세트(`sets`: 단마다 `n`과 덤. 여러 단이 함께 켜진다), 강화(`max(등급)`, `cost(강화, 등급)`, 강화마다 바탕이 늘어나는 비율 `per`, 성공 확률 `chance?`), 분해(`salvage?(등급, 강화)` → `Reward`), 가질 수 있는 수(`bag`), 떨어지는 표(`drops`: 단계 id나 던전 id, 없으면 `'*'`). 칸·세트·표의 id가 틀리면 서버를 띄울 때 멈춘다.
- 떨어지기: 단계를 깨면(사건 `stageCleared`), 던전을 끝내면(`dungeonCleared`) 그 표대로 `chance`의 확률로 `n`번(기본 1) 무게대로 하나씩. 게임의 보상은 `g.herogear.give(p, id)`(가득 차면 `null`과 `hgFull`). 난수는 `g.herogear.rng`(시험은 정해진 난수로).
- 명령 `{ t: 'hgear', a: 'equip', uid, hero }`(그 칸에 낀 것과 바꾸고, 다른 영웅이 끼던 것이면 그 영웅에게서 뺀다), `{ a: 'unequip', uid }`, `{ a: 'enhance', uid }`(값을 치르고 확률로 +1. 실패해도 값은 든다. 상한은 `hgEnhanceMax`), `{ a: 'salvage', uids }`(끼지 않은 것만, 하나라도 틀리면 아무것도). 안내문 `hgDrop`·`hgFull`·`hgEnhance`(장비, 강화, 성공 1/0)·`hgSalvaged`.
- 능력치: 장비 한 점 = 바탕 × (1 + `per` × 강화). 낀 장비의 공격·체력과 켜진 세트의 덤이 영웅의 최종 값(`heroFull`)에 들어가 싸우는 영웅의 체력·공격과 전투력에 함께 쓰인다. 끼거나 강화하면 `heroChanged`가 난다.
- 줄 위: 개인 상태 `hgear`(`{ items: [[번호, id, 강화, 낀 영웅]], cap }`), 저장 `ext.herogear`(`{ seq, items }` 같은 모양). 읽을 때 없는 장비·깨진 줄은 버리고, 가지지 않은 영웅이나 한 칸에 둘째로 낀 것은 빼고, 겹친 번호는 새로 붙인다.

#### 기술 레벨과 각성 (`roster`의 선택 칸)

```ts engine/test/collect/shared/content/index.ts
export const HERO_RULES: HeroRules = {
  ...BASE_HERO_RULES,
  /** 기술 레벨: 상한은 1 + 별 + 각성 × 2, 값은 골드와 기술서, 레벨마다 기술의 피해·회복 +12% */
  skill: { maxLv: (stars, aw) => 1 + stars + aw * 2, cost: (lv, r) => ({ cur: 'gold', n: 150 * lv * (r + 1), items: { skillbook: lv } }), per: 0.12 },
  /** 각성: 별 6에서 조각과 각성석으로. 1단계에 '강철 피부'(받는 피해 −10%), 3단계에 '분노'(주는 피해 +15%) */
  awaken: {
    steps: [
      { shards: 20, cost: { cur: 'gold', n: 3000, items: { awakenstone: 1 } }, mul: 1.15, passive: { name: 'passiveSteel', bonus: { guard: 0.1 } } },
      { shards: 40, cost: { cur: 'gold', n: 6000, items: { awakenstone: 2 } }, mul: 1.3 },
      { shards: 80, cost: { cur: 'gold', n: 12000, items: { awakenstone: 4 } }, mul: 1.5, passive: { name: 'passiveFury', bonus: { dmg: 0.15 } } },
    ],
  },
  gear: HERO_GEAR,
  …
};
```

- 기술 레벨 `HERO_RULES.skill`: 역할의 기술(`HeroRoleDef.skill`)을 `cost(지금 레벨, 등급)`으로 하나씩, `maxLv(별, 각성)`까지. 레벨마다 기술의 피해·회복이 `per`만큼 커진다: 편성이 전투 모듈의 기술 배율 접점(`registerAlly`의 `skillScale`)에 곱한다. 명령 `{ t: 'hero', a: 'skill', id }`, 안내문 `heroSkillUp`·`heroSkillMax`.
- 각성 `HERO_RULES.awaken.steps`: 별이 `maxStars`인 영웅이 그 단계의 조각(`shards`)과 값(`cost`)으로 오른다. 단계의 `mul`은 그 단계에서의 공격·체력 배율(누적이 아니다), `passive`는 그 단계에서 열리고 뒤에도 남는다. 명령 `{ t: 'hero', a: 'awaken', id }`, 안내문 `heroAwaken`(가운데 알림)·`heroAwakenStars`·`heroAwakenMax`, 조각이 모자라면 `heroShards`.
- 저장: `ext.roster`의 줄은 기술 레벨이나 각성이 **오른 영웅만** `[레벨, 별, 조각, 기술 레벨, 각성]`으로 길어진다(나머지는 예전의 셋). 개인 상태 `heroes`는 둘 중 하나라도 켠 게임에서 늘 다섯 칸. 규칙을 내용에서 빼도 값은 지켜 둔다(다시 켜면 이어진다). 칸을 더하기만 했으므로 이전(`g.migrations`)은 없고, 옛 서버가 새 저장을 읽어도 앞의 셋만 읽는다.

#### 시너지와 진형 (`squad`의 선택 칸)

```ts engine/test/collect/shared/content/index.ts
export const SQUAD_RULES: SquadRules = {
  size: 4, seek: 13, leash: 22, reviveS: 8, regen: 0.06, autoFill: true,
  rows: { front: 2, back: 2, taunt: 9, frontBonus: { guard: 0.25 }, backBonus: { dmg: 0.1 } },
  synergy: {
    grove: { name: 'synGrove', tiers: [{ n: 2, bonus: { atkPct: 0.1 } }, { n: 3, bonus: { atkPct: 0.15, hpPct: 0.1 } }] },
    ember: { name: 'synEmber', tiers: [{ n: 2, bonus: { dmg: 0.12 } }] },
    tide: { name: 'synTide', tiers: [{ n: 2, bonus: { guard: 0.1 } }], all: true },
  },
};
```

- 시너지: 영웅의 태그(`HeroDef.tag`, 진영·속성)마다 `SQUAD_RULES.synergy[태그]`. 편성에 그 태그가 `n` 이상이면 그 단(가장 높은 하나)의 덤을 그 태그의 영웅이(`all`이면 편성 모두가) 받는다. 개인 상태 `squad`의 `syn`(`[{ tag, n, tier }]`, `tier`가 −1이면 아직).
- 진형 `SQUAD_RULES.rows`: 앞줄·뒷줄의 자리 수, 앞줄이 몬스터를 끄는 거리(`taunt`), 줄의 덤(`frontBonus`·`backBonus`: 싸움에만, 전투력에는 넣지 않는다). 앞줄은 주인의 앞에, 뒷줄은 뒤에 서고, 앞줄 영웅은 `taunt` 안에서 주인이나 뒷줄을 노리는 몬스터를 자기에게 돌린다(몬스터의 대상만 바꾼다: 단계의 '가장 가까운 사람 편' 고르기와 전투의 '때린 쪽을 노린다'는 그대로). 받는 피해의 덤은 전투 모듈의 접점 `registerAlly`의 `guard?`로 들어간다(등록한 것이 없거나 1이면 셈이 그대로).
- 명령 `{ t: 'squad', ids, back? }`: `back`은 뒷줄에 둘 영웅. 주지 않으면 지금의 뒷줄을 지킨다. 한 줄이 넘치면 넘친 영웅(그 줄의 뒤쪽)이 다른 줄로(`arrangeRows`). 처음 얻은 영웅이 저절로 들 때도 같다. 저장 `ext.formation`(`{ back }`, 뒷줄이 있을 때만), 개인 상태 `squad`의 `back`.
- **진형을 적지 않은 게임은 예전과 같다**: 자리(주인 뒤의 여덟 칸), 대상 고르기, 받는 피해 모두. 이 기능 전의 영웅 들판 내용으로 이 가지의 틀을 돌린 황금 실행이 바탕 커밋과 줄 위의 글자·저장까지 같다(엔티티에 빈 칸 `squadBack`이 생긴 것만 다르다).

#### 전투력 (한 셈)

- 영웅 하나: `heroFull(id, 성장, 낀 장비, 덤)` → 공격 = (바탕 × 각성 배율 + 장비의 공격 + 덤의 공격) × (1 + 덤의 공격 비율), 체력도 같다(바탕은 `heroStats`). 전투력은 `HERO_RULES.power?(x)`(`PowerIn`: 최종 공격·체력·주는 피해·받는 피해, 레벨, 별, 각성, 기술 레벨, 등급, 낀 장비 수)이고, 없으면 `defaultPower` = (공격 × 4 × (1 + 주는 피해) + 체력 ÷ 2 ÷ (1 − 받는 피해)) × (1 + 기술 레벨 덤의 반). 성장이 하나도 없으면 예전의 `heroPower`와 같다.
- 편성: `squadView(ids, back, 영웅들, 장비)`의 `power` = 영웅마다(시너지까지)의 합. 서버의 `g.squad.power(p)`와 개인 상태 `squad.power`, 화면의 영웅 탭·상세·편성 탭·단계 탭의 '내 편성'이 모두 이 셈이다(단계의 권장 전투력과 견주는 것은 `squad.power`를 그대로 쓴다: 단계 모듈은 고치지 않았다).

#### 화면

- 영웅 탭의 줄에 **'자세히'**(성장을 하나라도 켠 게임만) → 영웅 상세: 최종 공격·체력·전투력과 **레벨·별·각성·기술·장비** 탭. 탭마다 지금 단계, 다음 단계와 그 값(가진 수/필요한 수, 모자란 칸은 붉게), 단추. 장비 탭은 칸마다 낀 것(빼기·강화·바꾸기 ⇄)과 고를 장비(다른 영웅이 낀 것도), 세트의 단.
- 메뉴의 **'영웅 장비'** 탭(`herogear`, id `hgear`: `setMenuTabs`에 넣어야 보인다): 가진 장비(칸의 차례, 등급·전투력이 높은 것부터, 낀 영웅), 강화 창(지금 → 다음의 능력치, 값, 성공 확률), 분해.
- **편성** 탭: 진형을 켠 게임은 앞줄·뒷줄(줄마다 자리 수, '앞으로'·'뒤로'), 시너지를 켠 게임은 시너지마다 편성의 수와 단(켜진 단은 금색). 셈은 `engine/client/hud/herogrowcalc.ts`(시험이 node에서 그대로 읽는다), 그리는 것은 `hud/herogrow.ts`.
- 문장: 틀의 문장(한국어·영어)에 탭·단추·값·안내문이 다 있다. 게임은 **이름 키만** 적는다: 장비(`HeroGearDef.name`), 칸, 세트, 시너지(`SynergyDef.name`), 각성의 패시브, 그리고 재료 아이템의 이름.

```ts engine/test/collect/client/main.ts
  // 영웅의 성장: 장비의 칸·이름·세트, 진영의 시너지, 각성의 패시브
  hgSlotWeapon: '무기', hgSlotArmor: '갑옷', hgSlotHelm: '투구', hgSlotCharm: '장신구',
```
### 소탕 (`stages`·`dungeon`의 선택 칸)

깬 단계, 또는 한 번이라도 끝낸 열쇠 던전을 **싸우지 않고 바로** n번 끝내 그 곳의 **보통 보상**(처음 깬 보상이 아니다)을 받는다. 값은 한 번마다 소탕권(가방의 아이템)이나 게임 안의 재화. 열쇠 던전은 열쇠도 한 번에 하나씩 쓴다.

```ts engine/test/collect/shared/content/index.ts
  sweepticket: { kind: 'token', price: 0, max: 999 },
…
    ...(ch === 1 && n === 4 ? { sweep: false } : {}),
…
  sweep: { cost: { item: 'sweepticket', n: 1 }, max: 10 },
…
    // 한 번이라도 끝냈으면 열쇠 하나로 소탕 (한 번에 다섯까지)
    sweep: { max: 5 },
```

| 칸 | 모양 (`@engine/shared/defs/collect`) | 기본 |
|---|---|---|
| `STAGE_RULES.sweep` | `SweepRule`: `{ cost?: { item: 아이템 id, n } \| { cur: 'gold' \| 'sparks', n }, max?: 한 번에 하는 수 }` | 없다 (소탕이 없다) |
| `StageDef.sweep` | `false`면 그 단계는 소탕하지 않는다 | 깬 단계는 모두 |
| `DungeonDef.sweep` | `SweepRule`. 열쇠(`key`)가 있는 던전만. `cost`는 열쇠에 더해 치르는 값 | 없다 |

- 명령: `{ t: 'stage', a: 'sweep', id: 단계 id, n }`, `{ t: 'dungeonSweep', id: 던전 id, n }`. `n`은 1~`max`(기본 10)의 정수. 깨지 않은 단계·끝낸 적이 없는 던전·`sweep: false`는 안내문 `sweepLocked`, 값이 모자라면 `itemShort`(`[무엇, 드는 수, 가진 수]`), 열쇠가 모자라면 `dungeonNoKeys`: 모두 아무것도 바뀌지 않는다(한꺼번에 되거나 하나도 안 된다).
- 값은 `g.bag.takeItem`/`g.wallet.take`(원인 `cmd:stage:sweep`, `cmd:dungeonSweep`), 보상은 우편이 아니라 지갑·가방·장비로 **바로**(원인 `sweep`). 결과는 본인에게 메시지 `{ t: 'sweep', got: { k, id, n, cur, goods, equip } }`(받은 재화·아이템·장비 수의 합), 안내문 `swept`, 사건 `swept(p, 'stage' | 'dungeon', id, n)`. 진행 중인 단계와 지금 단계는 바뀌지 않는다.
- 서버에서: `g.stages.sweep(p, id, n)`, `g.dungeon.sweep(p, id, n)`(받은 것의 합, 안 되면 `null`), `g.dungeon.won(p, id)`. 값과 보상의 도우미는 `engine/server/game/systems/sweep.ts`.
- 화면: '단계' 탭의 깬 단계마다 '소탕 ×1'·'소탕 ×n'(n은 지금 할 수 있는 만큼, 상한까지. 할 수 없으면 잠긴다), 탭 위에 값과 가진 수, 탭 끝에 '던전 소탕'의 줄(열쇠·값·잠김). 문 앞의 던전 창에도 끝낸 적이 있으면 소탕의 줄. 누르면 결과 창(받은 것). 셈은 `sweepView`(`hud/collectcalc.ts`).

### 오프라인 단계 진행 (`stages`의 선택 칸)

자동 진행을 켜 둔 채 나간 사람이 돌아오면, 서버가 '그동안 얼마나 더 깼을까'를 셈해 단계를 앞으로 옮긴다. 기본은 꺼져 있다(예전처럼 방치 보상의 수치만 깬 단계로 커진다).

```ts engine/test/collect/shared/content/index.ts
  offline: { perStageS: 600, maxH: 12, maxStages: 20 },
```

- `STAGE_RULES.offline`: `{ perStageS: 한 단계에 드는 초, maxH: 셈하는 시간의 상한(시간), maxStages: 한 번 돌아올 때 나아가는 단계의 상한, need?: 권장 전투력에 곱하는 수(기본 1), clearReward?: 깬 단계의 보통 보상도 주는가(기본 true) }`.
- 셈(`offlinePlan(가장 멀리 깬 번호, 편성의 전투력, 비운 ms, 규칙)`, 서버·시험·화면이 같은 함수): 가장 멀리 깬 단계의 다음부터, `편성의 전투력 ≥ 권장 전투력(rec) × need`인 단계를 `perStageS`초에 하나씩. 전투력이 모자란 단계에서 멈춘다. 비운 시간은 `maxH`까지(시계가 거꾸로 갔거나 깨진 시각이면 0, 아주 큰 틈은 상한), 단계는 `maxStages`와 마지막 단계까지. 시계는 서버의 것(`g.now`)이라 시험은 `new Game({ now })`로 정한다.
- 돌아오면: 가장 멀리 깬 단계와 지금 단계를 옮기고, 깬 것으로 친 단계마다 처음 깬 보상(`first`)과 보통 보상을 바로 준다(원인 `stageAway`), 사건 `stageCleared(p, id, true)`, 안내문 `stageAway`(`[처음 단계, 지금 단계, 깬 수]`: 화면의 가운데 알림 '자리를 비운 동안 1-4 → 2-3까지 진행 (4단계 깸)'). 자동 진행을 끈 사람(실패했거나 파밍 중)은 나아가지 않는다.
- **돌아왔을 때의 창(`IDLE.popup`, 아래 '단계 밖')을 쓰는 게임은 안내문 `stageAway`를 내지 않는다**: 같은 진행을 창이 함께 보이므로 한 번만 알린다. 창이 뜨지 않았을 때(방치 보상의 `minMin`보다 짧게 비웠는데 진행은 있을 때)만 안내문으로 알린다(`idle.ts`의 `awayNote`). 창을 쓰지 않는 게임은 예전과 같다(안내문만).
- 방치 보상(`idle` 모듈)은 비운 분을 **깬 단계의 수가 같은 토막**으로 나눠 토막마다 `IDLE.reward(분, 레벨, { stage })`를 부르고 더한다(`idleSegments`). 진행이 없으면 한 토막이라 예전과 같다. 방치 우편의 제목 값은 `[분, 처음 단계, 지금 단계]`(진행이 없으면 예전처럼 `[분]`): '쉬는 동안 모인 것 (45분) · 1-4 → 2-3까지 진행'. `idle` 모듈이 없어도 진행은 한다.

### 픽업·기간 한정 배너와 선택권 (`gacha`의 선택 칸)

```ts engine/test/collect/shared/content/index.ts
  starfall: {
    name: 'bannerStarfall', cur: 'sparks', one: 120, ten: 1080, pool: LIMITED_POOL,
    pity: { after: 60, rarity: 2 }, tenAtLeast: 1,
    pickup: { hero: 'starseer', share: 0.5 }, fiftyFifty: true, pityGroup: 'limited',
    start: LIMITED_FROM, end: LIMITED_FROM + 14 * DAY,
  },
…
export const GACHA_RULES: GachaRules = { history: 50, select: { herochoice: ['stormblade', 'starseer'] } };
```

| 칸 (`BannerDef`) | 뜻 | 없으면 |
|---|---|---|
| `pickup: { hero, share }` | 픽업 영웅이 **자기 등급의 확률 가운데 `share`**(0~1)를 갖는다. 등급의 확률은 그대로이고 그 등급의 나머지 영웅이 남은 몫을 무게의 비율로 나눈다(위: 전설 3% 가운데 1.5%) | 무게 그대로 |
| `fiftyFifty: true` | 반반: 픽업의 등급이 나왔는데 픽업이 아니면 확정이 켜지고, 다음에 그 등급이 나오면(천장이든 아니든) 픽업이다. 픽업이 나오면 꺼진다 | 확정 없음 |
| `pityGroup: 이름` | 같은 이름의 배너들이 천장의 셈과 확정을 **함께** 센다(기간 한정 배너가 바뀌어도 이어진다). 무리의 배너는 `pity`가 같아야 한다(다르면 서버가 시작할 때 멈춘다) | 배너마다 |
| `start`, `end` | 서버 시계의 ms(`Date.UTC(…)`). 이 사이에만 화면에 보이고 뽑힌다. 닫힌 배너의 뽑기는 `bannerClosed`(값도 치르지 않는다) | 늘 열림 |

- **확률은 한 함수**: `pullOdds(배너, 바닥 등급, 확정)`이 서버의 뽑기와 공개 확률표를 함께 만든다(픽업이 없는 배너는 예전의 `poolOdds`와 같다). 공개 확률표(`rateTable`)는 등급별·영웅별·천장·10번 보장에 더해 픽업의 몫과 평소·확정일 때의 픽업 확률, 반반의 규칙과 지금의 확정, 확정일 때의 표, **실효 확률**(`effectiveOdds`: 천장의 셈과 확정을 상태로 한 마르코프 사슬의 정상 분포, 1번 뽑기를 오래 되풀이할 때의 평균. 위 배너의 픽업은 약 2.38%), 천장을 함께 쓰는 배너, 남은 기간, 지금의 셈을 보인다. 시험(`collect/pickup`)이 정해진 난수로 12만 번 뽑아 실효 확률과 견준다.
- 줄 위: 개인 상태 `gacha`에 기간이 있는 배너가 있는 게임만 `open`(열린 배너 → 남은 분, 끝이 없으면 −1), 반반이 있는 게임만 `sure`(천장의 열쇠 → 1). 천장의 셈의 열쇠는 `pityKey(배너)`: 무리면 `group:이름`, 아니면 배너 id(예전과 같다). 서버: `g.gacha.pityOf(p, 배너)`, `g.gacha.sureOf(p, 배너)`, `g.gacha.isOpen(배너)`.
- 저장 `ext.gacha`: `{ pity: { 열쇠: 셈 }, log, sure?: { 열쇠: 1 } }`(확정이 없으면 예전 모양). 배너를 무리에 넣으면 배너 id에 적힌 예전 셈은 읽을 때 무리의 셈으로 옮긴다(무리의 셈이 이미 있으면 그것). 칸을 더하기만 해서 이전(migration)은 없고, 옛 서버는 모르는 칸을 무시한다.
- **선택권** `GACHA_RULES.select`: 아이템 id → 고를 수 있는 영웅들(`items` 모듈이 있어야 한다). 명령 `{ t: 'gacha', a: 'select', item, hero }`: 선택권 하나(`g.bag.takeItem`, 원인 `cmd:gacha:select`)로 그 영웅을 `g.roster.grant`(가진 영웅이면 조각). 안내문 `heroPicked`(`[영웅, 이미 가졌으면 1, 조각]`), 선택권이 없으면 `itemShort`. 서버: `g.gacha.select(p, item, hero)`. 화면: '뽑기' 탭 끝의 '영웅 선택권' 줄(가진 수, 영웅마다 '고르기').
- 화면의 '뽑기' 탭은 열린 배너만 보인다(서버가 `open`을 보내기 전에는 기간이 없는 배너만). 픽업 배너는 금색 테두리에 픽업 영웅, 남은 기간, 확정, 천장 공유를 적는다. 셈은 `openBanners`, `bannerPity`, `rateTable`(`hud/collectcalc.ts`).

### 단계 밖 (던전 오가기, 돌아왔을 때의 창, 재료로 키우기)

단계 안에서는 서버가 사람(대장)도 대신 싸우고 자동 진행이 다음 단계로 데려간다. 그 흐름이 **단계를 벗어날 때**(열쇠 던전, 접속하지 않은 동안)에도 이어지게 하는 선택 칸이다. 모두 내용에 적어야 켜진다: 적지 않은 게임은 예전과 같다(대장은 던전에서 손으로 싸우고, 던전에서 나오면 문 앞에 남고, 방치 보상은 우편으로만 온다).

```ts engine/test/collect/shared/content/index.ts
export const HUD: HudRules = { hide: ['bag', 'attackNearest'] };
…
export const IDLE = {
  minMin: 10, maxMin: 720,
  …
  popup: true,
  …
export const HERO_RULES: HeroRules = {
  …
  trade: { stardust: { cost: (r) => [3, 6, 15][r] ?? 15 } },
};
…
export const STAGE_RULES: StageRules = {
  …
  returnAfterDungeon: 2,
};
…
    reward: { gold: 600, exp: 120, items: { stardust: 4 } },
    …
    fromMenu: true,
    auto: true,
```

| 칸 | 뜻 | 서버 | 줄 위 | 화면 |
|---|---|---|---|---|
| `DungeonDef.auto: true` | 그 던전 안에서는 사람(봇 말고)도 서버가 대신 싸운다: 단계의 `leaderAuto`와 같은 셈(가장 가까운 적을 대상으로 주면 전투가 사거리까지 다가가 친다, 쓸 수 있는 기술 하나, 회복은 체력 60% 아래에서만). 손으로 움직이면 1.5초는 맡기지 않는다 | `dungeon.ts`의 `autoFight`, 한 셈 `systems/leader.ts`의 `leaderFight`(입구 `@engine/server`) | 없음 | 없음 |
| `STAGE_RULES.returnAfterDungeon: 초` | 던전을 끝냈거나(회차가 닫힘) 스스로 나온 사람을 그 초 뒤 **지금 단계**로 들여보낸다. 접속이 끊겨 나온 것은 아니다(다시 접속하면 `enterOnJoin`이 맡는다). 그사이 스스로 단계나 던전에 들어가면 그만둔다 | `stages.ts`(사건 `dungeonExited(p, id, 'self' \| 'end' \| 'drop')`을 듣는다), `g.stages.returnIn(p)` | 없음 | 없음 |
| `DungeonDef.fromMenu: true` | 문까지 걷지 않고 메뉴에서 들어간다. 들판에서도 단계 안에서도: 단계 안이면 단계에서 나와(들어오기 전의 자리) 문 앞을 거쳐 들어간다. 들어갈 수 있는지(레벨, 열쇠나 하루 횟수)를 **먼저** 보고 안 되면 아무것도 바뀌지 않는다(단계에서도 나오지 않는다). 안내문은 문에서와 같다(`dungeonLevel`, `dungeonNoKeys`, `dungeonNoRuns`) | 명령 `{ t: 'dungeonGo', id }`(그런 던전이 있는 게임에만), `g.dungeon.go(p, id)` | 메시지 `dungeon`(문에서와 같다) | '단계' 탭 끝의 **'던전'** 줄: 이름, 열쇠(또는 오늘 남은 횟수), 레벨, '들어가기'(누르면 메뉴가 닫힌다)와 소탕 단추. 셈 `dungeonGoView`(`hud/collectcalc.ts`) |
| `IDLE.popup: true` | 돌아왔을 때 받은 방치 보상(과 오프라인 진행)을 화면 가운데 창 하나로 알린다. 보상은 **예전처럼 우편으로** 온다: 창의 '받기'는 그 우편을 받는 명령(`mailClaim`)을 보내고 '나중에'는 창만 닫는다(우편에 남는다). 그래서 장부의 원인도 우편의 것 그대로다(`mail:idle`) | `idle.ts`가 방치 우편을 보낸 바로 뒤에 | 메시지 `{ t: 'idleBack', mail, min, r, from?, to?, n? }`(`IdleBack`: 우편 id, 비운 분, 보상, 진행이 있으면 처음·지금 단계와 깬 수) | `hud/idleback.ts`의 창(제목, 비운 시간, 진행, 받은 것의 줄, 받기·나중에). 바탕은 메뉴·가방과 같은 불투명한 `--ink`(폰에서 뒤의 글자가 비치지 않게). 오프라인 진행은 이 창에만 적히고 안내문 `stageAway`는 따로 나지 않는다(위 '오프라인 단계 진행'). 게임은 `onIdleBack(fn)`으로 함께 받는다(연출·소리). 셈 `idleBackLines` |
| `HERO_RULES.trade` | 재료로 영웅 키우기: 아이템 id → `{ cost: (등급) => 드는 수, shards?: (등급) => 얻는 조각 }`(shards가 없으면 그 등급의 조각 한 묶음 `HeroRarityDef.shards`). 가진 영웅에게만. 아이템 모듈과 `ITEMS`의 id여야 한다(틀리면 서버를 띄울 때 멈춘다) | `g.roster.trade(p, 영웅, 아이템, n)`, 명령 `{ t: 'hero', a: 'trade', id, item, n? }`(n은 1~99, 한꺼번에 되거나 하나도 안 된다), 원인 `cmd:hero:trade` | 안내문 `heroTraded`(`[영웅, 받은 조각, 아이템, 남은 수]`), 모자라면 `itemShort`. 개인 상태 `heroes`의 조각 | '영웅' 탭 위에 가진 재료, 가진 영웅의 줄마다 '별가루 3 → 조각 +5' 단추(모자라면 잠김). 셈 `tradeViews` |
| `HUD.hide` | 의존으로 딸려 온 틀의 화면을 감춘다: `bag`(가방 단추), `attackNearest`('가까운 대상 공격'), `auto`(자동 사냥 단추), `worldMap`(지도 단추), `minimap`, `hint`(조작 안내), `skills`(기술 단추 줄), `channel`(채널 고르기). **감출 뿐**이라 그 모듈의 기능과 단축키(B, Tab …)는 그대로다. 기능까지 빼려면 `MODULES`에서 모듈을 뺀다 | 없음 | 없음 | `hud/shell.ts`가 뼈대를 붙일 때 그 요소에 class `hudOff`. 이름과 요소 id의 표 `HUD_PARTS`(`engine/shared/defs/hud.ts`) |

- **영웅의 겉모습을 영웅마다·등급마다**: 화면의 영웅(종류 `hero`)은 틀의 사람형을 만들 때 영웅 id와 등급을 넘긴다. 사람형 전체를 바꾸는 `setHumanoidBody((look) => …)`의 `look.hero`·`look.rarity`(영웅이 아니면 없다)로 고르거나, 영웅만 바꾸는 `setHeroModel(({ id, rarity, look }) => 모델 또는 null)`(`@engine/client`. null이면 틀의 것)을 쓴다. 발밑의 등급 고리와 크기는 틀이 그 뒤에 얹는다. 옷 색으로 등급을 거꾸로 알아낼 일이 없다.
- **게임의 메뉴 탭을 틀의 탭과 같은 모양으로**: `@engine/client`의 `menuRow(이름, 설명, 단추들, class)`, `menuButton(글, 누르면, 잠김)`, `menuEl(class, 글)`, `menuSpan`, `menuChips`, `redrawMenu()`, `closeMenu()`, 열쇠 던전의 내 열쇠 `myKeys()`. 던전의 이름은 `dungeonLabel(L(), id).name`(`@engine/client/i18n/names`).
- **명령 처리기 안에서 사람을 옮길 때**(게임이 스스로 할 때): 자리(`p.x`, `p.z`, `p.tx`, `p.tz`), `p.moving = false`, `p.path = null`을 바꾼 뒤 `g.emit(['r', p.id])`(화면이 바로 옮긴다). 사람의 대상(`p.targetId`)을 몬스터 id로 주면 전투 모듈의 사람 틱이 사거리까지 다가가 친다. 이 둘은 위 칸들이 안에서 하는 일이라 그 칸을 쓰면 게임이 할 일이 없다.
- **처리기의 차례**: 사건의 처리기는 등록한 차례대로 불린다. 플러그인은 틀의 시스템보다 먼저 만들어지므로 플러그인이 `g.on('playerJoined', …)`로 건 것은 틀의 처리기(방치 보상, 단계 들어가기)보다 **먼저** 불린다. 틀의 처리기 뒤에 불려야 하면 `g.ready.push(() => g.on(…))`로 건다.
- 시험: `engine/test/collect/idleflow.test.ts`(셈·저장·장부·화면의 셈, 끄면 예전과 같음, 틀 안의 타입 오류였던 두 경우, 창의 바탕이 불투명한가), `idleflownet.test.ts`(실제 서버: 단계 → 메뉴의 금광 → 자동 전투 → 단계로 돌아옴 → 재료 → 다시 접속하면 창 → 받기), `offline.test.ts`·`sweepnet.test.ts`(창을 쓰면 진행은 창 하나로만, 안 쓰면 안내문).
- 이 칸들을 모두 쓰는 실제 게임은 달무리 원정대(`games/dalmuri/`)다: 게임의 코드는 처음 온 대장의 준비와 일일 임무의 셈뿐이고, 열쇠 던전으로 가기·던전 안의 전투·단계로 돌아가기·별정수 → 조각·돌아왔을 때의 창·감춘 단추는 모두 내용의 칸이다. 옮긴 기록은 [proof-dalmuri.md](proof-dalmuri.md) 끝의 '옮긴 것'.

### 화면과 문장

- 탭 넷(`heroes`, `gacha`, `squad`, `stages`)은 그 모듈의 화면이 `addMenuTab`으로 붙인다. 차례와 보일 탭은 게임이 `setMenuTabs([...])`로 고른다(아래 본보기). 단계 막대와 뽑기 결과 창도 그 모듈을 고른 게임에만 붙는다.
- 게임이 읽을 수 있는 것(`@engine/client`): `myHeroes()`, `mySquad()`, `myStage()`, `onGachaResult((배너, 결과) => …)`(연출·소리). 영웅의 성장을 켠 게임은 `myHeroGear()`(내 영웅 장비)도.
- 틀의 문장(한국어·영어)이 탭·단추·확률표·단계 막대·안내문을 다 갖고 있다. 게임은 **이름 키만** 적는다: 영웅(`HeroDef.name`), 역할(`HeroRoleDef.name`), 배너(`BannerDef.name`), 장(`ChapterDef.name`), 등급을 바꿨으면 그 이름. 두 번째 재화의 이름은 이름표의 `currency2`(뽑기·열쇠의 값에 쓰인다). 쓰러진 뒤 일어나는 곳의 이름표는 `places.stage`.
- 게임이 읽을 수 있는 것(`@engine/client`): `myHeroes()`, `mySquad()`, `myStage()`, `onGachaResult((배너, 결과) => …)`(연출·소리).
- 틀의 문장(한국어·영어)이 탭·단추·확률표·단계 막대·소탕·안내문을 다 갖고 있다. 게임은 **이름 키만** 적는다: 영웅(`HeroDef.name`), 역할(`HeroRoleDef.name`), 배너(`BannerDef.name`), 장(`ChapterDef.name`), 등급을 바꿨으면 그 이름. 두 번째 재화의 이름은 이름표의 `currency2`(뽑기·열쇠의 값에 쓰인다). 쓰러진 뒤 일어나는 곳의 이름표는 `places.stage`.

### 본보기: 영웅 들판

파일:

- 내용 `engine/test/collect/shared/content/index.ts`: 위의 조각 전부(맵, 직업 하나 '대장', 몬스터, 영웅·역할·배너·편성·장·단계, 열쇠 던전, 방치 보상, 영웅의 성장: 재료 셋, 영웅 장비 열셋(세트 둘), 기술 레벨, 각성 세 단계, 진영 셋의 시너지, 앞줄·뒷줄 둘씩).
- 서버의 규칙 플러그인 `engine/test/collect/server/heath.ts`: 처음 온 사람에게 직업, 처음 보석·골드, 처음 영웅 둘. 나머지는 틀의 모듈이다.
- 내용 `engine/test/collect/shared/content/index.ts`: 위의 조각 전부(맵, 직업 하나 '대장', 몬스터, 영웅·역할·배너·편성·장·단계, 열쇠 던전, 방치 보상).
- 서버의 규칙 플러그인 `engine/test/collect/server/heath.ts`: 처음 온 사람에게 직업, 처음 보석·골드·소탕권·선택권, 처음 영웅 둘. 나머지는 틀의 모듈이다.

```ts engine/test/collect/server/heath.ts
export const heath: Plugin = (g) => {
  g.on('playerJoined', (p) => {
    if (p.cls === '' && CLASS_IDS.length) g.classes.choose(p, CLASS_IDS[0]);
    if (!fresh(p)) return;
    if (STARTER.gold) g.wallet.add(p, 'gold', STARTER.gold, 'start');
    if (STARTER.sparks) g.wallet.add(p, 'sparks', STARTER.sparks, 'start');
    for (const [id, n] of Object.entries(STARTER.items ?? {})) g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, 'start');
    // 처음 영웅 둘 (편성의 빈 자리에 저절로 든다: SQUAD_RULES.autoFill)
    g.roster.grant(p, 'ironwall');
    g.roster.grant(p, 'swiftarrow');
  });
};
```

- 화면 `engine/test/collect/client/main.ts`: 언어 묶음(내용의 이름표와 이름 키)과 탭의 차례만.

```ts engine/test/collect/client/main.ts
setLocales([mergeLocale(koBase(koNames), { ui: koUi }), mergeLocale(enBase(enNames), { ui: enUi })]);
// 메뉴의 탭: 수집형의 넷과 영웅 장비를 앞에, 우편(방치 보상과 던전 보상) 뒤에
setMenuTabs(['heroes', 'gacha', 'squad', 'hgear', 'stages', 'mail']);
startClient({});
```

- 시험 `engine/test/collect/`(`npm test`의 `collect/…`): `rules`(영웅·뽑기의 확률과 천장·편성의 싸움·단계의 깸과 실패·열쇠·방치 보상), `saves`(왕복, 깨진 값, 모듈을 끈 게임, 버전 없는 저장), `client`(화면의 셈), `net`(실제 서버와 접속 둘), 영웅의 성장 `growth`(셈·값·장부의 원인·떨어지기·세트·시너지·앞줄이 먼저 맞기·전투력이 한 셈인가), `growthsaves`(왕복, 성장 전의 저장이 글자까지 같게, 깨진 값, 모듈을 끈 게임), `growthnet`(실제 서버로 끼기·강화·기술·진형, 화면의 셈 = 서버), `growthclient`(상세·장비 창·진형·시너지의 셈, 두 언어의 문장).
- 시험 `engine/test/collect/`(`npm test`의 `collect/…`): `rules`(영웅·뽑기의 확률과 천장·편성의 싸움·단계의 깸과 실패·열쇠·방치 보상), `saves`(왕복, 깨진 값, 모듈을 끈 게임, 버전 없는 저장, 천장 무리·확정·끝낸 적), `client`(화면의 셈, 확률표가 뽑기와 같은 셈인가, 문장), `net`(실제 서버와 접속 둘), `sweep`(소탕권과 보상의 셈, 장부의 원인, 열쇠 던전), `offline`(전투력·상한·거꾸로 간 시계·아주 큰 틈의 표, 방치 보상의 토막), `pickup`(픽업의 몫, 정해진 난수 12만 번과 실효 확률, 반반, 천장 무리, 기간, 선택권), `sweepnet`(정해진 서버 시계로 실제 접속: 소탕·픽업·선택권·오프라인 진행).
- 띄우기: `npx vite build -c engine/test/collect/vite.config.ts`(→ `dist-collect/`) 뒤에 `PORT=3015 DB=memory npx tsx --tsconfig engine/test/collect/tsconfig.json engine/test/collect/server/main.ts`. 접속하면 1-1이 바로 시작되고, 메뉴(M)의 '뽑기'에서 보석으로 뽑는다. 금광의 문은 들판의 남동쪽(26, −26)이다(`DEV_SPAWN=26,-26`으로 그 곁에서 시작하면 단계에서 '나가기'한 뒤가 문 앞이다).
- 새 게임으로 만들 때는 이 파일들을 `games/<게임>/`의 같은 자리에 옮기고 2절의 설정을 둔다(12절의 공 마당과 같다). 본보기는 틀 안에 있어 상대 경로(`../../../shared/defs`)로 가져오지만, **새 게임에서는 입구로** 가져온다. 플러그인(`games/<게임>/server/<게임>.ts`)의 머리는 이 두 줄이다:

```ts
import { CLASS_IDS, heroDef } from '@engine/shared/defs';
import { dist, type Ent, type Game, type Plugin } from '@engine/server';
import { STARTER } from '../shared/content';
```

  내용 파일의 타입은 `import type { HeroDef, HeroRules, StageRules, … } from '@engine/shared/defs/collect';`, 화면은 `import { menuRow, myHeroes, setHeroModel, … } from '@engine/client';`와 `import { dungeonLabel } from '@engine/client/i18n/names';`.

### 남은 것 (틀에 없는 것)

- 영웅의 전용 무기(그 영웅만 끼는 장비), 장비의 무작위 옵션·재련, 장비 뽑기는 없다. 영웅 장비는 거래소에 올릴 수 없다(장부에는 재화·재료의 흐름만 적힌다).
- 이끄는 사람 없이 영웅만 싸우는 모드, 영웅을 직접 조작하기, 영웅의 궁극기 연출은 없다.
- 뽑기는 영웅만 준다(장비·재료 뽑기 없음). 천장에 닿으면 고르는 '천장 선택'(교환 상점)은 없다(선택권 아이템은 있다). 기간 한정 배너를 더하거나 고치려면 게임이 `BANNERS`를 바꿔 배포한다(기간은 서버 시계로 저절로 열리고 닫힌다).
- 재료로 키우는 길은 영웅의 조각(`HERO_RULES.trade`)뿐이다(재료로 영웅의 경험치·레벨을 올리는 길은 없다: 레벨은 `levelCur`의 재화로).
- 단계는 한 사람씩이다(파티로 함께 깨기 없음). 단계의 순위표, 하루 소탕 횟수의 한도는 없다. 오프라인 진행은 전투력과 권장 전투력만 본다(실제 싸움을 흉내 내지 않는다).
- 열쇠는 던전 모듈의 것이라 그 의존(`combat`, `mail`, `daily`, `gear`)을 함께 고른다.

## 14. 판으로 나뉘는 게임 (턴제·보드·카드): `rooms` 모듈

사람(과 컴퓨터) 몇이 **한 판에 앉아 차례대로 두는** 게임의 바탕이다. 판마다 따로 된 층(인스턴스)이 열리므로 판들이 같은 자리(대국판 하나)를 써도 서로 보이지 않고, 판의 수가 맵의 자리 수에 묶이지 않는다. 저장소 안의 본보기는 틀의 시험이 돌리는 두 판이다: 둘이 두는 '말뚝 세기'(`engine/test/core/rooms.test.ts`의 머리)와 셋·넷이 두는 '별 줍기'(서버 `engine/test/core/server/stars.ts`, 화면 `engine/test/core/client/stars.ts`). 문서만 보고 만든 두 게임 징검돌 전술(둘, 7×7 칸의 말 셋 대 셋)과 반딧불 연못(넷, 엎어 던지는 패)은 커밋 `7e347c9`에 있다(`docs/proof-stepstone.md`, `docs/proof-pond.md`). 내용에 `MODULES = ['rooms']`(다른 모듈과 함께 골라도 된다)를 적는다.

| 틀이 맡는 것 | 게임이 맡는 것 |
|---|---|
| 판마다의 층(사람·`g.rooms.place`로 놓은 엔티티·스냅샷이 판마다 나뉜다), 판이 닫히면 엔티티를 치우고 사람을 들판(앉기 전의 채널)으로 | 판을 차리기(`start`: 판 상태 `room.data`와 말) |
| 대기실과 짝짓기: 빠른 대국(기다리는 판에 들어가거나 판을 열고 기다림), 판 만들기, 목록에서 들어가기, 컴퓨터와 두기, 기다리다 컴퓨터로 채우기(`cpuAfterS`), 자리 수의 범위(`seats: { min, max }`: 모인 만큼으로 시작) | 게임의 수(걷기·치기 …)의 명령과 검사: `g.rooms.myTurn(p)` |
| 차례의 순서·바퀴·바퀴의 상한, 바퀴마다 먼저 두는 자리 돌리기(`rotateFirst`), 한 수의 제한 시간과 시간 넘김(기본: 넘기기, `timeout`으로 바꾼다), 컴퓨터의 차례(간격 `cpuStepMs`마다 `cpu`를 부른다) | 컴퓨터의 한 수(`cpu`), 차례의 앞뒤(`turnStart`, `turnEnd`, `skip`), 바퀴의 끝(`roundEnd`), 판의 끝을 정하기(`g.rooms.finish`: 이긴 자리 또는 등수, 바퀴를 다 쓰면 `outOfRounds`) |
| 끊긴 사람: 자리를 저장 키(`p.pid`)로 기억해 `graceS` 안에 다시 들어오면 그 자리·층으로, 지나면 몰수(까닭 `'left'`). 기권(`'resign'`), 대기실로(두는 중이면 기권), 셋 이상의 판에서 빠진 자리(남은 사람끼리 잇기 또는 `outEnds`로 끝내기), 다시 하기(자리를 한 칸씩 돌려 먼저 두는 사람이 바뀐다) | 전적 같은 끝의 기록(`finished`, 등수는 `g.rooms.rankOf`) |
| 판의 저장(게임이 `save`/`load`를 주면 두던 판이 서버를 다시 켜도 이어진다) | 판 상태를 저장할 값으로, 그 값으로 말을 되살리기 |
| 화면: 대기실 창(오른쪽 위: '지금 시작' 단추 포함), 판의 막대(가운데 위: 자리들, 차례, 매끄러운 초읽기, 바퀴, 차례 넘기기·기권(두 번 눌러야 한다)), 결과 창(이김/짐 또는 등수와 점수, 다시 하기·대기실로), 기다리는 동안의 글, 좁은 화면 배치(막대의 자리는 게임이 고른다), 앉은 동안 걷기 멈춤과 조이스틱 감추기 | 판 위의 그림(칸 표시, 말), 칸 누르기(`setTapHandler`), 연출(`onEffect`), 카메라 |

### 서버: 판의 규칙 주기

플러그인에서 `g.rooms.define(def)`를 한 번 부른다(`RoomDef`: `engine/server/game/systems/rooms.ts`). `start`만 꼭 주고 나머지는 선택이다. 자리 번호(0부터)가 곧 편이고, 처음 바퀴는 자리 0이 먼저 둔다. 별 줍기(셋~넷, 바퀴마다 먼저 줍는 사람이 옮기고, 별이 바닥난 바퀴의 끝에 등수로 끝낸다):

```ts engine/test/core/server/stars.ts
  g.rooms.define<Stars>({
    seats: { min: 3, max: 4 }, startAfterS: STARS.startAfterS, cpuAfterS: STARS.cpuAfterS,
    turnS: STARS.turnS, rounds: STARS.rounds, rotateFirst: true, pass: false,
    start: (room) => { room.data = { pile: STARS.perSeat * room.seats.length, got: room.seats.map(() => 0), rounds: 0 }; },
    // 시간이 다 되면 하나를 대신 줍는다
    timeout: (room, seat) => { take(room, seat, 1); g.rooms.pass(room); },
    cpu: (room, seat) => { take(room, seat, 2); g.rooms.pass(room); },
    // 바퀴의 끝: 별이 바닥났으면 등수로 끝낸다
    roundEnd: (room) => { room.data.rounds++; if (room.data.pile <= 0) end(room); },
    outOfRounds: (room) => end(room),
```

| `RoomDef` 칸 | 기본 | 뜻 |
|---|---|---|
| `seats` | 2 | 자리 수 (1~16), 또는 범위 `{ min, max }`(아래 '자리 수의 범위') |
| `startAfterS` | 0 | 자리 수가 범위인 판: 판을 열고 이만큼 지나 사람이 `min` 이상이면 모인 만큼으로 시작한다 |
| `turnS` | 30 | 한 차례의 제한 시간(초). 0이면 기한이 없다 |
| `rounds` | 0 | 바퀴(모든 자리가 한 번씩 두면 한 바퀴)의 상한. 넘으면 `outOfRounds`(없으면 비김, 까닭 `'rounds'`) |
| `rotateFirst` | false | 바퀴마다 먼저 두는 자리(`room.first`)를 다음의 빠지지 않은 자리로 옮긴다 (넷이면 0, 1, 2, 3, 0 … 이 바퀴의 첫 차례) |
| `graceS` | 60 | 끊긴 사람을 기다리는 초 |
| `outEnds` | false | 셋 이상의 판에서 한 자리가 빠지면(기권·몰수): false는 남은 사람끼리 잇는다, true는 판을 끝낸다 (아래 '셋 이상의 판') |
| `max` | 200 | 동시에 열 수 있는 판의 수 (넘으면 안내문 `roomFull`) |
| `cpuAfterS` | 0 | 판을 열고 이만큼 지나도 차지 않으면 빈 자리를 컴퓨터로 채운다 (`cpu`가 있어야 한다) |
| `cpuFill` | `'max'` | 컴퓨터가 채우는 자리(`cpuAfterS`, '컴퓨터와 두기'): `'max'` 빈 자리 모두, `'min'` 사람과 합쳐 `min`이 될 만큼만 |
| `cpuName(room, i)` | | 컴퓨터 자리의 이름 (컴퓨터로 채울 때 한 번). 없으면 화면이 `roomCpu`(컴퓨터가 둘 이상이면 `roomCpuN`의 번호)로 적는다. 언어마다 다른 이름은 화면의 `setRoomLook({ seatName })`으로 |
| `cpuStepMs` | 700 | 컴퓨터가 한 수를 두는 간격 |
| `walk` | false | 앉은 동안 걸을 수 있는가 (false면 서버의 `g.rules.speed`가 0, 화면의 `rules.speed`도 0, 조이스틱이 숨는다) |
| `pass` | true | 사람이 '차례 넘기기'(명령 `room` `a: 'pass'`)를 할 수 있는가 |
| `againSwap` | true | 다시 하기에서 자리를 한 칸 돌린다 |
| `seatAt(room, i)`, `exitAt(p)` | 제자리 | 앉는 자리와 판 밖의 자리(`{ x, z, face? }`). `exitAt`은 판 없이 접속한 사람에게도 쓰인다(판이 끝났거나 서버를 다시 켰다) |
| `skip(room, i)` | | 참이면 이번에 그 자리의 차례를 건너뛴다(빠진 자리처럼: `turnStart`·`turnEnd`도 불리지 않는다). 한 바퀴의 모든 자리가 건너뛰면 틀은 건너뛰기를 무시하고 먼저 두는 자리부터 |
| `roundEnd(room)` | | 한 바퀴가 끝났다: 마지막 자리의 `turnEnd` 뒤, 다음 바퀴의 `round`·`first`를 정하기 전(`room.round`는 끝난 바퀴). 펼치기·점수 셈. 여기서 `finish`를 불러도 되고 `room.first`를 바꿔 다음 바퀴의 선을 정해도 된다 |
| `out(room, i, why)` | | 셋 이상의 판에서 자리 하나가 빠졌다(남은 자리가 둘 이상일 때만). 여기서 `finish`를 부르면 그 결과로 끝난다 |
| `start`, `turnStart`, `turnEnd`, `timeout`, `cpu`, `outOfRounds`, `finished`, `save`, `load` | | 위의 표 |

게임의 수는 게임의 명령으로 받고, 차례인지는 틀에 묻는다(차례가 아니면 틀이 `roomNotTurn`을 알린다):

```ts engine/test/core/server/stars.ts
  g.commands.set('star', (p, m) => {
    const t = g.rooms.myTurn<Stars>(p);
    if (!t || typeof m.n !== 'number' || ![1, 2, 3].includes(m.n)) return;
    take(t.room, t.seat, m.n);
    g.rooms.pass(t.room);
  });
```

`g.rooms`의 나머지: `of(p)`(앉은 판), `get(id)`, `all()`, `count`, `seatOf(room, p)`, `playerAt(room, i)`(접속해 있는 그 자리의 사람), `players(room)`, `place(room, 종류, 자리)`·`unplace(room, id)`(판의 층에 엔티티를 놓고 치운다), `pass(room)`(차례 넘기기: 할 일이 남지 않으면 게임이 부른다), `finish(room, 이긴 자리 | -2 비김 | 등수 배열, 까닭, 점수?)`, `rankOf(room, i)`(끝난 판의 등수), `touch(room)`(틀이 모르는 바뀜을 화면에 다시 보낼 때), 그리고 명령과 같은 이름의 `quick`·`host`·`withCpu`·`join`·`leave`·`resign`·`again`·`startNow`(시험·봇에서). `Room`의 칸: `id`, `layer`, `st`(`'wait' | 'play' | 'over'`), `seats`(`RoomSeat`: `key`, `ent`, `name`, `cpu`, `goneAt`, `out`, `again`), `turn`, `first`, `round`, `deadline`, `win`, `why`, `ranks`, `scores`, `data`, `ents`, `openedAt`, `cpuAt`(컴퓨터가 다음 수를 두는 때: 차례가 시작될 때 `turnStart`보다 먼저 정해지므로 `turnStart`에서 늦춰도 된다. 반딧불 연못은 펼친 결과를 보여 줄 동안 컴퓨터를 2.6초 쉬게 했다), `ver`.

- **명령**(화면 → 서버, 틀의 것): `{ t: 'room', a: 'quick' | 'host' | 'cpu' | 'join' | 'leave' | 'pass' | 'resign' | 'again' | 'start', id? }`. 화면에서는 `roomSend(a, id?)`.
- **안내문**(틀의 것, 문장은 틀의 언어 파일): `roomWait`, `roomStart`(먼저 두면 1, 상대 이름(셋 이상이면 다음 자리의 이름), 자리 수: 틀의 문장은 자리가 셋 이상이면 'n명이 둡니다'), `roomFull`, `roomBusy`, `roomGone`, `roomNotTurn`, `roomTimeout`(이름: 컴퓨터는 `cpuName`이나 빈 문자열), `roomFoeLeft`(이름, 기다리는 초), `roomFoeBack`, `roomBack`, `roomResult`(0 이김 1 짐 2 비김, 까닭, 내 등수, 등수를 받은 자리 수, 같은 등수가 또 있으면 1: 등수로 끝내지 않은 판은 뒤의 셋이 0), `roomAgainWait`, `roomFoeGone`, `roomFewer`('지금 시작'에 사람이 모자람: 가장 적은 수).
- **보내는 상태**: 개인 상태 `room`(`RoomView`: 내 자리, 자리들, 차례, 바퀴, 남은 시간(ms, 보낸 때 기준), 결과, 시작할 수 있는 가장 적은 자리 수 `min`, 등수 `ranks`와 점수 `scores` …: 차례·판이 바뀔 때만 간다)과 공유 상태 `rooms`(`RoomLobby`: 대기실의 판 목록, `cpuAfterS`, `startAfterS`). 모양은 `engine/shared/defs/rooms.ts`, 타입은 입구 `@engine/shared`·`@engine/client`에서 `import type { RoomView, RoomLobby, RoomRow, RoomSeatView, RoomPhase }`(시험에서 받은 상태를 읽을 때도). 판 위의 게임 상태(말의 칸, 손패 …)는 게임이 자기 개인 상태로 보낸다(숨긴 정보도 `g.personal`이면 그 사람에게만 간다).
- **판의 저장**: `save`와 `load`를 주면 두는 중인 판(기다리는 판과 끝난 판은 빼고)이 월드 저장의 `rooms` 칸에 적힌다. 판이 바뀔 때마다 `g.saveDirty`가 서고, 사람의 연결이 끊길 때와 주기 저장(60초)·끄기에 적힌다. 다시 켜면 사람의 자리는 모두 '끊긴 채'로 `graceS`를 기다리고, 같은 저장 키로 들어오면 그 자리로 돌아간다. 두던 차례는 처음부터 다시 준다(다시 켠 것은 누구의 탓도 아니다). 손님(저장 키 없음)의 자리는 돌아올 수 없어 빠진 것으로 친다. 자리 수가 `min`~`max` 안인 판만 되살린다. 주지 않으면 판은 서버를 다시 켜면 없어지고 사람은 `exitAt`의 자리로 들어온다.

### 셋 이상의 판: 선 돌리기, 빠진 자리, 등수

- **차례**: 한 바퀴는 `room.first`부터 자리 번호 차례로 돈다(빠진 자리와 `skip`이 참인 자리는 건너뛴다). 바퀴가 끝나면 `roundEnd` → `round`가 오르고 상한(`rounds`)을 넘으면 `outOfRounds` → `rotateFirst`면 `first`가 다음의 빠지지 않은 자리로 → 새 바퀴는 `first`(빠졌거나 건너뛰면 그다음)부터. 넷의 판에서 '던지기마다 선이 한 자리씩 옮긴다'는 `rotateFirst: true` 하나로 되고, 틀의 바퀴(`room.round`, 막대의 '바퀴 3 / 8')가 곧 게임의 던지기 번호다. 게임이 `turnStart`에서 `g.rooms.pass`를 불러 차례를 건너뛰는 길은 쓰지 않는다(그 자리의 `turnStart`·`turnEnd`가 헛돌고 화면이 한 번 더 간다): 건너뛰기는 `skip`으로.
- **빠진 자리**(기권, 두는 중에 대기실로, 끊긴 채 `graceS`가 지난 몰수): 그 자리는 `out`이 되어 차례에서 빠진다. 남은 자리가 하나면 그 자리가 이기고(없으면 비김) 판이 끝난다. 남은 자리가 둘 이상이면 게임의 `out(room, i, why)`가 먼저 불리고, 그다음 `outEnds`가 false(기본)면 **남은 사람끼리 이어 간다**(빠진 자리가 두던 차례였으면 다음 자리로), true면 판을 끝낸다(남은 자리가 함께 1등, 빠진 자리가 그다음 등수: 등수를 다르게 매기려면 `out`에서 `finish`를 부른다). 빠진 사람이 판에 앉아 있으면 막대에 '떠남'으로 보이고 끝의 결과도 받는다.
- **등수로 끝내기**: `g.rooms.finish(room, 등수 배열, 까닭, 점수?)`. 등수는 자리마다 1부터, 같으면 같은 등수(빈 자리는 0). 1등이 하나면 `room.win`이 그 자리, 여럿이면 -2(함께 1등). 화면의 결과 창은 내 등수를 큰 글('2등', '함께 1등', 1등 하나면 '이겼습니다!')로, 아래에 모든 자리의 등수·이름·점수를 적고, 대화창의 안내문은 'n명 가운데 k등입니다'. 예전처럼 `finish(room, 이긴 자리 | -2, 까닭)`도 그대로 된다(둘의 판의 화면·안내문은 이김/짐/비김). 전적은 어느 쪽이든 `g.rooms.rankOf(room, i)`(등수로 끝냈으면 그 등수, 아니면 이긴 자리 1·나머지 2·비김이면 모두 1)로 읽는다.

```ts engine/test/core/server/stars.ts
  const end = (room: Room<Stars>) => g.rooms.finish(room, starRanks(room), 'stars', room.data.got);
```

### 자리 수의 범위 (`seats: { min, max }`)

판은 `max` 자리로 열리고 사람을 기다린다. 다 차면 곧바로 시작하고, 그 전에는:

- 가장 먼저 앉은 사람의 대기실 창에 **'지금 시작 (n명)'**(명령 `room` `a: 'start'`)이 뜬다(앉은 사람이 `min` 이상일 때). 모자라면 안내문 `roomFewer`.
- `startAfterS`가 지나 사람이 `min` 이상이면 모인 만큼으로 저절로 시작한다.
- `cpuAfterS`가 지나면(사람이 `min`보다 적어 위에서 시작하지 않았으면) 컴퓨터가 빈 자리를 채운다(`cpuFill`). '컴퓨터와 두기'도 같다.
- 모인 만큼으로 시작하면 빈 자리는 빠지고 자리가 앞으로 당겨진다(`room.seats.length`가 그 판의 자리 수). `start`에서 자리 수에 맞춰 판을 차린다(별 줍기: 자리마다 별 다섯).

### 화면

틀의 판 화면(대기실 창·판의 막대·결과 창)은 모듈을 고르면 저절로 붙는다. 문장은 틀의 언어 파일의 `ui.room…`·`fmt.room…`이고, 게임은 같은 키를 자기 언어 파일에 적어 자기 말로 덮어쓴다(징검돌: `roomLobby: '대국장'`, `roomCpu: '돌부처(컴퓨터)'`, `fmt.roomRound`의 '차례', 끝난 까닭 `fmt.roomWhy(why)`. 등수의 글은 `fmt.roomRankTitle`, `fmt.roomRankRow`, 점수는 `fmt.roomScore`). 게임이 더하는 것:

- 내 판과 그 바뀜: `myRoom()`, `myRoomTurn()`, `onRoomChange((before, now) => …)`, 매끄러운 남은 시간 `roomLeftMs()`, 자리의 이름 `roomSeatName(view, i)`.
- 판 화면에 게임의 것: `setRoomLook({ seatColor: (i) => css 색, seatName: (view, i) => 자리의 이름(빈 문자열이면 틀의 것), note: () => 막대 아래 줄, title: () => 결과 창의 큰 글, lobby: () => 대기실 창 제목 옆 글, barAt: 'top' | 'bottom' })`.
- **좁은 화면(폭 720px 이하)의 막대 자리**: 틀은 판의 막대를 화면 아래(아래에서 108px, `z-index` 12)에 띄운다. 게임이 아래쪽에 자기 창(손패, 고르는 단추)을 두면 겹쳐서 엉뚱한 단추를 누른다: `barAt: 'top'`이면 위쪽 내 정보 창 밑(위에서 96px)으로 올린다. 거리를 바꾸려면 css 변수 `--room-bar-bottom`, `--room-bar-top`. 기권 단추는 한 번 누르면 '한 번 더 누르면 기권'으로 바뀌고 3초 안에 다시 눌러야 기권한다(`ui.roomResignSure`).

```ts engine/test/core/client/stars.ts
  setRoomLook({
    seatColor: (i) => SEAT_COLORS[i] ?? '',
    seatName: (v: RoomView, i) => (v.seats[i]?.cpu ? `★${i + 1}` : ''),
    barAt: 'top',
  });
```

- 칸 누르기: 판에 앉은 동안 땅 누르기를 게임이 받는다(아래 '땅 누르기를 게임이 받기').

```ts engine/test/core/client/stars.ts
  setTapHandler(() => {
    if (!myRoom()) return false;
    send({ t: 'star', n: 1 } as never);
    return true;
  });
```

- 카메라: 판 전체를 비추고(`setCameraAim`의 `center: true`로 폰 세로에서도 한가운데), 내 자리에 맞춰 카메라를 돌린다(`setCameraYaw`): 누구나 자기 자리를 같은 쪽(화면 아래)에 본다. yaw 0에서 카메라는 비추는 곳의 +x+z 쪽 위에 있다(화면 아래가 +x+z, 위가 −x−z). 각이 커지면 카메라가 세로축으로 `applyAxisAngle(위, yaw)`만큼 돈다(+x+z → +x−z 쪽). 자리를 같은 회전으로 놓으면(자리 i를 `i × 2π / 자리 수`만큼 돌린 곳) `setCameraYaw(i × 2π / 자리 수)`로 내 자리가 늘 화면 아래다.

```ts engine/test/core/client/stars.ts
  onRoomChange((_before, r) => {
    setCameraYaw(r ? (r.me * 2 * Math.PI) / r.seats.length : 0);
  });
```

- 연출: 서버의 `g.effect(엔티티 id, 이름, 수…)`를 화면의 `onEffect(이름, (id, vals) => …)`가 받는다(아래 '연출 사건'). 말뚝 세기의 예:

```ts engine/test/core/rooms.test.ts
    g.effect(t.room.data.marks[t.seat], 'pegHit', t.seat, m.n);
```

### 판 게임을 만들 때 걸리는 작은 것들

- **`onFrame((now, dt) => …)`**: 인자는 `now`(ms, `performance.now`)가 먼저, `dt`(초, 0.05로 자른다)가 그다음이다. 차례를 바꿔 적으면 움직임이 멈춘다.
- **이름표가 실려 온 값을 쓰기**: `registerKind`의 `label(e, vals)`는 놓일 때(`vals`는 빈 배열), 실려 온 값(`KindDef.sync`)이 바뀔 때, 언어가 바뀔 때 다시 불린다. 물고기의 크기·남은 수처럼 바뀌는 값을 이름표에 쓸 수 있다.
- **`[[PC용|터치용]]`**: `t()`와 `data-i18n`은 저절로 푼다. `L().ui.x`를 직접 읽어 `textContent`에 넣을 때는 `forInput(글)`(`@engine/client/i18n`)을 거친다(아니면 대괄호가 그대로 보인다).
- **시험의 시계**: 판의 기한·컴퓨터의 간격·기다림은 게임의 시계(`g.now()`)로 잰다. 서버 없는 시험은 `new Game({ modules: ['rooms'], plugins, now: () => t })`, 실제 서버의 시험은 `startServer(0, { game: { plugins, now: () => t } })`로 주고 `t`를 옮긴다(`startServer(0, { now })`는 대화·이름 바꾸기 간격의 시계로 다른 것이다).
- **시험에서 끊김과 돌아옴**: 판은 사람을 저장 키로 기억한다. `g.players.spawn(이름, false, null, 저장 키)`(넷째 인자가 저장 키 `pid`)로 들어오고, 끊김은 `g.players.leave(id)`, 같은 저장 키로 다시 `spawn`하면 그 자리로 돌아온다(`engine/test/core/rooms.test.ts`의 `world()`).
- **부하 측정**: `npm run load:game -- <게임> <인원> <초> mode=room`(둘씩 빠른 대국) 또는 `mode=roomcpu`(한 사람이 컴퓨터와 한 판: 셋 이상의 판은 이쪽). 게임을 측정하려면 `scripts/load/server.ts`의 `PLUGINS` 표에 `게임: ['games/<게임>/server/<파일>.ts', '내보낸 플러그인 이름', 설정을 받는가]` 한 줄을 손으로 더한다([infra.md](infra.md) '부하와 장시간').

### 땅 누르기를 게임이 받기 (`setTapHandler`, 모듈과 상관없이)

`setTapHandler((sx, sy, touch) => boolean)`(`@engine/client`): 3D 화면(땅·엔티티)의 누르기를 게임이 먼저 받는다. 마우스는 누를 때, 터치는 손가락을 거의 움직이지 않고 뗄 때 불린다(두 손가락 확대와 창의 단추는 그대로 틀의 것). 참을 돌려주면 틀은 아무것도 하지 않는다(몬스터 공격, 사람 카드, 그 자리로 걷기). 누른 땅의 월드 점은 `view.pick(sx, sy)`, 월드 → 화면은 `view.project(x, y, z)`. 되돌리려면 `setTapHandler(null)`.

### 연출 사건 (`g.effect` / `onEffect`, 모듈과 상관없이)

서버의 `g.effect(id, name, ...vals)`는 다음 스냅샷의 사건(`ev`)에 `['fx', id, name, …vals]`를 싣는다. 그 엔티티(`id`)가 보이는 화면에만 간다. 상태가 아니라 한 번의 연출이므로 늦게 들어온 사람은 받지 않는다(남아야 하는 것은 상태로 보낸다). `name`은 영문 소문자로 시작하는 24자 이내, 수는 소수 둘째 자리까지. 화면은 `onEffect(name, (id, vals) => …)`로 받는다: 스냅샷과 같은 때라 그 엔티티의 자리는 `S.others.get(id)`에 있다.

### 차례·기한을 직접 짤 때 (판 모듈 없이)

판 모듈을 쓰지 않고 틱 위에 차례를 올리려면 `g.now()`(벽시계, 시험은 정해진 시계 `new Game({ now })`)로 기한을 재고 `g.ticks`에서 매 틱 본다(해상도는 틱 50ms). 화면의 초읽기는 남은 시간(ms)을 보낸 때 기준으로 실어 보내고 화면이 받은 때 + 남은 시간을 기한으로 삼는다(판 모듈의 `RoomView.left`가 그렇게 한다: 차례가 바뀔 때만 보내도 매끄럽다).

## 15. 겉모습 부품, 캐릭터 정의, 변신 (`chars`·`morph` 모듈)

사용자 아이디어 'AI로 만드는 캐릭터'([ideas.md](ideas.md) 3절)의 틀 쪽 바탕이다. AI·계정·거래·주간 한도는 아직 없다: 틀은 **정해진 형식의 캐릭터 정의**를 받아 믿지 않고 검증하고, 그 정의를 부품으로 그리고, 수집형의 영웅과 MMORPG의 변신이 함께 읽게 한다. 셋 다 선택이다: 겉모습을 적지 않은 사람형은 예전과 같은 그림이고, 두 모듈을 고르지 않은 게임에는 명령·저장 칸·개인 상태·창이 없다(`RPG_MODULES`에도 들지 않는다).

### 겉모습 부품 (모듈과 상관없이)

- 형식(`engine/shared/defs/look.ts`의 `Look`): 칸 여섯(`body` 체형, `head` 머리 모양, `hair` 머리카락, `hat` 모자, `face` 얼굴 장식, `back` 등 장식)마다 부품 id, 색 넷(`skin`·`cloth`·`hair`·`accent`, 0xRRGGBB), 무늬(`pattern`), 키·너비 배율(`size`·`width`, 기본 범위 0.85~1.15·0.85~1.2). 적지 않은 칸은 그 칸의 기본 부품(목록의 첫째)이다.
- 줄 위와 저장에는 짧은 글자로 싣는다: `encodeLook(look)` → `'1;b=stout;r=bob;t=helm;C=4c7a3a;p=belt;z=105'`(맨 앞이 버전, 기본값은 적지 않는다: 아무것도 고르지 않으면 `'1'`), `decodeLook(글자)`(모양이 틀리면 `null`, 배율은 범위로 자른다). 믿지 않는 객체는 `checkLook(raw)`가 칸·부품·색·무늬·배율을 모두 보고 틀린 곳을 돌려준다.
- 틀의 기본 부품: 체형 `plain`(틀의 네모난 사람과 같은 치수)·`stout`·`slim`·`robe`, 머리 `box`(틀의 머리)·`round`·`tall`·`wide`, 머리카락 `none`·`short`·`bob`·`long`·`spiky`·`bun`·`tail`, 모자 `none`·`cap`·`hood`·`pointed`·`crown`·`helm`·`horns`·`band`, 얼굴 `none`·`eyes`·`mask`·`beard`·`goggles`, 등 `none`·`cape`·`pack`·`wings`·`scarf`·`shield`, 무늬 `none`·`stripe`·`sash`·`belt`·`trim`.
- 게임이 고치는 길: 내용의 `LOOK_RULES`(`add` 칸마다 더할 부품, `remove` 뺄 부품(첫째 기본은 못 뺀다), `off` 끌 칸, `patterns`, `size`·`width` 범위). 더한 부품은 화면에서 그리는 법을 등록한다: `registerLookPart(칸, id, ({ frame, body, head, mats }) => …)`(머리카락·모자·얼굴·등), `registerLookBody`, `registerLookHead`, `registerLookPattern`(`@engine/client`). 머리의 부품은 `head.head`에 붙이고(좌표는 머리 가운데가 원점, `head.w`·`head.h`·`head.d`는 반폭·반높이·반깊이), 등 장식은 `frame`에(몸통의 반깊이 `body.bd`). 모양은 `lookGeo(열쇠, 만들기)`로 나눠 쓴다.
- 그리기: `makeHumanoid(옷, 손, 살갗, 직업, 영웅, look)`의 여섯째에 겉모습을 주거나 `HumanoidLook.look`이 있으면 `defaultHumanoid`가 부품으로 그린다(`engine/client/scene/look.ts`). 손 모양·무기의 겉모습(`registerBlade`)·갑옷 덧대기(`registerArmor`)·게임의 꾸밈(`setHumanoidDeco`)이 그대로 붙는다. 사람 모델 파일(`registerHumanoidAsset`)로는 바꿔 끼우지 않는다(파일에는 부품이 없다). `setHumanoidBody`로 사람을 바꾼 게임은 `look.look`이 있을 때 자기 덧붙임을 건너뛴다(아래 예제의 털모자). 크기 배율은 안쪽 묶음(`Model.frame`)에 준다.
- 비용: 움직이지 않는 부품(몸통·머리카락·모자·얼굴·등·무늬)은 다 붙인 뒤 꼭짓점 색을 입힌 **한 메시로 굽는다**(재질 하나를 모두가 나눠 쓰고, 같은 겉모습의 사람은 구운 모양도 나눠 쓴다). 그래서 사람 하나의 그리기 호출은 틀의 네모난 사람과 같다(팔다리 넷 + 머리 + 몸 하나, 부품의 수와 상관없이). 색만 있는 재질이 아닌 부품(게임이 단 빛나는 재질)은 굽지 않고 따로 그린다. 측정: [framework-status.md](framework-status.md)의 '캐릭터 정의와 변신'.
- 사람의 겉모습을 남에게 보내는 통로(핵심): 서버의 `g.setLook(엔티티, 글자)`(빈 글자면 예전 그림). 모두에게 `{ t: 'look', id, l }`이 가고, 나중에 시야에 들어오는 화면에는 `EnterInfo.l`로 간다. 저장하지 않는다(겉모습을 정한 시스템이 자기 저장에서 다시 부른다). 변신 모듈이 이것을 쓴다.

예제는 모자에 '사슴뿔'을 더하고 등 장식의 '날개'를 뺀다:

```ts games/sample/shared/content/index.ts
export const LOOK_RULES: LookRules = { add: { hat: ['antlers'] }, remove: { back: ['wings'] } };
```

```ts games/sample/client/scene.ts
registerLookPart('hat', 'antlers', ({ head, mats }) => {
const beam = lookGeo('antlerBeam', () => new THREE.BoxGeometry(0.06, 0.42, 0.06)), tine = lookGeo('antlerTine', () => new THREE.BoxGeometry(0.05, 0.2, 0.05));
for (const s of [-1, 1]) {
const b = part(beam, mats.accent, s * (head.w * 0.7), head.h + 0.18, 0);
```

### 캐릭터 정의와 검증 (`chars` 모듈)

정의 하나(`engine/shared/defs/chardef.ts`의 `CharDef`):

```json
{
  "v": 1, "id": "mossguard", "name": "이끼 파수꾼", "bio": "숲 가장자리를 지키는 느긋한 파수꾼.",
  "look": { "parts": { "body": "stout", "hat": "helm", "face": "beard", "back": "shield" }, "colors": { "cloth": 5012026, "accent": 13148224 }, "pattern": "belt", "size": 1.05 },
  "role": "", "rarity": 0, "stats": { "atk": 12, "hp": 200 }, "skills": ["chop"]
}
```

- **검증기 `validateCharDef(객체 또는 JSON 글자, 쓰는 id인가?)`는 결과를 믿지 않는다**: 모양(객체, 모르는 칸·빠진 칸, 4096자까지의 JSON), 버전, id(영문 소문자로 시작하는 3~32자, 내용의 영웅·저장소의 정의와 겹치지 않게), 이름·소개(NFC로 모은 글자 수, 제어·서식·방향 바꾸기·줄 바꿈 글자, 쓸 수 있는 글자(기본: 한글·로마자·숫자·빈칸·문장 부호 몇), 앞뒤·겹친 빈칸, 금칙어), 역할·등급, 능력치(칸마다 정수, 가장 작은 값, 등급의 칸마다 상한, 무게를 곱한 합의 **예산**), 기술(틀의 기술 효과 `SKILL_DEFS` 가운데 고를 수 있는 것, 수, 겹침), 겉모습(`checkLook`). 예외를 던지지 않고 `{ ok: true, def }`(다듬은 정의) 또는 `{ ok: false, issues: [{ code, path, arg }] }`(32개까지)를 돌려준다.
- 거절 코드(`CHAR_ERRS`, 26가지): `shape` `extra` `missing` `type` `version` `id` `idTaken` `length` `control` `charset` `space` `banned` `role` `rarity` `stat` `statMin` `statCap` `budget` `skill` `skillCount` `skillDup` `part` `slotOff` `color` `pattern` `size`. 화면의 문장은 `L().fmt.charErr(code, path, arg)`(한국어·영어), 서버가 사람에게 알릴 때는 안내문 `charBad`.
- 규칙(내용의 `CHAR_RULES`, 모두 선택): `stats`(능력치의 칸과 무게, 기본 `atk` 무게 4·`hp` 무게 0.5: 영웅의 전투력 셈과 같다), `budget`(등급마다 `{ total, cap }`. **적지 않으면 내용의 영웅(`HEROES`)들의 범위에서 셈한다**: `budgetFromHeroes()`, 그 등급의 영웅이 없으면 그 등급은 만들 수 없다), `roles`(기본 `HERO_ROLES` 전부), `skills`·`maxSkills`(기본 `SKILL_DEFS` 전부, 하나), `nameMax`·`bioMax`(16, 120), `charset`, `banned`, `toHero`(영웅으로 쓸 때의 공격·체력).
- 금칙어 고리: `CHAR_RULES.banned`(목록) 또는 `addCharFilter((글, 'name' | 'bio') => 걸리면 true)`(서버가 시작할 때 꽂는다). 대소문자·빈칸·문장 부호를 무시하고 견준다(`banKey`). 거르개가 예외를 던지면 걸린 것으로 본다.
- 서버(`g.chars`, `engine/server/game/systems/chars.ts`): `add(raw, { replace? })`가 정의를 더하는 **유일한 길**이다(게임의 규칙, 관리자, 나중의 AI 만들기 요청). 검증을 거쳐 통과한 것만 두고, `remove(id)`(회수), `get`·`has`·`list`. 기본 저장은 월드 저장의 칸 `chars`(서버 DB). `useStore({ all, put, remove })`로 저장소를 바꿔 끼운다(나중의 계정 공용 저장소: 두 게임 서버가 같은 저장소를 읽으면 같은 정의를 본다). 읽은 정의가 지금의 규칙으로 거절되면 쓰지 않고 간직했다가 다시 적는다. 화면에는 개인 상태 `chars`(정의의 목록, 바뀐 때만)로 간다: `onChars(fn)`, `charDefs()`(`@engine/client`).
- **영웅으로 쓰는 다리**: `roster`를 함께 고른 게임에서는 더한 정의가 영웅의 표에 들어간다(`addHeroDef(id, charHero(def))`: 이름은 글 그대로(`HeroDef.label`), 공격·체력은 능력치, 겉모습(`HeroDef.look`), 기술은 역할의 것 대신 정의의 첫째). `isHeroId`·`heroDef`·`heroRole`·`heroIds()`가 곧바로 보므로 뽑기·편성·저장·영웅 탭·싸우는 영웅의 겉모습이 내용의 영웅처럼 돈다. 서버가 켜지면 월드(정의)를 먼저 읽고 사람을 읽으므로 저장된 영웅이 이어진다.

예제(영웅이 없는 게임)는 예산의 표를 직접 적는다:

```ts games/sample/shared/content/index.ts
export const CHAR_RULES: CharRules = {
budget: [{ total: 160, cap: { atk: 20, hp: 220 } }, { total: 200, cap: { atk: 26, hp: 260 } }, { total: 240, cap: { atk: 32, hp: 320 } }],
roles: [],
skills: ['chop', 'aim', 'rest'],
nameMax: 12, bioMax: 80,
banned: ['운영자', 'admin'],
};
```

정의는 날것(`unknown`)으로 두고 검증기를 거쳐서만 받는다(AI의 결과와 같은 자리):

```ts games/sample/server/chars.ts
export function installChars(g: Game): void {
g.ready.push(() => {
for (const raw of SAMPLE_CHARS) {
const r = g.chars.add(raw, { replace: true });
if (!r.ok) console.warn(`[sample] 캐릭터 정의가 거절됐다: ${r.issues.map((x) => `${x.code}@${x.path}`).join(', ')}`);
}
});
g.on('playerJoined', (p) => { for (const d of g.chars.list()) g.morph.grant(p, d.id); });
}
```

### 변신 (`morph` 모듈, `chars`에 기댄다)

- 사람이 가진 캐릭터 정의로 바뀐다. 겉모습은 `g.setLook`으로 바뀌어 **남의 화면에도 보이고**, 힘의 보정은 `g.mods`(주는 피해 `damage`, 받는 피해 `guard`, 치명타 `crit`, 자연 회복 `regen`)로 건다.
- 규칙(내용의 `MORPH_RULES`): `durationS`(이어지는 시간, 0이면 스스로 풀 때까지), `cooldownS`(풀린 뒤 다시까지), `noFightS`(맞은 지 이 초 안에는 못 한다, 0이면 언제나), `mods(def)`(정의마다의 보정), `cap`(칸마다 상한, `guard`는 0.9까지), `maxOwn`(가질 수 있는 수). **기본값은 겉모습만**(보정 0), 스스로 풀 때까지, 다시까지 10초, 맞은 지 5초 안에는 못 한다, 서른까지.
- 서버(`g.morph`): `grant(p, id)`(주기: 게임의 보상·상점, 나중의 거래·AI 만들기), `take(p, id)`(거두기), `owns`, `on(p, id)`, `off(p, why)`, `mods(p)`. 명령 `{ t: 'morph', a: 'on', id }`, `{ t: 'morph', a: 'off' }`. 사건 `morphed(p, id, why)`. 정의가 빠지면 그것으로 변신한 사람이 풀린다. 저장은 캐릭터의 ext `morph`(`{ own, on?, left?, cd? }`), 개인 상태 `morph`(`MorphMe`: 가진 것, 지금의 것, 남은 초, 다시까지).
- 화면: 메뉴의 '변신' 탭(가진 캐릭터마다 부품으로 그린 작은 그림, 이름·등급·소개·능력치·보정, 변신 단추, 변신 중이면 남은 시간과 풀기). `setMenuTabs`를 쓰는 게임은 목록에 `'morph'`를 넣는다. 내 상태는 `myMorph()`.

```ts games/sample/shared/content/index.ts
export const MORPH_RULES: MorphRules = {
durationS: 180, cooldownS: 15, noFightS: 4, maxOwn: 8,
mods: (d) => ({ damage: (d.stats.atk ?? 0) / 300, guard: (d.stats.hp ?? 0) / 4000 }),
cap: { damage: 0.08, guard: 0.06 },
};
```

화면에서 정의를 받아 쓰는 예(모닥불 곁에 정의마다 그 겉모습의 사람을 세운다):

```ts games/sample/client/chars.ts
onChars((list) => {
if (placed || !list.length) return;
placed = true;
```

### 시험과 남은 것

- 시험: `engine/test/collect/chardef.test.ts`(검증기의 규칙마다의 거절 코드, 금칙어 고리, 겉모습 글자, **퍼징**: 무작위·악의적인 정의 6000개가 예외 없이 거절·통과하고 통과한 것은 모두 예산 안, 예산을 넘긴 것은 언제나 거절, 영웅의 다리와 저장, 저장소 바꿔 끼우기), `engine/test/collect/morph.test.ts`(변신·풀기·대기·전투 중 금지, `EnterInfo.l`과 `look`, 저장, 회수), `games/sample/test/morph.test.ts`(예제의 정의와 세기, 실제 서버에서 남의 화면).
- 남은 것(틀 밖, 사용자 결정이 필요한 것): AI 생성기(프롬프트 → 이 형식의 JSON: 결과는 `g.chars.add`로만 넣는다), 계정과 계정 공용 저장소(`useStore`에 꽂는다), 소유의 싱크(`morph.grant`·`take`), 거래와 수익 분배, 주간 한도, 요청 검사·신고·회수(회수는 `g.chars.remove`).

## 16. 웹 출시의 바탕: 설정 창, 탭 숨김, 로딩 예산, 오류 수집, 약관·데이터 권리, 튜토리얼, 인증·플랫폼 접점

공개 웹(포털·직접 서비스)에 내려면 어느 장르든 필요한 것들이다([genre-features.md](genre-features.md) 5.2절·6절). 모두 틀에 있고, **게임이 아무것도 적지 않으면 지금과 같다**. 등불지기에 새로 보이는 것은 편의 화면뿐이다: 메뉴의 '설정' 탭, 다른 사람의 이름표에 붙는 '자리 비움', 30분을 논 뒤 한 번 뜨는 손님 진행 보호 안내. 게임 내용·경제·서버의 줄 위 글자(황금 실행)는 같다.

### 플랫폼 접점 (`engine/client/platform/`)

브라우저에 기대는 일(저장소, 보임·숨김, 오류 받기, 파일 내려받기, 주소 열기, 클립보드, 전체 화면, 서비스 워커, 광고, 서버 주소)은 **접점 `Platform`을 거쳐** 부른다(설계: [platforms.md](platforms.md) 3.1). 기본 구현은 `web`(`platform/web.ts`: 지금 동작 그대로, 저장 키 이름도 같다), 시험은 `memory`(`platform/memory.ts`). 데스크톱(Electron/Tauri)·모바일(Capacitor)·포털 구현은 같은 모양으로 더하고, 게임의 진입점이 `startClient`보다 먼저 `setPlatform(구현)`을 부른다. 없을 수 있는 기능은 `platform().has('files.save')`처럼 먼저 묻는다(동기). 읽기 저장은 동기(`storage.get`)이고 앱은 시작 때 `storage.ready()`로 메모리에 채운다. 비동기 칸은 실패해도 던지지 않고 `false`·`null`을 돌려준다. **이번에 새로 쓰거나 고친 코드만 이 접점을 쓴다**: 나머지 옛 호출(언어 고르기, 차단 목록, 도감 링크 …)을 옮기는 것은 다음 작업이다.

| 칸 | 하는 일 | web |
|---|---|---|
| `id`, `has(기능)` | 플랫폼 이름, 기능이 있는가 (`storage.durable`, `files.save`, `link.external`, `display.fullscreen`, `offline.cache`, `ads` …) | |
| `storage` (`ready`·`get`·`set`·`remove`, `secret`) | 키-값 저장. 비밀 값(기기 토큰)은 `secret`(앱: Keychain/Keystore) | `localStorage` + try/catch |
| `lifecycle` (`visible`, `on('hide'·'show'·'pause'·'resume'·'quit')`) | 보임·숨김, 앱의 멈춤·재개 | `visibilitychange`, `pagehide` |
| `audio` (`onUnlock`, `onInterrupt`) | 소리를 깨워도 되는 때, 바깥 까닭의 소리 멈춤 | 첫 입력 |
| `display` (`fullscreen`, `orientation`, `safeArea`, `pixelRatioCap`, `pixelRatio`) | 전체 화면, 방향, 안전 영역, 그리기 배율의 상한(설정 창의 기본) | 상한 2 |
| `openUrl`, `share`, `copy`, `saveFile` | 주소 열기(약관), 공유, 클립보드, 파일로 저장(내 데이터) | `window.open`, `navigator.share`, `clipboard`, `<a download>` |
| `errors` (`listen`, `report`) | 처리되지 않은 오류 받기, 오류 묶음 보내기 | `error`·`unhandledrejection`, `fetch(keepalive)` |
| `offlineCache(주소)` | 재방문 캐시 | 서비스 워커 등록 |
| `auth` (`providers`, `proof`) | 플랫폼이 주는 증명(나중: Steam·Apple·포털). 지금은 `['guest']` | |
| `ads` (`gameplayStart`·`gameplayStop`·`adBreak`·`rewarded`), `invite(room)` | 포털 광고·게임 구간·초대 단추 | 아무것도 하지 않는다 |
| `server()`, `app` (`version`, `build`, `page`, `requireUpdate`) | 서버 주소, 빌드 표시, 오래된 화면일 때 | `VITE_SERVER_URL` → `server.json` → 같은 출처, 새로고침 |

틀이 접점 위에 얹은 것(`@engine/client`에서 읽는다):

- **광고 지점**: 틀은 광고 SDK를 부르지 않고 '띄워도 되는 자리'를 사건으로만 알린다. `onBreakPoint((where) => …)`: `'roundEnd'`(판 모듈의 결과), `'respawn'`(쓰러져 다시 일어남). 띄울지는 게임이 정해 `adBreak(where)`를 부른다. `rewarded(why)`는 끝까지 봤으면 `true`, 실패·없음·차단이면 `false`(보상을 주지 않는다). 그동안 틀이 소리를 멈추고(`onAd`) 게임 구간을 닫았다 다시 연다. 기본 구현은 곧바로 끝난다: 광고 차단기가 있어도 진행된다.
- **게임 구간**: `gameplayStart`는 들어와서 첫 입력 때(Poki 규칙), `gameplayStop`은 탭을 숨길 때와 광고 동안. 같은 사건을 잇달아 두 번 보내지 않는다.
- **인증 접점** `AuthProvider`(`platform/auth.ts`): 접속할 때 낼 증표. 지금은 손님뿐이다(`guestAuth()`: 비밀 저장의 `token` 칸 = 예전의 `localStorage.token`). 포털 토큰·자체 계정은 같은 모양으로 `setAuth(구현)`에 꽂는다. 서버 쪽 짝은 `ServerAuth`이고 `startServer({ auth })`로 꽂는다(주지 않으면 손님: 토큰의 해시가 저장 키, 기기 옮기기의 별칭을 거친다). 계정·로그인 자체는 만들지 않는다([accounts.md](accounts.md)).

```ts engine/server/net/auth.ts
export interface ServerAuth {
readonly kind: string;
…
keyOf(m: Record<string, unknown>): string | null | undefined;
}
```

### 설정 창

메뉴의 '설정' 탭(어느 게임에나 맨 뒤: `MenuTab.always`, `engine/client/hud/settings.ts`). 소리 켜고 끄기·효과음·배경음, 그래픽 품질(높음·보통·낮음 = 음영(해의 그림자), 해상도 상한 ×2·×1.5·×1, 그리는 거리 320·200·130m. 하나씩 고쳐도 된다), 화면 흔들림 끄기(처음은 기기의 '동작 줄이기'), 글자·창 크기(90~130%), 전체 화면(되는 곳만), 단축키 재설정(키보드 기기만: 기능의 키를 누르고 새 키. 이동·Enter·Esc는 못 바꾼다), 게임의 칸, 튜토리얼 다시 보기, 약관, 내 데이터. 값은 기기에 둔다(플랫폼 저장소의 `settings` 칸, 셈은 `engine/client/hud/settingscalc.ts`). **처음 값은 이 창이 생기기 전과 같다**(높음, 배율 1, 키 그대로). 소리는 예전 칸(`sound`, `soundMix`)을 그대로 쓰고 메뉴 머리의 단추와 같은 값이다.

게임의 칸은 `addSetting`으로 더한다(더할 때 저장된 값으로 `on`이 한 번 불린다). 단축키에 이름을 붙이려면 `onKey(키, 할 일, () => 이름)`.

```ts games/sample/client/tutorial.ts
// 이 게임의 설정 칸: 이름표 보이기
addSetting({ id: 'tags', label: () => t('setTags'), kind: 'toggle', value: true, on: (v) => document.body.classList.toggle('noTags', !v) });
```

칸의 종류는 `toggle`, `select`(`options`), `range`(`min`·`max`·`step`). 지금 값은 `settingValue(id)`.

### 탭 숨김·백그라운드

크롬은 숨긴 탭의 타이머를 1초에 한 번(5분 넘게 숨기면 1분에 한 번)으로 줄이고 `requestAnimationFrame`을 멈춘다. WebSocket은 그 제한의 면제가 아니지만, 서버의 프로토콜 ping에는 브라우저가 스스로 답하고 받은 메시지는 그대로 처리된다. 틀이 하는 일(`engine/client/lifecycle.ts`):

- 숨기면: 서버에 `{ t: 'vis', on: false }` → 다른 사람의 화면에서 그 이름표가 흐려지고 '자리 비움'이 붙는다(나중에 들어온 사람도 안다). 소리를 멈추고, 게임 구간을 닫고, 숨긴 동안에는 타격 연출을 쌓지 않는다.
- 돌아오면: 서버에 알리고, 남은 연출(불티·번쩍임·떠오르는 숫자)을 버리고 지금 상태부터 그린다(스냅샷은 숨긴 동안에도 적용되어 위치는 이미 최신이다). 게임은 `onReturn((ms) => …)`으로 할 일을 단다. 끊겼으면 보일 때 다시 접속한다(예전과 같다).
- 서버는 게임에 사건 `playerVisible(p, on)`을 낸다. 실시간 판에서 숨긴 사람의 처리(일정 시간 뒤 퇴장 같은 것)는 게임이 이 사건으로 건다. 화면에서 누가 자리 비움인지는 `isAfk(id)`.

### 자원 로딩 예산

`npm run build`(와 `npm run build:all`)이 끝나면 `scripts/budget.mjs`가 묶음별 크기를 보이고 기준을 넘으면 경고한다(빌드를 실패시키지는 않는다): 첫 묶음(index.html과 곧바로 읽는 코드, gzip 크기도), 자원(`client/public/`의 모델·소리), 나중(도감 같은 다른 페이지). 첫 다운로드 8MB(Poki 목표)·20MB(CrazyGames 모바일 홈) 기준은 `deploy.json`의 `"budget": { "firstMB": 8, "mobileMB": 20 }`로 바꾼다. 첫 장면에 필요 없는 파일은 `preloadLater`로 미룬다: 접속 화면에서 기다리지 않고 들어간 뒤 뒤에서 받아, 다 받으면 코드 모델·합성음 자리에 바꿔 끼운다.

```ts games/sample/client/tutorial.ts
// 배경음(모닥불 소리)은 흘려 받고, 줍는 소리는 첫 장면에 기다리지 않는다 (자원 로딩 예산)
preloadLater('./sounds/pickup.wav');
// 재방문 캐시 (빌드가 sw.js를 쓰게 deploy.json에 offlineCache: true)
enableOfflineCache();
```

**재방문 캐시(서비스 워커)는 기본 끔**이다. 켜려면 `deploy.json`에 `"offlineCache": true`(빌드가 `sw.js`를 쓴다)와 화면의 `enableOfflineCache()` 둘 다. 끔이 기본인 까닭: 서버 권위 게임이라 오프라인 플레이가 없고, 지금 빌드가 작아(등불지기 약 1.5MB) 얻는 것이 적은데, 잘못된 캐시는 '옛 화면이 남는' 고장을 부른다(화면(HTML)은 늘 서버에서 먼저 받고 이름에 해시가 든 빌드 파일만 캐시에서 주게 짰지만, 운영 중인 등불지기에 오래 시험하지 않고 넣지 않는다). 모델·소리가 큰 게임과 웹 푸시(서비스 워커가 바탕)를 쓸 때 켠다.

### 화면 오류 수집

외부 서비스 없이: 화면의 처리되지 않은 오류, Promise 거절, 그리기 장치(WebGL)를 잃은 것을 게임 서버의 `POST /client-error`로 보낸다(`engine/client/errors.ts` → `engine/server/net/web.ts`). 화면은 같은 오류를 처음 한 번 보내고 되풀이는 30초마다 수만, 한 페이지에서 40번까지 보낸다. 서버는 8KB를 넘는 본문을 받지 않고(413), 주소마다 10건 뒤로는 10초에 1건·서버 전체 초당 1건으로 막고(429), 주소의 호스트·쿼리, 긴 16진(토큰), 이메일, IP, 긴 숫자를 빼고, 브라우저는 이름·큰 버전·기기 종류로만 줄인다. 같은 오류(종류 + 숫자를 지운 문장 + 첫 스택 줄의 파일·함수: 빌드의 해시와 줄 번호는 빼고)는 한 줄로 센다(500줄까지). 게임이 잡은 오류는 `reportError(err, '무엇을 하다')`. 보는 법은 [infra.md](infra.md) '화면 오류와 내 데이터 삭제'. **기본 켬**이다(화면에 보이는 것이 없고, 보내는 곳은 게임 서버 자신이다).

### 약관·처리방침·동의와 내 데이터

내용 칸 `LEGAL: { terms, privacy, version }`(값은 주소나 게임의 문장 키). **적지 않으면 화면에 링크가 없다(지금과 같다).** 적으면 접속 화면 아래와 설정 창에 두 문서의 링크가 생기고, 들어온 뒤 그 버전에 동의하지 않은 저장 키에는 고지·동의 창이 뜬다(동의할 때까지 화면을 덮고 단축키를 막는다). 동의한 버전은 서버가 저장 키마다 적고(`consents` 표), 버전을 올리면 모두에게 다시 묻는다. 손님(저장 키 없음)은 기기에만 적는다.

```ts games/sample/shared/content/index.ts
export const LEGAL: LegalDef = { terms: 'legalTermsText', privacy: 'legalPrivacyText', version: '2026-11-27' };
```

내 데이터(설정 창, 어느 게임에나): **내려받기**는 저장 키의 것을 모두 JSON 파일로 준다(캐릭터 저장(접속 중이면 지금 값), 동의, 삭제 요청, 월드에 둔 몫(길드·거래소·맡아 둔 우편), 제재, 신고(내가 당한 신고의 내 말만, 남의 이름과 말은 빼고)). 30초에 한 번. **삭제**는 요청 → 유예(`PRIVACY.eraseDays`, 기본 7일. 그동안 설정에서 거둘 수 있다) → 실행(서버가 1분마다 살핀다) → 기록(`erasures` 표: 저장 키의 해시와 시각만)이다. 실행하면 접속을 끊고(닫힘 4010: 화면은 토큰을 지우고 첫 화면으로) 캐릭터 저장과 동의를 지운다. **다른 사람과 얽힌 데이터의 규칙**:

| 데이터 | 처리 | 까닭 |
|---|---|---|
| 캐릭터 저장, 동의 기록 | 지운다 (이름도 풀린다) | 그 사람만의 것 |
| 길드 구성원 | 명단에서 뺀다. 길드장이면 가장 많이 기부한 사람이 잇고, 혼자였으면 길드가 사라진다. 길드의 경험치(기부 누적)는 남는다 | 길드는 다른 구성원의 것 |
| 거래소에 올린 물건 | 내린다(물건도 없어진다). 이미 팔린 것은 산 사람의 것 | 주인이 사라진다 |
| 맡아 둔 우편 | 버린다. 내가 남에게 보낸 것(판매 대금 등)은 받은 사람의 것 | |
| 기기 옮기기 | 별칭과 살아 있는 코드를 지운다 | |
| 신고 기록 | 그 사람의 이름과 키를 지우고 대화 줄은 남긴다 | 제재 다툼의 근거. 보관 기간은 정할 것 |
| 차단·말 막기 | 저장 키의 해시로 남기되 이름을 지운다. 미뤄 둔 지급은 지운다 | 지우고 다시 만들어 제재를 피하지 못하게 |
| 관리자 감사 기록, 경제 장부 | 그대로 | 법적 감사 기록 / 사람 구분 없는 합계 |

게임이 월드 저장에 한 사람의 것을 두면 같은 규칙을 등록한다: `personalData(g).push({ name, get(pid), erase(pid) })`(`engine/server/game/personal.ts`).

### 튜토리얼 (선택)

`addTutorial`을 부른 게임에만 있다. 단계마다 안내 한 줄과 끝나는 조건(`cmd` 내가 보낸 명령, `msg` 서버 메시지·`'sys:안내문'`, `key` 단축키의 기능, `test` 0.25초마다의 물음. 조건이 없으면 '다음' 단추), 강조할 요소(`target`: id), 건너뛰기, 설정 창의 다시 보기가 있다. 진행은 기기에 둔다(`tut:<id>`). 단계마다 `onTutorial((ev, id, step, i) => …)`에 사건(`start`, `step`, `done`, `skip`)이 간다: 분석을 받는 곳이 생기면 거기에 잇는다.

```ts games/sample/client/tutorial.ts
addTutorial({
id: 'basics',
label: () => t('tutBasics'),
start: () => !!S.me && S.me.cls !== '',
steps: [
{ id: 'move', text: 'tutMove', until: { cmd: 'move' } },
{ id: 'attack', text: 'tutAttack', until: { cmd: 'attack' } },
{ id: 'menu', text: 'tutMenu', target: 'menuBtn', until: { key: 'm', test: () => !document.getElementById('menu')?.hidden } },
{ id: 'fire', text: 'tutFire', target: 'bonfire' },
],
});
```

### 손님 진행 보호

진행이 이 기기의 저장에만 묶여 있으면(`auth().deviceBound()`: 웹의 손님) 브라우저 데이터를 지우면 캐릭터를 잃는다는 것을 한 번 알리고 기기 옮기기 코드를 권한다(창의 단추가 메뉴의 '기기' 탭을 연다). **틀의 기본은 이 기기에서 30분을 논 뒤 한 번**(보이고 접속해 있던 시간)이다. 기본을 켬으로 둔 까닭: 사파리는 7일 오지 않은 사이트의 저장을 지울 수 있고, 손님만 있는 지금은 모든 게임에 해당하며, 게임 내용을 바꾸지 않는 안내 한 번이다. 게임은 시간을 바꾸거나 끄고(`setGuestReminder({ afterMin: 0 })`), 자기가 고른 순간(레벨 n, 첫 구매)에 `remindGuestSave()`를 부른다.

```ts games/sample/client/tutorial.ts
// 손님 진행 보호: 이 게임은 20분을 논 뒤에 알린다
setGuestReminder({ afterMin: 20 });
```

### 시험

`engine/test/fx/web.test.ts`: 오류의 개인정보 빼기·묶기·끝점의 제한, 자리 비움, 동의, 내보내기·삭제의 흐름과 얽힌 데이터, SQLite 스키마 2, 설정·튜토리얼·키 재설정의 셈, 플랫폼 접점(memory)·인증 접점. 화면은 실제 브라우저로 확인했다([framework-status.md](framework-status.md) '웹 출시의 바탕').
