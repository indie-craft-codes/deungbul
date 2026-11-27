// 내용 계약: 틀이 게임의 내용 정의에 요구하는 모양. 핵심 계약과 모듈마다의 계약으로 나뉜다.
// 틀은 게임의 내용을 별칭 @game/shared/content에서 아래 이름으로 읽는다 (engine/shared/content.ts가 읽는 단 하나의 자리다.
// @game이 가리키는 폴더는 tsconfig.json의 paths와 vite.config.ts의 alias가 정한다).
//   핵심 계약(CoreContent): 모든 게임이 반드시 적는다. 맵과 쓸 모듈의 목록.
//   모듈의 계약(…Content): 그 모듈의 표와 수치. 모두 선택이다: 적지 않은 이름은 틀의 기본값(engine/shared/defaults.ts)이 채운다.
//     쓰지 않는 모듈의 이름은 적지 않는다 (전투가 없는 게임은 직업·몬스터·무기를 정의하지 않는다).
// 적은 이름의 모양이 다르면 이 파일의 맨 아래 검사에서 컴파일 오류가 난다 (npm run typecheck).
// 게임에만 있는 것(등불지기의 등탑, 주민, 습격, 퀘스트)은 계약에 없다: 틀이 읽지 않는다.
// 계약의 타입들(ClassDef, ItemDef, MapDef 등)과 내용에서 값을 구하는 도우미는 engine/shared/defs/에 있다.
import type { BannerDef, ChapterDef, GachaRules, HeroDef, HeroRarityDef, HeroRoleDef, HeroRules, IdleRules, SquadRules, StageRules } from './defs/collect';
import type { ClassDef, SkillDef } from './defs/combat';
import type { ForgeDef } from './defs/craft';
import type { HudRules } from './defs/hud';
import type { DungeonDef } from './defs/dungeons';
import type { CurrencyDef } from './defs/economy';
import type { DailyDef, Reward, StatMod } from './defs/growth';
import type { ItemDef } from './defs/items';
import type { MapDef } from './defs/map';
import type { MonsterDef } from './defs/monsters';
import type { TeamDef, TeamRules } from './defs/teams';
import type { LookRules } from './defs/look';
import type { CharRules } from './defs/chardef';
import type { MorphRules } from './defs/morph';
import type { LiveKeys, ResetRules } from './defs/live';
import type { LegalDef, PrivacyRules } from './defs/legal';
import type { AgeRules, ChatRules, FriendRules } from './defs/talk';
import type { OddsRules } from './defs/odds';
import type { ModeRules } from './defs/modes';
import type { ModuleId } from './modules';
import * as defaults from './defaults';
import * as content from '@game/shared/content';

type Range = readonly [number, number];
type Point = { x: number; z: number };

/** 핵심 계약: 모든 게임이 적는다 */
export interface CoreContent {
  /** 지역, 장애물, 나무와 바위를 뿌리는 규칙, 던전의 문 (engine/shared/world.ts의 buildWorld가 이것만 읽는다) */
  MAP: MapDef;
  /** 쓸 선택 모듈 (engine/shared/modules.ts). 빈 목록이면 핵심만 돈다. 의존하는 모듈이 빠지면 서버와 화면이 시작할 때 오류를 낸다 */
  MODULES: readonly ModuleId[];
}

/** 핵심의 수치 (기본값이 있다) */
export interface CoreTuning {
  /** 이름을 정하지 못한 접속자에게 붙이는 이름의 머리말 */
  GUEST_NAME: string;
  /** 서버의 주기와 시야: 틱(ms), 몇 틱마다 보내는가, 시야 반경과 빠지는 반경(m) */
  NET: { tickMs: number; snapEvery: number; aoi: number; aoiLeave: number };
  /** 들판의 채널 */
  CHANNEL: { count: number; soft: number; hard: number; switchCdS: number; calmS: number; tellS: number; tellBusyS: number };
  /** 이만큼(초) 안에 다시 들어오면 나갈 때의 몸 상태로 시작한다 */
  REJOIN_KEEP_S: number;
  /** 화면의 카메라: 거리(m), 처음 배율, 휠·두 손가락의 배율 범위, 접속 전 배율 */
  CAMERA: { dist: number; zoom: number; zoomMin: number; zoomMax: number; gate: number };
  /** 핵심의 '집으로'(H 키)를 두는가 */
  HOME_KEY: boolean;
  /** 화면의 틀 요소 끄기: hide에 적은 요소(가방 단추, '가까운 대상 공격' …: engine/shared/defs/hud.ts의 HUD_PARTS)를 감춘다 */
  HUD: HudRules;
}

