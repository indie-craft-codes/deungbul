// 영웅의 성장 화면 (roster의 기술 레벨·각성, herogrow 모듈의 영웅 장비, squad의 진형·시너지): 켠 게임에만 보인다.
//   영웅 상세      영웅 탭의 '자세히' → 레벨·별·각성·기술·장비 탭 (collect.ts의 영웅 탭이 그린다)
//   영웅 장비 탭   메뉴의 '영웅 장비'(herogear 모듈): 가진 장비, 강화 창(지금 → 다음, 값, 확률), 분해
//   편성의 진형    편성 탭의 앞줄·뒷줄(줄 바꾸기)과 시너지(태그마다의 수와 단)
// 셈은 hud/herogrowcalc.ts (서버와 같은 engine/shared/defs/herogrow.ts의 셈). 서버의 짝은 systems/roster.ts, squad.ts, herogear.ts.
import { heroDetailOn, heroDef, heroGearRules, heroRole, piecesOf, type HeroBonus, type HeroGearMe, type HeroGearPiece, type HeroesMe, type ItemId, type SkillId, type SquadMe } from '../../shared/defs';
import { tintRarity } from './rarity';
import { bonusParts } from '../../shared/defs/herogrow';
import { onMsg } from '../bus';
import { L, t } from '../i18n';
import { heroGearName, heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { S } from '../state';
import { detailTabs, enhanceView, formation, gearRows, heroDetail, setViews, slotViews, synergyRows, toggleRow, type CostPart, type DetailTab, type GearRow, type Wallet } from './herogrowcalc';
import { addMenuTab } from './menu';
import { button, chips, el, redraw, row, span } from './menu/parts';
import { addNotices } from './notify';

/** 서버가 보낸 내 영웅 장비 (개인 상태 hgear) */
let hgear: HeroGearMe = { items: [], cap: 0 };
/** 펼친 영웅 상세 (없으면 null)와 그 탭 */
let detail: string | null = null;
let tab: DetailTab = 'level';
/** 장비 탭에서 바꿀 장비를 고르는 칸, 장비 창에서 강화 창을 펼친 장비 */
let pickSlot = '';
let enhUid = 0;

/** 내 영웅 장비 */
export const myHeroGear = (): HeroGearPiece[] => piecesOf(hgear);
const gearOn = (): boolean => hasModule('herogear') && !!heroGearRules();
/** 영웅 탭에 '자세히'를 붙이는가 (성장을 하나라도 켠 게임) */
export const heroDetailShown = (): boolean => heroDetailOn(gearOn());
/** 영웅 상세를 연다 */
export function openHero(id: string): void { detail = id; tab = 'level'; pickSlot = ''; redraw(); }
/** 영웅 탭의 다시 그리기를 가르는 값 */
export const growthSig = (): unknown => [detail, tab, pickSlot, enhUid, hgear, S.me?.items];

const tinted = tintRarity;
const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(9, n)));
const wallet = (): Wallet => ({ gold: S.me?.gold ?? 0, sparks: S.me?.sparks ?? 0, items: S.me?.items ?? {} });
const itemLabel = (id: string): string => L().items[id as ItemId]?.name ?? id;
const bonusText = (b: HeroBonus): string => bonusParts(b).map(([k, v]) => L().fmt.heroBonus(k, v)).join(' · ');
/** 값의 칸들을 한 줄로 (모자란 칸은 붉게) */
function costEl(parts: readonly CostPart[]): HTMLElement {
  const d = el('note hcost');
  if (!parts.length) return d;
  d.append(L().fmt.heroCostLine([]).replace(/\s*$/, ' '));
  parts.forEach((p, i) => {
    const txt = p.kind === 'cur' ? `${L().fmt.heroCost(p.need, p.id)} (${p.have.toLocaleString()})` : p.kind === 'shards' ? L().fmt.heroShards(p.have, p.need) : L().fmt.heroHave(itemLabel(p.id), p.have, p.need);
    if (i) d.append(' · ');
    d.append(span(p.ok ? 'opt' : 'opt short', txt));
  });
  return d;
}

