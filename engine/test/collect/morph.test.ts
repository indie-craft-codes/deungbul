// 변신 (morph 모듈: engine/server/game/systems/morph.ts): 가진 캐릭터 정의로 바뀌고 풀리는 것, 겉모습이 남에게 가는 것(EnterInfo.l, 메시지 look),
// 재사용 대기·전투 중 금지·지속 시간, 보정(기본은 0, 게임의 규칙이 주면 g.mods로), 저장과 다시 읽기, 정의를 빼면 풀리는 것, 고르지 않은 게임.
import { decodeLook, encodeLook, morphMods, type CharDef, type MorphMe } from '../../shared/defs';
import { MODULES } from '../../shared/defs';
import type { ModuleId } from '../../shared/modules';
import { Game } from '../../server/game/game';
import { buildFrame, snapshotFor } from '../../server/net/snapshot';
import { check } from '../harness';

const MODS: readonly ModuleId[] = [...MODULES, 'chars', 'morph'];
const def = (id: string, over: Record<string, unknown> = {}) => ({
  v: 1, id, name: id === 'emberfox' ? '잿빛 여우' : '달빛 궁수', bio: '', role: id === 'emberfox' ? 'pyro' : 'bowman', rarity: 1,
  look: { parts: { body: 'slim', head: 'round', hair: 'long', hat: id === 'emberfox' ? 'horns' : 'hood', back: 'cape' }, colors: { cloth: 0xb0402a, accent: 0xffc040 }, size: 0.95 },
  stats: { atk: 15, hp: 120 }, skills: [], ...over,
});
let T = 0;
const g = new Game({ plugins: [], modules: MODS, now: () => T });
const tick = (s: number) => { for (let i = 0; i < Math.round(s * 20); i++) { T += 50; g.tick(0.05); } };
check(g.chars.add(def('emberfox')).ok && g.chars.add(def('moonbow')).ok, '정의 둘을 더했다');
const a = g.players.spawn('변신', false, null, 'mo-1'), b = g.players.spawn('보는 이', false, null, 'mo-2');
// 몬스터가 없는 층에 둘을 둔다 (들판의 몬스터가 때리면 '싸우는 중'이 된다)
a.layer = b.layer = 777; b.x = a.x + 3; b.z = a.z;
const notes = () => g.notices.filter((n) => n.id === a.id).map((n) => n.k);
const meOf = (p = a): MorphMe => g.personal.find((x) => x.name === 'morph')!.state(p) as MorphMe;

// ---------- 소유와 변신 ----------
{
  g.notices = [];
  check(!g.morph.on(a, 'emberfox') && notes().includes('morphNone'), '가지지 않은 캐릭터로는 변신하지 못한다 (morphNone)');
  check(g.morph.grant(a, 'emberfox') && !g.morph.grant(a, 'emberfox') && !g.morph.grant(a, 'nobodyhere') && meOf().own.join() === 'emberfox', '캐릭터를 준다 (같은 것을 또는 없는 정의는 주지 않는다)');
  g.casts = [];
  const known = new Set<number>();
  const before = snapshotFor(b, known, buildFrame(g.ents.values()), [], 2);
  check(!before.json.includes('"l":'), '변신하기 전에는 시야에 들어오는 정보에 겉모습 칸이 없다 (예전 글자 그대로)');
  check(g.morph.on(a, 'emberfox') && a.morph.on === 'emberfox' && a.look === encodeLook(g.chars.get('emberfox')!.look), '변신하면 엔티티의 겉모습 글자가 그 정의의 것이 된다');
  const msg = g.casts.find((m) => m.t === 'look');
  check(!!msg && msg.t === 'look' && msg.id === a.id && decodeLook(msg.l)?.parts.hat === 'horns', `모두에게 { t: 'look' }을 보낸다 ('${msg && msg.t === 'look' ? msg.l : ''}')`);
  const fresh = snapshotFor(b, new Set<number>(), buildFrame(g.ents.values()), [], 2);
  const enter = (JSON.parse(fresh.json) as { enter?: { id: number; l?: string }[] }).enter?.find((e) => e.id === a.id);
  check(enter?.l === a.look, '나중에 시야에 들어오는 사람에게는 EnterInfo.l로 간다');
  check(JSON.stringify(g.morph.mods(a)) === JSON.stringify({ damage: 0, guard: 0, crit: 0, regen: 0 }) && g.mods.product('damage', a) === g.mods.product('damage', b),
    '기본 규칙(MORPH_RULES의 mods 없음)은 겉모습만 바뀐다: 보정 0');
  g.notices = [];
  check(g.morph.off(a, 'off') && !a.look && a.morph.on === '' && notes().includes('morphOff') && meOf().cd === 10, '풀면 겉모습이 돌아가고 재사용 대기(기본 10초)가 시작된다');
  g.notices = [];
  check(!g.morph.on(a, 'emberfox') && notes().includes('morphWait'), '재사용 대기 중에는 다시 변신하지 못한다 (morphWait)');
  tick(10.5);
  a.lastHurt = g.clock - 1;
  g.notices = [];
  check(!g.morph.on(a, 'emberfox') && notes().includes('morphFight'), '맞은 지 5초가 지나지 않았으면 변신하지 못한다 (morphFight)');
  a.lastHurt = -99;
  check(g.morph.on(a, 'emberfox'), '대기가 끝나고 싸우는 중이 아니면 다시 변신한다');
}

