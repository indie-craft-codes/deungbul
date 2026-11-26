import type { BuffMod, DailyState, Gear, Mail, MonsterDef } from '../../shared/defs';
import type { Point } from '../../shared/nav';
import type { Kind } from '../../shared/protocol';
import type { EntExt } from './ext';

/**
 * 월드에 있는 것 하나: 플레이어('p'), 몬스터('m', 전투 모듈), 게임이 등록한 종류(g.defineKind). 게임에만 있는 칸은 EntExt(./ext.ts)에 게임이 더하거나 data에 넣는다.
 * 칸은 핵심(위치·이동·층·체력 자리·이름)과 모듈의 것으로 나뉜다. 모듈의 칸은 그 모듈을 고르지 않은 게임에서도 처음 값으로 있지만 저장되지도 보내지지도 않는다
 */
export interface Ent extends EntExt {
  id: number; kind: Kind; type: string; name: string;
  x: number; z: number; face: number;
  tx: number; tz: number; moving: boolean; stuck: number;
  /** 마지막으로 이동 명령을 받은 시각(게임 시계) */
  lastMove: number;
  /** 마지막으로 스스로 무언가를 한 시각(게임 시계): 명령을 냈거나 몬스터를 때렸다. 서 있기만 한 사람을 게임의 규칙(등불지기의 습격)이 인원에서 빼는 데 쓴다 */
  lastAct: number;
  /** 목표로 가려고 세운 길과, 세울 때의 목표·시각 (engine/shared/nav.ts) */
  path: Point[] | null; pgx: number; pgz: number; pat: number;
  hp: number; maxHp: number; dead: boolean;
  /** 층: 들판의 채널이거나 던전 인스턴스다 (번호의 뜻은 layers.ts). 층이 다르면 서로 보이지 않고 싸우지 않는다 */
  layer: number;
  targetId: number; atkCd: number; lastHurt: number; wait: number;
  /** 게임이 마음대로 쓰는 값 (게임이 등록한 종류의 상태 같은 것). 틀은 읽지 않고 저장하지도 보내지도 않는다: 보낼 값은 종류의 sync가, 저장할 값은 save가 고른다 */
  data: Record<string, unknown>;
  /** 저장에서 읽었지만 이 게임이 고르지 않은 모듈의 칸: 다시 저장할 때 그대로 적는다 (players.ts. engine/shared/modules.ts의 MODULE_SAVES) */
  kept?: { top: Record<string, unknown>; ext: Record<string, unknown> };

  // ---- 플레이어 (핵심) ----
  bot: boolean;
  /** 사람을 가리키는 변하지 않는 값(저장 키). 손님과 봇, 몬스터는 빈 문자열. 길드처럼 접속과 무관하게 사람을 기억해야 하는 곳에 쓴다 */
  pid: string;
  /** 속한 길드의 이름 (없으면 빈 문자열). 이름표에 쓴다 */
  guild: string;
  /** 자동 사냥을 켜 두었다. 이대로 접속이 끊기면 서버가 이어서 사냥한다 (systems/away.ts) */
  auto: boolean;
  // ---- 플레이어 (모듈의 칸: [ ]의 모듈을 고른 게임만 저장하고 보낸다) ----
  /** [growth] 레벨, 경험치, 다음 레벨까지 · [economy] 두 번째 재화 · [combat] 기술 칸의 쿨다운 */
  lv: number; exp: number; need: number; sparks: number; cds: number[];
  /** 성장 수치가 바뀌었다: 본인에게 알려야 한다 */
  dirty: boolean;
  /** 저장할 것이 생겼다 */
  unsaved: boolean;
  /** [classes] 직업 (CLASSES의 키). 아직 고르지 않았으면 빈 문자열 */
  cls: string;
  /** [economy] */
  gold: number;
  /** [items] 든 무기 (ITEMS의 키) */
  weapon: string;
  /** 입은 갑옷. 없으면 빈 문자열 */
  armor: string;
  /** 가진 물약: 아이템 id별 개수 */
  items: Record<string, number>;
  /** 물약을 다시 마실 수 있을 때까지 남은 시간(초) */
  itemCd: number;
  /** [gear] 드롭 장비: 가방에 든 것 전부, 칸마다 낀 것의 uid, 다음 uid를 정하는 번호 (systems/gear.ts) */
  gear: Gear[]; worn: Record<string, number>; gearSeq: number;
  /** 가방을 넓힌 횟수와, 가방이 가득 차 버려진 장비의 수 (가방에 자리가 다시 나면 0으로 돌아간다. systems/bag.ts) */
  bagUp: number; lostFull: number;
  /** 자동 분해: 주운 장비가 이 등급 이하면 그 자리에서 분해한다 (RARITIES의 번호. -1이면 끔. systems/salvage.ts) */
  autoSalvage: number;
  /** [mail] 받지 않은 우편 (systems/mail.ts) */
  mail: Mail[]; mailSeq: number;
  /** [daily] 일일 임무와 출석 (systems/daily.ts) */
  daily: DailyState;
  /** [build] 찍은 능력치와 기술의 강화 단계 (systems/build.ts) */
  stats: Record<string, number>; skillLv: Record<string, number>;
  /** [away] 자리 비움 사냥으로 오늘 쓴 시간(초)과 그 날짜 (systems/away.ts) */
  away: { day: string; used: number };
  /** 이번 접속 전에 비운 시간(ms). 방치 보상을 셈하는 데 쓴다 */
  offMs: number;
  /** 장비·우편·일일 임무가 바뀌었다: 본인에게 알려야 한다 */
  metaDirty: boolean;

  // ---- 몬스터 [combat] ----
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

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 저장에서 읽은 값을 정수로 다듬는다: 수가 아니면 def, 수이면 반올림해 min~max로 자른다 (깨진 값이 섞여도 서버가 죽지 않게) */
export const readInt = (v: unknown, min: number, max: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : def);
/** a 이상 b 이하의 정수 */
export const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** 그 시각의 날짜 'YYYY-MM-DD' (서버 현지 시간, 자정에 바뀐다). 하루 단위로 세는 시스템(일일 임무, 자리 비움 사냥의 하루 몫, 경제 장부)이 함께 쓴다 */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
