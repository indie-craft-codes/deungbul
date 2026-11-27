// 절전 화면 (묶음 E: docs/screens.md 3.3). 폰으로 자동 사냥(또는 단계 자동 진행)을 오래 돌릴 때 전지·발열을 줄인다:
//   - 3D를 그리지 않고 프레임을 5fps로 줄인다 (framecap.ts: requestAnimationFrame을 부르지 않는다). HUD·3D 화면은 감춘다(합성할 것이 없다)
//   - 어두운 막 위에 그동안의 요약을 크게: 지난 시간, 처치 수, 얻은 경험치·재화·아이템(장비), 체력·물약, 단계 진행, 위험 알림
//   - 밀어서 풀기 (손잡이를 끝까지 끌기. 키보드는 Enter·Esc). 뒤로 가기로는 풀리지 않는다(주머니 속 오누름)
// 들어가는 법: 자동 사냥 단추 곁의 '절전' 단추(사냥 중일 때만 보인다), 전투 화면 위 띠의 단추, 자동 사냥 설정 창의 '지금 절전',
// 그리고 사냥 중 아무것도 누르지 않은 지 n분 뒤 저절로 (설정 창에서 고른다: 기기에 둔다. 터치 기기는 5분, PC는 끔이 처음 값).
// 서버는 아무것도 모른다: 화면만의 일이다 (사냥은 그대로 서버와 화면의 자동 사냥이 한다).
import { MONSTERS } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import { onMsg } from '../bus';
import { onKill } from '../entities';
import { frameStats, setFrameCap } from '../framecap';
import { L, isTouch, onLangChange, t } from '../i18n';
import { hasModule } from '../mods';
import { platform } from '../platform';
import { S } from '../state';
import { POTIONS } from '../../shared/auto';
import { dropScreen, openScreen } from './screens';
import { myStage } from './stagebar';
import { uiIcon } from './uiicons';
import { toUi } from '../uiscale';

/** 절전 중의 프레임 (요약은 1초마다 고친다) */
export const POWER_SAVE_FPS = 5;
/** 저절로 들어가기까지의 분 (0 = 끔). 기기에 둔다 ('psAfter') */
export const POWER_SAVE_AFTER = [0, 1, 3, 5, 10] as const;
/** 요약에 남길 위험 알림 (서버 안내문) */
const DANGER: ReadonlySet<MsgKey> = new Set<MsgKey>(['died', 'autoRetreat', 'autoNoPotion', 'autoDied', 'autoBagFull', 'gearFull', 'modeStandDown', 'modeStandEnd', 'stageBgStop', 'stageFail', 'stageLastStop', 'awayLimit']);

let box: HTMLElement | null = null;
let ui: Record<'clock' | 'state' | 'grid' | 'alerts' | 'knob' | 'track', HTMLElement> | null = null;
let open = false;
let lastInput = typeof performance !== 'undefined' ? performance.now() : 0;
let timer = 0;
/** 들어간 때의 값 */
let base = { at: 0, lv: 1, gold: 0, second: 0, items: {} as Record<string, number>, stage: '', frames: 0, renders: 0 };
let got = { kills: 0, exp: 0, gear: 0 };
let alerts: string[] = [];
/** 경험치를 세려고 지난 값을 둔다 (stat 메시지는 main.ts가 먼저 S.me에 넣는다) */
let prev = { lv: 0, exp: 0, need: 0 };

/** 자동으로 무엇이 돌고 있는가: 들판의 자동 사냥이나 단계의 자동 진행 */
export const powerSaveActive = (): boolean => S.auto || (!!myStage()?.auto && !!myStage()?.run);
/** 저절로 들어가기까지의 분 (0 끔) */
export function powerSaveAfter(): number {
  const v = Number(platform().storage.get('psAfter'));
  return (POWER_SAVE_AFTER as readonly number[]).includes(v) && platform().storage.get('psAfter') !== null ? v : isTouch() ? 5 : 0;
}
export function setPowerSaveAfter(min: number): void { platform().storage.set('psAfter', String(min)); }
/** 절전 화면이 떠 있는가 */
export const powerSaveOn = (): boolean => open;

const mk = (tag: string, cls: string, text = ''): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

function build(): void {
  if (box) return;
  box = mk('div', 'psave');
  box.id = 'psave';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.tabIndex = -1;
  const head = mk('div', 'ps-head');
  const title = mk('div', 'ps-title');
  title.append(uiIcon('pause'), mk('span', '', ''));
  const clock = mk('div', 'ps-clock');
  head.append(title, clock);
  const state = mk('div', 'ps-state');
  state.setAttribute('aria-live', 'polite');
  const grid = mk('div', 'ps-grid');
  const alertsEl = mk('div', 'ps-alerts');
  alertsEl.setAttribute('aria-live', 'assertive');
  const track = mk('div', 'ps-track');
  const knob = mk('button', 'ps-knob');
  (knob as HTMLButtonElement).type = 'button';
  knob.append(uiIcon('unlock'));
  const label = mk('span', 'ps-slide');
  track.append(label, knob);
  const keys = mk('div', 'ps-keys');
  box.append(head, state, grid, alertsEl, track, keys);
  document.body.append(box);
  ui = { clock, state, grid, alerts: alertsEl, knob, track };
  slide(track, knob);
  // 키보드: Enter·Esc로 푼다 (PC). 손가락의 탭 한 번으로는 풀리지 않는다 (주머니 속)
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closePowerSave(); } });
  relabel();
}

