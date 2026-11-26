// 반딧불 연못의 서버: 틀의 판 모듈(g.rooms)에 판의 규칙을 준다. 규칙의 셈은 shared/rules.ts(순수), 여기는 판·엔티티·명령·보내는 상태·저장.
//
// 틀과 맞춘 것 (docs/proof-pond.md '게임 안의 꼼수'):
// - 틀의 차례는 자리 0, 1, 2, 3 …으로 돌고 바퀴의 시작은 room.first다. 던지기마다 선이 한 자리씩 옮기므로, 펼칠 때 room.first를 새 선으로 바꾸고
//   차례가 선이 아닌 자리에서 시작하면 turnStart에서 곧바로 넘긴다(g.rooms.pass). 그러면 틀의 '바퀴'가 곧 던지기의 번호다.
// - 펼치기는 마지막 사람이 던진 차례의 끝(turnEnd)에서 한다. 기권·몰수로 빠진 자리는 기다리지 않는다.
import { readInt, type Ent, type Game, type Room } from '@engine/server';
import { MAP as viaAlias } from '@game/shared/content';
import { MAP } from '../shared/content';
import { POND, baitSpot, seatSpot } from '../shared/content/pond';
import type { PondRecord, PondView } from '../shared/pond';
import { castFull, choose, expected, newBoard, place, rand, ranking, reveal, sightOf, winner, type Board, type Placed } from '../shared/rules';

// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가 (tsx에 --tsconfig games/pond/tsconfig.json을 주지 않으면 다른 게임의 내용으로 조용히 뜬다)
if (MAP !== viaAlias) throw new Error('별칭 @game이 games/pond를 가리키지 않습니다. tsx --tsconfig games/pond/tsconfig.json 으로 실행하세요 (node scripts/game.mjs start pond)');

declare module '@engine/server/game/ext' {
  interface GameSystems { pond: Pond }
  interface EntExt { pondRec: PondRecord }
}

/** 판 상태: 규칙의 판 + 판에 놓은 엔티티의 id (저장하지 않는다: load가 다시 놓는다) */
export interface Table extends Board {
  fishEnt: number[];
  /** 자리마다 이번 던지기의 찌 (0 없음) */
  baitEnt: number[];
  /** 펼쳐 보이는 중인 찌들: 다음 던지기의 첫 미끼에서 치운다 */
  shown: number[];
  /** 컴퓨터 자리마다 서 있는 낚시꾼 */
  anglers: number[];
  /** 펼친 뒤 컴퓨터가 쉬는 때까지 (g.now) */
  pauseUntil: number;
}

/** 새 판의 씨앗 (시험이 정해진 값으로 바꾼다) */
export const pondSeed = { next: (): number => Math.floor(Math.random() * 2 ** 31) };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const live = (room: Room<unknown>): boolean[] => room.seats.map((s) => !!s && !s.out);

export class Pond {
  constructor(private g: Game) {
    g.entInit.push((e) => { e.pondRec = { games: 0, wins: 0, best: 0 }; });
    g.saves.push({
      name: 'pond',
      save: (p) => ({ ...p.pondRec }),
      load: (p, raw) => {
        const r = (raw ?? {}) as Partial<Record<keyof PondRecord, unknown>>;
        p.pondRec = { games: readInt(r.games, 0, 1e7, 0), wins: readInt(r.wins, 0, 1e7, 0), best: readInt(r.best, 0, 999, 0) };
        if (p.pondRec.wins > p.pondRec.games) p.pondRec.wins = p.pondRec.games;
      },
    });
    g.rules.touched = (p) => p.pondRec.games > 0;
    g.personal.push({ name: 'pondRec', state: (p): PondRecord => p.pondRec });

    // 판 위의 것: 물고기(크기, 나루), 찌(던진 자리, 펼친 수 — 엎어 있는 동안은 0, 나루), 컴퓨터 낚시꾼(자리)
    g.defineKind('fish', { sync: (e) => [num(e.data.v), num(e.data.spot)] });
    g.defineKind('bait', { sync: (e) => [num(e.data.seat), num(e.data.shown), num(e.data.spot)] });
    g.defineKind('angler', { sync: (e) => [num(e.data.seat)] });
    // 사람마다 남이 보는 값: 앉은 자리 + 1 (옷 색). 앉지 않았으면 0
    g.playerSync((p) => { const r = g.rooms.of(p); return [r ? g.rooms.seatOf(r, p) + 1 : 0]; });
    g.personal.push({ name: 'pond', state: (p): PondView | null => this.view(p) });
    g.commands.set('cast', (p, m) => { if (typeof m.value === 'number' && typeof m.spot === 'number') this.cast(p, m.value, m.spot); });

    g.rooms.define<Table>({
      seats: POND.seats, turnS: POND.turnS, rounds: POND.hand, graceS: POND.graceS, cpuAfterS: POND.cpuAfterS, cpuStepMs: POND.cpuStepMs,
      // 엎어 던지는 게임이라 '차례 넘기기'가 없다 (시간이 다 되면 컴퓨터처럼 대신 던진다)
      pass: false,
      seatAt: (_room, i) => seatSpot(i),
      exitAt: (p) => ({ x: ((p.id % 7) - 3) * 1.4, z: POND.lobbyZ, face: Math.PI }),
      start: (room) => this.setup(room),
      turnStart: (room, seat) => this.turnStart(room, seat),
      turnEnd: (room) => this.maybeReveal(room),
      timeout: (room, seat) => this.auto(room, seat),
      cpu: (room, seat) => this.auto(room, seat),
      outOfRounds: (room) => this.end(room),
      finished: (room) => this.record(room),
      save: (room) => this.save(room),
      load: (room, raw) => this.load(room, raw),
    });
  }

