// 판(rooms 모듈): 사람(과 컴퓨터) 몇이 따로 된 층에서 차례대로 두는 한 판. 턴제 전술·보드·카드 게임의 방.
// 틀이 맡는 것: 판마다의 인스턴스 층(엔티티·스냅샷이 판마다 나뉜다), 대기실과 짝짓기(빠른 대국·판 만들기·들어가기·컴퓨터와 두기·기다리다 컴퓨터로 채우기),
// 차례의 순서와 기한(시간이 지나면 게임이 정한 처리, 기본은 차례 넘기기), 끊긴 사람의 자리(같은 저장 키로 다시 들어오면 그 자리로, 기다림이 지나면 몰수),
// 기권·다시 하기·판의 끝과 정리(판에 놓은 엔티티를 치우고 사람을 들판으로), 판의 저장(게임이 save/load를 주면 서버를 다시 켜도 이어진다).
// 게임이 맡는 것: 판의 규칙 (RoomDef: 판을 차리는 start, 컴퓨터의 한 수 cpu, 차례의 앞뒤, 판의 끝을 정해 finish를 부르기, 게임 명령의 검사).
// 판의 규칙은 g.rooms.define(def)로 플러그인에서 준다. 화면의 짝은 engine/client/hud/rooms.ts, 모양은 engine/shared/defs/rooms.ts.
import type { RoomLobby, RoomPhase, RoomRow, RoomView } from '../../../shared/defs/rooms';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { fieldLayer, instanceLayer, isField } from '../layers';

/** 판의 한 자리: 사람(저장 키로 기억한다: 끊겼다 돌아와도 같은 자리) 또는 컴퓨터 */
export interface RoomSeat {
  /** 사람의 열쇠: 저장 키(pid). 손님은 'guest:<엔티티 id>'(끊기면 돌아올 수 없다). 컴퓨터는 빈 문자열 */
  key: string;
  /** 지금 그 사람의 엔티티 id (끊겼으면 0) */
  ent: number;
  name: string;
  cpu: boolean;
  /** 끊긴 때(ms, g.now). 0이면 접속해 있다. -1이면 판을 떠났다(돌아오지 않는다) */
  goneAt: number;
  /** 판에서 빠졌다 (기권·몰수): 차례가 건너뛴다 */
  out: boolean;
  /** 다시 하기를 눌렀다 */
  again: boolean;
}

/** 판 하나. data는 게임의 판 상태 (RoomDef.start가 채운다) */
export interface Room<D = unknown> {
  readonly id: number;
  /** 이 판의 층 (판에 앉은 사람과 room.place로 놓은 엔티티가 이 층에 있다: 다른 판·들판과 서로 보이지 않는다) */
  readonly layer: number;
  st: RoomPhase;
  /** 자리 (빈 자리는 null) */
  seats: (RoomSeat | null)[];
  /** 두는 자리 (두는 중이 아니면 -1) */
  turn: number;
  /** 이번 판에서 먼저 둔 자리 (한 바퀴의 시작) */
  first: number;
  /** 몇째 바퀴 (1부터) */
  round: number;
  /** 이번 차례가 끝나는 때(ms, g.now). 기한이 없으면 0 */
  deadline: number;
  /** 끝났으면 이긴 자리 (비김 -2), 아니면 -1 */
  win: number;
  why: string;
  data: D;
  /** 이 판에 놓은 엔티티 (판이 닫히거나 다시 시작하면 치운다) */
  readonly ents: Set<number>;
  /** 판을 연 때(ms): 기다리다 컴퓨터로 채우는 셈 (RoomDef.cpuAfterS) */
  openedAt: number;
  /** 컴퓨터가 다음 수를 두는 때(ms) */
  cpuAt: number;
  /** 화면에 보낼 것이 바뀌면 오른다 (개인 상태 room을 다시 보낸다) */
  ver: number;
}

/** 자리 (월드 좌표와 바라보는 방향: 틀의 face, atan2(dx, dz)) */
export interface Spot { x: number; z: number; face?: number }

/**
 * 판의 규칙 (g.rooms.define). 칸은 모두 선택이고, start만 꼭 준다. 시간은 g.now()(벽시계, 시험은 정해진 시계)로 잰다
 */
