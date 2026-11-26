// 수집형·방치형의 화면 (roster, gacha, squad 모듈): 메뉴의 '영웅'·'뽑기'·'편성' 탭(addMenuTab), 뽑기 결과 창, 싸우는 영웅의 겉모습(registerKind('hero')).
// 서버의 짝은 engine/server/game/systems/roster.ts, gacha.ts, squad.ts. 셈(줄의 차례, 확률표, 편성 바꾸기)은 hud/collectcalc.ts에 있다.
// 확률표는 서버가 뽑는 셈과 같은 함수(engine/shared/defs/collect.ts의 pullOdds)로 만든다: 배너의 영웅마다·등급마다의 확률, 천장과 10번 뽑기 보장의 규칙과 그때의 확률을 모두 보인다.
// 픽업 배너는 픽업의 몫·반반의 규칙·확정일 때의 표·실효 확률(천장과 반반을 넣은 오랜 평균)·천장을 함께 쓰는 배너·남은 기간·지금의 셈과 확정을 함께 보인다.
// 기간이 있는 배너는 서버가 열려 있다고 보낸 것(GachaMe.open)만 보인다. 영웅 선택권(GACHA_RULES.select)이 있으면 뽑기 탭 끝에 고르는 줄이 붙는다.
// 게임이 더 할 수 있는 것: 뽑기 결과를 받기(onGachaResult: 연출, 소리), 내 영웅·편성 읽기(myHeroes, mySquad).
import * as THREE from 'three';
import { BANNER_TABLE, GACHA_RULES, HERO_RULES, SELECT_TICKETS, SQUAD_RULES, heroDef, heroRole, heroTrades, pctText, rarityDef, type Coin, type GachaMe, type HeroesMe, type PullGot, type SquadMe } from '../../shared/defs';
import { teamCss } from '../../shared/defs/teams';
import { $ } from '../app';
import { onMsg } from '../bus';
import { registerKind } from '../kinds';
import { L, onLangChange, t } from '../i18n';
import { bannerName, heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { makeHumanoid, type HumanoidLook, type Model } from '../scene/models';
import { S } from '../state';
import { bannerPity, heroRows, openBanners, rateTable, squadToggle, tradeViews, type RateRow } from './collectcalc';
import { drawFormation, drawHeroDetail, growthSig, heroDetailShown, initHeroGrowth, myHeroGear, openHero } from './herogrow';
import { addMenuTab } from './menu';
import { button, el, redraw, row, span } from './menu/parts';
import { addNotices } from './notify';

/** 서버가 보낸 내 영웅·뽑기·편성 (개인 상태) */
let heroes: HeroesMe = {};
let gacha: GachaMe = { pity: {}, log: [] };
let squad: SquadMe = { ids: [], power: 0 };
/** 확률표를 펼친 배너 */
const ratesOpen = new Set<string>();
/** 뽑기 결과를 듣는 곳 (게임의 연출) */
const pullFns: ((banner: string, got: readonly PullGot[]) => void)[] = [];

/** 내 영웅 (영웅 id → [레벨, 별, 조각]) */
export const myHeroes = (): Readonly<HeroesMe> => heroes;
/** 내 편성과 그 전투력 */
export const mySquad = (): Readonly<SquadMe> => squad;
/** 뽑기 결과를 받는다 (결과 창이 뜨는 것과 함께) */
export function onGachaResult(fn: (banner: string, got: readonly PullGot[]) => void): void { pullFns.push(fn); }

/** 영웅 한 명의 모델을 만드는 데 넘기는 것: 영웅 id, 등급 번호, 틀이 쓰려던 사람형의 겉모습(옷 색, 손 모양, 살갗, 영웅 id·등급) */
export interface HeroModelInfo { id: string; rarity: number; look: HumanoidLook }
let heroModel: ((h: HeroModelInfo) => Model | null | undefined) | null = null;
/**
 * 편성의 영웅(엔티티 종류 hero)의 모델을 게임이 정한다: 영웅 id와 등급을 받아 모델을 돌려준다. null이나 undefined를 돌려주면 틀의 것(역할의 옷 색·손 모양의 사람)이다.
 * 발밑의 등급 고리와 크기(사람보다 조금 작게)는 틀이 그 뒤에 얹는다. 사람형 전체를 바꾸는 setHumanoidBody도 영웅이면 look.hero·look.rarity를 받는다
 */
export function setHeroModel(fn: (h: HeroModelInfo) => Model | null | undefined): void { heroModel = fn; }

/** 등급의 색을 입힌 요소 */
function tinted<T extends HTMLElement>(e: T, r: number): T { e.style.setProperty('--rc', teamCss(rarityDef(r).color)); return e; }
const money = (cur: Coin) => (S.me ? (cur === 'gold' ? S.me.gold : S.me.sparks) : 0);
const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(9, n)));
const roleName = (id: string) => uiText.get(heroRole(id).name);

