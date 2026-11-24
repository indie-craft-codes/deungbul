// 내용 계약: 틀이 게임의 내용 정의에 요구하는 모양.
// 틀(이동, 전투, 몬스터, 상점, 장비, 우편, 던전, 채널, 길드 같은 표준 시스템과 클라이언트의 바탕)은 게임의 내용을
// 별칭 @game/shared/content에서 아래 이름으로 읽는다 (@game이 가리키는 폴더는 tsconfig.json의 paths와 vite.config.ts의 alias가 정한다).
// 다른 게임을 만들려면 자기 폴더의 shared/content에서 이 이름들을 이 모양으로 내보내고 별칭을 그 폴더로 돌리면 된다:
// 빠뜨리거나 모양이 다르면 이 파일의 맨 아래 검사에서 컴파일 오류가 난다 (npm run typecheck).
// 이 게임에만 있는 것(등탑, 주민, 습격, 퀘스트)은 계약에 없다: 틀이 읽지 않는다.
//
// 틀의 코드는 @game을 직접 읽지 않고 틀의 통로(engine/shared/defs.ts)를 거친다: 통로가 다시 내보내는 이름의 목록이 이 계약의 이름과 같다 (engine/test/framework.test.ts가 견준다).
// 계약의 타입들(ClassDef, ItemDef, MapDef 등)과 내용에서 값을 구하는 도우미는 engine/shared/defs/에 있다.
import type { ClassDef, SkillDef } from './defs/combat';
import type { ForgeDef } from './defs/craft';
import type { DungeonDef } from './defs/dungeons';
import type { EconNotice } from './defs/economy';
import type { DailyDef, Reward } from './defs/growth';
import type { ItemDef } from './defs/items';
import type { MapDef } from './defs/map';
import type { MonsterDef } from './defs/monsters';
import * as content from '@game/shared/content';

type Range = readonly [number, number];
type Point = { x: number; z: number };

export interface ContentContract {
  // ---------- 맵 ----------
  /** 지역, 장애물, 나무와 바위를 뿌리는 규칙, 던전의 문 (engine/shared/world.ts의 buildWorld가 이것만 읽는다) */
  MAP: MapDef;

  // ---------- 직업과 기술 ----------
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
  REJOIN_KEEP_S: number;
  /** 이름을 정하지 못한 접속자에게 붙이는 이름의 머리말 */
  GUEST_NAME: string;

  // ---------- 몬스터 ----------
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

  // ---------- 아이템, 상점, 제작 ----------
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

  // ---------- 장비와 성장 ----------
  STATS: Readonly<Record<string, { base: number }>>;
  GEAR_SLOTS: readonly string[];
  RARITIES: readonly { id: string; weight: number; opts: number; mult: number }[];
  GEAR: {
    dropChance: number; bagMax: number; guardCap: number; optMin: number; optSpan: number; optPerLevel: number; sellBase: number; sellPerTier: number;
    weaponFor: (lv: number) => string; armorFor: (lv: number) => string; levelOf: (monsterExp: number) => number;
  };
  ENHANCE: { max: number; supplyMax: number; perPlus: number; rate: (plus: number) => number; gold: (plus: number, rar: number) => number };
  /** 찍을 수 있는 능력치의 종류 */
  BUILD_STATS: readonly string[];
  BUILD: { pointsPerLevel: number; pow: number; vit: number; luck: number; resetGold: (lv: number) => number; skillMax: number; skillPerLevel: number; skillNeedLv: (lv: number) => number; skillGold: (lv: number) => number };
  /** 레벨 업에 필요한 경험치: 처음 값과 레벨마다 곱하는 값 */
  LEVEL: { firstNeed: number; growth: number };
  /** 전투력의 식에 드는 점수 */
  POWER: { perLevel: number; perTier: number; perSkillLevel: number };
  MAIL_MAX: number;
  IDLE: { minMin: number; maxMin: number; reward: (minutes: number, lv: number) => Reward };
  DAILIES: Readonly<Record<string, DailyDef>>;
  ATTEND: readonly Reward[];
  RANK: { keep: number; show: number; everyS: number };

  // ---------- 던전 ----------
  DUNGEONS: Readonly<Record<string, DungeonDef>>;
  PORTAL_REACH: number;

  // ---------- 사람들 사이의 것 ----------
  PARTY: { max: number; inviteS: number; reinviteS: number; inviteRange: number; shareRange: number; syncS: number };
  CHANNEL: { count: number; soft: number; hard: number; switchCdS: number; calmS: number; tellS: number; tellBusyS: number };
  GUILD: { createLv: number; createGold: number; nameMin: number; nameMax: number; noticeMax: number; maxMembers: number; inviteS: number; reinviteS: number; expPerGuildLevel: number; maxLevel: number; expPerLevel: number; gives: readonly number[]; noticeGapS: number; chatGapS: number };
  MARKET: { maxPrice: number; minPrice: number; minLv: number; listGapS: number; maxListings: number; maxTotal: number; hours: number; tax: number; pageSize: number; sweepS: number };

  // ---------- 재화 흐름 지표 (경제 장부: engine/server/game/systems/ledger.ts, scripts/econ.ts) ----------
  /** 장부가 적는 재화 */
  ECON_CURS: readonly string[];
  /** 안내문으로 원인을 가리는 보상: 안내문의 종류 → 원인의 이름과, 몇 번째 값이 어느 재화인지. 없으면 빈 객체 */
  ECON_NOTICES: Readonly<Partial<Record<string, EconNotice>>>;
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

// 이 게임의 내용이 계약을 지키는가. 실행할 때는 아무 일도 하지 않는다 (이 파일을 실행 중에 불러오는 곳도 없다): 컴파일할 때의 검사다
content satisfies ContentContract;
