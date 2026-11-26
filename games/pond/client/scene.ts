// 반딧불 연못의 겉모습: 밤의 풀밭과 연못(장면에 직접), 물고기·찌·컴퓨터 낚시꾼(게임의 엔티티 종류), 자리마다의 옷 색, 반딧불
import * as THREE from 'three';
import { L } from '@engine/client/i18n';
import { makeHumanoid, mat, onFrame, part, registerKind, setMapPaint, setPlayerLook, view, type Look, type Model } from '@engine/client';
import { POND } from '../shared/content/pond';

/** 자리마다의 색 (판의 막대의 이름 글자, 옷, 찌) */
export const SEAT_HEX = [0xe8b04a, 0x5fb3e0, 0xe0607a, 0x8fd06a];
export const SEAT_CSS = ['#f0bd5a', '#6cc0ee', '#f07a92', '#9ad877'];

const grass = [new THREE.Color(0x2f4a36), new THREE.Color(0x3a5a3e)];
const bank = new THREE.Color(0x5b5a44);
const lobby = new THREE.Color(0x6a6350);

export const look: Look = {
  ground: (x, z, j, c) => {
    const r = Math.hypot(x, z);
    if (r < POND.radius + 1.8) c.copy(bank);
    else if (Math.hypot(x, z - POND.lobbyZ) < 6) c.copy(lobby).lerp(grass[0], j * 0.3);
    else c.copy(grass[0]).lerp(grass[1], j);
  },
  leaf: (_x, _z, k) => [0x2e5a3a, 0x356a40, 0x24503a][Math.floor(k * 3) % 3],
  scenery: (scene) => {
    // 물: 둥근 판 둘. 가장자리 돌, 연잎, 나루의 말뚝
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND.radius, 40), new THREE.MeshStandardMaterial({ color: 0x1d4a66, roughness: 0.25, metalness: 0.1, flatShading: true }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.03; water.receiveShadow = true;
    scene.add(water);
    const deep = new THREE.Mesh(new THREE.CircleGeometry(POND.radius * 0.62, 30), new THREE.MeshStandardMaterial({ color: 0x163a55, roughness: 0.3, flatShading: true }));
    deep.rotation.x = -Math.PI / 2; deep.position.y = 0.035;
    scene.add(deep);
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2, r = POND.radius + 0.25 + (k % 3) * 0.12;
      const s = part(new THREE.DodecahedronGeometry(0.32 + (k % 4) * 0.06, 0), mat(0x7d7f78), Math.sin(a) * r, 0.12, Math.cos(a) * r);
      s.rotation.set(k, k * 2, 0);
      scene.add(s);
    }
    for (const [x, z, r] of [[-3.4, 2.1, 0.5], [1.2, -3.6, 0.42], [3.5, 2.4, 0.38], [-1.6, -3.2, 0.33]] as const) {
      const pad = part(new THREE.CylinderGeometry(r, r, 0.04, 9), mat(0x3f8a4a), x, 0.06, z);
      scene.add(pad);
    }
    POND.spots.forEach((sp) => {
      const post = part(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), mat(0x6a4a30), sp.x, 0.55, sp.z - 0.9);
      const lamp = part(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }), sp.x, 1.25, sp.z - 0.9);
      scene.add(post, lamp);
    });
    // 반딧불: 연못 둘레를 맴도는 작은 빛
    const flies: THREE.Mesh[] = [];
    const glow = new THREE.MeshBasicMaterial({ color: 0xf4ff9a });
    for (let k = 0; k < 18; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), glow); flies.push(f); scene.add(f); }
    onFrame((now) => {
      const t = now / 1000;
      flies.forEach((f, k) => {
        const a = t * (0.12 + (k % 5) * 0.03) + k * 1.7, r = 5.2 + Math.sin(t * 0.4 + k) * 2.2;
        f.position.set(Math.sin(a) * r, 0.9 + Math.sin(t * 1.3 + k) * 0.5, Math.cos(a) * r);
        f.visible = Math.sin(t * 2 + k * 3) > -0.4;
      });
    });
  },
};

// ---------- 글자 그림 (머리 위의 수) ----------

function textSprite(): { sprite: THREE.Sprite; set: (text: string, color: string) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  let last = '';
  const set = (text: string, color: string) => {
    if (last === text + color) return;
    last = text + color;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    if (text) {
      g.fillStyle = 'rgba(12, 20, 28, .78)';
      g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = color; g.stroke();
      g.fillStyle = color; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 64, 68);
    }
    tex.needsUpdate = true;
  };
  return { sprite, set };
}

// ---------- 물고기, 찌, 컴퓨터 낚시꾼 ----------

interface FishModel extends Model { body: THREE.Group; skin: THREE.Mesh[]; label: ReturnType<typeof textSprite>; jump: number; spin: number; base: number }
interface BaitModel extends Model { bob: THREE.Group; ring: THREE.Mesh; label: ReturnType<typeof textSprite>; seed: number }
const fishes = new Set<FishModel>();
const baits = new Set<BaitModel>();
const fishColor = (v: number) => (v >= 6 ? 0xffd24a : v >= 4 ? 0xf08a3a : v >= 2 ? 0xe86a4a : 0xd8d0c0);

