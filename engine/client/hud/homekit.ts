// 수집형 홈 키트 (묶음 B의 5 → U3의 상용 로비 구조: docs/screens.md 2.1·9.5의 (가)): 수집형 RPG의 홈(로비) 페이지를 틀의 부품으로.
// 배치 (상용 수집형 로비의 공통 모양):
//   뒤       장면 배경 (scene: 그림 'bg:<장면>'이 있으면 그 그림, 없으면 css 그라디언트·무늬)
//   위 띠    왼쪽: 프로필(초상·레벨·이름, 누르면 프로필 창) / 오른쪽: 재화 줄('+' = 얻는 곳으로)과 게임의 오른쪽 위 자리
//   가운데   대표 캐릭터의 큰 그림 (사람이 고른 한 명. 누르면 짧은 대사와 반응, '대표 바꾸기'로 고른다)
//   오른쪽   세로 아이콘 열 (우편·공지/이벤트·상점·확률: rightRail) / 왼쪽 세로 열 (임무·시즌·업적: leftRail). 칸마다 알림 점
//   배너     이벤트 배너 캐러셀 (넘김·점. 그림 'banner:<id>'이 있으면 그 그림). 세로는 아래 왼쪽, 가로는 오른쪽 위: 대표를 가리지 않는다
//   엄지     오른쪽 아래 가장 큰 진행 단추 (다음 단계)
//   아래 독  고정 메뉴 (큰 아이콘 + 이름, 5~6칸). 잠긴 칸은 자물쇠와 언제 열리는지 (기능의 점진 공개: hud/unlocks.ts)
// 폰 세로는 위·아래 띠 중심, 폰 가로·PC는 왼·오른 열 중심 (style.css의 .homekit). 높이가 모자라면 가운데가 줄어든다 (단추는 화면 안에 남는다).
// 내용은 게임의 것: 대표(그림·이름·정보·대사), 단추 목록(이름·아이콘·알림 점·잠김), 배너, 진행 단추의 글. 틀은 모양과 화면 쌓기(바탕 페이지 root)만 맡는다.
// 홈은 화면 쌓기의 바탕 페이지다: 열면 들판 HUD가 감춰지고(body.pageOn), 그 위에 연 창은 뒤로 가기로 하나씩 닫힌다.
import { $ } from '../app';
import { artPick, onArt } from '../art';
import { onLangChange, t } from '../i18n';
import { currencyBar, type CurrencyChip, type CurrencyId } from './currency';
import { bindDot } from './dots';
import { dropScreen, openScreen } from './screens';
import { mountPanel } from './shell';
import { platform } from '../platform';
import { stillMotion } from '../motion';
import { uiIcon } from './uiicons';

