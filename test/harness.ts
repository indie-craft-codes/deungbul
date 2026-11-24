// 테스트가 함께 쓰는 것: 검사 기록, 기다리기, 서버에 붙는 가짜 클라이언트.
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';

export interface Peer {
  ws: WebSocket; id: number; you: [number, number, 0 | 1];
  seen: Map<number, { name: string; x: number; z: number }>;
  mons: Map<number, string>; hits: number; sparks: number; cds: number[];
  name: string; lv: number; contrib: number; glow: number; residents: number[];
  raid: { phase: string; foes: number; towerHp: number; towerMaxHp: number };
  quest: [number, number, number];
  sys: string[]; chat: string[];
  send(m: ClientMsg): void;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
/** 지금까지 실패한 검사의 수 */
export const failures = (): number => failed;
export function check(ok: boolean, what: string): void {
  console.log(`${ok ? '통과' : '실패'}  ${what}`);
  if (!ok) failed++;
}
export async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(25); }
  return cond();
}

export function connect(port: number, name?: string, token?: string): Promise<Peer> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const p: Peer = {
      ws, id: 0, you: [0, 0, 0], seen: new Map(), mons: new Map(), hits: 0, sparks: -1, cds: [], sys: [], chat: [],
      name: '', lv: 0, contrib: 0, glow: -1, residents: [], raid: { phase: '', foes: 0, towerHp: 0, towerMaxHp: 0 }, quest: [-1, -1, -1], send: (m) => ws.send(JSON.stringify(m)),
    };
    ws.on('error', fail);
    ws.on('open', () => p.send({ t: 'join', name, token }));
    ws.on('message', (data) => {
      const m = JSON.parse(data.toString()) as ServerMsg;
      if (m.t === 'welcome') { p.id = m.id; p.name = m.name; p.you = [m.x, m.z, 0]; done(p); }
      // 이 게임의 개인 상태(shared/deungbul.ts의 MeState)를 전과 같은 이름으로 내준다: 퀘스트 진행과 기여
      else if (m.t === 'me') { if (m.k === 'quest') { const q = m.s as { c: number; s: number; n: number }; p.quest = [q.c, q.s, q.n]; } else if (m.k === 'contrib') p.contrib = m.s as number; }
      else if (m.t === 'world' && m.s.tower) { p.glow = m.s.tower.glow; p.residents = m.s.tower.residents; p.raid = m.s.raid; }
      else if (m.t === 'name') { const s = p.seen.get(m.id); if (s) s.name = m.name; }
      else if (m.t === 'snap') {
        p.you = [m.you[0], m.you[1], m.you[2]];
        for (const e of m.enter ?? []) { p.seen.set(e.id, { name: e.name, x: e.x, z: e.z }); if (e.kind === 'm') p.mons.set(e.id, e.type); }
        for (const id of m.leave ?? []) { p.seen.delete(id); p.mons.delete(id); }
        for (const [id, x, z] of m.ents) { const s = p.seen.get(id); if (s) { s.x = x; s.z = z; } }
        for (const e of m.ev ?? []) if (e[0] === 'h' && e[1] === p.id) p.hits++;
      } else if (m.t === 'stat') { p.sparks = m.sparks; p.lv = m.lv; }
      else if (m.t === 'cd') p.cds.push(m.n);
      else if (m.t === 'sys') p.sys.push([m.k, ...(m.a ?? [])].join(':'));
      else if (m.t === 'chat') p.chat.push(`${m.name}: ${m.text}`);
    });
  });
}