/** 물고기의 연출: 낚였을 때 물 위로 뛰어 그 자리 쪽으로, 아무도 못 낚았을 때 한 바퀴 */
export function fishJump(m: Model, toward: { x: number; z: number } | null): void {
  const f = m as FishModel;
  f.jump = 1;
  f.spin = toward ? Math.atan2(toward.x - m.root.position.x, toward.z - m.root.position.z) : f.body.rotation.y + Math.PI * 2;
}

export function initScene(): void {
  registerKind('fish', {
    snap: true,
    model: () => {
      const root = new THREE.Group(), body = new THREE.Group();
      const fin = mat(0xe86a4a);
      const torso = part(new THREE.SphereGeometry(0.42, 8, 6), fin, 0, 0, 0);
      torso.scale.set(0.55, 0.5, 1.15);
      const tail = part(new THREE.ConeGeometry(0.3, 0.42, 4), fin, 0, 0, -0.55);
      tail.rotation.x = -Math.PI / 2;
      const eye = part(new THREE.SphereGeometry(0.06, 5, 4), mat(0x111111), 0.17, 0.1, 0.32);
      const eye2 = eye.clone(); eye2.position.x = -0.17;
      body.add(torso, tail, eye, eye2);
      body.position.y = 0.18;
      const label = textSprite();
      label.sprite.position.y = 1.35; label.sprite.scale.setScalar(0.8);
      root.add(body, label.sprite);
      const m: FishModel = { root, body, skin: [torso, tail], label, jump: 0, spin: 0, base: 1 };
      fishes.add(m);
      return m;
    },
    update: (model, [v]) => {
      const m = model as FishModel, c = fishColor(v);
      for (const o of m.skin) o.material = mat(c);
      m.base = 0.75 + v * 0.11;
      m.label.set(String(v), v >= 6 ? '#ffd24a' : '#bfe6ff');
    },
    dot: '#7fc8ff',
  });

  registerKind('bait', {
    snap: true,
    model: () => {
      const root = new THREE.Group(), bob = new THREE.Group();
      const top = part(new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe8463a), 0, 0.05, 0);
      const bottom = part(new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xf4efe6), 0, 0.05, 0);
      const stick = part(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 4), mat(0x333333), 0, 0.3, 0);
      const ring = part(new THREE.TorusGeometry(0.28, 0.05, 4, 12), mat(0xffffff), 0, 0.04, 0);
      ring.rotation.x = Math.PI / 2;
      bob.add(top, bottom, stick, ring);
      const label = textSprite();
      label.sprite.position.y = 0.95; label.sprite.scale.setScalar(0.55);
      root.add(bob, label.sprite);
      const m: BaitModel = { root, bob, ring, label, seed: Math.random() * 10 };
      baits.add(m);
      return m;
    },
    update: (model, [seat, shown]) => {
      const m = model as BaitModel;
      m.ring.material = mat(SEAT_HEX[seat] ?? 0xffffff);
      m.label.set(shown ? String(shown) : '?', shown ? SEAT_CSS[seat] ?? '#fff' : '#8a9aa8');
      m.label.sprite.scale.setScalar(shown ? 0.7 : 0.45);
    },
  });

  registerKind('angler', {
    model: (e) => { void e; return makeHumanoid(0x8a8a8a, false); },
    update: (model, [seat]) => {
      const c = SEAT_HEX[seat] ?? 0x8a8a8a;
      model.root.traverse((o) => { if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).color?.getHex() === 0x8a8a8a) o.material = mat(c); });
    },
    // 종류 안의 type이 자리(s0~s3): 이름표는 자리의 색을 붙인 컴퓨터
    label: (e) => L().fmt.pondCpu(Number(e.type.slice(1)) || 0),
    h: 2.4,
  });

  // 사람의 옷: 앉은 자리의 색 (앉지 않았으면 틀의 색)
  setPlayerLook({ cloth: (p) => (p.vals[0] ? SEAT_HEX[p.vals[0] - 1] : undefined) });

  // 물고기는 숨 쉬듯 떠 있고, 낚이면 뛴다. 찌는 까딱인다
  onFrame((now, dt) => {
    const t = now / 1000;
    for (const f of fishes) {
      if (!f.root.parent) { fishes.delete(f); continue; }
      f.root.scale.setScalar(f.base);
      if (f.jump > 0) {
        f.jump = Math.max(0, f.jump - dt * 0.9);
        const k = 1 - f.jump;
        f.body.position.y = 0.18 + Math.sin(k * Math.PI) * 1.6;
        f.body.rotation.y += (f.spin - f.body.rotation.y) * Math.min(1, dt * 6);
        f.body.rotation.x = Math.sin(k * Math.PI * 2) * 0.6;
      } else {
        f.body.position.y = 0.16 + Math.sin(t * 1.6 + f.base) * 0.05;
        f.body.rotation.y += dt * 0.35;
        f.body.rotation.x = 0;
      }
    }
    for (const b of baits) {
      if (!b.root.parent) { baits.delete(b); continue; }
      b.bob.position.y = Math.sin(t * 2.4 + b.seed) * 0.04;
      b.bob.rotation.z = Math.sin(t * 1.7 + b.seed) * 0.12;
    }
  });

  view.setMood({ sky: 0x1b2a3a, hemi: 1.35, sun: 1.2, fogNear: 46, fogFar: 110 });
  setMapPaint((b) => { b.quad(-30, -30, 30, 30, '#2f4a36'); b.disc(0, 0, POND.radius, '#2a6a8e'); b.disc(0, POND.lobbyZ, 6, '#6a6350'); });
}
