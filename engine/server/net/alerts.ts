// 경보 (운영 도구, docs/genre-features.md 5.5): /metrics의 값(./ops.ts의 metricValues)에 임계값 규칙을 걸고, 넘으면 웹훅(설정한 주소)에 알린다.
// 기본은 꺼져 있다: 웹훅 주소를 주지 않으면(ALERT_WEBHOOK) 규칙은 재기만 하고 관리자 명령 alerts로 볼 수 있을 뿐 아무 데도 보내지 않는다. 외부 서비스에 기대지 않는다.
// 같은 경보의 되풀이를 막는다: 한 규칙은 넘은 채로 있는 동안 한 번만 알리고(그 뒤 repeatMin마다 '아직'을 한 번), 내려오면 '풀림'을 한 번 알린다.
// 보내는 몸은 JSON 한 덩어리: { text, rule, metric, value, limit, state: 'firing' | 'still' | 'resolved', at } (text는 Slack·Discord의 들어오는 웹훅이 읽는 칸과 같은 이름: content도 함께 싣는다)
import http from 'node:http';
import https from 'node:https';
import { log } from '../log';

export interface AlertRule {
  /** 규칙의 이름 (영문·숫자·_-) */
  name: string;
  /** 지표 이름 (/metrics의 것: game_tick_ms_p95 …) */
  metric: string;
  op: '>' | '>=' | '<' | '<=';
  value: number;
  /** 이만큼(초) 이어 넘어야 알린다. 기본 0 (재는 즉시) */
  forS?: number;
  /** 늘어나는 수(…_total)에 걸 때: 값 대신 '지난번 잰 뒤로 늘어난 양'을 본다 */
  delta?: boolean;
}
export interface AlertOptions {
  /** 알릴 주소 (http·https). 없으면 보내지 않는다 (기본) */
  webhook?: string;
  /** 규칙. 주지 않으면 DEFAULT_RULES */
  rules?: AlertRule[];
  /** 재는 간격(초). 기본 15 */
  everyS?: number;
  /** 넘은 채로 있을 때 다시 알리는 간격(분). 기본 60. 0이면 다시 알리지 않는다 */
  repeatMin?: number;
}
/** 틀의 기본 규칙: 틱이 밀림, 저장·백업 실패, 통로 밖의 재화 변화(복제 버그의 신호) */
export const DEFAULT_RULES: AlertRule[] = [
  { name: 'tick_slow', metric: 'game_tick_ms_p95', op: '>', value: 40, forS: 60 },
  { name: 'save_fail', metric: 'game_save_failures_total', op: '>', value: 0, delta: true },
  { name: 'backup_fail', metric: 'game_backup_failures_total', op: '>', value: 0, delta: true },
  { name: 'econ_stray', metric: 'game_econ_stray_total', op: '>', value: 0, delta: true },
];

interface State { over: boolean; since: number; sentAt: number; last: number | null; value: number }
export interface AlertView { rule: AlertRule; state: 'ok' | 'pending' | 'firing'; value: number | null; since: number; sentAt: number }
export interface Alerts {
  /** 지금 잰다 (주기와 시험). 보낸 알림의 수 */
  check(): number;
  list(): AlertView[];
  /** 시험 알림 한 번 (웹훅이 있으면) */
  test(by: string): boolean;
  /** 웹훅 주소가 있는가 */
  readonly on: boolean;
  /** 마지막으로 보낸 것의 결과 (관리자가 본다) */
  readonly lastSend: { at: number; ok: boolean; status: number; err?: string } | null;
  stop(): void;
}

const cmp = (op: AlertRule['op'], a: number, b: number): boolean => (op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : a <= b);

/** 규칙의 모양을 본다. 틀린 것은 까닭을 글로 */
export function checkRule(r: unknown): string | null {
  if (typeof r !== 'object' || r === null) return '규칙이 객체가 아닙니다';
  const x = r as Partial<AlertRule>;
  if (typeof x.name !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(x.name)) return 'name은 영문·숫자·_- 40자까지';
  if (typeof x.metric !== 'string' || !/^[a-z_][a-z0-9_]{0,80}$/.test(x.metric)) return `${x.name}: metric이 지표 이름의 꼴이 아닙니다`;
  if (!['>', '>=', '<', '<='].includes(String(x.op))) return `${x.name}: op는 > >= < <=`;
  if (typeof x.value !== 'number' || !Number.isFinite(x.value)) return `${x.name}: value는 수`;
  if (x.forS !== undefined && (typeof x.forS !== 'number' || x.forS < 0)) return `${x.name}: forS는 0 이상의 수`;
  return null;
}

