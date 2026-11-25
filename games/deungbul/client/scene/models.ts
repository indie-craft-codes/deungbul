// 이 게임의 생김새: 몬스터 종류별 모델, 무기와 갑옷의 겉모습. 틀(scene/models.ts)에는 기본 모델만 있고, 여기서 등록한다.
// 새 몬스터나 장비를 더하면 아래 표에 한 줄을 더한다 (몬스터는 빠뜨리면 컴파일이 실패한다).
import * as THREE from 'three';
import type { ItemId, MonsterId } from '../../shared/defs';
import { $, addIconSheet, addItemSheet, itemIcon, type ArmorLook, type BladeLook, limb, makeBlob, makeHumanoid, mat, type Model, type MonsterBuilder, part, registerArmor, registerBlade, registerMonsterModel, setHumanoidDeco } from '@engine/client';

const G = {
  wisp: new THREE.IcosahedronGeometry(0.42, 0), halo: new THREE.IcosahedronGeometry(0.7, 0),
  wBody: new THREE.BoxGeometry(0.7, 0.7, 1.5), wHead: new THREE.BoxGeometry(0.55, 0.5, 0.6), wSnout: new THREE.BoxGeometry(0.3, 0.26, 0.4),
  tusk: new THREE.BoxGeometry(0.08, 0.08, 0.3), wEar: new THREE.ConeGeometry(0.12, 0.3, 4), wLeg: new THREE.BoxGeometry(0.18, 0.6, 0.18), wTail: new THREE.BoxGeometry(0.16, 0.16, 0.6),
};
const wispMat = new THREE.MeshBasicMaterial({ color: 0xbfefff });
// 이 게임의 사람은 누구나 허리춤에 등불을 찬다 (실제 광원이 아니라 빛나는 재질). 틀의 사람형 모델에는 없고 여기서 덧붙인다.
// init이 아니라 이 모듈이 읽히는 때에 등록한다: 어떤 사람형이 만들어지기보다 먼저여야 한다
const lampGeo = new THREE.BoxGeometry(0.2, 0.26, 0.2), lampMat = new THREE.MeshBasicMaterial({ color: 0xffc766 });
setHumanoidDeco((root) => { const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(-0.46, 0.92, 0.1); root.add(lamp); });
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
  // 깨어난 주인(깊은 곳)은 더 크고 검붉다
  const deep = type === 'crypt_lord_deep', lord = type === 'crypt_lord' || deep;
  const m = makeHumanoid(deep ? 0x5a2f3a : lord ? 0x4a3f6b : 0x56665a, true, deep ? 0xc8a0a8 : lord ? 0xb7b0c8 : 0x7f9280);
  m.root.scale.setScalar(deep ? 2.1 : lord ? 1.9 : 2.3);
  if (m.blade) { m.blade.material = mat(0x6b4a2e); m.blade.scale.set(2.6, 1.3, 2.2); }
  const inner = new THREE.Group();
  inner.add(m.root);
  return { root: inner, rig: m.rig };
}

function soldier(type: string): Model {
  // 사람형 뼈대를 크기와 색만 바꿔 쓴다: 고블린은 작고 푸르고, 잊힌 병사는 크고 잿빛이다
  // 지하묘 기사는 잊힌 병사보다 크고 검푸른 갑옷이다
  const goblin = type === 'goblin', knight = type === 'crypt_knight';
  const m = makeHumanoid(goblin ? 0x6b5a3a : knight ? 0x2f3a4a : 0x5d6670, true, goblin ? 0x7fae5a : 0x9aa3a8);
  m.root.scale.setScalar(goblin ? 0.78 : knight ? 1.3 : 1.12);
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
  // 무덤 사냥개는 늑대 뼈대를 조금 크게, 잿빛 검은 털로
  const boar = type === 'boar', hound = type === 'grave_hound';
  const fur = mat(boar ? 0x7b5a44 : hound ? 0x3a3a40 : 0x7d8288), dark = mat(boar ? 0x4f3a2e : hound ? 0x1f1f24 : 0x4b4f55), legs: THREE.Group[] = [];
  if (hound) root.scale.setScalar(1.15);
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
  ash_troll: boss, crypt_lord: boss, crypt_lord_deep: boss,
  grave_hound: beast, crypt_knight: soldier,
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
  // 아이템 그림: 소모품과 재료를 한 장에 담은 시트(public/items/sheet.jpg, 3열 × 2행, 한 칸 256px). 위 줄 왼쪽부터의 차례
  // 그림 시트 넷 (public/items/, 투명 배경 webp). 칸의 차례는 위 줄 왼쪽부터
  addItemSheet('./items/sheet.webp', 3, 2, ['potion', 'tonic', 'hide', 'iron', 'ashcore', 'dust'] satisfies ItemId[]);
  // 무기는 직업의 손 모양마다 그림이 다르다: 검(전사), 활(궁수), 지팡이(마법사). 갑옷은 모두에게
  addItemSheet('./items/gear.webp', 3, 2, ['sword1', 'sword2', 'sword3', 'sword4'] satisfies ItemId[], 'sword');
  addItemSheet('./items/gear.webp', 3, 2, [null, null, null, null, 'armor1', 'armor2'] satisfies (ItemId | null)[]);
  addItemSheet('./items/hands.webp', 4, 2, ['sword1', 'sword2', 'sword3', 'sword4'] satisfies ItemId[], 'bow');
  addItemSheet('./items/hands.webp', 4, 2, [null, null, null, null, 'sword1', 'sword2', 'sword3', 'sword4'] satisfies (ItemId | null)[], 'staff');
  // 장신구(떨어진 장비의 칸), 재화, 우편
  addIconSheet('./items/trinkets.webp', 3, 2, ['slot:ring', 'slot:amulet', 'slot:charm', 'cur:gold', 'cur:second', 'ui:mail']);
  // 불씨는 이 게임의 표시(#sparks)로 그린다: 그 앞에 그림
  const sparks = $('sparks'), pic = itemIcon('cur:second', '', 'sm');
  if (sparks && pic) sparks.before(pic);
}
