// 카드 목록과 카드 상세 (묶음 C의 9: docs/screens.md 2.6·9.2의 9·9.5의 (바)): 메뉴의 영웅 탭을 격자로.
//   목록: 칸 = 초상 + 등급 색 테두리 + 별 + 레벨 + 편성 표시, 없는 것은 흑백. 정렬(등급·전투력·레벨·새로 얻음)·거르기(역할·등급)는 이 기기에 기억한다.
//   상세(한 화면): 큰 그림, 성장(레벨·공격·체력·전투력·[레벨 업]), 돌파(조각 막대·[별 올리기]), 기술, 변신 시 능력치, 재료 교환,
//   바로 가기(편성에 넣기·빼기, 이 모습으로 변신, 성장 자세히), 좌우 넘기기(‹ ›). 못 누르는 단추는 까닭을 단다 (parts.button의 why).
// 카드의 공통 손질(HERO_RULES.cards: 합성·잠금·환원·일괄 성장·넘친 조각)을 켠 게임은 hud/cardgrow.ts가 머리·칸·상세에 단추를 더한다.
// 데이터와 단추의 일은 collect.ts가 넘긴다 (CardData). 게임이 더 할 수 있는 것: setHeroPic(초상 그림), setCardActions({ morph }) (변신 바로 가기).
import { HERO_RARITIES, HERO_ROLES, HERO_RULES, heroDef, heroRole, heroIds, isSkillId, type Coin, type HeroesMe } from '../../shared/defs';
import { L, t } from '../i18n';
import { heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { heroRows, squadToggle, tradeViews, type HeroRow } from './collectcalc';
import { button, el, span } from './menu/parts';
import { openMenu } from './menu';
import { morphStatsOf } from './morph';
import { tintRarity } from './rarity';
import { closeScreen, openScreen, dropScreen } from './screens';
import { S } from '../state';
import { platform } from '../platform';
import { cardCell, cardGoButtons, cardGrowButtons, cardStarExtras, drawCardHead, tradeHidden } from './cardgrow';

/** collect.ts가 넘기는 것: 내 영웅·편성·뽑은 때·레벨 업 재화·그림·성장 자세히 */
export interface CardData {
  heroes: HeroesMe; squad: readonly string[]; size: number; money: number; cur: Coin;
  /** 그 영웅을 마지막으로 뽑은 때 (ms, 없으면 0) */
  gotAt: (id: string) => number;
  pic: (id: string) => string | undefined;
  /** 장비를 넣은 전투력의 셈 (collect.ts의 myHeroGear) */
  gear: Parameters<typeof heroRows>[3];
  /** 성장 자세히(herogrow)가 있으면 그 영웅을 연다 */
  grow?: (id: string) => void;
}
type Sort = 'rarity' | 'power' | 'level' | 'new';
const SORTS: readonly Sort[] = ['rarity', 'power', 'level', 'new'];
const SORT_KEY = { rarity: 'cdSortRarity', power: 'cdSortPower', level: 'cdSortLevel', new: 'cdSortNew' } as const;
interface Prefs { sort: Sort; role: string; rar: number }
const PREF = 'dg.cards';
let prefs: Prefs = { sort: 'rarity', role: '', rar: -1 };
let loaded = false;
/** 이 기기에 기억한 정렬·거르기 (플랫폼의 저장소: 처음 그릴 때 한 번 읽는다) */
function loadPrefs(): void {
  if (loaded) return;
  loaded = true;
  try { const v = JSON.parse(platform().storage.get(PREF) ?? 'null') as Partial<Prefs> | null; if (v && SORTS.includes(v.sort as Sort)) prefs = { sort: v.sort as Sort, role: String(v.role ?? ''), rar: Number(v.rar ?? -1) }; } catch { /* 저장소가 없어도 된다 */ }
}
const savePrefs = (): void => { try { platform().storage.set(PREF, JSON.stringify(prefs)); } catch { /* */ } };

let actions: { morph?: (id: string) => void } = {};
/** 카드 상세의 바로 가기를 게임이 정한다 (morph: '이 모습으로 변신'. 없고 변신 모듈이 있으면 메뉴의 변신 탭) */
export function setCardActions(a: { morph?: (id: string) => void }): void { actions = a; }

let data: (() => CardData) | null = null;
let openId = '';
const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(9, n)));
const mk = (tag: string, cls: string, text?: string): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** 정렬과 거르기를 거친 줄 (가진 것 먼저) */
function rowsOf(d: CardData): HeroRow[] {
  const rows = heroRows(d.heroes, d.money, d.squad, d.gear).filter((r) => (!prefs.role || heroDef(r.id)?.role === prefs.role) && (prefs.rar < 0 || r.rarity === prefs.rar));
  const by: Record<Sort, (a: HeroRow, b: HeroRow) => number> = {
    rarity: (a, b) => b.rarity - a.rarity || b.power - a.power,
    power: (a, b) => b.power - a.power,
    level: (a, b) => b.lv - a.lv || b.rarity - a.rarity,
    new: (a, b) => d.gotAt(b.id) - d.gotAt(a.id) || b.rarity - a.rarity,
  };
  return rows.sort((a, b) => Number(b.owned) - Number(a.owned) || by[prefs.sort](a, b));
}