// ---------- 명령 (웹소켓으로 오는 것과 같은 모양) ----------
{
  g.command(a, { t: 'morph', a: 'off' });
  check(a.morph.on === '', "명령 { t: 'morph', a: 'off' }로 풀린다");
  tick(10.5);
  g.notices = [];
  g.command(a, { t: 'morph', a: 'on', id: 'emberfox' });
  check(a.morph.on === 'emberfox', `명령 { t: 'morph', a: 'on', id }로 변신한다 ${notes().join()}`);
  for (const m of [{ t: 'morph', a: 'on', id: 5 }, { t: 'morph', a: 'on' }, { t: 'morph', a: 'x' }, { t: 'morph', a: 'on', id: 'moonbow' }]) g.command(b, m);
  check(b.morph.on === '' && !b.look, '틀린 명령(id가 없거나 수, 모르는 a, 가지지 않은 것)은 아무것도 바꾸지 않는다');
}

// ---------- 저장과 다시 읽기 ----------
{
  g.morph.grant(a, 'moonbow');
  const save = g.players.export(a);
  const ext = save.ext?.morph as { own: string[]; on?: string };
  check(ext.own.join() === 'emberfox,moonbow' && ext.on === 'emberfox', `캐릭터 저장의 ext 'morph'에 가진 것과 지금의 변신이 적힌다 (${JSON.stringify(ext)})`);
  const h = new Game({ plugins: [], modules: MODS, now: () => T });
  h.importWorld(structuredClone(g.exportWorld()));
  h.casts = [];
  const q = h.players.spawn('변신', false, structuredClone(save), 'mo-1');
  check(q.morph.on === 'emberfox' && q.look === a.look && h.casts.some((m) => m.t === 'look' && m.id === q.id), '다시 읽으면 변신한 채로 돌아오고 겉모습을 다시 알린다');
  const broken = h.players.spawn('깨짐', false, { name: '깨짐', v: 1, ext: { morph: { own: ['emberfox', 5, 'BAD', 'emberfox', 'gone_one'], on: 'gone_one', cd: 'x' } } }, 'mo-3');
  check(broken.morph.own.join() === 'emberfox,gone_one' && broken.morph.on === '' && !broken.look, '깨진 값은 건너뛰고, 정의가 없는 캐릭터는 간직하되 그것으로 변신해 있지는 않는다');
}

// ---------- 정의를 빼면 풀린다 ----------
{
  g.notices = [];
  g.chars.remove('emberfox');
  check(a.morph.on === '' && !a.look && notes().includes('morphGone'), '정의를 빼면(회수) 그것으로 변신한 사람이 풀린다 (morphGone)');
  check(g.morph.take(a, 'moonbow') && !g.morph.owns(a, 'moonbow'), '캐릭터를 거둔다 (take)');
}

// ---------- 게임이 정한 세기: 지속 시간과 보정 ----------
{
  const d = def('emberfox') as unknown as CharDef;
  check(JSON.stringify(morphMods(d)) === JSON.stringify({ damage: 0, guard: 0, crit: 0, regen: 0 }), '규칙이 보정을 주지 않으면 모두 0');
  // 이 시험용 내용의 MORPH_RULES는 기본값이다: 보정과 지속 시간은 예제(games/sample)의 시험이 본다
}

// ---------- 고르지 않은 게임 ----------
{
  const off = new Game({ plugins: [] });
  check(!off.commands.has('morph') && !off.saves.some((s) => s.name === 'morph') && !off.personal.some((x) => x.name === 'morph') && !('morph' in off.players.spawn('x', false, null, '')),
    '변신을 고르지 않은 게임에는 명령·저장 칸·개인 상태·엔티티의 칸이 없다');
}
