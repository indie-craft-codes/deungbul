// 이 게임의 미니맵 표식: 등탑(켜졌으면 금빛, 꺼졌으면 회색), 상인, 던전의 문, 퀘스트 목적지.
// 미니맵 자체(hud/minimap.ts)는 무엇을 찍는지 모른다. 다른 게임은 이 파일만 바꾸면 된다.
import { DUNGEONS, QUESTS, SHOPS, isDungeonId } from '../../../shared/defs';
import { TOWERS } from '../../../shared/world';
import { $ } from '../app';
import { onSlow } from '../bus';
import { t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { S, inDungeon } from '../state';
import { MARK, addMarks, type Mark } from './minimap';

export function initMarks(): void {
  // 던전 안에서는 들판의 표식(등탑, 상인, 퀘스트 목적지)이 가장자리에 붙어 헷갈리게 하므로 찍지 않는다
  addMarks(() => (inDungeon() ? [] : SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' }))));
  addMarks(() => Object.values(DUNGEONS).map((d): Mark => ({ x: d.portal.x, z: d.portal.z, color: MARK.portal, shape: 'ring' })));
  // 던전 안에서는 우두머리가 있는 곳을 붉은 고리로 알려 준다
  addMarks(() => (isDungeonId(S.dungeon.id) && !S.dungeon.cleared ? [{ x: DUNGEONS[S.dungeon.id].boss.x, z: DUNGEONS[S.dungeon.id].boss.z, color: '#ff6b5e', shape: 'ring', edge: true } as Mark] : []));
  addMarks(() => (inDungeon() ? [] : TOWERS.map((tw, i): Mark => ({ x: tw.x, z: tw.z, color: (S.world.tower.glows[i] ?? 0) > 0 ? MARK.lit : MARK.dark, shape: 'square', edge: true }))));
  addMarks(() => {
    const step = QUESTS[S.quest.c]?.steps[S.quest.s];
    return step && !inDungeon() ? [{ x: step.at.x, z: step.at.z, color: MARK.quest, shape: 'ring', edge: true }] : [];
  });
  // 범례도 지금 찍는 표식에 맞춘다. 표시(data-i18n)를 바꿔 두면 언어를 바꿀 때도 따라간다
  const legend = $('mapLegend');
  onSlow(() => {
    const key: UiKey = inDungeon() ? 'mapLegendDungeon' : 'mapLegend';
    if (legend.getAttribute('data-i18n') !== key) { legend.setAttribute('data-i18n', key); legend.textContent = t(key); }
  });
}
