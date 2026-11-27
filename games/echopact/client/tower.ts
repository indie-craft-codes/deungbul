// 두 게임의 화면 (이 게임의 몫). 계약의 탑(A)은 수집형 RPG의 흐름이다:
//   홈(로비) → 모험(장·단계 고르기) → 전투(편성의 메아리만 싸운다: 단계 막대 + 아래의 메아리 체력 줄) → 결과 창(보상, 다시·다음·홈) → 홈
//   홈: 위의 재화 줄, 가운데 대표 메아리(편성의 첫째: 부품으로 그린 큰 그림, 이름·등급·전투력), 큰 '모험' 단추, 둘레에 뽑기·메아리·편성·임무·우편·확률·설정.
//   뽑기·메아리(카드)·편성은 홈에서 여는 큰 창(틀의 메뉴를 탑에서는 화면 가득: echopact.css). 전투 중에도 '홈'·'울림골 가기'가 된다(전투는 자동으로 이어 간다).
// 홈은 틀의 모드 홈 칸(setModeHome)으로 등록한다: 탑에 올 때마다 홈이 먼저 열린다. 보고 있지 않은 쪽의 작은 표시, 다른 쪽의 위험 알림, 안전장치의 설정 칸도 여기.
// 모드를 오가는 것·메뉴의 탭·감출 틀 요소·들판의 대역은 틀이 맡는다 (engine/client/hud/modes.ts). 문서의 body[data-mode]·[data-tower]로 스타일이 화면을 가른다.
import { CHAPTERS, HERO_RARITIES, MODE_RULE_VIEW, STAGES, knownChar, rarityDef, teamCss, type ModeSideMe } from '@engine/shared/defs';
import { $, addSetting, charPortrait, mountPanel, myHeroes, myMode, myModeSide, myStage, mySquad, onModeChange, onModeSide, onMsg, onSlow, openMenu, S, send, setModeHome, stageRows, switchMode } from '@engine/client';
import { L, onLangChange, t } from '@engine/client/i18n';
import { heroName, rarityName } from '@engine/client/i18n/ko';
import { uiText } from '@engine/client/i18n/names';
import type { MsgArg, MsgKey } from '@engine/shared';
import { MODE, SAFETY } from '../shared/content/pact';

const inTower = (): boolean => myMode()?.id === MODE.tower;
/** 탑의 화면: 홈, 모험(단계 고르기), 전투 */
type View = 'home' | 'adventure' | 'battle';
let view: View = 'home';
const fighting = (): boolean => { const r = myStage()?.run; return !!r && r.state !== 'lobby'; };

function setView(v: View): void {
  view = v;
  draw();
}

function draw(): void {
  const on = inTower() && !!S.me;
  if (on) document.body.dataset.tower = view; else delete document.body.dataset.tower;
  $('towerHome').hidden = !on || view !== 'home';
  $('towerAdv').hidden = !on || view !== 'adventure';
  $('towerBattle').hidden = !on || view !== 'battle';
  document.body.classList.toggle('towerLobby', on && view !== 'battle');
  if (!on) return;
  if (view === 'home') drawHome(); else if (view === 'adventure') drawAdventure();
}

// ---------- 홈 ----------
function drawHome(): void {
  if (!S.me) return;
  const loc = L(), lead = mySquad().ids[0] ?? Object.keys(myHeroes())[0], def = lead ? knownChar(lead) : undefined;
  $('thSparks').textContent = S.me.sparks.toLocaleString(loc.code);
  $('thGold').textContent = S.me.gold.toLocaleString(loc.code);
  const pic = $('thPic') as HTMLImageElement, name = $('thName'), info = $('thInfo');
  if (def) {
    const url = charPortrait(def, 240, 300);
    if (url && pic.src !== url) pic.src = url;
    pic.hidden = !url;
    name.textContent = heroName(def.id);
    name.style.setProperty('--rc', teamCss(rarityDef(def.rarity).color));
    const h = myHeroes()[def.id];
    info.textContent = `${HERO_RARITIES.length ? rarityName(def.rarity) : ''} · Lv ${h?.[0] ?? 1} · ${'★'.repeat(h?.[1] ?? 1)} · ${loc.fmt.towerPower(mySquad().power)}`;
  } else { pic.hidden = true; name.textContent = ''; info.textContent = ''; }
  // 전투가 이어지고 있으면 그리로
  const run = myStage()?.run, live = $('thLive');
  live.hidden = !fighting();
  if (run && fighting()) $('thLiveText').textContent = loc.fmt.towerLive(run.id);
  $('thBest').textContent = loc.fmt.towerBest(myStage()?.best ?? '');
}

