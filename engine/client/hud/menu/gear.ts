// 메뉴의 장비 탭: 낀 장비와 가방의 장비, 끼기·빼기·강화·재련·팔기·분해·잠금·비교, 가방 넓히기, 일괄·자동 분해.
// 장비의 이름과 옵션 표시(gearLabel)는 거래소와 우편도 쓴다.
import { BAG_UP, ENHANCE, FORGES, GEAR_SLOTS, RARITIES, RECIPES, REFORGE, SALVAGE, SHOPS, SHOP_STOCK, STAT_IDS, autoSalvageChoices, bagUpPrice, baseOpt, canSalvage, compareGear, deltaSigns, dustFor, enhanceMax, gearVerdict, isItemId, isSupply, itemCap, itemDef, optValue, sellPrice, type Gear, type GearDelta, type GearVerdict, type ItemId, type Reward, type Stat } from '../../../shared/defs';
import type { MsgArg, MsgKey } from '../../../shared/messages';
import { L, forInput, itemName, t } from '../../i18n';
import type { UiKey } from '../../i18n/ko';
import { send } from '../../net';
import { hasModule } from '../../mods';
import { S } from '../../state';
import { gearIcon } from '../icons';
import { button, el, gearTitle, optsEl, redraw, row, select, span, ui } from './parts';

/** 상점에서 장비(무기, 갑옷)를 파는 게임인가: 장비 탭의 안내가 상점을 말할지 */
const SELLS_GEAR = SHOPS.length > 0 && SHOP_STOCK.some((id) => isItemId(id) && (itemDef(id).kind === 'weapon' || itemDef(id).kind === 'armor'));

/** 장비 한 점의 칸 이름, 이름, 옵션들, 줄의 모양(등급 색). 장비 탭과 거래소, 우편이 같은 표시를 쓴다 */
export function gearLabel(g: Gear): { slot: string; name: string; opts: string[]; cls: string } {
  const loc = L(), me = S.me;
  // 무기와 갑옷은 바탕 아이템의 이름을 쓴다 (직업에 따라 검/활/지팡이). 사거나 만든 것은 '보급형'이라고 붙인다
  const what = isItemId(g.base) ? itemName(g.base, me?.cls ?? '') : loc.gear.slots[g.slot];
  const name = loc.fmt.gearName(what, isSupply(g) ? loc.gear.rarities.supply : g.made && !g.opts.length ? loc.gear.rarities.made : loc.gear.rarities[RARITIES[g.rar].id], g.plus, g.lv);
  // 무기·갑옷의 기본 수치와 같은 종류의 옵션은 더해서 한 번만 보여 준다 ('공격 피해 +45% · 공격 피해 +11%'가 아니라 '공격 피해 +56%').
  // 서버도 둘을 그대로 더해서 쓴다 (systems/gear.ts의 total)
  const sum = new Map<Stat, number>(), base = baseOpt(g);
  if (base && base[1] > 0) sum.set(base[0], optValue(g, base[1]));
  for (const [k, v] of g.opts) sum.set(k, (sum.get(k) ?? 0) + optValue(g, v));
  const opts = [...sum].map(([k, v]) => loc.gear.stats[k](Math.round(v * 10) / 10));
  return { slot: loc.gear.slots[g.slot], name, opts, cls: isSupply(g) ? 'supply' : g.made && !g.opts.length ? 'made' : 'rar' + g.rar };
}
/** 우편에 붙은 물건: 장비의 이름과 아이템의 수량 */
export function goodsText(r: Reward): string {
  const loc = L();
  return [...(r.gear ?? []).map((g) => gearLabel(g).name), ...Object.entries(r.items ?? {}).map(([id, n]) => loc.fmt.marketStack(isItemId(id) ? loc.items[id].name : id, n))].join(' · ');
}

/**
 * 장비 줄에서 방금 일어난 일: 강화 결과(그 줄에 잠깐 보여 준다)와, 팔기를 한 번 누른 장비(한 번 더 눌러야 팔린다).
 * 화면 아래의 한 줄 알림만으로는 강화가 됐는지 눈에 띄지 않았고, 팔기는 한 번에 팔려 잘못 누르기 쉬웠다
 */
