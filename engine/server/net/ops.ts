// 운영자가 서버의 상태를 보는 길: HTTP GET /healthz (JSON), GET /metrics (텍스트).
// 둘 다 같은 PC(localhost)에서 직접 온 요청에만 답한다. 그 밖에는 이 길이 없는 것처럼 화면 파일을 내주는 처리기로 넘긴다(404).
// 터널(cloudflared)은 같은 PC의 프록시라 바깥 사람의 요청도 localhost에서 온 것으로 보인다. 그래서 프록시가 붙이는 머리말(PROXY_HEADERS)이 하나라도 있으면 바깥 요청으로 본다.
// 서버의 통신 계층(server.ts)이 OpsCounters에 수를 쌓고, 이 파일은 그것을 읽어 내보내기만 한다.
import type http from 'node:http';

/** 프록시가 붙이는 머리말. cloudflared는 cf-connecting-ip, cf-ray, x-forwarded-for, cdn-loop를 붙인다 */
export const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'cdn-loop', 'x-forwarded-for', 'x-real-ip', 'forwarded', 'true-client-ip'] as const;

/** 같은 PC에서 직접 온 요청인가: 주소가 루프백이고, 프록시를 거친 흔적이 없다 */
export function isLocalRequest(req: http.IncomingMessage): boolean {
  const a = req.socket.remoteAddress ?? '';
  const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  return loop && PROXY_HEADERS.every((h) => req.headers[h] === undefined);
}

/**
 * 값을 목록에 더하되 max를 넘으면 오래된 반을 버린다: 읽는 쪽이 비워 주지 않아도 끝없이 자라지 않게 (server.ts의 측정 구간 metrics()의 틱·전송·지연 값.
 * 운영에서는 METRICS 로그를 켜지 않으면 아무도 읽지 않아, 예전에는 틱마다 쌓여 하루에 수십 MB가 되었다)
 */
export function pushCapped(a: number[], v: number, max: number): void {
  a.push(v);
  if (a.length > max) a.splice(0, a.length - (max >> 1));
}

/** 틱 시간을 모으는 고리: 최근 n개만 남긴다 (지표 로그의 metrics()와 달리 읽어도 비지 않는다) */
class Ring {
  private a: number[] = []; private i = 0;
  constructor(private n: number) {}
  push(v: number): void { if (this.a.length < this.n) this.a.push(v); else { this.a[this.i] = v; this.i = (this.i + 1) % this.n; } }
  stat(): { avg: number; p95: number; max: number } {
    if (!this.a.length) return { avg: 0, p95: 0, max: 0 };
    const s = [...this.a].sort((x, y) => x - y);
    return { avg: s.reduce((v, x) => v + x, 0) / s.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] };
  }
}

/** 운영 지표의 누적 수. 서버가 켜진 뒤로 쌓인다 */
export class OpsCounters {
  readonly startedAt = Date.now();
  /** 마지막 틱이 끝난 시각(ms) */
  lastTickAt = 0;
  ticks = 0;
  readonly tickMs = new Ring(200);
  /** 보낸 메시지의 글자 수(압축 전)와 개수 */
  rawBytes = 0; msgs = 0;
  /** 닫힌 연결이 실제로 보낸 바이트 (열린 연결의 것은 wireBytes가 더한다) */
  closedWire = 0;
  /** 마지막으로 월드·캐릭터를 함께 저장한 시각(ms). 없으면 0 */
  lastSaveAt = 0;
  saveFails = 0;
  tick(ms: number): void { this.ticks++; this.lastTickAt = Date.now(); this.tickMs.push(ms); }
  sent(bytes: number): void { this.rawBytes += bytes; this.msgs++; }
}

/** 지표를 읽을 때 서버가 채워 주는 지금 값 */
export interface OpsNow {
  clients: number; away: number; entities: number;
  /** 열린 연결의 소켓이 지금까지 실제로 보낸 바이트 (압축 뒤, 머리말 포함) */
  openWire: number;
  backup: { lastAt: number; fails: number } | null;
  compress: boolean;
}

