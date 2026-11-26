// 대국의 화면: 고른 말의 카드, 내 차례의 큰 글, 칸 누르기(틀의 setTapHandler), 칸 표시, 치는 연출(틀의 onEffect), 판을 비추는 카메라(setCameraAim center, setCameraYaw).
// 대기실 창·판의 막대(자리, 차례, 초읽기, 차례 넘기기, 기권)·결과 창은 틀의 판 모듈(rooms)의 화면이다: 여기서는 자리의 색과 도움말을 더한다(setRoomLook). 서버의 짝은 server/duels.ts.
import * as THREE from 'three';
import { $, addNotices, addMsgSounds, fitZoom, mountPanel, myRoom, myRoomTurn, onEffect, onFrame, onKey, onMsg, onRoomChange, onSlow, roomSend, S, send, setCameraAim, setCameraYaw, setRoomLook, setTapHandler, sfx, view } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import type { RoomView } from '@engine/shared/defs';
import { CAMERA } from '../shared/content';
import { BOARD, BOARDS, SIDE_COLOR, TURN, UNITS, UNIT_TYPES, type UnitType } from '../shared/content/board';
import { aiStep, cellAt, cellPos, reach, targets, type Cell, type Unit } from '../shared/rules';
import type { DuelAct, DuelView, MeState } from '../shared/stepstone';
import { initPieces, pieceParts, TILE_TOP } from './pieces';
import './stepstone.css';

/** 이 게임의 화면 상태: 서버가 알려 준 내 판의 말(개인 상태 duel), 전적, 고른 말. 차례·자리·남은 시간은 틀의 myRoom() */
export const G: { duel: DuelView | null; rec: MeState['rec']; sel: number } = { duel: null, rec: [0, 0, 0], sel: 0 };

const act = (a: DuelAct, more: { u?: number; to?: number; c?: number; r?: number } = {}) => send({ t: 'duel', a, ...more });
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const UNIT_KEY: Record<UnitType, ['unitShield' | 'unitSling' | 'unitRunner', 'infoShield' | 'infoSling' | 'infoRunner']> = {
  shield: ['unitShield', 'infoShield'], sling: ['unitSling', 'infoSling'], runner: ['unitRunner', 'infoRunner'],
};

/** 개인 상태의 말 줄 → 규칙이 읽는 말 */
function units(d: DuelView): Unit[] {
  return d.units.map(([id, ty, side, c, r, hp, fl]) => ({ id, type: UNIT_TYPES[ty] ?? 'runner', side: side ? 1 : 0, c, r, hp, moved: (fl & 1) !== 0, acted: (fl & 2) !== 0 }));
}
/** 판의 말을 그릴 때 (두는 중이거나 끝난 판) */
const live = (): { room: RoomView; d: DuelView } | null => { const room = myRoom(), d = G.duel; return room && d && room.st !== 'wait' && d.id === room.id ? { room, d } : null; };

/** 창을 틀의 빈 자리에 붙인다 (startClient보다 먼저) */
export function mountDuel(): void {
  // 화면 위: 고른 말의 카드, 내 차례의 큰 글, 피해 숫자
  mountPanel('hud', `
    <div class="panel" id="unitCard" hidden><div class="row"><span class="ttitle" id="ucName"></span></div><div class="note" id="ucStat"></div><div class="note" id="ucInfo"></div></div>
    <div id="turnFlash" hidden></div>
    <div id="dmgLayer"></div>`);
}

