// 징검돌 전술의 겉모습: 이끼 낀 정원, 대국판 여섯(45° 돌린 돌판, 칸, 바위, 등불돌, 앉는 돌), 대기실의 돌 둘레, 미니맵의 바탕.
import * as THREE from 'three';
import { addMarks, mat, part, setMapPaint, view, type Look } from '@engine/client';
import { BOARD, BOARDS, LOBBY } from '../shared/content/board';
import { cellPos, isLamp, isRock, seatPos } from '../shared/rules';

const GRASS = [new THREE.Color(0x6f9a58), new THREE.Color(0x5f8c4e)];
const PATH = new THREE.Color(0xb9a88a);
const N = BOARD.size, T = BOARD.tile;

export const look: Look = {
  // 풀밭 (대기실에서 판으로 가는 흙길은 scenery의 판)
  ground: (_x, _z, j, c) => { c.copy(GRASS[0]).lerp(GRASS[1], j); },
  leaf: (_x, _z, k) => [0x4f8a4a, 0x5f9a50, 0x3f7a46, 0x7aa050][Math.floor(k * 4) % 4],
  scenery: (scene) => {
    for (let b = 0; b < BOARDS.length; b++) scene.add(boardMesh(b));
    // 대기실에서 판마다 흙길
    const pathMat = mat(PATH.getHex());
    for (const o of BOARDS) {
      const len = Math.hypot(o.x - LOBBY.x, o.z - LOBBY.z), path = new THREE.Mesh(new THREE.PlaneGeometry(3, len).rotateX(-Math.PI / 2), pathMat);
      path.position.set((o.x + LOBBY.x) / 2, 0.015, (o.z + LOBBY.z) / 2); path.rotation.y = Math.atan2(o.x - LOBBY.x, o.z - LOBBY.z); path.receiveShadow = true;
      scene.add(path);
    }
    // 대기실: 낮은 돌 여덟이 둘러선 둥근 마당
    const yard = new THREE.Mesh(new THREE.CircleGeometry(LOBBY.r + 4, 32).rotateX(-Math.PI / 2), mat(0xc8b894));
    yard.position.set(LOBBY.x, 0.02, LOBBY.z); yard.receiveShadow = true; scene.add(yard);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      scene.add(part(new THREE.DodecahedronGeometry(0.7, 0), mat(0x8d8a80), LOBBY.x + Math.cos(a) * (LOBBY.r + 4.5), 0.45, LOBBY.z + Math.sin(a) * (LOBBY.r + 4.5)));
    }
  },
};

/** 대국판 하나: 바탕 돌판, 칸 49(바둑판처럼 두 빛깔), 바위 칸의 바위, 등불돌, 두 편의 앉는 돌 */
function boardMesh(b: number): THREE.Group {
  const g = new THREE.Group(), o = BOARDS[b];
  const slab = new THREE.Mesh(new THREE.BoxGeometry(N * T + 1.4, 0.4, N * T + 1.4), mat(0x77736a));
  slab.position.set(o.x, 0.1, o.z); slab.rotation.y = Math.PI / 4; slab.receiveShadow = true; slab.castShadow = true;
  g.add(slab);
  const tileGeo = new THREE.BoxGeometry(T * 0.94, 0.12, T * 0.94);
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      const at = cellPos(b, c, r);
      const color = isLamp(c, r) ? 0xd8c27a : (c + r) % 2 ? 0x9aa58a : 0xb3b8a0;
      const tile = new THREE.Mesh(tileGeo, mat(color));
      tile.position.set(at.x, 0.36, at.z); tile.rotation.y = Math.PI / 4; tile.receiveShadow = true;
      g.add(tile);
      if (isRock(c, r)) {
        const rock = part(new THREE.DodecahedronGeometry(1.0, 0), mat(0x6a655c), at.x, 1.05, at.z);
        rock.scale.set(1, 0.8, 1); rock.rotation.y = 0.7 + c; g.add(rock);
      }
      if (isLamp(c, r)) {
        // 등불돌: 낮은 기둥과 따뜻한 빛의 작은 집 (말이 그 위에 설 수 있게 칸의 모서리에)
        const lx = at.x, lz = at.z - T * 0.36;
        g.add(part(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), mat(0x6f6a60), lx, 0.95, lz));
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
        glow.position.set(lx, 1.6, lz); g.add(glow);
      }
    }
  }
  // 앉는 돌: 두 편의 자리 (사람이 그 앞에 선다)
  for (const side of [0, 1] as const) {
    const s = seatPos(b, side), toward = { x: o.x - s.x, z: o.z - s.z }, d = Math.hypot(toward.x, toward.z);
    const stool = part(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 7), mat(0x8a857a), s.x - (toward.x / d) * 1.3, 0.25, s.z - (toward.z / d) * 1.3);
    g.add(stool);
  }
  return g;
}

export function initScene(): void {
  view.setMood({ sky: 0xcfe0d8, hemi: 1.9, sun: 2.2, fogNear: 150, fogFar: 280 });
  setMapPaint((m) => {
    m.quad(-100, -100, 100, 100, '#5f8c4e');
    m.disc(LOBBY.x, LOBBY.z, LOBBY.r + 4, '#c8b894');
    for (const o of BOARDS) m.disc(o.x, o.z, (N / 2) * T * Math.SQRT2, '#9aa58a');
  });
  addMarks(() => [...BOARDS.map((o) => ({ x: o.x, z: o.z, color: '#e8e0c8', shape: 'square' as const })), { x: LOBBY.x, z: LOBBY.z, color: '#ffd27a', shape: 'dot' as const }]);
}