/** 틱이 이만큼 돌지 않았으면 멈춘 것으로 본다 (틱은 50ms마다) */
export const TICK_STALE_MS = 2000;

export function health(c: OpsCounters, now: OpsNow): Record<string, unknown> {
  const t = Date.now(), ticking = c.lastTickAt > 0 && t - c.lastTickAt < TICK_STALE_MS;
  return {
    ok: ticking, ticking, tickAgoMs: c.lastTickAt ? t - c.lastTickAt : null,
    clients: now.clients, away: now.away,
    lastSaveAt: c.lastSaveAt ? new Date(c.lastSaveAt).toISOString() : null, saveAgoS: c.lastSaveAt ? Math.round((t - c.lastSaveAt) / 1000) : null, saveFails: c.saveFails,
    lastBackupAt: now.backup?.lastAt ? new Date(now.backup.lastAt).toISOString() : null,
    upS: Math.round((t - c.startedAt) / 1000), pid: process.pid,
  };
}

/** Prometheus의 텍스트 꼴을 따른 간단한 지표 (이름 값, 한 줄에 하나) */
export function metricsText(c: OpsCounters, now: OpsNow): string {
  const tk = c.tickMs.stat(), mem = process.memoryUsage(), cpu = process.cpuUsage();
  const rows: [string, number, string][] = [
    ['game_up_seconds', Math.round((Date.now() - c.startedAt) / 1000), '켜진 뒤 흐른 시간'],
    ['game_ticks_total', c.ticks, '돈 틱 수'],
    ['game_tick_ms_avg', tk.avg, '최근 200틱의 계산 시간 평균'],
    ['game_tick_ms_p95', tk.p95, '최근 200틱의 계산 시간 95%'],
    ['game_tick_ms_max', tk.max, '최근 200틱의 계산 시간 최대'],
    ['game_clients', now.clients, '접속해 있는 사람'],
    ['game_away', now.away, '주인 없이 사냥 중인 캐릭터'],
    ['game_entities', now.entities, '엔티티 수'],
    ['game_sent_bytes_total', c.rawBytes, '보낸 메시지의 글자 수 (압축 전)'],
    ['game_sent_wire_bytes_total', c.closedWire + now.openWire, '소켓이 실제로 보낸 바이트 (압축 뒤)'],
    ['game_sent_messages_total', c.msgs, '보낸 메시지 수'],
    ['game_save_failures_total', c.saveFails, '월드·캐릭터 저장 실패'],
    ['game_last_save_timestamp_seconds', Math.round(c.lastSaveAt / 1000), '마지막 저장 시각'],
    ['game_backup_failures_total', now.backup?.fails ?? 0, '자동 백업 실패'],
    ['game_compress', now.compress ? 1 : 0, 'perMessageDeflate를 켰는가'],
    ['process_cpu_seconds_total', (cpu.user + cpu.system) / 1e6, '프로세스가 쓴 CPU 시간'],
    ['process_memory_rss_bytes', mem.rss, '메모리 (RSS)'],
  ];
  return rows.map(([k, v, h]) => `# HELP ${k} ${h}\n${k} ${Number.isInteger(v) ? v : v.toFixed(3)}`).join('\n') + '\n';
}

/** /healthz와 /metrics를 맡고, 나머지는 next(화면 파일)에 넘기는 처리기 */
export function opsHandler(c: OpsCounters, now: () => OpsNow, next: http.RequestListener): http.RequestListener {
  return (req, res) => {
    const url = (req.url ?? '').split('?')[0];
    if ((url === '/healthz' || url === '/metrics') && req.method === 'GET' && isLocalRequest(req)) {
      const n = now();
      if (url === '/healthz') {
        const body = health(c, n);
        res.writeHead(body.ok ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
      } else {
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' });
        res.end(metricsText(c, n));
      }
      return;
    }
    next(req, res);
  };
}
