// 경쟁의 화면 (묶음 8): 서버의 짝은 engine/server/game/systems/boards.ts·ranked.ts·queue.ts, 모양은 engine/shared/defs/compete.ts.
//   순위표 (boards 모듈)  메뉴 '소식 › 순위표' 탭: 순위표 고르기(칩), 기간과 초기화까지, 내 순위 카드, 위 줄들, 내 위아래, 지난 기간의 1~3등
//   랭크 (ranked 모듈)    순위표 탭 맨 위의 내 등급 카드(배치 n/10·등급·레이팅·승패·시즌 최고·시즌 끝), 대기실의 내 등급 한 줄, 큐 대기 띠(기다린 시간·예상·범위·[취소]),
//                         결과 창의 레이팅 변화(+12)·배치 진행·반영 안 함, 이탈 제재(큐 금지 남은 분)
// 게임이 고칠 것: 등급의 이름(COMPETE.tiers의 name: 게임의 언어 파일), 순위표의 이름(BoardDef.name), 사다리의 이름(판의 이름: setRoomLook의 defName과 같은 fmt.roomDefName).
import { competeRules, type BoardTab, type BoardView, type LeaveMe, type QueueMe, type RatingMe } from '../../shared/defs';
import type { RoomView } from '../../shared/defs/rooms';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { uiText } from '../i18n/names';
import { send } from '../net';
import { hasModule } from '../mods';
import { addMenuTab } from './menu';
import { button, el, emptyState, redraw } from './menu/parts';
import { addNotices } from './notify';
import { myRoom, onRoomChange } from './rooms';
import { mountPanel } from './shell';

let tabs: BoardTab[] = [];
let board: BoardView | null = null;
let pick = '';
let ratings: RatingMe[] = [];
let queue: QueueMe | null = null;
let leave: LeaveMe | null = null;
/** 큐 띠의 초를 매끄럽게: 받은 때 (performance.now)와 그때의 기다린 초 */
let queueAt = 0;

/** 등급의 이름 (COMPETE.tiers: 게임의 문장 키) */
export function tierName(i: number): string { const d = competeRules()?.tiers?.[i]; return d ? uiText.get(d.name) : ''; }
/** 순위표의 이름: 틀의 것(boardPower·boardRating, 사다리가 여럿이면 'boardRating:<사다리>'), 게임의 문장 키 */
export function boardName(name: string): string {
  if (name.startsWith('boardRating:')) return L().fmt.boardRatingOf(L().fmt.roomDefName(name.slice(12)));
  return uiText.get(name);
}
/** 순위표의 값 (fmt) */
function valueText(tab: Pick<BoardTab, 'fmt'>, v: number, x?: string): string {
  const loc = L();
  if (tab.fmt === 'power') {
    const [lv, cls] = (x ?? '').split(':');
    return `${loc.fmt.power(v)}${lv ? ` · ${loc.fmt.level(Number(lv), loc.classes[cls as keyof typeof loc.classes]?.name ?? '')}` : ''}`;
  }
  if (tab.fmt === 'rating') return loc.fmt.boardRatingV(v);
  if (tab.fmt === 'stage') return loc.fmt.boardStage(Math.floor(v / 100), v % 100);
  return loc.fmt.boardNum(v);
}
const ask = (id?: string) => send({ t: 'board', ...(id ? { id } : {}) });

