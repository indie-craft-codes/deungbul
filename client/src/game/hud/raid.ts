// 습격 알림: 진행 중이거나 곧 시작이면 가운데 위에 크게, 평소에는 내 정보 창에 다음 습격의 시각만 작게.
// (습격의 시작과 결과를 알리는 가운데 알림은 서버의 안내문으로 온다: hud/notify.ts)
import { RAID } from '../../../../shared/defs';
import { $ } from '../../app';
import { onMsg, onSlow } from '../../bus';
import { L, clock, onLangChange } from '../../i18n';
import { GS, raidLeft } from '../state';

/** 화면의 요소들. initRaid에서 잡는다 (이 게임의 창이 화면에 붙은 뒤다) */
let ui: Record<'raid' | 'raidText' | 'raidHp' | 'raidBar' | 'raidMini', HTMLElement>;

export function initRaid(): void {
  ui = { raid: $('raid'), raidText: $('raidText'), raidHp: $('raidHp'), raidBar: $('raidBar'), raidMini: $('raidMini') };
  raidSlow(performance.now());
  onMsg('world', (_m, now) => raidSlow(now));
  onSlow(raidSlow);
  onLangChange(() => raidSlow(performance.now()));
}

/** 1초에 몇 번이면 되는 것: 남은 시간과 적의 수, 등탑의 체력, 다음 습격의 시각. */
export function raidSlow(now: number): void {
  const loc = L(), raid = GS.world.raid;
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
}
