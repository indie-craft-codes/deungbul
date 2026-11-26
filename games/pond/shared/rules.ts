// 반딧불 연못의 규칙 (서버와 시험이 함께 읽는다: 틀에 기대지 않는 순수한 셈)
//
// - 넷이 연못을 둘러앉는다. 미끼 패 1~10이 넷씩(40장), 한 사람에게 여덟 장. 손패는 자기만 본다.
// - 연못의 나루 셋에 물고기가 한 마리씩 있다 (크기 = 점수 1~5).
// - 한 번의 '던지기': 선 낚시꾼부터 차례로 한 사람이 미끼 한 장을 **엎어서** 나루 하나에 던진다(누가 어디에 던졌는지는 모두 보지만 수는 모른다).
// - 모두 던지면 펼친다. 나루마다: **같은 수의 미끼는 서로 얽혀 빠진다.** 남은 미끼 가운데 가장 큰 수가 그 물고기를 낚는다.
//   단 **물고기는 제 크기보다 작은 미끼는 물지 않는다** (가장 큰 미끼 < 크기면 아무도 못 낚는다: 자리 차례의 쏠림을 잡은 규칙, docs/proof-pond.md).
//   미끼가 없거나 모두 얽힌 나루의 물고기는 1 자란다(8까지). 낚인 자리에는 새 물고기가 온다.
// - 던지기마다 선 낚시꾼이 왼쪽으로 한 자리 옮긴다(여덟 번이면 누구나 두 번씩 선, 두 번씩 끝). 여덟 번 던지면 끝: 점수가 가장 많은 사람이 이긴다
//   (같으면 낚은 물고기가 많은 사람, 그래도 같으면 비김).
import { POND } from './content/pond';

/** 이번 던지기에 던진 미끼 하나 */
export interface Placed { spot: number; value: number }
/** 펼친 결과: 나루마다 던진 미끼([자리, 수]), 낚은 자리(-1 없음), 그 물고기의 크기, 얽힌 수들 */
export interface SpotResult { baits: [seat: number, value: number][]; win: number; fish: number; tangled: number[] }
export interface Reveal { n: number; spots: SpotResult[] }

/** 판 상태 (서버의 room.data). 저장할 때도 이 모양 그대로 (엔티티 id는 따로) */
export interface Board {
  /** 난수의 상태 (패 섞기, 새 물고기, 컴퓨터의 흔들림): 저장하면 다시 켜도 같은 판이 이어진다 */
  rng: number;
  hands: number[][];
  fish: number[];
  scores: number[];
  caught: number[];
  /** 몇째 던지기 (1부터) */
  cast: number;
  /** 이번 던지기의 선 낚시꾼 */
  leader: number;
  /** 자리마다 이번 던지기에 던진 미끼 (안 던졌으면 null) */
  placed: (Placed | null)[];
  /** 이번 던지기에 던진 차례 (자리들) */
  order: number[];
  /** 지금까지 펼쳐진 미끼의 수들 (모두가 아는 것) */
  seen: number[];
  last: Reveal | null;
  done: boolean;
}

// ---------- 난수 ----------

