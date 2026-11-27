// 보상 연출 (U2 피드백·상태: docs/ux-review.md 3.5, 쓰는 법은 docs/making-a-game.md 25절).
//   축하 카드(celebrate)  레벨 업·보상 받음·새 기능 열림: 화면 가운데 위의 카드 하나(빛살·제목·한 줄·바로 가기). 차례로 하나씩, 저절로 걷힌다 (누르면 바로)
//   숫자 굴리기(showNumber) 재화·수치가 바뀌면 숫자가 굴러가고 그 곁에 '+n'이 떠오른다 (재화 줄, 내 정보의 골드·두 번째 재화, 게임의 표시)
//   새 기능 열림(addUnlock) 잠긴 기능의 '언제 열리는지'(unlockHint)와, 열리는 순간의 알림 한 번
// 레벨 업(levelUp)과 받기(mailGot·seasonGot·couponOk)의 안내문은 가운데·흘러가는 알림 대신 이 카드로 뜬다 (한 곳에만: 대화창 기록에는 남는다).
// 움직임 줄이기(engine/client/motion.ts)면 빛살·굴리기·떠오름이 없고 카드는 그대로 뜬다. 소리는 화면 효과음(sound.ts의 ui.*).
import { DUNGEON_IDS, GUILD, MARKET, dungeonDef } from '../../shared/defs';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { dungeonLabel } from '../i18n/names';
import { hasModule } from '../mods';
import { stillMotion } from '../motion';
import { uiSound } from '../sound';
import { S } from '../state';
import { routeNotice } from './notify';
import { openMenu } from './menu';

export interface CelebrateOpts {
  /** 모양: level(금빛 빛살), reward(받음), unlock(새 기능) */
  kind: 'level' | 'reward' | 'unlock';
  title: string;
  /** 크게 보일 한 줄 (Lv 5, 기능 이름) */
  big?: string;
  sub?: string;
  /** 바로 가기 단추 */
  action?: { label: string; onClick: () => void };
  /** 떠 있는 시간(ms). 없으면 모양마다의 기본 */
  ms?: number;
  /** 카드에 더할 class (돌아옴 요약 'celLine': 큰 줄이 긴 글) */
  cls?: string;
}

let box: HTMLElement | null = null;
const queue: CelebrateOpts[] = [];
let showing = false;
/** 지금 떠 있는 카드 (레벨 업이 잇달아 오면 새 카드를 줄 세우지 않고 이것을 고친다) */
let cur: CelebrateOpts | null = null;
let timer = 0;

function root(): HTMLElement {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'celebrate'; box.className = 'cel'; box.hidden = true;
  box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
  box.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.celGo')) next(); });
  document.body.append(box);
  return box;
}

function next(): void {
  clearTimeout(timer);
  const el = root(), c = queue.shift();
  if (!c) { showing = false; cur = null; el.hidden = true; return; }
  showing = true; cur = c;
  el.textContent = '';
  el.dataset.kind = c.kind;
  el.classList.toggle('still', stillMotion());
  const rays = document.createElement('i'); rays.className = 'celRays'; rays.setAttribute('aria-hidden', 'true');
  const card = document.createElement('div'); card.className = 'celCard' + (c.cls ? ` ${c.cls}` : '');
  const h = document.createElement('b'); h.className = 'celTitle'; h.textContent = c.title;
  card.append(h);
  if (c.big) { const b = document.createElement('div'); b.className = 'celBig'; b.textContent = c.big; card.append(b); }
  if (c.sub) { const s = document.createElement('p'); s.className = 'celSub'; s.textContent = c.sub; card.append(s); }
  if (c.action) {
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'btn-primary celGo'; go.textContent = c.action.label;
    const fn = c.action.onClick;
    go.addEventListener('click', () => { next(); fn(); });
    card.append(go);
  }
  el.append(rays, card);
  el.hidden = false;
  uiSound(c.kind === 'level' ? 'ui.levelUp' : c.kind === 'unlock' ? 'ui.unlock' : 'ui.reward');
  timer = window.setTimeout(next, c.ms ?? (c.action ? 5200 : c.kind === 'reward' ? 2600 : 3400));
}

