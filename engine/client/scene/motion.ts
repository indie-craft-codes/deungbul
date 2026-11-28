// 코드 모델의 3D 동작 (useMotion). 끄면(기본) 예전 그대로다: 걸을 때 팔다리를 흔들고, 공격은 오른팔을 한 번 휘두르고, 죽으면 줄어든다.
// 켜면 코드 모델(사람형 rig, 네발 legs, 덩어리 blob)이 키프레임 동작을 한다: 숨쉬기, 걸을 때 몸이 오르내리고 앞으로 기울기,
// 손 모양마다 다른 공격(검은 들어 내려치며 한 걸음 내딛고, 활은 당겨 쏘고, 지팡이는 들어 올렸다 내지르고, 빈손은 주먹),
// 네발은 웅크렸다 덮치고, 덩어리는 찌그러졌다 튀어 오른다. 맞으면 뒤로 움찔하고, 죽으면 뒤나 옆으로 쓰러져 잠깐 누워 있다가 사라진다.
// 모델 파일(asset)과 그림 판(sprite)은 건드리지 않는다. 화면만의 연출이라 서버·경제와 무관하다.
// 신호는 모델 파일과 같다: cueAnim(m, 'attack' | 'hit' | 'die') (scene/models.ts). 손 모양을 더한 게임은 registerSwing으로 그 공격 동작을 더한다
import * as THREE from 'three';
import type { AnimState } from '../assets';
import type { Model } from './models';

let on = false;
/** 코드 모델의 3D 동작을 켠다 (게임의 클라이언트가 처음에 한 번) */
export function useMotion(enable = true): void { on = enable; }
export const motionOn = (): boolean => on;

/** 동작의 길이(초): 공격, 맞음, 쓰러짐 */
export const MOTION_S = { attack: 0.45, hit: 0.3, die: 0.75 };
/** t 경과 시간, atk·hit·die 각 동작이 시작된 뒤의 시간(die < 0이면 서 있음), dir 쓰러지는 쪽(0 뒤, ±1 옆), yaw 몸의 방향, size 키 배율(사람 2.1 = 1) */
export interface Motion { t: number; atk: number; hit: number; die: number; dir: number; yaw: number; size: number }

function motionOf(m: Model): Motion {
  if (m.mo) return m.mo;
  const r = m.root;
  r.updateMatrixWorld(true);
  const h = new THREE.Box3().setFromObject(r).getSize(new THREE.Vector3()).y / Math.max(0.01, Math.abs(r.scale.y));
  r.rotation.order = 'YXZ'; // 몸의 방향을 먼저 돌린 뒤 몸 기준으로 기울인다
  m.mo = { t: Math.random() * 6, atk: 9, hit: 9, die: -1, dir: 0, yaw: r.rotation.y, size: Number.isFinite(h) && h > 0.1 ? h / 2.1 : 1 };
  return m.mo;
}

/** 동작 신호를 받는다 (cueAnim이 코드 모델에 부른다). 쓰러짐이면 true */
export function cueMotion(m: Model, s: AnimState): boolean {
  const mo = motionOf(m);
  if (mo.die >= 0) return s === 'die';
  if (s === 'attack') mo.atk = 0;
  else if (s === 'hit') mo.hit = 0;
  else if (s === 'die') {
    mo.die = 0;
    // 네발은 옆으로, 나머지는 뒤로 넘어지는 것이 많고 가끔 옆으로
    mo.dir = m.legs ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.55 ? 0 : Math.random() < 0.5 ? -1 : 1;
    return true;
  }
  return false;
}

type Keys = readonly (readonly [number, number])[];
/** 키프레임 [시각(0~1), 값]을 부드럽게 잇는다 (처음보다 앞은 처음 값, 끝보다 뒤는 끝 값) */
export function key(a: number, ks: Keys): number {
  if (a <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1] = ks[i];
    if (a > t1) continue;
    const [t0, v0] = ks[i - 1], u = (a - t0) / Math.max(1e-6, t1 - t0);
    return v0 + (v1 - v0) * u * u * (3 - 2 * u);
  }
  return ks[ks.length - 1][1];
}

/**
 * 손 모양 하나의 공격 동작 (사람형): 팔의 앞뒤 회전(ra 오른팔, la 왼팔, 라디안: 음수가 앞으로 들기), 오른팔 옆 회전(raz),
 * 몸 비틀기(tw), 앞뒤 기울기(ln, 양수가 앞), 내딛기(fw, 키 2.1 기준 m), 뛰기(up), step이면 서 있을 때 한 걸음 내딛는다. 시각은 공격 길이의 몫(0~1)
 */
