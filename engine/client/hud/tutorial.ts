// 튜토리얼 (선택: 게임이 addTutorial을 부를 때만 있다). 단계마다 안내 한 줄과 조건(사건·명령·단축키·물음), 화면 요소 강조, 건너뛰기와 다시 보기(설정 창).
// 진행은 이 기기에 저장한다 (플랫폼 저장소의 'tut:<id>' 칸: 다 보았거나 건너뛰었으면 다시 뜨지 않는다).
// 단계가 바뀔 때마다 onTutorial에 사건을 낸다 (start, step, done, skip): 분석을 받는 곳이 생기면 거기에 잇는다 (docs/genre-features.md 5.5).
// 안내 카드는 화면 아래 가운데에 뜬다. 게임을 막지 않는다: 그대로 놀면서 조건을 채우면 넘어간다.
// 튜토리얼 키트 (묶음 D, docs/making-a-game.md 27절): 단계의 모양 kind 'name'(이름 짓기: 입력·무작위·[이 이름으로]·[나중에], 서버의 이름 검사를 그대로 쓴다),
//   진행 읽기 tutReached(튜토리얼, 단계)(기능의 열림 조건이 쓴다: hud/unlocks.ts). 첫 편성·결과 창 설명은 보통 단계(target·when·until)로 적는다.
import { $ } from '../app';
import { actionOf, onMsg, onSlow } from '../bus';
import { L, onLangChange, t, type UiKey } from '../i18n';
import { onSend } from '../net';
import { rename } from '../actions';
import { randomName } from '../i18n';
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
  /** 강조할 화면 요소의 id (예: 'menuBtn'), 또는 그때그때 고르는 함수(화면마다 단추가 다를 때). 없으면 강조하지 않는다. 카드는 이 요소를 덮지 않는 자리로 비킨다 */
  target?: string | (() => string);
  /** 이 단계를 보일 때 (지금 모드·화면이 맞을 때만: 아니면 카드를 접어 두고, 맞으면 다시 보인다). 없으면 늘 */
  when?: () => boolean;
  /** 끝나는 조건. 없으면 '다음' 단추로 넘긴다 */
  until?: TutorialCond;
  /** 단계의 모양: 'name' 이름 짓기 (카드 안의 입력칸·무작위·[이 이름으로]·[나중에]: 이름이 바뀌거나 '나중에'면 끝난다). 없으면 글만 */
  kind?: 'name';
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
/** 지금 보이는 튜토리얼의 단계 id ('튜토리얼 id:단계 id'. 없으면 '') */
export const tutNow = (): string => { if (!active) return ''; const s = active.steps[progressOf(active).i]; return s ? `${active.id}:${s.id}` : ''; };
/**
 * 그 튜토리얼이 그 단계에 이르렀는가 (그 단계에 들어섰거나 지났다. 다 보았거나 건너뛰었으면 참. 없는 튜토리얼·단계면 거짓).
 * 기능의 열림 조건이 쓴다 (hud/unlocks.ts의 { tut: 'pact:squad' })
 */
export function tutReached(id: string, step: string): boolean {
  const d = defs.find((x) => x.id === id), k = d ? d.steps.findIndex((s) => s.id === step) : -1;
  if (!d || k < 0) return false;
  const p = progressOf(d);
  return p.end !== '' || p.i >= k;
}

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
  $('tutNext').hidden = !!s.until || s.kind === 'name';
  drawName(s);
  box.classList.toggle('tutForm', s.kind === 'name');
  const on = s.when?.() ?? true;
  box.hidden = !on;
  lit?.classList.remove('tutHi');
  const tid = typeof s.target === 'function' ? s.target() : s.target;
  lit = on && tid ? ($(tid) as HTMLElement | null) : null;
  lit?.classList.add('tutHi');
  dodge();
}
// ---------- 이름 짓기 단계 (kind 'name') ----------
/** 이름 짓기: 보낸 이름 (서버가 받아 내 이름이 그것이 되면 다음 단계) */
let wanted = '';
function drawName(s: TutorialStep): void {
  const box = $('tutName');
  box.hidden = s.kind !== 'name';
  if (box.hidden) return;
  const input = $<HTMLInputElement>('tutNameIn') as HTMLInputElement;
  if (!input.value && document.activeElement !== input) input.value = S.me?.name ?? '';
  $('tutNameRand').textContent = t('tkNameRandom'); $('tutNameOk').textContent = t('tkNameOk'); $('tutNameLater').textContent = t('tkNameLater');
  $('tutNameNote').textContent = t('tkNameNote');
}
function nameStep(): boolean { const s = active?.steps[progressOf(active).i]; return s?.kind === 'name'; }
function sendName(): void {
  const v = ($<HTMLInputElement>('tutNameIn') as HTMLInputElement).value.trim();
  if (!v || !S.me) return;
  if (v === S.me.name) { next(); return; }
  wanted = v;
  rename(v);
}

