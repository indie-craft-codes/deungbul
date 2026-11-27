// 알림의 종류와 규칙 (U1 디자인 체계: docs/making-a-game.md 24절 '알림 규칙'). 한 소식은 **한 곳에만** 뜬다.
//   가운데 알림(banner) 지금 보고 있는 화면의 큰 일: 쓰러짐, 레벨 상승, 게임의 큰 일(등불지기의 습격, 장 완료). 2~5초, 한 번에 하나(차례로)
//   흘러가는 알림(feed) 내가 방금 한 일의 결과와 거절 사유: 처치, 바치기, 구매, '골드가 모자랍니다'. 몇 초 뒤 사라진다 (토스트)
//   위험 알림(alert)    보고 있지 않은 쪽(다른 모드·뒤에서 잇는 일)의 위험과 바로 가기 단추. 손으로 닫거나 12초 (dangerAlert)
//   상태 줄(status)     지금의 상태를 짧은 낱말로 (게임의 작은 표시·단계 막대). 사건의 문장을 되풀이하지 않는다 (게임의 몫)
//   대화창(log)         사람들의 말과 나중에 다시 볼 만한 소식의 기록. 가운데·위험 알림으로 뜬 줄은 기록에만 남고 접힌 대화의 한 줄 미리 보기에는 나오지 않는다(echo)
// 틀이 막는 중복: 같은 글이 가운데 알림·위험 알림에 이미 떠 있으면 다시 띄우지 않는다. 위험 알림이 뜬 소식은 가운데 알림으로 띄우지 않는다(routeNotice).
// 결과 창(단계)이 떠 있는 동안 가운데 알림은 띄우지 않는다 (style.css).
// 여기 적힌 것은 틀의 안내문(engine/shared/messages.ts)의 분류다. 게임이 더한 안내문은 게임의 모듈이 addNotices로 자기 분류를 등록한다 (이 게임: games/deungbul/client/words.ts).
import type { MsgArg, MsgKey } from '../../shared/messages';
import { $ } from '../app';
import { L, forInput, onLangChange } from '../i18n';
import { logText } from './chat';

type Tone = '' | 'good' | 'bad';
/** 가운데 알림의 덧붙는 줄을 만드는 함수 (안내문의 값을 받는다). 덧붙일 것이 없으면 빈 문자열 */
type Sub = (a: MsgArg[]) => string;
const BANNER: Partial<Record<MsgKey, Tone>> = {
  died: 'bad',
  levelUp: 'good', bossUp: 'bad', bossDown: 'good', dungeonEnter: '', dungeonClear: 'good', dungeonFail: 'bad', awayBack: 'good',
};
const BANNER_SUB: Partial<Record<MsgKey, Sub>> = {};
const FEED = new Set<MsgKey>([
  'kill', 'bought', 'classChanged', 'gearDrop', 'gearFull', 'gearSold', 'enhanceOk', 'enhanceFail', 'enhanceDown', 'enhanceSaved', 'enhanceMax', 'reforged', 'reforgeMax', 'marketBound', 'mailNew', 'mailGot', 'mailLeft', 'marketMailFull', 'marketCrowded', 'chatWait', 'marketNeedLv', 'marketGuest', 'marketFull', 'marketPriceBad', 'marketCant', 'marketPosted', 'marketBought', 'marketGone', 'marketOwn', 'marketCanceled', 'guildGuest', 'guildNeedLv', 'guildNameBad', 'guildNameTaken', 'guildCreated', 'guildNotLeader', 'guildBusy', 'guildFull', 'guildInvited', 'guildJoined', 'guildLeft', 'guildYouLeft', 'guildKicked', 'guildGave', 'guildLevelUp', 'guildNone', 'channelMoved', 'channelDungeon', 'channelFight', 'channelWait', 'channelFull', 'statNone', 'statReset', 'skillUp', 'skillMax', 'skillNeedLv', 'dungeonFar', 'dungeonLevel', 'dungeonNoRuns', 'dungeonLeft',
  'noTarget', 'tooFar', 'shopFar', 'notStocked', 'alreadyBest',
  'potionFull', 'noGold', 'noPotion', 'hpFull', 'classFar', 'renameWait', 'loot', 'crafted', 'forgeFar', 'forgeClosed', 'noMats', 'nameBad', 'nameTaken', 'reported', 'reportWait', 'partyInvited', 'partyBusy', 'partyFull', 'partyGone', 'partyDeclined',
]);
/** 대화창에 남기지 않는 안내문 (차례마다 오는 알림처럼 대화를 밀어내는 것). 게임이 addNotices의 quiet로 더한다 */
const QUIET = new Set<MsgKey>();

