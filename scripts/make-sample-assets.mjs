// 예제 게임(games/sample)의 시험용 에셋을 만든다: 뼈대 애니메이션 모델 둘(짐승, 야영꾼), 무기 모델 하나, 효과음 둘, 배경음 하나.
// 인터넷에서 받지 않고 이 스크립트가 직접 쓴다. 결과는 games/sample/client/public/ 아래 (빌드하면 dist-sample/에 그대로 들어간다).
//   node scripts/make-sample-assets.mjs
// 모델은 GLB(glTF 2.0 바이너리): 상자들을 뼈마다 하나씩 붙인 스킨 메시와 클립 idle/walk/attack/hit/die. 소리는 16비트 모노 WAV.
// 같은 입력이면 같은 파일이 나온다 (난수는 씨앗을 고정했다). 수치를 바꾸면 다시 돌리고 결과 파일을 함께 커밋한다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'games', 'sample', 'client', 'public');

// ---------- 수학 ----------
/** 오일러 각(XYZ 차례, 라디안) → 사원수 [x, y, z, w] */
function quat(x = 0, y = 0, z = 0) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
/** sRGB 0xRRGGBB → glTF의 선형 색 [r, g, b, 1] */
function linear(hex) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255), 1];
}

// ---------- GLB 쓰기 ----------
/**
 * 상자 모델 하나를 GLB로. bones가 있으면 스킨 메시(상자마다 한 뼈에 100%), 없으면 그냥 메시.
 * bones: [{ name, parent, t: [x,y,z] }] (부모 기준 위치, 쉬는 자세의 회전은 없다)
 * boxes: [{ bone, mat, size: [w,h,d], at: [x,y,z] }] (뼈 기준 가운데)
 * clips: { 이름: { len, loop, tracks: [{ bone, path: 'rotation'|'translation', keys: [[시각, 값]] }] } } (rotation 값은 오일러 [x,y,z])
 */
