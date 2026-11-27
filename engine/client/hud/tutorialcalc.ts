// 튜토리얼의 셈: 단계가 끝났는가, 진행의 저장 모양. 화면 요소를 읽지 않는다 (node의 시험: engine/test/fx/web.test.ts).

/**
 * 단계가 끝나는 조건 (하나라도 맞으면 끝). 아무것도 주지 않으면 '다음' 단추로 넘긴다.
 *   msg: 서버 메시지의 종류('welcome', 'stat' …)나 안내문('sys:levelUp')
 *   cmd: 내가 서버에 보낸 명령의 종류('move', 'attack', 'class' …)
 *   key: 누른 단축키의 기능(처음 키: 'm', 'b' …. 다시 고른 키를 눌러도 그 기능이면 맞다)
 *   test: 느린 주기(0.25초)마다 물어 참이면 (창이 열렸다, 레벨이 2가 됐다 …)
 */
export interface TutorialCond { msg?: string; cmd?: string; key?: string; test?: () => boolean }
export type TutEvent = { kind: 'msg' | 'cmd' | 'key'; name: string } | { kind: 'tick' };

/** 그 사건으로 조건이 맞는가 */
export function condMet(c: TutorialCond | undefined, ev: TutEvent): boolean {
  if (!c) return false;
  if (ev.kind === 'tick') return !!c.test?.();
  const want = ev.kind === 'msg' ? c.msg : ev.kind === 'cmd' ? c.cmd : c.key;
  return want !== undefined && want.toLowerCase() === ev.name.toLowerCase();
}

/** 저장한 진행: 지금 단계(0부터), 끝났는가 ('done' 다 봄, 'skip' 건너뜀) */
export interface TutProgress { i: number; end: '' | 'done' | 'skip' }
export function readProgress(raw: string | null, steps: number): TutProgress {
  if (raw === 'done' || raw === 'skip') return { i: steps, end: raw };
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < steps ? { i: n, end: '' } : { i: 0, end: '' };
}
export const writeProgress = (p: TutProgress): string => (p.end || String(p.i));