export interface RoomDef<D = unknown> {
  /** 자리 수 (기본 2) */
  seats?: number;
  /** 한 차례의 제한 시간(초). 0이면 기한이 없다 (기본 30) */
  turnS?: number;
  /** 바퀴의 상한: 넘으면 outOfRounds (0이면 없다, 기본 0) */
  rounds?: number;
  /** 끊긴 사람을 기다리는 초: 지나면 그 자리는 판에서 빠진다(두는 중이면 몰수, 까닭 'left') (기본 60) */
  graceS?: number;
  /** 동시에 열 수 있는 판의 수 (기본 200) */
  max?: number;
  /** 판을 열고 이만큼(초) 기다려도 사람이 차지 않으면 빈 자리를 컴퓨터로 채워 시작한다. 0이면 채우지 않는다 (cpu가 있어야 한다. 기본 0) */
  cpuAfterS?: number;
  /** 컴퓨터가 한 수를 두는 간격(ms): 사람이 보고 따라갈 수 있게 (기본 700) */
  cpuStepMs?: number;
  /** 앉은 동안 걸을 수 있는가 (기본 false: 판에 앉으면 g.rules.speed가 0, 화면의 조이스틱이 숨는다) */
  walk?: boolean;
  /** 사람이 '차례 넘기기'(명령 room a:'pass')를 할 수 있는가 (기본 true) */
  pass?: boolean;
  /** 다시 하기에서 자리를 한 칸씩 돌린다: 먼저 두는 사람이 바뀐다 (기본 true) */
  againSwap?: boolean;
  /** 자리 i에 앉은 사람이 서는 곳 (판의 층 안). 없으면 사람은 제자리에서 판의 층으로만 옮긴다 */
  seatAt?(room: Room<D>, seat: number): Spot;
  /** 판 밖의 자리: 판을 떠날 때, 그리고 판 없이 접속한 사람(서버를 다시 켜서 판이 없어졌거나 끝난 판의 자리에서 나간 사람). 없으면 제자리 */
  exitAt?(p: Ent): Spot;
  /** 판을 차린다: 판 상태(room.data)를 만들고 말을 놓는다 (room.place). 판이 시작할 때와 다시 하기마다. 놓았던 엔티티는 이미 치웠다 */
  start(room: Room<D>): void;
  /** 그 자리의 차례가 시작됐다 / 끝난다 (넘기기 전에: 등불돌의 회복 같은 것) */
  turnStart?(room: Room<D>, seat: number): void;
  turnEnd?(room: Room<D>, seat: number): void;
  /** 그 자리의 시간이 다 됐다. 없으면 차례를 넘긴다 (g.rooms.pass). 모두에게 roomTimeout을 알린 뒤에 불린다 */
  timeout?(room: Room<D>, seat: number): void;
  /** 컴퓨터의 한 수 (cpuStepMs마다 불린다). 할 것이 없으면 g.rooms.pass(room). 없으면 컴퓨터는 늘 넘긴다 (그런 판에서는 컴퓨터와 두기가 막힌다) */
  cpu?(room: Room<D>, seat: number): void;
  /** 바퀴를 다 썼다: 게임이 finish로 끝을 정한다. 없으면 비김 (까닭 'rounds') */
  outOfRounds?(room: Room<D>): void;
  /** 판이 끝났다 (finish 뒤): 전적 같은 것을 적는다. 접속해 있는 사람은 g.rooms.playerAt(room, i) */
  finished?(room: Room<D>): void;
  /** 판 상태를 저장할 값으로 (주면 두는 중인 판이 월드와 함께 저장되어 서버를 다시 켜도 이어진다: load와 짝) */
  save?(room: Room<D>): unknown;
  /** 저장한 값으로 판 상태와 엔티티를 되살린다 (room.place). 예외를 던지면 그 판은 버린다 */
  load?(room: Room<D>, raw: unknown): void;
}

const MSG_ROOM = new Set(['quick', 'host', 'cpu', 'join', 'leave', 'pass', 'resign', 'again']);
/** 저장한 판에서 읽는 칸의 상한 (깨진 저장을 막는다) */
const SEATS_MAX = 16;

export class Rooms {
  private def: RoomDef<unknown> | null = null;
  private readonly rooms = new Map<number, Room<unknown>>();
  /** 사람의 열쇠 → 앉은 판 id */
  private readonly seated = new Map<string, number>();
  /** 앉기 전의 들판 층 (열쇠마다): 판을 떠나면 돌아간다 */
  private readonly back = new Map<string, number>();
  /** 사람(엔티티 id)마다 마지막으로 보낸 판의 버전 (개인 상태 room) */
  private readonly sentVer = new Map<number, string>();
  private nextId = 1;

