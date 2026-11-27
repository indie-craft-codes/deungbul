// 두 게임의 화면 (이 게임의 몫). 계약의 탑(A)은 수집형 RPG의 흐름이다 (틀의 부품: 화면 쌓기·수집형 홈 키트·단계 정보 창·편성 확인·결과 창):
//   홈(틀의 makeHome: 재화 줄, 대표 메아리, 오른쪽 아래 '다음 도전', 아래 띠 모험·메아리·편성·울림 샘·임무·울림골, 왼쪽 배너)
//   → 모험(장·단계 고르기 페이지) → 단계 정보 창(적·권장 전투력·별 조건·보상) → 편성 확인 → 전투(편성의 메아리만 싸운다) → 결과 창(별·보상, 홈·다시·다음) → 홈
//   홈의 '다음 도전'은 곧장 다음 단계의 편성 확인으로 (자주 하는 사람의 '이어서'). 지면 결과 창에 '강해지는 길'(메아리 키우기·뽑기·편성·울림골).
// 홈은 틀의 모드 홈 칸(setModeHome)으로 등록한다: 탑에 올 때마다 홈이 먼저 열린다. 화면 사이의 뒤로 가기(폰 브라우저의 뒤로 포함)는 틀의 화면 쌓기가 맡는다.
// 보고 있지 않은 쪽의 작은 표시(상태 줄), 안전장치의 설정 칸도 여기. 다른 쪽의 위험 알림은 틀(hud/modes.ts)의 것. 폰에서는 작은 표시·전환 단추를 틀의 구역(placeIn)에 등록한다.
// 모드를 오가는 것·메뉴의 탭·감출 틀 요소·들판의 대역은 틀이 맡는다 (engine/client/hud/modes.ts). 문서의 body[data-mode]·[data-tower]로 스타일이 화면을 가른다.
import { BANNER_TABLE, CHAPTERS, HERO_RARITIES, STAGES, knownChar, type ModeSideMe } from '@engine/shared/defs';
import {
  $, addSetting, charPortrait, closeStageResult, clearScreens, dropScreen, homeScreen, makeHome, mountPanel, myHeroes, myMode, myModeSide, myStage, mySquad,
  onModeChange, onModeSide, onMsg, onScreens, onSlow, openCheck, openMenu, openScreen, openStageInfo, placeIn, rarityCss, liveBanners, S, send, setModeHome, stageRows, switchMode, tintRarity, useStageScreens, type HomeKit,
} from '@engine/client';
import { L, onLangChange, t } from '@engine/client/i18n';
import { heroName, rarityName } from '@engine/client/i18n/ko';
import { uiText } from '@engine/client/i18n/names';
import type { MsgArg, MsgKey } from '@engine/shared';
import { MODE, SAFETY } from '../shared/content/pact';

const inTower = (): boolean => myMode()?.id === MODE.tower;
/** 탑의 화면: 홈, 모험(단계 고르기), 전투. 화면 쌓기의 맨 위에서 정해진다 */
type View = 'home' | 'adventure' | 'battle';
let view: View = 'home';
const fighting = (): boolean => { const r = myStage()?.run; return !!r && r.state !== 'lobby'; };
/** 다음에 도전할 단계 (열린 것 가운데 아직 깨지 않은 첫째, 다 깼으면 마지막) */
const nextRow = () => { const rows = stageRows(myStage()); return rows.find((r) => r.open && !r.cleared) ?? rows[rows.length - 1]; };
let home: HomeKit;
/** 이벤트 배너의 그림 (그림 파일 없이: 색 두 개(echopact.css의 토큰)와 큰 글자) */
const EVENT_ART: Record<string, { from: string; to: string; glyph: string }> = {
  echofest: { from: 'var(--ep-fest-a)', to: 'var(--ep-fest-b)', glyph: '♪' },
  season: { from: 'var(--ep-season-a)', to: 'var(--ep-season-b)', glyph: '✦' },
};

/** 화면 쌓기를 보고 지금 화면을 정한다 */
function syncView(ids: readonly string[]): void {
  const v: View = ids.includes('towerBattle') ? 'battle' : ids.includes('towerAdv') ? 'adventure' : 'home';
  if (v === view && document.body.dataset.tower === (inTower() && S.me ? v : undefined)) return;
  view = v;
  draw();
}
function openAdventure(): void {
  $('towerAdv').hidden = false;
  openScreen('towerAdv', { kind: 'page', el: $('towerAdv'), close: () => { $('towerAdv').hidden = true; } });
}
/** 전투를 본다 (장면 보기: 들판 HUD는 그대로, 뒤로 가기는 홈으로) */
function openBattle(): void {
  dropScreen('towerAdv'); $('towerAdv').hidden = true;
  openScreen('towerBattle', { kind: 'view' });
}
/** 단계로 출발한다 */
function go(id: string, auto?: boolean): void {
  if (auto !== undefined) send({ t: 'stage', a: 'auto', on: auto });
  send({ t: 'stage', a: 'go', id });
  openBattle();
}

