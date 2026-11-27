// 판(rooms 모듈)의 화면: 대기실 창(빠른 대국·컴퓨터와 두기·판 만들기·기다리는 판의 목록, 기다리는 동안의 그만두기), 판의 막대(자리들, 차례, 초읽기, 바퀴,
// 차례 넘기기·기권), 결과 창(다시 하기·대기실로). 앉은 동안 걷지 않는 판(RoomDef.walk 없음)은 걷기를 멈추고 폰의 조이스틱을 감춘다. 서버의 짝은 engine/server/game/systems/rooms.ts.
// 판의 공통화(묶음 7: 서버가 그 칸을 켠 판에만 보인다): 판 고르기와 자리 수 고르기, 목록 넘기기와 구경 단추, 방 코드로 들어가기(와 초대 링크 ?join=코드: 접속하면 저절로),
// 비밀번호 묻기, 기다리는 판의 방 코드·초대 링크 복사·공개 설정·자리마다 준비·방장의 내보내기·넘기기·규칙 고르기·시작, 투표 줄(찬성·반대), 구경꾼의 막대(지연·관전 대기),
// 결과 창의 '같은 무리로 다음 판', 전적 창(대기실의 '전적', 자리 이름 누르기). 방 코드가 생기면 Platform.invite로 포털의 초대 단추에 알린다.
// 게임이 더 할 수 있는 것: 내 판 읽기(myRoom, myRoomTurn), 판이 바뀔 때 받기(onRoomChange), 매끄러운 남은 시간(roomLeftMs), 명령 보내기(roomSend),
// 막대에 자기 글과 자리의 색·이름 더하기, 좁은 화면에서 막대의 자리 고르기, 판·규칙의 이름(setRoomLook). 문장은 틀의 언어 파일(ui.room…, fmt.room…)이고, 게임은 같은 키를 자기 언어 파일에 적어 덮어쓴다(대기실의 설명 roomLobbyInfo, 끝난 까닭 fmt.roomWhy).
import type { RoomDefView, RoomLobby, RoomRow, RoomStatsView, RoomView } from '../../shared/defs/rooms';
import type { RoomCmd } from '../../shared/protocol';
import { $ } from '../app';
import { onFrame, onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { send } from '../net';
import { platform } from '../platform';
import { rules } from '../rules';
import { addMsgSounds, sfx } from '../sound';
import { addNotices, feed } from './notify';
import { mountPanel } from './shell';

let room: RoomView | null = null;
let lobby: RoomLobby = { rows: [], cpu: 0, cpuAfterS: 0, startAfterS: 0 };
/** 이번 차례의 기한 (performance.now 기준). 기한이 없으면 0 */
let deadline = 0;
/** 기다리는 판을 연 때 (performance.now 기준): 컴퓨터로 채우기까지의 초읽기 */
let waitSince = 0;
const changes: ((before: RoomView | null, now: RoomView | null) => void)[] = [];
/** 게임이 판 화면에 더하는 것 (setRoomLook) */
interface RoomLook {
  seatColor?: (seat: number) => string;
  note?: () => string;
  title?: () => string;
  lobby?: () => string;
  seatName?: (v: RoomView, seat: number) => string;
  barAt?: 'top' | 'bottom';
  /** 판의 이름 (RoomDef.id → 화면의 글). 빈 문자열이면 언어 파일의 fmt.roomDefName */
  defName?: (id: string) => string;
  /** 규칙 옵션의 이름과 값의 글 (RoomDef.options). 빈 문자열이면 fmt.roomOptName·roomOptValue */
  optName?: (k: string) => string;
  optValue?: (k: string, v: string | number) => string;
}
let look: RoomLook = {};
/** 대기실 목록의 한 쪽에 보이는 줄 수 */
const PAGE = 4;

/** 내가 앉은 판 (없으면 null). 구경하는 판도 (RoomView.watch가 1, me는 -1) */
export const myRoom = (): RoomView | null => room;
/** 두는 중인 판에서 내 차례인가 (실시간 판은 두는 중이면 언제나) */
export const myRoomTurn = (): boolean => !!room && room.st === 'play' && !room.watch && (room.rt ? !room.seats[room.me]?.away : room.turn === room.me);
/** 이번 차례의 남은 시간(ms). 받은 때부터 화면의 시계로 센다 (기한이 없거나 두는 중이 아니면 0). 실시간 판은 판 전체의 남은 시간 */
export const roomLeftMs = (): number => (room && room.st === 'play' && deadline ? Math.max(0, deadline - performance.now()) : 0);
/** 판이 바뀔 때마다 (들어옴, 차례, 끝남, 나감): 앞의 것과 지금의 것 */
export function onRoomChange(fn: (before: RoomView | null, now: RoomView | null) => void): void { changes.push(fn); }
/** 판의 명령 (서버의 room 명령). 판의 공통화의 칸(def, n, code, pass, seat, k, v …)은 more로 */
export function roomSend(a: RoomCmd, id?: number, more: { def?: string; n?: number; code?: string; pass?: string; v?: string | number; seat?: number; on?: boolean; k?: string; kind?: 'opt' | 'again' | 'kick'; yes?: boolean } = {}): void {
  send({ t: 'room', a, ...(id === undefined ? {} : { id }), ...more });
}
/**
 * 판의 화면에 게임의 것을 더한다: seatColor는 자리의 글자 색(css 색), note는 막대 아래 줄의 글(비우면 숨는다, 느린 주기마다), title은 결과 창의 큰 글을 대신한다(빈 문자열이면 틀의 것),
 * lobby는 대기실 창의 제목 옆 글(전적 같은 것), seatName은 자리의 이름(빈 문자열이면 틀의 것: 컴퓨터에 게임의 이름을 줄 때),
 * barAt은 좁은 화면(폭 720px 이하)에서 판 막대의 자리: 'bottom'(기본, 화면 아래 108px 위) 또는 'top'(위쪽 내 정보 창 밑). 게임의 창이 아래에 있으면 'top'.
 * defName·optName·optValue는 판의 이름(RoomDef.id)과 방장이 고르는 규칙(RoomDef.options)의 글 (언어마다: t()로)
 */
export function setRoomLook(more: RoomLook): void {
  look = { ...look, ...more };
  document.body.classList.toggle('room-bar-top', look.barAt === 'top');
}
/** 자리의 이름: 게임의 seatName, 사람은 이름, 컴퓨터는 RoomDef.cpuName의 이름이나 roomCpu(컴퓨터가 둘 이상이면 roomCpuN의 번호), 빈 자리는 roomEmpty */
export function roomSeatName(v: RoomView, i: number): string {
  const s = v.seats[i];
  if (!s || s.empty) return t('roomEmpty');
  const mine = look.seatName?.(v, i);
  if (mine) return mine;
  if (!s.cpu) return s.name || '?';
  if (s.name) return s.name;
  const cpus = v.seats.filter((x) => x.cpu && !x.name).length;
  return cpus > 1 ? L().fmt.roomCpuN(v.seats.slice(0, i).filter((x) => x.cpu && !x.name).length + 1) : t('roomCpu');
}
const defName = (id: string): string => look.defName?.(id) || L().fmt.roomDefName(id);
const optName = (k: string): string => look.optName?.(k) || L().fmt.roomOptName(k);
const optValue = (k: string, v: string | number): string => look.optValue?.(k, v) || L().fmt.roomOptValue(k, v);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const btn = (label: string, data: string, cls = '', off = false) => `<button type="button" ${data}${cls ? ` class="${cls}"` : ''}${off ? ' disabled' : ''}>${esc(label)}</button>`;

export function initRooms(): void {
  mountPanel('rightTop', `
    <div class="panel" id="roomLobby">
      <div class="row"><span class="ttitle" id="roomLobbyTitle"></span><span class="num" id="roomLobbyExtra"></span></div>
      <div class="note" id="roomLobbyInfo"></div>
      <div id="roomIdle">
        <div class="btns rpick" id="roomDefs" hidden></div>
        <div class="btns rpick" id="roomSizes" hidden></div>
        <div class="btns"><button type="button" id="roomQuick" class="go"></button><button type="button" id="roomCpu"></button></div>
        <div class="btns"><button type="button" class="plain" id="roomHost"></button><button type="button" class="plain" id="roomStatsMine" hidden></button></div>
        <div class="rcode" id="roomCodeRow" hidden><input id="roomCodeIn" maxlength="6" autocomplete="off" spellcheck="false"><button type="button" id="roomCodeGo"></button></div>
        <div class="rcode" id="roomPassRow" hidden><input id="roomPassIn" type="password" maxlength="24" autocomplete="off"><button type="button" id="roomPassGo" class="go"></button></div>
        <div class="rhead"><span class="note sub" id="roomOpenTitle"></span><span class="btns rpage" id="roomPager" hidden><button type="button" class="plain" id="roomPrev"></button><span class="num" id="roomPageNo"></span><button type="button" class="plain" id="roomNext"></button></span></div>
        <div id="roomList"></div>
        <div class="note" id="roomPlaying"></div>
      </div>
      <div id="roomWaitBox" hidden>
        <div class="note wait" id="roomWaitText"></div>
        <div class="rcodebox" id="roomCodeBox" hidden><span id="roomCodeShow"></span><button type="button" class="plain" id="roomCopy"></button></div>
        <div class="rcode" id="roomPrivRow" hidden><select id="roomPrivSel"></select><input id="roomPrivPass" type="password" maxlength="24" autocomplete="off" hidden><button type="button" class="plain" id="roomPrivGo"></button></div>
        <div id="roomWaitSeats"></div>
        <div id="roomOpts"></div>
        <div class="note rvote" id="roomVoteW" hidden></div>
        <div class="btns"><button type="button" id="roomStartNow" class="go" hidden></button><button type="button" id="roomReadyBtn" class="go" hidden></button><button type="button" id="roomWaitCpu"></button><button type="button" class="plain" id="roomCancel"></button></div>
      </div>
    </div>`);
  mountPanel('topmid', `
    <div class="panel" id="roomBar" hidden>
      <div class="rseats" id="roomSeats"></div>
      <div class="row"><span id="roomTurn" class="rturn"></span><span class="num" id="roomRound"></span><span class="num rclock" id="roomClock"></span></div>
      <div class="bar rtime" id="roomTime"><i id="roomClockBar"></i></div>
      <div class="note" id="roomNote" hidden></div>
      <div class="note rvote" id="roomVoteB" hidden></div>
      <div class="btns"><button type="button" id="roomPass" class="go"></button><button type="button" class="plain" id="roomResign"></button><button type="button" class="plain" id="roomUnwatch" hidden></button></div>
    </div>`);
  mountPanel('hud', `
    <div class="panel" id="roomEnd" hidden>
      <div class="rbig" id="roomEndTitle"></div>
      <div class="note" id="roomEndWhy"></div>
      <div class="rranks" id="roomEndRanks" hidden></div>
      <div class="note" id="roomEndNote"></div>
      <div class="note rvote" id="roomVoteE" hidden></div>
      <div class="btns"><button type="button" id="roomAgain" class="go"></button><button type="button" id="roomRegroup" hidden></button><button type="button" class="plain" id="roomToLobby"></button></div>
    </div>
    <div class="panel" id="roomStats" hidden>
      <div class="row"><span class="ttitle" id="roomStatsTitle"></span><button type="button" class="plain" id="roomStatsClose"></button></div>
      <div id="roomStatsBody"></div>
    </div>`);
  const ui = {
    lobby: $('roomLobby'), idle: $('roomIdle'), wait: $('roomWaitBox'), list: $('roomList'), playing: $('roomPlaying'), waitText: $('roomWaitText'),
    cpu: $<HTMLButtonElement>('roomCpu'), waitCpu: $<HTMLButtonElement>('roomWaitCpu'), startNow: $<HTMLButtonElement>('roomStartNow'),
    bar: $('roomBar'), seats: $('roomSeats'), turn: $('roomTurn'), round: $('roomRound'), clock: $('roomClock'), clockBar: $('roomClockBar'), time: $('roomTime'), note: $('roomNote'),
    pass: $<HTMLButtonElement>('roomPass'), resign: $<HTMLButtonElement>('roomResign'), unwatch: $<HTMLButtonElement>('roomUnwatch'),
    end: $('roomEnd'), endTitle: $('roomEndTitle'), endWhy: $('roomEndWhy'), endRanks: $('roomEndRanks'), endNote: $('roomEndNote'), again: $<HTMLButtonElement>('roomAgain'), regroup: $<HTMLButtonElement>('roomRegroup'),
    defs: $('roomDefs'), sizes: $('roomSizes'), codeRow: $('roomCodeRow'), codeIn: $<HTMLInputElement>('roomCodeIn'), passRow: $('roomPassRow'), passIn: $<HTMLInputElement>('roomPassIn'),
    pager: $('roomPager'), pageNo: $('roomPageNo'), prev: $<HTMLButtonElement>('roomPrev'), next: $<HTMLButtonElement>('roomNext'), statsMine: $<HTMLButtonElement>('roomStatsMine'),
    codeBox: $('roomCodeBox'), codeShow: $('roomCodeShow'), privRow: $('roomPrivRow'), privSel: $<HTMLSelectElement>('roomPrivSel'), privPass: $<HTMLInputElement>('roomPrivPass'),
    waitSeats: $('roomWaitSeats'), opts: $('roomOpts'), readyBtn: $<HTMLButtonElement>('roomReadyBtn'),
    voteW: $('roomVoteW'), voteB: $('roomVoteB'), voteE: $('roomVoteE'), stats: $('roomStats'), statsTitle: $('roomStatsTitle'), statsBody: $('roomStatsBody'),
  };
  /** 기권은 한 번 더 눌러야 한다 (좁은 화면에서 잘못 누르지 않게): 첫 누름의 때, 3초 안에 다시 누르면 기권 */
  let resignAt = 0, resignTimer = 0;
  /** 대기실에서 고른 판의 이름과 자리 수 (0이면 그 판의 max), 목록의 쪽 */
  let pick = '', size = 0, page = 0;
  /** 비밀번호를 물을 곳: 판 id 또는 방 코드 */
  let passFor: { id?: number; code?: string } | null = null;
  /** 초대 링크(?join=코드)를 한 번만 쓴다. 포털에 알린 마지막 방 코드 */
  let joinParam = (() => { try { return platform().app.param('join') ?? ''; } catch { return ''; } })();
  let invited = '';
  const label = () => {
    $('roomLobbyTitle').textContent = t('roomLobby'); $('roomLobbyInfo').textContent = t('roomLobbyInfo');
    $('roomQuick').textContent = t('roomQuick'); ui.cpu.textContent = t('roomWithCpu'); $('roomHost').textContent = t('roomHost');
    $('roomOpenTitle').textContent = t('roomOpen'); ui.waitCpu.textContent = t('roomWithCpu'); $('roomCancel').textContent = t('roomCancel');
    ui.pass.textContent = t('roomPass'); ui.resign.textContent = t(resignAt ? 'roomResignSure' : 'roomResign'); ui.again.textContent = t('roomAgain'); $('roomToLobby').textContent = t('roomToLobby');
    ui.codeIn.placeholder = t('roomCodePh'); $('roomCodeGo').textContent = t('roomCodeJoin'); ui.passIn.placeholder = t('roomPassPh'); $('roomPassGo').textContent = t('roomPassGo');
    ui.prev.textContent = '‹'; ui.next.textContent = '›'; ui.prev.title = t('roomPrev'); ui.next.title = t('roomNext'); ui.statsMine.textContent = t('roomStatsBtn');
    $('roomCopy').textContent = t('roomCopyLink'); ui.privPass.placeholder = t('roomPassPh'); $('roomPrivGo').textContent = t('roomApply');
    ui.privSel.innerHTML = (['public', 'private', 'friends', 'password'] as const).map((v) => `<option value="${v}">${esc(t(`roomPriv${v[0].toUpperCase()}${v.slice(1)}` as 'roomPrivPublic'))}</option>`).join('');
    ui.unwatch.textContent = t('roomWatchLeave'); ui.regroup.textContent = t('roomRegroup'); $('roomStatsClose').textContent = t('roomClose');
  };
  label();
  onLangChange(() => { label(); render(); });
  // 판의 안내문: 시작·끊김·돌아옴은 가운데, 거절과 시간 넘김은 흘러가는 알림, 결과는 결과 창과 대화창. 게임이 먼저 정한 분류·소리가 이긴다 (keep)
  addNotices({
    banner: { roomStart: 'good', roomFoeLeft: 'bad', roomFoeBack: '', roomBack: '', roomKicked: 'bad', roomLeadNew: '', roomRegroup: '' },
    feed: ['roomWait', 'roomFull', 'roomBusy', 'roomGone', 'roomNotTurn', 'roomTimeout', 'roomAgainWait', 'roomFoeGone', 'roomCodeBad', 'roomPassword', 'roomSlow', 'roomFriendsOnly', 'roomBanned',
      'roomKickedOut', 'roomLeadOnly', 'roomNotReady', 'roomVote', 'roomVoteEnd', 'roomVoteBusy', 'roomQueued', 'roomWatching', 'roomWatchFull', 'roomMidJoin'],
  }, true);
  addMsgSounds({ roomStart: sfx.fanfare, roomResult: sfx.fanfare, roomTimeout: sfx.bad, roomFoeLeft: sfx.bad, roomKicked: sfx.bad }, true);

  const click = (id: string, fn: () => void) => $(id).addEventListener('click', (e) => { fn(); (e.currentTarget as HTMLElement).blur(); });
  const chosen = (): RoomDefView | undefined => lobby.defs?.find((d) => d.id === pick) ?? lobby.defs?.[0];
  const defArg = () => { const d = chosen(); return d && lobby.defs && d.id !== lobby.defs[0].id ? { def: d.id } : {}; };
  click('roomQuick', () => roomSend('quick', undefined, defArg()));
  click('roomCpu', () => roomSend('cpu', undefined, defArg()));
  click('roomHost', () => { const d = chosen(); roomSend('host', undefined, { ...defArg(), ...(d && size && size !== d.max ? { n: size } : {}) }); });
  click('roomWaitCpu', () => roomSend('cpu'));
  click('roomCancel', () => roomSend('leave'));
  click('roomPass', () => roomSend('pass'));
  click('roomResign', () => {
    const now = performance.now();
    window.clearTimeout(resignTimer);
    if (resignAt && now - resignAt < 3000) { resignAt = 0; label(); roomSend('resign'); return; }
    resignAt = now; label(); ui.resign.classList.add('warn');
    resignTimer = window.setTimeout(() => { resignAt = 0; label(); ui.resign.classList.remove('warn'); }, 3000);
  });
  click('roomStartNow', () => roomSend('start'));
  click('roomAgain', () => roomSend('again'));
  click('roomRegroup', () => roomSend('regroup'));
  click('roomToLobby', () => roomSend('leave'));
  click('roomUnwatch', () => roomSend('leave'));
  click('roomReadyBtn', () => { if (room) roomSend('ready', undefined, { on: room.seats[room.me]?.ready !== 1 }); });
  click('roomStatsMine', () => roomSend('stats'));
  click('roomStatsClose', () => { ui.stats.hidden = true; });
  click('roomPrev', () => { page = Math.max(0, page - 1); render(); });
  click('roomNext', () => { page++; render(); });
  const codeGo = () => { const code = ui.codeIn.value.trim().toUpperCase(); if (code.length === 6) { passFor = { code }; roomSend('code', undefined, { code }); } };
  click('roomCodeGo', codeGo);
  ui.codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') codeGo(); });
  const passGo = () => {
    const pass = ui.passIn.value;
    if (!passFor || !pass) return;
    if (passFor.code) roomSend('code', undefined, { code: passFor.code, pass }); else roomSend('join', passFor.id, { pass });
    ui.passIn.value = '';
  };
  click('roomPassGo', passGo);
  ui.passIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') passGo(); });
  click('roomCopy', () => {
    const code = room?.code;
    if (!code) return;
    const url = new URL(`?join=${code}`, document.baseURI).href; // 지금 쪽의 주소에 ?join=코드 (앱은 플랫폼이 붙여 주는 쪽)
    void platform().copy(url).then((ok) => feed(t(ok ? 'roomCopied' : 'roomCopyFail')));
  });
  ui.privSel.addEventListener('change', () => { ui.privPass.hidden = ui.privSel.value !== 'password'; });
  click('roomPrivGo', () => roomSend('privacy', undefined, { v: ui.privSel.value, ...(ui.privSel.value === 'password' ? { pass: ui.privPass.value } : {}) }));
  // 목록·고르기·자리·투표의 단추 (그려 넣은 단추: data-*로 무엇인지)
  const onData = (el: HTMLElement) => el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button, [data-stats]');
    if (!b) return;
    const d = b.dataset;
    if (d.room) {
      const id = Number(d.room), lock = Number(d.lock ?? 0);
      if (lock === 1) { passFor = { id }; render(); ui.passIn.focus(); return; }
      roomSend('join', id);
    } else if (d.watch) roomSend('watch', Number(d.watch));
    else if (d.def !== undefined) { pick = d.def; size = 0; render(); }
    else if (d.size) { size = Number(d.size); render(); }
    else if (d.kick) roomSend('kick', undefined, { seat: Number(d.kick) });
    else if (d.kickvote) roomSend('vote', undefined, { kind: 'kick', seat: Number(d.kickvote) });
    else if (d.give) roomSend('give', undefined, { seat: Number(d.give) });
    else if (d.stats) roomSend('stats', undefined, { seat: Number(d.stats) });
    else if (d.opt !== undefined && room) {
      const v = d.num ? Number(d.val) : d.val ?? '';
      if (room.lead === room.me || (room.lead === undefined && room.seats.findIndex((s) => !s.empty && !s.cpu) === room.me)) roomSend('opt', undefined, { k: d.opt, v });
      else if (room.vote !== undefined) roomSend('vote', undefined, { kind: 'opt', k: d.opt, v });
    } else if (d.yes) roomSend('ballot', undefined, { yes: d.yes === '1' });
    (b as HTMLElement).blur();
  });
  for (const el of [ui.list, ui.defs, ui.sizes, ui.waitSeats, ui.opts, ui.voteW, ui.voteB, ui.voteE, ui.seats, ui.endRanks]) onData(el);

  onMsg('me', (m) => {
    if (m.k !== 'room') return;
    const before = room, now = performance.now();
    room = m.s as RoomView | null;
    deadline = room && room.st === 'play' && room.left > 0 ? now + room.left : 0;
    if (!room || room.st !== 'play') { resignAt = 0; ui.resign.classList.remove('warn'); label(); }
    if (room && room.st === 'wait' && (!before || before.id !== room.id || before.st !== 'wait')) waitSince = now;
    if (room) passFor = null;
    // 포털의 초대 단추에 방 코드를 알린다 (바뀔 때만)
    if (room?.code && room.code !== invited) { invited = room.code; try { platform().invite({ code: room.code, size: room.seats.length }); } catch { /* 포털이 없다 */ } }
    document.body.classList.toggle('in-room', !!room);
    document.body.classList.toggle('room-still', !!room && !room.walk);
    for (const fn of changes) fn(before, room);
    render();
  });
  onMsg('world', (m) => {
    if (!m.s.rooms) return;
    lobby = m.s.rooms;
    // 초대 링크로 왔다: 처음 대기실을 받으면 그 코드로 들어간다 (한 번만)
    if (joinParam && !room) { const code = joinParam.trim().toUpperCase(); joinParam = ''; passFor = { code }; roomSend('code', undefined, { code }); }
    render();
  });
  onMsg('roomStats', (m) => { showStats(m.s); });
  // 비밀번호를 물어야 하면 비밀번호 칸을 연다
  onMsg('sys', (m) => { if ((m.k === 'roomPassword' || m.k === 'roomSlow') && passFor && !room) render(); else if (m.k === 'roomCodeBad') { passFor = null; render(); } });
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

  function showStats(s: RoomStatsView): void {
    const loc = L(), tl = (x: { n: number; win: number; lose: number; draw: number }) => loc.fmt.roomTally(x.n, x.win, x.lose, x.draw);
    ui.statsTitle.textContent = loc.fmt.roomStatsTitle(s.name);
    const many = Object.keys(s.defs).length > 1 || (lobby.defs?.length ?? 0) > 1;
    ui.statsBody.innerHTML = !s.all.n ? `<div class="note">${esc(t('roomStatsNone'))}</div>` : [
      `<div class="rbigsm">${esc(tl(s.all))}</div>`,
      ...(many ? Object.entries(s.defs).map(([id, x]) => `<div class="note">${esc(defName(id))} · ${esc(tl(x))}</div>`) : []),
      `<div class="note sub">${esc(t('roomStatsRecent'))}</div>`,
      ...s.recent.map((r) => `<div class="note">${esc(loc.fmt.roomRecentRow(defName(r.def), r.res, r.rank, r.n, r.at))}</div>`),
    ].join('');
    ui.stats.hidden = false;
  }

  /** 투표 줄 (없으면 숨긴다) */
  function voteLine(el: HTMLElement, r: RoomView): void {
    const v = r.vote;
    el.hidden = !v;
    if (!v) { el.innerHTML = ''; return; }
    const what = v.kind === 'opt' ? `${optName(v.k ?? '')} → ${optValue(v.k ?? '', v.v ?? '')}` : v.kind === 'kick' ? roomSeatName(r, v.seat ?? -1) : '';
    el.innerHTML = `<span>${esc(L().fmt.roomVoteText(v.kind, v.by, what, v.yes, v.need, Math.ceil(v.left / 1000)))}</span>`
      + (r.watch ? '' : `<span class="btns">${btn(t('roomVoteYes'), 'data-yes="1"', v.mine === 1 ? 'go' : '')}${btn(t('roomVoteNo'), 'data-yes="0"', v.mine === 0 ? 'go' : 'plain')}</span>`);
  }

  function render(): void {
    const loc = L(), r = room, watching = !!r?.watch;
    // 대기실 창: 판에 앉지 않았거나 사람을 기다리는 동안 (구경꾼은 막대만)
    ui.lobby.hidden = !!r && (r.st !== 'wait' || watching);
    ui.idle.hidden = !!r; ui.wait.hidden = !(r && r.st === 'wait' && !watching);
    const d = chosen();
    ui.cpu.hidden = ui.waitCpu.hidden = !(d ? d.cpu : lobby.cpu);
    $('roomLobbyExtra').textContent = look.lobby?.() ?? '';
    if (!r) renderIdle(loc, d);
    else if (r.st === 'wait' && !watching) renderWait(loc, r);
    // 판의 막대
    const playing = !!r && (r.st !== 'wait' || watching);
    ui.bar.hidden = !playing;
    ui.end.hidden = !(r && r.st === 'over');
    if (!r || !playing) return;
    ui.bar.classList.toggle('many', r.seats.length >= 5);
    ui.seats.innerHTML = r.seats.map((s, i) => {
      const cls = ['rseat', r.st === 'play' && r.turn === i ? 'now' : '', r.me === i ? 'mine' : '', s.away ? 'away' : '', r.lead === i ? 'lead' : ''].filter(Boolean).join(' ');
      const color = look.seatColor?.(i);
      const stats = s.cpu || s.empty || !anyRecord() ? '' : ` data-stats="${i}"`;
      return `<span class="${cls}"${stats}${color ? ` style="color:${esc(color)}"` : ''}>${esc(roomSeatName(r, i))}${s.away === 1 ? ` (${esc(t('roomAway'))})` : s.away === 2 ? ` (${esc(t('roomLeft'))})` : ''}</span>`;
    }).join('');
    const mine = myRoomTurn();
    ui.turn.textContent = r.st !== 'play' ? '' : r.rt ? t('roomRealtime') : !watching && mine ? t('roomMyTurn') : r.seats[r.turn]?.cpu ? t('roomCpuTurn') : r.turn >= 0 ? loc.fmt.roomTheirTurn(roomSeatName(r, r.turn)) : '';
    const tc = r.st === 'play' && !r.rt ? look.seatColor?.(r.turn) : undefined;
    ui.turn.style.color = tc ?? '';
    ui.round.textContent = r.rounds && !r.rt ? loc.fmt.roomRound(r.round, r.rounds) : '';
    ui.time.hidden = ui.clock.hidden = r.st !== 'play' || !r.turnMs;
    if (r.st !== 'play') ui.clock.textContent = '';
    ui.pass.hidden = !r.pass || r.st !== 'play' || watching; ui.pass.disabled = !mine;
    ui.resign.hidden = r.st !== 'play' || r.seats[r.me]?.away === 2 || watching; // 이미 빠진 자리(기권)는 다시 기권하지 않는다
    ui.unwatch.hidden = !watching;
    const note = watching ? (r.seats.length ? loc.fmt.roomWatchNote(r.delayS ?? 0, r.watchers ?? 0, !!r.queued) : loc.fmt.roomWatchPending(r.delayS ?? 0)) : look.note?.() ?? '';
    ui.note.textContent = note; ui.note.hidden = !note;
    voteLine(ui.voteB, r.st === 'play' ? r : { ...r, vote: null });
    // 결과 창
    if (r.st === 'over') {
      // 등수로 끝낸 판(셋 이상): 내 등수가 큰 글, 아래에 모든 자리의 등수·점수. 아니면 이김/짐/비김. 구경꾼은 1등(이긴 사람)의 이름
      const ranks = r.ranks ?? [], scores = r.scores ?? [], rank = ranks[r.me] ?? 0, ranked = ranks.filter((k) => k > 0).length > 2 && (rank > 0 || watching);
      const tied = ranked && ranks.some((k, i) => i !== r.me && k === rank), last = Math.max(...ranks);
      const res = ranked ? (rank === 1 ? (tied ? 2 : 0) : rank === last ? 1 : 3) : r.win === -2 ? 2 : r.win === r.me ? 0 : 1;
      const top = r.win >= 0 ? roomSeatName(r, r.win) : '';
      const base = watching ? (top ? `${loc.fmt.roomRankRow(1, top, '')}` : t('roomDraw')) : ranked ? (rank === 1 && !tied ? t('roomWin') : loc.fmt.roomRankTitle(rank, tied)) : t(res === 0 ? 'roomWin' : res === 1 ? 'roomLose' : 'roomDraw');
      ui.endTitle.textContent = (!watching && look.title?.()) || base;
      ui.endTitle.className = `rbig r${watching ? 2 : res}`;
      ui.endWhy.textContent = loc.fmt.roomWhy(r.why);
      ui.endRanks.hidden = !ranked;
      ui.endRanks.innerHTML = !ranked ? '' : r.seats.map((_, i) => i).filter((i) => ranks[i] > 0).sort((a, b) => ranks[a] - ranks[b] || a - b).map((i) => {
        const color = look.seatColor?.(i);
        const text = loc.fmt.roomRankRow(ranks[i], roomSeatName(r, i), scores.length ? loc.fmt.roomScore(scores[i] ?? 0) : '');
        const stats = r.seats[i].cpu || !anyRecord() ? '' : ` data-stats="${i}"`;
        return `<div class="rrank${i === r.me ? ' mine' : ''}"${stats}${color ? ` style="color:${esc(color)}"` : ''}>${esc(text)}</div>`;
      }).join('');
      const gone = r.seats.some((s, i) => i !== r.me && !s.cpu && !s.empty && s.away !== 0);
      ui.again.hidden = watching;
      ui.again.disabled = gone || r.seats[r.me]?.again === 1 || !!r.vote;
      // 같은 무리로 다음 판: 방장이 있는 판은 방장만 (떠난 사람이 있어도 된다)
      ui.regroup.hidden = watching || !r.regroup || (r.lead !== undefined && r.lead !== r.me);
      ui.endNote.textContent = watching ? loc.fmt.roomWatchNote(r.delayS ?? 0, r.watchers ?? 0, !!r.queued) : gone ? t('roomFoeGoneNote') : r.seats[r.me]?.again ? t('roomAgainWaitNote') : '';
      voteLine(ui.voteE, r);
      $('roomToLobby').textContent = t(watching ? 'roomWatchLeave' : 'roomToLobby');
    }
  }
  const anyRecord = () => !!lobby.defs?.some((d) => d.record);

  /** 판에 앉지 않은 대기실: 판·자리 수 고르기, 코드·비밀번호, 목록과 쪽 */
  function renderIdle(loc: ReturnType<typeof L>, d: RoomDefView | undefined): void {
    const defs = lobby.defs ?? [];
    ui.defs.hidden = defs.length < 2;
    ui.defs.innerHTML = defs.length < 2 ? '' : defs.map((x) => btn(defName(x.id), `data-def="${esc(x.id)}"`, x.id === (d?.id ?? '') ? 'go' : 'plain')).join('');
    const range = d && d.min < d.max ? Array.from({ length: d.max - d.min + 1 }, (_, i) => d.min + i) : [];
    ui.sizes.hidden = range.length < 2;
    const cur = size || d?.max || 0;
    ui.sizes.innerHTML = range.length < 2 ? '' : `<span class="note">${esc(t('roomSeatsPick'))}</span>` + range.map((n) => btn(loc.fmt.roomSeatsN(n), `data-size="${n}"`, n === cur ? 'go' : 'plain')).join('');
    ui.codeRow.hidden = !defs.some((x) => x.codes);
    ui.passRow.hidden = !passFor;
    ui.statsMine.hidden = !anyRecord();
    // 목록: 기다리는 판(들어가기)과, 구경할 수 있는 판이면 두는 중인 판(구경)
    const many = defs.length > 1, watchable = (x: RoomRow) => !!defs[x[6] ?? 0]?.watch;
    const shown = lobby.rows.filter((x) => x[4] === 0 || (x[4] === 1 && watchable(x)));
    const pages = Math.max(1, Math.ceil(shown.length / PAGE));
    page = Math.min(page, pages - 1);
    const rows = shown.slice(page * PAGE, page * PAGE + PAGE);
    const head = (x: RoomRow) => `${many ? `[${defName(defs[x[6] ?? 0]?.id ?? '')}] ` : ''}`;
    ui.list.innerHTML = rows.length
      ? rows.map((x) => {
        const lock = x[7] ?? 0, tag = lock ? ` ${loc.fmt.roomLock(lock)}` : '';
        return x[4] === 0
          ? `<div class="mrow"><span>${esc(head(x) + loc.fmt.roomHostWaits(x[1], x[2], x[3]) + tag)}</span>${btn(t('roomJoin'), `data-room="${x[0]}" data-lock="${lock}"`)}</div>`
          : `<div class="mrow"><span>${esc(head(x) + loc.fmt.roomPlayRow(x[1], x[2], x[8] ?? 0) + tag)}</span>${btn(t('roomWatch'), `data-watch="${x[0]}"`, 'plain')}</div>`;
      }).join('')
      : `<div class="note">${esc(t(lobby.cpu ? 'roomNoneCpu' : 'roomNone'))}</div>`;
    ui.pager.hidden = pages < 2;
    ui.pageNo.textContent = loc.fmt.roomPage(page + 1, pages);
    ui.prev.disabled = page === 0; ui.next.disabled = page >= pages - 1;
    ui.playing.textContent = loc.fmt.roomPlaying(lobby.rows.filter((x) => x[4] === 1).length);
  }

  /** 기다리는 판: 기다림의 글, 방 코드·공개 설정, 자리마다 준비와 방장의 단추, 규칙, 투표, 준비·시작 */
  function renderWait(loc: ReturnType<typeof L>, r: RoomView): void {
    const waited = (performance.now() - waitSince) / 1000, left = (s: number) => (s ? Math.max(0, Math.ceil(s - waited)) : 0);
    const seated = r.seats.filter((s) => !s.empty).length, min = r.min ?? r.seats.length;
    const hasLead = r.lead !== undefined, amLead = hasLead ? r.lead === r.me : r.seats.findIndex((s) => !s.empty && !s.cpu) === r.me;
    // 모인 만큼으로 먼저 시작할 판이면 컴퓨터의 초는 적지 않는다 (방장의 판은 저절로 시작하지 않는다)
    const startIn = !hasLead && seated >= min ? left(lobby.startAfterS ?? 0) : 0, cpuIn = hasLead || (startIn > 0 && (lobby.startAfterS ?? 0) <= lobby.cpuAfterS) ? 0 : left(lobby.cpuAfterS);
    ui.waitText.textContent = loc.fmt.roomWaiting(seated, r.seats.length, cpuIn, min, startIn);
    // 방 코드와 공개 설정
    ui.codeBox.hidden = !r.code;
    ui.codeShow.textContent = r.code ? `${t('roomCode')} ${r.code}` : '';
    ui.privRow.hidden = !r.code || !amLead;
    if (r.privacy && document.activeElement !== ui.privSel && document.activeElement !== ui.privPass) { ui.privSel.value = r.privacy; ui.privPass.hidden = r.privacy !== 'password'; }
    // 자리: 방장·준비 표시, 방장은 내보내기·넘기기, 투표가 있는 판은 내보내기 투표
    const showSeats = hasLead || r.vote !== undefined;
    ui.waitSeats.innerHTML = !showSeats ? '' : r.seats.map((s, i) => {
      if (s.empty) return `<div class="mrow empty"><span class="note">${esc(t('roomEmpty'))}</span></div>`;
      const tag = r.lead === i ? t('roomLeadTag') : s.cpu ? '' : s.ready ? t('roomReadyTag') : hasLead ? t('roomWaitTag') : '';
      const acts = i === r.me || s.cpu ? '' : amLead && hasLead
        ? btn(t('roomGive'), `data-give="${i}"`, 'plain') + btn(t('roomKick'), `data-kick="${i}"`, 'plain')
        : r.vote !== undefined && !r.vote ? btn(t('roomKickVote'), `data-kickvote="${i}"`, 'plain') : '';
      return `<div class="mrow${r.me === i ? ' mine' : ''}${s.ready || r.lead === i ? ' ready' : ''}"><span class="what"><span class="iname">${esc(roomSeatName(r, i))}</span>${tag ? ` <span class="note">${esc(tag)}</span>` : ''}</span><span class="acts">${acts}</span></div>`;
    }).join('');
    // 규칙 (RoomDef.options): 방장은 고르고, 투표가 있는 판의 다른 사람은 그 값으로 투표를 낸다
    const list = Object.entries(lobby.defs?.find((x) => x.id === (r.def ?? lobby.defs?.[0]?.id))?.opts ?? {});
    const canPick = amLead || (r.vote !== undefined && !r.vote);
    ui.opts.innerHTML = !list.length || !r.opts ? '' : `<div class="note sub">${esc(t('roomRules'))}</div>` + list.map(([k, vs]) => `<div class="btns rpick"><span class="note">${esc(optName(k))}</span>${vs.map((v) => btn(optValue(k, v), `data-opt="${esc(k)}" data-val="${esc(String(v))}"${typeof v === 'number' ? ' data-num="1"' : ''}`, r.opts![k] === v ? 'go' : 'plain', !canPick || r.opts![k] === v)).join('')}</div>`).join('');
    voteLine(ui.voteW, r);
    // 시작: 방장(방장이 없으면 가장 먼저 앉은 사람)이 min 이상 모이면. 방장의 판은 다 차도 방장이 누른다
    ui.startNow.hidden = !(amLead && seated >= min && (hasLead || (min < r.seats.length && seated < r.seats.length)));
    ui.startNow.textContent = hasLead ? `${t('roomGo')} (${seated})` : loc.fmt.roomStartNow(seated);
    const meReady = r.seats[r.me]?.ready === 1;
    ui.readyBtn.hidden = !hasLead || amLead;
    ui.readyBtn.textContent = t(meReady ? 'roomUnready' : 'roomReady');
    ui.readyBtn.className = meReady ? 'plain' : 'go';
    ui.waitCpu.hidden = ui.waitCpu.hidden || !amLead;
  }
  render();
}
