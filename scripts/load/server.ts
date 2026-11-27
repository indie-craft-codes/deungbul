// 부하·장시간 측정의 서버 쪽 (scripts/load.mjs가 게임의 tsconfig로 띄운다: 별칭 @game이 그 게임의 내용을 가리킨다).
// 진짜 서버(startServer)를 이 프로세스에 띄우고, 정해진 간격마다 지표 한 줄(JSON)을 표준 출력에 찍는다:
//   틱 시간(이 프로세스가 game.tick을 감싸 잰 모든 틱), 전송 시간·보낸 양(server.metrics()의 구간 값), 회선 바이트(/metrics),
//   메모리, 엔티티의 종류별 수, 인스턴스 층의 수, 그리고 게임과 시스템이 든 목록(Map·Set·배열)의 크기 (쌓이기만 하는 것 찾기).
// 끝나면 요약 한 줄 {"t":"done", …}. 설정은 첫 인자의 JSON (scripts/load.mjs의 머리 주석).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface Cfg {
  game: string; port: number; seconds: number; warmup: number; every: number;
  /** 사람마다 편성할 영웅 수 (squad 모듈이 있는 게임: 그 수만큼 영웅을 주고 편성한다. 0이면 게임의 처음 그대로) */
  squad: number;
  /** 서버가 붙이는 봇 (startServer의 bots) */
  bots: number;
  /** 가상 시계의 배속 (g.now만: 날짜·습격 시각·출석). 1이면 벽시계 */
  speed: number;
  /** 가상 시계의 출발 (ISO 문자열이나 ms). 없으면 지금 */
  start?: string | number;
  /** sqlite면 저장 파일에 (data/load/<이름>/game.db), memory면 메모리 */
  db: 'sqlite' | 'memory';
  name: string;
  compress: boolean;
  /** 틱 시간을 모두 모아 둘 최대 개수 (넘으면 앞의 반을 버린다) */
  keep?: number;
  /** server.metrics()를 부르지 않는다 (운영처럼: 그 구간 값이 비워지지 않는다. 전송 시간은 0으로 찍힌다). 장시간 측정에서 쓴다 */
  noMetrics?: boolean;
}

const cfg = JSON.parse(process.argv[2]) as Cfg;
const root = process.cwd();
const imp = (f: string) => import(pathToFileURL(path.join(root, f)).href);

/** 게임마다의 규칙 플러그인: [파일, 내보낸 이름, 설정을 받는 함수인가] */
const PLUGINS: Record<string, [string, string, boolean]> = {
  deungbul: ['games/deungbul/server/deungbul.ts', 'installDeungbul', true],
  collect: ['engine/test/collect/server/heath.ts', 'heath', false],
  sample: ['games/sample/server/sample.ts', 'installSample', false],
  echopact: ['games/echopact/server/echopact.ts', 'installEchopact', false],
};
const [file, fn, takesCfg] = PLUGINS[cfg.game] ?? (() => { throw new Error(`모르는 게임: ${cfg.game}`); })();
const mod = await imp(file);
const plugin = takesCfg ? (cfg.game === 'deungbul' ? (g: unknown) => mod[fn](g, {}) : mod[fn]({})) : mod[fn];
const { startServer } = await imp('engine/server/net/server.ts');
const { MemoryStore, SqliteStore } = await imp('engine/server/store/index.ts');
const defs = await imp('engine/shared/defs.ts');

// 가상 시계: 출발 시각에서 벽시계의 speed배로 흐른다
const wall0 = Date.now();
const v0 = cfg.start === undefined ? wall0 : typeof cfg.start === 'number' ? cfg.start : new Date(cfg.start).getTime();
const vnow = () => v0 + (Date.now() - wall0) * cfg.speed;