  constructor(private g: Game) {
    g.commands.set('room', (p, m) => this.command(p, m));
    g.ticks.push(() => this.tick());
    g.personal.push({
      name: 'room',
      state: (p): RoomView | null => this.view(p),
      dirty: (p) => this.sentVer.get(p.id) !== this.verOf(p),
      sent: (p) => { this.sentVer.set(p.id, this.verOf(p)); },
    });
    g.shared.push({ name: 'rooms', state: (): RoomLobby => this.lobby() });
    g.on('playerJoined', (p) => this.joined(p));
    g.on('playerLeft', (id) => this.left(id));
    // 앉은 사람은 걷지 않는다 (RoomDef.walk). 모든 시스템과 게임의 규칙이 g.rules.speed를 정한 뒤에 감싼다
    g.ready.push(() => {
      const walk = g.rules.speed;
      g.rules.speed = (p) => (this.def && !this.def.walk && this.seated.has(Rooms.keyOf(p)) ? 0 : walk(p));
    });
  }

  /** 사람의 열쇠: 저장 키, 손님은 엔티티 id */
  static keyOf(p: Ent): string { return p.pid || `guest:${p.id}`; }

  /** 판의 규칙을 준다 (플러그인에서 한 번). 주지 않으면 판을 열 수 없다 (명령을 무시한다) */
  define<D>(def: RoomDef<D>): void {
    if (this.def) throw new Error('g.rooms.define은 한 번만 부릅니다');
    const n = def.seats ?? 2;
    if (!Number.isInteger(n) || n < 1 || n > SEATS_MAX) throw new Error(`RoomDef.seats는 1~${SEATS_MAX}의 정수입니다 (${n})`);
    this.def = def;
    if (def.save && def.load) this.g.worldSaves.push({ name: 'rooms', save: () => this.saveAll(), load: (raw) => this.loadAll(raw) });
    this.g.stateDirty = true;
  }

  private get d(): RoomDef<unknown> { return this.def!; }
  private get size(): number { return this.def?.seats ?? 2; }
  private get turnMs(): number { return Math.max(0, this.def?.turnS ?? 30) * 1000; }

  // ---------- 읽기 ----------

  /** 그 사람이 앉은 판 (기다리는 판, 끝난 판도) */
  of<D = unknown>(p: Ent): Room<D> | undefined { const id = this.seated.get(Rooms.keyOf(p)); return id === undefined ? undefined : (this.rooms.get(id) as Room<D> | undefined); }
  /** 판 (id) */
  get<D = unknown>(id: number): Room<D> | undefined { return this.rooms.get(id) as Room<D> | undefined; }
  /** 열린 판들 */
  all(): Room<unknown>[] { return [...this.rooms.values()]; }
  /** 열린 판의 수 */
  get count(): number { return this.rooms.size; }
  /** 그 사람의 자리 번호 (앉지 않았으면 -1) */
  seatOf(room: Room<unknown>, p: Ent): number { const k = Rooms.keyOf(p); return room.seats.findIndex((s) => !!s && !s.cpu && s.key === k); }
  /** 자리 i에 앉아 지금 접속해 있는 사람 (컴퓨터, 빈 자리, 끊긴 사람이면 undefined) */
  playerAt(room: Room<unknown>, i: number): Ent | undefined {
    const s = room.seats[i];
    return s && !s.cpu && s.goneAt === 0 ? this.g.ents.get(s.ent) : undefined;
  }
  /** 판에 앉아 접속해 있는 사람들 */
  players(room: Room<unknown>): Ent[] { return room.seats.map((_, i) => this.playerAt(room, i)).filter((p): p is Ent => !!p); }
  /** 그 사람이 판에 앉아 있는가 (채널이 그 사람을 들판에 세우지 않게) */
  holds(p: Ent): boolean { const r = this.of(p); return !!r && !isField(p.layer) && p.layer === r.layer; }

  /**
   * 그 사람이 두는 중인 판에서 자기 차례인가 (게임 명령의 검사): 맞으면 판과 자리, 아니면 null.
   * 판에 앉아 두는 중인데 차례가 아니면 roomNotTurn을 알린다
   */
  myTurn<D = unknown>(p: Ent): { room: Room<D>; seat: number } | null {
    const room = this.of<D>(p);
    if (!room || room.st !== 'play') return null;
    const seat = this.seatOf(room as Room<unknown>, p);
    if (seat !== room.turn) { this.g.notify(p, 'roomNotTurn'); return null; }
    return { room, seat };
  }

  // ---------- 판 위의 엔티티 ----------

