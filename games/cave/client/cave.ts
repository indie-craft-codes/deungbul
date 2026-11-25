// 버섯 동굴의 화면 규칙: 캠프 표식, 포자 탄, 그리고 '깊은 굴의 우두머리로' 자동 이동(다른 지역의 자리를 travelTo에 준다).
import { CAMP, DUNGEONS, SHOPS } from '../shared/content';
import { $, addMapPlaces, addMarks, type Mark, MARK, mountPanel, onKey, registerShot, rules, travelTo } from '@engine/client';
import { t } from '@engine/client/i18n';
import './cave.css';

export function mountCave(): void {
  mountPanel('rightBottom', `
    <div class="panel" id="caveGo">
      <button type="button" id="goBoss" data-i18n="goBoss"></button>
    </div>`);
}

/** 던전 안의 자리(우두머리)로 자동 이동: 들판에서는 문까지 데려가 멈춘다고 문서가 말한다 */
export function goBoss(): void {
  const b = DUNGEONS.deep.boss;
  travelTo({ x: b.x, z: b.z, name: t('bossSpot') });
}

export function initCave(): void {
  registerShot('spore', { shape: 'ball', color: 0xb6ff6a, size: 0.35 });
  rules.home = () => ({ x: CAMP.x, z: CAMP.z });
  addMarks(() => [{ x: CAMP.x, z: CAMP.z, color: MARK.lit, shape: 'square', edge: true }, ...SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' }))]);
  addMapPlaces(() => [{ x: CAMP.x, z: CAMP.z, name: t('camp'), kind: 'town', info: t('campInfo') }]);
  const btn = $<HTMLButtonElement>('goBoss');
  btn.addEventListener('click', () => { goBoss(); btn.blur(); });
  onKey('g', goBoss);
}
