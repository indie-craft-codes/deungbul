// 운영의 바탕의 화면 (핵심: 모든 게임에 있다. 공지·점검이 없으면 아무것도 보이지 않는다). 서버의 짝은 engine/server/game/systems/live.ts.
//   공지     접속 때 창(popup: 그 화면에서 처음 본 공지만 한 번), 흐르는 띠(ticker: 보이는 동안 화면 위에서 흐른다). 글은 지금 언어의 것, 없으면 있는 것
//   점검     예고되면 화면 위에 카운트다운 띠, 시작되어 끊기면(닫힘 4004) 접속 화면에 '점검 중'과 예정 끝 시각, 1분마다 저절로 다시 접속해 본다
//   새 접속  깃발 join이 꺼져 있어 들어오지 못하면(닫힘 4005) 접속 화면에 그 까닭, 1분마다 다시 접속해 본다
//   깃발     꺼진 기능을 쓰면 서버의 안내문 featureOff가 흘러가는 알림으로 뜬다 (분류만 여기서)
//   원격 설정 화면에도 보내는 칸(LIVE_KEYS의 client)을 화면의 내용에 적용한다 (서버와 같은 함수: engine/shared/defs/live.ts의 applyLive). 바뀐 뒤 할 일은 onLive로
import { applyLive, pickText, type MaintView, type NoticeView } from '../../shared/defs';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { connect } from '../net';
import { platform } from '../platform';
import { showGate } from './me';
import { addNotices } from './notify';

let notices: NoticeView[] = [];
let maint: MaintView | null = null;
/** 이 화면에서 이미 창으로 보인 공지 */
const shown = new Set<string>();
/** 창에 보이는 공지 */
let popup: NoticeView[] = [];
/** 점검·새 접속 막힘으로 끊겼을 때 다시 접속해 보는 타이머 */
let retry = 0;
/** 끊긴 까닭 (4004 점검, 4005 새 접속 막힘, 0 그 밖) */
let closedBy = 0;
const liveFns: ((changed: string[]) => void)[] = [];
/** 원격 설정으로 화면의 내용이 바뀌었을 때 (바뀐 칸의 이름들): 게임이 그 칸을 쓰는 창을 다시 그린다 */
export function onLive(fn: (changed: string[]) => void): void { liveFns.push(fn); }
/** 지금 점검 예고·점검 (없으면 null) */
export const maintNow = (): MaintView | null => maint;
/** 지금 보이는 공지 */
export const noticesNow = (): readonly NoticeView[] => notices;
/** 지금 걸린 공지를 창으로 다시 연다 (홈의 '공지' 칸). 공지가 없으면 거짓 */
export function openNotices(): boolean { if (!notices.length) return false; popup = [...notices]; renderPopup(); return true; }

const lang = (): string => L().code;
const el = (tag: string, cls: string, text = ''): HTMLElement => { const d = document.createElement(tag); d.className = cls; d.textContent = text; return d; };

function renderPopup(): void {
  const pop = $('noticePop');
  pop.hidden = popup.length === 0;
  if (!popup.length) return;
  $('noticeTitle').textContent = t('noticeTitle');
  const list = $('noticeList');
  list.textContent = '';
  for (const n of popup) list.append(el('p', 'notice', pickText(n.text, lang())));
  $('noticeClose').textContent = t('noticeClose');
}

/** 화면 위의 띠: 점검 예고의 카운트다운이 먼저, 그다음 흐르는 공지 */
function renderBand(now = Date.now()): void {
  const band = $('opsBand'), count = $('opsCount'), roll = $('opsRoll');
  const soon = maint && !maint.on ? maint : null;
  count.hidden = !soon;
  const line = soon ? L().fmt.maintCountdown(Math.max(0, (soon.at - now) / 1000), soon.until) + (soon.text ? ` · ${pickText(soon.text, lang())}` : '') : '';
  if (count.textContent !== line) count.textContent = line;
  const text = notices.filter((n) => n.ticker && now >= n.from && now < n.to).map((n) => pickText(n.text, lang())).join('   ·   ');
  const inner = roll.firstElementChild as HTMLElement;
  if (inner.textContent !== text) { inner.textContent = text; inner.style.animationDuration = `${Math.max(12, text.length * 0.28)}s`; }
  roll.hidden = !text;
  band.hidden = count.hidden && roll.hidden;
}

