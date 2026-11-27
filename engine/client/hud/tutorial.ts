// 튜토리얼 (선택: 게임이 addTutorial을 부를 때만 있다). 단계마다 안내 한 줄과 조건(사건·명령·단축키·물음), 화면 요소 강조, 건너뛰기와 다시 보기(설정 창).
// 진행은 이 기기에 저장한다 (플랫폼 저장소의 'tut:<id>' 칸: 다 보았거나 건너뛰었으면 다시 뜨지 않는다).
// 단계가 바뀔 때마다 onTutorial에 사건을 낸다 (start, step, done, skip): 분석을 받는 곳이 생기면 거기에 잇는다 (docs/genre-features.md 5.5).
// 안내 카드는 화면 아래 가운데에 뜬다. 게임을 막지 않는다: 그대로 놀면서 조건을 채우면 넘어간다.
import { $ } from '../app';
import { actionOf, onMsg, onSlow } from '../bus';
import { L, onLangChange, t, type UiKey } from '../i18n';
import { onSend } from '../net';
import { platform } from '../platform';
import { S } from '../state';
import { renderMenu } from './menu';
import { button, el, row } from './menu/parts';
import { condMet, readProgress, writeProgress, type TutEvent, type TutorialCond, type TutProgress } from './tutorialcalc';
import type { ServerMsg } from '../../shared/protocol';

export type { TutorialCond } from './tutorialcalc';
export interface TutorialStep {
  /** 단계의 이름 (분석 사건에 실린다) */
  id: string;
  /** 안내 문장: 문장 키(게임의 언어 파일) 또는 문장을 만드는 함수 */
  text: UiKey | (() => string);
  /** 강조할 화면 요소의 id (예: 'menuBtn'). 없으면 강조하지 않는다 */
  target?: string;
  /** 끝나는 조건. 없으면 '다음' 단추로 넘긴다 */
  until?: TutorialCond;
}
export interface TutorialDef {
  id: string;
  steps: readonly TutorialStep[];
  /** 설정 창의 '다시 보기' 줄에 적는 이름. 없으면 '튜토리얼' */
  label?: () => string;
  /** 시작해도 되는가 (0.25초마다 묻는다). 없으면 들어와서 준비가 되자마자 (예: () => S.me?.cls !== '' 직업을 고른 뒤) */
  start?: () => boolean;
}
export type TutorialEvent = 'start' | 'step' | 'done' | 'skip';

const defs: TutorialDef[] = [];
const prog = new Map<string, TutProgress>();
let active: TutorialDef | null = null;
let lit: HTMLElement | null = null;
const hooks: ((ev: TutorialEvent, id: string, step: string, i: number) => void)[] = [];
const watched = new Set<string>();
let ready = false;

/** 튜토리얼의 사건을 받는다 (분석의 고리): start(시작), step(i번째 단계에 들어섬), done(다 봄), skip(건너뜀) */
export function onTutorial(fn: (ev: TutorialEvent, id: string, step: string, i: number) => void): void { hooks.push(fn); }
const emit = (ev: TutorialEvent, d: TutorialDef, i: number): void => { for (const fn of hooks) fn(ev, d.id, d.steps[Math.min(i, d.steps.length - 1)]?.id ?? '', i); };

const storeKey = (id: string): string => 'tut:' + id;
function progressOf(d: TutorialDef): TutProgress {
  let p = prog.get(d.id);
  if (!p) prog.set(d.id, p = readProgress(platform().storage.get(storeKey(d.id)), d.steps.length));
  return p;
}
function setProgress(d: TutorialDef, p: TutProgress): void { prog.set(d.id, p); platform().storage.set(storeKey(d.id), writeProgress(p)); }

/**
 * 튜토리얼을 더한다 (게임의 화면 모듈의 init에서). 처음 보는 기기면 start가 참이 될 때 시작한다. 예 (games/sample/client/tutorial.ts):
 *   addTutorial({ id: 'basics', start: () => !!S.me && S.me.cls !== '', steps: [{ id: 'move', text: 'tutMove', until: { cmd: 'move' } }, …] })
 */