/** 웹훅에 JSON을 보낸다 (5초 안에 답이 없으면 버린다). 결과를 done으로 */
function post(url: string, body: unknown, done: (r: { ok: boolean; status: number; err?: string }) => void): void {
  let u: URL;
  try { u = new URL(url); } catch { done({ ok: false, status: 0, err: 'bad url' }); return; }
  const payload = JSON.stringify(body);
  const lib = u.protocol === 'https:' ? https : u.protocol === 'http:' ? http : null;
  if (!lib) { done({ ok: false, status: 0, err: 'http·https만' }); return; }
  const req = lib.request(u, { method: 'POST', timeout: 5000, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'user-agent': 'game-alerts' } }, (res) => {
    res.resume();
    res.on('end', () => done({ ok: (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0 }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (err) => done({ ok: false, status: 0, err: err.message }));
  req.end(payload);
}

/** 경보를 시작한다. read는 지금의 지표 값(이름 → 값), now는 시계(ms) */
export function startAlerts(opts: AlertOptions, read: () => Record<string, number>, now: () => number = Date.now, label = 'game'): Alerts {
  const rules = (opts.rules ?? DEFAULT_RULES).filter((r) => { const err = checkRule(r); if (err) log.warn(`[alerts] 규칙을 뺐습니다: ${err}`); return !err; });
  const repeatMs = (opts.repeatMin ?? 60) * 60_000;
  const st = new Map<string, State>();
  let lastSend: Alerts['lastSend'] = null;
  const hook = opts.webhook && /^https?:\/\//i.test(opts.webhook) ? opts.webhook : '';
  if (opts.webhook && !hook) log.warn('[alerts] 웹훅 주소는 http:// 또는 https://로 시작해야 합니다. 보내지 않습니다');

  function send(rule: AlertRule, state: 'firing' | 'still' | 'resolved' | 'test', value: number): boolean {
    if (!hook) return false;
    const word = state === 'firing' ? '경보' : state === 'still' ? '경보 이어짐' : state === 'resolved' ? '풀림' : '시험';
    const text = `[${label}] ${word}: ${rule.name} (${rule.metric} ${rule.delta ? '늘어남 ' : ''}${value} ${rule.op} ${rule.value})`;
    post(hook, { text, content: text, rule: rule.name, metric: rule.metric, value, limit: rule.value, state, at: new Date(now()).toISOString() }, (r) => {
      lastSend = { at: now(), ...r };
      if (!r.ok) log.warn(`[alerts] 웹훅에 보내지 못했습니다 (${r.status || r.err})`);
    });
    return true;
  }

  function check(): number {
    const v = read(), t = now();
    let sent = 0;
    for (const rule of rules) {
      const raw = v[rule.metric];
      let s = st.get(rule.name);
      if (!s) st.set(rule.name, s = { over: false, since: 0, sentAt: 0, last: null, value: 0 });
      if (raw === undefined) continue;
      const value = rule.delta ? (s.last === null ? 0 : raw - s.last) : raw;
      s.last = raw; s.value = value;
      const over = cmp(rule.op, value, rule.value);
      if (over) {
        if (!s.over) { s.over = true; s.since = t; }
        const due = t - s.since >= (rule.forS ?? 0) * 1000;
        if (due && !s.sentAt) { s.sentAt = t; if (send(rule, 'firing', value)) sent++; log.warn(`[alerts] 경보: ${rule.name} = ${value}`); }
        else if (due && repeatMs > 0 && t - s.sentAt >= repeatMs) { s.sentAt = t; if (send(rule, 'still', value)) sent++; }
      } else if (s.over) {
        // delta 규칙은 한 번 늘어난 다음 재기에서 곧 내려온다: 알린 것만 '풀림'을 보낸다
        if (s.sentAt && send(rule, 'resolved', value)) sent++;
        if (s.sentAt) log.info(`[alerts] 풀림: ${rule.name}`);
        s.over = false; s.since = 0; s.sentAt = 0;
      }
    }
    return sent;
  }
  const timer = setInterval(() => { try { check(); } catch (err) { log.error('[alerts] 재다가 예외:', err); } }, Math.max(1, opts.everyS ?? 15) * 1000);
  timer.unref();
  return {
    check,
    list: () => rules.map((rule) => { const s = st.get(rule.name); return { rule, state: !s?.over ? 'ok' : s.sentAt ? 'firing' : 'pending', value: s?.last === null || !s ? null : s.value, since: s?.since ?? 0, sentAt: s?.sentAt ?? 0 }; }),
    test: (by) => send({ name: 'test', metric: 'by_' + by.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 20), op: '>', value: 0 }, 'test', 1),
    get on() { return !!hook; },
    get lastSend() { return lastSend; },
    stop: () => clearInterval(timer),
  };
}
