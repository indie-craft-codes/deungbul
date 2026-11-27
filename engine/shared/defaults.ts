// 수치의 기본값 묶음: 내용 계약(contract.ts)의 이름 가운데 핵심 계약(MAP, MODULES) 말고 모두.
// 틀은 게임의 내용(@game/shared/content)에 없는 이름을 여기서 채운다 (engine/shared/content.ts): 게임은 바꿀 이름만 같은 이름으로 내보내면 되고,
// 이 파일을 `export *`로 받을 필요가 없다. 쓰지 않는 모듈의 이름은 적지 않는다 (몬스터·직업·아이템이 없는 게임은 그 표를 적지 않는다).
// 표(CLASSES, MONSTERS, ITEMS …)의 기본값은 빈 표다. 게임의 id가 드는 이름(START_WEAPON, GEAR의 weaponFor·armorFor)은 '없음'이다.
//
// 이 파일은 값을 아무 데서도 가져오지 않는다 (타입만): 게임의 내용 파일이 틀에서 값을 읽어도 되는 곳은 여기 하나다 (GEAR_BASE 같은 것).
// 틀의 도우미(defs/*.ts)는 게임의 내용을 읽으므로, 내용 파일이 그 도우미의 값을 읽으면 초기화 순서가 꼬인다.
// 수치는 등불지기에서 쓰던 잠정값이다. 등불지기는 이 파일에 기대지 않고 자기 값을 모두 적는다.
import type { ClassDef, SkillDef } from './defs/combat';
import type { ForgeDef, Recipe } from './defs/craft';
import type { HudRules } from './defs/hud';
import type { DungeonDef } from './defs/dungeons';
import type { CurrencyDef } from './defs/economy';
import type { DailyDef, Reward } from './defs/growth';
import type { ItemDef } from './defs/items';
import type { MonsterDef } from './defs/monsters';
import type { TeamDef, TeamRules } from './defs/teams';
import type { BannerDef, ChapterDef, GachaRules, HeroDef, HeroRarityDef, HeroRoleDef, HeroRules, SquadRules, StageRules } from './defs/collect';
import type { LookRules } from './defs/look';
import type { CharRules } from './defs/chardef';
import type { MorphRules } from './defs/morph';
import type { LiveKeys, ResetRules } from './defs/live';
import type { LegalDef, PrivacyRules } from './defs/legal';
import type { AgeRules, ChatRules, FriendRules } from './defs/talk';
import type { OddsRules } from './defs/odds';
import type { ModeRules } from './defs/modes';
import type { StaminaRules } from './defs/stamina';
import type { AchieveDef, CodexDef, ComebackRules, CouponRules, EventDef, GoodsDef, MailRules, SeasonRules } from './defs/livecontent';

// ---------- 핵심 ----------
/** 이름을 정하지 못한 접속자에게 붙이는 이름의 머리말 */
export const GUEST_NAME = 'Guest';
/**
 * 서버의 주기와 시야. tickMs: 시뮬레이션 한 틱(ms, 20Hz), snapEvery: 몇 틱마다 화면에 상태를 보내는가(10Hz),
 * aoi: 이 반경(m) 안의 엔티티만 보낸다, aoiLeave: 시야에서 빠지는 반경(경계에서 깜빡이지 않게 aoi보다 조금 넓게)
 */
export const NET = { tickMs: 50, snapEvery: 2, aoi: 32, aoiLeave: 36 };
/** 들판의 채널: 수, 붐빔(soft)과 가득(hard)의 인원, 옮기는 간격, 조용해질 때까지, 알림 간격 */
export const CHANNEL = { count: 3, soft: 30, hard: 50, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };
/** 이만큼(초) 안에 다시 들어오면 나갈 때의 몸 상태(체력, 쿨다운)로 시작한다 */
export const REJOIN_KEEP_S = 300;
/**
 * 화면의 카메라 (화면만 읽는다). 각도는 고정이고 비추는 곳에서 dist × zoom(m) 떨어진다.
 * zoom: 처음 배율, zoomMin·zoomMax: 휠·두 손가락이 바꿀 수 있는 범위(작을수록 가깝다), gate: 접속 전에 처음 자리를 둘러볼 때의 배율.
 * 비추는 곳(내 캐릭터 대신 공이나 경기장 전체)은 화면에서 setCameraAim으로 정한다 (engine/client/camera.ts)
 */
