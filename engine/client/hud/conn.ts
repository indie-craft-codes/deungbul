// 접속 화면의 상태 (U2 피드백·상태: docs/ux-review.md 2.3 끊김·3.7, 쓰는 법은 docs/making-a-game.md 25절).
// 접속 화면(#gate) 하나가 첫 로딩·끊김·닫힘 코드별 안내(점검·업데이트·밀려남·차단 …)를 함께 보인다. 모양은 #gate[data-kind]:
//   wait   첫 로딩: 돌림 + 진행 막대(서버에 잇기 → 캐릭터 받기 → 에셋) + 팁 한 줄(넘어간다)
//   lost   끊김: '연결이 끊겼습니다 · 다시 잇는 중 (n번째) · m초 뒤' + [지금 다시 잇기]. 오래 걸리면(30초 또는 네 번째부터) 까닭의 안내와 [새로고침]
//   maint  점검(4004)·새 접속 막힘(4005) (hud/ops.ts가 예정 끝 시각을 덧붙인다)
//   update 새 버전이 필요함(4006, update 메시지)
//   stop   다른 곳에서 접속함·내보내짐·막힘·옮겨 감·지워짐·가득 참
// 다시 이어지면 가운데 알림 '다시 연결되었습니다'. 다시 잇기의 간격(2초부터 15초까지)과 닫힘 코드의 뜻은 그대로 main.ts에 있다.
import { $ } from '../app';
import { onSlow } from '../bus';
import { L, onLangChange, t, type UiKey } from '../i18n';
import { platform } from '../platform';
import { banner } from './notify';

export type GateKind = 'wait' | 'lost' | 'maint' | 'update' | 'stop';

let everIn = false;
let lostAt = 0;
let attempt = 0;
let nextAt = 0;
let trying = false;
let lost = false;
let tipAt = 0;
let tipN = 0;
let tips: () => string[] = () => [t('tip1'), t('tip2'), t('tip3'), t('tip4')];

/** 첫 로딩의 팁을 게임의 것으로 (게임의 화면 모듈이 init에서). 빈 배열이면 팁 줄이 없다 */
export function setLoadingTips(fn: () => string[]): void { tips = fn; }

const el = (id: string): HTMLElement | null => $(id);

/** 접속 화면의 모양 (아이콘·색): main.ts·hud/me.ts의 showGate가 부른다 */
export function gateKind(kind: GateKind): void {
  const g = el('gate');
  if (!g) return;
  g.dataset.kind = kind;
  const extra = el('gateSub'), bar = el('gateBar'), tip = el('gateTip'), reload = el('gateReload');
  if (kind !== 'lost') { if (extra) extra.hidden = true; if (reload) reload.hidden = true; }
  if (bar) bar.hidden = kind !== 'wait';
  if (tip) tip.hidden = kind !== 'wait' || everIn || !tips().length;
}

/** 진행 막대 (0~1): 첫 로딩의 단계 */
function progress(k: number): void { const p = el('gateProg') as HTMLProgressElement | null; if (p) p.value = k; }

/** 연결을 열기 시작했다 (main.ts의 opening) */
export function connOpening(): void {
  trying = true;
  if (lost) { paintLost(); return; }
  progress(0.15);
  paintTip(performance.now(), true);
}
/** 서버가 받아 주었다 (welcome): 끊겼다 이어진 것이면 알린다 */
export function connIn(): void {
  trying = false;
  progress(0.6);
  if (lost) banner(t('connBack'), 'good');
  lost = false; attempt = 0; everIn = true;
  const tip = el('gateTip'); if (tip) tip.hidden = true;
}
/** 끊겼다: 다음 시도까지 ms. 첫 접속에 실패한 것도 같다 ('서버에 잇지 못했습니다') */
export function connLost(waitMs: number): void {
  trying = false;
  if (!lost) { lost = true; lostAt = performance.now(); attempt = 0; }
  attempt++;
  nextAt = performance.now() + waitMs;
  paintLost();
}
/** 끊겨 다시 잇는 중인가 (그동안 여는 때마다 '접속 중'으로 덮어쓰지 않는다) */
export const connLosing = (): boolean => lost;
/** 끊김이 아닌 닫힘(점검·밀려남 …)이나 화면을 걷었다: 끊김의 셈을 멈춘다 */
export function connStop(): void { lost = false; trying = false; }

function paintLost(): void {
  const msg = el('gateMsg'), sub = el('gateSub'), btn = el('joinBtn'), reload = el('gateReload');
  if (!msg || !sub || !btn) return;
  const key: UiKey = everIn ? 'connLost' : 'connFail';
  msg.setAttribute('data-i18n', key); msg.textContent = t(key);
  const loc = L(), now = performance.now(), left = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const line = trying ? loc.fmt.connTrying(attempt) : loc.fmt.connRetry(attempt, left);
  const long = attempt >= 4 || now - lostAt > 30_000;
  sub.textContent = long ? `${line}\n${t('connLong')}` : line;
  sub.hidden = false;
  btn.hidden = false; btn.setAttribute('data-i18n', 'connNow'); btn.textContent = t('connNow');
  (btn as HTMLButtonElement).disabled = trying;
  if (reload) reload.hidden = !long || platform().id !== 'web';
  gateKind('lost');
  el('gate')!.hidden = false;
}

function paintTip(now: number, force = false): void {
  const tip = el('gateTip'), list = tips();
  if (!tip || everIn || lost || !list.length) return;
  if (!force && now - tipAt < 4500) return;
  tipAt = now;
  tip.textContent = list[tipN++ % list.length];
}

/** 틀이 시작할 때 한 번 (main.ts) */
export function initConn(): void {
  el('gateReload')?.addEventListener('click', () => platform().app.requireUpdate()); // 웹: 새로고침 (앱은 단추가 없다)
  onSlow((now) => {
    if (el('gate')?.hidden) return;
    if (lost) paintLost(); else paintTip(now);
  });
  onLangChange(() => { if (lost) paintLost(); tipAt = 0; paintTip(performance.now(), true); });
}