// 편성의 크기: 내용의 SQUAD_RULES.size를 늘린다 (가진 영웅 수까지)
const heroIds: string[] = defs.HERO_IDS ?? [];
if (cfg.squad > 0 && defs.SQUAD_RULES) (defs.SQUAD_RULES as { size: number }).size = Math.min(cfg.squad, heroIds.length);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = any; type E = any;
let joinedSeq = 0;
/** 측정용 플러그인: 직업이 있는 게임은 직업을 골라 주고(저장되게), 편성 크기를 정했으면 영웅을 그만큼 주고 편성한다 */
const loadPlugin = (g: G) => {
  g.on('playerJoined', (p: E) => {
    const i = joinedSeq++;
    if (g.has('classes') && p.cls === '' && defs.CLASS_IDS.length) g.classes.choose(p, defs.CLASS_IDS[i % defs.CLASS_IDS.length]);
    if (cfg.squad > 0 && g.has('squad')) {
      const ids = heroIds.slice(0, (defs.SQUAD_RULES as { size: number }).size);
      for (const id of ids) if (!g.roster.owned(p, id)) g.roster.grant(p, id);
      g.squad.set(p, ids);
    }
  });
};

const dir = path.join(root, 'data', 'load', cfg.name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const store = cfg.db === 'sqlite' ? new SqliteStore(path.join(dir, 'game.db')) : new MemoryStore();
const server = await startServer(cfg.port, {
  store, bots: cfg.bots, maxClients: 5000, maxPerIp: 5000, backup: false, compress: cfg.compress,
  staticDir: path.join(dir, 'no-dist'), game: { plugins: [plugin, loadPlugin], now: vnow },
});
const g: G = server.game;

// 모든 틱의 계산 시간을 잰다 (server.ts의 지표와 같은 자리: game.tick 하나)
const keep = cfg.keep ?? 400_000;
let ticks: number[] = [];
let tickAll: number[] = [];
const tick0 = g.tick.bind(g);
g.tick = (dt: number) => { const t = performance.now(); tick0(dt); const d = performance.now() - t; ticks.push(d); tickAll.push(d); if (tickAll.length > keep) tickAll = tickAll.slice(keep >> 1); };

/** /metrics를 읽는다 (같은 PC) */
const scrape = () => new Promise<Record<string, number>>((ok) => {
  http.get({ host: '127.0.0.1', port: server.port, path: '/metrics' }, (res) => {
    let s = ''; res.on('data', (d) => { s += d; });
    res.on('end', () => { const o: Record<string, number> = {}; for (const line of s.split('\n')) { const m = /^(\w+) (\S+)$/.exec(line); if (m) o[m[1]] = Number(m[2]); } ok(o); });
  }).on('error', () => ok({}));
});

/** 게임과 시스템(한 단계 아래까지)이 든 목록의 크기. 엔티티 안의 것은 모아서 */
function sizes(): Record<string, number> {
  const out: Record<string, number> = {};
  const size = (v: unknown): number | null => (v instanceof Map || v instanceof Set ? v.size : Array.isArray(v) ? v.length : null);
  for (const k of Object.keys(g)) {
    const v = g[k];
    const n = size(v);
    if (n !== null) { out[k] = n; continue; }
    if (!v || typeof v !== 'object' || k === 'world' || k === 'nav') continue;
    let keys: string[] = [];
    try { keys = Object.keys(v); } catch { continue; }
    for (const kk of keys) { let n2: number | null = null; try { n2 = size(v[kk]); } catch { /* 자리표 */ } if (n2 !== null) out[`${k}.${kk}`] = n2; }
  }
  let hitters = 0, dots = 0, buffs = 0, dataKeys = 0;
  for (const e of g.ents.values()) { hitters += e.hitters?.size ?? 0; dots += e.dots?.length ?? 0; buffs += e.buffs?.length ?? 0; dataKeys += Object.keys(e.data).length; }
  out['ent.hitters'] = hitters; out['ent.dots'] = dots; out['ent.buffs'] = buffs; out['ent.dataKeys'] = dataKeys;
  return out;
}

const kinds = () => { const o: Record<string, number> = {}; const layers = new Set<number>(); for (const e of g.ents.values()) { o[e.kind] = (o[e.kind] ?? 0) + 1; layers.add(e.layer); } o.layers = layers.size; return o; };
const stat = (a: number[]) => { if (!a.length) return { avg: 0, p95: 0, p99: 0, max: 0, n: 0 }; const s = [...a].sort((x, y) => x - y); return { avg: s.reduce((v, x) => v + x, 0) / s.length, p95: s[Math.floor(s.length * 0.95)], p99: s[Math.floor(s.length * 0.99)], max: s[s.length - 1], n: s.length }; };
const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');

out({ t: 'ready', port: server.port, pid: process.pid, heroes: heroIds.length, squad: (g.has('squad') ? (defs.SQUAD_RULES as { size: number }).size : 0) });

const t0 = performance.now();
let measuring = false, cpu0 = process.cpuUsage(), wire0 = 0, raw0 = 0, m0 = 0;
const windows: Record<string, number>[] = [];
const series: unknown[] = [];
const sample = async () => {
  const el = (performance.now() - t0) / 1000;
  const met = cfg.noMetrics ? { clients: [...g.ents.values()].filter((e: E) => e.kind === 'p' && !e.bot).length, entities: g.ents.size, flushAvg: 0, flushP95: 0, flushMax: 0, lagAvg: 0, lagMax: 0, bytesPerS: 0, msgsPerS: 0 } : server.metrics();
  const om = await scrape();
  const mem = process.memoryUsage();
  const tk = stat(ticks); ticks = [];
  const row = {
    t: 'tick', el: Math.round(el), vt: new Date(vnow()).toISOString(), clients: met.clients, ents: met.entities, kinds: kinds(),
    tick: tk, flush: { avg: met.flushAvg, p95: met.flushP95, max: met.flushMax }, lag: { avg: met.lagAvg, max: met.lagMax },
    kbps: met.bytesPerS / 1024, msgs: met.msgsPerS, wire: om.game_sent_wire_bytes_total ?? 0, raw: om.game_sent_bytes_total ?? 0,
    saveFails: om.game_save_failures_total ?? 0, rssMb: mem.rss / 1048576, heapMb: mem.heapUsed / 1048576, extMb: (mem.external + mem.arrayBuffers) / 1048576,
    sizes: sizes(),
    // 살아 있는 타이머와 핸들 (쌓이는 setTimeout 찾기): process.getActiveResourcesInfo()의 종류별 수
    res: process.getActiveResourcesInfo().reduce((o: Record<string, number>, k) => { o[k] = (o[k] ?? 0) + 1; return o; }, {}),
  };
  series.push(row);
  out(row);
  if (measuring) windows.push({ flushAvg: met.flushAvg, flushP95: met.flushP95, flushMax: met.flushMax, kbps: row.kbps, clients: met.clients, lagAvg: met.lagAvg, lagMax: met.lagMax });
};
const timer = setInterval(() => { void sample(); }, cfg.every * 1000);
setTimeout(async () => {
  // 측정 구간 시작
  measuring = true; tickAll = []; cpu0 = process.cpuUsage(); if (!cfg.noMetrics) server.metrics(); ticks = [];
  const om = await scrape(); wire0 = om.game_sent_wire_bytes_total ?? 0; raw0 = om.game_sent_bytes_total ?? 0; m0 = performance.now();
}, cfg.warmup * 1000);
setTimeout(async () => {
  clearInterval(timer);
  await sample();
  const secs = (performance.now() - m0) / 1000, cpu = process.cpuUsage(cpu0);
  const om = await scrape(), mem = process.memoryUsage();
  const tk = stat(tickAll);
  const avg = (k: string) => windows.reduce((v, w) => v + w[k], 0) / Math.max(1, windows.length);
  const mx = (k: string) => windows.reduce((v, w) => Math.max(v, w[k]), 0);
  const clients = avg('clients');
  const done = {
    t: 'done', game: cfg.game, clients: Math.round(clients), squad: (g.has('squad') ? (defs.SQUAD_RULES as { size: number }).size : 0), kinds: kinds(),
    tick: tk, flush: { avg: avg('flushAvg'), p95: mx('flushP95'), max: mx('flushMax') }, lag: { avg: avg('lagAvg'), max: mx('lagMax') },
    rawKBps: ((om.game_sent_bytes_total ?? 0) - raw0) / 1024 / secs, wireKBps: ((om.game_sent_wire_bytes_total ?? 0) - wire0) / 1024 / secs,
    cpuPct: ((cpu.user + cpu.system) / 1000 / (secs * 1000)) * 100, rssMb: mem.rss / 1048576, heapMb: mem.heapUsed / 1048576,
    saveFails: om.game_save_failures_total ?? 0, secs,
  };
  out(done);
  fs.writeFileSync(path.join(dir, 'series.json'), JSON.stringify(series));
  await server.close();
  store.close?.();
  process.exit(0);
}, (cfg.warmup + cfg.seconds) * 1000);
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
