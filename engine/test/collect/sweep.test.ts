// 소탕 (STAGE_RULES.sweep, DungeonDef.sweep: engine/server/game/systems/stages.ts, dungeon.ts, sweep.ts):
//   깬 단계를 소탕권으로 n번 → 보통 보상(처음 깬 보상이 아니다)이 n번 지갑으로 바로, 소탕권이 n개 줄고, 장부의 원인은 값 cmd:stage:sweep·보상 sweep.
//   깨지 않은 단계, 소탕할 수 없는 단계(sweep: false), 이상한 횟수, 모자란 소탕권은 아무것도 바꾸지 않는다. 진행 중인 단계는 그대로.
//   열쇠 던전: 끝낸 적이 있어야 하고, 열쇠 n개를 쓰고, 보상은 우편이 아니라 바로. 끝낸 적은 저장의 넷째 칸(1)으로 남는다. 재화로 치르는 값도 된다.
import { CHAPTERS, DUNGEONS, STAGES, type SweepGot } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { check } from '../harness';

const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
const quiet = (now?: () => number) => new Game({ now, plugins: [] });
const sweepMsgs = (g: Game, p: Ent) => g.out.filter((o) => o.id === p.id && o.msg.t === 'sweep').map((o) => (o.msg as { got: SweepGot }).got);
const rowsOf = (g: Game, cur: string, why: string, dir: '+' | '-') => g.ledger.rows().filter((r) => r.cur === cur && r.why === why && r.dir === dir).reduce((s, r) => s + r.amount, 0);

// ---------- 단계 소탕: 소탕권과 보상의 셈 ----------
{
  const g = quiet();
  const p = g.players.spawn('소탕', false, null, 'sw-1');
  g.stages.leave(p, false);
  p.stage = { cur: '1-4', best: '1-3', auto: true };
  g.bag.putItem(p, 'sweepticket', 5, '');
  const rw = STAGES[1].def.reward, gold0 = p.gold, sparks0 = p.sparks;
  let fired = '';
  g.on('swept', (_q, kind, id, n) => { fired = `${kind}:${id}:${n}`; });
  g.command(p, { t: 'stage', a: 'sweep', id: '1-2', n: 3 });
  const got = sweepMsgs(g, p)[0];
  check(p.items.sweepticket === 2, `소탕 3번에 소탕권 3개 (남은 ${p.items.sweepticket})`);
  check(p.gold - gold0 === 3 * rw.gold! && p.sparks - sparks0 === 3 * rw.sparks! && !!got && got.cur.gold === 3 * rw.gold! && got.cur.sparks === 3 * rw.sparks! && got.cur.exp === 3 * rw.exp!,
    `보통 보상 × 3 (골드 +${p.gold - gold0} = 3 × ${rw.gold}, 보석 +${p.sparks - sparks0}: 처음 깬 보상 ${STAGES[1].def.first?.sparks}은 없다)`);
  check(got.k === 'stage' && got.id === '1-2' && got.n === 3 && said(g, p, 'swept') && fired === 'stage:1-2:3', '결과 메시지 sweep, 안내문 swept, 사건 swept');
  check(p.stage.best === '1-3' && p.stage.cur === '1-4' && p.mail.length === 0, '가장 멀리 깬 단계와 지금 단계는 그대로, 우편도 없다 (바로 받는다)');
  check(rowsOf(g, 'item:sweepticket', 'cmd:stage:sweep', '-') === 3 && rowsOf(g, 'gold', 'sweep', '+') === 3 * rw.gold! && rowsOf(g, 'sparks', 'sweep', '+') === 3 * rw.sparks!,
    '장부: 소탕권은 cmd:stage:sweep으로 나가고, 보상은 원인 sweep으로 들어온다');
  // 안 되는 것: 깨지 않은 단계, 소탕할 수 없는 단계, 이상한 횟수, 모자란 소탕권
  const before = JSON.stringify([p.gold, p.sparks, p.exp, p.items]);
  g.notices = []; g.out = [];
  g.command(p, { t: 'stage', a: 'sweep', id: '1-4', n: 1 });
  check(said(g, p, 'sweepLocked') && JSON.stringify([p.gold, p.sparks, p.exp, p.items]) === before, '깨지 않은 단계(1-4)는 소탕할 수 없다 (sweepLocked, 아무것도 바뀌지 않는다)');
  for (const n of [0, 11, 1.5, '2', -1, null]) g.command(p, { t: 'stage', a: 'sweep', id: '1-1', n });
  g.command(p, { t: 'stage', a: 'sweep', id: 'nope', n: 1 });
  check(sweepMsgs(g, p).length === 0 && JSON.stringify([p.gold, p.sparks, p.exp, p.items]) === before, '1~10이 아닌 횟수, 수가 아닌 값, 없는 단계는 받지 않는다');
  g.notices = [];
  g.command(p, { t: 'stage', a: 'sweep', id: '1-1', n: 3 });
  const short = g.notices.find((x) => x.k === 'itemShort');
  check(!!short && short.a.join() === 'sweepticket,3,2' && JSON.stringify([p.gold, p.sparks, p.exp, p.items]) === before, `소탕권이 모자라면(3번에 3개, 가진 2) itemShort, 아무것도 바뀌지 않는다 (${short?.a.join()})`);
  // 소탕할 수 없는 단계 (2-5: sweep false)
  p.stage = { cur: '2-5', best: '2-5', auto: true };
  g.notices = [];
  g.command(p, { t: 'stage', a: 'sweep', id: '2-5', n: 1 });
  check(CHAPTERS[1].stages[4].sweep === false && said(g, p, 'sweepLocked') && p.items.sweepticket === 2, '내용에서 sweep: false인 단계(2-5)는 깼어도 소탕할 수 없다');
  g.command(p, { t: 'stage', a: 'sweep', id: '2-4', n: 2 });
  check(p.items.sweepticket === 0 && sweepMsgs(g, p).length === 1, '깬 단계(2-4)는 남은 소탕권 둘로 두 번');
}