export interface Swing { ra: Keys; la: Keys; raz?: Keys; tw: Keys; ln: Keys; fw: Keys; up?: Keys; step?: boolean }
const SWINGS = new Map<string, Swing>([
  ['sword', {
    ra: [[0, 0], [0.3, -2.9], [0.48, -0.35], [0.7, -0.5], [1, 0]], la: [[0, 0], [0.3, -0.7], [0.48, 0.45], [1, 0]],
    tw: [[0, 0], [0.3, -0.35], [0.48, 0.3], [0.7, 0.2], [1, 0]], ln: [[0, 0], [0.3, -0.14], [0.48, 0.24], [0.7, 0.18], [1, 0]],
    fw: [[0, 0], [0.3, -0.06], [0.48, 0.3], [0.7, 0.26], [1, 0]], step: true,
  }],
  ['bow', {
    la: [[0, 0], [0.22, -1.55], [0.75, -1.55], [1, 0]], ra: [[0, 0], [0.22, -1.4], [0.55, -1.5], [0.6, -1.0], [0.8, -1.1], [1, 0]],
    raz: [[0, 0], [0.22, -0.35], [0.55, -0.5], [0.6, 0.15], [1, 0]],
    tw: [[0, 0], [0.22, 0.35], [0.75, 0.35], [1, 0]], ln: [[0, 0], [0.55, 0], [0.62, -0.1], [0.8, -0.04], [1, 0]], fw: [[0, 0], [0.55, 0], [0.62, -0.08], [1, 0]],
  }],
  ['staff', {
    ra: [[0, 0], [0.35, -2.75], [0.55, -1.35], [0.78, -1.4], [1, 0]], la: [[0, 0], [0.35, -1.1], [0.55, -1.65], [0.78, -1.5], [1, 0]],
    tw: [[0, 0], [0.35, -0.15], [0.55, 0.1], [1, 0]], ln: [[0, 0], [0.35, -0.12], [0.55, 0.16], [0.78, 0.1], [1, 0]],
    fw: [[0, 0], [0.35, 0], [0.55, 0.14], [1, 0]], up: [[0, 0], [0.35, 0.07], [0.55, 0], [1, 0]],
  }],
  ['', {
    ra: [[0, 0], [0.3, 0.6], [0.45, -1.55], [0.7, -1.4], [1, 0]], la: [[0, 0], [0.3, -0.9], [0.45, 0.3], [1, 0]],
    tw: [[0, 0], [0.3, -0.3], [0.45, 0.3], [1, 0]], ln: [[0, 0], [0.3, -0.06], [0.45, 0.16], [1, 0]],
    fw: [[0, 0], [0.3, -0.04], [0.45, 0.2], [0.7, 0.16], [1, 0]], step: true,
  }],
]);
/** 손 모양의 공격 동작을 더하거나 바꾼다 (registerHand로 더한 손 모양용). 등록하지 않은 손 모양은 검의 동작 */
export function registerSwing(hand: string, s: Swing): void { SWINGS.set(hand, s); }

/** 쓰러지는 몫(0~1): 점점 빨리 넘어가 바닥에서 한 번 튄다 */
const fall = (p: number): number => (p < 0.8 ? (p / 0.8) ** 2 : 1 - 0.07 * Math.sin((Math.PI * (p - 0.8)) / 0.2));

