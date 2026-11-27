// 별 겨루기: 둘이 두는 짧은 랭크 판 (판 모듈 rooms + 경쟁 묶음 8의 증명). 모닥불 옆 그루터기에 앉아 둔다.
// 규칙: 가운데 솔방울 무더기(11~15개: 판의 난수 room.rng, 리플레이의 시드로 다시 나온다)에서 내 차례에 1~3개를 줍는다. 마지막 솔방울을 줍는 쪽이 이긴다.
// 컴퓨터(큐가 채우는 봇)는 남은 수를 4의 배수로 만들 수 있으면 그만큼, 아니면 1~3 가운데 무작위로 줍는다.
// 켠 것: 랭크(rated: 대기실의 빠른 대국 → 큐, 레이팅·배치·등급), 큐의 봇(queueBots), 판 기록(전적), 리플레이(시드·입력·프레임), 이탈·잠수 제재(COMPETE.leave).
// 숨은 정보: 자리마다의 '비밀 솔방울'(1~3 가운데 하나: 그만큼 주우면 덤으로 하나 더 줍는다) — 앉은 사람은 자기 것만 보고, 리플레이는 끝난 뒤에 둘 다 보인다.
import type { Ent, Game, Room } from '@engine/server';

/** 판 상태: 남은 솔방울, 자리마다 주운 수, 마지막으로 주운 수(자리마다), 비밀 솔방울(숨은 정보) */
export interface Duel { pile: number; got: number[]; last: number[]; secret: number[] }
/** 앉은 사람에게 가는 개인 상태 duel: 무더기, 주운 수, 마지막 수, 내 비밀 솔방울 */
export interface DuelView { pile: number; got: number[]; last: number[]; secret: number }
/** 리플레이의 프레임 (끝난 뒤에만 보인다: 비밀 솔방울도 다 싣는다) */
export interface DuelFrame { pile: number; got: number[]; last: number[]; secret: number[]; turn: number }
export const DUEL = { min: 11, max: 15, turnS: 20, graceS: 30, botAfterS: 25, cpuMs: 900 };
/** 그루터기 두 자리 (모닥불 북쪽) */
const SEATS = [{ x: -3, z: -9, face: Math.PI / 2 }, { x: 3, z: -9, face: -Math.PI / 2 }];

export function installDuel(g: Game): void {
  const take = (room: Room<Duel>, seat: number, n: number) => {
    const d = room.data, bonus = d.secret[seat] === n ? 1 : 0, k = Math.min(n + bonus, d.pile);
    d.pile -= k; d.got[seat] += k; d.last[seat] = k;
    g.rooms.touch(room);
    if (d.pile <= 0) g.rooms.finish(room, seat, 'last', d.got); else g.rooms.pass(room);
  };
  g.rooms.define<Duel>({
    id: 'duel', seats: 2, turnS: DUEL.turnS, graceS: DUEL.graceS, cpuStepMs: DUEL.cpuMs, pass: false,
    rated: true, queueBots: DUEL.botAfterS, record: true,
    replay: { cmds: ['duel'], view: (room): DuelFrame => ({ pile: room.data.pile, got: [...room.data.got], last: [...room.data.last], secret: [...room.data.secret], turn: room.turn }) },
    seatAt: (_r, i) => SEATS[i] ?? SEATS[0],
    start: (room) => {
      const n = room.seats.length;
      room.data = { pile: DUEL.min + Math.floor(room.rng() * (DUEL.max - DUEL.min + 1)), got: Array(n).fill(0), last: Array(n).fill(0), secret: Array.from({ length: n }, () => 1 + Math.floor(room.rng() * 3)) };
    },
    // 시간이 다 되면 하나를 대신 줍는다
    timeout: (room, seat) => take(room, seat, 1),
    cpu: (room, seat) => { const m = room.data.pile % 4; take(room, seat, m || 1 + Math.floor(room.rng() * 3)); },
  });
  g.commands.set('duel', (p, m) => {
    const t = g.rooms.myTurn<Duel>(p);
    if (t && typeof m.n === 'number' && [1, 2, 3].includes(m.n)) take(t.room, t.seat, m.n);
  });
  g.personal.push({
    name: 'duel',
    state: (p: Ent): DuelView | null => {
      const r = g.rooms.of<Duel>(p), i = r ? g.rooms.seatOf(r, p) : -1;
      return r && r.def === 'duel' && i >= 0 && r.data ? { pile: r.data.pile, got: [...r.data.got], last: [...r.data.last], secret: r.data.secret[i] ?? 0 } : null;
    },
  });
}
