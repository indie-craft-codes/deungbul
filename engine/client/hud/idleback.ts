// 돌아왔을 때의 창 (idle 모듈, 내용의 IDLE.popup을 켠 게임만): 접속하지 않은 동안 모인 방치 보상과 오프라인 단계 진행을 가운데 창 하나로 알린다.
// 서버의 짝은 engine/server/game/systems/idle.ts(메시지 idleBack). 보상 자체는 예전처럼 우편으로 온다: '받기'는 그 우편을 받는 명령(mailClaim)을 보내고,
// '나중에'는 창만 닫는다(우편에 남는다). 그래서 장부의 원인도 우편의 것 그대로다. 셈(보일 줄)은 hud/collectcalc.ts의 idleBackLines.
// 게임이 더 할 수 있는 것: 창이 뜰 때 함께 받기(onIdleBack: 연출, 소리).
import { IDLE_VIEW, type IdleBack } from '../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { send } from '../net';
import { idleBackLines } from './collectcalc';

let shown: IdleBack | null = null;
const backFns: ((m: IdleBack) => void)[] = [];
/** 돌아왔을 때의 방치 보상을 받는다 (창이 뜨는 것과 함께: 게임의 연출) */
export function onIdleBack(fn: (m: IdleBack) => void): void { backFns.push(fn); }

function render(): void {
  const pop = $('idleBackPop');
  pop.hidden = !shown;
  if (!shown) return;
  const loc = L(), m = shown;
  $('idleBackTitle').textContent = t('idleBackTitle');
  $('idleBackBody').textContent = loc.fmt.idleBackBody(m.min);
  const stage = $('idleBackStage');
  stage.hidden = !m.to;
  stage.textContent = m.to ? loc.fmt.idleBackStage(m.from ?? '', m.to, m.n ?? 0) : '';
  const list = $('idleBackList');
  list.textContent = '';
  for (const x of idleBackLines(m.r)) { const d = document.createElement('div'); d.textContent = loc.fmt.idleBackLine(x.what, x.n); list.append(d); }
  $('idleBackClaim').textContent = t('idleBackClaim');
  $('idleBackLater').textContent = t('idleBackLater');
}

export function initIdleBack(): void {
  if (!IDLE_VIEW.popup) return; // 켜지 않은 게임에는 창이 없다 (예전처럼 우편만)
  // 창은 문서의 맨 끝에: 메뉴와 다른 창 위에 뜬다
  const pop = document.createElement('div');
  pop.className = 'panel'; pop.id = 'idleBackPop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  pop.innerHTML = '<div class="ttitle" id="idleBackTitle"></div><div class="note" id="idleBackBody"></div><div class="note gold" id="idleBackStage" hidden></div><div id="idleBackList"></div>'
    + '<div class="btns"><button type="button" class="on" id="idleBackClaim"></button><button type="button" class="plain" id="idleBackLater"></button></div>';
  document.body.append(pop);
  $('idleBackClaim').addEventListener('click', () => { if (shown) send({ t: 'mailClaim', id: shown.mail }); shown = null; render(); });
  $('idleBackLater').addEventListener('click', () => { shown = null; render(); });
  onMsg('idleBack', (m) => {
    const { t: _t, ...back } = m;
    shown = back;
    render();
    for (const fn of backFns) fn(back);
  });
  onLangChange(render);
}
