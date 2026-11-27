// 엔티티의 모듈 몫(부분): 선택 모듈(engine/shared/modules.ts)이 엔티티에 두는 칸. 틀의 핵심 엔티티(./entity.ts의 Ent)는 위치·이동·층·이름 같은 핵심의 칸만 적고,
// 모듈의 칸은 여기서 모듈마다 적는다. 그 모듈을 고른 게임의 엔티티에만 칸이 생긴다(Game.create가 고른 모듈의 init만 부른다).
//   타입  아래의 *Part 인터페이스들을 EntParts로 묶고 Ent(./entity.ts)가 이어받는다: 모듈의 코드는 지금처럼 e.gold, e.hp로 쓴다
//   값    PARTS[모듈].init이 처음 값을 채운다. 모든 종류(플레이어, 몬스터, 게임의 종류)에 같게 (예전의 Game.create와 같은 값)
// 고르지 않았을 수 있는 모듈의 칸은 그 모듈을 골랐는지 묻고 읽는다: g.has(모듈) 뒤에 쓰거나, 읽기만 하면 g.field(e, 칸)
// (고르지 않았으면 그 칸의 처음 값을 돌려준다: 모듈을 끈 게임이 예전에 읽던 값과 같다). 쓰는 곳은 늘 g.has로 막는다: 칸이 없는 엔티티에 칸이 새로 생기면 안 된다.
// 틀에 칸을 가진 모듈을 더하면 여기에 인터페이스 하나와 PARTS 한 줄을 더한다. 게임이 더하는 칸은 여기가 아니라 EntExt(./ext.ts)와 g.entInit이다.
import { LEVEL, type BuffMod, type DailyState, type Gear, type HeroGearPiece, type Mail, type MonsterDef, type OwnedHero, type PullLog } from '../../shared/defs';
import type { ModuleId } from '../../shared/modules';
import type { Ent } from './entity';

/** [economy] 지갑: 골드와 두 번째 재화 */
export interface EconomyPart { gold: number; sparks: number }

/** [growth] 레벨, 경험치, 다음 레벨까지 */
export interface GrowthPart { lv: number; exp: number; need: number }

/** [classes] 직업 (CLASSES의 키). 아직 고르지 않았으면 빈 문자열 */
export interface ClassesPart { cls: string }

/** [combat] 체력과 싸움의 상태, 몬스터의 칸 */
export interface CombatPart {
  hp: number; maxHp: number;
  /** 노리는 대상(엔티티 id, 없으면 0), 다음 공격까지, 마지막으로 맞은 시각(게임 시계) */
  targetId: number; atkCd: number; lastHurt: number;
  /** 기술 칸의 쿨다운(초) */
  cds: number[];
  /** 물약을 다시 마실 수 있을 때까지 남은 시간(초). 마시는 것은 아이템 모듈(상점)이지만, 줄어드는 것과 저장(나갈 때의 몸 상태)은 전투의 몫이다 */
  itemCd: number;
  // ---- 몬스터 ----
  def: MonsterDef | null;
  /** 집(생성 위치) */
  hx: number; hz: number;
  respawn: number;
  /** 피해를 준 플레이어들 */
  hitters: Set<number>;
  /** 몰려온 적: 게임의 규칙이 정한 목표(g.rules.siege)로 향하고, 집으로 돌아가지 않으며, 죽으면 다시 나오지 않는다 (등불지기의 습격이 부른다) */
  swarm: boolean;
  /** 필드 보스: 체력에 반영한 인원, 다음 내려치기까지 남은 시간, 예고 중이면 남은 시간 */
  scale: number; cast: number; windup: number;
  /** 이 시각(게임 시계)까지 느려져 있다 */
  slowUntil: number;
  /** 이 시각(게임 시계)까지 기절해 있다: 움직이지도 때리지도 못한다 (몬스터) */
  stunUntil: number;
  /** 걸려 있는 강화들 (기술의 buff). 끝난 것은 전투의 틱이 지운다 */
  buffs: { skill: string; mod: BuffMod; value: number; until: number }[];
  /** 걸려 있는 지속 피해들 (기술의 dot): 건 사람, 1초마다의 피해, 끝나는 시각, 다음 피해까지 남은 시간 */
  dots: { src: number; skill: string; dps: number; until: number; next: number }[];
  /** 너무 멀리 끌려 나와 집으로 돌아가는 중 (몬스터). 그동안은 싸우지 않고 회복한다 */
  homing: boolean;
}

