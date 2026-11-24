// 메인 퀘스트 (서버 없이 게임 규칙만 돌린다)
import { HERB_FIELD, QUESTS, SHOP } from '../shared/defs';
import { TOWER, TOWERS } from '../shared/world';
import { newGame } from './game';
import { check } from '@engine/testing';

{
  const g = newGame();
  const p = g.players.spawn('둘째장', false, { name: '둘째장', lv: 4, exp: 0, need: 148, maxHp: 245, sparks: 20, contrib: 6, quest: [1, 0, 0], gold: 40 });
  const at = (c: number, st: number, n = 0) => p.qc === c && p.qs === st && p.qn === n;
  const slay = (type: string, count: number) => {
    const list = [...g.ents.values()].filter((e) => e.type === type && !e.dead).slice(0, count);
    for (const m of list) { p.x = m.x + 1; p.z = m.z; g.combat.damage(p, m, 9999, false); }
    return list.length;
  };
  check(at(1, 0), '1장을 마친 저장으로 들어오면 2장 첫 단계다');
  p.x = SHOP.x + 1; p.z = SHOP.z;
  g.command(p, { t: 'buy', id: 'sword2' });
  check(at(1, 0) && p.gold === 40, '다른 물건을 사려 해도(골드 부족) 진행되지 않는다');
  g.command(p, { t: 'buy', id: 'potion' });
  check(at(1, 1) && p.items.potion === 1, '물약을 사면 다음 단계로 넘어간다');
  check(slay('wisp', 4) === 4 && at(1, 2), '위습 네 마리를 잡으면 다음 단계로 넘어간다');
  p.x = HERB_FIELD.x + 2; p.z = HERB_FIELD.z + 2;
  for (let i = 0; i < 12; i++) g.tick(0.05);
  check(at(1, 3), '옛 약초밭에 가면 다음 단계로 넘어간다');
  check(slay('shade_mira', 1) === 1 && at(1, 4), '미라의 그림자를 쓰러뜨리면 다음 단계로 넘어간다');
  p.x = TOWER.x + 2; p.z = TOWER.z + 2;
  g.notices = [];
  g.command(p, { t: 'offer', to: 'tower', n: 8 });
  check(at(2, 0) && g.notices.some((n) => n.k === 'questDone' && n.a[0] === 'mira'), '2장을 마치면 3장이 시작된다');

  // 3장: 잿빛 숲으로 이끈다
  const ashTower = TOWERS[1];
  p.x = ashTower.spawn.x; p.z = ashTower.spawn.z;
  for (let i = 0; i < 12; i++) g.tick(0.05);
  check(at(2, 1), '잿빛 숲 등탑에 닿으면 다음 단계로 넘어간다');
  p.sparks = 30; p.x = TOWER.x + 2; p.z = TOWER.z + 2;
  g.command(p, { t: 'offer', to: 'tower', n: 5 });
  check(at(2, 1), '마을 등탑에 바친 불씨는 이 단계에서 세지 않는다');
  p.x = ashTower.x + 2; p.z = ashTower.z + 2;
  g.command(p, { t: 'offer', to: 'tower', n: 5 });
  check(at(2, 2) && g.tower.glows[1] === 5, '잿빛 숲 등탑에 바치면 다음 단계로 넘어간다');
  check(slay('boar', 3) === 3 && at(2, 3) && slay('goblin', 4) === 4 && at(2, 4), '멧돼지와 고블린을 잡으면 마지막 단계다');
  g.notices = [];
  check(slay('ash_troll', 1) === 1 && at(3, 0) && g.notices.some((n) => n.k === 'questDone' && n.a[0] === 'ashwood'), '잿빛 트롤을 쓰러뜨리면 3장이 끝나고 4장이 시작된다');

  // 4장: 등탑지기 할멈의 이야기. 마지막은 습격을 함께 막는 것이다
  p.sparks = 30; p.x = ashTower.x + 2; p.z = ashTower.z + 2;
  g.command(p, { t: 'offer', to: 'tower', n: 10 });
  check(at(3, 0), '잿빛 숲 등탑에 바친 불씨는 이 단계에서 세지 않는다');
  p.x = TOWER.x + 2; p.z = TOWER.z + 2;
  g.command(p, { t: 'offer', to: 'tower', n: 10 });
  check(at(3, 1) && slay('lost_soldier', 3) === 3 && at(3, 2), '마을 등탑에 바치고 잊힌 병사를 쓰러뜨리면 마지막 단계다');
  const other = g.players.spawn('구경꾼', false);
  g.fire('raidWon', [other]);
  check(at(3, 2), '내가 맞서 싸우지 않은 습격은 세지 않는다');
  g.notices = [];
  g.fire('raidWon', [p, other]);
  check(at(QUESTS.length, 0) && g.notices.some((n) => n.k === 'questDone' && n.a[0] === 'halmeom'), '습격을 막아 내면 4장이 끝난다');
  const lost = g.players.spawn('옛저장', false, { name: '옛저장', lv: 1, exp: 0, need: 60, maxHp: 200, sparks: 0, contrib: 0, quest: [9, 9, 9] });
  check(lost.qc === QUESTS.length && lost.qs === 0 && lost.qn === 0, '없는 장을 가리키는 저장은 끝난 상태로 읽는다');
}
