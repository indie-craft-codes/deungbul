// 이펙트: 땅 위의 고리와 이동 표시, 날아가는 화살, 타격감(번쩍임, 불티, 움찔, 화면 흔들림).
// 전부 연출일 뿐이다. 피해와 위치는 서버가 이미 정했다.
import * as THREE from 'three';
import { clamp, view } from './app';
import type { Ring } from './scene/view';

interface Burst { mesh: Ring; t: number; radius: number; life: number }
const bursts: Burst[] = [];
let markT = 0;

/** 그 자리에서 radius까지 퍼지며 사라지는 고리. life가 길면 천천히 퍼진다 (예고용) */
export function burst(x: number, z: number, radius: number, color: number, life = 0.45): void {
  const mesh = view.ring(0.8, 1, color);
  mesh.position.set(x, 0.1, z);
  mesh.visible = true;
  bursts.push({ mesh, t: 0, radius, life });
}

interface Arrow { mesh: THREE.Mesh; t: number; x1: number; z1: number; x2: number; z2: number }
const arrows: Arrow[] = [];
const arrowGeo = new THREE.BoxGeometry(0.07, 0.07, 1.0);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf6ecd2 });
const boltGeo = new THREE.IcosahedronGeometry(0.22, 0);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xffa24a });
/** 화살이 날아가는 시간(초). 멀리서 쏜 공격의 타격 연출은 이만큼 늦춘다 */
export const ARROW_S = 0.16;

/** 날아가는 화살, magic이면 불꽃 */
export function arrow(x1: number, z1: number, x2: number, z2: number, magic = false): void {
  if (arrows.length > 60) return;
  const mesh = magic ? new THREE.Mesh(boltGeo, boltMat) : new THREE.Mesh(arrowGeo, arrowMat);
  mesh.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  mesh.position.set(x1, 1.4, z1);
  view.scene.add(mesh);
  arrows.push({ mesh, t: 0, x1, z1, x2, z2 });
}

/** 이동 목적지 표시 */
export function markMove(x: number, z: number): void {
  view.moveMark.position.set(x, 0.08, z);
  view.moveMark.visible = true;
  markT = 0.6;
}

// ---------- 타격감 ----------
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLASH_S = 0.07; // 맞은 쪽이 하얗게 번쩍이는 시간
const RECOIL_S = 0.2; // 움찔했다 돌아오는 시간
const MAX_SPARKS = 140;

export interface HitFx {
  /** 맞은 엔티티 */
  id: number;
  /** 맞은 자리와 높이 */
  x: number; z: number; h: number;
  /** 때린 쪽의 자리 (불티와 밀림의 방향) */
  fromX: number; fromZ: number;
  /** 세기: 1이 보통. 치명타는 크게, 남의 싸움은 작게 */
  power: number;
  color: number;
  /** 화면 흔들림 (0이면 없음) */
  shake: number;
  /** 이만큼 뒤에 터진다 (날아가는 화살이 닿을 때) */
  delay: number;
}
const pending: HitFx[] = [];

interface Spark { mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; vx: number; vy: number; vz: number; t: number; life: number }
const sparks: Spark[] = [];
const sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
const sparkMats = new Map<number, THREE.MeshBasicMaterial>();
const sparkMat = (color: number) => {
  let m = sparkMats.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); sparkMats.set(color, m); }
  return m;
};

interface Flash { mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>; t: number; size: number }
const flashes: Flash[] = [];
const flashGeo = new THREE.IcosahedronGeometry(1, 1);

interface Recoil { t: number; dx: number; dz: number; power: number }
const recoils = new Map<number, Recoil>();
const still = { ox: 0, oz: 0, scale: 1, flash: false };
const moved = { ox: 0, oz: 0, scale: 1, flash: false };

let shakeAmt = 0;
const shakeAt = { x: 0, z: 0 };

/** 타격 연출을 건다. delay가 있으면 그만큼 뒤에 터진다. */
export function hit(fx: HitFx): void {
  if (pending.length > 80) return;
  if (fx.delay > 0) pending.push({ ...fx }); else fire(fx);
}

/** 불티만 흩뿌린다 (쓰러질 때 등) */
export function puff(x: number, h: number, z: number, count: number, color: number, speed = 4): void {
  for (let i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    spark(x, h, z, Math.cos(a) * v, 1.5 + Math.random() * 3.5, Math.sin(a) * v, color);
  }
}

function spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number): void {
  const mesh = new THREE.Mesh(sparkGeo, sparkMat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  view.scene.add(mesh);
  sparks.push({ mesh, vx, vy, vz, t: 0, life: 0.28 + Math.random() * 0.22 });
}

function fire(fx: HitFx): void {
  let dx = fx.x - fx.fromX, dz = fx.z - fx.fromZ;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const y = Math.max(0.6, fx.h * 0.5);
  // 번쩍: 맞은 자리에서 작게 터졌다 사라진다
  const mesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  mesh.position.set(fx.x - dx * 0.4, y, fx.z - dz * 0.4);
  view.scene.add(mesh);
  flashes.push({ mesh, t: 0, size: 0.55 * fx.power });
  // 불티: 맞은 방향으로 더 많이 튄다
  const n = Math.round(3 + fx.power * 4);
  for (let i = 0; i < n && sparks.length < MAX_SPARKS; i++) {
    const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 2.4, v = (3 + Math.random() * 5) * Math.min(1.5, fx.power);
    spark(fx.x, y, fx.z, Math.cos(a) * v, 1 + Math.random() * 4, Math.sin(a) * v, fx.color);
  }
  recoils.set(fx.id, { t: 0, dx, dz, power: fx.power });
  if (fx.shake > 0) shake(fx.shake);
}

/** 화면을 잠깐 흔든다. amount는 흔들리는 폭(m)이고, 더 큰 흔들림이 진행 중이면 그대로 둔다 */
export function shake(amount: number): void {
  if (!calm) shakeAmt = Math.max(shakeAmt, amount);
}
/** 카메라가 보는 자리에 더할 흔들림 */
export function shakeOffset(): { x: number; z: number } { return shakeAt; }

/** 맞은 엔티티의 모델을 그릴 때 더할 값: 밀린 거리, 부푼 크기, 하얗게 번쩍이는 중인가 */
export function recoilOf(id: number): { ox: number; oz: number; scale: number; flash: boolean } {
  const r = recoils.get(id);
  if (!r) return still;
  const k = r.t / RECOIL_S, back = (1 - k) * (1 - k), amp = 0.32 * Math.min(1.6, r.power);
  moved.ox = r.dx * amp * back; moved.oz = r.dz * amp * back;
  moved.scale = 1 + 0.14 * Math.min(1.6, r.power) * back;
  moved.flash = r.t < FLASH_S;
  return moved;
}

export function updateFx(dt: number): void {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.t += dt;
    const k = a.t / ARROW_S;
    if (k >= 1) { view.scene.remove(a.mesh); arrows.splice(i, 1); continue; }
    a.mesh.position.set(a.x1 + (a.x2 - a.x1) * k, 1.4 - k * 0.5, a.z1 + (a.z2 - a.z1) * k);
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    const k = b.t / b.life;
    b.mesh.scale.setScalar(0.4 + k * b.radius);
    b.mesh.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { view.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bursts.splice(i, 1); }
  }
  if (markT > 0) {
    markT -= dt;
    view.moveMark.material.opacity = clamp(markT / 0.6, 0, 1);
    view.moveMark.scale.setScalar(1 + (0.6 - markT));
    if (markT <= 0) view.moveMark.visible = false;
  }

  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    p.delay -= dt;
    if (p.delay <= 0) { pending.splice(i, 1); fire(p); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.t += dt;
    if (s.t >= s.life) { view.scene.remove(s.mesh); sparks.splice(i, 1); continue; }
    s.vy -= 18 * dt;
    const m = s.mesh.position;
    m.set(m.x + s.vx * dt, Math.max(0.07, m.y + s.vy * dt), m.z + s.vz * dt);
    s.mesh.scale.setScalar(1 - (s.t / s.life) * 0.8);
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = f.t / 0.12;
    if (k >= 1) { view.scene.remove(f.mesh); f.mesh.material.dispose(); flashes.splice(i, 1); continue; }
    f.mesh.scale.setScalar(f.size * (0.5 + k));
    f.mesh.material.opacity = 0.85 * (1 - k);
  }
  for (const [id, r] of recoils) { r.t += dt; if (r.t >= RECOIL_S) recoils.delete(id); }
  if (shakeAmt > 0.005) {
    shakeAt.x = (Math.random() * 2 - 1) * shakeAmt; shakeAt.z = (Math.random() * 2 - 1) * shakeAmt;
    shakeAmt *= Math.exp(-dt * 14);
  } else { shakeAmt = 0; shakeAt.x = 0; shakeAt.z = 0; }
}
