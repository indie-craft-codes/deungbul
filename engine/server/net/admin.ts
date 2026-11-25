// 관리자 통로: 운영자가 같은 PC에서 CLI(scripts/admin.mjs, npm run admin)로 보내는 명령을 받는 HTTP 주소(POST /admin).
// 제재와 지급의 규칙은 게임의 시스템(engine/server/game/systems/sanctions.ts)에 있고, 여기는 명령을 읽고, 막고, 기록한다.
//
// 막는 것 (모두 통과해야 명령을 받는다):
//   1. 같은 PC에서 온 연결만 (127.0.0.1, ::1)
//   2. 터널을 지난 요청이 아닐 것: cloudflared 터널도 같은 PC에서 들어오므로 주소만으로는 가릴 수 없다.
//      터널과 프록시가 붙이는 머리(CF-Connecting-IP, CF-Ray, X-Forwarded-For, Forwarded …)가 하나라도 있으면 거절한다
//   3. 브라우저가 보낸 요청이 아닐 것: Origin, Referer, Sec-Fetch-* 머리가 있으면 거절한다 (같은 PC에서 연 웹 페이지가 대신 보내지 못하게).
//      본문은 application/json이어야 하고 토큰은 따로 된 머리로 온다: 브라우저는 미리 묻는 요청(preflight) 없이 이런 요청을 보낼 수 없고, 여기는 그것에 답하지 않는다
//   4. 관리자 토큰: 서버가 켜질 때 저장 파일 옆에 무작위 토큰 파일(admin.token)을 새로 만든다. CLI가 그것을 읽어 X-Admin-Token 머리에 싣는다
// 1~3에 걸리면 정적 파일에 없는 주소와 똑같이 404로 답한다 (밖에서는 이 주소가 있는지도 알 수 없게).
//
// 기록: 모든 명령(읽기만 하는 것도)을 누가(by, 보낸 곳) 무엇을(명령, 인자) 언제 했는지 남긴다. 끄는 설정은 없다.
//   명령을 처리하기 전에 기록 파일(admin-audit.log, 한 줄에 JSON 하나)에 먼저 적고, 적지 못하면 명령을 처리하지 않는다. 결과도 한 줄 더 적는다.
//   끝부분은 월드 저장에도 남는다 (g.sanctions.log, audit 명령으로 본다). 저장 파일이 없는 서버(시험)는 파일 없이 월드 저장에만 남긴다.
//
// 명령 (CLI의 도움말과 docs/making-a-game.md의 운영 절에 같은 목록이 있다):
//   who | find 이름 | ban 이름 기간 [사유] | unban 이름 | banip 주소 기간 [사유] | unbanip 주소 | mute 이름 기간 [사유] | unmute 이름
//   kick 이름 [사유] | announce [--chat] 글 | give 이름 무엇 수 | take 이름 무엇 수 | reports [수] [--all] | resolve 신고id [메모] | audit [수]
//   기간: 숫자(시간), 30m·12h·7d처럼 단위를 붙인 것, 또는 perm(영구)
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { ServerMsg } from '../../shared/protocol';
import type { Ent } from '../game/entity';
import type { Game } from '../game/game';
import { Sanctions, normIp, type AuditRow } from '../game/systems/sanctions';
import { CURS } from '../game/systems/wallet';
import type { ReportSave, Store } from '../store/types';

