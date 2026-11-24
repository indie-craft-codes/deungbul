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
import { REPORT_GAP_MS, REPORT_LINES, isClean, mask, tidy } from './moderation';
import { buildFrame, snapshotFor } from './snapshot';
import { serveStatic } from './static';

const MAX_CLIENTS = 300; // 기본 상한. 근거는 docs/infra.md의 측정 결과
const MSG_BURST = 40; // 클라이언트 하나가 한꺼번에 보낼 수 있는 메시지 수
const MSG_PER_TICK = 2; // 틱마다 회복되는 양 (초당 40개)
const CHAT_GAP_MS = 700;
const RENAME_GAP_MS = 5000;
const SAVE_EVERY_MS = 60000;
const JOIN_WITHIN_MS = 10000; // 연결하고 이 안에 접속 절차를 밟지 않으면 끊는다 (빈 연결로 자리를 채우지 못하게)
const MAX_PER_IP = 12; // 한 주소에서 동시에 열 수 있는 연결 (같은 집의 여러 사람은 되고, 수백 개는 안 된다)
const MAX_AWAY = 60; // 주인 없이 사냥 중인 캐릭터의 상한
// 대화량의 상한. 사람마다의 간격(CHAT_GAP_MS)만으로는 연결을 여러 개 열어 초당 수십 줄을 뿌릴 수 있었다.
// 한 주소: 한꺼번에 6줄까지, 그 뒤로는 초당 3줄 (같은 집의 서너 사람이 함께 떠들 만큼은 된다)
const CHAT_IP_BURST = 6;
const CHAT_IP_PER_S = 3;
// 서버 전체: 한꺼번에 40줄까지, 그 뒤로는 초당 20줄 (주소를 여럿 쓰더라도 모두의 화면과 회선에 가는 양에는 끝이 있게)
const CHAT_ALL_BURST = 40;
const CHAT_ALL_PER_S = 20;
/** 사람별 제한 기록을 마지막으로 쓴 뒤 이만큼 지나고 접속해 있지도 않으면 지운다 (가장 긴 간격인 신고 간격과 같다) */
const LIMIT_KEEP_MS = REPORT_GAP_MS;
const AWAY_MIN_LV = 3; // 이 레벨부터 자리 비움 사냥이 된다 (막 만든 캐릭터를 수천 개 남겨 두지 못하게)

interface Client {
  ws: WebSocket; ent: Ent | null; known: Set<number>;
  tokens: number; alive: boolean;
  /** 마지막으로 이름을 바꾼 시각. 연결이 아니라 사람의 기록(Person)을 읽고 쓴다 */
  lastRename: number;
  /** 저장 키(접속 토큰의 해시). 토큰 없이 들어온 손님은 null이고 저장하지 않는다 */
  key: string | null;
  /** 접속한 주소 (주소별 연결 수를 세는 데 쓴다) */
  ip: string;
  /** 저장된 캐릭터가 있었는가. 없던 사람은 직업을 고르기 전에는 저장하지 않는다 */
  hadSave: boolean;
}

/**
 * 사람마다의 제한 기록. 연결(Client)에 두면 연결을 여러 개 열거나 다시 접속해서 비켜 갈 수 있으므로,
 * 저장 키(없으면 접속 주소)로 묶어 서버가 켜져 있는 동안 남긴다.
 */
