// 팀(teams 모듈)의 화면: 가운데 위 점수판, 팀 고르기 창, 내 정보 창의 '내 팀' 줄과 팀 바꾸기, 팀 색 옷과 발밑 고리. 서버의 짝은 engine/server/game/systems/teams.ts.
// 그리는 셈(점수판의 줄, 고르기 단추의 상태, 사람의 팀)은 hud/teamboard.ts. 팀의 이름은 게임이 언어 파일의 ui에 TEAMS의 name 키로 적는다.
// 게임이 더 할 수 있는 것: 점수판에 자기 글(시계, 판의 번호, 단계)을 더하기(setTeamBoardExtra), 팀 색 옷 위에 표식 더하기(onTeamLook), 내 팀 읽기(myTeam, teamBoard).
import * as THREE from 'three';
import { TEAM_RULES, TEAMS, teamCss, type TeamBoard, type TeamMe } from '../../shared/defs';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { setPlayerLook, type PlayerInfo } from '../entities';
import { L, onLangChange, t } from '../i18n';
import { teamName } from '../i18n/ko';
import { send } from '../net';
import type { Model } from '../scene/models';
import { S } from '../state';
import { addNotices } from './notify';
import { mountPanel } from './shell';
import { boardLayout, boardRows, pickButtons, switchAction, teamOfVals } from './teamboard';

/** 팀이 없는 사람의 옷 색 */
const NO_TEAM = 0x9a9a92;

/** 지금의 점수판(서버의 공유 상태)과 내 팀(개인 상태) */
let board: TeamBoard | undefined;
let me: TeamMe = { i: -1, score: 0 };
/** 팀 바꾸기로 고르기 창을 열었다 (팀이 셋 이상일 때) */
let picking = false;
/** 점수판에 게임이 더하는 글: 옆(side, 시계·판의 번호)과 아래 줄(note, 골·경기 끝 같은 단계) */
let extra: (() => { side?: string; note?: string }) | null = null;
/** 팀 색 옷 위에 게임이 더하는 것 */
let decorate: ((model: Model, p: PlayerInfo, team: number) => void) | null = null;

/** 내 팀 번호 (없으면 -1) */
export const myTeam = (): number => me.i;
/** 내 점수 */
export const myTeamScore = (): number => me.score;
/** 지금의 점수판 (아직 받지 않았으면 undefined) */
export const teamBoard = (): TeamBoard | undefined => board;
/** 점수판에 게임의 글을 더한다: side는 점수 옆(시계, 판의 번호), note는 아래 줄(비우면 숨는다). 느린 주기마다 불린다 */
export function setTeamBoardExtra(fn: (() => { side?: string; note?: string }) | null): void { extra = fn; }
/** 팀 색 옷과 고리 위에 게임이 표식을 더한다 (사람의 팀이 처음 오거나 바뀔 때, 모델을 새로 만들 때). team은 -1이면 팀이 없다 */
export function onTeamLook(fn: ((model: Model, p: PlayerInfo, team: number) => void) | null): void { decorate = fn; }

const pick = (i: number) => send({ t: 'team', team: i });