/** 등급 카드 하나 (메뉴의 순위표 탭 맨 위) */
function ratingCard(r: RatingMe, many: boolean): HTMLElement {
  const loc = L(), box = el('gbanner rcard');
  box.setAttribute('role', 'group');
  const title = many ? loc.fmt.boardRatingOf(loc.fmt.roomDefName(r.id)) : t('rankedMine');
  box.setAttribute('aria-label', title);
  box.append(el('note', title));
  const big = r.n < r.need ? loc.fmt.rankedPlacement(r.n, r.need) : r.unsure ? t('rankedUnsure') : r.tier >= 0 ? tierName(r.tier) : t('rankedNoTier');
  box.append(el(`rtier${r.tier >= 0 ? ` t${r.tier}` : ''}`, big));
  const bits = [r.r ? loc.fmt.boardRatingV(r.r) : '', loc.fmt.rankedWL(r.w, r.l, r.dr), r.best >= 0 ? loc.fmt.rankedBest(tierName(r.best)) : '', r.to ? loc.fmt.rankedSeasonEnd(r.season, Math.max(0, r.to - Date.now())) : ''].filter(Boolean);
  box.append(el('note', bits.join(' · ')));
  if (r.n < r.need) {
    const bar = el('progbar'), f = document.createElement('span');
    f.style.transform = `scaleX(${r.n / Math.max(1, r.need)})`;
    bar.append(f); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(r.need)); bar.setAttribute('aria-valuenow', String(r.n));
    bar.setAttribute('aria-label', loc.fmt.rankedPlacement(r.n, r.need));
    box.append(bar);
  }
  return box;
}

/** 메뉴의 순위표 탭 */
function drawBoards(list: HTMLElement): void {
  const loc = L();
  if (hasModule('ranked')) {
    for (const r of ratings) list.append(ratingCard(r, ratings.length > 1));
    if (leave?.ban) list.append(el('lockBand', loc.fmt.queueBannedLeft(leave.ban)));
  }
  if (!tabs.length) { list.append(emptyState('rank', t('boardEmpty'))); return; }
  // 순위표 고르기 (칩)
  const chips = el('btns rpick boardChips');
  chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', t('tabBoards'));
  for (const tb of tabs) {
    const b = button(boardName(tb.name), () => { pick = tb.id; ask(tb.id); });
    const on = tb.id === (board?.id ?? pick);
    b.className = on ? 'go' : 'plain'; b.setAttribute('aria-pressed', String(on));
    chips.append(b);
  }
  list.append(chips);
  const v = board;
  if (!v) { list.append(el('note', t('boardLoading'))); return; }
  list.append(el('note boardPeriod', loc.fmt.boardPeriod(v.period, v.to ? Math.max(0, v.to - Date.now()) : 0)));
  list.append(el('gbanner boardMe', v.me ? loc.fmt.boardMine(v.me[0], valueText(v, v.me[2], v.me[3]), v.n) : t('boardNotIn')));
  if (!v.rows.length) list.append(emptyState('rank', t('boardEmpty')));
  const line = (r: BoardView['rows'][number]) => {
    const mine = !!v.me && v.me[0] === r[0] && v.me[1] === r[1];
    const d = el(`mrow brow${mine ? ' mine' : ''}${r[0] <= 3 ? ` top${r[0]}` : ''}`);
    const what = el('what'); what.append(el('iname', `${r[0]}. ${r[1]}`));
    const acts = el('acts'); acts.append(el('num', valueText(v, r[2], r[3])));
    d.append(what, acts);
    if (mine) d.setAttribute('aria-current', 'true');
    return d;
  };
  for (const r of v.rows) list.append(line(r));
  if (v.around.length) { list.append(el('note boardGap', '⋯')); for (const r of v.around) list.append(line(r)); }
  if (v.prev.length) list.append(el('note boardPrev', loc.fmt.boardPrev(v.prev.map((r) => `${r[0]}. ${r[1]} ${valueText(v, r[2], r[3])}`).join(' · '))));
}

/** boards 모듈: 메뉴의 '순위표' 탭 */
export function initBoards(): void {
  addMenuTab({ id: 'boards', label: () => t('tabBoards'), draw: drawBoards, open: () => ask(pick || undefined), sig: () => [tabs.length, board, ratings, leave?.ban], mod: 'boards' }, 'rank');
  onMsg('board', (m) => { tabs = m.tabs; board = m.s; if (m.s) pick = m.s.id; redraw(); });
}

