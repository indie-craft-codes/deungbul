// 이 게임의 생김새: 몬스터 종류별 모델, 무기와 갑옷의 겉모습. 틀(scene/models.ts)에는 기본 모델만 있고, 여기서 등록한다.
// 새 몬스터나 장비를 더하면 아래 표에 한 줄을 더한다 (몬스터는 빠뜨리면 컴파일이 실패한다).
import * as THREE from 'three';
import type { ItemId, MonsterId } from '../../shared/defs';
import { limb, makeBlob, makeHumanoid, mat, part, registerArmor, registerBlade, registerMonsterModel, type ArmorLook, type BladeLook, type Model, type MonsterBuilder } from '@engine/client/scene/models';

const G = {
  wisp: new THREE.IcosahedronGeometry(0.42, 0), halo: new THREE.IcosahedronGeometry(0.7, 0),
  wBody: new THREE.BoxGeometry(0.7, 0.7, 1.5), wHead: new THREE.BoxGeometry(0.55, 0.5, 0.6), wSnout: new THREE.BoxGeometry(0.3, 0.26, 0.4),
  tusk: new THREE.BoxGeometry(0.08, 0.08, 0.3), wEar: new THREE.ConeGeometry(0.12, 0.3, 4), wLeg: new THREE.BoxGeometry(0.18, 0.6, 0.18), wTail: new THREE.BoxGeometry(0.16, 0.16, 0.6),
};
const wispMat = new THREE.MeshBasicMaterial({ color: 0xbfefff });
const haloMat = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.28, depthWrite: false });

function shade(type: string): Model {
  // 안개에 삼켜진 사람: 잿빛 사람형을 조금 크게. 누구의 그림자인지는 옷 색으로 가른다
  const cloth: Record<string, number> = { shade_bram: 0x4a5258, shade_mira: 0x3f5a4c };
  const m = makeHumanoid(cloth[type] ?? 0x4a5258, type === 'shade_bram', 0x8d979c);
  m.root.scale.setScalar(1.2);
  const inner = new THREE.Group();
  inner.add(m.root);
  return { root: inner, rig: m.rig };
}

function boss(type: string): Model {
  // 보스: 사람형 뼈대를 크게 키워 쓴다. 손에 든 것은 몽둥이. 지하묘의 주인은 조금 작고 보랏빛이다
  const lord = type === 'crypt_lord';
  const m = makeHumanoid(lord ? 0x4a3f6b : 0x56665a, true, lord ? 0xb7b0c8 : 0x7f9280);
  m.root.scale.setScalar(lord ? 1.9 : 2.3);
  if (m.blade) { m.blade.material = mat(0x6b4a2e); m.blade.scale.set(2.6, 1.3, 2.2); }
  const inner = new THREE.Group();
  inner.add(m.root);
  return { root: inner, rig: m.rig };
}

function soldier(type: string): Model {
  // 사람형 뼈대를 크기와 색만 바꿔 쓴다: 고블린은 작고 푸르고, 잊힌 병사는 크고 잿빛이다
  const goblin = type === 'goblin';
  const m = makeHumanoid(goblin ? 0x6b5a3a : 0x5d6670, true, goblin ? 0x7fae5a : 0x9aa3a8);
  m.root.scale.setScalar(goblin ? 0.78 : 1.12);
  if (!goblin) m.root.add(part(new THREE.BoxGeometry(0.66, 0.3, 0.66), mat(0x4a5258), 0, 2.16, 0)); // 투구
  const inner = new THREE.Group();
  inner.add(m.root);
  return { root: inner, rig: m.rig };
}

function wisp(): Model {
  const root = new THREE.Group();
  const blob = new THREE.Mesh(G.wisp, wispMat);
  blob.position.y = 1.3;
  blob.add(new THREE.Mesh(G.halo, haloMat));
  root.add(blob);
  return { root, blob, float: 1.3 };
}

function beast(type: string): Model {
  const root = new THREE.Group();
  // 네발 뼈대: 늑대와 멧돼지가 함께 쓴다
  const boar = type === 'boar';
  const fur = mat(boar ? 0x7b5a44 : 0x7d8288), dark = mat(boar ? 0x4f3a2e : 0x4b4f55), legs: THREE.Group[] = [];
  if (boar) { root.scale.set(1.15, 1, 1.05); root.add(part(G.tusk, mat(0xf2ead8), -0.2, 0.98, 1.5), part(G.tusk, mat(0xf2ead8), 0.2, 0.98, 1.5)); }
  root.add(part(G.wBody, fur, 0, 0.95, 0), part(G.wHead, fur, 0, 1.2, 0.95), part(G.wSnout, dark, 0, 1.1, 1.38));
  root.add(part(G.wEar, dark, -0.18, 1.58, 0.85), part(G.wEar, dark, 0.18, 1.58, 0.85));
  const tail = part(G.wTail, dark, 0, 1.15, -0.95);
  tail.rotation.x = 0.5;
  root.add(tail);
  for (const [lx, lz] of [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]]) {
    const pivot = limb(G.wLeg, dark, lx, 0.6, lz, 0.3);
    legs.push(pivot);
    root.add(pivot);
  }
  return { root, legs };
}

/** 몬스터 종류별 모델. 슬라임은 틀의 기본 모델(말랑한 덩어리)을 그대로 쓴다 */
const MONSTER_LOOKS: Record<MonsterId, MonsterBuilder> = {
  slime: makeBlob, wisp, wolf: beast, boar: beast,
  goblin: soldier, lost_soldier: soldier,
  shade_bram: shade, shade_mira: shade,
  ash_troll: boss, crypt_lord: boss,
};

// 무기 등급별 칼날 모양. 가장 좋은 검은 등불처럼 빛난다
const BLADES: Partial<Record<ItemId, BladeLook>> = {
  sword1: { color: 0xd8dde0, scale: 1, glow: false },
  sword2: { color: 0x9fc0dc, scale: 1.15, glow: false },
  sword3: { color: 0xffc766, scale: 1.3, glow: true },
  sword4: { color: 0xff7a3a, scale: 1.45, glow: false }, // 잿불검: 달군 쇠 빛
};

// 갑옷 등급별 모습: 가죽은 가슴받이와 허리띠, 쇠는 여기에 어깨받이가 붙는다
const ARMORS: Partial<Record<ItemId, ArmorLook>> = {
  armor1: { color: 0x7a5230, pads: false },
  armor2: { color: 0xaab4bc, pads: true },
};

export function initModels(): void {
  for (const [type, build] of Object.entries(MONSTER_LOOKS)) registerMonsterModel(type, build);
  for (const [id, look] of Object.entries(BLADES)) registerBlade(id, look);
  for (const [id, look] of Object.entries(ARMORS)) registerArmor(id, look);
}
