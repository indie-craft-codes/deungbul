// 도감 창 (묶음 E): 메뉴의 '도감' 탭 하나에 몬스터·아이템·장비의 기본 수치와, 게임이 더한 칸(모은 것, 규칙·수치 표 …)을 모은다.
// 어느 게임에나 있다 (메뉴 묶음 '정보'). 메뉴는 화면 쌓기의 창이라 뒤로 가기로 닫힌다: 새 탭으로 떠나지 않는다(떠나면 '자리 비움'이 붙었다).
//   틀의 칸: 몬스터(체력·피해·경험치·먼저 덤빔·우두머리, 도감 모듈이 있으면 잡아 본 것), 아이템(설명·얻는 곳·가진 수), 장비(무기·갑옷: 설명·가진 것)
//   게임의 칸: addCodexSection({ id, label, draw, sig? }, first?) — 메아리 계약의 '모은 것'(codex 모듈: hud/live.ts), 등불지기의 '규칙·수치'(공개 도감을 창 안에)
//   아래 줄: 확률표(odds 모듈이면 메뉴의 확률 탭), 공개 페이지(setCodexPublic: 새 탭. 바깥 주소를 열 수 없는 곳에는 없다)
// 공개 페이지(등불지기의 guide.html, 메아리 계약의 odds.html)는 그대로 남는다: 게임 밖에서 읽는 사람의 것이다.
import { MONSTERS, ITEMS, itemDef, monsterDef, type ItemId, type MonsterId } from '../../shared/defs';
import { L, itemInfo, itemName, t } from '../i18n';
import { hasModule } from '../mods';
import { platform } from '../platform';
import { S } from '../state';
import { addMenuTab, openMenu, renderMenu } from './menu';
import { button, chips, el, emptyState, row, span } from './menu/parts';
import { sourceText } from './sources';
import { uiIcon } from './uiicons';

/** 도감의 칸 하나 */
export interface CodexSection {
  id: string;
  label: () => string;
  /** 칸의 내용을 list에 붙인다 (메뉴의 탭과 같다: 상태가 바뀌면 다시 불린다) */
  draw: (list: HTMLElement) => void;
  /** 다시 그릴지 가르는 값 */
  sig?: () => unknown;
  /** 이 칸을 보일 때인가 (없으면 늘) */
  shown?: () => boolean;
}
const sections: CodexSection[] = [];
let cur = '';
/** 게임의 공개 페이지 (새 탭으로 연다) */
const pubs: { url: () => string; label: () => string }[] = [];
/** 칸마다 모은 것 (codex 모듈이 알린다: 종류 → 처음 얻은 id들). 없으면 표시하지 않는다 */
let seenOf: ((of: 'monster' | 'item' | 'hero') => ReadonlySet<string> | null) | null = null;

/** 도감에 칸을 더한다. first면 맨 앞에 (게임의 '모은 것' 같은 것) */
export function addCodexSection(def: CodexSection, first = false): void {
  const at = sections.findIndex((x) => x.id === def.id);
  if (at >= 0) sections.splice(at, 1);
  if (first) sections.unshift(def); else sections.push(def);
}
/** 도감 아래 줄에 공개 페이지를 단다 (새 탭: 플랫폼이 바깥 주소를 열 수 있을 때만) */
export function setCodexPublic(url: () => string, label: () => string = () => t('cbPublic')): void { pubs.push({ url, label }); }
/** 도감 모듈이 모은 것을 알린다 (hud/live.ts) */
export function setCodexSeen(fn: (of: 'monster' | 'item' | 'hero') => ReadonlySet<string> | null): void { seenOf = fn; }
/** 도감 창을 연다 (그 칸으로) */
export function openCodex(section?: string): void { if (section) cur = section; openMenu('codex'); }

/** 낱개 장비(무기·갑옷)인가 (내용의 아이템 종류가 좁게 적혀 있어도 컴파일되게 정의의 모양으로 읽는다) */
const gearKind = (id: ItemId): boolean => { const k: string = itemDef(id).kind; return k === 'weapon' || k === 'armor'; };
const visible = (): CodexSection[] => sections.filter((x) => x.shown?.() ?? true);

function seenMark(on: boolean | null): HTMLElement | '' {
  if (on === null) return '';
  const s = span(on ? 'cbSeen on' : 'cbSeen', '');
  s.append(uiIcon(on ? 'check' : 'lock', 'sm'));
  s.setAttribute('aria-label', on ? t('cbHave') : '?');
  return s;
}