export const CAMERA = { dist: 46, zoom: 1, zoomMin: 0.6, zoomMax: 1.15, gate: 1.05 };
/** 핵심의 '집으로'(H 키, goToTown): false면 틀이 H를 달지 않고 조작 안내에도 없다 (게임이 onKey('h')로 쓸 수 있다). 가는 곳은 화면의 rules.home */
export const HOME_KEY: boolean = true;
/** 화면의 틀 요소 끄기 (engine/shared/defs/hud.ts): 기본은 아무것도 감추지 않는다 */
export const HUD: HudRules = {};

// ---------- 직업과 전투 (classes, combat) ----------
export const CLASSES: Readonly<Record<string, ClassDef>> = {};
/** 직업을 아직 고르지 않은 캐릭터가 쓰는 직업. 직업이 없는 게임은 빈 문자열 */
export const DEFAULT_CLASS: string = '';
export const SKILL_DEFS: Readonly<Record<string, SkillDef>> = {};
/** 직업마다 기술 칸의 수. 화면의 기술 단추와 단축키(1~3)가 셋에 맞춰져 있다 */
export const SKILL_SLOTS = 3;
export const HP_PER_LEVEL = 15;
export const ATTACK_CD = 1.0;
export const COMBAT = { critChance: 0.15, critMult: 1.8, regenAfterS: 5, regenPerS: 4 };
export const SLOW_FACTOR = 0.5;

// ---------- 몬스터 (combat) ----------
export const MONSTERS: Readonly<Record<string, MonsterDef>> = {};
/** 들판의 무리: 그 자리 둘레에 types의 몬스터가 산다 */
export const CAMPS: readonly { x: number; z: number; types: readonly string[] }[] = [];
export const MONSTER_ATTACK_RANGE = 1.9;
export const MONSTER_ATTACK_CD = 1.6;
export const LEASH = 18;
export const RESPAWN_S = 8;
export const MONSTER_AI = { loseRange: 26, homeSpeed: 1.5, wanderSpeed: 1.3 };
/** 필드 보스의 규칙. 보스(MonsterDef.boss)가 없는 게임에서는 읽히지 않는다 */
export const BOSS = { hpPerPlayer: 0.6, maxScale: 10, countRange: 36, countS: 20, slamEveryS: 8, slamWarnS: 1.2, slamRadius: 5, slamDmg: [28, 38] as readonly [number, number] };

// ---------- 아이템, 상점과 제작 (items) ----------
export const ITEMS: Readonly<Record<string, ItemDef>> = {};
/** 처음 드는 무기 (ITEMS의 id). 없으면 빈 문자열 */
export const START_WEAPON: string = '';
export const SHOPS: readonly { x: number; z: number }[] = [];
export const SHOP_STOCK: readonly string[] = [];
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const DROPS: Readonly<Partial<Record<string, { id: string; chance: number }>>> = {};
export const SHOP_REACH = 5;
export const POTION_MAX = 10;
export const POTION_CD = 8;
export const MAT_MAX = 99;
export const SMITHY_REACH = 4;

// ---------- 장비와 성장 (gear, growth, build, mail, daily, idle, rank) ----------
// 아래 넷(STATS, GEAR_SLOTS, RARITIES, BUILD_STATS)의 id는 게임이 짓는다: 이름은 게임의 이름표(ContentNames의 gearSlots, rarities, stats, buildStats)에 적는다.
// 옵션과 능력치는 mod로 틀의 효과(공격 피해, 받는 피해 감소, 치명타, 최대 체력) 가운데 하나에 든다. 'weapon' 칸은 반드시 있어야 한다.
export const STATS = { dmg: { base: 3, mod: 'damage' }, guard: { base: 2, mod: 'guard' }, crit: { base: 2, mod: 'crit' }, hp: { base: 12, mod: 'hp' } } as const;
export const GEAR_SLOTS = ['weapon', 'armor', 'ring', 'amulet', 'charm'] as const;
export const RARITIES = [
  { id: 'common', weight: 70, opts: 1, mult: 1 },
  { id: 'uncommon', weight: 22, opts: 2, mult: 1.3 },
  { id: 'rare', weight: 7, opts: 3, mult: 1.7 },
  { id: 'epic', weight: 1, opts: 4, mult: 2.2 },
] as const;
export const BUILD_STATS = { pow: { mod: 'damage', per: 1 }, vit: { mod: 'hp', per: 8 }, luck: { mod: 'crit', per: 0.4 } } as const;
/**
 * GEAR에서 게임의 아이템 id가 들지 않는 부분. 게임은 떨어지는 무기와 갑옷의 바탕을 더해 GEAR를 만든다:
 *   export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => …, armorFor: (lv: number): ItemId => … };
 */
