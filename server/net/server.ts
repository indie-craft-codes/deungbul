// 통신 계층: 접속과 세션(이름, 저장 키, 대화, 속도 제한)을 맡고, 게임 명령은 Game에 넘긴다.
// 위치와 전투 결과는 서버만 정하고, 클라이언트는 "무엇을 하고 싶다"만 보낸다.
import { createHash } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { ServerMsg } from '../../shared/protocol';
import { CHAT_MAX, NAME_MAX, SNAP_EVERY, TICK_MS } from '../../shared/world';
import type { Ent } from '../game/entity';
import { Game, type GameOptions } from '../game/game';
import { MemoryStore, type Store } from '../store';
import { REPORT_GAP_MS, REPORT_LINES, isClean, mask } from './moderation';
import { buildFrame, snapshotFor } from './snapshot';
import { serveStatic } from './static';

const MAX_CLIENTS = 300; // 기본 상한. 근거는 docs/infra.md의 측정 결과
const MSG_BURST = 40; // 클라이언트 하나가 한꺼번에 보낼 수 있는 메시지 수
const MSG_PER_TICK = 2; // 틱마다 회복되는 양 (초당 40개)
const CHAT_GAP_MS = 700;
const RENAME_GAP_MS = 5000;
const SAVE_EVERY_MS = 60000;