export function initDuel(): void {
  initPieces();
  const ui = { card: $('unitCard'), ucName: $('ucName'), ucStat: $('ucStat'), ucInfo: $('ucInfo'), flash: $('turnFlash'), dmg: $('dmgLayer') };

  onMsg('me', (m) => {
    if (m.k === 'duel') { G.duel = m.s as MeState['duel']; tidy(); }
    else if (m.k === 'rec') G.rec = m.s as MeState['rec'];
  });
  // 판의 시작·돌아옴은 가운데 알림으로만 (대화창에 남기지 않는다), 수의 거절은 흘러가는 알림
  addNotices({ feed: ['duelBad'], quiet: ['roomStart', 'roomBack', 'roomFoeBack'] });
  addMsgSounds({ duelBad: sfx.bad });
  // 틀의 판 화면에 자리의 색, 막대 아래의 도움말, 대기실의 전적
  setRoomLook({
    seatColor: (i) => css(SIDE_COLOR[i === 1 ? 1 : 0]),
    note: () => {
      const r = myRoom();
      if (!r || r.st !== 'play') return '';
      const opener = r.round === 1 ? ` ${t('openerNote')}` : '';
      return (myRoomTurn() ? t('pickUnit') : t('waitFoe')) + opener;
    },
    lobby: () => L().fmt.rec(...G.rec),
  });

  // Space: 차례 넘기기 (전투 모듈을 고르지 않아 틀이 쓰지 않는 키)
  onKey(' ', () => { if (myRoomTurn()) { G.sel = 0; roomSend('pass'); } });

  // 판에 앉은 동안 3D 화면의 누르기는 이 게임이 받는다 (틀의 '땅 누르면 걷기'를 하지 않는다)
  setTapHandler((sx, sy) => { if (!myRoom()) return false; tap(sx, sy); return true; });
  const marks = initMarks();
  initCamera();
  initFx(ui.dmg);

  // 판이 바뀌었다: 내 차례가 되면 큰 글, 오른쪽 자리면 카메라를 반대편으로 (내 진영이 늘 화면의 왼쪽), 고른 말을 풀기
  onRoomChange((before, r) => {
    setCameraYaw(r && r.me === 1 ? Math.PI : 0);
    if (!r) { G.sel = 0; return; }
    if (r.st === 'play' && r.turn === r.me && (!before || before.turn !== r.turn || before.st !== 'play' || before.id !== r.id)) { flash(t('myTurn')); sfx.skill(); }
    if (r.st !== 'play' || r.turn !== r.me) G.sel = 0;
  });
  function tidy(): void { const d = G.duel; if (!d || (G.sel && !units(d).some((u) => u.id === G.sel && u.hp > 0))) G.sel = 0; }
  let flashUntil = 0;
  function flash(text: string): void { ui.flash.textContent = text; ui.flash.hidden = false; flashUntil = performance.now() + 1300; }

  // 느린 주기(0.25초)마다 고른 말의 카드
  onSlow(() => {
    if (!ui.flash.hidden && performance.now() > flashUntil) ui.flash.hidden = true;
    const on = live();
    const u = on && units(on.d).find((x) => x.id === G.sel);
    ui.card.hidden = !u;
    if (!on || !u) return;
    const def = UNITS[u.type], [nk, ik] = UNIT_KEY[u.type];
    ui.ucName.textContent = t(nk); ui.ucName.style.color = css(SIDE_COLOR[u.side]);
    ui.ucStat.textContent = L().fmt.unitStat(u.hp, def.hp, def.move, def.min, def.max, def.atk);
    ui.ucInfo.textContent = u.side === on.room.me && u.acted ? t('unitDone') : t(ik);
  });
  onFrame(() => marks());
  // 화면 확인 도구(헤드리스 브라우저)가 칸의 화면 자리를 묻는 창구: 주소에 ?probe가 있을 때만
  if (new URLSearchParams(location.search).has('probe')) {
    (window as unknown as { stepstone: unknown }).stepstone = {
      duel: () => G.duel,
      room: () => myRoom(),
      sel: () => G.sel,
      ai: () => { const on = live(); return on ? aiStep(units(on.d), on.room.me as 0 | 1, undefined, on.room.round === 1 && on.room.me === 1) : null; },
      unitAt: (id: number) => G.duel?.units.find((u) => u[0] === id) ?? null,
      cell: (c: number, r: number) => { const d = G.duel; if (!d) return null; const at = cellPos(d.board, c, r); return view.project(at.x, TILE_TOP, at.z); },
    };
  }
}

// ---------- 칸 누르기 ----------

/**
 * 누른 곳: 땅의 칸(view.pick)과 몸통을 누른 말. 말은 칸보다 키가 커서 뒤 칸을 가리므로, 말의 발에서 머리까지의 화면 선분이
 * 누른 점에서 칸 반 너비 안이면 그 말을 누른 것으로도 본다
 */
