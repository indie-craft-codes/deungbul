// 웹 출시의 바탕, 서버 쪽 (docs/genre-features.md 5.2): 탭 숨김(자리 비움), 약관 동의 기록, 내 데이터 내보내기·삭제, 화면 오류 수집.
// 통신 계층(server.ts)이 메시지(handle)와 HTTP 주소(route)를 이쪽에 먼저 보이고, 관리자 명령(admin)을 관리자 통로에 더한다.
// 모두 사람이 그 일을 할 때만 움직인다: 화면이 보내지 않으면(예전 화면, 봇, 황금 실행) 아무것도 바뀌지 않는다.
//
//   vis      탭·앱을 숨겼다/보였다 → 다른 사람에게 자리 비움(afk)을 알리고, 게임에 playerVisible 사건
//   consent  약관(LEGAL)의 동의한 버전을 묻고 적는다 (저장 키 단위. 손님은 적지 않는다)
//   mydata   export 내 데이터를 JSON으로, erase 삭제 요청(PRIVACY.eraseDays 뒤 실행), cancel 거두기, status 상태
//   POST /client-error  화면 오류 묶음 (속도·크기 제한, 개인정보를 빼고, 같은 오류는 한 줄로 센다) → 관리자 명령 errors
//
// 삭제의 규칙(다른 사람과 얽힌 것): 캐릭터 저장과 동의 기록은 지운다. 길드·거래소·맡아 둔 우편·기기 옮기기는 그 시스템이 정한 대로(engine/server/game/personal.ts).
// 신고 기록은 이름과 키를 지우고 줄은 남긴다(제재 근거). 차단·말 막기는 저장 키의 해시로 남기되 이름을 지운다(지우고 다시 만들어 제재를 피하지 못하게). 관리자 감사 기록은 그대로다.
import { createHash } from 'node:crypto';
import type http from 'node:http';
import { LEGAL, PRIVACY } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { ServerMsg } from '../../shared/protocol';
import type { Ent } from '../game/entity';
import type { Game } from '../game/game';
import { personalData } from '../game/personal';
import { log } from '../log';
import { hasWeb, type ClientErrorRow, type EraseRow, type Store, type WebStore } from '../store';

/** 삭제가 실행되어 연결을 끊는 닫힘 코드 (화면은 토큰을 지우고 첫 화면으로: engine/client/main.ts) */
export const ERASED_CLOSE = 4010;
/** 화면 오류를 받는 주소 */
export const ERROR_PATH = '/client-error';
const ERR_BODY_MAX = 8192;
/** 화면 오류 묶음을 이만큼까지 둔다 (넘으면 오래된 것부터) */
const ERR_KEEP = 500;
/** 주소마다: 한꺼번에 10건, 그 뒤로는 10초에 1건. 서버 전체: 한꺼번에 60건, 그 뒤로는 초당 1건 */
const ERR_IP_BURST = 10, ERR_IP_PER_S = 0.1, ERR_ALL_BURST = 60, ERR_ALL_PER_S = 1;
/** 내보내기는 저장 키마다 30초에 한 번, 삭제 요청·취소는 5초에 한 번 */
const EXPORT_GAP_MS = 30_000, ERASE_GAP_MS = 5_000;
const DAY_MS = 86_400_000;

