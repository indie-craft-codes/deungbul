// 징검돌 전술의 규칙: 서버(server/duels.ts), 화면(client/duel.ts의 칸 표시), 시험, 컴퓨터 상대가 함께 쓰는 한 곳.
// 월드와 시간을 모른다: 말의 목록만 받아 셈한다.
import { BOARD, BOARDS, START, TURN, UNITS, UNIT_TYPES, type UnitType } from './content/board';

/** 판 위의 말 하나 (id는 서버가 놓은 엔티티의 id) */
export interface Unit {
  id: number;
  type: UnitType;
  side: 0 | 1;
  c: number; r: number;
  hp: number;
  /** 이번 차례에 걸었다 / 쳤다 (치면 그 말의 차례는 끝난다) */
  moved: boolean;
  acted: boolean;
}
export interface Cell { c: number; r: number }

const N = BOARD.size;
export const inBoard = (c: number, r: number): boolean => Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < N && r < N;
export const isRock = (c: number, r: number): boolean => BOARD.rocks.some(([rc, rr]) => rc === c && rr === r);
export const isLamp = (c: number, r: number): boolean => BOARD.lamp[0] === c && BOARD.lamp[1] === r;
export const gap = (a: Cell, b: Cell): number => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
export const alive = (units: readonly Unit[]): Unit[] => units.filter((u) => u.hp > 0);
const occupied = (units: readonly Unit[], c: number, r: number): boolean => units.some((u) => u.hp > 0 && u.c === c && u.r === r);
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** 처음 놓는 말들: 왼쪽 진영의 자리와 그 점대칭 (id는 놓을 때 채운다) */
export function startUnits(): Omit<Unit, 'id'>[] {
  const out: Omit<Unit, 'id'>[] = [];
  for (const side of [0, 1] as const) {
    for (const s of START) {
      const c = side ? N - 1 - s.c : s.c, r = side ? N - 1 - s.r : s.r;
      out.push({ type: s.type, side, c, r, hp: UNITS[s.type].hp, moved: false, acted: false });
    }
  }
  return out;
}

/** 그 말이 이번 차례에 갈 수 있는 칸과 그 칸까지의 길 (바위·말은 지나지 못한다). 이미 걸었거나 쳤으면 없다 */
export function reach(units: readonly Unit[], u: Unit): Map<string, Cell[]> {
  const out = new Map<string, Cell[]>();
  if (u.hp <= 0 || u.moved || u.acted) return out;
  const move = UNITS[u.type].move;
  let front: { c: number; r: number; path: Cell[] }[] = [{ c: u.c, r: u.r, path: [] }];
  const seen = new Set([`${u.c},${u.r}`]);
  for (let step = 0; step < move; step++) {
    const next: typeof front = [];
    for (const f of front) {
      for (const [dc, dr] of STEPS) {
        const c = f.c + dc, r = f.r + dr, k = `${c},${r}`;
        if (!inBoard(c, r) || seen.has(k) || isRock(c, r) || occupied(units, c, r)) continue;
        seen.add(k);
        const path = [...f.path, { c, r }];
        out.set(k, path);
        next.push({ c, r, path });
      }
    }
    front = next;
  }
  return out;
}

/** 칠 거리인가 (거리만: 이미 쳤는지, 같은 편인지는 보지 않는다) */
export const inRange = (u: Unit, at: Cell, foe: Cell): boolean => { const d = gap(at, foe), def = UNITS[u.type]; return d >= def.min && d <= def.max; };

/** 그 말이 지금 칠 수 있는 적 */
export function targets(units: readonly Unit[], u: Unit): Unit[] {
  if (u.hp <= 0 || u.acted) return [];
  return units.filter((t) => t.hp > 0 && t.side !== u.side && inRange(u, u, t));
}