export function addTutorial(def: TutorialDef): void {
  defs.push(def);
  for (const s of def.steps) {
    const m = s.until?.msg;
    if (!m) continue;
    const type = (m.startsWith('sys:') ? 'sys' : m) as ServerMsg['t'];
    if (watched.has(type)) continue;
    watched.add(type);
    onMsg(type, (msg) => hear({ kind: 'msg', name: msg.t === 'sys' ? 'sys:' + msg.k : msg.t }));
  }
  if (ready) renderMenu();
}
/** 그 튜토리얼(주지 않으면 처음 것)을 처음부터 다시 보인다 (설정 창의 '다시 보기') */
export function replayTutorial(id?: string): void {
  const d = defs.find((x) => !id || x.id === id);
  if (!d) return;
  if (active) close();
  setProgress(d, { i: 0, end: '' });
  begin(d);
}

function begin(d: TutorialDef): void {
  active = d;
  const p = progressOf(d);
  if (p.i === 0) emit('start', d, 0);
  show();
}
function close(): void { active = null; lit?.classList.remove('tutHi'); lit = null; $('tut').hidden = true; }

/** 지금 단계를 그린다 */
function show(): void {
  if (!active) return;
  const d = active, p = progressOf(d), s = d.steps[p.i];
  if (!s) { close(); return; }
  emit('step', d, p.i);
  draw();
}
function draw(): void {
  const box = $('tut');
  if (!active) { box.hidden = true; return; }
  const d = active, p = progressOf(d), s = d.steps[p.i];
  $('tutN').textContent = L().fmt.tutStep(p.i + 1, d.steps.length);
  $('tutText').textContent = typeof s.text === 'function' ? s.text() : t(s.text);
  $('tutNext').hidden = !!s.until;
  box.hidden = false;
  lit?.classList.remove('tutHi');
  lit = s.target ? ($(s.target) as HTMLElement | null) : null;
  lit?.classList.add('tutHi');
}
/** 다음 단계로 (마지막이면 끝) */
function next(): void {
  if (!active) return;
  const d = active, p = progressOf(d), i = p.i + 1;
  if (i >= d.steps.length) { setProgress(d, { i: d.steps.length, end: 'done' }); emit('done', d, i); close(); renderMenu(); return; }
  setProgress(d, { i, end: '' });
  show();
}
function skip(): void {
  if (!active) return;
  const d = active;
  emit('skip', d, progressOf(d).i);
  setProgress(d, { i: d.steps.length, end: 'skip' });
  close();
  renderMenu();
}
/** 사건 하나: 지금 단계의 조건이 맞으면 넘긴다 */
function hear(ev: TutEvent): void {
  if (!active) return;
  const s = active.steps[progressOf(active).i];
  if (s && condMet(s.until, ev)) next();
}

// ---------- 설정 창의 칸 (hud/settings.ts가 그린다) ----------
export function replayRows(list: HTMLElement): void {
  if (!defs.length) return;
  list.append(el('baghead', t('setHelp')));
  for (const d of defs) list.append(row(d.label?.() ?? t('tutName'), '', [button(t('tutReplay'), () => { replayTutorial(d.id); })]));
}
export const tutorialSig = (): unknown => [defs.length, active?.id];

export function initTutorial(): void {
  ready = true;
  document.body.insertAdjacentHTML('beforeend', `<div class="panel" id="tut" hidden><div class="note" id="tutN"></div><div id="tutText"></div>
    <div class="btns"><button type="button" id="tutNext" data-i18n="tutNext">${t('tutNext')}</button><button type="button" class="plain" id="tutSkip" data-i18n="tutSkip">${t('tutSkip')}</button></div></div>`);
  $('tutNext').addEventListener('click', (e) => { next(); (e.currentTarget as HTMLElement).blur(); });
  $('tutSkip').addEventListener('click', (e) => { skip(); (e.currentTarget as HTMLElement).blur(); });
  onSend((m) => hear({ kind: 'cmd', name: m.t }));
  window.addEventListener('keydown', (e) => { if (!(document.activeElement instanceof HTMLInputElement)) { const a = actionOf(e.key); if (a) hear({ kind: 'key', name: a }); } });
  onSlow(() => {
    if (!S.me) { if (active) $('tut').hidden = true; return; }
    if (active) { if ($('tut').hidden) draw(); hear({ kind: 'tick' }); return; }
    if (!S.me.ready) return;
    const d = defs.find((x) => progressOf(x).end === '' && (x.start?.() ?? true));
    if (d) begin(d);
  });
  onLangChange(draw);
}