export const act = {
  enhUid: 0, enhWait: false, enhOk: false, enhPlus: 0, sellUid: 0, enhTimer: 0, sellTimer: 0,
  /** 강화 결과의 종류 (실패만 했는가, 내려갔는가, 부적이 막았는가) */
  enhRes: '' as '' | 'fail' | 'down' | 'kept',
  /** 보호 부적을 쓸 것인가 (내려갈 수 있는 강화에만 쓴다). 기본은 쓴다 */
  useCharm: true,
  /** 재련 줄을 펼친 장비, 한 번 누른 옵션의 차례 (-1이면 없음) */
  refUid: 0, refArm: -1, refTimer: 0,
  /** 펼쳐 둔 가방 장비 (강화·팔기·분해 단추와 비교가 그 줄 아래에 보인다) */
  openUid: 0,
  /** 분해를 한 번 누른 장비, 넓히기를 한 번 눌렀는가 (한 번 더 눌러야 된다), 일괄 분해로 고른 등급 (-1이면 고르지 않음) */
  salvUid: 0, salvTimer: 0, upArmed: false, upTimer: 0, bulk: -1,
  /** 장비 탭에서 방금 한 일(분해, 넓히기)의 서버 답: 창 안에 잠깐 보여 준다. 흘러가는 알림은 메뉴 창에 가려 보이지 않는다 */
  res: null as { k: MsgKey; a: MsgArg[] } | null, resTimer: 0,
};

/** 장비 탭 안에 보여 줄 서버의 답: 된 것과 거절된 것 (자동 분해는 사냥 중에 자주 오므로 흘러가는 알림에만 둔다) */
const GEAR_OK: ReadonlySet<MsgKey> = new Set<MsgKey>(['salvaged', 'bagUpDone', 'reforged']);
const GEAR_FAIL: ReadonlySet<MsgKey> = new Set<MsgKey>(['salvageCant', 'salvageFull', 'gearLocked', 'bagUpMax', 'reforgeMax']);
/** 지금 낀 장비들 (칸의 순서대로): 장비 비교의 기준 */
const wornNow = (): Gear[] => { const m = S.meta, out: Gear[] = []; for (const slot of GEAR_SLOTS) { const it = m.gear.find((x) => x.uid === m.worn[slot]); if (it) out.push(it); } return out; };
/** 비교의 결론을 나타내는 표시: 색만으로 가르지 않게 모양도 다르다 (▲ 더 좋음, ▼ 더 나쁨, ◆ 엇갈림, = 비슷) */
const VERDICT: Record<GearVerdict, { mark: string; key: UiKey }> = { better: { mark: '▲', key: 'cmpBetter' }, worse: { mark: '▼', key: 'cmpWorse' }, mixed: { mark: '◆', key: 'cmpMixed' }, same: { mark: '=', key: 'cmpSame' } };

