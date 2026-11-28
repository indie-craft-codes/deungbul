// 단계 정보 창 · 편성 확인 · 결과 창 (묶음 B의 6·7: docs/screens.md 2.3·2.5·9.5의 (나)(라)(마)). stages·squad 모듈의 수집형 화면을 틀의 부품으로.
//   단계 정보 창(sheet #stInfo): 적(물결을 합친 것과 우두머리), 권장 전투력과 내 편성의 전투력(모자라면 붉게), 별 조건 셋(딴 별은 채워), 처음/반복 보상, [소탕] [편성 확인]
//   편성 확인(page #stCheck): 지금 편성(초상·이름·레벨·별), 전투력 비교 막대, [편성 바꾸기] [출발]
//   결과 창(sheet #stResult): 깸/실패 큰 글 → 별이 차례로(조건 줄 ✓/✗) → 보상이 차례로 → [홈] [다시] [다음 n-m](가장 크게). 자동 진행이면 'n초 뒤 다음'과 [멈춤].
//     지면 '강해지는 길'(게임이 고르는 바로 가기: 뽑기·성장·편성). 별 조건이 없는 단계는 별 줄이 없다 (예전처럼)
// 게임은 useStageScreens(opts)로 켠다: 출발·홈·강해지는 길·초상이 게임의 것. 켜지 않으면 아무것도 붙지 않는다 (예전과 같다).
// 셋 다 화면 쌓기에 든다: 뒤로 가기가 결과 창 → 편성 확인 → 단계 정보 창 차례로 닫는다.
import { artPic, frameArt } from './artdom';
import { $ } from '../app';
import { CHAPTERS, STAGE_RULES, STAGE_RULE_VIEW, STAGES, allStarsOf, heroDef, stageIndex, stageStars, stageSweepable, type Reward, type StageRef, type StarCond } from '../../shared/defs';
import { tintRarity } from './rarity';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { heroName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { send } from '../net';
import { uiSound } from '../sound';
import { myHeroes, mySquad } from './collect';
import { openMenu } from './menu';
import { closeScreen, dropScreen, openScreen } from './screens';
import { myStage } from './stagebar';
import { myStamina, stageFuel, staminaGate, staminaName } from './stamina';
import { starGap } from './collectcalc';

export interface StageGrowPath { label: string; sub?: string; onClick: () => void }
export interface StageScreenOpts {
  /** 출발 (편성 확인의 [출발], 결과 창의 [다시]·[다음]이 기본으로 부른다) */
  go: (id: string) => void;
  /** 결과 창의 [홈] */
  home: () => void;
  /** 결과 창의 [다음] (기본 go) */
  next?: (id: string) => void;
  /** 결과 창의 [다시] (기본 go) */
  again?: (id: string) => void;
  /** 편성 확인의 [편성 바꾸기] (기본: 메뉴의 편성 탭) */
  change?: () => void;
  /** 영웅의 초상 그림 주소 (없으면 이름만) */
  heroPic?: (id: string) => string | undefined;
  /** 졌을 때 '강해지는 길' (게임이 고른다) */
  grow?: () => readonly StageGrowPath[];
  /** 결과 창을 띄울 때인가 (그 단계를 보고 있을 때만: 기본 늘) */
  showResult?: () => boolean;
  /** 참이면 자동 진행으로 다음 단계가 시작해도 결과 창을 닫지 않는다 (튜토리얼이 결과 창을 설명하는 동안: 묶음 D) */
  holdResult?: () => boolean;
}

let opts: StageScreenOpts | null = null;
const mk = (tag: string, cls: string, text?: string): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const btn = (cls: string, text: string, fn: () => void): HTMLButtonElement => { const b = mk('button', cls, text) as HTMLButtonElement; b.type = 'button'; b.addEventListener('click', fn); return b; };
const refOf = (id: string): StageRef | undefined => STAGES[stageIndex(id)];
const cleared = (s: StageRef): boolean => stageIndex(myStage()?.best ?? '') >= s.i;
const starsOf = (id: string): number => myStage()?.stars?.[id] ?? 0;
const condText = (c: StarCond): string => (c.k === 'clear' ? t('starClear') : c.k === 'time' ? L().fmt.starTime(c.s) : t('starAlive'));

/** 보상을 칩으로 (재화·경험치·아이템). first면 '처음' 표 */
function rewardChips(r: Reward, first: boolean): HTMLElement[] {
  const f = L().fmt, out: HTMLElement[] = [];
  // 그림(art2): 'cur:<재화>'·'item:<id>'가 등록되어 있으면 글 앞에 (없으면 글만)
  const add = (cls: string, text: string, art: string) => { const c = mk('span', `strw ${cls}`, text); const p = artPic(art); if (p) c.prepend(p); if (first) c.append(mk('i', 'strfirst', t('resFirstTag'))); out.push(c); };
  if (r.sparks) add('cur-second', f.reward(0, 0, r.sparks), 'cur:second');
  if (r.gold) add('cur-gold', f.reward(r.gold, 0, 0), 'cur:gold');
  if (r.exp) add('exp', f.reward(0, r.exp, 0), 'cur:exp');
  for (const [id, n] of Object.entries(r.items ?? {})) if (n) add('item', `${(L().items as Record<string, { name?: string } | undefined>)[id]?.name ?? id} ×${n}`, `item:${id}`);
  return out;
}
/** 별 줄: 조건마다 별 하나와 글 (mask의 비트가 켜졌으면 채운 별) */
function starRows(conds: readonly StarCond[], mask: number, anim: boolean): HTMLElement {
  const box = mk('div', 'ststars' + (anim ? ' anim' : ''));
  conds.forEach((c, i) => {
    const on = !!(mask & (1 << i));
    const row = mk('div', 'ststar' + (on ? ' on' : ''));
    row.style.setProperty('--i', String(i));
    row.append(mk('b', '', on ? '★' : '☆'), mk('span', '', condText(c)));
    box.append(row);
  });
  return box;
}
function enemyList(s: StageRef): HTMLElement {
  const n = new Map<string, number>();
  for (const w of s.def.waves.flat()) n.set(w.type, (n.get(w.type) ?? 0) + w.n);
  const box = mk('div', 'stfoes'), names = L().monsters as Record<string, string>;
  // 적의 그림 'enemy:<몬스터 id>' (art2): 있으면 이름 앞에
  const foe = (cls: string, text: string, type: string): HTMLElement => { const e = mk('span', cls, text); const p = artPic(`enemy:${type}`); if (p) e.prepend(p); return e; };
  for (const [type, k] of n) box.append(foe('stfoe', L().fmt.enemyN(names[type] ?? type, k), type));
  if (s.def.boss) { const b = foe('stfoe boss', names[s.def.boss.type] ?? s.def.boss.type, s.def.boss.type); b.prepend(mk('i', '', t('stBoss'))); box.append(b); }
  return box;
}
function powerRow(rec: number): HTMLElement {
  const mine = mySquad().power, row = mk('div', 'stpower' + (mine < rec ? ' low' : ''));
  row.append(mk('span', '', `${t('stMine')} / ${t('stRec')}`), mk('b', '', L().fmt.stPower(mine, rec)));
  const bar = mk('i', 'stpbar'), fill = mk('span', '');
  fill.style.transform = `scaleX(${rec > 0 ? Math.min(1, mine / rec) : 1})`;
  bar.append(fill); row.append(bar);
  return row;
}
/** 자동 진행이 마지막 단계에서 멈추는 게임의 마지막 단계인가 (STAGE_RULES.atLast 'stop') */
const lastStop = (s: StageRef): boolean => STAGE_RULE_VIEW.atLast === 'stop' && s.i === STAGES.length - 1;
/**
 * 마지막 단계의 안내 (결과 창·단계 정보 창): '마지막 단계까지 깼다 · 다음 장은 곧'(깼으면) 또는 '탑의 마지막 단계', 할 수 있는 것(소탕·별 모으기)과
 * 별을 다 따지 못한 첫 단계로 가는 [별 모으기 n-m]. stars는 방금 딴 별까지 합친 것
 */
function lastNote(s: StageRef, done: boolean, stars: Record<string, number>, onStar: (id: string) => void): HTMLElement {
  const box = mk('div', 'stlast');
  box.append(mk('b', '', done ? t('stLastDone') : t('stLastInfo')));
  if (!done) return box;
  box.append(mk('p', '', STAGE_RULE_VIEW.sweep ? t('stLastSweep') : t('stLastStars')));
  const me = myStage(), gap = starGap(me ? { ...me, best: s.id, stars } : null);
  if (gap) box.append(btn('plain stlaststar', L().fmt.stLastStarGo(gap), () => onStar(gap)));
  return box;
}
const section = (title: string, ...kids: HTMLElement[]): HTMLElement => { const s = mk('section', 'stsec'); s.append(mk('h4', '', title), ...kids); return s; };
/** 스태미나의 값 줄 (stamina 모듈을 쓰는 게임만: '소모 숨결 6', 모자라면 붉게) */
function costRow(s: StageRef): HTMLElement | null {
  const n = stageFuel(s.def.cost);
  if (!n) return null;
  const have = myStamina()?.n ?? 0, row = mk('p', 'stcost' + (have < n ? ' low' : ''), `⚡ ${L().fmt.staCost(staminaName(), n)} · ${L().fmt.staChip(have, myStamina()?.max ?? 0, 0)}`);
  return row;
}
/** 출격 문: 값이 모자라면 부족 창을 열고 보내지 않는다 */
const fueled = (id: string, fn: () => void): void => { const s = refOf(id); if (!s || staminaGate(stageFuel(s.def.cost))) fn(); };

// ---------- 단계 정보 창 ----------
let infoId = '';
function drawInfo(): void {
  const box = $('stInfo')!, s = refOf(infoId);
  if (!s || !opts) return;
  box.textContent = '';
  const head = mk('div', 'sthead');
  head.append(mk('h3', '', L().fmt.stTitle(s.id, uiText.get(CHAPTERS[s.ch]?.name ?? ''))), btn('plain stclose', '×', () => closeScreen('stInfo')));
  box.append(head, section(t('stEnemies'), enemyList(s)), powerRow(s.def.rec));
  const conds = stageStars(s);
  if (conds.length) box.append(section(t('stStars'), starRows(conds, starsOf(s.id), false)));
  const rw = mk('div', 'strws');
  if (!cleared(s) && s.def.first) rw.append(...rewardChips(s.def.first, true));
  rw.append(...rewardChips(s.def.reward, false));
  box.append(section(cleared(s) || !s.def.first ? t('stRepeat') : `${t('stFirst')} · ${t('stRepeat')}`, rw));
  const cost = costRow(s);
  if (cost) box.append(cost);
  if (lastStop(s)) box.append(lastNote(s, cleared(s), myStage()?.stars ?? {}, (id) => { closeScreen('stInfo'); openStageInfo(id); }));
  const btns = mk('div', 'stbtns');
  const sweep = STAGE_RULE_VIEW.sweep;
  if (sweep && stageSweepable(s) && cleared(s)) {
    if (sweep.allStars && !allStarsOf(s, starsOf(s.id))) box.append(mk('p', 'note', t('stSweepNeedStars')));
    else btns.append(btn('plain', L().fmt.sweepTimes(1), () => send({ t: 'stage', a: 'sweep', id: s.id, n: 1 })));
  }
  btns.append(btn('stgo', t('stCheck'), () => openCheck(s.id)));
  box.append(btns);
}
/** 단계 정보 창을 연다 */
export function openStageInfo(id: string): void {
  if (!opts || !refOf(id)) return;
  infoId = id;
  const box = $('stInfo')!;
  box.hidden = false;
  openScreen('stInfo', { kind: 'sheet', el: box, close: () => { box.hidden = true; } });
  drawInfo();
}

// ---------- 편성 확인 ----------
let checkId = '', checkSig = '';
function drawCheck(force = false): void {
  const box = $('stCheck')!, s = refOf(checkId);
  if (!s || !opts || box.hidden) return;
  const sq = mySquad(), sig = JSON.stringify([sq, myHeroes(), L().code, checkId, myStamina()?.n]);
  if (!force && sig === checkSig) return;
  checkSig = sig;
  box.textContent = '';
  const head = mk('div', 'sthead');
  head.append(btn('plain stback', `‹ ${t('scrBack')}`, () => closeScreen('stCheck')), mk('h3', '', `${t('stCheck')} · ${s.id}`));
  const grid = mk('div', 'stsquad'), heroes = myHeroes();
  for (const id of sq.ids) {
    const d = heroDef(id), h = heroes[id], c = mk('div', 'stmate');
    if (d) tintRarity(c, d.rarity);
    const url = opts.heroPic?.(id);
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; c.append(img); }
    c.append(mk('b', '', heroName(id)), mk('small', '', `Lv ${h?.[0] ?? 1} · ${'★'.repeat(h?.[1] ?? 1)}`));
    if (d) frameArt(c, d.rarity); // 등급 테두리 그림 'frame:<등급 id>' (없으면 css 테두리)
    grid.append(c);
  }
  if (!sq.ids.length) grid.append(mk('div', 'stmate empty', t('sqEmpty')));
  box.append(head, enemyList(s), powerRow(s.def.rec), grid);
  if (sq.power < s.def.rec) box.append(mk('p', 'stweak', t('sqWeak')));
  const cost = costRow(s);
  if (cost) box.append(cost);
  const btns = mk('div', 'stbtns');
  const go = opts.go;
  btns.append(btn('plain', t('sqChange'), () => (opts?.change ?? (() => openMenu('squad')))()), btn('stgo', t('stGo'), () => fueled(s.id, () => { closeScreen('stCheck'); closeScreen('stInfo'); go(s.id); })));
  box.append(btns);
}
/** 편성 확인 페이지를 연다 */
export function openCheck(id: string): void {
  if (!opts || !refOf(id)) return;
  checkId = id;
  const box = $('stCheck')!;
  box.hidden = false;
  openScreen('stCheck', { kind: 'page', el: box, scene: 'squad', close: () => { box.hidden = true; } });
  drawCheck(true);
}

