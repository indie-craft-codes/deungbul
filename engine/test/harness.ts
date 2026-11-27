// 테스트가 함께 쓰는 것: 검사 기록, 기다리기(until, settle), 서버에 붙는 가짜 클라이언트.
// 시험은 벽시계로 몇 ms를 자고 결과를 보지 않는다(바쁜 컴퓨터에서는 늦어 가끔 실패한다): 조건을 기다리거나(until), 서버가 앞의 메시지를 처리했는지 확인한다(settle).
// 가짜 클라이언트(Peer)는 틀의 메시지만 읽는다. 게임의 메시지(개인 상태, 공유 상태)는 connect의 onMsg로 넘겨받아 게임의 시험이 읽는다 (이 게임은 games/deungbul/test/peer.ts).
import fs from 'node:fs';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';

export interface Peer {
  ws: WebSocket; id: number; you: [number, number, 0 | 1];
  seen: Map<number, { name: string; x: number; z: number }>;
  /** 마지막 스냅샷의 you 전체 ([x, z, 이동 중, 체력, 대상, …g.playerSync의 값]) */
  youRaw: number[];
  /** 시야 안 엔티티마다 마지막으로 받은 상태 줄 (EntState: 전투가 있는 게임은 [id, x, z, 방향, 이동, 체력, …값], 없으면 체력 칸이 없다) */
  lines: Map<number, number[]>;
  mons: Map<number, string>; hits: number; sparks: number; cds: number[];
  name: string; lv: number;
  sys: string[]; chat: string[];
  /** 받은 스냅샷의 수 (틱이 돈 것을 세는 데: settle) */
  snaps: number;
  /** 받은 pong의 번호 (settle) */
  pongs: Set<number>;
  send(m: ClientMsg): void;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0, passed = 0;
/** 지금까지 실패한 검사의 수 */
export const failures = (): number => failed;
/** 지금까지 통과한 검사의 수 */
export const passes = (): number => passed;
export function check(ok: boolean, what: string): void {
  console.log(`${ok ? '통과' : '실패'}  ${what}`);
  if (ok) passed++; else failed++;
}
/**
 * 항목마다(언어마다, 등급마다, 몬스터마다 …) 같은 검사를 되풀이할 때: 목록을 모두 돌고 검사 하나로 센다 (항목마다 하나씩 세지 않는다).
 * body 안의 c(ok, what)는 부른 차례로 짝을 짓는다: 모든 항목의 n번째 c가 검사 하나다.
 * 통과하면 메시지가 모두 같을 때 '[ko·en] 메시지'로, 다르면 항목마다 이어 적는다. 실패하면 틀린 항목과 그 항목의 메시지를 모두 적는다.
 */
export function checkEach<T>(list: readonly T[], label: (x: T) => string, body: (x: T, c: (ok: boolean, what: string) => void) => void): void {
  const rows: { ok: boolean; what: string; who: string }[][] = [];
  for (const x of list) {
    let i = 0;
    body(x, (ok, what) => { (rows[i++] ??= []).push({ ok, what, who: label(x) }); });
  }
  for (const r of rows) {
    const bad = r.filter((x) => !x.ok), same = r.every((x) => x.what === r[0].what);
    const shown = bad.length ? bad : same ? [{ ...r[0], who: r.map((x) => x.who).join('·') }] : r;
    check(bad.length === 0 && r.length === list.length, shown.map((x) => `[${x.who}] ${x.what}`).join(' / ') + (r.length < list.length ? ` (${list.length - r.length}개 항목은 이 검사에 이르지 못했다)` : ''));
  }
}
// npm test(test/all.ts)가 따로 된 프로세스로 돌릴 때: 끝날 때 검사의 수를 그 파일에 적어 모은 쪽이 합친다.
// 이 프로세스가 다시 띄우는 자식(fx/crash.ts 같은 것)이 같은 파일을 덮지 않게 환경 변수는 읽자마자 지운다
const reportTo = process.env.TEST_REPORT;
delete process.env.TEST_REPORT;
if (reportTo) process.on('exit', () => { try { fs.writeFileSync(reportTo, JSON.stringify({ pass: passed, fail: failed })); } catch { /* 모으는 쪽이 '결과 없음'으로 센다 */ } });
/**
 * cond가 참이 될 때까지 기다린다 (25ms마다 본다). 참이 되면 곧바로 끝나므로 기한은 넉넉하게: 기본 10초.
 * 기한은 '이보다 오래 걸리면 고장'의 뜻이지 기다리는 시간이 아니다. 컴퓨터가 바쁠 때(시험을 여럿 함께 돌릴 때)에도 넘지 않을 만큼 준다
 */
export async function until(cond: () => boolean, ms = 10_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(25); }
  return cond();
}