// ---------- 모험: 장·단계 고르기 ----------
function drawAdventure(): void {
  if (!S.me) return;
  const loc = L(), st = myStage(), rows = stageRows(st);
  const next = rows.find((r) => r.open && !r.cleared) ?? rows[rows.length - 1], power = mySquad().power;
  const go = $('towerNext');
  go.hidden = !next;
  if (next) { go.textContent = loc.fmt.towerNext(next.id); go.dataset.id = next.id; }
  $('towerWeak').hidden = !next || power >= next.rec || next.id === rows[0]?.id;
  $('taPower').textContent = loc.fmt.towerPower(power);
  const list = $('towerStages');
  list.textContent = '';
  CHAPTERS.forEach((ch, c) => {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = `${c + 1}. ${uiText.get(ch.name)}`;
    const grid = document.createElement('div');
    grid.className = 'tgrid';
    for (const r of rows.filter((x) => x.ch === c)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tstage' + (r.cleared ? ' done' : '') + (r.id === next?.id ? ' now' : '') + (r.open ? '' : ' locked') + (r.boss ? ' boss' : '');
      b.disabled = !r.open;
      const id = document.createElement('b'); id.textContent = r.id;
      const mark = document.createElement('small');
      mark.textContent = [r.boss ? t('towerBoss') : '', r.cleared ? t('towerCleared') : r.open ? '' : t('towerLocked'), loc.fmt.towerRec(r.rec)].filter(Boolean).join(' · ');
      b.append(id, mark);
      b.addEventListener('click', () => { send({ t: 'stage', a: 'go', id: r.id }); setView('battle'); });
      grid.append(b);
    }
    sec.append(h, grid);
    list.append(sec);
  });
  const auto = $('towerAuto');
  auto.textContent = st?.auto ? t('towerAutoOn') : t('towerAutoOff');
  auto.classList.toggle('on', !!st?.auto);
}

// ---------- 전투: 편성의 메아리들 (탑에서는 계약자가 싸우지 않는다) ----------
function drawSquadBar(): void {
  const bar = $('towerSquadBar');
  const show = inTower() && !!S.me && view === 'battle' && fighting();
  bar.hidden = !show;
  if (!show) return;
  const heroes = [...S.others.values()].filter((r) => r.kind === 'hero' && !r.gone);
  const order = mySquad().ids;
  heroes.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const key = heroes.map((r) => `${r.id}:${Math.round(r.hp)}/${r.maxHp}:${r.dying ? 1 : 0}`).join('|') + L().code + mySquad().power;
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  bar.textContent = '';
  for (const r of heroes) {
    const c = document.createElement('div');
    c.className = 'tsq' + (r.hp <= 0 || r.dying ? ' down' : '');
    const d = knownChar(r.type);
    if (d) c.style.setProperty('--rc', teamCss(rarityDef(d.rarity).color));
    const n = document.createElement('b'); n.textContent = heroName(r.type);
    const hp = document.createElement('i'), fill = document.createElement('span');
    fill.style.transform = `scaleX(${r.maxHp > 0 ? Math.max(0, Math.min(1, r.hp / r.maxHp)) : 0})`;
    hp.append(fill); c.append(n, hp);
    bar.append(c);
  }
  const pw = document.createElement('small'); pw.textContent = L().fmt.towerPower(mySquad().power);
  bar.append(pw);
}

