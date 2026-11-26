// 반딧불 연못의 판 화면: 내 미끼(손패)와 나루 셋의 창, 점수, 나루 누르기(setTapHandler), 단축키, 카메라(내 자리가 늘 화면 아래), 펼친 결과의 알림과 연출.
// 대기실·판의 막대·초읽기·결과 창은 틀의 판 화면(rooms 모듈)이 그린다: 여기서는 setRoomLook으로 자리의 색·막대 아래 글·결과의 큰 글·전적을 더한다.
import { $, addNotices, banner, fitZoom, mountPanel, myRoom, myRoomTurn, onEffect, onKey, onMsg, onRoomChange, roomSeatName, S, send, setCameraAim, setCameraYaw, setRoomLook, setTapHandler, sfx, view } from '@engine/client';
import { forInput, L, onLangChange } from '@engine/client/i18n';
import { CAMERA } from '../shared/content';
import { POND, seatAngle, seatSpot } from '../shared/content/pond';
import type { PondRecord, PondView } from '../shared/pond';
import { fishJump, SEAT_CSS } from './scene';
import './pond.css';

/** 틀의 판 상태(RoomView)의 모양: 입구에 그 타입이 없어 myRoom()에서 끌어낸다 (docs/proof-pond.md 빈 곳 16) */
type RoomView = NonNullable<ReturnType<typeof myRoom>>;

let pond: PondView | null = null;
let rec: PondRecord = { games: 0, wins: 0, best: 0 };
/** 고른 미끼 (손패의 자리, -1 없음) */
let sel = -1;
let lastShown = 0;

