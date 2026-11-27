// 별 줍기: 셋이나 넷이 두는 판의 작은 본보기 (판 모듈 rooms). 시험(../rooms.test.ts)이 돌리고, 문서 14절의 서버 조각이 여기서 따온다.
// 규칙: 가운데 별 무더기에서 내 차례에 1~3개를 줍는다. 바퀴마다 먼저 줍는 사람이 한 자리씩 옮긴다. 무더기가 바닥나면(바퀴의 끝에 본다) 많이 주운 차례로 등수.
// 셋이 모이면 기다림 뒤에 셋으로 시작하고, 혼자·둘이면 컴퓨터가 넷까지 채운다. 기권한 자리는 빠지고 남은 사람끼리 잇는다(틀의 기본).
// 판의 공통화(묶음 7): 방 코드·관전(2초 늦게, 숨은 행운의 수는 구경꾼에게 가지 않는다)·판 기록, 방장이 고르는 규칙 '행운의 수'(lucky: 켜면 자리마다 남이 모르는 수 하나,
// 그 수만큼 주우면 별 하나를 더), 그리고 같은 게임의 둘째 판 '별 쏟기'(rush: 차례 없이 20초 동안 모두가 함께 줍는 실시간 판).
import type { Plugin } from '../../../server/game/game';
import type { Room, RoomDef } from '../../../server/game/systems/rooms';

/** 판 상태: 남은 별, 자리마다 주운 수, 바퀴의 끝을 센 수(시험용), 자리마다의 행운의 수(규칙 lucky가 'on'일 때만, 아니면 빈 배열: 숨은 정보) */
export interface Stars { pile: number; got: number[]; rounds: number; luck: number[] }
/** 앉은 사람에게 가는 개인 상태 stars: 무더기, 자리마다 주운 수, 내 행운의 수 (규칙이 꺼져 있으면 0) */
export interface StarsView { pile: number; got: number[]; luck: number }
export const STARS = { perSeat: 5, turnS: 15, rounds: 8, startAfterS: 20, cpuAfterS: 40, delayS: 2, rushS: 20, rushPerSeat: 6 };

/** 주운 수로 등수: 1부터, 같으면 같은 등수. 빠진 자리(기권·몰수)는 맨 뒤 */
export function starRanks(room: Room<Stars>): number[] {
  const live = (i: number) => !room.seats[i]?.out;
  const key = (i: number) => (live(i) ? room.data.got[i] : -1);
  return room.seats.map((_, i) => 1 + room.seats.filter((__, j) => key(j) > key(i)).length);
}

/** 별 줍기의 규칙 플러그인. over는 시험이 별 줍기의 RoomDef 칸을 바꿔 볼 때 (outEnds, skip, cpuFill, lead …), rush는 별 쏟기의 칸 */
export const stars = (over: Partial<RoomDef<Stars>> = {}, rush: Partial<RoomDef<Stars>> = {}): Plugin => (g) => {
  const take = (room: Room<Stars>, seat: number, n: number) => {
    const bonus = room.data.luck[seat] === n ? 1 : 0;
    const k = Math.min(n + bonus, room.data.pile);
    room.data.pile -= k;
    room.data.got[seat] += k;
    g.rooms.touch(room);
  };
  const end = (room: Room<Stars>) => g.rooms.finish(room, starRanks(room), 'stars', room.data.got);
  const deal = (room: Room<Stars>, per: number) => {
    room.data = { pile: per * room.seats.length, got: room.seats.map(() => 0), rounds: 0, luck: room.opts.lucky === 'on' ? room.seats.map(() => 1 + Math.floor(Math.random() * 3)) : [] };
  };
  // 구경꾼이 보는 것: 무더기와 주운 수 (행운의 수는 빼고)
  const pub = (room: Room<Stars>) => ({ pile: room.data.pile, got: [...room.data.got] });
  g.rooms.define<Stars>({
    seats: { min: 3, max: 4 }, startAfterS: STARS.startAfterS, cpuAfterS: STARS.cpuAfterS,
    turnS: STARS.turnS, rounds: STARS.rounds, rotateFirst: true, pass: false,
    codes: true, record: true, watch: { delayS: STARS.delayS }, watchView: pub, options: { lucky: ['off', 'on'] },
    start: (room) => deal(room, STARS.perSeat),
    // 시간이 다 되면 하나를 대신 줍는다
    timeout: (room, seat) => { take(room, seat, 1); g.rooms.pass(room); },
    cpu: (room, seat) => { take(room, seat, 2); g.rooms.pass(room); },
    // 바퀴의 끝: 별이 바닥났으면 등수로 끝낸다
    roundEnd: (room) => { room.data.rounds++; if (room.data.pile <= 0) end(room); },
    outOfRounds: (room) => end(room),
    ...over,
  });
  // 둘째 판: 차례 없이 모두가 함께 줍는다. 무더기가 바닥나거나 시간이 다 되면 등수
  g.rooms.define<Stars>({
    id: 'rush', seats: { min: 2, max: 4 }, realtimeS: STARS.rushS, cpuAfterS: STARS.cpuAfterS, cpuStepMs: 1500,
    codes: true, record: true, watch: {}, watchView: pub,
    start: (room) => deal(room, STARS.rushPerSeat),
    cpu: (room, seat) => { take(room, seat, 1); if (room.data.pile <= 0) end(room); },
    timeUp: (room) => end(room),
    ...rush,
  });
  // 게임의 수: 내 차례인지 틀에 묻고(별 쏟기는 언제나), 줍고, 차례를 넘긴다
  g.commands.set('star', (p, m) => {
    const t = g.rooms.myTurn<Stars>(p);
    if (!t || typeof m.n !== 'number' || ![1, 2, 3].includes(m.n)) return;
    take(t.room, t.seat, m.n);
    if (t.room.def === 'rush') { if (t.room.data.pile <= 0) end(t.room); } else g.rooms.pass(t.room);
  });
  // 앉은 사람의 화면: 무더기, 주운 수, 내 행운의 수(숨은 정보: 그 자리에만. 구경꾼은 판에 앉지 않아 g.rooms.of가 없고, 판은 watchView로만 본다)
  g.personal.push({
    name: 'stars',
    state: (p): StarsView | null => {
      const r = g.rooms.of<Stars>(p), i = r ? g.rooms.seatOf(r, p) : -1;
      return r && i >= 0 && r.data ? { pile: r.data.pile, got: [...r.data.got], luck: r.data.luck[i] ?? 0 } : null;
    },
  });
};
