// 설정 창: 메뉴의 '설정' 탭 (어느 게임에나 늘 맨 뒤에 보인다: MenuTab.always). 소리·음량, 그래픽 품질(그림자·해상도 상한·그리는 거리), 흔들림 끄기, 글자 크기,
// 단축키 재설정, 게임이 더한 칸(addSetting), 튜토리얼 다시 보기, 약관, 내 데이터(내보내기·삭제)를 한곳에 둔다.
// 값은 이 기기에 둔다 (플랫폼 저장소의 'settings' 칸: 셈은 ./settingscalc.ts). 처음 값은 이 창이 생기기 전과 같다 (그림자 켬, 배율 2까지, 320m, 배율 1, 키 그대로).
import { $, view } from '../app';
import { actionOf, keyList, onSlow, setKeyMap } from '../bus';
import { setCalm } from '../fx';
import { L, isTouch, onLangChange, t, type UiKey } from '../i18n';
import { platform } from '../platform';
import { hasMusic } from '../assets';
import { onSoundChange, setSoundMix, setSoundOn, soundMix, soundOn } from '../sound';
import { S } from '../state';
import { legalRows, myDataRows, myDataSig } from './legal';
import { addMenuTab, renderMenu } from './menu';
import { button, chips, el, row } from './menu/parts';
import { replayRows, tutorialSig } from './tutorial';
import { FAR_STEPS, PIXEL_STEPS, QUALITIES, RESERVED_KEYS, UI_STEPS, gfxOf, keyLabel, qualityOf, readSettings, writeSettings, type Quality, type Settings } from './settingscalc';

const STORE_KEY = 'settings';
const cap = (): number => platform().display.pixelRatioCap();
let cur: Settings = readSettings(null);
/** 키를 기다리는 기능 (재설정 중) */
let waitKey: string | null = null;

/** 게임이 더하는 설정 칸 */
export type SettingDef =
  | { id: string; label: () => string; note?: () => string; kind: 'toggle'; value: boolean; on: (v: boolean) => void }
  | { id: string; label: () => string; note?: () => string; kind: 'select'; value: string; options: readonly { value: string; label: () => string }[]; on: (v: string) => void }
  | { id: string; label: () => string; note?: () => string; kind: 'range'; value: number; min: number; max: number; step: number; on: (v: number) => void };
const extras: SettingDef[] = [];

/**
 * 게임의 설정 칸을 더한다 (게임의 화면 모듈의 init에서). 값은 이 기기에 저장되고, 더할 때 저장된 값(없으면 value)으로 on이 한 번 불린다. 예:
 *   addSetting({ id: 'names', label: () => t('showNames'), kind: 'toggle', value: true, on: (v) => document.body.classList.toggle('noNames', !v) })
 */
export function addSetting(def: SettingDef): void {
  extras.push(def);
  const v = cur.extra[def.id];
  if (def.kind === 'toggle') def.on(typeof v === 'boolean' ? v : def.value);
  else if (def.kind === 'select') def.on(typeof v === 'string' && def.options.some((o) => o.value === v) ? v : def.value);
  else def.on(typeof v === 'number' && Number.isFinite(v) ? Math.min(def.max, Math.max(def.min, v)) : def.value);
}
/** 게임 칸의 지금 값 */
export function settingValue(id: string): unknown {
  const d = extras.find((x) => x.id === id);
  return cur.extra[id] ?? (d ? d.value : undefined);
}

function save(): void { platform().storage.set(STORE_KEY, writeSettings(cur)); }