// ---------- 결과 창 ----------
let resTimer = 0, resId = '', resWin = false;
function showResult(id: string, win: boolean, first: boolean, mask: number): void {
  if (!opts || (opts.showResult && !opts.showResult())) return;
  const s = refOf(id), box = $('stResult')!;
  if (!s) return;
  resId = id; resWin = win;
  box.textContent = '';
  box.classList.toggle('lose', !win);
  box.append(mk('h3', 'stbig', win ? L().fmt.resWin(id) : L().fmt.resLose(id)));
  const conds = stageStars(s);
  if (conds.length && win) box.append(starRows(conds, mask, true));
  if (win) {
    const rw = mk('div', 'strws anim');
    const chips = [...rewardChips(s.def.reward, false), ...(first && s.def.first ? rewardChips(s.def.first, true) : [])];
    chips.forEach((c, i) => c.style.setProperty('--i', String(i + conds.length)));
    rw.append(...chips);
    box.append(rw);
  } else {
    box.append(powerRow(s.def.rec));
    const grow = opts.grow?.() ?? [];
    if (grow.length) {
      const list = mk('div', 'stgrow');
      list.append(mk('h4', '', t('resGrow')));
      for (const g of grow) { const b = btn('stgrowbtn', '', () => { hideResult(); g.onClick(); }); b.append(mk('b', '', g.label)); if (g.sub) b.append(mk('small', '', g.sub)); b.append(mk('i', '', '›')); list.append(b); }
      box.append(list);
    }
  }
  const auto = mk('p', 'stauto');
  auto.hidden = true;
  box.append(auto);
  const next = win ? STAGES[s.i + 1] : undefined, o = opts;
  // 마지막 단계를 깼다 (자동 진행이 멈추는 게임): [다음]이 없는 까닭과 할 수 있는 것. [별 모으기]는 홈으로 가서 그 단계의 정보 창을 연다 (전투 화면에 남지 않게)
  if (win && lastStop(s)) { const st = myStage()?.stars ?? {}; box.append(lastNote(s, true, { ...st, [id]: (st[id] ?? 0) | mask }, (to) => { hideResult(); o.home(); openStageInfo(to); })); }
  const btns = mk('div', 'stbtns res');
  btns.append(btn('plain', t('resHome'), () => { hideResult(); o.home(); }));
  btns.append(btn(win ? 'plain' : 'stgo', win ? t('resAgain') : t('resRetry'), () => fueled(id, () => { hideResult(); (o.again ?? o.go)(id); })));
  if (next) btns.append(btn('stgo', L().fmt.resNext(next.id), () => fueled(next.id, () => { hideResult(); (o.next ?? o.go)(next.id); })));
  box.append(btns);
  box.hidden = false;
  // 보상 연출의 소리 (U2): 깸이면 별·보상 칩이 뒤집히는 동안 '받음', 지면 낮은 소리 (화면 효과음)
  window.setTimeout(() => uiSound(win ? 'ui.reward' : 'ui.fail'), win ? 450 : 0);
  openScreen('stResult', { kind: 'sheet', el: box, scene: 'result', close: () => { box.hidden = true; clearInterval(resTimer); } });
  // 자동 진행: 다음 단계가 곧 시작한다 (서버의 nextS). 'n초 뒤'와 멈춤
  clearInterval(resTimer);
  if (win && next && myStage()?.auto) {
    let left = Math.max(1, Math.round(STAGE_RULES.nextS));
    const tick = () => {
      auto.hidden = false; auto.textContent = '';
      auto.append(L().fmt.resAuto(left, next.id) + ' ', btn('plain', t('resAutoStop'), () => { send({ t: 'stage', a: 'auto', on: false }); clearInterval(resTimer); auto.hidden = true; }));
      left--;
    };
    tick();
    resTimer = window.setInterval(() => { if (left < 0) { clearInterval(resTimer); return; } tick(); }, 1000);
  }
}
function hideResult(): void { const box = $('stResult'); if (box && !box.hidden) { box.hidden = true; clearInterval(resTimer); dropScreen('stResult'); } }
/** 결과 창을 닫는다 (게임의 화면이 바뀔 때) */
export const closeStageResult = hideResult;

