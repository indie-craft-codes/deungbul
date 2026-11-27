// 플랫폼 접점의 입구: 지금 쓰는 구현(platform), 갈아 끼우기(setPlatform), 그리고 틀이 접점 위에 얹은 것(광고 구간의 일시정지·음소거, 게임 구간 알림의 중복 거르기, 광고 가능 지점의 사건).
// 기본은 web(./web.ts): 지금 동작 그대로다. 데스크톱·모바일·포털은 게임의 진입점이 startClient보다 먼저 setPlatform(그 구현)을 부른다.
// node(시험)에서 읽혀도 죽지 않는다: 브라우저가 없으면 처음 부를 때 시험용(memory) 구현을 쓴다.
import { memoryPlatform } from './memory';
import type { Feature, Platform } from './types';
import { webPlatform } from './web';

export type { Feature, InputKind, KeyLike, LifeEvent, Platform, RawError } from './types';
export { memoryPlatform, type MemoryPlatform } from './memory';
export { keyNameOf } from './keyname';
export { guestAuth, auth, setAuth, type AuthProvider } from './auth';

let current: Platform | null = null;
/** 지금의 플랫폼 구현 */
export function platform(): Platform {
  if (!current) current = typeof window === 'undefined' || typeof document === 'undefined' ? memoryPlatform() : webPlatform();
  return current;
}
/** 플랫폼 구현을 갈아 끼운다 (게임의 진입점이 startClient보다 먼저, 시험) */
export function setPlatform(p: Platform): void { current = p; }
/** 그 기능이 있는가 (platform().has의 줄임) */
export const has = (f: Feature): boolean => platform().has(f);

// ---------- 광고와 게임 구간 ----------
// 틀은 광고 SDK를 부르지 않는다. 판 끝·부활 같은 '광고를 띄워도 되는 자리'를 사건으로 알릴 뿐이고(onBreakPoint), 띄울지는 게임·배포가 정한다.
// 게임이 adBreak·rewarded를 부르면 그동안 소리를 멈추고(audio 칸의 onInterrupt처럼) 화면을 '쉬는 중'으로 둔다. 기본 구현은 곧바로 끝난다(광고 차단기가 있어도 진행).

/** 광고 중인가 (그동안 틀은 소리를 끄고 입력을 받지 않는다) */
let inAd = false;
const adListeners: ((on: boolean) => void)[] = [];
/** 광고가 시작·끝날 때 (소리: sound.ts가 듣는다) */
export function onAd(fn: (on: boolean) => void): void { adListeners.push(fn); }
export const adPlaying = (): boolean => inAd;
function setAd(on: boolean): void { if (inAd === on) return; inAd = on; for (const fn of adListeners) fn(on); }

/** 전면 광고 (where: 'roundEnd', 'respawn' …). 그동안 소리를 멈추고 게임 구간을 닫았다가 다시 연다 */
export async function adBreak(where: string): Promise<void> {
  if (inAd) return;
  const was = playing;
  gameplayStop(); setAd(true);
  try { await platform().ads.adBreak(where); } catch { /* 실패해도 진행 */ } finally { setAd(false); if (was) gameplayStart(); }
}
/** 보상형 광고: 끝까지 봤으면 true. 실패·광고 없음·차단이면 false (보상을 주지 않는다) */
export async function rewarded(why: string): Promise<boolean> {
  if (inAd) return false;
  const was = playing;
  gameplayStop(); setAd(true);
  try { return await platform().ads.rewarded(why); } catch { return false; } finally { setAd(false); if (was) gameplayStart(); }
}

/** 게임 구간 (포털 규칙: 같은 사건을 두 번 잇달아 보내지 않는다, 광고 중에는 보내지 않는다) */
let playing = false;
export function gameplayStart(): void { if (playing || inAd) return; playing = true; platform().ads.gameplayStart(); }
export function gameplayStop(): void { if (!playing) return; playing = false; platform().ads.gameplayStop(); }
export const inGameplay = (): boolean => playing;

const points: ((where: string) => void)[] = [];
/** 광고를 띄워도 되는 자리에서 불린다: 'roundEnd'(판이 끝남), 'respawn'(쓰러져 다시 일어남). 게임이 adBreak를 부를지 정한다 */
export function onBreakPoint(fn: (where: string) => void): void { points.push(fn); }
/** 틀이 그 자리를 알린다 (engine/client/lifecycle.ts) */
export function breakPoint(where: string): void { for (const fn of points) fn(where); }
