// 이 게임의 미니맵 표식: 등탑(켜졌으면 금빛, 꺼졌으면 회색), 상인, 던전의 문, 퀘스트 목적지.
// 미니맵 자체(hud/minimap.ts)는 무엇을 찍는지 모른다. 다른 게임은 이 파일만 바꾸면 된다.
import { DUNGEONS, QUESTS, SHOPS, isDungeonId } from '../../shared/defs';
import { AREAS, MAX_X, MIN_X, MIN_Z, TOWERS, ZONE_SPLIT } from '../../shared/world';
import { $, addMapLabels, addMarks, inDungeon, type MapLabel, type Mark, MARK, onSlow, S } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import type { UiKey } from '@engine/client/i18n/ko';
import { G, GS } from '../state';

export function initMarks(): void {
  // 던전 안에서는 들판의 표식(등탑, 상인, 퀘스트 목적지)이 가장자리에 붙어 헷갈리게 하므로 찍지 않는다
  addMarks(() => (inDungeon() ? [] : SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' }))));
  addMarks(() => Object.values(DUNGEONS).map((d): Mark => ({ x: d.portal.x, z: d.portal.z, color: MARK.portal, shape: 'ring' })));
  // 던전 안에서는 우두머리가 있는 곳을 붉은 고리로 알려 준다
  addMarks(() => (isDungeonId(S.dungeon.id) && !S.dungeon.cleared ? [{ x: DUNGEONS[S.dungeon.id].boss.x, z: DUNGEONS[S.dungeon.id].boss.z, color: '#ff6b5e', shape: 'ring', edge: true } as Mark] : []));
  addMarks(() => (inDungeon() ? [] : TOWERS.map((tw, i): Mark => ({ x: tw.x, z: tw.z, color: (GS.world.tower.glows[i] ?? 0) > 0 ? MARK.lit : MARK.dark, shape: 'square', edge: true }))));
  addMarks(() => {
    const step = QUESTS[G.quest.c]?.steps[G.quest.s];
    return step && !inDungeon() ? [{ x: step.at.x, z: step.at.z, color: MARK.quest, shape: 'ring', edge: true }] : [];
  });
  // 전체 지도의 이름: 구역(들판의 북쪽 가장자리 가까이), 등탑, 던전의 문과 던전 안
  addMapLabels(() => {
    const loc = L(), out: MapLabel[] = [];
    const zoneX = [(MIN_X + ZONE_SPLIT) / 2, (ZONE_SPLIT + MAX_X) / 2];
    zoneX.forEach((x, i) => { if (loc.zones[i]) out.push({ x, z: MIN_Z + 14, text: loc.zones[i], big: true }); });
    for (const tw of TOWERS) out.push({ x: tw.x + 4, z: tw.z + 4, text: loc.towers[tw.id] ?? '' });
    for (const [id, d] of Object.entries(DUNGEONS)) {
      const name = loc.dungeons[id as keyof typeof loc.dungeons]?.name ?? id;
      out.push({ x: d.portal.x + 7, z: d.portal.z + 7, text: name });
      const area = AREAS.find((a) => a.id === id);
      if (area) out.push({ x: (area.x0 + area.x1) / 2 - 22, z: (area.z0 + area.z1) / 2, text: name, big: true });
    }
    return out;
  });
  // 범례도 지금 찍는 표식에 맞춘다. 표시(data-i18n)를 바꿔 두면 언어를 바꿀 때도 따라간다
  const legend = $('mapLegend');
  onSlow(() => {
    const key: UiKey = inDungeon() ? 'mapLegendDungeon' : 'mapLegend';
    if (legend.getAttribute('data-i18n') !== key) { legend.setAttribute('data-i18n', key); legend.textContent = t(key); }
  });
}