  // ---------- 판 ----------

  private setup(room: Room<Table>): void {
    const b = newBoard(pondSeed.next());
    room.data = { ...b, fishEnt: [], baitEnt: Array(POND.seats).fill(0), shown: [], anglers: [], pauseUntil: 0 };
    this.placeAll(room);
  }

  /** 판의 엔티티를 놓는다: 물고기 셋, 컴퓨터 자리의 낚시꾼, 이번 던지기의 엎은 찌 (판의 시작과 되살리기) */
  private placeAll(room: Room<Table>): void {
    const t = room.data;
    t.fishEnt = POND.spots.map((sp, s) => {
      const e = this.g.rooms.place(room, 'fish', { x: sp.x, z: sp.z, face: 0 });
      e.data.v = t.fish[s]; e.data.spot = s;
      return e.id;
    });
    t.anglers = [];
    room.seats.forEach((s, i) => {
      if (!s?.cpu) return;
      const at = seatSpot(i), e = this.g.rooms.place(room, 'angler', { ...at, type: `s${i}` });
      e.data.seat = i;
      t.anglers.push(e.id);
    });
    t.baitEnt = room.seats.map((_, i) => { const pl = t.placed[i]; return pl ? this.placeBait(room, i, pl, 0) : 0; });
    t.shown = [];
  }

  private placeBait(room: Room<Table>, seat: number, pl: Placed, shown: number): number {
    const at = baitSpot(pl.spot, seat), e = this.g.rooms.place(room, 'bait', { x: at.x, z: at.z, face: 0 });
    e.data.seat = seat; e.data.spot = pl.spot; e.data.shown = shown;
    return e.id;
  }

  /** 차례가 그 자리에 왔다: 이번 던지기에 던질 자리가 아니면 곧바로 넘긴다 (선이 옮겨 가는 것을 틀의 차례에 맞춘다) */
  private turnStart(room: Room<Table>, seat: number): void {
    const t = room.data;
    if (!t || t.done) return;
    const lv = live(room);
    if (expected(t, lv) < 0) { this.maybeReveal(room); return; }
    if (expected(t, lv) !== seat) { this.g.rooms.pass(room); return; }
    // 펼친 바로 뒤에는 컴퓨터가 조금 쉰다 (사람이 결과를 볼 수 있게)
    if (!t.order.length && t.pauseUntil > room.cpuAt) room.cpuAt = t.pauseUntil;
  }

  /** 사람의 명령: 손패의 수 value를 나루 spot에 엎어 던진다 */
  private cast(p: Ent, value: number, spot: number): void {
    const my = this.g.rooms.myTurn<Table>(p);
    if (!my || !my.room.data) return;
    if (!this.throwBait(my.room, my.seat, value, spot)) { this.g.notify(p, 'pondBad'); return; }
    this.g.rooms.pass(my.room);
  }

  /** 컴퓨터의 한 수, 그리고 시간이 다 된 사람 대신 던지기: 그 자리가 볼 수 있는 것만으로 고른다 */
  private auto(room: Room<Table>, seat: number): void {
    const t = room.data, lv = live(room);
    if (!t || t.done) return;
    if (expected(t, lv) === seat) {
      const m = choose(sightOf(t, lv, seat), () => rand(t));
      this.throwBait(room, seat, m.value, m.spot);
    }
    this.g.rooms.pass(room);
  }

  private throwBait(room: Room<Table>, seat: number, value: number, spot: number): boolean {
    const t = room.data;
    if (!place(t, live(room), seat, value, spot)) return false;
    // 새 던지기의 첫 미끼: 지난번 펼쳐 보이던 찌를 치운다
    if (t.order.length === 1) { for (const id of t.shown) this.g.rooms.unplace(room, id); t.shown = []; }
    t.baitEnt[seat] = this.placeBait(room, seat, t.placed[seat]!, 0);
    // 누가 어느 나루에 던졌는지만 (수는 싣지 않는다)
    this.g.effect(t.baitEnt[seat], 'toss', seat, spot);
    this.g.rooms.touch(room);
    return true;
  }