/**
 * 단계 정보 창·편성 확인·결과 창을 켠다 (게임의 모듈이 init에서 한 번). 결과 창은 안내문 stageClear·stageFail을 듣고 뜬다.
 * 별 조건이 있는 단계는 안내문의 셋째 값(딴 별)으로 별을 보인다
 */
export function useStageScreens(o: StageScreenOpts): void {
  if (opts) { opts = o; return; }
  opts = o;
  for (const [id, cls] of [['stInfo', 'panel stsheet'], ['stCheck', 'stpage'], ['stResult', 'panel stsheet stresult']] as const) {
    const e = mk('div', cls); e.id = id; e.hidden = true; e.setAttribute('role', 'dialog');
    document.body.append(e);
  }
  onMsg('sys', (m) => {
    const a = m.a ?? [];
    if (m.k === 'stageClear') showResult(String(a[0] ?? ''), true, Number(a[1]) === 1, Number(a[2] ?? 0));
    else if (m.k === 'stageFail') showResult(String(a[0] ?? ''), false, false, 0);
  });
  // 자동 진행으로 다음 단계가 시작했으면 결과 창을 닫는다 (이긴 창만: 진 창은 사람이 고른다)
  onSlow(() => {
    const run = myStage()?.run;
    if (resWin && run && run.id !== resId && run.state === 'fight' && !opts?.holdResult?.()) hideResult();
    drawCheck();
  });
  onMsg('me', (m) => { if (m.k === 'stage' && !$('stInfo')!.hidden) drawInfo(); });
  onLangChange(() => { if (!$('stInfo')!.hidden) drawInfo(); drawCheck(true); });
}