// ---------- 영웅 상세 ----------
/** 영웅 상세를 그린다 (영웅 탭에서. 펼친 영웅이 없으면 false: 영웅 탭이 목록을 그린다) */
export function drawHeroDetail(list: HTMLElement, heroes: HeroesMe): boolean {
  if (!detail || !heroes[detail]) { detail = null; return false; }
  const id = detail, loc = L(), gear = myHeroGear(), v = heroDetail(id, heroes, gear, wallet());
  list.append(button(t('heroBack'), () => { detail = null; redraw(); }));
  const head = el('hdetail');
  const name = tinted(el('iname', heroName(id)), v.rarity);
  name.append(span('hstar', stars(v.stars)));
  if (v.awaken.n > 0) name.append(span('haw', `◆${v.awaken.n}`));
  head.append(name, el('note', `${loc.fmt.heroRole(uiText.get(heroRole(id).name), rarityName(v.rarity))} · ${loc.fmt.heroLv(v.lv, v.maxLv)}`));
  head.append(el('hstats', `${loc.fmt.heroStats(v.full.atk, v.full.hp, v.full.power)}`));
  if (v.full.dmg || v.full.guard) head.append(el('note', bonusText({ dmg: v.full.dmg, guard: v.full.guard })));
  list.append(head);
  const tabs = detailTabs(gearOn());
  if (!tabs.includes(tab)) tab = 'level';
  const label: Record<DetailTab, string> = { level: t('htLevel'), star: t('htStar'), awaken: t('htAwaken'), skill: t('htSkill'), gear: t('htGear') };
  list.append(chips(tabs.map((x) => ({ text: label[x], on: x === tab, click: () => { tab = x; pickSlot = ''; redraw(); } }))));
  const box = el('htab');
  if (tab === 'level') {
    box.append(row(el('iname', loc.fmt.heroLv(v.lv, v.maxLv)), v.level.max ? el('note', t('heroMax')) : costEl(v.level.cost), [button(t('heroLevelBtn'), () => send({ t: 'hero', a: 'level', id }), !v.level.can)]));
    box.append(el('note', `${loc.fmt.heroStats(v.base.atk, v.base.hp, v.full.power)}`));
  } else if (tab === 'star') {
    box.append(row(el('iname', `${stars(v.stars)} ${v.stars}/${v.maxStars}`), v.star.max ? el('note', t('heroMax')) : costEl(v.star.cost), [button(t('heroStarBtn'), () => send({ t: 'hero', a: 'star', id }), !v.star.can)]));
  } else if (tab === 'awaken') {
    const a = v.awaken;
    box.append(row(el('iname', loc.fmt.heroAwakenStep(a.n, a.max)), el('note', loc.fmt.heroAwakenMul(a.mul)), []));
    if (!a.next) box.append(el('note', t('heroAwakenDone')));
    else {
      if (a.needStars) box.append(el('note short', loc.fmt.heroAwakenNeed(v.maxStars)));
      const nx = el('hnext');
      nx.append(el('ghd', `${t('heroNext')} · ${loc.fmt.heroAwakenStep(a.n + 1, a.max)}`), el('note', loc.fmt.heroAwakenMul(a.next.mul)));
      if (a.next.passive) nx.append(el('note', `${uiText.get(a.next.passive.name)} · ${bonusText(a.next.passive.bonus)}`));
      nx.append(costEl(a.cost), button(t('heroAwakenBtn'), () => send({ t: 'hero', a: 'awaken', id }), !a.can));
      box.append(nx);
    }
    if (a.passives.length) {
      box.append(el('ghd', t('heroPassives')));
      for (const p of a.passives) box.append(el('note', `✓ ${uiText.get(p.name)} · ${bonusText(p.bonus)}`));
    }
  } else if (tab === 'skill') {
    const s = v.skill;
    if (!s.has) box.append(el('note', t('heroNoSkill')));
    else {
      const sname = L().skills[s.has as SkillId]?.name ?? s.has;
      box.append(row(el('iname', `${sname} · ${loc.fmt.heroSkillLv(s.lv, s.max)}`), el('note', `${loc.fmt.heroSkillEffect(s.pct)}${s.lv < s.max ? ` → +${s.nextPct}%` : ''}`), [button(t('heroSkillBtn'), () => send({ t: 'hero', a: 'skill', id }), !s.can)]));
      if (s.lv < s.max) box.append(costEl(s.cost)); else box.append(el('note', t('heroSkillDone')));
    }
  } else if (tab === 'gear') drawSlots(box, id, gear);
  list.append(box);
  return true;
}