/** 메뉴의 영웅 탭: 도구 줄(정렬·거르기) + 격자 */
export function drawCardList(list: HTMLElement, get: () => CardData, redraw: () => void): void {
  data = get;
  loadPrefs();
  const d = get(), loc = L();
  const owned = heroIds().filter((id) => d.heroes[id]).length;
  const bar = el('mbar cardbar');
  const sort = document.createElement('select');
  sort.setAttribute('aria-label', t('cdSort'));
  for (const s of SORTS) sort.add(new Option(`${t('cdSort')}: ${t(SORT_KEY[s])}`, s, false, s === prefs.sort));
  sort.addEventListener('change', () => { prefs.sort = sort.value as Sort; savePrefs(); redraw(); });
  const roleIds = Object.keys(HERO_ROLES);
  const chips = el('mchips cardchips');
  const chip = (text: string, on: boolean, fn: () => void) => { const b = button(text, fn); b.classList.toggle('on', on); chips.append(b); };
  chip(t('cdAll'), !prefs.role && prefs.rar < 0, () => { prefs.role = ''; prefs.rar = -1; savePrefs(); redraw(); });
  for (const r of roleIds) chip(uiText.get(HERO_ROLES[r].name), prefs.role === r, () => { prefs.role = prefs.role === r ? '' : r; savePrefs(); redraw(); });
  HERO_RARITIES.forEach((_, i) => { const b = (() => { chip(rarityName(i), prefs.rar === i, () => { prefs.rar = prefs.rar === i ? -1 : i; savePrefs(); redraw(); }); return chips.lastElementChild as HTMLElement; })(); tintRarity(b, i); b.classList.add('rarchip'); });
  bar.append(sort, span('note cardcount', loc.fmt.cdOwned(owned, heroIds().length)), chips);
  list.append(bar);
  drawCardHead(list, d.heroes);
  const grid = el('cardgrid');
  for (const r of rowsOf(d)) {
    const c = tintRarity(mk('button', 'cardcell' + (r.owned ? '' : ' off') + (r.inSquad ? ' insq' : '')), r.rarity) as HTMLButtonElement;
    c.type = 'button'; c.dataset.id = r.id;
    const face = mk('div', 'cardface'), img = d.pic(r.id);
    if (img) { const i = document.createElement('img'); i.src = img; i.alt = ''; i.loading = 'lazy'; face.append(i); } else face.textContent = [...heroName(r.id)][0] ?? '?';
    if (r.inSquad) face.append(mk('span', 'cardsq', '◆'));
    c.append(face, mk('b', 'cardname', heroName(r.id)), mk('small', 'cardmeta', r.owned ? `${stars(r.stars)} Lv${r.lv}` : t('heroNotOwned')));
    if (r.canStar) c.classList.add('dot');
    cardCell(c, r, d.heroes);
    c.addEventListener('click', () => openCard(r.id));
    grid.append(c);
  }
  list.append(grid);
  if (openId) drawDetail();
}