function draw(): void {
  const on = inTower() && !!S.me;
  if (on) document.body.dataset.tower = view; else delete document.body.dataset.tower;
  $('towerBattle').hidden = !on || view !== 'battle';
  document.body.classList.toggle('towerLobby', on && view !== 'battle');
  if (!on) return;
  home.draw();
  if (view === 'adventure') drawAdventure();
  drawSide();
}

// ---------- 홈 (틀의 수집형 홈 키트) ----------
function initHome(): void {
  home = makeHome({
    id: 'towerHome',
    title: () => t('modeTower'),
    // 울림 조각의 '+': 울림골에서 사냥하면 모인다
    currencies: [{ id: 'second', plus: () => switchMode(MODE.vale) }, 'gold'],
    lead: () => {
      const id = mySquad().ids[0] ?? Object.keys(myHeroes())[0], def = id ? knownChar(id) : undefined;
      if (!def) return null;
      const h = myHeroes()[def.id];
      return { img: charPortrait(def, 240, 300), name: heroName(def.id), color: rarityCss(def.rarity),
        info: `${HERO_RARITIES.length ? rarityName(def.rarity) + ' · ' : ''}Lv ${h?.[0] ?? 1} · ${'★'.repeat(h?.[1] ?? 1)}` };
    },
    onLead: () => openMenu('heroes'),
    go: {
      label: () => (fighting() ? t('towerWatch') : L().fmt.towerNext(nextRow()?.id ?? '')),
      sub: () => { const r = myStage()?.run; if (fighting() && r) return L().fmt.towerLive(r.id); const n = nextRow(); return n ? L().fmt.towerRec(n.rec) : ''; },
      onClick: () => { if (fighting()) { openBattle(); return; } const n = nextRow(); if (n) openCheck(n.id); },
    },
    info: () => `${L().fmt.towerBest(myStage()?.best ?? '')}\n${L().fmt.towerPower(mySquad().power)}`,
    dock: [
      { id: 'adv', label: () => t('towerAdventure'), onClick: openAdventure },
      { id: 'heroes', label: () => t('towerEchoes'), dot: 'menu.heroes', onClick: () => openMenu('heroes') },
      { id: 'squad', label: () => t('towerSquad'), onClick: () => openMenu('squad') },
      { id: 'gacha', label: () => t('towerPull'), dot: 'menu.gacha', onClick: () => openMenu('gacha') },
      { id: 'daily', label: () => t('tabDaily'), onClick: () => openMenu('daily') },
      { id: 'vale', label: () => uiText.get('modeVale'), onClick: () => switchMode(MODE.vale) },
    ],
    // 왼쪽 열의 이벤트 배너: 울림 축제(열렸거나 7일 안에 열림)와 메아리의 계절. 누르면 그 탭으로
    events: () => liveBanners().map((b) => {
      const now = Date.now(), loc = L(), art = EVENT_ART[b.kind === 'season' ? 'season' : b.id] ?? EVENT_ART.season;
      return {
        id: b.id, title: b.name, art,
        tag: !b.open ? t('hkSoon') : b.kind === 'season' ? t('hkSeason') : t('hkEvent'),
        left: b.open ? loc.fmt.liveLeft(b.to - now) : loc.fmt.liveStarts(b.from - now),
        dot: b.kind === 'season' ? 'menu.season' : b.open ? 'menu.event' : undefined,
        onClick: () => openMenu(b.kind === 'season' ? 'season' : 'event'),
      };
    }),
    // 배너 아래 작은 바로 가기 (우편·확률·설정)
    banners: () => [
      { id: 'mail', icon: '✉', text: t('tabMail'), dot: 'menu.mail', onClick: () => openMenu('mail') },
      { id: 'odds', icon: '%', text: t('tabOdds'), onClick: () => openMenu('odds') },
      { id: 'settings', icon: '⚙', text: t('tabSettings'), onClick: () => openMenu('settings') },
      { id: 'achieve', icon: '★', text: t('tabAchieve'), onClick: () => openMenu('achieve') },
    ],
  });
  // 홈의 위: 보고 있지 않은 울림골의 작은 표시(누르면 그리로)
  const side = document.createElement('button');
  side.type = 'button'; side.id = 'homeSide'; side.className = 'pactSide homeSide'; side.hidden = true;
  side.addEventListener('click', () => switchMode());
  home.slot('status').append(side);
}