/**
 * a가 b를 칠 때의 피해: 방패돌은 2칸 이상 떨어진 곳에서 맞으면 덜 받는다. opener(첫 바퀴의 나중 편)는 TURN.openerSoften만큼 덜 준다. 그래도 1은 준다.
 * 첫 바퀴 보정의 까닭: 먼저 두는 편은 다가가야 하고, 다가온 말을 나중 편이 먼저 친다 (보정 없이 컴퓨터끼리 두면 나중 편이 약 89% 이긴다: docs/proof-stepstone.md)
 */
export function damage(a: Unit, b: Unit, from: Cell = a, opener = false): number {
  const guard = gap(from, b) >= 2 ? UNITS[b.type].guardFar ?? 0 : 0;
  return Math.max(1, UNITS[a.type].atk - guard - (opener ? TURN.openerSoften : 0));
}

/** 그 편에 이번 차례에 할 수 있는 일이 남았는가 (걷기나 치기) */
export function anyAction(units: readonly Unit[], side: 0 | 1): boolean {
  return units.some((u) => u.side === side && u.hp > 0 && (targets(units, u).length > 0 || reach(units, u).size > 0));
}
export const hpSum = (units: readonly Unit[], side: 0 | 1): number => units.reduce((s, u) => s + (u.side === side ? Math.max(0, u.hp) : 0), 0);
/** 한쪽 말이 모두 쓰러졌으면 이긴 편, 아니면 -1 */
export function knockout(units: readonly Unit[]): -1 | 0 | 1 {
  const a = units.some((u) => u.side === 0 && u.hp > 0), b = units.some((u) => u.side === 1 && u.hp > 0);
  return a && !b ? 0 : b && !a ? 1 : -1;
}
/** 차례 수를 다 썼을 때: 남은 체력이 많은 편, 같으면 2(비김) */
export function byHp(units: readonly Unit[]): 0 | 1 | 2 {
  const a = hpSum(units, 0), b = hpSum(units, 1);
  return a > b ? 0 : b > a ? 1 : 2;
}

// ---------- 컴퓨터 상대 ----------

export type Step = { a: 'move'; u: number; c: number; r: number } | { a: 'hit'; u: number; t: number } | { a: 'end' };

/** 다음 차례에 그 칸을 칠 수 있는 적의 피해 합 (걷고 치는 거리로 어림한다) */
function threat(units: readonly Unit[], side: 0 | 1, at: Cell, me: Unit): number {
  let sum = 0;
  for (const f of units) {
    if (f.hp <= 0 || f.side === side) continue;
    const def = UNITS[f.type];
    // 투석돌처럼 멀리서만 치는 적은 방패돌의 덜 받기가 든다
    if (gap(f, at) <= def.move + def.max) sum += Math.max(1, def.atk - (def.min >= 2 ? UNITS[me.type].guardFar ?? 0 : 0));
  }
  return sum;
}

/** 그 칸에 선 말의 값어치: 칠 수 있는 적이 있으면 크게(쓰러뜨리면 더), 없으면 가까운 적에게 다가갈수록, 위협은 빼고, 등불돌은 조금 더 */
function spotScore(units: readonly Unit[], u: Unit, at: Cell): number {
  const foes = units.filter((t) => t.hp > 0 && t.side !== u.side);
  if (!foes.length) return 0;
  let best = -Infinity;
  for (const f of foes) {
    if (inRange(u, at, f)) { const d = damage(u, f, at); best = Math.max(best, 100 + d * 10 + (d >= f.hp ? 50 : 0) - f.hp); }
  }
  if (best === -Infinity) {
    const near = Math.min(...foes.map((f) => Math.max(0, gap(at, f) - UNITS[u.type].max)));
    best = -near * 4;
  }
  const fragile = UNITS[u.type].hp <= 6 ? 3 : 1;
  return best - threat(units, u.side, at, u) * fragile + (isLamp(at.c, at.r) ? 3 : 0);
}

/**
 * 컴퓨터의 한 수: 쓰러뜨릴 수 있는 적부터 치고, 칠 수 없으면 더 나은 칸으로 걷고, 할 것이 없으면 차례를 넘긴다.
 * 말의 목록에만 기대므로 같은 판이면 같은 수를 둔다 (시험이 끝까지 두어 본다). 한 수마다 판이 바뀌거나 'end'라 끝없이 돌지 않는다.
 * rng를 주면 점수가 가장 좋은 수에 가까운 수들 가운데 하나를 고른다 (컴퓨터끼리 여러 판을 두어 승률을 재는 시험: 늘 같은 판이 되지 않게)
 */