/** 점검으로 끊긴 접속 화면의 덧붙는 줄: 예정 끝 시각과 운영자의 안내 글 */
function renderGate(): void {
  const extra = $('gateOps'), msg = $('gateMsg').getAttribute('data-i18n');
  const text = closedBy === 4004 && msg === 'gateMaint' ? L().fmt.maintGate(maint?.until ?? 0, pickText(maint?.text, lang())) : '';
  if (extra.textContent !== text) extra.textContent = text;
  extra.hidden = !text;
}

/**
 * 서버가 점검(4004)이나 새 접속 막힘(4005)으로 연결을 닫았다 (engine/client/main.ts가 부른다): 접속 화면에 까닭을 두고 1분마다 다시 접속해 본다.
 * 그 밖의 닫힘이면 false (main.ts가 하던 대로)
 */
export function opsLost(code: number): boolean {
  if (code !== 4004 && code !== 4005) return false;
  closedBy = code;
  showGate(code === 4004 ? 'gateMaint' : 'gateJoinClosed', true, 'maint');
  renderGate();
  clearTimeout(retry);
  retry = window.setTimeout(function again() {
    const life = platform().lifecycle;
    if (!life.visible()) { const off = life.on('show', () => { off(); again(); }); return; } // 화면이 꺼져 있으면 켜질 때까지 기다린다
    connect();
  }, 60_000);
  return true;
}

export function initOps(): void {
  // 꺼진 기능의 안내는 흘러가는 알림, 점검의 안내는 가운데 알림 (게임이 먼저 정했으면 그것이 이긴다)
  addNotices({ feed: ['featureOff', 'joinClosed'], banner: { maintSoon: 'bad', maintStart: 'bad', maintEnd: 'good' } }, true);
  // 창과 띠는 문서의 맨 끝에 (메뉴와 다른 창 위에)
  const pop = document.createElement('div');
  pop.className = 'panel'; pop.id = 'noticePop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  pop.innerHTML = '<div class="ttitle" id="noticeTitle"></div><div id="noticeList"></div><div class="btns"><button type="button" class="on" id="noticeClose"></button></div>';
  document.body.append(pop);
  $('noticeClose').addEventListener('click', () => { popup = []; renderPopup(); });
  const band = document.createElement('div');
  band.id = 'opsBand'; band.hidden = true; band.setAttribute('aria-live', 'polite');
  band.innerHTML = '<div id="opsCount" hidden></div><div id="opsRoll" hidden><span></span></div>';
  document.body.append(band);
  // 접속 화면의 덧붙는 줄 (점검의 예정 끝 시각)
  const extra = document.createElement('p');
  extra.id = 'gateOps'; extra.className = 'note'; extra.hidden = true;
  $('gateMsg').after(extra);

  onMsg('notices', (m) => {
    notices = m.list;
    const fresh = m.list.filter((n) => n.popup && !shown.has(n.id));
    for (const n of fresh) shown.add(n.id);
    // 창에 떠 있던 것 가운데 내려간 공지는 뺀다
    popup = [...popup.filter((p) => m.list.some((n) => n.id === p.id)), ...fresh];
    renderPopup(); renderBand();
  });
  onMsg('maint', (m) => { maint = 'off' in m ? null : { at: m.at, until: m.until, on: m.on, ...(m.text ? { text: m.text } : {}) }; renderBand(); renderGate(); });
  onMsg('live', (m) => {
    const changed = [...Object.keys(m.set), ...(m.reset ?? [])];
    for (const [k, v] of Object.entries(m.set)) { const err = applyLive(k, v); if (err) console.warn(`[live] ${k}: ${err}`); }
    for (const k of m.reset ?? []) applyLive(k, undefined);
    for (const fn of liveFns) fn(changed);
  });
  // 새로 들어오면 공지·점검은 서버가 지금의 것을 다시 보낸다 (없으면 보내지 않는다): 끊기기 전의 것을 버린다
  onMsg('welcome', () => { clearTimeout(retry); closedBy = 0; notices = []; maint = null; renderBand(); renderGate(); });
  onSlow(() => { renderBand(); renderGate(); }); // 카운트다운과 공지의 시작·끝 (글이 바뀔 때만 다시 쓴다)
  onLangChange(() => { renderPopup(); renderBand(); renderGate(); });
}
