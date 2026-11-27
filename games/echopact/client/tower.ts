// 두 게임의 화면 (이 게임의 몫): 계약의 탑(A)의 첫 화면(단계 선택·뽑기·메아리·편성), 보고 있지 않은 쪽의 작은 표시와 바로 가기, 다른 쪽의 위험 알림, 안전장치의 설정 칸.
// 모드를 오가는 것·메뉴의 탭·감출 틀 요소·들판의 대역은 틀이 맡는다 (engine/client/hud/modes.ts: onModeChange, onModeSide, switchMode). 탑의 싸움 화면은 틀의 단계 막대다.
// 문서의 body[data-mode]가 tower·vale로 바뀌어 스타일(echopact.css)이 두 게임의 겉모습을 가른다.
import { CHAPTERS, MODE_RULE_VIEW, type ModeSideMe } from '@engine/shared/defs';
import { $, addSetting, mountPanel, myMode, myModeSide, myStage, mySquad, onModeChange, onModeSide, onMsg, onSlow, openMenu, S, send, stageRows, switchMode } from '@engine/client';
import { L, onLangChange, t } from '@engine/client/i18n';
import { uiText } from '@engine/client/i18n/names';
import type { MsgArg, MsgKey } from '@engine/shared';
import { MODE, SAFETY } from '../shared/content/pact';

const inTower = (): boolean => myMode()?.id === MODE.tower;

// ---------- 탑의 첫 화면 ----------
function drawHome(): void {
  const box = $('towerHome'), st = myStage();
  const lobby = inTower() && !!S.me && (!st?.run || st.run.state === 'lobby');
  box.hidden = !lobby;
  if (!lobby || !S.me) return;
  const loc = L(), rows = stageRows(st);
  $('towerHave').textContent = loc.fmt.towerHave(S.me.sparks, S.me.gold, mySquad().power);
  $('towerBest').textContent = loc.fmt.towerBest(st?.best ?? '');
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
      b.className = 'tstage' + (r.cleared ? ' done' : '') + (r.now ? ' now' : '') + (r.open ? '' : ' locked') + (r.boss ? ' boss' : '');
      b.disabled = !r.open;
      const id = document.createElement('b'); id.textContent = r.id;
      const mark = document.createElement('small');
      mark.textContent = [r.boss ? t('towerBoss') : '', r.now ? t('towerNow') : r.cleared ? t('towerCleared') : r.open ? '' : t('towerLocked'), loc.fmt.towerRec(r.rec)].filter(Boolean).join(' · ');
      b.append(id, mark);
      b.addEventListener('click', () => send({ t: 'stage', a: 'go', id: r.id }));
      grid.append(b);
    }
    sec.append(h, grid);
    list.append(sec);
  });
  const auto = $('towerAuto');
  auto.textContent = st?.auto ? t('towerAutoOn') : t('towerAutoOff');
  auto.classList.toggle('on', !!st?.auto);
}

// ---------- 보고 있지 않은 쪽의 작은 표시 ----------
const VALE_STATE: Record<string, string> = { hunt: 'sideHunt', resting: 'sideRest', retreat: 'sideRetreat', stop: 'sideStop', down: 'sideDown' };
const TOWER_STATE: Record<string, string> = { fight: 'sideFight', gap: 'sideGap', clear: 'sideClear', fail: 'sideFail', lobby: 'sideLobby' };
function drawSide(s: Readonly<ModeSideMe> = myModeSide()): void {
  const chip = $('pactSide'), text = $('pactSideText'), go = $('pactSideGo') as HTMLButtonElement, stop = $('pactSideStop') as HTMLButtonElement;
  const loc = L(), f = inTower() ? s.field : null, st = !inTower() ? s.stage : null;
  chip.hidden = !S.me || (!f && !st);
  chip.classList.toggle('danger', !!f && (f.state === 'down' || f.state === 'retreat' || f.state === 'stop' || f.hp / Math.max(1, f.max) < SAFETY.potionAt) || !!st && st.state === 'fail');
  stop.hidden = !st;
  if (f) { text.textContent = loc.fmt.sideVale(t(VALE_STATE[f.state] as never), f.hp, f.max, f.kills, f.got.sparks); go.textContent = t('sideGoVale'); }
  else if (st) { text.textContent = loc.fmt.sideTower(st.id, t(TOWER_STATE[st.state] as never), st.cleared, st.got.sparks, st.auto); go.textContent = t('sideGoTower'); }
}