// ---------- 영웅 탭 ----------
function drawHeroes(list: HTMLElement): void {
  if (drawHeroDetail(list, heroes)) return; // 영웅 상세를 펼쳤다 (성장을 켠 게임: hud/herogrow.ts)
  const loc = L(), rows = heroRows(heroes, money(HERO_RULES.levelCur), squad.ids, myHeroGear());
  if (!rows.some((r) => r.owned)) list.append(el('note', t('heroNone')));
  drawTradeHead(list);
  for (const r of rows) {
    const name = tinted(el('iname', heroName(r.id)), r.rarity);
    name.append(span('hstar', stars(r.stars)));
    if (r.inSquad) name.append(span('hsq', t('tabSquad')));
    if (!r.owned) { list.append(row(name, `${loc.fmt.heroRole(roleName(r.id), rarityName(r.rarity))} · ${t('heroNotOwned')}`, [], 'hrow off')); continue; }
    const note = el('note');
    note.append(el('', `${loc.fmt.heroRole(roleName(r.id), rarityName(r.rarity))} · ${loc.fmt.heroLv(r.lv, r.maxLv)}`), el('', loc.fmt.heroStats(r.atk, r.hp, r.power)), el('', r.starNeed ? loc.fmt.heroShards(r.shards, r.starNeed) : `${loc.fmt.heroShards(r.shards, 0).split('/')[0]} · ${t('heroMax')}`));
    const lvBtn = button(r.levelCost ? `${t('heroLevelBtn')} · ${loc.fmt.heroCost(r.levelCost, HERO_RULES.levelCur)}` : t('heroMax'), () => send({ t: 'hero', a: 'level', id: r.id }), !r.canLevel);
    const starBtn = button(t('heroStarBtn'), () => send({ t: 'hero', a: 'star', id: r.id }), !r.canStar);
    // 재료로 조각 얻기 (HERO_RULES.trade): 재료마다 단추 하나
    const trades = tradeViews(r.id, r.owned, S.me?.items ?? {}).map((x) => button(loc.fmt.heroTradeBtn(x.item, x.cost, x.shards), () => send({ t: 'hero', a: 'trade', id: r.id, item: x.item }), !x.can));
    list.append(row(name, note, [lvBtn, starBtn, ...trades, ...(heroDetailShown() ? [button(t('heroDetail'), () => openHero(r.id))] : [])], 'hrow'));
  }
}

/** 재료 교환이 있는 게임: 영웅 탭 위에 가진 재료와 규칙 */
function drawTradeHead(list: HTMLElement): void {
  const items = Object.keys(heroTrades());
  if (!items.length) return;
  list.append(el('note htrade', L().fmt.heroTradeHave(items.map((id) => [id, S.me?.items[id] ?? 0]))));
}