// ---------- 결과 창: 깸·실패 (보상, 다시·다음·홈) ----------
let resultTimer = 0;
function showResult(id: string, win: boolean, first: boolean): void {
  if (!inTower() || view !== 'battle') return;
  const loc = L(), s = STAGES.find((x) => x.id === id);
  $('trTitle').textContent = win ? loc.fmt.towerWin(id) : loc.fmt.towerLose(id);
  $('trResult').classList.toggle('lose', !win);
  const rw = s ? { ...s.def.reward } : {}, f = first && s?.def.first ? s.def.first : {};
  const sparks = (rw.sparks ?? 0) + (f.sparks ?? 0), gold = (rw.gold ?? 0) + (f.gold ?? 0);
  $('trGot').textContent = win ? loc.fmt.towerGot(sparks, gold, first) : t('towerLoseHint');
  ($('trNext') as HTMLButtonElement).hidden = !win;
  $('trResult').dataset.id = id;
  $('trResult').hidden = false;
  clearTimeout(resultTimer);
  // 자동 진행이면 다음 단계가 곧 시작한다: 창은 잠시만
  resultTimer = window.setTimeout(() => { $('trResult').hidden = true; }, myStage()?.auto && win ? 3500 : 12000);
}

// ---------- 보고 있지 않은 쪽의 작은 표시 ----------
const VALE_STATE: Record<string, string> = { hunt: 'sideHunt', resting: 'sideRest', retreat: 'sideRetreat', stop: 'sideStop', down: 'sideDown' };
const TOWER_STATE: Record<string, string> = { fight: 'sideFight', gap: 'sideGap', clear: 'sideClear', fail: 'sideFail', lobby: 'sideLobby' };
function drawSide(s: Readonly<ModeSideMe> = myModeSide()): void {
  const chip = $('pactSide'), text = $('pactSideText'), stop = $('pactSideStop') as HTMLButtonElement;
  const loc = L(), f = inTower() ? s.field : null, st = !inTower() ? s.stage : null;
  chip.hidden = !S.me || (!f && !st);
  chip.classList.toggle('danger', !!f && (f.state === 'down' || f.state === 'retreat' || f.state === 'stop' || f.hp / Math.max(1, f.max) < SAFETY.potionAt) || !!st && st.state === 'fail');
  stop.hidden = !st;
  if (f) { text.textContent = loc.fmt.sideVale(t(VALE_STATE[f.state] as never), f.hp, f.max, f.kills, f.got.sparks); }
  else if (st) { text.textContent = loc.fmt.sideTower(st.id, t(TOWER_STATE[st.state] as never), st.cleared, st.got.sparks, st.auto); }
}

// ---------- 다른 쪽의 위험: 눈에 띄는 알림과 바로 가기 ----------
const DANGER: Partial<Record<MsgKey, string>> = { modeStandDown: MODE.vale, autoRetreat: MODE.vale, autoNoPotion: MODE.vale, autoDied: MODE.vale, modeStandEnd: MODE.vale, stageBgStop: MODE.tower };
let alertTimer = 0;
function alertOf(k: MsgKey, a: MsgArg[]): void {
  if (inTower() && (k === 'stageClear' || k === 'stageFail')) showResult(String(a[0] ?? ''), k === 'stageClear', k === 'stageClear' && Number(a[1]) === 1);
  const where = DANGER[k];
  if (!where || myMode()?.id === where) return; // 그 게임을 보고 있으면 틀의 알림으로 충분하다
  const make = L().msg[k];
  $('pactAlertText').textContent = make ? make(a) : k;
  const go = $('pactAlertGo');
  go.textContent = `${t('alertGo')}: ${uiText.get(MODE_RULE_VIEW.list.find((m) => m.id === where)?.name ?? where)}`;
  go.dataset.to = where;
  $('pactAlert').hidden = false;
  clearTimeout(alertTimer);
  alertTimer = window.setTimeout(() => { $('pactAlert').hidden = true; }, 12000);
}

