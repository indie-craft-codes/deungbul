// 대국: 판 열기·짝짓기·컴퓨터 상대, 차례와 제한 시간, 걷기·치기, 끊긴 사람, 판의 끝과 다시 하기, 전적.
// 틀은 실시간이다(20Hz 틱): 차례는 이 시스템이 틱 위에 올린다. 시간은 g.now()(벽시계, 시험은 정해진 시계)로 재고, 틱마다 기한을 본다.
// 말은 게임의 엔티티 종류 'unit'으로 월드에 놓아 화면이 그린다. 판의 규칙(갈 수 있는 칸, 피해, 컴퓨터의 수)은 ../shared/rules.ts.
import { readInt, type Ent, type Game } from '@engine/server';
import { BOARD, BOARDS, LOBBY, TURN, UNITS, UNIT_TYPES } from '../shared/content/board';
import { aiStep, alive, anyAction, byHp, cellPos, damage, faceTo, isLamp, knockout, reach, seatPos, startUnits, targets, typeIndex, type Unit } from '../shared/rules';
import type { DuelAct, DuelPhase, DuelView, DuelWhy, MeState, TableRow } from '../shared/stepstone';

/** 판의 한 자리: 사람(저장 키로 기억한다: 끊겼다 돌아와도 같은 자리) 또는 컴퓨터 */
interface Seat {
  key: string;
  /** 지금 그 사람의 엔티티 id (끊겼으면 0) */
  ent: number;
  name: string;
  cpu: boolean;
  /** 끊긴 때(ms). 0이면 접속해 있다. -1이면 판을 떠났다(돌아오지 않는다) */
  goneAt: number;
}

interface Table {
  id: number;
  board: number;
  st: DuelPhase;
  seats: [Seat, Seat | null];
  turn: 0 | 1;
  round: number;
  /** 이번 차례가 끝나는 때(ms) */
  deadline: number;
  units: Unit[];
  /** 말의 엔티티 (말 id = 엔티티 id) */
  ents: Map<number, Ent>;
  /** 무너지는 중인 말: 이 때(ms)에 판에서 뺀다 */
  dying: { id: number; at: number }[];
  fx: DuelView['fx'];
  win: number;
  why: DuelWhy | '';
  again: [boolean, boolean];
  /** 컴퓨터가 다음 수를 두는 때(ms) */
  cpuAt: number;
}

/** 사람의 열쇠: 저장 키(토큰으로 이어받는 캐릭터)가 있으면 그것, 손님이면 엔티티 id (끊기면 돌아올 수 없다) */
const keyOf = (p: Ent): string => p.pid || `guest:${p.id}`;
const CPU_NAME = '';

export class Duels {
  private tables = new Map<number, Table>();
  private seatOf = new Map<string, number>();
  private nextId = 1;