/** [items] 든 무기(ITEMS의 키), 입은 갑옷(없으면 빈 문자열), 가진 아이템(재료·물약): 아이템 id별 개수 */
export interface ItemsPart { weapon: string; armor: string; items: Record<string, number> }

/** [gear] 드롭 장비: 가방에 든 것 전부, 칸마다 낀 것의 uid, 다음 uid를 정하는 번호 (systems/gear.ts) */
export interface GearPart {
  gear: Gear[]; worn: Record<string, number>; gearSeq: number;
  /** 가방을 넓힌 횟수와, 가방이 가득 차 버려진 장비의 수 (가방에 자리가 다시 나면 0으로 돌아간다. systems/bag.ts) */
  bagUp: number; lostFull: number;
  /** 자동 분해: 주운 장비가 이 등급 이하면 그 자리에서 분해한다 (RARITIES의 번호. -1이면 끔. systems/salvage.ts) */
  autoSalvage: number;
}

/** [mail] 받지 않은 우편과 다음 번호 (systems/mail.ts) */
export interface MailPart { mail: Mail[]; mailSeq: number }

/** [daily] 일일 임무와 출석 (systems/daily.ts) */
export interface DailyPart { daily: DailyState }

/** [build] 찍은 능력치와 기술의 강화 단계 (systems/build.ts) */
export interface BuildPart { stats: Record<string, number>; skillLv: Record<string, number> }

/** [away] 자동 사냥을 켜 두었다(이대로 접속이 끊기면 서버가 이어서 사냥한다), 자리 비움 사냥으로 오늘 쓴 시간(초)과 그 날짜 (systems/away.ts) */
export interface AwayPart { auto: boolean; away: { day: string; used: number } }

/** [guild] 속한 길드의 이름 (없으면 빈 문자열). 이름표에 쓴다 */
export interface GuildPart { guild: string }

/** [roster] 가진 영웅: 영웅 id → 레벨, 별, 조각 (systems/roster.ts) */
export interface RosterPart { heroes: Record<string, OwnedHero> }

/** [gacha] 배너마다 천장의 셈과 최근 뽑기 기록 (새 것이 앞. systems/gacha.ts) */
export interface GachaPart { pity: Record<string, number>; pulls: PullLog[] }

/** [squad] 편성한 영웅 id (자리의 차례)와 그 가운데 뒷줄에 둔 영웅 (진형 SQUAD_RULES.rows를 켠 게임만 쓴다. systems/squad.ts) */
export interface SquadPart { squad: string[]; squadBack: string[] }

/** [stages] 지금 단계와 가장 멀리 깬 단계(없으면 ''), 자동 진행 (systems/stages.ts) */
export interface StagesPart { stage: { cur: string; best: string; auto: boolean } }

/** [herogear] 가진 영웅 장비(낀 것 포함)와 다음 번호를 정하는 수 (systems/herogear.ts) */
export interface HeroGearPart { hgear: HeroGearPiece[]; hgSeq: number }

/**
 * [morph] 변신: 가진 캐릭터 정의 id, 지금 변신한 것(없으면 ''), 끝나는 시각(게임 시계, 0이면 스스로 풀 때까지), 다시 변신할 수 있는 시각 (systems/morph.ts)
 */
export interface MorphPart { morph: { own: string[]; on: string; until: number; cdUntil: number } }

/** [modes] 지금 모드의 id(''이면 처음 모드)와 다시 바꿀 수 있는 시각 (게임 시계. systems/modes.ts) */
export interface ModesPart { mode: string; modeCd: number }

/** [achieve] 이름표에 단 칭호 (업적 id, 없으면 빈 문자열. systems/achieve.ts) */
export interface AchievePart { title: string }

/** 모듈의 칸 전부: Ent(./entity.ts)가 이어받는다. 칸은 그 모듈을 고른 게임의 엔티티에만 값이 있다 */
export interface EntParts extends EconomyPart, GrowthPart, ClassesPart, CombatPart, ItemsPart, GearPart, MailPart, DailyPart, BuildPart, AwayPart, GuildPart, RosterPart, GachaPart, SquadPart, StagesPart, HeroGearPart, MorphPart, ModesPart, AchievePart {}

/** 모듈의 칸 하나의 처음 값 채우기. hp는 Game.create가 받은 체력 */
export interface Part {
  init: (e: Ent, hp: number) => void;
  /** 자리를 장애물 밖으로 맞춘 뒤에 (Game.create의 끝): 그 자리에 기대는 칸 */
  placed?: (e: Ent) => void;
}