// ---------- 뽑기 탭 ----------
function rateRows(title: string, rows: readonly RateRow[]): HTMLElement[] {
  if (!rows.length) return [];
  const tb = document.createElement('table');
  for (const o of rows) {
    const tr = tb.insertRow();
    const a = tr.insertCell(); a.className = 'rn'; a.textContent = heroName(o.hero); tinted(a, o.rarity);
    tr.insertCell().textContent = rarityName(o.rarity);
    tr.insertCell().textContent = L().fmt.ratePct(o.p);
  }
  return [el('ghd', title), tb];
}
function drawRates(box: HTMLElement, id: string): void {
  const b = BANNER_TABLE[id], tab = rateTable(b), loc = L();
  const wrap = el('grates');
  wrap.append(el('ghd', t('gachaRatesHead')), el('note', t('gachaNoCash')));
  const rt = document.createElement('table');
  for (const x of tab.rarity) { const tr = rt.insertRow(); const a = tr.insertCell(); a.className = 'rn'; a.textContent = rarityName(x.rarity); tinted(a, x.rarity); tr.insertCell().textContent = loc.fmt.ratePct(x.p); }
  wrap.append(el('ghd', t('gachaRatesRarity')), rt);
  wrap.append(...rateRows(t('gachaRatesHero'), tab.heroes));
  const st = bannerPity(id, gacha);
  if (b.pity) wrap.append(el('note', loc.fmt.gachaPity(rarityName(b.pity.rarity), b.pity.after, st.count)), el('note', loc.fmt.gachaSameRatio(rarityName(b.pity.rarity))), ...rateRows(t('gachaRatesPity'), tab.pity));
  if (st.mates.length) wrap.append(el('note', loc.fmt.gachaGroup(st.mates.map(bannerName).join(', '))));
  if (b.tenAtLeast !== undefined) wrap.append(el('note', loc.fmt.gachaTenRule(rarityName(b.tenAtLeast))), ...rateRows(t('gachaRatesTen'), tab.ten));
  // 픽업과 반반: 규칙, 평소와 확정일 때의 픽업 확률, 확정일 때의 표, 실효 확률
  const pk = tab.pickup;
  if (pk) {
    const name = heroName(pk.hero), rn = rarityName(pk.rarity);
    wrap.append(el('ghd', t('gachaRatesPickup')), el('note', loc.fmt.gachaPickupRule(name, rn, pctText(pk.share))));
    if (b.fiftyFifty) wrap.append(el('note', loc.fmt.gachaFiftyRule(name, rn)), el('note', loc.fmt.gachaSureNow(st.sure, name)), ...rateRows(t('gachaRatesSure'), tab.sure));
    wrap.append(el('note', loc.fmt.gachaEffective(name, loc.fmt.ratePct(pk.effective))));
  }
  if (tab.effective.length) wrap.append(...rateRows(t('gachaRatesEffective'), tab.effective));
  box.append(wrap);
}
function drawGacha(list: HTMLElement): void {
  const loc = L(), ids = openBanners(gacha);
  if (!ids.length) list.append(el('note', t('gachaNoOpen')));
  for (const id of ids) {
    const b = BANNER_TABLE[id], box = el('gbanner' + (b.pickup ? ' pick' : ''));
    box.append(el('ttitle', uiText.get(b.name)));
    // 픽업과 남은 기간
    if (b.pickup) { const pk = el('gpick'); pk.append(span('gtag', t('gachaPickup')), tinted(span('', heroName(b.pickup.hero)), heroDef(b.pickup.hero)?.rarity ?? 0)); box.append(pk); }
    if (gacha.open && Object.hasOwn(gacha.open, id)) box.append(el('note gleft', loc.fmt.gachaLeft(gacha.open[id])));
    const have = money(b.cur), btns = el('btns');
    const one = button('', () => send({ t: 'gacha', id, n: 1 }), have < b.one), ten = button('', () => send({ t: 'gacha', id, n: 10 }), have < b.ten);
    one.append(t('gachaOne'), document.createElement('small')); one.lastElementChild!.textContent = loc.fmt.gachaCost(b.one, b.cur);
    ten.append(t('gachaTen'), document.createElement('small')); ten.lastElementChild!.textContent = loc.fmt.gachaCost(b.ten, b.cur);
    btns.append(one, ten);
    box.append(btns);
    const st = bannerPity(id, gacha);
    if (b.pity) box.append(el('note', loc.fmt.gachaPity(rarityName(b.pity.rarity), b.pity.after, st.count)));
    if (b.fiftyFifty && b.pickup) box.append(el('note', loc.fmt.gachaSureNow(st.sure, heroName(b.pickup.hero))));
    if (st.mates.length) box.append(el('note', loc.fmt.gachaGroup(st.mates.map(bannerName).join(', '))));
    const open = ratesOpen.has(id);
    box.append(button(t(open ? 'gachaRatesHide' : 'gachaRates'), () => { if (open) ratesOpen.delete(id); else ratesOpen.add(id); redraw(); }));
    if (open) drawRates(box, id);
    list.append(box);
  }
  drawSelect(list);
  list.append(el('baghead', t('gachaHistory')));
  if (!gacha.log.length) list.append(el('note', t('gachaNoHistory')));
  const fmtAt = (ms: number) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  for (const g of gacha.log.slice(0, GACHA_RULES.history)) {
    const line = el('glog'), who = document.createElement('b');
    who.textContent = `${heroName(g.h)} (${rarityName(g.r)})${g.pity ? ` · ${t('gachaPityMark')}` : ''}`;
    tinted(who, g.r);
    line.append(who, span('note', `${uiText.get(BANNER_TABLE[g.b]?.name ?? g.b)} · ${fmtAt(g.at)}`));
    list.append(line);
  }
}