function glb({ bones = [], boxes, mats, clips = {} }) {
  const chunks = [];
  let offset = 0;
  const views = [], accessors = [];
  const view = (buf, target) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
    chunks.push(buf); offset += buf.length;
    return views.length - 1;
  };
  const acc = (arr, type, comp, count, target, minmax) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    accessors.push({ bufferView: view(buf, target), componentType: comp, count, type, ...(minmax ?? {}) });
    return accessors.length - 1;
  };
  // 뼈의 세계 위치 (쉬는 자세)
  const world = bones.map(() => [0, 0, 0]);
  bones.forEach((b, i) => { const p = b.parent === undefined ? [0, 0, 0] : world[b.parent]; world[i] = [p[0] + b.t[0], p[1] + b.t[1], p[2] + b.t[2]]; });
  const boneIndex = (name) => { const i = bones.findIndex((b) => b.name === name); if (i < 0 && bones.length) throw new Error('없는 뼈: ' + name); return i; };

  // 재질마다 프리미티브 하나
  const matNames = Object.keys(mats);
  const primitives = [];
  for (const [mi, mname] of matNames.entries()) {
    const mine = boxes.filter((b) => b.mat === mname);
    if (!mine.length) continue;
    const pos = [], nor = [], jnt = [], wgt = [], idx = [];
    for (const b of mine) {
      const bi = bones.length ? boneIndex(b.bone) : -1;
      const base = bi >= 0 ? world[bi] : [0, 0, 0];
      const c = [base[0] + b.at[0], base[1] + b.at[1], base[2] + b.at[2]], h = b.size.map((s) => s / 2);
      // 면 여섯: 법선과 그 면의 네 꼭짓점
      const faces = [
        [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
        [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
        [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      ];
      for (const [n, corners] of faces) {
        const v0 = pos.length / 3;
        for (const k of corners) {
          pos.push(c[0] + k[0] * h[0], c[1] + k[1] * h[1], c[2] + k[2] * h[2]);
          nor.push(...n);
          if (bi >= 0) { jnt.push(bi, 0, 0, 0); wgt.push(1, 0, 0, 0); }
        }
        idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      }
    }
    const P = new Float32Array(pos), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
    const attributes = {
      POSITION: acc(P, 'VEC3', 5126, P.length / 3, 34962, { min, max }),
      NORMAL: acc(new Float32Array(nor), 'VEC3', 5126, nor.length / 3, 34962),
    };
    if (bones.length) {
      attributes.JOINTS_0 = acc(new Uint16Array(jnt), 'VEC4', 5123, jnt.length / 4, 34962);
      attributes.WEIGHTS_0 = acc(new Float32Array(wgt), 'VEC4', 5126, wgt.length / 4, 34962);
    }
    primitives.push({ attributes, indices: acc(new Uint16Array(idx), 'SCALAR', 5123, idx.length, 34963), material: mi });
  }

  const nodes = [{ name: 'body', mesh: 0, ...(bones.length ? { skin: 0 } : {}) }];
  const boneNode = (i) => i + 1;
  bones.forEach((b, i) => {
    nodes.push({ name: b.name, translation: b.t, children: bones.map((c, k) => (c.parent === i ? boneNode(k) : -1)).filter((k) => k >= 0) });
  });
  for (const n of nodes) if (n.children && !n.children.length) delete n.children;
  const json = {
    asset: { version: '2.0', generator: 'scripts/make-sample-assets.mjs' },
    scene: 0,
    scenes: [{ nodes: bones.length ? [0, ...bones.map((b, i) => (b.parent === undefined ? boneNode(i) : -1)).filter((k) => k >= 0)] : [0] }],
    nodes,
    meshes: [{ name: 'body', primitives }],
    materials: matNames.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: linear(mats[name]), metallicFactor: 0, roughnessFactor: 0.9 } })),
  };
  if (bones.length) {
    // 뼈마다 쉬는 자세의 역행렬: 회전이 없으므로 세계 위치를 거꾸로 옮기는 것뿐 (열 우선 4×4)
    const ibm = new Float32Array(bones.length * 16);
    world.forEach((w, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], i * 16); });
    json.skins = [{ joints: bones.map((_, i) => boneNode(i)), skeleton: boneNode(0), inverseBindMatrices: acc(ibm, 'MAT4', 5126, bones.length) }];
    json.animations = Object.entries(clips).map(([name, clip]) => {
      const samplers = [], channels = [];
      for (const tr of clip.tracks) {
        const times = new Float32Array(tr.keys.map((k) => k[0]));
        const vals = tr.path === 'rotation' ? tr.keys.flatMap((k) => quat(...k[1])) : tr.keys.flatMap((k) => k[1]);
        samplers.push({ input: acc(times, 'SCALAR', 5126, times.length, undefined, { min: [times[0]], max: [times[times.length - 1]] }), output: acc(new Float32Array(vals), tr.path === 'rotation' ? 'VEC4' : 'VEC3', 5126, tr.keys.length), interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: boneNode(boneIndex(tr.bone)), path: tr.path } });
      }
      return { name, samplers, channels };
    });
  }
  const bin = Buffer.concat(chunks);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  json.buffers = [{ byteLength: binPadded.length }];
  json.bufferViews = views;
  json.accessors = accessors;
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
  const ch = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  return Buffer.concat([header, ch(0x4e4f534a, jsonBuf), ch(0x004e4942, binPadded)]);
}

/** 고리 하나의 키들: 시각 [0, len]에 값을 고르게 놓는다 (처음 값으로 끝나 이음매가 없다) */
const loopKeys = (len, values) => values.map((v, i) => [(len * i) / (values.length - 1), v]);

