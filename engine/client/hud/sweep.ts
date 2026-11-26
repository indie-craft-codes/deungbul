// 소탕의 화면 (stages 모듈의 단계 소탕, dungeon 모듈의 열쇠 던전 소탕이 함께 쓴다): 결과 창(받은 것의 합)과 소탕 단추를 만드는 도우미.
// 단추는 단계 탭(hud/stagebar.ts)과 던전 문 앞의 창(hud/dungeon.ts)에 붙는다. 서버의 짝은 engine/server/game/systems/sweep.ts.
// 셈(할 수 있는 횟수, 단추의 횟수)은 hud/collectcalc.ts의 sweepView.
import type { SweepCost, SweepGot } from '../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { S } from '../state';
import type { SweepView } from './collectcalc';
import { addNotices } from './notify';

let ready = false;
let popTimer = 0;

/** 값으로 치르는 재화나 아이템의 가진 수 (화면이 아는 것: 내 정보와 가방) */
export function sweepHave(cost: SweepCost | undefined): number {
  const me = S.me;
  if (!cost || !me) return 0;
  return 'item' in cost ? me.items[cost.item] ?? 0 : cost.cur === 'gold' ? me.gold : me.sparks;
}

/** 소탕 단추들: 셈(view)의 횟수마다 하나. 누르면 send(n) */
export function sweepButtons(view: SweepView, send: (n: number) => void, locked = false): HTMLButtonElement[] {
  return view.counts.map((n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plain sweepbtn';
    b.textContent = L().fmt.sweepTimes(n);
    b.disabled = locked || n > view.can;
    b.addEventListener('click', () => { send(n); b.blur(); });
    return b;
  });
}

function show(got: SweepGot): void {
  const loc = L(), box = $('sweepList');
  box.textContent = '';
  const line = (text: string) => { const d = document.createElement('div'); d.textContent = text; box.append(d); };
  for (const [cur, n] of Object.entries(got.cur)) if (n > 0) line(loc.fmt.sweepGot(cur, n));
  for (const [id, n] of Object.entries(got.goods)) if (n > 0) line(loc.fmt.sweepGot(id, n));
  if (got.equip > 0) line(loc.fmt.sweepGear(got.equip));
  $('sweepPopTitle').textContent = `${t('sweepResult')} · ${loc.fmt.sweepTitle(got.k, got.id, got.n)}`;
  $('sweepPop').hidden = false;
  clearTimeout(popTimer);
  popTimer = window.setTimeout(() => { $('sweepPop').hidden = true; }, 6000);
}

/** 결과 창과 안내문을 한 번만 붙인다 (단계와 던전이 저마다 부른다) */
export function initSweep(): void {
  if (ready) return;
  ready = true;
  const pop = document.createElement('div');
  pop.className = 'panel'; pop.id = 'sweepPop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  pop.innerHTML = '<div class="ttitle" id="sweepPopTitle"></div><div id="sweepList"></div>';
  document.body.append(pop);
  pop.addEventListener('click', () => { pop.hidden = true; });
  onMsg('sweep', (m) => show(m.got));
  onLangChange(() => { pop.hidden = true; });
  addNotices({ feed: ['swept', 'sweepLocked', 'itemShort', 'dungeonNoKeys'] });
}