  /** 판의 층에 게임의 종류를 놓는다 (g.place와 같고 층만 판의 것). 판이 다시 시작하거나 닫히면 치운다 */
  place(room: Room<unknown>, kind: string, at: { x: number; z: number; type?: string; name?: string; face?: number }): Ent {
    const e = this.g.place(kind, { ...at, layer: room.layer });
    room.ents.add(e.id);
    return e;
  }
  /** 판에 놓은 엔티티 하나를 치운다 */
  unplace(room: Room<unknown>, id: number): void { room.ents.delete(id); this.g.remove(id); }

  /** 판의 화면 상태가 바뀌었다 (틀이 모르는 바뀜을 게임이 알릴 때: 개인 상태 room을 다시 보낸다) */
  touch(room: Room<unknown>): void {
    room.ver++;
    if (this.def?.save) this.g.saveDirty = true;
  }

  // ---------- 명령 ----------

  private command(p: Ent, m: Record<string, unknown>): void {
    const a = m.a;
    if (!this.def || typeof a !== 'string' || !MSG_ROOM.has(a)) return;
    switch (a) {
      case 'quick': this.quick(p); return;
      case 'host': this.host(p); return;
      case 'cpu': this.withCpu(p); return;
      case 'join': if (typeof m.id === 'number' && Number.isInteger(m.id)) this.join(p, m.id); return;
      case 'leave': this.leave(p); return;
      case 'pass': if (this.def.pass !== false) { const t = this.myTurn(p); if (t) this.pass(t.room); } return;
      case 'resign': this.resign(p); return;
      case 'again': this.again(p); return;
    }
  }

  /** 앉아 있으면 알리고 참 */
  private busy(p: Ent): boolean {
    if (!this.seated.has(Rooms.keyOf(p))) return false;
    this.g.notify(p, 'roomBusy');
    return true;
  }

  /** 빠른 대국: 기다리는 판 가운데 가장 먼저 연 판에 들어가고, 없으면 판을 열고 기다린다 */
  quick(p: Ent): void {
    if (!this.def || this.busy(p)) return;
    const open = [...this.rooms.values()].find((r) => this.joinable(r));
    if (open) this.join(p, open.id); else this.host(p);
  }

  /** 판을 연다 (사람이 다 차면 시작한다) */
  host(p: Ent): Room<unknown> | undefined {
    if (!this.def || this.busy(p) || p.bot) return undefined;
    if (this.rooms.size >= (this.def.max ?? 200)) { this.g.notify(p, 'roomFull'); return undefined; }
    const now = this.g.now();
    const room: Room<unknown> = {
      id: this.nextId++, layer: instanceLayer(this.g), st: 'wait', seats: Array.from({ length: this.size }, () => null), turn: -1, first: 0, round: 1,
      deadline: 0, win: -1, why: '', data: undefined, ents: new Set(), openedAt: now, cpuAt: 0, ver: 0,
    };
    this.rooms.set(room.id, room);
    this.sit(room, p, 0);
    this.g.stateDirty = true;
    if (!this.fillIfFull(room)) this.g.notify(p, 'roomWait');
    return room;
  }

  /** 컴퓨터와 두기: 판을 열고 기다리던 사람이면 그 판의 빈 자리를 컴퓨터로, 아니면 새 판을 열어 컴퓨터로 채운다 */
  withCpu(p: Ent): void {
    if (!this.def) return;
    if (!this.def.cpu) { this.g.notify(p, 'roomGone'); return; }
    const r = this.of(p);
    if (r && r.st === 'wait' && this.seatOf(r, p) === 0) { this.fillCpu(r); return; }
    const room = this.host(p);
    if (room && room.st === 'wait') this.fillCpu(room);
  }

  /** 기다리는 판에 들어간다 (다 차면 시작한다) */
  join(p: Ent, id: number): void {
    if (!this.def || this.busy(p) || p.bot) return;
    const room = this.rooms.get(id);
    if (!room || !this.joinable(room)) { this.g.notify(p, 'roomGone'); return; }
    this.sit(room, p, room.seats.findIndex((s) => !s));
    this.g.stateDirty = true;
    this.fillIfFull(room);
  }

  private joinable(r: Room<unknown>): boolean { return r.st === 'wait' && r.seats.some((s) => !s) && r.seats.every((s) => !s || s.cpu || s.goneAt === 0); }

