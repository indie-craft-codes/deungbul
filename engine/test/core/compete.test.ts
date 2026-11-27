// 경쟁 (묶음 8): 핵심만의 내용(공 마당) 위에서 작은 '별 겨루기'(둘이 무더기에서 1~3개씩, 마지막을 줍는 쪽이 이김)로 본다.
// Glicko-2의 셈(논문의 예)·셋 이상과 팀의 쌍대 비교, 큐 → 랭크 판 → 레이팅·배치·등급 → 순위표 → 리플레이, 봇으로 채우는 큐, 이탈·잠수의 제재와 반영 안 함, 레이팅 시즌의 부분 초기화와 기간 순위표.
// 규칙의 수치는 시험용 내용의 COMPETE (engine/test/core/shared/content).
import type { RoomView } from '../../shared/defs/rooms';
import { glicko, idleRd, pairwise, ratingCfg, type BoardView, type QueueMe, type RatingMe, type ReplayView } from '../../shared/defs/compete';
import { Game, type Plugin } from '../../server/game/game';
import type { Ent } from '../../server/game/entity';
import type { Room } from '../../server/game/systems/rooms';
import { check } from '../harness';

/** 별 겨루기: 무더기(5~9개: 판의 난수 room.rng)에서 내 차례에 1~3개. 마지막을 주운 쪽이 이긴다. 컴퓨터(봇)는 늘 1개 */
interface Duel { pile: number }
const duel: Plugin = (g) => {
  const take = (room: Room<Duel>, seat: number, n: number) => {
    room.data.pile = Math.max(0, room.data.pile - n);
    g.rooms.touch(room);
    if (room.data.pile === 0) g.rooms.finish(room, seat, 'last'); else g.rooms.pass(room);
  };
  g.rooms.define<Duel>({
    id: 'duel', seats: 2, turnS: 10, graceS: 20, cpuStepMs: 300, rated: true, queueBots: 8, record: true,
    replay: { cmds: ['duel'], view: (room) => ({ pile: room.data.pile, turn: room.turn }) },
    start: (room) => { room.data = { pile: 5 + Math.floor(room.rng() * 5) }; },
    cpu: (room, seat) => take(room, seat, 1),
  });
  g.commands.set('duel', (p, m) => {
    const t = g.rooms.myTurn<Duel>(p);
    if (t && typeof m.n === 'number' && [1, 2, 3].includes(m.n)) take(t.room, t.seat, m.n);
  });
};

function world(extra: Plugin[] = []) {
  let clock = 1_800_000_000_000;
  const g = new Game({ modules: ['rooms', 'boards', 'ranked'], plugins: [duel, ...extra], now: () => clock });
  const run = (s: number) => { for (let i = 0; i < Math.round(s * 20); i++) { clock += 50; g.tick(0.05); } };
  let n = 0;
  const join = (name: string) => g.players.spawn(name, false, null, `key-${name}-${++n}-0123456789ab`);
  const me = <T>(p: Ent, k: string) => g.personal.find((x) => x.name === k)!.state(p) as T;
  const said = (p: Ent, k: string) => g.notices.some((x) => x.id === p.id && x.k === k);
  const out = (p: Ent, t: string) => g.out.filter((o) => o.id === p.id && (o.msg as { t: string }).t === t).map((o) => o.msg as Record<string, unknown>);
  /** 둘이 큐에 서서 짝지어지면 a가 이기게 둔다 (b는 1개씩). leave면 a도 1개씩, b가 첫 수 뒤에 판을 떠난다 */
  const play = (a: Ent, b: Ent, how: 'win' | 'leave' = 'win') => {
    g.command(a, { t: 'room', a: 'quick', def: 'duel' }); g.command(b, { t: 'queue', a: 'join', def: 'duel' });
    for (let k = 0; k < 30 && !g.rooms.of(a); k++) run(0.5); // 레이팅이 벌어지면 범위가 넓어질 때까지
    const room = g.rooms.of<Duel>(a)!;
    for (let k = 0; k < 20 && room.st === 'play'; k++) {
      const who = room.turn === g.rooms.seatOf(room, a) ? a : b;
      if (how === 'leave' && who === b && room.moves[g.rooms.seatOf(room, b)] > 0) { g.command(b, { t: 'room', a: 'leave' }); break; }
      g.command(who, { t: 'duel', n: who === a && how === 'win' ? room.data.pile % 4 || 1 : 1 }); // a는 4의 배수를 남긴다 (b는 늘 1개: a가 이긴다)
    }
    return room;
  };
  return { g, run, join, me, said, out, play, now: () => clock, set: (ms: number) => { clock = ms; } };
}

