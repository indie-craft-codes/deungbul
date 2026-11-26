// 에셋 등록표(engine/client/assets.ts): 모델 파일을 고르는 차례, 상태 → 클립 고르기, 소리 고르기(파일 → 합성음), 음량 설정, 미리 읽을 목록, 믹서 갱신 간격.
// 화면 요소와 three.js 없이 고르는 규칙만 본다 (실제로 읽고 움직이는 것은 화면으로 확인한다: 예제 games/sample의 곰·멧돼지·야영꾼)
import {
  clipTable, clipsFor, cuts, DEFAULT_CLIPS, DEFAULT_MIX, fitLift, fitScale, hasAudioFiles, hasMusic, humanoidAsset, mixerEvery, monsterAsset, musicFile, pickClip,
  preloadList, readMix, registerHumanoidAsset, registerMonsterAsset, registerMusic, registerSound, registerWeaponAsset, setClipNames, soundFile, soundSource, weaponAsset, writeMix, type LoadState,
} from '../../client/assets';
import type * as T3 from 'three';
import { check } from '../harness';

// ---------- 처음: 아무것도 등록하지 않은 게임 ----------
check(!hasAudioFiles() && !hasMusic() && preloadList().models.length === 0 && preloadList().sounds.length === 0,
  '등록하지 않은 게임: 소리 파일도 모델 파일도 없고 미리 읽을 것도 없다 (접속 화면에 진행 표시가 뜨지 않고 음량 단추도 없다)');
check(monsterAsset('colossus') === undefined && humanoidAsset('knight') === undefined && weaponAsset('blade1', 'sword') === undefined,
  '등록하지 않은 몬스터·사람·무기는 모델 파일이 없다 (코드 모델을 그대로 쓴다)');
const none = (): LoadState | undefined => undefined;
check(soundSource('hit', none, true) === 'synth' && soundSource('chop', none, false) === 'none', '등록하지 않은 효과음 키는 합성음 (합성음도 없는 키는 소리가 없다)');

// ---------- 모델 파일을 고르는 차례 ----------
registerMonsterAsset('colossus', { url: './models/big.glb', height: 3 });
registerHumanoidAsset({ url: './models/person.glb', arms: { left: 'arm_l', right: 'arm_r' } });
registerHumanoidAsset({ url: './models/knight.glb' }, 'knight');
registerWeaponAsset('sword', { url: './models/sword.glb' });
registerWeaponAsset('blade2', { url: './models/blade2.glb' });
check(monsterAsset('colossus')?.url === './models/big.glb' && monsterAsset('slime') === undefined, '몬스터는 종류마다: 등록한 종류만 모델 파일');
check(humanoidAsset('knight')?.url === './models/knight.glb' && humanoidAsset('ranger')?.url === './models/person.glb' && humanoidAsset()?.url === './models/person.glb',
  '사람은 직업의 것 → 모두의 것 (직업을 모르는 상인·NPC도 모두의 것)');
check(weaponAsset('blade2', 'sword')?.url === './models/blade2.glb' && weaponAsset('blade1', 'sword')?.url === './models/sword.glb' && weaponAsset('bow1', 'bow') === undefined && weaponAsset('', '') === undefined,
  '무기는 무기 id의 것 → 손 모양의 것 (둘 다 없으면 코드 칼날)');
const list = preloadList();
check(list.models.length === 5 && new Set(list.models).size === 5, `미리 읽을 모델 목록에 등록한 파일이 모두 있다 (${list.models.length}개)`);
registerMonsterAsset('ghoul', { url: './models/big.glb', height: 1.5, tint: { fur: 0x333333 } });
check(preloadList().models.length === 5, '같은 파일을 두 몬스터에 쓰면 한 번만 읽는다 (크기와 털빛만 다르게)');