/** 한 프레임 (scene/models.ts의 animate가 코드 모델에 부른다) */
export function animateMotion(m: Model, x: number, z: number, face: number, walking: boolean, phase: number, dt: number, scale: number): void {
  const mo = motionOf(m), r = m.root;
  mo.t += dt; mo.atk += dt; mo.hit += dt;
  if (mo.die >= 0) mo.die += dt;
  let d = face - mo.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  mo.yaw += d * Math.min(1, dt * 12);
  const dying = mo.die >= 0, walk = walking && !dying, sz = mo.size;
  const a = !dying && mo.atk < MOTION_S.attack ? mo.atk / MOTION_S.attack : -1;
  const h = !dying && mo.hit < MOTION_S.hit ? Math.sin((Math.PI * mo.hit) / MOTION_S.hit) : 0;
  const e = dying ? fall(Math.min(1, mo.die / MOTION_S.die)) : 0;
  const breathe = Math.sin(mo.t * 2.2);
  const fast = a >= 0 || h > 0 || dying;
  const k = fast ? 1 : Math.min(1, dt * 18);
  const ease = (o: THREE.Object3D, ax: 'x' | 'z', v: number): void => { o.rotation[ax] += (v - o.rotation[ax]) * k; };
  let ln = 0, roll = 0, tw = 0, up = 0, fw = 0, sy = 1, sxz = 1;
  if (m.rig) {
    const g = m.rig, sw = walk ? Math.sin(phase) * 0.75 : 0;
    let llx = sw, rlx = -sw, lax = -sw * 0.8, rax = sw * 0.8, laz = -0.08 - 0.03 * breathe, raz = 0.08 + 0.03 * breathe;
    if (walk) { up = Math.abs(Math.cos(phase)) * 0.07 * sz; ln = 0.1; } else sy = 1 + 0.012 * breathe;
    if (a >= 0) {
      const sv = SWINGS.get(m.hand ?? 'sword') ?? SWINGS.get('sword')!;
      rax = key(a, sv.ra); lax = key(a, sv.la);
      if (sv.raz) raz += key(a, sv.raz);
      tw = key(a, sv.tw); ln = key(a, sv.ln); fw = key(a, sv.fw) * sz;
      if (sv.up) up += key(a, sv.up) * sz;
      if (sv.step && !walk) { const st = key(a, [[0, 0], [0.48, 1], [0.7, 0.9], [1, 0]]); llx = -0.45 * st; rlx = 0.35 * st; }
    }
    if (h) { ln -= 0.3 * h; fw -= 0.14 * h * sz; laz -= 0.5 * h; raz += 0.5 * h; lax -= 0.3 * h; }
    if (dying) {
      if (mo.dir === 0) ln = -1.48 * e; else roll = mo.dir * 1.5 * e;
      up = 0.22 * sz * e; tw = 0; fw = 0;
      lax = -2.3 * e; rax = -1.6 * e; laz = -0.5 * e; raz = 0.5 * e; llx = -0.25 * e; rlx = 0.15 * e;
    }
    ease(g.ll, 'x', llx); ease(g.rl, 'x', rlx); ease(g.la, 'x', lax); ease(g.ra, 'x', rax); ease(g.la, 'z', laz); ease(g.ra, 'z', raz);
  } else if (m.legs) {
    // 네발: 앞 왼쪽, 앞 오른쪽, 뒤 왼쪽, 뒤 오른쪽 (대각선끼리 같이 걷는다)
    const L = m.legs, sw = walk ? Math.sin(phase) * 0.75 : 0;
    let fl = 0, bl = 0;
    if (walk) { up = Math.abs(Math.cos(phase)) * 0.05 * sz; ln = Math.sin(phase * 2) * 0.03; } else sy = 1 + 0.015 * breathe;
    if (a >= 0) {
      fw = key(a, [[0, 0], [0.3, -0.18], [0.5, 0.35], [0.72, 0.28], [1, 0]]) * sz;
      ln = key(a, [[0, 0], [0.3, -0.18], [0.5, 0.22], [0.72, 0.14], [1, 0]]);
      up += key(a, [[0, 0], [0.3, 0], [0.42, 0.25], [0.55, 0], [1, 0]]) * sz;
      fl = key(a, [[0, 0], [0.3, 0.4], [0.45, -0.75], [0.72, -0.3], [1, 0]]);
      bl = key(a, [[0, 0], [0.3, -0.35], [0.45, 0.6], [1, 0]]);
    }
    if (h) { ln -= 0.25 * h; fw -= 0.2 * h * sz; }
    if (dying) { roll = (mo.dir || 1) * 1.5 * e; up = 0.36 * sz * e; ln = 0; fw = 0; fl = -0.35 * e; bl = 0.35 * e; }
    if (L.length >= 4) { ease(L[0], 'x', sw + fl); ease(L[1], 'x', -sw + fl); ease(L[2], 'x', -sw + bl); ease(L[3], 'x', sw + bl); }
  } else if (m.blob) {
    if (m.float) m.blob.position.y = m.float + Math.sin(phase * 0.35) * 0.2;
    else { m.blob.scale.y = 0.75 + Math.sin(phase * 0.4) * 0.07; if (walk) up = Math.abs(Math.sin(phase * 0.6)) * 0.35 * sz; }
    if (a >= 0) {
      if (m.float) { fw = key(a, [[0, 0], [0.3, -0.25], [0.5, 0.7], [1, 0]]) * sz; sxz = sy = key(a, [[0, 1], [0.3, 0.85], [0.5, 1.2], [1, 1]]); }
      else {
        sy = key(a, [[0, 1], [0.3, 0.62], [0.45, 1.28], [0.65, 0.85], [1, 1]]); sxz = key(a, [[0, 1], [0.3, 1.25], [0.45, 0.85], [0.65, 1.12], [1, 1]]);
        up += key(a, [[0, 0], [0.3, 0], [0.45, 0.5], [0.62, 0], [1, 0]]) * sz; fw = key(a, [[0, 0], [0.3, -0.1], [0.5, 0.5], [0.7, 0.4], [1, 0]]) * sz;
      }
    }
    if (h) { sy -= 0.3 * h; sxz += 0.2 * h; fw -= 0.18 * h * sz; }
    if (dying) {
      if (m.float) { up = 0.9 * sz * e; sy = sxz = 1 - 0.5 * e; } // 떠 있는 것은 위로 흩어진다
      else { sy = 1 - 0.85 * e; sxz = 1 + 0.55 * e; up = 0; fw = 0; } // 말랑한 것은 퍼지며 주저앉는다
    }
  }
  r.rotation.set(ln, mo.yaw + tw, roll);
  r.position.set(x + Math.sin(mo.yaw) * fw, up, z + Math.cos(mo.yaw) * fw);
  r.scale.set(scale * sxz, scale * sy, scale * sxz);
}