/** 영웅 선택권: 선택권마다 가진 수와 고를 수 있는 영웅들 (선택권이 없으면 단추가 잠긴다) */
function drawSelect(list: HTMLElement): void {
  const loc = L();
  for (const [item, heroIds] of Object.entries(SELECT_TICKETS)) {
    const have = S.me?.items[item] ?? 0;
    list.append(el('baghead', t('gachaSelectHead')), el('note', loc.fmt.gachaSelectHave(item, have)));
    for (const h of heroIds) {
      const r = heroDef(h).rarity, owned = heroes[h];
      const name = tinted(el('iname', heroName(h)), r);
      list.append(row(name, `${loc.fmt.heroRole(roleName(h), rarityName(r))}${owned ? ` · ${loc.fmt.heroLv(owned[0], HERO_RULES.maxLv(owned[1]))}` : ` · ${t('heroNotOwned')}`}`,
        [button(t('gachaSelectBtn'), () => send({ t: 'gacha', a: 'select', item, hero: h }), have <= 0)], 'hrow'));
    }
  }
}

// ---------- 편성 탭 ----------
function drawSquad(list: HTMLElement): void {
  const loc = L(), size = SQUAD_RULES.size;
  list.append(el('baghead', `${t('squadHead')} ${loc.fmt.squadCount(squad.ids.length, size)} · ${loc.fmt.squadPower(squad.power)}`));
  // 진형·시너지를 켠 게임은 앞줄·뒷줄과 시너지 (hud/herogrow.ts), 아니면 자리 칸
  if (!drawFormation(list, heroes, squad)) {
    const slots = el('sqslots');
    for (let i = 0; i < size; i++) {
      const id = squad.ids[i], s = el('sqslot' + (id ? ' full' : ''));
      if (id) { const b = document.createElement('b'); b.textContent = heroName(id); s.append(b, el('', stars(heroes[id]?.[1] ?? 1))); tinted(s, heroDef(id).rarity); }
      else s.textContent = t('squadEmpty');
      slots.append(s);
    }
    list.append(slots);
  }
  const owned = heroRows(heroes, 0, squad.ids, myHeroGear()).filter((r) => r.owned);
  if (!owned.length) list.append(el('note', t('squadNone')));
  for (const r of owned) {
    const name = tinted(el('iname', heroName(r.id)), r.rarity);
    name.append(span('hstar', stars(r.stars)));
    const full = !r.inSquad && squad.ids.length >= size;
    list.append(row(name, `${loc.fmt.heroRole(roleName(r.id), rarityName(r.rarity))} · ${loc.fmt.heroLv(r.lv, r.maxLv)} · ${loc.fmt.heroStats(r.atk, r.hp, r.power)}`,
      [button(r.inSquad ? t('squadRemove') : t('squadAdd'), () => send({ t: 'squad', ids: squadToggle(squad.ids, r.id, size) }), full)], 'hrow'));
  }
}

// ---------- 뽑기 결과 창 ----------
let popTimer = 0;
function showPull(b: string, got: readonly PullGot[]): void {
  const pop = $('gachaPop'), cards = $('gachaCards');
  cards.textContent = '';
  const top = Math.max(...got.map((g) => g.r));
  for (const g of got) {
    const c = el('gcard' + (g.r === top && top > 0 ? ' top' : ''));
    tinted(c, g.r);
    const name = document.createElement('b'); name.textContent = heroName(g.h);
    c.append(name, el('', rarityName(g.r)), span('', g.dup ? L().fmt.gachaDup(g.n) : L().fmt.gachaNew()));
    if (g.pity) c.append(span('', t('gachaPityMark')));
    cards.append(c);
  }
  $('gachaPopTitle').textContent = `${t('gachaResult')} · ${uiText.get(BANNER_TABLE[b]?.name ?? b)}`;
  pop.hidden = false;
  clearTimeout(popTimer);
  popTimer = window.setTimeout(() => { pop.hidden = true; }, 7000);
  for (const fn of pullFns) fn(b, got);
}