  /** 대기실로: 두는 중이면 기권으로 치고 판을 떠난다 (다시 돌아오지 않는다) */
  leave(p: Ent): void {
    const room = this.of(p);
    if (!room) { this.exit(p); return; }
    const i = this.seatOf(room, p);
    if (i >= 0) {
      if (room.st === 'play') this.forfeit(room, i, 'resign');
      const s = room.seats[i]!;
      if (room.st === 'wait') room.seats[i] = null; // 기다리는 판의 빈 자리로 돌린다
      else { s.ent = 0; s.goneAt = -1; }
      if (room.st === 'over') for (const q of this.players(room)) if (q !== p) this.g.notify(q, 'roomFoeGone', s.name);
    }
    this.seated.delete(Rooms.keyOf(p));
    this.exit(p);
    room.ver++;
    this.closeIfEmpty(room);
    this.g.stateDirty = true;
  }

  /** 기권: 두는 중인 판에서 빠진다 (둘이 두는 판이면 상대가 이긴다) */
  resign(p: Ent): void {
    const room = this.of(p);
    if (!room || room.st !== 'play') return;
    const i = this.seatOf(room, p);
    if (i >= 0) this.forfeit(room, i, 'resign');
  }

  /** 다시 하기: 컴퓨터만 남았으면 곧바로, 사람끼리는 모두 누르면 (RoomDef.againSwap이면 자리를 한 칸씩 돌려) 새 판 */
  again(p: Ent): void {
    const room = this.of(p);
    if (!room || room.st !== 'over') return;
    const i = this.seatOf(room, p);
    if (i < 0) return;
    const gone = room.seats.find((s) => !!s && !s.cpu && s.goneAt !== 0);
    if (gone) { this.g.notify(p, 'roomFoeGone', gone.name); return; }
    room.seats[i]!.again = true;
    room.ver++;
    if (room.seats.some((s) => !!s && !s.cpu && !s.again)) { this.g.notify(p, 'roomAgainWait'); return; }
    if (this.def?.againSwap !== false && room.seats.length > 1) room.seats = [...room.seats.slice(1), room.seats[0]];
    this.start(room);
  }

  // ---------- 차례 ----------

  /** 차례를 다음 자리로 넘긴다: 마친 자리의 turnEnd, 빠진 자리는 건너뛰고, 한 바퀴가 돌면 round가 오르고 상한을 넘으면 outOfRounds */
  pass(room: Room<unknown>): void {
    if (room.st !== 'play') return;
    const def = this.d, n = room.seats.length, cur = room.turn;
    def.turnEnd?.(room, cur);
    if (room.st !== 'play') return;
    const rel = (i: number) => (i - room.first + n) % n;
    let next = cur;
    for (let k = 1; k <= n; k++) { const i = (cur + k) % n; if (!room.seats[i]?.out) { next = i; break; } }
    if (rel(next) <= rel(cur)) room.round++;
    const max = def.rounds ?? 0;
    if (max > 0 && room.round > max) {
      room.round = max;
      if (def.outOfRounds) def.outOfRounds(room); else this.finish(room, -2, 'rounds');
      if (room.st === 'play') this.finish(room, -2, 'rounds'); // 게임이 끝을 정하지 않았으면 비김
      return;
    }
    this.begin(room, next);
  }

  /** 그 자리의 차례를 시작한다: 기한과 컴퓨터의 시각을 새로 */
  private begin(room: Room<unknown>, seat: number): void {
    const now = this.g.now();
    room.turn = seat;
    room.deadline = this.turnMs ? now + this.turnMs : 0;
    room.cpuAt = now + (this.def?.cpuStepMs ?? 700) * 1.5;
    this.touch(room);
    this.d.turnStart?.(room, seat);
  }

  /** 판을 끝낸다: win은 이긴 자리 (비김 -2), why는 까닭 (화면의 roomWhy가 문장으로). 접속해 있는 사람에게 roomResult [0 이김 1 짐 2 비김, 까닭] */
  finish(room: Room<unknown>, win: number, why: string): void {
    if (room.st !== 'play') return;
    room.st = 'over'; room.win = win; room.why = why; room.turn = -1; room.deadline = 0;
    for (const s of room.seats) if (s) s.again = false;
    room.seats.forEach((_, i) => {
      const p = this.playerAt(room, i);
      if (p) this.g.notify(p, 'roomResult', win === -2 ? 2 : win === i ? 0 : 1, why);
    });
    this.touch(room);
    this.g.stateDirty = true;
    this.d.finished?.(room);
  }

  /** 자리 i가 판에서 빠진다 (기권·몰수): 남은 자리가 하나면 그 자리가 이기고, 없으면 비김. 남은 자리가 여럿이면 차례만 건너뛴다 */
  private forfeit(room: Room<unknown>, i: number, why: string): void {
    const s = room.seats[i];
    if (!s || room.st !== 'play') return;
    s.out = true;
    const live = room.seats.map((x, k) => (x && !x.out ? k : -1)).filter((k) => k >= 0);
    if (live.length <= 1) { this.finish(room, live[0] ?? -2, why); return; }
    if (room.turn === i) this.pass(room); else this.touch(room);
  }

