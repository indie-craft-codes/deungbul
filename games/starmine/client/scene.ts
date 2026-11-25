// 이 게임의 겉모습: 밤의 골짜기, 광산 입구와 별빛 채굴기, 몬스터와 장비의 모델. 모두 틀의 등록 접점으로 그린다.
import * as THREE from 'three';
import { DRILL } from '../shared/content/drill';
import { CAMPS } from '../shared/content';
import { AREAS } from '@engine/shared/world';
import { defaultHumanoid, limb, type Look, mat, type Model, onFrame, part, registerArmor, registerBlade, registerHand, registerMonsterModel, registerShot, setHumanoidBody, setMapPaint, view } from '@engine/client';
import { G } from './drill';

const slate = [new THREE.Color(0x4a5266), new THREE.Color(0x3c4456)], dust = new THREE.Color(0x6a6278);
const LEAVES = [0x3f6f78, 0x557f8a, 0x6a5f8f, 0x46617a];
/** 채굴기 꼭대기의 별: 레벨이 있으면 빛나며 돈다 */
const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0xbfe4ff }));
const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c });

export const look: Look = {
  // 광산 입구 둘레는 밝은 흙, 그 밖은 푸른 돌바닥
  ground: (x, z, j, c) => { if (Math.hypot(x - DRILL.x, z - DRILL.z) < 10) c.copy(dust); else c.copy(slate[0]).lerp(slate[1], j); },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
  scenery: (scene) => {
    // 광산 입구: 바위 아치와 어두운 굴
    const gate = new THREE.Group();
    gate.add(part(new THREE.BoxGeometry(1, 3.4, 1), mat(0x6b6f7d), -2.6, 1.7, -2.2), part(new THREE.BoxGeometry(1, 3.4, 1), mat(0x6b6f7d), 2.6, 1.7, -2.2));
    gate.add(part(new THREE.BoxGeometry(6.4, 0.9, 1.2), mat(0x5d6170), 0, 3.6, -2.2), part(new THREE.BoxGeometry(4.2, 3, 0.2), glow(0x0b0e16), 0, 1.5, -2.6));
    // 채굴기: 나무 탑과 굴대, 꼭대기의 별
    gate.add(part(new THREE.CylinderGeometry(0.9, 1.3, 2.6, 6), mat(0x7a5a3a), 0, 1.3, 0), part(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 6), mat(0xcfd6e0), 0, 3.6, 0));
    star.position.set(0, 5.6, 0);
    gate.add(star);
    gate.position.set(DRILL.x, 0, DRILL.z);
    scene.add(gate);
    // 땅에 박힌 별가루 수정: 사냥터마다 몇 개
    let k = 0;
    for (const c of CAMPS) for (let i = 0; i < 4; i++, k++) {
      const a = k * 2.4, r = 9 + (k % 3);
      const cr = part(new THREE.OctahedronGeometry(0.5 + (k % 2) * 0.3, 0), glow(k % 2 ? 0x9fd0ff : 0xd8b8ff), c.x + Math.cos(a) * r, 0.5, c.z + Math.sin(a) * r);
      cr.scale.y = 1.8;
      scene.add(cr);
    }
  },
};