export function aiStep(units: readonly Unit[], side: 0 | 1, rng?: () => number, opener = false): Step {
  const pick = <T extends { v: number }>(list: T[], spread: number): T | null => {
    if (!list.length) return null;
    const best = Math.max(...list.map((x) => x.v));
    const near = list.filter((x) => x.v >= best - (rng ? spread : 0));
    return rng ? near[Math.floor(rng() * near.length) % near.length] : near[0];
  };
  const mine = units.filter((u) => u.side === side && u.hp > 0);
  // 1. 칠 수 있으면: 쓰러뜨리는 것 → 큰 피해 → 체력이 낮은 적
  const hits: { u: Unit; t: Unit; v: number }[] = [];
  for (const u of mine) {
    for (const t of targets(units, u)) {
      const d = damage(u, t, u, opener);
      hits.push({ u, t, v: (d >= t.hp ? 1000 : 0) + d * 10 - t.hp });
    }
  }
  const hit = pick(hits, 4);
  if (hit) return { a: 'hit', u: hit.u.id, t: hit.t.id };
  // 2. 걸어서 나아지는 말: 지금 칸보다 점수가 높은 칸 가운데 가장 좋은 곳
  const walks: { u: Unit; c: number; r: number; v: number }[] = [];
  for (const u of mine) {
    const here = spotScore(units, u, u);
    for (const [, path] of reach(units, u)) {
      const to = path[path.length - 1], moved = units.map((x) => (x.id === u.id ? { ...x, c: to.c, r: to.r } : x));
      const gain = spotScore(moved, { ...u, c: to.c, r: to.r }, to) - here;
      if (gain > 0) walks.push({ u, c: to.c, r: to.r, v: gain });
    }
  }
  const walk = pick(walks, 3);
  if (walk) return { a: 'move', u: walk.u.id, c: walk.c, r: walk.r };
  return { a: 'end' };
}

// ---------- 판의 자리 (월드 좌표) ----------

const U = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }, V = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
/** 칸 (c, r)의 가운데 (판 b). 판은 45° 돌아 있다: c가 늘면 화면의 오른쪽, r이 늘면 화면의 아래 */
export function cellPos(b: number, c: number, r: number): { x: number; z: number } {
  const o = BOARDS[b], k = BOARD.tile, du = (c - (N - 1) / 2) * k, dv = (r - (N - 1) / 2) * k;
  return { x: o.x + du * U.x + dv * V.x, z: o.z + du * U.z + dv * V.z };
}
/** 월드의 점 → 판 b의 칸 (판 밖이면 null) */
export function cellAt(b: number, x: number, z: number): Cell | null {
  const o = BOARDS[b], k = BOARD.tile, dx = x - o.x, dz = z - o.z;
  const c = Math.round((dx * U.x + dz * U.z) / k + (N - 1) / 2), r = Math.round((dx * V.x + dz * V.z) / k + (N - 1) / 2);
  return inBoard(c, r) ? { c, r } : null;
}
/** 두는 사람이 서는 자리: 왼쪽 진영은 판의 왼쪽 밖, 오른쪽은 오른쪽 밖 (가운데 줄) */
export function seatPos(b: number, side: 0 | 1): { x: number; z: number } {
  return cellPos(b, side ? N - 1 + BOARD.seat : -BOARD.seat, (N - 1) / 2);
}
/** 바라보는 방향(틀의 face: atan2(dx, dz)) */
export const faceTo = (from: { x: number; z: number }, to: { x: number; z: number }): number => Math.atan2(to.x - from.x, to.z - from.z);
/** 말 종류의 줄 위 번호 */
export const typeIndex = (t: UnitType): number => UNIT_TYPES.indexOf(t);