// ---------- 단계 소탕: 진행 중인 단계는 그대로 ----------
{
  const g = new Game({ plugins: [] });
  const p = g.players.spawn('진행 중', false, { name: '진행 중', v: 1, ext: { stages: { cur: '1-3', best: '1-2', auto: true } } } as never, 'sw-2');
  check(g.stages.inStage(p), '접속하면 1-3이 시작된다 (enterOnJoin)');
  const run = () => (g.personal.find((x) => x.name === 'stage')!.state(p) as { run: { id: string; wave: number; foes: number } | null }).run;
  const r0 = JSON.stringify(run());
  g.bag.putItem(p, 'sweepticket', 1, '');
  g.command(p, { t: 'stage', a: 'sweep', id: '1-1', n: 1 });
  check(sweepMsgs(g, p).length === 1 && JSON.stringify(run()) === r0 && g.stages.inStage(p) && p.stage.cur === '1-3', '단계 안에서 다른 단계를 소탕해도 진행 중인 회차와 지금 단계는 그대로');
}

// ---------- 열쇠 던전의 소탕 ----------
{
  const T = new Date(2026, 10, 20, 10, 0, 0).getTime();
  const g = quiet(() => T);
  const p = g.players.spawn('금광 소탕', false, null, 'sw-3');
  g.stages.leave(p, false);
  g.notices = [];
  g.command(p, { t: 'dungeonSweep', id: 'goldmine', n: 1 });
  check(said(g, p, 'sweepLocked') && g.dungeon.keyCount(p, 'goldmine') === 2 && !g.dungeon.won(p, 'goldmine'), '끝낸 적이 없는 던전은 소탕할 수 없다 (열쇠도 그대로)');
  // 한 번 끝낸다 (열쇠 하나)
  p.x = 27; p.z = -25;
  g.command(p, { t: 'dungeon', id: 'goldmine' });
  for (const e of [...g.ents.values()]) if (e.kind === 'm' && e.layer === p.layer) g.combat.damage(p, e, e.hp + 1, false);
  check(g.dungeon.won(p, 'goldmine') && g.dungeon.keyCount(p, 'goldmine') === 1, '끝내면 끝낸 적이 남는다 (열쇠 하나를 썼다)');
  g.dungeon.leave(p, false);
  g.dungeon.giveKeys(p, 'goldmine', 4);
  const mail0 = p.mail.length, gold0 = p.gold;
  g.out = [];
  g.command(p, { t: 'dungeonSweep', id: 'goldmine', n: 3 });
  const got = sweepMsgs(g, p)[0];
  const rw = DUNGEONS.goldmine.reward;
  check(g.dungeon.keyCount(p, 'goldmine') === 2 && p.gold - gold0 === 3 * rw.gold && p.mail.length === mail0 && got?.k === 'dungeon' && got.cur.gold === 3 * rw.gold && got.equip === 0,
    `소탕 3번: 열쇠 3개, 보상(골드 ${rw.gold}) × 3을 우편이 아니라 바로, 장비 없음(gear: false) (골드 +${p.gold - gold0})`);
  check(rowsOf(g, 'gold', 'sweep', '+') === 3 * rw.gold, '장부: 던전 소탕의 보상도 원인 sweep');
  g.notices = [];
  g.command(p, { t: 'dungeonSweep', id: 'goldmine', n: 3 });
  check(said(g, p, 'dungeonNoKeys') && g.dungeon.keyCount(p, 'goldmine') === 2, '열쇠가 모자라면(3번에 2개) 소탕하지 않는다');
  g.command(p, { t: 'dungeonSweep', id: 'goldmine', n: 6 }); g.command(p, { t: 'dungeonSweep', id: 'nope', n: 1 });
  check(g.dungeon.keyCount(p, 'goldmine') === 2, '한 번의 상한(5)을 넘는 횟수와 없는 던전은 받지 않는다');
  // 재화로 치르는 값 (내용을 바꿔 본다)
  const def = DUNGEONS.goldmine as { sweep?: unknown };
  const was = def.sweep;
  def.sweep = { max: 5, cost: { cur: 'sparks', n: 30 } };
  g.wallet.add(p, 'sparks', 100, '');
  const sp0 = p.sparks;
  g.command(p, { t: 'dungeonSweep', id: 'goldmine', n: 2 });
  check(p.sparks === sp0 - 60 && g.dungeon.keyCount(p, 'goldmine') === 0 && rowsOf(g, 'sparks', 'cmd:dungeonSweep', '-') === 60, '값이 있으면 열쇠와 함께 그 재화도 (보석 30 × 2, 장부 cmd:dungeonSweep)');
  def.sweep = was;
  // 저장: 끝낸 적은 넷째 칸
  const save = g.players.export(p);
  const keys = (save.ext?.keys as Record<string, unknown[]>).goldmine;
  check(keys.length === 4 && keys[3] === 1, `열쇠의 저장에 끝낸 적(넷째 칸 1) (${JSON.stringify(keys)})`);
  const h = quiet(() => T), q = h.players.spawn('금광 소탕', false, structuredClone(save), 'sw-3');
  check(h.dungeon.won(q, 'goldmine'), '다시 읽어도 끝낸 적이 남는다');
  const me = h.personal.find((x) => x.name === 'keys')!.state(q) as Record<string, { won?: boolean }>;
  check(me.goldmine.won === true, '개인 상태 keys에 끝낸 적(won)이 있다 (화면이 소탕 단추를 연다)');
}
