// 대국: 판의 규칙(말 놓기, 걷기·치기의 검사, 등불돌, 컴퓨터의 수, 판의 끝)과 전적.
// 판 나누기·대기실과 짝짓기·차례와 30초 기한·끊긴 사람·기권·다시 하기·판의 저장은 틀의 판 모듈(rooms: g.rooms)이 맡는다: 이 파일은 g.rooms.define에 규칙을 준다.
// 판마다 따로 된 층이라 판은 모두 같은 대국판 자리(BOARDS[0])에 놓이고 서로 보이지 않는다. 말은 게임의 엔티티 종류 'unit'으로 판의 층에 놓는다(g.rooms.place).
// 판의 규칙(갈 수 있는 칸, 피해, 컴퓨터의 수)은 ../shared/rules.ts.
import { readInt, type Ent, type Game, type Room } from '@engine/server';
import { BOARD, BOARDS, LOBBY, TURN, UNITS, UNIT_TYPES } from '../shared/content/board';
import { aiStep, alive, anyAction, byHp, cellPos, damage, faceTo, isLamp, knockout, reach, seatPos, startUnits, targets, typeIndex, type Unit } from '../shared/rules';
import type { DuelAct, DuelView, MeState } from '../shared/stepstone';

/** 판 하나의 게임 상태 (room.data). 자리 번호가 곧 편이다 (0 왼쪽이 먼저 둔다: 다시 하기마다 틀이 자리를 돌린다) */
export interface Board {
  units: Unit[];
  /** 말의 엔티티 (말 id = 엔티티 id) */
  ents: Map<number, Ent>;
  /** 무너지는 중인 말: 이 때(ms)에 판에서 뺀다 */
  dying: { id: number; at: number }[];
}
export type DuelRoom = Room<Board>;

/** 판이 놓이는 대국판 (판마다 층이 달라 모두 같은 자리) */
const AT = 0;

export class Duels {
  constructor(private g: Game) {
    // 말: 판 위의 엔티티. 화면에 싣는 값은 [편, 체력, 최대 체력, 걸었음 1 + 쳤음 2, 쓰러짐 1]
    g.defineKind('unit', {
      tick: (e, dt) => this.glide(e, dt),
      sync: (e) => {
        const u = e.data.unit as Unit | undefined;
        return u ? [u.side, Math.max(0, u.hp), UNITS[u.type].hp, (u.moved ? 1 : 0) + (u.acted ? 2 : 0), u.hp <= 0 ? 1 : 0] : [];
      },
    });
    // 전적: 캐릭터에 딸린 값 (저장)
    g.entInit.push((e) => { e.duelRec = [0, 0, 0]; });
    g.saves.push({
      name: 'duel',
      save: (p) => ({ rec: p.duelRec }),
      load: (p, raw) => {
        const r = (raw as { rec?: unknown } | null)?.rec;
        const a = Array.isArray(r) ? r : [];
        p.duelRec = [readInt(a[0], 0, 1e7, 0), readInt(a[1], 0, 1e7, 0), readInt(a[2], 0, 1e7, 0)];
      },
    });
    g.rules.touched = (p) => p.duelRec.some((n) => n > 0);
    g.personal.push({ name: 'duel', state: (p): MeState['duel'] => this.view(p) });
    g.personal.push({ name: 'rec', state: (p): MeState['rec'] => [...p.duelRec] });

    g.rooms.define<Board>({
      seats: 2, turnS: TURN.turnS, rounds: TURN.rounds, graceS: TURN.graceS, cpuStepMs: TURN.cpuStepMs, cpuAfterS: TURN.cpuAfterS,
      seatAt: (_room, side) => { const at = seatPos(AT, side as 0 | 1); return { ...at, face: faceTo(at, BOARDS[AT]) }; },
      exitAt: (p) => this.lobbySpot(p),
      start: (room) => this.setup(room),
      turnStart: (room, side) => { for (const u of room.data.units) if (u.side === side) { u.moved = false; u.acted = false; } },
      // 차례를 마칠 때 등불돌 위의 말이 체력을 되찾는다
      turnEnd: (room, side) => { for (const u of alive(room.data.units)) if (u.side === side && isLamp(u.c, u.r)) u.hp = Math.min(UNITS[u.type].hp, u.hp + TURN.lampHeal); },
      cpu: (room, side) => this.cpuStep(room, side as 0 | 1),
      outOfRounds: (room) => g.rooms.finish(room, this.winByHp(room), 'rounds'),
      finished: (room) => this.record(room),
      save: (room) => ({ units: room.data.units.filter((u) => u.hp > 0).map((u) => [typeIndex(u.type), u.side, u.c, u.r, u.hp, (u.moved ? 1 : 0) + (u.acted ? 2 : 0)]) }),
      load: (room, raw) => this.restore(room, raw),
    });

    g.commands.set('duel', (p, m) => this.command(p, m));
    g.ticks.push(() => this.tick());
  }