/** 강화 단추: 서버의 답(성공/실패)을 그 장비의 줄에 보여 준다 */
function enhanceButton(g: Gear): HTMLButtonElement {
  const me = S.me, loc = L(), cost = ENHANCE.gold(g.plus, g.rar), dust = ENHANCE.dust(g.plus, g.rar), maxed = g.plus >= enhanceMax(g), pct = Math.round(ENHANCE.rate(g.plus) * 100);
  // 실패하면 내려가는 단계(ENHANCE.dropFrom 이상)는 ⚠를 붙인다. 부적을 쓰기로 했고 들고 있으면 붙이지 않는다
  const risky = !maxed && g.plus >= ENHANCE.dropFrom && !(act.useCharm && charms() > 0);
  const useWard = !maxed && g.plus >= ENHANCE.dropFrom && act.useCharm && charms() > 0;
  // 귀속되기 직전(강화하면 거래소에 못 올리게 되는 단계)이면 🔗를 붙인다
  const binds = !maxed && !isSupply(g) && ENHANCE.bindPlus > 0 && g.plus + 1 === ENHANCE.bindPlus;
  const label = maxed ? t('enhanceMaxed') : (risky ? '⚠ ' : '') + (binds ? '🔗 ' : '') + (dust > 0 ? loc.fmt.enhanceDust(cost, dust, pct) : loc.fmt.enhanceCost(cost, pct)) + (useWard ? loc.fmt.enhanceWard(1) : '');
  return button(label, () => {
    act.enhUid = g.uid; act.enhWait = true;
    send({ t: 'enhance', uid: g.uid, charm: act.useCharm });
  }, maxed || !me || me.gold < cost || (dust > 0 && (me.items[SALVAGE.item as ItemId] ?? 0) < dust));
}
/** 들고 있는 보호 부적의 수 (부적이 없는 게임은 0) */
const charms = (): number => (isItemId(ENHANCE.charm) ? S.me?.items[ENHANCE.charm] ?? 0 : 0);
/** 강화가 내려갈 수 있는 게임이면: 경고 한 줄과 부적 쓰기 단추 (장비 탭의 머리) */
function enhanceRiskEl(): HTMLElement | null {
  if (ENHANCE.dropFrom > ENHANCE.max) return null;
  const box = el('note grisk');
  box.append(L().fmt.enhanceRisk(ENHANCE.dropFrom, charms(), ENHANCE.bindPlus));
  if (isItemId(ENHANCE.charm)) {
    const b = button(t(act.useCharm ? 'charmOn' : 'charmOff'), () => { act.useCharm = !act.useCharm; redraw(); });
    b.classList.add('gcharm');
    b.classList.toggle('on', act.useCharm);
    b.setAttribute('aria-pressed', String(act.useCharm));
    box.append(' ', b);
  }
  return box;
}
/** 재련 단추: 누르면 그 장비 아래에 재련 줄이 펼쳐진다 (옵션이 있는 장비만) */
function reforgeButton(g: Gear): HTMLButtonElement | null {
  if (REFORGE.max <= 0 || !g.opts.length) return null;
  const open = act.refUid === g.uid;
  const b = button(t(open ? 'reforgeClose' : 'reforgeBtn'), () => { act.refUid = open ? 0 : g.uid; act.refArm = -1; redraw(); });
  b.setAttribute('aria-expanded', String(open));
  return b;
}
/** 재련 줄: 이번 값과 남은 횟수, 옵션마다의 단추 (두 번 눌러야 된다) */
function reforgeEl(g: Gear): HTMLDivElement {
  const loc = L(), me = S.me, box = el('mrow gear gref'), n = g.rf ?? 0;
  if (n >= REFORGE.max) { box.append(el('note', loc.fmt.reforgeDone(n, REFORGE.max))); return box; }
  const gold = REFORGE.gold(g.rar, n), dust = REFORGE.dust(g.rar), poor = !me || me.gold < gold || (me.items[SALVAGE.item as ItemId] ?? 0) < dust;
  box.append(el('note', loc.fmt.reforgeNote(n, REFORGE.max, gold, dust)));
  if (g.opts.length >= STAT_IDS.length) box.append(el('note', loc.fmt.reforgeValueOnly));
  const acts = el('acts');
  g.opts.forEach(([k, v], i) => {
    const text = loc.gear.stats[k](Math.round(optValue(g, v) * 10) / 10), armed = act.refArm === i;
    const b = button(armed ? loc.fmt.reforgeConfirm(text) : '↻ ' + text, () => {
      clearTimeout(act.refTimer);
      if (armed) { act.refArm = -1; send({ t: 'reforge', uid: g.uid, i }); redraw(); return; }
      act.refArm = i;
      act.refTimer = window.setTimeout(() => { act.refArm = -1; redraw(); }, 4000);
      redraw();
    }, poor);
    b.classList.toggle('armed', armed);
    acts.append(b);
  });
  box.append(acts);
  return box;
}
/** 한 번 더 눌러야 되는 단추 (팔기, 분해): 처음 누르면 확인으로 바뀌고, 몇 초 안에 다시 누르지 않으면 원래대로 돌아간다 (거래소의 사기 단추와 같은 방식) */
function armButton(text: string, confirm: string, armed: boolean, arm: (on: boolean) => void, timer: 'sellTimer' | 'salvTimer' | 'upTimer', go: () => void, disabled = false): HTMLButtonElement {
  const b = button(armed ? confirm : text, () => {
    clearTimeout(act[timer]);
    if (armed) { arm(false); go(); redraw(); return; }
    arm(true);
    act[timer] = window.setTimeout(() => { arm(false); redraw(); }, 4000);
    redraw();
  }, disabled);
  b.classList.toggle('armed', armed);
  return b;
}
/** 잠금 단추 (자물쇠): 잠근 장비는 팔기·분해·거래소 올리기가 막힌다 */
function lockButton(g: Gear): HTMLButtonElement {
  const b = button(g.lock ? '🔒' : '🔓', () => send({ t: 'gearLock', uid: g.uid, on: !g.lock }));
  b.classList.add('glock');
  b.classList.toggle('on', !!g.lock);
  b.setAttribute('aria-pressed', String(!!g.lock));
  b.setAttribute('aria-label', t(g.lock ? 'gearLockOff' : 'gearLockOn'));
  b.title = t(g.lock ? 'gearLockOff' : 'gearLockOn');
  return b;
}

