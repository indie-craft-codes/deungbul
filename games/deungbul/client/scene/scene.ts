// 이 게임의 장면: 등탑의 등불 밝기, 구역의 분위기(등탑 밝기 단계·습격·꺼진 등탑·던전), 퀘스트 목적지의 빛기둥, 미니맵의 바탕.
// 틀(scene/view.ts)은 값만 받아 그리고, 언제 어떤 값을 쓸지는 여기서 정한다. 필요한 것은 bus에 스스로 등록한다.
import * as THREE from 'three';
import type { Stage } from '../../shared/defs';
import { inDungeon, type Mood, onMsg, onSlow, S, setMapPaint, view } from '@engine/client';
import { GS, myZone, stage, zoneGlow } from '../state';
import { mapPaint } from './paint';
import { scenery } from './scenery';

/** 퀘스트 목적지에 세우는 빛기둥. 자리와 밝기는 hud/quest.ts가 매 프레임 맞춘다 */
export const goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));

/** 구역의 분위기: 등탑 밝기 단계, 습격 중인지, 어두운 곳(등탑이 꺼진 구역, 던전)인지에 따른 하늘빛과 빛, 안개 */
export function moodOf(s: Stage, raid: boolean, dark: boolean): Mood {
  const gloom = raid || dark; // 습격 중이거나 등탑이 꺼진 구역: 안개가 짙고 하늘이 어둡다
  return {
    sky: gloom ? 0x6f8490 : [0x8fa9b0, 0xa9cdd0, 0xb4d6d4][s],
    hemi: [1.55, 2.1, 2.3][s] * (gloom ? 0.72 : 1),
    sun: gloom ? 1.3 : 2.3,
    fogNear: gloom ? 40 : 58,
    fogFar: gloom ? 95 : 125,
  };
}

/** 지금 맞춰 둔 구역. 구역을 넘어가면 분위기를 다시 맞춘다 */
let shownZone = -1;
/** 지금 맞춰 둔 분위기가 던전 안의 것인가. 던전을 드나들면 분위기를 다시 맞춘다 */
let shownInside = false;
/** 공유 상태(등탑 밝기, 습격)가 바뀌었거나 다른 구역으로 넘어갔을 때: 등불과 분위기를 내가 있는 구역에 맞춘다 */
function render(): void {
  const zone = myZone(), glow = zoneGlow();
  shownZone = zone;
  shownInside = inDungeon();
  GS.world.tower.glows.forEach((g, i) => scenery?.setTowerGlow(i, g));
  view.setMood(moodOf(stage(), zone === 0 && GS.world.raid.phase === 'active', glow === 0 || shownInside)); // 던전 안은 늘 어둡다
}

export function initScene(): void {
  goalBeam.position.y = 7;
  goalBeam.visible = false;
  view.scene.add(goalBeam);
  setMapPaint(mapPaint);
  onMsg('world', render);
  // 던전은 구역 번호가 그 곁의 들판과 같다: 구역만 보면, 등탑이 켜진 구역에서 던전에 들어갔을 때 다음 공유 상태가 올 때까지 밖의 밝은 분위기가 남는다
  // (나올 때도 던전의 어둠이 남는다). 그래서 던전을 드나든 것도 함께 본다
  onSlow(() => { if (S.me && (myZone() !== shownZone || inDungeon() !== shownInside)) render(); });
  render();
}