// ---------- 크기와 발 높이 ----------
check(fitScale(2, { height: 3 }) === 1.5 && fitScale(2, { scale: 0.5 }) === 0.5 && fitScale(2, {}) === 1 && fitScale(0, { height: 3, scale: 2 }) === 2,
  '크기: height를 주면 경계 상자 높이로 나눈 배율, 아니면 scale (높이가 0인 파일은 scale)');
check(fitLift(-0.5, 2, {}) === 1 && fitLift(-0.5, 2, { lift: 0.25 }) === 1.25 && fitLift(-0.5, 2, { ground: false, lift: 0.3 }) === 0.3,
  '발 높이: 바닥을 땅에 붙이고 lift를 더한다 (ground: false면 파일의 원점이 발)');

// ---------- 상태 → 클립 ----------
check(DEFAULT_CLIPS.idle === 'idle' && DEFAULT_CLIPS.walk === 'walk' && DEFAULT_CLIPS.attack === 'attack' && DEFAULT_CLIPS.hit === 'hit' && DEFAULT_CLIPS.die === 'die', '틀의 기본 클립 이름: idle/walk/attack/hit/die');
const names = ['Idle', 'Armature|Walk', 'attack', 'Death', 'Run'];
check(pickClip('attack', names) === 'attack' && pickClip('idle', names) === 'Idle' && pickClip('walk', names) === 'Armature|Walk' && pickClip('die', names) === null && pickClip('', names) === null,
  '클립 고르기: 같은 이름 → 대소문자만 다른 이름 → "Armature|이름" (없으면 null: 그 상태는 코드 흔들기)');
const picked = clipsFor(clipTable({ die: 'Death' }), names);
check(picked.die === 'Death' && picked.walk === 'Armature|Walk' && picked.hit === undefined, '모델마다 클립 이름을 바꾼다 (die → Death). 없는 상태(hit)는 빠진다');
setClipNames({ walk: 'Run' });
check(clipsFor(clipTable(), names).walk === 'Run' && clipTable({ walk: 'Walk' }).walk === 'Walk', '모든 모델의 이름을 바꾸고(setClipNames), 모델의 clips가 그보다 앞선다');
setClipNames({ walk: 'walk' });
check(cuts(null, 'hit') && cuts('hit', 'attack') && !cuts('attack', 'hit') && cuts('attack', 'attack') && cuts('attack', 'die') && !cuts('die', 'attack'),
  '한 번 도는 동작의 우선순위: 쓰러짐 > 공격 > 맞음 (공격 중에 맞아도 끊기지 않고, 다시 공격하면 처음부터)');
check(mixerEvery(5, true) === 1 && mixerEvery(30, true) === 2 && mixerEvery(60, true) === 4 && mixerEvery(5, false) === 8,
  '믹서 갱신: 가까우면 매 프레임, 멀수록 드물게, 화면 밖은 8프레임마다');

// ---------- 소리 고르기 ----------
registerSound('hit', './sounds/hit.ogg', 0.7);
registerSound('chop', './sounds/chop.ogg');
const at = (s: Record<string, LoadState>) => (url: string): LoadState | undefined => s[url];
check(soundFile('hit')?.vol === 0.7 && soundFile('chop')?.vol === 1 && soundFile('hurt') === undefined, '효과음 파일과 음량 (기본 1)');
check(soundSource('hit', at({ './sounds/hit.ogg': 'ready' }), true) === 'file', '파일이 다 읽혔으면 파일');
check(soundSource('hit', at({ './sounds/hit.ogg': 'loading' }), true) === 'synth' && soundSource('hit', at({ './sounds/hit.ogg': 'failed' }), true) === 'synth',
  '읽는 중이거나 읽지 못했으면 합성음으로 돌아간다');
