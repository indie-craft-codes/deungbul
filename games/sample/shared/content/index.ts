// 이 게임(모닥불 사냥터)의 내용: 틀의 내용 계약(engine/shared/contract.ts)이 요구하는 이름들.
// 틀은 이 파일을 별칭 @game/shared/content로 읽는다. 틀에서는 타입만 가져온다 (값은 기본값 묶음 defaults에서만).
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { DailyDef } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import type { CharRules } from '@engine/shared/defs/chardef';
import type { LookRules } from '@engine/shared/defs/look';
import type { MorphRules } from '@engine/shared/defs/morph';
import type { LiveKeys, ResetRules } from '@engine/shared/defs/live';
import { BASIC_QUICK_CHAT, GEAR_BASE, liveRange } from '@engine/shared/defaults';
import type { LegalDef } from '@engine/shared/defs/legal';
import type { AgeRules } from '@engine/shared/defs/talk';
import { BONFIRE } from './bonfire';


// ---------- 쓸 모듈 (engine/shared/modules.ts) ----------
// 거래소·길드는 쓰지 않고(예전에는 메뉴에서 감추기만 했다) 던전이 없다. 캐릭터 정의(chars)와 변신(morph), 대화 채널(chat: 귓말·근처·파티)과 친구(friends)를 쓴다
import type { ModuleId } from '@engine/shared/modules';
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'build', 'items', 'gear', 'mail', 'daily', 'idle', 'party', 'rank', 'away', 'chars', 'morph', 'chat', 'friends'];
export const GUEST_NAME = 'Camper';

// ---------- 맵: 지역 하나 ----------
export const SHOPS: readonly { x: number; z: number }[] = [{ x: 3, z: 2 }];
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -22, z: 14, types: ['rabbit', 'rabbit', 'rabbit', 'rabbit'] },
  { x: 20, z: 18, types: ['boar', 'boar', 'boar'] },
  { x: -24, z: -22, types: ['rabbit', 'rabbit', 'boar'] },
  { x: 24, z: -24, types: ['bear', 'boar'] },
];
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

// ---------- 직업과 기술 ----------
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