/** 비교 한 줄: 기준의 이름, 결론(더 좋음/더 나쁨/엇갈림/비슷), 수치별 증감. 좋아진 것은 ▲ 초록, 나빠진 것은 ▼ 빨강이다 (받는 피해는 줄어야 좋다) */
function cmpLine(head: string, d: GearDelta, notes: string[]): HTMLDivElement {
  const loc = L(), v = VERDICT[gearVerdict(d)], sign = deltaSigns(d), line = el('gcmpline');
  const top = el('gcmptop');
  top.append(span('ghead', head), span('gv ' + gearVerdict(d), `${v.mark} ${t(v.key)}`));
  const stats = el('gstats');
  const stat = (good: number, text: string) => stats.append(span('opt ' + (good > 0 ? 'up' : 'down'), `${good > 0 ? '▲' : '▼'} ${text}`));
  if (d.dmg) stat(sign.dmg, loc.fmt.cmpDmg(d.dmg));
  if (d.guard) stat(sign.guard, loc.fmt.cmpGuard(d.guard));
  if (d.crit) stat(sign.crit, loc.fmt.cmpCrit(d.crit));
  if (d.hp) stat(sign.hp, loc.fmt.cmpHp(d.hp));
  if (d.power) stats.append(span('opt', loc.fmt.cmpPower(d.power)));
  line.append(top);
  if (stats.childElementCount) line.append(stats);
  for (const n of notes) line.append(el('note', n));
  return line;
}
/** 가방의 장비를 지금 낀 같은 칸의 장비와 견준다: 지금 그대로 바꿨을 때와, 두 장비를 둘 중 높은 강화 단계로 맞췄을 때 (셈은 서버와 같은 공용 함수 compareGear) */
function compareEl(g: Gear): HTMLDivElement {
  const loc = L(), c = compareGear(wornNow(), g), box = el('gcmp');
  box.append(cmpLine(c.worn ? t('cmpNow') : `${t('cmpNow')} (${t('cmpNone')})`, c.now, []));
  if (c.even) {
    const notes: string[] = [];
    for (const [who, r] of [[t('cmpThis'), c.even.cand], [t('cmpWorn'), c.even.worn]] as const) {
      if (r.to > r.from) notes.push(loc.fmt.cmpRaise(who, r.from, r.to, r.cost));
      if (r.capped) notes.push(loc.fmt.cmpCapped(who, r.to));
    }
    box.append(cmpLine(loc.fmt.cmpEven(c.even.plus), c.even.delta, notes));
  }
  return box;
}

