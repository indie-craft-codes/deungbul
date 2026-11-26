// 수집형·방치형의 화면 (roster, gacha, squad 모듈): 메뉴의 '영웅'·'뽑기'·'편성' 탭(addMenuTab), 뽑기 결과 창, 싸우는 영웅의 겉모습(registerKind('hero')).
// 서버의 짝은 engine/server/game/systems/roster.ts, gacha.ts, squad.ts. 셈(줄의 차례, 확률표, 편성 바꾸기)은 hud/collectcalc.ts에 있다.
// 확률표는 서버가 뽑는 셈과 같은 함수(engine/shared/defs/collect.ts의 poolOdds)로 만든다: 배너의 영웅마다·등급마다의 확률, 천장과 10번 뽑기 보장의 규칙과 그때의 확률을 모두 보인다.
// 게임이 더 할 수 있는 것: 뽑기 결과를 받기(onGachaResult: 연출, 소리), 내 영웅·편성 읽기(myHeroes, mySquad).
import * as THREE from 'three';
import { BANNER_IDS, BANNER_TABLE, GACHA_RULES, HERO_RULES, SQUAD_RULES, heroDef, heroRole, rarityDef, type Coin, type GachaMe, type HeroesMe, type PullGot, type SquadMe } from '../../shared/defs';
import { teamCss } from '../../shared/defs/teams';
import { $ } from '../app';
import { onMsg } from '../bus';
import { registerKind } from '../kinds';
import { L, onLangChange, t } from '../i18n';
import { heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { makeHumanoid } from '../scene/models';
import { S } from '../state';
import { heroRows, rateTable, squadToggle, type RateRow } from './collectcalc';
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
  for (const r of rows) {
    const name = tinted(el('iname', heroName(r.id)), r.rarity);
    name.append(span('hstar', stars(r.stars)));
    if (r.inSquad) name.append(span('hsq', t('tabSquad')));
    if (!r.owned) { list.append(row(name, `${loc.fmt.heroRole(roleName(r.id), rarityName(r.rarity))} · ${t('heroNotOwned')}`, [], 'hrow off')); continue; }
    const note = el('note');
    note.append(el('', `${loc.fmt.heroRole(roleName(r.id), rarityName(r.rarity))} · ${loc.fmt.heroLv(r.lv, r.maxLv)}`), el('', loc.fmt.heroStats(r.atk, r.hp, r.power)), el('', r.starNeed ? loc.fmt.heroShards(r.shards, r.starNeed) : `${loc.fmt.heroShards(r.shards, 0).split('/')[0]} · ${t('heroMax')}`));
    const lvBtn = button(r.levelCost ? `${t('heroLevelBtn')} · ${loc.fmt.heroCost(r.levelCost, HERO_RULES.levelCur)}` : t('heroMax'), () => send({ t: 'hero', a: 'level', id: r.id }), !r.canLevel);
    const starBtn = button(t('heroStarBtn'), () => send({ t: 'hero', a: 'star', id: r.id }), !r.canStar);
    list.append(row(name, note, [lvBtn, starBtn, ...(heroDetailShown() ? [button(t('heroDetail'), () => openHero(r.id))] : [])], 'hrow'));
  }
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
  if (b.pity) wrap.append(el('note', loc.fmt.gachaPity(rarityName(b.pity.rarity), b.pity.after, gacha.pity[id] ?? 0)), el('note', loc.fmt.gachaSameRatio(rarityName(b.pity.rarity))), ...rateRows(t('gachaRatesPity'), tab.pity));
  if (b.tenAtLeast !== undefined) wrap.append(el('note', loc.fmt.gachaTenRule(rarityName(b.tenAtLeast))), ...rateRows(t('gachaRatesTen'), tab.ten));
  box.append(wrap);
}
function drawGacha(list: HTMLElement): void {
  const loc = L();
  for (const id of BANNER_IDS) {
    const b = BANNER_TABLE[id], box = el('gbanner');
    box.append(el('ttitle', uiText.get(b.name)));
    const have = money(b.cur), btns = el('btns');
    const one = button('', () => send({ t: 'gacha', id, n: 1 }), have < b.one), ten = button('', () => send({ t: 'gacha', id, n: 10 }), have < b.ten);
    one.append(t('gachaOne'), document.createElement('small')); one.lastElementChild!.textContent = loc.fmt.gachaCost(b.one, b.cur);
    ten.append(t('gachaTen'), document.createElement('small')); ten.lastElementChild!.textContent = loc.fmt.gachaCost(b.ten, b.cur);
    btns.append(one, ten);
    box.append(btns);
    if (b.pity) box.append(el('note', loc.fmt.gachaPity(rarityName(b.pity.rarity), b.pity.after, gacha.pity[id] ?? 0)));
    const open = ratesOpen.has(id);
    box.append(button(t(open ? 'gachaRatesHide' : 'gachaRates'), () => { if (open) ratesOpen.delete(id); else ratesOpen.add(id); redraw(); }));
    if (open) drawRates(box, id);
    list.append(box);
  }
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
      const m = makeHumanoid(d?.cloth ?? role.cloth, role.hand || false, 0xf0c9a0);
      const r = d?.rarity ?? 0;
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
  addMenuTab({ id: 'heroes', label: () => t('tabHeroes'), draw: drawHeroes, sig: () => [heroes, squad.ids, S.me?.gold, S.me?.sparks, growthSig()], mod: 'roster', dot: () => heroRows(heroes, money(HERO_RULES.levelCur)).some((r) => r.canStar) });
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
}

export function initSquad(): void {
  addMenuTab({ id: 'squad', label: () => t('tabSquad'), draw: drawSquad, sig: () => [heroes, squad, growthSig()], mod: 'squad' }, hasModule('gacha') ? 'gacha' : 'heroes');
  onMsg('me', (m) => { if (m.k === 'squad') { squad = m.s as SquadMe; redraw(true); } });
  heroLook();
}
