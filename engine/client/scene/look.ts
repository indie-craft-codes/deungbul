// 부품으로 된 사람형 (겉모습: engine/shared/defs/look.ts). 틀의 네모난 사람(models.ts의 defaultHumanoid)을 바탕으로 칸마다 부품을 얹는다:
// 체형(몸통·팔다리), 머리 모양, 머리카락, 모자, 얼굴 장식, 등 장식, 옷의 무늬, 색 넷(살갗·옷·머리카락·강조색), 키·너비 배율.
// 게임은 부품을 더 그릴 수 있다: registerLookBody, registerLookHead, registerLookPart(hair·hat·face·back), registerLookPattern. 같은 id면 틀의 것을 바꾼다.
// 내용의 LOOK_RULES.add에 적은 부품은 여기 등록해야 그려진다 (등록하지 않은 부품은 그리지 않는다: 그 칸이 빈다. 몸·머리는 기본 모양으로).
// 그리기 비용: 모양(기하)은 열쇠마다 하나를 모두가 나눠 쓰고(lookGeo), 재질은 색마다 하나(models.ts의 mat)다.
// 움직이지 않는 부품(몸통, 머리카락, 모자, 얼굴, 등, 무늬)은 다 붙인 뒤 꼭짓점 색을 입힌 한 메시로 굽는다(bake): 재질은 모두가 하나를 나눠 쓰고,
// 같은 겉모습의 사람은 구운 모양도 나눠 쓴다. 그래서 사람 하나의 그리기 호출은 틀의 네모난 사람과 같다(팔다리 넷 + 머리 + 몸 하나: 부품의 수와 상관없이).
// 색만 있는 재질(MeshStandardMaterial)이 아닌 부품(게임이 단 빛나는 재질 같은 것)은 굽지 않고 그대로 둔다.
// 약속은 models.ts와 같다: 발이 원점, +Z를 바라본다, 키 약 2.1 (배율 1). 크기 배율은 안쪽 묶음(Model.frame)에 준다: 틀이 죽는 연출에서 root의 크기를 바꾼다.
import * as THREE from 'three';
import { encodeLook, lookParts, lookPatterns, lookSlotOff, type Look, type LookSlot } from '../../shared/defs/look';
import { attachHand, limb, mat, part, setLookBody, type HumanoidLook, type Model, type Rig } from './models';

/** 부품이 쓰는 재질: 살갗, 옷, 머리카락, 강조색, 바지 (색마다 하나를 나눠 쓴다) */
export interface LookMats { skin: THREE.Material; cloth: THREE.Material; hair: THREE.Material; accent: THREE.Material; pants: THREE.Material; dark: THREE.Material }
/** 체형이 돌려주는 것: 팔다리, 몸통의 반폭·반깊이, 몸통 위 끝(어깨)의 높이, 몸통 가운데의 높이 */
export interface BodyShape { rig: Rig; bw: number; bd: number; top: number; mid: number }
/** 머리가 돌려주는 것: 머리 메시(부품은 여기에 붙인다: 좌표는 머리 가운데가 원점), 반폭·반높이·반깊이 */
export interface HeadShape { head: THREE.Mesh; w: number; h: number; d: number }
export type BodyBuilder = (frame: THREE.Group, m: LookMats) => BodyShape;
export type HeadBuilder = (frame: THREE.Group, m: LookMats, body: BodyShape) => HeadShape;
/** 머리카락·모자·얼굴·등 장식·무늬 하나를 붙이는 것 */
export interface LookCtx { frame: THREE.Group; body: BodyShape; head: HeadShape; mats: LookMats }
export type PartBuilder = (c: LookCtx) => void;

const geos = new Map<string, THREE.BufferGeometry>();
/** 모양 하나를 열쇠로 나눠 쓴다 (부품마다 새로 만들지 않는다) */
export function lookGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) { g = make(); geos.set(key, g); }
  return g;
}
const box = (w: number, h: number, d: number) => lookGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const r2 = (v: number) => Math.round(v * 100) / 100;

const BODIES = new Map<string, BodyBuilder>();
const HEADS = new Map<string, HeadBuilder>();
const PARTS = new Map<string, PartBuilder>();
const PATTERNS = new Map<string, PartBuilder>();
export function registerLookBody(id: string, fn: BodyBuilder): void { BODIES.set(id, fn); }
export function registerLookHead(id: string, fn: HeadBuilder): void { HEADS.set(id, fn); }
/** 머리카락·모자·얼굴 장식·등 장식의 부품 하나를 등록한다 */
export function registerLookPart(slot: Exclude<LookSlot, 'body' | 'head'>, id: string, fn: PartBuilder): void { PARTS.set(`${slot}:${id}`, fn); }
export function registerLookPattern(id: string, fn: PartBuilder): void { PATTERNS.set(id, fn); }

