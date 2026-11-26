// 대국의 화면: 대기실 창(빠른 대국·판 만들기·컴퓨터와 두기·기다리는 판), 판 위의 막대(두 사람, 차례, 남은 시간, 차례 수),
// 고른 말의 카드, 결과 창(다시 하기·대기실로), 칸 누르기(마우스·터치), 칸 표시, 치는 연출, 판을 비추는 카메라. 서버의 server/duels.ts와 짝이다.
import * as THREE from 'three';
import { $, addNotices, addMsgSounds, fitZoom, mountPanel, onFrame, onKey, onMsg, onSlow, rules, S, send, setCameraAim, sfx, view } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import { CAMERA } from '../shared/content';
import { BOARD, BOARDS, SIDE_COLOR, TURN, UNITS, UNIT_TYPES, type UnitType } from '../shared/content/board';
import { aiStep, cellAt, cellPos, reach, targets, type Cell, type Unit } from '../shared/rules';
import type { DuelAct, DuelView, MeState, TableRow } from '../shared/stepstone';
import { initPieces, pieceParts, TILE_TOP } from './pieces';
import './stepstone.css';

/** 이 게임의 화면 상태: 서버가 알려 준 내 판(개인 상태 duel), 전적, 대기실의 판 목록(공유 상태 tables), 고른 말 */
export const G: { duel: DuelView | null; rec: MeState['rec']; tables: TableRow[]; sel: number } = { duel: null, rec: [0, 0, 0], tables: [], sel: 0 };

const act = (a: DuelAct, more: { id?: number; u?: number; to?: number; c?: number; r?: number } = {}) => send({ t: 'duel', a, ...more });
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const UNIT_KEY: Record<UnitType, ['unitShield' | 'unitSling' | 'unitRunner', 'infoShield' | 'infoSling' | 'infoRunner']> = {
  shield: ['unitShield', 'infoShield'], sling: ['unitSling', 'infoSling'], runner: ['unitRunner', 'infoRunner'],
};

/** 개인 상태의 말 줄 → 규칙이 읽는 말 */
function units(d: DuelView): Unit[] {
  return d.units.map(([id, ty, side, c, r, hp, fl]) => ({ id, type: UNIT_TYPES[ty] ?? 'runner', side: side ? 1 : 0, c, r, hp, moved: (fl & 1) !== 0, acted: (fl & 2) !== 0 }));
}
const myTurn = (d: DuelView | null): boolean => !!d && d.st === 'play' && d.turn === d.me;
const sideName = (d: DuelView, side: 0 | 1): string => (d.cpu[side] ? t('cpuName') : d.names[side]) || '?';

/** 창을 틀의 빈 자리에 붙인다 (startClient보다 먼저) */
export function mountDuel(): void {
  // 오른쪽 위: 대기실 창 (판에 앉지 않았거나 상대를 기다리는 동안)
  mountPanel('rightTop', `
    <div class="panel" id="lobby">
      <div class="row"><span class="ttitle" data-i18n="lobbyTitle"></span><span class="num" id="recText"></span></div>
      <div class="note" data-i18n="lobbyInfo"></div>
      <div id="lobbyIdle">
        <div class="btns"><button type="button" id="quickBtn" class="go" data-i18n="quick"></button><button type="button" id="cpuBtn" data-i18n="cpu"></button></div>
        <div class="btns"><button type="button" class="plain" id="hostBtn" data-i18n="host"></button></div>
        <div class="note sub" data-i18n="openTables"></div>
        <div id="tableList"></div>
        <div class="note" id="playingText"></div>
      </div>
      <div id="lobbyWait" hidden>
        <div class="note wait" data-i18n="waiting"></div>
        <div class="btns"><button type="button" id="waitCpuBtn" data-i18n="cpu"></button><button type="button" class="plain" id="cancelBtn" data-i18n="cancel"></button></div>
      </div>
    </div>`);
  // 가운데 위: 판의 막대 (두 사람, 차례, 남은 시간, 차례 수, 차례 넘기기, 기권)
  mountPanel('topmid', `
    <div class="panel" id="duelBar" hidden>
      <div class="row names"><span id="nameA" class="who"></span><span class="num" id="roundText"></span><span id="nameB" class="who"></span></div>
      <div class="row"><span id="turnText" class="turn"></span><span class="num clock" id="clockText"></span></div>
      <div class="bar time"><i id="clockBar"></i></div>
      <div class="btns"><button type="button" id="endBtn" class="go" data-i18n="endTurn"></button><button type="button" class="plain" id="resignBtn" data-i18n="resign"></button></div>
      <div class="note" id="duelHelp"></div>
    </div>`);
  // 화면 위: 고른 말의 카드, 결과 창, 내 차례의 큰 글, 피해 숫자
  mountPanel('hud', `
    <div class="panel" id="unitCard" hidden><div class="row"><span class="ttitle" id="ucName"></span></div><div class="note" id="ucStat"></div><div class="note" id="ucInfo"></div></div>
    <div class="panel" id="duelEnd" hidden>
      <div class="big" id="endTitle"></div>
      <div class="note" id="endWhy"></div>
      <div class="note" id="endNote"></div>
      <div class="btns"><button type="button" id="againBtn" class="go" data-i18n="again"></button><button type="button" class="plain" id="lobbyBtn" data-i18n="toLobby"></button></div>
    </div>
    <div id="turnFlash" hidden></div>
    <div id="dmgLayer"></div>`);
}

