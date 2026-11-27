// 수집형 홈 키트 (묶음 B의 5: docs/screens.md 2.1·9.2의 4·9.5의 (가)): 수집형 RPG의 홈(로비) 페이지를 틀의 부품으로.
// 공통 배치: 위 재화 줄(+ 게임의 오른쪽 위 자리), 다른 모드의 상태 줄, 왼쪽 열(이벤트 배너 + 작은 바로 가기 줄), 가운데 대표 캐릭터, 오른쪽 아래(엄지 자리) 가장 큰 진행 단추, 아래 띠 5~6칸.
// 이벤트 배너(events): 그림 대신 코드로 그린 카드(색·큰 글자 그림·제목·남은 기간), 누르면 갈 곳. 여럿이면 6초마다 넘어가고(밀어서 넘기기도) 아래에 점. 없으면 칸을 비운다.
// 작은 바로 가기(banners: 우편·확률·설정 따위)는 배너 아래 아이콘 줄이다 (홈은 배너가 중심).
// 폰 세로·폰 가로·PC 모두: 가로 화면(높이가 낮다)에서는 대표를 왼쪽, 진행 단추와 띠를 오른쪽 아래에 둔다. 높이가 모자라면 페이지가 스크롤된다 (style.css의 .homekit).
// 내용은 게임의 것: 대표(그림·이름·정보), 단추 목록(이름·알림 점·잠김), 배너, 진행 단추의 글. 틀은 모양과 화면 쌓기(바탕 페이지 root)만 맡는다.
// 홈은 화면 쌓기의 바탕 페이지다: 열면 들판 HUD가 감춰지고(body.pageOn), 그 위에 연 창은 뒤로 가기로 하나씩 닫힌다.
import { $ } from '../app';
import { onLangChange } from '../i18n';
import { currencyBar, type CurrencyChip, type CurrencyId } from './currency';
import { bindDot } from './dots';
import { dropScreen, openScreen } from './screens';
import { mountPanel } from './shell';
import { platform } from '../platform';

export interface HomeLead { img?: string; name: string; info?: string; color?: string }
export interface HomeButton {
  id: string;
  label: () => string;
  /** 알림 점의 이름 (hud/dots.ts: 'menu.heroes' 따위) */
  dot?: string;
  /** 잠겼으면 그 까닭(보일 글). 빈 글이면 열림 */
  locked?: () => string;
  onClick: () => void;
}
export interface HomeBanner { id: string; text: string; sub?: string; onClick?: () => void; /** 알림 점의 이름 */ dot?: string; /** 작은 그림 (글자 하나·기호). 없으면 글의 첫 글자 */ icon?: string }
/** 이벤트 배너 하나: 그림 파일 없이 코드로 그린다 (색 두 개의 바탕 + 큰 글자 그림) */
export interface HomeEvent {
  id: string;
  /** 제목 (이벤트 이름) */
  title: string;
  /** 머리표 ('이벤트'·'시즌'·'곧 시작') */
  tag?: string;
  /** 남은 기간·시작까지 */
  left?: string;
  /** 바탕 색 두 개(css 색)와 큰 그림 글자 */
  art?: { from: string; to: string; glyph?: string };
  /** 알림 점의 이름 */
  dot?: string;
  onClick?: () => void;
}
export interface HomeOpts {
  /** 페이지 id (화면 쌓기의 이름, 요소의 id) */
  id: string;
  /** 제목 (없으면 그리지 않는다) */
  title?: () => string;
  /** 위의 재화 줄 (hud/currency.ts의 칩) */
  currencies?: readonly (CurrencyId | CurrencyChip | (Partial<CurrencyChip> & { id: CurrencyId }))[];
  /** 대표 캐릭터 (없으면 비운다) */
  lead: () => HomeLead | null;
  /** 진행 단추: 글, 그 아래 작은 글, 누르면 */
  go: { label: () => string; sub?: () => string; onClick: () => void; dot?: string };
  /** 진행 단추 곁의 작은 정보 (가장 멀리 깬 단계, 전투력) */
  info?: () => string;
  /** 아래 띠의 단추 (5~6칸) */
  dock: readonly HomeButton[];
  /** 왼쪽 열의 이벤트 배너 (넘기는 카드). 없거나 비면 칸을 비운다 */
  events?: () => readonly HomeEvent[];
  /** 배너 아래 작은 바로 가기 줄 (우편·확률·설정 따위) */
  banners?: () => readonly HomeBanner[];
  /** 대표를 눌렀을 때 */
  onLead?: () => void;
}
export interface HomeKit {
  el: HTMLElement;
  /** 홈을 연다 (화면 쌓기의 바탕 페이지로) */
  open(): void;
  /** 홈을 닫는다 (쌓임에서도 뺀다) */
  close(): void;
  /** 다시 그린다 (상태가 바뀌었을 때) */
  draw(): void;
  /** 게임이 요소를 붙일 자리: 'corner' 위 오른쪽, 'status' 재화 줄 아래의 상태 줄, 'side' 왼쪽 배너 아래 */
  slot(name: 'corner' | 'status' | 'side'): HTMLElement;
  readonly shown: boolean;
}