// ---------- 모험: 장·단계 고르기 (단계를 누르면 틀의 단계 정보 창) ----------
function drawAdventure(): void {
  if (!S.me) return;
  const loc = L(), st = myStage(), rows = stageRows(st), next = nextRow(), power = mySquad().power;
  const quick = $('towerNext');
  quick.hidden = !next;
  if (next) { quick.textContent = loc.fmt.towerNext(next.id); quick.dataset.id = next.id; }
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
      // 딴 별 (별 조건 셋)
      const stars = document.createElement('i'), m = st?.stars?.[r.id] ?? 0;
      stars.textContent = r.cleared ? [0, 1, 2].map((k) => (m & (1 << k) ? '★' : '☆')).join('') : '';
      const mark = document.createElement('small');
      mark.textContent = [r.boss ? t('towerBoss') : '', r.open || r.cleared ? '' : t('towerLocked'), loc.fmt.towerRec(r.rec)].filter(Boolean).join(' · ');
      b.append(id, stars, mark);
      b.addEventListener('click', () => openStageInfo(r.id));
      grid.append(b);
    }
    sec.append(h, grid);
    list.append(sec);
  });
  const auto = $('towerAuto');
  auto.textContent = st?.auto ? t('towerAutoOn') : t('towerAutoOff');
  auto.classList.toggle('on', !!st?.auto);
  auto.setAttribute('aria-pressed', String(!!st?.auto));
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
    if (d) tintRarity(c, d.rarity);
    const n = document.createElement('b'); n.textContent = heroName(r.type);
    const hp = document.createElement('i'), fill = document.createElement('span');
    fill.style.transform = `scaleX(${r.maxHp > 0 ? Math.max(0, Math.min(1, r.hp / r.maxHp)) : 0})`;
    hp.append(fill); c.append(n, hp);
    bar.append(c);
  }
  const pw = document.createElement('small'); pw.textContent = L().fmt.towerPower(mySquad().power);
  bar.append(pw);
}

// ---------- 막힘: 진 단계 (자동 진행은 꺼지고 앞 단계를 되풀이한다: 그 단계를 깨면 풀린다) ----------
let stuck = '';
function onStageNews(k: MsgKey, a: MsgArg[]): void {
  const id = String(a[0] ?? '');
  if (k === 'stageFail') stuck = id;
  else if (k === 'stageClear' && stuck && STAGES.findIndex((s) => s.id === id) >= STAGES.findIndex((s) => s.id === stuck)) stuck = '';
}

// ---------- 보고 있지 않은 쪽의 작은 표시 ----------
const VALE_STATE: Record<string, string> = { hunt: 'sideHunt', resting: 'sideRest', retreat: 'sideRetreat', stop: 'sideStop', down: 'sideDown' };
const TOWER_STATE: Record<string, string> = { fight: 'sideFight', gap: 'sideGap', clear: 'sideClear', fail: 'sideFail', lobby: 'sideLobby' };
function drawSide(s: Readonly<ModeSideMe> = myModeSide()): void {
  const chip = $('pactSide'), text = $('pactSideText'), stop = $('pactSideStop') as HTMLButtonElement, hs = $('homeSide');
  const loc = L(), f = inTower() ? s.field : null, st = !inTower() ? s.stage : null;
  chip.hidden = !S.me || (!f && !st);
  const danger = !!f && (f.state === 'down' || f.state === 'retreat' || f.state === 'stop' || f.hp / Math.max(1, f.max) < SAFETY.potionAt) || !!st && st.state === 'fail';
  chip.classList.toggle('danger', danger);
  stop.hidden = !st;
  if (f) text.textContent = loc.fmt.sideVale(t(VALE_STATE[f.state] as never), f.hp, f.max, f.kills, f.got.sparks);
  else if (st) text.textContent = stuck && stuck !== st.id ? loc.fmt.sideStuck(stuck, st.id) : loc.fmt.sideTower(st.id, t(TOWER_STATE[st.state] as never), st.cleared, st.got.sparks, st.auto);
  // 홈의 위에도 같은 표시 (홈은 들판 HUD를 감춘다)
  hs.hidden = chip.hidden || !f;
  hs.textContent = f ? `${text.textContent} ›` : '';
  hs.classList.toggle('danger', danger);
}