/** 화면 배율을 걸 요소: 창과 단추들(#hud), 접속 화면, 직업 고르기, 튜토리얼 카드. 3D 화면과 이름표는 그대로 */
const SCALED = ['hud', 'gate', 'classPick', 'tut', 'legal', 'keepSafe'];
/** 지금 값을 화면에 건다 */
function apply(): void {
  if (view) view.setQuality(cur.gfx, platform().display.pixelRatio());
  if (cur.calm !== null) setCalm(cur.calm);
  for (const id of SCALED) {
    const e = $(id) as (HTMLElement & { style: CSSStyleDeclaration & { zoom?: string } }) | null;
    if (e) e.style.zoom = cur.ui === 1 ? '' : String(cur.ui); // 배율 1이면 아무것도 걸지 않는다 (예전과 같다)
  }
  setKeyMap(cur.keys);
}
function set(fn: (s: Settings) => void): void { fn(cur); save(); apply(); renderMenu(); }

/** 단축키의 이름 (틀의 키는 기능의 이름, 게임의 키는 게임이 준 이름) */
function actionName(a: string, label?: () => string): string {
  if (label) return label();
  const named: Record<string, UiKey> = { m: 'keyMenu', n: 'keyMap', h: 'keyHome', tab: 'keyTarget', q: 'keyPotion', b: 'keyBag', r: 'keyAuto' };
  if (named[a]) return t(named[a]);
  if (/^[1-9]$/.test(a)) return L().fmt.keySkill(Number(a));
  return L().fmt.keyGame(keyLabel(a));
}

/** 켬·끔 단추 둘 */
const onOff = (v: boolean, set: (v: boolean) => void): HTMLElement => chips([{ text: t('on'), on: v, click: () => set(true) }, { text: t('off'), on: !v, click: () => set(false) }]);
function slider(label: string, value: number, min: number, max: number, step: number, input: (v: number) => void, done: (v: number) => void): HTMLInputElement {
  const r = document.createElement('input');
  r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(value);
  r.setAttribute('aria-label', label);
  r.addEventListener('input', () => input(Number(r.value)));
  r.addEventListener('change', () => { done(Number(r.value)); r.blur(); });
  return r;
}