/** 영웅의 장비 탭: 칸마다 낀 것(빼기·강화)과 바꿀 것 고르기, 그리고 세트 */
function drawSlots(box: HTMLElement, hero: string, gear: readonly HeroGearPiece[]): void {
  const loc = L();
  for (const s of slotViews(hero, gear)) {
    const w = s.worn;
    const name = w ? tinted(el('iname'), w.rarity) : el('iname');
    const tag = span('mslot', uiText.get(s.name));
    name.append(tag, w ? loc.fmt.hgName(heroGearName(w.id), w.lv) : t('hgEmptySlot'));
    const btns = [button(t(w ? 'hgUnequip' : 'hgEquip'), () => { if (w) send({ t: 'hgear', a: 'unequip', uid: w.uid }); else { pickSlot = pickSlot === s.slot ? '' : s.slot; redraw(); } }, !w && !s.pick.length)];
    if (w) btns.push(button(t('hgEnhance'), () => { enhUid = enhUid === w.uid ? 0 : w.uid; redraw(); }, w.lv >= w.maxLv), button('⇄', () => { pickSlot = pickSlot === s.slot ? '' : s.slot; redraw(); }, !s.pick.length));
    box.append(row(name, w ? `${loc.fmt.hgStats(w.atk, w.hp)} · ${loc.fmt.heroPower(w.power)}` : '', btns, 'hrow hgslot'));
    if (w && enhUid === w.uid) box.append(enhanceBox(w));
    if (pickSlot === s.slot) {
      const pick = el('hpick');
      pick.append(el('ghd', t('hgPick')));
      if (!s.pick.length) pick.append(el('note', t('hgPickNone')));
      for (const r of s.pick.slice(0, 12)) pick.append(gearLine(r, [button(t('hgEquip'), () => { pickSlot = ''; send({ t: 'hgear', a: 'equip', uid: r.uid, hero }); })]));
      box.append(pick);
    }
  }
  const sets = setViews(hero, gear);
  if (sets.length) {
    box.append(el('ghd', t('hgSets')));
    for (const s of sets) {
      const d = el('note');
      d.append(span('opt', loc.fmt.hgSetCount(uiText.get(s.name), s.n)));
      for (const x of s.tiers) { d.append(' · '); d.append(span(x.on ? 'opt on' : 'opt off', `${loc.fmt.hgSetTier(x.n, x.on)} ${bonusText(x.bonus)}`)); }
      box.append(d);
    }
  }
}

/** 장비 한 줄: 이름(+강화), 칸·세트·능력치·전투력·낀 영웅 */
function gearLine(r: GearRow, btns: HTMLElement[]): HTMLElement {
  const loc = L(), slot = heroGearRules()?.slots.find((s) => s.id === r.slot);
  const name = tinted(el('iname'), r.rarity);
  name.append(span('mslot', uiText.get(slot?.name ?? r.slot)), loc.fmt.hgName(heroGearName(r.id), r.lv));
  const set = r.set ? heroGearRules()?.sets?.[r.set] : undefined;
  const note = [rarityName(r.rarity), set ? uiText.get(set.name) : '', loc.fmt.hgStats(r.atk, r.hp), loc.fmt.heroPower(r.power), r.hero ? loc.fmt.hgOn(heroName(r.hero)) : ''].filter(Boolean).join(' · ');
  return row(name, note, btns, 'hrow hgrow');
}

/** 강화 창: 지금 → 다음, 값, 확률, 강화 단추 */
function enhanceBox(r: GearRow): HTMLElement {
  const loc = L(), x = myHeroGear().find((g) => g.uid === r.uid);
  const box = el('henh');
  if (!x) return box;
  const v = enhanceView(x, wallet());
  box.append(el('ghd', `${loc.fmt.hgName(heroGearName(r.id), r.lv)} → ${v.max ? t('hgMaxed') : `+${r.lv + 1}`}`));
  box.append(el('note', `${loc.fmt.hgStats(v.now.atk, v.now.hp)}${v.max ? '' : `  →  ${loc.fmt.hgNext(loc.fmt.hgStats(v.next.atk, v.next.hp))}`}`));
  if (!v.max) box.append(costEl(v.cost), el('note', loc.fmt.hgChance(v.chance)));
  const btns = el('btns');
  btns.append(button(t('hgEnhance'), () => send({ t: 'hgear', a: 'enhance', uid: r.uid }), !v.can), button(t('hgClose'), () => { enhUid = 0; redraw(); }));
  box.append(btns);
  return box;
}

