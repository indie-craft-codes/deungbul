// 수집형·방치형 모듈을 실제 서버와 접속 둘로: 접속하면 처음 영웅과 단계, 뽑기의 메시지와 기록, 영웅 레벨 업, 편성 바꾸기,
// 단계 안에서 영웅이 싸워 적이 줄어드는 것, 단계에서 나오면 서로의 영웅이 보이는 것, 틀린 명령을 받지 않는 것, 다시 접속하면 이어지는 것.
import type { GachaMe, HeroesMe, PullGot, SquadMe, StageMe } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, connect, settle, until, type Peer } from '../harness';
import { heath } from './server/heath';

interface Seen { heroes?: HeroesMe; gacha?: GachaMe; squad?: SquadMe; stage?: StageMe; pulls: PullGot[][]; stages: StageMe[] }
const fresh = (): Seen => ({ pulls: [], stages: [] });
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me') {
    if (m.k === 'heroes') s.heroes = m.s as HeroesMe;
    else if (m.k === 'gacha') s.gacha = m.s as GachaMe;
    else if (m.k === 'squad') s.squad = m.s as SquadMe;
    else if (m.k === 'stage') { s.stage = m.s as StageMe; s.stages.push(s.stage); }
  } else if (m.t === 'gacha') s.pulls.push(m.got);
};

const store = new MemoryStore();
const server = await startServer(0, { store, game: { plugins: [heath] } });
const g = server.game;
try {
  const sa = fresh(), sb = fresh();
  const a: Peer = await connect(server.port, 'Ann', 'collect-net-token-a-001', listen(sa));
  const b: Peer = await connect(server.port, 'Ben', 'collect-net-token-b-001', listen(sb));
  // 스냅샷은 Peer가 읽는다 (b.seen: 시야에 든 엔티티). 그 엔티티의 종류는 서버에서 본다
  await until(() => !!sa.stage?.run && !!sb.stage?.run && !!sa.heroes && !!sa.squad);
  check(Object.keys(sa.heroes ?? {}).sort().join() === 'ironwall,swiftarrow' && sa.squad?.ids.length === 2 && sa.stage?.run?.id === '1-1' && sb.stage?.run?.id === '1-1',
    `접속하면 처음 영웅 둘이 편성되고 둘 다 1-1로 들어간다 (A ${sa.stage?.run?.id}, B ${sb.stage?.run?.id})`);
  const ea = g.ents.get(a.id)!, eb = g.ents.get(b.id)!;
  check(ea.layer !== eb.layer && ea.layer >= 1000 && eb.layer >= 1000, `단계는 사람마다의 층에서 벌어진다 (A ${ea.layer}, B ${eb.layer})`);
  // 단계 안에서 싸움이 일어나 적이 줄어든다 (영웅과 대장이 서버에서 싸운다)
  await until(() => sa.stages.some((x) => x.run && x.run.state === 'fight' && x.run.foes < x.run.total) || sa.stages.some((x) => x.run?.state === 'gap' || x.run?.state === 'clear'), 20_000);
  check(sa.stages.some((x) => x.run && ((x.run.state === 'fight' && x.run.foes < x.run.total) || x.run.state !== 'fight')), '단계 안에서 영웅과 대장이 싸워 적이 줄어든다 (개인 상태 stage의 남은 적)');
  // 뽑기 10번
  a.send({ t: 'gacha', id: 'dawn', n: 10 });
  await until(() => sa.pulls.length === 1 && (sa.gacha?.log.length ?? 0) === 10);
  check(sa.pulls[0].length === 10 && sa.gacha?.log.length === 10 && sa.pulls[0].some((x) => x.r >= 1), `10번 뽑기의 결과(메시지 gacha)와 기록(개인 상태)이 오고, 희귀 이상이 하나는 있다 (${sa.pulls[0].map((x) => x.h).join(', ')})`);
  check(Object.keys(sa.heroes ?? {}).length >= 2 && sb.pulls.length === 0, '뽑은 결과는 뽑은 사람에게만 간다');
  // 영웅 레벨 업
  const lv0 = sa.heroes?.ironwall[0] ?? 0;
  a.send({ t: 'hero', a: 'level', id: 'ironwall' });
  await until(() => (sa.heroes?.ironwall[0] ?? 0) === lv0 + 1);
  check(sa.heroes?.ironwall[0] === lv0 + 1, `영웅 레벨 업이 개인 상태로 돌아온다 (${lv0} → ${sa.heroes?.ironwall[0]})`);
  // 틀린 명령: 없는 영웅, 가지지 않은 영웅의 편성, 3번 뽑기
  const before = JSON.stringify([sa.heroes, sa.squad?.ids, sa.gacha?.log.length]);
  a.send({ t: 'hero', a: 'level', id: 'nobody' }); a.send({ t: 'squad', ids: ['nobody'] }); a.send({ t: 'gacha', id: 'dawn', n: 3 }); a.send({ t: 'stage', a: 'go', id: '2-5' });
  await settle(a, 2);
  check(JSON.stringify([sa.heroes, sa.squad?.ids, sa.gacha?.log.length]) === before && a.sys.some((x) => x.startsWith('stageLocked')), '없는 영웅, 가지지 않은 영웅의 편성, 1·10이 아닌 뽑기는 받지 않고, 잠긴 단계는 까닭을 알린다');
  // 편성 바꾸기
  const owned = Object.keys(sa.heroes ?? {});
  a.send({ t: 'squad', ids: owned.slice(0, 1) });
  await until(() => sa.squad?.ids.length === 1);
  check(sa.squad?.ids.join() === owned[0] && [...g.ents.values()].filter((e) => e.kind === 'hero' && e.data.owner === a.id).length === 1, '편성을 하나로 줄이면 싸우는 영웅도 하나');
  // 둘 다 단계에서 나오면 같은 들판에서 서로의 영웅이 보인다
  a.send({ t: 'stage', a: 'leave' }); b.send({ t: 'stage', a: 'leave' });
  await until(() => !sa.stage?.run && !sb.stage?.run);
  b.send({ t: 'move', x: ea.x + 2, z: ea.z + 2 });
  await until(() => [...b.seen.keys()].some((id) => g.ents.get(id)?.kind === 'hero' && g.ents.get(id)?.data.owner === a.id), 15_000);
  check([...b.seen.keys()].some((id) => g.ents.get(id)?.kind === 'hero' && g.ents.get(id)?.data.owner === a.id), '단계에서 나와 들판에 서면 다른 사람이 내 영웅(종류 hero)을 본다');
  // 다시 접속하면 영웅·뽑기 기록·단계가 이어진다
  const heroesBefore = JSON.stringify(sa.heroes);
  a.ws.close();
  await until(() => !g.ents.has(a.id));
  const sa2 = fresh();
  const a2 = await connect(server.port, 'Ann', 'collect-net-token-a-001', listen(sa2));
  await until(() => !!sa2.heroes && !!sa2.gacha && !!sa2.stage?.run);
  check(JSON.stringify(sa2.heroes) === heroesBefore && sa2.gacha?.log.length === 10 && sa2.stage?.run?.id === sa.stage?.cur, '다시 접속하면 영웅, 뽑기 기록, 지금 단계가 이어진다');
  a2.ws.close(); b.ws.close();
} finally {
  await server.close();
}