  // ---------- 읽기 ----------

  /** 그 사람이 앉은 판 (시험과 화면의 상태) */
  tableOf(p: Ent): DuelRoom | undefined { return this.g.rooms.of<Board>(p); }

  private view(p: Ent): DuelView | null {
    const room = this.tableOf(p);
    if (!room || !room.data) return null;
    const d = room.data;
    return {
      id: room.id, board: AT,
      units: d.units.filter((u) => u.hp > 0 || d.dying.some((x) => x.id === u.id)).map((u) => [u.id, typeIndex(u.type), u.side, u.c, u.r, Math.max(0, u.hp), (u.moved ? 1 : 0) + (u.acted ? 2 : 0)]),
    };
  }

  // ---------- 명령 (판 열기·차례 넘기기·기권·다시 하기는 틀의 room 명령) ----------

  private command(p: Ent, m: Record<string, unknown>): void {
    const a = m.a as DuelAct, num = (k: string) => (typeof m[k] === 'number' && Number.isInteger(m[k]) ? (m[k] as number) : NaN);
    if (a === 'move') this.move(p, num('u'), num('c'), num('r'));
    else if (a === 'hit') this.hit(p, num('u'), num('to'));
  }

  /** 걷기: 내 차례, 내 말, 갈 수 있는 칸 */
  private move(p: Ent, uid: number, c: number, r: number): void {
    const t = this.g.rooms.myTurn<Board>(p);
    if (!t) return;
    const u = t.room.data.units.find((x) => x.id === uid && x.side === t.seat && x.hp > 0);
    const path = u && reach(t.room.data.units, u).get(`${c},${r}`);
    if (!u || !path) { this.g.notify(p, 'duelBad'); return; }
    this.doMove(t.room, u, path);
  }

  private hit(p: Ent, uid: number, tid: number): void {
    const t = this.g.rooms.myTurn<Board>(p);
    if (!t) return;
    const u = t.room.data.units.find((x) => x.id === uid && x.side === t.seat && x.hp > 0);
    const foe = u && targets(t.room.data.units, u).find((x) => x.id === tid);
    if (!u || !foe) { this.g.notify(p, 'duelBad'); return; }
    this.doHit(t.room, u, foe);
  }

  // ---------- 판의 진행 ----------

  /** 판을 차린다: 말 여섯을 판의 층에 놓는다 (틀이 앞 판의 엔티티는 이미 치웠다) */
  private setup(room: DuelRoom): void {
    room.data = { units: [], ents: new Map(), dying: [] };
    for (const u of startUnits()) this.put(room, u);
  }

  /** 말 하나를 놓는다 */
  private put(room: DuelRoom, u: Omit<Unit, 'id'>): void {
    const at = cellPos(AT, u.c, u.r);
    const e = this.g.rooms.place(room, 'unit', { x: at.x, z: at.z, type: u.type, face: faceTo(at, BOARDS[AT]) });
    const unit: Unit = { ...u, id: e.id };
    e.data.unit = unit;
    room.data.units.push(unit);
    room.data.ents.set(e.id, e);
  }

  /** 저장한 판을 되살린다 (서버를 다시 켰을 때): 살아 있던 말을 그 칸과 체력으로 */
  private restore(room: DuelRoom, raw: unknown): void {
    const list = (raw as { units?: unknown } | null)?.units;
    if (!Array.isArray(list)) throw new Error('말의 목록이 없다');
    room.data = { units: [], ents: new Map(), dying: [] };
    const N = BOARD.size;
    for (const x of list) {
      if (!Array.isArray(x)) continue;
      const type = UNIT_TYPES[readInt(x[0], 0, UNIT_TYPES.length - 1, 0)], fl = readInt(x[5], 0, 3, 0);
      this.put(room, { type, side: x[1] === 1 ? 1 : 0, c: readInt(x[2], 0, N - 1, 0), r: readInt(x[3], 0, N - 1, 0), hp: readInt(x[4], 1, UNITS[type].hp, 1), moved: (fl & 1) !== 0, acted: (fl & 2) !== 0 });
    }
    if (knockout(room.data.units) >= 0 || room.data.units.length < 2) throw new Error('끝난 판');
  }