/** 통신 계층의 연결 가운데 이쪽이 읽는 것 */
export interface WebClient { key: string | null; ent: Ent | null; ip: string }
/** 이쪽이 통신 계층에서 빌려 쓰는 것 (server.ts가 채운다) */
export interface WebHost {
  game: Game; store: Store; now: () => number;
  send(c: WebClient, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  /** 그 저장 키의 연결을 안내문과 함께 끊고 자리 비움 사냥 중인 캐릭터도 내보낸다 (끊기 전에 저장한다) */
  drop(by: { key: string }, code: number, k: MsgKey, ...a: MsgArg[]): number;
  /** 지금 접속해 있는 연결 */
  clients(): Iterable<WebClient>;
  /** 월드와 바뀐 캐릭터를 지금 저장한다 */
  save(): void;
}
export interface Web {
  /** 이쪽의 메시지면 처리하고 true (접속 절차를 마친 연결만) */
  handle(c: WebClient, e: Ent, m: Record<string, unknown>): boolean;
  /** 연결이 끊긴다 (캐릭터를 내보내기 전에) */
  left(c: WebClient): void;
  /** 이쪽의 HTTP 주소면 처리하고 true */
  route(req: http.IncomingMessage, res: http.ServerResponse): boolean;
  /** 때가 된 삭제 요청을 실행한다 (서버가 주기적으로, 켜질 때 한 번). 실행한 수 */
  sweep(): number;
  /** 관리자 명령 (net/admin.ts의 명령표 끝에 더해진다) */
  admin: Record<string, (a: string[], by: string) => string>;
  close(): void;
}

// ---------- 화면 오류: 개인정보 빼기와 묶기 (시험이 직접 부른다) ----------
/** 글에서 개인정보가 될 수 있는 것을 뺀다: 주소의 쿼리·조각과 호스트(사설 주소가 들어 있을 수 있다), 긴 16진(토큰), 이메일, IP, 긴 숫자 */
export function scrub(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/(?:https?|wss?|file|blob|chrome-extension|moz-extension):\/\/[^/\s)]*/gi, '') // 주소의 앞(프로토콜·호스트)을 빼고 경로만
    .replace(/([^\s?#)]*)[?#][^\s)]*/g, '$1') // 쿼리·조각
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d{6,}/g, '<n>');
}
/** 브라우저를 이름·큰 버전·기기 종류로만 줄인다 (예: 'Chrome 142 Windows') */
export function shortUa(ua: string): string {
  const pick = (re: RegExp): string | null => { const m = re.exec(ua); return m ? m[1] : null; };
  const b = pick(/(Edg)\/\d/) ? `Edge ${pick(/Edg\/(\d+)/)}` : pick(/(OPR)\/\d/) ? `Opera ${pick(/OPR\/(\d+)/)}` : pick(/(Firefox)\/\d/) ? `Firefox ${pick(/Firefox\/(\d+)/)}`
    : pick(/(Chrome)\/\d/) ? `Chrome ${pick(/Chrome\/(\d+)/)}` : pick(/(Safari)\/\d/) ? `Safari ${pick(/Version\/(\d+)/) ?? ''}`.trim() : 'other';
  const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux|CrOS/.test(ua) ? 'Linux' : '';
  return `${b}${os ? ' ' + os : ''}${/Mobile/.test(ua) && os !== 'iPhone' && os !== 'Android' ? ' mobile' : ''}`;
}
const KINDS = new Set(['error', 'rejection', 'webgl', 'report']);
/**
 * 받은 본문(JSON)을 한 줄로 다듬는다. 모양이 아니면 null.
 * 서명(sig): 종류 + 숫자를 지운 문장 + 첫 스택 줄의 파일·함수(빌드마다 바뀌는 파일 이름의 해시와 줄·칸 번호는 뺀다) → 같은 오류는 빌드가 바뀌어도 한 줄로 모인다
 */
export function errorRow(body: unknown, ua: string, now: number): ClientErrorRow | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? scrub(v).slice(0, max) : '');
  const kind = typeof b.kind === 'string' && KINDS.has(b.kind) ? b.kind : null;
  const msg = str(b.msg, 300).trim();
  if (!kind || !msg) return null;
  const stack = (typeof b.stack === 'string' ? scrub(b.stack) : '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12).join('\n').slice(0, 2000);
  const at = str(b.at, 200);
  const frame = (stack.split('\n').find((l) => /\.(m?js|ts)\b/.test(l)) ?? at)
    .replace(/-[A-Za-z0-9_-]{6,}(\.m?js)/g, '$1').replace(/:\d+(:\d+)?/g, '').trim();
  const norm = msg.replace(/\d+(\.\d+)?/g, '#').replace(/'[^']{0,80}'|"[^"]{0,80}"/g, '…');
  const sig = createHash('sha1').update(`${kind}|${norm}|${frame}`).digest('hex').slice(0, 12);
  const n = typeof b.n === 'number' && Number.isInteger(b.n) && b.n > 0 ? Math.min(b.n, 1000) : 1;
  return { sig, kind, msg, stack: stack || at, where: str(b.where, 120), build: str(b.build, 80), ua: shortUa(ua.slice(0, 400)), n, first: now, last: now };
}