export function mountTable(): void {
  mountPanel('hud', `
    <div class="panel free" id="pondPanel" hidden>
      <div class="row pondHead"><span class="ttitle" id="pondCast"></span><span class="note" id="pondMine"></span></div>
      <div id="pondScores"></div>
      <div id="pondSpots"></div>
      <div class="note" id="pondTip"></div>
      <div id="pondHand"></div>
    </div>`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** 자리의 이름: 컴퓨터는 자리의 색을 붙여 서로 가른다 (틀의 이름은 모두 '컴퓨터') */
const seatName = (r: RoomView, i: number) => (i === r.me ? S.me?.name ?? roomSeatName(r, i) : r.seats[i]?.cpu ? L().fmt.pondCpu(i) : roomSeatName(r, i));
const canCast = () => !!pond && myRoomTurn() && !pond.mine && pond.next === myRoom()?.me;

/** 미끼를 고르거나(같은 것을 다시 누르면 풀기), 고른 미끼가 있으면 그 나루에 던진다 */
function pick(i: number): void {
  if (!pond || i < 0 || i >= pond.hand.length) return;
  sel = sel === i ? -1 : i;
  draw();
}
function castAt(spot: number): void {
  if (!pond || !canCast() || sel < 0 || sel >= pond.hand.length) { draw(); return; }
  send({ t: 'cast', value: pond.hand[sel], spot });
  sel = -1;
}

function draw(): void {
  const panel = $('pondPanel'), r = myRoom();
  panel.hidden = !pond || !r || r.st === 'wait';
  if (panel.hidden || !pond || !r) return;
  const loc = L();
  $('pondCast').textContent = loc.fmt.roomRound(pond.cast, pond.casts);
  $('pondMine').textContent = pond.mine ? loc.fmt.pondMine(loc.fmt.pondSpot(pond.mine.spot), pond.mine.value) : '';
  // 점수: 자리마다 (선에는 표시, 다음에 던질 사람은 밝게, 던진 사람은 찌 표시)
  $('pondScores').innerHTML = r.seats.map((_, i) => {
    const cls = ['seat', i === r.me ? 'me' : '', i === pond!.next ? 'next' : '', pond!.rank[i] === 1 ? 'top' : ''].join(' ');
    const lead = i === pond!.leader && r.st === 'play' ? '<b class="lead">★</b>' : '';
    const threw = pond!.thrown[i] >= 0 ? `<i class="threw">${esc(loc.fmt.pondSpotKey(pond!.thrown[i]))}</i>` : '';
    const rank = pond!.rank[i] ? `<i class="rank">${esc(loc.fmt.pondRank(pond!.rank[i], pond!.scores[i]))}</i>` : `<i>${esc(loc.fmt.pondScore(pond!.scores[i], pond!.caught[i]))}</i>`;
    return `<div class="${cls}" style="--seat:${SEAT_CSS[i]}">${lead}<span class="nm">${esc(seatName(r, i))}</span>${threw}${rank}</div>`;
  }).join('');
  // 나루 셋: 물고기의 크기와 이번 던지기의 찌 수. 고른 미끼가 있고 내 차례면 누를 수 있다
  const ready = canCast() && sel >= 0;
  $('pondSpots').innerHTML = pond.fish.map((f, s) => {
    const n = pond!.thrown.filter((x) => x === s).length;
    return `<button type="button" class="spot${ready ? ' ready' : ''}" data-spot="${s}"${ready ? '' : ' disabled'}><b>${esc(loc.fmt.pondSpot(s))}</b><span class="fish">${esc(loc.fmt.pondFish(f))}</span><span class="bob">${esc(loc.fmt.pondThrown(n))}</span><kbd>${'ZXC'[s]}</kbd></button>`;
  }).join('');
  // 손패: 내 차례가 아니어도 고를 수는 있다 (미리 생각)
  $('pondHand').innerHTML = pond.hand.length
    ? pond.hand.map((v, i) => `<button type="button" class="card${i === sel ? ' sel' : ''}" data-card="${i}"><b>${v}</b><kbd>${i + 1}</kbd></button>`).join('')
    : `<span class="note">${esc(loc.ui.pondEmptyHand)}</span>`;
  $('pondTip').textContent = r.st !== 'play' ? loc.ui.pondRules : canCast() ? forInput(loc.ui.pondPick) : loc.ui.pondWait;
}

/** 펼친 결과의 한 줄 알림 (나루마다: 낚은 사람과 미끼, 또는 못 낚은 까닭) */
function announce(v: PondView): void {
  const r = myRoom(), last = v.last;
  if (!r || !last || last.n === lastShown) return;
  lastShown = last.n;
  const loc = L();
  const lines = last.spots.map((sp, s) => {
    const tang = sp.tangled.length ? ` · ${loc.fmt.pondTangle(sp.tangled.join(', '))}` : '';
    if (sp.win >= 0) return loc.fmt.pondCatch(loc.fmt.pondSpot(s), seatName(r, sp.win), sp.baits.find(([i]) => i === sp.win)?.[1] ?? 0, sp.fish) + tang;
    const loose = sp.baits.filter(([, x]) => !sp.tangled.includes(x)).map(([, x]) => x);
    return loc.fmt.pondMiss(loc.fmt.pondSpot(s), loose.length ? Math.max(...loose) : 0, sp.fish) + tang;
  });
  const mine = last.spots.some((sp) => sp.win === r.me);
  banner(loc.fmt.pondRevealTitle(last.n), mine ? 'good' : '', lines.join('\n'));
  if (mine) sfx.fanfare(); else sfx.pickup();
}

export function initTable(): void {
  onMsg('me', (m) => {
    if (m.k === 'pond') {
      const v = m.s as PondView | null;
      if (!v) { pond = null; sel = -1; lastShown = 0; draw(); return; }
      if (pond && v.hand.length !== pond.hand.length) sel = -1;
      // 처음 받은 판(들어옴, 다시 접속)은 지난 결과를 다시 알리지 않는다
      const fresh = !pond;
      pond = v;
      if (!v.last) lastShown = 0;
      if (fresh) lastShown = v.last?.n ?? 0; else announce(v);
      draw();
    } else if (m.k === 'pondRec') rec = m.s as PondRecord;
  });
  $('pondHand').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-card]'); if (b) pick(Number(b.dataset.card)); });
  $('pondSpots').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]'); if (b) castAt(Number(b.dataset.spot)); });
  for (let k = 1; k <= POND.hand; k++) onKey(String(k), () => { if (myRoom()) pick(k - 1); });
  ['z', 'x', 'c'].forEach((key, s) => onKey(key, () => { if (myRoom()) castAt(s); }));

  // 판에 앉은 동안 땅 누르기는 나루 고르기: 누른 땅에서 가장 가까운 나루 (1.8m 안)
  setTapHandler((sx, sy) => {
    if (!myRoom()) return false;
    const at = view.pick(sx, sy);
    if (!at) return true;
    let best = -1, d = 1.8;
    POND.spots.forEach((sp, s) => { const k = Math.hypot(sp.x - at.x, sp.z - at.z); if (k < d) { d = k; best = s; } });
    if (best >= 0) castAt(best);
    return true;
  });

  // 연출: 낚이면 물고기가 그 자리 쪽으로 뛰고, 못 낚으면 제자리에서 한 바퀴. 찌가 떨어지면 소리
  onEffect('catch', (id, [win]) => { const e = S.others.get(id); if (e) fishJump(e.model, seatSpot(win)); });
  onEffect('miss', (id) => { const e = S.others.get(id); if (e) fishJump(e.model, null); });
  onEffect('toss', () => sfx.skill());

  // 카메라: 판에 앉으면 연못 전체를 화면 한가운데에, 내 자리가 화면 아래에 오게 돌린다
  // 아래쪽에 내 미끼 창이 덮으므로 연못이 화면의 조금 위에 오게, 비추는 곳을 내 자리 쪽으로 2.4m 당긴다
  setCameraAim(() => {
    const r = myRoom();
    if (!r) return null;
    const me = seatSpot(r.me), k = 2.4 / Math.hypot(me.x, me.z);
    return { x: me.x * k, z: me.z * k, zoom: Math.min(CAMERA.zoomMax, fitZoom(-8.6, -8.6, 8.6, 8.6)), center: true };
  });
  onRoomChange((_before, r) => {
    setCameraYaw(r ? seatAngle(r.me) : 0);
    if (!r) { pond = null; sel = -1; lastShown = 0; }
    draw();
  });

  // 틀의 판 화면에 더하는 것: 자리의 글자 색, 막대 아래 줄, 결과 창의 큰 글(내 등수), 대기실의 전적
  setRoomLook({
    seatColor: (i) => SEAT_CSS[i] ?? '',
    note: () => {
      const r = myRoom();
      if (!pond || !r || r.st !== 'play') return '';
      return L().fmt.pondTurnNote(pond.cast, seatName(r, pond.leader));
    },
    title: () => {
      const r = myRoom();
      if (!pond || !r || r.st !== 'over' || !pond.rank[r.me]) return '';
      return L().fmt.pondRank(pond.rank[r.me], pond.scores[r.me]);
    },
    lobby: () => L().fmt.pondRecord(rec.games, rec.wins, rec.best),
  });
  addNotices({ feed: ['pondBad'], quiet: ['roomStart'] });
  onLangChange(draw);
}
