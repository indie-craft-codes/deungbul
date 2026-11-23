// 클라이언트가 아는 게임 상태. 모듈들은 이것을 읽고, 서버 메시지를 처리하는 쪽만 고친다.
import { GLOW_START, RESIDENTS, SKILL_SLOTS, maxHpFor, stageOf, type Gear, type Mail, type RankRow, type Stage } from '../../shared/defs';
import type { Point } from '../../shared/nav';
import type { Kind, PartyMember, WorldState } from '../../shared/protocol';
import { AREAS, TOWERS, areaAt, zoneOf } from '../../shared/world';
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
  /** 습격으로 온 적 */
  raid: boolean;
  /** 죽는 연출의 남은 시간 */
  dying: number;
  /** 서버가 시야에서 뺐다: 연출이 끝나면 지운다 */
  gone: boolean;
}

/** 내 캐릭터. 위치는 먼저 예측하고 서버 값(sx, sz)으로 보정한다 */
export interface Me {
  id: number; name: string; model: Model; tag: Tag;
  x: number; z: number; face: number; tx: number; tz: number; moving: boolean; stuck: number; phase: number;
  /** 목표로 가려고 세운 길 (shared/nav.ts) */
  path: Point[] | null; pgx: number; pgz: number; pat: number;
  sx: number; sz: number; srvMoving: boolean; srvTarget: number; lastCmd: number;
  hp: number; maxHp: number; lv: number; exp: number; need: number; sparks: number; contrib: number;
  gold: number; weapon: string; armor: string; items: Record<string, number>; rested: number;
  /** 직업. 아직 고르지 않았으면 빈 문자열 */
  cls: string;
  /** 받은 기여 단계 보상의 수 */
  tier: number;
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
  /** 서버 전체가 공유하는 상태 */
  world: {
    tower: { glow: GLOW_START, glows: TOWERS.map((t) => t.start), residents: RESIDENTS.map(() => 0) },
    keepers: [],
    raid: { phase: 'idle', left: 0, foes: 0, towerHp: 0, towerMaxHp: 0 },
  } as WorldState,
  /** 내 파티의 구성원 (나 포함). 파티가 없으면 비어 있다 */
  party: [] as PartyMember[],
  /** 내 메인 퀘스트 진행: 장, 단계, 진행 수치 */
  quest: { c: 0, s: 0, n: 0 },
  /** 공유 상태를 받은 시각. 남은 시간을 직접 세는 데 쓴다 */
  worldAt: 0,
  /** 기술별 쿨다운이 끝나는 시각과 길이(ms) */
  cdEnd: Array.from({ length: SKILL_SLOTS }, () => 0),
  cdLen: Array.from({ length: SKILL_SLOTS }, () => 1),
  /** 물약을 다시 마실 수 있는 시각과 대기 길이(ms) */
  itemCdEnd: 0,
  /** 내 드롭 장비, 우편, 일일 임무, 전투력 (서버의 meta 메시지) */
  meta: { gear: [] as Gear[], worn: {} as Record<string, number>, mail: [] as Mail[], daily: { prog: {} as Record<string, number>, got: [] as string[], streak: 0 }, power: 0, build: { stats: {} as Record<string, number>, skillLv: {} as Record<string, number>, left: 0 } },
  /** 마지막으로 받은 순위표 */
  rank: { list: [] as RankRow[], me: -1 },
  /** 들어가 있는 던전 (id가 빈 문자열이면 밖). at은 이 상태를 받은 시각 */
  dungeon: { id: '', left: 0, foes: 0, cleared: false, at: 0 },
  /** 자동 사냥이 켜져 있는가 */
  auto: false,
  itemCdLen: 1,
};

/** 내가 있는 구역의 번호 (접속 전에는 첫 구역) */
export const myZone = (): number => zoneOf(S.me?.x ?? 0);
/** 내가 들판이 아닌 지역(던전)에 있는가 */
export const inDungeon = (): boolean => !!S.me && AREAS[areaAt(S.me.x, S.me.z)]?.id !== 'field';
/** 내가 있는 구역의 등탑 밝기 */
export const zoneGlow = (): number => S.world.tower.glows[myZone()] ?? 0;
/** 내가 있는 구역의 등탑 밝기 단계. 이동 속도 예측과 화면 분위기에 쓴다 */
export const stage = (): Stage => stageOf(zoneGlow());
/** 공유 상태의 남은 시간(초)을 지금 기준으로 */
export const raidLeft = (now: number): number => Math.max(0, S.world.raid.left - (now - S.worldAt) / 1000);

export function newMe(id: number, name: string, x: number, z: number, model: Model, tag: Tag): Me {
  return {
    id, name, model, tag, x, z, face: 0, tx: x, tz: z, moving: false, stuck: 0, phase: 0, path: null, pgx: x, pgz: z, pat: 0,
    sx: x, sz: z, srvMoving: false, srvTarget: 0, lastCmd: 0,
    hp: maxHpFor('', 1), maxHp: maxHpFor('', 1), lv: 1, exp: 0, need: 60, sparks: 0, contrib: 0, gold: 0, weapon: '', armor: '', items: {}, rested: 0, cls: '', tier: 0, ready: false, attackId: 0, attackAt: 0, swing: 0,
  };
}
