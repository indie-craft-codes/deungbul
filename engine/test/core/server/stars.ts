// 별 줍기: 셋이나 넷이 두는 판의 작은 본보기 (판 모듈 rooms). 시험(../rooms.test.ts)이 돌리고, 문서 14절의 서버 조각이 여기서 따온다.
// 규칙: 가운데 별 무더기에서 내 차례에 1~3개를 줍는다. 바퀴마다 먼저 줍는 사람이 한 자리씩 옮긴다. 무더기가 바닥나면(바퀴의 끝에 본다) 많이 주운 차례로 등수.
// 셋이 모이면 기다림 뒤에 셋으로 시작하고, 혼자·둘이면 컴퓨터가 넷까지 채운다. 기권한 자리는 빠지고 남은 사람끼리 잇는다(틀의 기본).
import type { Plugin } from '../../../server/game/game';
import type { Room, RoomDef } from '../../../server/game/systems/rooms';

/** 판 상태: 남은 별, 자리마다 주운 수, 바퀴의 끝을 센 수(시험용) */
export interface Stars { pile: number; got: number[]; rounds: number }
export const STARS = { perSeat: 5, turnS: 15, rounds: 8, startAfterS: 20, cpuAfterS: 40 };

/** 주운 수로 등수: 1부터, 같으면 같은 등수. 빠진 자리(기권·몰수)는 맨 뒤 */
export function starRanks(room: Room<Stars>): number[] {
  const live = (i: number) => !room.seats[i]?.out;
  const key = (i: number) => (live(i) ? room.data.got[i] : -1);
  return room.seats.map((_, i) => 1 + room.seats.filter((__, j) => key(j) > key(i)).length);
}

/** 별 줍기의 규칙 플러그인. over는 시험이 RoomDef의 칸을 바꿔 볼 때 (outEnds, skip, cpuFill …) */
export const stars = (over: Partial<RoomDef<Stars>> = {}): Plugin => (g) => {
  const take = (room: Room<Stars>, seat: number, n: number) => {
    const k = Math.min(n, room.data.pile);
    room.data.pile -= k;
    room.data.got[seat] += k;
    g.rooms.touch(room);
  };
  const end = (room: Room<Stars>) => g.rooms.finish(room, starRanks(room), 'stars', room.data.got);
  g.rooms.define<Stars>({
    seats: { min: 3, max: 4 }, startAfterS: STARS.startAfterS, cpuAfterS: STARS.cpuAfterS,
    turnS: STARS.turnS, rounds: STARS.rounds, rotateFirst: true, pass: false,
    start: (room) => { room.data = { pile: STARS.perSeat * room.seats.length, got: room.seats.map(() => 0), rounds: 0 }; },
    // 시간이 다 되면 하나를 대신 줍는다
    timeout: (room, seat) => { take(room, seat, 1); g.rooms.pass(room); },
    cpu: (room, seat) => { take(room, seat, 2); g.rooms.pass(room); },
    // 바퀴의 끝: 별이 바닥났으면 등수로 끝낸다
    roundEnd: (room) => { room.data.rounds++; if (room.data.pile <= 0) end(room); },
    outOfRounds: (room) => end(room),
    ...over,
  });
  // 게임의 수: 내 차례인지 틀에 묻고, 줍고, 차례를 넘긴다
  g.commands.set('star', (p, m) => {
    const t = g.rooms.myTurn<Stars>(p);
    if (!t || typeof m.n !== 'number' || ![1, 2, 3].includes(m.n)) return;
    take(t.room, t.seat, m.n);
    g.rooms.pass(t.room);
  });
};
