// 라이브 콘텐츠의 화면 (묶음 6): 메뉴의 '상점'(GOODS)·'이벤트'(event)·'시즌'(season)·'업적'(achieve)·'도감'(codex) 탭, 우편 탭 머리의 쿠폰 칸(coupon),
// 길 상인 창의 특별 상품(GOODS의 shop 'npc'), 이름표의 칭호. 서버의 짝은 engine/server/game/systems/goods.ts·event.ts·season.ts·achieve.ts·codex.ts·coupon.ts.
// 사람마다의 상태는 개인 상태(me: goods, event, season, achieve, codex)로 온다. 표(이름·보상·값)는 내용에서 읽는다 (서버와 같은 내용).
import { SEASON, codexDef, eventDef, eventIds, goodsDef, goodsIds, goodsOpen, achieveDef, achieveIds, isMonsterId, isItemId, type AchieveMe, type CodexMe, type EventMe, type GoodsDef, type GoodsMe, type Reward, type SeasonMe } from '../../shared/defs';
import { onMsg } from '../bus';
import { setTitle } from '../entities';
import { L, itemName, t } from '../i18n';
import { heroName } from '../i18n/ko';
import { addCodexSection, setCodexSeen } from './codexbook';
import { achName, codexName, evName, goodsName, missionName, seasonName, titleName } from '../i18n/live';
import { uiText } from '../i18n/names';
import { send } from '../net';
import { S } from '../state';
import { addMenuTab } from './menu';
import { goodsText } from './menu/gear';
import { mailTop } from './menu/mail';
import { button, doneMark, el, emptyState, lockMark, optsEl, progBar, redraw, rewardText, row } from './menu/parts';
import { renderShop, shopExtras } from './shop';

let goods: GoodsMe = { b: {}, s: {} };
let events: EventMe[] = [];
let season: SeasonMe | null = null;
let ach: AchieveMe = { c: {}, got: [], title: '' };
let codex: (CodexMe & { ids: Record<string, string[]> }) | null = null;

const giveText = (r: Reward, hero?: string): string[] => [rewardText(r), goodsText(r), hero ? heroName(hero) : ''];

/** 상품 한 줄: 이름, 주는 것·값·한정·남은 수, 사기 단추 */
function goodsRow(id: string, def: GoodsDef): HTMLElement {
  const loc = L(), have = goods.b[id] ?? 0, left = goods.s[id];
  const limited = !!def.limit && have >= def.limit.n, out = left !== undefined && left <= 0;
  const bits = [...giveText(def.give, def.hero), def.price.item !== undefined ? loc.fmt.goodsPriceItem(def.price.n, def.price.item) : loc.fmt.goodsPrice(def.price.n, def.price.cur, def.price.kind === 'event')];
  if (def.limit) bits.push(loc.fmt.goodsLimit(have, def.limit.n, def.limit.per ?? 'ever'));
  if (left !== undefined) bits.push(loc.fmt.goodsStock(left));
  if (def.to !== undefined) bits.push(loc.fmt.liveLeft(def.to - Date.now()));
  const label = out ? t('goodsSoldOut') : limited ? t('goodsAllBought') : t('goodsBuy');
  return row(goodsName(id), optsEl(bits), [button(label, () => send({ t: 'goods', id }), out || limited)], out || limited ? 'done' : '');
}

function drawGoods(list: HTMLElement): void {
  const now = Date.now();
  const ids = goodsIds().filter((id) => { const d = goodsDef(id)!; return !d.event && d.shop !== 'npc' && goodsOpen(d, now); });
  if (!ids.length) { list.append(emptyState('shop', t('goodsNone'))); return; }
  // shop 이름표마다 묶는다 (기본 'shop'은 머리 없이)
  const groups = new Map<string, string[]>();
  for (const id of ids) { const k = goodsDef(id)!.shop ?? 'shop'; groups.set(k, [...(groups.get(k) ?? []), id]); }
  for (const [k, list2] of groups) {
    if (k !== 'shop') list.append(el('baghead', uiText.get(k)));
    for (const id of list2) list.append(goodsRow(id, goodsDef(id)!));
  }
}

function drawEvents(list: HTMLElement): void {
  const loc = L(), now = Date.now();
  if (!events.length) { list.append(emptyState('event', t('eventNone'))); return; }
  for (const ev of events) {
    const def = eventDef(ev.id);
    if (!def) continue;
    const box = el('gbanner liveEv');
    box.append(el('ttitle', evName(ev.id)), el('note', `${loc.fmt.liveSpan(ev.from, ev.to)} · ${loc.fmt.liveLeft(ev.to - now)}`));
    if (def.note) box.append(el('note', uiText.get(def.note)));
    if (def.cur) {
      box.append(el('liveHave', loc.fmt.eventHave(ev.have, def.cur)));
      box.append(el('note', def.end?.swap ? loc.fmt.eventSwap(def.end.swap.rate, def.end.swap.to) : t('eventGone')));
    }
    list.append(box);
    const ms = Object.entries(def.missions ?? {});
    if (ms.length) {
      list.append(el('baghead', t('eventMissions')));
      for (const [mid, m] of ms) {
        const done = ev.got.includes(mid);
        list.append(row(missionName(ev.id, mid), optsEl([...giveText(m.r ?? {}), m.ev ? loc.fmt.eventEv(m.ev) : '']), [done ? doneMark(t('dailyDone')) : el('num', loc.fmt.have(ev.prog[mid] ?? 0, m.n))], done ? 'done' : ''));
      }
    }
    const shop = goodsIds().filter((id) => goodsDef(id)!.event === ev.id);
    if (shop.length) { list.append(el('baghead', t('eventShop'))); for (const id of shop) list.append(goodsRow(id, goodsDef(id)!)); }
  }
}

