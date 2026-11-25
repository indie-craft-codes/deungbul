// 클라이언트가 아는 게임 상태. 모듈들은 이것을 읽고, 서버 메시지를 처리하는 쪽만 고친다.
// 틀의 상태만 둔다: 게임에만 있는 상태(이 게임에서는 등탑·습격의 공유 상태와 내 퀘스트·기여)는 게임의 상태 파일에 있다 (games/deungbul/client/state.ts).
import { GEAR, SKILL_SLOTS, maxHpFor, needFor, type Gear, type GuildView, type Mail, type RankRow } from '../shared/defs';
import type { Point } from '../shared/nav';
import type { Kind, PartyMember } from '../shared/protocol';
import { areaAt } from '../shared/world';
import type { Tag } from './hud/tags';
import type { Model } from './scene/models';

export interface Sample { t: number; x: number; z: number; face: number; moving: boolean }

/** 서버가 알려 준 다른 엔티티 (플레이어, 몬스터) */
export interface Remote {
  id: number; kind: Kind; type: string; name: string; model: Model; tag: Tag; h: number;
  /** 받은 스냅샷들. 조금 과거 시점을 보간해서 그린다 */
  buf: Sample[];
  x: number; z: number; face: number; walking: boolean; phase: number;
  hp: number; maxHp: number; swing: number;
  /** 든 무기와 직업 (플레이어만) */
  weapon: string; cls: string;
  /** 입은 갑옷 (플레이어만) */
  armor: string;
  /** 몰려온 적 (게임의 규칙이 부른 적: 이름 앞에 게임의 말을 붙인다) */
  swarm: boolean;
  /** 죽는 연출의 남은 시간 */
  dying: number;
  /** 서버가 시야에서 뺐다: 연출이 끝나면 지운다 */
  gone: boolean;
}

/** 내 캐릭터. 위치는 먼저 예측하고 서버 값(sx, sz)으로 보정한다 */
export interface Me {
  id: number; name: string; model: Model; tag: Tag;
  x: number; z: number; face: number; tx: number; tz: number; moving: boolean; stuck: number; phase: number;
  /** 목표로 가려고 세운 길 (engine/shared/nav.ts) */
  path: Point[] | null; pgx: number; pgz: number; pat: number;
  sx: number; sz: number; srvMoving: boolean; srvTarget: number; lastCmd: number;
  hp: number; maxHp: number; lv: number; exp: number; need: number; sparks: number;
  gold: number; weapon: string; armor: string; items: Record<string, number>;
  /** 직업. 아직 고르지 않았으면 빈 문자열 */
  cls: string;
  /** 서버에서 내 수치를 한 번이라도 받았다 */
  ready: boolean;
  attackId: number; attackAt: number; swing: number;
}

export const S = {
  me: null as Me | null,
  others: new Map<number, Remote>(),
  online: 0,
  pingMs: -1,
  zoom: 1,
  /** 내 파티의 구성원 (나 포함). 파티가 없으면 비어 있다 */
  party: [] as PartyMember[],
  /** 기술별 쿨다운이 끝나는 시각과 길이(ms) */
  cdEnd: Array.from({ length: SKILL_SLOTS }, () => 0),
  cdLen: Array.from({ length: SKILL_SLOTS }, () => 1),
  /** 물약을 다시 마실 수 있는 시각과 대기 길이(ms) */
  itemCdEnd: 0,
  /** 내 드롭 장비, 우편, 일일 임무, 전투력 (서버의 meta 메시지) */
  meta: { gear: [] as Gear[], worn: {} as Record<string, number>, mail: [] as Mail[], daily: { prog: {} as Record<string, number>, got: [] as string[], streak: 0 }, power: 0, build: { stats: {} as Record<string, number>, skillLv: {} as Record<string, number>, left: 0 } },
  /** 내 길드(없으면 null)와 받은 초대 */
  guild: null as GuildView | null,
  guildInvite: null as { name: string; from: string } | null,
  /** 엔티티별 길드 이름 (이름표에 붙인다) */
  gtags: new Map<number, string>(),
  /** 마지막으로 받은 순위표 */
  rank: { list: [] as RankRow[], me: -1 },
  /** 들어가 있는 던전 (id가 빈 문자열이면 밖). at은 이 상태를 받은 시각 */
  dungeon: { id: '', left: 0, foes: 0, cleared: false, at: 0 },
  /** 자동 사냥이 켜져 있는가 */
  auto: false,
  itemCdLen: 1,
  /** 장비 가방: 칸 수, 넓힌 횟수, 가득 차 버려진 장비의 수 (서버의 개인 상태 bag). known: 서버에서 한 번이라도 받았다 (옛 서버는 보내지 않는다: 넓히기 단추를 그리지 않는다) */
  bag: { max: GEAR.bagMax, up: 0, lost: 0, known: false },
  /** 분해: 이 게임에 분해가 있는가와 자동 분해의 설정 (서버의 개인 상태 salvage. -1이면 끔) */
  salvage: { on: false, auto: -1 },
  /** 나에게 걸린 강화: 기술 id → 끝나는 시각(performance.now 기준 ms). 서버의 'buff' 사건으로 받는다 */
  buffs: new Map<string, number>(),
};

/** 내가 들판이 아닌 지역(던전)에 있는가. 들판은 0번 지역이다 (MapDef.areas의 약속): 지역의 id는 게임이 붙이는 이름이라 틀은 읽지 않는다 */
export const inDungeon = (): boolean => !!S.me && areaAt(S.me.x, S.me.z) !== 0;

export function newMe(id: number, name: string, x: number, z: number, model: Model, tag: Tag): Me {
  return {
    id, name, model, tag, x, z, face: 0, tx: x, tz: z, moving: false, stuck: 0, phase: 0, path: null, pgx: x, pgz: z, pat: 0,
    sx: x, sz: z, srvMoving: false, srvTarget: 0, lastCmd: 0,
    hp: maxHpFor('', 1), maxHp: maxHpFor('', 1), lv: 1, exp: 0, need: needFor(1), sparks: 0, gold: 0, weapon: '', armor: '', items: {}, cls: '', ready: false, attackId: 0, attackAt: 0, swing: 0,
  };
}
