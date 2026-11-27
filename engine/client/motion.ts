// 움직임 줄이기 (U2): 기기의 '동작 줄이기'(prefers-reduced-motion)와 설정 창의 '움직임 줄이기' 칸을 한 곳에서 본다.
// 켜지면 문서 뿌리에 data-still="1"을 단다: tokens.css가 움직임 시간 토큰을 거의 0으로 하고 css의 연출(돌림·흔들림·떠오름)을 멈춘다.
// 화면 코드(보상 연출·뽑기 연출·배너 넘김)는 stillMotion()으로 묻는다. 설정 값은 설정 창(hud/settings.ts)이 setStillMotion으로 건다 (null = 기기를 따른다).

let pref: boolean | null = null;
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** 지금 움직임을 줄이는가 (설정 값, 없으면 기기의 동작 줄이기) */
export const stillMotion = (): boolean => pref ?? !!media?.matches;

function paint(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.still = stillMotion() ? '1' : '0';
}

/** 설정 창의 값을 건다 (null이면 기기를 따른다) */
export function setStillMotion(v: boolean | null): void {
  pref = v;
  paint();
}

media?.addEventListener?.('change', paint);
paint();