/** 축하 카드를 띄운다 (떠 있으면 뒤에 줄 선다: 많이 밀리면 오래된 것부터 버린다) */
export function celebrate(c: CelebrateOpts): void {
  // 레벨 업이 잇달아 오면(경험치를 한꺼번에 받았다) 카드 하나를 마지막 레벨로 고친다
  if (c.kind === 'level') {
    const waiting = queue.findIndex((x) => x.kind === 'level');
    if (waiting >= 0) { queue[waiting] = c; return; }
    if (cur?.kind === 'level') { queue.unshift(c); next(); return; }
  }
  if (queue.length > 3) queue.shift();
  queue.push(c);
  if (!showing) next();
}

// ---------- 숫자 굴리기와 떠오르는 +n ----------
const nums = new WeakMap<HTMLElement, { n: number; raf: number }>();
/**
 * 수치 표시를 고친다. live가 거짓이면(아직 내 상태를 받지 않았다) 글만 쓰고 기억하지 않는다: 처음 받은 값(0 → 가진 골드)은 굴리지 않는다.
 * 기억한 값에서 바뀌면 --dur-reward 동안 숫자를 굴리고 곁에 '+n'·'−n'을 띄운다 (늘면 작은 소리). 움직임 줄이기면 곧바로 바꾼다
 */