// ---------- 영웅 장비 탭 ----------
function drawHeroGear(list: HTMLElement): void {
  const loc = L(), rows = gearRows(myHeroGear()), salv = !!heroGearRules()?.salvage;
  list.append(el('baghead', `${t('tabHGear')} ${loc.fmt.hgCount(rows.length, hgear.cap)}`));
  if (!rows.length) list.append(el('note', t('hgNone')));
  for (const r of rows) {
    const btns = [button(t('hgEnhance'), () => { enhUid = enhUid === r.uid ? 0 : r.uid; redraw(); }, r.lv >= r.maxLv)];
    if (salv && !r.hero) btns.push(button(t('hgSalvage'), () => send({ t: 'hgear', a: 'salvage', uids: [r.uid] })));
    list.append(gearLine(r, btns));
    if (enhUid === r.uid) list.append(enhanceBox(r));
  }
}

// ---------- 편성의 진형과 시너지 ----------
/** 편성 탭의 진형(앞줄·뒷줄)과 시너지를 그린다. 둘 다 없는 게임이면 false (편성 탭이 예전의 자리 칸을 그린다) */
export function drawFormation(list: HTMLElement, heroes: HeroesMe, squad: SquadMe): boolean {
  const f = formation(squad.ids, squad.back ?? []), syn = squad.syn;
  if (!f && !syn) return false;
  const loc = L();
  const chip = (id: string, btns: HTMLElement[]) => {
    const s = tinted(el('sqslot full'), heroDef(id).rarity), b = document.createElement('b');
    b.textContent = heroName(id);
    s.append(b, el('', stars(heroes[id]?.[1] ?? 1)), ...btns);
    return s;
  };
  if (f) {
    const lineOf = (back: boolean) => {
      const ids = back ? f.back : f.front, max = back ? f.backMax : f.frontMax;
      const box = el('sqrow' + (back ? ' back' : ' front'));
      box.append(el('ghd', `${t(back ? 'rowBack' : 'rowFront')} ${loc.fmt.rowCount(ids.length, max)}`), el('note', t(back ? 'rowBackInfo' : 'rowFrontInfo')));
      const slots = el('sqslots');
      for (const id of ids) {
        const other = back ? f.front.length < f.frontMax : f.back.length < f.backMax;
        slots.append(chip(id, [button(t(back ? 'rowToFront' : 'rowToBack'), () => send({ t: 'squad', ids: squad.ids, back: toggleRow(squad.ids, squad.back ?? [], id) }), !other)]));
      }
      for (let i = ids.length; i < max; i++) slots.append(el('sqslot', t('squadEmpty')));
      box.append(slots);
      return box;
    };
    list.append(lineOf(false), lineOf(true));
  } else {
    const slots = el('sqslots');
    for (const id of squad.ids) slots.append(chip(id, []));
    list.append(slots);
  }
  if (syn) {
    const rows = synergyRows(syn, Object.keys(heroes));
    const box = el('synbox');
    box.append(el('ghd', t('synHead')));
    if (!rows.some((r) => r.tier >= 0)) box.append(el('note', t('synNone')));
    for (const r of rows) {
      const d = el('synrow' + (r.tier >= 0 ? ' on' : ''));
      d.append(el('iname', loc.fmt.synCount(uiText.get(r.name), r.n)));
      const tiers = el('note');
      r.tiers.forEach((x, i) => { if (i) tiers.append(' · '); tiers.append(span(x.on ? 'opt on' : 'opt off', `${loc.fmt.synTier(x.n)} ${bonusText(x.bonus)}`)); });
      d.append(tiers);
      box.append(d);
    }
    list.append(box);
  }
  return true;
}

/** 영웅의 성장 안내문 (roster: 기술 레벨·각성) */
export function initHeroGrowth(): void {
  addNotices({ banner: { heroAwaken: 'good' }, feed: ['heroSkillUp', 'heroSkillMax', 'heroAwakenMax', 'heroAwakenStars', 'itemShort'] });
}

/** 영웅 장비 모듈의 화면: 메뉴의 '영웅 장비' 탭과 안내문 */
export function initHeroGear(): void {
  addMenuTab({ id: 'hgear', label: () => t('tabHGear'), draw: drawHeroGear, sig: () => [hgear, enhUid, S.me?.gold, S.me?.sparks, S.me?.items], mod: 'herogear' }, hasModule('squad') ? 'squad' : 'heroes');
  onMsg('me', (m) => { if (m.k === 'hgear') { hgear = m.s as HeroGearMe; redraw(true); } });
  addNotices({ feed: ['hgDrop', 'hgFull', 'hgEnhance', 'hgEnhanceMax', 'hgSalvaged', 'itemShort'] });
}
