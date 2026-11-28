// 화면의 바탕 패널들: 내 정보, 대상 정보, 기술 버튼, 접속 화면, 언어 선택.
// 게임이 내 정보 창에 덧붙이는 줄과 게임의 창(이 게임에서는 등탑 창, 습격 알림, 구역 알림: games/deungbul/client/hud/)은 게임의 모듈이 bus에 스스로 등록해 그린다.
import { SKILL_SLOTS, classOf, isClassId } from '../../shared/defs';
import { nextTarget, rename, useSkill } from '../actions';
import { $, clamp, view } from '../app';
import { bindKey, onFrame, onSlow } from '../bus';
import { hasModule } from '../mods';
import { L, LOCALES, onLangChange, setLang, t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { S } from '../state';
import { itemIcon } from './icons';
import { artUrl } from '../art';
import { connStop, gateKind, type GateKind } from './conn';
import { showNumber } from './reward';

/** 재화의 그림('cur:gold', 'cur:second')을 글자 앞에 한 번 붙인다. 게임의 모듈이 시트를 등록한 뒤에야 있으므로 그릴 때마다 보고, 붙였으면 그만 본다 */
const placed = new Map<string, HTMLElement>();
function placeCurrencyIcons(): void {
  for (const [key, at] of [['cur:gold', ui.gold], ['cur:second', ui.coin]] as const) {
    if (!at) continue; // 재화가 없는 게임
    let pic = placed.get(key);
    if (!pic) {
      // 게임이 css로 감춘 표시(등불지기의 #coin)에는 붙이지 않는다
      if (!at.hidden && getComputedStyle(at).display === 'none') continue;
      const made = itemIcon(key, '', 'sm');
      if (!made) continue;
      pic = made;
      at.before(pic);
      placed.set(key, pic);
    }
    pic.hidden = at.hidden; // 두 번째 재화를 쓰지 않는 게임에서는 표시와 함께 숨는다
  }
}

/** 화면의 요소들. initMe에서 잡는다 (게임이 자기 창을 붙인 뒤여도 되게, 모듈이 읽히는 때에 잡지 않는다). 고르지 않은 모듈의 칸(체력, 재화 …)은 null이다 */
let ui: Record<'hpb' | 'xpb' | 'hpt' | 'lv' | 'status' | 'myName' | 'tgt' | 'tname' | 'thp' | 'tbar' | 'gold' | 'coin', HTMLElement>;
let skillUi: { name: HTMLElement; cd: HTMLElement; time: HTMLElement; button: HTMLButtonElement }[] = [];

// ---------- 접속 화면 ----------
/**
 * 접속 화면을 보인다. kind는 모양(돌림·끊김·점검·업데이트·멈춤: hud/conn.ts). 주지 않으면 글로 고른다 (접속 중은 wait, 그 밖은 stop).
 * 끊겨 다시 잇는 중의 화면은 hud/conn.ts의 connLost가 그린다
 */
export function showGate(msg: UiKey, retry: boolean, kind?: GateKind): void {
  const el = $('gateMsg');
  el.setAttribute('data-i18n', msg); // 언어를 바꿔도 따라 바뀌게 한다
  el.textContent = t(msg);
  $('gate').hidden = false;
  $('hud').hidden = true;
  const btn = $<HTMLButtonElement>('joinBtn');
  btn.hidden = !retry; btn.disabled = false;
  if (retry && btn.getAttribute('data-i18n') === 'connNow') { btn.setAttribute('data-i18n', 'reconnect'); btn.textContent = t('reconnect'); }
  const k = kind ?? (msg === 'connecting' ? 'wait' : 'stop');
  if (k !== 'wait' && k !== 'lost') connStop(); // 점검·업데이트·밀려남: 끊김의 셈을 멈춘다
  gateKind(k);
}
export function hideGate(): void {
  $('gate').hidden = true;
  $('hud').hidden = false;
}

export function setMyName(name: string): void { ui.myName.textContent = name; }

// ---------- 처음 한 번 ----------
export function initMe(): void {
  ui = {
    hpb: $('hpb'), xpb: $('xpb'), hpt: $('hpt'), lv: $('lv'), status: $('status'), myName: $('myName'),
    tgt: $('tgt'), tname: $('tname'), thp: $('thp'), tbar: $('tbar'), gold: $('gold'), coin: $('coin'),
  };
  // 기술 버튼과 그 단축키(숫자), 대상 고르기(Tab): 전투 모듈의 것
  const skillsEl = $('skills');
  if (hasModule('combat')) {
    for (let i = 0; i < SKILL_SLOTS && i < 9; i++) bindKey(String(i + 1), () => useSkill(i));
    bindKey('tab', nextTarget);
  }
  skillUi = !hasModule('combat') ? [] : Array.from({ length: SKILL_SLOTS }, (_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skill';
    b.innerHTML = `<span class="k">${i + 1}</span><span class="n"></span><span class="cd"></span><span class="t"></span>`;
    b.addEventListener('click', () => { useSkill(i); b.blur(); });
    skillsEl.appendChild(b);
    return { button: b, name: b.querySelector<HTMLElement>('.n')!, cd: b.querySelector<HTMLElement>('.cd')!, time: b.querySelector<HTMLElement>('.t')! };
  });
  $('tabBtn')?.addEventListener('click', nextTarget);

  // 이름 바꾸기
  const form = $<HTMLFormElement>('renameForm'), input = $<HTMLInputElement>('renameInput');
  ui.myName.addEventListener('click', () => {
    if (!S.me) return;
    form.hidden = !form.hidden;
    if (!form.hidden) { input.value = S.me.name; input.focus(); input.select(); }
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    rename(input.value);
    form.hidden = true;
    input.blur();
  });

  // 언어 선택
  const sel = $<HTMLSelectElement>('lang');
  for (const l of LOCALES) sel.add(new Option(l.label, l.code, false, l.code === L().code));
  sel.addEventListener('change', () => { setLang(sel.value); sel.blur(); });

  renderTexts();
  onFrame(hudFrame);
  onSlow(hudSlow);
  onLangChange(renderTexts);
}

/** 기술 단추의 그림 'skill:<기술 id>' (art2). 없으면 글자만 (지금 그대로) */
function skillArt(b: HTMLButtonElement, id: string): void {
  const url = artUrl(`skill:${id}`);
  let img = b.querySelector<HTMLImageElement>('img.skArt');
  b.classList.toggle('hasArt', !!url);
  if (!url) { img?.remove(); return; }
  if (!img) { img = document.createElement('img'); img.className = 'skArt'; img.alt = ''; img.setAttribute('aria-hidden', 'true'); b.prepend(img); }
  if (img.getAttribute('src') !== url) img.src = url;
}

/** 언어에 따라 달라지는 글자를 다시 쓴다 (처음, 그리고 언어가 바뀔 때). */
export function renderTexts(): void {
  const loc = L();
  // 기술 칸에 든 기술은 직업마다 다르다
  classOf(S.me?.cls ?? '').skills.forEach((id, i) => {
    const text = loc.skills[id];
    if (!skillUi[i] || !text) return;
    skillUi[i].name.textContent = text.name;
    skillUi[i].button.title = text.info;
    skillUi[i].button.setAttribute('aria-label', loc.fmt.skillLabel(text.name, text.info, i + 1));
    skillArt(skillUi[i].button, id);
  });
  hudSlow(performance.now());
}

/** 매 프레임 바뀌는 것: 막대, 대상 정보, 쿨다운. */
export function hudFrame(now: number): void {
  const me = S.me;
  const target = me?.attackId ? S.others.get(me.attackId) : undefined;
  view.targetRing.visible = !!target;
  if (ui.tgt) ui.tgt.hidden = !target;
  if (target && ui.tgt) {
    view.targetRing.position.set(target.x, 0.08, target.z);
    view.targetRing.rotation.y = now / 1000;
    ui.tname.textContent = target.name;
    ui.thp.textContent = `${target.hp} / ${target.maxHp}`;
    ui.tbar.style.transform = `scaleX(${clamp(target.hp / target.maxHp, 0, 1)})`;
  }
  if (me) {
    if (ui.hpb) ui.hpb.style.transform = `scaleX(${clamp(me.hp / me.maxHp, 0, 1)})`;
    if (ui.xpb) ui.xpb.style.transform = `scaleX(${clamp(me.exp / me.need, 0, 1)})`;
  }
  skillUi.forEach((s, i) => {
    const left = S.cdEnd[i] - now;
    s.cd.style.transform = `scaleY(${left > 0 ? left / S.cdLen[i] : 0})`;
    s.button.classList.toggle('cooling', left > 0); // 남은 시간 숫자가 기술 이름과 겹치지 않게 이름을 흐린다
    s.time.textContent = left > 0 ? String(Math.ceil(left / 1000)) : '';
  });
}

/** 재화 숫자를 마지막으로 쓴 언어 (언어가 바뀌면 굴리지 않고 글만 다시 쓴다) */
let numLang = '';
/** 1초에 몇 번이면 되는 것: 숫자 글자. */
export function hudSlow(_now: number): void {
  const loc = L(), me = S.me;
  ui.status.textContent = loc.fmt.status(S.online || '–', S.others.size, S.pingMs < 0 ? '–' : S.pingMs + 'ms');

  if (!me) return;
  // 칸마다 그 모듈을 고른 게임에만 있다 (뼈대의 data-mod)
  if (ui.hpt) ui.hpt.textContent = `${me.hp} / ${me.maxHp}`;
  if (ui.lv) ui.lv.textContent = hasModule('growth') ? loc.fmt.level(me.lv, isClassId(me.cls) ? loc.classes[me.cls].name : '') : isClassId(me.cls) ? loc.classes[me.cls].name : '';
  // 바뀐 재화는 굴리고 곁에 +n (U2: hud/reward.ts). 내 상태를 받기 전(0 → 가진 것)·언어를 바꾼 때는 글만
  const live = me.ready && numLang === loc.code;
  numLang = loc.code;
  if (ui.gold) showNumber(ui.gold, me.gold, loc.fmt.gold, live);
  // 두 번째 재화: 이름표에 currency2가 있는 게임만. 자기 표시를 따로 그리는 게임(등불지기)은 css로 #coin을 감춘다
  if (ui.coin) {
    const coin = loc.fmt.coinHave(me.sparks);
    ui.coin.hidden = !coin;
    if (coin) showNumber(ui.coin, me.sparks, loc.fmt.coinHave, live); else ui.coin.textContent = '';
  }
  placeCurrencyIcons();
}