// ---------- 안전장치의 설정 칸 (보이지 않을 때의 자동 사냥: 서버의 g.away.safety를 사람마다) ----------
const safe = { potion: SAFETY.potionAt, retreat: SAFETY.retreatAt, noPotion: SAFETY.stopNoPotion, death: SAFETY.stopOnDeath };
const sendSafe = (): void => { if (S.me) send({ t: 'autoSafe', ...safe }); };
function initSafety(): void {
  const group = () => t('setSafeGroup'), note = () => t('setSafeNote');
  addSetting({ id: 'safePotion', group, note, label: () => t('setSafePotion'), kind: 'range', value: Math.round(SAFETY.potionAt * 100), min: 10, max: 80, step: 5, on: (v) => { safe.potion = v / 100; sendSafe(); } });
  addSetting({ id: 'safeRetreat', group, label: () => t('setSafeRetreat'), kind: 'range', value: Math.round(SAFETY.retreatAt * 100), min: 0, max: 60, step: 5, on: (v) => { safe.retreat = v / 100; sendSafe(); } });
  addSetting({ id: 'safeNoPotion', group, label: () => t('setSafeNoPotion'), kind: 'toggle', value: SAFETY.stopNoPotion, on: (v) => { safe.noPotion = v; sendSafe(); } });
  addSetting({ id: 'safeDeath', group, label: () => t('setSafeDeath'), kind: 'toggle', value: SAFETY.stopOnDeath, on: (v) => { safe.death = v; sendSafe(); } });
  onMsg('welcome', () => setTimeout(sendSafe, 0));
}

/** 홈의 둘레 단추: 탭 id → 이름 키 (틀의 메뉴를 탑에서는 화면 가득 연다) */
const HOME_TABS: readonly [string, string][] = [['gacha', 'towerPull'], ['heroes', 'towerEchoes'], ['squad', 'towerSquad'], ['daily', 'tabDaily'], ['mail', 'tabMail'], ['odds', 'tabOdds'], ['settings', 'tabSettings']];