export const GEAR_BASE = {
  dropChance: 0.06, bagMax: 30, guardCap: 60, optMin: 0.8, optSpan: 0.4, optPerLevel: 0.15, sellBase: 5, sellPerTier: 10,
  levelOf: (monsterExp: number): number => Math.max(1, Math.min(6, 1 + Math.floor(monsterExp / 15))),
};
/** 떨어지는 무기와 갑옷의 바탕이 없는 GEAR (장비 모듈을 쓰는 게임은 GEAR_BASE에 자기 weaponFor·armorFor를 더해 내보낸다) */
export const GEAR = { ...GEAR_BASE, weaponFor: (_lv: number): string => '', armorFor: (_lv: number): string => '' };
export const ENHANCE = {
  max: 10, supplyMax: 5, perPlus: 0.1,
  rate: (plus: number): number => Math.max(0.2, 1 - plus * 0.1),
  gold: (plus: number, rar: number): number => 30 * (plus + 1) * (rar + 1),
  /** 이 단계 이상에서 실패하면 한 단계 내려간다 (max보다 크면 내려가지 않는다) */
  dropFrom: 99,
  /** 실패해도 내려가지 않게 하는 보호 부적의 아이템 id (ItemDef.kind 'token'). 빈 문자열이면 부적이 없다 */
  charm: '' as string,
  /** 강화 한 번에 드는 장비 가루(SALVAGE.item)의 수. 분해가 없는 게임에서는 0이어야 한다 */
  dust: (_plus: number, _rar: number): number => 0,
  /** 이 단계 이상으로 강화한 장비는 거래소에 올릴 수 없다(귀속). 0이면 묶지 않는다 */
  bindPlus: 0,
};
/** 재련: 장비의 옵션 하나를 다시 뽑는다. max가 0이면 재련이 없는 게임이다. n은 그 장비를 이미 재련한 횟수 */
export const REFORGE = { max: 0, gold: (_rar: number, _n: number): number => 0, dust: (_rar: number): number => 0 };
/**
 * 장비 분해와 가방 넓히기는 기본으로 꺼 둔다: 가루 아이템은 게임의 id라 여기서 정할 수 없고, 넓히기 값은 게임의 경제에 달렸다.
 * 켜려면 게임이 같은 이름으로 SALVAGE(item에 자기 아이템 id, dust에 등급별 양)와 BAG_UP(prices)을 내보낸다 (등불지기의 economy.ts가 예)
 */
export const SALVAGE = { item: '', dust: [] as readonly number[], perPlus: 0, maxBatch: 0, autoMaxRar: -1, tellS: 10 };
export const BAG_UP = { step: 0, prices: [] as readonly number[] };
export const BUILD = {
  pointsPerLevel: 3,
  resetGold: (lv: number): number => 30 * lv,
  skillMax: 5, skillPerLevel: 0.12,
  skillNeedLv: (lv: number): number => lv * 4,
  skillGold: (lv: number): number => 80 * lv * lv,
};
export const LEVEL = { firstNeed: 60, growth: 1.35 };
export const POWER = { perLevel: 20, perTier: 15, perSkillLevel: 10 };
export const MAIL_MAX = 30;
/** 방치 보상: 골드와 경험치만 준다 (두 번째 재화를 쓰는 게임은 sparks를 더해 자기 것을 내보낸다) */
export const IDLE = {
  minMin: 10, maxMin: 480,
  reward: (minutes: number, lv: number): Reward => ({ gold: Math.round(minutes * (1 + lv * 0.2)), exp: Math.round(minutes * (2 + lv)) }),
};
/** 출석 보상: 이어서 접속한 날 수(1~7)마다 */
export const ATTEND: readonly Reward[] = [{ gold: 30 }, { gold: 40 }, { gold: 50 }, { gold: 60 }, { gold: 80 }, { gold: 100 }, { gold: 200 }];
export const DAILIES: Readonly<Record<string, DailyDef>> = {};
export const RANK = { keep: 50, show: 20, everyS: 5 };

