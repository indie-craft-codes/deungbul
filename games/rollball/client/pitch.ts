// 굴림공의 화면: 점수판, 팀 고르기, 차기 단추와 F 키, 공의 모습, 팀 색 고리. 서버의 server/pitch.ts와 짝이다.
import * as THREE from 'three';
import { $, addMarks, addNotices, makeBall, mat, mountPanel, onFrame, onKey, onMsg, onSlow, registerKind, rules, S, send, view } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import { PITCH, TEAM_COLOR } from '../shared/content/pitch';
import type { MeState, PitchState } from '../shared/rollball';
import './rollball.css';

/** 이 게임의 화면 상태: 서버가 알려 준 경기(공유 상태)와 내 팀·내 골(개인 상태) */
export const G: { pitch: PitchState; side: number; goals: number } = {
  pitch: { a: 0, b: 0, left: PITCH.roundS, phase: 'play', round: 1, teams: {} },
  side: -1, goals: 0,
};
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** 창을 틀의 빈 자리에 붙인다 (startClient보다 먼저) */
export function mountPitch(): void {
  // 가운데 위: 점수판
  mountPanel('topmid', `
    <div class="panel" id="score">
      <span class="team a"><b data-i18n="teamA"></b> <small id="cntA"></small></span>
      <span class="num big" id="scoreA">0</span><span class="sep">:</span><span class="num big" id="scoreB">0</span>
      <span class="team b"><b data-i18n="teamB"></b> <small id="cntB"></small></span>
      <span class="clock"><span class="num" id="clock"></span><small id="round"></small></span>
      <div class="note" id="phase"></div>
    </div>`);
  // 화면 가운데: 팀 고르기 (팀이 없을 때만)
  mountPanel('hud', `
    <div class="panel" id="teamPick" hidden>
      <div class="ttitle" data-i18n="pickTitle"></div>
      <p class="note" data-i18n="pickInfo"></p>
      <div class="btns">
        <button type="button" id="pickA" class="teamBtn a" data-i18n="teamA"></button>
        <button type="button" id="pickB" class="teamBtn b" data-i18n="teamB"></button>
      </div>
    </div>
    <div id="ballArrow" hidden data-i18n-aria="ballArrow">➤</div>`);
  // 단추 줄: 차기 (폰에서 누른다), 팀 바꾸기
  mountPanel('actions', `<button type="button" id="kickBtn" class="kick" data-i18n="kick"></button>`);
  mountPanel('meRows', `<div class="row"><span class="note" id="myTeam"></span><button type="button" class="plain" id="switchBtn" data-i18n="switchTeam"></button></div>`);
}

const kick = () => send({ t: 'kick' });
const pick = (side: number) => send({ t: 'team', side });

