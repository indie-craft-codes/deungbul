// 이 게임의 미니맵 표식: 등탑(켜졌으면 금빛, 꺼졌으면 회색), 상인, 던전의 문, 퀘스트 목적지.
// 미니맵 자체(hud/minimap.ts)는 무엇을 찍는지 모른다. 다른 게임은 이 파일만 바꾸면 된다.
import { DUNGEONS, GLOW_MAX, QUESTS, SHOPS, isDungeonId, stageOf } from '../../shared/defs';
import { AREAS, MAX_X, MIN_X, MIN_Z, TOWERS, ZONE_SPLIT, ZONE_SPLIT2 } from '../../shared/world';
import { $, addMapLabels, addMapPlaces, addMarks, inDungeon, type MapLabel, type MapPlace, type Mark, MARK, onSlow, S } from '@engine/client';
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
  // 전체 지도의 큰 이름: 구역(들판의 북쪽 가장자리 가까이)과 던전 안. 상점·대장간·던전의 문·사냥터는 틀이 내용에서 스스로 찍는다
  addMapLabels(() => {
    const loc = L(), out: MapLabel[] = [];
    const zoneX = [(MIN_X + ZONE_SPLIT) / 2, (ZONE_SPLIT + ZONE_SPLIT2) / 2, (ZONE_SPLIT2 + MAX_X) / 2];
    zoneX.forEach((x, i) => { if (loc.zones[i]) out.push({ x, z: MIN_Z + 14, text: loc.zones[i], big: true }); });
    for (const id of Object.keys(DUNGEONS)) {
      const area = AREAS.find((a) => a.id === id);
      if (area) out.push({ x: area.x0 + 14, z: (area.z0 + area.z1) / 2 - 22, text: loc.dungeons[id as keyof typeof loc.dungeons]?.name ?? id, big: true });
    }
    return out;
  });
  // 전체 지도의 장소: 등탑(마을, 밝기), 퀘스트 목적지(지금 할 일), 던전 안의 우두머리
  addMapPlaces(() => {
    const loc = L(), out: MapPlace[] = [];
    TOWERS.forEach((tw, i) => {
      const glow = GS.world.tower.glows[i] ?? 0;
      // 자리는 등탑 바로 앞(바치는 거리 TOWER_REACH 안): 일어나는 자리(spawn)는 그보다 조금 멀어, 자동 이동으로 와도 등탑 창이 열리지 않았다
      out.push({ x: tw.x, z: tw.z + tw.r + 1.8, name: loc.towers[tw.id] ?? tw.id, kind: 'town', info: glow > 0 ? loc.fmt.glow(stageOf(glow), glow, GLOW_MAX) : loc.ui.towerOff });
    });
    const chapter = QUESTS[G.quest.c], step = chapter?.steps[G.quest.s];
    if (chapter && step) out.push({ x: step.at.x, z: step.at.z, name: loc.ui.questGoal, kind: 'goal', info: `${loc.quests[chapter.id].title}: ${loc.quests[chapter.id].steps[G.quest.s] ?? ''}` });
    if (isDungeonId(S.dungeon.id) && !S.dungeon.cleared) {
      const boss = DUNGEONS[S.dungeon.id].boss;
      out.push({ x: boss.x, z: boss.z, name: loc.monsters[boss.type] ?? boss.type, kind: 'boss', hunt: true });
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
