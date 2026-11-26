// 상태 페이지: 서버가 정적 폴더에 status.json(상태, 마지막 시각, 점검 예정, 접속자 수 대략)을 주기적으로 쓰고, 그것을 읽어 보여 주는 status.html을 둔다.
// 서버가 죽으면 status.json이 더 바뀌지 않는다: 페이지가 '마지막 시각'이 오래된 것을 보고 '응답 없음'으로 보인다.
// 정적 폴더를 다른 곳(정적 호스팅에 올리는 폴더)으로 주면(STATUS_DIR) 게임 서버가 꺼져 있어도 페이지가 남는다 (docs/infra.md '상태 페이지').
// 페이지의 문장은 틀의 언어 파일(engine/client/i18n/ko.ts의 koStatusPage, en.ts의 enStatusPage)에서 넣는다. 페이지는 바깥의 것을 아무것도 읽지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { enStatusPage } from '../../client/i18n/en';
import { koStatusPage } from '../../client/i18n/ko';
import type { MaintView } from '../../shared/defs';
import { log } from '../log';

/** status.json의 모양 */
export interface StatusFile {
  /** ok 정상, maint 점검 중, down 깨끗하게 꺼졌다 */
  state: 'ok' | 'maint' | 'down';
  /** 이 파일을 쓴 시각 (UTC ms) */
  at: number;
  /** 접속자 수를 5명 단위로 둥글린 것 (0이면 0) */
  players: number;
  /** 예고했거나 진행 중인 점검 */
  maint?: MaintView;
  /** 다음에 쓸 때까지의 초 (페이지가 '오래됐다'를 셈한다) */
  every: number;
}
export interface StatusOptions {
  /** 쓸 폴더 (보통 빌드된 화면의 폴더) */
  dir: string;
  /** 쓰는 간격(초). 기본 30 */
  everyS?: number;
}
/** 접속자 수를 대략으로: 5명 단위, 한 명이라도 있으면 5 이상 */
export const roughCount = (n: number): number => (n <= 0 ? 0 : Math.max(5, Math.round(n / 5) * 5));

/** 정적 폴더에 status.json과 status.html을 쓰기 시작한다. write()는 바로 한 번 쓴다 (점검이 바뀌었을 때) */
export function startStatus(opts: StatusOptions, info: () => { players: number; maint: MaintView | null }): { write(state?: StatusFile['state']): void; stop(): void } {
  const every = Math.max(5, opts.everyS ?? 30);
  const jsonFile = path.join(opts.dir, 'status.json'), htmlFile = path.join(opts.dir, 'status.html');
  let failed = false;
  const html = statusHtml();
  /** status.html이 없거나 다르면 쓴다 (화면을 다시 빌드하면 폴더가 비워진다: 다음 쓰기 때 다시 둔다) */
  const page = (): void => {
    try { if (!fs.existsSync(htmlFile) || fs.readFileSync(htmlFile, 'utf8') !== html) { fs.mkdirSync(opts.dir, { recursive: true }); fs.writeFileSync(htmlFile, html); } }
    catch (err) { if (!failed) log.warn('[status] status.html을 쓰지 못했습니다:', err); }
  };
  const write = (state?: StatusFile['state']): void => {
    page();
    try {
      const x = info();
      const body: StatusFile = { state: state ?? (x.maint?.on ? 'maint' : 'ok'), at: Date.now(), players: roughCount(x.players), ...(x.maint ? { maint: x.maint } : {}), every };
      fs.mkdirSync(opts.dir, { recursive: true });
      // 다른 이름으로 쓰고 바꾼다: 읽는 쪽이 반쯤 쓴 파일을 보지 않게
      const tmp = `${jsonFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(body));
      fs.renameSync(tmp, jsonFile);
      failed = false;
    } catch (err) { if (!failed) log.warn('[status] status.json을 쓰지 못했습니다:', err); failed = true; }
  };
  write();
  const timer = setInterval(() => write(), every * 1000);
  timer.unref();
  return { write, stop: () => clearInterval(timer) };
}

/** 상태 페이지 (스스로 서는 HTML 하나: 글꼴·스크립트를 바깥에서 읽지 않는다) */
export function statusHtml(): string {
  const words = JSON.stringify({ ko: koStatusPage, en: enStatusPage }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>status</title>
<style>
:root { color-scheme: light dark; --bg: #f4f1ea; --ink: #1f1d1a; --card: #fffdf8; --line: #d8d2c4; --ok: #2f8a4c; --warn: #b7791f; --bad: #b83a3a; --mute: #6d675c; }
@media (prefers-color-scheme: dark) { :root { --bg: #16181c; --ink: #ece8df; --card: #20242a; --line: #353a42; --ok: #5cc27e; --warn: #e0a84a; --bad: #e06666; --mute: #9a958b; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; display: flex; justify-content: center; padding: 24px 16px; }
main { width: min(480px, 100%); }
h1 { font-size: 20px; margin: 0 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
.state { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; }
.dot { width: 14px; height: 14px; border-radius: 50%; background: var(--mute); flex: none; }
.ok .dot { background: var(--ok); } .maint .dot, .planned .dot { background: var(--warn); } .down .dot { background: var(--bad); }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 14px 0 0; }
dt { color: var(--mute); } dd { margin: 0; }
.msg { margin-top: 12px; } .note { margin-top: 16px; color: var(--mute); font-size: 13px; }
a { color: inherit; }
</style></head>
<body><main><h1 id="title"></h1><div class="card" id="card"><div class="state"><span class="dot"></span><span id="state"></span></div><dl id="facts"></dl><div class="msg" id="msg"></div></div>
<p class="note" id="note"></p><p class="note"><a href="./" id="game"></a></p></main>
<script>
const W = ${words};
const lang = (navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en';
const w = W[lang];
document.documentElement.lang = lang;
document.title = w.title;
const $ = (id) => document.getElementById(id);
$('title').textContent = w.title; $('note').textContent = w.note; $('game').textContent = w.game;
const when = (ms) => new Date(ms).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const pick = (t) => (t ? t[lang] || t.ko || t.en || Object.values(t)[0] || '' : '');
function show(s) {
  const facts = $('facts'); facts.textContent = '';
  const row = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; facts.append(dt, dd); };
  let kind = 'down', msg = '';
  if (!s) { msg = w.missing; }
  else {
    const old = (Date.now() - s.at) / 1000 > Math.max(90, (s.every || 30) * 3);
    kind = s.state === 'down' || old ? 'down' : s.state === 'maint' ? 'maint' : s.maint ? 'planned' : 'ok';
    if (old) msg = w.stale.replace('{n}', String(Math.max(1, Math.round((Date.now() - s.at) / 60000))));
    row(w.checked, when(s.at));
    if (kind === 'ok' || kind === 'planned') row(w.players, w.about.replace('{n}', String(s.players)));
    if (s.maint) { if (!s.maint.on) row(w.start, when(s.maint.at)); if (s.maint.until) row(w.until, when(s.maint.until)); if (!msg) msg = pick(s.maint.text); }
  }
  $('card').className = 'card ' + kind;
  $('state').textContent = w[kind];
  $('msg').textContent = msg;
}
async function load() {
  try { const r = await fetch('./status.json?t=' + Date.now(), { cache: 'no-store' }); show(r.ok ? await r.json() : null); } catch { show(null); }
}
load(); setInterval(load, 30000);
</script></body></html>
`;
}
