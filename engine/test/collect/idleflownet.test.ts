// 단계 밖을 실제 서버와 접속으로 (정해진 서버 시계): 접속하면 단계 안 → 메뉴의 '들어가기'(dungeonGo)로 금광에 바로 들어가고(메시지 dungeon),
// 안에서는 대장에게 서버가 대상을 준다(자동 전투) → 끝내고 나오면 2초 뒤 단계로 돌아온다(개인 상태 stage의 run) → 별가루로 영웅의 조각(heroTraded, 개인 상태 heroes)
// → 나갔다가 한 시간 뒤에 들어오면 돌아왔을 때의 창(메시지 idleBack)이 오고, 그 우편 id로 받으면(mailClaim) 우편이 사라진다.
import type { HeroesMe, IdleBack, KeysMe, StageMe } from '../../shared/defs';
import type { Mail } from '../../shared/defs/growth';
import type { ServerMsg } from '../../shared/protocol';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, connect, until, type Peer } from '../harness';
import { heath } from './server/heath';

interface Seen { heroes?: HeroesMe; stage?: StageMe; keys?: KeysMe; dungeon: string; back: IdleBack[]; mail: Mail[] }
const fresh = (): Seen => ({ dungeon: '', back: [], mail: [] });
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me') {
    if (m.k === 'heroes') s.heroes = m.s as HeroesMe;
    else if (m.k === 'stage') s.stage = m.s as StageMe;
    else if (m.k === 'keys') s.keys = m.s as KeysMe;
  } else if (m.t === 'dungeon') s.dungeon = m.id;
  else if (m.t === 'idleBack') s.back.push(m);
  else if (m.t === 'meta' && m.mail) s.mail = m.mail;
};

let T = Date.UTC(2026, 10, 25, 9, 0, 0);
const server = await startServer(0, { store: new MemoryStore(), game: { plugins: [heath], now: () => T } });
const g = server.game;
try {
  const sa = fresh();
  const a: Peer = await connect(server.port, 'Runner', 'collect-idleflow-token-01', listen(sa));
  await until(() => !!sa.stage?.run && !!sa.keys && !!sa.heroes);
  const ea = g.ents.get(a.id)!;
  const keys0 = sa.keys?.goldmine?.n ?? 0;
  check(!!sa.stage?.run && keys0 > 0, `접속하면 단계 안 (${sa.stage?.run?.id}), 금광 열쇠 ${keys0}`);
  // 메뉴에서 바로 금광으로
  a.send({ t: 'dungeonGo', id: 'goldmine' });
  await until(() => sa.dungeon === 'goldmine' && !sa.stage?.run && sa.keys?.goldmine?.n === keys0 - 1);
  check(sa.dungeon === 'goldmine' && !sa.stage?.run && sa.keys?.goldmine?.n === keys0 - 1 && a.sys.includes('dungeonEnter:goldmine'), `dungeonGo: 단계에서 나와 금광 안 (메시지 dungeon, 열쇠 ${keys0} → ${sa.keys?.goldmine?.n})`);
  // 자동 전투: 손대지 않아도 서버가 대상을 준다 (스냅샷의 you[4])
  await until(() => (a.youRaw[4] ?? 0) > 0 && a.mons.has(a.youRaw[4]));
  check(a.mons.get(a.youRaw[4]) === 'coinbug' || a.mons.get(a.youRaw[4]) === 'hoarder', `금광 안에서 대장의 대상이 저절로 생긴다 (${a.mons.get(a.youRaw[4])})`);
  // 끝내고 스스로 나오면 단계로
  for (const e of [...g.ents.values()]) if (e.kind === 'm' && e.layer === ea.layer) g.combat.damage(ea, e, e.hp + 1, false);
  await until(() => a.sys.some((x) => x.startsWith('dungeonClear')));
  a.send({ t: 'dungeonLeave' });
  await until(() => sa.dungeon === '');
  await until(() => !!sa.stage?.run, 15_000);
  check(sa.dungeon === '' && !!sa.stage?.run, `나오면 2초 뒤 지금 단계로 돌아온다 (${sa.stage?.run?.id})`);
  // 재료로 영웅의 조각: 끝낸 보상(우편)의 별가루를 받고 쓴다
  a.send({ t: 'mailClaim', id: 0 });
  await until(() => (ea.items.stardust ?? 0) >= 4);
  const id = Object.keys(sa.heroes ?? {})[0], shards0 = sa.heroes?.[id]?.[2] ?? -1;
  a.send({ t: 'hero', a: 'trade', id, item: 'stardust' });
  await until(() => a.sys.some((x) => x.startsWith('heroTraded')) && (sa.heroes?.[id]?.[2] ?? -1) > shards0);
  check(a.sys.some((x) => x.startsWith(`heroTraded:${id}:5:stardust:1`)) && sa.heroes?.[id]?.[2] === shards0 + 5, `별가루 3으로 ${id}의 조각 +5 (개인 상태 ${shards0} → ${sa.heroes?.[id]?.[2]})`);
  // 나갔다가 한 시간 뒤: 돌아왔을 때의 창
  a.ws.close();
  await until(() => !g.ents.has(a.id));
  T += 60 * 60000;
  const sb = fresh();
  const b = await connect(server.port, 'Runner', 'collect-idleflow-token-01', listen(sb));
  await until(() => sb.back.length > 0 && sb.mail.some((m) => m.k === 'idle'));
  const back = sb.back[0], mail = sb.mail.find((m) => m.k === 'idle');
  check(sb.back.length === 1 && !!mail && back.mail === mail.id && back.min === 60 && (back.r.gold ?? 0) > 0 && back.r.gold === mail.r.gold, `다시 접속하면 idleBack: 우편 ${back?.mail}, 60분, 골드 ${back?.r.gold}`);
  const gold0 = g.ents.get(b.id)!.gold;
  b.send({ t: 'mailClaim', id: back.mail });
  await until(() => !sb.mail.some((m) => m.k === 'idle'));
  check(!sb.mail.some((m) => m.k === 'idle') && g.ents.get(b.id)!.gold - gold0 === back.r.gold, `창의 '받기'(그 우편 id의 mailClaim)로 받는다: 골드 +${g.ents.get(b.id)!.gold - gold0}`);
  b.ws.close();
} finally {
  await server.close();
}