function drawSeason(list: HTMLElement): void {
  const loc = L(), s = SEASON;
  if (!s || !season) { list.append(emptyState('season', t('seasonNone'))); return; }
  const me = season, box = el('gbanner liveEv');
  box.append(el('ttitle', loc.fmt.seasonHead(seasonName(), me.n)), el('note', `${loc.fmt.liveLeft(me.to - Date.now())}`), el('liveHave', loc.fmt.seasonPts(me.pts)));
  const r = s.reset ?? 'all';
  box.append(el('note', loc.fmt.seasonReset(typeof r === 'object' ? String(Math.round(r.part * 100)) : r)));
  list.append(box);
  const ready = s.track.map((x, i) => i).filter((i) => me.pts >= s.track[i].pts && !me.got.includes(i));
  // 다음 단계까지의 막대 (U2: 숫자만 있던 것)
  const nextTier = s.track.find((x) => x.pts > me.pts);
  if (nextTier) { const prev = [...s.track].reverse().find((x) => x.pts <= me.pts)?.pts ?? 0; box.append(progBar((me.pts - prev) / Math.max(1, nextTier.pts - prev)), el('note', loc.fmt.seasonNext(nextTier.pts - me.pts))); }
  list.append(el('baghead', t('seasonTrack')));
  if (ready.length > 1) list.append(button(t('seasonClaimAll'), () => send({ t: 'season', i: -1 })));
  s.track.forEach((tier, i) => {
    const got = me.got.includes(i), can = ready.includes(i);
    // 세 모양 (U2): 받음(✓, 흐림 없이) · 받기(주 단추) · 잠김(🔒 n점 더)
    const claim = button(t('seasonClaim'), () => send({ t: 'season', i }));
    claim.className = 'btn-primary';
    list.append(row(loc.fmt.seasonTier(i, tier.pts), optsEl(giveText(tier.r)), [got ? doneMark(t('stateGot')) : can ? claim : lockMark(loc.fmt.seasonNext(tier.pts - me.pts))], got ? 'done' : can ? 'ready' : 'locked'));
  });
  list.append(el('note', t('seasonNote')));
}

function drawAchieve(list: HTMLElement): void {
  const loc = L();
  list.append(el('baghead', t('achieveTitles')));
  list.append(ach.title ? row(loc.fmt.achieveTitle(titleName(ach.title)), '', [button(t('titleOff'), () => send({ t: 'title', id: '' }))]) : el('note', t('titleNone')));
  list.append(el('baghead', t('tabAchieve')));
  for (const id of achieveIds()) {
    const a = achieveDef(id)!, done = ach.got.includes(id);
    const bits = [...giveText(a.r ?? {}), a.title ? loc.fmt.achieveTitle(titleName(id)) : ''];
    const acts = done ? (a.title && ach.title !== id ? [button(t('titleUse'), () => send({ t: 'title', id }))] : [doneMark(t('dailyDone'))]) : [el('num', loc.fmt.have(Math.min(a.n, ach.c[a.kind] ?? 0), a.n))];
    list.append(row(achName(id), optsEl(bits), acts, done ? 'done' : ''));
  }
}

function drawCodex(list: HTMLElement): void {
  const loc = L();
  list.append(el('note', t('codexNote')));
  if (!codex) return;
  for (const gid of Object.keys(codex.ids)) {
    const def = codexDef(gid);
    if (!def) continue;
    const ids = codex.ids[gid], seen = new Set(codex.seen[gid] ?? []);
    list.append(el('baghead', `${codexName(gid)} · ${loc.fmt.codexCount(ids.filter((x) => seen.has(x)).length, ids.length)}`));
    const grid = el('codexGrid');
    for (const id of ids) {
      const name = !seen.has(id) ? t('codexUnknown') : def.of === 'hero' ? heroName(id) : def.of === 'monster' ? (isMonsterId(id) ? loc.monsters[id] : id) : isItemId(id) ? itemName(id, '') : id;
      grid.append(el(seen.has(id) ? 'codexCell on' : 'codexCell', name));
    }
    list.append(grid);
    (def.rewards ?? []).forEach((rw, i) => {
      const got = (codex!.got[gid] ?? []).includes(i);
      list.append(row(loc.fmt.codexAt(rw.n), optsEl(giveText(rw.r)), [el('num', got ? t('dailyDone') : loc.fmt.have(Math.min(seen.size, rw.n), rw.n))], got ? 'done' : ''));
    });
  }
}