// ---------- Glicko-2의 셈: Glickman의 예, 쌍대 비교, 쉼 ----------
{
  const c = ratingCfg();
  const x = glicko({ r: 1500, rd: 200, vol: 0.06 }, [{ r: 1400, rd: 30, s: 1 }, { r: 1550, rd: 100, s: 0 }, { r: 1700, rd: 300, s: 0 }], c);
  const pw = pairwise([2, 1, 3, 1], [0, 0, 1, 1]);
  const idle = glicko({ r: 1500, rd: 50, vol: 0.06 }, [], c);
  check(Math.abs(x.r - 1464.06) < 0.05 && Math.abs(x.rd - 151.52) < 0.05 && Math.abs(x.vol - 0.05999) < 1e-5
    && JSON.stringify(pw[0]) === JSON.stringify([{ j: 2, s: 1 }, { j: 3, s: 0 }]) && JSON.stringify(pw[1]) === JSON.stringify([{ j: 2, s: 1 }, { j: 3, s: 0.5 }])
    && idle.rd > 50 && idleRd(80, 0, 1, c) === 80 && idleRd(80, 1, 1 + 10 * 86_400_000, c) === 83 && idleRd(349, 1, 1 + 30 * 86_400_000, c) === 350,
  `Glicko-2: 논문의 예 1500/200 → ${x.r}/${x.rd}/${x.vol} (1464.06/151.52/0.05999), 쌍대 비교는 같은 팀을 빼고 등수로, 쉬면 RD가 7일 뒤 하루 1씩 350까지`);
}

// ---------- 큐 → 랭크 판 → 레이팅·배치·등급 → 순위표 → 리플레이 ----------
{
  const w = world();
  const { g, join, me, out, play } = w;
  const a = join('A'), b = join('B');
  g.command(a, { t: 'room', a: 'quick', def: 'duel' });
  const q = me<QueueMe | null>(a, 'queue');
  const r1 = play(a, b);
  const ra = me<RatingMe[]>(a, 'rating')[0], rb = me<RatingMe[]>(b, 'rating')[0], view = g.personal.find((x) => x.name === 'room')!.state(a) as RoomView;
  // 리플레이: 시드·입력·프레임, 앉았던 사람만
  const cc = join('C');
  g.command(a, { t: 'replay', id: r1.rp }); g.command(cc, { t: 'replay', id: r1.rp });
  const rp = out(a, 'replay')[0]?.s as ReplayView | undefined;
  const pile0 = (rp?.frames[0]?.v as { pile: number } | undefined)?.pile ?? -1;
  // 배치 2판째: 등급과 순위표, 결과 창의 +n
  g.command(a, { t: 'room', a: 'leave' }); g.command(b, { t: 'room', a: 'leave' });
  play(a, b);
  const ra2 = me<RatingMe[]>(a, 'rating')[0];
  g.command(a, { t: 'board' });
  const bv = out(a, 'board').pop()?.s as BoardView | undefined;
  check(!!q && q.def === 'duel' && q.range === 100 && r1.rated && view.rated === 1 && !view.regroup && r1.st === 'over' && r1.win === g.rooms.seatOf(r1, a)
    && ra.n === 1 && ra.need === 2 && ra.tier === -1 && ra.r === 0 && rb.n === 1
    && !!rp && rp.seed === r1.seed && rp.seed > 0 && pile0 >= 5 && pile0 <= 9 && rp.inputs.some((i) => (i.m as { c?: string }).c === 'duel') && rp.frames.length >= 3 && rp.win === r1.win
    && out(cc, 'replay').length === 0 && w.said(cc, 'replayNone')
    && ra2.n === 2 && ra2.r > 1500 && ra2.tier === 1 && !!ra2.last && ra2.last.room !== r1.id && ra2.w === 2 && me<RatingMe[]>(b, 'rating')[0].r < 1500
    && !!bv && bv.id === 'rating:duel' && bv.fmt === 'rating' && bv.rows.length === 2 && bv.rows[0][1] === 'A' && bv.me?.[0] === 1 && bv.period === 'season' && bv.to > w.now(),
  `큐(빠른 대국 → 큐, 범위 ±100) → 랭크 판(다시 하기·같은 무리 없음) → 배치 1/2 동안 등급 숨김 → 2판째 등급 '${ra2.tier}'·레이팅 ${ra2.r}(+${ra2.last?.d}), 진 쪽 ${me<RatingMe[]>(b, 'rating')[0].r}, 순위표 rating:duel 2줄, 리플레이(시드 ${rp?.seed}, 무더기 ${pile0}, 입력 ${rp?.inputs.length}·프레임 ${rp?.frames.length})는 앉았던 사람만`);
}