/** 펼친 가방 장비의 아래 줄: 강화·팔기·분해 단추와 장비 비교 */
function gearMore(g: Gear, cls: string): HTMLDivElement {
  const loc = L(), price = sellPrice(g), box = el('mrow gear gmore ' + cls), acts = el('acts');
  acts.append(enhanceButton(g));
  const rf = reforgeButton(g);
  if (rf) acts.append(rf);
  acts.append(armButton(loc.fmt.sellFor(price), loc.fmt.sellConfirm(price), act.sellUid === g.uid, (on) => { act.sellUid = on ? g.uid : 0; }, 'sellTimer', () => send({ t: 'sell', uid: g.uid }), !!g.lock));
  if (S.salvage.on && !isSupply(g)) {
    const dust = dustFor(g);
    acts.append(armButton(loc.fmt.salvageFor(dust), loc.fmt.salvageConfirm(dust), act.salvUid === g.uid, (on) => { act.salvUid = on ? g.uid : 0; }, 'salvTimer', () => send({ t: 'salvage', uids: [g.uid] }), !!g.lock));
  }
  box.append(acts, compareEl(g));
  return box;
}

/** 장비 한 줄. 낀 장비는 빼기·강화·잠금이 바로 보이고, 가방의 장비는 끼기·잠금만 보이다가 누르면 강화·팔기·분해와 비교가 그 아래에 펼쳐진다 */
function gearRow(g: Gear, worn: boolean): HTMLElement[] {
  const loc = L(), label = gearLabel(g), open = !worn && act.openUid === g.uid;
  const toggle = () => { act.openUid = open ? 0 : g.uid; redraw(); };
  const buttons: HTMLElement[] = [];
  if (!worn) buttons.push(button(t('equip'), () => send({ t: 'equip', uid: g.uid })));
  else if (g.slot !== 'weapon') buttons.push(button(t('unequip'), () => send({ t: 'unequip', slot: g.slot }))); // 무기는 빼지 못한다: 다른 무기를 끼면 바뀐다
  if (worn) { buttons.push(enhanceButton(g)); const rf = reforgeButton(g); if (rf) buttons.push(rf); }
  buttons.push(lockButton(g));
  const title = gearTitle(label.slot, label.name);
  if (!worn) {
    // 지금 낀 것과 바꾸면 나은지를 줄에서 바로 알린다 (지금 그대로의 기준. 자세한 비교는 펼치면 나온다)
    const verdict = gearVerdict(compareGear(wornNow(), g).now), v = VERDICT[verdict];
    const mark = span('garrow ' + verdict, v.mark);
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', loc.fmt.cmpArrow(t(v.key)));
    mark.title = loc.fmt.cmpArrow(t(v.key));
    title.prepend(mark);
    const more = button(open ? '▴' : '▾', toggle);
    more.classList.add('gmorebtn');
    more.setAttribute('aria-expanded', String(open));
    more.setAttribute('aria-label', t(open ? 'gearLess' : 'gearMore'));
    buttons.push(more);
  }
  // 가방의 줄은 단추가 셋뿐이라 이름 옆에 둔다 (줄이 낮아져 한 화면에 더 많이 보인다)
  const r = row(title, optsEl(label.opts), buttons, 'gear ' + (worn ? '' : 'gside ') + label.cls);
  // 장비의 그림(무기·갑옷은 바탕 아이템, 반지 같은 것은 칸의 그림): 이름 줄의 맨 앞
  const pic = gearIcon(g, S.me?.cls ?? '');
  if (pic) title.prepend(pic);
  r.dataset.uid = String(g.uid);
  if (!worn) { const what = r.querySelector<HTMLElement>('.what'); what?.classList.add('tap'); what?.addEventListener('click', toggle); }
  if (act.enhUid === g.uid && !act.enhWait) {
    r.classList.add(act.enhOk ? 'ok' : 'fail');
    const res = el('mresult', act.enhOk ? loc.fmt.enhanceDone(act.enhPlus) : act.enhRes === 'down' ? loc.fmt.enhanceDownTo(act.enhPlus) : act.enhRes === 'kept' ? loc.fmt.enhanceKept(act.enhPlus) : t('enhanceFailed'));
    res.setAttribute('role', 'status');
    r.querySelector('.what')?.append(res);
  }
  const out: HTMLElement[] = [r];
  if (open) out.push(gearMore(g, label.cls));
  if (act.refUid === g.uid && REFORGE.max > 0 && g.opts.length) out.push(reforgeEl(g));
  return out;
}

