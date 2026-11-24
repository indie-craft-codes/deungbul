// 제작 (서버 없이 게임 규칙만 돌린다. 시험용 내용 위에서)
import { FORGES, RECIPES } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';

{
  const g = new Game();
  const SMITHY = FORGES[0];
  const p = g.players.spawn('smith', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.gold = 500; p.items = { ore: 8, pelt: 5 };
  // 대장간의 잠금은 게임의 규칙(g.rules.unlocked)이 답한다 (등불지기에서는 대장장이의 귀환: games/deungbul/test/craft.test.ts). 여기서는 시험용 규칙으로 본다 (열쇠는 FORGES의 needs: smith)
  const opened = new Set<string>();
  g.rules.unlocked = (key) => opened.has(key);
  p.x = SMITHY.x + 1; p.z = SMITHY.z + 1;
  cmd({ t: 'craft', id: 'blade4' });
  check(said().includes('forgeClosed') && p.weapon === 'blade1', '대장간의 열쇠가 열리기 전에는 만들 수 없다');
  opened.add('smith');
  cmd({ t: 'craft', id: 'blade4' });
  check(said().includes('noMats') && p.gold === 500, '재료가 하나라도 모자라면 만들 수 없고 골드도 그대로다');

  // 핵(core)은 필드 보스가 준다
  const boss = [...g.ents.values()].find((e) => e.type === 'colossus')!;
  const home = { x: p.x, z: p.z };
  p.x = boss.x + 2; p.z = boss.z;
  g.notices = [];
  g.combat.damage(p, boss, 99999, false);
  check(p.items.core === 1 && g.notices.some((n) => n.k === 'loot' && n.a[0] === 'core'), '필드 보스를 쓰러뜨리면 핵을 얻는다');
  p.x = 40; p.z = 40;
  cmd({ t: 'craft', id: 'blade4' });
  check(said().includes('forgeFar'), '대장간에서 멀면 만들 수 없다');
  p.x = home.x; p.z = home.z;
  const gold = p.gold, recipe = RECIPES.find((r) => r.id === 'blade4')!;
  g.gears = [];
  cmd({ t: 'craft', id: 'blade4' });
  check(p.weapon === 'blade4' && p.items.ore === 0 && p.items.pelt === 0 && p.items.core === 0 && p.gold === gold - recipe.gold && said().includes('crafted') && g.gears.some((x) => x.id === p.id && x.weapon === 'blade4'),
    '재료와 골드를 내고 4단계 칼을 만들어 든다');
  p.items.ore = 4; p.items.pelt = 2;
  cmd({ t: 'craft', id: 'blade3' });
  check(said().includes('alreadyBest') && p.items.ore === 4, '더 좋은 무기를 들고 있으면 낮은 무기는 만들지 않는다');
  cmd({ t: 'craft', id: 'draught' }); cmd({ t: 'craft', id: 7 });
  check(said().length === 0, '제작법이 없는 것은 무시된다');
  cmd({ t: 'buy', id: 'blade4' });
  check(p.weapon === 'blade4' && !said().includes('bought'), '제작으로만 얻는 무기는 상점에서 살 수 없다');
  const again = g.players.spawn('smith', false, g.players.export(p));
  check(again.weapon === 'blade4' && again.items.ore === 4 && again.items.pelt === 2, '만든 무기와 남은 재료가 저장된다');
}
