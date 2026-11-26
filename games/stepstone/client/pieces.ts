// 말의 모습: 돌로 깎은 작은 수호상 셋(방패돌, 투석돌, 날쌘돌). 서버의 엔티티 종류 'unit'(server/duels.ts)을 그린다.
// 실려 오는 값: [편, 체력, 최대 체력, 걸었음 1 + 쳤음 2, 쓰러짐 1, 판 id]. 편의 색 띠, 머리 위의 체력 알, 차례를 마친 말은 어둡게.
import * as THREE from 'three';
import { mat, part, registerKind, type Model } from '@engine/client';
import { SIDE_COLOR, UNITS, type UnitType } from '../shared/content/board';

/** 모델 안쪽의 묶음: 치는 몸짓·무너짐은 이것을 움직인다 (틀이 root의 자리를 매 프레임 맞추므로) */
export interface PieceParts { body: THREE.Group; band: THREE.Mesh[]; pips: THREE.Mesh[]; stone: THREE.Mesh[]; pipBox: THREE.Group }
const PARTS = new WeakMap<THREE.Object3D, PieceParts>();
export const pieceParts = (root: THREE.Object3D): PieceParts | undefined => PARTS.get(root);

/** 판의 칸 윗면 높이: 말은 그 위에 선다 */
export const TILE_TOP = 0.42;
const STONE = 0xa9a294, DARK = 0x6f6a60, EMPTY = 0x3a3a3a, HP = 0x7ee07a;

function piece(type: UnitType): Model {
  const root = new THREE.Group(), body = new THREE.Group();
  root.position.y = TILE_TOP;
  root.add(body);
  // 칸(2.6m)에 맞게 사람(2.1m)보다 조금 크게
  body.scale.setScalar(1.35);
  const stone: THREE.Mesh[] = [], band: THREE.Mesh[] = [];
  const add = (m: THREE.Mesh, list?: THREE.Mesh[]) => { body.add(m); list?.push(m); return m; };
  // 받침: 편의 색 띠
  add(part(new THREE.CylinderGeometry(0.62, 0.7, 0.16, 8), mat(0xffffff), 0, 0.08, 0), band);
  if (type === 'shield') {
    add(part(new THREE.BoxGeometry(0.9, 1.0, 0.7), mat(STONE), 0, 0.7, 0), stone);
    add(part(new THREE.BoxGeometry(0.55, 0.45, 0.5), mat(STONE), 0, 1.42, 0), stone);
    // 앞의 넓은 방패
    add(part(new THREE.BoxGeometry(1.1, 1.15, 0.16), mat(0xffffff), 0, 0.8, 0.5), band);
  } else if (type === 'sling') {
    add(part(new THREE.CylinderGeometry(0.28, 0.38, 1.2, 6), mat(STONE), 0, 0.76, 0), stone);
    add(part(new THREE.IcosahedronGeometry(0.3, 0), mat(STONE), 0, 1.58, 0), stone);
    // 위로 든 던지는 팔과 돌
    const arm = add(part(new THREE.BoxGeometry(0.1, 0.8, 0.1), mat(DARK), 0.32, 1.45, 0));
    arm.rotation.z = -0.4;
    add(part(new THREE.IcosahedronGeometry(0.13, 0), mat(0xffffff), 0.5, 1.85, 0), band);
  } else {
    add(part(new THREE.DodecahedronGeometry(0.45, 0), mat(STONE), 0, 0.72, 0), stone);
    add(part(new THREE.ConeGeometry(0.28, 0.5, 5), mat(0xffffff), 0, 1.3, 0), band);
    for (const sx of [-0.22, 0.22]) add(part(new THREE.BoxGeometry(0.16, 0.42, 0.2), mat(DARK), sx, 0.3, 0.05));
  }
  // 머리 위의 체력 알 (최대 체력만큼, 다섯씩 두 줄)
  const pips: THREE.Mesh[] = [], max = UNITS[type].hp, geo = new THREE.BoxGeometry(0.15, 0.15, 0.15), pipBox = new THREE.Group();
  root.add(pipBox);
  for (let i = 0; i < max; i++) {
    const row = Math.floor(i / 5), col = i % 5, inRow = Math.min(5, max - row * 5);
    const pip = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: HP }));
    pip.position.set((col - (inRow - 1) / 2) * 0.19, 2.75 + row * 0.19, 0);
    pipBox.add(pip); pips.push(pip);
  }
  PARTS.set(root, { body, band, pips, stone, pipBox });
  return { root };
}

export function initPieces(): void {
  registerKind('unit', {
    model: (e) => piece((['shield', 'sling', 'runner'] as const).includes(e.type as UnitType) ? (e.type as UnitType) : 'runner'),
    update: (m, vals) => {
      const p = PARTS.get(m.root);
      if (!p) return;
      const [side, hp, , flags] = vals;
      const color = SIDE_COLOR[side === 1 ? 1 : 0];
      const done = (flags & 2) !== 0;
      for (const b of p.band) b.material = mat(done ? new THREE.Color(color).multiplyScalar(0.55).getHex() : color);
      for (const s of p.stone) s.material = mat(done ? DARK : STONE);
      p.pips.forEach((pip, i) => { (pip.material as THREE.MeshBasicMaterial).color.setHex(i < hp ? HP : EMPTY); });
    },
    dot: '#e8e0c8',
  });
}
