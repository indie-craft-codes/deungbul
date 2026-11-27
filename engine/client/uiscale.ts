// 화면 배율과 보기 설정 (U4: 큰 화면 배율과 접근성). 설정 창(hud/settings.ts)의 값과 화면 크기를 한 곳에서 문서 뿌리에 건다.
//   --ui-scale   창·단추·글자의 배율 = 큰 화면에 맞춤(fitScale: 1920×1080은 1.2, 4K는 2.4, 폰은 1) × UI 크기(작게·보통·크게·아주 크게)
//                style.css가 3D 화면(#view)·이름표(#tags)·번쩍임(#flash) 밖의 body 아래 요소 모두에 zoom으로 건다: 틀과 게임의 창이 따로 할 일은 없다
//   --app-w/-h   배율을 건 좌표의 화면 크기 (zoom 안에서는 100vw·100vh가 배율만큼 커지므로 css는 이것과 --uvw·--uvh를 쓴다)
//   --view-w/-h  진짜 화면 크기 (3D 화면·이름표)
//   --hud-w/-x   HUD의 폭과 왼쪽 (울트라와이드에서 가운데 16:9로 모은다: settingscalc.hudBox)
//   --fs-scale   글자 크기 (tokens.css의 글자 단계 일곱에 곱한다), data-contrast="1" 고대비
// 배율을 건 요소의 자리를 스크립트가 정할 때(마우스 자리 → style.left)는 toUi(px)로 나눈다: getBoundingClientRect와 clientX는 진짜 화면 px이다.
import { platform } from './platform';
import { fitScale, hudBox } from './hud/settingscalc';
import { layOf } from './hud/layout';

let size = 1, fit = true, text = 1, contrast = false, scale = 1, hudX = 0;
const fns: ((s: number) => void)[] = [];

/** 지금 창·단추·글자의 배율 (큰 화면에 맞춤 × UI 크기) */
export const uiScale = (): number => scale;
/** 진짜 화면 px(clientX, getBoundingClientRect)를 배율을 건 요소 안의 px로 */
export const toUi = (px: number): number => px / scale;
/** HUD 상자의 왼쪽 (배율을 건 좌표: 울트라와이드에서 가운데로 모았을 때만 0보다 크다). 3D 화면 px로 HUD 안의 요소를 놓을 때 뺀다 */
export const hudLeft = (): number => hudX;
/** 배율이 바뀔 때 */
export function onUiScale(fn: (s: number) => void): void { fns.push(fn); }

/** 설정 창의 값을 건다 */
export function setUiPrefs(p: { size: number; fit: boolean; text: number; contrast: boolean }): void {
  size = p.size; fit = p.fit; text = p.text; contrast = p.contrast;
  applyUiScale();
}

/** 화면 크기와 설정으로 문서 뿌리의 변수를 다시 건다 (화면 크기가 바뀔 때 main.ts의 resize가 부른다) */
export function applyUiScale(): void {
  if (typeof document === 'undefined') return;
  const { w, h } = platform().display.viewport();
  const pc = layOf(w, h) === 'pc';
  let next = (fit ? fitScale(w, h, pc) : 1) * size;
  // PC는 배율을 건 화면이 1100×600보다 작아지지 않게 (좁은 PC의 css 규칙은 진짜 화면 크기의 @media로 고른다: 그보다 좁아지면 창이 넘친다)
  if (pc) next = Math.min(next, Math.max(1, Math.min(w / 1100, h / 600)));
  next = Math.round(next * 100) / 100;
  const root = document.documentElement, st = root.style;
  const px = (k: string, v: number) => st.setProperty(k, `${Math.round(v * 100) / 100}px`);
  st.setProperty('--ui-scale', String(next));
  px('--view-w', w); px('--view-h', h);
  px('--app-w', w / next); px('--app-h', h / next);
  // 배율 1이면 예전처럼 1vw·1vh (폰은 그대로)
  if (next === 1) { st.removeProperty('--uvw'); st.removeProperty('--uvh'); } else { px('--uvw', w / next / 100); px('--uvh', h / next / 100); }
  const box = hudBox(w, h, next, pc);
  hudX = box.x;
  if (box.x > 0) { px('--hud-w', box.w); px('--hud-x', box.x); } else { st.removeProperty('--hud-w'); st.removeProperty('--hud-x'); }
  st.setProperty('--fs-scale', String(text));
  root.dataset.contrast = contrast ? '1' : '0';
  root.dataset.big = next > 1 ? '1' : '0';
  if (next !== scale) { scale = next; for (const fn of fns) fn(scale); }
}
