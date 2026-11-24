// 틀의 언어 묶음과 게임의 언어 묶음을 합친다. 화면(DOM)을 건드리지 않는 순수한 함수라 도감과 시험(node)에서도 쓴다.

const isBundle = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 묶음별로 합친다: 양쪽에 다 있는 묶음(ui, fmt, msg …)은 한 단계 깊이로 합치고, 한쪽에만 있는 것은 그대로 둔다.
 * 같은 키가 양쪽에 있으면 게임의 것이 이긴다: 틀의 기본 문장을 게임이 자기 말로 덮어쓰는 길이다.
 * 뜻하지 않게 겹친 키는 조용히 덮이므로, 겹친 키의 목록(overlaps)을 게임의 시험이 고정해 둔다.
 */
export function mergeLocale<B extends object, G extends object>(base: B, game: G): B & G {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(game)) {
    const b = out[k];
    out[k] = isBundle(b) && isBundle(v) ? { ...b, ...v } : v;
  }
  return out as B & G;
}

/** 틀과 게임에 함께 있는 키의 자리 (ui.title, msg.loot …): 게임이 덮어쓴 틀의 문장들이다 */
export function overlaps(base: object, game: object): string[] {
  const b = base as Record<string, unknown>;
  return Object.entries(game).flatMap(([k, v]) => {
    if (!(k in b)) return [];
    const mine = b[k];
    return isBundle(mine) && isBundle(v) ? Object.keys(v).filter((x) => x in mine).map((x) => `${k}.${x}`) : [k];
  });
}
