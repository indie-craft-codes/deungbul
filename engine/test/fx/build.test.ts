// 성장 선택: 능력치 점수와 기술 강화 (서버 없이 게임 규칙만 돌린다. 시험용 내용 위에서)
import { BUILD, BUILD_STATS } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';

{
  const g = new Game();
  const p = g.players.spawn('찍는이', false);
  g.classes.apply(p, 'knight');
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };

  // 1레벨은 찍을 점수가 없다
  cmd({ t: 'stat', k: 'pow' });
  check(said().includes('statNone') && g.build.left(p) === 0, '1레벨에는 찍을 점수가 없다');

  // 레벨이 오르면 3점씩 받는다
  g.players.grant(p, p.need, 0);
  g.players.grant(p, p.need, 0);
  check(p.lv === 3 && g.build.left(p) === 2 * BUILD.pointsPerLevel, '레벨이 오를 때마다 3점씩 받는다');

  const hp0 = p.maxHp, dmg0 = g.mods.product('damage', p), crit0 = g.mods.sum('crit', p);
  cmd({ t: 'stat', k: 'pow' }); cmd({ t: 'stat', k: 'pow' });
  cmd({ t: 'stat', k: 'vit' }); cmd({ t: 'stat', k: 'vit' }); cmd({ t: 'stat', k: 'vit' });
  cmd({ t: 'stat', k: 'luck' });
  check(Math.abs(g.mods.product('damage', p) - dmg0 * 1.02) < 1e-9 && p.maxHp === hp0 + 3 * BUILD_STATS.vit.per && Math.abs(g.mods.sum('crit', p) - crit0 - BUILD_STATS.luck.per / 100) < 1e-9, '힘은 공격 피해, 체력은 최대 체력, 행운은 치명타를 올린다');
  cmd({ t: 'stat', k: 'pow' });
  check(said().includes('statNone') && g.build.left(p) === 0, '받은 점수보다 많이 찍을 수 없다');
  cmd({ t: 'stat', k: 'nope' });
  check(g.build.spent(p) === 6, '없는 능력치는 찍히지 않는다');

  // 돌려받기: 골드가 든다
  p.gold = 0;
  cmd({ t: 'statReset' });
  check(said().includes('noGold') && g.build.spent(p) === 6, '골드가 모자라면 돌려받지 못한다');
  p.gold = 1000;
  cmd({ t: 'statReset' });
  check(g.build.left(p) === 6 && p.maxHp === hp0 && p.gold === 1000 - BUILD.resetGold(p.lv), '돌려받으면 점수가 돌아오고 수치도 원래대로다');

  // 기술 강화: 레벨과 골드가 필요하고, 피해가 커진다
  cmd({ t: 'skillUp', id: 'strike' });
  check(said().includes('skillNeedLv'), `기술 강화는 레벨 ${BUILD.skillNeedLv(1)}부터다`);
  p.lv = 8; p.gold = BUILD.skillGold(1) + BUILD.skillGold(2);
  cmd({ t: 'skillUp', id: 'flare' });
  check(g.build.skillLevel(p, 'flare') === 1, '다른 직업의 기술은 강화할 수 없다');
  cmd({ t: 'skillUp', id: 'strike' });
  cmd({ t: 'skillUp', id: 'strike' });
  check(g.build.skillLevel(p, 'strike') === 3 && p.gold === 0 && Math.abs(g.build.skillScale(p, 'strike') - (1 + 2 * BUILD.skillPerLevel)) < 1e-9, '강화하면 단계가 오르고 피해 배율이 커진다');
  cmd({ t: 'skillUp', id: 'strike' });
  check(said().includes('skillNeedLv') || said().includes('noGold'), '레벨이나 골드가 모자라면 더 올리지 못한다');

  // 강화한 기술은 실제로 더 세게 들어간다
  const m = [...g.ents.values()].find((e) => e.kind === 'm' && e.type === 'mite' && !e.dead)!;
  m.maxHp = m.hp = 100000;
  p.x = m.x + 1; p.z = m.z; p.targetId = m.id;
  let sum = 0;
  for (let i = 0; i < 30; i++) { p.cds[0] = 0; const before = m.hp; g.command(p, { t: 'skill', n: 0 }); sum += before - m.hp; }
  const avg = sum / 30, base = (28 + 36) / 2 * g.mods.product('damage', p);
  check(avg > base * 1.15 && avg < base * 1.35, `3단계로 올린 첫 기술은 약 24% 더 세다 (평균 ${avg.toFixed(1)}, 기본 ${base.toFixed(1)})`);

  // 저장하고 다시 읽는다
  cmd({ t: 'stat', k: 'vit' });
  const back = new Game().players.spawn('찍는이', false, JSON.parse(JSON.stringify(g.players.export(p))));
  check(back.stats.vit === 1 && back.skillLv.strike === 3 && back.maxHp === p.maxHp, '찍은 능력치와 기술 단계가 저장되고 다시 읽힌다');
}