// ---------- 틀의 체형 넷: plain은 틀의 네모난 사람과 같은 치수 ----------
/** 몸통(가로 bw2, 높이 0.8, 깊이 bd2)과 팔(어깨 ax에 굵기 aw)의 사람. 다리는 틀의 것 그대로 */
function torso(frame: THREE.Group, m: LookMats, bw2: number, bd2: number, ax: number, aw: number): BodyShape {
  const leg = box(0.28, 0.7, 0.28), arm = box(aw, 0.7, aw);
  const rig: Rig = { ll: limb(leg, m.pants, -0.2, 0.7, 0, 0.35), rl: limb(leg, m.pants, 0.2, 0.7, 0, 0.35), la: limb(arm, m.cloth, -ax, 1.48, 0, 0.35), ra: limb(arm, m.cloth, ax, 1.48, 0, 0.35) };
  frame.add(rig.ll, rig.rl, rig.la, rig.ra, part(box(bw2, 0.8, bd2), m.cloth, 0, 1.1, 0));
  return { rig, bw: bw2 / 2, bd: bd2 / 2, top: 1.5, mid: 1.1 };
}
registerLookBody('plain', (f, m) => torso(f, m, 0.8, 0.45, 0.54, 0.24));
registerLookBody('stout', (f, m) => torso(f, m, 1.0, 0.56, 0.64, 0.27));
registerLookBody('slim', (f, m) => torso(f, m, 0.64, 0.38, 0.45, 0.2));
registerLookBody('robe', (f, m) => {
  const b = torso(f, m, 0.8, 0.45, 0.54, 0.24);
  f.add(part(lookGeo('robeSkirt', () => new THREE.CylinderGeometry(0.44, 0.58, 0.62, 6)), m.cloth, 0, 0.42, 0));
  return b;
});

// ---------- 틀의 머리 넷: box는 틀의 네모난 머리와 같다 ----------
function headAt(frame: THREE.Group, g: THREE.BufferGeometry, mt: THREE.Material, y: number, w: number, h: number, d: number): HeadShape {
  const head = part(g, mt, 0, y, 0);
  frame.add(head);
  return { head, w, h, d };
}
registerLookHead('box', (f, m) => headAt(f, box(0.56, 0.56, 0.56), m.skin, 1.8, 0.28, 0.28, 0.28));
registerLookHead('round', (f, m) => headAt(f, lookGeo('headRound', () => new THREE.IcosahedronGeometry(0.33, 1)), m.skin, 1.83, 0.31, 0.31, 0.31));
registerLookHead('tall', (f, m) => headAt(f, box(0.5, 0.66, 0.5), m.skin, 1.85, 0.25, 0.33, 0.25));
registerLookHead('wide', (f, m) => headAt(f, box(0.68, 0.5, 0.56), m.skin, 1.77, 0.34, 0.25, 0.28));

// ---------- 머리카락 (머리카락 색) ----------
/** 머리 위의 덮개: 모든 머리카락의 바탕 */
const crown = (c: LookCtx, t = 0.12) => { const { w, h, d } = c.head; c.head.head.add(part(box(r2(w * 2 + 0.04), t, r2(d * 2 + 0.04)), c.mats.hair, 0, h + t / 2 - 0.02, 0)); };
registerLookPart('hair', 'short', (c) => crown(c));
registerLookPart('hair', 'bob', (c) => {
  const { w, h, d } = c.head, hm = c.mats.hair, H = c.head.head;
  crown(c);
  H.add(part(box(r2(w * 2 + 0.06), r2(h * 1.5), 0.1), hm, 0, r2(h * 0.2), r2(-d - 0.04)));
  for (const s of [-1, 1]) H.add(part(box(0.08, r2(h * 1.3), r2(d * 1.6)), hm, s * (w + 0.03), r2(h * 0.25), r2(-d * 0.2)));
});
registerLookPart('hair', 'long', (c) => {
  const { w, h, d } = c.head;
  crown(c);
  c.head.head.add(part(box(r2(w * 2 + 0.04), 0.95, 0.12), c.mats.hair, 0, r2(h - 0.5), r2(-d - 0.05)));
});
registerLookPart('hair', 'spiky', (c) => {
  const { w, h, d } = c.head, g = lookGeo('spike', () => new THREE.ConeGeometry(0.1, 0.3, 4));
  crown(c, 0.08);
  for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [0, 0], [-0.5, 0.45], [0.5, 0.45], [0, -0.6]]) c.head.head.add(part(g, c.mats.hair, r2(x * w), h + 0.18, r2(z * d)));
});
registerLookPart('hair', 'bun', (c) => {
  const { h, d } = c.head;
  crown(c);
  c.head.head.add(part(lookGeo('bun', () => new THREE.IcosahedronGeometry(0.16, 0)), c.mats.hair, 0, h + 0.1, r2(-d + 0.02)));
});
registerLookPart('hair', 'tail', (c) => {
  const { h, d } = c.head;
  crown(c);
  const tail = part(box(0.14, 0.6, 0.14), c.mats.hair, 0, r2(h - 0.3), r2(-d - 0.12));
  tail.rotation.x = 0.3;
  c.head.head.add(tail);
});

