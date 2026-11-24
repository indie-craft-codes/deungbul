// 차단: 내 화면에서만 그 사람의 말을 숨긴다. 이름으로 기억하고 브라우저에 저장한다.
// (계정이 생기면 계정 기준으로 바꾼다. 지금은 이름을 바꾸면 풀린다.)
const KEY = 'blocked';
const blocked = new Set<string>();
try {
  const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  if (Array.isArray(raw)) for (const n of raw) if (typeof n === 'string') blocked.add(n);
} catch { /* 저장소를 못 쓰는 환경 */ }

export const isBlocked = (name: string): boolean => blocked.has(name);

/** 차단을 켜거나 끈다. 바뀐 뒤의 상태를 돌려준다. */
export function toggleBlock(name: string): boolean {
  if (!blocked.delete(name)) blocked.add(name);
  try { localStorage.setItem(KEY, JSON.stringify([...blocked].slice(-200))); } catch { /* 무시 */ }
  return blocked.has(name);
}