  // ---------- 시작과 자리 ----------

  /** 자리가 다 찼으면 시작한다 */
  private fillIfFull(room: Room<unknown>): boolean {
    if (room.seats.some((s) => !s)) return false;
    this.start(room);
    return true;
  }
  private fillCpu(room: Room<unknown>): void {
    room.seats = room.seats.map((s) => s ?? { key: '', ent: 0, name: '', cpu: true, goneAt: 0, out: false, again: false });
    this.g.stateDirty = true;
    this.start(room);
  }

  /** 판을 (처음부터 다시) 차린다: 놓았던 엔티티를 치우고, 게임의 start, 자리 0이 먼저 둔다 */
  private start(room: Room<unknown>): void {
    for (const id of room.ents) this.g.remove(id);
    room.ents.clear();
    room.st = 'play'; room.round = 1; room.first = 0; room.win = -1; room.why = '';
    for (const s of room.seats) if (s) { s.again = false; s.out = false; }
    this.d.start(room);
    this.g.stateDirty = true;
    room.seats.forEach((s, i) => {
      if (!s || s.cpu) return;
      const p = this.playerAt(room, i);
      if (!p) return;
      this.place2(room, p, i);
      const foe = room.seats.find((o, k) => k !== i && !!o);
      this.g.notify(p, 'roomStart', i === room.first ? 1 : 0, foe ? foe.name : '');
    });
    this.begin(room, room.first);
  }

  /** 사람을 판의 자리 i에 앉힌다 (판의 층으로 옮기고 그 자리에 세운다) */
  private sit(room: Room<unknown>, p: Ent, i: number): void {
    const k = Rooms.keyOf(p);
    room.seats[i] = { key: k, ent: p.id, name: p.name, cpu: false, goneAt: 0, out: false, again: false };
    this.seated.set(k, room.id);
    if (isField(p.layer)) this.back.set(k, p.layer);
    this.place2(room, p, i);
    room.ver++;
  }

  /** 사람을 판의 층과 자리로 옮긴다 */
  private place2(room: Room<unknown>, p: Ent, i: number): void {
    p.layer = room.layer;
    const at = this.d.seatAt?.(room, i);
    if (at) this.g.movement.teleport(p, at.x, at.z, at.face);
    else this.g.movement.teleport(p, p.x, p.z);
  }

  /** 판 밖으로: 앉기 전의 들판 층과 판 밖의 자리 (RoomDef.exitAt) */
  private exit(p: Ent): void {
    const k = Rooms.keyOf(p);
    if (!isField(p.layer)) p.layer = this.back.get(k) ?? fieldLayer(1);
    this.back.delete(k);
    const at = this.def?.exitAt?.(p);
    if (at) this.g.movement.teleport(p, at.x, at.z, at.face);
    else this.g.movement.teleport(p, p.x, p.z);
  }

  /** 접속해 있는 사람도, 돌아올 사람도 없으면 판을 닫는다 (엔티티를 치우고 남은 열쇠를 지운다) */
  private closeIfEmpty(room: Room<unknown>): boolean {
    const humans = room.seats.filter((s): s is RoomSeat => !!s && !s.cpu);
    if (humans.some((s) => s.goneAt >= 0)) return false;
    this.close(room);
    return true;
  }
  private close(room: Room<unknown>): void {
    for (const id of room.ents) this.g.remove(id);
    room.ents.clear();
    for (const s of room.seats) if (s && !s.cpu && this.seated.get(s.key) === room.id) this.seated.delete(s.key);
    this.rooms.delete(room.id);
    this.g.stateDirty = true;
    if (this.def?.save) this.g.saveDirty = true;
  }

  // ---------- 접속 ----------

  /** 사람이 접속했다: 끊겼던 판이 있으면 그 자리로 (roomBack, 다른 사람에게 roomFoeBack), 아니면 판 밖의 자리로 */
  private joined(p: Ent): void {
    if (!this.def) return;
    const room = this.of(p);
    const i = room ? this.seatOf(room, p) : -1;
    if (!room || i < 0) { if (this.def.exitAt && !p.bot) { const at = this.def.exitAt(p); this.g.movement.teleport(p, at.x, at.z, at.face); } return; }
    const s = room.seats[i]!;
    s.ent = p.id; s.goneAt = 0; s.name = p.name;
    this.place2(room, p, i);
    this.g.notify(p, 'roomBack');
    for (const q of this.players(room)) if (q !== p) this.g.notify(q, 'roomFoeBack', p.name);
    this.touch(room);
  }