export function initTower(): void {
  mountPanel('hud', `
    <div id="towerHome" class="tscreen thome" hidden>
      <div class="tbar"><span class="tcur spark">◆ <b id="thSparks"></b></span><span class="tcur gold">● <b id="thGold"></b></span></div>
      <h2 class="ttitle" data-i18n="modeTower"></h2>
      <div class="tlead"><img id="thPic" alt=""><div class="tleadname" id="thName"></div><div class="tleadinfo" id="thInfo"></div></div>
      <button type="button" class="tgo" id="thAdv" data-i18n="towerAdventure"></button>
      <div class="tlive" id="thLive" hidden><span id="thLiveText"></span><button type="button" id="thWatch" data-i18n="towerWatch"></button></div>
      <p class="tbest" id="thBest"></p>
      <div class="tring" id="thRing"></div>
    </div>
    <div id="towerAdv" class="tscreen tadv" hidden>
      <div class="tnav"><button type="button" id="taBack" data-i18n="towerHomeBtn"></button><h2 data-i18n="towerAdventure"></h2><span id="taPower"></span></div>
      <button type="button" class="tgo" id="towerNext"></button>
      <p class="tweak" id="towerWeak" hidden><span data-i18n="towerWeak"></span> <button type="button" id="towerGrow" data-i18n="towerGrow"></button></p>
      <button type="button" class="tauto" id="towerAuto"></button>
      <div class="tstages" id="towerStages"></div>
      <p class="thint" data-i18n="towerHint"></p>
    </div>
    <div id="towerBattle" class="tbattle" hidden><button type="button" id="tbHome" data-i18n="towerHomeBtn"></button></div>
    <div id="trResult" class="tresult" hidden><h3 id="trTitle"></h3><p id="trGot"></p>
      <div class="tbtns"><button type="button" id="trAgain" data-i18n="towerAgain"></button><button type="button" id="trNext" data-i18n="towerNextBtn"></button><button type="button" id="trHome" data-i18n="towerHomeBtn"></button></div></div>
    <div id="pactSide" class="pactSide" hidden><span id="pactSideText"></span><button type="button" id="pactSideStop" data-i18n="sideStopTower" hidden></button></div>
    <div id="towerSquadBar" class="towerSquadBar" hidden></div>
    <div id="pactAlert" class="pactAlert" role="alert" hidden><span id="pactAlertText"></span><button type="button" id="pactAlertGo"></button></div>`);
  const ring = $('thRing');
  for (const [tab, label] of HOME_TABS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tround'; b.dataset.i18n = label; b.textContent = t(label as never);
    b.addEventListener('click', () => openMenu(tab));
    ring.append(b);
  }
  $('thAdv').addEventListener('click', () => setView('adventure'));
  $('thWatch').addEventListener('click', () => setView('battle'));
  $('taBack').addEventListener('click', () => setView('home'));
  $('tbHome').addEventListener('click', () => setView('home'));
  $('towerNext').addEventListener('click', (e) => { const id = (e.currentTarget as HTMLElement).dataset.id; if (!id) return; send({ t: 'stage', a: 'auto', on: true }); send({ t: 'stage', a: 'go', id }); setView('battle'); });
  $('towerGrow').addEventListener('click', () => openMenu('heroes'));
  $('towerAuto').addEventListener('click', () => send({ t: 'stage', a: 'auto', on: !(myStage()?.auto ?? true) }));
  $('trAgain').addEventListener('click', () => { const id = $('trResult').dataset.id; $('trResult').hidden = true; if (id) { send({ t: 'stage', a: 'auto', on: false }); send({ t: 'stage', a: 'go', id }); } });
  $('trNext').addEventListener('click', () => {
    $('trResult').hidden = true;
    const next = stageRows(myStage()).find((r) => r.open && !r.cleared);
    if (next) { send({ t: 'stage', a: 'auto', on: true }); send({ t: 'stage', a: 'go', id: next.id }); }
  });
  $('trHome').addEventListener('click', () => { $('trResult').hidden = true; setView('home'); });
  // 탑에 올 때마다 홈이 먼저 (틀의 모드 홈 칸)
  setModeHome(MODE.tower, () => setView('home'));
  $('pactSideText').addEventListener('click', () => switchMode());
  $('pactSideStop').addEventListener('click', () => send({ t: 'stage', a: 'leave' }));
  $('pactAlertGo').addEventListener('click', (e) => { const to = (e.currentTarget as HTMLElement).dataset.to; $('pactAlert').hidden = true; if (to && myMode()?.id !== to) switchMode(to); });
  onModeChange(() => { draw(); drawSide(); $('pactAlert').hidden = true; $('trResult').hidden = true; });
  onModeSide((s) => drawSide(s));
  onMsg('me', (m) => { if (m.k === 'stage' || m.k === 'squad' || m.k === 'heroes' || m.k === 'chars') { if (view !== 'battle') draw(); } });
  onMsg('sys', (m) => alertOf(m.k, m.a ?? []));
  onMsg('stat', () => { if (view === 'home') drawHome(); });
  // 메뉴(뽑기·메아리·편성 …)나 뽑기 결과·확인 창이 열리면 홈은 그 아래로 비켜 준다
  onSlow(() => {
    drawSquadBar();
    if (!S.me) { $('towerHome').hidden = true; $('pactSide').hidden = true; }
    const open = (id: string) => { const el = document.querySelector<HTMLElement>(`#${id}`); return !!el && !el.hidden; };
    const over = open('menu') || open('gachaPop') || open('spendAsk');
    for (const id of ['towerHome', 'towerAdv']) $(id).classList.toggle('under', !!over);
  });
  onLangChange(() => { draw(); drawSide(); });
  initSafety();
}