function drawSettings(list: HTMLElement): void {
  const g = cur.gfx, q = qualityOf(g, cap());
  // 소리
  list.append(el('baghead', t('setSound')));
  list.append(row(t('setSound'), '', [onOff(soundOn(), setSoundOn)]));
  const mix = soundMix();
  list.append(row(t('volSfx'), '', [slider(t('volSfx'), Math.round(mix.sfx * 100), 0, 100, 5, (v) => setSoundMix({ sfx: v / 100 }, false), (v) => setSoundMix({ sfx: v / 100 }))]));
  if (hasMusic()) list.append(row(t('volMusic'), '', [slider(t('volMusic'), Math.round(mix.music * 100), 0, 100, 5, (v) => setSoundMix({ music: v / 100 }, false), (v) => setSoundMix({ music: v / 100 }))]));
  // 그래픽
  list.append(el('baghead', t('setGraphics')));
  const qName: Record<Quality | 'custom', UiKey> = { high: 'qHigh', mid: 'qMid', low: 'qLow', custom: 'qCustom' };
  list.append(row(t('setQuality'), q === 'custom' ? t('qCustom') : '', [chips(QUALITIES.map((x) => ({ text: t(qName[x]), on: q === x, click: () => set((s) => { s.gfx = gfxOf(x, cap()); }) })))]));
  list.append(row(t('setShadows'), '', [onOff(g.shadows, (v) => set((s) => { s.gfx = { ...s.gfx, shadows: v }; }))]));
  list.append(row(t('setPixel'), L().fmt.pixelNow(platform().display.pixelRatio()), [chips(PIXEL_STEPS.filter((p) => p <= cap()).map((p) => ({ text: `×${p}`, on: g.pixelRatio === p, click: () => set((s) => { s.gfx = { ...s.gfx, pixelRatio: p }; }) })))]));
  const farName: UiKey[] = ['farNear', 'farMid', 'farFar'];
  list.append(row(t('setFar'), '', [chips(FAR_STEPS.map((f, i) => ({ text: t(farName[i]), on: g.far === f, click: () => set((s) => { s.gfx = { ...s.gfx, far: f }; }) })))]));
  // 화면
  list.append(el('baghead', t('setScreen')));
  const calmNow = cur.calm ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  list.append(row(t('setCalm'), '', [onOff(calmNow, (v) => set((s) => { s.calm = v; }))]));
  list.append(row(t('setUi'), '', [chips(UI_STEPS.map((u) => ({ text: `${Math.round(u * 100)}%`, on: cur.ui === u, click: () => set((s) => { s.ui = u; }) })))]));
  const fs = platform().display.fullscreen;
  if (platform().has('display.fullscreen')) list.append(row(t('setFullscreen'), '', [onOff(fs.is(), (v) => { void fs.set(v).then(() => renderMenu()); })]));
  // 단축키 (키보드가 있는 기기)
  if (!isTouch()) {
    list.append(el('baghead', t('setKeys')), el('note', t('setKeysHint')));
    for (const k of keyList()) {
      const btn = button(waitKey === k.action ? t('setKeyWait') : keyLabel(k.key), () => { waitKey = waitKey === k.action ? null : k.action; renderMenu(); });
      btn.classList.toggle('on', waitKey === k.action);
      list.append(row(actionName(k.action, k.label), k.key !== k.action ? L().fmt.keyWas(keyLabel(k.action)) : '', [btn]));
    }
    if (Object.keys(cur.keys).length) list.append(button(t('setKeysReset'), () => set((s) => { s.keys = {}; })));
  }
  // 게임이 더한 칸
  if (extras.length) {
    list.append(el('baghead', t('setGame')));
    for (const d of extras) {
      const v = settingValue(d.id);
      const put = (x: unknown) => set((s) => { s.extra[d.id] = x; });
      if (d.kind === 'toggle') list.append(row(d.label(), d.note?.() ?? '', [onOff(v === true, (x) => { put(x); d.on(x); })]));
      else if (d.kind === 'select') list.append(row(d.label(), d.note?.() ?? '', [chips(d.options.map((o) => ({ text: o.label(), on: v === o.value, click: () => { put(o.value); d.on(o.value); } })))]));
      else list.append(row(d.label(), d.note?.() ?? '', [slider(d.label(), Number(v), d.min, d.max, d.step, (x) => d.on(x), (x) => { put(x); d.on(x); })]));
    }
  }
  replayRows(list);
  legalRows(list);
  myDataRows(list);
}

/** 재설정 중에 누른 키를 받는다 (다른 단축키보다 먼저: 잡은 키는 그 기능을 부르지 않는다) */
function captureKey(ev: KeyboardEvent): void {
  if (!waitKey) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const k = ev.key.toLowerCase(), a = waitKey;
  waitKey = null;
  if (k === 'escape' || RESERVED_KEYS.includes(k) || k.length > 12) { renderMenu(); return; }
  set((s) => {
    // 그 키를 이미 쓰던 기능은 처음 키로 돌아간다 (한 키가 두 기능을 부르지 않게)
    const owner = actionOf(k);
    if (owner && owner !== a) delete s.keys[owner];
    if (k === a) delete s.keys[a]; else s.keys[a] = k;
  });
}

export function initSettings(): void {
  cur = readSettings(platform().storage.get(STORE_KEY), cap());
  apply();
  addMenuTab({ id: 'settings', label: () => t('tabSettings'), draw: drawSettings, always: true, sig: () => [cur, soundOn(), soundMix(), waitKey, myDataSig(), tutorialSig(), extras.length] });
  window.addEventListener('keydown', captureKey, { capture: true });
  onSoundChange(() => renderMenu());
  onLangChange(() => renderMenu());
  // 창 밖에서 기다리던 키 재설정은 그만둔다 (메뉴를 닫았다)
  onSlow(() => { if (waitKey && (!S.me || $('menu').hidden)) waitKey = null; });
}