  /** 사람이 월드에서 빠졌다: 두는 중·끝난 판은 자리를 남기고 기다린다(graceS), 기다리는 판의 자리는 비운다 */
  private left(id: number): void {
    this.sentVer.delete(id);
    for (const room of [...this.rooms.values()]) {
      const i = room.seats.findIndex((s) => !!s && !s.cpu && s.ent === id && s.goneAt === 0);
      if (i < 0) continue;
      const s = room.seats[i]!;
      s.ent = 0;
      if (room.st === 'wait') { this.seated.delete(s.key); this.back.delete(s.key); room.seats[i] = null; }
      else {
        s.goneAt = this.g.now();
        for (const q of this.players(room)) this.g.notify(q, room.st === 'play' ? 'roomFoeLeft' : 'roomFoeGone', s.name, this.def?.graceS ?? 60);
      }
      room.ver++;
      this.g.stateDirty = true;
      this.closeIfEmpty(room);
    }
  }

  // ---------- 시간 ----------

  private tick(): void {
    if (!this.def || !this.rooms.size) return;
    const now = this.g.now(), def = this.d, grace = (def.graceS ?? 60) * 1000;
    for (const room of [...this.rooms.values()]) {
      // 끊긴 사람: 기다림이 지나면 판에서 빠진다 (두는 중이면 몰수)
      room.seats.forEach((s, i) => {
        if (!s || s.cpu || s.goneAt <= 0 || now - s.goneAt < grace) return;
        s.goneAt = -1;
        if (this.seated.get(s.key) === room.id) this.seated.delete(s.key);
        this.back.delete(s.key);
        if (room.st === 'play') this.forfeit(room, i, 'left'); else room.ver++;
      });
      if (this.closeIfEmpty(room)) continue;
      // 기다리는 판: 오래 차지 않으면 컴퓨터로 채운다
      if (room.st === 'wait') {
        const after = def.cpuAfterS ?? 0;
        if (after > 0 && def.cpu && now - room.openedAt >= after * 1000) this.fillCpu(room);
        continue;
      }
      if (room.st !== 'play') continue;
      // 시간이 다 됐다: 모두에게 알리고 게임이 정한 처리 (기본: 넘기기)
      if (room.deadline && now >= room.deadline) {
        const seat = room.turn, who = room.seats[seat];
        for (const q of this.players(room)) this.g.notify(q, 'roomTimeout', who?.cpu ? '' : who?.name ?? '');
        if (def.timeout) def.timeout(room, seat); else this.pass(room);
        // 게임의 처리가 차례를 넘기지 않았으면 기한만 새로 (같은 틱에서 끝없이 돌지 않게)
        if (room.st === 'play' && room.turn === seat && room.deadline <= now) this.begin(room, seat);
        continue;
      }
      // 컴퓨터의 차례: 한 수씩 간격을 두고
      const s = room.seats[room.turn];
      if (s?.cpu && now >= room.cpuAt) {
        room.cpuAt = now + (def.cpuStepMs ?? 700);
        if (def.cpu) def.cpu(room, room.turn); else this.pass(room);
      }
    }
  }

  // ---------- 화면에 보내는 것 ----------

  private verOf(p: Ent): string { const r = this.of(p); return r ? `${r.id}.${r.ver}.${this.seatOf(r, p)}` : '-'; }

  private view(p: Ent): RoomView | null {
    const room = this.of(p);
    if (!room) return null;
    const def = this.d, now = this.g.now();
    return {
      id: room.id, st: room.st, me: this.seatOf(room, p),
      seats: room.seats.map((s) => ({ name: s && !s.cpu ? s.name : '', cpu: s?.cpu ? 1 : 0, away: !s || s.cpu ? 0 : s.goneAt > 0 ? 1 : s.goneAt < 0 || s.out ? 2 : 0, empty: s ? 0 : 1, again: s?.again ? 1 : 0 })),
      turn: room.st === 'play' ? room.turn : -1, round: room.round, rounds: def.rounds ?? 0,
      left: room.st === 'play' && room.deadline ? Math.max(0, room.deadline - now) : 0, turnMs: this.turnMs,
      win: room.win, why: room.why, pass: def.pass === false ? 0 : 1, walk: def.walk ? 1 : 0,
    };
  }