/** classes, combat: 직업과 기술, 몬스터 */
export interface CombatContent {
  CLASSES: Readonly<Record<string, ClassDef>>;
  /** 직업을 아직 고르지 않은 캐릭터가 쓰는 직업 */
  DEFAULT_CLASS: string;
  SKILL_DEFS: Readonly<Record<string, SkillDef>>;
  /** 직업마다 기술 칸의 수 */
  SKILL_SLOTS: number;
  HP_PER_LEVEL: number;
  ATTACK_CD: number;
  /** 치명타(기본 확률, 피해 배율)와 자연 회복(맞은 뒤 기다리는 시간, 초당 회복량) */
  COMBAT: { critChance: number; critMult: number; regenAfterS: number; regenPerS: number };
  SLOW_FACTOR: number;
  MONSTERS: Readonly<Record<string, MonsterDef>>;
  /** 들판의 무리: 그 자리 둘레에 types의 몬스터가 산다 */
  CAMPS: readonly (Point & { types: readonly string[] })[];
  MONSTER_ATTACK_RANGE: number;
  MONSTER_ATTACK_CD: number;
  LEASH: number;
  RESPAWN_S: number;
  /** 몬스터의 움직임: 대상을 놓는 거리, 집으로 돌아가는 속도(배율), 어슬렁거리는 속도 */
  MONSTER_AI: { loseRange: number; homeSpeed: number; wanderSpeed: number };
  BOSS: { hpPerPlayer: number; maxScale: number; countRange: number; countS: number; slamEveryS: number; slamWarnS: number; slamRadius: number; slamDmg: Range };
}

/** items: 아이템, 상점, 제작 */
export interface ItemsContent {
  ITEMS: Readonly<Record<string, ItemDef>>;
  START_WEAPON: string;
  SHOPS: readonly Point[];
  SHOP_STOCK: readonly string[];
  SHOP_REACH: number;
  POTION_MAX: number;
  POTION_CD: number;
  MAT_MAX: number;
  /** 대장간들. 빈 목록이면 제작이 없는 게임이다 */
  FORGES: readonly ForgeDef[];
  SMITHY_REACH: number;
  RECIPES: readonly { id: string; gold: number; mats: Readonly<Partial<Record<string, number>>> }[];
  DROPS: Readonly<Partial<Record<string, { id: string; chance: number }>>>;
}

