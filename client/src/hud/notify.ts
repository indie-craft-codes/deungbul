// 알림을 중요도에 따라 세 곳에 나눠 보여 준다.
//   가운데 알림(banner): 놓치면 안 되는 일. 습격의 시작과 결과, 쓰러짐, 장 완료, 레벨 상승, 구역 진입
//   흘러가는 알림(feed):  방금 한 일의 결과. 처치, 바치기, 구매, 거절 사유. 몇 초 뒤 사라진다
//   대화창(log):         사람들의 말과, 나중에 다시 볼 만한 소식
// 이렇게 나누지 않으면 처치 알림이 대화와 중요한 소식을 밀어낸다.
// 여기 적힌 것은 틀의 안내문(shared/messages.ts)의 분류다. 게임이 더한 안내문은 게임의 모듈이 addNotices로 자기 분류를 등록한다 (이 게임: game/words.ts).
import type { MsgArg, MsgKey } from '../../../shared/messages';
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
  'kill', 'bought', 'rested', 'classChanged', 'gearDrop', 'gearFull', 'gearSold', 'enhanceOk', 'enhanceFail', 'enhanceMax', 'mailNew', 'mailGot', 'mailLeft', 'marketMailFull', 'marketCrowded', 'chatWait', 'marketNeedLv', 'marketGuest', 'marketFull', 'marketPriceBad', 'marketCant', 'marketPosted', 'marketBought', 'marketGone', 'marketOwn', 'marketCanceled', 'guildGuest', 'guildNeedLv', 'guildNameBad', 'guildNameTaken', 'guildCreated', 'guildNotLeader', 'guildBusy', 'guildFull', 'guildInvited', 'guildJoined', 'guildLeft', 'guildYouLeft', 'guildKicked', 'guildGave', 'guildLevelUp', 'guildNone', 'channelMoved', 'channelDungeon', 'channelFight', 'channelWait', 'channelFull', 'statNone', 'statReset', 'skillUp', 'skillMax', 'skillNeedLv', 'dungeonFar', 'dungeonLevel', 'dungeonNoRuns', 'dungeonLeft',
  'noTarget', 'tooFar', 'shopFar', 'notStocked', 'alreadyBest',
  'potionFull', 'noGold', 'noPotion', 'hpFull', 'classFar', 'renameWait', 'loot', 'crafted', 'forgeFar', 'forgeClosed', 'noMats', 'nameBad', 'nameTaken', 'reported', 'reportWait', 'partyInvited', 'partyBusy', 'partyFull', 'partyGone', 'partyDeclined',
]);

/**
 * 안내문의 분류를 더한다: 게임이 자기 안내문을 어디에 띄울지 등록한다. 어디에도 적지 않은 안내문은 대화창에만 남는다.
 * banner: 가운데 알림으로 띄울 것과 그 색조. 덧붙는 줄이 있으면 { tone, sub }로 준다. feed: 흘러가는 알림으로 띄울 것
 */
export function addNotices(more: { banner?: Partial<Record<MsgKey, Tone | { tone: Tone; sub: Sub }>>; feed?: readonly MsgKey[] }): void {
  for (const [k, v] of Object.entries(more.banner ?? {}) as [MsgKey, Tone | { tone: Tone; sub: Sub }][]) {
    if (typeof v === 'string') BANNER[k] = v;
    else { BANNER[k] = v.tone; BANNER_SUB[k] = v.sub; }
  }
  for (const k of more.feed ?? []) FEED.add(k);
}

const ui = { banner: $('banner'), bannerText: $('bannerText'), bannerSub: $('bannerSub'), feed: $('feed'), flash: $('flash') };
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
  setTimeout(next, 2600 + Math.min(2400, (b.text.length + b.sub.length) * 40));
}

/** 화면 가운데 위에 크게 뜨는 알림. 여러 개가 겹치면 차례로 보여 준다. stale이 참을 돌려주면 차례가 와도 띄우지 않는다. */
export function banner(text: string, tone: Tone = '', sub = '', stale?: () => boolean): void {
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

// 언어를 바꾸면 떠 있던 알림이 이전 언어로 남는다: 한 줄 알림과 가운데 알림을 지운다 (대화창의 기록은 남긴다)
onLangChange(() => { ui.feed.textContent = ''; queue.length = 0; ui.banner.hidden = true; });

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
  if (FEED.has(k)) { feed(text); return; }
  logText(text);
  const tone = BANNER[k];
  if (tone !== undefined) banner(text, tone, BANNER_SUB[k]?.(a) ?? '');
  if (k === 'died') flash();
}