export interface HomeLead {
  img?: string; name: string; info?: string; color?: string;
  /** 누르면 하나를 골라 말풍선으로 보인다 (짧은 대사). 없으면 반응(흔들림)만 */
  lines?: readonly string[];
}
export interface HomeButton {
  id: string;
  label: () => string;
  /** 아이콘의 이름 (hud/uiicons.ts) 또는 글자 하나 */
  icon?: string;
  /** 알림 점의 이름 (hud/dots.ts: 'menu.heroes' 따위) */
  dot?: string;
  /** 잠겼으면 그 까닭(보일 글). 빈 글이면 열림 */
  locked?: () => string;
  /** 참이면 감춘다 (기능의 점진 공개: hud/unlocks.ts의 featureHidden) */
  hidden?: () => boolean;
  onClick: () => void;
}
/** 왼쪽·오른쪽 세로 열의 칸 하나 (아래 독의 단추와 같은 모양의 약속) */
export type HomeRail = HomeButton;
export interface HomeBanner { id: string; text: string; sub?: string; onClick?: () => void; /** 알림 점의 이름 */ dot?: string; /** 작은 그림 (아이콘 이름·글자 하나). 없으면 글의 첫 글자 */ icon?: string }
/** 이벤트 배너 하나: 그림 'banner:<id>'이 등록되어 있으면 그 그림, 없으면 코드로 그린다 (색 두 개의 바탕 + 큰 아이콘) */
export interface HomeEvent {
  id: string;
  /** 제목 (이벤트 이름) */
  title: string;
  /** 머리표 ('이벤트'·'시즌'·'곧 시작') */
  tag?: string;
  /** 남은 기간·시작까지 */
  left?: string;
  /** 바탕 색 두 개(css 색)와 큰 그림 (아이콘 이름이나 글자) */
  art?: { from: string; to: string; glyph?: string };
  /** 알림 점의 이름 */
  dot?: string;
  onClick?: () => void;
}
/** 위 왼쪽의 프로필 (계약자·계정): 초상·레벨·이름. 누르면 프로필 창 (rows: 게임이 고른 줄) */
export interface HomeProfile {
  name: () => string;
  level: () => number | string;
  /** 초상 그림 (없으면 사람 아이콘) */
  pic?: () => string | undefined;
  /** 프로필 창의 줄 [이름, 값] */
  rows?: () => readonly (readonly [string, string])[];
  /** 프로필 창 아래의 단추 (설정 따위) */
  actions?: () => readonly { label: string; icon?: string; onClick: () => void }[];
}
/** 대표 캐릭터 고르기: 고를 수 있는 것, 지금 대표, 고르면 (서버에 저장) */
export interface HomeLeadPick {
  list: () => readonly { id: string; name: string; img?: string; color?: string }[];
  current: () => string;
  pick: (id: string) => void;
}
export interface HomeOpts {
  /** 페이지 id (화면 쌓기의 이름, 요소의 id) */
  id: string;
  /** 제목 (지금은 읽는 기계만: 화면에는 대표가 주인공이다) */
  title?: () => string;
  /** 장면 배경의 이름: 그림 'bg:<장면>'(세로·가로 따로 있으면 그것)을 쓰고, 없으면 css의 대체 (data-scene) */
  scene?: string;
  /** 위 왼쪽의 프로필 */
  profile?: HomeProfile;
  /** 위의 재화 줄 (hud/currency.ts의 칩) */
  currencies?: readonly (CurrencyId | CurrencyChip | (Partial<CurrencyChip> & { id: CurrencyId }))[];
  /** 대표 캐릭터 (없으면 비운다) */
  lead: () => HomeLead | null;
  /** 대표 고르기 (없으면 '대표 바꾸기'가 없다) */
  leadPick?: HomeLeadPick;
  /** 진행 단추: 글, 그 아래 작은 글, 누르면 */
  go: { label: () => string; sub?: () => string; onClick: () => void; dot?: string };
  /** 진행 단추 곁의 작은 정보 (가장 멀리 깬 단계, 전투력) */
  info?: () => string;
  /** 아래 독의 단추 (5~6칸) */
  dock: readonly HomeButton[];
  /** 왼쪽 세로 열 (임무·시즌·업적) */
  leftRail?: () => readonly HomeRail[];
  /** 오른쪽 세로 열 (우편·공지·상점·확률) */
  rightRail?: () => readonly HomeRail[];
  /** 이벤트 배너 (넘기는 카드). 없거나 비면 칸을 비운다 */
  events?: () => readonly HomeEvent[];
  /** 예전의 작은 바로 가기 줄: 오른쪽 열이 없으면 오른쪽 열로 보인다 */
  banners?: () => readonly HomeBanner[];
  /** 대표를 눌렀을 때 (대사 말고 더 할 일: 주지 않으면 대사만) */
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
  /** 게임이 요소를 붙일 자리: 'corner' 위 오른쪽, 'status' 위 띠 아래의 상태 줄, 'side' 왼쪽 열 아래 */
  slot(name: 'corner' | 'status' | 'side'): HTMLElement;
  /** 프로필 창을 연다 */
  openProfile(): void;
  /** 대표 고르기 창을 연다 */
  openLeadPick(): void;
  readonly shown: boolean;
}