// ---------- 카드 상세 ----------
let sheet: HTMLElement | null = null;
function sheetEl(): HTMLElement {
  if (sheet) return sheet;
  sheet = mk('div', 'panel cardDetail');
  sheet.id = 'cardDetail'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  document.body.append(sheet);
  return sheet;
}
/** 카드 상세를 연다 (화면 쌓기의 sheet: 뒤로 가기가 닫는다) */
export function openCard(id: string): void {
  openId = id;
  const s = sheetEl();
  s.hidden = false;
  openScreen('cardDetail', { kind: 'sheet', el: s, close: () => { openId = ''; s.hidden = true; } });
  drawDetail();
}
function closeCard(): void { closeScreen('cardDetail'); }
/** 상태가 바뀌었다 (영웅·편성·재화): 상세가 열려 있으면 다시 그린다 */
export function redrawCard(): void {
  if (!openId || !data) return;
  // 바뀐 것이 있을 때만 (재화 알림이 올 때마다 다시 그리면 누르던 단추가 사라진다)
  const d = data(), key = JSON.stringify([openId, d.heroes[openId], d.squad, d.money, S.me?.items, L().code]);
  if (key === lastKey) return;
  drawDetail();
}
let lastKey = '';

function section(title: string): HTMLElement { const sec = mk('section', 'cdsec'); sec.append(mk('h4', '', title)); return sec; }
function meter(have: number, need: number): HTMLElement { const m = mk('i', 'cdbar'), f = mk('span', ''); f.style.transform = `scaleX(${need > 0 ? Math.min(1, have / need) : 1})`; m.append(f); return m; }