/** 가방의 머리줄: 든 수와 칸 수, 넓히기 단추 (다음 값을 보여 주고 한 번 더 눌러 확인한다) */
function bagHead(): HTMLDivElement {
  const loc = L(), me = S.me, m = S.meta, head = el('baghead gbag');
  const worn = wornNow().length;
  // 낀 장비도 칸을 차지한다: 목록에는 안 낀 것만 있어 수가 헷갈렸다(플레이어 재검토)
  head.append(span('', `${t('tabGear')} ${loc.fmt.have(m.gear.length, S.bag.max)}${worn ? ' ' + loc.fmt.bagWorn(worn) : ''}`));
  const price = S.bag.known ? bagUpPrice(S.bag.up) : null;
  if (price !== null) head.append(armButton(loc.fmt.bagUpFor(BAG_UP.step, price), loc.fmt.sellConfirm(price), act.upArmed, (on) => { act.upArmed = on; }, 'upTimer', () => send({ t: 'bagUp' }), !me || me.gold < price));
  return head;
}

/** 분해의 도구들: 가진 가루, 일괄 분해(등급을 고르면 대상 수와 나올 가루를 보여 주고 확인을 받는다), 자동 분해의 설정 */
function salvageTools(rest: Gear[]): HTMLElement[] {
  const loc = L(), me = S.me, out: HTMLElement[] = [];
  if (!me || !isItemId(SALVAGE.item)) return out;
  const item = SALVAGE.item, have = me.items[item] ?? 0, cap = itemCap(item);
  const rarName = (v: string): string => loc.fmt.rarAtMost(loc.gear.rarities[RARITIES[Number(v)].id]);
  const choices = autoSalvageChoices().map(String), tools = el('mtools gtools');
  tools.append(
    select(t('salvageAll'), choices, String(act.bulk), (v) => (v === '-1' ? t('salvageAll') : rarName(v)), (v) => { act.bulk = Number(v); redraw(); }),
    select(loc.fmt.autoSalvageOpt(''), choices, String(S.salvage.auto), (v) => loc.fmt.autoSalvageOpt(v === '-1' ? t('autoSalvageOff') : rarName(v)), (v) => { send({ t: 'autoSalvage', rar: Number(v) }); }),
  );
  out.push(el('note gdust', loc.fmt.dustHave(have, cap)), tools);
  if (act.bulk >= 0) {
    // 일괄 분해의 대상: 가방의 장비 가운데 고른 등급 이하이고, 보급형도 잠근 것도 아닌 것 (낀 장비는 rest에 없다)
    // 강화한 장비(+1 이상)는 일괄 분해에서 뺀다: 공들인 +7 반지가 섞여 경고 없이 사라졌다(후반부 검토). 하나씩은 분해할 수 있다
    const targets = rest.filter((x) => x.rar <= act.bulk && canSalvage(x) && x.plus === 0), dust = targets.reduce((s, x) => s + dustFor(x), 0), over = dust > cap - have;
    const upTo = rarName(String(act.bulk));
    const go = button(loc.fmt.salvageAllGo(targets.length), () => { send({ t: 'salvage', uids: targets.map((x) => x.uid) }); act.bulk = -1; redraw(); }, !targets.length || over || targets.length > SALVAGE.maxBatch);
    go.classList.add('armed');
    const r = row(targets.length ? loc.fmt.salvageAllPreview(upTo, targets.length, dust) : loc.fmt.salvageAllNone(upTo), over ? loc.fmt.salvageOver(cap - have) : '', [...(targets.length ? [go] : []), button(t('salvageCancel'), () => { act.bulk = -1; redraw(); })], 'gbulk'); // 대상이 없으면 분해 단추를 그리지 않는다 (0점 분해는 뜻이 없다)
    r.setAttribute('role', 'status');
    out.push(r);
  }
  if (S.salvage.auto >= 0) out.push(el('note', loc.fmt.autoSalvageOn(rarName(String(S.salvage.auto)))));
  return out;
}

