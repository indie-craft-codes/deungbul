// 메뉴의 순위 탭: 전투력 순위. 열어 둔 동안 내 레벨이나 전투력이 바뀌면 다시 받는다 (5초에 한 번을 넘지 않는다).
import { L, t } from '../../i18n';
import { send } from '../../net';
import { S } from '../../state';
import { el, row, ui } from './parts';

export function drawRank(): void {
  const loc = L(), r = S.rank;
  if (!r.list.length) { ui.list.append(el('note', t('rankEmpty'))); return; }
  r.list.forEach((x, i) => ui.list.append(row(`${i + 1}. ${x.name}`, loc.fmt.level(x.lv, loc.classes[x.cls as keyof typeof loc.classes]?.name ?? ''), [el('num', loc.fmt.power(x.power))], i === r.me ? 'mine' : '')));
}

/** 순위를 마지막으로 달라고 한 시각과 그때의 내 레벨·전투력 */
let rankAt = -1e9, rankSig = '';
const mySig = (): string => `${S.me?.lv}:${S.meta.power}`;
export function askRank(): void { rankAt = performance.now(); rankSig = mySig(); send({ t: 'rank' }); }
/** 순위 탭을 열어 둔 동안 느린 주기마다 (menu.ts가 부른다) */
export function rankTick(now: number): void { if (mySig() !== rankSig && now - rankAt >= 5000) askRank(); }