  private lobby(): RoomLobby {
    const rows: RoomRow[] = [...this.rooms.values()].map((r) => [
      r.id, r.seats[0] && !r.seats[0].cpu ? r.seats[0].name : r.seats.find((s) => !!s && !s.cpu)?.name ?? '',
      r.seats.filter((s) => !!s).length, r.seats.length, r.st === 'wait' ? 0 : r.st === 'play' ? 1 : 2, r.seats.some((s) => s?.cpu) ? 1 : 0,
    ]);
    return { rows, cpu: this.def?.cpu ? 1 : 0, cpuAfterS: this.def?.cpu ? this.def.cpuAfterS ?? 0 : 0 };
  }

  // ---------- 저장 (RoomDef.save와 load를 준 게임만) ----------

  /** 두는 중인 판만 적는다 (기다리는 판과 끝난 판은 다시 켜면 없어진다: 사람은 대기실로) */
  private saveAll(): unknown {
    const def = this.d, now = this.g.now();
    const rooms = [...this.rooms.values()].filter((r) => r.st === 'play').map((r) => ({
      id: r.id, turn: r.turn, first: r.first, round: r.round, left: r.deadline ? Math.max(0, r.deadline - now) : 0,
      seats: r.seats.map((s) => (s ? { key: s.key, name: s.name, cpu: s.cpu ? 1 : 0, out: s.out || s.goneAt < 0 ? 1 : 0 } : null)),
      data: def.save!(r),
    }));
    return { next: this.nextId, rooms };
  }

  /**
   * 저장한 판을 되살린다 (서버를 켤 때, 아무도 접속하기 전). 사람의 자리는 모두 '끊긴 채'(지금부터 graceS를 기다린다)로 둔다:
   * 같은 저장 키로 다시 접속하면 그 자리로 돌아온다. 손님의 자리는 돌아올 수 없어 빠진 것으로 친다. 두던 차례는 처음부터 다시 준다(재시작은 누구의 탓도 아니다)
   */
  private loadAll(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const w = raw as { next?: unknown; rooms?: unknown };
    const now = this.g.now(), def = this.d;
    if (typeof w.next === 'number' && Number.isInteger(w.next) && w.next > this.nextId && w.next < 1e9) this.nextId = w.next;
    for (const one of Array.isArray(w.rooms) ? w.rooms : []) {
      if (typeof one !== 'object' || one === null) continue;
      try {
        const r = one as Record<string, unknown>;
        if (!Array.isArray(r.seats) || r.seats.length !== this.size) continue;
        const seats = r.seats.map((x): RoomSeat | null => {
          if (typeof x !== 'object' || x === null) return null;
          const s = x as Record<string, unknown>, cpu = s.cpu === 1, key = typeof s.key === 'string' ? s.key.slice(0, 200) : '';
          const guest = !cpu && (!key || key.startsWith('guest:'));
          return { key: cpu ? '' : key, ent: 0, name: typeof s.name === 'string' ? s.name.slice(0, 40) : '', cpu, goneAt: cpu ? 0 : guest || s.out === 1 ? -1 : now, out: s.out === 1 || guest, again: false };
        });
        if (seats.some((s) => !s) || seats.some((s) => !!s && !s.cpu && s.goneAt >= 0 && this.seated.has(s.key))) continue;
        const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
        const id = int(r.id, 1, 1e9, this.nextId++);
        if (this.rooms.has(id)) continue;
        const room: Room<unknown> = {
          id, layer: instanceLayer(this.g), st: 'play', seats, turn: int(r.turn, 0, seats.length - 1, 0), first: int(r.first, 0, seats.length - 1, 0), round: int(r.round, 1, 1e6, 1),
          deadline: 0, win: -1, why: '', data: undefined, ents: new Set(), openedAt: now, cpuAt: 0, ver: 0,
        };
        def.load!(room, r.data);
        this.rooms.set(room.id, room);
        for (const s of seats) if (s && !s.cpu && s.goneAt >= 0) this.seated.set(s.key, room.id);
        if (this.nextId <= room.id) this.nextId = room.id + 1;
        const live = seats.filter((s) => !!s && !s.out);
        if (live.length <= 1) { this.finish(room, seats.findIndex((s) => !!s && !s.out), 'left'); this.closeIfEmpty(room); continue; }
        if (room.seats[room.turn]?.out) { this.begin(room, room.turn); this.pass(room); } else this.begin(room, room.turn);
        this.closeIfEmpty(room);
      } catch (err) {
        console.error('[rooms] 저장된 판 하나를 되살리지 못했습니다:', err);
      }
    }
    this.g.stateDirty = true;
  }
}