/** 대화량 통처럼: 남은 양과 마지막으로 채운 시각 */
interface Bucket { left: number; at: number }
function take(b: Bucket, now: number, burst: number, perS: number): boolean {
  b.left = Math.min(burst, b.left + ((now - b.at) / 1000) * perS);
  b.at = now;
  if (b.left < 1) return false;
  b.left--;
  return true;
}
const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export function createWeb(host: WebHost): Web {
  const g = host.game, store = host.store;
  const ws: (Store & WebStore) | null = hasWeb(store) ? store : null;
  /** 숨긴 연결 → 그 엔티티 번호 */
  const hidden = new Map<WebClient, number>();
  /** 처음 vis를 보낸 연결 (그때 지금 자리 비움인 사람의 목록을 준다) */
  const told = new WeakSet<WebClient>();
  const lastExport = new Map<string, number>(), lastErase = new Map<string, number>();
  const ipBuckets = new Map<string, Bucket>(), all: Bucket = { left: ERR_ALL_BURST, at: host.now() };
  const sys = (k: MsgKey, ...a: MsgArg[]): ServerMsg => ({ t: 'sys', k, a });

  function vis(c: WebClient, e: Ent, on: boolean): void {
    const was = hidden.has(c);
    if (!told.has(c)) {
      told.add(c);
      const ids = [...hidden.values()].filter((id) => id !== e.id);
      if (ids.length) host.send(c, { t: 'afk', ids, on: true });
    }
    if (on === !was) return; // 바뀐 것이 없다
    if (on) hidden.delete(c); else hidden.set(c, e.id);
    host.broadcast({ t: 'afk', ids: [e.id], on: !on });
    g.fire('playerVisible', e, on);
  }

  function consent(c: WebClient, m: Record<string, unknown>): void {
    if (m.a === 'ask') { host.send(c, { t: 'consent', v: c.key && ws ? ws.consent(c.key)?.v ?? null : null }); return; }
    if (m.a !== 'agree' || !LEGAL || m.v !== LEGAL.version) return;
    if (c.key && ws) { try { ws.setConsent(c.key, LEGAL.version, host.now()); } catch (err) { log.error('[web] 동의 기록 실패:', err); } }
    host.send(c, { t: 'consent', v: LEGAL.version });
  }

  /** 그 저장 키의 데이터 모두: 캐릭터 저장(접속 중이면 지금 값), 동의, 삭제 요청, 월드에 둔 몫(길드·거래소·우편), 제재, 신고(남의 대화는 빼고) */
  function exportOf(key: string, e: Ent | null): Record<string, unknown> {
    const now = host.now();
    const save = e ? g.players.export(e) : store.loadPlayer(key);
    const world: Record<string, unknown> = {};
    for (const p of personalData(g)) { try { const v = p.get(key); if (v !== undefined) world[p.name] = v; } catch (err) { log.error(`[web] 내보내기 ${p.name} 실패:`, err); } }
    const S = g.sanctions, ban = S.bans.get('k:' + key), mute = S.mutes.get('k:' + key);
    const reports = ws ? ws.reportsOf(key).map((r) => (r.byKey === key ? { at: r.at, role: 'reporter' } : { at: r.at, role: 'reported', lines: r.lines })) : [];
    return {
      format: 'mydata/1', exportedAt: new Date(now).toISOString(), key,
      save, consent: ws?.consent(key) ?? null, erase: ws?.eraseOf(key) ?? null, world,
      sanctions: { ban: ban ? { until: ban.until, why: ban.why, at: ban.at } : null, mute: mute ? { until: mute.until, why: mute.why, at: mute.at } : null },
      reports,
    };
  }

  function state(c: WebClient): void {
    const r = c.key && ws ? ws.eraseOf(c.key) : null;
    host.send(c, { t: 'mydata', a: 'state', due: r && r.state === 'wait' ? r.due : null, days: PRIVACY.eraseDays });
  }

  function mydata(c: WebClient, e: Ent, m: Record<string, unknown>): void {
    if (m.a === 'status') { state(c); return; }
    if (!c.key || !ws) { host.send(c, sys('mydataGuest')); return; }
    const now = host.now(), key = c.key;
    if (m.a === 'export') {
      const wait = EXPORT_GAP_MS - (now - (lastExport.get(key) ?? -Infinity));
      if (wait > 0) { host.send(c, sys('mydataWait', Math.ceil(wait / 1000))); return; }
      lastExport.set(key, now);
      host.send(c, { t: 'mydata', a: 'export', data: exportOf(key, e) });
      return;
    }
    if (m.a !== 'erase' && m.a !== 'cancel') return;
    if (now - (lastErase.get(key) ?? -Infinity) < ERASE_GAP_MS) { host.send(c, sys('mydataWait', Math.ceil(ERASE_GAP_MS / 1000))); return; }
    lastErase.set(key, now);
    const had = ws.eraseOf(key);
    if (m.a === 'erase') {
      if (had?.state !== 'wait') {
        const days = Math.max(0, PRIVACY.eraseDays);
        ws.putErase({ key, name: e.name, asked: now, due: now + days * DAY_MS, state: 'wait', done: 0 });
        log.info(`[web] 삭제 요청: ${e.name} (${days}일 뒤)`);
        host.send(c, sys('eraseAsked', days));
      }
    } else if (had?.state === 'wait') {
      ws.putErase({ ...had, state: 'cancel', done: now });
      log.info(`[web] 삭제 요청 취소: ${e.name}`);
      host.send(c, sys('eraseCanceled'));
    }
    state(c);
  }

  /** 지금 지운다: 연결을 끊고(그 전에 저장된다), 월드의 몫을 규칙대로 지우고, 캐릭터 저장·동의를 지우고, 신고의 이름을 지우고, 기록을 남긴다 */
  function eraseNow(key: string, why: string): string {
    if (!ws) return '이 저장소는 삭제를 지원하지 않습니다.';
    const name = ws.eraseOf(key)?.name ?? store.loadPlayer(key)?.name ?? '?';
    const n = host.drop({ key }, ERASED_CLOSE, 'erased');
    for (const p of personalData(g)) { try { p.erase(key); } catch (err) { log.error(`[web] 삭제 ${p.name} 실패:`, err); } }
    const S = g.sanctions;
    for (const map of [S.bans, S.mutes]) { const s = map.get('k:' + key); if (s) s.name = ''; }
    S.pending.delete(key);
    g.saveDirty = true;
    const now = host.now(), row = ws.eraseOf(key);
    const done: EraseRow = { key, name: '', asked: row?.asked ?? now, due: row?.due ?? now, state: 'done', done: now };
    let reports = 0;
    store.transaction(() => { ws.deletePlayer(key); reports = ws.anonymizeReports(key); ws.putErase(done); });
    host.save();
    log.info(`[web] 데이터를 지웠습니다: ${name} (${why}${n ? `, 연결 ${n}개를 끊음` : ''}, 신고 ${reports}건의 이름을 지움)`);
    return `${name}의 데이터를 지웠습니다 (${why}${n ? `, 연결 ${n}개를 끊음` : ''}, 신고 ${reports}건의 이름을 지움).`;
  }

  function sweep(): number {
    if (!ws) return 0;
    const now = host.now();
    let n = 0;
    for (const r of ws.erasePending()) {
      if (r.due > now) break;
      try { eraseNow(r.key, '유예가 끝남'); n++; } catch (err) { log.error('[web] 삭제 실행 실패:', err); }
    }
    return n;
  }

  // ---------- 화면 오류 ----------
  function route(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const p = (req.url ?? '').split('?')[0];
    if (p !== ERROR_PATH) return false;
    // 화면만 따로 올린 곳(다른 출처)에서도 보낼 수 있게: 본문은 text/plain이라 미리 묻는 요청이 없지만, 와도 답한다
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
    if (req.method === 'OPTIONS') { req.resume(); res.writeHead(204, cors).end(); return true; }
    if (req.method !== 'POST') { req.resume(); res.writeHead(405, cors).end(); return true; }
    const now = host.now();
    const direct = req.socket.remoteAddress ?? '', local = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
    const fwd = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
    const ip = (local && typeof fwd === 'string' && fwd ? fwd.split(',')[0].trim() : direct) || '?';
    let b = ipBuckets.get(ip);
    if (!b) ipBuckets.set(ip, b = { left: ERR_IP_BURST, at: now });
    if (!ws || !take(b, now, ERR_IP_BURST, ERR_IP_PER_S) || !take(all, now, ERR_ALL_BURST, ERR_ALL_PER_S)) { req.resume(); res.writeHead(429, cors).end(); return true; }
    let size = 0, over = false;
    const parts: Buffer[] = [];
    if (Number(req.headers['content-length'] ?? 0) > ERR_BODY_MAX) { req.resume(); res.writeHead(413, cors).end(); return true; }
    // 길이를 밝히지 않고 크게 보내면 읽기만 하고 버린다 (8KB를 넘는 것은 모으지 않는다)
    req.on('data', (c: Buffer) => { size += c.length; if (size > ERR_BODY_MAX) { over = true; parts.length = 0; } else parts.push(c); });
    req.on('end', () => {
      if (over) { res.writeHead(413, cors).end(); return; }
      let body: unknown = null;
      try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { /* 모양이 아니다 */ }
      const row = errorRow(body, String(req.headers['user-agent'] ?? ''), now);
      if (!row) { res.writeHead(400, cors).end(); return; }
      try { ws.addClientError(row, ERR_KEEP); } catch (err) { log.error('[web] 화면 오류 기록 실패:', err); }
      res.writeHead(204, cors).end();
    });
    req.on('error', () => { /* 끊긴 요청은 버린다 */ });
    return true;
  }

  // ---------- 관리자 명령 ----------
  const findKey = (who: string): { key: string; name: string } | null => {
    if (!who) return null;
    const on = [...host.clients()].find((c) => c.ent && c.key && c.ent.name.toLowerCase() === who.toLowerCase());
    if (on?.key) return { key: on.key, name: on.ent!.name };
    const key = store.keyOfName(who);
    if (key) return { key, name: store.loadPlayer(key)?.name ?? who };
    if (/^[0-9a-f]{6,64}$/i.test(who) && ws) { const r = ws.erasePending().find((x) => x.key.startsWith(who.toLowerCase())); if (r) return { key: r.key, name: r.name }; }
    return null;
  };
  const admin: Record<string, (a: string[], by: string) => string> = {
    errors: (a) => {
      if (!ws) return '이 저장소는 화면 오류를 적지 않습니다.';
      if (a[0] === 'clear') {
        if (!a[1]) return '쓰는 법: errors clear 서명|all';
        return `화면 오류 묶음 ${ws.clearClientErrors(a[1])}개를 지웠습니다.`;
      }
      const n = Math.min(200, Math.max(1, Number(a.find((x) => /^\d+$/.test(x)) ?? 20)));
      const full = a.includes('--all');
      const list = ws.clientErrors(n);
      if (!list.length) return '받은 화면 오류가 없습니다.';
      return [`화면 오류 묶음 ${list.length}개 (최근 순)`, ...list.map((r) => [
        `[${r.sig}] ${r.n}회  ${r.kind}  ${r.msg.slice(0, 160)}`,
        `    ${r.where || '-'} · ${r.build || '-'} · ${r.ua || '-'} · 처음 ${when(r.first)} · 마지막 ${when(r.last)}`,
        ...r.stack.split('\n').slice(0, full ? 12 : 3).map((l) => `    ${l.slice(0, 160)}`),
      ].join('\n'))].join('\n');
    },
    erase: (a) => {
      if (!ws) return '이 저장소는 삭제를 지원하지 않습니다.';
      const sub = a[0] ?? 'list';
      if (sub === 'list') {
        const list = ws.erasePending();
        if (!list.length) return '기다리는 삭제 요청이 없습니다.';
        return [`기다리는 삭제 요청 ${list.length}건`, ...list.map((r) => `  ${r.name}  키 ${r.key.slice(0, 10)}  요청 ${when(r.asked)}  실행 ${when(r.due)}`)].join('\n');
      }
      if (sub === 'log') {
        const n = Math.min(500, Math.max(1, Number(a[1] ?? 30) || 30));
        const list = ws.eraseLog(n);
        return list.length ? list.map((r) => `  ${r.state === 'done' ? '지움' : r.state === 'cancel' ? '취소' : '기다림'}  키 ${r.key.slice(0, 10)}  요청 ${when(r.asked)}${r.done ? `  ${r.state === 'done' ? '실행' : '취소'} ${when(r.done)}` : `  실행 예정 ${when(r.due)}`}${r.name ? `  (${r.name})` : ''}`).join('\n') : '기록이 없습니다.';
      }
      if (sub === 'sweep') return `때가 된 삭제 요청 ${sweep()}건을 실행했습니다.`;
      const t = findKey(a[1] ?? '');
      if (sub === 'ask') {
        if (!t) return `쓰는 법: erase ask 이름 [일수] (캐릭터를 찾지 못했습니다: ${a[1] ?? ''})`;
        const days = a[2] !== undefined && /^\d+$/.test(a[2]) ? Number(a[2]) : PRIVACY.eraseDays, now = host.now();
        ws.putErase({ key: t.key, name: t.name, asked: now, due: now + days * DAY_MS, state: 'wait', done: 0 });
        return `${t.name}의 삭제 요청을 받았습니다: ${when(now + days * DAY_MS)}에 지웁니다 (erase cancel ${t.name}로 거둠).`;
      }
      if (sub === 'cancel') {
        const r = t ? ws.eraseOf(t.key) : null;
        if (!t || r?.state !== 'wait') return `기다리는 삭제 요청을 찾지 못했습니다: ${a[1] ?? ''}`;
        ws.putErase({ ...r, state: 'cancel', done: host.now() });
        return `${t.name}의 삭제 요청을 거뒀습니다.`;
      }
      if (sub === 'now') {
        if (!t) return `쓰는 법: erase now 이름|키앞 (찾지 못했습니다: ${a[1] ?? ''})`;
        return eraseNow(t.key, '관리자가 곧바로');
      }
      return '쓰는 법: erase [list] | erase log [수] | erase ask 이름 [일수] | erase cancel 이름 | erase now 이름|키앞 | erase sweep';
    },
  };

  return {
    handle(c, e, m) {
      if (m.t === 'vis') { if (typeof m.on === 'boolean') vis(c, e, m.on); return true; }
      if (m.t === 'consent') { consent(c, m); return true; }
      if (m.t === 'mydata') { mydata(c, e, m); return true; }
      return false;
    },
    left(c) {
      const id = hidden.get(c);
      if (id !== undefined) { hidden.delete(c); host.broadcast({ t: 'afk', ids: [id], on: false }); }
    },
    route, sweep, admin,
    close() { hidden.clear(); },
  };
}