// ---------- 짐승 (곰·멧돼지가 같이 쓴다. 털빛은 게임이 tint로 바꾼다) ----------
const beast = () => {
  const bones = [
    { name: 'root', t: [0, 0, 0] },
    { name: 'body', parent: 0, t: [0, 0.75, 0] },
    { name: 'head', parent: 1, t: [0, 0.45, 0.7] },
    { name: 'leg_fl', parent: 1, t: [-0.27, 0, 0.5] }, { name: 'leg_fr', parent: 1, t: [0.27, 0, 0.5] },
    { name: 'leg_bl', parent: 1, t: [-0.27, 0, -0.5] }, { name: 'leg_br', parent: 1, t: [0.27, 0, -0.5] },
  ];
  const boxes = [
    { bone: 'body', mat: 'fur', size: [0.82, 0.72, 1.5], at: [0, 0.3, 0] },
    { bone: 'body', mat: 'fur', size: [0.7, 0.3, 0.5], at: [0, 0.72, -0.3] }, // 등의 혹
    { bone: 'body', mat: 'belly', size: [0.6, 0.1, 1.1], at: [0, -0.06, 0.05] },
    { bone: 'head', mat: 'fur', size: [0.6, 0.55, 0.6], at: [0, 0.05, 0.2] },
    { bone: 'head', mat: 'belly', size: [0.32, 0.24, 0.26], at: [0, -0.06, 0.6] },
    { bone: 'head', mat: 'dark', size: [0.14, 0.1, 0.06], at: [0, 0.02, 0.74] },
    { bone: 'head', mat: 'fur', size: [0.16, 0.2, 0.1], at: [-0.21, 0.37, 0.12] }, { bone: 'head', mat: 'fur', size: [0.16, 0.2, 0.1], at: [0.21, 0.37, 0.12] },
    { bone: 'head', mat: 'eye', size: [0.09, 0.09, 0.04], at: [-0.15, 0.14, 0.51] }, { bone: 'head', mat: 'eye', size: [0.09, 0.09, 0.04], at: [0.15, 0.14, 0.51] },
    ...['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'].flatMap((bone) => [
      { bone, mat: 'fur', size: [0.24, 0.62, 0.26], at: [0, -0.3, 0] },
      { bone, mat: 'dark', size: [0.27, 0.14, 0.32], at: [0, -0.68, 0.03] },
    ]),
  ];
  const mats = { fur: 0x6b4b36, belly: 0xb89a78, dark: 0x2a201a, eye: 0x111111 };
  const B = 0.75; // 몸통 뼈의 쉬는 높이
  const clips = {
    idle: { tracks: [
      { bone: 'body', path: 'translation', keys: loopKeys(2.4, [[0, B, 0], [0, B + 0.03, 0], [0, B, 0]]) },
      { bone: 'head', path: 'rotation', keys: loopKeys(2.4, [[0, 0, 0], [-0.1, 0.25, 0], [0.05, 0, 0], [-0.1, -0.25, 0], [0, 0, 0]]) },
    ] },
    walk: { tracks: [
      ...[['leg_fl', 1], ['leg_br', 1], ['leg_fr', -1], ['leg_bl', -1]].map(([bone, s]) => ({ bone, path: 'rotation', keys: loopKeys(0.7, [[0.6 * s, 0, 0], [0, 0, 0], [-0.6 * s, 0, 0], [0, 0, 0], [0.6 * s, 0, 0]]) })),
      { bone: 'body', path: 'translation', keys: loopKeys(0.7, [[0, B, 0], [0, B + 0.06, 0], [0, B, 0], [0, B + 0.06, 0], [0, B, 0]]) },
      { bone: 'head', path: 'rotation', keys: loopKeys(0.7, [[0.05, 0, 0], [-0.05, 0, 0], [0.05, 0, 0]]) },
    ] },
    attack: { tracks: [
      // 앞발을 들고 일어섰다가 내리찍는다
      { bone: 'body', path: 'rotation', keys: [[0, [0, 0, 0]], [0.25, [-0.55, 0, 0]], [0.42, [0.25, 0, 0]], [0.7, [0, 0, 0]]] },
      { bone: 'body', path: 'translation', keys: [[0, [0, B, 0]], [0.25, [0, B + 0.1, -0.1]], [0.42, [0, B, 0.4]], [0.7, [0, B, 0]]] },
      { bone: 'head', path: 'rotation', keys: [[0, [0, 0, 0]], [0.25, [-0.3, 0, 0]], [0.42, [0.45, 0, 0]], [0.7, [0, 0, 0]]] },
      ...['leg_fl', 'leg_fr'].map((bone) => ({ bone, path: 'rotation', keys: [[0, [0, 0, 0]], [0.25, [-1.1, 0, 0]], [0.42, [0.35, 0, 0]], [0.7, [0, 0, 0]]] })),
    ] },
    hit: { tracks: [
      { bone: 'body', path: 'rotation', keys: [[0, [0, 0, 0]], [0.1, [-0.2, 0, 0.12]], [0.35, [0, 0, 0]]] },
      { bone: 'body', path: 'translation', keys: [[0, [0, B, 0]], [0.1, [0, B, -0.25]], [0.35, [0, B, 0]]] },
    ] },
    die: { tracks: [
      // 옆으로 쓰러져 다리를 버둥거리다 멈춘다
      { bone: 'root', path: 'rotation', keys: [[0, [0, 0, 0]], [0.3, [0, 0, 0.5]], [0.7, [0, 0, 1.5]], [1.1, [0, 0, 1.45]]] },
      { bone: 'root', path: 'translation', keys: [[0, [0, 0, 0]], [0.7, [0.25, 0.42, 0]], [1.1, [0.25, 0.4, 0]]] },
      ...['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'].map((bone, i) => ({ bone, path: 'rotation', keys: [[0, [0, 0, 0]], [0.5, [(i % 2 ? 0.5 : -0.5), 0, 0]], [0.8, [(i % 2 ? -0.3 : 0.3), 0, 0]], [1.1, [0.2, 0, 0]]] })),
    ] },
  };
  return glb({ bones, boxes, mats, clips });
};