/** 우편 탭 머리의 쿠폰 칸 */
function drawCoupon(list: HTMLElement): void {
  const box = el('mrow couponRow'), input = document.createElement('input');
  input.type = 'text'; input.maxLength = 32; input.placeholder = t('couponPh'); input.setAttribute('aria-label', t('couponHead')); input.autocomplete = 'off'; input.spellcheck = false;
  const go = () => { const code = input.value.trim(); if (code) { send({ t: 'coupon', code }); input.value = ''; input.blur(); } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
  box.append(el('iname', t('couponHead')), input, button(t('couponUse'), go));
  list.append(box);
}

/** 길 상인 창의 특별 상품 */
function drawNpcGoods(list: HTMLElement): void {
  const now = Date.now(), ids = goodsIds().filter((id) => { const d = goodsDef(id)!; return d.shop === 'npc' && !d.event && goodsOpen(d, now); });
  if (!ids.length) return;
  list.append(el('baghead', t('goodsNpc')));
  for (const id of ids) list.append(goodsRow(id, goodsDef(id)!));
}

/** 홈의 이벤트 배너에 보일 것 (수집형 홈 키트의 events): 열린 기간 이벤트, 7일 안에 열릴 이벤트, 지금 시즌. 차례: 열린 이벤트 → 시즌 → 곧 열릴 이벤트 */
export interface LiveBanner { id: string; kind: 'event' | 'season'; name: string; from: number; to: number; open: boolean; /** 받을 보상이 있다 (시즌) */ ready?: boolean }
export function liveBanners(now = Date.now()): LiveBanner[] {
  const out: LiveBanner[] = [];
  const open = new Set(events.map((e) => e.id));
  for (const e of events) out.push({ id: e.id, kind: 'event', name: evName(e.id), from: e.from, to: e.to, open: true });
  if (SEASON && season) out.push({ id: 'season', kind: 'season', name: L().fmt.seasonHead(seasonName(), season.n), from: typeof SEASON.period === 'object' ? season.to - SEASON.period.days * 86_400_000 : 0, to: season.to, open: true, ready: SEASON.track.some((x, i) => season!.pts >= x.pts && !season!.got.includes(i)) });
  for (const id of eventIds()) {
    const d = eventDef(id);
    if (!d || open.has(id) || d.from <= now || d.from - now > 7 * 86_400_000) continue;
    out.push({ id, kind: 'event', name: evName(id), from: d.from, to: d.to, open: false });
  }
  return out;
}

export function initGoods(): void {
  if (!goodsIds().length) return;
  if (goodsIds().some((id) => { const d = goodsDef(id)!; return !d.event && d.shop !== 'npc'; })) addMenuTab({ id: 'goods', label: () => t('tabGoods'), draw: drawGoods, sig: () => goods });
  shopExtras.push(drawNpcGoods);
  onMsg('me', (m) => { if (m.k === 'goods') { goods = m.s as GoodsMe; redraw(true); renderShop(); } });
}
export function initEvent(): void {
  addMenuTab({ id: 'event', label: () => t('tabEvent'), draw: drawEvents, sig: () => [events, goods], dot: () => events.length > 0 });
  onMsg('me', (m) => { if (m.k === 'event') { events = m.s as EventMe[]; redraw(true); } });
}
export function initSeason(): void {
  addMenuTab({ id: 'season', label: () => t('tabSeason'), draw: drawSeason, sig: () => season, dot: () => !!season && !!SEASON && SEASON.track.some((x, i) => season!.pts >= x.pts && !season!.got.includes(i)) });
  onMsg('me', (m) => { if (m.k === 'season') { season = m.s as SeasonMe | null; redraw(true); } });
}
export function initAchieve(): void {
  addMenuTab({ id: 'achieve', label: () => t('tabAchieve'), draw: drawAchieve, sig: () => ach });
  onMsg('me', (m) => { if (m.k === 'achieve') { const was = ach.title; ach = m.s as AchieveMe; if (S.me && was !== ach.title) setTitle(S.me.id, ach.title); redraw(true); } });
  onMsg('title', (m) => setTitle(m.id, m.ti));
}
export function initCodex(): void {
  // 도감 창(hud/codexbook.ts)의 맨 앞 칸 '모은 것'으로 (예전에는 따로 탭이었다: 탭 id 'codex'는 그대로 도감 창이다). 몬스터·아이템 칸에도 모은 것을 표시한다
  addCodexSection({ id: 'collect', label: () => t('cbCollect'), draw: drawCodex, sig: () => codex }, true);
  setCodexSeen((of) => {
    if (!codex) return null;
    const out = new Set<string>();
    let any = false;
    for (const gid of Object.keys(codex.ids)) if (codexDef(gid)?.of === of) { any = true; for (const id of codex.seen[gid] ?? []) out.add(id); }
    return any ? out : null;
  });
  onMsg('me', (m) => { if (m.k === 'codex') { codex = m.s as CodexMe & { ids: Record<string, string[]> }; redraw(true); } });
}
export function initCoupon(): void { mailTop.push(drawCoupon); }