export function drawGear(): void {
  const loc = L(), m = S.meta;
  // 전투력은 순위 모듈(rank)이 셈해 보낸다: 그 모듈이 없는 게임(메아리 계약)에서는 늘 0이라 줄을 뺀다
  if (hasModule('rank')) ui.list.append(el('baghead', loc.fmt.power(m.power)));
  // 보급형과 만들거나 주운 장비의 차이는 늘 보이게 둔다 (예전에는 남는 장비가 없을 때만 떴다)
  ui.list.append(el('note', loc.fmt.gearHint(ENHANCE.supplyMax, ENHANCE.max, SELLS_GEAR, RECIPES.length > 0 && FORGES.length > 0)));
  // 강화의 위험과 부적 쓰기 단추: 낀 장비를 강화할 때 바로 보이게 낀 장비 위에 둔다 (검토 6: 아래에 있어 스크롤해야 보였다)
  const risk = enhanceRiskEl();
  if (risk) ui.list.append(risk);
  for (const slot of GEAR_SLOTS) {
    const g = m.gear.find((x) => x.uid === m.worn[slot]);
    if (g) ui.list.append(...gearRow(g, true));
    else ui.list.append(row(gearTitle(loc.gear.slots[slot], t('none')), '', [], 'empty'));
  }
  const rest = m.gear.filter((x) => m.worn[x.slot] !== x.uid).sort((a, b) => b.rar - a.rar || b.lv - a.lv);
  ui.list.append(bagHead());
  if (act.res) { const ok = GEAR_OK.has(act.res.k), r = el('note gres ' + (ok ? 'ok' : 'fail'), forInput(L().msg[act.res.k](act.res.a))); r.setAttribute('role', 'status'); ui.list.append(r); }
  // 가방이 가득 찼으면 눈에 띄게 알린다: 새로 떨어지는 장비가 조용히 버려진다
  if (m.gear.length >= S.bag.max) { const warn = el('note gwarn', S.bag.lost > 0 ? loc.fmt.bagLost(S.bag.lost) : t('bagFull')); warn.setAttribute('role', 'status'); ui.list.append(warn); }
  if (S.salvage.on) ui.list.append(...salvageTools(rest));
  if (!rest.length) ui.list.append(el('note', t('gearEmpty')));
  else ui.list.append(el('note', t('gearTapHint')));
  for (const g of rest) ui.list.append(...gearRow(g, false));
}

/** 분해·넓히기·재련의 답을 장비 탭 안에 보여 준다 (5초) */
export function onGearResult(m: { k: MsgKey; a?: MsgArg[] }): void {
    if (!GEAR_OK.has(m.k) && !GEAR_FAIL.has(m.k)) return;
    act.res = { k: m.k, a: m.a ?? [] };
    clearTimeout(act.resTimer);
    act.resTimer = window.setTimeout(() => { act.res = null; redraw(true); }, 5000);
    redraw(true);
}
/** 강화의 결과를 누른 그 줄에 잠깐 보여 준다 */
export function onEnhanceResult(m: { k: MsgKey; a?: MsgArg[] }): void {
    if (!act.enhWait) return;
    if (m.k === 'enhanceOk' || m.k === 'enhanceFail' || m.k === 'enhanceDown' || m.k === 'enhanceSaved') {
      act.enhWait = false; act.enhOk = m.k === 'enhanceOk'; act.enhPlus = Number(m.a?.[0] ?? 0);
      act.enhRes = m.k === 'enhanceDown' ? 'down' : m.k === 'enhanceSaved' ? 'kept' : m.k === 'enhanceFail' ? 'fail' : '';
      clearTimeout(act.enhTimer);
      act.enhTimer = window.setTimeout(() => { act.enhUid = 0; redraw(); }, 3000);
      redraw();
    } else if (m.k === 'enhanceMax' || m.k === 'noGold' || m.k === 'noMats') { act.enhWait = false; act.enhUid = 0; }
}
