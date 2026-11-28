// 모듈들이 스스로 끼어드는 자리: 서버 메시지, 매 프레임, 느린 주기(0.25초), 단축키.
// 새 기능은 자기 init 안에서 여기에 등록하면 되고, main.ts의 메시지 처리나 프레임 루프를 고치지 않는다.
// (언어가 바뀔 때는 i18n의 onLangChange에 등록한다.)
import type { ServerMsg } from '../shared/protocol';

type MsgType = ServerMsg['t'];
type Handler<T extends MsgType> = (m: Extract<ServerMsg, { t: T }>, now: number) => void;

const handlers = new Map<MsgType, Handler<MsgType>[]>();
const frames: ((now: number, dt: number) => void)[] = [];
const slows: ((now: number) => void)[] = [];

/** 그 종류의 서버 메시지가 오면 부른다. 같은 종류에 여럿이 등록하면 등록한 순서대로 불린다. */
export function onMsg<T extends MsgType>(t: T, fn: Handler<T>): void {
  const list = handlers.get(t);
  if (list) list.push(fn as unknown as Handler<MsgType>); else handlers.set(t, [fn as unknown as Handler<MsgType>]);
}
export function dispatch(m: ServerMsg, now: number): void {
  for (const fn of handlers.get(m.t) ?? []) fn(m, now);
}

/** 매 프레임 (그리기 직전) */
export function onFrame(fn: (now: number, dt: number) => void): void { frames.push(fn); }
export function runFrame(now: number, dt: number): void { for (const fn of frames) fn(now, dt); }

/** 0.25초마다: 글자나 단추 상태처럼 자주 바꿀 필요가 없는 것 */
export function onSlow(fn: (now: number) => void): void { slows.push(fn); }
export function runSlow(now: number): void { for (const fn of slows) fn(now); }

/**
 * 단축키 (글자 키 하나, 또는 'Tab'처럼 키의 이름). 글자를 입력하는 중이나 접속 전에는 불리지 않는다 (input.ts가 거른다).
 * 틀의 키는 그 기능을 가진 모듈이 init에서 bindKey로 단다: 핵심은 M(메뉴), N(지도), H(집으로), Enter(대화), Esc. 전투는 숫자(기술)와 Tab(대상),
 * 아이템은 Q(물약)와 B(가방), 자동 사냥(away)은 R. 고르지 않은 모듈의 키는 비어 있어 게임이 onKey로 쓸 수 있다.
 * 틀의 키와 같은 키를 onKey로 등록하면 틀의 것이 먼저다(불리지 않는다). 이동 키(W, A, S, D, 방향키)는 등록하면 이동에 쓰이지 않는다.
 */
const engineKeys = new Map<string, () => void>();
const hotkeys = new Map<string, () => void>();
/** 틀의 모듈이 단축키를 단다 (게임은 onKey) */
export function bindKey(key: string, fn: () => void): void { engineKeys.set(key.toLowerCase(), fn); }
/** 게임의 단축키의 이름 (설정 창의 키 재설정에 보인다). 주지 않으면 '게임 키 X' */
const hotLabels = new Map<string, () => string>();
/** 게임의 단축키. label을 주면 설정 창의 키 재설정 목록에 그 이름으로 보인다 */
export function onKey(key: string, fn: () => void, label?: () => string): void { hotkeys.set(key.toLowerCase(), fn); if (label) hotLabels.set(key.toLowerCase(), label); }
/** 지금 틀이 쓰는 키 (시험과 안내에) */
export const boundKeys = (): string[] => [...engineKeys.keys()];

// ---- 키 재설정 (설정 창: hud/settings.ts) ----
// 단축키는 처음 등록한 키(그 기능의 이름표 노릇)로 가리키고, 사람이 고른 키를 그 위에 얹는다: { 'm': 'k' }면 K가 메뉴를 열고 M은 아무것도 하지 않는다.
/** 기능(처음 키) → 고른 키 */
let custom = new Map<string, string>();
/** 고른 키 → 기능 */
let byNew = new Map<string, string>();
/** 키 재설정을 바꾼다 (처음 키 → 고른 키). 같은 키를 두 기능에 고르면 뒤의 것이 이긴다 */
export function setKeyMap(map: Readonly<Record<string, string>>): void {
  custom = new Map(Object.entries(map).map(([a, k]): [string, string] => [a.toLowerCase(), k.toLowerCase()]).filter(([a, k]) => a && k && a !== k));
  byNew = new Map([...custom].map(([a, k]) => [k, a]));
}
/** 그 기능(처음 키)에 지금 쓰는 키 */
export const keyFor = (action: string): string => custom.get(action.toLowerCase()) ?? action.toLowerCase();
/** 단축키 목록: 기능(처음 키), 지금 키, 틀의 것인가, 게임이 준 이름 */
export function keyList(): { action: string; key: string; engine: boolean; label?: () => string }[] {
  const out: { action: string; key: string; engine: boolean; label?: () => string }[] = [];
  for (const a of engineKeys.keys()) out.push({ action: a, key: keyFor(a), engine: true });
  for (const a of hotkeys.keys()) if (!engineKeys.has(a)) out.push({ action: a, key: keyFor(a), engine: false, label: hotLabels.get(a) });
  return out;
}
/** 누른 키가 가리키는 기능 (재설정을 거친 뒤). 다른 키로 옮긴 기능의 처음 키는 아무것도 가리키지 않는다 */
export function actionOf(key: string): string | null {
  const k = key.toLowerCase();
  return byNew.get(k) ?? (custom.has(k) ? null : k);
}
/** 그 기능(처음 키)을 곧바로 부른다: 키 재설정을 거치지 않는다 (게임패드의 단추는 기능에 묶인다: ./pad.ts). 등록된 것이 있으면 참 */
export function runAction(action: string): boolean {
  const a = action.toLowerCase(), fn = engineKeys.get(a) ?? hotkeys.get(a);
  if (fn) fn();
  return !!fn;
}
/** 그 키에 등록된 것이 있으면 부르고 참을 돌려준다 (틀의 것 먼저) */
export function runKey(key: string): boolean {
  const a = actionOf(key);
  const fn = a === null ? undefined : engineKeys.get(a) ?? hotkeys.get(a);
  if (fn) fn();
  return !!fn;
}