/** 영웅의 겉모습: 역할의 옷 색과 손 모양, 발밑에 등급 색의 고리 */
function heroLook(): void {
  const rings = new Map<number, THREE.MeshBasicMaterial>();
  const ringGeo = new THREE.RingGeometry(0.45, 0.62, 18).rotateX(-Math.PI / 2);
  registerKind('hero', {
    model: (e) => {
      const d = heroDef(e.type), role = heroRole(e.type);
      const r = d?.rarity ?? 0, cloth = d?.cloth ?? role.cloth, hand = role.hand || false;
      // 게임이 영웅의 모델을 정했으면 그것 (setHeroModel), 아니면 틀의 사람형에 영웅 id와 등급을 넘긴다 (setHumanoidBody가 받는다)
      // 캐릭터 정의에서 온 영웅(HeroDef.look)은 그 부품으로 그린다 (engine/shared/defs/chardef.ts의 charHero)
      const parts = d?.look, hl: HumanoidLook = { cloth: parts?.colors.cloth ?? cloth, hand: hand === false ? '' : hand, skin: parts?.colors.skin ?? 0xf0c9a0, hero: e.type, rarity: r, ...(parts ? { look: parts } : {}) };
      const m = heroModel?.({ id: e.type, rarity: r, look: hl }) ?? makeHumanoid(cloth, hand, 0xf0c9a0, undefined, { hero: e.type, rarity: r }, parts);
      let mat = rings.get(r);
      if (!mat) rings.set(r, mat = new THREE.MeshBasicMaterial({ color: rarityDef(r).color, transparent: true, opacity: 0.85 }));
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = 0.04;
      m.root.add(ring);
      m.root.scale.setScalar(0.86); // 사람보다 조금 작게: 누가 나인지 보이게
      return m;
    },
    label: (e) => heroName(e.type),
    animate: true, hp: true, h: 2.1,
    shot: (e) => heroRole(e.type).shot,
    dot: '#9fd0ff',
  });
}

export function initRoster(): void {
  // 재료 교환이 있는 게임은 가진 아이템이 바뀔 때도 다시 그린다
  const trade = Object.keys(heroTrades()).length > 0;
  addMenuTab({ id: 'heroes', label: () => t('tabHeroes'), draw: drawHeroes, sig: () => (trade ? [heroes, squad.ids, S.me?.gold, S.me?.sparks, growthSig(), S.me?.items] : [heroes, squad.ids, S.me?.gold, S.me?.sparks, growthSig()]), mod: 'roster', dot: () => heroRows(heroes, money(HERO_RULES.levelCur)).some((r) => r.canStar) });
  if (trade) addNotices({ feed: ['heroTraded', 'itemShort'] });
  onMsg('me', (m) => { if (m.k === 'heroes') { heroes = m.s as HeroesMe; redraw(true); } });
  addNotices({ feed: ['costShort', 'heroUp', 'heroStar', 'heroMaxLv', 'heroShards', 'heroNew'] });
  initHeroGrowth();
}

export function initGacha(): void {
  addMenuTab({ id: 'gacha', label: () => t('tabGacha'), draw: drawGacha, sig: () => [gacha, [...ratesOpen], S.me?.gold, S.me?.sparks], mod: 'gacha' }, 'heroes');
  // 결과 창은 문서의 맨 끝에 붙인다: 메뉴 창(뽑기 탭에서 누른다) 위에 떠야 한다
  const pop = document.createElement('div');
  pop.className = 'panel'; pop.id = 'gachaPop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  pop.innerHTML = '<div class="ttitle" id="gachaPopTitle"></div><div id="gachaCards"></div>';
  document.body.append(pop);
  $('gachaPop').addEventListener('click', () => { $('gachaPop').hidden = true; });
  onMsg('me', (m) => { if (m.k === 'gacha') { gacha = m.s as GachaMe; redraw(true); } });
  onMsg('gacha', (m) => showPull(m.b, m.got));
  onLangChange(() => { $('gachaPop').hidden = true; });
  addNotices({ feed: ['bannerClosed', 'heroPicked', 'itemShort', 'costShort'] });
}

export function initSquad(): void {
  addMenuTab({ id: 'squad', label: () => t('tabSquad'), draw: drawSquad, sig: () => [heroes, squad, growthSig()], mod: 'squad' }, hasModule('gacha') ? 'gacha' : 'heroes');
  onMsg('me', (m) => { if (m.k === 'squad') { squad = m.s as SquadMe; redraw(true); } });
  heroLook();
}