  constructor(private g: Game) {
    // 말: 판 위의 엔티티. 화면에 싣는 값은 [편, 체력, 최대 체력, 걸었음 1 + 쳤음 2, 쓰러짐 1, 판 id]. 저장하지 않는다(판은 서버를 다시 켜면 없어진다)
    g.defineKind('unit', {
      tick: (e, dt) => this.glide(e, dt),
      sync: (e) => {
        const u = e.data.unit as Unit | undefined;
        return u ? [u.side, Math.max(0, u.hp), UNITS[u.type].hp, (u.moved ? 1 : 0) + (u.acted ? 2 : 0), u.hp <= 0 ? 1 : 0, Number(e.data.table ?? 0)] : [];
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
    g.shared.push({ name: 'tables', state: (): TableRow[] => this.rows() });
    // 판에 앉은 사람은 걷지 않는다 (땅을 누르면 화면이 칸을 고르므로 걷는 명령이 와도 서지 않게). 화면의 rules.speed와 같은 답
    const walk = g.rules.speed;
    g.rules.speed = (p) => (this.seatOf.has(keyOf(p)) ? 0 : walk(p));

    g.commands.set('duel', (p, m) => this.command(p, m));
    g.ticks.push(() => this.tick());
    g.on('playerJoined', (p) => this.joined(p));
    g.on('playerLeft', (id) => this.left(id));
  }

  // ---------- 읽기 ----------

  /** 그 사람이 앉은 판 (시험과 화면의 상태) */
  tableOf(p: Ent): Table | undefined { const id = this.seatOf.get(keyOf(p)); return id === undefined ? undefined : this.tables.get(id); }
  sideOf(t: Table, p: Ent): 0 | 1 | -1 { const k = keyOf(p); return t.seats[0].key === k ? 0 : t.seats[1]?.key === k ? 1 : -1; }
  get count(): number { return this.tables.size; }

  private rows(): TableRow[] {
    return [...this.tables.values()].map((t) => [t.id, t.seats[0].name, t.seats[1]?.name ?? '', t.st === 'wait' ? 0 : t.st === 'play' ? 1 : 2, t.seats[1]?.cpu ? 1 : 0]);
  }

  private view(p: Ent): DuelView | null {
    const t = this.tableOf(p);
    if (!t) return null;
    const side = this.sideOf(t, p) as 0 | 1, s1 = t.seats[1];
    return {
      id: t.id, board: t.board, me: side, st: t.st, turn: t.turn, round: t.round,
      left: t.st === 'play' ? Math.max(0, Math.ceil((t.deadline - this.g.now()) / 1000)) : 0,
      names: [t.seats[0].name, s1?.name ?? ''],
      cpu: [0, s1?.cpu ? 1 : 0],
      away: [t.seats[0].goneAt !== 0 ? 1 : 0, s1 && s1.goneAt !== 0 ? 1 : 0],
      units: t.units.filter((u) => u.hp > 0 || t.dying.some((d) => d.id === u.id)).map((u) => [u.id, typeIndex(u.type), u.side, u.c, u.r, Math.max(0, u.hp), (u.moved ? 1 : 0) + (u.acted ? 2 : 0)]),
      fx: t.fx, win: t.win, why: t.why, again: [t.again[0] ? 1 : 0, t.again[1] ? 1 : 0],
    };
  }

  // ---------- 명령 ----------

  private command(p: Ent, m: Record<string, unknown>): void {
    const a = m.a as DuelAct, num = (k: string) => (typeof m[k] === 'number' && Number.isInteger(m[k]) ? (m[k] as number) : NaN);
    switch (a) {
      case 'quick': return this.quick(p);
      case 'host': return void this.host(p, false);
      case 'cpu': return this.vsCpu(p);
      case 'join': return this.join(p, num('id'));
      case 'lobby': return this.leave(p);
      case 'resign': return this.resign(p);
      case 'again': return this.again(p);
      case 'end': return this.endByPlayer(p);
      case 'move': return this.move(p, num('u'), num('c'), num('r'));
      case 'hit': return this.hit(p, num('u'), num('to'));
      default: return;
    }
  }

  private seatFor(p: Ent): Seat { return { key: keyOf(p), ent: p.id, name: p.name, cpu: false, goneAt: 0 }; }
  private freeBoard(): number {
    const used = new Set([...this.tables.values()].map((t) => t.board));
    return BOARDS.findIndex((_, i) => !used.has(i));
  }

  /** 빠른 대국: 기다리는 판이 있으면 가장 오래 기다린 판에 들어가고, 없으면 판을 열고 기다린다 */
  private quick(p: Ent): void {
    if (this.busy(p)) return;
    const open = [...this.tables.values()].find((t) => t.st === 'wait' && !t.seats[1] && t.seats[0].goneAt === 0);
    if (open) this.join(p, open.id);
    else this.host(p, false);
  }

  private busy(p: Ent): boolean {
    if (!this.seatOf.has(keyOf(p))) return false;
    this.g.notify(p, 'duelBusy');
    return true;
  }

  /** 판을 연다 (cpu면 컴퓨터를 앉히고 바로 시작) */
  private host(p: Ent, cpu: boolean): Table | undefined {
    if (this.busy(p)) return undefined;
    const board = this.freeBoard();
    if (board < 0) { this.g.notify(p, 'duelNoBoard'); return undefined; }
    const t: Table = {
      id: this.nextId++, board, st: 'wait', seats: [this.seatFor(p), null], turn: 0, round: 1, deadline: 0,
      units: [], ents: new Map(), dying: [], fx: [0, 0, 0, 0, 0], win: -1, why: '', again: [false, false], cpuAt: 0,
    };
    this.tables.set(t.id, t);
    this.seatOf.set(keyOf(p), t.id);
    this.seatPlayer(t, p, 0);
    this.g.stateDirty = true;
    if (cpu) this.addCpu(t);
    else this.g.notify(p, 'duelWait');
    return t;
  }

  /** 컴퓨터와 두기: 판을 열고 기다리던 사람이면 그 판에 컴퓨터를 앉힌다 */
  private vsCpu(p: Ent): void {
    const t = this.tableOf(p);
    if (t && t.st === 'wait' && !t.seats[1] && this.sideOf(t, p) === 0) { this.addCpu(t); return; }
    this.host(p, true);
  }
  private addCpu(t: Table): void {
    t.seats[1] = { key: '', ent: 0, name: CPU_NAME, cpu: true, goneAt: 0 };
    this.start(t);
  }

  private join(p: Ent, id: number): void {
    if (this.busy(p)) return;
    const t = this.tables.get(id);
    if (!t || t.st !== 'wait' || t.seats[1] || t.seats[0].goneAt !== 0) { this.g.notify(p, 'duelGone'); return; }
    t.seats[1] = this.seatFor(p);
    this.seatOf.set(keyOf(p), t.id);
    this.start(t);
  }

  /** 판을 처음부터: 말을 놓고, 왼쪽(0)이 먼저 둔다 */
  private start(t: Table): void {
    const g = this.g;
    for (const e of t.ents.values()) g.remove(e.id);
    t.ents.clear(); t.dying = [];
    t.units = startUnits().map((u) => {
      const at = cellPos(t.board, u.c, u.r);
      const e = g.place('unit', { x: at.x, z: at.z, type: u.type, face: faceTo(at, BOARDS[t.board]) });
      const unit: Unit = { ...u, id: e.id };
      e.data.unit = unit; e.data.table = t.id;
      t.ents.set(e.id, e);
      return unit;
    });
    t.st = 'play'; t.turn = 0; t.round = 1; t.win = -1; t.why = ''; t.again = [false, false];
    t.deadline = g.now() + TURN.turnS * 1000;
    t.cpuAt = g.now() + TURN.cpuStepMs * 2;
    t.fx = [t.fx[0], 0, 0, 0, 0];
    for (const side of [0, 1] as const) {
      const s = t.seats[side];
      if (!s || s.cpu) continue;
      const p = g.ents.get(s.ent);
      if (!p) continue;
      this.seatPlayer(t, p, side);
      g.notify(p, 'duelStart', t.seats[1 - side]?.name ?? '', side === 0 ? 1 : 0);
    }
    g.stateDirty = true;
  }

  /** 걷기: 내 차례, 내 말, 갈 수 있는 칸 */
  private move(p: Ent, uid: number, c: number, r: number): void {
    const ctx = this.myTurn(p);
    if (!ctx) return;
    const { t, side } = ctx, u = t.units.find((x) => x.id === uid && x.side === side && x.hp > 0);
    const path = u && reach(t.units, u).get(`${c},${r}`);
    if (!u || !path) { this.g.notify(p, 'duelBad'); return; }
    this.doMove(t, u, path);
  }

  private hit(p: Ent, uid: number, tid: number): void {
    const ctx = this.myTurn(p);
    if (!ctx) return;
    const { t, side } = ctx, u = t.units.find((x) => x.id === uid && x.side === side && x.hp > 0);
    const foe = u && targets(t.units, u).find((x) => x.id === tid);
    if (!u || !foe) { this.g.notify(p, 'duelBad'); return; }
    this.doHit(t, u, foe);
  }

  private endByPlayer(p: Ent): void {
    const ctx = this.myTurn(p);
    if (ctx) this.endTurn(ctx.t);
  }

  /** 두는 중인 판에서 그 사람의 차례인가 (아니면 알린다) */
  private myTurn(p: Ent): { t: Table; side: 0 | 1 } | null {
    const t = this.tableOf(p);
    if (!t || t.st !== 'play') return null;
    const side = this.sideOf(t, p);
    if (side !== t.turn) { this.g.notify(p, 'duelNotTurn'); return null; }
    return { t, side };
  }

  private resign(p: Ent): void {
    const t = this.tableOf(p);
    if (!t || t.st !== 'play') return;
    const side = this.sideOf(t, p);
    if (side === -1) return;
    this.finish(t, side === 0 ? 1 : 0, 'resign');
  }

  /** 다시 하기: 컴퓨터 상대는 곧바로, 사람끼리는 둘 다 누르면 자리를 바꿔(먼저 두는 쪽이 바뀐다) */
  private again(p: Ent): void {
    const t = this.tableOf(p);
    if (!t || t.st !== 'over') return;
    const side = this.sideOf(t, p);
    if (side === -1) return;
    const other = t.seats[side === 0 ? 1 : 0];
    if (!other || (!other.cpu && other.goneAt !== 0)) { this.g.notify(p, 'duelFoeGone', other?.name ?? ''); return; }
    t.again[side] = true;
    if (other.cpu) { this.start(t); return; }
    if (!t.again[0] || !t.again[1]) { this.g.notify(p, 'duelAgainWait'); return; }
    t.seats = [t.seats[1]!, t.seats[0]];
    this.start(t);
  }

  /** 대기실로: 두는 중이면 기권으로 치고 판을 떠난다 */
  private leave(p: Ent): void {
    const t = this.tableOf(p);
    if (!t) { this.toLobby(p); return; }
    const side = this.sideOf(t, p);
    if (t.st === 'play' && side !== -1) this.finish(t, side === 0 ? 1 : 0, 'resign');
    this.seatOf.delete(keyOf(p));
    if (side !== -1) { const s = t.seats[side]!; s.ent = 0; s.goneAt = -1; }
    const other = side !== -1 ? t.seats[side === 0 ? 1 : 0] : null;
    if (other && !other.cpu && other.goneAt === 0 && t.st === 'over') {
      const op = this.g.ents.get(other.ent);
      if (op) this.g.notify(op, 'duelFoeGone', p.name);
    }
    this.toLobby(p);
    this.closeIfEmpty(t);
    this.g.stateDirty = true;
  }

  // ---------- 판의 진행 ----------

  private doMove(t: Table, u: Unit, path: { c: number; r: number }[]): void {
    const to = path[path.length - 1];
    u.c = to.c; u.r = to.r; u.moved = true;
    const e = t.ents.get(u.id);
    if (e) e.data.path = path.map((s) => cellPos(t.board, s.c, s.r));
    this.afterAction(t);
  }

  private doHit(t: Table, u: Unit, foe: Unit): void {
    const d = damage(u, foe);
    foe.hp -= d; u.acted = true; u.moved = true;
    const killed = foe.hp <= 0;
    t.fx = [t.fx[0] + 1, u.id, foe.id, d, killed ? 1 : 0];
    const e = t.ents.get(u.id), fe = t.ents.get(foe.id);
    if (e && fe) e.face = faceTo(e, fe);
    if (killed) t.dying.push({ id: foe.id, at: this.g.now() + TURN.removeMs });
    const ko = knockout(t.units);
    if (ko >= 0) { this.finish(t, ko, 'ko'); return; }
    this.afterAction(t);
  }

  /** 수를 둔 뒤: 그 편에 할 수 있는 일이 남지 않았으면 차례를 넘긴다 */
  private afterAction(t: Table): void {
    if (t.st === 'play' && !anyAction(t.units, t.turn)) this.endTurn(t);
  }

  /** 차례를 넘긴다: 마친 편의 등불돌 회복, 다음 편의 말을 새로, 두 편이 한 번씩 두면 차례 수가 오르고 상한을 넘으면 남은 체력으로 끝 */
  private endTurn(t: Table): void {
    const g = this.g;
    for (const u of alive(t.units)) if (u.side === t.turn && isLamp(u.c, u.r)) u.hp = Math.min(UNITS[u.type].hp, u.hp + TURN.lampHeal);
    t.turn = t.turn === 0 ? 1 : 0;
    if (t.turn === 0) t.round++;
    if (t.round > TURN.rounds) { t.round = TURN.rounds; this.finish(t, byHp(t.units), 'rounds'); return; }
    for (const u of t.units) if (u.side === t.turn) { u.moved = false; u.acted = false; }
    t.deadline = g.now() + TURN.turnS * 1000;
    t.cpuAt = g.now() + TURN.cpuStepMs * 1.5;
  }

  private finish(t: Table, win: number, why: DuelWhy): void {
    const g = this.g;
    t.st = 'over'; t.win = win; t.why = why; t.again = [false, false];
    for (const side of [0, 1] as const) {
      const s = t.seats[side];
      const p = s && !s.cpu && s.goneAt === 0 ? g.ents.get(s.ent) : undefined;
      if (!p) continue;
      const res = win === 2 ? 2 : win === side ? 0 : 1;
      p.duelRec[res]++; p.unsaved = true;
      g.notify(p, 'duelResult', res, why);
    }
    g.stateDirty = true;
  }

  // ---------- 시간 ----------

  private tick(): void {
    const now = this.g.now();
    for (const t of [...this.tables.values()]) {
      // 쓰러진 말을 판에서 뺀다
      for (const d of t.dying.filter((x) => now >= x.at)) { const e = t.ents.get(d.id); if (e) { this.g.remove(e.id); t.ents.delete(d.id); } }
      t.dying = t.dying.filter((x) => now < x.at);
      // 끊긴 사람: 기다리는 시간이 지나면 두는 중이면 진 것으로, 아니면 판을 닫는다
      for (const side of [0, 1] as const) {
        const s = t.seats[side];
        if (!s || s.cpu || s.goneAt <= 0 || now - s.goneAt < TURN.graceS * 1000) continue;
        s.goneAt = -1; this.seatOf.delete(s.key);
        if (t.st === 'play') this.finish(t, side === 0 ? 1 : 0, 'left');
      }
      if (this.closeIfEmpty(t) || t.st !== 'play') continue;
      // 시간이 다 되면 차례를 넘긴다
      if (now >= t.deadline) {
        const s = t.seats[t.turn];
        for (const side of [0, 1] as const) {
          const q = t.seats[side], p = q && !q.cpu ? this.g.ents.get(q.ent) : undefined;
          if (p) this.g.notify(p, 'duelTimeout', s?.name ?? '');
        }
        this.endTurn(t);
        continue;
      }
      // 컴퓨터의 차례: 한 수씩 간격을 두고 둔다 (사람이 보고 따라갈 수 있게)
      if (t.seats[t.turn]?.cpu && now >= t.cpuAt) {
        t.cpuAt = now + TURN.cpuStepMs;
        this.cpuStep(t);
      }
    }
  }

  /** 컴퓨터의 한 수 (시험은 사람 쪽에도 같은 수를 둔다: ../shared/rules.ts의 aiStep) */
  cpuStep(t: Table): void {
    const step = aiStep(t.units, t.turn);
    if (step.a === 'end') { this.endTurn(t); return; }
    const u = t.units.find((x) => x.id === step.u)!;
    if (step.a === 'move') this.doMove(t, u, reach(t.units, u).get(`${step.c},${step.r}`)!);
    else this.doHit(t, u, t.units.find((x) => x.id === step.t)!);
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

  // ---------- 자리와 연결 ----------

  /** 사람을 판의 자기 자리로 옮긴다 (판을 바라보게) */
  private seatPlayer(t: Table, p: Ent, side: 0 | 1): void {
    const at = seatPos(t.board, side);
    this.teleport(p, at.x, at.z, faceTo(at, BOARDS[t.board]));
  }
  private toLobby(p: Ent): void {
    const a = (p.id * 2.399) % (Math.PI * 2);
    this.teleport(p, LOBBY.x + Math.cos(a) * LOBBY.r, LOBBY.z + Math.sin(a) * LOBBY.r, faceTo({ x: Math.cos(a), z: Math.sin(a) }, { x: 0, z: 0 }));
  }
  /** 순간 이동: 자리와 걷던 목표를 바꾸고 화면에 '바로 옮김'을 알린다 */
  private teleport(p: Ent, x: number, z: number, face: number): void {
    p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.path = null; p.face = face;
    this.g.emit(['r', p.id]);
  }

  /** 사람이 접속했다: 끊겼던 판이 있으면 그 자리로, 아니면 대기실로 */
  private joined(p: Ent): void {
    const t = this.tableOf(p);
    if (!t) { this.toLobby(p); return; }
    const side = this.sideOf(t, p);
    const s = side !== -1 ? t.seats[side] : null;
    if (!s || side === -1) { this.toLobby(p); return; }
    s.ent = p.id; s.goneAt = 0; s.name = p.name;
    this.seatPlayer(t, p, side as 0 | 1);
    this.g.notify(p, 'duelBack');
    const o = t.seats[side === 0 ? 1 : 0], op = o && !o.cpu ? this.g.ents.get(o.ent) : undefined;
    if (op) this.g.notify(op, 'duelFoeBack', p.name);
    this.g.stateDirty = true;
  }

  /** 사람이 월드에서 빠졌다: 자리는 그대로 두고 기다린다 (기다리는 판이면 닫는다) */
  private left(id: number): void {
    for (const t of [...this.tables.values()]) {
      for (const side of [0, 1] as const) {
        const s = t.seats[side];
        if (!s || s.cpu || s.ent !== id) continue;
        s.ent = 0;
        if (t.st === 'wait') { s.goneAt = -1; this.seatOf.delete(s.key); continue; }
        s.goneAt = this.g.now();
        const o = t.seats[side === 0 ? 1 : 0], op = o && !o.cpu ? this.g.ents.get(o.ent) : undefined;
        if (op && t.st === 'play') this.g.notify(op, 'duelFoeLeft', s.name, TURN.graceS);
        else if (op) this.g.notify(op, 'duelFoeGone', s.name);
      }
      this.closeIfEmpty(t);
    }
    this.g.stateDirty = true;
  }

  /** 접속해 있는 사람도, 돌아올 사람도 없으면 판을 닫는다 (말을 치우고 대국판을 비운다) */
  private closeIfEmpty(t: Table): boolean {
    const humans = t.seats.filter((s): s is Seat => !!s && !s.cpu);
    if (humans.some((s) => s.goneAt >= 0)) return false;
    for (const e of t.ents.values()) this.g.remove(e.id);
    for (const s of humans) if (this.seatOf.get(s.key) === t.id) this.seatOf.delete(s.key);
    this.tables.delete(t.id);
    this.g.stateDirty = true;
    return true;
  }

  /** 시험: 판 (id) */
  table(id: number): Table | undefined { return this.tables.get(id); }
  /** 시험: 말의 종류 표 */
  static readonly types = UNIT_TYPES;
  /** 시험: 판의 크기 */
  static readonly size = BOARD.size;
}