// ---------- 던전 (dungeon) ----------
export const DUNGEONS: Readonly<Record<string, DungeonDef>> = {};
export const PORTAL_REACH = 4;

// ---------- 사람들 사이의 것 (party, guild, market) ----------
export const PARTY = { max: 4, inviteS: 30, reinviteS: 30, inviteRange: 30, shareRange: 30, syncS: 0.5 };
export const GUILD = {
  createLv: 5, createGold: 500, nameMin: 2, nameMax: 12, noticeMax: 60, maxMembers: 30, inviteS: 60, reinviteS: 30,
  expPerGuildLevel: 2000, maxLevel: 10, expPerLevel: 0.02, gives: [100, 1000] as readonly number[], noticeGapS: 5, chatGapS: 0.7,
};
export const MARKET = { maxPrice: 1_000_000, minPrice: 2, minLv: 8, listGapS: 0.4, maxListings: 8, maxTotal: 2000, hours: 48, tax: 0.05, pageSize: 20, sweepS: 5 };

// ---------- 재화와 재화 흐름 지표 (economy) ----------
/** 장부가 적는 재화. 두 번째 재화(sparks)는 쓰지 않는 게임에서도 칸이 있어 0으로 적힌다 */
export const ECON_CURS = ['gold', 'sparks', 'exp'] as const;
/** 안내문으로 원인을 가리는 보상. 게임의 규칙이 틱이나 명령의 한가운데에서 재화를 주지 않으면 비워 둔다 */
/** 재화의 표: 거래 여부와 상한. 지갑(engine/server/game/systems/wallet.ts)이 읽는다 */
export const CURRENCIES: Readonly<Record<string, CurrencyDef>> = { gold: { tradable: true, max: 1e9 }, sparks: { tradable: false, max: 1e9 }, exp: { tradable: false } };
export const ECON_MOVES: readonly { cur: string; why: string; dir: '+' | '-'; as: string }[] = [
  { cur: 'gold', why: 'cmd:market:buy', dir: '-', as: 'market:out' },
  { cur: 'gold', why: 'mail:marketSold', dir: '+', as: 'market:in' },
];
export const ECON_MOVE_PREFIXES: readonly string[] = ['market:', 'cmd:market:', 'mail:market'];
export const ECON_UNKNOWN: readonly string[] = ['other', 'tick'];
export const ECON_LOST_FULL = 'lostFull';
export const ECON_HUNT = { live: 'hunt', away: 'huntAway', inst: 'huntDungeon' } as const;
export const ECON_LEVEL_MARKS: readonly number[] = [5, 10, 20];
export const ECON_FRESH_DAYS = 7;
export const ECON_WATCH = {
  sinkRatio: { min: 0.7, max: 1.0 }, holdDays: { max: 7 }, topRatio: { max: 10 }, awayShare: { max: 0.35 },
  maxEnhShare: { max: 0.3 }, unknownShare: { max: 0.01 }, minSample: 30,
} as const;

// ---------- 팀 (teams) ----------
/** 팀의 표: 비어 있다 (teams를 고른 게임이 적는다) */
export const TEAMS: readonly TeamDef[] = [];
/** 사람이 더 많은 팀으로는 못 간다, 옮길 수 있다, 저장하지 않는다 */
export const TEAM_RULES: TeamRules = { balance: true, switch: true, persist: false };

