// 게임패드의 셈: 패드 상태(왼쪽 막대와 단추) → 이동 방향, 들판의 기능, 창 안의 포커스 이동. 화면 요소·브라우저를 읽지 않는다 (시험은 가짜 패드 상태를 넘긴다: engine/test/fx/client.test.ts).
// 단추 번호는 W3C Gamepad의 표준 배치(standard mapping: Xbox 배치. PlayStation은 같은 자리의 ×○□△)다. 붙이는 곳은 ./pad.ts.
//   들판   왼쪽 막대·십자 키 = 이동, A·B·X·Y = 기술 1~4, LT = 기술 5, LB = 대상 고르기(Tab), RB = 물약(Q), RT = 자동 사냥(R),
//          Back(View) = 지도(N), Start(Menu) = 메뉴(M), 왼쪽 막대 누름 = 집으로(H), 오른쪽 막대 누름 = 가방(B)
//   창     십자 키·막대 = 포커스 앞뒤(위·왼쪽은 앞, 아래·오른쪽은 다음), A = 누름, B = 닫기(Esc), Start = 메뉴 열고 닫기
// 기능은 bus의 '처음 키'로 가리킨다: 키보드의 키 재설정과 상관없이 패드의 자리는 같다. 그 게임에 없는 기능(고르지 않은 모듈의 키)은 아무것도 하지 않는다.

/** 패드 한 프레임 (platform().input.gamepad()의 모양) */
export interface PadState { readonly x: number; readonly z: number; readonly buttons: readonly boolean[] }

/** 표준 배치의 단추 번호 */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** 들판에서 단추 → 기능(bus의 처음 키) */
export const PAD_FIELD: Readonly<Record<number, string>> = {
  [PAD.A]: '1', [PAD.B]: '2', [PAD.X]: '3', [PAD.Y]: '4', [PAD.LT]: '5',
  [PAD.LB]: 'tab', [PAD.RB]: 'q', [PAD.RT]: 'r', [PAD.BACK]: 'n', [PAD.START]: 'm', [PAD.L3]: 'h', [PAD.R3]: 'b',
};

/** 창 안에서 할 일 */
export type PadUi = 'next' | 'prev' | 'press' | 'back' | 'menu';

const on = (p: PadState | null, i: number): boolean => !!p?.buttons[i];
/** 이번 프레임에 새로 눌린 단추 (앞 프레임에 눌려 있지 않았던 것) */
export const padPressed = (prev: PadState | null, cur: PadState): number[] => cur.buttons.flatMap((b, i) => (b && !on(prev, i) ? [i] : []));

/** 이동 방향 (화면 기준: x 오른쪽, z 아래가 양수). 막대가 서 있으면 십자 키. 길이는 1을 넘지 않는다 */
export function padMove(p: PadState): { x: number; z: number } {
  let x = p.x, z = p.z;
  if (!x && !z) { x = (on(p, PAD.RIGHT) ? 1 : 0) - (on(p, PAD.LEFT) ? 1 : 0); z = (on(p, PAD.DOWN) ? 1 : 0) - (on(p, PAD.UP) ? 1 : 0); }
  const d = Math.hypot(x, z);
  return d > 1 ? { x: x / d, z: z / d } : { x, z };
}

/** 들판: 새로 눌린 단추의 기능 (누른 차례가 아니라 번호 차례) */
export const padFieldActions = (prev: PadState | null, cur: PadState): string[] => padPressed(prev, cur).flatMap((i) => (PAD_FIELD[i] ? [PAD_FIELD[i]] : []));

/** 막대를 한 방향으로 넘겼다고 보는 기울기 (넘긴 순간 한 번: 들고 있어도 되풀이하지 않는다) */
const FLICK = 0.6;
/** 막대가 가리키는 쪽: 1 다음(아래·오른쪽), -1 앞(위·왼쪽), 0 가운데 */
const stickDir = (p: PadState | null): number => {
  if (!p) return 0;
  const big = Math.abs(p.z) >= Math.abs(p.x) ? p.z : p.x;
  return Math.abs(big) >= FLICK ? Math.sign(big) : 0;
};

/** 창이 열려 있을 때: 새로 눌린 단추와 막대를 넘긴 것 → 할 일 */
export function padUiSteps(prev: PadState | null, cur: PadState): PadUi[] {
  const out: PadUi[] = [];
  for (const i of padPressed(prev, cur)) {
    if (i === PAD.DOWN || i === PAD.RIGHT) out.push('next');
    else if (i === PAD.UP || i === PAD.LEFT) out.push('prev');
    else if (i === PAD.A) out.push('press');
    else if (i === PAD.B) out.push('back');
    else if (i === PAD.START) out.push('menu');
  }
  const was = stickDir(prev), now = stickDir(cur);
  if (now && now !== was) out.push(now > 0 ? 'next' : 'prev');
  return out;
}