check(soundSource('hurt', at({ './sounds/hit.ogg': 'ready' }), true) === 'synth', '등록하지 않은 키(hurt)는 다른 키의 파일과 상관없이 합성음');
check(soundSource('chop', at({ './sounds/chop.ogg': 'ready' }), false) === 'file' && soundSource('chop', at({}), false) === 'none', '게임의 키(chop)는 파일이 있어야 들린다');
check(hasAudioFiles() && !hasMusic() && preloadList().sounds.join() === './sounds/hit.ogg,./sounds/chop.ogg', '효과음 파일이 있으면 미리 읽는다 (음량 단추가 보인다)');
registerMusic('field', './music/field.ogg', 0.6);
check(hasMusic() && musicFile('field')?.vol === 0.6 && musicFile('cave') === undefined && !preloadList().sounds.includes('./music/field.ogg'), '배경음은 등록만 하고 미리 읽지 않는다 (틀 때 흘려 받는다)');

// ---------- 음량 설정 ----------
check(JSON.stringify(readMix(null)) === JSON.stringify(DEFAULT_MIX) && JSON.stringify(readMix('{깨진')) === JSON.stringify(DEFAULT_MIX), '저장한 음량이 없거나 깨졌으면 기본값');
const m = readMix(writeMix({ sfx: 0.3, music: 0 }));
check(m.sfx === 0.3 && m.music === 0, '저장한 음량을 그대로 읽는다 (0도 그대로)');
const odd = readMix('{"sfx": 3, "music": "x"}');
check(odd.sfx === 1 && odd.music === DEFAULT_MIX.music, '범위 밖의 값은 0~1로 자르고, 수가 아니면 기본값');

// ---------- 움직임(scene/gltf.ts의 Animator): three.js의 믹서로, 화면 없이 ----------
// 클립마다 마디 n의 x 위치를 다르게 둔다: 서 있기 0, 걷기 1, 공격 2, 쓰러짐 3. 섞는 시간 0.1초
{
  const THREE = await import('three');
  const { Animator } = await import('../../client/scene/gltf');
  const root = new THREE.Object3D(), n = new THREE.Object3D();
  n.name = 'n';
  root.add(n);
  const clip = (name: string, x: number, len: number) => new THREE.AnimationClip(name, len, [new THREE.VectorKeyframeTrack('n.position', [0, len], [x, 0, 0, x, 0, 0])]);
  const a = new Animator(root, [clip('idle', 0, 1), clip('Walk', 1, 0.6), clip('attack', 2, 0.5), clip('Death', 3, 0.8)], { url: '', clips: { die: 'Death' }, fade: 0.1 });
  const run = (s: number) => { for (let t = 0; t < s; t += 0.02) a.update(0.02); };
  const x = () => Math.round(n.position.x * 100) / 100;
  run(0.2);
  check(a.has('idle') && a.has('walk') && a.has('die') && !a.has('hit') && x() === 0, `처음은 서 있기 (클립 이름은 대소문자·모델의 clips로 고른다. 맞음 클립은 없다) x=${x()}`);
  a.walk(true); run(0.3);
  check(x() === 1, `걸으면 걷기 클립으로 섞어 넘어간다 x=${x()}`);
  check(a.cue('attack') && !a.cue('hit'), '공격은 클립을 틀고 true, 맞음은 클립이 없어 false (틀의 코드 흔들기가 맡는다)');
  run(0.2);
  check(x() === 2, `공격 클립 x=${x()}`);
  run(0.5);
  check(x() === 1, `공격이 끝나면 바탕 동작(걷기)으로 돌아간다 x=${x()}`);
  check(Math.abs(a.length('attack') - 0.5) < 1e-6 && a.length('hit') === 0, '클립의 길이 (없으면 0: 쓰러짐 연출의 길이에 쓴다)');
  a.cue('die'); run(1.2);
  a.cue('attack'); a.walk(false); run(0.3);
  check(a.down && x() === 3, `쓰러지면 마지막 자세로 남고, 공격·걷기가 와도 끊기지 않는다 x=${x()}`);
}