interface Client {
  ws: WebSocket; ent: Ent | null; known: Set<number>;
  tokens: number; lastChat: number; lastRename: number; alive: boolean;
  /** 저장 키(접속 토큰의 해시). 토큰 없이 들어온 손님은 null이고 저장하지 않는다 */
  key: string | null;
  /** 최근에 한 말 (가리기 전의 원문). 신고가 들어오면 함께 적는다 */
  said: string[];
  /** 내가 신고한 상대(엔티티 id)와 그 시각 */
  reported: Map<number, number>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 제어 문자를 지우고 길이를 자른다. */
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** 측정 구간 동안의 서버 지표. 읽으면 구간이 새로 시작된다 */
export interface Metrics {
  /** 구간 길이(초) */
  seconds: number;
  clients: number;
  entities: number;
  /** 한 틱의 게임 계산 시간(ms): 평균, 95%, 최대 */
  tickAvg: number; tickP95: number; tickMax: number;
  /** 한 번 내보내는 데 걸린 시간(ms): 평균, 95%, 최대 */
  flushAvg: number; flushP95: number; flushMax: number;
  /** 보낸 양: 초당 바이트(글자 수 기준 근사)와 초당 메시지 수 */
  bytesPerS: number; msgsPerS: number;
  /** 틱 간격이 목표(50ms)보다 얼마나 늦었는가(ms): 평균, 최대. 서버가 밀리면 커진다 */
  lagAvg: number; lagMax: number;
}
export interface Running { port: number; game: Game; metrics(): Metrics; close(): Promise<void> }
export interface Options { bots?: number; store?: Store; game?: GameOptions; maxClients?: number }

export function startServer(port: number, opts: Options = {}): Promise<Running> {
  const store = opts.store ?? new MemoryStore();
  const game = new Game(opts.game);
  const saved = store.loadWorld();
  if (saved) game.importWorld(saved);
  for (let i = 0; i < (opts.bots ?? 0); i++) game.players.spawn('Bot' + (i + 1), true);

  const clients = new Set<Client>();
  const byEnt = new Map<number, Client>();
  const byKey = new Map<string, Client>();
  /** 자동 사냥을 켠 채 접속이 끊겨, 주인 없이 사냥 중인 캐릭터 (저장 키별) */
  const away = new Map<string, Ent>();
  let tick = 0;
  const maxClients = opts.maxClients ?? MAX_CLIENTS;
  // 측정: 구간 동안의 시간과 전송량을 모은다
  const m = { since: performance.now(), tick: [] as number[], flush: [] as number[], lag: [] as number[], bytes: 0, msgs: 0 };

  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
  const httpServer = http.createServer(serveStatic(dist));
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 1024 });

  function send(c: Client, msg: ServerMsg): void {
    if (c.ws.readyState !== c.ws.OPEN) return;
    const s = JSON.stringify(msg);
    m.bytes += s.length; m.msgs++;
    c.ws.send(s);
  }
  function broadcast(msg: ServerMsg): void {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.ent && c.ws.readyState === c.ws.OPEN) { m.bytes += s.length; m.msgs++; c.ws.send(s); }
  }
  const sys = (k: MsgKey, ...a: MsgArg[]): ServerMsg => ({ t: 'sys', k, a });

  function saveEnt(key: string, e: Ent): void {
    try { store.savePlayer(key, game.players.export(e)); e.unsaved = false; }
    catch (err) { console.error('[server] 캐릭터 저장 실패:', err); }
  }
  function savePlayer(c: Client): void { if (c.key && c.ent) saveEnt(c.key, c.ent); }
  function saveWorld(): void {
    try { store.saveWorld(game.exportWorld()); }
    catch (err) { console.error('[server] 월드 저장 실패:', err); }
  }

  function join(c: Client, m: Record<string, unknown>): void {
    // 토큰이 있으면 저장된 캐릭터를 이어받는다
    const token = typeof m.token === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(m.token) ? m.token : null;
    c.key = token && createHash('sha256').update(token).digest('hex');
    if (c.key) {
      const old = byKey.get(c.key);
      if (old) { send(old, sys('replaced')); old.ws.close(4000, 'replaced'); dropClient(old); }
      byKey.set(c.key, c);
    }
    // 자리를 비운 동안 사냥하던 캐릭터가 있으면 새로 만들지 않고 그대로 이어받는다
    const kept = c.key ? away.get(c.key) : undefined;
    if (c.key && kept) {
      away.delete(c.key);
      if (game.ents.has(kept.id)) {
        c.ent = kept;
        byEnt.set(kept.id, c);
        kept.dirty = true; kept.questDirty = true; kept.metaDirty = true;
        game.away.stop(kept);
        send(c, { t: 'welcome', id: kept.id, name: kept.name, x: r2(kept.x), z: r2(kept.z), auto: true });
        send(c, { t: 'world', s: game.state() });
        game.party.resend(kept.id);
        return;
      }
    }
    const save = c.key ? store.loadPlayer(c.key) : null;
    // 이름: 저장된 이름이 먼저다. 없으면 클라이언트가 제안한 이름, 그것도 없으면 중립적인 이름
    const ok = (s: string) => (isClean(s) ? s : ''); // 금칙어가 든 이름은 쓰지 않는다
    const name = ok(clean(save?.name, NAME_MAX)) || ok(clean(m.name, NAME_MAX)) || 'Keeper' + (1000 + Math.floor(Math.random() * 9000));
    c.ent = game.players.spawn(name, false, save);
    byEnt.set(c.ent.id, c);
    send(c, { t: 'welcome', id: c.ent.id, name, x: r2(c.ent.x), z: r2(c.ent.z), auto: c.ent.auto || undefined });
    send(c, { t: 'world', s: game.state() });
    broadcast(sys('joined', name));
    savePlayer(c);
  }

  function rename(c: Client, e: Ent, raw: unknown): void {
    const name = clean(raw, NAME_MAX);
    const now = Date.now();
    if (!name || name === e.name) return;
    if (!isClean(name)) { send(c, sys('nameBad')); return; }
    if (now - c.lastRename < RENAME_GAP_MS) { send(c, sys('renameWait')); return; }
    c.lastRename = now;
    const before = e.name;
    game.players.rename(e, name);
    broadcast({ t: 'name', id: e.id, name });
    broadcast(sys('renamed', before, name));
    savePlayer(c);
  }

  function chat(c: Client, e: Ent, raw: unknown): void {
    const text = clean(raw, CHAT_MAX);
    const now = Date.now();
    if (!text || now - c.lastChat < CHAT_GAP_MS) return;
    c.lastChat = now;
    c.said.push(text);
    if (c.said.length > REPORT_LINES) c.said.shift();
    broadcast({ t: 'chat', id: e.id, name: e.name, text: mask(text) });
  }

  /** 신고: 기록만 한다. 제재는 사람이 기록을 보고 정한다. */
  function report(c: Client, e: Ent, id: unknown): void {
    if (!num(id)) return;
    const target = byEnt.get(id);
    if (!target?.ent || target === c) return;
    const now = Date.now();
    if (now - (c.reported.get(id) ?? -Infinity) < REPORT_GAP_MS) { send(c, sys('reportWait')); return; }
    c.reported.set(id, now);
    try { store.saveReport({ at: now, by: e.name, byKey: c.key, target: target.ent.name, targetKey: target.key, lines: [...target.said] }); }
    catch (err) { console.error('[server] 신고 저장 실패:', err); }
    console.log(`[server] 신고: ${e.name} → ${target.ent.name}`);
    send(c, sys('reported', target.ent.name));
  }

  function handle(c: Client, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const m = raw as Record<string, unknown>;
    if (m.t === 'join') { if (!c.ent) join(c, m); return; }
    if (m.t === 'ping') { if (num(m.c)) send(c, { t: 'pong', c: m.c }); return; }
    const e = c.ent;
    if (!e) return; // 접속 절차 전에는 나머지 메시지를 받지 않는다
    if (m.t === 'rename') rename(c, e, m.name);
    else if (m.t === 'chat') chat(c, e, m.text);
    else if (m.t === 'report') report(c, e, m.id);
    else game.command(e, m); // 나머지는 게임 명령
  }

  /** 연결을 정리한다. 두 번 불려도 안전하다. */
  function dropClient(c: Client): void {
    if (!clients.delete(c)) return;
    if (c.key && byKey.get(c.key) === c) byKey.delete(c.key);
    if (c.ent) {
      game.fire('playerDropped', c.ent); // 던전 안이었으면 문 앞으로 나온 뒤에 저장한다
      savePlayer(c);
      byEnt.delete(c.ent.id);
      // 자동 사냥 중이었으면 캐릭터를 남겨 두고 서버가 이어서 사냥한다
      if (c.key && c.ent.auto && !stopped) { away.set(c.key, c.ent); game.away.start(c.ent); return; }
      game.players.leave(c.ent.id);
      broadcast(sys('left', c.ent.name));
    }
  }

  wss.on('connection', (ws) => {
    if (clients.size >= maxClients) { ws.send(JSON.stringify({ t: 'full' } satisfies ServerMsg)); ws.close(1013, 'full'); return; }
    const c: Client = { ws, ent: null, known: new Set(), tokens: MSG_BURST, lastChat: 0, lastRename: 0, alive: true, key: null, said: [], reported: new Map() };
    clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      if (--c.tokens < 0) { ws.close(1008, 'rate limit'); return; }
      let raw: unknown;
      try { raw = JSON.parse(data.toString()); } catch { return; }
      handle(c, raw);
    });
    ws.on('close', () => dropClient(c));
    ws.on('error', () => ws.terminate());
  });

  /** 게임이 쌓아 둔 것을 클라이언트에 내보낸다. */
  function flush(): void {
    const frame = buildFrame(game.ents.values());
    const events = game.events;
    game.events = [];
    let online = 0;
    for (const c of clients) if (c.ent) online++;

    for (const c of clients) {
      const me = c.ent;
      if (!me) continue;
      const { json, seen } = snapshotFor(me, c.known, frame, events, online);
      c.known = seen;
      if (c.ws.readyState === c.ws.OPEN) { m.bytes += json.length; m.msgs++; c.ws.send(json); }
      if (me.dirty) {
        me.dirty = false;
        send(c, { t: 'stat', maxHp: me.maxHp, lv: me.lv, exp: me.exp, need: me.need, sparks: me.sparks, contrib: me.contrib, gold: me.gold, weapon: me.weapon, armor: me.armor, cls: me.cls, items: me.items, rested: me.rested, tier: me.tier });
      }
      if (me.metaDirty) {
        me.metaDirty = false;
        send(c, { t: 'meta', gear: me.gear, worn: me.worn, mail: me.mail, daily: { prog: me.daily.prog, got: me.daily.got, streak: me.daily.streak }, power: game.rank.power(me) });
      }
      if (me.questDirty) {
        me.questDirty = false;
        send(c, { t: 'quest', c: me.qc, s: me.qs, n: me.qn });
      }
    }
    for (const n of game.notices) { const c = byEnt.get(n.id); if (c) send(c, { t: 'sys', k: n.k, a: n.a }); }
    for (const a of game.cdAcks) { const c = byEnt.get(a.id); if (c) send(c, { t: 'cd', n: a.n, ms: a.ms }); }
    for (const a of game.itemCds) { const c = byEnt.get(a.id); if (c) send(c, { t: 'icd', ms: a.ms }); }
    for (const o of game.partyOut) { const c = byEnt.get(o.id); if (c) send(c, o.msg); }
    for (const o of game.out) { const c = byEnt.get(o.id); if (c) send(c, o.msg); }
    for (const a of game.gears) broadcast({ t: 'gear', id: a.id, weapon: a.weapon, armor: a.armor, cls: a.cls });
    for (const a of game.announces) broadcast({ t: 'sys', k: a.k, a: a.a });
    game.notices = []; game.cdAcks = []; game.announces = []; game.itemCds = []; game.gears = []; game.partyOut = []; game.out = [];
    if (game.stateDirty) { game.stateDirty = false; broadcast({ t: 'world', s: game.state() }); }
    if (game.saveDirty) { game.saveDirty = false; saveWorld(); }
    // 자리 비움 사냥이 끝난 캐릭터(시간이 다 됨)는 저장하고 내보낸다
    for (const [key, e] of away) {
      if (e.auto) continue;
      saveEnt(key, e); away.delete(key);
      game.players.leave(e.id);
      broadcast(sys('left', e.name));
    }
  }

  // 틱 루프. 운영체제 타이머는 정확하지 않아서(Windows는 약 15ms 단위) 그냥 50ms마다 부르면 실제로는 더 느리게 돈다.
  // 그래서 '다음 틱이 돌아야 할 시각'을 따로 세고, 늦은 만큼 다음 대기를 줄여서 평균 간격을 맞춘다.
  let last = performance.now();
  let nextAt = last + TICK_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const step = () => {
    if (stopped) return;
    const now = performance.now();
    m.lag.push(Math.max(0, now - nextAt));
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    tick++;
    game.tick(dt);
    const afterTick = performance.now();
    m.tick.push(afterTick - now);
    for (const c of clients) c.tokens = Math.min(MSG_BURST, c.tokens + MSG_PER_TICK);
    if (tick % SNAP_EVERY === 0) { flush(); m.flush.push(performance.now() - afterTick); }
    nextAt += TICK_MS;
    const end = performance.now();
    if (nextAt < end - 250) nextAt = end; // 크게 밀렸으면 따라잡으려 하지 않고 여기서 다시 센다
    timer = setTimeout(step, Math.max(0, nextAt - end));
  };
  timer = setTimeout(step, TICK_MS);

  function metrics(): Metrics {
    const now = performance.now(), seconds = (now - m.since) / 1000 || 1;
    const stat = (a: number[]) => {
      if (!a.length) return [0, 0, 0];
      const s = [...a].sort((x, y) => x - y);
      return [a.reduce((v, x) => v + x, 0) / a.length, s[Math.floor(s.length * 0.95)], s[s.length - 1]];
    };
    const [tickAvg, tickP95, tickMax] = stat(m.tick), [flushAvg, flushP95, flushMax] = stat(m.flush), [lagAvg, , lagMax] = stat(m.lag);
    let online = 0;
    for (const c of clients) if (c.ent) online++;
    const out: Metrics = {
      seconds, clients: online, entities: game.ents.size, tickAvg, tickP95, tickMax, flushAvg, flushP95, flushMax,
      bytesPerS: m.bytes / seconds, msgsPerS: m.msgs / seconds, lagAvg, lagMax,
    };
    m.since = now; m.tick = []; m.flush = []; m.lag = []; m.bytes = 0; m.msgs = 0;
    return out;
  }

  // 주기 저장: 바뀐 캐릭터만 적는다
  const autosave = setInterval(() => {
    for (const c of clients) if (c.ent?.unsaved) savePlayer(c);
    for (const [key, e] of away) if (e.unsaved) saveEnt(key, e);
  }, SAVE_EVERY_MS);

  // 응답 없는 연결 정리
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 15000);

  return new Promise((done, fail) => {
    httpServer.once('error', fail);
    httpServer.listen(port, () => {
      const addr = httpServer.address();
      done({
        port: typeof addr === 'object' && addr ? addr.port : port,
        game,
        metrics,
        close: () => new Promise<void>((ok) => {
          stopped = true; clearTimeout(timer); clearInterval(heartbeat); clearInterval(autosave);
          // 끄기 전에 전원과 월드를 저장한다
          for (const c of clients) savePlayer(c);
          for (const [key, e] of away) saveEnt(key, e);
          saveWorld();
          for (const c of clients) c.ws.terminate();
          wss.close(() => httpServer.close(() => ok()));
        }),
      });
    });
  });
}