// ---------- 수집형·방치형 (roster, gacha, squad, stages) ----------
/** 영웅의 표: 비어 있다 (roster를 고른 게임이 적는다) */
export const HEROES: Readonly<Record<string, HeroDef>> = {};
/** 등급 셋: 흔함(별 1, 조각 5), 귀함(별 2, 조각 10), 전설(별 3, 조각 25). 이름은 틀의 문장 키 */
export const HERO_RARITIES: readonly HeroRarityDef[] = [
  { id: 'common', name: 'heroRarity0', color: 0x9aa4ad, stars: 1, shards: 5 },
  { id: 'rare', name: 'heroRarity1', color: 0x4f8fe0, stars: 2, shards: 10 },
  { id: 'legend', name: 'heroRarity2', color: 0xe0a030, stars: 3, shards: 25 },
];
/** 역할의 표: 비어 있다 (없는 역할의 영웅은 붙어서 친다) */
export const HERO_ROLES: Readonly<Record<string, HeroRoleDef>> = {};
/** 별은 6까지, 별마다 레벨 상한 +10 (별 1이면 20), 레벨 값은 골드 (레벨 × 20 × (등급 + 1)), 별 값은 조각 (별 × 10), 레벨마다 +10%, 별마다 +25% */
export const HERO_RULES: HeroRules = {
  maxStars: 6, maxLv: (stars) => 10 + stars * 10, levelCur: 'gold', levelCost: (lv, rarity) => lv * 20 * (rarity + 1), starCost: (stars) => stars * 10, grow: 0.1, starMul: 0.25,
};
/** 배너: 없다 (gacha를 고른 게임이 적는다) */
export const BANNERS: Readonly<Record<string, BannerDef>> = {};
export const GACHA_RULES: GachaRules = { history: 50 };
/** 넷이 함께 싸우고, 주인 둘레 12m를 노리고, 20m 밖이면 돌아오고, 10초 뒤 다시 일어난다 */
export const SQUAD_RULES: SquadRules = { size: 4, seek: 12, leash: 20, reviveS: 10, regen: 0.05, autoFill: true };
/** 장: 없다 (stages를 고른 게임이 적는다) */
export const CHAPTERS: readonly ChapterDef[] = [];
export const STAGE_RULES: StageRules = { arena: { x: 0, z: 0 }, radius: 8, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: false };

// ---------- 겉모습의 부품, 캐릭터 정의(chars), 변신(morph) ----------
/** 틀의 부품 묶음을 그대로 쓴다 (키 배율 0.85~1.15, 너비 배율 0.85~1.2) */
export const LOOK_RULES: LookRules = {};
/** 능력치 atk·hp(무게 4, 0.5), 예산은 내용의 영웅에서, 역할·기술은 내용의 것 전부, 기술 하나, 이름 16자·소개 120자 */
export const CHAR_RULES: CharRules = {};
/** 스스로 풀 때까지, 다시 변신까지 10초, 맞은 지 5초 안에는 못 한다, 보정 없음(겉모습만), 서른까지 가진다 */
export const MORPH_RULES: MorphRules = { durationS: 0, cooldownS: 10, noFightS: 5, maxOwn: 30 };

// ---------- 운영의 바탕 (핵심: 시계, 원격 설정, 기능 깃발) ----------
/** 서버 PC의 현지 시각 자정에 날이 바뀌고, 주는 월요일에 시작한다 (예전의 '서버 현지 자정'과 같다) */
export const RESET: ResetRules = { tz: 'local', dayAt: 0, weekStart: 1 };
/** 원격 설정으로 덮어쓸 수 있는 칸: 없다 (모든 내용이 소스 그대로) */
export const LIVE_KEYS: LiveKeys = {};
/** 게임의 기능 깃발: 없다 (틀의 깃발 join, chat, market, mail, gacha만) */
export const FLAGS: readonly string[] = [];
/**
 * 원격 설정 칸의 수 범위 검사 (게임의 LIVE_KEYS의 check에 쓴다: 내용 파일이 값으로 읽어도 되는 틀의 도우미).
 * 예: 'GACHA_RULES.history': { check: liveRange(10, 200, true) }
 */