/** 카드가 강조한 요소를 덮으면 화면의 반대쪽 반으로 비킨다 (대상이 아래면 위로) */
function dodge(): void {
  const box = $('tut');
  box.classList.remove('tutUp', 'tutDown');
  // 이름 짓기(입력칸이 있는 카드)는 위에 둔다: 폰의 글자판이 아래를 덮고, 아래 띠·진행 단추를 가리지 않게
  if (box.classList.contains('tutForm') && !box.hidden) { box.classList.add('tutUp'); return; }
  if (box.hidden || !lit || !lit.offsetParent) return;
  const a = box.getBoundingClientRect(), b = lit.getBoundingClientRect();
  if (a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top) return;
  box.classList.add(b.top + b.height / 2 > platform().display.viewport().h / 2 ? 'tutUp' : 'tutDown');
}
/** 건너뛰기는 한 번 더 눌러야 한다 (대상 단추를 누르려다 잘못 누르지 않게) */
let skipArmed = 0;
function askSkip(): void {
  const b = $('tutSkip');
  if (skipArmed && performance.now() - skipArmed < 4000) { skipArmed = 0; b.textContent = t('tutSkip'); skip(); return; }
  skipArmed = performance.now();
  b.textContent = t('tutSkipAsk');
  setTimeout(() => { if (skipArmed && performance.now() - skipArmed >= 3900) { skipArmed = 0; b.textContent = t('tutSkip'); } }, 4000);
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
  // 건너뛰기는 카드 머리의 오른쪽 작은 글 단추 (엄지 자리의 '다음'과 떨어지게), 한 번 더 눌러야 건너뛴다
  document.body.insertAdjacentHTML('beforeend', `<div class="panel" id="tut" hidden><div class="tutHead"><div class="note" id="tutN"></div><button type="button" class="plain" id="tutSkip" data-i18n="tutSkip">${t('tutSkip')}</button></div><div id="tutText"></div>
    <div id="tutName" class="tutName" hidden><input id="tutNameIn" maxlength="16" autocomplete="off" enterkeyhint="done"><div class="btns"><button type="button" class="btn-secondary" id="tutNameRand"></button><button type="button" class="btn-primary" id="tutNameOk"></button></div>
    <div class="tutNameFoot"><span class="note" id="tutNameNote"></span><button type="button" class="btn-ghost" id="tutNameLater"></button></div></div>
    <div class="btns"><button type="button" id="tutNext" data-i18n="tutNext">${t('tutNext')}</button></div></div>`);
  $('tutNameRand').addEventListener('click', () => { ($<HTMLInputElement>('tutNameIn') as HTMLInputElement).value = randomName(); });
  $('tutNameOk').addEventListener('click', sendName);
  $('tutNameIn').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') sendName(); });
  $('tutNameLater').addEventListener('click', () => { if (nameStep()) next(); });
  $('tutNext').addEventListener('click', (e) => { next(); (e.currentTarget as HTMLElement).blur(); });
  $('tutSkip').addEventListener('click', (e) => { askSkip(); (e.currentTarget as HTMLElement).blur(); });
  onSend((m) => hear({ kind: 'cmd', name: m.t }));
  window.addEventListener('keydown', (e) => { if (!(document.activeElement instanceof HTMLInputElement)) { const a = actionOf(platform().input.keyName(e)); if (a) hear({ kind: 'key', name: a }); } });
  onSlow(() => {
    if (!S.me) { if (active) $('tut').hidden = true; return; }
    if (active) {
      // 이름 짓기: 서버가 받아 내 이름이 보낸 이름이 되면 다음
      if (wanted && nameStep() && S.me.name === wanted) { wanted = ''; next(); return; }
      draw(); hear({ kind: 'tick' }); return;
    }
    if (!S.me.ready) return;
    const d = defs.find((x) => progressOf(x).end === '' && (x.start?.() ?? true));
    if (d) begin(d);
  });
  onLangChange(draw);
}
