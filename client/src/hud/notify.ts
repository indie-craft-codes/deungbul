// 알림을 중요도에 따라 세 곳에 나눠 보여 준다.
//   가운데 알림(banner): 놓치면 안 되는 일. 습격의 시작과 결과, 쓰러짐, 장 완료, 레벨 상승, 구역 진입
//   흘러가는 알림(feed):  방금 한 일의 결과. 처치, 바치기, 구매, 거절 사유. 몇 초 뒤 사라진다
//   대화창(log):         사람들의 말과, 나중에 다시 볼 만한 소식
// 이렇게 나누지 않으면 처치 알림이 대화와 중요한 소식을 밀어낸다.
import { RESIDENTS } from '../../../shared/defs';
import { S } from '../state';
import type { MsgArg, MsgKey } from '../../../shared/messages';
import { $ } from '../app';
import { L } from '../i18n';
import { logText } from './chat';

type Tone = '' | 'good' | 'bad';
const BANNER: Partial<Record<MsgKey, Tone>> = {
  raidSoon: 'bad', raidStart: 'bad', raidWon: 'good', raidLost: 'bad', died: 'bad',
  questDone: 'good', levelUp: 'good', residentBack: 'good', towerLit: 'good', stageChanged: '', bossUp: 'bad', bossDown: 'good', dungeonEnter: '', dungeonClear: 'good', dungeonFail: 'bad',
};
const FEED: ReadonlySet<MsgKey> = new Set<MsgKey>([
  'kill', 'offered', 'bought', 'questStep', 'raidReward', 'tierUp', 'rested', 'awayBack', 'classChanged', 'gearDrop', 'gearFull', 'gearSold', 'enhanceOk', 'enhanceFail', 'enhanceMax', 'mailNew', 'mailGot', 'guildGuest', 'guildNeedLv', 'guildNameBad', 'guildNameTaken', 'guildCreated', 'guildNotLeader', 'guildBusy', 'guildFull', 'guildInvited', 'guildJoined', 'guildLeft', 'guildYouLeft', 'guildKicked', 'guildGave', 'guildLevelUp', 'guildNone', 'channelMoved', 'channelDungeon', 'channelFight', 'channelWait', 'channelFull', 'statNone', 'statReset', 'skillUp', 'skillMax', 'skillNeedLv', 'dungeonFar', 'dungeonLevel', 'dungeonNoRuns', 'dungeonLeft',
  'noTarget', 'tooFar', 'offerFar', 'noSparks', 'towerFull', 'noResident', 'shopFar', 'notStocked', 'alreadyBest',
  'potionFull', 'noGold', 'noPotion', 'hpFull', 'classFar', 'renameWait', 'loot', 'crafted', 'forgeFar', 'forgeClosed', 'noMats', 'nameBad', 'reported', 'reportWait', 'partyInvited', 'partyBusy', 'partyFull', 'partyGone', 'partyDeclined',
]);

const ui = { banner: $('banner'), bannerText: $('bannerText'), bannerSub: $('bannerSub'), feed: $('feed'), flash: $('flash') };
const queue: { text: string; sub: string; tone: Tone }[] = [];
let showing = false;

function next(): void {
  const b = queue.shift();
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

/** 화면 가운데 위에 크게 뜨는 알림. 여러 개가 겹치면 차례로 보여 준다. */
export function banner(text: string, tone: Tone = '', sub = ''): void {
  if (queue.length > 4) queue.shift(); // 너무 밀리면 오래된 것부터 버린다
  queue.push({ text, sub, tone });
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

/** 쓰러졌을 때 화면이 잠깐 어두워졌다 돌아온다 */
function flash(): void {
  ui.flash.classList.remove('on');
  void ui.flash.offsetWidth; // 애니메이션을 처음부터 다시 돌리려고 한 번 읽는다
  ui.flash.classList.add('on');
}

/**
 * 주민의 그림자를 쓰러뜨려 장을 마쳤는데 그 주민이 아직 돌아오지 않았으면, 어떻게 되돌리는지 알려 준다.
 * (장 이름이 주민 id와 같다: bram, mira)
 */
function residentHint(chapter: string): string {
  const i = RESIDENTS.findIndex((r) => r.id === chapter);
  if (i < 0 || S.world.tower.residents[i] >= RESIDENTS[i].need) return '';
  const loc = L();
  return loc.fmt.residentHint(loc.residents[RESIDENTS[i].id].name, RESIDENTS[i].need - S.world.tower.residents[i]);
}

/** 서버 안내문을 현재 언어의 문장으로 만들어 알맞은 곳에 보여 준다. */
export function notifySys(k: MsgKey, a: MsgArg[] = []): void {
  const make = L().msg[k];
  const text = make ? make(a) : k;
  if (k === 'joined' || k === 'left') return; // 드나드는 소식이 대화와 큰 소식을 밀어낸다
  if (FEED.has(k)) { feed(text); return; }
  logText(text);
  const tone = BANNER[k];
  if (tone !== undefined) banner(text, tone, k === 'questDone' ? residentHint(String(a[0])) : '');
  if (k === 'died') flash();
}