/**
 * 안내문의 분류를 더한다: 게임이 자기 안내문을 어디에 띄울지 등록한다. 어디에도 적지 않은 안내문은 대화창에만 남는다.
 * banner: 가운데 알림으로 띄울 것과 그 색조. 덧붙는 줄이 있으면 { tone, sub }로 준다. feed: 흘러가는 알림으로 띄울 것.
 * quiet: 대화창에 남기지 않을 것 (banner에도 적었으면 가운데 알림으로만 뜨고, 어디에도 적지 않았으면 아무 데도 뜨지 않는다: 소리·화면은 게임이 따로)
 */
export function addNotices(more: { banner?: Partial<Record<MsgKey, Tone | { tone: Tone; sub: Sub }>>; feed?: readonly MsgKey[]; quiet?: readonly MsgKey[] }, keep = false): void {
  // keep: 이미 분류된 안내문은 그대로 둔다 (틀의 모듈이 게임의 모듈보다 늦게 init되면서 기본 분류를 줄 때: 게임이 먼저 정한 것이 이긴다)
  const known = (k: MsgKey) => keep && (k in BANNER || FEED.has(k) || QUIET.has(k));
  for (const [k, v] of Object.entries(more.banner ?? {}) as [MsgKey, Tone | { tone: Tone; sub: Sub }][]) {
    if (known(k)) continue;
    if (typeof v === 'string') BANNER[k] = v;
    else { BANNER[k] = v.tone; BANNER_SUB[k] = v.sub; }
  }
  for (const k of more.feed ?? []) if (!known(k)) FEED.add(k);
  for (const k of more.quiet ?? []) QUIET.add(k);
}

const ui = { banner: $('banner'), bannerText: $('bannerText'), bannerSub: $('bannerSub'), feed: $('feed'), flash: $('flash') };
/** 안내문을 가로채 다른 곳에 띄우는 길 (틀의 모드: 보고 있지 않은 쪽의 위험 → 위험 알림). 참을 돌려주면 그 안내문은 가운데·흘러가는 알림으로 띄우지 않는다 */
const routes: ((k: MsgKey, a: MsgArg[], text: string) => boolean)[] = [];
export function routeNotice(fn: (k: MsgKey, a: MsgArg[], text: string) => boolean): void { routes.push(fn); }
const queue: { text: string; sub: string; tone: Tone; stale?: () => boolean }[] = [];
let showing = false;

function next(): void {
  let b = queue.shift();
  while (b?.stale?.()) b = queue.shift(); // 차례를 기다리는 사이에 뜻이 없어진 알림은 건너뛴다
  if (!b) { showing = false; ui.banner.hidden = true; return; }
  showing = true;
  ui.bannerText.textContent = b.text;
  ui.bannerSub.textContent = b.sub;
  ui.bannerSub.hidden = !b.sub;
  ui.banner.className = 'banner ' + b.tone;
  ui.banner.hidden = false;
  // 글이 길수록 조금 더 오래 둔다
  // 좁은 화면에서는 알림이 화면을 더 많이 가리니 짧게 둔다 (검토 7: 폰에서 4초 넘게 가운데를 가렸다)
  const narrow = window.innerWidth <= 720;
  setTimeout(next, (narrow ? 2000 : 2600) + Math.min(narrow ? 1400 : 2400, (b.text.length + b.sub.length) * 40));
}

/** 화면 가운데 위에 크게 뜨는 알림. 여러 개가 겹치면 차례로 보여 준다. stale이 참을 돌려주면 차례가 와도 띄우지 않는다. */
export function banner(text: string, tone: Tone = '', sub = '', stale?: () => boolean): void {
  // 같은 글이 이미 떠 있거나(가운데 알림·위험 알림) 차례를 기다리면 다시 넣지 않는다
  if ((!ui.banner.hidden && ui.bannerText.textContent === text) || queue.some((q) => q.text === text) || alertShows(text)) return;
  if (queue.length > 4) queue.shift(); // 너무 밀리면 오래된 것부터 버린다
  queue.push({ text, sub, tone, stale });
  if (!showing) next();
}