// ---------- 봇으로 채우는 큐 ----------
{
  const w = world();
  const { g, run, join, me } = w;
  const a = join('A');
  g.command(a, { t: 'queue', a: 'join', def: 'duel' });
  run(3);
  const waiting = !g.rooms.of(a) && !!me<QueueMe | null>(a, 'queue');
  run(6);
  const r = g.rooms.of<Duel>(a)!;
  const seatView = (g.personal.find((x) => x.name === 'room')!.state(a) as RoomView).seats;
  // 봇과의 판을 끝까지: 봇의 레이팅(COMPETE.queue.botR 1400)과 견준다
  for (let k = 0; k < 20 && r.st === 'play'; k++) { if (r.turn === g.rooms.seatOf(r, a)) g.command(a, { t: 'duel', n: Math.min(3, r.data.pile) }); else run(0.5); }
  const ra = me<RatingMe[]>(a, 'rating').find((x) => x.id === 'duel')!;
  check(waiting && !!r && r.rated && r.seats.length === 2 && !!r.seats[1]?.bot && seatView[1].bot === 1 && r.st === 'over' && ra.n === 1 && !!ra.last && ra.last.d === 0,
    `사람이 모자라면 queueBots(8초) 뒤 봇으로 채운다 (화면의 자리에 bot: 1), 봇과의 판도 botR가 있으면 레이팅에 든다 (배치 ${ra.n}/${ra.need})`);
}