// ---------- 야영꾼 (사람형. 모든 직업이 같이 쓴다. 틀의 사람과 같은 크기: 키 약 2.2, 어깨 높이 1.48, 엉덩이 0.7) ----------
const camper = () => {
  const bones = [
    { name: 'root', t: [0, 0, 0] },
    { name: 'hips', parent: 0, t: [0, 0.75, 0] },
    { name: 'spine', parent: 1, t: [0, 0.15, 0] },
    { name: 'head', parent: 2, t: [0, 0.6, 0] },
    { name: 'arm_l', parent: 2, t: [-0.54, 0.58, 0] }, { name: 'arm_r', parent: 2, t: [0.54, 0.58, 0] },
    { name: 'leg_l', parent: 1, t: [-0.2, -0.05, 0] }, { name: 'leg_r', parent: 1, t: [0.2, -0.05, 0] },
  ];
  const boxes = [
    { bone: 'leg_l', mat: 'pants', size: [0.28, 0.6, 0.28], at: [0, -0.3, 0] }, { bone: 'leg_r', mat: 'pants', size: [0.28, 0.6, 0.28], at: [0, -0.3, 0] },
    { bone: 'leg_l', mat: 'boot', size: [0.31, 0.16, 0.38], at: [0, -0.62, 0.04] }, { bone: 'leg_r', mat: 'boot', size: [0.31, 0.16, 0.38], at: [0, -0.62, 0.04] },
    { bone: 'spine', mat: 'torso', size: [0.8, 0.8, 0.45], at: [0, 0.2, 0] }, // 몸통: 옷 색으로 칠하고, 갑옷을 입으면 갑옷 색 (재질 이름 torso)
    { bone: 'spine', mat: 'leather', size: [0.84, 0.12, 0.49], at: [0, -0.14, 0] },
    { bone: 'spine', mat: 'leather', size: [0.12, 0.84, 0.48], at: [0, 0.22, 0], }, // 어깨띠
    { bone: 'spine', mat: 'leather', size: [0.5, 0.55, 0.2], at: [0, 0.22, -0.33] }, // 등짐
    { bone: 'arm_l', mat: 'cloth', size: [0.24, 0.6, 0.24], at: [0, -0.3, 0] }, { bone: 'arm_r', mat: 'cloth', size: [0.24, 0.6, 0.24], at: [0, -0.3, 0] },
    { bone: 'arm_l', mat: 'skin', size: [0.22, 0.16, 0.22], at: [0, -0.68, 0] }, { bone: 'arm_r', mat: 'skin', size: [0.22, 0.16, 0.22], at: [0, -0.68, 0] },
    { bone: 'head', mat: 'skin', size: [0.54, 0.54, 0.54], at: [0, 0.3, 0] },
    { bone: 'head', mat: 'hood', size: [0.64, 0.24, 0.64], at: [0, 0.6, -0.02] },
    { bone: 'head', mat: 'hood', size: [0.64, 0.56, 0.14], at: [0, 0.34, -0.31] },
    { bone: 'head', mat: 'hood', size: [0.1, 0.5, 0.6], at: [-0.32, 0.36, -0.02] }, { bone: 'head', mat: 'hood', size: [0.1, 0.5, 0.6], at: [0.32, 0.36, -0.02] },
    { bone: 'head', mat: 'hood', size: [0.22, 0.22, 0.3], at: [0, 0.72, -0.28] }, // 고깔 끝
    { bone: 'head', mat: 'eye', size: [0.08, 0.1, 0.04], at: [-0.12, 0.32, 0.28] }, { bone: 'head', mat: 'eye', size: [0.08, 0.1, 0.04], at: [0.12, 0.32, 0.28] },
  ];
  const mats = { cloth: 0x3f7fbf, torso: 0x3f7fbf, skin: 0xf0c9a0, pants: 0x3b3a4a, boot: 0x4a3220, leather: 0x6b4a2e, hood: 0x2f5a3a, eye: 0x1a1f22 };
  const H = 0.75;
  // 걸음: 틀의 코드 흔들기와 같은 박자 (phase가 초당 10씩 늘고 sin을 쓴다: 한 걸음 주기 2π/10 ≈ 0.63초, 폭 0.75)
  const W = 0.63, A = 0.75;
  const swing = (s) => loopKeys(W, [[A * s, 0, 0], [0, 0, 0], [-A * s, 0, 0], [0, 0, 0], [A * s, 0, 0]]);
  const clips = {
    idle: { tracks: [
      { bone: 'spine', path: 'rotation', keys: loopKeys(2.4, [[0, 0, 0], [0.05, 0, 0], [0, 0, 0]]) },
      { bone: 'arm_l', path: 'rotation', keys: loopKeys(2.4, [[0, 0, 0], [0, 0, -0.08], [0, 0, 0]]) },
      { bone: 'arm_r', path: 'rotation', keys: loopKeys(2.4, [[0, 0, 0], [0, 0, 0.08], [0, 0, 0]]) },
      { bone: 'head', path: 'rotation', keys: loopKeys(2.4, [[0, 0, 0], [0, 0.25, 0], [0, 0, 0], [0, -0.25, 0], [0, 0, 0]]) },
    ] },
    walk: { tracks: [
      { bone: 'leg_l', path: 'rotation', keys: swing(1) }, { bone: 'leg_r', path: 'rotation', keys: swing(-1) },
      { bone: 'arm_l', path: 'rotation', keys: swing(-0.8) }, { bone: 'arm_r', path: 'rotation', keys: swing(0.8) },
      { bone: 'hips', path: 'translation', keys: loopKeys(W, [[0, H, 0], [0, H + 0.05, 0], [0, H, 0], [0, H + 0.05, 0], [0, H, 0]]) },
      { bone: 'spine', path: 'rotation', keys: loopKeys(W, [[0.06, 0.08, 0], [0.06, -0.08, 0], [0.06, 0.08, 0]]) },
    ] },
    attack: { tracks: [
      // 오른팔을 들어 내리친다 (틀의 코드 흔들기: 팔을 -2.3까지 들었다 내린다)
      { bone: 'arm_r', path: 'rotation', keys: [[0, [0, 0, 0]], [0.12, [-2.4, 0, 0.2]], [0.24, [0.35, 0, 0]], [0.4, [0, 0, 0]]] },
      { bone: 'spine', path: 'rotation', keys: [[0, [0, 0, 0]], [0.12, [-0.1, -0.3, 0]], [0.24, [0.15, 0.25, 0]], [0.4, [0, 0, 0]]] },
      { bone: 'leg_l', path: 'rotation', keys: [[0, [0, 0, 0]], [0.24, [-0.35, 0, 0]], [0.4, [0, 0, 0]]] },
    ] },
    hit: { tracks: [
      { bone: 'spine', path: 'rotation', keys: [[0, [0, 0, 0]], [0.1, [-0.3, 0, 0.1]], [0.3, [0, 0, 0]]] },
      { bone: 'head', path: 'rotation', keys: [[0, [0, 0, 0]], [0.1, [-0.25, 0, 0]], [0.3, [0, 0, 0]]] },
    ] },
    die: { tracks: [
      { bone: 'root', path: 'rotation', keys: [[0, [0, 0, 0]], [0.25, [-0.3, 0, 0]], [0.75, [-1.5, 0, 0]], [0.9, [-1.45, 0, 0]]] },
      { bone: 'root', path: 'translation', keys: [[0, [0, 0, 0]], [0.75, [0, 0.24, 0]]] },
      { bone: 'arm_l', path: 'rotation', keys: [[0, [0, 0, 0]], [0.6, [-2.6, 0, -0.3]]] },
      { bone: 'arm_r', path: 'rotation', keys: [[0, [0, 0, 0]], [0.6, [-2.6, 0, 0.3]]] },
    ] },
  };
  return glb({ bones, boxes, mats, clips });
};

