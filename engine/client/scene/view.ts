// 3D 화면: 렌더러, 카메라, 빛, 지형과 나무. 게임 규칙도, 이 게임의 맵도 모른다.
// 땅과 잎의 색, 건물, 분위기의 값은 게임이 넘긴다 (Look, setMood). 그 밖의 물체는 게임이 scene에 직접 더한다.
import * as THREE from 'three';
import { MAP, rng, type World } from '../../shared/world';
import { mat } from './models';

const SKY = 0xa9cdd0;
const CAM_DIR = new THREE.Vector3(1, 1.25, 1).normalize();
export type Ring = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

/** 장면의 분위기: 하늘빛(안개도 같은 색), 두 빛의 세기, 안개가 끼기 시작하는 거리와 다 덮는 거리 */
export interface Mood { sky: number; hemi: number; sun: number; fogNear: number; fogFar: number }

/** 게임이 넘기는 지형의 겉모습. 넘기지 않은 것은 기본(한 가지 풀빛, 한 가지 잎 색 묶음, 건물 없음)으로 그린다 */
export interface Look {
  /** 땅의 삼각형 하나의 색을 c에 적는다. (x, z)는 삼각형의 가운데, j는 삼각형마다 다른 0~1의 난수 */
  ground?: (x: number, z: number, j: number, c: THREE.Color) => void;
  /** 나무 한 그루의 잎 색. k는 나무마다 다른 0~1의 값 */
  leaf?: (x: number, z: number, k: number) => number;
  /** 땅을 깐 바로 뒤에 한 번 불린다: 게임의 건물과 지형물을 장면에 더한다 */
  scenery?: (scene: THREE.Scene, world: World) => void;
}
const GRASS = [new THREE.Color(0x74ad5e), new THREE.Color(0x5f9a52)];
const LEAVES = [0x3f8a4f, 0x4c9a52, 0x357a4a, 0x5aa45a, 0x6aa04a];
const plainGround = (_x: number, _z: number, j: number, c: THREE.Color): void => { c.copy(GRASS[0]).lerp(GRASS[1], j); };
const plainLeaf = (_x: number, _z: number, k: number): number => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length];


export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 320);
  readonly moveMark: Ring;
  readonly targetRing: Ring;
  private readonly sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
  private readonly hemi = new THREE.HemisphereLight(0xe6f5ff, 0x5e7050, 2.1);
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly v = new THREE.Vector3();
  width = 1; height = 1;

  constructor(canvas: HTMLCanvasElement, world: World, look: Look = {}) {
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

    this.buildGround(look.ground ?? plainGround);
    look.scenery?.(this.scene, world);
    this.buildNature(world, look.leaf ?? plainLeaf);
    this.moveMark = this.ring(0.45, 0.62, 0xf0bb55);
    this.targetRing = this.ring(0.95, 1.12, 0xff6b5e);
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

  /**
   * 땅: 지역마다 한 장씩 깔고 색은 게임의 ground가 칠한다. 들판(0번 지역)은 사방으로 40, 다른 지역(던전 …)은 10 넓게 깔아 가장자리 너머가 비어 보이지 않게 한다.
   * 게임이 던전의 바닥을 따로 깔면(등불지기의 scenery) 그것이 조금 위에 놓여 이 땅을 덮는다
   */
  private buildGround(paint: NonNullable<Look['ground']>): void {
    const rnd = rng(7);
    MAP.areas.forEach((area, i) => this.groundFor(area, i === 0 ? 40 : 10, paint, rnd));
  }

  private groundFor(area: { x0: number; x1: number; z0: number; z1: number }, pad: number, paint: NonNullable<Look['ground']>, rnd: () => number): void {
    const { x0: MIN_X, x1: MAX_X, z0: MIN_Z, z1: MAX_Z } = area;
    const w = MAX_X - MIN_X + pad * 2, h = MAX_Z - MIN_Z + pad * 2;
    let g: THREE.BufferGeometry = new THREE.PlaneGeometry(w, h, Math.round(w / 1.82), Math.round(h / 1.82));
    g.rotateX(-Math.PI / 2);
    g.translate((MIN_X + MAX_X) / 2, 0, (MIN_Z + MAX_Z) / 2);
    g = g.toNonIndexed();
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const j = rnd();
      paint(x, z, j, c);
      c.offsetHSL(0, 0, (j - 0.5) * 0.045);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildNature(world: World, leaf: NonNullable<Look['leaf']>): void {
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1.6, 5), mat(0x7a5536), world.trees.length);
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), world.trees.length);
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.75, 0), mat(0x8f9590), world.rocks.length);
    const d = new THREE.Object3D(), c = new THREE.Color();
    world.trees.forEach((t, i) => {
      d.rotation.set(0, t.rot * 6.28, 0);
      d.scale.setScalar(t.s);
      d.position.set(t.x, 0.8 * t.s, t.z); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      d.position.set(t.x, 3.0 * t.s, t.z); d.updateMatrix(); leaves.setMatrixAt(i, d.matrix);
      leaves.setColorAt(i, c.setHex(leaf(t.x, t.z, t.rot)));
    });
    world.rocks.forEach((t, i) => {
      d.rotation.set(t.rot * 3, t.rot * 6.28, 0);
      d.scale.set(t.s, t.s * 0.75, t.s);
      d.position.set(t.x, 0.3 * t.s, t.z); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
    });
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    for (const m of [trunks, leaves, rocks]) { m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
  }

  /**
   * 분위기를 맞춘다. 모델은 그대로 두고 하늘빛, 빛의 세기, 안개만 바꾼다.
   * 값만 받는다: 어떤 때 어떤 값을 쓸지(밝기 단계, 습격, 던전)는 게임이 정한다. 부르기 전에는 맑은 낮이다.
   */
  setMood(m: Mood): void {
    this.hemi.intensity = m.hemi;
    this.sun.intensity = m.sun;
    (this.scene.background as THREE.Color).setHex(m.sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(m.sky);
    fog.near = m.fogNear;
    fog.far = m.fogFar;
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
