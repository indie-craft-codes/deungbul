// 화면의 패널들: 내 정보, 대상 정보, 기술 버튼, 등탑 창, 습격 알림, 접속 화면, 언어 선택.
import { RAID } from '../../../shared/defs';
import { CONTRIB_TIERS, GLOW_BRIGHT, GLOW_BRIGHT_REGEN, GLOW_BRIGHT_SPEED, GLOW_MAX, RESIDENTS, SKILL_SLOTS, TOWER_REACH, classOf, isClassId } from '../../../shared/defs';
import { TOWERS } from '../../../shared/world';
import { nextTarget, offer, rename, useSkill } from '../actions';
import { $, clamp, view } from '../app';
import { G } from '../game/state';
import { L, LOCALES, clock, setLang, t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { S, myZone, raidLeft, stage, zoneGlow } from '../state';
import { banner } from './notify';

const ui = {
  hpb: $('hpb'), xpb: $('xpb'), hpt: $('hpt'), lv: $('lv'), sparks: $('sparks'), contrib: $('contrib'), status: $('status'), myName: $('myName'),
  tgt: $('tgt'), tname: $('tname'), thp: $('thp'), tbar: $('tbar'),
  raid: $('raid'), raidText: $('raidText'), raidHp: $('raidHp'), raidBar: $('raidBar'), raidMini: $('raidMini'),
  tower: $('tower'), towerMini: $('towerMini'),
};
/** 지금 그려 둔 구역. 구역을 넘어가면 등탑 창을 다시 그린다 */
let shownZone = -1;
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
export function initPanels(): void {
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

  // 등탑에 불씨 바치기
  for (const [to, key] of [['tower', 'T'], ['resident', 'R']] as const) {
    $(`offer${key}1`).addEventListener('click', () => offer(to, 1));
    $(`offer${key}5`).addEventListener('click', () => offer(to, 5));
    $(`offer${key}All`).addEventListener('click', () => offer(to, Infinity));
  }

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
  renderWorld();
  hudSlow(performance.now());
}

/** 공유 상태(등탑, 주민)가 바뀌었거나 다른 구역으로 넘어갔을 때 다시 그린다. 등탑 창은 내가 있는 구역의 등탑을 보여 준다. */
export function renderWorld(): void {
  const loc = L(), { residents } = S.world.tower, zone = myZone(), glow = zoneGlow(), st = stage();
  shownZone = zone;
  ui.towerMini.textContent = glow > 0 ? loc.fmt.towerMini(st, glow) : `${loc.towers[TOWERS[zone].id] ?? loc.ui.tower}: ${loc.ui.towerOff}`;
  $('towerTitle').textContent = loc.towers[TOWERS[zone].id] ?? loc.ui.tower;
  $('glowText').textContent = glow > 0 ? loc.fmt.glow(st, glow, GLOW_MAX) : `${loc.ui.towerOff} · 0 / ${GLOW_MAX}`;
  $('glowBar').style.transform = `scaleX(${glow / GLOW_MAX})`;
  $('stageNote').textContent = glow > 0 ? loc.fmt.stageNote(st, GLOW_BRIGHT, Math.round((GLOW_BRIGHT_SPEED - 1) * 100), GLOW_BRIGHT_REGEN) : loc.ui.towerDark;
  $('villageBox').hidden = zone !== 0; // 주민과 등탑지기의 일은 첫불 마을 등탑에만 있다
  const next = RESIDENTS.findIndex((def, i) => residents[i] < def.need);
  $('resBtns').hidden = next < 0;
  if (next < 0) {
    $('resName').textContent = loc.ui.residents;
    $('resText').textContent = loc.ui.allReturned;
    $('resBar').style.transform = 'scaleX(1)';
    $('resNote').textContent = RESIDENTS.map((r) => loc.residents[r.id].bonus).join(' · ');
  } else {
    const def = RESIDENTS[next], text = loc.residents[def.id];
    $('resName').textContent = loc.fmt.nextResident(text.name);
    $('resText').textContent = `${residents[next]} / ${def.need}`;
    $('resBar').style.transform = `scaleX(${residents[next] / def.need})`;
    $('resNote').textContent = loc.fmt.whenBack(text.bonus);
  }
  // 오늘의 등탑지기: 등탑지기 할멈이 돌아온 뒤에만 보인다
  const halmeom = RESIDENTS.findIndex((r) => r.id === 'halmeom');
  const open = residents[halmeom] >= RESIDENTS[halmeom].need;
  $('keepBox').hidden = !open;
  if (open) {
    const list = S.world.keepers;
    $('keepList').textContent = list.length ? list.map((k) => loc.fmt.keeper(k.name, k.n)).join(' · ') : loc.ui.keepersEmpty;
  }
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

/** 1초에 몇 번이면 되는 것: 숫자 글자, 등탑 창을 열지 말지, 습격 알림. */
export function hudSlow(now: number): void {
  const loc = L(), me = S.me, raid = S.world.raid;
  ui.status.textContent = loc.fmt.status(S.online || '–', S.others.size, S.pingMs < 0 ? '–' : S.pingMs + 'ms');

  // 습격: 진행 중이거나 곧 시작이면 가운데 위에 크게, 평소에는 다음 시각만 작게
  const left = raidLeft(now);
  ui.raid.hidden = raid.phase === 'idle';
  ui.raid.classList.toggle('active', raid.phase === 'active');
  if (raid.phase === 'active') {
    ui.raidText.textContent = loc.fmt.raidActive(raid.foes, clock(left));
    ui.raidHp.textContent = loc.fmt.towerHp(raid.towerHp, raid.towerMaxHp);
    ui.raidBar.style.transform = `scaleX(${raid.towerMaxHp ? raid.towerHp / raid.towerMaxHp : 0})`;
  } else if (raid.phase === 'soon') {
    ui.raidText.textContent = loc.fmt.raidSoon(Math.ceil(left));
    ui.raidHp.textContent = '';
  }
  ui.raidHp.parentElement!.hidden = raid.phase !== 'active';
  const at = new Date(Date.now() + left * 1000);
  ui.raidMini.textContent = raid.phase === 'idle'
    ? loc.fmt.raidNext(at.toLocaleTimeString(loc.code, { hour: '2-digit', minute: '2-digit' }), at.getDate() !== new Date().getDate(), RAID.hours.length)
    : '';

  if (!me) return;
  if (myZone() !== shownZone) {
    // 다른 구역에 들어섰다: 어디인지, 위험한 곳인지 크게 알린다
    const zone = myZone(), dark = zoneGlow() === 0;
    renderWorld();
    banner(loc.zones[zone] ?? '', dark ? 'bad' : '', dark ? loc.ui.zoneDark : '');
  }
  ui.hpt.textContent = `${me.hp} / ${me.maxHp}`;
  ui.lv.textContent = loc.fmt.level(me.lv, isClassId(me.cls) ? loc.classes[me.cls].name : '');
  ui.sparks.textContent = loc.fmt.sparks(me.sparks);
  ui.contrib.textContent = loc.fmt.contrib(G.contrib);
  $('gold').textContent = loc.fmt.gold(me.gold);
  $('rested').textContent = G.rested > 0 ? loc.fmt.rested(G.rested) : '';
  $('tierText').textContent = loc.fmt.tier(G.tier, CONTRIB_TIERS[G.tier]?.need ?? null);
  // 등탑 가까이에 있을 때만 바치기 창을 연다
  const tower = TOWERS[myZone()];
  const near = Math.hypot(me.x - tower.x, me.z - tower.z) <= TOWER_REACH;
  ui.tower.hidden = !near;
  if (near) {
    const none = me.sparks < 1;
    for (const id of ['offerT1', 'offerT5', 'offerTAll']) $<HTMLButtonElement>(id).disabled = none;
    for (const id of ['offerR1', 'offerR5', 'offerRAll']) $<HTMLButtonElement>(id).disabled = none;
  }
}