  private doMove(room: DuelRoom, u: Unit, path: { c: number; r: number }[]): void {
    const to = path[path.length - 1];
    u.c = to.c; u.r = to.r; u.moved = true;
    const e = room.data.ents.get(u.id);
    if (e) e.data.path = path.map((s) => cellPos(AT, s.c, s.r));
    this.g.rooms.touch(room);
    this.afterAction(room);
  }

  private doHit(room: DuelRoom, u: Unit, foe: Unit): void {
    // 첫 바퀴의 나중 편은 피해를 덜 준다 (TURN.openerSoften: 먼저 다가간 편이 먼저 맞는 불리함을 덜어 준다)
    const d = damage(u, foe, u, room.round === 1 && room.turn !== room.first);
    foe.hp -= d; u.acted = true; u.moved = true;
    const killed = foe.hp <= 0;
    const e = room.data.ents.get(u.id), fe = room.data.ents.get(foe.id);
    if (e && fe) e.face = faceTo(e, fe);
    // 연출: 친 말에서 일어난 사건 (화면의 onEffect('hit'): 날아가는 돌·내딛기·흔들림·피해 숫자)
    this.g.effect(u.id, 'hit', foe.id, d, killed ? 1 : 0);
    if (killed) room.data.dying.push({ id: foe.id, at: this.g.now() + TURN.removeMs });
    this.g.rooms.touch(room);
    const ko = knockout(room.data.units);
    if (ko >= 0) { this.g.rooms.finish(room, ko, 'ko'); return; }
    this.afterAction(room);
  }

  /** 수를 둔 뒤: 그 편에 할 수 있는 일이 남지 않았으면 차례를 넘긴다 */
  private afterAction(room: DuelRoom): void {
    if (room.st === 'play' && !anyAction(room.data.units, room.turn as 0 | 1)) this.g.rooms.pass(room);
  }

  /** 남은 체력으로 이긴 자리 (같으면 비김 -2) */
  private winByHp(room: DuelRoom): number { const w = byHp(room.data.units); return w === 2 ? -2 : w; }

  /** 전적: 판에 접속해 있는 사람에게 */
  private record(room: DuelRoom): void {
    room.seats.forEach((_, side) => {
      const p = this.g.rooms.playerAt(room, side);
      if (!p) return;
      p.duelRec[room.win === -2 ? 2 : room.win === side ? 0 : 1]++;
      p.unsaved = true;
    });
  }

  /** 컴퓨터의 한 수 (시험은 사람 쪽에도 같은 수를 둔다: ../shared/rules.ts의 aiStep) */
  cpuStep(room: DuelRoom, side: 0 | 1): void {
    const units = room.data.units;
    const step = aiStep(units, side, undefined, room.round === 1 && side !== room.first);
    if (step.a === 'end') { this.g.rooms.pass(room); return; }
    const u = units.find((x) => x.id === step.u)!;
    if (step.a === 'move') this.doMove(room, u, reach(units, u).get(`${step.c},${step.r}`)!);
    else this.doHit(room, u, units.find((x) => x.id === step.t)!);
  }

  /** 쓰러진 말을 무너지는 모습을 보인 뒤 판에서 뺀다 */
  private tick(): void {
    const now = this.g.now();
    for (const room of this.g.rooms.all() as DuelRoom[]) {
      const d = room.data;
      if (!d?.dying.length) continue;
      for (const x of d.dying.filter((y) => now >= y.at)) { this.g.rooms.unplace(room, x.id); d.ents.delete(x.id); }
      d.dying = d.dying.filter((y) => now < y.at);
    }
  }

  /** 말이 칸을 따라 미끄러져 간다 (판의 자리는 이미 바뀌었다: 화면의 모습만) */
  private glide(e: Ent, dt: number): void {
    const path = e.data.path as { x: number; z: number }[] | undefined;
    if (!path?.length) return;
    const to = path[0], dx = to.x - e.x, dz = to.z - e.z, d = Math.hypot(dx, dz), step = 9 * dt;
    if (d > 0.01) e.face = Math.atan2(dx, dz);
    if (d <= step) { e.x = to.x; e.z = to.z; path.shift(); if (!path.length) delete e.data.path; }
    else { e.x += (dx / d) * step; e.z += (dz / d) * step; }
  }

  /** 대기실의 자리: 둥근 마당의 둘레에 사람마다 조금씩 다르게 */
  private lobbySpot(p: Ent): { x: number; z: number; face: number } {
    const a = (p.id * 2.399) % (Math.PI * 2);
    return { x: LOBBY.x + Math.cos(a) * LOBBY.r, z: LOBBY.z + Math.sin(a) * LOBBY.r, face: faceTo({ x: Math.cos(a), z: Math.sin(a) }, { x: 0, z: 0 }) };
  }
}