function drawDetail(): void {
  const s = sheetEl();
  if (!openId || !data) { s.hidden = true; dropScreen('cardDetail'); return; }
  const d = data(), loc = L(), all = rowsOf(d);
  lastKey = JSON.stringify([openId, d.heroes[openId], d.squad, d.money, S.me?.items, loc.code]);
  const r = heroRows(d.heroes, d.money, d.squad, d.gear).find((x) => x.id === openId);
  if (!r) { closeCard(); return; }
  const at = all.findIndex((x) => x.id === r.id);
  s.textContent = '';
  tintRarity(s, r.rarity);
  // 머리: 넘기기 · 이름 · 닫기
  const head = mk('div', 'sthead cdhead');
  const prev = button('‹', () => { const p = all[(at - 1 + all.length) % all.length]; if (p) { openId = p.id; drawDetail(); } }), next = button('›', () => { const n = all[(at + 1) % all.length]; if (n) { openId = n.id; drawDetail(); } });
  prev.className = 'btn-ghost cdnav'; next.className = 'btn-ghost cdnav';
  prev.disabled = next.disabled = all.length < 2 || at < 0;
  const x = button('×', closeCard); x.className = 'btn-ghost cdx'; x.setAttribute('aria-label', t('cdClose'));
  head.append(prev, mk('h3', 'cdname', heroName(r.id)), next, x);
  s.append(head);
  // 그림과 요약
  const top = mk('div', 'cdtop' + (r.owned ? '' : ' off'));
  const face = mk('div', 'cdface'), img = d.pic(r.id);
  if (img) { const i = document.createElement('img'); i.src = img; i.alt = ''; face.append(i); } else face.textContent = [...heroName(r.id)][0] ?? '?';
  const sum = mk('div', 'cdsum');
  const role = heroRole(r.id);
  sum.append(mk('div', 'cdrar', `${rarityName(r.rarity)} · ${uiText.get(role.name)}`), mk('div', 'cdstars', stars(r.stars)));
  if (r.owned) sum.append(mk('div', 'cdlv', loc.fmt.heroLv(r.lv, r.maxLv)), mk('div', 'cdstats', loc.fmt.heroStats(r.atk, r.hp, r.power)));
  else sum.append(mk('div', 'note', t('heroNotOwned')));
  if (r.inSquad) sum.append(span('hsq', t('tabSquad')));
  top.append(face, sum);
  s.append(top);
  if (r.owned) {
    // 성장: 레벨 막대와 레벨 업
    const grow = section(t('cdGrow'));
    grow.append(meter(r.lv, r.maxLv));
    const lvBtn = button(r.levelCost ? `${t('heroLevelBtn')} · ${loc.fmt.heroCost(r.levelCost, HERO_RULES.levelCur)}` : t('heroMax'), () => send({ t: 'hero', a: 'level', id: r.id }), !r.canLevel,
      r.levelCost && !r.canLevel ? loc.fmt.cdWhyGold(r.levelCost) : '');
    lvBtn.className = lvBtn.classList.contains('has-why') ? 'btn-primary has-why' : 'btn-primary';
    grow.append(lvBtn);
    cardGrowButtons(grow, r);
    s.append(grow);
    // 돌파: 조각
    const star = section(t('cdStar'));
    star.append(meter(r.shards, r.starNeed || 1), mk('div', 'note', r.starNeed ? loc.fmt.heroShards(r.shards, r.starNeed) : t('heroMax')));
    if (r.starNeed) star.append(button(t('heroStarBtn'), () => send({ t: 'hero', a: 'star', id: r.id }), !r.canStar, r.canStar ? '' : loc.fmt.cdWhyShards(r.shards, r.starNeed)));
    cardStarExtras(star, r, d.heroes);
    for (const tv of tradeHidden(r.id, d.heroes) ? [] : tradeViews(r.id, r.owned, S.me?.items ?? {})) star.append(button(loc.fmt.heroTradeBtn(tv.item, tv.cost, tv.shards), () => send({ t: 'hero', a: 'trade', id: r.id, item: tv.item }), !tv.can));
    s.append(star);
  }
  // 기술
  const sk = role.skill, skill = section(t('cdSkill'));
  if (sk && isSkillId(sk)) { const n = loc.skills[sk]; skill.append(mk('b', 'cdskill', n?.name ?? sk), mk('div', 'note', n?.info ?? '')); }
  else skill.append(mk('div', 'note', t('cdNoSkill')));
  s.append(skill);
  // 변신 시 능력치 (변신의 능력치 대체 방식: 변신 탭과 같은 셈)
  const ms = hasModule('morph') ? morphStatsOf(r.id) : null;
  if (ms) { const m = section(t('cdMorph')); m.append(mk('div', 'cdstats', loc.fmt.morphStats(ms.s.hp, ms.s.atk))); s.append(m); }
  // 바로 가기
  const go = mk('div', 'stbtns cdgo');
  if (r.owned && hasModule('squad')) {
    const full = !r.inSquad && d.squad.length >= d.size;
    go.append(button(r.inSquad ? t('cdFromSquad') : t('cdToSquad'), () => send({ t: 'squad', ids: squadToggle(d.squad, r.id, d.size) }), full, full ? t('cdSquadFull') : ''));
  }
  if (r.owned && ms && (actions.morph || hasModule('morph'))) go.append(button(t('cdMorphGo'), () => { closeCard(); if (actions.morph) actions.morph(r.id); else openMenu('morph'); }));
  if (r.owned && d.grow) go.append(button(t('cdGrowMore'), () => { closeCard(); d.grow!(r.id); }));
  cardGoButtons(go, r, d.heroes);
  if (go.childElementCount) s.append(go);
}
