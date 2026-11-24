// 재료가 어디서 나오는지: 어떤 몬스터가 떨어뜨리는지를 shared/content/craft.ts의 DROPS에서 읽어 글로 만든다.
// 문장에 몬스터 이름을 직접 적지 않으므로, 드롭 표가 바뀌면 가방과 대장간의 안내도 따라 바뀐다.
import { DROPS, type ItemId, type MonsterId } from '../../../shared/defs';
import { L } from '../i18n';

/** 그 재료를 떨어뜨리는 몬스터들의 이름 (현재 언어) */
function droppers(id: ItemId): string[] {
  const loc = L();
  return (Object.keys(DROPS) as MonsterId[]).filter((m) => DROPS[m]?.id === id).map((m) => loc.monsters[m]);
}

/** '얻는 곳: 멧돼지' (떨어뜨리는 몬스터가 없으면 빈 글) */
export function sourceText(id: ItemId): string {
  const names = droppers(id);
  return names.length ? L().fmt.matFrom(names) : '';
}

/** '질긴 가죽 얻는 곳: 멧돼지': 재료 이름까지 붙인 한 줄 */
export function sourceLine(id: ItemId): string {
  const names = droppers(id), loc = L();
  return names.length ? loc.fmt.matSource(loc.items[id].name, names) : '';
}