// ---------- 파일의 사람에 갑옷 (HumanoidAsset.armor): 이름 맞추기, 칠하기와 덧대기, 벗기, 이름이 없을 때 ----------
{
  const { armorHit, nameList } = await import('../../client/assets');
  check(armorHit(['torso'], ['body_2', 'body'], 'torso') === 'material' && armorHit(['Torso'], ['torso', 'Scene'], 'cloth') === 'node' && armorHit(['torso'], ['Armature|torso'], '') === 'node',
    '갑옷을 칠할 곳: 재질 이름이나 위로 가는 노드 이름, 대소문자와 앞머리(Armature|)는 가리지 않는다');
  check(armorHit(['torso'], ['body'], 'cloth') === null && armorHit([], ['torso'], 'torso') === null, '맞는 이름이 없으면 칠하지 않는다');
  check(nameList(undefined).length === 0 && nameList('cloth').join() === 'cloth' && nameList(['cloth', 'torso']).join() === 'cloth,torso', 'paint의 이름은 하나나 목록');

  const THREE = await import('three');
  const { instantiate, instantiateWeapon } = await import('../../client/scene/gltf');
  const { makeHumanoid, registerArmor, setArmor, setFileTools, setFlash } = await import('../../client/scene/models');
  const { registerHumanoidAsset: addHuman } = await import('../../client/assets');
  // 파일 흉내: 등뼈(spine, 높이 0.9) 아래 몸통(재질 torso)과 팔(재질 cloth)
  const scene = new THREE.Group(), spine = new THREE.Object3D();
  spine.name = 'spine'; spine.position.set(0, 0.9, 0);
  const torsoMat = new THREE.MeshStandardMaterial({ color: 0x111111 }); torsoMat.name = 'torso';
  const armMat = new THREE.MeshStandardMaterial({ color: 0x222222 }); armMat.name = 'cloth';
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.45), torsoMat), arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), armMat);
  torso.position.y = 0.2; arm.position.set(0.5, 0, 0);
  spine.add(torso, arm);
  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), armMat); // 바닥을 0에 (경계 상자: 0~2.1)
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), armMat); top.position.y = 2.05;
  feet.position.y = 0.05;
  scene.add(spine, feet, top);
  scene.updateMatrixWorld(true);
  const src = { scene, clips: [], skinned: false, box: new THREE.Box3().setFromObject(scene) };
  const srcs: Record<string, typeof src> = { './models/armored.glb': src, './models/plain.glb': src, './models/odd.glb': src };
  setFileTools({ load: async (u) => srcs[u] ?? null, now: (u) => srcs[u], make: instantiate, weapon: instantiateWeapon });
  addHuman({ url: './models/armored.glb', paint: { cloth: ['cloth', 'torso'] }, armor: { tint: ['torso'], attach: 'spine' } }, 'armored');
  addHuman({ url: './models/plain.glb', paint: { cloth: 'cloth' } }, 'plain');
  addHuman({ url: './models/odd.glb', armor: { tint: ['chest'], attach: 'ribs' } }, 'odd');
  registerArmor('mail', { color: 0x8f969e, pads: true });
  registerArmor('coat', { color: 0x8a6a48, pads: false });
  const colorOf = (o: T3.Object3D | undefined) => ((o as T3.Mesh | undefined)?.material as T3.MeshStandardMaterial | undefined)?.color.getHex();
  const meshBy = (root: T3.Object3D, name: string) => { let f: T3.Mesh | undefined; root.traverse((o) => { const mm = (o as T3.Mesh); if (!f && mm.isMesh && (mm.material as T3.Material).name === name && (mm.geometry as T3.BoxGeometry).parameters.width === (name === 'torso' ? 0.8 : 0.2)) f = mm; }); return f; };

  const m = makeHumanoid(0x3f7fbf, 'sword', 0xf0c9a0, 'armored');
  const mt = meshBy(m.root, 'torso'), ma = meshBy(m.root, 'cloth');
  check(m.asset === true && colorOf(mt) === 0x3f7fbf && colorOf(ma) === 0x3f7fbf, '갑옷 없이: 몸통과 팔은 옷 색 (paint.cloth의 목록)');
  setArmor(m, 'mail');
  check(colorOf(mt) === 0x8f969e && colorOf(ma) === 0x3f7fbf, '갑옷을 입으면 몸통(재질 torso)만 갑옷 색');
  const holder = m.armor!;
  check(!!holder && holder.parent?.name === 'spine' && holder.children[0].children.length === 4, '덧대기(가슴받이·허리띠·어깨받이 둘)가 등뼈에 붙는다');
  m.root.updateMatrixWorld(true);
  const plate = holder.children[0].children[0], at = plate.getWorldPosition(new THREE.Vector3()).sub(m.root.getWorldPosition(new THREE.Vector3()));
  check(Math.abs(at.x) < 1e-6 && Math.abs(at.y - 1.2) < 1e-6 && Math.abs(at.z) < 1e-6, `쉬는 자세에서 가슴받이는 코드 사람과 같은 자리 (높이 1.2: ${at.y.toFixed(3)})`);
  const spineNow = m.root.getObjectByName('spine')!;
  spineNow.rotation.x = 0.5; m.root.updateMatrixWorld(true);
  const moved = plate.getWorldPosition(new THREE.Vector3()).sub(m.root.getWorldPosition(new THREE.Vector3()));
  check(Math.abs(moved.z) > 0.05, `등뼈가 움직이면 덧대기도 따라 움직인다 (z ${moved.z.toFixed(3)})`);
  spineNow.rotation.x = 0;
  setArmor(m, 'coat');
  check(colorOf(mt) === 0x8a6a48 && m.armor!.children[0].children.length === 2 && !holder.parent, '다른 갑옷으로 바꾸면 색과 덧대기가 바뀐다 (어깨받이 없음, 앞의 덧대기는 떨어진다)');
  setFlash(m, true); setArmor(m, 'mail'); setFlash(m, false);
  check(colorOf(mt) === 0x8f969e, '맞아서 번쩍이는 중에 갑옷이 바뀌어도 번쩍임이 끝나면 새 갑옷 색');
  setArmor(m, '');
  check(colorOf(mt) === 0x3f7fbf && !m.armor, '갑옷을 벗으면 본래 색(옷 색)으로 돌아가고 덧대기가 없다');

  const p = makeHumanoid(0x3f7fbf, 'sword', 0xf0c9a0, 'plain');
  setArmor(p, 'mail');
  check(p.asset === true && !p.armor && colorOf(meshBy(p.root, 'torso')) === 0x111111, 'armor를 적지 않은 파일의 사람은 예전처럼 갑옷이 보이지 않는다');
  const warn = console.warn; const warned: string[] = []; console.warn = (s: string) => { warned.push(s); };
  const o = makeHumanoid(0x3f7fbf, 'sword', 0xf0c9a0, 'odd');
  console.warn = warn;
  setArmor(o, 'mail');
  check(!o.armor && warned.length === 2, `이름(chest, ribs)이 모델에 없으면 아무것도 하지 않고 경고 둘 (${warned.length})`);
  // 코드 사람 (모두의 파일 person.glb는 읽지 못해 코드 모델이 남는다): 예전과 같은 자리에 덧댄다
  const c = makeHumanoid(0x3f7fbf, 'sword', 0xf0c9a0, 'nobody');
  setArmor(c, 'mail');
  const g = c.armor!;
  check(!c.asset && !!c.rig && g.parent === c.root && g.children.length === 4 && g.children[0].position.y === 1.2 && g.children[1].position.y === 0.78, '코드 사람은 예전처럼 몸(root)에 가슴받이·허리띠·어깨받이를 덧댄다');
  setArmor(c, '');
  check(!c.armor && !c.root.children.includes(g), '코드 사람도 벗으면 덧대기가 빠진다');
}