export function initDuel(): void {
  initPieces();
  const ui = {
    lobby: $('lobby'), idle: $('lobbyIdle'), wait: $('lobbyWait'), rec: $('recText'), list: $('tableList'), playing: $('playingText'),
    bar: $('duelBar'), nameA: $('nameA'), nameB: $('nameB'), round: $('roundText'), turn: $('turnText'), clock: $('clockText'), clockBar: $('clockBar'),
    end: $<HTMLButtonElement>('endBtn'), resign: $<HTMLButtonElement>('resignBtn'), help: $('duelHelp'),
    card: $('unitCard'), ucName: $('ucName'), ucStat: $('ucStat'), ucInfo: $('ucInfo'),
    over: $('duelEnd'), endTitle: $('endTitle'), endWhy: $('endWhy'), endNote: $('endNote'), again: $<HTMLButtonElement>('againBtn'),
    flash: $('turnFlash'), dmg: $('dmgLayer'),
  };

  // 서버가 알려 주는 것: 개인 상태(내 판, 전적), 공유 상태(대기실의 판 목록)
  onMsg('me', (m) => {
    if (m.k === 'duel') { const before = G.duel; G.duel = m.s as MeState['duel']; changed(before, G.duel); }
    else if (m.k === 'rec') G.rec = m.s as MeState['rec'];
  });
  onMsg('world', (m) => { G.tables = m.s.tables ?? []; });
  addNotices({
    // 결과는 가운데의 결과 창이, 내 차례는 큰 글이 보인다 (안내문은 대화창에 남는다)
    banner: { duelStart: 'good', duelFoeLeft: 'bad', duelFoeBack: '', duelBack: '' },
    feed: ['duelWait', 'duelNoBoard', 'duelBusy', 'duelGone', 'duelNotTurn', 'duelBad', 'duelTimeout', 'duelAgainWait', 'duelFoeGone'],
  });
  addMsgSounds({ duelStart: sfx.fanfare, duelTimeout: sfx.bad, duelFoeLeft: sfx.bad, duelResult: sfx.fanfare });

  // 판에 앉은 동안은 걷지 않는다: 서버의 g.rules.speed와 같은 답 (개인 상태 duel이 있으면 서버도 앉은 것으로 친다)
  const walk = rules.speed;
  rules.speed = () => (G.duel ? 0 : walk());

  // 단추
  $('quickBtn').addEventListener('click', () => act('quick'));
  $('cpuBtn').addEventListener('click', () => act('cpu'));
  $('hostBtn').addEventListener('click', () => act('host'));
  $('waitCpuBtn').addEventListener('click', () => act('cpu'));
  $('cancelBtn').addEventListener('click', () => act('lobby'));
  ui.end.addEventListener('click', () => { G.sel = 0; act('end'); });
  ui.resign.addEventListener('click', () => act('resign'));
  ui.again.addEventListener('click', () => act('again'));
  $('lobbyBtn').addEventListener('click', () => act('lobby'));
  ui.list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-id]');
    if (b) act('join', { id: Number(b.getAttribute('data-id')) });
  });
  // Space: 차례 넘기기 (전투 모듈을 고르지 않아 틀이 쓰지 않는 키)
  onKey(' ', () => { if (myTurn(G.duel)) { G.sel = 0; act('end'); } });

  initInput();
  const marks = initMarks();
  initCamera();
  const fx = initFx(ui.dmg);

  /** 판의 상태가 바뀌었다: 내 차례가 되면 큰 글, 고른 말이 없어졌으면 풀기, 친 것의 연출 */
  function changed(before: DuelView | null, d: DuelView | null): void {
    document.body.classList.toggle('in-duel', !!d);
    if (!d) { G.sel = 0; return; }
    if (d.st === 'play' && d.turn === d.me && (!before || before.turn !== d.turn || before.st !== 'play' || before.id !== d.id)) { flash(t('myTurn')); sfx.skill(); }
    if (d.st !== 'play' || d.turn !== d.me) G.sel = 0;
    if (G.sel && !units(d).some((u) => u.id === G.sel && u.side === d.me && u.hp > 0)) G.sel = 0;
    if (before && before.id === d.id && d.fx[0] !== before.fx[0] && d.fx[0] > 0) fx(d);
  }
  let flashUntil = 0;
  function flash(text: string): void {
    ui.flash.textContent = text; ui.flash.hidden = false; flashUntil = performance.now() + 1300;
  }

  // 느린 주기(0.25초)마다 글자와 단추를 맞춘다
  onSlow(() => {
    const loc = L(), d = G.duel;
    if (!ui.flash.hidden && performance.now() > flashUntil) ui.flash.hidden = true;
    ui.rec.textContent = loc.fmt.rec(...G.rec);
    // 대기실 창
    ui.lobby.hidden = !!d && d.st !== 'wait';
    ui.idle.hidden = !!d; ui.wait.hidden = !(d && d.st === 'wait');
    if (!d) {
      const open = G.tables.filter((r) => r[3] === 0);
      ui.list.innerHTML = open.length
        ? open.map((r) => `<div class="mrow"><span>${esc(loc.fmt.left(r[1]))}</span><button type="button" data-id="${r[0]}">${esc(t('join'))}</button></div>`).join('')
        : `<div class="note">${esc(t('noTables'))}</div>`;
      ui.playing.textContent = loc.fmt.playing(G.tables.filter((r) => r[3] === 1).length);
    }
    // 판의 막대
    const playing = !!d && d.st !== 'wait';
    ui.bar.hidden = !playing;
    ui.over.hidden = !(d && d.st === 'over');
    if (!d || !playing) { ui.card.hidden = true; return; }
    for (const side of [0, 1] as const) {
      const el = side ? ui.nameB : ui.nameA;
      el.textContent = sideName(d, side) + (d.away[side] ? ` (${t('away')})` : '');
      el.style.color = css(SIDE_COLOR[side]);
      el.classList.toggle('now', d.st === 'play' && d.turn === side);
      el.classList.toggle('mine', d.me === side);
    }
    ui.round.textContent = loc.fmt.round(d.round, TURN.rounds);
    const mine = myTurn(d);
    ui.turn.textContent = d.st !== 'play' ? '' : mine ? t('myTurn') : d.cpu[d.turn] ? t('cpuThinking') : t('foeTurn');
    ui.turn.style.color = d.st === 'play' ? css(SIDE_COLOR[d.turn]) : '';
    ui.clock.textContent = d.st === 'play' ? loc.fmt.clock(d.left) : '';
    ui.clockBar.style.transform = `scaleX(${d.st === 'play' ? Math.max(0, Math.min(1, d.left / TURN.turnS)) : 0})`;
    ui.clockBar.parentElement!.classList.toggle('low', d.st === 'play' && d.left <= 8);
    ui.end.disabled = !mine; ui.resign.disabled = d.st !== 'play';
    ui.end.hidden = ui.resign.hidden = d.st !== 'play';
    ui.help.textContent = d.st !== 'play' ? '' : mine ? t('pickUnit') : t('waitFoe');
    // 고른 말의 카드
    const u = units(d).find((x) => x.id === G.sel);
    ui.card.hidden = !u;
    if (u) {
      const def = UNITS[u.type], [nk, ik] = UNIT_KEY[u.type];
      ui.ucName.textContent = t(nk); ui.ucName.style.color = css(SIDE_COLOR[u.side]);
      ui.ucStat.textContent = loc.fmt.unitStat(u.hp, def.hp, def.move, def.min, def.max, def.atk);
      ui.ucInfo.textContent = u.side === d.me && u.acted ? t('unitDone') : t(ik);
    }
    // 결과 창
    if (d.st === 'over') {
      const res = d.win === 2 ? 2 : d.win === d.me ? 0 : 1;
      ui.endTitle.textContent = t(res === 0 ? 'win' : res === 1 ? 'lose' : 'draw');
      ui.endTitle.className = `big r${res}`;
      ui.endWhy.textContent = loc.fmt.why(d.why);
      const foe = d.me === 0 ? 1 : 0, gone = !d.cpu[foe] && d.away[foe] === 1;
      ui.again.disabled = gone || d.again[d.me] === 1;
      ui.endNote.textContent = gone ? t('foeGone') : d.again[d.me] ? t('againWait') : '';
    }
  });
  onFrame(() => marks());
  // 화면 확인 도구(헤드리스 브라우저)가 칸의 화면 자리를 묻는 창구: 주소에 ?probe가 있을 때만
  if (new URLSearchParams(location.search).has('probe')) {
    (window as unknown as { stepstone: unknown }).stepstone = {
      duel: () => G.duel,
      sel: () => G.sel,
      ai: () => (G.duel ? aiStep(units(G.duel), G.duel.me) : null),
      unitAt: (id: number) => G.duel?.units.find((u) => u[0] === id) ?? null,
      cell: (c: number, r: number) => { const d = G.duel; if (!d) return null; const at = cellPos(d.board, c, r); return view.project(at.x, TILE_TOP, at.z); },
    };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- 칸 누르기 ----------

/**
 * 판에 앉은 동안 3D 화면(canvas)의 누르기는 이 게임이 받는다: 창(window)의 잡기 단계에서 멈춰 틀의 '땅 누르면 걷기'에 닿지 않게 한다.
 * 마우스는 누를 때, 터치는 손가락을 뗄 때(조금만 움직였으면) 칸을 고른다. 휠의 확대는 그대로 틀의 것이다
 */
function initInput(): void {
  const canvas = $('view');
  let touch: { id: number; x: number; y: number } | null = null;
  const mine = (ev: PointerEvent) => !!G.duel && ev.target === canvas;
  window.addEventListener('pointerdown', (ev) => {
    if (!mine(ev)) return;
    ev.stopPropagation();
    if (ev.pointerType === 'touch') { touch = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; return; }
    if (ev.button === 0) tap(ev.clientX, ev.clientY);
  }, true);
  window.addEventListener('pointerup', (ev) => {
    if (!mine(ev)) return;
    ev.stopPropagation();
    if (touch && touch.id === ev.pointerId && Math.hypot(ev.clientX - touch.x, ev.clientY - touch.y) < 14) tap(ev.clientX, ev.clientY);
    touch = null;
  }, true);
  for (const type of ['pointermove', 'pointercancel'] as const) window.addEventListener(type, (ev) => { if (mine(ev) && ev.pointerType === 'touch') ev.stopPropagation(); }, true);
}

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
  const d = G.duel;
  if (!d || d.st === 'wait') return;
  const { ground, body } = pressed(d, sx, sy), all = units(d);
  const onGround = ground ? all.find((u) => u.hp > 0 && u.c === ground.c && u.r === ground.r) : undefined;
  const sel = all.find((u) => u.id === G.sel);
  if (myTurn(d) && sel && sel.side === d.me) {
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
    const d = G.duel;
    // 체력 알은 늘 카메라 쪽을 본다 (쿼터뷰의 카메라는 +x +z 쪽에서 비춘다)
    for (const r of S.others.values()) {
      if (r.kind !== 'unit') continue;
      const p = pieceParts(r.model.root);
      if (p) p.pipBox.rotation.y = Math.PI / 4 - r.model.root.rotation.y;
    }
    if (d && d.st === 'play') {
      const all = units(d), mine = myTurn(d);
      const now = performance.now();
      if (now - lastPulse > 50) { lastPulse = now; M.ready.opacity = 0.35 + 0.25 * Math.sin(now / 260); M.hit.opacity = 0.45 + 0.2 * Math.sin(now / 180); }
      if (mine) for (const u of all) if (u.side === d.me && u.hp > 0 && u.id !== G.sel && (!u.acted && (targets(all, u).length || reach(all, u).size))) put(d.board, u.c, u.r, M.ready, true);
      const sel = all.find((u) => u.id === G.sel);
      if (sel) {
        put(d.board, sel.c, sel.r, M.sel, true, TILE_TOP + 0.02);
        if (mine && sel.side === d.me) {
          for (const k of reach(all, sel).keys()) { const [c, r] = k.split(',').map(Number); put(d.board, c, r, M.move, false); }
          for (const f of targets(all, sel)) put(d.board, f.c, f.r, M.hit, false, TILE_TOP + 0.015);
        }
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  };
}

// ---------- 카메라 ----------

/** 판에 앉으면 판 전체(두 자리까지)가 드는 배율로 판의 가운데를 비춘다. 대기실에서는 틀의 기본(나를 따라감) */
function initCamera(): void {
  let cam: { x: number; z: number; zoom: number } | null = null, at = 0;
  // 판은 45° 돌아 있어 화면에서는 반듯한 네모다: fitZoom은 월드의 축에 맞춘 네모를 받으므로, 화면의 가로(u)·세로(v) 반 길이 가운데 긴 쪽이
  // 그 네모의 대각선 반이 되게 준다 (월드의 네모를 화면에서 보면 마름모: 꼭짓점이 화면의 가로·세로 끝에 온다)
  const hu = (BOARD.size / 2 + BOARD.seat + 0.4) * BOARD.tile, hv = (BOARD.size / 2 + 0.6) * BOARD.tile, half = Math.max(hu, hv) * Math.SQRT1_2, board = hv * Math.SQRT1_2;
  setCameraAim((me, now) => {
    const d = G.duel;
    if (!d) { cam = null; return null; }
    const o = BOARDS[d.board];
    // 세로 화면(폰)은 판만 들게 해서 칸을 크게 (두 사람의 자리는 화면 밖으로 나간다)
    const h = innerHeight > innerWidth ? board : half;
    const want = { x: o.x, z: o.z, zoom: Math.min(CAMERA.zoomMax, fitZoom(o.x - h, o.z - h, o.x + h, o.z + h, 0.02)) };
    // 폰 세로에서 틀은 그리는 범위를 화면 너비의 12%만큼 밀어 둔다(조이스틱 자리): 비추는 곳이 가운데보다 왼쪽에 그려지므로 그만큼 판의 왼쪽(-u)을 비춘다
    const push = innerHeight > innerWidth * 1.3 && innerWidth < 600 ? innerWidth * 0.12 : 0;
    if (push) {
      const p = view.project(o.x, 0, o.z), q = view.project(o.x + Math.SQRT1_2, 0, o.z - Math.SQRT1_2);
      if (p && q) { const m = push / Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)); want.x -= Math.SQRT1_2 * m; want.z += Math.SQRT1_2 * m; }
    }
    const k = cam ? 1 - Math.exp(-Math.min(0.1, (now - at) / 1000) * 8) : 1;
    at = now;
    cam = cam ?? (me ? { x: me.x, z: me.z, zoom: S.zoom } : want);
    cam.x += (want.x - cam.x) * k; cam.z += (want.z - cam.z) * k; cam.zoom += (want.zoom - cam.zoom) * k;
    return cam;
  });
}

