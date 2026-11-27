// 이 게임(메아리 계약)의 내용: 틀의 내용 계약(engine/shared/contract.ts)이 요구하는 이름들. 틀은 이 파일을 별칭 @game/shared/content로 읽는다.
// 한 서버·한 캐릭터 안의 '두 게임'을 화면의 '게임 바꾸기'(틀의 modes 모듈)로 오가는 예제다:
//   게임 A '계약의 탑'(모드 tower, 자리 stage): 메아리(영웅)를 뽑고(gacha: 공개 확률표·천장), 키우고(roster), 편성해(squad) 장·단계(stages)를 깬다. 편성의 메아리는 여기서만 싸운다
//   게임 B '울림골'(모드 vale, 자리 field): 들판의 사냥, 레벨·장비·물약·상점, 파티와 대화, 자동 사냥 (MMORPG). 동료는 따라다니지 않고, 가진 메아리는 변신으로만 쓴다
//   잇는 것: 메아리는 모두 캐릭터 정의(chars)다. 가진 영웅 = 변신 목록(MORPH_RULES.fromRoster), 탑에서 키운 카드의 능력치 = 변신한 동안의 능력치(MORPH_RULES.stats).
//   B의 사냥이 뽑기 재화(울림 조각)를 주고, A의 성장이 B의 변신을 세게 한다. 보고 있지 않은 쪽도 '자동'이면 돈다 (MODE_RULES.fieldStay·stageStay)
// 틀에서는 타입만 가져온다 (값은 기본값 묶음 defaults와 모듈의 목록 modules에서만).
import type { BannerDef, ChapterDef, GachaRules, HeroDef, HeroRoleDef, HeroRules, IdleCtx, SquadRules, StageDef, StageRules } from '@engine/shared/defs/collect';
import type { CharRules } from '@engine/shared/defs/chardef';
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { CurrencyDef } from '@engine/shared/defs/economy';
import type { DailyDef, Reward } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { LiveKeys, ResetRules } from '@engine/shared/defs/live';
import type { LookRules } from '@engine/shared/defs/look';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import type { MorphRules } from '@engine/shared/defs/morph';
import type { OddsRules } from '@engine/shared/defs/odds';
import type { ModeRules } from '@engine/shared/defs/modes';
import type { ChatRules } from '@engine/shared/defs/talk';
import { BASIC_QUICK_CHAT, CHAT_RULES as BASE_CHAT_RULES, GEAR_BASE, HERO_RULES as BASE_HERO_RULES, liveRange } from '@engine/shared/defaults';
import type { ModuleId } from '@engine/shared/modules';
import { ARENA, MODE, SPIRE, WELL, cardToMorph } from './pact';

// ---------- 쓸 모듈 ----------
// 들판(MMORPG)의 모듈(대화 채널·귓말·친구까지) + 수집형의 넷 + 캐릭터 정의와 변신 + 게임 안의 모드. 길드·거래소·던전·영웅 장비는 쓰지 않는다
export const MODULES: readonly ModuleId[] = [
  'economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'party', 'away', 'chat', 'friends',
  'roster', 'gacha', 'squad', 'stages',
  'chars', 'morph',
  // 확률과 재화의 투명성: 확률표 창·공개 페이지(odds.html)·추첨 기록 (docs/making-a-game.md 19절)
  'odds',
  'modes',
];

// ---------- 두 게임: 계약의 탑(A, 단계)과 울림골(B, 들판) ----------
// 처음 온 사람은 탑에서 시작한다(처음 메아리로 1-1을 깨며 뽑기 재화를 모은다). 바꾸기는 싸우는 중에도 바로 된다.
// 보고 있지 않은 쪽: 들판은 자동 사냥(R)을 켜 두었으면 몸이 남아 사냥하고(fieldStay), 탑은 싸우던 단계를 끝까지·자동 진행이 켜져 있으면 다음 단계로(stageStay)
export const MODE_RULES: ModeRules = {
  list: [
    { id: MODE.tower, name: 'modeTower', kind: 'stage', tabs: ['gacha', 'odds', 'heroes', 'squad', 'stages', 'daily', 'mail', 'friends'], hide: ['auto', 'attackNearest', 'worldMap', 'minimap', 'skills', 'hint', 'channel', 'bag'] },
    { id: MODE.vale, name: 'modeVale', kind: 'field', tabs: ['morph', 'gear', 'daily', 'mail', 'friends'] },
  ],
  start: MODE.tower,
  switchCdS: 1,
  fieldStay: true,
  stageStay: true,
};
/** 대화: 근처 채널은 '같은 게임에 있는 사람 모두'(탑은 사람마다 층이 달라 근처가 비므로). 전체·귓말·파티·친구는 두 게임이 하나다 */
export const CHAT_RULES: ChatRules = { ...BASE_CHAT_RULES, nearScope: 'mode' };
export const GUEST_NAME = 'Pactbinder';
/** 두 번째 재화(sparks)는 이 게임의 '울림 조각': 뽑기의 값이다. 들판의 사냥과 단계가 준다 (현금으로 살 길은 없다) */
/** 울림 조각을 한 번에 900개(10번 뽑기) 이상 쓰면 두 번 묻는다 (귀한 재화의 확인 단계). 실제 가격 칸은 비워 둔다: 현금으로 살 길이 없다 */
export const CURRENCIES: Readonly<Record<'gold' | 'sparks' | 'exp', CurrencyDef>> = { gold: { tradable: false }, sparks: { tradable: false, confirm: { at: 900, price: null } }, exp: { tradable: false } };

