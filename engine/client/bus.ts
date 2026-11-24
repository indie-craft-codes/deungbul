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
 * 단축키 (글자 키 하나). 글자를 입력하는 중이나 접속 전에는 불리지 않는다 (input.ts가 거른다).
 * 틀이 이미 쓰는 키(숫자, Q, R, H, B, M, Tab, Enter, Esc)는 틀이 먼저 받으므로 등록해도 불리지 않고, 이동 키(W, A, S, D)는 등록하면 이동에 쓰이지 않는다.
 */
const hotkeys = new Map<string, () => void>();
export function onKey(key: string, fn: () => void): void { hotkeys.set(key.toLowerCase(), fn); }
/** 그 키에 등록된 것이 있으면 부르고 참을 돌려준다 */
export function runKey(key: string): boolean {
  const fn = hotkeys.get(key.toLowerCase());
  if (fn) fn();
  return !!fn;
}
