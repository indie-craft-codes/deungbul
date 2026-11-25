// 좁은 화면(폰 세로)에서는 가까이 가면 열리는 창들(상점, 대장간, 게임의 창: 이 게임에서는 등탑 창)이 한꺼번에 열리면 화면을 덮는다.
// 열려 있는 것들 가운데 가장 가까운 곳을 #rightcol에 적어 두면, 스타일이 그 창만 남긴다 (style.css의 data-near).
// 어떤 창이 어디에서 열리는지는 그 창의 모듈이 addPlace로 알린다.
import { $ } from '../app';
import { onSlow } from '../bus';
import { S } from '../state';

const PLACES: { id: string; at: readonly { x: number; z: number }[] }[] = [];
const warned = new Set<string>();
/**
 * 가까이 가면 열리는 창을 알린다: id는 그 창의 요소 id(틀의 창이나 mountPanel로 붙인 게임의 창), at은 그 창이 열리는 곳들. 거리가 같으면 먼저 알린 쪽이 남는다.
 * 창이 없는 곳(지도의 거점 같은 것)은 알리지 않는다: 요소가 없는 id는 건너뛰고 한 번만 경고한다
 */
export function addPlace(id: string, at: readonly { x: number; z: number }[]): void { PLACES.push({ id, at }); }

export function initNear(): void {
  const col = $('rightcol');
  onSlow(() => {
    const me = S.me;
    let best = '', bd = Infinity;
    if (me) {
      for (const p of PLACES) {
        const el = $(p.id) as HTMLElement | null;
        if (!el) { if (!warned.has(p.id)) { warned.add(p.id); console.warn(`[near] addPlace('${p.id}'): 그런 id의 창이 화면에 없습니다`); } continue; }
        if (el.hidden) continue;
        for (const a of p.at) { const d = Math.hypot(me.x - a.x, me.z - a.z); if (d < bd) { bd = d; best = p.id; } }
      }
    }
    if (col.dataset.near !== best) col.dataset.near = best;
  });
}
