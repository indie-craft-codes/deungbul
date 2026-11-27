// 스태미나의 화면 (stamina 모듈, 묶음 D: docs/screens.md 2.8·9.2의 12, 쓰는 법은 docs/making-a-game.md 27절).
//   재화 줄의 칩(staminaChip: 'n/상한 · 다음 1까지 m:ss', 누르면 창): currencyBar(['stamina', …])
//   부족 창(openStaminaPop): '○○이 모자랍니다', 다음 하나까지·가득까지, [물약 쓰기 (+n · 가진 것 k)](물약이 있는 게임), [기다리기]. 유료 충전은 없다
//   출격 문(staminaGate): 단계 화면의 [출발]·[다시]·[다음]이 먼저 묻는다: 모자라면 창을 열고 보내지 않는다 (서버도 막는다: 안내문 staminaShort)
// 서버의 짝은 engine/server/game/systems/stamina.ts (개인 상태 'stamina'). STAMINA_RULES.enabled가 거짓이면 아무것도 붙지 않는다.
import { STAMINA_RULE_VIEW, isItemId, stageCost, staminaOn, type StaminaMe } from '../../shared/defs';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { S } from '../state';
import type { CurrencyChip } from './currency';
import { button, whyOf } from './menu/parts';
import { addNotices } from './notify';
import { closeScreen, openScreen } from './screens';

let me: StaminaMe | null = null;
/** 개인 상태를 받은 때 (다음 하나까지를 화면이 셈한다: 서버는 바뀔 때만 보낸다) */
let at = 0;
let pop: HTMLElement | null = null;
let need = 0;

/** 스태미나를 쓰는 게임인가 (모듈을 고르고 규칙이 켜져 있다. 서버가 개인 상태를 보냈으면 서버를 따른다: 서버가 권위) */
export const staminaUsed = (): boolean => hasModule('stamina') && (staminaOn() || me !== null);
/** 이름 (게임의 문장 키: '계약의 숨결') */
export const staminaName = (): string => uiText.get(STAMINA_RULE_VIEW.name);
/** 지금의 { 양, 상한, 다음 하나까지(초), 가득까지(초) }. 받기 전이면 null */
export function myStamina(): StaminaMe | null {
  if (!me) return null;
  const gone = Math.floor((performance.now() - at) / 1000);
  return gone <= 0 || me.next <= 0 ? me : { ...me, next: Math.max(1, me.next - gone), full: Math.max(1, me.full - gone) };
}
/** 재화 줄의 칩 ('stamina'). 숫자 대신 'n/상한 · 다음 1까지 m:ss'. 누르면 창 */
export function staminaChip(): CurrencyChip {
  return {
    id: 'stamina', glyph: 'stamina', value: () => myStamina()?.n ?? 0,
    text: () => { const s = myStamina(); return s ? L().fmt.staChip(s.n, s.max, s.next) : '…'; },
    title: () => staminaName(), onClick: () => openStaminaPop(0), shown: staminaUsed,
  };
}
/** 단계 한 번의 값 (stamina를 쓰지 않으면 0) */
export const stageFuel = (cost: number | undefined): number => (staminaUsed() ? stageCost(cost) : 0);
/** 출격 문: n만큼 있으면 true, 모자라면 부족 창을 열고 false */
export function staminaGate(n: number): boolean {
  if (!staminaUsed() || n <= 0) return true;
  if ((myStamina()?.n ?? 0) >= n) return true;
  openStaminaPop(n);
  return false;
}

let sig = '';
function draw(): void {
  if (!pop || pop.hidden) return;
  const s = myStamina(), loc = L(), name = staminaName();
  const pot = me?.pot ?? STAMINA_RULE_VIEW.potion, mine = JSON.stringify([s?.n, s?.max, need, pot ? S.me?.items[pot.item] ?? 0 : 0, loc.code]);
  // 단추는 바뀔 때만 새로 만든다 (누르는 사이에 단추가 바뀌지 않게). 시간의 글은 늘 고친다
  if (mine === sig) { const info = pop.querySelector('.staInfo'); if (info) info.textContent = [loc.fmt.staNext(s?.next ?? 0), loc.fmt.staFull(s?.full ?? 0)].filter(Boolean).join(' · '); return; }
  sig = mine;
  pop.textContent = '';
  const head = document.createElement('div'); head.className = 'sthead';
  const h = document.createElement('h3');
  h.textContent = need > (s?.n ?? 0) ? loc.fmt.staShort(name, need, s?.n ?? 0) : `${name} ${s ? loc.fmt.staChip(s.n, s.max, 0) : ''}`;
  const x = button('×', () => closeScreen('staPop')); x.className = 'plain stclose';
  head.append(h, x);
  pop.append(head);
  const info = document.createElement('p'); info.className = 'note staInfo';
  info.textContent = [loc.fmt.staNext(s?.next ?? 0), loc.fmt.staFull(s?.full ?? 0)].filter(Boolean).join(' · ');
  pop.append(info);
  const btns = document.createElement('div'); btns.className = 'stbtns';
  if (pot && isItemId(pot.item)) {
    const have = S.me?.items[pot.item] ?? 0;
    const b = button(t('staPotion'), () => send({ t: 'stamina', a: 'potion' }), have <= 0);
    b.className = 'stgo'; b.id = 'staPotion';
    const small = document.createElement('small'); small.textContent = loc.fmt.staPotionBtn(pot.n, have); b.append(small);
    if (have <= 0) whyOf(b, t('staNoPotion'));
    btns.append(b);
  }
  const wait = button(t('staWait'), () => closeScreen('staPop')); wait.className = 'plain'; wait.id = 'staWait';
  btns.prepend(wait);
  pop.append(btns);
}
/** 부족 창을 연다 (n: 모자란 출격의 값. 0이면 지금 양만) */
export function openStaminaPop(n: number): void {
  if (!staminaUsed()) return;
  need = n;
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'staPop'; pop.className = 'panel stsheet staPop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
    document.body.append(pop);
  }
  pop.hidden = false; sig = '';
  openScreen('staPop', { kind: 'sheet', el: pop, close: () => { if (pop) pop.hidden = true; } });
  draw();
}

export function initStamina(): void {
  // 규칙이 꺼져 있으면 서버가 개인 상태를 보내지 않는다: 아무것도 보이지 않는다 (칩은 shown으로 숨는다)
  onMsg('me', (m) => { if (m.k === 'stamina') { me = m.s as StaminaMe; at = performance.now(); draw(); } });
  // 모자람은 누른 단추 곁에 (U2의 '안 됨'), 단추가 없으면(자동 진행이 멈춤) 흘러가는 알림. 창도 연다
  addNotices({ fail: ['staminaShort', 'staminaFull'], feed: ['staminaGot'] });
  onMsg('sys', (m) => { if (m.k === 'staminaShort') openStaminaPop(Number(m.a?.[0] ?? 0)); });
  onSlow(draw);
  onLangChange(draw);
}
