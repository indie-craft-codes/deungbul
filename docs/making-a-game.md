# 이 틀로 게임 만들기

이 저장소는 두 덩어리다: 다른 게임에서도 그대로 쓰는 **틀**(`engine/`)과 게임들(`games/`). 이 문서는 틀 위에 새 게임을 만드는 차례를 적는다. 따라가며 읽을 본보기는 작은 예제 게임 `games/sample`("모닥불 사냥터")이다. 약 580줄(시험 빼고)이고, 이 문서의 차례대로 빈 폴더에서 채운 것이다. 큰 본보기가 필요하면 `games/deungbul`(등불지기)을 본다.

- 문서의 코드는 예제에서 그대로 따온 것이다. 코드 울타리의 머리에 적힌 경로가 그 출처다. `npm run test:sample`이 문서의 조각과 예제가 같은지 검사한다.
- 조각 안의 `…`만 있는 줄은 건너뛴 자리다.
- 명령은 모두 **저장소 뿌리**에서 실행한다.

## 1. 틀이 주는 것

게임이 아무것도 더하지 않아도 되는 것들이다. 내용(직업, 몬스터, 아이템, 맵)만 채우면 돈다.

| 묶음 | 기능 |
|---|---|
| 접속 | 이름 없이 바로 접속, 브라우저에 간직한 값으로 캐릭터 이어받기, 끊기면 다시 접속, 이름 바꾸기, 서버 가득 참 안내 |
| 이동 | 땅 누르기·WASD·터치 조이스틱, 길찾기, 서버 판정과 화면 예측 |
| 전투 | 기본 공격, 직업마다 기술 셋(한 대상 피해 / 범위 피해와 느려짐 / 회복), 치명타, 자연 회복, 쓰러짐과 다시 일어남 |
| 몬스터 | 무리와 되살아남, 먼저 덤비기, 집으로 돌아가기, 필드 보스(선택) |
| 성장 | 레벨과 경험치, 능력치 찍기와 기술 강화, 직업 고르기와 바꾸기 |
| 물건 | 상점과 물약, 재료 떨어뜨리기, 대장간 제작(선택), 떨어지는 장비(등급, 옵션, 강화, 팔기), 가방 |
| 날마다 | 우편, 방치 보상, 출석, 일일 임무, 순위 |
| 함께 | 대화와 금칙어·차단·신고, 파티, 채널, 길드, 거래소, 던전 인스턴스(선택) |
| 자동 | 자동 사냥, 창을 닫아도 이어지는 자리 비움 사냥, 봇 |
| 화면 | 3D 장면과 카메라, 내 정보·대상·기술 단추, 미니맵, 알림 세 가지(가운데, 흘러가는 것, 대화창), 메뉴(장비·성장·우편·일일·거래소·길드·순위), 소리, PC와 폰(가로·세로) 배치, 여러 언어 |
| 운영 | 저장(SQLite 또는 메모리), 재시작 뒤 이어 가기, 서버 지표, 재화 흐름 장부 |

게임이 채우는 것은 세 가지다.

1. **내용**: 맵, 직업과 기술, 몬스터, 아이템. 틀이 요구하는 이름과 모양이 정해져 있다(내용 계약).
2. **겉모습과 문장**: 땅과 나무의 색, 건물, 몬스터 모델, 이름과 문장(언어마다).
3. **이 게임만의 규칙**(없어도 된다): 서버 시스템과 그 화면. 틀의 접점에 스스로 등록한다.

