// 이 게임의 미니맵 표식: 등탑(켜졌으면 금빛, 꺼졌으면 회색), 상인, 던전의 문, 퀘스트 목적지.
// 미니맵 자체(hud/minimap.ts)는 무엇을 찍는지 모른다. 다른 게임은 이 파일만 바꾸면 된다.
import { DUNGEONS, QUESTS, SHOPS } from '../../../shared/defs';
import { TOWERS } from '../../../shared/world';
import { S } from '../state';
import { MARK, addMarks, type Mark } from './minimap';

export function initMarks(): void {
  addMarks(() => SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' })));
  addMarks(() => Object.values(DUNGEONS).map((d): Mark => ({ x: d.portal.x, z: d.portal.z, color: MARK.portal, shape: 'ring' })));
  addMarks(() => TOWERS.map((t, i): Mark => ({ x: t.x, z: t.z, color: (S.world.tower.glows[i] ?? 0) > 0 ? MARK.lit : MARK.dark, shape: 'square', edge: true })));
  addMarks(() => {
    const step = QUESTS[S.quest.c]?.steps[S.quest.s];
    return step ? [{ x: step.at.x, z: step.at.z, color: MARK.quest, shape: 'ring', edge: true }] : [];
  });
}