/** 잠깐 떴다 사라지는 한 줄 알림 */
export function feed(text: string): void {
  // 같은 문장이 이미 떠 있으면 쌓지 않는다 (다가가는 동안 기술을 연달아 눌렀을 때 등)
  for (const c of ui.feed.children) if (c.textContent === text) return;
  const d = document.createElement('div');
  d.textContent = text;
  ui.feed.appendChild(d);
  while (ui.feed.children.length > 4) ui.feed.firstChild?.remove();
  setTimeout(() => d.remove(), 4500);
}

// ---------- 위험 알림: 보고 있지 않은 쪽의 위험 + 바로 가기 ----------
let alertBox: HTMLElement | null = null;
let alertTimer = 0;
const alertShows = (text: string): boolean => !!alertBox && !alertBox.hidden && alertBox.querySelector('.alertText')?.textContent === text;
/** 위험 알림을 닫는다 */
export function closeDangerAlert(): void { if (alertBox) alertBox.hidden = true; clearTimeout(alertTimer); }
/**
 * 위험 알림 (보고 있지 않은 쪽의 위험): 붉은 띠에 글과 바로 가기 단추·닫기. 손으로 닫거나 12초 뒤 사라진다.
 * 구역 밖에 둔다(홈 같은 페이지 위에도 보이게): PC는 화면 가운데 아래, 폰은 화면 가운데. 같은 글이 가운데 알림에 떠 있으면 그것을 거둔다 (한 곳에만)
 */
export function dangerAlert(text: string, go?: { label: string; onClick: () => void }): void {
  if (!alertBox) {
    alertBox = document.createElement('div');
    alertBox.id = 'alertBox'; alertBox.className = 'alertBox'; alertBox.setAttribute('role', 'alert'); alertBox.hidden = true;
    alertBox.innerHTML = '<span class="alertText"></span><button type="button" class="alertGo"></button><button type="button" class="alertX btn-ghost" aria-label="×">×</button>';
    alertBox.querySelector('.alertX')!.addEventListener('click', closeDangerAlert);
    $('hud').append(alertBox);
  }
  alertBox.querySelector('.alertText')!.textContent = text;
  const btn = alertBox.querySelector<HTMLButtonElement>('.alertGo')!;
  btn.hidden = !go;
  btn.textContent = go?.label ?? '';
  btn.onclick = go ? () => { closeDangerAlert(); go.onClick(); } : null;
  if (!ui.banner.hidden && ui.bannerText.textContent === text) next();
  alertBox.hidden = false;
  clearTimeout(alertTimer);
  alertTimer = window.setTimeout(closeDangerAlert, 12000);
}

// 언어를 바꾸면 떠 있던 알림이 이전 언어로 남는다: 한 줄 알림과 가운데 알림을 지운다 (대화창의 기록은 남긴다)
onLangChange(() => { ui.feed.textContent = ''; queue.length = 0; ui.banner.hidden = true; closeDangerAlert(); });

/** 쓰러졌을 때 화면이 잠깐 어두워졌다 돌아온다 */
function flash(): void {
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth; // 애니메이션을 처음부터 다시 돌리려고 한 번 읽는다
  ui.flash.classList.add('on');
}

/** 서버 안내문을 현재 언어의 문장으로 만들어 알맞은 곳에 보여 준다. */
export function notifySys(k: MsgKey, a: MsgArg[] = []): void {
  const make = L().msg[k];
  const text = make ? forInput(make(a)) : k;
  if (k === 'joined' || k === 'left') return; // 드나드는 소식이 대화와 큰 소식을 밀어낸다
  // 다른 곳(위험 알림)이 가져간 안내문: 기록에만 남긴다
  for (const fn of routes) if (fn(k, a, text)) { if (!QUIET.has(k)) logText(text, true); return; }
  if (FEED.has(k)) { feed(text); return; }
  const tone = BANNER[k];
  if (!QUIET.has(k)) logText(text, tone !== undefined);
  if (tone !== undefined) banner(text, tone, BANNER_SUB[k]?.(a) ?? '');
  if (k === 'died') flash();
}
