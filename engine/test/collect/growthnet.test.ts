// 영웅의 성장을 실제 서버와 접속으로: 영웅 장비를 받아 끼고 강화하면 개인 상태(hgear, squad의 전투력)가 돌아오고, 기술 레벨이 오르고,
// 진형을 바꾸면 squad의 back이, 시너지가 syn으로 온다. 틀린 명령은 받지 않는다. 다시 접속하면 장비·기술 레벨·뒷줄이 이어진다.
// 화면의 셈(squadPowerOf)이 줄 위로 받은 것만으로 서버의 전투력과 같은지도 본다.
import type { HeroesMe, HeroGearMe, SquadMe } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { squadPowerOf } from '../../client/hud/herogrowcalc';
import { piecesOf } from '../../shared/defs';
import { check, connect, settle, until, type Peer } from '../harness';
import { heath } from './server/heath';

interface Seen { heroes?: HeroesMe; squad?: SquadMe; hgear?: HeroGearMe }
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t !== 'me') return;
  if (m.k === 'heroes') s.heroes = m.s as HeroesMe;
  else if (m.k === 'squad') s.squad = m.s as SquadMe;
  else if (m.k === 'hgear') s.hgear = m.s as HeroGearMe;
};

const store = new MemoryStore();
const server = await startServer(0, { store, game: { plugins: [heath] } });
const g = server.game;
try {
  const sa: Seen = {};
  const a: Peer = await connect(server.port, 'Gia', 'growth-net-token-a-0001', listen(sa));
  await until(() => !!sa.heroes && !!sa.squad && !!sa.hgear);
  check(sa.hgear?.items.length === 0 && sa.hgear.cap === 60 && Array.isArray(sa.squad?.back) && Array.isArray(sa.squad?.syn) && (sa.heroes?.ironwall?.length ?? 0) === 5,
    '접속하면 개인 상태 hgear(빈 장비, 60칸), squad의 back·syn, heroes의 [.., 기술 레벨, 각성]이 온다');
  const e = g.ents.get(a.id)!;
  g.stages.leave(e, false);
  // 장비를 받아 끼고 강화한다 (재료는 서버에서 준다)
  g.herogear.give(e, 'vgplate'); g.herogear.give(e, 'vgblade');
  g.wallet.add(e, 'gold', 50000, ''); g.bag.putItem(e, 'gearstone', 30, ''); g.bag.putItem(e, 'skillbook', 10, '');
  await until(() => sa.hgear?.items.length === 2);
  const p0 = sa.squad!.power;
  a.send({ t: 'hgear', a: 'equip', uid: 1, hero: 'ironwall' });
  a.send({ t: 'hgear', a: 'equip', uid: 2, hero: 'ironwall' });
  await until(() => sa.hgear?.items.every((x) => x[3] === 'ironwall') === true && (sa.squad?.power ?? 0) > p0);
  check(sa.hgear!.items.every((x) => x[3] === 'ironwall') && sa.squad!.power > p0, `끼면 hgear의 낀 영웅과 편성 전투력이 돌아온다 (${p0} → ${sa.squad!.power})`);
  const p1 = sa.squad!.power;
  a.send({ t: 'hgear', a: 'enhance', uid: 1 });
  await until(() => sa.hgear?.items[0][2] === 1 && (sa.squad?.power ?? 0) > p1);
  check(sa.hgear!.items[0][2] === 1 && sa.squad!.power > p1 && a.sys.some((x) => x.startsWith('hgEnhance')), `강화하면 +1과 더 큰 전투력, 안내문 hgEnhance (${sa.squad!.power})`);
  a.send({ t: 'hero', a: 'skill', id: 'ironwall' });
  await until(() => sa.heroes?.ironwall[3] === 2);
  check(sa.heroes?.ironwall[3] === 2, '기술 레벨이 오르면 개인 상태 heroes의 넷째 칸이 2');
  // 진형: 둘뿐이면 모두 앞줄. 하나를 뒤로
  check(sa.squad?.back?.length === 0, '영웅 둘은 모두 앞줄');
  a.send({ t: 'squad', ids: sa.squad!.ids, back: ['swiftarrow'] });
  await until(() => sa.squad?.back?.join() === 'swiftarrow');
  check(sa.squad?.back?.join() === 'swiftarrow' && sa.squad.syn?.some((s) => s.tag === 'grove' && s.tier === 0) === true, '편성 명령의 back으로 뒷줄이 바뀌고, 숲 둘의 시너지가 syn으로 온다');
  // 화면의 셈 = 서버
  check(squadPowerOf(sa.heroes!, sa.squad!.ids, sa.squad!.back ?? [], piecesOf(sa.hgear)) === sa.squad!.power && sa.squad!.power === g.squad.power(e),
    `줄 위로 받은 것만으로 셈한 편성 전투력이 서버와 같다 (${sa.squad!.power})`);
  // 틀린 명령
  const before = JSON.stringify([sa.hgear, sa.squad, sa.heroes]);
  a.send({ t: 'hgear', a: 'equip', uid: 1, hero: 'nobody' }); a.send({ t: 'hgear', a: 'equip', uid: 99, hero: 'ironwall' }); a.send({ t: 'hgear', a: 'salvage', uids: [1] });
  a.send({ t: 'hgear', a: 'enhance', uid: 'x' } as never); a.send({ t: 'hero', a: 'awaken', id: 'ironwall' }); a.send({ t: 'squad', ids: ['ironwall', 'swiftarrow'], back: 'swiftarrow' } as never);
  await settle(a, 2);
  check(JSON.stringify([sa.hgear, sa.squad, sa.heroes]) === before && a.sys.some((x) => x.startsWith('heroAwakenStars')), '없는 영웅·장비, 낀 장비의 분해, 이상한 값은 받지 않고, 별이 모자란 각성은 까닭을 알린다');
  // 다시 접속하면 이어진다
  const keep = JSON.stringify([sa.hgear, sa.squad?.back, sa.heroes?.ironwall]);
  a.ws.close();
  await until(() => !g.ents.has(a.id));
  const sb: Seen = {};
  const a2 = await connect(server.port, 'Gia', 'growth-net-token-a-0001', listen(sb));
  await until(() => !!sb.heroes && !!sb.squad && !!sb.hgear);
  check(JSON.stringify([sb.hgear, sb.squad?.back, sb.heroes?.ironwall]) === keep, '다시 접속하면 영웅 장비, 뒷줄, 기술 레벨이 이어진다');
  a2.ws.close();
} finally {
  await server.close();
}