// ---------- 모자 (강조색. 두건은 옷 색, 투구는 쇠빛) ----------
registerLookPart('hat', 'cap', (c) => {
  const { w, h, d } = c.head, H = c.head.head;
  H.add(part(lookGeo(`cap${w}`, () => new THREE.CylinderGeometry(r2(w * 1.05), r2(w * 1.12), 0.18, 6)), c.mats.accent, 0, h + 0.07, 0));
  H.add(part(box(r2(w * 1.6), 0.05, 0.3), c.mats.accent, 0, h + 0.0, r2(d + 0.1)));
});
registerLookPart('hat', 'hood', (c) => {
  const { w, h, d } = c.head, H = c.head.head, m = c.mats.cloth;
  H.add(part(box(r2(w * 2 + 0.12), 0.1, r2(d * 2 + 0.1)), m, 0, h + 0.04, -0.02));
  H.add(part(box(r2(w * 2 + 0.12), r2(h * 2 + 0.1), 0.1), m, 0, 0, r2(-d - 0.06)));
  for (const s of [-1, 1]) H.add(part(box(0.08, r2(h * 2 + 0.06), r2(d * 2)), m, s * (w + 0.05), 0, -0.02));
});
registerLookPart('hat', 'pointed', (c) => { c.head.head.add(part(lookGeo('pointed', () => new THREE.ConeGeometry(0.42, 0.7, 5)), c.mats.accent, 0, c.head.h + 0.32, 0)); });
registerLookPart('hat', 'crown', (c) => {
  const { w, h } = c.head, H = c.head.head, g = lookGeo('crownTip', () => new THREE.ConeGeometry(0.06, 0.16, 4));
  H.add(part(lookGeo(`crown${w}`, () => new THREE.CylinderGeometry(r2(w * 0.95), r2(w * 0.95), 0.12, 5)), c.mats.accent, 0, h + 0.05, 0));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; H.add(part(g, c.mats.accent, r2(Math.sin(a) * w * 0.85), h + 0.18, r2(Math.cos(a) * w * 0.85))); }
});
registerLookPart('hat', 'helm', (c) => {
  const { w, h, d } = c.head, steel = mat(0x9aa3a8);
  c.head.head.add(part(box(r2(w * 2 + 0.08), r2(h + 0.14), r2(d * 2 + 0.08)), steel, 0, r2(h * 0.5 + 0.04), 0));
  c.head.head.add(part(box(0.08, 0.3, 0.06), steel, 0, -0.02, r2(d + 0.05)));
});
registerLookPart('hat', 'horns', (c) => {
  const { w, h } = c.head, g = lookGeo('horn', () => new THREE.ConeGeometry(0.08, 0.36, 5)), bone = mat(0xe8dcc0);
  for (const s of [-1, 1]) { const horn = part(g, bone, s * r2(w * 0.8), h + 0.12, 0); horn.rotation.z = -s * 0.6; c.head.head.add(horn); }
});
registerLookPart('hat', 'band', (c) => { const { w, d } = c.head; c.head.head.add(part(box(r2(w * 2 + 0.04), 0.09, r2(d * 2 + 0.04)), c.mats.accent, 0, 0.1, 0)); });

// ---------- 얼굴 장식 ----------
registerLookPart('face', 'eyes', (c) => {
  const { w, d } = c.head;
  for (const s of [-1, 1]) c.head.head.add(part(box(0.08, 0.1, 0.04), c.mats.dark, s * r2(w * 0.42), 0.03, d + 0.01));
});
registerLookPart('face', 'mask', (c) => { const { w, d } = c.head; c.head.head.add(part(box(r2(w * 2 + 0.04), 0.14, r2(d * 2 + 0.04)), c.mats.dark, 0, 0.03, 0)); });
registerLookPart('face', 'beard', (c) => {
  const { w, h, d } = c.head;
  c.head.head.add(part(box(r2(w * 1.6), 0.26, 0.12), c.mats.hair, 0, r2(-h + 0.06), d + 0.04));
});
registerLookPart('face', 'goggles', (c) => {
  const { w, d } = c.head, H = c.head.head;
  H.add(part(box(r2(w * 2 + 0.04), 0.06, r2(d * 2 + 0.04)), c.mats.dark, 0, 0.06, 0));
  for (const s of [-1, 1]) H.add(part(box(0.16, 0.14, 0.06), c.mats.accent, s * r2(w * 0.42), 0.06, d + 0.03));
});

