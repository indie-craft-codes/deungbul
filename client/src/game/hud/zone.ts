// 구역 알림: 다른 구역에 들어서면 어디인지, 위험한 곳(등탑이 꺼진 곳)인지 가운데에 크게 알린다.
import { onSlow } from '../../bus';
import { banner } from '../../hud/notify';
import { L } from '../../i18n';
import { S } from '../../state';
import { myZone, zoneGlow } from '../state';
import { renderWorld, shown } from './tower';

export function initZone(): void {
  onSlow(zoneSlow);
}

/**
 * 1초에 몇 번이면 되는 것: 구역을 넘어갔는가. 등탑 창이 그려 둔 구역(tower.ts)과 견준다:
 * 공유 상태나 언어가 바뀌어 등탑 창이 먼저 새 구역으로 그려졌으면 알리지 않는다 (가르기 전부터 그랬다. 접속한 자리의 구역도 그래서 알리지 않는다).
 */
export function zoneSlow(): void {
  const loc = L();
  if (!S.me) return;
  if (myZone() !== shown()) {
    // 다른 구역에 들어섰다: 어디인지, 위험한 곳인지 크게 알린다
    const zone = myZone(), dark = zoneGlow() === 0;
    renderWorld();
    banner(loc.zones[zone] ?? '', dark ? 'bad' : '', dark ? loc.ui.zoneDark : '');
  }
}