// ---------- 맵: 울림골 하나 (가운데 울림 샘, 네 귀퉁이에 무리, 북쪽이 단계의 자리) ----------
// 상인은 처음 자리(0, 2)와 일어나는 자리(샘 앞)에서 조금 떨어진 서쪽에: 들어오자마자 상점 창이 화면을 덮지 않게 (폰)
export const SHOPS: readonly { x: number; z: number }[] = [{ x: -10, z: 3 }];
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -24, z: 16, types: ['mossling', 'mossling', 'mossling', 'mossling'] },
  { x: 24, z: 18, types: ['mossling', 'thornboar', 'thornboar'] },
  { x: -26, z: -24, types: ['thornboar', 'thornboar', 'mossling'] },
  { x: 28, z: -26, types: ['stonehorn', 'thornboar'] },
];
export const MAP: MapDef = {
  // 0번이 들판(울림골), 1번이 계약의 탑(걸어서 갈 수 없는 따로 된 지역: 모드를 바꿔야 온다)
  areas: [{ id: 'vale', x0: -55, x1: 55, z0: -55, z1: 55 }, { id: 'spire', ...SPIRE }],
  edge: 2,
  seed: 23,
  spawn: { x: 0, z: 2 },
  obstacles: [{ x: WELL.x, z: WELL.z, r: WELL.r, tag: 'well' }],
  scatter: [
    { kind: 'tree', count: 80, x0: -64, x1: 64, pad: 12, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 18, x0: -50, x1: 50, pad: -3, s0: 0.6, s1: 0.9 },
  ],
  // 샘 둘레와 무리의 자리는 비워 둔다 (나무는 들판 안에만 뿌린다: 탑의 지역은 비어 있다)
  isFree: (x, z) => Math.hypot(x, z) > 14 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 8),
  portals: {},
  portalClear: 0,
};

