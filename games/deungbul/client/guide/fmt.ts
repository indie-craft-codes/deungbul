// 수를 글자로 바꾸는 방법. 도감의 내용(data.ts)과 언어 파일이 함께 쓴다.
/** 수: 천 단위 쉼표, 소수는 둘째 자리까지 */
export const num = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** 비율(0~1)을 백분율로 */
export const pct = (ratio: number): string => `${num(ratio * 100)}%`;
/** 범위: 3–6 (같으면 하나만) */
export const span = (r: readonly [number, number]): string => (r[0] === r[1] ? num(r[0]) : `${num(r[0])}–${num(r[1])}`);