export function initPitch(): void {
  const ui = {
    a: $('scoreA'), b: $('scoreB'), cntA: $('cntA'), cntB: $('cntB'), clock: $('clock'), round: $('round'), phase: $('phase'),
    pick: $('teamPick'), myTeam: $('myTeam'), sw: $('switchBtn'),
  };
  onMsg('world', (m) => { G.pitch = m.s.pitch; });
  onMsg('me', (m) => {
    if (m.k === 'side') G.side = m.s as MeState['side'];
    if (m.k === 'goals') G.goals = m.s as MeState['goals'];
  });
  addNotices({ banner: { goal: 'good', roundOver: 'good', roundStart: '' }, feed: ['teamFull', 'teamJoined'] });
  // H(집으로): 우리 진영의 가운데
  rules.home = () => ({ x: G.side === 1 ? PITCH.halfW / 2 : -PITCH.halfW / 2, z: 0 });

  $('pickA').addEventListener('click', () => pick(0));
  $('pickB').addEventListener('click', () => pick(1));
  $('kickBtn').addEventListener('click', kick);
  ui.sw.addEventListener('click', () => pick(G.side === 0 ? 1 : 0));
  // 게임의 키: F로 찬다 (전투 모듈을 고르지 않아 숫자·F 키가 비어 있다)
  onKey('f', kick);

  // 공: 흰 공, 골 뒤 멈춤이면 금빛으로 반짝
  registerKind('ball', {
    model: () => makeBall(0xf4f4ee, PITCH.ballR),
    update: (m, [glow]) => {
      m.root.traverse((o) => { if (o instanceof THREE.Mesh) o.material = mat(glow ? 0xffd24a : 0xf4f4ee); });
    },
    dot: '#ffffff',
  });
  // 미니맵: 골문 둘
  addMarks(() => [
    { x: PITCH.halfW, z: 0, color: css(TEAM_COLOR[1]), shape: 'square' },
    { x: -PITCH.halfW, z: 0, color: css(TEAM_COLOR[0]), shape: 'square' },
  ]);

  // 사람 발밑의 팀 색 고리: 틀이 사람의 옷 색을 정하므로 고리로 팀을 보인다
  const rings = [0, 1].map((s) => new THREE.MeshBasicMaterial({ color: TEAM_COLOR[s], transparent: true, opacity: 0.85 }));
  const ringGeo = new THREE.RingGeometry(0.55, 0.78, 20).rotateX(-Math.PI / 2);
  const mark = (root: THREE.Object3D, side: number | undefined) => {
    let ring = root.getObjectByName('teamRing') as THREE.Mesh | undefined;
    if (side === undefined) { if (ring) ring.visible = false; return; }
    if (!ring) { ring = new THREE.Mesh(ringGeo, rings[0]); ring.name = 'teamRing'; ring.position.y = 0.04; root.add(ring); }
    ring.visible = true; ring.material = rings[side];
  };
  onFrame(() => {
    const teams = G.pitch.teams;
    if (S.me) mark(S.me.model.root, teams[S.me.id]);
    for (const r of S.others.values()) if (r.kind === 'p') mark(r.model.root, teams[r.id]);
  });

  // 카메라는 틀이 나를 따라 비추고, 거리는 휠·핀치의 범위(최대 1.15)로 정해져 있다: 처음부터 가장 멀리 두고,
  // 공이 화면 밖이면 화면 가장자리에 공 쪽을 가리키는 화살표를 띄운다
  S.zoom = 1.15;
  const arrow = $('ballArrow'), v = new THREE.Vector3();
  onFrame(() => {
    let ball: { x: number; z: number } | undefined;
    for (const r of S.others.values()) if (r.kind === 'ball') { ball = r; break; }
    if (!ball || !S.me) { arrow.hidden = true; return; }
    v.set(ball.x, 0.5, ball.z).project(view.camera);
    const inside = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
    arrow.hidden = inside;
    if (inside) return;
    const dx = v.z < 1 ? v.x : -v.x, dy = v.z < 1 ? v.y : -v.y, k = 0.86 / Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
    const sx = (dx * k * 0.5 + 0.5) * innerWidth, sy = (-dy * k * 0.5 + 0.5) * innerHeight;
    arrow.style.transform = `translate(${sx - 16}px, ${sy - 16}px) rotate(${Math.atan2(-dy, dx)}rad)`;
  });

  onSlow(() => {
    const p = G.pitch, loc = L();
    ui.a.textContent = String(p.a); ui.b.textContent = String(p.b);
    let na = 0, nb = 0;
    for (const s of Object.values(p.teams)) if (s === 0) na++; else nb++;
    ui.cntA.textContent = loc.fmt.teamCount(na); ui.cntB.textContent = loc.fmt.teamCount(nb);
    ui.clock.textContent = loc.fmt.clock(p.left);
    ui.round.textContent = loc.fmt.round(p.round);
    ui.phase.textContent = p.phase === 'goal' ? t('phaseGoal') : p.phase === 'over' ? t('phaseOver') : '';
    ui.phase.hidden = p.phase === 'play';
    ui.pick.hidden = !S.me || G.side >= 0;
    ui.myTeam.textContent = G.side >= 0 ? loc.fmt.myTeam(G.side, G.goals) : '';
    ui.sw.hidden = G.side < 0;
  });
}
