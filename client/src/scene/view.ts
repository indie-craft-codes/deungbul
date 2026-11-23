// 3D 화면: 렌더러, 카메라, 빛, 지형과 나무. 게임 규칙은 모른다. 건물은 scene/scenery.ts가 세운다.
import * as THREE from 'three';
import type { Stage } from '../../../shared/defs';
import { MAX_X, MAX_Z, MIN_X, MIN_Z, POND, TOWERS, ZONE_SPLIT, onPath, rng, zoneOf, type World } from '../../../shared/world';
import { mat } from './models';
import { Scenery } from './scenery';

const SKY = 0xa9cdd0;
const CAM_DIR = new THREE.Vector3(1, 1.25, 1).normalize();
export type Ring = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;


export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 320);
  readonly moveMark: Ring;
  readonly targetRing: Ring;
  /** 퀘스트 목적지에 세우는 빛기둥 */
  readonly goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  private readonly sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
  private readonly hemi = new THREE.HemisphereLight(0xe6f5ff, 0x5e7050, 2.1);
  /** 이 게임의 건물들 (마을 집, 등탑) */
  private readonly scenery: Scenery;
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly v = new THREE.Vector3();
  private stage: Stage = 1;
  private raid = false;
  private dark = false;
  width = 1; height = 1;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 58, 125);

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 1; sc.far = 130;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.scenery = new Scenery(this.scene);
    this.buildNature(world);
    this.moveMark = this.ring(0.45, 0.62, 0xf0bb55);
    this.targetRing = this.ring(0.95, 1.12, 0xff6b5e);
    this.goalBeam.position.y = 7;
    this.goalBeam.visible = false;
    this.scene.add(this.goalBeam);
    TOWERS.forEach((t, i) => this.setTowerGlow(i, t.start));
    this.applyMood();
  }

  /** 땅에 눕힌 고리. 이동 표시, 대상 표시, 기술 이펙트에 쓴다. */
  ring(inner: number, outer: number, color: number): Ring {
    const g = new THREE.RingGeometry(inner, outer, 28);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.y = 0.08;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  private buildGround(): void {
    const rnd = rng(7);
    // 월드보다 사방으로 40씩 넓게 깔아서 가장자리 너머가 비어 보이지 않게 한다
    const w = MAX_X - MIN_X + 80, h = MAX_Z - MIN_Z + 80;
    let g: THREE.BufferGeometry = new THREE.PlaneGeometry(w, h, Math.round(w / 1.82), Math.round(h / 1.82));
    g.rotateX(-Math.PI / 2);
    g.translate((MIN_X + MAX_X) / 2, 0, (MIN_Z + MAX_Z) / 2);
    g = g.toNonIndexed();
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const dirt = new THREE.Color(0xb99c6c), sand = new THREE.Color(0xd0bd88), stone = new THREE.Color(0xb9aa8c);
    // 구역마다 풀빛이 다르다: 등불 들판은 푸르고, 잿빛 숲은 바랜 빛이다
    const grass = [[new THREE.Color(0x74ad5e), new THREE.Color(0x5f9a52)], [new THREE.Color(0x7b8f72), new THREE.Color(0x667a62)]];
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const j = rnd();
      if (TOWERS.some((t) => Math.hypot(x - t.x, z - t.z - 3.2) < 7.5)) c.copy(stone); // 등탑 앞마당
      else if (onPath(x, z, 1.9)) c.copy(dirt);
      else if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.8) c.copy(sand);
      else {
        // 구역의 경계에서는 두 빛깔을 섞어 띠가 지지 않게 한다
        const k = Math.min(1, Math.max(0, (x - (ZONE_SPLIT - 8)) / 16));
        const [a0, b0] = grass[0], [a1, b1] = grass[1];
        c.copy(a0).lerp(b0, j).lerp(new THREE.Color().copy(a1).lerp(b1, j), k);
      }
      c.offsetHSL(0, 0, (j - 0.5) * 0.045);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    const pg = new THREE.CircleGeometry(POND.r, 11);
    pg.rotateX(-Math.PI / 2);
    const pond = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x4f9fb8, roughness: 0.35, metalness: 0.1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pond.position.set(POND.x, 0.05, POND.z);
    this.scene.add(pond);
  }

  private buildNature(world: World): void {
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1.6, 5), mat(0x7a5536), world.trees.length);
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), world.trees.length);
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.75, 0), mat(0x8f9590), world.rocks.length);
    const d = new THREE.Object3D(), c = new THREE.Color();
    // 구역마다 잎의 빛깔이 다르다
    const leafColors = [[0x3f8a4f, 0x4c9a52, 0x357a4a, 0x5aa45a, 0x6aa04a], [0x4f6b58, 0x5d7862, 0x47604f, 0x6a8068, 0x748a6c]];
    world.trees.forEach((t, i) => {
      d.rotation.set(0, t.rot * 6.28, 0);
      d.scale.setScalar(t.s);
      d.position.set(t.x, 0.8 * t.s, t.z); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      d.position.set(t.x, 3.0 * t.s, t.z); d.updateMatrix(); leaves.setMatrixAt(i, d.matrix);
      const colors = leafColors[zoneOf(t.x)];
      leaves.setColorAt(i, c.setHex(colors[Math.floor(t.rot * colors.length) % colors.length]));
    });
    world.rocks.forEach((t, i) => {
      d.rotation.set(t.rot * 3, t.rot * 6.28, 0);
      d.scale.set(t.s, t.s * 0.75, t.s);
      d.position.set(t.x, 0.3 * t.s, t.z); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
    });
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    for (const m of [trunks, leaves, rocks]) { m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
  }

  /** i번 등탑의 등불을 밝기에 맞춘다 (scene/scenery.ts) */
  setTowerGlow(i: number, glow: number): void { this.scenery.setTowerGlow(i, glow); }

  /**
   * 내가 있는 구역의 분위기를 맞춘다: 등탑 밝기 단계, 습격 중인지, 등탑이 꺼져 있는지.
   * 모델은 그대로 두고 하늘빛과 안개만 바꾼다.
   */
  setMood(stage: Stage, raid: boolean, dark = false): void {
    if (stage === this.stage && raid === this.raid && dark === this.dark) return;
    this.stage = stage; this.raid = raid; this.dark = dark;
    this.applyMood();
  }
  private applyMood(): void {
    const s = this.stage, gloom = this.raid || this.dark; // 습격 중이거나 등탑이 꺼진 구역: 안개가 짙고 하늘이 어둡다
    this.hemi.intensity = [1.55, 2.1, 2.3][s] * (gloom ? 0.72 : 1);
    this.sun.intensity = gloom ? 1.3 : 2.3;
    const sky = gloom ? 0x6f8490 : [0x8fa9b0, SKY, 0xb4d6d4][s];
    (this.scene.background as THREE.Color).setHex(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(sky);
    fog.near = gloom ? 40 : 58;
    fog.far = gloom ? 95 : 125;
  }

  resize(w: number, h: number): void {
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 카메라는 각도 고정, 대상만 따라간다. */
  follow(x: number, z: number, zoom: number): void {
    const dist = 46 * zoom;
    this.camera.position.set(x + CAM_DIR.x * dist, CAM_DIR.y * dist, z + CAM_DIR.z * dist);
    this.camera.lookAt(x, 1, z);
    this.camera.updateMatrixWorld();
    this.sun.position.set(x - 24, 44, z + 16);
    this.sun.target.position.set(x, 0, z);
  }

  /** 월드 좌표를 화면 좌표로. 화면 밖이면 null. */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.v.set(x, y, z).project(this.camera);
    if (v.z >= 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.2) return null;
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }

  /** 화면 좌표가 가리키는 땅 위의 점. */
  pick(sx: number, sy: number): { x: number; z: number } | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, this.v);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  render(): void { this.renderer.render(this.scene, this.camera); }
}