/** gear: 드롭 장비, 강화, 재련, 분해, 가방 넓히기 */
export interface GearContent {
  /** 장비 옵션의 종류: id는 게임이 짓고, mod는 그 옵션이 드는 틀의 효과(공격 피해 %, 받는 피해 감소 %, 치명타 %p, 최대 체력). base는 옵션 값의 바탕 */
  STATS: Readonly<Record<string, { base: number; mod: StatMod }>>;
  /** 장비를 끼는 칸. id는 게임이 짓는다. 'weapon'(무기) 칸은 반드시 있고, 무기와 갑옷의 바탕 아이템은 ItemDef.kind와 같은 이름의 칸('weapon', 'armor')에 낀다 */
  GEAR_SLOTS: readonly string[];
  RARITIES: readonly { id: string; weight: number; opts: number; mult: number }[];
  GEAR: {
    dropChance: number; bagMax: number; guardCap: number; optMin: number; optSpan: number; optPerLevel: number; sellBase: number; sellPerTier: number;
    weaponFor: (lv: number) => string; armorFor: (lv: number) => string; levelOf: (monsterExp: number) => number;
  };
  /** 강화. dropFrom 이상에서 실패하면 한 단계 내려가고(charm이 있으면 막는다), dust는 한 번에 드는 가루, bindPlus 이상은 거래소에 못 올린다 */
  ENHANCE: { max: number; supplyMax: number; perPlus: number; rate: (plus: number) => number; gold: (plus: number, rar: number) => number; dropFrom: number; charm: string; dust: (plus: number, rar: number) => number; bindPlus: number };
  /** 재련: 옵션 하나를 다시 뽑는다. 장비마다 max번까지, 값은 등급(rar)과 이미 한 횟수(n)로. max 0이면 없다 */
  REFORGE: { max: number; gold: (rar: number, n: number) => number; dust: (rar: number) => number };
  /** 장비 분해: 나오는 아이템, 등급별 양(RARITIES의 순서), 강화 단계마다의 덤, 한 번에 분해하는 수, 자동 분해의 가장 높은 등급, 안내를 묶는 시간(초). dust가 비어 있으면 분해가 없는 게임이다 */
  SALVAGE: { item: string; dust: readonly number[]; perPlus: number; maxBatch: number; autoMaxRar: number; tellS: number };
  /** 가방 넓히기: 한 번에 늘어나는 칸 수와 차례대로의 값. prices가 비어 있으면 넓히기가 없는 게임이다 */
  BAG_UP: { step: number; prices: readonly number[] };
}

/** growth, build: 레벨, 능력치, 기술 강화, 전투력 */
export interface GrowthContent {
  /** 찍을 수 있는 능력치: id는 게임이 짓고, mod는 드는 틀의 효과, per는 점수 하나가 주는 값 (STATS와 같은 단위: 공격 피해 %, 치명타 %p, 체력) */
  BUILD_STATS: Readonly<Record<string, { mod: StatMod; per: number }>>;
  BUILD: { pointsPerLevel: number; resetGold: (lv: number) => number; skillMax: number; skillPerLevel: number; skillNeedLv: (lv: number) => number; skillGold: (lv: number) => number };
  /** 레벨 업에 필요한 경험치: 처음 값과 레벨마다 곱하는 값 */
  LEVEL: { firstNeed: number; growth: number };
  /** 전투력의 식에 드는 점수 (rank) */
  POWER: { perLevel: number; perTier: number; perSkillLevel: number };
  RANK: { keep: number; show: number; everyS: number };
}

/** mail, daily, idle: 우편, 일일 임무와 출석, 접속하지 않은 동안의 보상 */
export interface MailContent {
  MAIL_MAX: number;
  /**
   * 방치 보상: 비운 분과 레벨, 그리고 틀이 넘기는 것(ctx: 깬 단계의 수. stages 모듈이 없으면 0)으로 셈한다. ctx를 읽지 않는 식도 된다.
   * popup이 true면 돌아왔을 때 받은 방치 보상(과 오프라인 진행)을 화면 가운데 창으로 알린다 (메시지 idleBack. 받기는 우편으로)
   */
  IDLE: IdleRules;
  DAILIES: Readonly<Record<string, DailyDef>>;
  ATTEND: readonly Reward[];
}

/** dungeon */
export interface DungeonContent {
  DUNGEONS: Readonly<Record<string, DungeonDef>>;
  PORTAL_REACH: number;
}

/** party, guild, market */
export interface SocialContent {
  PARTY: { max: number; inviteS: number; reinviteS: number; inviteRange: number; shareRange: number; syncS: number };
  GUILD: { createLv: number; createGold: number; nameMin: number; nameMax: number; noticeMax: number; maxMembers: number; inviteS: number; reinviteS: number; expPerGuildLevel: number; maxLevel: number; expPerLevel: number; gives: readonly number[]; noticeGapS: number; chatGapS: number };
  MARKET: { maxPrice: number; minPrice: number; minLv: number; listGapS: number; maxListings: number; maxTotal: number; hours: number; tax: number; pageSize: number; sweepS: number };
}

