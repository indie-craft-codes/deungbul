// 프레임 상한 (묶음 E의 절전 화면: hud/powersave.ts). 틀의 프레임(main.ts의 frame)이 이것을 보고
// 상한이 없으면 requestAnimationFrame으로(예전과 같다), 있으면 setTimeout으로 fps만큼만 돈다. render가 거짓이면 3D를 그리지 않는다
// (보간·자동 사냥·HUD의 셈은 그대로 돈다: 사냥은 서버의 일이고 화면의 자동 사냥은 0.3초 주기다).
// 세는 값(frames, renders)은 절전의 효과를 재는 데 쓴다 (도구·화면 시험).

let cap: { fps: number; render: boolean } | null = null;
/** 지금까지 돈 프레임과 3D를 그린 수 */
export const frameStats = { frames: 0, renders: 0 };
/** 프레임 상한을 건다 (fps: 1~30). null이면 푼다 */
export function setFrameCap(fps: number | null, render = true): void { cap = fps === null ? null : { fps: Math.max(1, Math.min(30, fps)), render }; }
/** 지금 상한 (없으면 null) */
export const frameCap = (): Readonly<{ fps: number; render: boolean }> | null => cap;