  /** 모두 던졌으면 펼친다: 찌에 수를 싣고, 물고기를 낚거나 키우고, 다음 선을 틀의 바퀴 시작으로 */
  private maybeReveal(room: Room<Table>): void {
    const t = room.data, lv = live(room);
    if (!t || t.done || !castFull(t, lv)) return;
    const res = reveal(t, lv);
    for (const sr of res.spots) for (const [seat, v] of sr.baits) {
      const e = this.g.ents.get(t.baitEnt[seat]);
      if (e) { e.data.shown = v; t.shown.push(e.id); }
    }
    t.baitEnt = t.baitEnt.map(() => 0);
    res.spots.forEach((sr, s) => {
      const f = this.g.ents.get(t.fishEnt[s]);
      if (!f) return;
      this.g.effect(f.id, sr.win >= 0 ? 'catch' : 'miss', sr.win, sr.fish, sr.tangled.length);
      f.data.v = t.fish[s];
    });
    t.pauseUntil = this.g.now() + POND.revealPauseMs;
    if (t.leader >= 0) room.first = t.leader;
    this.g.rooms.touch(room);
    if (t.done) this.end(room);
  }

  private end(room: Room<Table>): void {
    const t = room.data;
    t.done = true;
    this.g.rooms.finish(room, winner(t, live(room)), 'score');
  }

  /** 판이 끝났다: 접속해 있는 사람의 전적 */
  private record(room: Room<Table>): void {
    const t = room.data;
    room.seats.forEach((_, i) => {
      const p = this.g.rooms.playerAt(room, i);
      if (!p || !t) return;
      p.pondRec.games++;
      if (room.win === i) p.pondRec.wins++;
      p.pondRec.best = Math.max(p.pondRec.best, t.scores[i]);
      p.unsaved = true;
    });
  }

  // ---------- 보내는 상태 ----------

  /** 그 사람의 연못: 판의 공개된 것 + 그 사람의 손패와 엎은 미끼만 */
  view(p: Ent): PondView | null {
    const room = this.g.rooms.of<Table>(p);
    const t = room?.data;
    if (!room || !t || room.st === 'wait') return null;
    const me = this.g.rooms.seatOf(room, p), lv = live(room);
    const rank = Array(POND.seats).fill(0) as number[];
    if (room.st === 'over') for (const [i, k] of ranking(t, lv)) rank[i] = k;
    return {
      cast: Math.min(t.cast, POND.hand), casts: POND.hand, leader: t.leader, next: room.st === 'play' ? expected(t, lv) : -1,
      fish: [...t.fish], scores: [...t.scores], caught: [...t.caught],
      thrown: t.placed.map((pl) => (pl ? pl.spot : -1)),
      hand: me >= 0 ? [...t.hands[me]] : [],
      mine: me >= 0 && t.placed[me] ? { ...t.placed[me]! } : null,
      left: t.hands.map((h) => h.length),
      last: t.last, rank,
    };
  }

  // ---------- 저장 (두는 중인 판: 틀이 월드 저장의 rooms 칸에 적는다) ----------

  private save(room: Room<Table>): unknown {
    const t = room.data;
    return { rng: t.rng, hands: t.hands, fish: t.fish, scores: t.scores, caught: t.caught, cast: t.cast, leader: t.leader, placed: t.placed, order: t.order, seen: t.seen, last: t.last };
  }

  private load(room: Room<Table>, raw: unknown): void {
    const r = raw as Record<string, unknown>;
    const n = POND.seats, ints = (v: unknown, len: number, lo: number, hi: number): number[] => {
      if (!Array.isArray(v) || v.length !== len) throw new Error('판의 저장이 깨졌습니다');
      return v.map((x) => readInt(x, lo, hi, lo));
    };
    const hands = Array.isArray(r.hands) && r.hands.length === n ? r.hands.map((h) => (Array.isArray(h) ? h.slice(0, POND.hand).map((x) => readInt(x, 1, POND.deckMax, 1)) : [])) : null;
    if (!hands) throw new Error('판의 저장이 깨졌습니다 (손패)');
    const placed = Array.isArray(r.placed) && r.placed.length === n ? r.placed.map((x): Placed | null => {
      if (typeof x !== 'object' || x === null) return null;
      const o = x as Record<string, unknown>;
      return { spot: readInt(o.spot, 0, POND.spots.length - 1, 0), value: readInt(o.value, 1, POND.deckMax, 1) };
    }) : Array(n).fill(null);
    const order = Array.isArray(r.order) ? r.order.map((x) => readInt(x, 0, n - 1, 0)).filter((i, k, a) => !!placed[i] && a.indexOf(i) === k) : [];
    const b: Board = {
      rng: readInt(r.rng, -(2 ** 31), 2 ** 31 - 1, 1), hands, fish: ints(r.fish, POND.spots.length, 1, POND.fishMax),
      scores: ints(r.scores, n, 0, 999), caught: ints(r.caught, n, 0, 99), cast: readInt(r.cast, 1, POND.hand, 1), leader: readInt(r.leader, 0, n - 1, 0),
      placed: placed.map((pl, i) => (order.includes(i) ? pl : null)), order, seen: Array.isArray(r.seen) ? r.seen.slice(0, 64).map((x) => readInt(x, 1, POND.deckMax, 1)) : [],
      last: (r.last ?? null) as Board['last'], done: false,
    };
    room.data = { ...b, fishEnt: [], baitEnt: Array(n).fill(0), shown: [], anglers: [], pauseUntil: 0 };
    this.placeAll(room);
  }
}

export function installPond(g: Game): void {
  g.pond = new Pond(g);
}