방향은 게임 → 틀 하나다. 게임은 틀을 `@engine/…`으로 읽고, 틀은 게임에서 내용 하나(`@game/shared/content`)만 읽는다. **`engine/` 아래의 파일은 고치지 않는다.** 고쳐야 한다면 틀에 접점이 모자란 것이다(10절의 "틀을 고쳐야 할 때").

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
  publicDir: false,
  // 개발 서버의 화면이 붙을 게임 서버의 포트: server/main.ts의 기본 포트와 같아야 한다 (PORT를 주면 서버와 함께 따라간다)
  define: { 'import.meta.env.VITE_DEV_PORT': JSON.stringify(process.env.PORT ?? '3002') },
  build: { outDir: resolve(repo, 'dist-sample'), emptyOutDir: true },
  // 틀의 코드가 뿌리(client/) 밖에 있으므로 저장소 뿌리까지 읽게 한다
  server: { host: true, port: 5174, fs: { allow: [repo] } },
});
```

- 아이콘과 manifest를 두려면 `client/public/`을 만들고 `publicDir: false` 줄을 지운다.
- 빌드 결과 폴더(`dist-sample/`)는 `.gitignore`에 넣는다.

`package.json`의 스크립트(게임 이름만 바꿔 같은 모양으로 더한다. 서버와 화면은 `scripts/game.mjs`를 거친다: 게임 폴더의 `tsconfig.json`이 있으면 `tsx --tsconfig`로 그것을 읽게 한다):

| 스크립트 | 하는 일 |
|---|---|
| `npm run typecheck:sample` | `tsc --noEmit -p games/sample/tsconfig.json`: 틀 + 이 게임 |
| `npm run typecheck:engine:sample` | `tsc --noEmit -p games/sample/tsconfig.engine.json`: 틀만, 이 게임의 내용으로 |
| `npm run build:sample` | `node scripts/game.mjs build sample`: `vite build -c games/sample/vite.config.ts` → `dist-sample/` |
| `npm run start:sample` | `node scripts/game.mjs start sample`: `tsx --tsconfig games/sample/tsconfig.json games/sample/server/main.ts` (기본 포트 3002) |
| `npm run dev:sample` | `watch`와 `client`를 함께: 서버(3002)와 vite 개발 서버(5174). 파일을 고치면 바로 반영 |
| `npm run test:sample` | `tsx --tsconfig games/sample/tsconfig.json games/sample/test/all.ts` |

`tsx`를 직접 부를 때는 반드시 `--tsconfig`를 준다(`scripts/game.mjs`는 스스로 준다). 주지 않으면 뿌리의 `tsconfig.json`을 읽어 `@game`이 등불지기를 가리키고, 서버가 **오류 없이 다른 게임의 내용으로 뜬다**. 예제는 플러그인 파일의 맨 위에서 이것을 잡는다.

```ts games/sample/server/sample.ts
// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가. tsx는 --tsconfig를 주지 않으면 뿌리의 tsconfig.json을 읽어 다른 게임의 내용으로 조용히 뜬다
if (MAP !== aliased) throw new Error('별칭 @game이 games/sample을 가리키지 않습니다. tsx --tsconfig games/sample/tsconfig.json 으로 실행하세요 (npm run start:sample)');
```

## 3. 내용 채우기

`shared/content/index.ts`가 내용 계약(`engine/shared/contract.ts`의 `ContentContract`)의 이름을 모두 내보내야 한다. 빠뜨리거나 모양이 다르면 `contract.ts`의 맨 아래 줄에서 컴파일 오류가 난다. 오류 글이 빠진 이름을 알려 준다.

이름은 61개지만 대부분은 수치라서 틀의 기본값(`engine/shared/defaults.ts`)을 한 줄로 받는다. 같은 이름을 직접 내보내면 그것이 기본값을 가린다.

```ts games/sample/shared/content/index.ts
// 수치의 기본값(전투, 장비, 강화, 길드, 거래소 …)은 틀의 것을 그대로 받는다. 바꿀 이름만 아래에 직접 적는다
export * from '@engine/shared/defaults';
export const GUEST_NAME = 'Camper';
```

**규칙 하나**: 내용 파일은 틀에서 **타입만** 가져온다(`import type`). 값을 가져와도 되는 곳은 `@engine/shared/defaults` 하나다. 틀의 도우미(`engine/shared/defs/*.ts`)는 게임의 내용을 읽으므로, 내용 파일이 그 도우미의 값을 읽으면 서로 물려 초기화 순서가 꼬인다(실행할 때 `undefined`로 드러난다).

직접 채워야 하는 이름(게임의 id가 드는 것):

| 이름 | 모양 | 비워도 되는가 |
|---|---|---|
| `MAP` | `MapDef`: 지역(`areas`), 가장자리, 시드, 처음 자리, 장애물, 나무·바위 뿌리는 규칙, `isFree`, 던전의 문 | `areas`는 하나 이상. 0번이 들판이다. `obstacles`, `scatter`, `portals`는 비워도 된다 |
| `CLASSES`, `DEFAULT_CLASS` | 직업 id → `ClassDef`. 직업마다 기술 id 셋 | 하나 이상 |
| `SKILL_DEFS` | 기술 id → `SkillDef` (효과: `hit` / `area` / `heal`) | 직업이 쓰는 것은 있어야 한다 |
| `MONSTERS` | 몬스터 id → `MonsterDef`. `sparks`(두 번째 재화)는 선택, `boss: true`면 필드 보스 | 하나 이상 (비우면 틀이 컴파일되지 않는다) |
| `CAMPS` | 무리의 자리와 사는 몬스터 | `[]` 가능 |
| `ITEMS`, `START_WEAPON` | 아이템 id → `ItemDef` (`weapon` / `armor` / `potion` / `mat`). 처음 무기 하나는 있어야 한다 | 물약, 재료는 없어도 된다. 갑옷은 하나 두는 편이 낫다(떨어지는 갑옷 칸 장비의 바탕이 된다) |
| `SHOPS`, `SHOP_STOCK` | 상인의 자리들, 상점에 놓는 아이템 id의 차례 | `[]` 가능 (상점 없음) |
| `DROPS` | 몬스터 id → 떨어뜨리는 재료와 확률 | `{}` 가능 |
| `FORGES`, `RECIPES` | 대장간의 자리, 제작법 | `[]` 가능 (제작 없음) |
| `GEAR` | 떨어지는 장비의 수치 + 장비 레벨에 따른 무기·갑옷의 바탕 | `GEAR_BASE`에 `weaponFor`, `armorFor`를 더한다 |
| `DAILIES` | 임무 id → `{ kind, n, r }`. 틀이 세는 종류는 `kill`, `enhance` | `{}` 가능 |
| `DUNGEONS` | 던전 id → `DungeonDef` | `{}` 가능 (던전 없음) |

기본값으로 받는 이름: `SKILL_SLOTS`, `HP_PER_LEVEL`, `ATTACK_CD`, `COMBAT`, `SLOW_FACTOR`, `REJOIN_KEEP_S`, `GUEST_NAME`, `MONSTER_ATTACK_RANGE`, `MONSTER_ATTACK_CD`, `LEASH`, `RESPAWN_S`, `MONSTER_AI`, `BOSS`, `SHOP_REACH`, `POTION_MAX`, `POTION_CD`, `MAT_MAX`, `SMITHY_REACH`, `STATS`, `GEAR_SLOTS`, `RARITIES`, `ENHANCE`, `BUILD_STATS`, `BUILD`, `LEVEL`, `POWER`, `MAIL_MAX`, `IDLE`, `ATTEND`, `RANK`, `PORTAL_REACH`, `PARTY`, `CHANNEL`, `GUILD`, `MARKET`, `ECON_*` 열 개.

- `STATS`, `GEAR_SLOTS`, `RARITIES`, `BUILD_STATS`의 id는 게임이 짓는다. 이름은 이름표(`ContentNames`)의 `gearSlots`, `rarities`, `buildStats`에 적는다.
  - 장비 옵션(`STATS`)과 능력치(`BUILD_STATS`)는 `mod`로 틀의 효과 넷 가운데 하나에 든다: `damage`(공격 피해 %), `guard`(받는 피해 감소 %, 한도 `GEAR.guardCap`), `crit`(치명타 %p), `hp`(최대 체력). 옵션과 능력치가 주는 것의 문장("공격 피해 +3%")은 이 효과로 틀이 만든다. 효과의 종류를 새로 만들려면 틀을 고쳐야 한다.
  - 예: `STATS = { atk: { base: 4, mod: 'damage' }, life: { base: 10, mod: 'hp' } }`, `BUILD_STATS = { grit: { mod: 'hp', per: 6 } }`(점수 하나에 최대 체력 +6).
  - 칸에는 `'weapon'`이 반드시 있다. 무기와 갑옷의 바탕 아이템은 `ItemDef.kind`와 같은 이름의 칸(`'weapon'`, `'armor'`)에 낀다. 갑옷 칸이 없는 게임도 된다(`games/sample/test/empty.test.ts`의 `otherGear`가 지킨다).
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

- 좌표는 x(동서)와 z(남북)뿐이다. 높이는 없다.
- 같은 시드는 서버와 화면에서 같은 나무와 바위를 만든다. 운영 중에 `seed`, `scatter`의 차례, `obstacles`의 차례를 바꾸면 맵 전체가 달라진다.
- 상인, 처음 자리, 무리의 자리는 `isFree`가 비워 주는 곳에 둔다(나무 속에 서지 않게).

직업, 기술, 몬스터, 아이템은 표다. `as const satisfies …`로 적으면 id가 타입이 되어, 다른 표나 언어 파일에서 id를 잘못 적으면 컴파일되지 않는다.

```ts games/sample/shared/content/index.ts
export const SKILL_DEFS = {
  chop: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [26, 34] } },
  sweep: { cd: 8, radius: 4, effect: { kind: 'area', at: 'self', dmg: [13, 19] } },
  aim: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [28, 38] } },
  snare: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [10, 15], slow: 3 } },
  rest: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  woodcutter: { hp: 200, range: 2.3, basic: [10, 15], skills: ['chop', 'sweep', 'rest'], hand: 'sword' },
  hunter: { hp: 170, range: 9, basic: [9, 13], skills: ['aim', 'snare', 'rest'], hand: 'bow', shot: 'arrow' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'woodcutter';
```

```ts games/sample/shared/content/index.ts
export const MONSTERS = {
  rabbit: { hp: 45, dmg: [2, 4], speed: 4.0, exp: 10, gold: [2, 4], aggro: 0, h: 1.4 },
  boar: { hp: 110, dmg: [6, 9], speed: 4.6, exp: 24, gold: [5, 9], aggro: 6, h: 1.8 },
  bear: { hp: 320, dmg: [10, 15], speed: 3.8, exp: 70, gold: [15, 24], aggro: 7, h: 2.8 },
} as const satisfies Record<string, MonsterDef>;
```

```ts games/sample/shared/content/index.ts
export const ITEMS = {
  axe1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  axe2: { kind: 'weapon', price: 60, damage: 1.25, tier: 2 },
  coat: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  stew: { kind: 'potion', price: 12, heal: 80 },
  // 장작: 멧돼지와 곰이 떨어뜨리는 재료. 모닥불에 넣는다 (server/bonfire.ts)
  log: { kind: 'mat', price: 0 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'axe1';
export const SHOP_STOCK: readonly ItemId[] = ['stew', 'axe2', 'coat'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  boar: { id: 'log', chance: 0.6 },
  bear: { id: 'log', chance: 1 },
};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'axe2' : 'axe1'), armorFor: (): ItemId => 'coat' };
```

- 무기는 한 줄기다. 직업마다 손에 든 모양(`hand`: `sword` / `bow` / `staff`)만 다르고, 이름은 언어 파일이 손 모양마다 따로 준다.
- `price: 0`은 상점에서 팔지 않는다는 뜻이다.
- 두 번째 재화(`sparks`)를 쓰지 않으면 몬스터에 `sparks`를 적지 않고, 이름표에 `currency2`를 적지 않는다. 틀의 문장에서 그 몫이 빠진다.
- 계약에 없는 내용(이 게임만의 수치)은 다른 파일에 둔다. 예제의 `games/sample/shared/content/bonfire.ts`가 그렇다. 틀은 읽지 않고 게임의 서버와 화면만 읽는다.

여기까지 하면 `npm run typecheck:engine:sample`이 통과해야 한다.

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

- **게임마다 포트와 저장 폴더를 따로 준다.** 서버는 저장 파일 옆의 `stop.flag` 파일을 보면 저장하고 꺼진다. 두 서버가 한 폴더를 쓰면 서로를 끈다.
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
  modules: [initBonfire, initScene],
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
    stew: { name: '고기 스튜' },
    log: { name: '장작', info: '멧돼지와 불곰이 떨어뜨립니다. 모닥불에 넣습니다' },
  },
```

틀의 뼈대가 쓰지만 틀에 기본 문장이 없거나 게임의 말이어야 하는 키는 게임이 채운다.

```ts games/sample/client/i18n/ko.ts
    // 틀의 뼈대가 쓰는 글 가운데 게임이 채우는 것: 제목, 직업 고르기 창의 소개와 안내, 조작 안내, 미니맵 범례
    title: '모닥불 사냥터',
    intro: '숲속 야영지의 사냥꾼이 됩니다. 짐승을 잡아 장작을 모으고, 모닥불을 지펴 함께 몸을 녹이세요.',
    classHint: '직업은 나중에 모닥불 곁에서 바꿀 수 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 스튜', 'F: 장작 넣기', 'R: 자동 사냥', 'H: 모닥불로', 'B: 가방', 'M: 메뉴', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 모닥불 · 초록 상인',
    // 틀의 기본 문장을 이 게임의 말로 덮어쓴 것
    goingTown: '모닥불로 걸어갑니다.',
```

- `[[PC용|터치용]]`으로 적으면 입력 장치에 맞는 쪽이 보인다. `'장작 넣기[[ (F)|]]'`는 폰에서 `(F)`가 빠진다.
- 틀의 문장에서 덮어쓸 만한 것: `ui.shop`(상인의 이름표), `ui.forge`, `ui.bagMats`, `ui.bagPotions`, `fmt.potions`(물약 단추), `msg.loot`(틀의 기본 문장은 "대장간에서 쓸 수 있습니다"로 끝난다), `msg.classFar`, `msg.bossUp`, `msg.died`. 전체는 `engine/client/i18n/ko.ts`에 있다.

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

`startClient`의 `look`으로 넘기는 것: 땅의 색, 잎의 색, 건물.

```ts games/sample/client/scene.ts
export const look: Look = {
  // 야영지 둘레는 흙바닥, 그 밖은 가을 풀빛
  ground: (x, z, j, c) => { if (Math.hypot(x - BONFIRE.x, z - BONFIRE.z) < 9) c.copy(dirt); else c.copy(grass[0]).lerp(grass[1], j); },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
```

모듈의 init에서 등록하는 것: 몬스터 모델, 무기와 갑옷의 모습, 분위기, 미니맵의 바탕.

```ts games/sample/client/scene.ts
export function initScene(): void {
  for (const type of Object.keys(BEASTS)) registerMonsterModel(type, beast);
  registerBlade('axe2', { color: 0xffd9a0, scale: 1.25, glow: false });
  registerArmor('coat', { color: 0x8a6a48, pads: false });
  // 분위기: 저녁 빛 (하늘과 안개의 색, 두 빛의 세기, 안개의 거리)
  view.setMood({ sky: 0xd9b48a, hemi: 1.9, sun: 2.1, fogNear: 52, fogFar: 115 });
  // 미니맵의 바탕: 지역은 풀빛, 야영지는 흙빛
  setMapPaint((b) => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, '#5d7040'); b.disc(BONFIRE.x, BONFIRE.z, 9, '#8a744e'); });
```

- 모델을 등록하지 않은 몬스터는 눈 달린 덩어리로 뜬다. 먼저 띄우고 나중에 꾸며도 된다.
- 모델의 약속: 발이 원점, +Z를 바라본다. `{ root, legs }`를 돌려주면 네발 걸음, `{ root, rig }`면 사람 걸음, `{ root, blob }`이면 통통 튀는 동작을 틀이 입힌다. 크기를 바꾸려면 안쪽 묶음에 준다(틀이 쓰러지는 연출에서 `root`의 크기를 바꾼다).
- 창의 색은 css 변수로 정한다. 게임의 css는 틀의 것 뒤에 읽혀 덮어쓴다(모듈에서 `import './sample.css'`).

```css games/sample/client/sample.css
:root {
  --sky: #d9b48a;
  --ink: #1d1712;
  --panel: rgba(29, 23, 18, .86);
  --line: rgba(255, 190, 120, .3);
  --gold: #ffb057;
}
```

## 6. 이 게임만의 규칙 하나 더하기

예제의 규칙: 멧돼지와 곰이 장작을 떨어뜨린다. 모닥불 곁에서 장작을 넣으면 서버 전체의 온기가 오른다. 온기가 있는 동안 곁에 선 사람은 회복이 빨라진다. 온기는 식는다.

서버에서 화면까지 한 줄기를 따라간다. 파일은 다섯이다.

### (1) 공용 선언: 안내문, 메시지, 공유 상태

틀이 가진 목록을 선언 병합으로 넓힌다. 타입뿐이고, 이 파일은 아무도 import하지 않는다(`tsconfig.json`의 `include`로 컴파일에 들어간다).

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

- `MsgMap`에 안내문을 더하면 **모든 언어 파일의 `msg`에 그 문장이 있어야** 컴파일된다. 언어 파일을 아직 만들지 않았으면 틀의 `engine/client/hud/notify.ts`에서 오류가 난다. 문장을 채우면 사라진다.
- 서버는 문장을 보내지 않는다. 종류와 값만 보낸다.

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

마크업은 틀의 빈 자리에 붙인다. 자리의 이름은 `engine/client/hud/shell.ts`의 `SLOTS`에 있다: `meHp`, `meGold`, `meRows`(내 정보 창), `rightTop`, `rightBottom`(오른쪽 위에 쌓이는 창), `topmid`(가운데 위), `actions`(단추 줄), `hud`(화면 전체).

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
- 틀이 이미 쓰는 키(숫자, Q, R, H, B, M, Tab, Enter, Esc)는 `onKey`로 등록해도 불리지 않는다.
- 좁은 화면에서 가까운 창 하나만 남기는 것은 css의 몫이다(`addPlace`는 어느 창이 가까운지만 적어 준다).

```css games/sample/client/sample.css
@media (max-width: 720px) {
  #rightcol[data-near="bonfire"] #shop, #rightcol[data-near="shop"] #bonfire { display: none; }
}
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
| 캐릭터에 딸린 값 | `EntExt`에 선언, `g.entInit.push`, `g.saves.push` | |
| 서버 전체의 값을 저장 | `g.worldSaves.push` + `g.saveDirty` | |
| 시간이 흐르면 | `g.ticks.push((dt) => …)` | `onFrame`, `onSlow` |
| 몬스터를 잡으면, 샀으면 … | `g.on('monsterKilled', …)` (사건의 목록: `engine/server/game/game.ts`의 `Hooks`) | |
| 틀의 수치를 바꾼다 | `g.mods.provide('damage' \| 'guard' \| 'regen' \| 'crit' \| 'hp' \| 'exp', …)` | |
| 틀의 규칙을 바꾼다 | `g.rules.respawn / speed / canChangeClass / unlocked` | `rules.speed / unlocked / lockNote / home` (속도와 잠금은 서버와 같은 답을 내야 한다) |
| 보상을 준다 | `g.players.grant(p, exp, 0)`, `p.gold += n`, `g.mail.send(p, 종류, 값, 보상)`, `g.daily.add(p, 종류, n)` | |

## 7. 저장과 호환

- 캐릭터 저장은 `PlayerSave`(틀의 칸) + `ext[이름]`(시스템마다 한 칸)이다. 게임의 칸은 `g.saves`에 등록한 이름으로 `ext`에 들어간다. 월드 저장은 `g.worldSaves`의 이름마다 한 칸이다.
- **읽을 때는 아무것도 믿지 않는다.** 저장된 값이 깨졌거나 옛 모양이어도 서버가 떠야 한다. 수는 `readInt(값, 최소, 최대, 기본값)`으로 읽는다. 한 칸이 예외를 던지면 틀은 그 칸만 처음 상태로 둔다.
- 칸의 **이름은 바꾸지 않는다.** 바꾸면 옛 저장의 값을 잃는다. 모양을 바꿀 때는 `load`가 옛 모양도 읽게 한다.
- 내용의 id도 저장에 들어간다(낀 무기, 소지품, 장비의 바탕, 직업). 운영 중에 id를 지우면 그 물건은 읽을 때 버려진다. id를 바꾸지 말고 이름(언어 파일)을 바꾼다.
- 아무것도 하지 않은 새 캐릭터는 저장하지 않는다. 틀은 자기 칸(직업, 레벨, 골드 등)만 보므로, 게임의 진행만 있는 캐릭터도 저장하려면 `g.rules.touched`를 채운다(예제: 장작을 넣은 적이 있다).
- 저장 주기, 접속이 끊길 때의 저장, 재시작은 틀이 한다. 게임은 `p.unsaved`와 `g.saveDirty`만 세운다.
- **프로토콜 번호**(`engine/shared/protocol.ts`의 `PROTOCOL`): 서버와 화면이 따로 올라갈 때, 화면이 옛 빌드면 새로고침을 권한다. 틀의 메시지의 모양이나 뜻을 바꾸면 올린다. 게임이 자기 메시지(`ClientMsgs`, `ServerMsgs`, `WorldState`, 개인 상태)의 모양을 바꿀 때도 같은 문제가 생긴다: 칸을 더하기만 하면 괜찮고, 뜻을 바꾸거나 빼면 화면과 서버를 함께 올리고 번호를 올린다.
- 진행을 지우려면 서버를 끄고 그 게임의 저장 폴더(`data/sample/`)를 지운다.

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

저장 왕복과 실제 접속은 서버를 띄워 본다. 포트 0은 빈 포트를 고른다.

```ts games/sample/test/sample.test.ts
  const store = new MemoryStore();
  let server = await startServer(0, { store, game: { plugins: [installSample] } });
```

- 틀의 가짜 클라이언트는 틀의 메시지만 읽는다. 게임의 메시지(`world`, `me`)는 `connect`의 넷째 인자로 받는다.
- 시험도 `tsx --tsconfig`로 돌린다(`npm run test:sample`).
- `npm test`는 틀의 시험과 등불지기의 시험이다. 틀의 시험은 아직 등불지기의 내용 위에서 돈다. 새 게임의 설정으로는 돌지 않는다.
- 틀을 고쳤으면 `npm run typecheck`(등불지기와 예제까지 넷을 검사한다), `npm test`, `npm run test:sample`을 모두 돌린다.

화면은 브라우저로 본다. `?lang=en`은 언어, `?auto=이름`은 처음 접속할 때의 이름이다.

## 9. 배포

- **한 곳에 올리기**: 서버가 빌드된 화면을 같은 포트로 내보낸다. Node가 도는 곳 하나면 된다. `npm run build:sample` 뒤 `npm run start:sample`(환경 변수 `PORT`, `DB`).
- **화면만 따로 올리기**(정적 호스팅): 화면은 접속할 때 옆의 `server.json`(`{ "url": "wss://…" }`)을 읽어 서버를 찾는다. 없으면 화면을 내보낸 곳이 곧 서버다. 빌드할 때 `VITE_SERVER_URL=wss://…`로 박아 넣을 수도 있다.
- **저장소의 배포 스크립트는 등불지기 기준이다.** 다른 게임에 쓰려면 고친다.

| 스크립트 | 등불지기에 박힌 것 | 바꿀 것 |
|---|---|---|
| `scripts/pilot.mjs` | `npm run build`, `dist/`, 포트 3001, 공개 저장소 `PAGES_REPO`의 기본값, 작업 폴더 `.pages/` | 빌드 명령과 결과 폴더(`dist-sample`), `PORT`, `PAGES_REPO`, 작업 폴더 |
| `scripts/publish.sh` | `dist/`, `.pages/` | 같은 두 곳 |
| `scripts/restart.sh` | 포트 3001, `data/stop.flag`, `npm start` | `PORT`, 그 게임의 저장 폴더의 `stop.flag`, 시작 명령 |

- 서버와 화면은 같은 순간에 바뀌지 않는다. 열려 있던 탭은 새로고침 전까지 옛 화면이다(7절의 프로토콜 번호).

## 10. 자주 걸리는 곳

| 증상 | 까닭과 고치는 법 |
|---|---|
| 서버가 다른 게임의 몬스터로 뜬다 | `tsx`에 `--tsconfig games/<게임>/tsconfig.json`을 주지 않았다. 그 게임의 스크립트로 띄운다(`npm run start:sample`) |
| 실행하자마자 `undefined`를 읽는다 (`Cannot read properties of undefined`), 내용의 표가 비어 보인다 | 내용 파일이 틀의 도우미에서 **값**을 가져왔다. `import type`으로 바꾼다. 값은 `@engine/shared/defaults`에서만 |
| `contract.ts`의 마지막 줄에서 오류 | 계약의 이름이 빠졌거나 모양이 다르다. 오류 글의 끝에 이름이 있다 |
| `engine/client/hud/notify.ts`에서 "MsgKey로 인덱스할 수 없다" | `MsgMap`에 안내문을 더했는데 언어 파일의 `msg`에 문장이 없다(또는 `LocaleExt` 선언을 아직 하지 않았다) |
| 틀의 타입이 게임의 칸(`g.bonfire`, `p.fed`, `m.s.bonfire`)을 모른다 | 선언 파일이 그 `tsconfig`의 `include` 안에 없다. 선언 병합은 인터페이스가 선언된 바로 그 파일(`@engine/shared/ext`, `@engine/server/game/ext`, `@engine/client/i18n/ext`)을 가리켜야 한다 |
| 두 게임의 타입이 섞인다, `@game`이 엉뚱한 곳을 가리킨다 | 한 `tsc` 프로그램에 두 게임을 넣었다. 게임마다 자기 `tsconfig.json`으로만 검사한다. 뿌리의 `tsconfig.json`에 새 게임 폴더를 더하지 않는다 |
| 화면의 글자가 비어 있다 | 그 키가 언어 묶음에 없다. `setLocales`를 `startClient`보다 늦게 불렀거나, 창을 `startClient` 뒤에 붙였다(그때는 `data-i18n`이 이미 채워진 뒤다) |
| `$('내창')`이 `null` | 모듈이 읽히는 때에 요소를 잡았다. init 안에서 잡는다 |
| `mountPanel: '…' 자리의 기준 요소가 화면에 없습니다` | 자리 이름이 틀렸다(`shell.ts`의 `SLOTS`) |
| 내 창이 다른 창 뒤에 그려진다, 처리기가 엉뚱한 차례로 불린다 | 등록한 차례가 불리는 차례다. `modules`의 차례를 바꾼다. 게임의 모듈은 틀의 덧붙는 모듈보다 먼저 init된다 |
| 걷다가 뒤로 당겨진다 | 화면의 `rules.speed`와 서버의 `g.rules.speed`가 다른 값을 낸다. 같은 공용 함수로 셈한다 |
| `g.daily`(또는 `g.mail`, `g.gear` …)가 플러그인 안에서 `undefined` | 그 시스템은 플러그인보다 뒤에 만들어진다. `g.ready.push(() => …)` 안에서 쓴다 |
| 값을 바꿨는데 화면에 오지 않는다 | 표시를 세우지 않았다: `p.dirty`(틀의 수치), `g.stateDirty`(공유 상태). 6절의 표 |
| 재시작하면 값이 처음으로 돌아간다 | `g.saves`나 `g.worldSaves`에 등록하지 않았거나, `p.unsaved` / `g.saveDirty`를 세우지 않았다 |
| 내가 띄운 서버가 저절로 꺼진다 | 다른 서버와 저장 폴더가 같다(`stop.flag`). 게임마다, 확인용 서버마다 폴더를 따로 준다 |
| 개발 서버(vite)의 화면이 다른 게임의 서버에 붙는다 | `vite.config.ts`의 `VITE_DEV_PORT`가 그 게임의 서버 포트와 다르다(없으면 3001) |
| 내 내용은 계약을 지키는데 `engine/` 안의 파일에서 타입 오류가 난다 | 틀은 내용을 계약의 타입이 아니라 **게임이 적은 그대로의 타입**으로 본다. 표를 비웠거나(`{}`의 id는 `never`가 된다) 함수를 계약보다 좁게 적은 자리에서 틀이 걸릴 수 있다. 시험이 지키는 경우: 던전·대장간·보스·두 번째 재화가 없다(예제), 상점·무리·재료·일일 임무가 없다, 아이템이 무기 하나뿐이다(`games/sample/test/empty.test.ts`). 그 밖의 경우(직업이 하나, 몬스터가 한 종류 …)에 걸리면 틀의 수리 대상이다: `npm run typecheck:engine:sample`과 같은 검사를 자기 게임의 설정으로 돌려 자리를 찾는다 |

**틀을 고쳐야 할 때**: 게임에서 할 수 없는 일이면 틀에 접점을 더한다. 틀의 파일이 게임의 폴더를 import하거나 게임의 id를 적으면 안 된다(`engine/test/framework.test.ts`가 검사한다). 고친 뒤에는 8절의 검사를 모두 돌린다. 틀에 남아 있는 등불지기의 흔적과 알려진 한계는 `docs/framework-status.md`에 있다.

알아 둘 한계:

- 두 번째 재화는 한 가지(`sparks`)뿐이다. 이름은 이름표의 `currency2`로 준다.
- 기술의 효과는 세 가지(`hit`, `area`, `heal`)다. 새 효과는 틀의 `engine/server/game/systems/combat.ts`를 고쳐야 한다.
- 사람 모델은 틀의 것 하나다. 꾸밈만 더할 수 있다(`setHumanoidDeco`). 손 모양은 `sword` / `bow` / `staff` 셋이다.
- 메뉴의 탭(장비, 성장, 우편, 일일, 거래소, 길드, 순위)은 내용과 무관하게 모두 보인다. 길드와 거래소는 내용 없이도 돈다.
- 장부(`npm run econ`)와 서버 지표의 한 줄 요약은 등불지기의 낱말을 쓴다.

## 11. 접점 일람표

"예제" 칸은 그 접점을 쓰는 예제의 파일이다(`games/sample/` 아래). 없는 것은 등불지기(`games/deungbul/`)에 쓰임이 있다.

### 공용 (`engine/shared/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `contract.ts`의 `ContentContract` | 게임의 내용이 갖춰야 하는 이름과 모양 | `shared/content/index.ts` |
| `defaults.ts` | 수치의 기본값 묶음. `GEAR_BASE` | `shared/content/index.ts` |
| `defs/*.ts`의 타입 | `MapDef`, `ClassDef`, `SkillDef`, `MonsterDef`, `ItemDef`, `ForgeDef`, `Recipe`, `DungeonDef`, `DailyDef`, `Reward` | `shared/content/index.ts` |
| `defs.ts`, `world.ts` | 틀의 내용 통로: 타입, 도우미(`maxHpFor`, `itemDef` …), 계약의 내용, 엔진 상수. 내용 파일 밖에서는 여기서 읽는다 | `client/scene.ts`, `test/sample.test.ts` |
| `ext.ts`의 `MsgMap` | 안내문의 종류와 값 | `shared/sample.ts` |
| `ext.ts`의 `ClientMsgs` / `ServerMsgs` | 화면 → 서버 / 서버 → 화면 메시지 | `shared/sample.ts` (`ServerMsgs`는 쓰지 않는다) |
| `ext.ts`의 `WorldState` | 공유 상태의 칸 | `shared/sample.ts` |
| `protocol.ts`의 `PROTOCOL` | 프로토콜 번호 | |

### 서버 (`engine/server/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `run.ts`의 `runServer` | 환경 변수, 저장소, 종료 처리까지 한 번에 | `server/main.ts` |
| `net/server.ts`의 `startServer` | 서버만 띄운다 (시험, 손수 다루는 진입점) | `test/sample.test.ts` |
| `GameOptions.plugins` | 규칙 플러그인 `(g) => void` | `server/sample.ts` |
| `game/ext.ts`의 `GameSystems` | `g.내시스템` | `server/sample.ts` |
| `game/ext.ts`의 `EntExt` + `g.entInit` | 엔티티 칸과 처음 값 | `server/sample.ts`, `server/bonfire.ts` |
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
| `game/entity.ts`의 `dist`, `readInt`, `clamp`, `ri` | 작은 도우미 | `server/bonfire.ts` |

### 화면 (`engine/client/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `main.ts`의 `startClient({ look, modules })` | 틀을 시작시킨다 | `client/main.ts` |
| `i18n`의 `setLocales`, `mergeLocale`, `koBase` / `enBase`, `LocaleExt`, `ContentNames` | 언어 묶음 | `client/i18n/index.ts`, `client/i18n/ko.ts` |
| `i18n`의 `t`, `L`, `onLangChange` | 문장 읽기, 언어가 바뀔 때 | `client/bonfire.ts` (`onLangChange`는 쓰지 않는다: 느린 주기가 다시 쓴다) |
| `hud/shell.ts`의 `mountPanel` | 게임의 창을 틀의 빈 자리에 | `client/bonfire.ts` |
| `app.ts`의 `$`, `view` | 요소 잡기, 3D 화면(`view.scene`, `view.setMood`) | `client/bonfire.ts`, `client/scene.ts` |
| `bus.ts`의 `onMsg`, `onFrame`, `onSlow`, `onKey` | 서버 메시지, 매 프레임, 0.25초마다, 단축키 | `client/bonfire.ts`, `client/scene.ts` |
| `net.ts`의 `send` | 서버로 명령 | `client/bonfire.ts` |
| `state.ts`의 `S` | 틀의 상태: 내 캐릭터(`S.me`), 주변, 파티 | `client/bonfire.ts` |
| `rules.ts`의 `rules` | 화면 쪽 규칙 | `client/bonfire.ts` (`home`) |
| `hud/notify.ts`의 `addNotices`, `banner`, `feed` | 안내문을 띄울 곳 | `client/bonfire.ts` |
| `hud/near.ts`의 `addPlace` | 가까이 가면 열리는 창 | `client/bonfire.ts` |
| `hud/minimap.ts`의 `addMarks`, `setMapPaint`, `MARK` | 미니맵의 표식과 바탕 | `client/bonfire.ts`, `client/scene.ts` |
| `hud/classes.ts`의 `openClasses` | 직업 고르기 창 열기 | `client/bonfire.ts` |
| `scene/view.ts`의 `Look` | 땅, 잎, 건물 | `client/scene.ts` |
| `scene/models.ts`의 `registerMonsterModel`, `registerBlade`, `registerArmor`, `mat`, `part`, `limb` | 모델 | `client/scene.ts` |
| `scene/models.ts`의 `setHumanoidDeco`, `makeHumanoid` | 사람 모델의 꾸밈, 사람형 NPC | |
| `entities.ts`의 `addNpc`, `setMerchantLook` | 화면에만 서 있는 사람, 상인이 바라볼 곳 | |
| `sound.ts`의 `addMsgSounds`, `sfx` | 안내문의 소리 | |
| `actions.ts`의 `goToTown`, `autoWalk` | 걸어가게 하기 | |
| `style.css`의 색 변수와 class | 창의 모양 | `client/sample.css` |

### 시험 (`engine/test/`)

| 접점 | 한 줄 설명 | 예제 |
|---|---|---|
| `harness.ts`의 `check`, `failures` | 검사 기록 | `test/sample.test.ts`, `test/all.ts` |
| `harness.ts`의 `connect`, `until`, `sleep` | 가짜 클라이언트, 기다리기 | `test/sample.test.ts` |
| `new Game({ plugins, now })` | 서버 없이 규칙만 | `test/sample.test.ts` |