const mk = (tag: string, cls: string, text?: string): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** 수집형의 홈 페이지를 만든다 (틀의 HUD 위, 'hud' 자리에 붙는다) */
export function makeHome(o: HomeOpts): HomeKit {
  mountPanel('hud', `<div id="${o.id}" class="homekit" hidden></div>`);
  const el = $(o.id)!;
  const top = mk('div', 'hk-top'), corner = mk('div', 'hk-corner'), status = mk('div', 'hk-status');
  if (o.currencies) top.append(currencyBar(o.currencies));
  top.append(corner);
  const title = mk('h2', 'hk-title');
  const side = mk('div', 'hk-side'), banners = mk('div', 'hk-banners'), sideSlot = mk('div', 'hk-sideslot');
  const evBox = mk('div', 'hk-events'), evCard = mk('button', 'hk-evcard') as HTMLButtonElement, evDots = mk('div', 'hk-evdots');
  evCard.type = 'button'; evCard.id = `${o.id}-event`;
  evBox.append(evCard, evDots);
  side.append(evBox, banners, sideSlot);
  // 이벤트 배너: 지금 보이는 차례, 저절로 넘기기, 밀어서 넘기기
  let evList: readonly HomeEvent[] = [], evAt = 0, evTimer = 0, evKey = '';
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const showEv = (i: number) => {
    if (!evList.length) return;
    evAt = (i + evList.length) % evList.length;
    const ev = evList[evAt];
    evCard.textContent = '';
    evCard.dataset.id = ev.id;
    evCard.style.setProperty('--ev-from', ev.art?.from ?? 'var(--c-surface)');
    evCard.style.setProperty('--ev-to', ev.art?.to ?? 'var(--c-fill-2)');
    const art = mk('span', 'hk-evart', ev.art?.glyph ?? '');
    const tag = mk('span', 'hk-evtag', ev.tag ?? ''); tag.hidden = !ev.tag;
    const left = mk('small', 'hk-evleft', ev.left ?? ''); left.hidden = !ev.left;
    evCard.append(art, tag, mk('b', 'hk-evtitle', ev.title), left);
    bindDot(evCard, ev.dot ?? ''); // 점이 없는 배너는 빈 이름(늘 0)으로 묶어 앞 배너의 점이 남지 않게
    evCard.disabled = !ev.onClick;
    evCard.classList.remove('hk-evin'); void evCard.offsetWidth; evCard.classList.add('hk-evin');
    [...evDots.children].forEach((d, k) => d.classList.toggle('on', k === evAt));
  };
  const restartEv = () => { clearInterval(evTimer); if (evList.length > 1 && !reduced) evTimer = window.setInterval(() => { if (shown && platform().lifecycle.visible()) showEv(evAt + 1); }, 6000); };
  evCard.addEventListener('click', () => { if (!swiped) evList[evAt]?.onClick?.(); });
  let downX = NaN, swiped = false;
  evCard.addEventListener('pointerdown', (e) => { downX = e.clientX; swiped = false; });
  evCard.addEventListener('pointerup', (e) => { const dx = e.clientX - downX; downX = NaN; if (Math.abs(dx) > 30 && evList.length > 1) { swiped = true; showEv(evAt + (dx < 0 ? 1 : -1)); restartEv(); } });
  const lead = mk('button', 'hk-lead') as HTMLButtonElement;
  lead.type = 'button';
  const pic = document.createElement('img'); pic.alt = '';
  const lname = mk('div', 'hk-name'), linfo = mk('div', 'hk-info');
  lead.append(pic, lname, linfo);
  if (o.onLead) lead.addEventListener('click', o.onLead); else lead.disabled = true;
  const act = mk('div', 'hk-act'), info = mk('div', 'hk-goinfo');
  const go = mk('button', 'hk-go') as HTMLButtonElement;
  go.type = 'button'; go.id = `${o.id}-go`;
  const goText = mk('b', ''), goSub = mk('small', '');
  go.append(goText, goSub);
  go.addEventListener('click', () => o.go.onClick());
  if (o.go.dot) bindDot(go, o.go.dot);
  act.append(info, go);
  const dock = mk('nav', 'hk-dock');
  const btns = o.dock.map((b) => {
    const e = mk('button', 'hk-dockbtn') as HTMLButtonElement;
    e.type = 'button'; e.dataset.id = b.id; e.id = `${o.id}-${b.id}`;
    e.addEventListener('click', () => { if (!e.classList.contains('locked')) b.onClick(); });
    if (b.dot) bindDot(e, b.dot);
    dock.append(e);
    return { b, e };
  });
  el.append(top, status, title, side, lead, act, dock);
  let shown = false;
  const bannerEls = new Map<string, HTMLButtonElement>(), bannerFns = new Map<string, () => void>();

  function draw(): void {
    if (!shown) return;
    title.textContent = o.title?.() ?? '';
    title.hidden = !o.title;
    const l = o.lead();
    if (l) {
      if (l.img && pic.src !== l.img) pic.src = l.img;
      pic.hidden = !l.img;
      lname.textContent = l.name; linfo.textContent = l.info ?? '';
      lname.style.setProperty('--rc', l.color ?? '');
    } else { pic.hidden = true; lname.textContent = ''; linfo.textContent = ''; }
    goText.textContent = o.go.label();
    goSub.textContent = o.go.sub?.() ?? '';
    goSub.hidden = !goSub.textContent;
    info.textContent = o.info?.() ?? '';
    for (const { b, e } of btns) {
      const why = b.locked?.() ?? '';
      e.textContent = b.label();
      e.classList.toggle('locked', !!why);
      e.title = why;
    }
    // 이벤트 배너: 목록이 바뀌었을 때만 점을 다시 만든다 (넘기는 차례가 그대로 남게)
    evList = o.events?.() ?? [];
    evBox.hidden = !evList.length;
    el.classList.toggle('hk-hasev', evList.length > 0);
    const key = evList.map((e) => `${e.id}:${e.title}:${e.left}`).join('|');
    if (key !== evKey) {
      const ids = evKey.split('|').map((x) => x.split(':')[0]).join('|'), same = ids === evList.map((e) => e.id).join('|');
      evKey = key;
      evDots.textContent = '';
      evDots.hidden = evList.length < 2;
      evList.forEach((e, k) => { const d = mk('button', 'hk-evdot') as HTMLButtonElement; d.type = 'button'; d.setAttribute('aria-label', e.title); d.addEventListener('click', () => { showEv(k); restartEv(); }); evDots.append(d); });
      showEv(same ? evAt : 0);
      restartEv();
    }
    // 작은 바로 가기 줄: id로 요소를 다시 쓴다 (알림 점이 묶인 요소가 그대로 남게)
    const list = o.banners?.() ?? [], keep = new Set(list.map((b) => b.id));
    for (const [id, e] of bannerEls) if (!keep.has(id)) { e.remove(); bannerEls.delete(id); }
    for (const bn of list) {
      let e = bannerEls.get(bn.id);
      if (!e) {
        e = mk('button', 'hk-banner') as HTMLButtonElement;
        e.type = 'button'; e.dataset.id = bn.id;
        e.addEventListener('click', () => bannerFns.get(bn.id)?.());
        if (bn.dot) bindDot(e, bn.dot);
        bannerEls.set(bn.id, e);
      }
      e.textContent = '';
      e.append(mk('i', 'hk-qicon', bn.icon ?? [...bn.text][0] ?? ''), mk('b', '', bn.text));
      e.title = bn.sub ? `${bn.text} · ${bn.sub}` : bn.text;
      e.disabled = !bn.onClick;
      if (bn.onClick) bannerFns.set(bn.id, bn.onClick); else bannerFns.delete(bn.id);
      banners.append(e);
    }
  }
  onLangChange(draw);
  const kit: HomeKit = {
    el,
    open: () => { shown = true; el.hidden = false; openScreen(o.id, { kind: 'page', root: true, el, close: () => { shown = false; el.hidden = true; } }); draw(); },
    close: () => { shown = false; el.hidden = true; clearInterval(evTimer); evKey = ''; dropScreen(o.id); },
    draw,
    slot: (n) => (n === 'corner' ? corner : n === 'status' ? status : sideSlot),
    get shown() { return shown; },
  };
  return kit;
}