function relabel(): void {
  if (!box) return;
  (box.querySelector('.ps-title span') as HTMLElement).textContent = t('psTitle');
  (box.querySelector('.ps-slide') as HTMLElement).textContent = t('psSlide');
  (box.querySelector('.ps-keys') as HTMLElement).textContent = isTouch() ? '' : t('psKeys');
  box.setAttribute('aria-label', t('psTitle'));
  ui?.knob.setAttribute('aria-label', t('psSlide'));
  if (open) draw();
}

/** 손잡이를 끌어 끝에 닿으면 푼다 (85% 넘게). 놓으면 제자리로 */
function slide(track: HTMLElement, knob: HTMLElement): void {
  let x0 = 0, dx = 0, max = 0, id = -1;
  const put = (v: number) => { knob.style.transform = `translateX(${v}px)`; track.style.setProperty('--ps-k', String(max > 0 ? v / max : 0)); };
  knob.addEventListener('pointerdown', (e) => {
    id = e.pointerId; x0 = e.clientX; dx = 0;
    max = Math.max(1, track.clientWidth - knob.offsetWidth - 8);
    knob.setPointerCapture(id);
    knob.classList.add('drag');
    e.preventDefault();
  });
  knob.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; dx = Math.max(0, Math.min(max, toUi(e.clientX - x0))); put(dx); });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    knob.classList.remove('drag');
    if (dx >= max * 0.85) { put(max); closePowerSave(); }
    put(0);
  };
  knob.addEventListener('pointerup', up);
  knob.addEventListener('pointercancel', up);
}

const fmtNum = (n: number): string => n.toLocaleString(L().code);
function cell(icon: string, label: string, value: string, cls = ''): HTMLElement {
  const c = mk('div', 'ps-cell' + (cls ? ' ' + cls : ''));
  const l = mk('div', 'ps-label');
  l.append(uiIcon(icon, 'sm'), mk('span', '', label));
  c.append(l, mk('div', 'ps-val', value));
  return c;
}

/** 요약을 다시 그린다 (1초마다) */
function draw(): void {
  if (!ui || !S.me) return;
  const loc = L(), me = S.me, now = Date.now(), sec = Math.max(0, (now - base.at) / 1000);
  ui.clock.textContent = new Date(now).toLocaleTimeString(loc.code, { hour: '2-digit', minute: '2-digit' });
  const st = myStage();
  const running = powerSaveActive();
  ui.state.textContent = running ? (S.auto ? t('psHunting') : t('psStageRun')) : st && document.body.dataset.modeKind === 'stage' ? t('psStageStopped') : t('psStopped');
  ui.state.classList.toggle('off', !running);
  const cells: HTMLElement[] = [cell('speed', t('psElapsed'), loc.fmt.psClock(sec))];
  const fights = hasModule('combat') && Object.keys(MONSTERS).length > 0;
  if (fights) cells.push(cell('sword', t('psKills'), loc.fmt.psKillsN(got.kills)));
  if (hasModule('growth')) cells.push(cell('growth', t('psExp'), loc.fmt.psExpN(got.exp, base.lv, me.lv)));
  if (hasModule('economy')) {
    const gold = Math.max(0, me.gold - base.gold);
    cells.push(cell('coin', loc.fmt.gold(0).replace(/[\s\d,.]+$/, '') || 'gold', '+' + fmtNum(gold)));
    const coin = loc.fmt.coinHave(0).replace(/[\s\d,.]+$/, '');
    const second = Math.max(0, me.sparks - base.second);
    if (coin) cells.push(cell('shard', coin, '+' + fmtNum(second)));
  }
  let items = 0;
  const potionIds = new Set<string>(POTIONS);
  for (const [id, n] of Object.entries(me.items)) if (!potionIds.has(id)) items += Math.max(0, n - (base.items[id] ?? 0));
  if (hasModule('items')) cells.push(cell('bag', t('psItems'), loc.fmt.psItemsN(items, got.gear)));
  if (st) cells.push(cell('adventure', t('psStage'), loc.fmt.psStageN(base.stage || st.cur, st.cur)));
  if (hasModule('combat')) {
    const hp = cell('profile', t('psHp'), `${fmtNum(Math.max(0, Math.round(me.hp)))} / ${fmtNum(me.maxHp)}`, 'ps-hp');
    const bar = mk('div', 'ps-bar'); const fill = mk('i', ''); fill.style.width = `${Math.round(Math.max(0, Math.min(1, me.hp / Math.max(1, me.maxHp))) * 100)}%`; bar.append(fill); hp.append(bar);
    hp.classList.toggle('low', me.hp / Math.max(1, me.maxHp) < 0.35);
    cells.push(hp);
    if (POTIONS.length) cells.push(cell('plus', t('psPotions'), fmtNum(POTIONS.reduce((s, id) => s + (me.items[id] ?? 0), 0))));
  }
  ui.grid.replaceChildren(...cells);
  ui.alerts.replaceChildren(mk('div', 'ps-ahead', t('psAlerts')), ...(alerts.length ? alerts.slice(-3).map((a) => mk('div', 'ps-alert', a)) : [mk('div', 'ps-calm', t('psCalm'))]));
  box?.classList.toggle('danger', alerts.length > 0);
}