// ---------- 치는 연출 ----------

/** 친 것의 연출: 투석돌은 돌이 날아가고, 붙어 치는 말은 앞으로 내딛는다. 맞은 말이 흔들리고 피해 숫자가 떠오른다. 쓰러지면 가라앉는다 */
function initFx(layer: HTMLElement): (d: DuelView) => void {
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
  return (d) => {
    const [, a, tId, dmg, killed] = d.fx;
    const ua = d.units.find((u) => u[0] === a), ut = d.units.find((u) => u[0] === tId);
    if (!ua || !ut) return;
    const from = cellPos(d.board, ua[3], ua[4]), to = cellPos(d.board, ut[3], ut[4]), now = performance.now();
    const ranged = UNITS[UNIT_TYPES[ua[1]] ?? 'runner'].min >= 2;
    const hitDelay = ranged ? 380 : 150;
    if (ranged) {
      const mesh = new THREE.Mesh(stoneGeo, stoneMat);
      view.scene.add(mesh);
      stones.push({ mesh, from: new THREE.Vector3(from.x, TILE_TOP + 1.8, from.z), to: new THREE.Vector3(to.x, TILE_TOP + 1.0, to.z), t0: now });
    } else {
      // 내딛는 쪽: 모델의 안쪽 묶음은 root의 방향으로 돌아 있으므로 root의 회전을 빼서 준다
      const r = S.others.get(a), dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
      if (r) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -r.model.root.rotation.y);
      lunges.set(a, { t0: now, dir });
    }
    setTimeout(() => {
      shakes.set(tId, performance.now());
      const el = document.createElement('div');
      el.className = `dmg${ut[2] === d.me ? ' hurt' : ''}`; el.textContent = `-${dmg}`;
      layer.appendChild(el);
      nums.push({ el, x: to.x, z: to.z, t0: performance.now() });
      if (killed) sinks.set(tId, performance.now());
      if (ut[2] === d.me) sfx.hurt(); else sfx.hit(killed === 1);
      if (killed && ut[2] !== d.me) sfx.kill();
    }, hitDelay);
  };
}
