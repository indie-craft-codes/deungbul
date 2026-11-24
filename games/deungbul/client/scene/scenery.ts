// 이 게임의 건물: 연못, 마을의 집과 등탑, 던전의 문과 던전 안의 바닥·기둥. 화면의 틀(scene/view.ts)과 나눠 두어, 다른 게임은 이 파일만 바꾸면 된다.
// 놓이는 자리는 맵 정의(games/deungbul/shared/content/map.ts)에서 읽는다.
import * as THREE from 'three';
import { DUNGEONS, stageOf } from '../../shared/defs';
import { AREAS, HOUSES, PILLARS, POND, TOWERS } from '../../shared/world';
import { mat, part } from '@engine/client';

/** 등탑 하나의 빛나는 부분: 등불, 빛무리, 실제 광원 */
interface TowerLamp { lamp: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; halo: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>; light: THREE.PointLight }

export class Scenery {
  private readonly towers: TowerLamp[] = [];

  constructor(private scene: THREE.Scene) {
    this.buildPond();
    this.buildVillage();
    this.buildTowers();
    this.buildDungeons();
    TOWERS.forEach((t, i) => this.setTowerGlow(i, t.start));
  }

  private buildPond(): void {
    const pg = new THREE.CircleGeometry(POND.r, 11);
    pg.rotateX(-Math.PI / 2);
    const pond = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x4f9fb8, roughness: 0.35, metalness: 0.1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pond.position.set(POND.x, 0.05, POND.z);
    this.scene.add(pond);
  }

  private buildVillage(): void {
    const wall = new THREE.BoxGeometry(5, 3, 4), roof = new THREE.ConeGeometry(4.3, 2.4, 4), door = new THREE.BoxGeometry(0.9, 1.6, 0.1);
    for (const [hx, hz, color] of HOUSES) {
      const g = new THREE.Group();
      const w = part(wall, mat(0xe7d7b9), 0, 1.5, 0);
      w.receiveShadow = true;
      const r = part(roof, mat(color), 0, 4.2, 0);
      r.rotation.y = Math.PI / 4;
      r.scale.set(1, 1, 0.82);
      g.add(w, r, part(door, mat(0x6b4a2e), 0, 0.8, hz < 0 ? 2.02 : -2.02));
      g.position.set(hx, 0, hz);
      this.scene.add(g);
    }
  }

  /** 등탑: 돌기둥 위에 등불 방과 지붕. 실제 광원은 등탑에만 둔다 */
  private buildTowers(): void {
    const shaft = new THREE.CylinderGeometry(0.95, 1.3, 5.2, 8), rim = new THREE.CylinderGeometry(1.25, 1.05, 0.4, 8);
    const post = new THREE.BoxGeometry(0.14, 1.5, 0.14), roof = new THREE.ConeGeometry(1.5, 1.3, 8);
    for (const t of TOWERS) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 1.1), new THREE.MeshBasicMaterial({ color: 0xffc766 }));
      const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.2, depthWrite: false }));
      const light = new THREE.PointLight(0xffc878, 110, 34, 1.6);
      const g = new THREE.Group();
      g.add(part(shaft, mat(0x9a9c96), 0, 2.6, 0), part(rim, mat(0x7d7f7a), 0, 5.4, 0));
      for (const o of [lamp, halo, light]) { o.position.y = 6.3; g.add(o); }
      for (const [px, pz] of [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]]) g.add(part(post, mat(0x5d5f5a), px, 6.3, pz));
      g.add(part(roof, mat(0x8a4a3a), 0, 7.7, 0));
      g.position.set(t.x, 0, t.z);
      this.scene.add(g);
      this.towers.push({ lamp, halo, light });
    }
  }

  /** 던전: 들판에는 문(돌기둥 둘과 빛나는 막)을 세우고, 던전 지역에는 돌바닥과 기둥, 둘레의 벽을 놓는다 */
  private buildDungeons(): void {
    const stone = mat(0x5a566b), dark = mat(0x3a3648);
    for (const d of Object.values(DUNGEONS)) {
      const g = new THREE.Group();
      const post = new THREE.BoxGeometry(0.7, 4.2, 0.7);
      g.add(part(post, stone, -1.5, 2.1, 0), part(post, stone, 1.5, 2.1, 0), part(new THREE.BoxGeometry(4.2, 0.6, 0.9), stone, 0, 4.4, 0));
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.9), new THREE.MeshBasicMaterial({ color: 0xa48cff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      veil.position.y = 2.05;
      g.add(veil);
      g.position.set(d.portal.x, 0, d.portal.z);
      g.rotation.y = Math.PI / 4; // 카메라를 마주 보게 돌려 세운다
      this.scene.add(g);
    }
    for (const a of AREAS.slice(1)) {
      const w = a.x1 - a.x0, h = a.z1 - a.z0, cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w + 60, h + 60), new THREE.MeshStandardMaterial({ color: 0x2b2836, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0.02, cz);
      floor.receiveShadow = true;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(w - 4, h - 4), new THREE.MeshStandardMaterial({ color: 0x4a4658, roughness: 1 }));
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(cx, 0.04, cz);
      inner.receiveShadow = true;
      this.scene.add(floor, inner);
      // 둘레의 벽: 갈 수 있는 범위의 가장자리를 따라 세운다
      const wallH = 3;
      for (const [x, z, sx, sz] of [[cx, a.z0 + 1, w, 1.2], [cx, a.z1 - 1, w, 1.2], [a.x0 + 1, cz, 1.2, h], [a.x1 - 1, cz, 1.2, h]] as const) {
        this.scene.add(part(new THREE.BoxGeometry(sx, wallH, sz), dark, x, wallH / 2, z));
      }
    }
    const pillar = new THREE.CylinderGeometry(1, 1.15, 5, 8);
    for (const c of PILLARS) {
      const m = part(pillar, stone, c.x, 2.5, c.z);
      m.scale.set(c.r, 1, c.r);
      this.scene.add(m);
    }
  }

  /** i번 등탑의 등불을 밝기에 맞춘다. 밝기가 0이면 꺼진 등탑이다. */
  setTowerGlow(i: number, glow: number): void {
    const t = this.towers[i];
    if (!t) return;
    const lit = glow > 0, s = stageOf(glow);
    t.lamp.material.color.setHex(lit ? [0x9c7a4a, 0xffc766, 0xfff0b8][s] : 0x3d4042);
    t.halo.visible = lit;
    t.halo.material.opacity = [0.06, 0.2, 0.34][s];
    t.halo.scale.setScalar([1, 1.25, 1.7][s]);
    t.light.intensity = lit ? [25, 110, 260][s] : 0;
  }
}

/** 세워 둔 건물들. 화면이 땅을 깐 뒤에 한 번 세우고(Look.scenery), 등불 밝기는 scene.ts가 맞춘다 */
export let scenery: Scenery | null = null;
export function buildScenery(scene: THREE.Scene): void { scenery = new Scenery(scene); }
