// 통신 계층: 접속과 세션(이름, 저장 키, 대화, 속도 제한)을 맡고, 게임 명령은 Game에 넘긴다.
// 위치와 전투 결과는 서버만 정하고, 클라이언트는 "무엇을 하고 싶다"만 보낸다.
import http from 'node:http';
import type { Socket } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { AWAY } from '../../shared/auto';
import { GUEST_NAME } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import { PROTOCOL, protocolFits, type ServerMsg } from '../../shared/protocol';
import { CHAT_MAX, NAME_MAX, SNAP_EVERY, TICK_MS } from '../../shared/world';
import type { Ent } from '../game/entity';
import { Game, type GameOptions } from '../game/game';
import { Sanctions, normIp } from '../game/systems/sanctions';
import { log } from '../log';
import { MemoryStore, hasEcon, hasLive, type PlayerSave, type Store, type WorldSave } from '../store';
import type { Reward } from '../../shared/defs';
import { startBackups, type BackupOptions } from '../store/backup';
import { isClean, tidy } from '../text';
import { CLOSE, createAdmin, type Admin, type AdminOptions } from './admin';
import { Handoff } from './handoff';
import { REPORT_GAP_MS, REPORT_LINES } from './moderation';
import { OpsCounters, opsHandler, pushCapped } from './ops';
import { buildFrame, snapshotFor } from './snapshot';
import { serveStatic } from './static';
import { originAllowed, type OriginOptions } from './origin';
import { guestServerAuth, type ServerAuth } from './auth';
import { createWeb, type Web } from './web';
import { startStatus, type StatusOptions } from './status';
import { createSocial, type Social } from './social';

const MAX_CLIENTS = 300; // 기본 상한. 근거는 docs/infra.md의 측정 결과
const MSG_BURST = 40; // 클라이언트 하나가 한꺼번에 보낼 수 있는 메시지 수
const MSG_PER_TICK = 2; // 틱마다 회복되는 양 (초당 40개)
const CHAT_GAP_MS = 700;
const RENAME_GAP_MS = 5000;
const SAVE_EVERY_MS = 60000;
const SAVE_RETRY_MS = 1000; // 월드와 캐릭터를 함께 저장하다 실패하면 이만큼 뒤에 다시 (전송마다 다시 하면 고장 난 디스크에 초당 열 번 쓴다)
const JOIN_WITHIN_MS = 10000; // 연결하고 이 안에 접속 절차를 밟지 않으면 끊는다 (빈 연결로 자리를 채우지 못하게)
const MAX_PER_IP = 12; // 한 주소에서 동시에 열 수 있는 연결 (같은 집의 여러 사람은 되고, 수백 개는 안 된다)
const MAX_AWAY = AWAY.max; // 주인 없이 사냥 중인 캐릭터의 상한
// 대화량의 상한. 사람마다의 간격(CHAT_GAP_MS)만으로는 연결을 여러 개 열어 초당 수십 줄을 뿌릴 수 있었다.
// 한 주소: 한꺼번에 6줄까지, 그 뒤로는 초당 3줄 (같은 집의 서너 사람이 함께 떠들 만큼은 된다)
const CHAT_IP_BURST = 6;
const CHAT_IP_PER_S = 3;
// 서버 전체: 한꺼번에 40줄까지, 그 뒤로는 초당 20줄 (주소를 여럿 쓰더라도 모두의 화면과 회선에 가는 양에는 끝이 있게)
const CHAT_ALL_BURST = 40;
const CHAT_ALL_PER_S = 20;
/** 사람별 제한 기록을 마지막으로 쓴 뒤 이만큼 지나고 접속해 있지도 않으면 지운다 (가장 긴 간격인 신고 간격과 같다) */
const LIMIT_KEEP_MS = REPORT_GAP_MS;
/** 측정 구간(metrics)의 틱·전송·지연 값을 이만큼까지만 모은다: 틱 20번/초로 약 1시간 */
const M_KEEP = 72_000;
const AWAY_MIN_LV = AWAY.minLv; // 이 레벨부터 자리 비움 사냥이 된다 (막 만든 캐릭터를 수천 개 남겨 두지 못하게)