/** 절전 화면을 연다 */
export function openPowerSave(): void {
  if (open || !S.me) return;
  build();
  const me = S.me, st = myStage();
  base = { at: Date.now(), lv: me.lv, gold: me.gold, second: me.sparks, items: { ...me.items }, stage: st?.cur ?? '', frames: frameStats.frames, renders: frameStats.renders };
  got = { kills: 0, exp: 0, gear: 0 };
  alerts = [];
  prev = { lv: me.lv, exp: me.exp, need: me.need };
  open = true;
  box!.hidden = false;
  document.body.classList.add('psaveOn');
  setFrameCap(POWER_SAVE_FPS, false);
  // 화면 쌓기에 넣는다: 뒤로 가기로는 닫히지 않는다 (주머니 속에서 뒤로 몸짓이 들어가도 그대로)
  openScreen('psave', { kind: 'sheet', el: box!, onBack: () => true, close: () => closePowerSave() });
  draw();
  clearInterval(timer);
  timer = window.setInterval(draw, 1000);
  box!.focus();
}

/** 절전 화면을 닫는다 (밀어서 풀기) */
export function closePowerSave(): void {
  if (!open || !box) return;
  open = false;
  box.hidden = true;
  document.body.classList.remove('psaveOn');
  setFrameCap(null);
  clearInterval(timer);
  dropScreen('psave');
  lastInput = performance.now();
}

/** 절전 중의 프레임 수 (도구가 효과를 잰다): 들어간 뒤 돈 프레임과 그린 수 */
export const powerSaveStats = (): { frames: number; renders: number; sec: number } => ({ frames: frameStats.frames - base.frames, renders: frameStats.renders - base.renders, sec: (Date.now() - base.at) / 1000 });

export function initPowerSave(): void {
  // 무엇을 누르면 입력이 있었던 것이다 (절전 중에는 세지 않는다: 손잡이를 끄는 것 말고는 입력이 없다)
  const bump = (): void => { if (!open) lastInput = performance.now(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(ev, bump, { capture: true, passive: true });
  // 사냥 중 n분 동안 입력이 없으면 저절로 (화면이 꺼져 있으면 셀 것이 없다: 돌아왔을 때 처음부터)
  setInterval(() => {
    const after = powerSaveAfter();
    if (open || !after || !S.me || !powerSaveActive() || !platform().lifecycle.visible()) return;
    if (performance.now() - lastInput >= after * 60000) openPowerSave();
  }, 1000);
  platform().lifecycle.on('show', () => { if (!open) lastInput = performance.now(); });
  onKill(() => { if (open) got.kills++; });
  onMsg('stat', () => {
    const me = S.me;
    if (!me) return;
    if (open) {
      if (me.lv === prev.lv) got.exp += Math.max(0, me.exp - prev.exp);
      else if (me.lv > prev.lv) got.exp += Math.max(0, prev.need - prev.exp) + me.exp;
    }
    prev = { lv: me.lv, exp: me.exp, need: me.need };
  });
  onMsg('sys', (m) => {
    if (!open) return;
    if (m.k === 'gearDrop') got.gear++;
    if (DANGER.has(m.k)) {
      const make = L().msg[m.k] as ((a: MsgArg[]) => string) | undefined;
      alerts.push(make ? make(m.a ?? []) : m.k);
      if (alerts.length > 10) alerts.shift();
      draw();
    }
  });
  onMsg('welcome', () => { if (open) closePowerSave(); });
  onLangChange(relabel);
}

/** 그 자리에 쓰는 '절전' 단추 (자동 사냥 단추 곁·전투 화면 위 띠). 보일 때만 보인다 (shown) */
export function powerSaveButton(cls: string, shown: () => boolean = powerSaveActive): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  const label = mk('span', '', t('psBtn'));
  b.append(uiIcon('pause', 'sm'), label);
  b.title = t('psTitle');
  b.setAttribute('aria-label', t('psTitle'));
  b.addEventListener('click', () => { b.blur(); openPowerSave(); });
  onLangChange(() => { label.textContent = t('psBtn'); b.title = t('psTitle'); b.setAttribute('aria-label', t('psTitle')); });
  const sync = (): void => { b.hidden = !shown(); };
  sync();
  setInterval(sync, 500);
  return b;
}