interface Person {
  lastChat: number; lastRename: number;
  /** 최근에 한 말 (가리기 전의 원문). 신고가 들어오면 함께 적는다 */
  said: string[];
  /** 내가 신고한 상대(그 사람의 기록 열쇠)와 그 시각 */
  reported: Map<string, number>;
  /** 이 기록을 마지막으로 쓴 시각 (정리할 때 본다) */
  used: number;
}
/** 대화량을 재는 통: 남은 양과 마지막으로 채운 시각 */
interface Bucket { left: number; at: number }

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
export interface Options { bots?: number; store?: Store; game?: GameOptions; maxClients?: number; maxPerIp?: number; maxAway?: number }

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
  const maxPerIp = opts.maxPerIp ?? MAX_PER_IP, maxAway = opts.maxAway ?? MAX_AWAY;
  const perIp = new Map<string, number>();
  const people = new Map<string, Person>();
  /** 그 연결의 사람을 가리키는 열쇠: 저장 키가 있으면 그것, 손님은 접속 주소 (손님은 같은 주소의 손님끼리 한 사람으로 묶인다) */
  const who = (c: Client): string => (c.key ? 'k:' + c.key : 'i:' + c.ip);
  function person(c: Client): Person {
    const k = who(c);
    let p = people.get(k);
    if (!p) people.set(k, p = { lastChat: 0, lastRename: 0, said: [], reported: new Map(), used: 0 });
    p.used = Date.now();
    return p;
  }
  const chatIp = new Map<string, Bucket>(), chatAll: Bucket = { left: CHAT_ALL_BURST, at: Date.now() };
  /** 통에서 한 줄 몫을 꺼낸다. 비어 있으면 false */
  function take(b: Bucket, now: number, burst: number, perS: number): boolean {
    b.left = Math.min(burst, b.left + ((now - b.at) / 1000) * perS);
    b.at = now;
    if (b.left < 1) return false;
    b.left--;
    return true;
  }
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
  // 막 들어와 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (토큰만 바꿔 접속해 저장 파일을 불리지 못하게)
  function savePlayer(c: Client): void {
    const e = c.ent;
    if (!c.key || !e) return;
    const touched = e.cls !== '' || e.lv > 1 || e.exp > 0 || e.gold > 0 || e.sparks > 0 || e.qc > 0 || e.qs > 0 || e.qn > 0;
    if (c.hadSave || touched) { saveEnt(c.key, e); c.hadSave = true; }
  }
  function saveWorld(): boolean {
    try { store.saveWorld(game.exportWorld()); return true; }
    catch (err) { console.error('[server] 월드 저장 실패:', err); return false; }
  }
  /**
   * 월드에 저장할 것이 있으면 월드와 바뀐 캐릭터를 함께 저장한다.
   * 거래소의 물건·판 돈 우편·길드 기부처럼 캐릭터와 월드에 나뉘어 적히는 것은, 한쪽만 저장된 채 서버가 죽으면 복사되거나 사라진다.
   * 그래서 캐릭터를 저장하는 곳(접속, 접속 끊김)에서도 이것을 불러 둘의 저장 시점을 맞춘다. 월드 저장이 실패하면 다음에 다시 시도한다.
   */
  function saveTogether(): void {
    if (!game.saveDirty) return;
    if (!saveWorld()) return; // saveDirty를 그대로 두어 다음 틱에 다시 시도한다. 캐릭터도 그때 함께 저장한다
    game.saveDirty = false;
    for (const c of clients) if (c.ent?.unsaved) savePlayer(c);
    for (const [key, e] of away) if (e.unsaved) saveEnt(key, e);
  }

  function join(c: Client, m: Record<string, unknown>): void {
    // 토큰이 있으면 저장된 캐릭터를 이어받는다
    const token = typeof m.token === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(m.token) ? m.token : null;
    c.key = token && createHash('sha256').update(token).digest('hex');
    if (c.key) {
      const old = byKey.get(c.key);
      // 밀려난 연결은 캐릭터와의 끈을 끊는다: 닫히기 전에 보낸 명령이 옛 캐릭터를 움직이거나 저장을 덮어쓰지 못하게
      if (old) { send(old, sys('replaced')); old.ws.close(4000, 'replaced'); dropClient(old); old.ent = null; }
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
        game.channels.tell(kept); // 있던 채널 그대로다: 화면에 다시 알린다
        return;
      }
    }
    const save = c.key ? store.loadPlayer(c.key) : null;
    c.hadSave = !!save;
    // 이름: 저장된 이름이 먼저다. 없으면 클라이언트가 제안한 이름, 그것도 없으면 중립적인 이름
    const ok = (s: string) => (isClean(s) ? s : ''); // 금칙어가 든 이름은 쓰지 않는다
    let name = ok(tidyName(save?.name)) || ok(tidyName(m.name)) || 'Keeper' + (1000 + Math.floor(Math.random() * 9000));
    // 지금 접속해 있는 사람과 같은 이름이면 숫자를 붙여 구별한다 (사칭 방지)
    if (taken(name)) name = (name.slice(0, NAME_MAX - 3) + (100 + Math.floor(Math.random() * 900))).slice(0, NAME_MAX);
    c.ent = game.players.spawn(name, false, save, c.key ?? '');
    byEnt.set(c.ent.id, c);
    send(c, { t: 'welcome', id: c.ent.id, name, x: r2(c.ent.x), z: r2(c.ent.z), auto: c.ent.auto || undefined });
    send(c, { t: 'world', s: game.state() });
    broadcast(sys('joined', name));
    saveTogether(); // 접속하며 받은 것(맡아 둔 우편)이 월드에서 빠진 것과 함께 저장되게
    savePlayer(c);
  }

  /** 이름을 다듬는다: 제어 문자와 눈에 보이지 않는 글자를 지우고 길이를 자른다 */
  const tidyName = (raw: unknown): string => tidy(clean(raw, 200)).slice(0, NAME_MAX).trim();
  /** 그 이름을 지금 월드에 있는 다른 사람이 쓰고 있는가 (대소문자 무시) */
  const taken = (name: string, me?: Ent): boolean => { const k = name.toLowerCase(); for (const e of game.ents.values()) if (e.kind === 'p' && e !== me && e.name.toLowerCase() === k) return true; return false; };

  function rename(c: Client, e: Ent, raw: unknown): void {
    const name = tidyName(raw);
    const now = Date.now();
    if (!name || name === e.name) return;
    if (!isClean(name)) { send(c, sys('nameBad')); return; }
    if (taken(name, e)) { send(c, sys('nameTaken')); return; }
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
    const now = Date.now(), me = person(c);
    if (!text || now - me.lastChat < CHAT_GAP_MS) return;
    me.lastChat = now;
    // 한 주소가 보내는 양과 서버 전체의 양에도 끝이 있다. 넘친 말은 전하지 않고, 말한 사람에게만 알린다
    let ip = chatIp.get(c.ip);
    if (!ip) chatIp.set(c.ip, ip = { left: CHAT_IP_BURST, at: now });
    if (!take(ip, now, CHAT_IP_BURST, CHAT_IP_PER_S) || !take(chatAll, now, CHAT_ALL_BURST, CHAT_ALL_PER_S)) { send(c, sys('chatWait')); return; }
    me.said.push(text);
    if (me.said.length > REPORT_LINES) me.said.shift();
    broadcast({ t: 'chat', id: e.id, name: e.name, text: mask(text) });
  }

  /** 신고: 기록만 한다. 제재는 사람이 기록을 보고 정한다. */
  function report(c: Client, e: Ent, id: unknown): void {
    if (!num(id)) return;
    const target = byEnt.get(id);
    if (!target?.ent || target === c) return;
    // 신고한 사람도 당한 사람도 연결이 아니라 사람으로 본다: 어느 쪽이 다시 접속해도 간격이 이어지고, 당한 사람이 한 말도 남아 있다
    const now = Date.now(), me = person(c), tk = who(target);
    if (now - (me.reported.get(tk) ?? -Infinity) < REPORT_GAP_MS) { send(c, sys('reportWait')); return; }
    me.reported.set(tk, now);
    try { store.saveReport({ at: now, by: e.name, byKey: c.key, target: target.ent.name, targetKey: target.key, lines: [...(people.get(tk)?.said ?? [])] }); }
    catch (err) { console.error('[server] 신고 저장 실패:', err); }
    console.log(`[server] 신고: ${e.name} → ${target.ent.name}`);
    send(c, sys('reported', target.ent.name));
  }

  function handle(c: Client, raw: unknown): void {
    if (!clients.has(c)) return; // 이미 정리된 연결(밀려났거나 끊긴 것)이 보낸 것은 버린다
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
      saveTogether(); // 방금 한 거래가 월드에만(또는 캐릭터에만) 저장된 채로 남지 않게
      savePlayer(c);
      byEnt.delete(c.ent.id);
      // 자동 사냥 중이었으면 캐릭터를 남겨 두고 서버가 이어서 사냥한다.
      // 직업을 고르고 조금이라도 키운 캐릭터만, 정해진 수까지만 남긴다 (접속했다 끊기를 되풀이해 월드를 채우지 못하게)
      if (c.key && c.ent.auto && !stopped && c.ent.cls !== '' && c.ent.lv >= AWAY_MIN_LV && away.size < maxAway) { away.set(c.key, c.ent); game.away.start(c.ent); return; }
      game.players.leave(c.ent.id);
      broadcast(sys('left', c.ent.name));
    }
  }

  wss.on('connection', (ws, req) => {
    // 터널(같은 PC의 프록시)을 거쳐 온 연결은 실제 주소가 머리말에 들어 있다. 바깥에서 직접 온 연결의 머리말은 믿지 않는다
    const direct = req.socket.remoteAddress ?? '', local = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
    const fwd = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
    const ip = (local && typeof fwd === 'string' && fwd ? fwd.split(',')[0].trim() : direct) || '?';
    const full = () => { ws.send(JSON.stringify({ t: 'full' } satisfies ServerMsg)); ws.close(1013, 'full'); };
    // 주인 없이 사냥 중인 캐릭터도 자리를 차지한다
    if (clients.size + away.size >= maxClients) { full(); return; }
    if ((perIp.get(ip) ?? 0) >= maxPerIp) { full(); return; }
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const c: Client = {
      ws, ent: null, known: new Set(), tokens: MSG_BURST, alive: true, key: null, ip, hadSave: false,
      // 이름 바꾸기 간격도 사람의 기록에 둔다 (다시 접속해서 간격을 지우지 못하게)
      get lastRename() { return people.get(who(c))?.lastRename ?? 0; },
      set lastRename(at: number) { person(c).lastRename = at; },
    };
    clients.add(c);
    // 접속 절차를 밟지 않는 연결은 오래 두지 않는다
    const joinTimer = setTimeout(() => { if (!c.ent && clients.has(c)) ws.close(1008, 'no join'); }, JOIN_WITHIN_MS);
    ws.on('close', () => { clearTimeout(joinTimer); const n = (perIp.get(ip) ?? 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); });
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data, isBinary) => {
      // 이진 프레임도 보낸 만큼 센다 (세지 않으면 속도 제한을 비켜 간다)
      if (--c.tokens < 0) { ws.close(1008, 'rate limit'); return; }
      if (isBinary) return;
      let raw: unknown;
      try { raw = JSON.parse(data.toString()); } catch { return; }
      // 처리기의 버그 하나가 서버 전체를 끄지 않게 한다
      try { handle(c, raw); } catch (err) { console.error('[server] 메시지 처리 중 예외:', err); }
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
        send(c, { t: 'meta', gear: me.gear, worn: me.worn, mail: me.mail, daily: { prog: me.daily.prog, got: me.daily.got, streak: me.daily.streak }, power: game.rank.power(me), build: { stats: me.stats, skillLv: me.skillLv, left: game.build.left(me) } });
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
    for (const msg of game.casts) broadcast(msg);
    for (const a of game.gears) broadcast({ t: 'gear', id: a.id, weapon: a.weapon, armor: a.armor, cls: a.cls });
    for (const a of game.announces) broadcast({ t: 'sys', k: a.k, a: a.a });
    game.notices = []; game.cdAcks = []; game.announces = []; game.itemCds = []; game.gears = []; game.partyOut = []; game.out = []; game.casts = [];
    if (game.stateDirty) { game.stateDirty = false; broadcast({ t: 'world', s: game.state() }); }
    saveTogether();
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
    // 틱 안의 예외 하나로 루프가 멈추면 모두의 게임이 멈춘다: 적어 두고 다음 틱으로 넘어간다
    try { game.tick(dt); } catch (err) { console.error('[server] 틱 처리 중 예외:', err); }
    const afterTick = performance.now();
    m.tick.push(afterTick - now);
    for (const c of clients) c.tokens = Math.min(MSG_BURST, c.tokens + MSG_PER_TICK);
    if (tick % SNAP_EVERY === 0) { try { flush(); } catch (err) { console.error('[server] 전송 중 예외:', err); } m.flush.push(performance.now() - afterTick); }
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
    // 사람별 제한 기록도 여기서 정리한다: 접속해 있지 않고 오래 쓰지 않은 기록, 간격이 지난 신고 기록, 다시 가득 찼을 대화 통
    const now = Date.now(), online = new Set<string>();
    for (const c of clients) online.add(who(c));
    for (const [k, p] of people) {
      for (const [t, at] of p.reported) if (now - at >= REPORT_GAP_MS) p.reported.delete(t);
      if (!online.has(k) && now - p.used >= LIMIT_KEEP_MS) people.delete(k);
    }
    for (const [k, b] of chatIp) if ((now - b.at) / 1000 * CHAT_IP_PER_S >= CHAT_IP_BURST) chatIp.delete(k);
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