/** economy: 재화와 재화 흐름 지표 (경제 장부: engine/server/game/systems/ledger.ts) */
export interface EconomyContent {
  /** 재화의 표: 재화의 id → 거래 가능 여부, 상한. 틀이 아는 칸은 gold, sparks, exp다 (없는 재화는 한도 없이 다룬다) */
  CURRENCIES: Readonly<Record<string, CurrencyDef>>;
  /** 장부가 적는 재화 */
  ECON_CURS: readonly string[];
  /** 생성도 소멸도 아닌 이동으로 바꿔 적을 원인들과, 이동으로 치는 원인의 머리말 */
  ECON_MOVES: readonly { cur: string; why: string; dir: '+' | '-'; as: string }[];
  ECON_MOVE_PREFIXES: readonly string[];
  ECON_UNKNOWN: readonly string[];
  ECON_LOST_FULL: string;
  ECON_HUNT: { live: string; away: string; inst: string };
  ECON_LEVEL_MARKS: readonly number[];
  ECON_FRESH_DAYS: number;
  /** 지표를 읽는 판단 기준 (npm run econ이 '주의'를 붙이는 범위) */
  ECON_WATCH: { sinkRatio: { min: number; max: number }; holdDays: { max: number }; topRatio: { max: number }; awayShare: { max: number }; maxEnhShare: { max: number }; unknownShare: { max: number }; minSample: number };
}

/** teams: 팀의 표와 규칙 */
export interface TeamsContent {
  /** 팀들 (차례가 곧 줄 위의 번호다). 둘이 흔하지만 셋 이상도 된다 */
  TEAMS: readonly TeamDef[];
  /** 사람 수 균형, 옮기기, 저장 */
  TEAM_RULES: TeamRules;
}

/** roster, gacha, squad, stages: 수집형·방치형 RPG (engine/shared/defs/collect.ts) */
export interface CollectContent {
  /** 영웅(동료)의 표: id → 이름의 문장 키, 등급, 역할, 1레벨의 공격·체력 */
  HEROES: Readonly<Record<string, HeroDef>>;
  /** 등급들 (차례가 번호: 0이 가장 흔하다) */
  HERO_RARITIES: readonly HeroRarityDef[];
  /** 역할들: 싸우는 법과 겉모습 */
  HERO_ROLES: Readonly<Record<string, HeroRoleDef>>;
  /** 레벨·별의 상한과 값, 자라는 비율 */
  HERO_RULES: HeroRules;
  /** 뽑기의 배너들: 값, 영웅마다의 무게, 천장, 10번 뽑기의 보장 */
  BANNERS: Readonly<Record<string, BannerDef>>;
  GACHA_RULES: GachaRules;
  /** 편성: 함께 싸우는 수, 노리는 거리, 다시 일어나기 */
  SQUAD_RULES: SquadRules;
  /** 장과 단계 (단계의 id는 '장-단계': 1-1, 1-2 …) */
  CHAPTERS: readonly ChapterDef[];
  /** 단계가 벌어지는 곳과 시간 */
  STAGE_RULES: StageRules;
}

/** 겉모습의 부품, 캐릭터 정의(chars), 변신(morph): engine/shared/defs/look.ts, chardef.ts, morph.ts */
export interface CharsContent {
  /** 겉모습의 부품을 더하고 빼고 칸을 끄는 규칙, 크기 배율의 범위 (모듈과 상관없이 사람형의 겉모습을 쓰는 곳 모두) */
  LOOK_RULES: LookRules;
  /** 캐릭터 정의의 규칙: 능력치의 칸과 무게, 등급마다의 예산, 역할·기술의 목록, 글자 수, 금칙어 */
  CHAR_RULES: CharRules;
  /** 변신의 규칙: 지속 시간, 재사용 대기, 전투 중 금지, 보정과 상한, 가질 수 있는 수 */
  MORPH_RULES: MorphRules;
}