// ---------- 몬스터 ----------
export const MONSTERS = {
  rabbit: { hp: 45, dmg: [2, 4], speed: 4.0, exp: 10, gold: [2, 4], aggro: 0, h: 1.4, behavior: 'flee' }, // 다치면 달아난다
  boar: { hp: 110, dmg: [6, 9], speed: 4.6, exp: 24, gold: [5, 9], aggro: 6, h: 1.8 },
  bear: { hp: 320, dmg: [10, 15], speed: 3.8, exp: 70, gold: [15, 24], aggro: 7, h: 2.8 },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템과 상점. 대장간과 제작은 없다 ----------
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

// ---------- 일일·주간·월간 임무. 'feed'는 이 게임의 규칙이 센다. period를 적지 않으면 날마다('day') ----------
export const DAILIES = {
  kill20: { kind: 'kill', n: 20, r: { gold: 40, exp: 100 } },
  feed5: { kind: 'feed', n: 5, r: { gold: 30 } },
  kill150: { kind: 'kill', n: 150, r: { gold: 250, exp: 600 }, period: 'week' },
  feed40: { kind: 'feed', n: 40, r: { gold: 400 }, period: 'month' },
} as const satisfies Record<string, DailyDef>;

// ---------- 던전은 없다 ----------
export const DUNGEONS = {} as const satisfies Record<string, DungeonDef>;

// ---------- 캐릭터 정의와 변신 (chars, morph 모듈) ----------
// 캐릭터 정의(engine/shared/defs/chardef.ts)는 바깥(나중에는 AI)이 만들고 서버가 검증한다. 이 예제의 정의는 server/chars.ts에 손으로 적었다.
// 영웅(roster)이 없는 게임이라 예산의 표를 직접 적는다: 등급마다 (공격 × 4 + 체력 × 0.5)의 합과 칸마다의 상한. 역할은 쓰지 않는다
export const CHAR_RULES: CharRules = {
  budget: [{ total: 160, cap: { atk: 20, hp: 220 } }, { total: 200, cap: { atk: 26, hp: 260 } }, { total: 240, cap: { atk: 32, hp: 320 } }],
  roles: [],
  skills: ['chop', 'aim', 'rest'],
  nameMax: 12, bioMax: 80,
  banned: ['운영자', 'admin'],
};
// 변신: 3분 동안, 풀리고 15초 뒤에 다시, 맞은 지 4초 안에는 못 한다. 보정은 작게: 공격에서 주는 피해, 체력에서 받는 피해 감소 (상한 8%, 6%)
export const MORPH_RULES: MorphRules = {
  durationS: 180, cooldownS: 15, noFightS: 4, maxOwn: 8,
  mods: (d) => ({ damage: (d.stats.atk ?? 0) / 300, guard: (d.stats.hp ?? 0) / 4000 }),
  cap: { damage: 0.08, guard: 0.06 },
};
// 겉모습의 부품: 모자에 '사슴뿔'을 더하고(화면의 client/scene.ts가 그리는 법을 등록한다), 등 장식의 '날개'는 뺀다
export const LOOK_RULES: LookRules = { add: { hat: ['antlers'] }, remove: { back: ['wings'] } };

// ---------- 운영: 초기화 시각, 원격 설정으로 바꿀 수 있는 칸, 게임의 기능 깃발 (engine/shared/defs/live.ts) ----------
// 초기화 시각: 서버 PC의 현지 자정, 주는 월요일에 (적지 않은 것과 같다. 한국 시각 새벽 5시로 하려면 { tz: 'Asia/Seoul', dayAt: 5, weekStart: 1 })
export const RESET: ResetRules = { tz: 'local', dayAt: 0, weekStart: 1 };
// 원격 설정(관리자 명령 set)으로 재시작 없이 바꿀 수 있는 칸. 여기 적지 않은 칸은 소스 그대로다. 값은 처음 값과 같은 모양이고 check를 지나야 반영된다
export const LIVE_KEYS: LiveKeys = {
  // 일일 사냥 임무의 마릿수: 화면의 임무 창도 같은 칸을 읽으므로 접속한 화면에도 보낸다
  'DAILIES.kill20.n': { client: true, check: liveRange(1, 500, true), note: '일일 사냥 임무의 마릿수' },
  // 변신의 재사용 대기(초): 서버만 읽는다
  'MORPH_RULES.cooldownS': { check: liveRange(0, 600, true), note: '변신의 재사용 대기(초)' },
  // 내용 계약에 없는 이 게임만의 값: 서버가 g.live.get('bonfireHeat')으로 읽는다 (server/bonfire.ts)
  bonfireHeat: { value: BONFIRE.heatPerLog, check: liveRange(1, 50, true), note: '장작 하나가 올리는 모닥불의 온기' },
};
// 이 게임의 기능 깃발: 관리자 명령 flag bonfire off로 장작 넣기를 막는다 (server/bonfire.ts의 g.live.gate)
export const FLAGS: readonly string[] = ['bonfire'];
// ---------- 약관·처리방침 (engine/shared/defs/legal.ts) ----------
// 적으면 접속 화면과 설정 창에 링크가 생기고, 처음 들어올 때(와 버전을 올렸을 때) 동의를 묻는다. 값은 주소나 이 게임의 문장 키다.
// 이 예제의 문서는 보기일 뿐이다: 실제로 내는 게임은 법률 검토를 거친 문서를 적는다
export const LEGAL: LegalDef = { terms: 'legalTermsText', privacy: 'legalPrivacyText', version: '2026-11-27' };

// ---------- 사회와 안전: 정해진 문장, 연령과 제한 모드 (engine/shared/defs/talk.ts) ----------
// 정해진 문장: 틀이 문장을 갖춘 여덟 (대화창의 '문장' 단추). 제한 모드의 사람은 이것만 쓴다
export const QUICK_CHAT: readonly string[] = [...BASIC_QUICK_CHAT];
// 연령: 처음 들어온 사람에게 태어난 해를 묻고, 만 14세 미만으로 보이면(생일을 모르니 한 살 적게 센다) 제한 모드 (자유 대화·귓말·친구 요청 받기가 꺼진다).
// 이 예제는 거래소가 없어 막을 명령이 없다 (거래소를 쓰는 게임은 restrict: ['market'])
export const AGE: AgeRules = { limit: 14, ask: 'year', restrict: [] };