// ---------- 이탈·잠수: 랭크 판의 이탈은 패배, 단계 제재(경고 → 5분), 첫 수 전 이탈과 둘 다 끊김은 반영 안 함 ----------
{
  const w = world();
  const { g, run, join, me, said, play } = w;
  const a = join('A'), b = join('B');
  const r1 = play(a, b, 'leave');
  const lb1 = me<{ ban: number; pts: number }>(b, 'leave'), rb = me<RatingMe[]>(b, 'rating')[0];
  const warned = said(b, 'leaveWarn');
  g.command(a, { t: 'room', a: 'leave' });
  play(a, b, 'leave');
  const banned = said(b, 'leavePenalty') && me<{ ban: number }>(b, 'leave').ban === 5;
  g.notices = [];
  g.command(b, { t: 'queue', a: 'join', def: 'duel' });
  const refused = said(b, 'queueBanned') && !me<QueueMe | null>(b, 'queue');
  // 잠수: 시간 넘김이 두 번 이어지면 판에서 빠진다
  g.command(a, { t: 'room', a: 'leave' });
  const c = join('C'), d = join('D');
  g.command(c, { t: 'queue', a: 'join', def: 'duel' }); g.command(d, { t: 'queue', a: 'join', def: 'duel' });
  run(1.1);
  const r3 = g.rooms.of<Duel>(c)!, idle = r3.turn === g.rooms.seatOf(r3, c) ? d : c, busy = idle === c ? d : c;
  g.command(busy, { t: 'duel', n: 1 });
  run(10.2); g.command(busy, { t: 'duel', n: 1 }); run(10.2);
  const afk = r3.st === 'over' && r3.leavers.get(g.rooms.seatOf(r3, idle)) === 'afk' && said(busy, 'afkOut');
  // 첫 수 전에 떠나면 반영 안 함
  const e = join('E'), f = join('F');
  g.command(e, { t: 'queue', a: 'join', def: 'duel' }); g.command(f, { t: 'queue', a: 'join', def: 'duel' });
  run(1.1);
  g.notices = [];
  g.command(f, { t: 'room', a: 'leave' });
  const voided = said(e, 'rankedVoid') && me<RatingMe[]>(e, 'rating')[0].n === 0;
  check(r1.st === 'over' && r1.win === g.rooms.seatOf(r1, a) && rb.n === 1 && rb.l === 1 && warned && lb1.pts === 1 && lb1.ban === 0 && banned && refused && afk && voided
    && g.ranked.leaves.get(b.pid)!.log.length === 2 && g.ranked.leaves.get(b.pid)!.log[0][2] === 'leave',
  '랭크 판을 떠나면 패배(레이팅 반영)·첫 이탈은 경고·둘째는 큐 금지 5분(큐 거절), 시간 넘김 둘이 이어지면 잠수로 빠짐, 첫 수 전 이탈은 반영 안 함, 이탈 기록은 관리자가 본다');
}

// ---------- 레이팅 시즌의 부분 초기화, 기간 순위표(주간)의 초기화와 내 위아래 ----------
{
  const weekly: Plugin = (g) => g.boards.define({ id: 'floor', name: 'boardFloor', period: 'week', fmt: 'stage' });
  const w = world([weekly]);
  const { g, run, join, me, out, play } = w;
  const a = join('A'), b = join('B');
  play(a, b);
  const before = g.ranked.rating('duel', a.pid);
  const ppl = Array.from({ length: 60 }, (_, i) => ({ pid: `p${i}`, name: `P${i}` }));
  ppl.forEach((p, i) => g.boards.submit('floor', p, 100 + i));
  g.boards.submit('floor', a, 105); g.boards.submit('floor', a, 101);
  g.command(a, { t: 'board', id: 'floor' });
  const v1 = out(a, 'board').pop()?.s as BoardView;
  // 14일 주기의 경계를 넘긴다 (그리고 주도 바뀐다)
  w.set(Math.ceil(w.now() / (14 * 86_400_000)) * 14 * 86_400_000 + 1000);
  run(6);
  const after = g.ranked.rating('duel', a.pid);
  g.command(a, { t: 'board', id: 'floor' });
  const v2 = out(a, 'board').pop()?.s as BoardView;
  check(Math.abs(after.r - (before.r + (1500 - before.r) * 0.5)) < 0.02 && after.rd >= 200 && after.best === -1 && me<RatingMe[]>(a, 'rating')[0].season > 0
    && v1.rows.length === 50 && v1.me?.[2] === 105 && v1.me[0] === 56 && v1.around.length === 5 && v1.around[2][1] === 'A' && v1.to > 0
    && v2.rows.length === 0 && v2.me === null && v2.prev.length === 3 && v2.prev[0][1] === 'P59',
  `레이팅 시즌이 바뀌면 기준 쪽으로 절반 당기고(${before.r} → ${after.r}) RD를 200 이상으로, 주간 순위표: 상위 50줄·내 순위 56위와 위아래 둘(같은 값은 먼저 닿은 사람 위), 주가 바뀌면 비우고 지난 1~3등을 남긴다`);
}