function drawMonsters(list: HTMLElement): void {
  const loc = L(), seen = seenOf?.('monster') ?? null;
  for (const id of Object.keys(MONSTERS) as MonsterId[]) {
    const m = monsterDef(id);
    const tags = [m.boss ? t('cbBoss') : '', m.aggro > 0 ? t('cbAggro') : ''].filter(Boolean).join(' · ');
    const gold = `${loc.fmt.gold(m.gold[0]).replace(/[\d,.\s]+$/, '')} ${m.gold[0]}~${m.gold[1]}`;
    const note = [loc.fmt.cbMonster(m.hp, m.dmg[0], m.dmg[1], m.exp), gold, tags].filter(Boolean).join(' · ');
    const known = seen ? seen.has(id) : null;
    const r = row(loc.monsters[id] ?? id, note, [], 'cbRow' + (m.boss ? ' boss' : ''));
    const mark = seenMark(known);
    if (mark) r.prepend(mark);
    list.append(r);
  }
}

function drawItems(list: HTMLElement, gear: boolean): void {
  const seen = seenOf?.('item') ?? null;
  const have = (id: string): number => (gear ? S.meta.gear.filter((g) => g.base === id).length : S.me?.items[id] ?? 0);
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const isGear = gearKind(id);
    if (isGear !== gear) continue;
    const n = have(id);
    const note = [itemInfo(id), sourceText(id)].filter(Boolean).join(' · ');
    const r = row(itemName(id, S.me?.cls ?? ''), note, n > 0 ? [span('num', `${t('cbHave')} ${n}`)] : [], 'cbRow');
    const mark = seenMark(seen ? seen.has(id) || n > 0 : null);
    if (mark) r.prepend(mark);
    list.append(r);
  }
}

function drawBook(list: HTMLElement): void {
  const vis = visible();
  if (!vis.length) { list.append(emptyState('codex', t('cbEmpty'))); return; }
  if (!vis.some((x) => x.id === cur)) cur = vis[0].id;
  if (vis.length > 1) {
    const c = chips(vis.map((x) => ({ text: x.label(), on: x.id === cur, click: () => { cur = x.id; renderMenu(); } })));
    c.classList.add('cbTabs');
    list.append(c);
  }
  const s = vis.find((x) => x.id === cur)!;
  const body = el('cbBody');
  body.dataset.cb = s.id;
  s.draw(body);
  list.append(body);
  // 드롭·확률: 확률표(메뉴의 확률 탭)와 공개 페이지 (새 탭)
  const odds = hasModule('odds'), ext = platform().has('link.external') ? pubs : [];
  if (odds || ext.length) {
    list.append(el('baghead', t('cbOdds')));
    const btns: HTMLElement[] = [];
    if (odds) btns.push(button(t('cbOddsOpen'), () => openMenu('odds')));
    for (const p of ext) {
      const a = document.createElement('a');
      a.className = 'cbLink';
      a.href = p.url(); a.rel = 'noopener';
      a.append(uiIcon('codex', 'sm'), ` ${p.label()}`);
      a.addEventListener('click', (ev) => { if (ev.button !== 0 || ev.ctrlKey || ev.shiftKey || ev.metaKey || ev.altKey) return; ev.preventDefault(); void platform().openUrl(a.href); });
      btns.push(a);
    }
    list.append(row('', '', btns, 'cbFoot'));
  }
}

export function initCodexBook(): void {
  // 틀의 칸: 몬스터·아이템·장비 (그 게임에 있을 때만)
  const hasGear = (Object.keys(ITEMS) as ItemId[]).some(gearKind);
  const hasItems = (Object.keys(ITEMS) as ItemId[]).some((id) => !gearKind(id));
  // 틀의 칸은 앞에 (게임의 모듈이 먼저 init되어 더한 칸은 그 뒤에 남는다. '모은 것'처럼 first로 더한 칸은 맨 앞)
  const mine: CodexSection[] = [];
  if (hasModule('combat') && Object.keys(MONSTERS).length) mine.push({ id: 'monsters', label: () => t('cbMonsters'), draw: (l) => { l.append(el('note', t('cbNote'))); drawMonsters(l); } });
  if (hasModule('items') && hasItems) mine.push({ id: 'items', label: () => t('cbItems'), draw: (l) => drawItems(l, false), sig: () => S.me?.items });
  if (hasModule('items') && hasGear) mine.push({ id: 'gear', label: () => t('cbGear'), draw: (l) => drawItems(l, true), sig: () => S.meta.gear.length });
  sections.splice(0, 0, ...mine);
  addMenuTab({ id: 'codex', label: () => t('tabCodex'), draw: drawBook, sig: () => [cur, ...sections.map((x) => x.sig?.() ?? 0)] });
}
