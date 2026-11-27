// 확률 공개의 통신 계층 (odds 모듈): 게임 밖의 공개 페이지(odds.json·odds.html)와 그 HTTP 주소, 관리자 명령(odds·draws).
// 표·버전·이력·추첨 기록은 게임 계층(engine/server/game/systems/odds.ts)에 있고, 여기는 그것을 바깥에 보인다.
//   파일    정적 폴더(상태 페이지와 같은 곳: 보통 빌드된 화면의 폴더, STATUS_DIR이면 거기)에 odds.json과 odds.html을 쓴다.
//           켜질 때와 표·사전 공지가 바뀔 때마다 다시 쓴다 (다른 이름으로 쓰고 바꾼다: 읽는 쪽이 반쯤 쓴 파일을 보지 않게)
//   주소    GET·HEAD /odds.json, /odds.html (정적 파일이 없어도 서버의 메모리에서. STATIC=0이어도). 읽기만: 다른 방법은 405. 캐시하지 않는다
//   페이지  스스로 서는 HTML 하나(바깥의 글꼴·스크립트를 읽지 않는다). odds.json을 읽어 표마다의 단계별 확률·천장·10번 보장·한정·실효 확률, 사전 공지, 변경 이력(전 → 후)을 그린다.
//           문장은 틀의 언어 파일(koOddsPage, enOddsPage), 표·결과의 이름은 odds.json의 names(서버가 내용의 ODDS.names와 게임이 단 g.odds.names로 채운다)
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { enOddsPage } from '../../client/i18n/en';
import { koOddsPage } from '../../client/i18n/ko';
import { HERO_RARITIES, ODDS_RULES, oddsPct, outcomeLabel, parseWhen, rarityDef, type DrawRow, type OddsPublic } from '../../shared/defs';
import type { Game } from '../game/game';
import { langText } from '../game/systems/live';
import { log } from '../log';
import type { Store } from '../store/types';
import { options } from './admin';

/** 공개 페이지의 언어 */
export const ODDS_LANGS = ['ko', 'en'] as const;
/** odds.json의 모양: 공개할 것 + 이름표(언어 → 키 → 글) + 페이지의 제목·운영자 문구 */
export interface OddsFile extends OddsPublic { names: Record<string, Record<string, string>>; title?: Record<string, string>; operator?: Record<string, string> }

/** 게임 계층의 공개 모양에 이름표를 붙인다 */
export function oddsFile(g: Game): OddsFile {
  const pub = g.odds.publicView(), keys = new Set<string>();
  /** 결과 id → 그 이름의 키와 글(영웅의 label: 번역하지 않는 이름). 페이지는 결과 id로 찾는다 */
  const outs = new Map<string, { key: string; text?: string }>();
  for (const t of pub.tables) {
    keys.add(t.name);
    for (const s of t.steps) for (const o of s.outcomes) { if (t.kind !== 'enhance') outs.set(o.id, outcomeLabel(t, o.id)); if (o.r !== undefined) keys.add(rarityDef(o.r).name); }
    if (t.guard) keys.add(t.guard);
    if (t.cost) keys.add(`cur:${t.cost.cur}`);
  }
  if (HERO_RARITIES.length) for (let r = 0; r < HERO_RARITIES.length; r++) keys.add(rarityDef(r).name);
  const names: Record<string, Record<string, string>> = {};
  for (const lang of ODDS_LANGS) {
    const out: Record<string, string> = {}, words = lang === 'ko' ? koOddsPage : enOddsPage;
    const pick = (k: string): string | undefined => ODDS_RULES.names?.[k]?.[lang] ?? g.odds.names?.(lang, k) ?? (words.words as Record<string, string>)[k];
    for (const k of keys) { const v = pick(k); if (v) out[k] = v; }
    for (const [id, l] of outs) { const v = ODDS_RULES.names?.[id]?.[lang] ?? pick(l.key) ?? l.text ?? (l.key !== id ? pick(id) : undefined); if (v) out[id] = v; }
    names[lang] = out;
  }
  return { ...pub, names, ...(ODDS_RULES.title ? { title: { ...ODDS_RULES.title } } : {}), ...(ODDS_RULES.operator ? { operator: { ...ODDS_RULES.operator } } : {}) };
}