/** 모듈마다 엔티티에 두는 칸. 칸이 없는 모듈은 적지 않는다. 처음 값은 예전의 Game.create와 같다 */
export const PARTS: { readonly [M in ModuleId]?: Part } = {
  economy: { init: (e) => { e.gold = 0; e.sparks = 0; } },
  growth: { init: (e) => { e.lv = 1; e.exp = 0; e.need = LEVEL.firstNeed; } },
  classes: { init: (e) => { e.cls = ''; } },
  combat: {
    init: (e, hp) => {
      e.hp = hp; e.maxHp = hp; e.targetId = 0; e.atkCd = 0; e.lastHurt = -99; e.cds = []; e.itemCd = 0;
      e.def = null; e.hx = e.x; e.hz = e.z; e.respawn = 0; e.hitters = new Set(); e.swarm = false; e.scale = 0; e.cast = 0; e.windup = 0;
      e.slowUntil = 0; e.stunUntil = 0; e.buffs = []; e.dots = []; e.homing = false;
    },
    // 집은 장애물 밖으로 맞춘 자리다
    placed: (e) => { e.hx = e.x; e.hz = e.z; },
  },
  items: { init: (e) => { e.weapon = ''; e.armor = ''; e.items = {}; } },
  gear: { init: (e) => { e.gear = []; e.worn = {}; e.gearSeq = 0; e.bagUp = 0; e.lostFull = 0; e.autoSalvage = -1; } },
  mail: { init: (e) => { e.mail = []; e.mailSeq = 0; } },
  daily: { init: (e) => { e.daily = { day: '', prog: {}, got: [], streak: 0, last: '' }; } },
  build: { init: (e) => { e.stats = {}; e.skillLv = {}; } },
  away: { init: (e) => { e.auto = false; e.away = { day: '', used: 0 }; } },
  guild: { init: (e) => { e.guild = ''; } },
  roster: { init: (e) => { e.heroes = {}; } },
  gacha: { init: (e) => { e.pity = {}; e.pulls = []; } },
  squad: { init: (e) => { e.squad = []; e.squadBack = []; } },
  stages: { init: (e) => { e.stage = { cur: '', best: '', auto: true }; } },
  herogear: { init: (e) => { e.hgear = []; e.hgSeq = 0; } },
  morph: { init: (e) => { e.morph = { own: [], on: '', until: 0, cdUntil: 0 }; } },
  modes: { init: (e) => { e.mode = ''; e.modeCd = 0; } },
  achieve: { init: (e) => { e.title = ''; } },
};

export type PartKey = keyof EntParts;

/** 칸 → 그 칸을 둔 모듈과, 고르지 않았을 때 읽히는 처음 값을 만드는 것. 아래에서 PARTS를 빈 엔티티에 한 번씩 채워 보고 모은다 */
const OWNER = new Map<string, ModuleId>();
for (const [m, part] of Object.entries(PARTS) as [ModuleId, Part][]) {
  const blank = { x: 0, z: 0 } as Ent;
  part.init(blank, 0);
  for (const k of Object.keys(blank)) if (k !== 'x' && k !== 'z') {
    if (OWNER.has(k)) throw new Error(`엔티티의 칸 '${k}'를 두 모듈(${OWNER.get(k)}, ${m})이 둡니다`);
    OWNER.set(k, m);
  }
}

/** 그 칸을 둔 모듈 (모듈의 칸이 아니면 undefined) */
export const partOwner = (k: string): ModuleId | undefined => OWNER.get(k);

/** 모듈의 칸 전부 (모듈 → 칸 이름들). 시험이 엔티티의 모양을 견주는 데 쓴다 */
export function partKeys(): Map<ModuleId, string[]> {
  const out = new Map<ModuleId, string[]>();
  for (const [k, m] of OWNER) out.set(m, [...(out.get(m) ?? []), k]);
  return out;
}

/** 고르지 않은 모듈의 칸의 처음 값 (읽을 때마다 새로: 배열·묶음을 고쳐도 다른 곳에 번지지 않게). 체력과 집은 0 */
export function blankOf<K extends PartKey>(k: K): Ent[K] {
  const m = OWNER.get(k);
  if (!m) throw new Error(`'${String(k)}'는 모듈의 칸이 아닙니다`);
  const blank = { x: 0, z: 0 } as Ent;
  PARTS[m]!.init(blank, 0);
  return blank[k];
}
