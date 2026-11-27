// 웹 관리 화면의 페이지 (GET /admin/ui: 관리자 통로 net/admin.ts가 같은 PC에서 연 요청에만 낸다). 빌드가 필요 없는 HTML 한 장이다: 바깥의 것을 아무것도 읽지 않는다.
// 페이지는 관리자 통로의 같은 명령을 POST /admin/api로 보낸다 (권한 검사는 admin.ts의 roleFor 한 곳). 명령이 돌려준 값(data)이 있으면 표로, 없으면 글(out)을 그대로 보인다.
// 문장은 틀의 언어 파일(engine/client/i18n/ko.ts의 koAdminPage, en.ts의 enAdminPage)에서 넣는다. 명령의 결과 글은 서버의 말(한국어) 그대로다.
// 토큰: 주소의 # 뒤(#t=…: 서버로 가지 않는다)로 받거나 칸에 넣는다. 그 탭의 sessionStorage에만 두고, 읽은 뒤 주소에서 지운다.
import { enAdminPage } from '../../client/i18n/en';
import { koAdminPage } from '../../client/i18n/ko';

const STYLE = String.raw`
:root { color-scheme: light dark; --bg: #f6f5f2; --fg: #1d1d1f; --mute: #666; --line: #d9d6cf; --card: #fff; --acc: #2f6fd6; --bad: #c0392b; --good: #23864a; --warn: #b7791f; }
@media (prefers-color-scheme: dark) { :root { --bg: #17181b; --fg: #ececec; --mute: #9a9a9a; --line: #34363b; --card: #202226; --acc: #6ea1ff; --bad: #ff7a6b; --good: #5ccf8a; --warn: #f0b75a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--card); position: sticky; top: 0; z-index: 2; }
header h1 { font-size: 17px; margin: 0; margin-right: auto; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 10px; border: 1px solid var(--line); color: var(--mute); }
.badge.full { color: var(--bad); border-color: var(--bad); } .badge.ops { color: var(--warn); border-color: var(--warn); } .badge.view { color: var(--good); border-color: var(--good); }
nav { display: flex; gap: 4px; padding: 8px 16px; overflow-x: auto; border-bottom: 1px solid var(--line); }
nav button { white-space: nowrap; }
nav button.on { background: var(--acc); color: #fff; border-color: var(--acc); }
main { padding: 12px 16px 40px; max-width: 1200px; }
button, input, select, textarea { font: inherit; color: inherit; }
button { padding: 5px 11px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
button.bad { color: var(--bad); border-color: var(--bad); }
input, select, textarea { padding: 5px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); min-width: 0; }
textarea { width: 100%; min-height: 70px; }
h2 { font-size: 15px; margin: 18px 0 8px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.tile b { display: block; font-size: 22px; }
.tile span { color: var(--mute); font-size: 12px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; background: var(--card); }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: top; }
th { color: var(--mute); font-weight: 600; font-size: 12px; }
td.wrap { white-space: normal; min-width: 220px; }
tr.hot td { color: var(--bad); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
pre { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; margin: 8px 0; }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.note { color: var(--mute); font-size: 12px; margin: 4px 0; }
.bad { color: var(--bad); } .good { color: var(--good); } .warn { color: var(--warn); }
#login { max-width: 460px; margin: 40px auto; }
#login input { width: 100%; margin: 8px 0; }
@media (max-width: 600px) { header h1 { font-size: 16px; } main { padding: 10px 12px 40px; } .tile b { font-size: 19px; } }
`;

