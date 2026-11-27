// 메뉴의 성장 탭: 능력치 점수 나누기와 초기화, 기술 단계 올리기.
import { BUILD, BUILD_STAT_IDS, buildStatDef, classOf } from '../../../shared/defs';
import { L, t } from '../../i18n';
import { send } from '../../net';
import { S } from '../../state';
import { button, el, row, ui } from './parts';

export function drawBuild(): void {
  const loc = L(), me = S.me, b = S.meta.build;
  if (!me) return;
  // 능력치: 남은 점수를 나눠 찍는다
  ui.list.append(el('baghead', loc.fmt.statLeft(b.left, BUILD.pointsPerLevel)));
  for (const k of BUILD_STAT_IDS) {
    const n = b.stats[k] ?? 0;
    ui.list.append(row(`${loc.build.stats[k].name} ${n}`, loc.build.stats[k].info(Math.round(n * buildStatDef(k).per * 10) / 10), [button('+1', () => send({ t: 'stat', k }), b.left < 1, t('whyNoPoints')), ...(b.left > 1 ? [button(b.left > 5 ? '+5' : `+${b.left}`, () => send({ t: 'stat', k, n: 5 }), false)] : [])]));
  }
  const spent = BUILD_STAT_IDS.reduce((s, k) => s + (b.stats[k] ?? 0), 0), cost = BUILD.resetGold(me.lv);
  ui.list.append(button(loc.fmt.statResetFor(cost), () => send({ t: 'statReset' }), spent === 0 || me.gold < cost, spent === 0 ? '' : loc.fmt.short(cost - me.gold)));
  // 기술: 골드로 단계를 올린다
  ui.list.append(el('baghead', t('skillUpHead')));
  for (const id of classOf(me.cls).skills) {
    const lv = b.skillLv[id] ?? 1, max = lv >= BUILD.skillMax, need = BUILD.skillNeedLv(lv), gold = BUILD.skillGold(lv);
    const note = max ? loc.fmt.skillBonus(Math.round((lv - 1) * BUILD.skillPerLevel * 100)) : `${loc.fmt.skillBonus(Math.round((lv - 1) * BUILD.skillPerLevel * 100))} · ${me.lv < need ? loc.fmt.skillNeed(need) : loc.fmt.gold(gold)}`;
    ui.list.append(row(`${loc.skills[id].name} ${loc.fmt.skillLv(lv, BUILD.skillMax)}`, note, [button(max ? t('enhanceMaxed') : t('skillUpBtn'), () => send({ t: 'skillUp', id }), max || me.lv < need || me.gold < gold, max ? '' : me.lv < need ? loc.fmt.unlockLv(need) : loc.fmt.short(gold - me.gold))]));
  }
}
