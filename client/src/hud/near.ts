// 좁은 화면(폰 세로)에서는 등탑·상점·대장간 창이 한꺼번에 열리면 화면을 덮는다.
// 열려 있는 것들 가운데 가장 가까운 곳을 #rightcol에 적어 두면, 스타일이 그 창만 남긴다 (style.css의 data-near).
import { SHOPS, SMITHY } from '../../../shared/defs';
import { TOWERS } from '../../../shared/world';
import { $ } from '../app';
import { onSlow } from '../bus';
import { S } from '../state';

const col = $('rightcol');
const PLACES: readonly { id: string; at: readonly { x: number; z: number }[] }[] = [
  { id: 'tower', at: TOWERS },
  { id: 'shop', at: SHOPS },
  { id: 'forge', at: [SMITHY] },
];

export function initNear(): void {
  onSlow(() => {
    const me = S.me;
    let best = '', bd = Infinity;
    if (me) {
      for (const p of PLACES) {
        if ($(p.id).hidden) continue;
        for (const a of p.at) { const d = Math.hypot(me.x - a.x, me.z - a.z); if (d < bd) { bd = d; best = p.id; } }
      }
    }
    if (col.dataset.near !== best) col.dataset.near = best;
  });
}
