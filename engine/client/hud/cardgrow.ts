// 카드의 공통 손질 화면 (HERO_RULES.cards를 적은 게임만: 셈은 engine/shared/defs/cardgrow.ts, 서버는 systems/cardgrow.ts).
//   카드 목록 머리   합성(등급마다 '쓸 수 있는 조각 n / need → 위 등급 카드 하나' + [합성] → 확인 창: 쓸 조각·확률), [별 모두 올리기]
//   격자 칸         잠금 표시(🔒), 성장 점(별을 올릴 수 있다·넘친 조각을 바꿀 수 있다·범용 조각을 더하면 별을 올릴 수 있다)
//   카드 상세       [×5] [최대까지] 레벨, [별 모두], 넘친 조각 '조각 n → 결정 m' [바꾸기], [잠금], [환원] (확인 창: 돌려받을 것)
//   편성 탭         [추천 편성] (전투력이 큰 카드부터)
//   뽑기 결과       넘친 조각이 바뀐 것 '조각 n → 결정 m' (hud/gachashow.ts가 overflowText를 부른다)
// 명령 단추는 U2의 명령 상태(cmdstate: 보냄 → 됨/안 됨)를 그대로 쓴다: 누름 안에서 send. 합성의 결과는 축하 카드(reward.ts)로.
import { HERO_RULES, autoSquad, heroTradeShards, heroTrades, tradeFits, bulkLevel, bulkStars, cardMaxed, cardRules, fuseFrom, fuseHave, fuseNeed, fusePick, fusePool, growthOf, heroDef, heroFull, overflowGot, resetBack, type HeroesMe, type ItemId, type PullGot } from '../../shared/defs';
import { L, t } from '../i18n';
import { heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { send } from '../net';
import { S } from '../state';
import { confirmAsk } from './confirm';
import { button, el, span } from './menu/parts';
import { addNotices, routeNotice } from './notify';
import { celebrate } from './reward';
import type { HeroRow } from './collectcalc';

type Line = HeroesMe[string];
/** 카드 손질을 켠 게임인가 */
export const cardsOn = (): boolean => !!cardRules();
const R = () => cardRules() ?? {};
const locked = (h: Line | undefined): boolean => h?.[5] === 1;
const money = (): number => (S.me ? (HERO_RULES.levelCur === 'gold' ? S.me.gold : S.me.sparks) : 0);
const itemName = (id: string): string => L().items[id as ItemId]?.name ?? uiText.get(id);
const asOwned = (heroes: HeroesMe) => Object.fromEntries(Object.entries(heroes).map(([id, h]) => [id, { ...growthOf(h), shards: h[2] ?? 0 }]));

/** 넘친 조각을 바꿀 수 있는가 (다 키웠고 조각이 남았다) */
function canConvert(h: Line | undefined): boolean {
  if (!h || !R().overflow) return false;
  const g = growthOf(h);
  return cardMaxed(g) && (h[2] ?? 0) > 0;
}

// ---------- 카드 목록 머리: 합성, 별 모두 ----------
/** 카드 목록의 머리 (격자 위). 합성이 없고 일괄 성장도 없으면 아무것도 그리지 않는다 */
export function drawCardHead(list: HTMLElement, heroes: HeroesMe): void {
  if (!cardsOn()) return;
  const loc = L(), owned = asOwned(heroes), isLocked = (id: string) => locked(heroes[id]);
  const froms = fuseFrom();
  if (froms.length) {
    const box = el('cgfuse');
    box.id = 'cgFuse';
    box.append(el('ghd', t('cgFuseHead')), el('note', t('cgFuseInfo')));
    for (const r of froms) {
      const have = fuseHave(r, owned, isLocked), need = fuseNeed(r), can = have >= need;
      const line = el('cgfrow');
      line.append(span('cgfwhat', loc.fmt.cgFuseRow(rarityName(r), have, need, rarityName(r + 1))));
      line.append(button(t('cgFuse'), () => askFuse(r, heroes), !can, can ? '' : loc.fmt.cgFuseShort(need - have)));
      box.append(line);
    }
    list.append(box);
  }
  if (R().bulk) {
    const any = Object.values(heroes).some((h) => bulkStars(h[1], h[2]).n > 0);
    const b = button(t('cgStarsAll'), () => send({ t: 'card', a: 'stars' }), !any, any ? '' : t('cgStarsNone'));
    b.id = 'cgStarsAll';
    list.append(b);
  }
}

/** 합성 확인 창: 쓸 조각(카드마다), 줄 카드와 확률 */
function askFuse(r: number, heroes: HeroesMe): void {
  const loc = L(), pick = fusePick(r, asOwned(heroes), (id) => locked(heroes[id]));
  if (!pick) return;
  const pool = fusePool(r + 1), pct = loc.fmt.ratePct(1 / Math.max(1, pool.length));
  confirmAsk(t('cgFuseTitle'), loc.fmt.cgFuseText(fuseNeed(r), rarityName(r), rarityName(r + 1)), [
    loc.fmt.cgFuseUse(pick.map(([id, n]) => `${heroName(id)} ${n}`).join(', ')),
    loc.fmt.cgFuseOdds(pool.map(heroName).join(', '), pct),
    t('cgFuseLock'),
  ], t('cgFuse'), () => send({ t: 'card', a: 'fuse', r }));
}

// ---------- 격자 칸 ----------
/** 격자의 칸 하나를 꾸민다: 잠금 표시와 성장 점 */
export function cardCell(c: HTMLElement, r: HeroRow, heroes: HeroesMe): void {
  if (!cardsOn() || !r.owned) return;
  const h = heroes[r.id];
  if (locked(h)) { const m = span('cglock', '🔒'); m.setAttribute('aria-label', t('cgLocked')); c.querySelector('.cardface')?.append(m); }
  // 성장 점: 별(틀이 이미 단다), 바꿀 넘친 조각, 가진 범용 조각을 더하면 별을 올릴 수 있다
  // (레벨은 점을 달지 않는다: 골드가 넉넉하면 편성의 카드마다 늘 켜져 점이 뜻을 잃는다)
  if (canConvert(h) || (!r.canStar && r.starNeed > 0 && r.shards + wildFor(r.rarity) >= r.starNeed)) c.classList.add('dot');
}
/** 그 등급의 카드에 쓸 수 있는 범용 조각으로 얻을 조각의 수 (가진 것 모두) */
function wildFor(rarity: number): number {
  let n = 0;
  for (const [item, tr] of Object.entries(heroTrades())) {
    if (!tr.only || !tradeFits(tr, rarity)) continue;
    const per = Math.floor(tr.cost(rarity));
    if (per > 0) n += Math.floor((S.me?.items[item] ?? 0) / per) * heroTradeShards(tr, rarity);
  }
  return n;
}
/** 재료 교환 단추를 감추는가: 넘친 조각을 켠 게임에서 다 키운 카드 (조각이 결정으로 바뀔 뿐이다) */
export const tradeHidden = (id: string, heroes: HeroesMe): boolean => !!R().overflow && !!heroes[id] && cardMaxed(growthOf(heroes[id]));

// ---------- 카드 상세 ----------
/** 성장 칸에 [×5] [최대까지] (일괄 성장) */
export function cardGrowButtons(sec: HTMLElement, r: HeroRow): void {
  if (!R().bulk || !r.owned || !r.levelCost) return;
  const loc = L(), m = money(), five = bulkLevel(r.id, r.lv, r.stars, 5, m), max = bulkLevel(r.id, r.lv, r.stars, Infinity, m);
  // 두 레벨 넘게 남았는데 두 번 올릴 값이 없으면 그 까닭 (한 레벨만 남았으면 위의 [레벨 업]으로 충분하다)
  if (r.maxLv - r.lv < 2) return;
  const why = (n: number) => (n < 2 ? loc.fmt.cdWhyGold(bulkLevel(r.id, r.lv, r.stars, 2, Infinity).cost) : '');
  const row = el('stbtns cgbulk');
  row.append(
    button(loc.fmt.cgLevels(Math.max(five.n, Math.min(5, r.maxLv - r.lv)), five.n >= 2 ? five.cost : bulkLevel(r.id, r.lv, r.stars, 5, Infinity).cost, HERO_RULES.levelCur), () => send({ t: 'card', a: 'levels', id: r.id, n: 5 }), five.n < 2, why(five.n)),
    button(loc.fmt.cgLevelsMax(max.n >= 2 ? max.n : r.maxLv - r.lv, max.n >= 2 ? max.cost : bulkLevel(r.id, r.lv, r.stars, Infinity, Infinity).cost, HERO_RULES.levelCur), () => send({ t: 'card', a: 'levels', id: r.id, n: 0 }), max.n < 2, why(max.n)),
  );
  sec.append(row);
}
/** 돌파 칸에: [별 모두 +n] (일괄 성장), 다 키운 카드의 넘친 조각 */
export function cardStarExtras(sec: HTMLElement, r: HeroRow, heroes: HeroesMe): void {
  if (!cardsOn() || !r.owned) return;
  const loc = L(), h = heroes[r.id], o = R().overflow;
  if (R().bulk) { const s = bulkStars(r.stars, r.shards); if (s.n >= 2) sec.append(button(loc.fmt.cgStarsUp(s.n, s.cost), () => send({ t: 'card', a: 'stars', id: r.id }))); }
  if (o && h && cardMaxed(growthOf(h))) {
    const n = h[2] ?? 0;
    sec.append(el('note cgmax', loc.fmt.cgMaxed(itemName(o.item), overflowGot(r.rarity, 1))));
    if (n > 0) { const b = button(loc.fmt.cgConvert(n, itemName(o.item), overflowGot(r.rarity, n)), () => send({ t: 'card', a: 'convert', id: r.id })); b.id = 'cgConvert'; sec.append(b); }
  }
}
/** 바로 가기 줄에: [잠금], [환원] */
export function cardGoButtons(go: HTMLElement, r: HeroRow, heroes: HeroesMe): void {
  if (!cardsOn() || !r.owned) return;
  const h = heroes[r.id], isLocked = locked(h), loc = L();
  if (R().lock) { const b = button(isLocked ? t('cgUnlock') : t('cgLock'), () => send({ t: 'card', a: 'lock', id: r.id, on: !isLocked })); b.id = 'cgLockBtn'; go.append(b); }
  if (R().reset && h) {
    const back = resetBack(r.id, growthOf(h)), why = isLocked ? t('cgResetLocked') : !back ? t('cgResetNone') : '';
    const b = button(t('cgReset'), () => {
      if (!back) return;
      const parts = [...Object.entries(back.cur).map(([c, n]) => loc.fmt.heroCost(n, c)), ...Object.entries(back.items).map(([i, n]) => `${itemName(i)} ${n}`)];
      confirmAsk(t('cgResetTitle'), loc.fmt.cgResetText(heroName(r.id), r.lv), [loc.fmt.cgResetBack(parts.join(', ') || '-'), t('cgResetKeep')], t('cgReset'), () => send({ t: 'card', a: 'reset', id: r.id }));
    }, !!why, why);
    b.id = 'cgResetBtn';
    go.append(b);
  }
}

// ---------- 편성 탭 ----------
/** 편성 탭의 [추천 편성]: 가진 카드를 전투력이 큰 차례로 */
export function drawAutoSquad(list: HTMLElement, heroes: HeroesMe, ids: readonly string[], size: number): void {
  if (!R().auto) return;
  const power = Object.fromEntries(Object.entries(heroes).map(([id, h]) => [id, heroDef(id) ? heroFull(id, growthOf(h)).power : 0]));
  const best = autoSquad(power, size), same = best.length === ids.length && best.every((id) => ids.includes(id));
  const b = button(t('cgAuto'), () => send({ t: 'squad', ids: best }), !best.length || same, same ? t('cgAutoSame') : '');
  b.id = 'cgAuto';
  list.append(b);
}

// ---------- 뽑기 결과 ----------
/** 넘친 조각이 바뀐 결과의 글 (없으면 빈 글) */
export function overflowText(g: PullGot): string {
  const o = R().overflow;
  return o && g.x ? L().fmt.cgOverflow(g.n, itemName(o.item), g.x) : '';
}

export function initCardGrow(): void {
  if (!cardsOn()) return;
  addNotices({ feed: ['cardOverflow', 'cardLock', 'cardReset', 'cardStars'], fail: ['cardFuseNo', 'cardIsLocked', 'cardNoReset', 'cardFull', 'cardStarsNone'] });
  // 합성의 결과는 축하 카드로 (한 곳에만: 대화창 기록에는 남는다)
  routeNotice((k, a) => {
    if (k !== 'cardFused') return false;
    const loc = L(), hero = String(a[1]), o = R().overflow;
    celebrate({ kind: 'reward', title: t('cgFused'), big: heroName(hero), sub: loc.fmt.cgFusedSub(rarityName(heroDef(hero)?.rarity ?? 0), Number(a[2]) === 1, Number(a[3]), Number(a[4]), o ? itemName(o.item) : '') });
    return true;
  });
}
