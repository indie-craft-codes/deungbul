import type { DailyState, Gear, Mail, MonsterDef } from '../../shared/defs';
import type { Point } from '../../shared/nav';
import type { Kind } from '../../shared/protocol';
import type { EntExt } from './ext';

/** 월드에 있는 것 하나: 플레이어 또는 몬스터. 게임에만 있는 칸은 EntExt(./ext.ts)에 게임이 더한다 */
export interface Ent extends EntExt {
  id: number; kind: Kind; type: string; name: string;
  x: number; z: number; face: number;
  tx: number; tz: number; moving: boolean; stuck: number;
  /** 마지막으로 이동 명령을 받은 시각(게임 시계) */
  lastMove: number;
  /** 마지막으로 스스로 무언가를 한 시각(게임 시계): 명령을 냈거나 몬스터를 때렸다. 서 있기만 한 사람을 습격의 인원에서 빼는 데 쓴다 */
  lastAct: number;
  /** 목표로 가려고 세운 길과, 세울 때의 목표·시각 (shared/nav.ts) */
  path: Point[] | null; pgx: number; pgz: number; pat: number;
  hp: number; maxHp: number; dead: boolean;
  /** 층: 들판의 채널이거나 던전 인스턴스다 (번호의 뜻은 layers.ts). 층이 다르면 서로 보이지 않고 싸우지 않는다 */
  layer: number;
  targetId: number; atkCd: number; lastHurt: number; wait: number;

  // ---- 플레이어 ----
  bot: boolean;
  /** 사람을 가리키는 변하지 않는 값(저장 키). 손님과 봇, 몬스터는 빈 문자열. 길드처럼 접속과 무관하게 사람을 기억해야 하는 곳에 쓴다 */
  pid: string;
  /** 속한 길드의 이름 (없으면 빈 문자열). 이름표에 쓴다 */
  guild: string;
  /** 자동 사냥을 켜 두었다. 이대로 접속이 끊기면 서버가 이어서 사냥한다 (systems/away.ts) */
  auto: boolean;
  lv: number; exp: number; need: number; sparks: number; cds: number[];
  /** 지금까지 바친 불씨 (누적 기여) */
  contrib: number;
  /** 성장 수치가 바뀌었다: 본인에게 알려야 한다 */
  dirty: boolean;
  /** 저장할 것이 생겼다 */
  unsaved: boolean;
  /** 받은 기여 단계 보상의 수 */
  tier: number;
  /** 직업 (CLASSES의 키). 아직 고르지 않았으면 빈 문자열 */
  cls: string;
  gold: number;
  /** 든 무기 (ITEMS의 키) */
  weapon: string;
  /** 입은 갑옷. 없으면 빈 문자열 */
  armor: string;
  /** 가진 물약: 아이템 id별 개수 */
  items: Record<string, number>;
  /** 물약을 다시 마실 수 있을 때까지 남은 시간(초) */
  itemCd: number;
  /** 남은 휴식 보너스 (등불 맡기기) */
  rested: number;
  /** 드롭 장비: 가방에 든 것 전부, 칸마다 낀 것의 uid, 다음 uid를 정하는 번호 (systems/gear.ts) */
  gear: Gear[]; worn: Record<string, number>; gearSeq: number;
  /** 받지 않은 우편 (systems/mail.ts) */
  mail: Mail[]; mailSeq: number;
  /** 일일 임무와 출석 (systems/daily.ts) */
  daily: DailyState;
  /** 찍은 능력치와 기술의 강화 단계 (systems/build.ts) */
  stats: Record<string, number>; skillLv: Record<string, number>;
  /** 자리 비움 사냥으로 오늘 쓴 시간(초)과 그 날짜 (systems/away.ts) */
  away: { day: string; used: number };
  /** 이번 접속 전에 비운 시간(ms). 방치 보상을 셈하는 데 쓴다 */
  offMs: number;
  /** 장비·우편·일일 임무가 바뀌었다: 본인에게 알려야 한다 */
  metaDirty: boolean;
  /** 메인 퀘스트: 장, 단계, 진행 수치 */
  qc: number; qs: number; qn: number;
  /** 퀘스트 진행이 바뀌었다: 본인에게 알려야 한다 */
  questDirty: boolean;

  // ---- 몬스터 ----
  def: MonsterDef | null;
  /** 집(생성 위치) */
  hx: number; hz: number;
  respawn: number;
  /** 피해를 준 플레이어들 */
  hitters: Set<number>;
  /** 습격으로 나타난 적: 등탑으로 향하고, 죽으면 다시 나오지 않는다 */
  raid: boolean;
  /** 필드 보스: 체력에 반영한 인원, 다음 내려치기까지 남은 시간, 예고 중이면 남은 시간 */
  scale: number; cast: number; windup: number;
  /** 이 시각(게임 시계)까지 느려져 있다 */
  slowUntil: number;
  /** 너무 멀리 끌려 나와 집으로 돌아가는 중 (몬스터). 그동안은 싸우지 않고 회복한다 */
  homing: boolean;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** a 이상 b 이하의 정수 */
export const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