/**
 * 시험이 만든 임시 폴더를 지운다. Windows에서는 방금 닫은 DB 파일을 백신·색인기가 잠깐 붙들어 EBUSY가 날 수 있어 몇 번 다시 하고,
 * 그래도 못 지우면 알리기만 한다 (임시 폴더를 못 지운 것은 시험의 실패가 아니다)
 */
export function removeTemp(dir: string | URL): void {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  catch (err) { console.log(`  (임시 폴더를 지우지 못했다: ${String(dir)}: ${(err as Error).message}. 시험의 결과와는 무관하다)`); }
}

let pingNo = 1_000_000;
/**
 * 서버가 이 연결에서 앞서 보낸 메시지를 모두 처리했음을 확인한다: ping을 보내고 그 pong을 기다린다 (서버는 한 연결의 메시지를 차례로 처리한다).
 * '아무 일도 없어야 한다'를 볼 때 sleep 대신 쓴다: pong이 왔으면 앞의 명령에 대한 즉답(sys 등)도 이미 왔다.
 * snaps를 주면 그다음 스냅샷을 그만큼 더 받을 때까지 기다린다 (틱에서 일어나는 일: 이동, 위치. 스냅샷은 틱 몇 번마다 온다)
 */
export async function settle(p: Peer, snaps = 0, ms = 10_000): Promise<boolean> {
  const c = pingNo++;
  p.send({ t: 'ping', c });
  if (!(await until(() => p.pongs.has(c), ms))) return false;
  const at = p.snaps;
  return snaps <= 0 || until(() => p.snaps >= at + snaps, ms);
}

/** 서버에 붙는다. onMsg를 주면 Peer가 읽지 않는 종류의 메시지를 그리로 넘긴다 (welcome보다 먼저 오는 것은 없다) */
export function connect(port: number, name?: string, token?: string, onMsg?: (m: ServerMsg, p: Peer) => void): Promise<Peer> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const p: Peer = {
      ws, id: 0, you: [0, 0, 0], youRaw: [], lines: new Map(), seen: new Map(), mons: new Map(), hits: 0, sparks: -1, cds: [], sys: [], chat: [], snaps: 0, pongs: new Set(),
      name: '', lv: 0, send: (m) => ws.send(JSON.stringify(m)),
    };
    ws.on('error', fail);
    ws.on('open', () => p.send({ t: 'join', name, token }));
    ws.on('message', (data) => {
      const m = JSON.parse(data.toString()) as ServerMsg;
      if (m.t === 'welcome') { p.id = m.id; p.name = m.name; p.you = [m.x, m.z, 0]; done(p); }
      else if (m.t === 'name') { const s = p.seen.get(m.id); if (s) s.name = m.name; }
      else if (m.t === 'snap') {
        p.snaps++;
        p.you = [m.you[0], m.you[1], m.you[2]];
        p.youRaw = [...m.you];
        for (const e of m.enter ?? []) { p.seen.set(e.id, { name: e.name, x: e.x, z: e.z }); if (e.kind === 'm') p.mons.set(e.id, e.type); }
        for (const id of m.leave ?? []) { p.seen.delete(id); p.mons.delete(id); p.lines.delete(id); }
        for (const st of m.ents) { const [id, x, z] = st; p.lines.set(id, st); const s = p.seen.get(id); if (s) { s.x = x; s.z = z; } }
        for (const e of m.ev ?? []) if (e[0] === 'h' && e[1] === p.id) p.hits++;
      } else if (m.t === 'stat') { p.sparks = m.sparks ?? p.sparks; p.lv = m.lv ?? p.lv; }
      else if (m.t === 'cd') p.cds.push(m.n);
      else if (m.t === 'sys') p.sys.push([m.k, ...(m.a ?? [])].join(':'));
      else if (m.t === 'chat') p.chat.push(`${m.name}: ${m.text}`);
      else if (m.t === 'pong') p.pongs.add(m.c);
      else onMsg?.(m, p);
    });
  });
}