// 다른 쪽의 위험(대역의 쓰러짐·물러남, 뒤에서 잇던 단계의 멈춤)은 틀의 위험 알림이 한 곳에 띄운다 (hud/modes.ts: 글과 그쪽으로 가는 단추).

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

export function initTower(): void {
  mountPanel('hud', `
    <div id="towerAdv" class="tscreen tadv" hidden>
      <div class="tnav"><button type="button" id="taBack" data-i18n="scrBack"></button><h2 data-i18n="towerAdventure"></h2><button type="button" id="taHome" data-i18n="scrHome"></button></div>
      <p class="tpower" id="taPower"></p>
      <button type="button" class="tgo" id="towerNext"></button>
      <p class="tweak" id="towerWeak" hidden><span data-i18n="towerWeak"></span> <button type="button" id="towerGrow" data-i18n="towerGrow"></button></p>
      <button type="button" class="tauto toggle" id="towerAuto" aria-pressed="false"></button>
      <div class="tstages" id="towerStages"></div>
      <p class="thint" data-i18n="towerHint"></p>
    </div>
    <div id="towerBattle" class="tbattle" hidden><button type="button" id="tbHome" data-i18n="towerHomeBtn"></button></div>
    <div id="pactSide" class="pactSide" hidden><span id="pactSideText"></span><button type="button" id="pactSideStop" data-i18n="sideStopTower" hidden></button></div>
    <div id="towerSquadBar" class="towerSquadBar" hidden></div>
`);
  initHome();
  // 폰: 작은 표시는 위 왼쪽(내 정보 아래), 위험 알림은 가운데 위의 알림 띠, 편성의 메아리 줄은 아래 가운데 (틀의 구역 배치)
  placeIn('tl', 'towerBattle', -1);
  placeIn('tl', 'pactSide', 20);
  placeIn('bc', 'towerSquadBar', 20);
  $('taBack').addEventListener('click', () => homeScreen());
  $('taHome').addEventListener('click', () => homeScreen());
  $('tbHome').addEventListener('click', () => homeScreen());
  $('towerNext').addEventListener('click', (e) => { const id = (e.currentTarget as HTMLElement).dataset.id; if (id) openCheck(id); });
  $('towerGrow').addEventListener('click', () => openMenu('heroes'));
  $('towerAuto').addEventListener('click', () => send({ t: 'stage', a: 'auto', on: !(myStage()?.auto ?? true) }));
  // 단계 정보 창·편성 확인·결과 창 (틀의 부품). '다음'은 자동 진행을 켜고, '다시'는 끈다 (예전 결과 창과 같다)
  useStageScreens({
    go: (id) => go(id),
    home: () => homeScreen(),
    next: (id) => go(id, true),
    again: (id) => go(id, false),
    heroPic: (id) => { const d = knownChar(id); return d ? charPortrait(d, 120, 150) : undefined; },
    showResult: () => inTower() && view === 'battle',
    grow: () => {
      const b = Object.values(BANNER_TABLE)[0], have = S.me?.sparks ?? 0;
      return [
        { label: t('towerGrowLv'), sub: t('towerGrow'), onClick: () => openMenu('heroes') },
        { label: t('towerGrowPull'), sub: b ? L().fmt.towerPullHave(b.one, have) : undefined, onClick: () => openMenu('gacha') },
        { label: t('towerGrowSquad'), onClick: () => openMenu('squad') },
        { label: t('towerGrowVale'), onClick: () => switchMode(MODE.vale) },
      ];
    },
  });
  // 탑에 올 때마다 홈이 먼저 (틀의 모드 홈 칸). 울림골로 가면 탑의 화면을 모두 닫는다
  setModeHome(MODE.tower, () => { homeScreen(); home.open(); });
  onScreens(syncView);
  $('pactSideText').addEventListener('click', () => switchMode());
  $('pactSideStop').addEventListener('click', () => send({ t: 'stage', a: 'leave' }));
  onModeChange((def) => { if (def.id !== MODE.tower) { closeStageResult(); clearScreens(); } draw(); drawSide(); });
  onModeSide((s) => drawSide(s));
  onMsg('me', (m) => { if (m.k === 'stage' || m.k === 'squad' || m.k === 'heroes' || m.k === 'chars' || m.k === 'event' || m.k === 'season') { if (view !== 'battle') draw(); else home.draw(); } });
  onMsg('sys', (m) => onStageNews(m.k, m.a ?? []));
  onMsg('stat', () => home.draw());
  onSlow(() => {
    drawSquadBar();
    if (!S.me) { home.close(); $('pactSide').hidden = true; }
  });
  onLangChange(() => { draw(); drawSide(); });
  initSafety();
}