export const liveRange = (min: number, max: number, int = false) => (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v)) ? null : `${min}~${max} 사이의 ${int ? '정수' : '수'}여야 합니다`;
// ---------- 웹 출시의 바탕: 약관·처리방침, 개인정보 권리 (engine/shared/defs/legal.ts) ----------
/** 약관·처리방침: 없다 (화면에 링크도 첫 접속 고지도 없다) */
export const LEGAL: LegalDef | null = null;
/** 내 데이터 삭제: 요청하고 7일 뒤에 지운다 (그동안 취소할 수 있다) */
export const PRIVACY: PrivacyRules = { eraseDays: 7 };
// ---------- 사회와 안전: 대화 채널(chat), 친구(friends), 정해진 문장, 연령과 제한 모드 (engine/shared/defs/talk.ts) ----------
/** 근처 30m, 모든 채널을 합쳐 한꺼번에 5줄·그 뒤로 2초에 1줄, 같은 말은 20초 안에 되풀이하지 못한다 (chat 모듈을 고른 게임에만 걸린다) */
export const CHAT_RULES: ChatRules = { nearM: 30, burst: 5, perS: 0.5, sameS: 20 };
/** 친구 50명, 받아 둔 요청 20개, 요청은 5초에 하나 */
export const FRIENDS: FriendRules = { max: 50, pending: 20, askGapS: 5 };
/** 틀이 문장을 갖춘 정해진 문장 여덟 (i18n의 ui 키: 인사, 고마움, 미안함, 칭찬, 도움, 기다림, 가자, 작별). 게임은 QUICK_CHAT = [...BASIC_QUICK_CHAT]으로 쓰거나 자기 키를 더한다 */
export const BASIC_QUICK_CHAT = ['qcHello', 'qcThanks', 'qcSorry', 'qcGood', 'qcHelp', 'qcWait', 'qcGo', 'qcBye'] as const;
/** 정해진 문장: 없다 (화면에 단추도 없다) */
export const QUICK_CHAT: readonly string[] = [];
/** 연령: 묻지 않는다 (제한 모드도 없다) */
export const AGE: AgeRules | null = null;
// ---------- 확률과 재화의 투명성 (odds 모듈: engine/shared/defs/odds.ts) ----------
/** 게임이 주는 표 없음(강화·뽑기의 자동 표만), 추첨 기록은 5년(1825일) 남긴다 (보관 기간은 사용자 결정: docs/genre-features.md 5.4) */
export const ODDS: OddsRules = { tables: [], keepDays: 1825 };

// ---------- 게임 안의 모드 (modes) ----------
/** 모드가 없다 (한 게임: 예전과 같다) */
export const MODE_RULES: ModeRules = { list: [] };

// ---------- 스태미나 (stamina, 묶음 D) ----------
/** 꺼져 있다 (모듈을 골라도 없는 것과 같다) */
export const STAMINA_RULES: StaminaRules = { enabled: false, name: 'stamina', max: 60, everyS: 300, use: {} };

// ---------- 라이브 콘텐츠 (묶음 6: engine/shared/defs/livecontent.ts). 모두 비어 있다: 적지 않은 게임은 지금과 같다 ----------
/** 상품 (items 모듈): 비어 있으면 상품이 없다 */
export const GOODS: Readonly<Record<string, GoodsDef>> = {};
/** 기간 이벤트 (event 모듈) */
export const EVENTS: Readonly<Record<string, EventDef>> = {};
/** 시즌과 무료 보상 트랙 (season 모듈) */
export const SEASON: SeasonRules | null = null;
/** 업적과 칭호 (achieve 모듈) */
export const ACHIEVES: Readonly<Record<string, AchieveDef>> = {};
/** 도감 (codex 모듈) */
export const CODEX: Readonly<Record<string, CodexDef>> = {};
/** 쿠폰 코드: 4~20자, 틀린 코드를 10분 안에 다섯 번 넣으면 10분 막는다 (coupon 모듈) */
export const COUPON: CouponRules = { min: 4, max: 20, tries: 5, lockMin: 10 };
/** 복귀 보상 (coupon 모듈) */
export const COMEBACK: ComebackRules | null = null;
/** 우편의 만료 (mail 모듈): 비어 있으면 만료가 없다 */
export const MAIL_RULES: MailRules = {};
