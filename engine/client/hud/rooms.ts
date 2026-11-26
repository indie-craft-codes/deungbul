// 판(rooms 모듈)의 화면: 대기실 창(빠른 대국·컴퓨터와 두기·판 만들기·기다리는 판의 목록, 기다리는 동안의 그만두기), 판의 막대(자리들, 차례, 초읽기, 바퀴,
// 차례 넘기기·기권), 결과 창(다시 하기·대기실로). 앉은 동안 걷지 않는 판(RoomDef.walk 없음)은 걷기를 멈추고 폰의 조이스틱을 감춘다. 서버의 짝은 engine/server/game/systems/rooms.ts.
// 게임이 더 할 수 있는 것: 내 판 읽기(myRoom, myRoomTurn), 판이 바뀔 때 받기(onRoomChange), 매끄러운 남은 시간(roomLeftMs), 명령 보내기(roomSend),
// 막대에 자기 글과 자리의 색 더하기(setRoomLook). 문장은 틀의 언어 파일(ui.room…, fmt.room…)이고, 게임은 같은 키를 자기 언어 파일에 적어 덮어쓴다(대기실의 설명 roomLobbyInfo, 끝난 까닭 fmt.roomWhy).
import type { RoomLobby, RoomView } from '../../shared/defs/rooms';
import { $ } from '../app';
import { onFrame, onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { send } from '../net';
import { rules } from '../rules';
import { addMsgSounds, sfx } from '../sound';
import { addNotices } from './notify';
import { mountPanel } from './shell';

let room: RoomView | null = null;
let lobby: RoomLobby = { rows: [], cpu: 0, cpuAfterS: 0 };
/** 이번 차례의 기한 (performance.now 기준). 기한이 없으면 0 */
let deadline = 0;
/** 기다리는 판을 연 때 (performance.now 기준): 컴퓨터로 채우기까지의 초읽기 */
let waitSince = 0;
const changes: ((before: RoomView | null, now: RoomView | null) => void)[] = [];
let look: { seatColor?: (seat: number) => string; note?: () => string; title?: () => string; lobby?: () => string } = {};

/** 내가 앉은 판 (없으면 null) */
export const myRoom = (): RoomView | null => room;
/** 두는 중인 판에서 내 차례인가 */
export const myRoomTurn = (): boolean => !!room && room.st === 'play' && room.turn === room.me;
/** 이번 차례의 남은 시간(ms). 받은 때부터 화면의 시계로 센다 (기한이 없거나 두는 중이 아니면 0) */
export const roomLeftMs = (): number => (room && room.st === 'play' && deadline ? Math.max(0, deadline - performance.now()) : 0);
/** 판이 바뀔 때마다 (들어옴, 차례, 끝남, 나감): 앞의 것과 지금의 것 */
export function onRoomChange(fn: (before: RoomView | null, now: RoomView | null) => void): void { changes.push(fn); }
/** 판의 명령 (서버의 room 명령) */
export function roomSend(a: 'quick' | 'host' | 'cpu' | 'join' | 'leave' | 'pass' | 'resign' | 'again', id?: number): void { send(id === undefined ? { t: 'room', a } : { t: 'room', a, id }); }
/**
 * 판의 화면에 게임의 것을 더한다: seatColor는 자리의 글자 색(css 색), note는 막대 아래 줄의 글(비우면 숨는다, 느린 주기마다), title은 결과 창의 큰 글을 대신한다(빈 문자열이면 틀의 것),
 * lobby는 대기실 창의 제목 옆 글(전적 같은 것)
 */
export function setRoomLook(more: typeof look): void { look = { ...look, ...more }; }
/** 자리의 이름: 컴퓨터는 roomCpu, 빈 자리는 roomEmpty */
export function roomSeatName(v: RoomView, i: number): string {
  const s = v.seats[i];
  if (!s || s.empty) return t('roomEmpty');
  return s.cpu ? t('roomCpu') : s.name || '?';
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function initRooms(): void {
  mountPanel('rightTop', `
    <div class="panel" id="roomLobby">
      <div class="row"><span class="ttitle" id="roomLobbyTitle"></span><span class="num" id="roomLobbyExtra"></span></div>
      <div class="note" id="roomLobbyInfo"></div>
      <div id="roomIdle">
        <div class="btns"><button type="button" id="roomQuick" class="go"></button><button type="button" id="roomCpu"></button></div>
        <div class="btns"><button type="button" class="plain" id="roomHost"></button></div>
        <div class="note sub" id="roomOpenTitle"></div>
        <div id="roomList"></div>
        <div class="note" id="roomPlaying"></div>
      </div>
      <div id="roomWaitBox" hidden>
        <div class="note wait" id="roomWaitText"></div>
        <div class="btns"><button type="button" id="roomWaitCpu"></button><button type="button" class="plain" id="roomCancel"></button></div>
      </div>
    </div>`);
  mountPanel('topmid', `
    <div class="panel" id="roomBar" hidden>
      <div class="rseats" id="roomSeats"></div>
      <div class="row"><span id="roomTurn" class="rturn"></span><span class="num" id="roomRound"></span><span class="num rclock" id="roomClock"></span></div>
      <div class="bar rtime" id="roomTime"><i id="roomClockBar"></i></div>
      <div class="note" id="roomNote" hidden></div>
      <div class="btns"><button type="button" id="roomPass" class="go"></button><button type="button" class="plain" id="roomResign"></button></div>
    </div>`);
  mountPanel('hud', `
    <div class="panel" id="roomEnd" hidden>
      <div class="rbig" id="roomEndTitle"></div>
      <div class="note" id="roomEndWhy"></div>
      <div class="note" id="roomEndNote"></div>
      <div class="btns"><button type="button" id="roomAgain" class="go"></button><button type="button" class="plain" id="roomToLobby"></button></div>
    </div>`);
  const ui = {
    lobby: $('roomLobby'), idle: $('roomIdle'), wait: $('roomWaitBox'), list: $('roomList'), playing: $('roomPlaying'), waitText: $('roomWaitText'),
    cpu: $<HTMLButtonElement>('roomCpu'), waitCpu: $<HTMLButtonElement>('roomWaitCpu'),
    bar: $('roomBar'), seats: $('roomSeats'), turn: $('roomTurn'), round: $('roomRound'), clock: $('roomClock'), clockBar: $('roomClockBar'), time: $('roomTime'), note: $('roomNote'),
    pass: $<HTMLButtonElement>('roomPass'), resign: $<HTMLButtonElement>('roomResign'),
    end: $('roomEnd'), endTitle: $('roomEndTitle'), endWhy: $('roomEndWhy'), endNote: $('roomEndNote'), again: $<HTMLButtonElement>('roomAgain'),
  };
  const label = () => {
    $('roomLobbyTitle').textContent = t('roomLobby'); $('roomLobbyInfo').textContent = t('roomLobbyInfo');
    $('roomQuick').textContent = t('roomQuick'); ui.cpu.textContent = t('roomWithCpu'); $('roomHost').textContent = t('roomHost');
    $('roomOpenTitle').textContent = t('roomOpen'); ui.waitCpu.textContent = t('roomWithCpu'); $('roomCancel').textContent = t('roomCancel');
    ui.pass.textContent = t('roomPass'); ui.resign.textContent = t('roomResign'); ui.again.textContent = t('roomAgain'); $('roomToLobby').textContent = t('roomToLobby');
  };
  label();
  onLangChange(() => { label(); render(); });
  // 판의 안내문: 시작·끊김·돌아옴은 가운데, 거절과 시간 넘김은 흘러가는 알림, 결과는 결과 창과 대화창. 게임이 먼저 정한 분류·소리가 이긴다 (keep)
  addNotices({
    banner: { roomStart: 'good', roomFoeLeft: 'bad', roomFoeBack: '', roomBack: '' },
    feed: ['roomWait', 'roomFull', 'roomBusy', 'roomGone', 'roomNotTurn', 'roomTimeout', 'roomAgainWait', 'roomFoeGone'],
  }, true);
  addMsgSounds({ roomStart: sfx.fanfare, roomResult: sfx.fanfare, roomTimeout: sfx.bad, roomFoeLeft: sfx.bad }, true);

  const click = (id: string, fn: () => void) => $(id).addEventListener('click', (e) => { fn(); (e.currentTarget as HTMLElement).blur(); });
  click('roomQuick', () => roomSend('quick'));
  click('roomCpu', () => roomSend('cpu'));
  click('roomHost', () => roomSend('host'));
  click('roomWaitCpu', () => roomSend('cpu'));
  click('roomCancel', () => roomSend('leave'));
  click('roomPass', () => roomSend('pass'));
  click('roomResign', () => roomSend('resign'));
  click('roomAgain', () => roomSend('again'));
  click('roomToLobby', () => roomSend('leave'));
  ui.list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button[data-room]');
    if (b) roomSend('join', Number(b.getAttribute('data-room')));
  });

  onMsg('me', (m) => {
    if (m.k !== 'room') return;
    const before = room, now = performance.now();
    room = m.s as RoomView | null;
    deadline = room && room.st === 'play' && room.left > 0 ? now + room.left : 0;
    if (room && room.st === 'wait' && (!before || before.id !== room.id || before.st !== 'wait')) waitSince = now;
    document.body.classList.toggle('in-room', !!room);
    document.body.classList.toggle('room-still', !!room && !room.walk);
    for (const fn of changes) fn(before, room);
    render();
  });
  onMsg('world', (m) => { if (m.s.rooms) { lobby = m.s.rooms; render(); } });
  // 앉은 동안 걷지 않는 판: 서버의 g.rules.speed와 같은 답 (게임의 규칙을 감싼다: 게임의 모듈이 먼저 init된다)
  const walk = rules.speed;
  rules.speed = () => (room && !room.walk ? 0 : walk());

  // 초읽기: 매 프레임 (글자는 바뀔 때만 쓴다)
  let shown = '';
  onFrame(() => {
    if (!room || room.st !== 'play' || !room.turnMs) return;
    const left = roomLeftMs(), text = L().fmt.roomClock(Math.ceil(left / 1000));
    if (text !== shown) { shown = text; ui.clock.textContent = text; ui.time.classList.toggle('low', left <= 8000); }
    ui.clockBar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / room.turnMs))})`;
  });
  onSlow(render);

  function render(): void {
    const loc = L(), r = room;
    // 대기실 창: 판에 앉지 않았거나 사람을 기다리는 동안
    ui.lobby.hidden = !!r && r.st !== 'wait';
    ui.idle.hidden = !!r; ui.wait.hidden = !(r && r.st === 'wait');
    ui.cpu.hidden = ui.waitCpu.hidden = !lobby.cpu;
    $('roomLobbyExtra').textContent = look.lobby?.() ?? '';
    if (!r) {
      const open = lobby.rows.filter((x) => x[4] === 0);
      ui.list.innerHTML = open.length
        ? open.map((x) => `<div class="mrow"><span>${esc(loc.fmt.roomHostWaits(x[1], x[2], x[3]))}</span><button type="button" data-room="${x[0]}">${esc(t('roomJoin'))}</button></div>`).join('')
        : `<div class="note">${esc(t(lobby.cpu ? 'roomNoneCpu' : 'roomNone'))}</div>`;
      ui.playing.textContent = loc.fmt.roomPlaying(lobby.rows.filter((x) => x[4] === 1).length);
    } else if (r.st === 'wait') {
      const after = lobby.cpuAfterS ? Math.max(0, Math.ceil(lobby.cpuAfterS - (performance.now() - waitSince) / 1000)) : 0;
      ui.waitText.textContent = loc.fmt.roomWaiting(r.seats.filter((s) => !s.empty).length, r.seats.length, after);
    }
    // 판의 막대
    const playing = !!r && r.st !== 'wait';
    ui.bar.hidden = !playing;
    ui.end.hidden = !(r && r.st === 'over');
    if (!r || !playing) return;
    ui.seats.innerHTML = r.seats.map((s, i) => {
      const cls = ['rseat', r.st === 'play' && r.turn === i ? 'now' : '', r.me === i ? 'mine' : '', s.away ? 'away' : ''].filter(Boolean).join(' ');
      const color = look.seatColor?.(i);
      return `<span class="${cls}"${color ? ` style="color:${esc(color)}"` : ''}>${esc(roomSeatName(r, i))}${s.away === 1 ? ` (${esc(t('roomAway'))})` : s.away === 2 ? ` (${esc(t('roomLeft'))})` : ''}</span>`;
    }).join('');
    const mine = myRoomTurn();
    ui.turn.textContent = r.st !== 'play' ? '' : mine ? t('roomMyTurn') : r.seats[r.turn]?.cpu ? t('roomCpuTurn') : loc.fmt.roomTheirTurn(roomSeatName(r, r.turn));
    const tc = r.st === 'play' ? look.seatColor?.(r.turn) : undefined;
    ui.turn.style.color = tc ?? '';
    ui.round.textContent = r.rounds ? loc.fmt.roomRound(r.round, r.rounds) : '';
    ui.time.hidden = ui.clock.hidden = r.st !== 'play' || !r.turnMs;
    if (r.st !== 'play') ui.clock.textContent = '';
    ui.pass.hidden = !r.pass || r.st !== 'play'; ui.pass.disabled = !mine;
    ui.resign.hidden = r.st !== 'play';
    const note = look.note?.() ?? '';
    ui.note.textContent = note; ui.note.hidden = !note;
    // 결과 창
    if (r.st === 'over') {
      const res = r.win === -2 ? 2 : r.win === r.me ? 0 : 1;
      ui.endTitle.textContent = look.title?.() || t(res === 0 ? 'roomWin' : res === 1 ? 'roomLose' : 'roomDraw');
      ui.endTitle.className = `rbig r${res}`;
      ui.endWhy.textContent = loc.fmt.roomWhy(r.why);
      const gone = r.seats.some((s, i) => i !== r.me && !s.cpu && !s.empty && s.away !== 0);
      ui.again.disabled = gone || r.seats[r.me]?.again === 1;
      ui.endNote.textContent = gone ? t('roomFoeGoneNote') : r.seats[r.me]?.again ? t('roomAgainWaitNote') : '';
    }
  }
  render();
}