/** mulberry32 한 걸음: 0 이상 1 미만 (상태는 b.rng에) */
export function rand(b: { rng: number }): number {
  let t = (b.rng = (b.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function drawFish(b: { rng: number }): number {
  const total = POND.fishWeights.reduce((s, [, w]) => s + w, 0);
  let r = rand(b) * total;
  for (const [v, w] of POND.fishWeights) { r -= w; if (r < 0) return v; }
  return POND.fishWeights[0][0];
}

/** 미끼 패 한 벌 (1~10이 넷씩) */
export function fullDeck(): number[] {
  const d: number[] = [];
  for (let v = 1; v <= POND.deckMax; v++) for (let k = 0; k < POND.deckCopies; k++) d.push(v);
  return d;
}

/** 새 판: 섞어서 여덟 장씩 나누고 물고기 셋을 놓는다. 선은 자리 0 */
export function newBoard(seed: number, seats = POND.seats): Board {
  const b: Board = {
    rng: seed | 0, hands: [], fish: [], scores: Array(seats).fill(0), caught: Array(seats).fill(0), cast: 1, leader: 0,
    placed: Array(seats).fill(null), order: [], seen: [], last: null, done: false,
  };
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand(b) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  for (let s = 0; s < seats; s++) b.hands.push(deck.slice(s * POND.hand, (s + 1) * POND.hand).sort((x, y) => x - y));
  for (let i = 0; i < POND.spots.length; i++) b.fish.push(drawFish(b));
  return b;
}

// ---------- 차례 ----------

/** 살아 있는(기권·몰수하지 않은) 자리 가운데 from부터 돌며 처음 것 (없으면 -1) */
export function nextLive(live: readonly boolean[], from: number): number {
  const n = live.length;
  for (let k = 0; k < n; k++) { const i = (((from + k) % n) + n) % n; if (live[i]) return i; }
  return -1;
}

/** 이번 던지기에서 다음에 던질 자리 (모두 던졌거나 판이 끝났으면 -1) */
export function expected(b: Board, live: readonly boolean[]): number {
  if (b.done) return -1;
  if (!b.order.length) return nextLive(live, b.leader);
  const n = live.length, lastSeat = b.order[b.order.length - 1];
  for (let k = 1; k <= n; k++) { const i = (lastSeat + k) % n; if (live[i] && !b.placed[i]) return i; }
  return -1;
}

/** 모두 던졌는가 (살아 있는 자리 모두) */
export const castFull = (b: Board, live: readonly boolean[]): boolean => b.order.length > 0 && live.every((l, i) => !l || !!b.placed[i]);

/** 자리 seat가 손패의 수 value를 나루 spot에 엎어 던진다. 되면 참 */
export function place(b: Board, live: readonly boolean[], seat: number, value: number, spot: number): boolean {
  if (expected(b, live) !== seat) return false;
  if (!Number.isInteger(spot) || spot < 0 || spot >= POND.spots.length) return false;
  const hand = b.hands[seat], at = hand.indexOf(value);
  if (at < 0) return false;
  hand.splice(at, 1);
  b.placed[seat] = { spot, value };
  b.order.push(seat);
  return true;
}

/** 한 나루를 펼친다: 같은 수는 얽혀 빠지고 남은 것 가운데 가장 큰 수가 낚는다 */
export function resolveSpot(baits: readonly [number, number][], fish: number): { win: number; tangled: number[] } {
  const count = new Map<number, number>();
  for (const [, v] of baits) count.set(v, (count.get(v) ?? 0) + 1);
  const tangled = [...count].filter(([, n]) => n > 1).map(([v]) => v).sort((x, y) => x - y);
  let win = -1, best = -1;
  for (const [seat, v] of baits) if (count.get(v) === 1 && v > best) { best = v; win = seat; }
  // 물고기는 제 크기보다 작은 미끼는 물지 않는다
  if (best < fish) win = -1;
  return { win, tangled };
}

/** 모두 던졌으면 펼친다: 점수, 물고기, 다음 선. 끝나면 done */
export function reveal(b: Board, live: readonly boolean[]): Reveal {
  const spots: SpotResult[] = POND.spots.map((_, s) => {
    const baits: [number, number][] = b.order.filter((i) => b.placed[i]!.spot === s).map((i) => [i, b.placed[i]!.value]);
    const { win, tangled } = resolveSpot(baits, b.fish[s]);
    return { baits, win, fish: b.fish[s], tangled };
  });
  spots.forEach((r, s) => {
    if (r.win >= 0) { b.scores[r.win] += r.fish; b.caught[r.win]++; b.fish[s] = drawFish(b); }
    else b.fish[s] = Math.min(POND.fishMax, b.fish[s] + 1);
  });
  for (const i of b.order) b.seen.push(b.placed[i]!.value);
  const res: Reveal = { n: b.cast, spots };
  b.last = res;
  b.placed = b.placed.map(() => null);
  b.order = [];
  b.cast++;
  b.leader = nextLive(live, b.leader + 1);
  if (b.cast > POND.hand || b.leader < 0) b.done = true;
  return res;
}

/** 순위 (살아 있는 자리만: 점수, 낚은 수의 차례). [자리, 등수(1부터, 같으면 같은 등수)] */
export function ranking(b: Board, live: readonly boolean[]): [seat: number, rank: number][] {
  const seats = live.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  const key = (i: number) => b.scores[i] * 100 + b.caught[i];
  seats.sort((x, y) => key(y) - key(x));
  return seats.map((i) => [i, 1 + seats.filter((j) => key(j) > key(i)).length]);
}

/** 이긴 자리 (1등이 여럿이면 -2: 비김) */
export function winner(b: Board, live: readonly boolean[]): number {
  const r = ranking(b, live), top = r.filter(([, k]) => k === 1);
  return top.length === 1 ? top[0][0] : -2;
}

// ---------- 컴퓨터 ----------

/** 컴퓨터가 아는 것 (그 자리가 볼 수 있는 것만: 남의 손패와 엎은 미끼의 수는 모른다) */
export interface Sight {
  hand: readonly number[];
  fish: readonly number[];
  /** 남이 이번 던지기에 엎어 던진 나루들 */
  others: readonly number[];
  /** 나 뒤에 아직 던질 사람 수 */
  later: number;
  /** 펼쳐진 수들 */
  seen: readonly number[];
  /** 남은 던지기 수 (이번 것 포함) */
  castsLeft: number;
}

export function sightOf(b: Board, live: readonly boolean[], seat: number): Sight {
  const others = b.order.filter((i) => i !== seat).map((i) => b.placed[i]!.spot);
  const later = live.filter((l, i) => l && i !== seat && !b.placed[i]).length;
  return { hand: b.hands[seat], fish: b.fish, others, later, seen: b.seen, castsLeft: POND.hand - b.cast + 1 };
}

/**
 * 컴퓨터의 한 수: 손패의 수마다, 나루마다 이길 가능성을 어림해(모르는 미끼는 아직 보지 못한 패에서 뽑아 본다) 얻는 점수 − 그 패를 쓰는 값.
 * r은 0~1의 난수 (뽑아 보기와 흔들림)
 */
export function choose(s: Sight, r: () => number, samples = 40): Placed {
  const pool = fullDeck();
  const drop = (v: number) => { const k = pool.indexOf(v); if (k >= 0) pool.splice(k, 1); };
  for (const v of s.hand) drop(v);
  for (const v of s.seen) drop(v);
  const pick = () => pool[Math.floor(r() * pool.length)];
  const fishW = s.fish.map((f) => f + 0.6), fishSum = fishW.reduce((a, b) => a + b, 0);
  const spotOf = () => { let x = r() * fishSum; for (let k = 0; k < fishW.length; k++) { x -= fishW[k]; if (x < 0) return k; } return fishW.length - 1; };
  const values = [...new Set(s.hand)];
  const wins = new Map<string, number>();
  for (let n = 0; n < samples; n++) {
    // 남의 엎은 미끼와 뒤에 던질 사람들의 미끼를 하나 그려 본다
    const baits: [number, number][][] = s.fish.map(() => []);
    s.others.forEach((sp, k) => baits[sp].push([k + 1, pick()]));
    for (let k = 0; k < s.later; k++) baits[spotOf()].push([10 + k, pick()]);
    for (const v of values) for (let sp = 0; sp < s.fish.length; sp++) {
      if (resolveSpot([...baits[sp], [0, v]], s.fish[sp]).win === 0) wins.set(`${v}:${sp}`, (wins.get(`${v}:${sp}`) ?? 0) + 1);
    }
  }
  // 패를 쓰는 값: 남은 던지기가 많을수록 큰 패를 아낀다 (마지막 던지기에는 0)
  const keep = s.castsLeft > 1 ? 0.3 + 0.02 * s.castsLeft : 0;
  let best: Placed = { value: s.hand[0], spot: 0 }, bestU = -Infinity;
  for (const v of values) for (let sp = 0; sp < s.fish.length; sp++) {
    const u = ((wins.get(`${v}:${sp}`) ?? 0) / samples) * s.fish[sp] - keep * v + r() * 0.25;
    if (u > bestU) { bestU = u; best = { value: v, spot: sp }; }
  }
  return best;
}