const mk = (tag: string, cls: string, text?: string): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const btn = (cls: string): HTMLButtonElement => { const b = mk('button', cls) as HTMLButtonElement; b.type = 'button'; return b; };

/** 수집형의 홈 페이지를 만든다 (틀의 HUD 위, 'hud' 자리에 붙는다) */
export function makeHome(o: HomeOpts): HomeKit {
  mountPanel('hud', `<div id="${o.id}" class="homekit" hidden></div>`);
  const el = $(o.id)!;
  const reduced = stillMotion();
  // ---- 뒤: 장면 배경 ----
  const scene = mk('div', 'hk-scene');
  scene.dataset.scene = o.scene ?? '';
  const drawScene = () => {
    const land = typeof matchMedia !== 'undefined' && matchMedia('(orientation: landscape)').matches;
    const url = o.scene ? artPick('bg', o.scene, land ? 'landscape' : 'portrait') : undefined;
    scene.classList.toggle('hk-art', !!url);
    scene.style.backgroundImage = url ? `url("${url}")` : '';
  };
  // ---- 위 띠: 프로필 · 재화 · 오른쪽 위 자리 ----
  const top = mk('div', 'hk-top'), corner = mk('div', 'hk-corner'), status = mk('div', 'hk-status');
  const prof = btn('hk-prof'); prof.id = `${o.id}-prof`;
  const profPic = mk('span', 'hk-profpic'), profLv = mk('b', 'hk-proflv'), profName = mk('span', 'hk-profname');
  prof.append(profPic, mk('span', 'hk-proftext'));
  (prof.lastChild as HTMLElement).append(profLv, profName);
  prof.hidden = !o.profile;
  prof.addEventListener('click', () => kit.openProfile());
  top.append(prof);
  if (o.currencies) top.append(currencyBar(o.currencies));
  top.append(corner);
  const title = mk('h2', 'hk-title');
  // ---- 왼쪽·오른쪽 세로 열 ----
  const lrail = mk('nav', 'hk-rail hk-lrail'), rrail = mk('nav', 'hk-rail hk-rrail'), sideSlot = mk('div', 'hk-sideslot');
  lrail.setAttribute('aria-label', 'left'); rrail.setAttribute('aria-label', 'right');
  const lwrap = mk('div', 'hk-lcol'); lwrap.append(lrail, sideSlot);
  // ---- 이벤트 배너 ----
  const evBox = mk('div', 'hk-events'), evCard = btn('hk-evcard'), evDots = mk('div', 'hk-evdots');
  evCard.id = `${o.id}-event`;
  evBox.append(evCard, evDots);
  let evList: readonly HomeEvent[] = [], evAt = 0, evTimer = 0, evKey = '';
  const showEv = (i: number) => {
    if (!evList.length) return;
    evAt = (i + evList.length) % evList.length;
    const ev = evList[evAt];
    evCard.textContent = '';
    evCard.dataset.id = ev.id;
    evCard.style.setProperty('--ev-from', ev.art?.from ?? 'var(--c-surface)');
    evCard.style.setProperty('--ev-to', ev.art?.to ?? 'var(--c-fill-2)');
    const pic = artPick('banner', ev.id);
    evCard.classList.toggle('hk-art', !!pic);
    evCard.style.backgroundImage = pic ? `url("${pic}")` : '';
    const art = uiIcon(ev.art?.glyph ?? 'event', 'hk-evart');
    const tag = mk('span', 'hk-evtag', ev.tag ?? ''); tag.hidden = !ev.tag;
    const left = mk('small', 'hk-evleft', ev.left ?? ''); left.hidden = !ev.left;
    evCard.append(art, tag, mk('b', 'hk-evtitle', ev.title), left);
    bindDot(evCard, ev.dot ?? ''); // 점이 없는 배너는 빈 이름(늘 0)으로 묶어 앞 배너의 점이 남지 않게
    evCard.disabled = !ev.onClick;
    evCard.classList.remove('hk-evin'); void evCard.offsetWidth; evCard.classList.add('hk-evin');
    [...evDots.children].forEach((d, k) => d.classList.toggle('on', k === evAt));
  };
  const restartEv = () => { clearInterval(evTimer); if (evList.length > 1 && !reduced) evTimer = window.setInterval(() => { if (shown && platform().lifecycle.visible()) showEv(evAt + 1); }, 6000); };
  let downX = NaN, swiped = false;
  evCard.addEventListener('click', () => { if (!swiped) evList[evAt]?.onClick?.(); });
  evCard.addEventListener('pointerdown', (e) => { downX = e.clientX; swiped = false; });
  evCard.addEventListener('pointerup', (e) => { const dx = e.clientX - downX; downX = NaN; if (Math.abs(dx) > 30 && evList.length > 1) { swiped = true; showEv(evAt + (dx < 0 ? 1 : -1)); restartEv(); } });
  // ---- 가운데: 대표 캐릭터 ----
  const stage = mk('div', 'hk-stage');
  const lead = btn('hk-lead'); lead.id = `${o.id}-lead`;
  const pic = document.createElement('img'); pic.alt = '';
  const say = mk('div', 'hk-say'); say.hidden = true; say.setAttribute('aria-live', 'polite');
  lead.append(pic);
  const plate = mk('div', 'hk-plate'), lname = mk('div', 'hk-name'), linfo = mk('div', 'hk-info');
  const pickBtn = btn('hk-pickbtn'); pickBtn.id = `${o.id}-pick`;
  pickBtn.append(uiIcon('swap'));
  pickBtn.hidden = !o.leadPick;
  pickBtn.addEventListener('click', () => kit.openLeadPick());
  const ptext = mk('div', 'hk-ptext'); ptext.append(lname, linfo);
  plate.append(ptext, pickBtn);
  stage.append(say, lead, plate);
  let sayTimer = 0, lastLine = -1;
  lead.addEventListener('click', () => {
    const l = o.lead();
    if (!l) return;
    // 반응: 살짝 튀고, 대사가 있으면 하나 (같은 줄을 잇달아 고르지 않는다)
    lead.classList.remove('hk-poke'); void lead.offsetWidth; lead.classList.add('hk-poke');
    const lines = l.lines ?? [];
    if (lines.length) {
      let k = Math.floor(Math.random() * lines.length);
      if (lines.length > 1 && k === lastLine) k = (k + 1) % lines.length;
      lastLine = k;
      say.textContent = lines[k]; say.hidden = false;
      clearTimeout(sayTimer); sayTimer = window.setTimeout(() => { say.hidden = true; }, 3200);
    }
    o.onLead?.();
  });
  // ---- 엄지: 진행 단추 ----
  const act = mk('div', 'hk-act'), info = mk('div', 'hk-goinfo');
  const go = btn('hk-go'); go.id = `${o.id}-go`;
  const goText = mk('b', ''), goSub = mk('small', '');
  go.append(goText, goSub);
  go.addEventListener('click', () => o.go.onClick());
  if (o.go.dot) bindDot(go, o.go.dot);
  act.append(info, go);
  // ---- 아래 독 ----
  const dock = mk('nav', 'hk-dock');
  const dockBtns = o.dock.map((b) => {
    const e = btn('hk-dockbtn');
    e.dataset.id = b.id; e.id = `${o.id}-${b.id}`;
    e.addEventListener('click', () => { if (!e.classList.contains('locked')) b.onClick(); });
    if (b.dot) bindDot(e, b.dot);
    dock.append(e);
    return { b, e };
  });
  el.append(scene, top, status, title, lwrap, rrail, stage, evBox, act, dock);
  let shown = false;
  /** 세로 열의 칸들: id로 요소를 다시 쓴다 (알림 점이 묶인 요소가 그대로 남게) */
  const railEls = new Map<string, HTMLButtonElement>(), railFns = new Map<string, () => void>();
  const drawBtn = (e: HTMLButtonElement, b: HomeButton, cls: string) => {
    const why = b.locked?.() ?? '';
    e.hidden = b.hidden?.() ?? false;
    e.textContent = '';
    const ic = uiIcon(b.icon ?? b.id, `${cls}ic`);
    e.append(ic, mk('span', `${cls}lb`, b.label()));
    // 잠김은 자물쇠와 언제 열리는지 (폰에는 title이 보이지 않는다: 단추 안의 작은 줄)
    if (why) { e.append(uiIcon('lock', 'hk-lockic'), mk('small', 'hk-why', why)); }
    e.classList.toggle('locked', !!why);
    e.title = why || b.label();
    e.setAttribute('aria-label', why ? `${b.label()} · ${why}` : b.label());
  };
  const drawRail = (box: HTMLElement, list: readonly HomeRail[], side: string) => {
    const keep = new Set(list.map((b) => `${side}:${b.id}`));
    for (const [id, e] of railEls) if (id.startsWith(`${side}:`) && !keep.has(id)) { e.remove(); railEls.delete(id); }
    for (const b of list) {
      const key = `${side}:${b.id}`;
      let e = railEls.get(key);
      if (!e) {
        e = btn('hk-railbtn'); e.dataset.id = b.id; e.id = `${o.id}-r-${b.id}`;
        const ee = e;
        e.addEventListener('click', () => { if (!ee.classList.contains('locked')) railFns.get(key)?.(); });
        if (b.dot) bindDot(e, b.dot);
        railEls.set(key, e);
      }
      railFns.set(key, b.onClick);
      drawBtn(e, b, 'hk-rail');
      box.append(e);
    }
    box.hidden = !list.some((b) => !(b.hidden?.() ?? false));
  };

  function draw(): void {
    if (!shown) return;
    title.textContent = o.title?.() ?? '';
    title.hidden = !o.title;
    // 프로필
    if (o.profile) {
      const p = o.profile, src = p.pic?.();
      profPic.textContent = '';
      if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; profPic.append(i); } else profPic.append(uiIcon('profile'));
      profLv.textContent = `Lv ${p.level()}`; profName.textContent = p.name();
      prof.setAttribute('aria-label', `${t('hkProfile')} · ${p.name()}`);
    }
    // 대표
    const l = o.lead();
    if (l) {
      if (l.img && pic.src !== l.img) pic.src = l.img;
      pic.hidden = !l.img;
      lname.textContent = l.name; linfo.textContent = l.info ?? '';
      stage.style.setProperty('--rc', l.color ?? '');
      lead.setAttribute('aria-label', l.name);
      lead.disabled = false;
    } else { pic.hidden = true; lname.textContent = ''; linfo.textContent = ''; lead.disabled = true; }
    plate.hidden = !l;
    pickBtn.title = t('hkLeadPick'); pickBtn.setAttribute('aria-label', t('hkLeadPick'));
    // 진행 단추
    goText.textContent = o.go.label();
    goSub.textContent = o.go.sub?.() ?? '';
    goSub.hidden = !goSub.textContent;
    info.textContent = o.info?.() ?? '';
    info.hidden = !info.textContent;
    for (const { b, e } of dockBtns) drawBtn(e, b, 'hk-dock');
    // 세로 열 (오른쪽 열이 없으면 예전의 바로 가기 줄을 오른쪽 열로)
    drawRail(lrail, o.leftRail?.() ?? [], 'l');
    const right = o.rightRail?.() ?? (o.banners?.() ?? []).map((bn): HomeRail => ({ id: bn.id, icon: bn.icon ?? [...bn.text][0] ?? '', label: () => bn.text, dot: bn.dot, onClick: bn.onClick ?? (() => {}) }));
    drawRail(rrail, right, 'r');
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
      evList.forEach((e, k) => { const d = btn('hk-evdot'); d.setAttribute('aria-label', e.title); d.addEventListener('click', () => { showEv(k); restartEv(); }); evDots.append(d); });
      showEv(same ? evAt : 0);
      restartEv();
    }
    drawScene();
  }

  // ---- 프로필 창·대표 고르기 창 (창: 뒤로 가기로 닫힌다) ----
  const sheet = mk('div', 'panel hk-sheet'); sheet.hidden = true; sheet.id = `${o.id}-sheet`;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  el.append(sheet);
  const closeSheet = () => { sheet.hidden = true; dropScreen(`${o.id}-sheet`); };
  const openSheet = (head: string, body: HTMLElement[]) => {
    sheet.textContent = '';
    const h = mk('div', 'hk-sheethead');
    const x = btn('hk-sheetx'); x.append(uiIcon('close')); x.setAttribute('aria-label', t('close'));
    x.addEventListener('click', closeSheet);
    h.append(mk('b', '', head), x);
    sheet.append(h, ...body);
    sheet.hidden = false;
    openScreen(`${o.id}-sheet`, { kind: 'sheet', el: sheet, close: () => { sheet.hidden = true; } });
  };
  const kit: HomeKit = {
    el,
    open: () => { shown = true; el.hidden = false; openScreen(o.id, { kind: 'page', root: true, el, close: () => { shown = false; el.hidden = true; } }); draw(); },
    close: () => { shown = false; el.hidden = true; clearInterval(evTimer); evKey = ''; closeSheet(); dropScreen(o.id); },
    draw,
    slot: (n) => (n === 'corner' ? corner : n === 'status' ? status : sideSlot),
    openProfile: () => {
      const p = o.profile;
      if (!p) return;
      const head = mk('div', 'hk-profbig'), big = mk('span', 'hk-profpic'), src = p.pic?.();
      if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; big.append(i); } else big.append(uiIcon('profile'));
      const nm = mk('div', 'hk-profnm'); nm.append(mk('b', '', p.name()), mk('span', '', `Lv ${p.level()}`));
      head.append(big, nm);
      const rows = mk('dl', 'hk-profrows');
      for (const [k, v] of p.rows?.() ?? []) rows.append(mk('dt', '', k), mk('dd', '', v));
      const acts = mk('div', 'hk-sheetbtns');
      if (o.leadPick) { const b = btn('btn-secondary'); b.append(uiIcon('swap'), mk('span', '', t('hkLeadPick'))); b.addEventListener('click', () => kit.openLeadPick()); acts.append(b); }
      for (const a of p.actions?.() ?? []) { const b = btn('btn-secondary'); if (a.icon) b.append(uiIcon(a.icon)); b.append(mk('span', '', a.label)); b.addEventListener('click', () => { closeSheet(); a.onClick(); }); acts.append(b); }
      openSheet(t('hkProfile'), [head, rows, acts]);
    },
    openLeadPick: () => {
      const lp = o.leadPick;
      if (!lp) return;
      const grid = mk('div', 'hk-pickgrid'), now = lp.current();
      for (const c of lp.list()) {
        const b = btn('hk-pickcell'); b.dataset.id = c.id;
        b.style.setProperty('--rc', c.color ?? '');
        b.classList.toggle('on', c.id === now);
        b.setAttribute('aria-pressed', String(c.id === now));
        if (c.img) { const i = document.createElement('img'); i.src = c.img; i.alt = ''; b.append(i); }
        b.append(mk('span', '', c.name));
        b.addEventListener('click', () => { lp.pick(c.id); closeSheet(); });
        grid.append(b);
      }
      openSheet(t('hkLeadPickTitle'), [mk('p', 'note', t('hkLeadPickNote')), grid]);
    },
    get shown() { return shown; },
  };
  onLangChange(draw);
  onArt(() => { evKey = ''; draw(); });
  if (typeof matchMedia !== 'undefined') matchMedia('(orientation: landscape)').addEventListener?.('change', drawScene);
  return kit;
}