/** 토큰 파일과 기록 파일의 이름 (저장 파일과 같은 폴더) */
export const TOKEN_FILE = 'admin.token';
export const AUDIT_FILE = 'admin-audit.log';
/** CLI가 토큰을 싣는 머리 */
export const TOKEN_HEADER = 'x-admin-token';
/** 터널과 프록시가 붙이는 머리: 하나라도 있으면 같은 PC의 터널을 지나 바깥에서 온 요청으로 본다 */
export const FORWARD_HEADERS = ['cf-connecting-ip', 'cf-ray', 'cf-ipcountry', 'cf-visitor', 'cf-worker', 'cdn-loop', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded', 'true-client-ip', 'via'];
/** 브라우저가 붙이는 머리 */
const BROWSER_HEADERS = ['origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'];
const BODY_MAX = 8192;

/** 관리자 통로의 설정. startServer의 opts.admin */
export interface AdminOptions {
  /** 토큰 파일과 기록 파일을 둘 폴더 (보통 저장 파일의 폴더). 없으면 파일을 쓰지 않는다 */
  dir?: string;
  /** 토큰을 정해 준다 (시험). 없으면 켜질 때마다 무작위로 만든다 */
  token?: string;
}

/**
 * 관리자 통로를 켤 기본 폴더. 틀의 runServer(engine/server/index.ts가 감싼 것)가 저장 파일의 폴더를 여기에 알린다.
 * startServer를 직접 부르는 쪽(시험)은 opts.admin으로 준다
 */
let defaultDir: string | undefined;
export function setAdminDir(dir: string | undefined): void { defaultDir = dir; }

/** 관리자 통로가 통신 계층에서 빌려 쓰는 것 (server.ts가 채운다) */
export interface AdminHost {
  game: Game; store: Store;
  /** 지금 월드에 있는 사람: 접속해 있거나 자리 비움 사냥 중인 캐릭터 */
  people(): { name: string; key: string | null; ip: string; ent: Ent; away: boolean }[];
  /** 그 저장 키나 주소(normIp로 다듬은 것)의 연결을 안내문과 함께 끊고(code), 자리 비움 사냥 중인 캐릭터도 내보낸다. 끊은 수를 돌려준다 */
  drop(by: { key?: string; ip?: string }, code: number, k: MsgKey, ...a: MsgArg[]): number;
  broadcast(msg: ServerMsg): void;
  /** 월드와 바뀐 캐릭터를 지금 저장한다 */
  save(): void;
}

/** 연결을 끊는 이유 (클라이언트가 이것을 보고 다시 붙을지 정한다: engine/client/main.ts) */
export const CLOSE = { handedOff: 4001, kicked: 4002, banned: 4003 } as const;

export interface Admin {
  /** 이 요청이 관리자 통로의 것이면 처리하고 true. 아니면 false (정적 파일로 넘긴다) */
  route(req: http.IncomingMessage, res: http.ServerResponse): boolean;
  /** 명령을 처리한다 (HTTP를 거치지 않고: 시험). 기록은 똑같이 남는다 */
  run(cmd: string, args: string[], by: string, from: string): { ok: boolean; out: string };
  /** 지금 토큰 (시험) */
  readonly token: string;
  close(): void;
}

/** 기간을 ms로: perm(영구) → 0, 숫자 → 시간, 30m·12h·7d. 읽지 못하면 null */
export function parseSpan(raw: string | undefined): number | null {
  if (!raw) return null;
  if (/^(perm|permanent|영구|0)$/i.test(raw)) return 0;
  const m = /^(\d+(?:\.\d+)?)([mhd]?)$/i.exec(raw);
  if (!m) return null;
  const v = Number(m[1]), unit = m[2].toLowerCase();
  const ms = v * (unit === 'm' ? 60000 : unit === 'd' ? 86400000 : 3600000);
  return ms > 0 && ms <= 3650 * 86400000 ? Math.round(ms) : null;
}
/** 신고의 id: 접수 시각(36진)과 신고한 사람·당한 사람으로 만든다 (저장소가 번호를 내어 주지 않으므로) */
export function reportId(r: ReportSave): string {
  let h = 0;
  for (const ch of `${r.by}>${r.target}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${r.at.toString(36)}${(h % 1296).toString(36).padStart(2, '0')}`;
}
const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const spanText = (until: number): string => (until === 0 ? '영구' : `${when(until)}까지`);
/** 기록 파일과 화면에 넣는 글: 제어 문자를 뺀다 */
const safe = (s: string, max = 200): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);

export function createAdmin(host: AdminHost, opts: AdminOptions = {}): Admin {
  const g = host.game, store = host.store, S = g.sanctions;
  const dir = opts.dir ?? defaultDir;
  const token = opts.token ?? randomBytes(24).toString('hex');
  let tokenFile = '';
  let auditFile = '';
  if (dir) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      tokenFile = path.join(dir, TOKEN_FILE);
      fs.writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
      auditFile = path.join(dir, AUDIT_FILE);
    } catch (err) { console.error('[admin] 관리자 토큰 파일을 만들지 못했습니다. 관리자 통로를 닫습니다:', err); tokenFile = ''; }
  }
  /** 관리자 통로가 열려 있는가: 토큰을 받았거나 토큰 파일을 만들었다 */
  const open = !!opts.token || !!tokenFile;

  /** 기록 파일에 한 줄 적는다. 파일이 없는 서버면 그냥 true */
  function write(row: Record<string, unknown>): boolean {
    if (!auditFile) return true;
    try { fs.appendFileSync(auditFile, JSON.stringify(row) + '\n'); return true; }
    catch (err) { console.error('[admin] 관리자 기록을 적지 못했습니다:', err); return false; }
  }

  /** 이름으로 사람을 찾는다: 지금 월드에 있는 사람이 먼저, 없으면 저장된 캐릭터 */
  function find(name: string): { name: string; key: string | null; ip: string; ent: Ent | null } | null {
    const low = name.toLowerCase();
    const on = host.people().find((x) => x.name.toLowerCase() === low);
    if (on) return { name: on.name, key: on.key, ip: on.ip, ent: on.ent };
    const key = store.keyOfName(name);
    if (!key) return null;
    return { name: store.loadPlayer(key)?.name ?? name, key, ip: '', ent: null };
  }
  const short = (key: string | null): string => (key ? key.slice(0, 10) : '손님');
  const need = (cond: boolean, msg: string): void => { if (!cond) throw new Usage(msg); };

  const COMMANDS: Record<string, (a: string[], by: string) => string> = {
    who: () => {
      const list = host.people();
      if (!list.length) return '접속한 사람이 없습니다.';
      return [`${list.length}명`, ...list.map((x) => `  ${x.name}  Lv${x.ent.lv} ${x.ent.cls || '-'}  ${x.away ? '(자리 비움 사냥) ' : ''}주소 ${x.ip || '-'}  키 ${short(x.key)}${S.muted(x.key, x.ip) ? '  [말 막힘]' : ''}`)].join('\n');
    },
    find: (a) => {
      need(a.length >= 1, 'find 이름');
      const t = find(a[0]);
      if (!t) return `'${a[0]}' 이름의 캐릭터가 없습니다.`;
      const save = t.key ? store.loadPlayer(t.key) : null, ban = S.banned(t.key, ''), mute = S.muted(t.key, t.ip), pend = t.key ? S.pending.get(t.key)?.length ?? 0 : 0;
      return [
        `${t.name}  키 ${short(t.key)}  ${t.ent ? `접속 중 (주소 ${t.ip || '-'})` : '접속하지 않음'}`,
        save ? `  저장: Lv${save.lv} ${save.cls || '-'} 골드 ${save.gold ?? 0}${save.seen ? `  마지막 저장 ${when(save.seen)}` : ''}` : '  저장된 캐릭터 없음',
        ban ? `  차단: ${spanText(ban.until)} · ${ban.why || '사유 없음'} (${ban.by}, ${when(ban.at)})` : '  차단: 없음',
        mute ? `  말 막기: ${spanText(mute.until)} · ${mute.why || '사유 없음'}` : '  말 막기: 없음',
        pend ? `  다음 접속 때 줄 것: ${pend}건` : '',
      ].filter(Boolean).join('\n');
    },
    ban: (a, by) => {
      need(a.length >= 2, 'ban 이름 기간(시간 수, 30m·12h·7d, perm) [사유]');
      const span = parseSpan(a[1]);
      need(span !== null, `기간을 읽지 못했습니다: ${a[1]}`);
      const t = find(a[0]);
      if (!t) return `'${a[0]}' 이름의 캐릭터가 없습니다.`;
      if (!t.key) return `${t.name}은(는) 손님(저장되지 않는 캐릭터)이라 이름으로 막을 수 없습니다. 주소로 막으세요: banip ${t.ip}`;
      const s = S.ban('k:' + t.key, span!, a.slice(2).join(' '), by, t.name);
      const n = host.drop({ key: t.key }, CLOSE.banned, 'banned', Sanctions.minutesLeft(s, g.now()));
      return `${t.name}을(를) 막았습니다: ${spanText(s.until)}${s.why ? ` · ${s.why}` : ''}${n ? ` (연결 ${n}개를 끊음)` : ''}`;
    },
    unban: (a) => {
      need(a.length >= 1, 'unban 이름');
      const t = find(a[0]);
      if (!t?.key) return `'${a[0]}' 이름의 저장된 캐릭터가 없습니다.`;
      return S.unban('k:' + t.key) ? `${t.name}의 차단을 풀었습니다.` : `${t.name}은(는) 막혀 있지 않습니다.`;
    },
    banip: (a, by) => {
      need(a.length >= 2, 'banip 주소 기간 [사유]');
      need(/^[0-9a-fA-F:.]{2,45}$/.test(a[0]), `주소 모양이 아닙니다: ${a[0]}`);
      const span = parseSpan(a[1]);
      need(span !== null, `기간을 읽지 못했습니다: ${a[1]}`);
      const ip = normIp(a[0]);
      const s = S.ban('i:' + ip, span!, a.slice(2).join(' '), by);
      const n = host.drop({ ip }, CLOSE.banned, 'banned', Sanctions.minutesLeft(s, g.now()));
      return `주소 ${a[0]}을(를) 막았습니다: ${spanText(s.until)}${n ? ` (연결 ${n}개를 끊음)` : ''}`;
    },
    unbanip: (a) => {
      need(a.length >= 1, 'unbanip 주소');
      return S.unban('i:' + normIp(a[0])) ? `주소 ${a[0]}의 차단을 풀었습니다.` : `주소 ${a[0]}은(는) 막혀 있지 않습니다.`;
    },
    mute: (a, by) => {
      need(a.length >= 2, 'mute 이름 기간 [사유]');
      const span = parseSpan(a[1]);
      need(span !== null, `기간을 읽지 못했습니다: ${a[1]}`);
      const t = find(a[0]);
      if (!t) return `'${a[0]}' 이름의 캐릭터가 없습니다.`;
      // 손님은 저장 키가 없으므로 지금 접속한 주소로 막는다
      const target = t.key ? 'k:' + t.key : t.ip ? 'i:' + normIp(t.ip) : '';
      if (!target) return `${t.name}을(를) 가리킬 열쇠가 없습니다.`;
      const s = S.mute(target, span!, a.slice(2).join(' '), by, t.name);
      if (t.ent) g.notify(t.ent, 'muted', Sanctions.minutesLeft(s, g.now()));
      return `${t.name}의 말을 막았습니다: ${spanText(s.until)}${t.key ? '' : ` (손님이라 주소 ${t.ip}로)`}`;
    },
    unmute: (a) => {
      need(a.length >= 1, 'unmute 이름');
      const t = find(a[0]);
      if (!t) return `'${a[0]}' 이름의 캐릭터가 없습니다.`;
      const had = (t.key ? S.unmute('k:' + t.key) : false) || (t.ip ? S.unmute('i:' + normIp(t.ip)) : false);
      return had ? `${t.name}의 말 막기를 풀었습니다.` : `${t.name}은(는) 말이 막혀 있지 않습니다.`;
    },
    kick: (a) => {
      need(a.length >= 1, 'kick 이름 [사유]');
      const t = find(a[0]);
      if (!t?.ent) return `'${a[0]}' 이름의 사람이 지금 월드에 없습니다.`;
      const n = t.key ? host.drop({ key: t.key }, CLOSE.kicked, 'kicked') : host.drop({ ip: t.ip }, CLOSE.kicked, 'kicked');
      return n ? `${t.name}을(를) 내보냈습니다.` : `${t.name}의 연결을 찾지 못했습니다.`;
    },
    announce: (a) => {
      const chat = a[0] === '--chat', text = safe((chat ? a.slice(1) : a).join(' ').trim(), 200);
      need(text.length > 0, 'announce [--chat] 글');
      host.broadcast({ t: 'sys', k: chat ? 'adminChat' : 'adminNotice', a: [text] });
      return `${chat ? '대화창' : '가운데 알림'}으로 알렸습니다: ${text}`;
    },
    give: (a, by) => grant(a, by, 1),
    take: (a, by) => grant(a, by, -1),
    reports: (a) => {
      const all = a.includes('--all'), n = Math.min(500, Math.max(1, Number(a.find((x) => /^\d+$/.test(x)) ?? 20)));
      const list = store.reports(all ? n : n * 5).filter((r) => all || !S.resolved.has(reportId(r))).slice(0, n);
      if (!list.length) return all ? '신고가 없습니다.' : '처리하지 않은 신고가 없습니다. (모두 보려면 --all)';
      return list.map((r) => {
        const id = reportId(r), done = S.resolved.get(id);
        return [`[${id}] ${when(r.at)}  ${r.by} → ${r.target}${done ? `  (처리함: ${done.by}${done.note ? ` · ${done.note}` : ''})` : ''}`, ...r.lines.map((l) => `    ${safe(l, 120)}`)].join('\n');
      }).join('\n');
    },
    resolve: (a, by) => {
      need(a.length >= 1, 'resolve 신고id [메모]');
      const hit = store.reports(2000).find((r) => reportId(r) === a[0]);
      if (!hit) return `신고 ${a[0]}을(를) 찾지 못했습니다 (reports --all로 id를 보세요).`;
      S.resolve(a[0], by, a.slice(1).join(' '));
      return `신고 ${a[0]} (${hit.by} → ${hit.target})를 처리했다고 표시했습니다.`;
    },
    audit: (a) => {
      const n = Math.min(300, Math.max(1, Number(a[0] ?? 20) || 20));
      return S.log.slice(-n).map((r) => `${when(r.at)}  ${r.by}@${r.from}  ${r.cmd} ${r.args.join(' ')}  → ${r.ok ? '' : '[실패] '}${r.out.split('\n')[0]}`).join('\n') || '기록이 없습니다.';
    },
  };

  function grant(a: string[], by: string, sign: 1 | -1): string {
    need(a.length >= 3, `${sign > 0 ? 'give' : 'take'} 이름 무엇(${CURS.join(', ')}, 아이템 id) 수`);
    const what = a[1], n = Number(a[2]);
    need(Sanctions.canGrant(what), `모르는 것입니다: ${what} (${CURS.join(', ')} 또는 아이템 id)`);
    need(Number.isInteger(n) && n > 0 && n <= 1e9, `수는 1 이상의 정수여야 합니다: ${a[2]}`);
    const t = find(a[0]);
    if (!t) return `'${a[0]}' 이름의 캐릭터가 없습니다.`;
    if (t.ent) {
      const done = S.apply(t.ent, what, sign * n);
      return done ? `${t.name}에게 ${what} ${done > 0 ? '+' : ''}${done} (요청 ${sign > 0 ? '+' : '-'}${n})` : `${t.name}에게 ${what}을(를) ${sign > 0 ? '주지' : '거두지'} 못했습니다 (한도가 찼거나 가진 것이 없습니다).`;
    }
    if (!t.key) return `${t.name}은(는) 저장되지 않는 캐릭터입니다.`;
    if (!S.queue(t.key, what, sign * n, by)) return `${t.name}에게 미뤄 둔 것이 너무 많습니다.`;
    return `${t.name}은(는) 접속해 있지 않습니다. 다음 접속 때 ${what} ${sign > 0 ? '+' : '-'}${n}을(를) 적용합니다 (거둘 때는 가진 만큼만).`;
  }

  function run(cmd: string, args: string[], by: string, from: string): { ok: boolean; out: string } {
    const at = Date.now(), who = safe(by || '?', 40), src = safe(from || '?', 60), clean = args.slice(0, 40).map((x) => safe(String(x), 200));
    const name = safe(cmd, 20);
    // 처리하기 전에 기록 파일에 먼저 적는다. 적지 못하면 하지 않는다
    if (!write({ at, by: who, from: src, cmd: name, args: clean, phase: 'start' })) return { ok: false, out: '관리자 기록을 적지 못해 명령을 처리하지 않았습니다.' };
    let ok = true, out: string;
    const fn = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (!fn) { ok = false; out = `모르는 명령입니다: ${name} (${Object.keys(COMMANDS).join(', ')})`; }
    else {
      try { out = fn(clean, who); }
      catch (err) { ok = false; out = err instanceof Usage ? `쓰는 법: ${err.message}` : `처리 중 오류: ${String(err)}`; if (!(err instanceof Usage)) console.error('[admin] 명령 처리 중 예외:', err); }
    }
    const row: AuditRow = { at, by: who, from: src, cmd: name, args: clean, ok, out: safe(out.split('\n')[0], 400) };
    write({ ...row, phase: 'done' });
    S.audit(row);
    console.log(`[admin] ${who}@${src} ${name} ${clean.join(' ')} → ${row.out}`);
    try { host.save(); } catch (err) { console.error('[admin] 저장 실패:', err); }
    return { ok, out };
  }

  const tokenBuf = Buffer.from(token);
  const goodToken = (v: unknown): boolean => {
    if (typeof v !== 'string') return false;
    const b = Buffer.from(v);
    return b.length === tokenBuf.length && timingSafeEqual(b, tokenBuf);
  };
  const reply = (res: http.ServerResponse, status: number, body?: unknown) => {
    if (body === undefined) { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(status === 404 ? 'not found' : ''); return; }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
  };

  function route(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const p = (req.url ?? '').split('?')[0];
    if (p !== '/admin' && p !== '/admin/') return false;
    const addr = req.socket.remoteAddress ?? '';
    const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    const h = req.headers;
    // 바깥(터널, 프록시, 브라우저)에서 온 것은 이 주소가 없는 것처럼 답한다
    if (!open || !local || FORWARD_HEADERS.some((k) => k in h) || BROWSER_HEADERS.some((k) => k in h) || req.method !== 'POST') { req.resume(); reply(res, 404); return true; }
    if (!goodToken(h[TOKEN_HEADER])) { req.resume(); console.warn(`[admin] 토큰이 맞지 않는 요청을 거절했습니다 (${addr})`); reply(res, 401, { ok: false, out: '관리자 토큰이 맞지 않습니다.' }); return true; }
    if (!String(h['content-type'] ?? '').startsWith('application/json')) { req.resume(); reply(res, 415, { ok: false, out: 'application/json으로 보내 주세요.' }); return true; }
    let size = 0, over = false;
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > BODY_MAX) { over = true; req.destroy(); } else parts.push(c); });
    req.on('end', () => {
      if (over) return;
      let body: { cmd?: unknown; args?: unknown; by?: unknown };
      try { body = JSON.parse(Buffer.concat(parts).toString('utf8')) as typeof body; } catch { reply(res, 400, { ok: false, out: '본문이 JSON이 아닙니다.' }); return; }
      const args = Array.isArray(body.args) ? body.args.map(String) : [];
      reply(res, 200, run(typeof body.cmd === 'string' ? body.cmd : '', args, typeof body.by === 'string' ? body.by : '?', addr));
    });
    req.on('error', () => { /* 끊긴 요청은 버린다 */ });
    return true;
  }

  return {
    route, run, token,
    close: () => {
      // 다음에 켜질 때 새 토큰을 만든다: 꺼진 서버의 토큰을 남겨 두지 않는다 (같은 서버가 쓴 것일 때만 지운다)
      try { if (tokenFile && fs.readFileSync(tokenFile, 'utf8').trim() === token) fs.rmSync(tokenFile, { force: true }); } catch { /* 이미 없다 */ }
    },
  };
}

/** 쓰는 법이 틀린 명령 */
class Usage extends Error {}