// ---------- 다른 쪽의 위험: 눈에 띄는 알림과 바로 가기 ----------
/** 위험 알림의 안내문과 그 일이 일어난 게임 */
const DANGER: Partial<Record<MsgKey, string>> = { modeStandDown: MODE.vale, autoRetreat: MODE.vale, autoNoPotion: MODE.vale, autoDied: MODE.vale, modeStandEnd: MODE.vale, stageBgStop: MODE.tower };
let alertTimer = 0;
function alertOf(k: MsgKey, a: MsgArg[]): void {
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
  // 접속할 때마다 이 기기의 설정을 서버에 알린다 (설정은 기기에 저장된다)
  onMsg('welcome', () => setTimeout(sendSafe, 0));
}

export function initTower(): void {
  mountPanel('hud', `
    <div id="towerHome" class="towerHome" hidden>
      <div class="thead"><h2 data-i18n="modeTower"></h2><p data-i18n="towerSub"></p><p class="thave" id="towerHave"></p></div>
      <div class="tbtns">
        <button type="button" class="tbig" id="towerPull" data-i18n="towerPull"></button>
        <button type="button" class="tbig" id="towerEchoes" data-i18n="towerEchoes"></button>
        <button type="button" class="tbig" id="towerSquad" data-i18n="towerSquad"></button>
        <button type="button" class="tauto" id="towerAuto"></button>
      </div>
      <p class="tbest" id="towerBest"></p>
      <div class="tstages" id="towerStages"></div>
      <p class="thint" data-i18n="towerHint"></p>
    </div>
    <div id="pactSide" class="pactSide" hidden><span id="pactSideText"></span><button type="button" id="pactSideGo"></button><button type="button" id="pactSideStop" data-i18n="sideStopTower" hidden></button></div>
    <div id="pactAlert" class="pactAlert" role="alert" hidden><span id="pactAlertText"></span><button type="button" id="pactAlertGo"></button></div>`);
  $('towerPull').addEventListener('click', () => openMenu('gacha'));
  $('towerEchoes').addEventListener('click', () => openMenu('heroes'));
  $('towerSquad').addEventListener('click', () => openMenu('squad'));
  $('towerAuto').addEventListener('click', () => send({ t: 'stage', a: 'auto', on: !(myStage()?.auto ?? true) }));
  $('pactSideGo').addEventListener('click', () => switchMode());
  // 들판에서 뒤에서 잇는 탑을 멈춘다 (지금 싸움을 닫는다)
  $('pactSideStop').addEventListener('click', () => send({ t: 'stage', a: 'leave' }));
  $('pactAlertGo').addEventListener('click', (e) => { const to = (e.currentTarget as HTMLElement).dataset.to; $('pactAlert').hidden = true; if (to && myMode()?.id !== to) switchMode(to); });
  onModeChange(() => { drawHome(); drawSide(); $('pactAlert').hidden = true; });
  onModeSide((s) => drawSide(s));
  onMsg('me', (m) => { if (m.k === 'stage' || m.k === 'squad') drawHome(); });
  onMsg('sys', (m) => alertOf(m.k, m.a ?? []));
  onMsg('stat', () => { if (!$('towerHome').hidden) $('towerHave').textContent = L().fmt.towerHave(S.me?.sparks ?? 0, S.me?.gold ?? 0, mySquad().power); });
  onSlow(() => { if (!S.me) { $('towerHome').hidden = true; $('pactSide').hidden = true; } });
  onLangChange(() => { drawHome(); drawSide(); });
  initSafety();
}