function pressed(d: DuelView, sx: number, sy: number): { ground: Cell | null; body: Unit | null } {
  const g = view.pick(sx, sy), ground = g ? cellAt(d.board, g.x, g.z) : null;
  const a = cellPos(d.board, 0, 3), b = cellPos(d.board, 1, 3), pa = view.project(a.x, TILE_TOP, a.z), pb = view.project(b.x, TILE_TOP, b.z);
  const tilePx = pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : 40;
  let body: Unit | null = null, bestD = Math.max(12, tilePx * 0.42);
  for (const u of units(d)) {
    if (u.hp <= 0) continue;
    const at = cellPos(d.board, u.c, u.r), foot = view.project(at.x, TILE_TOP, at.z), head = view.project(at.x, TILE_TOP + 2.2, at.z);
    if (!foot || !head) continue;
    const dd = segDist(sx, sy, foot.x, foot.y, head.x, head.y);
    if (dd < bestD) { bestD = dd; body = u; }
  }
  return { ground, body };
}
/** 점과 선분 사이의 거리 (화면 px) */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, len = vx * vx + vy * vy, k = len ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0;
  return Math.hypot(px - (ax + vx * k), py - (ay + vy * k));
}

/**
 * 누르기 하나: 내 차례에 내 말을 골라 두었으면 (1) 칠 수 있는 적(몸통이나 그 칸) → 치기 (2) 갈 수 있는 빈 칸 → 걷기.
 * 그 밖에는 고르기: 몸통을 누른 말, 아니면 누른 칸의 말 (어느 편이든 카드를 본다. 칸 표시는 내 차례의 내 말만)
 */
function tap(sx: number, sy: number): void {
  const on = live();
  if (!on) return;
  const { d, room } = on;
  const { ground, body } = pressed(d, sx, sy), all = units(d);
  const onGround = ground ? all.find((u) => u.hp > 0 && u.c === ground.c && u.r === ground.r) : undefined;
  const sel = all.find((u) => u.id === G.sel);
  if (myRoomTurn() && sel && sel.side === room.me) {
    const foes = targets(all, sel);
    const foe = foes.find((x) => x.id === body?.id) ?? foes.find((x) => x.id === onGround?.id);
    if (foe) { act('hit', { u: sel.id, to: foe.id }); G.sel = 0; return; }
    if (ground && !onGround && reach(all, sel).has(`${ground.c},${ground.r}`)) { act('move', { u: sel.id, c: ground.c, r: ground.r }); return; }
  }
  G.sel = (body ?? onGround)?.id ?? 0;
}

// ---------- 칸 표시 ----------