// ---------- 계약자(플레이어)의 직업 둘과 기술, 메아리의 기술 ----------
export const SKILL_DEFS = {
  // 파수꾼 (검)
  cleave: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [24, 32] } },
  whirl: { cd: 8, radius: 4, effect: { kind: 'area', at: 'self', dmg: [12, 18] } },
  brace: { cd: 16, effect: { kind: 'buff', mod: 'guard', value: 0.3, dur: 6 }, color: 0x9ab8e0 },
  // 추적자 (활)
  pierce: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [26, 36] } },
  snare: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [10, 15], slow: 3 } },
  mend: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a },
  // 메아리의 기술 (캐릭터 정의가 고른다: CHAR_RULES.skills. 피해·회복은 메아리의 공격 ÷ 10 배)
  bash: { cd: 6, range: 3, effect: { kind: 'hit', dmg: [8, 12], stun: 1 } },
  volley: { cd: 7, range: 10, radius: 3, effect: { kind: 'area', at: 'target', dmg: [6, 10] } },
  flare: { cd: 6, range: 9, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [9, 14] }, color: 0xc08aff },
  chant: { cd: 9, radius: 9, effect: { kind: 'heal', amount: 18, allies: true }, color: 0x7fd68a },
  rally: { cd: 16, radius: 9, effect: { kind: 'buff', mod: 'damage', value: 0.25, dur: 6, allies: true }, color: 0xffd24a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  warden: { hp: 220, range: 2.3, basic: [11, 16], skills: ['cleave', 'whirl', 'brace'], hand: 'sword' },
  seeker: { hp: 180, range: 9, basic: [9, 13], skills: ['pierce', 'snare', 'mend'], hand: 'bow', shot: 'arrow' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'warden';

// ---------- 몬스터: 들판의 셋은 울림 조각(sparks)을 조금 떨어뜨린다. 단계의 것은 주지 않는다 (단계의 보상이 준다) ----------
export const MONSTERS = {
  mossling: { hp: 50, dmg: [2, 4], speed: 3.6, exp: 10, gold: [2, 4], sparks: [1, 2], aggro: 0, h: 1.2, behavior: 'flee' },
  thornboar: { hp: 120, dmg: [6, 9], speed: 4.4, exp: 24, gold: [5, 9], sparks: [2, 3], aggro: 6, h: 1.7 },
  stonehorn: { hp: 300, dmg: [10, 15], speed: 3.6, exp: 65, gold: [14, 22], sparks: [3, 5], aggro: 7, h: 2.6 },
  wisp: { hp: 60, dmg: [3, 5], speed: 3.0, exp: 8, gold: [2, 4], aggro: 0, h: 1.3 },
  hollowkin: { hp: 95, dmg: [5, 8], speed: 3.8, exp: 14, gold: [3, 6], aggro: 6, h: 1.7 },
  shadeshot: { hp: 75, dmg: [4, 7], speed: 3.6, exp: 14, gold: [3, 6], aggro: 9, h: 1.7, behavior: 'ranged', range: 8, shot: 'arrow' },
  bellgolem: { hp: 850, dmg: [11, 16], speed: 3.0, exp: 110, gold: [40, 60], aggro: 9, h: 3.4 },
  echowarden: { hp: 1500, dmg: [15, 22], speed: 2.8, exp: 200, gold: [80, 110], aggro: 9, h: 3.8 },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템과 상점: 무기 둘(손 모양마다 이름이 다르다), 갑옷 둘, 물약 하나 ----------
export const ITEMS = {
  blade1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  blade2: { kind: 'weapon', price: 90, damage: 1.25, tier: 2 },
  jerkin: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  chain: { kind: 'armor', price: 200, guard: 0.8, tier: 2 },
  tonic: { kind: 'potion', price: 12, heal: 80 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'blade1';
export const SHOP_STOCK: readonly ItemId[] = ['tonic', 'blade2', 'jerkin', 'chain'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'blade2' : 'blade1'), armorFor: (): ItemId => 'jerkin' };

// ---------- 일일·주간 임무와 출석: 들판·수집형·다리(변신)를 고루 하게 ----------
// kind: kill(틀이 센다), pull·stage·morph(이 게임이 센다: server/pact.ts)
export const DAILIES = {
  kill30: { kind: 'kill', n: 30, r: { gold: 60, sparks: 60 } },
  stage5: { kind: 'stage', n: 5, r: { gold: 40, sparks: 80 } },
  pull1: { kind: 'pull', n: 1, r: { sparks: 30 } },
  morph1: { kind: 'morph', n: 1, r: { exp: 120, sparks: 40 } },
  kill2000: { kind: 'kill', n: 2000, r: { gold: 400, sparks: 500 }, period: 'week' },
  stage150: { kind: 'stage', n: 150, r: { gold: 300, sparks: 500 }, period: 'week' },
} as const satisfies Record<string, DailyDef>;
export const ATTEND: readonly Reward[] = [{ gold: 50 }, { sparks: 50 }, { gold: 80 }, { sparks: 80 }, { gold: 120 }, { sparks: 120 }, { sparks: 300 }];
export const DUNGEONS = {} as const satisfies Record<string, DungeonDef>;

// ---------- 방치 보상: 깬 단계의 수로 커진다. 돌아왔을 때의 창 ----------
export const IDLE = {
  minMin: 10, maxMin: 480,
  popup: true,
  reward: (minutes: number, lv: number, ctx: IdleCtx): Reward => ({ gold: Math.round(minutes * (2 + ctx.stage * 2)), exp: Math.round(minutes * (2 + lv + ctx.stage)), sparks: Math.floor((minutes * ctx.stage) / 20) }),
};

// ---------- 메아리(영웅): 내용의 영웅은 없다. 메아리는 모두 캐릭터 정의(server/echoes.ts)이고 chars 모듈이 영웅의 표에 더한다 ----------
/** 역할 넷: 선봉(검, 붙어서), 사수(활), 비술사(지팡이, 범위), 치유사(지팡이). 기술은 정의가 고른다 (역할의 skill은 정의에 기술이 없을 때) */
export const HERO_ROLES: Readonly<Record<string, HeroRoleDef>> = {
  vanguard: { name: 'roleVanguard', hand: 'sword', range: 2.2, atkCd: 1.2, speed: 4.6, skill: 'bash', cloth: 0x5b7fb0 },
  ranger: { name: 'roleRanger', hand: 'bow', shot: 'arrow', range: 9, atkCd: 1.4, speed: 4.6, skill: 'volley', cloth: 0x4f9a5a },
  mystic: { name: 'roleMystic', hand: 'staff', shot: 'bolt', range: 8, atkCd: 1.6, speed: 4.4, skill: 'flare', cloth: 0x7a4ab0 },
  mender: { name: 'roleMender', hand: 'staff', shot: 'bolt', range: 7, atkCd: 1.6, speed: 4.4, skill: 'chant', cloth: 0xe8e0c8 },
};
export const HEROES: Readonly<Record<string, HeroDef>> = {};
/** 키우기: 틀의 기본(별 6, 레벨 상한 10 + 별 × 10, 레벨 값 레벨 × 20 × (등급 + 1) 골드, 별 값 별 × 10 조각) */
export const HERO_RULES: HeroRules = { ...BASE_HERO_RULES };

// ---------- 캐릭터 정의의 규칙: 등급마다 (공격 × 4 + 체력 × 0.5)의 예산. 내용의 영웅이 없으므로 직접 적는다 ----------
export const CHAR_RULES: CharRules = {
  budget: [
    { total: 170, cap: { atk: 22, hp: 260 } },
    { total: 220, cap: { atk: 30, hp: 320 } },
    { total: 290, cap: { atk: 40, hp: 400 } },
  ],
  roles: ['vanguard', 'ranger', 'mystic', 'mender'],
  skills: ['bash', 'volley', 'flare', 'chant', 'rally'],
  nameMax: 20, bioMax: 120,
  banned: ['운영자', 'admin'],
};
/**
 * 변신: 가진 메아리(영웅) = 변신 목록(fromRoster: 따로 저장하지 않는다). 변신한 동안의 기본 체력·공격 = 그 메아리 카드의 능력치에서 셈한 값(stats: 틀의 능력치 대체 방식,
 * 셈은 shared/content/pact.ts의 cardToMorph). 탑에서 카드를 키우면 들판의 변신이 그만큼 바로 세진다. 장비(무기·갑옷)의 덤은 그 위에 그대로.
 * 스스로 풀 때까지 이어지고, 풀리고 10초 뒤에 다시. 싸우는 중에도 할 수 있다(체력의 비율을 지키므로 회복이 되지 않는다: 처음 20분 해 보기에서 자동 사냥 중에 변신이 막히던 것)
 */
export const MORPH_RULES: MorphRules = {
  durationS: 0, cooldownS: 10, noFightS: 0, maxOwn: 60,
  fromRoster: true,
  stats: cardToMorph,
};
/** 겉모습의 부품: 모자에 '울림 고리'(머리 위에 뜬 고리)를 더한다. 그리는 법은 client/scene.ts */
export const LOOK_RULES: LookRules = { add: { hat: ['halo'] } };

// ---------- 뽑기: 울림 샘 (상시) ----------
/**
 * 울림 조각 100 / 10번 900. 일반 76% · 희귀 20% · 전설 4%. 전설이 40번째까지 나오지 않으면 40번째는 전설(천장), 10번 뽑기의 열째는 희귀 이상.
 * 판의 영웅 id는 캐릭터 정의의 id다: 정의가 더해지기 전(서버가 켜지는 중)에는 판이 비어 있고, 더해지면 곧바로 판에 든다 (poolOdds가 isHeroId로 거른다)
 */
export const BANNERS: Readonly<Record<string, BannerDef>> = {
  well: {
    name: 'bannerWell', cur: 'sparks', one: 100, ten: 900,
    pool: [
      { hero: 'brindle', w: 190 }, { hero: 'pell', w: 190 }, { hero: 'tamsin', w: 190 }, { hero: 'oddo', w: 190 },
      { hero: 'sorrel', w: 50 }, { hero: 'wren', w: 50 }, { hero: 'ilsa', w: 50 }, { hero: 'murk', w: 50 },
      { hero: 'aurelle', w: 20 }, { hero: 'grimbell', w: 20 },
    ],
    pity: { after: 40, rarity: 2 },
    tenAtLeast: 1,
  },
};
export const GACHA_RULES: GachaRules = { history: 50 };
/** 넷이 함께 싸운다. 탑(단계) 안에서만 나타난다: 들판에서는 따라다니지 않는다 (where: 'stage') */
export const SQUAD_RULES: SquadRules = { size: 4, seek: 12, leash: 20, reviveS: 8, regen: 0.05, autoFill: true, where: 'stage' };

// ---------- 장과 단계: 장 셋 × 다섯. 다섯째는 우두머리. 단계마다 몬스터가 45%씩 세진다 (메아리를 뽑고 키워야 나아간다) ----------
const stage = (ch: number, n: number): StageDef => {
  const k = ch * 5 + n; // 0부터
  // 편성만 싸운다(squadOnly): 처음 두 단계는 몬스터를 조금 약하게(0.8배), 그 뒤로 단계마다 40%씩
  const scale = Math.round((k < 2 ? 0.8 : 1 + (k - 1) * 0.4) * 100) / 100;
  const mob: MonsterId = ch === 0 ? (n < 2 ? 'wisp' : 'hollowkin') : ch === 1 ? (n < 2 ? 'hollowkin' : 'shadeshot') : 'shadeshot';
  // 처음 두 단계는 몬스터 수도 적게 (처음 메아리 하나로 깬다)
  const waves = k < 2 ? [[{ type: mob, n: 3 }], [{ type: mob, n: 2 }, { type: 'wisp' as MonsterId, n: 1 }]] : [[{ type: mob, n: 4 + (n % 2) }], [{ type: mob, n: 3 }, { type: ch === 0 ? 'wisp' : 'hollowkin', n: 2 }]];
  return {
    waves,
    ...(n === 4 ? { boss: { type: ch === 0 ? 'bellgolem' : 'echowarden' } } : {}),
    scale,
    reward: { gold: 30 + k * 10, exp: 25 + k * 12, sparks: 8 + k * 2 },
    // 처음 깬 보상: 우두머리 150, 1-1은 60(1-1·1-2를 깨면 첫 뽑기 100이 모인다: 처음 메아리 하나로는 1-3에서 막히기 쉽다), 나머지 40
    first: { sparks: n === 4 ? 150 : k === 0 ? 60 : 40 },
    rec: Math.round(300 * scale * (n === 4 ? 1.5 : 1)),
  };
};
export const CHAPTERS: readonly ChapterDef[] = [
  { name: 'chapterPath', stages: [0, 1, 2, 3, 4].map((n) => stage(0, n)) },
  { name: 'chapterRuins', stages: [0, 1, 2, 3, 4].map((n) => stage(1, n)) },
  { name: 'chapterSpire', stages: [0, 1, 2, 3, 4].map((n) => stage(2, n)) },
];
/**
 * 단계는 계약의 탑(따로 된 지역, 사람마다의 층)에서. 탑에 오면 대기실(단계 선택)에 서고, 단계를 고르면 싸운다 (모드가 맡는다: enterOnJoin은 끈다).
 * 오프라인 진행: 자동 진행을 켜 둔 채 접속을 끊으면 돌아왔을 때 편성의 전투력으로 '그동안 깼을 단계'를 넘긴다 (단계마다 3분, 8시간·5단계까지, 권장 전투력 이상만)
 */
export const STAGE_RULES: StageRules = {
  arena: ARENA, radius: 9, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: false, squadOnly: true,
  offline: { perStageS: 180, maxH: 8, maxStages: 5, need: 1, clearReward: true },
};

// ---------- 사회: 정해진 문장(틀의 여덟. 받는 사람이 자기 언어로 읽는다). 연령은 묻지 않는다 ----------
export const QUICK_CHAT: readonly string[] = [...BASIC_QUICK_CHAT];

// ---------- 운영: 초기화 시각, 원격 설정으로 바꿀 수 있는 칸 ----------
export const RESET: ResetRules = { tz: 'local', dayAt: 0, weekStart: 1 };
export const LIVE_KEYS: LiveKeys = {
  'DAILIES.kill30.n': { client: true, check: liveRange(1, 500, true), note: '일일 사냥 임무의 마릿수' },
  'MORPH_RULES.durationS': { check: liveRange(0, 3600, true), note: '변신이 이어지는 시간(초)' },
  'MORPH_RULES.cooldownS': { check: liveRange(0, 600, true), note: '변신의 재사용 대기(초)' },
  // 확률표를 바꾸는 칸: 바꾸면 표의 버전이 오르고 공개 페이지의 변경 이력에 남는다 (odds 모듈)
  'BANNERS.well.pity.after': { check: liveRange(10, 200, true), note: '울림 샘의 천장(번째)' },
};

// ---------- 확률 공개 (odds 모듈): 자동 표(울림 샘, 장비 강화)만 쓴다. 공개 페이지(서버가 쓴다)의 이름표 ----------
export const ODDS: OddsRules = {
  tables: [],
  keepDays: 1825,
  names: {
    bannerWell: { ko: '울림 샘', en: 'Echo Well' },
    'cur:sparks': { ko: '울림 조각', en: 'Echo Shards' },
    'cur:gold': { ko: '골드', en: 'Gold' },
  },
};