/** 페이지의 스크립트. 템플릿 문자열(`)과 ${를 쓰지 않는다 (이 파일의 String.raw 안에 든다) */
const SCRIPT = String.raw`
'use strict';
const D = __DICT__;
const store = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } return null; };
let lang = 'ko';
try { lang = localStorage.getItem('adminLang') || ((navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en'); } catch (e) { lang = 'ko'; }
if (!D[lang]) lang = 'ko';
const T = (k, n) => String((D[lang][k] !== undefined ? D[lang][k] : k)).replace('{n}', n === undefined ? '' : String(n));
let token = store('adminToken') || '';
const hm = /(?:^|&)t=([0-9a-f]{16,128})/.exec(location.hash.slice(1));
if (hm) { token = hm[1]; store('adminToken', token); history.replaceState(null, '', location.pathname); }
let role = '', tab = store('adminTab') || 'home';
const RANK = { view: 0, ops: 1, full: 2 };
const can = (r) => RANK[role] >= RANK[r];
const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') { for (const ev in v) e.addEventListener(ev, v[ev]); }
    else if (k === 'cls') e.className = v;
    else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const when = (ms) => (ms ? new Date(ms).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const num = (v) => (typeof v === 'number' ? v.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US') : String(v));

async function api(cmd, args) {
  let r;
  try { r = await fetch('/admin/api', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ cmd: cmd, args: args || [] }) }); }
  catch (e) { throw new Error(T('noReach')); }
  if (r.status === 401) { logout(T('badToken')); throw new Error(T('badToken')); }
  if (!r.ok) throw new Error(T('noReach') + ' (' + r.status + ')');
  const b = await r.json();
  if (b.role) role = b.role;
  return b;
}
/** 명령을 보내고 결과 글을 그 자리에 보인다. 성공하면 then을 부른다 */
async function act(cmd, args, box, then) {
  try { const b = await api(cmd, args); if (box) { box.textContent = ''; box.append(h('pre', { cls: b.ok ? '' : 'bad' }, (b.ok ? '' : T('failed') + ': ') + b.out)); } if (b.ok && then) then(b); return b; }
  catch (e) { if (box) { box.textContent = ''; box.append(h('pre', { cls: 'bad' }, String(e.message || e))); } return null; }
}
function table(cols, rows, hot) {
  const head = h('tr', null, cols.map((c) => h('th', { cls: c.num ? 'num' : '' }, T(c.t))));
  const body = rows.map((r) => h('tr', { cls: hot && hot(r) ? 'hot' : '' }, cols.map((c) => { const v = c.v(r); return h('td', { cls: c.num ? 'num' : c.wrap ? 'wrap' : '' }, v instanceof Node ? v : v === undefined || v === null || v === '' ? '-' : String(v)); })));
  return h('div', { cls: 'scroll' }, h('table', null, h('thead', null, head), h('tbody', null, body.length ? body : h('tr', null, h('td', { colSpan: cols.length, cls: 'note' }, T('empty'))))));
}
const pct = (c) => (c ? c.n + ' (' + c.pct + '%)' : '-');

// ---------- 탭 ----------
const TABS = {
  async home(el) {
    const [who, al, fl, mt, tk] = await Promise.all([api('who'), api('alerts'), api('flag'), api('metrics'), api('tickets', ['open'])]);
    const m = mt.data || {};
    el.append(h('div', { cls: 'tiles' },
      h('div', { cls: 'tile' }, h('b', null, num(m.game_clients || 0)), h('span', null, T('online'))),
      h('div', { cls: 'tile' }, h('b', null, num(Array.isArray(tk.data) ? tk.data.length : 0)), h('span', null, T('ticketsOpen'))),
      h('div', { cls: 'tile' }, h('b', { cls: m.game_econ_stray_total ? 'bad' : '' }, num(m.game_econ_stray_total || 0)), h('span', null, T('strays'))),
      h('div', { cls: 'tile' }, h('b', null, (m.game_tick_ms_p95 || 0).toFixed(1) + 'ms'), h('span', null, 'tick p95'))));
    el.append(h('h2', null, T('alerts')));
    if (al.data) {
      el.append(h('p', { cls: 'note' }, al.data.on ? T('webhookOn') : T('webhookOff')));
      el.append(table([{ t: 'rule', v: (x) => x.rule.name }, { t: 'metric', v: (x) => x.rule.metric + (x.rule.delta ? ' (Δ)' : '') }, { t: 'limit', v: (x) => x.rule.op + ' ' + x.rule.value }, { t: 'value', v: (x) => (typeof x.value === 'number' && !Number.isInteger(x.value) ? x.value.toFixed(2) : x.value), num: true },
        { t: 'state', v: (x) => h('span', { cls: x.state === 'firing' ? 'bad' : x.state === 'pending' ? 'warn' : 'good' }, T(x.state === 'firing' ? 'stFiring' : x.state === 'pending' ? 'stPending' : 'stOk')) }], al.data.rules, (x) => x.state === 'firing'));
    } else el.append(h('pre', null, al.out));
    el.append(h('h2', null, T('flags')));
    const fbox = h('div');
    el.append(table([{ t: 'name', v: (f) => f.name }, { t: 'state', v: (f) => h('span', { cls: f.on ? 'good' : 'bad' }, T(f.on ? 'on' : 'off')) }, { t: 'at', v: (f) => (f.at ? when(f.at) + ' · ' + f.by : '') },
      { t: 'run', v: (f) => h('button', { disabled: !can('ops'), on: { click: () => act('flag', [f.name, f.on ? 'off' : 'on'], fbox, () => show()) } }, T(f.on ? 'turnOff' : 'turnOn')) }], fl.data || []), fbox);
    el.append(h('h2', null, T('notices')));
    const nb = h('div'), ni = h('input', { placeholder: T('noticePh'), style: 'flex:1;min-width:180px' });
    el.append(h('div', { cls: 'row' }, ni, h('button', { disabled: !can('ops'), on: { click: () => { if (ni.value.trim()) act('notice', ['add', '--ticker', '--for', '1h', '--' + lang, ni.value.trim()], nb); } } }, T('noticeAdd'))), nb);
    const ns = await api('notice');
    el.append(h('pre', null, ns.out));
    el.append(h('p', { cls: 'note' }, (who.data || []).length + ' ' + T('online')));
  },
  async people(el) {
    const who = await api('who');
    const box = h('div');
    el.append(table([{ t: 'name', v: (p) => p.name }, { t: 'lv', v: (p) => p.lv, num: true }, { t: 'addr', v: (p) => p.ip }, { t: 'key', v: (p) => p.key },
      { t: 'state', v: (p) => [p.away ? T('awayHunt') : '', p.muted ? T('muted') : ''].filter(Boolean).join(' · ') },
      { t: 'run', v: (p) => h('span', { cls: 'row' }, h('button', { disabled: !can('ops'), on: { click: () => act('kick', [p.name], box, () => show()) } }, T('kick')), h('button', { disabled: !can('ops'), on: { click: () => act('mute', [p.name, '1h'], box, () => show()) } }, T('mute'))) }], who.data || []), box);
    const fi = h('input', { placeholder: T('name') }), fb = h('div');
    el.append(h('h2', null, T('find')), h('div', { cls: 'row' }, fi, h('button', { on: { click: () => fi.value.trim() && act('find', [fi.value.trim()], fb) } }, T('find'))), fb);
  },
  async stats(el) {
    const [d, r] = await Promise.all([api('stats', ['daily', '--days', '14']), api('stats', ['retention', '--days', '45'])]);
    el.append(h('h2', null, T('daily')));
    el.append(d.data ? table([{ t: 'day', v: (x) => x.day }, { t: 'active', v: (x) => x.active, num: true }, { t: 'fresh', v: (x) => x.fresh, num: true }, { t: 'sessions', v: (x) => x.sessions, num: true }, { t: 'medianSec', v: (x) => x.medianSec, num: true }], d.data.rows.slice().reverse()) : h('pre', null, d.out));
    el.append(h('h2', null, T('retention')));
    el.append(r.data ? table([{ t: 'cohort', v: (x) => (x.day === 'all' ? '∑' : x.day) }, { t: 'count', v: (x) => x.n, num: true }, { t: 'D1', v: (x) => pct(x.d1), num: true }, { t: 'D7', v: (x) => pct(x.d7), num: true }, { t: 'D30', v: (x) => pct(x.d30), num: true }], r.data.rows) : h('pre', null, r.out));
    el.append(h('h2', null, T('funnel')));
    const si = h('input', { value: 'first_join,level_up', style: 'flex:1;min-width:200px', 'aria-label': T('steps') }), di = h('input', { value: '30', size: 4, 'aria-label': T('days') }), fb = h('div');
    const go = async () => { const b = await api('stats', ['funnel', si.value.replace(/\s/g, ''), '--days', di.value]); fb.textContent = ''; fb.append(b.data ? table([{ t: 'name', v: (x) => x.name }, { t: 'count', v: (x) => x.n, num: true }, { t: 'stayed', v: (x) => x.pct + '%', num: true }], b.data.rows) : h('pre', null, b.out)); };
    el.append(h('p', { cls: 'note' }, T('steps')), h('div', { cls: 'row' }, si, di, h('span', { cls: 'note' }, T('days')), h('button', { on: { click: go } }, T('run'))), fb);
    await go();
  },
  async ledger(el) {
    const b = await api('ledger', ['7']);
    if (!b.data) { el.append(h('pre', null, b.out)); return; }
    el.append(h('p', { cls: 'note' }, T('ledgerNote')));
    el.append(h('h2', null, T('strayWho') + ' · ' + b.data.strayCount));
    el.append(table([{ t: 'at', v: (s) => when(s.at) }, { t: 'name', v: (s) => s.name }, { t: 'cur', v: (s) => s.cur }, { t: 'why', v: (s) => s.why }, { t: 'amount', v: (s) => (s.d > 0 ? '+' : '') + num(s.d), num: true }], b.data.strays.slice(0, 100), () => true));
    el.append(h('h2', null, T('flow') + ' (' + b.data.fromDay + '~)'));
    el.append(table([{ t: 'day', v: (r) => r.day }, { t: 'cur', v: (r) => r.cur }, { t: 'why', v: (r) => r.why }, { t: 'amount', v: (r) => r.dir + num(Math.round(r.amount)), num: true }, { t: 'n', v: (r) => r.n, num: true }], b.data.rows, (r) => r.why === 'other' || r.why === 'tick'));
  },
  async tickets(el) {
    let which = store('adminTk') || 'live';
    const bar = h('div', { cls: 'row' }), list = h('div'), detail = h('div');
    const KIND = { ask: 'kAsk', bug: 'kBug', appeal: 'kAppeal' }, ST = { open: 'tOpen', answered: 'tAnswered', closed: 'tClosed' };
    const load = async () => {
      bar.textContent = '';
      for (const [k, t] of [['live', 'tOpen'], ['answered', 'tAnswered'], ['closed', 'tClosed'], ['all', 'ticketAll']]) bar.append(h('button', { cls: which === k ? 'on' : '', on: { click: () => { which = k; store('adminTk', k); load(); } } }, T(t)));
      const b = await api('tickets', [which, '100']);
      list.textContent = '';
      if (!Array.isArray(b.data)) { list.append(h('pre', null, b.out)); return; }
      list.append(table([{ t: '#', v: (x) => h('button', { on: { click: () => open(x.id) } }, '#' + x.id) }, { t: 'state', v: (x) => T(ST[x.state]) }, { t: 'kind', v: (x) => T(KIND[x.kind]) }, { t: 'at', v: (x) => when(x.at) }, { t: 'name', v: (x) => x.name }, { t: 'text', v: (x) => x.text.slice(0, 80), wrap: true }], b.data, (x) => x.state === 'open' && x.kind === 'appeal'));
    };
    const open = async (id) => {
      const b = await api('ticket', [String(id)]);
      detail.textContent = '';
      const t = b.data;
      if (!t) { detail.append(h('pre', null, b.out)); return; }
      const ta = h('textarea', { placeholder: T('answerPh') }), res = h('div');
      detail.append(h('div', { cls: 'card' },
        h('div', { cls: 'row' }, h('b', null, '#' + t.id), h('span', null, T(KIND[t.kind])), h('span', { cls: t.state === 'open' ? 'warn' : 'good' }, T(ST[t.state])), h('span', { cls: 'note' }, when(t.at)), h('span', null, t.name || '-')),
        t.sanction ? h('p', { cls: 'warn' }, T('sanction') + ': ' + t.sanction.kind + ' · ' + (t.sanction.until ? when(t.sanction.until) : '∞') + ' · ' + (t.sanction.why || '-')) : null,
        h('p', null, h('b', null, T('text') + ': '), t.text),
        t.answer ? h('p', null, h('b', null, T('answer') + ': '), t.answer) : null,
        ta,
        h('div', { cls: 'row' },
          h('button', { disabled: !can('ops'), on: { click: () => ta.value.trim() && act('answer', [String(t.id), ta.value.trim()], res, () => { load(); open(t.id); }) } }, T('reply')),
          h('button', { disabled: !can('ops'), on: { click: () => act('tclose', [String(t.id)], res, () => { load(); open(t.id); }) } }, T('close')),
          h('button', { disabled: !can('ops'), on: { click: () => act('treopen', [String(t.id)], res, () => { load(); open(t.id); }) } }, T('reopen'))),
        res));
    };
    el.append(bar, list, detail);
    await load();
  },
  async suspects(el) {
    const b = await api('suspects', ['100']);
    if (!b.data) { el.append(h('pre', null, b.out)); return; }
    el.append(h('p', { cls: 'note' }, T('suspectNote', b.data.line)));
    el.append(table([{ t: 'score', v: (r) => r.score, num: true }, { t: 'name', v: (r) => r.name }, { t: 'perMin', v: (r) => r.perMin, num: true }, { t: 'cv', v: (r) => r.cv, num: true }, { t: 'top', v: (r) => r.top + ' ' + Math.round(r.topShare * 100) + '%' }, { t: 'nonstop', v: (r) => r.nonstopMin, num: true }, { t: 'cmds', v: (r) => r.n, num: true }], b.data.rows, (r) => r.score >= b.data.line));
  },
  async rollback(el) {
    const ni = h('input', { placeholder: T('name'), value: store('adminRb') || '' }), box = h('div'), pv = h('div');
    const list = async () => {
      store('adminRb', ni.value.trim());
      const b = await api('rollback', ['list', ni.value.trim()]);
      box.textContent = ''; pv.textContent = '';
      if (!b.data) { box.append(h('pre', null, b.out)); return; }
      box.append(h('pre', null, b.out.split('\n')[0]));
      box.append(table([{ t: 'file', v: (r) => r.file }, { t: 'lv', v: (r) => (r.save ? r.save.lv : '-'), num: true }, { t: 'cur', v: (r) => (r.save ? 'gold ' + num(r.save.gold) : '-') }, { t: 'at', v: (r) => when(r.saved) },
        { t: 'rbPreview', v: (r) => (r.save ? h('button', { on: { click: () => preview(r.file) } }, T('rbPreview')) : '') }], b.data.backups));
      const st = await api('rollback', ['stash', ni.value.trim()]);
      box.append(h('h2', null, T('rbStash')), h('pre', null, st.out));
    };
    const preview = async (file) => {
      const b = await api('rollback', ['preview', ni.value.trim(), file]);
      pv.textContent = '';
      pv.append(h('pre', null, b.out));
      if (!b.data) return;
      const res = h('div');
      pv.append(h('div', { cls: 'row' }, h('span', { cls: 'note' }, T('rbCode') + ': ' + b.data.code),
        h('button', { cls: 'bad', disabled: !can('full'), on: { click: () => act('rollback', ['apply', ni.value.trim(), b.data.file, b.data.code], res, () => list()) } }, T('rbApply'))), res);
    };
    el.append(h('p', { cls: 'note' }, T('rbNote')), h('div', { cls: 'row' }, ni, h('button', { on: { click: () => ni.value.trim() && list() } }, T('rbList'))), box, pv);
    if (ni.value.trim()) await list();
  },
  async live(el) {
    const [ev, se, cp] = await Promise.all([api('events'), api('season'), api('coupon', ['list'])]);
    el.append(h('p', { cls: 'note' }, T('liveNote')));
    el.append(h('h2', null, T('liveEvents')));
    const ST = { open: 'stOpen', soon: 'stSoon', ended: 'stEnded' };
    if (ev.data) {
      el.append(table([{ t: 'name', v: (e) => e.id }, { t: 'state', v: (e) => h('span', { cls: e.state === 'open' ? 'good' : e.state === 'soon' ? 'warn' : '' }, T(ST[e.state])) }, { t: 'from', v: (e) => when(e.from) }, { t: 'to', v: (e) => when(e.to) }, { t: 'missions', v: (e) => e.missions, num: true }, { t: 'cur', v: (e) => (e.cur ? e.cur + ' · ' + e.end : '') }], ev.data.events));
      el.append(h('h2', null, T('liveGoods')));
      el.append(table([{ t: 'name', v: (x) => x.id }, { t: 'shop', v: (x) => x.shop }, { t: 'price', v: (x) => x.price }, { t: 'limit', v: (x) => x.limit }, { t: 'left', v: (x) => (x.left === null ? '' : x.left), num: true }], ev.data.goods));
    } else el.append(h('pre', null, ev.out));
    el.append(h('h2', null, T('liveSeason')), h('pre', null, se.out));
    el.append(h('h2', null, T('liveCoupons')));
    const cbox = h('div');
    if (Array.isArray(cp.data)) el.append(table([{ t: 'code', v: (r) => r.code }, { t: 'uses', v: (r) => r.used + (r.uses ? ' / ' + r.uses : ''), num: true }, { t: 'from', v: (r) => (r.from ? when(r.from) : '') }, { t: 'to', v: (r) => (r.to ? when(r.to) : '') }, { t: 'reward', v: (r) => JSON.stringify(r.r), wrap: true },
      { t: 'run', v: (r) => h('button', { cls: 'bad', disabled: !can('full'), on: { click: () => act('coupon', ['del', r.code], cbox, () => show()) } }, T('couponDel')) }], cp.data));
    else el.append(h('pre', null, cp.out));
    const ci = h('input', { placeholder: T('couponPh'), size: 14 }), cr = h('input', { placeholder: T('mailPh'), style: 'flex:1;min-width:200px' });
    const words = (s) => (s.trim().match(/"[^"]*"|\S+/g) || []).map((x) => x.replace(/^"|"$/g, ''));
    el.append(h('div', { cls: 'row' }, ci, cr, h('button', { disabled: !can('full'), on: { click: () => ci.value.trim() && act('coupon', ['add', ci.value.trim()].concat(words(cr.value)), cbox, () => show()) } }, T('couponAdd'))), cbox);
    el.append(h('h2', null, T('liveMail')));
    const mr = h('input', { placeholder: T('mailPh'), style: 'flex:1;min-width:200px' }), ml = h('input', { placeholder: T('mailLv'), size: 10 }), mx = h('input', { placeholder: T('mailExpire'), size: 8 }), mbox = h('div');
    el.append(h('div', { cls: 'row' }, mr, ml, mx, h('button', { disabled: !can('full'), on: { click: () => { const a = ['--all'].concat(words(mr.value)); if (ml.value.trim()) a.push('--lv', ml.value.trim()); if (mx.value.trim()) a.push('--expire', mx.value.trim()); act('mail', a, mbox); } } }, T('mailSend'))), mbox);
  },
  async console(el) {
    const ci = h('input', { placeholder: T('cmdPh'), style: 'flex:1;min-width:200px' }), box = h('div');
    const go = () => { const w = ci.value.trim().match(/"[^"]*"|\S+/g) || []; if (w.length) act(w[0], w.slice(1).map((x) => x.replace(/^"|"$/g, '')), box); };
    ci.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    el.append(h('p', { cls: 'note' }, T('cmdNote')), h('div', { cls: 'row' }, ci, h('button', { on: { click: go } }, T('run'))), box);
  },
};
const ORDER = [['home', 'tabHome'], ['people', 'tabPeople'], ['stats', 'tabStats'], ['ledger', 'tabLedger'], ['tickets', 'tabTickets'], ['suspects', 'tabSuspects'], ['rollback', 'tabRollback'], ['console', 'tabConsole'], ['live', 'tabLive']];

function chrome() {
  document.documentElement.lang = lang;
  document.title = T('title');
  $('title').textContent = T('title');
  $('lang').textContent = T('lang');
  $('leave').textContent = T('leave');
  $('tokenAsk').textContent = T('tokenAsk');
  $('tok').placeholder = T('tokenPh');
  $('enter').textContent = T('enter');
  const rb = $('role');
  rb.textContent = role ? T('role') + ': ' + T(role === 'full' ? 'roleFull' : role === 'ops' ? 'roleOps' : 'roleView') : '';
  rb.className = 'badge ' + role;
  rb.hidden = !role;
  $('leave').hidden = !token;
  const nav = $('tabs');
  nav.textContent = '';
  nav.hidden = !role;
  for (const [id, key] of ORDER) nav.append(h('button', { cls: tab === id ? 'on' : '', on: { click: () => { tab = id; store('adminTab', id); show(); } } }, T(key)));
  nav.append(h('button', { on: { click: () => show() }, title: T('refresh') }, '↻'));
}
let seq = 0;
async function show() {
  const my = ++seq;
  chrome();
  const main = $('main');
  if (!role) return;
  const el = h('div');
  main.textContent = '';
  main.append(h('p', { cls: 'note' }, T('loading')));
  try { await (TABS[tab] || TABS.home)(el); }
  catch (e) { el.append(h('pre', { cls: 'bad' }, String(e.message || e))); }
  if (my !== seq) return;
  main.textContent = '';
  main.append(el);
  chrome();
}
function logout(msg) {
  token = ''; role = ''; store('adminToken', null);
  $('login').hidden = false; $('main').textContent = ''; $('loginErr').textContent = msg || '';
  chrome();
}
async function login() {
  if (!token) { logout(''); return; }
  try { const b = await api('whoami'); if (!b.ok) throw new Error(b.out); $('login').hidden = true; await show(); }
  catch (e) { if (token) logout(String(e.message || e)); }
}
$('enter').addEventListener('click', () => { token = $('tok').value.trim(); $('tok').value = ''; store('adminToken', token); login(); });
$('tok').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('enter').click(); });
$('lang').addEventListener('click', () => { lang = lang === 'ko' ? 'en' : 'ko'; try { localStorage.setItem('adminLang', lang); } catch (e) { /* 저장 못 해도 이 화면은 바뀐다 */ } show(); });
$('leave').addEventListener('click', () => logout(''));
chrome();
login();
`;

/** 페이지 한 장 (두 언어의 문장이 함께 든다) */
export function adminPage(): string {
  const dict = JSON.stringify({ ko: koAdminPage, en: enAdminPage }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${koAdminPage.title}</title><style>${STYLE}</style></head>
<body>
<header><h1 id="title"></h1><span id="role" class="badge" hidden></span><button type="button" id="lang"></button><button type="button" id="leave" hidden></button></header>
<nav id="tabs" hidden></nav>
<section id="login" class="card" hidden><p id="tokenAsk"></p><input id="tok" type="password" autocomplete="off" spellcheck="false"><button type="button" id="enter"></button><p id="loginErr" class="bad"></p></section>
<main id="main"></main>
<script>${SCRIPT.replace('__DICT__', dict)}</script>
</body></html>`;
}