// ---------- 등 장식 (몸통 뒤) ----------
registerLookPart('back', 'cape', (c) => {
  const { bd, mid } = c.body, cape = part(box(0.78, 1.15, 0.06), c.mats.accent, 0, mid - 0.12, r2(-bd - 0.05));
  cape.rotation.x = 0.08;
  c.frame.add(cape);
});
registerLookPart('back', 'pack', (c) => {
  const { bd, mid } = c.body;
  c.frame.add(part(box(0.55, 0.6, 0.3), mat(0x6b4a2e), 0, mid + 0.05, r2(-bd - 0.15)), part(box(0.57, 0.18, 0.32), c.mats.accent, 0, mid + 0.3, r2(-bd - 0.15)));
});
registerLookPart('back', 'wings', (c) => {
  const { bd, top } = c.body;
  for (const s of [-1, 1]) { const wing = part(box(0.75, 0.45, 0.04), c.mats.accent, s * 0.42, top - 0.1, r2(-bd - 0.08)); wing.rotation.z = s * 0.45; wing.rotation.y = s * 0.3; c.frame.add(wing); }
});
registerLookPart('back', 'scarf', (c) => {
  const { bw, bd, top } = c.body;
  c.frame.add(part(box(r2(bw * 2 - 0.08), 0.14, r2(bd * 2 + 0.06)), c.mats.accent, 0, top - 0.02, 0), part(box(0.16, 0.5, 0.06), c.mats.accent, 0.18, top - 0.3, r2(-bd - 0.04)));
});
registerLookPart('back', 'shield', (c) => {
  const { bd, mid } = c.body, s = part(lookGeo('backShield', () => new THREE.CylinderGeometry(0.36, 0.36, 0.08, 6)), c.mats.accent, 0, mid + 0.05, r2(-bd - 0.08));
  s.rotation.x = Math.PI / 2;
  c.frame.add(s);
});

// ---------- 무늬 (몸통 위에 강조색) ----------
registerLookPattern('stripe', (c) => { const { bw, bd } = c.body; c.frame.add(part(box(r2(bw * 2 + 0.02), 0.12, r2(bd * 2 + 0.02)), c.mats.accent, 0, 1.18, 0)); });
registerLookPattern('sash', (c) => {
  const { bd } = c.body, sash = part(box(0.14, 1.0, r2(bd * 2 + 0.03)), c.mats.accent, 0, 1.1, 0);
  sash.rotation.z = 0.7;
  c.frame.add(sash);
});
registerLookPattern('belt', (c) => { const { bw, bd } = c.body; c.frame.add(part(box(r2(bw * 2 + 0.04), 0.12, r2(bd * 2 + 0.04)), c.mats.accent, 0, 0.78, 0)); });
registerLookPattern('trim', (c) => {
  const { bw, bd } = c.body, g = box(r2(bw * 2 + 0.02), 0.08, r2(bd * 2 + 0.02));
  c.frame.add(part(g, c.mats.accent, 0, 0.74, 0), part(g, c.mats.accent, 0, 1.46, 0));
});