export function initTeams(): void {
  const n = TEAMS.length, versus = boardLayout(n) === 'versus';
  // 가운데 위: 점수판. 둘이면 '이름 점수 : 점수 이름', 셋 이상이면 팀마다 '이름 점수'
  const cell = (i: number) => `<span class="tm" style="--tc:${teamCss(TEAMS[i].color)}"><b id="tmName${i}"></b> <small id="tmCount${i}"></small></span>`;
  const score = (i: number) => `<span class="num big" id="tmScore${i}">0</span>`;
  const body = versus ? `${cell(0)}${score(0)}<span class="sep">:</span>${score(1)}${cell(1)}` : TEAMS.map((_, i) => `<span class="tmRow">${cell(i)}${score(i)}</span>`).join('');
  mountPanel('topmid', `
    <div class="panel ${versus ? 'versus' : 'list'}" id="teamBoard">
      ${body}<span class="tmExtra" id="teamExtra"></span>
      <div class="note" id="teamNote" hidden></div>
    </div>`);
  // 화면 가운데: 팀 고르기 (팀이 없을 때, 또는 셋 이상에서 팀 바꾸기를 눌렀을 때)
  mountPanel('hud', `
    <div class="panel" id="teamPick" hidden>
      <div class="ttitle" id="teamPickTitle"></div>
      <p class="note" id="teamPickInfo"></p>
      <div class="btns${n >= 3 ? ' many' : ''}${n >= 4 ? ' two' : ''}">${TEAMS.map((tm, i) => `<button type="button" class="teamBtn" id="teamBtn${i}" style="--tc:${teamCss(tm.color)}"><b id="teamBtnName${i}"></b><small id="teamBtnNote${i}"></small></button>`).join('')}</div>
    </div>`);
  // 내 정보 창: 내 팀과 점수, 팀 바꾸기
  mountPanel('meRows', `<div class="row" id="teamMeRow" hidden><span class="note" id="teamMine"></span><button type="button" class="plain" id="teamSwitch"></button></div>`);

  const ui = { pick: $('teamPick'), note: $('teamNote'), side: $('teamExtra'), meRow: $('teamMeRow'), mine: $('teamMine'), sw: $('teamSwitch') as HTMLButtonElement };
  const words = () => {
    for (let i = 0; i < n; i++) { $(`tmName${i}`).textContent = teamName(i); $(`teamBtnName${i}`).textContent = teamName(i); }
    $('teamPickTitle').textContent = t('teamPickTitle');
    $('teamPickInfo').textContent = TEAM_RULES.balance ? `${t('teamPickInfo')} ${t('teamPickBalance')}` : t('teamPickInfo');
    ui.sw.textContent = t('teamSwitch');
    $('teamBoard').setAttribute('aria-label', t('teamBoard'));
  };
  words();
  onLangChange(words);

  for (let i = 0; i < n; i++) $(`teamBtn${i}`).addEventListener('click', () => { picking = false; pick(i); });
  ui.sw.addEventListener('click', () => {
    const a = switchAction(n, me.i, TEAM_RULES.switch);
    if (a === 'open') picking = !picking;
    else if (a !== 'none') pick(a.pick);
  });
  onMsg('world', (m) => { if (m.s.teams) board = m.s.teams; });
  onMsg('me', (m) => { if (m.k === 'team') { me = m.s as TeamMe; if (me.i < 0) picking = false; } });
  addNotices({ feed: ['teamFull', 'teamJoined', 'teamStay'] });

  // 사람의 팀: 서버가 상태 줄에 실은 값(첫 칸이 팀 번호)으로 옷을 팀 색으로 칠하고, 발밑에 같은 색 고리를 단다 (내 것은 조금 크게). 팀이 없으면 회색 옷, 고리 없음
  const rings = TEAMS.map((tm) => new THREE.MeshBasicMaterial({ color: tm.color, transparent: true, opacity: 0.85 }));
  const ringGeo = new THREE.RingGeometry(0.55, 0.78, 20).rotateX(-Math.PI / 2);
  setPlayerLook({
    cloth: (p) => { const s = teamOfVals(p.vals, n); return s < 0 ? NO_TEAM : TEAMS[s].color; },
    update: (model, p) => {
      const s = teamOfVals(p.vals, n);
      let ring = model.root.getObjectByName('teamRing') as THREE.Mesh | undefined;
      if (s < 0) { if (ring) ring.visible = false; }
      else {
        if (!ring) { ring = new THREE.Mesh(ringGeo, rings[s]); ring.name = 'teamRing'; ring.position.y = 0.04; if (p.me) ring.scale.setScalar(1.25); model.root.add(ring); }
        ring.visible = true; ring.material = rings[s];
      }
      decorate?.(model, p, s);
    },
  });

  onSlow(() => {
    const rows = boardRows(TEAMS, board, me.i), loc = L();
    for (const r of rows) {
      $(`tmScore${r.i}`).textContent = String(r.score);
      $(`tmCount${r.i}`).textContent = loc.fmt.teamCount(r.count);
    }
    const x = extra?.() ?? {};
    ui.side.textContent = x.side ?? '';
    ui.side.hidden = !x.side;
    ui.note.textContent = x.note ?? '';
    ui.note.hidden = !x.note;
    // 고르기 창: 접속했고 팀이 없을 때 (또는 바꾸려고 열었을 때). 사람이 더 많은 팀의 단추는 누를 수 없다
    const open = !!S.me && n > 0 && (me.i < 0 || picking);
    ui.pick.hidden = !open;
    if (open) for (const b of pickButtons(TEAMS, board, me.i, TEAM_RULES.balance)) {
      const btn = $(`teamBtn${b.i}`) as HTMLButtonElement;
      btn.disabled = b.more || b.mine;
      btn.classList.toggle('on', b.mine);
      $(`teamBtnNote${b.i}`).textContent = b.more ? t('teamMore') : '';
    }
    ui.meRow.hidden = me.i < 0;
    ui.mine.textContent = me.i >= 0 ? loc.fmt.teamMine(teamName(me.i), me.score) : '';
    ui.sw.hidden = switchAction(n, me.i, TEAM_RULES.switch) === 'none';
    ui.sw.classList.toggle('on', picking);
  });
}
