// 메뉴 창: 드롭 장비(끼기·강화·팔기·분해·잠금·비교, 가방 넓히기), 우편, 일일 임무와 출석, 거래소, 길드, 순위를 탭으로 나눠 보여 준다. (단축키 M)
// 틀의 탭은 일곱(MENU_TABS의 id: gear, build, mail, daily, market, guild, rank)이고 저마다 선택 모듈에 속한다: 그 모듈을 고른 게임에만 있다.
// 게임은 보일 탭과 차례를 고르고(setMenuTabs), 자기 탭을 더한다(addMenuTab). 일일 임무와 출석이 모두 없는 게임에서는 일일 탭이 저절로 숨는다.
// 창의 높이와 탭 줄, 닫기 단추의 자리는 고정이고(style.css의 #menu) 내용만 창 안에서 스크롤한다.
// 이 파일은 창(탭 줄, 다시 그리기, 열고 닫기, 메시지 받기)만 맡는다. 탭마다의 그리기는 menu/ 아래에 있다:
//   menu/tabs.ts   탭 목록의 셈 (화면 요소를 읽지 않는다: 시험 engine/test/fx/client.test.ts)
//   menu/parts.ts  탭들이 함께 쓰는 요소 만들기와 다시 그리기(redraw)
//   menu/gear.ts 장비 · build.ts 성장 · mail.ts 우편 · daily.ts 일일 · market.ts 거래소 · guild.ts 길드 · rank.ts 순위
import { setScene } from './artdom';
import { ATTEND, DAILY_IDS } from '../../shared/defs';
import { $ } from '../app';
import { setGuildTag } from '../entities';
import { bindKey, onMsg, onSlow } from '../bus';
import { hasModule } from '../mods';
import { L, onLangChange, t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { S } from '../state';
import { addNotices } from './notify';
import { bindDot, dotOf, setDot } from './dots';
import { drawBuild } from './menu/build';
import { drawDaily } from './menu/daily';
import { act, drawGear, onEnhanceResult, onGearResult } from './menu/gear';
import { drawGuild } from './menu/guild';
import { drawMail, setMailToDaily } from './menu/mail';
import { drawMarket, marketOpen, onMarketMsg } from './menu/market';
import { button, lockBand, setRedraw, ui } from './menu/parts';
import { askRank, drawRank, rankTick } from './menu/rank';
import { ENGINE_TAB_MODS, groupTabs, MENU_GROUPS, tabsForModules, visibleTabs, type MenuGroupDef, type MenuTab } from './menu/tabs';
import { platform } from '../platform';
import { uiIcon } from './uiicons';
import { keepFocus } from './a11y';

export { MENU_GROUPS, MENU_TABS, type EngineMenuTab, type MenuGroupDef, type MenuTab } from './menu/tabs';

const ENGINE_TABS: MenuTab[] = [
  { id: 'gear', label: () => t('tabGear'), draw: drawGear, mod: ENGINE_TAB_MODS.gear },
  { id: 'build', label: () => t('tabBuild'), draw: drawBuild, dot: () => S.meta.build.left > 0, mod: ENGINE_TAB_MODS.build },
  { id: 'mail', label: () => t('tabMail'), draw: drawMail, dot: () => S.meta.mail.length > 0, mod: ENGINE_TAB_MODS.mail },
  { id: 'daily', label: () => t('tabDaily'), draw: drawDaily, mod: ENGINE_TAB_MODS.daily },
  { id: 'market', label: () => t('tabMarket'), draw: drawMarket, open: () => marketOpen(), mod: ENGINE_TAB_MODS.market },
  { id: 'guild', label: () => t('tabGuild'), draw: drawGuild, mod: ENGINE_TAB_MODS.guild },
  { id: 'rank', label: () => t('tabRank'), draw: drawRank, open: () => askRank(), mod: ENGINE_TAB_MODS.rank },
];
/** 탭 모두 (틀의 것 가운데 고른 모듈의 것 + 게임이 더한 것), 그리고 게임이 고른 보일 탭의 차례 (null이면 모두, 더한 차례대로) */
const allTabs: MenuTab[] = tabsForModules(ENGINE_TABS, hasModule);
/** 탭의 점을 알림 점의 원천으로 (hud/dots.ts): 'menu.<탭 id>', 지금 보이는 탭만, 메뉴 단추('menu')로 번진다 */
function tabDot(x: MenuTab): void { const fn = x.dot; if (fn) setDot(`menu.${x.id}`, () => tabs().some((v) => v.id === x.id) && fn(), 'menu'); }
let order: string[] | null = null;
/** 일일 임무도 출석도 없는 게임: 일일 탭을 숨긴다 */
const noDaily = (): boolean => DAILY_IDS.length === 0 && ATTEND.length === 0;
/** 탭의 열림 (묶음 D 튜토리얼 키트의 점진 공개: hud/unlocks.ts). hide면 숨기고, why가 있으면 🔒와 까닭. 없으면 모두 열림 (예전과 같다) */
let gate: ((id: string) => { hide: boolean; why: string } | null) | null = null;
export function setTabGate(fn: ((id: string) => { hide: boolean; why: string } | null) | null): void { gate = fn; lastSig = ''; }
const gateOf = (id: string) => gate?.(id) ?? null;
/** 지금 보이는 탭들 */
const tabs = (): MenuTab[] => visibleTabs(allTabs, order, noDaily()).filter((x) => !gateOf(x.id)?.hide);
/**
 * 보일 탭과 그 차례를 고른다 (틀의 id와 게임이 더한 탭의 id). 고르지 않은 탭은 숨는다: 화면에서 감출 뿐이다.
 * 기능 자체를 빼려면(서버의 명령까지) 내용의 MODULES에서 그 모듈을 뺀다: 그러면 탭도 저절로 없다
 */
export function setMenuTabs(ids: readonly string[]): void { order = [...ids]; lastSig = ''; }
/** 게임의 탭을 더한다. after를 주면 그 탭 뒤에, 아니면 맨 뒤에. setMenuTabs를 썼다면 그 목록에도 id를 넣어야 보인다 */
export function addMenuTab(def: MenuTab, after?: string): void {
  const at = after ? allTabs.findIndex((x) => x.id === after) : -1;
  allTabs.splice(at < 0 ? allTabs.length : at + 1, 0, def);
  tabDot(def);
  lastSig = '';
}
/** 지금 고른 탭의 id (다시 열면 마지막에 본 탭: 기기에 적어 둔다) */
let cur = 'gear';

// ---------- 탭 묶음 (U3): 위 줄은 묶음(성장·수집 / 활동 / 소식 / 정보 / 설정), 고른 묶음의 탭은 그 아래 줄. 묶음마다 마지막에 본 탭을 기억한다 ----------
/** 메뉴의 묶음 하나 (게임이 이름을 줄 수 있다: 없으면 i18n의 'mg' + id) */
export interface MenuGroup extends MenuGroupDef { label?: () => string }
let groups: readonly MenuGroup[] | null = null;
/** 묶음마다 마지막에 본 탭 (기기의 'menuLast') */
let lastIn: Record<string, string> = {};
/** 기기에 적어 둔 마지막 탭을 읽는다 (initMenu: 플랫폼의 저장소가 준비된 뒤) */
function recall(): void {
  try { const v = JSON.parse(platform().storage.get('menuLast') ?? '{}') as { cur?: string; g?: Record<string, string> }; if (typeof v.cur === 'string') cur = v.cur; if (v.g && typeof v.g === 'object') lastIn = v.g; } catch { /* 깨진 값은 버린다 */ }
}
/** 고른 탭을 기억한다 (그 탭의 묶음에도) */
function remember(id: string): void {
  const g = groups ? groupTabs(groups, tabs()).find((x) => x.tabs.some((y) => y.id === id)) : undefined;
  if (g) lastIn[g.id] = id;
  platform().storage.set('menuLast', JSON.stringify({ cur: id, g: lastIn }));
}
/**
 * 메뉴의 탭을 묶음으로 보인다 (U3 정보 구조). 주지 않으면 틀의 기본 묶음 다섯(MENU_GROUPS), null이면 묶음 없이 예전처럼 탭 한 줄.
 * 묶음의 탭 차례는 setMenuTabs의 차례다. 어느 묶음에도 없는 탭(게임이 더한 탭)은 첫 묶음에 든다. 보이는 탭이 없는 묶음은 빠진다
 */
export function setMenuGroups(list: readonly MenuGroup[] | null = MENU_GROUPS): void { groups = list; lastSig = ''; }
/** 틀의 묶음 다섯의 이름 */
const GROUP_KEY: Readonly<Record<string, UiKey>> = { grow: 'mgGrow', play: 'mgPlay', social: 'mgSocial', info: 'mgInfo', sys: 'mgSys' };
const groupLabel = (g: MenuGroup): string => g.label?.() ?? (GROUP_KEY[g.id] ? t(GROUP_KEY[g.id]) : g.id);
const current = (): MenuTab => { const list = tabs(); return list.find((x) => x.id === cur) ?? list[0] ?? allTabs[0]; };
/** 마지막으로 그린 내용의 지문 (같으면 다시 그리지 않는다) */
let lastSig = '';

/** 내 장비·우편·일일 임무·순위나 언어가 바뀌면 다시 그린다 (열려 있을 때만). 단추의 우편 수는 늘 맞춘다. */
/**
 * soft가 켜져 있으면(전투 중 초당 여러 번 오는 상태 메시지) 화면에 영향을 주는 값이 그대로일 때 다시 그리지 않는다.
 * 그 밖에는(단추를 눌렀을 때, 거래소·길드·순위 응답) 언제나 다시 그린다.
 */
export function renderMenu(soft = false): void { keepFocus(ui.panel, () => drawMenu(soft)); }
/** 메뉴를 그린다 (renderMenu가 키보드 포커스를 지켜 부른다: hud/a11y.ts의 keepFocus) */
function drawMenu(soft: boolean): void {
  const n = S.meta.mail.length;
  ui.btn.textContent = n ? `${t('menu')} ${n}` : t('menu');
  ui.btn.classList.toggle('alert', n > 0 || S.meta.build.left > 0 || !!S.guildInvite); // 받을 우편이나 찍을 점수가 있으면 눈에 띄게
  if (ui.panel.hidden || !S.me) return;
  const focus = document.activeElement;
  // 글을 치는 중이거나 고르는 상자를 펼쳐 둔 동안에는 다시 그리지 않는다 (칸이 새로 만들어지면 커서와 펼친 목록이 사라진다)
  if ((focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement) && ui.list.contains(focus)) { if (ui.gold) ui.gold.textContent = L().fmt.gold(S.me.gold); return; }
  // 전투 중에는 상태 메시지가 초당 여러 번 온다. 그때마다 단추를 새로 만들면 누르는 사이에 단추가 사라져 클릭이 먹지 않으므로,
  // 화면에 영향을 주는 값이 그대로면 다시 그리지 않는다
  const sig = JSON.stringify([cur, current().sig?.(), gate ? tabs().map((x) => gateOf(x.id)?.why ?? '') : 0, L().code, S.me.gold, S.me.lv, S.me.cls, S.meta, S.guild, S.guildInvite, S.rank, act.enhUid, act.enhWait, act.enhOk, act.sellUid, act.openUid, act.salvUid, act.upArmed, act.bulk, act.res, S.bag, S.salvage, S.me.items]);
  if (soft === true && sig === lastSig) return;
  lastSig = sig;
  if (ui.gold) ui.gold.textContent = L().fmt.gold(S.me.gold); // 재화가 없는 게임에는 없다
  const left = ui.tabs.scrollLeft, subLeft = ui.sub.scrollLeft;
  ui.tabs.textContent = '';
  ui.sub.textContent = '';
  const on = current();
  // 찍을 점수나 받을 우편이 있으면 점(•)을 찍는다. 점은 단추 모서리에 얹어서(style.css) 생겨도 탭의 너비가 바뀌지 않는다
  // 탭의 원천(x.dot)이 있으면 지금 값을 바로 본다 (알림 점의 셈은 0.25초마다라, 받기 직후에 다시 그리면 꺼진 점이 남았다)
  const dotted = (x: MenuTab): boolean => (x.dot ? !!x.dot() : dotOf(`menu.${x.id}`) > 0);
  const tabBtn = (x: MenuTab): HTMLButtonElement => {
    const lock = gateOf(x.id);
    const b = button(x.label(), () => { const moved = cur !== x.id; cur = x.id; remember(x.id); x.open?.(); renderMenu(); if (moved) ui.list.scrollTop = 0; });
    b.dataset.tab = x.id;
    if (lock?.why) { b.classList.add('locked'); b.prepend(uiIcon('lock', 'sm')); }
    b.classList.toggle('on', x === on);
    b.setAttribute('aria-pressed', String(x === on)); // 낭독기: 고른 탭
    b.classList.toggle('dot', dotted(x));
    return b;
  };
  if (groups) {
    // 위 줄은 묶음, 아래 줄은 고른 묶음의 탭 (탭이 하나뿐인 묶음은 아래 줄이 없다)
    const gs = groupTabs(groups, tabs()), onG = gs.find((g) => g.tabs.includes(on)) ?? gs[0];
    ui.tabs.classList.add('groups');
    for (const g of gs) {
      const def = groups.find((x) => x.id === g.id)!;
      const b = button('', () => {
        const pick = g.tabs.find((x) => x.id === lastIn[g.id]) ?? g.tabs[0];
        const moved = cur !== pick.id; cur = pick.id; remember(pick.id); pick.open?.(); renderMenu(); if (moved) ui.list.scrollTop = 0;
      });
      b.classList.add('mgroup'); b.dataset.group = g.id;
      b.append(uiIcon(def.icon), Object.assign(document.createElement('span'), { textContent: groupLabel(def) }));
      b.classList.toggle('on', g === onG);
      b.setAttribute('aria-pressed', String(g === onG));
      b.classList.toggle('dot', g.tabs.some(dotted));
      b.classList.toggle('locked', g.tabs.every((x) => !!gateOf(x.id)?.why));
      ui.tabs.append(b);
    }
    ui.sub.hidden = !onG || onG.tabs.length < 2;
    if (onG && onG.tabs.length > 1) for (const x of onG.tabs) ui.sub.append(tabBtn(x));
  } else {
    ui.tabs.classList.remove('groups');
    ui.sub.hidden = true;
    tabs().forEach((x) => ui.tabs.append(tabBtn(x)));
  }
  ui.tabs.scrollLeft = left; ui.sub.scrollLeft = subLeft;
  const top = ui.list.scrollTop;
  ui.list.textContent = '';
  const lock = gateOf(on.id);
  if (lock?.why) ui.list.append(lockBand(lock.why)); else on.draw(ui.list);
  ui.list.scrollTop = top;
  setScene(ui.panel, on.id); // 탭의 배경 그림 'bg:<탭 id>' (art2: 없으면 그대로)
}
setRedraw(renderMenu);

/** 메뉴를 열고 그 탭을 보여 준다 (다른 창의 단추에서 부른다). id는 탭의 id(gear, mail …, 게임의 탭) */
export function openMenu(id: string): void {
  if (!S.me) return;
  cur = id;
  remember(id);
  ui.panel.hidden = false;
  lastSig = '';
  current().open?.();
  renderMenu();
}

/** 메뉴를 닫는다 (탭 안의 단추가 다른 곳으로 데려갈 때: 메뉴의 던전 들어가기 같은 것) */
export function closeMenu(): void { ui.panel.hidden = true; }
/** 열려 있는 메뉴의 탭 id (닫혀 있으면 '') */
export const menuTab = (): string => (ui.panel.hidden ? '' : current().id);

export function toggleMenu(): void {
  if (!S.me) return;
  ui.panel.hidden = !ui.panel.hidden;
  lastSig = '';
  if (!ui.panel.hidden) current().open?.();
  renderMenu();
}

export function initMenu(): void {
  recall();
  setMailToDaily(() => openMenu('daily'));
  bindKey('m', toggleMenu);
  for (const x of allTabs) tabDot(x);
  bindDot(ui.btn, 'menu');
  ui.btn.addEventListener('click', (e) => { toggleMenu(); (e.currentTarget as HTMLElement).blur(); });
  // 분해·잠금·가방 넓히기의 안내문을 어디에 띄울지: 한 일의 결과는 흘러가는 알림, 자리를 비운 동안의 장비 소식은 가운데 알림
  addNotices({ banner: { awayGear: '' }, feed: ['salvaged', 'salvageCant', 'salvageFull', 'gearLocked', 'autoSalvaged', 'bagUpDone', 'bagUpMax'] });
  // 가방 칸 수와 분해 설정(개인 상태)이 바뀌면 다시 그린다. 값은 가방 창(hud/bag.ts)이 먼저 받아 넣는다
  onMsg('me', (m) => { if (m.k === 'bag' || m.k === 'salvage') renderMenu(true); });
  $('menuClose').addEventListener('click', () => { ui.panel.hidden = true; });
  // 칸은 그 모듈을 고른 게임에만 온다: 오지 않은 칸은 그대로 둔다
  onMsg('meta', (m) => { const o = S.meta; S.meta = { gear: m.gear ?? o.gear, worn: m.worn ?? o.worn, mail: m.mail ?? o.mail, daily: m.daily ?? o.daily, power: m.power ?? o.power, build: m.build ?? o.build }; renderMenu(true); });
  onMsg('guild', (m) => { S.guild = m.g; S.guildInvite = m.invite ?? null; renderMenu(); });
  onMsg('gtag', (m) => setGuildTag(m.id, m.g));
  onMsg('market', onMarketMsg);
  onMsg('rank', (m) => { S.rank = { list: m.list, me: m.me }; renderMenu(); });
  onMsg('stat', () => renderMenu(true)); // 골드가 바뀌면 강화 단추의 상태도 바뀐다
  // 분해·넓히기의 답을 장비 탭 안에 보여 준다 (5초), 강화의 결과를 누른 그 줄에 잠깐 보여 준다 (menu/gear.ts)
  onMsg('sys', onGearResult);
  onMsg('sys', onEnhanceResult);
  // 순위 탭을 열어 둔 동안 내 레벨이나 전투력이 바뀌면 순위를 다시 받는다. 5초에 한 번을 넘지 않는다
  onSlow((now) => {
    if (ui.panel.hidden || !S.me || current().id !== 'rank') return;
    rankTick(now);
  });
  onLangChange(() => renderMenu());
}