export function showNumber(el: HTMLElement, n: number, fmt: (n: number) => string, live = true): void {
  const st = nums.get(el);
  if (!live || !st) {
    el.textContent = fmt(n);
    if (live) nums.set(el, { n, raf: 0 }); else nums.delete(el);
    return;
  }
  // 같은 값: 글만 맞춘다 (언어를 바꾸면 글의 모양이 바뀐다). 굴리는 중이면 그대로
  if (st.n === n) { if (!st.raf) { const text = fmt(n); if (el.textContent !== text) el.textContent = text; } return; }
  const from = st.n, d = n - from;
  st.n = n;
  cancelAnimationFrame(st.raf); st.raf = 0;
  if (stillMotion() || !seen(el)) { el.textContent = fmt(n); return; }
  floatDelta(el, d);
  if (d > 0) uiSound('ui.coin');
  el.classList.remove('numUp', 'numDown'); void el.offsetWidth; el.classList.add(d > 0 ? 'numUp' : 'numDown');
  const t0 = performance.now(), dur = 600;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(k >= 1 ? n : Math.round(from + d * e));
    st.raf = k < 1 ? requestAnimationFrame(step) : 0;
  };
  st.raf = requestAnimationFrame(step);
}
/** 지금 화면에 보이는 요소인가 (감춘 페이지·HUD 아래의 것은 굴리지도 띄우지도 않는다) */
const seen = (el: HTMLElement): boolean => el.isConnected && el.offsetParent !== null && (typeof el.checkVisibility !== 'function' || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
/** 요소 곁에 '+n'(초록)·'−n'(붉은)이 떠올랐다 사라진다 */
export function floatDelta(anchor: HTMLElement, d: number): void {
  if (!d || stillMotion()) return;
  const r = anchor.getBoundingClientRect();
  if (!r.width) return;
  const f = document.createElement('span');
  f.className = 'floatNum ' + (d > 0 ? 'up' : 'down');
  f.textContent = (d > 0 ? '+' : '−') + Math.abs(d).toLocaleString(L().code);
  // 숫자의 오른쪽에서 떠오른다 (위에 놓으면 위 줄(체력 막대·이름)을 가렸다). 화면 오른쪽 끝이면 왼쪽으로
  const right = r.right + 6 + 72 > window.innerWidth;
  f.style.left = `${Math.round(right ? r.left - 6 : r.right + 6)}px`;
  f.style.top = `${Math.round(r.top + r.height / 2)}px`;
  if (right) f.classList.add('left');
  if (r.top < 64) f.classList.add('sink'); // 화면 맨 위(재화 줄)에서는 아래로 흘러간다
  document.body.append(f);
  window.setTimeout(() => f.remove(), 1200);
}

// ---------- 새 기능 열림 ----------
export interface UnlockDef {
  id: string;
  /** 기능의 이름 (알림의 큰 줄) */
  name: () => string;
  /** 지금 열렸는가 */
  open: () => boolean;
  /** 잠겼을 때 '언제 열리는지' (레벨 10에 열립니다) */
  hint: () => string;
  /** 열린 알림의 바로 가기 */
  go?: { label: () => string; onClick: () => void };
}
const unlocks: UnlockDef[] = [];
/** 지난번에 본 열림 (처음 볼 때는 알리지 않는다: 들어올 때 이미 열린 것) */
const was = new Map<string, boolean>();
let readyAt = 0;
/** 잠긴 기능을 등록한다: 잠긴 동안 unlockHint(id)가 '언제 열리는지'를, 열리는 순간 축하 카드 '새 기능'을 한 번 */
export function addUnlock(def: UnlockDef): void { unlocks.push(def); }
/** 그 기능이 잠겼으면 '언제 열리는지', 열렸거나 모르는 id면 빈 글 */
export function unlockHint(id: string): string { const u = unlocks.find((x) => x.id === id); return u && !u.open() ? u.hint() : ''; }

function watchUnlocks(now: number): void {
  if (!S.me?.ready) { readyAt = 0; return; }
  if (!readyAt) readyAt = now;
  if (now - readyAt < 1500) return; // 들어온 직후에는 상태(개인 상태·단계)가 다 올 때까지 기다린다
  for (const u of unlocks) {
    const v = u.open(), before = was.get(u.id);
    was.set(u.id, v);
    if (before === false && v) celebrate({ kind: 'unlock', title: t('celUnlock'), big: u.name(), sub: '', ...(u.go ? { action: { label: u.go.label(), onClick: u.go.onClick } } : {}) });
  }
}

/** 틀이 시작할 때 한 번 (게임의 모듈 뒤: 게임이 더한 안내문의 분류가 먼저다) */
export function initReward(): void {
  // 레벨 업 → 축하 카드 (찍을 능력치가 있으면 '능력치 찍기'). 받기 → 받은 것 카드
  routeNotice((k, a, text) => {
    if (k === 'levelUp') {
      const pts = hasModule('build') && (S.meta.build.left ?? 0) > 0;
      celebrate({ kind: 'level', title: t('celLevel'), big: L().fmt.celLv(Number(a[0] ?? 0)), sub: pts ? L().fmt.celPoints(S.meta.build.left) : '', ...(pts ? { action: { label: t('celBuild'), onClick: () => openMenu('build') } } : {}) });
      return true;
    }
    // 우편: 받은 것을 크게 (골드·경험치·두 번째 재화). 장비·아이템만 받았거나 다른 받기는 안내문 그대로
    const got = k === 'mailGot' ? L().fmt.reward(Number(a[0]) || 0, Number(a[1]) || 0, Number(a[2]) || 0) : '';
    if (k === 'mailGot' || k === 'seasonGot' || k === 'couponOk') { celebrate({ kind: 'reward', title: t('celReward'), ...(got ? { big: got } : { sub: text }) }); return true; }
    return false;
  });
  // 틀이 아는 잠긴 기능: 거래소의 사고팔기, 길드 만들기, 던전 (레벨)
  const lvAt = (lv: number) => () => (S.me?.lv ?? 0) >= lv;
  if (hasModule('market') && MARKET.minLv > 1) addUnlock({ id: 'market', name: () => t('tabMarket'), open: lvAt(MARKET.minLv), hint: () => L().fmt.unlockLv(MARKET.minLv), go: { label: () => t('celGo'), onClick: () => openMenu('market') } });
  if (hasModule('guild') && GUILD.createLv > 1) addUnlock({ id: 'guild', name: () => t('unlockGuild'), open: lvAt(GUILD.createLv), hint: () => L().fmt.unlockLv(GUILD.createLv), go: { label: () => t('celGo'), onClick: () => openMenu('guild') } });
  if (hasModule('dungeon')) for (const id of DUNGEON_IDS) { const lv = dungeonDef(id).minLv; if (lv > 1) addUnlock({ id: 'dungeon.' + id, name: () => dungeonLabel(L(), id).name, open: lvAt(lv), hint: () => L().fmt.unlockLv(lv) }); }
  onSlow(watchUnlocks);
  onMsg('welcome', () => { was.clear(); readyAt = 0; });
  onLangChange(() => { queue.length = 0; if (showing) next(); });
}