// ---------- 굽기: 움직이지 않는 부품을 꼭짓점 색의 한 메시로 ----------
/** 구운 몸이 나눠 쓰는 재질 하나 (models.ts의 mat과 같은 거칠기·각진 그림자에 색은 꼭짓점에서) */
const bakedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true, vertexColors: true });
/** 겉모습(과 색)마다 구운 모양. 같은 겉모습의 사람이 나눠 쓴다 (겉모습의 종류만큼 쌓인다) */
const baked = new Map<string, THREE.BufferGeometry>();
const tmpM = new THREE.Matrix4(), inv = new THREE.Matrix4(), tmpC = new THREE.Color();
/** 모양 여럿을 위치·법선·색만 이어 붙인 한 모양으로 (질감 좌표는 쓰지 않는다: 부품의 재질은 색뿐이다). 색은 작업 색 공간(선형)의 값 */
function mergeParts(list: { g: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color }[]): THREE.BufferGeometry {
  const parts = list.map(({ g, m, c }) => { const x = g.index ? g.toNonIndexed() : g.clone(); x.applyMatrix4(m); return { x, c }; });
  const n = parts.reduce((s, p) => s + p.x.getAttribute('position').count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let at = 0;
  for (const { x, c } of parts) {
    const p = x.getAttribute('position'), q = x.getAttribute('normal');
    pos.set(p.array as Float32Array, at * 3);
    if (q) nor.set(q.array as Float32Array, at * 3);
    for (let i = 0; i < p.count; i++) { col[(at + i) * 3] = c.r; col[(at + i) * 3 + 1] = c.g; col[(at + i) * 3 + 2] = c.b; }
    at += p.count;
    x.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
/**
 * frame 아래의 움직이지 않는 메시(keep에 든 묶음과 그 아래, 머리 메시 자신은 빼고, 색만 있는 재질의 것)를 떼어 내고 구운 메시 하나로 바꿔 단다.
 * 같은 열쇠(겉모습과 색)로 이미 구웠으면 그 모양을 쓴다
 */
function bake(frame: THREE.Group, keep: readonly THREE.Object3D[], head: THREE.Mesh, key: string): void {
  frame.updateMatrixWorld(true);
  inv.copy(frame.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  frame.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh === head || !(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    for (let p: THREE.Object3D | null = mesh; p && p !== frame; p = p.parent) if (keep.includes(p)) return;
    meshes.push(mesh);
  });
  if (!meshes.length) return;
  let g = baked.get(key);
  if (!g) {
    g = mergeParts(meshes.map((mesh) => ({ g: mesh.geometry, m: tmpM.multiplyMatrices(inv, mesh.matrixWorld).clone(), c: tmpC.copy((mesh.material as THREE.MeshStandardMaterial).color).clone() })));
    baked.set(key, g);
  }
  for (const mesh of meshes) mesh.removeFromParent();
  const body = new THREE.Mesh(g, bakedMat);
  body.castShadow = true;
  frame.add(body);
}

/** 머리카락의 기본 색과 강조색의 기본 (겉모습에 적지 않았을 때) */
const HAIR = 0x4a3324, ACCENT = 0xd9b24a;
/** 그 칸의 부품 id: 끈 칸, 목록에 없거나 그리는 법이 없는 부품은 기본(첫째) */
const pick = (l: Look, slot: LookSlot): string => { const v = l.parts[slot]; const list = lookParts(slot); return v && !lookSlotOff(slot) && list.includes(v) ? v : list[0]; };

/** 부품으로 된 사람형을 만든다 (models.ts의 defaultHumanoid가 HumanoidLook.look이 있을 때 부른다) */
export function lookHumanoid(hl: HumanoidLook & { look: Look }): Model {
  const l = hl.look, c = l.colors;
  const mats: LookMats = { skin: mat(c.skin ?? hl.skin), cloth: mat(c.cloth ?? hl.cloth), hair: mat(c.hair ?? HAIR), accent: mat(c.accent ?? ACCENT), pants: mat(0x3b3a4a), dark: mat(0x1a1f22) };
  const root = new THREE.Group(), frame = new THREE.Group();
  root.add(frame);
  const body = (BODIES.get(pick(l, 'body')) ?? BODIES.get('plain')!)(frame, mats);
  const head = (HEADS.get(pick(l, 'head')) ?? HEADS.get('box')!)(frame, mats, body);
  const ctx: LookCtx = { frame, body, head, mats };
  for (const slot of ['hair', 'hat', 'face', 'back'] as const) { const id = pick(l, slot); if (id !== 'none') PARTS.get(`${slot}:${id}`)?.(ctx); }
  if (l.pattern && l.pattern !== 'none' && lookPatterns().includes(l.pattern)) PATTERNS.get(l.pattern)?.(ctx);
  // 움직이지 않는 부품을 굽는다 (팔다리와 머리는 그대로: 걷는 동작과 게임의 덧붙임(m.head)이 쓴다). 열쇠는 겉모습과 실제로 쓴 색
  bake(frame, [body.rig.ll, body.rig.rl, body.rig.la, body.rig.ra], head.head, `${encodeLook(l)}|${c.skin ?? hl.skin}|${c.cloth ?? hl.cloth}`);
  const size = l.size ?? 1, width = l.width ?? 1;
  if (size !== 1 || width !== 1) frame.scale.set(size * width, size, size);
  // 모르는 손 모양은 검으로 (models.ts와 같다)
  const blade = attachHand(hl.hand, { root: frame, rig: body.rig, cloth: mats.cloth });
  return { root, rig: body.rig, blade, head: head.head, frame };
}
setLookBody(lookHumanoid);