interface Client {
  ws: WebSocket; ent: Ent | null; known: Set<number>;
  /** 이 연결의 소켓 (전송 한 번의 쓰기를 모으는 cork) */
  so: Socket;
  /** 이 연결에 보낸 개인 상태: 칸의 이름 → 마지막으로 보낸 값(JSON). 아직 없는 칸은 한 번도 보내지 않은 것이다 (그래서 접속 직후에는 전부 간다) */
  mine: Map<string, string>;
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
/** 월드 저장에 덧붙이는 칸: 끌 때 사냥 중이던 캐릭터의 [저장 키, 주소] 목록. 게임 규칙의 칸이 아니라 통신 계층의 것이라 importWorld는 읽지 않는다 */
const AWAY_AT_CLOSE = 'awayAtClose';
/** 목록 없이 되살릴 때: 가장 늦게 저장된 캐릭터와 이만큼 안에 저장된 것만 '끄기 직전에 사냥 중이던 것'으로 본다 */
const AWAY_RESTORE_MS = 90_000;
export interface Running { port: number; game: Game; metrics(): Metrics; close(): Promise<void>; /** 관리자 통로 (net/admin.ts) */ admin: Admin }
export interface Options {
  bots?: number; store?: Store; game?: GameOptions; maxClients?: number; maxPerIp?: number; maxAway?: number;
  /**
   * 빌드된 화면(dist/)의 자리. 주지 않으면 저장소 뿌리의 dist/. null이면 화면 파일을 내보내지 않는다(모든 주소가 404. 관리자 통로·/healthz·/metrics·웹 끝점은 그대로):
   * 화면을 CDN·정적 호스팅·포털·앱이 따로 싣고 이 서버는 게임(WebSocket)만 맡을 때 (docs/platforms.md 3.2-1)
   */
  staticDir?: string | null;
  /** WebSocket 접속의 출처(Origin) 허용 목록 (./origin.ts). 주지 않으면 검사하지 않는다 (예전과 같다) */
  origins?: OriginOptions;
  /**
   * 받는 가장 낮은 프로토콜 번호. 기본 PROTOCOL(같은 번호만: 예전과 같다). 더 낮게 주면 그 번호 ~ PROTOCOL의 옛 화면도 받는다(앱의 호환 기간: docs/platforms.md 3.2-4):
   * welcome에 min을 실어 화면이 스스로 알게 하고, join에 v를 실은 화면(앱)이 범위 밖이면 update를 보내고 닫는다(4006)
   */
  protocolMin?: number;
  /** 업데이트할 곳의 주소 (update 메시지의 store: 앱은 스토어 페이지를 연다). 주지 않으면 싣지 않는다 */
  storeUrl?: string;
  /** 자동 백업 (../store/backup.ts). false면 하지 않는다. 주지 않으면 기본값(켜질 때와 360분마다, 20개 보관). 파일로 저장하지 않는 저장소(메모리)는 늘 하지 않는다 */
  backup?: BackupOptions | false;
  /** WebSocket 압축(perMessageDeflate). 기본 켬: 근거는 docs/infra.md '압축' (봇 30·접속 50에서 회선 -73%, CPU +8%p, 접속 200에서는 CPU가 두 배) */
  compress?: boolean;
  /** 관리자 통로의 설정 (net/admin.ts) */
  admin?: AdminOptions;
  /** 사람별 제한(대화·이름 바꾸기·신고의 간격, 대화량의 통)이 읽는 시계(ms). 기본 Date.now. 시험이 시간을 직접 옮겨 벽시계 없이 간격을 본다 */
  now?: () => number;
  /** 인증 접점 (./auth.ts): 접속 메시지에서 저장 키를 정한다. 주지 않으면 손님(기기 토큰의 해시: 예전과 같다) */
  auth?: ServerAuth;
  /** 상태 페이지 (./status.ts): 이 폴더에 status.json과 status.html을 쓴다. 주지 않으면 쓰지 않는다 (틀의 runServer는 빌드된 화면의 폴더에 쓴다) */
  status?: StatusOptions | false;
}

export function startServer(port: number, opts: Options = {}): Promise<Running> {
  const store = opts.store ?? new MemoryStore();
  const clock = opts.now ?? Date.now;
  // 켜질 때의 백업을 무엇보다 먼저: 이 서버가 저장을 읽고 고쳐 쓰기 전의 모습이 남는다
  const backups = opts.backup === false ? null : startBackups(store, opts.backup);
  /** 운영 지표의 누적 수 (/healthz, /metrics: ./ops.ts) */
  const ops = new OpsCounters();
  const game = new Game(opts.game);
  /** 고른 모듈 (engine/shared/modules.ts): 핵심이 모듈의 시스템을 부르기 전에 묻는다 */
  // 경제 장부는 economy 모듈을 고르고 저장소가 장부를 적을 수 있을 때만 (store/types.ts의 EconStore)
  const ledgerStore = game.has('economy') && hasEcon(store) ? store : null;
  const econ = !!ledgerStore, awayOn = game.has('away');
  const handoff = new Handoff(game); // 기기 옮기기: 월드 저장에 자기 칸을 두므로 월드를 읽기 전에 만든다
  const auth = opts.auth ?? guestServerAuth(handoff);
  const saved = store.loadWorld();
  if (saved) game.importWorld(saved);
  // 원격 설정·공지·점검과 시계의 마지막 경계 (저장소가 적을 수 있을 때만: store/types.ts의 LiveStore). 꺼져 있던 동안 지난 날·주·달의 경계는 여기서 한 번씩 알린다
  if (hasLive(store)) { game.live.attach(store); game.time.attach(store); }
  for (let i = 0; i < (opts.bots ?? 0); i++) game.players.spawn('Bot' + (i + 1), true);

  const clients = new Set<Client>();
  const byEnt = new Map<number, Client>();
  const byKey = new Map<string, Client>();
  /** 자동 사냥을 켠 채 접속이 끊겨, 주인 없이 사냥 중인 캐릭터 (저장 키별) */
  const away = new Map<string, Ent>();
  /** 그 캐릭터를 남긴 주소 (한 주소가 자리를 다 차지하지 못하게 센다) */
  const awayIp = new Map<string, string>();
  const awayFrom = (ip: string): number => { let n = 0; for (const v of awayIp.values()) if (v === ip) n++; return n; };
  let tick = 0;
  const maxClients = opts.maxClients ?? MAX_CLIENTS;
  const maxPerIp = opts.maxPerIp ?? MAX_PER_IP, maxAway = opts.maxAway ?? MAX_AWAY;
  // 서버를 껐다 켜도 자리 비움 사냥은 이어진다: 끄기 직전에 사냥 중이던 캐릭터를 다시 세운다 (주인이 접속하면 평소처럼 넘겨받는다).
  // 끌 때 적어 둔 목록이 있으면 그것을 쓰고, 없으면(갑자기 죽었거나 이 기능 이전의 저장) 마지막 저장 무렵에 자동 사냥을 켠 채 저장된 캐릭터를 찾는다
  if (awayOn) try {
    let list = Array.isArray(saved?.[AWAY_AT_CLOSE]) ? (saved[AWAY_AT_CLOSE] as unknown[]).filter((v): v is [string, string] => Array.isArray(v) && typeof v[0] === 'string').map((v) => [v[0], String(v[1] ?? '')] as [string, string]) : null;
    if (!list && saved) {
      const found: { name: string; seen: number }[] = [];
      store.eachPlayer((p) => { if (p.auto && typeof p.seen === 'number') found.push({ name: p.name, seen: p.seen }); });
      let newest = 0;
      store.eachPlayer((p) => { if (typeof p.seen === 'number' && p.seen > newest) newest = p.seen; });
      list = found.filter((p) => newest - p.seen < AWAY_RESTORE_MS).map((p) => [store.keyOfName(p.name) ?? '', ''] as [string, string]).filter(([key]) => key !== '');
    }
    for (const [key, ip] of list ?? []) {
      if (away.has(key) || away.size >= maxAway) continue;
      const save = store.loadPlayer(key);
      if (!save || !save.auto) continue;
      const e = game.players.spawn(save.name, false, save, key);
      if (!e.auto || e.cls === '' || game.field(e, 'lv') < AWAY_MIN_LV) { game.players.leave(e.id); continue; }
      away.set(key, e); awayIp.set(key, ip); game.away.start(e);
    }
    if (away.size) log.info(`[server] 자리 비움 사냥을 이어 갑니다: ${away.size}명`);
  } catch (err) { log.error('[server] 자리 비움 사냥을 되살리지 못했습니다:', err); }
  const perIp = new Map<string, number>();
  const people = new Map<string, Person>();
  /** 그 연결의 사람을 가리키는 열쇠: 저장 키가 있으면 그것, 손님은 접속 주소 (손님은 같은 주소의 손님끼리 한 사람으로 묶인다) */
  const who = (c: Client): string => (c.key ? 'k:' + c.key : 'i:' + c.ip);
  function person(c: Client): Person {
    const k = who(c);
    let p = people.get(k);
    if (!p) people.set(k, p = { lastChat: 0, lastRename: 0, said: [], reported: new Map(), used: 0 });
    p.used = clock();
    return p;
  }
  const chatIp = new Map<string, Bucket>(), chatAll: Bucket = { left: CHAT_ALL_BURST, at: clock() };
  /** 통에서 한 줄 몫을 꺼낸다. 비어 있으면 false */
  function take(b: Bucket, now: number, burst: number, perS: number): boolean {
    b.left = Math.min(burst, b.left + ((now - b.at) / 1000) * perS);
    b.at = now;
    if (b.left < 1) return false;
    b.left--;
    return true;
  }
  // 측정: 구간 동안의 시간과 전송량을 모은다 (metrics()가 읽으며 비운다)
  const m = { since: performance.now(), tick: [] as number[], flush: [] as number[], lag: [] as number[], bytes: 0, msgs: 0 };
  /** 구간의 값 하나를 더한다. metrics()를 부르는 쪽(METRICS 로그, 부하 측정)이 없으면 비워지지 않으므로, M_KEEP을 넘으면 오래된 반을 버린다 (예전에는 하루에 수십 MB씩 쌓였다) */
  const keepIn = (a: number[], v: number) => pushCapped(a, v, M_KEEP);

  const dist = opts.staticDir === null ? null : opts.staticDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist');
  /** 받는 프로토콜 번호의 범위 (protocolMin ~ PROTOCOL). 기본은 PROTOCOL 하나 */
  const protoMin = Math.min(PROTOCOL, Math.max(0, Math.floor(opts.protocolMin ?? PROTOCOL)));
  /** 열린 연결의 소켓 (실제로 보낸 바이트를 세는 데 쓴다) */
  const sockets = new Set<Socket>();
  const compress = opts.compress ?? true;
  // 화면 파일을 내보내지 않는 서버: 모든 주소가 404 (본문은 정적 처리기의 '없음'과 같다)
  const statics: http.RequestListener = dist === null ? (_req, res) => { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); } : serveStatic(dist);
  // 관리자 통로(POST /admin)가 먼저 보고, 아니면 정적 파일. 통로는 아래에서 연결 목록을 다룰 함수들이 다 생긴 뒤에 만든다
  let admin: Admin | null = null;
  const httpServer = http.createServer(opsHandler(ops, () => {
    let openWire = 0, online = 0;
    for (const so of sockets) openWire += so.bytesWritten;
    for (const c of clients) if (c.ent) online++;
    return { clients: online, away: away.size, entities: game.ents.size, openWire, backup: backups, compress };
  }, (req, res) => { if (!admin?.route(req, res) && !web?.route(req, res)) statics(req, res); }));
  // 압축은 작은 메시지(이동 한 번)에는 걸지 않는다: 줄어드는 것보다 드는 CPU가 크다. 압축은 libuv의 일꾼 스레드에서 돌아 틱의 스레드는 오히려 덜 쓴다
  // 출처 검사: 목록을 주었을 때만 verifyClient를 단다 (주지 않으면 ws의 기본 그대로: 예전과 같다). 걸린 연결은 손잡기에서 403
  const originCheck = opts.origins?.list?.length ? { verifyClient: (info: { origin: string }) => originAllowed(info.origin || undefined, opts.origins) } : {};
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 1024, perMessageDeflate: compress ? { threshold: 256 } : false, ...originCheck });

  /** 보낸 메시지를 센다: 지표 로그(m)와 운영 지표(ops) */
  const count = (n: number) => { m.bytes += n; m.msgs++; ops.sent(n); };
  function send(c: Client, msg: ServerMsg): void {
    if (c.ws.readyState !== c.ws.OPEN) return;
    const s = JSON.stringify(msg);
    count(s.length);
    c.ws.send(s);
  }
  function broadcast(msg: ServerMsg): void {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.ent && c.ws.readyState === c.ws.OPEN) { count(s.length); c.ws.send(s); }
  }
  const sys = (k: MsgKey, ...a: MsgArg[]): ServerMsg => ({ t: 'sys', k, a });

  // ---- 저장 ----
  // 쓰기는 모두 writeAll을 거친다: 모은 것을 저장소의 묶음(transaction) 하나로 적는다. 실패하면 하나도 적히지 않고, 표시(unsaved, saveDirty)도 그대로 남아 다음에 다시 적는다.
  // 저장 값을 만드는 일(시스템의 save)은 묶음 밖에서 먼저 한다: 한 캐릭터의 저장 값을 만들다 예외가 나면 그 캐릭터만 빼고 나머지를 적는다(예전과 같다)
  /** 적을 캐릭터 하나: 저장 키, 저장 값, 적힌 뒤에 할 일(표시 지우기) */
  interface Pending { key: string; save: PlayerSave; done: () => void }
  function exportEnt(key: string, e: Ent, after?: () => void): Pending | null {
    try { const save = game.players.export(e); return { key, save, done: () => { e.unsaved = false; after?.(); } }; }
    catch (err) { log.error(`[server] 캐릭터 저장 값을 만들지 못했습니다 (${e.name}):`, err); return null; }
  }
  // 막 들어와 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (토큰만 바꿔 접속해 저장 파일을 불리지 못하게)
  function pendingOf(c: Client): Pending | null {
    const e = c.ent;
    if (!c.key || !e) return null;
    // 칸은 그 모듈을 고른 게임에만 있다: 없으면 처음 값(직업 없음, 레벨 1, 0)으로 본다
    const money = game.has('economy');
    const touched = game.field(e, 'cls') !== '' || game.field(e, 'lv') > 1 || game.field(e, 'exp') > 0 || (money && (e.gold > 0 || e.sparks > 0)) || !!game.rules.touched?.(e);
    return c.hadSave || touched ? exportEnt(c.key, e, () => { c.hadSave = true; }) : null;
  }
  /** 바뀐 캐릭터 모두: 접속 중인 사람과 자리 비움 사냥 중인 캐릭터 */
  const changed = (): (Pending | null)[] => [...[...clients].filter((c) => c.ent?.unsaved).map(pendingOf), ...[...away].filter(([, e]) => e.unsaved).map(([key, e]) => exportEnt(key, e))];
  let failLogAt = 0, failQuiet = 0;
  /** 저장 실패를 알린다. 같은 고장이 이어지면 10초에 한 번만 (그사이 넘긴 수를 함께) */
  function saveFailed(what: string, err: unknown): void {
    ops.saveFails++;
    const now = Date.now();
    if (now - failLogAt < 10_000) { failQuiet++; return; }
    log.error(`[server] ${what} 실패${failQuiet ? ` (앞서 알리지 않은 실패 ${failQuiet}번)` : ''}:`, err);
    failLogAt = now; failQuiet = 0;
  }
  /** 모은 것(월드, 캐릭터, 재화 흐름 지표의 줄)을 한 묶음으로 적는다. 적혔으면 true. 실패하면 하나도 적히지 않고, 지표의 줄은 되돌려 다음에 다시 얹는다 */
  function writeAll(list: (Pending | null)[], world?: WorldSave): boolean {
    const rows = econ ? game.ledger.drain() : [];
    try {
      store.transaction(() => {
        if (world) store.saveWorld(world);
        for (const p of list) if (p) store.savePlayer(p.key, p.save);
        if (rows.length) ledgerStore?.addEcon(rows);
      });
    } catch (err) { if (econ) game.ledger.giveBack(rows); saveFailed(world ? '월드와 캐릭터 저장' : '캐릭터 저장', err); return false; }
    for (const p of list) p?.done();
    ops.lastSaveAt = Date.now();
    econSnapshot();
    return true;
  }
  function saveEnt(key: string, e: Ent): void { writeAll([exportEnt(key, e)]); }
  /** 캐릭터 하나를 저장한다. 월드에 저장할 것이 있으면 월드와 함께 (한쪽만 적힌 채 남지 않게) */
  function savePlayer(c: Client): void {
    if (game.saveDirty) { saveTogether([c]); return; }
    const p = pendingOf(c);
    if (p) writeAll([p]);
  }
  /**
   * 월드에 저장할 것이 있으면 월드와 바뀐 캐릭터(와 also의 사람)를 저장소의 묶음 하나로 저장한다.
   * 거래소의 물건·판 돈 우편·길드 기부처럼 캐릭터와 월드에 나뉘어 적히는 것은, 한쪽만 저장된 채 서버가 죽으면 복사되거나 사라진다.
   * 그래서 캐릭터를 저장하는 곳(접속, 접속 끊김, 주기 저장)도 월드에 저장할 것이 있으면 이것을 거친다. 실패하면 saveDirty를 그대로 두어 다시 시도한다(전송에서는 SAVE_RETRY_MS 뒤에).
   * 월드의 저장 값을 만들다 예외가 나면(시스템의 버그: 다시 해도 같다) 캐릭터만이라도 적는다 (예전과 같다)
   */
  let retryAt = 0;
  function saveTogether(also: Client[] = [], wait = false): void {
    if (!game.saveDirty || (wait && Date.now() < retryAt)) return;
    const list = changed();
    for (const c of also) if (!c.ent?.unsaved) list.push(pendingOf(c));
    let world: WorldSave;
    try { world = game.exportWorld(); }
    catch (err) { saveFailed('월드 저장 값 만들기', err); retryAt = Date.now() + SAVE_RETRY_MS; writeAll(list); return; }
    if (writeAll(list, world)) { game.saveDirty = false; retryAt = 0; } else retryAt = Date.now() + SAVE_RETRY_MS;
  }
  /**
   * 재화 흐름 지표(engine/server/game/systems/ledger.ts)의 그날의 분포 스냅샷이 아직 없으면(날이 바뀐 뒤 첫 저장, 서버를 켠 직후) 저장된 캐릭터를 훑어 하나 남긴다.
   * 지표의 줄은 writeAll이 저장과 같은 묶음에 얹는다
   */
  let snapDay = '';
  function econSnapshot(): void {
    if (!econ) return;
    const day = game.ledger.today();
    if (day === snapDay) return;
    try { if (ledgerStore && !ledgerStore.econSnapshot(day)) ledgerStore.saveEconSnapshot(day, game.ledger.snapshot((fn) => store.eachPlayer(fn))); snapDay = day; }
    catch (err) { log.error('[server] 지표 스냅샷 실패:', err); }
  }
  econSnapshot(); // 켜질 때: 오늘의 스냅샷이 없으면 남긴다
  /** welcome에 덧붙이는 호환 범위: 옛 화면을 받아 줄 때만 (기본은 비어 있어 welcome이 예전과 같다) */
  const welcomeMin: { min?: number } = protoMin < PROTOCOL ? { min: protoMin } : {};

  function join(c: Client, m: Record<string, unknown>): void {
    // 프로토콜 번호를 실은 화면(앱·데스크톱)이 받는 범위 밖이면 업데이트를 알리고 닫는다 (웹은 싣지 않는다: welcome의 v·min으로 화면이 안다)
    if (typeof m.v === 'number' && !protocolFits(m.v, PROTOCOL, protoMin < PROTOCOL ? protoMin : undefined)) {
      send(c, { t: 'update', min: protoMin, max: PROTOCOL, ...(opts.storeUrl ? { store: opts.storeUrl } : {}) });
      c.ws.close(CLOSE.update, 'update'); return;
    }
    // 토큰이 있으면 저장된 캐릭터를 이어받는다 (인증 접점 ./auth.ts: 손님은 토큰의 해시가 저장 키)
    // 다른 기기로 옮겨 간 토큰은 받지 않는다. 옮겨 온 기기의 토큰은 그 캐릭터의 저장 키를 가리킨다 (net/handoff.ts)
    const key = auth.keyOf(m);
    if (key === undefined) { c.key = null; send(c, sys('handedOff')); c.ws.close(CLOSE.handedOff, 'moved'); return; }
    c.key = key;
    const ban = game.sanctions.banned(c.key, c.ip);
    if (ban) { send(c, sys('banned', Sanctions.minutesLeft(ban, game.now()))); c.ws.close(CLOSE.banned, 'banned'); c.key = null; return; }
    // 점검 중에는 관리자(점검 중 입장으로 적은 저장 키)만, 깃발 join이 꺼져 있으면 관리자 말고는 새로 들어오지 못한다
    const boss = game.live.isAdmin(c.key);
    if (game.live.maintOn() && !boss) { const v = game.live.maintView(); if (v) send(c, { t: 'maint', ...v }); c.ws.close(CLOSE.maint, 'maint'); c.key = null; return; }
    if (!game.flags.on('join') && !boss) { send(c, sys('joinClosed')); c.ws.close(CLOSE.joinClosed, 'join closed'); c.key = null; return; }
    if (c.key) {
      const old = byKey.get(c.key);
      // 밀려난 연결은 캐릭터와의 끈을 끊는다: 닫히기 전에 보낸 명령이 옛 캐릭터를 움직이거나 저장을 덮어쓰지 못하게
      if (old) { send(old, sys('replaced')); old.ws.close(4000, 'replaced'); dropClient(old); old.ent = null; }
      byKey.set(c.key, c);
    }
    // 자리를 비운 동안 사냥하던 캐릭터가 있으면 새로 만들지 않고 그대로 이어받는다
    const kept = c.key ? away.get(c.key) : undefined;
    if (c.key && kept) {
      away.delete(c.key); awayIp.delete(c.key);
      if (game.ents.has(kept.id)) {
        c.ent = kept;
        byEnt.set(kept.id, c);
        kept.dirty = true; kept.metaDirty = true;
        game.away.stop(kept);
        send(c, { t: 'welcome', id: kept.id, name: kept.name, x: r2(kept.x), z: r2(kept.z), auto: true, v: PROTOCOL, ...welcomeMin });
        send(c, { t: 'world', s: game.state() });
        sendOps(c);
        if (game.has('party')) game.party.resend(kept.id);
        game.channels.tell(kept); // 있던 채널 그대로다: 화면에 다시 알린다
        social.joined(c);
        return;
      }
    }
    const save = c.key ? store.loadPlayer(c.key) : null;
    c.hadSave = !!save;
    // 이름: 저장된 이름이 먼저다. 없으면 클라이언트가 제안한 이름, 그것도 없으면 중립적인 이름
    const ok = (s: string) => (isClean(s) ? s : ''); // 금칙어가 든 이름은 쓰지 않는다
    let name = ok(tidyName(save?.name)) || ok(tidyName(m.name)) || GUEST_NAME + (1000 + Math.floor(Math.random() * 9000));
    // 지금 접속해 있는 사람과 같은 이름이면 숫자를 붙여 구별한다 (사칭 방지)
    // 저장된 자기 이름은 그대로 쓴다. 새로 온 사람이 고른 이름이 남의 것이면 숫자를 붙인다
    for (let i = 0; i < 5 && taken(name, undefined, c.key); i++) name = ([...name].slice(0, NAME_MAX - 3).join('') + (100 + Math.floor(Math.random() * 900)));
    c.ent = game.players.spawn(name, false, save, c.key ?? '');
    byEnt.set(c.ent.id, c);
    send(c, { t: 'welcome', id: c.ent.id, name, x: r2(c.ent.x), z: r2(c.ent.z), auto: (awayOn && c.ent.auto) || undefined, v: PROTOCOL, ...welcomeMin });
    send(c, { t: 'world', s: game.state() });
    sendOps(c);
    // 오늘의 자리 비움 사냥 시간을 다 써서 멈췄던 사람: 왜 멈춰 있는지 알린다
    if (awayOn && save && c.ent.cls !== '' && game.field(c.ent, 'lv') >= AWAY_MIN_LV && game.away.left(c.ent) <= 0) game.notify(c.ent, 'awayLimit', AWAY.maxS / 3600);
    broadcast(sys('joined', name));
    social.joined(c); // 차단 목록, 대화 상태, 친구 (./social.ts)
    saveTogether(); // 접속하며 받은 것(맡아 둔 우편)이 월드에서 빠진 것과 함께 저장되게
    savePlayer(c);
  }

  /** 접속 직후에 운영의 것을 보낸다: 화면에도 보내는 원격 설정, 지금 보이는 공지, 예고했거나 진행 중인 점검. 없는 것은 보내지 않는다 (예전과 같은 줄) */
  function sendOps(c: Client): void {
    const set = game.live.clientSet(), list = game.live.notices(), m = game.live.maintView();
    if (Object.keys(set).length) send(c, { t: 'live', set });
    if (list.length) send(c, { t: 'notices', list });
    if (m) send(c, { t: 'maint', ...m });
  }

  /** 이름을 다듬는다: 제어 문자와 눈에 보이지 않는 글자를 지우고 길이를 자른다 */
  const tidyName = (raw: unknown): string => [...tidy(clean(raw, 200))].slice(0, NAME_MAX).join('').trim();
  /** 그 이름을 지금 월드에 있는 다른 사람이 쓰고 있는가 (대소문자 무시) */
  const taken = (name: string, me?: Ent, myKey: string | null = null): boolean => {
    const k = name.toLowerCase();
    for (const e of game.ents.values()) if (e.kind === 'p' && e !== me && e.name.toLowerCase() === k) return true;
    // 접속해 있지 않은 사람의 이름도 남이 차지할 수 없다 (돌아왔을 때 자기 이름을 잃지 않게)
    try { const owner = store.keyOfName(name); return owner !== null && owner !== myKey; } catch { return false; }
  };

  function rename(c: Client, e: Ent, raw: unknown): void {
    const name = tidyName(raw);
    const now = clock();
    if (!name || name === e.name) return;
    if (!isClean(name)) { send(c, sys('nameBad')); return; }
    if (taken(name, e, c.key)) { send(c, sys('nameTaken')); return; }
    if (now - c.lastRename < RENAME_GAP_MS) { send(c, sys('renameWait')); return; }
    c.lastRename = now;
    const before = e.name;
    game.players.rename(e, name);
    broadcast({ t: 'name', id: e.id, name });
    broadcast(sys('renamed', before, name));
    c.hadSave = true; // 이름을 지은 사람은 아직 아무것도 하지 않았어도 저장한다 (다음 접속에 그 이름이 남게)
    savePlayer(c);
  }

  function chat(c: Client, e: Ent, m: Record<string, unknown>): void {
    // 정해진 문장(q: QUICK_CHAT의 키)이면 글은 없다
    const quick = typeof m.q === 'string' ? m.q.slice(0, 40) : '';
    const text = quick ? '' : clean(m.text, CHAT_MAX);
    const now = clock(), me = person(c);
    if ((!text && !quick) || now - me.lastChat < CHAT_GAP_MS) return;
    if (!game.flags.on('chat')) { send(c, sys('featureOff', 'chat')); return; } // 기능 깃발: 대화가 꺼져 있다
    const mute = game.sanctions.muted(c.key, c.ip);
    if (mute) { send(c, sys('muted', Sanctions.minutesLeft(mute, game.now()))); return; }
    // 받는 곳 (./social.ts): 제한 모드, 정해진 문장, 채널·귓말(chat 모듈)과 그 도배 막기. 막혔으면 null (까닭은 이미 알렸다)
    const to = social.route(c, e, m, text, quick);
    if (!to) return;
    me.lastChat = now;
    // 한 주소가 보내는 양과 서버 전체의 양에도 끝이 있다. 넘친 말은 전하지 않고, 말한 사람에게만 알린다
    let ip = chatIp.get(c.ip);
    if (!ip) chatIp.set(c.ip, ip = { left: CHAT_IP_BURST, at: now });
    if (!take(ip, now, CHAT_IP_BURST, CHAT_IP_PER_S) || !take(chatAll, now, CHAT_ALL_BURST, CHAT_ALL_PER_S)) { send(c, sys('chatWait')); return; }
    if (text) { me.said.push(text); if (me.said.length > REPORT_LINES) me.said.shift(); }
    // 모두에게(또는 채널의 사람들에게): 받는 사람이 말한 사람을 차단했으면 그 사람에게는 가지 않는다. 줄 번호를 붙이고 신고의 문맥으로 기억한다
    social.deliver(c, e, to, text, quick);
  }

  /**
   * 신고: 기록만 한다. 제재는 사람이 기록을 보고 정한다.
   * id(사람을 눌러서) 또는 n(대화 줄을 눌러서: 그 줄을 말한 사람, 지금 접속해 있지 않아도 된다). 신고당한 사람의 최근 말과 함께 대화의 앞뒤(./social.ts의 context: 신고한 사람이 본 줄만)를 적는다
   */
  function report(c: Client, e: Ent, m: Record<string, unknown>): void {
    const target = num(m.id) ? byEnt.get(m.id) ?? null : null;
    if (num(m.id) && (!target?.ent || target === c)) return;
    if (!target && !num(m.n)) return;
    const cx = social.context(c, target ? undefined : m.n, target);
    if (!cx || cx.char === who(c)) return;
    // 신고한 사람도 당한 사람도 연결이 아니라 사람으로 본다: 어느 쪽이 다시 접속해도 간격이 이어지고, 당한 사람이 한 말도 남아 있다
    const now = clock(), me = person(c), tk = cx.char;
    if (now - (me.reported.get(tk) ?? -Infinity) < REPORT_GAP_MS) { send(c, sys('reportWait')); return; }
    me.reported.set(tk, now);
    try { store.saveReport({ at: now, by: e.name, byKey: c.key, target: cx.name, targetKey: cx.key, lines: [...(people.get(tk)?.said ?? [])], ...(cx.ctx.length ? { ctx: cx.ctx } : {}), ...(cx.ch ? { ch: cx.ch } : {}) }); }
    catch (err) { log.error('[server] 신고 저장 실패:', err); }
    console.log(`[server] 신고: ${e.name} → ${cx.name}`);
    send(c, sys('reported', cx.name));
  }

  /** 기기 옮기기 (net/handoff.ts): 코드를 만들어 주거나, 받은 코드로 이 연결에 새 토큰을 준다 */
  function handoffMsg(c: Client, m: Record<string, unknown>): void {
    if (m.a === 'make') {
      if (!c.key) { send(c, sys('handoffGuest')); return; }
      c.hadSave = true; savePlayer(c); // 옮길 캐릭터가 저장되어 있어야 다른 기기가 이어받는다
      const { code, ms } = handoff.make(c.key);
      if (game.saveDirty) saveTogether(); // 새 코드(의 해시)가 곧바로 저장되게: 그 사이에 서버를 다시 켜도 코드가 쓰인다
      send(c, { t: 'handoff', code, ms });
      return;
    }
    if (m.a !== 'use') return;
    const r = handoff.use(m.code, ['i:' + c.ip, who(c)], c.key);
    if ('token' in r) {
      // 옛 기기의 연결을 끊는다: 그 기기는 옛 토큰을 지운다 (engine/client/main.ts). 자동 사냥 중이었으면 자리 비움 사냥으로 남아 새 기기가 이어받는다
      const old = byKey.get(r.key);
      if (old && old !== c) { send(old, sys('handedOff')); old.ws.close(CLOSE.handedOff, 'moved'); dropClient(old); old.ent = null; }
      saveTogether(); // 별칭이 곧바로 저장되게 (saveDirty가 켜져 있다)
      console.log(`[server] 기기 옮기기: ${store.loadPlayer(r.key)?.name ?? '?'} (${c.ip})`);
      send(c, { t: 'handoff', token: r.token });
    } else if ('left' in r) send(c, sys('handoffBad', r.left));
    else if ('wait' in r) send(c, sys('handoffWait', Math.ceil(r.wait / 60000)));
    else send(c, sys('handoffSelf'));
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
    else if (m.t === 'chat') chat(c, e, m);
    else if (m.t === 'report') report(c, e, m);
    else if (m.t === 'handoff') handoffMsg(c, m);
    else if (web.handle(c, e, m)) { /* 탭 숨김·약관 동의·내 데이터 (./web.ts) */ }
    else if (social.handle(c, e, m)) { /* 차단·친구·대화 설정과 연령 (./social.ts) */ }
    else if (social.gate(c, e, m)) { /* 제한 모드에서 막는 명령 (자유 대화인 길드 대화, AGE.restrict) */ }
    else game.command(e, m); // 나머지는 게임 명령
  }

  /** 연결을 정리한다. 두 번 불려도 안전하다. */
  function dropClient(c: Client): void {
    if (!clients.delete(c)) return;
    if (c.key && byKey.get(c.key) === c) byKey.delete(c.key);
    if (c.ent) {
      web.left(c); // 자리 비움이었으면 풀렸다고 알린다
      game.fire('playerDropped', c.ent); // 던전 안이었으면 문 앞으로 나온 뒤에 저장한다
      saveTogether(); // 방금 한 거래가 월드에만(또는 캐릭터에만) 저장된 채로 남지 않게
      savePlayer(c);
      byEnt.delete(c.ent.id);
      // 자동 사냥 중이었으면 캐릭터를 남겨 두고 서버가 이어서 사냥한다.
      // 직업을 고르고 조금이라도 키운 캐릭터만, 정해진 수까지만 남긴다 (접속했다 끊기를 되풀이해 월드를 채우지 못하게)
      social.left(c); // 친구에게 나갔다고 알리고, 기억해 둔 차단·설정을 놓는다
      if (awayOn && c.key && c.ent.auto && !stopped && !game.live.maintOn() && c.ent.cls !== '' && game.field(c.ent, 'lv') >= AWAY_MIN_LV && away.size < maxAway && awayFrom(c.ip) < AWAY.maxPerIp) { awayIp.set(c.key, c.ip); away.set(c.key, c.ent); game.away.start(c.ent); return; }
      game.players.leave(c.ent.id);
      broadcast(sys('left', c.ent.name));
    }
  }

  /** 관리자의 내보내기·차단: 그 저장 키(또는 주소)의 연결을 안내문과 함께 끊고, 자리 비움 사냥 중인 캐릭터도 내보낸다 (자동 사냥으로 남지 않게) */
  function dropBy(by: { key?: string; ip?: string }, code: number, k: MsgKey, ...a: MsgArg[]): number {
    let n = 0;
    for (const c of [...clients]) {
      if (!(by.key ? c.key === by.key : normIp(c.ip) === by.ip)) continue;
      send(c, sys(k, ...a));
      if (c.ent && awayOn) c.ent.auto = false;
      c.ws.close(code, k);
      dropClient(c); c.ent = null; n++;
    }
    for (const [key, e] of [...away]) {
      if (!(by.key ? key === by.key : normIp(awayIp.get(key) ?? '') === by.ip)) continue;
      e.auto = false;
      saveEnt(key, e); away.delete(key); awayIp.delete(key);
      game.players.leave(e.id);
      broadcast(sys('left', e.name)); n++;
    }
    return n;
  }
  // 사회와 안전 (./social.ts): 차단, 대화의 받는 곳과 채널, 정해진 문장, 연령과 제한 모드, 친구, 신고의 문맥
  const social: Social = createSocial({
    game, store, now: clock, send,
    clients: () => [...clients].filter((c) => c.ent),
    byEnt: (id) => byEnt.get(id), byKey: (key) => byKey.get(key),
  });
  // 웹 출시의 바탕 (./web.ts): 탭 숨김, 약관 동의, 내 데이터, 화면 오류. 삭제 요청은 1분마다와 켜질 때 살핀다
  const web: Web = createWeb({
    game, store, now: clock, send, broadcast,
    drop: (by, code, k, ...a) => dropBy(by, code, k, ...a),
    clients: () => [...clients].filter((c) => c.ent),
    save: () => { game.saveDirty = true; saveTogether(); },
    social: { exportOf: (key) => social.exportOf(key), erased: (key) => social.erased(key) },
  });
  const eraseTimer = setInterval(() => { try { web.sweep(); } catch (err) { log.error('[server] 삭제 요청 살피기 실패:', err); } }, 60_000);
  setTimeout(() => { if (!stopped) try { web.sweep(); } catch (err) { log.error('[server] 삭제 요청 살피기 실패:', err); } }, 0);
  /** 점검이 시작됐다: 모두를 저장하고, 관리자 말고는 안내와 함께 끊는다. 자리 비움 사냥 중인 캐릭터도 저장하고 내보낸다 (자동 사냥은 켜 둔 채: 돌아오면 이어진다) */
  game.on('maintStarted', () => {
    const v = game.live.maintView();
    game.saveDirty = true;
    saveTogether([...clients].filter((c) => c.ent));
    for (const c of [...clients]) {
      if (game.live.isAdmin(c.key)) continue;
      if (v) send(c, { t: 'maint', ...v });
      if (c.ent) send(c, sys('maintStart', v?.until ?? 0));
      c.ws.close(CLOSE.maint, 'maint');
      dropClient(c); c.ent = null;
    }
    for (const [key, e] of [...away]) { saveEnt(key, e); away.delete(key); awayIp.delete(key); game.players.leave(e.id); broadcast(sys('left', e.name)); }
    log.info(`[server] 점검을 시작했습니다: 남은 연결 ${clients.size}개 (관리자)`);
    status?.write();
  });
  game.on('maintEnded', () => { log.info('[server] 점검을 끝냈습니다'); status?.write(); });
  game.on('liveChanged', (key) => { if (key === 'maint') status?.write(); });

  /**
   * 일괄 우편 (관리자의 maint end의 보상): 저장된 캐릭터 모두(sinceMs를 주면 그 시각 뒤에 저장된 것만)에게 우편을 보낸다. 접속해 있지 않은 사람은 월드에 맡아 둔다 (우편 모듈의 sendTo).
   * 보낸 수. 우편 모듈이 없거나 저장 키로 훑을 수 없는 저장소면 -1
   */
  function mailAll(reward: Reward, sinceMs: number): number {
    if (!game.has('mail') || !store.eachPlayerKey) return -1;
    let n = 0;
    store.eachPlayerKey((key, p) => { if (sinceMs && (p.seen ?? 0) < sinceMs) return; game.mail.sendTo(key, 'maint', [], reward); n++; });
    game.saveDirty = true;
    saveTogether();
    return n;
  }

  admin = createAdmin({
    game, store, mailAll,
    people: () => [
      ...[...clients].filter((c) => c.ent).map((c) => ({ name: c.ent!.name, key: c.key, ip: c.ip, ent: c.ent!, away: false })),
      ...[...away].map(([key, e]) => ({ name: e.name, key, ip: awayIp.get(key) ?? '', ent: e, away: true })),
    ],
    drop: dropBy, broadcast, save: () => { game.saveDirty = true; saveTogether(); },
    extra: () => ({ ...web.admin, ...social.admin }),
  }, opts.admin);

  wss.on('connection', (ws, req) => {
    // 터널(같은 PC의 프록시)을 거쳐 온 연결은 실제 주소가 머리말에 들어 있다. 바깥에서 직접 온 연결의 머리말은 믿지 않는다
    const direct = req.socket.remoteAddress ?? '', local = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
    const fwd = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
    const ip = (local && typeof fwd === 'string' && fwd ? fwd.split(',')[0].trim() : direct) || '?';
    const full = () => { ws.send(JSON.stringify({ t: 'full' } satisfies ServerMsg)); ws.close(1013, 'full'); };
    // 주인 없이 사냥 중인 캐릭터도 자리를 차지한다
    if (clients.size + away.size >= maxClients) { full(); return; }
    if ((perIp.get(ip) ?? 0) >= maxPerIp) { full(); return; }
    // 주소가 막혀 있으면 접속 절차 전에 끊는다
    const ipBan = game.sanctions.banned(null, ip);
    if (ipBan) { ws.send(JSON.stringify(sys('banned', Sanctions.minutesLeft(ipBan, game.now())))); ws.close(CLOSE.banned, 'banned'); return; }
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    // 실제로 보낸 바이트(압축 뒤)를 센다: 닫히면 누적에 더한다
    const so = req.socket;
    sockets.add(so);
    ws.on('close', () => { if (sockets.delete(so)) ops.closedWire += so.bytesWritten; });
    const c: Client = {
      ws, so, ent: null, known: new Set(), mine: new Map(), tokens: MSG_BURST, alive: true, key: null, ip, hadSave: false,
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

  // 상태 페이지 (./status.ts): 정적 폴더에 status.json을 주기적으로
  const status = opts.status ? startStatus(opts.status, () => { let n = 0; for (const c of clients) if (c.ent) n++; return { players: n + away.size, maint: game.live.maintView() }; }) : null;

  // 줄 위의 칸 가운데 고르지 않은 모듈의 것은 뺀다 (snapshot.ts의 Fields). 서버가 도는 동안 모듈은 바뀌지 않는다
  const fields = { hp: game.has('combat'), weapon: game.has('items'), cls: game.has('classes') };
  /** 게임이 쌓아 둔 것을 클라이언트에 내보낸다. */
  function flush(): void {
    const frame = buildFrame(game.ents.values(), (e) => (e.kind === 'p' ? game.playerVals?.(e) : game.kinds.get(e.kind)?.sync?.(e)), fields);
    const events = game.events;
    game.events = [];
    let online = 0;
    for (const c of clients) if (c.ent) online++;
    // 이번 전송에서 한 연결에 가는 메시지들(스냅샷, 개인 상태, 안내문 …)을 소켓에 한 번에 쓰게 모은다: 메시지마다 시스템 호출을 하지 않는다.
    // 프레임과 바이트는 그대로다(쓰는 횟수만 준다). 압축하는 큰 메시지는 일꾼 스레드에서 끝나는 대로 따로 나간다. 다음 차례(setImmediate)에 놓아 준다
    const corked: Socket[] = [];
    for (const c of clients) if (c.ent && c.ws.readyState === c.ws.OPEN && !c.so.destroyed) { c.so.cork(); corked.push(c.so); }
    if (corked.length) setImmediate(() => { for (const so of corked) so.uncork(); });

    for (const c of clients) {
      const me = c.ent;
      if (!me) continue;
      const { json, seen } = snapshotFor(me, c.known, frame, events, online);
      c.known = seen;
      if (c.ws.readyState === c.ws.OPEN) { count(json.length); c.ws.send(json); }
      // 모듈이 만드는 본인의 메시지 (성장 수치 stat, 장비·우편 meta: engine/server/game/systems/status.ts)
      for (const make of game.perFlush) { const msg = make(me); if (msg) send(c, msg); }
      // 개인 상태: 게임의 시스템이 등록한 칸을 돌며, 이 연결에 처음이거나 바뀐 것만 보낸다
      for (const it of game.personal) {
        const first = !c.mine.has(it.name);
        if (it.dirty && !first && !it.dirty(me)) continue;
        const s = it.state(me), json = it.dirty ? '' : JSON.stringify(s) ?? '';
        if (!it.dirty && !first && json === c.mine.get(it.name)) continue;
        c.mine.set(it.name, json);
        it.sent?.(me);
        send(c, { t: 'me', k: it.name, s });
      }
    }
    for (const n of game.notices) { const c = byEnt.get(n.id); if (c) send(c, { t: 'sys', k: n.k, a: n.a }); }
    for (const a of game.cdAcks) { const c = byEnt.get(a.id); if (c) send(c, { t: 'cd', n: a.n, ms: a.ms }); }
    for (const a of game.itemCds) { const c = byEnt.get(a.id); if (c) send(c, { t: 'icd', ms: a.ms }); }
    for (const o of game.partyOut) { const c = byEnt.get(o.id); if (c) send(c, o.msg); }
    for (const o of game.out) { const c = byEnt.get(o.id); if (c && social.pass(o.id, o.msg)) send(c, o.msg); } // 길드 대화: 받는 사람이 말한 사람을 차단했으면 빼고, 줄을 기억한다
    for (const msg of game.casts) broadcast(msg);
    for (const a of game.gears) broadcast({ t: 'gear', id: a.id, weapon: a.weapon, armor: a.armor, cls: a.cls });
    for (const a of game.announces) broadcast({ t: 'sys', k: a.k, a: a.a });
    game.notices = []; game.cdAcks = []; game.announces = []; game.itemCds = []; game.gears = []; game.partyOut = []; game.out = []; game.casts = [];
    if (game.stateDirty) { game.stateDirty = false; broadcast({ t: 'world', s: game.state() }); }
    saveTogether([], true);
    // 자리 비움 사냥이 끝난 캐릭터(시간이 다 됨)는 저장하고 내보낸다
    for (const [key, e] of away) {
      if (e.auto) continue;
      saveEnt(key, e); away.delete(key); awayIp.delete(key);
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
    keepIn(m.lag, Math.max(0, now - nextAt));
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    tick++;
    // 틱 안의 예외 하나로 루프가 멈추면 모두의 게임이 멈춘다: 적어 두고 다음 틱으로 넘어간다
    try { game.tick(dt); } catch (err) { console.error('[server] 틱 처리 중 예외:', err); }
    const afterTick = performance.now();
    keepIn(m.tick, afterTick - now);
    ops.tick(afterTick - now);
    for (const c of clients) c.tokens = Math.min(MSG_BURST, c.tokens + MSG_PER_TICK);
    if (tick % SNAP_EVERY === 0) { try { flush(); } catch (err) { console.error('[server] 전송 중 예외:', err); } keepIn(m.flush, performance.now() - afterTick); }
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

  // 주기 저장: 바뀐 캐릭터만, 한 묶음으로 적는다. 월드에 저장할 것이 있으면 월드와 함께
  const autosave = setInterval(() => {
    if (game.saveDirty) saveTogether();
    else writeAll(changed());
  }, SAVE_EVERY_MS);

  // 응답 없는 연결 정리
  const heartbeat = setInterval(() => {
    // 사람별 제한 기록도 여기서 정리한다: 접속해 있지 않고 오래 쓰지 않은 기록, 간격이 지난 신고 기록, 다시 가득 찼을 대화 통
    const now = clock(), online = new Set<string>();
    for (const c of clients) online.add(who(c));
    for (const [k, p] of people) {
      for (const [t, at] of p.reported) if (now - at >= REPORT_GAP_MS) p.reported.delete(t);
      if (!online.has(k) && now - p.used >= LIMIT_KEEP_MS) people.delete(k);
    }
    for (const [k, b] of chatIp) if ((now - b.at) / 1000 * CHAT_IP_PER_S >= CHAT_IP_BURST) chatIp.delete(k);
    handoff.sweep();
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
        admin: admin!,
        close: () => new Promise<void>((ok) => {
          stopped = true; clearTimeout(timer); clearInterval(heartbeat); clearInterval(autosave); clearInterval(eraseTimer); web.close(); backups?.stop(); status?.stop(); status?.write('down');
          admin?.close();
          // 끄기 전에 전원과 월드를 한 묶음으로 저장한다.
          // 다시 켰을 때 이어서 사냥할 캐릭터를 적어 둔다: 자리 비움 사냥 중이던 것과, 자동 사냥을 켠 채 접속해 있던 것(재시작으로 끊긴다)
          const hunting: [string, string][] = [...away.keys()].map((key) => [key, awayIp.get(key) ?? '']);
          for (const c of clients) if (awayOn && c.key && c.ent && c.ent.auto && c.ent.cls !== '' && game.field(c.ent, 'lv') >= AWAY_MIN_LV && !away.has(c.key)) hunting.push([c.key, c.ip]);
          const list = [...[...clients].map(pendingOf), ...[...away].map(([key, e]) => exportEnt(key, e))];
          let world: WorldSave | undefined;
          try { world = { ...game.exportWorld(), [AWAY_AT_CLOSE]: hunting }; } catch (err) { saveFailed('월드 저장 값 만들기', err); }
          if (writeAll(list, world)) log.info(`[server] 저장했습니다: 캐릭터 ${list.filter(Boolean).length}명${world ? ', 월드' : ''}`);
          for (const c of clients) c.ws.terminate();
          wss.close(() => httpServer.close(() => ok()));
        }),
      });
    });
  });
}