// ---------- 무기: 큰 양날 도끼의 머리 (틀의 손 모양 axe가 돌려준 도끼날 자리에 놓인다. 위가 +Y) ----------
const axeHead = () => glb({
  boxes: [
    { mat: 'iron', size: [0.12, 0.3, 0.3], at: [0, 0, 0] },
    { mat: 'iron', size: [0.1, 0.5, 0.2], at: [0, 0, 0.24] }, { mat: 'edge', size: [0.08, 0.6, 0.08], at: [0, 0, 0.36] },
    { mat: 'iron', size: [0.1, 0.42, 0.16], at: [0, 0, -0.22] }, { mat: 'edge', size: [0.08, 0.5, 0.07], at: [0, 0, -0.32] },
  ],
  mats: { iron: 0x8a8f96, edge: 0xffd27a },
});

// ---------- WAV 쓰기 ----------
const RATE = 22050;
function wav(samples, rate = RATE) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
/** 씨앗을 고정한 난수 (같은 파일이 나오게) */
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** 효과음: 도끼로 나무를 찍는 듯한 둔탁한 타격 (0.18초) */
function hitSound() {
  const n = Math.round(RATE * 0.18), r = rnd(7), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, env = Math.exp(-t * 28);
    lp += ((r() * 2 - 1) - lp) * 0.25; // 거친 잡음을 조금 걸러 '퍽'
    out[i] = (lp * 0.9 + Math.sin(2 * Math.PI * (140 - t * 300) * t) * 0.8) * env * 0.8;
  }
  return wav(out);
}
/** 효과음: 줍기. 맑은 음 둘이 올라간다 (0.32초) */
function pickupSound() {
  const n = Math.round(RATE * 0.32), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const a = t < 0.12 ? Math.sin(2 * Math.PI * 988 * t) * Math.exp(-t * 18) : 0;
    const b = t >= 0.1 ? Math.sin(2 * Math.PI * 1319 * (t - 0.1)) * Math.exp(-(t - 0.1) * 12) : 0;
    out[i] = (a + b) * 0.45;
  }
  return wav(out);
}
/** 배경음: 모닥불 곁. 느린 화음 넷과 장작 타는 소리, 12초 고리 (끝과 처음이 이어지게 화음마다 들고 난다) */
function campMusic() {
  const rate = 16000, len = 12, n = rate * len, out = new Float32Array(n), r = rnd(11); // 낮은 음만 있어 표본을 줄여도 된다
  const chords = [[196, 247, 294], [175, 220, 262], [165, 196, 247], [147, 185, 220]]; // G, F, Em, D 비슷하게
  for (let i = 0; i < n; i++) {
    const t = i / rate, k = Math.floor(t / 3), u = (t % 3) / 3;
    const env = Math.sin(Math.PI * u) ** 0.6;
    let s = 0;
    for (const f of chords[k]) s += Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12;
    out[i] = s * env * 0.11;
  }
  // 장작이 탁탁 튄다
  for (let c = 0; c < 70; c++) {
    const at = Math.floor(r() * (n - rate * 0.03)), amp = 0.15 + r() * 0.25;
    for (let j = 0; j < rate * 0.025; j++) out[at + j] += (r() * 2 - 1) * amp * Math.exp(-j / (rate * 0.004));
  }
  return wav(out, rate);
}

const files = {
  'models/beast.glb': beast(),
  'models/camper.glb': camper(),
  'models/axe.glb': axeHead(),
  'sounds/hit.wav': hitSound(),
  'sounds/pickup.wav': pickupSound(),
  'sounds/camp.wav': campMusic(),
};
for (const [name, buf] of Object.entries(files)) {
  const file = path.join(out, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`${path.relative(root, file).replaceAll('\\', '/')}  ${(buf.length / 1024).toFixed(1)}KB`);
}
