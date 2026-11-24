// 제작 (서버 없이 게임 규칙만 돌린다)
import { SMITHY, RECIPES } from '@game/shared/defs';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const g = new Game();
  const p = g.players.spawn('smith', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.gold = 500; p.items = { iron: 8, hide: 5 };
  // 대장간의 잠금은 게임의 규칙(g.rules.unlocked)이 답한다 (이 게임에서는 대장장이의 귀환: test/deungbul/craft.test.ts). 여기서는 시험용 규칙으로 본다 (열쇠는 FORGES의 needs: bram)
  const opened = new Set<string>();
  g.rules.unlocked = (key) => opened.has(key);
  p.x = SMITHY.x + 1; p.z = SMITHY.z + 1;
  cmd({ t: 'craft', id: 'sword4' });
  check(said().includes('forgeClosed') && p.weapon === 'sword1', '대장장이가 돌아오기 전에는 만들 수 없다');
  opened.add('bram');
  cmd({ t: 'craft', id: 'sword4' });
  check(said().includes('noMats') && p.gold === 500, '재료가 하나라도 모자라면 만들 수 없고 골드도 그대로다');

  // 잿빛 핵은 필드 보스가 준다
  const troll = [...g.ents.values()].find((e) => e.type === 'ash_troll')!;
  const home = { x: p.x, z: p.z };
  p.x = troll.x + 2; p.z = troll.z;
  g.notices = [];
  g.combat.damage(p, troll, 99999, false);
  check(p.items.ashcore === 1 && g.notices.some((n) => n.k === 'loot' && n.a[0] === 'ashcore'), '잿빛 트롤을 쓰러뜨리면 잿빛 핵을 얻는다');
  p.x = 40; p.z = 40;
  cmd({ t: 'craft', id: 'sword4' });
  check(said().includes('forgeFar'), '대장간에서 멀면 만들 수 없다');
  p.x = home.x; p.z = home.z;
  const gold = p.gold, recipe = RECIPES.find((r) => r.id === 'sword4')!;
  g.gears = [];
  cmd({ t: 'craft', id: 'sword4' });
  check(p.weapon === 'sword4' && p.items.iron === 0 && p.items.hide === 0 && p.items.ashcore === 0 && p.gold === gold - recipe.gold && said().includes('crafted') && g.gears.some((x) => x.id === p.id && x.weapon === 'sword4'),
    '재료와 골드를 내고 잿불검을 만들어 든다');
  p.items.iron = 4; p.items.hide = 2;
  cmd({ t: 'craft', id: 'sword3' });
  check(said().includes('alreadyBest') && p.items.iron === 4, '더 좋은 무기를 들고 있으면 낮은 무기는 만들지 않는다');
  cmd({ t: 'craft', id: 'potion' }); cmd({ t: 'craft', id: 7 });
  check(said().length === 0, '제작법이 없는 것은 무시된다');
  cmd({ t: 'buy', id: 'sword4' });
  check(p.weapon === 'sword4' && !said().includes('bought'), '제작으로만 얻는 무기는 상점에서 살 수 없다');
  const again = g.players.spawn('smith', false, g.players.export(p));
  check(again.weapon === 'sword4' && again.items.iron === 4 && again.items.hide === 2, '만든 무기와 남은 재료가 저장된다');
}