/** 내 판 위에 칸 표시를 그린다: 고른 말(금빛), 걸을 수 있는 칸(파랑), 칠 수 있는 적(빨강), 아직 움직일 수 있는 내 말(엷은 금빛) */
function initMarks(): () => void {
  const group = new THREE.Group();
  view.scene.add(group);
  const geo = new THREE.PlaneGeometry(BOARD.tile * 0.9, BOARD.tile * 0.9).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(BOARD.tile * 0.36, BOARD.tile * 0.46, 24).rotateX(-Math.PI / 2);
  const make = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const M = { move: make(0x4aa8ff, 0.42), hit: make(0xff4a3a, 0.55), sel: make(0xffd24a, 0.9), ready: make(0xffe9a0, 0.5) };
  const pool: THREE.Mesh[] = [];
  let used = 0;
  const put = (b: number, c: number, r: number, m: THREE.MeshBasicMaterial, ring: boolean, y = TILE_TOP + 0.01) => {
    let mesh = pool[used];
    if (!mesh) { mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 2; pool.push(mesh); group.add(mesh); }
    mesh.geometry = ring ? ringGeo : geo; mesh.material = m; mesh.visible = true;
    const at = cellPos(b, c, r);
    mesh.position.set(at.x, y, at.z); mesh.rotation.y = Math.PI / 4;
    used++;
  };
  let lastPulse = 0;
  return () => {
    used = 0;
    // 체력 알은 늘 카메라 쪽을 본다 (쿼터뷰의 카메라는 +x +z 쪽에서, 돌렸으면 그만큼 돈 쪽에서 비춘다)
    for (const r of S.others.values()) {
      if (r.kind !== 'unit') continue;
      const p = pieceParts(r.model.root);
      if (p) p.pipBox.rotation.y = Math.PI / 4 + view.yaw - r.model.root.rotation.y;
    }
    const on = live();
    if (on && on.room.st === 'play') {
      const { d, room } = on, all = units(d), mine = myRoomTurn();
      const now = performance.now();
      if (now - lastPulse > 50) { lastPulse = now; M.ready.opacity = 0.35 + 0.25 * Math.sin(now / 260); M.hit.opacity = 0.45 + 0.2 * Math.sin(now / 180); }
      if (mine) for (const u of all) if (u.side === room.me && u.hp > 0 && u.id !== G.sel && (!u.acted && (targets(all, u).length || reach(all, u).size))) put(d.board, u.c, u.r, M.ready, true);
      const sel = all.find((u) => u.id === G.sel);
      if (sel) {
        put(d.board, sel.c, sel.r, M.sel, true, TILE_TOP + 0.02);
        if (mine && sel.side === room.me) {
          for (const k of reach(all, sel).keys()) { const [c, r] = k.split(',').map(Number); put(d.board, c, r, M.move, false); }
          for (const f of targets(all, sel)) put(d.board, f.c, f.r, M.hit, false, TILE_TOP + 0.015);
        }
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  };
}

// ---------- 카메라 ----------

/**
 * 판에 앉으면 판 전체(두 자리까지)가 드는 배율로 판의 가운데를 비춘다 (center: 폰 세로에서도 화면 한가운데). 대기실에서는 틀의 기본(나를 따라감).
 * 오른쪽 자리의 사람은 카메라를 반대편으로 돌린다(onRoomChange의 setCameraYaw): 누구나 자기 진영을 화면의 왼쪽에 본다
 */
function initCamera(): void {
  let cam: { x: number; z: number; zoom: number } | null = null, at = 0;
  // 판은 45° 돌아 있어 화면에서는 반듯한 네모다: fitZoom은 월드의 축에 맞춘 네모를 받으므로, 화면의 가로(u)·세로(v) 반 길이 가운데 긴 쪽이
  // 그 네모의 대각선 반이 되게 준다 (월드의 네모를 화면에서 보면 마름모: 꼭짓점이 화면의 가로·세로 끝에 온다)
  const hu = (BOARD.size / 2 + BOARD.seat + 0.4) * BOARD.tile, hv = (BOARD.size / 2 + 0.6) * BOARD.tile, half = Math.max(hu, hv) * Math.SQRT1_2, board = hv * Math.SQRT1_2;
  setCameraAim((me, now) => {
    const r = myRoom();
    if (!r || r.st === 'wait') { cam = null; return null; }
    const o = BOARDS[G.duel?.board ?? 0];
    // 세로 화면(폰)은 판만 들게 해서 칸을 크게 (두 사람의 자리는 화면 밖으로 나간다)
    const h = innerHeight > innerWidth ? board : half;
    const want = { x: o.x, z: o.z, zoom: Math.min(CAMERA.zoomMax, fitZoom(o.x - h, o.z - h, o.x + h, o.z + h, 0.02)) };
    const k = cam ? 1 - Math.exp(-Math.min(0.1, (now - at) / 1000) * 8) : 1;
    at = now;
    cam = cam ?? (me ? { x: me.x, z: me.z, zoom: S.zoom } : want);
    cam.x += (want.x - cam.x) * k; cam.z += (want.z - cam.z) * k; cam.zoom += (want.zoom - cam.zoom) * k;
    return { ...cam, center: true };
  });
}

// ---------- 치는 연출 ----------

/**
 * 친 것의 연출 (서버의 g.effect(친 말, 'hit', 맞은 말, 피해, 쓰러뜨림) → onEffect): 투석돌은 돌이 날아가고, 붙어 치는 말은 앞으로 내딛는다.
 * 맞은 말이 흔들리고 피해 숫자가 떠오른다. 쓰러지면 가라앉는다
 */
function initFx(layer: HTMLElement): void {
  const stones: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t0: number }[] = [];
  const nums: { el: HTMLElement; x: number; z: number; t0: number }[] = [];
  const shakes = new Map<number, number>(), lunges = new Map<number, { t0: number; dir: THREE.Vector3 }>(), sinks = new Map<number, number>();
  const stoneGeo = new THREE.IcosahedronGeometry(0.2, 0), stoneMat = new THREE.MeshBasicMaterial({ color: 0xe8e0c8 });
  onFrame(() => {
    const now = performance.now();
    for (let i = stones.length - 1; i >= 0; i--) {
      const s = stones[i], k = (now - s.t0) / 380;
      if (k >= 1) { view.scene.remove(s.mesh); stones.splice(i, 1); continue; }
      s.mesh.position.lerpVectors(s.from, s.to, k); s.mesh.position.y += Math.sin(k * Math.PI) * 1.6;
    }
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i], k = (now - n.t0) / 1100;
      if (k >= 1) { n.el.remove(); nums.splice(i, 1); continue; }
      const p = view.project(n.x, 2.6 + k * 1.2, n.z);
      if (p) { n.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; n.el.style.opacity = String(1 - k * k); }
    }
    for (const r of S.others.values()) {
      if (r.kind !== 'unit') continue;
      const p = pieceParts(r.model.root);
      if (!p) continue;
      p.body.position.set(0, 0, 0); p.body.rotation.z = 0;
      const sh = shakes.get(r.id);
      if (sh !== undefined) { const k = (now - sh) / 400; if (k >= 1) shakes.delete(r.id); else p.body.rotation.z = Math.sin(k * 30) * 0.18 * (1 - k); }
      const lu = lunges.get(r.id);
      if (lu) {
        const k = (now - lu.t0) / 300;
        if (k >= 1) lunges.delete(r.id);
        else { const f = Math.sin(k * Math.PI) * 0.7; p.body.position.set(lu.dir.x * f, 0, lu.dir.z * f); }
      }
      const sk = sinks.get(r.id);
      if (sk !== undefined) { const k = Math.min(1, (now - sk) / TURN.removeMs); p.body.position.y = -k * 1.4; p.body.rotation.z = k * 0.6; p.pipBox.visible = k < 0.2; }
    }
  });
  onEffect('hit', (a, [tId, dmg, killed]) => {
    const ra = S.others.get(a), rt = S.others.get(tId), d = G.duel, room = myRoom();
    if (!ra || !rt) return;
    const now = performance.now(), from = { x: ra.x, z: ra.z }, to = { x: rt.x, z: rt.z };
    const ranged = UNITS[(UNIT_TYPES as readonly string[]).includes(ra.type) ? (ra.type as UnitType) : 'runner'].min >= 2;
    const hitDelay = ranged ? 380 : 150;
    const hurt = !!room && d?.units.find((u) => u[0] === tId)?.[2] === room.me;
    if (ranged) {
      const mesh = new THREE.Mesh(stoneGeo, stoneMat);
      view.scene.add(mesh);
      stones.push({ mesh, from: new THREE.Vector3(from.x, TILE_TOP + 1.8, from.z), to: new THREE.Vector3(to.x, TILE_TOP + 1.0, to.z), t0: now });
    } else {
      // 내딛는 쪽: 모델의 안쪽 묶음은 root의 방향으로 돌아 있으므로 root의 회전을 빼서 준다
      const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -ra.model.root.rotation.y);
      lunges.set(a, { t0: now, dir });
    }
    setTimeout(() => {
      shakes.set(tId, performance.now());
      const el = document.createElement('div');
      el.className = `dmg${hurt ? ' hurt' : ''}`; el.textContent = `-${dmg}`;
      layer.appendChild(el);
      nums.push({ el, x: to.x, z: to.z, t0: performance.now() });
      if (killed) sinks.set(tId, performance.now());
      if (hurt) sfx.hurt(); else sfx.hit(killed === 1);
      if (killed && !hurt) sfx.kill();
    }, hitDelay);
  });
}