/** 운영의 바탕(핵심): 초기화 시각, 원격 설정으로 덮어쓸 수 있는 칸, 게임의 기능 깃발 (engine/shared/defs/live.ts). 적지 않으면 지금과 같다 */
export interface OpsContent {
  /** 초기화 시각: 시간대, 하루 시작 시각, 주의 시작 요일. 기본은 서버 PC의 현지 자정, 월요일 */
  RESET: ResetRules;
  /** 원격 설정으로 덮어쓸 수 있는 칸: 이름(내용의 칸의 길) → 화면에도 보내는가, 모양, 검사. 선언하지 않은 칸은 소스 그대로다 */
  LIVE_KEYS: LiveKeys;
  /** 게임의 기능 깃발의 이름 (틀의 것 join, chat, market, mail, gacha에 더한다). g.flags.on(이름)으로 묻는다 */
  FLAGS: readonly string[];
}

/** 웹 출시의 바탕: 약관·처리방침과 개인정보 권리 (engine/shared/defs/legal.ts). 모듈과 상관없이 어느 게임에나 */
export interface WebContent {
  /** 약관·처리방침 문서와 버전. null(기본)이면 화면에 링크도 고지도 없다 */
  LEGAL: LegalDef | null;
  /** 내 데이터 삭제의 유예(일) */
  PRIVACY: PrivacyRules;
}

/** 사회와 안전: 대화 채널(chat 모듈), 친구(friends 모듈), 정해진 문장과 연령·제한 모드(핵심, 선택 칸) (engine/shared/defs/talk.ts). 적지 않으면 지금과 같다 */
export interface SafetyContent {
  /** 대화 채널의 규칙: 근처의 거리, 도배 막기 (chat 모듈을 고른 게임에만) */
  CHAT_RULES: ChatRules;
  /** 친구의 상한과 요청 간격 (friends 모듈) */
  FRIENDS: FriendRules;
  /** 정해진 문장의 키(i18n 문장 키). 빈 목록(기본)이면 정해진 문장이 없다. 제한 모드의 사람은 이것만 쓴다 */
  QUICK_CHAT: readonly string[];
  /** 연령 입력과 제한 모드. null(기본)이면 묻지 않는다 */
  AGE: AgeRules | null;
}

/** 확률과 재화의 투명성 (odds 모듈): 게임이 직접 주는 확률표, 추첨 기록의 보관, 공개 페이지의 이름표와 운영자 문구 (engine/shared/defs/odds.ts). 적지 않으면 자동 표만 */
export interface OddsContent {
  ODDS: OddsRules;
}

/** 게임 안의 모드 (modes 모듈): 한 캐릭터로 오가는 '두 게임'(들판·단계)의 목록과 화면 (engine/shared/defs/modes.ts). 적지 않으면 모드가 없다 */
export interface ModesContent {
  MODE_RULES: ModeRules;
}

/** 모듈의 계약 전부 (모두 선택) */
export type ModuleContent = CoreTuning & CombatContent & ItemsContent & GearContent & GrowthContent & MailContent & DungeonContent & SocialContent & EconomyContent & TeamsContent & CollectContent & CharsContent & OpsContent & WebContent & SafetyContent & OddsContent & ModesContent;
/** 게임의 내용이 지킬 모양: 핵심은 반드시, 나머지는 적었으면 이 모양으로 */
export type ContentContract = CoreContent & Partial<ModuleContent>;

// 이 게임의 내용이 계약을 지키는가. 실행할 때는 아무 일도 하지 않는다 (이 파일을 실행 중에 불러오는 곳도 없다): 컴파일할 때의 검사다
content satisfies ContentContract;
// 틀의 기본값 묶음이 모듈의 계약을 모두 채우는가 (게임이 적지 않은 이름은 이것으로 채워진다: engine/shared/content.ts)
defaults satisfies ModuleContent;
