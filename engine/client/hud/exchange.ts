// 교환 상점 (묶음 D: docs/screens.md 2.7·9.2의 11, 쓰는 법은 docs/making-a-game.md 27절): 뽑기 탭의 배너마다 '교환' → 창 하나.
//   천장의 표식 (BannerDef.markName이 있으면 그 이름: 메아리 계약 '울림 표식 n/40') — n번째 뽑기는 그 등급 확정
//   교환 표식 (BannerDef.exchange): n/값, 바꿀 수 있는 영웅 줄([교환]: 모자라면 'n개 더'), 기간이 끝날 때 남은 표식의 규칙
//   영웅 선택권 (GACHA_RULES.select): 가진 수와 고를 영웅 (예전 뽑기 탭 끝의 줄과 같은 명령)
//   확률과 어긋나지 않음: 교환은 확률을 바꾸지 않는다는 한 줄 (확률표는 같은 탭의 '확률 보기')
// 서버의 짝은 engine/server/game/systems/gacha.ts (명령 { t: 'gacha', a: 'trade', id, hero }, 개인 상태 gacha.pts).
import { BANNER_TABLE, HERO_RULES, SELECT_TICKETS, exchangeHeroes, heroDef, pityKey } from '../../shared/defs';
import { L, t } from '../i18n';
import { bannerName, heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { send } from '../net';
import { S } from '../state';
import { button, el, progBar, whyOf } from './menu/parts';
import { tintRarity } from './rarity';
import { closeScreen, openScreen } from './screens';
import type { GachaMe, HeroesMe } from '../../shared/defs';

let pop: HTMLElement | null = null;
let cur = '';
let src: { gacha: () => GachaMe; heroes: () => HeroesMe } | null = null;
/** 뽑기 탭(collect.ts)이 자기 상태를 넘긴다 */
export function bindExchange(s: { gacha: () => GachaMe; heroes: () => HeroesMe }): void { src = s; }

/** 이 배너에 교환 창을 열 것이 있는가 (천장·교환·선택권 가운데 하나) */
export const hasExchange = (id: string): boolean => { const b = BANNER_TABLE[id]; return !!b && (!!b.pity || !!b.exchange || Object.keys(SELECT_TICKETS).length > 0); };
/** 천장의 표식 한 줄 ('울림 표식 32 / 40'). 천장이 없으면 빈 글 (뽑기 요약도 쓴다) */
export function markText(id: string): string {
  const b = BANNER_TABLE[id], g = src?.gacha();
  if (!b?.pity || !g) return '';
  const n = g.pity[pityKey(id)] ?? 0;
  return L().fmt.gxMeter(b.markName ? uiText.get(b.markName) : t('gxPityName'), n, b.pity.after);
}

let sig = '';
function draw(): void {
  if (!pop || pop.hidden || !src) return;
  const b = BANNER_TABLE[cur], g = src.gacha(), heroes = src.heroes(), loc = L();
  if (!b) return;
  const key = pityKey(cur), pts = g.pts?.[key] ?? 0, cnt = g.pity[key] ?? 0;
  const mine = JSON.stringify([cur, cnt, pts, heroes, S.me?.items, loc.code]);
  if (mine === sig) return;
  sig = mine;
  pop.textContent = '';
  const head = el('sthead');
  const h = document.createElement('h3'); h.textContent = `${t('gxTitle')} · ${bannerName(cur)}`;
  const x = button('×', () => closeScreen('gxPop')); x.className = 'plain stclose';
  head.append(h, x);
  pop.append(head);
  // 천장의 표식
  if (b.pity) {
    const sec = el('gxSec');
    sec.append(el('gxMeter', markText(cur)), progBar(cnt / Math.max(1, b.pity.after)), el('note', loc.fmt.gxPityRule(rarityName(b.pity.rarity), b.pity.after)));
    pop.append(sec);
  }
  // 교환 표식과 목록
  const x2 = b.exchange;
  if (x2) {
    const name = x2.name ? uiText.get(x2.name) : t('gxMark'), cost = Math.max(1, x2.cost);
    const sec = el('gxSec');
    sec.append(el('gxMeter', loc.fmt.gxMeter(name, pts, cost)), progBar(Math.min(1, pts / cost)), el('note', loc.fmt.gxCost(name, cost)));
    const list = exchangeHeroes(b);
    if (!list.length) sec.append(el('note', t('gxEmpty')));
    for (const id of list) {
      const r = heroDef(id)?.rarity ?? 0, owned = heroes[id];
      const line = el('gxRow');
      const nm = el('iname', heroName(id)); tintRarity(nm, r);
      const sub = el('note', `${rarityName(r)}${owned ? ` · ${loc.fmt.heroLv(owned[0], HERO_RULES.maxLv(owned[1]))}` : ` · ${t('heroNotOwned')}`}`);
      const go = button(t('gxTrade'), () => send({ t: 'gacha', a: 'trade', id: cur, hero: id }), pts < cost);
      go.className = 'stgo'; go.dataset.hero = id;
      if (pts < cost) whyOf(go, loc.fmt.gxShort(cost - pts));
      const txt = el('gxWho'); txt.append(nm, sub);
      line.append(txt, go);
      sec.append(line);
    }
    const end = x2.end ?? 'keep';
    sec.append(el('note', typeof end === 'object' ? loc.fmt.gxEnd('cur', end.cur, end.rate) : loc.fmt.gxEnd(end, '', 0)));
    pop.append(sec);
  }
  // 영웅 선택권 (가방의 선택권)
  for (const [item, ids] of Object.entries(SELECT_TICKETS)) {
    const have = S.me?.items[item] ?? 0, sec = el('gxSec');
    sec.append(el('gxMeter', t('gachaSelectHead')), el('note', loc.fmt.gachaSelectHave(item, have)));
    for (const id of ids) {
      const r = heroDef(id)?.rarity ?? 0, line = el('gxRow'), nm = el('iname', heroName(id)); tintRarity(nm, r);
      const go = button(t('gachaSelectBtn'), () => send({ t: 'gacha', a: 'select', item, hero: id }), have <= 0);
      const txt = el('gxWho'); txt.append(nm, el('note', rarityName(r)));
      line.append(txt, go);
      sec.append(line);
    }
    pop.append(sec);
  }
  pop.append(el('note gxOdds', t('gxOdds')));
}
/** 교환 창을 연다 (뽑기 탭의 배너마다의 '교환' 단추) */
export function openExchange(id: string): void {
  if (!BANNER_TABLE[id]) return;
  cur = id; sig = '';
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'gxPop'; pop.className = 'panel stsheet gxPop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
    document.body.append(pop);
  }
  pop.hidden = false;
  openScreen('gxPop', { kind: 'sheet', el: pop, close: () => { if (pop) pop.hidden = true; } });
  draw();
}
/** 상태가 바뀌면 (collect.ts가 부른다) */
export const redrawExchange = (): void => draw();
