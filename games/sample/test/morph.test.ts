// 예제의 캐릭터 정의와 변신: 손으로 쓴 정의 넷이 이 게임의 규칙(CHAR_RULES)을 통과하고, 들어온 사람이 모두 갖고, 변신하면 남의 화면에도 겉모습이 가고,
// 이 게임이 정한 세기(MORPH_RULES: 3분, 다시 15초, 보정 상한)대로 돈다. 실제 서버와 접속 둘로 본다.
import { MORPH_RULES } from '../shared/content';
import { installSample } from '../server/sample';
import { SAMPLE_CHARS } from '../server/chars';
import { Game, MemoryStore, startServer } from '@engine/server';
import { charWeight, decodeLook, lookParts, validateCharDef, type CharDef, type MorphMe } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared';
import { check, connect, until, type Peer } from '@engine/testing';

/** 스냅샷에서 시야에 들어온 사람의 겉모습 글자(EnterInfo.l)를 모은다 (Peer는 스냅샷을 onMsg로 넘기지 않는다: 소켓에 직접 귀를 단다) */
const watchEnters = (p: Peer): Map<number, string | undefined> => {
  const out = new Map<number, string | undefined>();
  p.ws.on('message', (data) => { const m = JSON.parse(data.toString()) as ServerMsg; if (m.t === 'snap') for (const e of m.enter ?? []) out.set(e.id, e.l); });
  return out;
};

// ---------- 정의와 규칙 (서버 없이) ----------
{
  const all = SAMPLE_CHARS.map((raw) => validateCharDef(raw));
  check(all.every((r) => r.ok), `손으로 쓴 정의 넷이 이 게임의 규칙을 통과한다 (${all.map((r) => (r.ok ? `${r.def.id} ${charWeight(r.def.stats)}` : r.issues.map((x) => x.code).join('/'))).join(', ')})`);
  const parts = new Set(all.flatMap((r) => (r.ok ? Object.values(r.def.look.parts) : [])));
  check(parts.size >= 18 && lookParts('hat').includes('antlers') && !lookParts('back').includes('wings'), `부품이 서로 다르다 (${parts.size}가지), 이 게임은 모자에 antlers를 더하고 등 장식의 wings를 뺐다`);
  const wings = validateCharDef({ ...(SAMPLE_CHARS[0] as object), id: 'winged', look: { parts: { back: 'wings' }, colors: {} } });
  check(!wings.ok && wings.issues[0].code === 'part', '뺀 부품(wings)을 쓴 정의는 거절된다');
  const cheat = validateCharDef({ ...(SAMPLE_CHARS[0] as object), id: 'cheater', stats: { atk: 20, hp: 220 } });
  check(!cheat.ok && cheat.issues[0].code === 'budget', '이 게임이 적은 예산(일반 160)을 넘으면 거절된다');
  const name = validateCharDef({ ...(SAMPLE_CHARS[0] as object), id: 'badname', name: '진짜 운영자' });
  check(!name.ok && name.issues[0].code === 'banned', '이 게임의 금칙어(운영자)를 쓴 이름은 거절된다');

  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installSample], now: () => clock });
  const p = g.players.spawn('변신객', false, null, 'sm-1');
  g.fire('playerJoined', p);
  check(g.chars.list().length === 4 && p.morph.own.length === 4, '서버가 켜질 때 정의 넷을 더하고, 들어온 사람에게 모두 준다');
  const base = g.mods.product('damage', p), baseGuard = g.mods.product('guard', p);
  g.morph.on(p, 'stagkeeper');
  const dmg = g.mods.product('damage', p) / base, guard = g.mods.product('guard', p) / baseGuard;
  check(Math.abs(dmg - 1.08) < 1e-9 && Math.abs(guard - (1 - 0.0575)) < 1e-9, `이 게임의 보정: 공격 30 → 주는 피해 +10%가 상한 8%로, 체력 230 → 받는 피해 −5.75% (${dmg.toFixed(4)}, ${guard.toFixed(4)})`);
  for (let i = 0; i < 20 * 181; i++) g.tick(0.05);
  check(p.morph.on === '' && !p.look && g.notices.some((n) => n.id === p.id && n.k === 'morphEnd'), '3분(MORPH_RULES.durationS)이 지나면 저절로 풀린다');
  check(MORPH_RULES.cooldownS === 15 && !g.morph.on(p, 'mossguard'), '풀린 뒤 15초 동안은 다시 변신하지 못한다');
  clock += 1;
}

// ---------- 실제 서버: 남의 화면에도 ----------
{
  const store = new MemoryStore();
  const server = await startServer(0, { store, game: { plugins: [installSample] } });
  try {
    const seen = { a: { chars: [] as CharDef[], morph: null as MorphMe | null }, b: { looks: [] as { id: number; l: string }[] } };
    const a = await connect(server.port, '여우', 'token-sample-morph-0001', (m: ServerMsg) => {
      if (m.t === 'me' && m.k === 'chars') seen.a.chars = m.s as CharDef[];
      if (m.t === 'me' && m.k === 'morph') seen.a.morph = m.s as MorphMe;
    });
    const b = await connect(server.port, '구경꾼', 'token-sample-morph-0002', (m: ServerMsg) => { if (m.t === 'look') seen.b.looks.push({ id: m.id, l: m.l }); });
    const bEnters = watchEnters(b);
    await until(() => seen.a.chars.length === 4 && seen.a.morph?.own.length === 4 && bEnters.has(a.id));
    check(seen.a.chars.length === 4 && seen.a.morph?.own.length === 4 && bEnters.has(a.id) && bEnters.get(a.id) === undefined, '접속하면 정의 넷(개인 상태 chars)과 가진 것(morph)이 오고, 변신하지 않은 사람은 예전 모습으로 보인다');
    a.send({ t: 'morph', a: 'on', id: 'emberfox' });
    await until(() => seen.b.looks.some((x) => x.id === a.id) && seen.a.morph?.on === 'emberfox');
    const got = seen.b.looks.find((x) => x.id === a.id);
    check(!!got && decodeLook(got.l)?.parts.hat === 'pointed' && seen.a.morph?.on === 'emberfox' && (seen.a.morph?.left ?? 0) > 170,
      `변신하면 남(구경꾼)에게 그 겉모습이 간다 ('${got?.l}'), 나에게는 남은 시간(${seen.a.morph?.left}초)`);
    // 나중에 들어온 사람은 시야에 들어올 때 겉모습을 받는다
    const c = await connect(server.port, '늦은 이', 'token-sample-morph-0003');
    const enters = watchEnters(c);
    await until(() => enters.has(a.id));
    check(enters.get(a.id) === got?.l, '나중에 들어온 사람에게는 EnterInfo.l로 같은 겉모습이 간다');
    a.send({ t: 'morph', a: 'off' });
    await until(() => seen.b.looks.filter((x) => x.id === a.id).length === 2);
    check(seen.b.looks.at(-1)?.l === '' && seen.a.morph?.on === '' && (seen.a.morph?.cd ?? 0) >= 14, '풀면 남에게 빈 겉모습(예전 모습)이 가고, 나에게는 재사용 대기가 온다');
    for (const p of [a, b, c]) p.ws.close();
  } finally { await server.close(); }
}