/** ranked 모듈: 내 등급, 큐 띠, 결과 창의 레이팅 변화 */
export function initRanked(): void {
  mountPanel('hud', `
    <div class="panel" id="queueBand" role="status" aria-live="polite" hidden>
      <span class="qdot" aria-hidden="true"></span><span id="queueText"></span><button type="button" class="plain" id="queueCancel"></button>
    </div>`);
  const band = $('queueBand'), text = $('queueText'), cancel = $<HTMLButtonElement>('queueCancel');
  cancel.addEventListener('click', () => send({ t: 'queue', a: 'leave' }));
  const label = () => { cancel.textContent = t('queueCancel'); renderBand(); renderLobby(); renderEnd(myRoom()); };
  addNotices({
    banner: { rankedPlaced: 'good', rankedTier: 'good', rankedSeason: '', queueFound: 'good', leavePenalty: 'bad' },
    feed: ['rankedVoid', 'queueOn', 'queueOff', 'queueBanned', 'leaveWarn', 'afkOut', 'replayNone'],
  });
  onMsg('me', (m) => {
    if (m.k === 'rating') { ratings = (m.s as RatingMe[] | null) ?? []; renderLobby(); renderEnd(myRoom()); redraw(); }
    else if (m.k === 'queue') { queue = m.s as QueueMe | null; queueAt = performance.now(); renderBand(); renderLobby(); }
    else if (m.k === 'leave') { leave = m.s as LeaveMe | null; renderLobby(); }
  });
  onRoomChange((_b, now) => renderEnd(now));
  onSlow(renderBand);
  onLangChange(label);
  label();

  function renderBand(): void {
    band.hidden = !queue;
    if (!queue) return;
    const loc = L(), waited = queue.waited + Math.floor((performance.now() - queueAt) / 1000);
    text.textContent = loc.fmt.queueBand(loc.fmt.roomDefName(queue.def), waited, queue.est, queue.range, !!queue.bots);
  }
  /** 대기실의 내 등급 한 줄과 큐 금지 */
  function renderLobby(): void {
    const box = $('roomCompete') as HTMLElement | null;
    if (!box) return;
    const loc = L(), bits: string[] = [];
    for (const r of ratings) {
      const name = ratings.length > 1 ? `${loc.fmt.roomDefName(r.id)}: ` : '';
      bits.push(name + (r.n < r.need ? loc.fmt.rankedPlacement(r.n, r.need) : r.unsure ? t('rankedUnsure') : `${r.tier >= 0 ? tierName(r.tier) + ' · ' : ''}${loc.fmt.boardRatingV(r.r)}`));
    }
    if (leave?.ban) bits.push(loc.fmt.queueBannedLeft(leave.ban));
    box.hidden = !bits.length;
    box.textContent = bits.length ? `${t('rankedMine')} — ${bits.join(' / ')}` : '';
  }
  /** 결과 창: 랭크 판의 레이팅 변화 (+12), 배치 진행, 반영 안 함 */
  function renderEnd(r: RoomView | null): void {
    const box = $('roomEndRating') as HTMLElement | null;
    if (!box) return;
    if (!r || r.st !== 'over' || !r.rated || r.watch) { box.hidden = true; box.textContent = ''; return; }
    const loc = L(), me = ratings.find((x) => x.id === (r.def ?? x.id)) ?? ratings[0];
    const last = me?.last && me.last.room === r.id ? me.last : null;
    box.hidden = false;
    box.className = `rrating${last && last.d > 0 ? ' up' : last && last.d < 0 ? ' down' : ''}`;
    box.textContent = !me || !last ? t('rankedVoidNote') : me.n < me.need ? loc.fmt.rankedPlacement(me.n, me.need) : loc.fmt.rankedDelta(me.r, last.d, last.tier >= 0 ? tierName(last.tier) : '');
  }
}