/** 수정 달팽이: 껍데기가 수정인 통통 튀는 덩어리 */
function snail(): Model {
  const root = new THREE.Group(), inner = new THREE.Group();
  const blob = part(new THREE.SphereGeometry(0.55, 6, 4), mat(0x9a8f7a), 0, 0.4, 0.2);
  blob.scale.set(1, 0.6, 1.6);
  inner.add(blob, part(new THREE.OctahedronGeometry(0.55, 0), glow(0x9fd0ff), 0, 0.95, -0.2));
  root.add(inner);
  return { root, blob };
}
/** 굴박쥐: 떠서 날갯짓하는 몸 */
function bat(): Model {
  const root = new THREE.Group(), inner = new THREE.Group(), fur = mat(0x3a3248);
  const blob = part(new THREE.SphereGeometry(0.4, 6, 4), fur, 0, 1.2, 0);
  for (const s of [-1, 1]) { const w = part(new THREE.BoxGeometry(0.9, 0.06, 0.5), mat(0x55486a), s * 0.6, 1.25, 0); w.rotation.z = s * 0.3; inner.add(w); }
  inner.add(blob, part(new THREE.BoxGeometry(0.08, 0.08, 0.05), glow(0xffd36a), -0.14, 1.3, 0.38), part(new THREE.BoxGeometry(0.08, 0.08, 0.05), glow(0xffd36a), 0.14, 1.3, 0.38));
  root.add(inner);
  return { root, blob, float: 0.4 };
}
/** 조약돌 정령: 둥둥 뜬 돌덩이와 빛나는 눈 */
function pebble(): Model {
  const root = new THREE.Group(), inner = new THREE.Group();
  const blob = part(new THREE.DodecahedronGeometry(0.6, 0), mat(0x8a8f9a), 0, 0.9, 0);
  inner.add(blob, part(new THREE.BoxGeometry(0.4, 0.1, 0.05), glow(0x9fffd0), 0, 1.0, 0.55));
  for (const s of [-1, 1]) inner.add(part(new THREE.DodecahedronGeometry(0.22, 0), mat(0x7a7f8a), s * 0.85, 0.9, 0));
  root.add(inner);
  return { root, blob };
}
/** 바위 골렘: 팔다리 넷의 큰 돌사람 (사람 걸음) */
function golem(): Model {
  const root = new THREE.Group(), inner = new THREE.Group(), rock = mat(0x6f6a62), dark = mat(0x55514b);
  inner.add(part(new THREE.BoxGeometry(1.5, 1.4, 1), rock, 0, 2.1, 0), part(new THREE.BoxGeometry(0.8, 0.6, 0.7), dark, 0, 3.05, 0.05), part(new THREE.BoxGeometry(0.5, 0.12, 0.05), glow(0x9fd0ff), 0, 3.1, 0.42));
  const ll = limb(new THREE.BoxGeometry(0.5, 1.4, 0.5), dark, -0.4, 1.4, 0, 0.7), rl = limb(new THREE.BoxGeometry(0.5, 1.4, 0.5), dark, 0.4, 1.4, 0, 0.7);
  const la = limb(new THREE.BoxGeometry(0.45, 1.5, 0.45), rock, -1.0, 2.6, 0, 0.75), ra = limb(new THREE.BoxGeometry(0.45, 1.5, 0.45), rock, 1.0, 2.6, 0, 0.75);
  inner.add(ll, rl, la, ra);
  root.add(inner);
  return { root, rig: { ll, rl, la, ra } };
}

export function initScene(): void {
  registerMonsterModel('snail', snail);
  registerMonsterModel('bat', bat);
  registerMonsterModel('pebble', pebble);
  registerMonsterModel('golem', golem);
  // 사람 모델: 틀의 사람형에 광부의 머리 등(작은 빛)을 얹는다
  setHumanoidBody((lk) => {
    const m = defaultHumanoid(lk);
    m.head?.add(part(new THREE.CylinderGeometry(0.33, 0.35, 0.16, 6), mat(0x5a4a38), 0, 0.33, 0), part(new THREE.BoxGeometry(0.14, 0.12, 0.08), glow(0xfff2b0), 0, 0.33, 0.33));
    return m;
  });
  // 광부의 손 모양(직업 정의의 hand: 'pick'): 자루와 양쪽으로 뻗은 곡괭이 날
  registerHand('pick', ({ rig }) => {
    const handle = part(new THREE.BoxGeometry(0.09, 1.1, 0.09), mat(0x7a5a3a), 0, -0.7, 0.45);
    handle.rotation.x = Math.PI / 2;
    const head = part(new THREE.BoxGeometry(0.1, 0.12, 0.8), mat(0xc8ced8), 0, 0.5, 0);
    handle.add(head);
    rig.ra.add(handle);
    return head;
  });
  // 날아가는 것: 별점술사의 별빛 알갱이, 조약돌 정령의 돌
  registerShot('mote', { shape: 'ball', color: 0xbfe4ff, size: 0.8 });
  registerShot('pebble', { shape: 'ball', color: 0x8a8f9a, size: 0.7 });
  registerBlade('pick2', { color: 0xbfe4ff, scale: 1.2, glow: true });
  registerArmor('apron', { color: 0x7a5a3a, pads: false });
  view.setMood({ sky: 0x1d2638, hemi: 1.7, sun: 1.6, fogNear: 50, fogFar: 110 });
  setMapPaint((b) => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, '#3c4456'); b.disc(DRILL.x, DRILL.z, 10, '#6a6278'); });
  onFrame((now) => {
    const on = G.drill.lv > 0;
    star.visible = on;
    star.rotation.y = now / 600;
    star.position.y = 5.6 + Math.sin(now / 400) * 0.15;
    star.scale.setScalar(0.7 + G.drill.lv * 0.06);
  });
}
