// 화면의 바탕 패널들: 내 정보, 대상 정보, 기술 버튼, 접속 화면, 언어 선택.
// 게임이 내 정보 창에 덧붙이는 줄과 게임의 창(이 게임에서는 등탑 창, 습격 알림, 구역 알림: games/deungbul/client/hud/)은 게임의 모듈이 bus에 스스로 등록해 그린다.
import { SKILL_SLOTS, classOf, isClassId } from '../../shared/defs';
import { nextTarget, rename, useSkill } from '../actions';
import { $, clamp, view } from '../app';
import { onFrame, onSlow } from '../bus';
import { L, LOCALES, onLangChange, setLang, t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { S } from '../state';

/** 화면의 요소들. initMe에서 잡는다 (게임이 자기 창을 붙인 뒤여도 되게, 모듈이 읽히는 때에 잡지 않는다) */
let ui: Record<'hpb' | 'xpb' | 'hpt' | 'lv' | 'status' | 'myName' | 'tgt' | 'tname' | 'thp' | 'tbar' | 'gold' | 'coin', HTMLElement>;
let skillUi: { name: HTMLElement; cd: HTMLElement; time: HTMLElement; button: HTMLButtonElement }[] = [];

// ---------- 접속 화면 ----------
export function showGate(msg: UiKey, retry: boolean): void {
  const el = $('gateMsg');
  el.setAttribute('data-i18n', msg); // 언어를 바꿔도 따라 바뀌게 한다
  el.textContent = t(msg);
  $('gate').hidden = false;
  $('hud').hidden = true;
  $('joinBtn').hidden = !retry;
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
  // 기술 버튼
  const skillsEl = $('skills');
  skillUi = Array.from({ length: SKILL_SLOTS }, (_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skill';
    b.innerHTML = `<span class="k">${i + 1}</span><span class="n"></span><span class="cd"></span><span class="t"></span>`;
    b.addEventListener('click', () => { useSkill(i); b.blur(); });
    skillsEl.appendChild(b);
    return { button: b, name: b.querySelector<HTMLElement>('.n')!, cd: b.querySelector<HTMLElement>('.cd')!, time: b.querySelector<HTMLElement>('.t')! };
  });
  $('tabBtn').addEventListener('click', nextTarget);

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

/** 언어에 따라 달라지는 글자를 다시 쓴다 (처음, 그리고 언어가 바뀔 때). */
export function renderTexts(): void {
  const loc = L();
  // 기술 칸에 든 기술은 직업마다 다르다
  classOf(S.me?.cls ?? '').skills.forEach((id, i) => {
    const text = loc.skills[id];
    skillUi[i].name.textContent = text.name;
    skillUi[i].button.title = text.info;
    skillUi[i].button.setAttribute('aria-label', loc.fmt.skillLabel(text.name, text.info, i + 1));
  });
  hudSlow(performance.now());
}

/** 매 프레임 바뀌는 것: 막대, 대상 정보, 쿨다운. */
export function hudFrame(now: number): void {
  const me = S.me;
  const target = me?.attackId ? S.others.get(me.attackId) : undefined;
  view.targetRing.visible = !!target;
  ui.tgt.hidden = !target;
  if (target) {
    view.targetRing.position.set(target.x, 0.08, target.z);
    view.targetRing.rotation.y = now / 1000;
    ui.tname.textContent = target.name;
    ui.thp.textContent = `${target.hp} / ${target.maxHp}`;
    ui.tbar.style.transform = `scaleX(${clamp(target.hp / target.maxHp, 0, 1)})`;
  }
  if (me) {
    ui.hpb.style.transform = `scaleX(${clamp(me.hp / me.maxHp, 0, 1)})`;
    ui.xpb.style.transform = `scaleX(${clamp(me.exp / me.need, 0, 1)})`;
  }
  skillUi.forEach((s, i) => {
    const left = S.cdEnd[i] - now;
    s.cd.style.transform = `scaleY(${left > 0 ? left / S.cdLen[i] : 0})`;
    s.button.classList.toggle('cooling', left > 0); // 남은 시간 숫자가 기술 이름과 겹치지 않게 이름을 흐린다
    s.time.textContent = left > 0 ? String(Math.ceil(left / 1000)) : '';
  });
}

/** 1초에 몇 번이면 되는 것: 숫자 글자. */
export function hudSlow(_now: number): void {
  const loc = L(), me = S.me;
  ui.status.textContent = loc.fmt.status(S.online || '–', S.others.size, S.pingMs < 0 ? '–' : S.pingMs + 'ms');

  if (!me) return;
  ui.hpt.textContent = `${me.hp} / ${me.maxHp}`;
  ui.lv.textContent = loc.fmt.level(me.lv, isClassId(me.cls) ? loc.classes[me.cls].name : '');
  ui.gold.textContent = loc.fmt.gold(me.gold);
  // 두 번째 재화: 이름표에 currency2가 있는 게임만. 자기 표시를 따로 그리는 게임(등불지기)은 css로 #coin을 감춘다
  const coin = loc.fmt.coinHave(me.sparks);
  ui.coin.hidden = !coin;
  ui.coin.textContent = coin;
}