/** 공개 페이지 (스스로 서는 HTML 하나: 같은 폴더의 odds.json을 읽는다) */
export function oddsHtml(): string {
  const words = JSON.stringify({ ko: koOddsPage, en: enOddsPage }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>odds</title>
<style>
:root { color-scheme: light dark; --bg: #f4f1ea; --ink: #1f1d1a; --card: #fffdf8; --line: #d8d2c4; --mute: #6d675c; --hi: #8a5a12; --up: #2f8a4c; --down: #b83a3a; }
@media (prefers-color-scheme: dark) { :root { --bg: #16181c; --ink: #ece8df; --card: #20242a; --line: #353a42; --mute: #9a958b; --hi: #e0a84a; --up: #5cc27e; --down: #e06666; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; padding: 20px 16px 40px; }
main { max-width: 760px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 28px 0 10px; } h3 { font-size: 15px; margin: 14px 0 6px; }
.mute { color: var(--mute); font-size: 13px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
.card h2 { margin: 0 0 4px; font-size: 17px; }
.tag { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; font-size: 12px; margin-right: 6px; color: var(--mute); }
table { border-collapse: collapse; width: 100%; margin: 4px 0 8px; }
td, th { padding: 4px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-weight: 600; color: var(--mute); font-size: 13px; }
td.p, th:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rule { margin: 6px 0; padding: 6px 10px; border-left: 3px solid var(--hi); }
.lang { float: right; font-size: 13px; } .lang a { color: inherit; margin-left: 8px; }
.ch .a { color: var(--down); } .ch .b { color: var(--up); }
.scroll { overflow-x: auto; }
</style></head>
<body><main><div class="lang" id="lang"></div><h1 id="title"></h1><p class="mute" id="sub"></p><p id="lead"></p>
<div id="plans"></div><div id="tables"></div><h2 id="hHist"></h2><div class="scroll" id="hist"></div><h2 id="hOp"></h2><p id="op"></p><p class="mute" id="foot"></p></main>
<script>
const W = ${words};
const q = new URLSearchParams(location.search).get('lang');
const lang = q === 'ko' || q === 'en' ? q : (navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en';
const w = W[lang];
document.documentElement.lang = lang;
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const fill = (s, a) => s.replace(/\\{(\\w+)\\}/g, (_, k) => (a[k] !== undefined ? String(a[k]) : ''));
const pct = (p) => (p > 0 && p < 5e-7 ? '<0.0001%' : (Math.round(p * 1e6) / 1e4).toFixed(4).replace(/\\.?0+$/, '') + '%');
const utc = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const local = (ms) => new Date(ms).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const pick = (t) => (t ? t[lang] || t.ko || t.en || Object.values(t)[0] || '' : '');
let N = {};
const nm = (k) => N[k] || k;
const outName = (t, id) => (t.kind === 'enhance' ? (w.words['odds' + id[0].toUpperCase() + id.slice(1)] || id) : nm(id));
const whenText = (x, t) => {
  const r = x.r !== undefined ? rarity(t, x.r) : '';
  const s = x.k === 'base' ? w.base : x.k === 'pity' ? fill(w.pity, { n: x.n, r }) : x.k === 'ten' ? fill(w.ten, { r }) : x.k === 'plus' ? fill(w.plus, { n: x.n }) : fill(w.roll, { n: x.n ?? '' });
  return x.sure ? s + ' · ' + w.sure : s;
};
let RAR = [];
const rarity = (t, r) => (RAR[r] ? nm(RAR[r]) : String(r));
function table(t) {
  const card = el('div', undefined, 'card');
  const head = el('h2', nm(t.name)); card.append(head);
  const tags = el('div');
  tags.append(el('span', w.kinds[t.kind] || t.kind, 'tag'), el('span', fill(w.version, { v: t.version }), 'tag'));
  card.append(tags);
  if (t.cost) card.append(el('p', fill(t.cost.ten ? w.costTen : w.cost, { one: t.cost.one, ten: t.cost.ten, cur: N['cur:' + t.cost.cur] || w.cur[t.cost.cur] || w.curOther }), 'mute'));
  if (t.limited) {
    const l = t.limited, bits = [];
    if (l.from !== undefined) bits.push(fill(w.from, { at: local(l.from) }));
    if (l.to !== undefined) bits.push(fill(w.to, { at: local(l.to) }));
    if (l.total !== undefined) bits.push(fill(w.total, { n: l.total }));
    card.append(el('p', w.limited + ' · ' + bits.join(' · '), 'rule'));
  }
  if (t.pity) card.append(el('p', fill(w.pityRule, { n: t.pity.after, r: t.pity.r !== undefined ? rarity(t, t.pity.r) : '' }), 'rule'));
  if (t.ten) card.append(el('p', fill(w.tenRule, { r: t.ten.r !== undefined ? rarity(t, t.ten.r) : '' }), 'rule'));
  if (t.guard) card.append(el('p', fill(w.guard, { item: nm(t.guard) }), 'rule'));
  for (const s of t.steps) {
    card.append(el('h3', s.when.map((x) => whenText(x, t)).join(' / ') || s.key));
    const tb = el('table'), hr = tb.insertRow();
    for (const h of [w.colOutcome, ...(t.kind === 'enhance' ? [] : [w.colRarity]), w.colP]) hr.append(el('th', h));
    for (const o of s.outcomes) {
      const tr = tb.insertRow();
      tr.insertCell().textContent = outName(t, o.id);
      if (t.kind !== 'enhance') tr.insertCell().textContent = o.r !== undefined ? rarity(t, o.r) : '';
      const c = tr.insertCell(); c.className = 'p'; c.textContent = pct(o.p);
    }
    const wrap = el('div', undefined, 'scroll'); wrap.append(tb); card.append(wrap);
  }
  if (t.effective && t.effective.length) {
    card.append(el('h3', w.effective), el('p', w.effectiveNote, 'mute'));
    const tb = el('table');
    for (const o of t.effective) { const tr = tb.insertRow(); tr.insertCell().textContent = outName(t, o.id); tr.insertCell().textContent = o.r !== undefined ? rarity(t, o.r) : ''; const c = tr.insertCell(); c.className = 'p'; c.textContent = pct(o.p); }
    card.append(tb);
  }
  return card;
}
function show(d) {
  N = (d && d.names && (d.names[lang] || d.names.ko)) || {};
  RAR = (d && d.rarities) || [];
  const title = (d && pick(d.title)) || w.title;
  document.title = title; $('title').textContent = title;
  $('lang').textContent = '';
  for (const l of ['ko', 'en']) { const a = el('a', l === 'ko' ? '한국어' : 'English'); a.href = '?lang=' + l; $('lang').append(a); }
  if (!d) { $('sub').textContent = w.missing; return; }
  $('sub').textContent = fill(w.made, { at: utc(d.at), local: local(d.at) });
  $('lead').textContent = w.lead;
  const plans = $('plans'); plans.textContent = '';
  if (d.plans.length) {
    plans.append(el('h2', w.plans));
    for (const p of d.plans) { const c = el('div', undefined, 'card'); c.append(el('b', nm((d.tables.find((t) => t.id === p.table) || {}).name || p.table)), el('p', fill(w.planAt, { at: utc(p.at), local: local(p.at) }), 'mute'), el('p', pick(p.text))); plans.append(c); }
  }
  const box = $('tables'); box.textContent = '';
  if (!d.tables.length) box.append(el('p', w.none));
  for (const t of d.tables) box.append(table(t));
  $('hHist').textContent = w.history;
  const hist = $('hist'); hist.textContent = '';
  if (!d.history.length) hist.append(el('p', w.noHistory, 'mute'));
  else {
    const tb = el('table'), hr = tb.insertRow();
    for (const h of [w.colAt, w.colTable, w.colVer, w.colWhy, w.colChange]) hr.append(el('th', h));
    for (const h of d.history) {
      const tr = tb.insertRow(), t = d.tables.find((x) => x.id === h.table);
      tr.insertCell().textContent = utc(h.at);
      tr.insertCell().textContent = t ? nm(t.name) : h.table;
      tr.insertCell().textContent = 'v' + h.ver;
      tr.insertCell().textContent = h.why === 'boot' ? w.whyBoot : h.why === 'auto' ? w.whyAuto : h.why.startsWith('live:') ? w.whyLive : h.why === 'admin' ? w.whyAdmin : h.why;
      const c = tr.insertCell(); c.className = 'ch';
      if (h.gone) c.textContent = w.gone;
      else if (!h.changes || !h.changes.length) c.textContent = h.ver === 1 ? w.first : '';
      else for (const x of h.changes) {
        const line = el('div');
        line.append(el('span', (t && t.kind === 'enhance' ? '' : '') + (x.step + ' · ' + (t ? outName(t, x.id) : x.id) + ': ')), el('span', x.a === null ? '-' : pct(x.a), 'a'), el('span', ' → '), el('span', x.b === null ? '-' : pct(x.b), 'b'));
        c.append(line);
      }
    }
    hist.append(tb);
  }
  $('hOp').textContent = w.operator;
  $('op').textContent = pick(d.operator) || w.operatorEmpty;
  $('foot').textContent = w.foot;
}
fetch('./odds.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(show, () => show(null));
</script></body></html>
`;
}

/** 폴더에 odds.json과 odds.html을 쓴다 (다른 이름으로 쓰고 바꾼다) */
function writeFiles(dir: string, json: string, html: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of [['odds.json', json], ['odds.html', html]] as const) {
    const file = path.join(dir, name), tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
  }
}

export interface OddsWeb {
  /** GET /odds.json·/odds.html이면 답하고 true */
  route(req: http.IncomingMessage, res: http.ServerResponse): boolean;
  /** 지금 다시 쓴다 */
  publish(): void;
  /** 관리자 명령 (net/admin.ts의 명령표 끝에 더해진다) */
  admin: Record<string, (a: string[], by: string) => string>;
}

/**
 * 공개 페이지와 관리자 명령을 켠다. dir을 주면 그 폴더에 파일도 쓴다 (주지 않으면 주소로만).
 * people: 이름으로 사람을 찾을 때 지금 월드에 있는 사람 (저장된 사람은 store.keyOfName)
 */
export function createOddsWeb(g: Game, store: Store, dir: string | null, people: () => { name: string; key: string | null }[]): OddsWeb {
  const html = oddsHtml();
  let json = '', failed = false;
  const make = (): string => (json = JSON.stringify({ ...oddsFile(g), rarities: HERO_RARITIES.map((_, r) => rarityDef(r).name) }));
  const publish = (): void => {
    make();
    if (!dir) return;
    try { writeFiles(dir, json, html); failed = false; }
    catch (err) { if (!failed) log.warn('[odds] 공개 페이지를 쓰지 못했습니다:', err); failed = true; }
  };
  g.odds.onChange.push(publish);
  // 켜질 때: 첫 틱에서 버전을 맞춘 뒤에 쓴다 (그 전에 쓰면 버전 0이 나간다)
  // 그 뒤로는 30초마다 파일이 있는지만 본다: 화면을 다시 빌드하면 폴더가 비워진다 (상태 페이지와 같은 까닭)
  let first = true, acc = 0;
  g.ticks.push((dt) => {
    if (first) { first = false; publish(); return; }
    if ((acc += dt) < 30) return;
    acc = 0;
    if (dir && !fs.existsSync(path.join(dir, 'odds.json'))) publish();
  });

  const route = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
    const p = (req.url ?? '').split('?')[0];
    if (p !== '/odds.json' && p !== '/odds.html') return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }).end(); return true; }
    const body = p === '/odds.html' ? html : json || make();
    res.writeHead(200, { 'content-type': p === '/odds.html' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };

  /** 이름이나 저장 키의 앞부분으로 저장 키를 찾는다 */
  const keyOf = (who: string): string | null => {
    const on = people().find((x) => x.name.toLowerCase() === who.toLowerCase());
    if (on?.key) return on.key;
    try { const k = store.keyOfName(who); if (k) return k; } catch { /* 없다고 본다 */ }
    return /^[0-9a-f]{6,}$/i.test(who) ? who : null;
  };
  const utc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const drawLine = (r: DrawRow) => `#${r.n ?? '-'} ${utc(r.at)}  ${r.owner ? r.owner.slice(0, 10) : '(손님)'}  ${r.kind}  ${r.table} v${r.ver}  [${r.steps.join(',')}] → ${r.got.join(', ')}${r.cost ? `  (${r.cost.cur} ${r.cost.n}${r.cost.kinds && Object.keys(r.cost.kinds).length ? ` = ${Object.entries(r.cost.kinds).map(([k, v]) => `${k} ${v}`).join(' + ')}` : ''})` : ''}`;

  const admin: Record<string, (a: string[], by: string) => string> = {
    odds: (a, by) => {
      const sub = a[0] ?? '';
      if (sub === '' || sub === 'list') {
        const list = g.odds.tables();
        if (!list.length) return '공개하는 표가 없습니다.';
        return list.map((t) => `${t.id}  ${t.kind}  v${t.version}  단계 ${t.steps.length}${t.pity ? `  천장 ${t.pity.after}번째` : ''}${t.limited ? '  한정' : ''}`).join('\n') + '\n쓰는 법: odds show 표 | odds log [표] [수] | odds check | odds plan 표 시각 --ko 글 [--en 글] | odds plans | odds plan cancel 번호 | odds publish';
      }
      if (sub === 'show') {
        const t = g.odds.tables().find((x) => x.id === a[1]);
        if (!t) return `표가 없습니다: ${a[1] ?? ''} (odds 로 목록)`;
        return [`${t.id} (${t.kind}) v${t.version}`, ...t.steps.flatMap((s) => [`  [${s.key}]`, ...s.outcomes.map((o) => `    ${o.id}${o.r !== undefined ? ` (등급 ${o.r})` : ''}  ${oddsPct(o.p)}`)]),
          ...(t.pity ? [`  천장: ${t.pity.after}번째는 ${t.pity.step}`] : []), ...(t.ten ? [`  10번 보장: 열째는 ${t.ten.step}`] : [])].join('\n');
      }
      if (sub === 'log') {
        const n = Number(a[2] ?? a[1]);
        const table = a[1] && !/^\d+$/.test(a[1]) ? a[1] : null;
        const rows = g.odds.history(table, Number.isInteger(n) && n > 0 ? Math.min(n, 500) : 20);
        if (!rows.length) return '이력이 없습니다.';
        return rows.map((h) => `${utc(h.at)}  ${h.table} v${h.ver}  ${h.why}${h.after === null ? '  (없어짐)' : ''}`).join('\n');
      }
      if (sub === 'check') { const n = g.odds.refresh('admin'); return n ? `바뀐 표 ${n}개의 버전을 올렸습니다.` : '바뀐 표가 없습니다.'; }
      if (sub === 'publish') { publish(); return dir ? `다시 썼습니다: ${path.join(dir, 'odds.html')}` : '다시 만들었습니다 (파일을 쓸 폴더가 없어 주소 /odds.html로만 보입니다).'; }
      if (sub === 'plans') {
        const rows = g.odds.plans();
        if (!rows.length) return '사전 공지가 없습니다.';
        return rows.map((r) => `[${r.n}] ${r.state}  ${r.table}  적용 ${utc(r.at)}  (${r.by}, ${utc(r.made)})  ${Object.entries(r.text).map(([k, v]) => `${k}: ${v}`).join(' / ')}`).join('\n');
      }
      if (sub === 'plan') {
        if (a[1] === 'cancel' || a[1] === 'done') { const n = Number(a[2]); return Number.isInteger(n) && g.odds.setPlan(n, a[1] === 'cancel' ? 'cancel' : 'done') ? `사전 공지 [${n}]을(를) ${a[1] === 'cancel' ? '거뒀습니다' : '끝났다고 적었습니다'}.` : `없는 번호입니다: ${a[2] ?? ''}`; }
        const { pos, o } = options(a.slice(1), [], ['ko', 'en']);
        const table = pos[0] ?? '', at = parseWhen(pos.slice(1).join(' '), g.now(), g.time.cal), text = langText({ ...(o.ko ? { ko: o.ko } : {}), ...(o.en ? { en: o.en } : {}) });
        if (!table || at === null || !text) return '쓰는 법: odds plan 표 시각(+3d, 2026-12-01 09:00) --ko 글 [--en 글]';
        if (!g.odds.tables().some((t) => t.id === table) && !g.odds.build(table)) return `표가 없습니다: ${table}`;
        const n = g.odds.plan(table, at, text, by);
        return `사전 공지 [${n}]: ${table}, 적용 ${utc(at)}. 공개 페이지에 나옵니다 (바꾸는 일은 set으로 그때 한다).`;
      }
      return '쓰는 법: odds | odds show 표 | odds log [표] [수] | odds check | odds plan 표 시각 --ko 글 [--en 글] | odds plans | odds plan cancel|done 번호 | odds publish';
    },
    draws: (a) => {
      const { pos, o } = options(a, [], ['table', 'n', 'since']);
      const n = o.n ? Number(o.n) : 20;
      const since = o.since ? parseWhen(o.since, g.now(), g.time.cal) : undefined;
      if (pos[0] === 'stats') {
        // 그 표의 결과가 실제로 나온 비율과 지금 표의 확률 (큰 수로 굴렸을 때 둘이 가까워야 한다)
        const id = pos[1] ?? o.table;
        if (!id) return '쓰는 법: draws stats 표 [--since 시각]';
        const rows = g.odds.draws({ table: id, ...(since !== undefined && since !== null ? { since } : {}), limit: 1_000_000 });
        const t = g.odds.tables().find((x) => x.id === id);
        const by = new Map<string, Map<string, number>>();
        for (const r of rows) r.steps.forEach((s, i) => { const m = by.get(s) ?? new Map<string, number>(); by.set(s, m); const k = (r.got[i] ?? '').replace(/:guard$/, ''); m.set(k, (m.get(k) ?? 0) + 1); });
        if (!by.size) return `기록이 없습니다: ${id}`;
        return [...by].map(([step, m]) => {
          const all = [...m.values()].reduce((x, y) => x + y, 0), st = t?.steps.find((s) => s.key === step);
          return [`[${step}] ${all}번`, ...[...m].sort((x, y) => y[1] - x[1]).map(([k, c]) => `  ${k}  ${oddsPct(c / all)}  (표 ${st ? oddsPct(st.outcomes.find((x) => x.id === k)?.p ?? 0) : '?'})`)].join('\n');
        }).join('\n');
      }
      const who = pos[0];
      const owner = who ? keyOf(who) : undefined;
      if (who && !owner) return `사람을 찾지 못했습니다: ${who}`;
      const rows = g.odds.draws({ ...(owner ? { owner } : {}), ...(o.table ? { table: o.table } : {}), ...(since !== undefined && since !== null ? { since } : {}), limit: Number.isInteger(n) && n > 0 ? Math.min(n, 1000) : 20 });
      if (!rows.length) return '추첨 기록이 없습니다.';
      return rows.map(drawLine).join('\n');
    },
  };
  return { route, publish, admin };
}
