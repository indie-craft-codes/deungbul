// 재화 흐름 지표(경제 장부): 서버 없이 게임 규칙만 돌려, 장부에 적힌 것이 실제로 바뀐 것과 맞는지 센다. (시험용 내용 위에서)
// 가장 중요한 것은 대조 검사다: 긴 시나리오를 돌린 뒤 재화마다 "장부의 생김 − 사라짐 = 모든 캐릭터가 가진 것의 실제 변화"가 정확히 맞아야 한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CAMPS, ECON_HUNT, ECON_LEVEL_MARKS, GEAR, RARITIES, SHOPS, type MarketItem } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { median, quantile, type EconSnapshot } from '../../server/game/systems/ledger';
import { startServer } from '../../server/net/server';
import { MemoryStore, SqliteStore, type EconRow, type EconStore, type PlayerSave, type Store } from '../../server/store';
import { check } from '../harness';

const DAY = 24 * 3600000;
type MonsterType = Parameters<Game['monsters']['spawn']>[0];

/** 지금까지 얻은 경험치의 합 (레벨이 올라도 이어지게): 레벨마다 필요한 양은 60에서 시작해 1.35배씩 는다 */
function expTotal(p: Ent): number { let s = p.exp, n = 60; for (let i = 1; i < p.lv; i++) { s += n; n = Math.round(n * 1.35); } return s; }
const sum = (rows: EconRow[], cur: string, why: string | ((w: string) => boolean), dir?: '+' | '-'): number =>
  rows.filter((r) => r.cur === cur && (typeof why === 'string' ? r.why === why : why(r.why)) && (!dir || r.dir === dir)).reduce((s, r) => s + r.amount, 0);

/** 게임 하나와 그것을 다루는 손잡이들. 시계는 틱과 함께 흐른다 */
function bench(start = new Date(2026, 0, 10, 9).getTime()) {
  const t = { clock: start };
  const g = new Game({ now: () => t.clock });
  const flush = () => { g.events = []; g.notices = []; g.announces = []; g.cdAcks = []; g.itemCds = []; g.gears = []; g.partyOut = []; g.out = []; g.casts = []; };
  const run = (s: number) => { for (let i = 0, n = Math.round(s * 20); i < n; i++) { g.tick(0.05); t.clock += 50; if (i % 40 === 0) flush(); } };
  const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.targetId = 0; };
  /** 그 사람 곁에 몬스터를 하나 놓는다 */
  const mob = (p: Ent, type: MonsterType): Ent => { const m = g.monsters.spawn(type, p.x + 1, p.z); m.layer = p.layer; return m; };
  /** 그 사람이 몬스터 하나를 쓰러뜨린다 (명령도 틱도 아닌 곳에서: 처치 사건의 경계만 거친다) */
  const kill = (p: Ent, type: MonsterType) => g.combat.damage(p, mob(p, type), 1e6, false);
  const cmd = (p: Ent, m: Record<string, unknown>) => g.command(p, m);
  /** 시험의 준비로 재화를 쥐여 준다: 장부에는 'setup'으로 적힌다 */
  const setup = (p: Ent, fn: () => void) => { fn(); g.ledger.note(p, 'setup'); };
  const mine = (p: Ent): MarketItem[] => { g.out = []; cmd(p, { t: 'market', a: 'mine' }); const m = g.out.filter((o) => o.id === p.id && o.msg.t === 'market').pop()?.msg as { list: MarketItem[] } | undefined; return m?.list ?? []; };
  return { t, g, run, at, mob, kill, cmd, setup, mine, flush };
}

// ---------- 명령 안의 처치, 직접 사냥과 자리 비움 사냥, 가득 찬 가방, 날짜 ----------
{
  const { t, g, run, at, mob, kill, cmd, setup } = bench();
  const p = g.players.spawn('사냥꾼', false, null, 'key-h');
  g.classes.apply(p, 'knight');
  setup(p, () => { while (p.lv < 10) g.players.grant(p, 400, 0); });
  at(p, CAMPS[2].x, CAMPS[2].z);
  g.gear.random = () => 0.999;
  const day1 = g.ledger.today();
  const rows = () => g.ledger.rows().filter((r) => r.why !== 'setup');

  // 기술 명령 하나로 쓰러뜨린다: 처치 보상은 사냥으로 한 번만 적힌다
  const gold0 = p.gold, exp0 = expTotal(p), sparks0 = p.sparks;
  const m = mob(p, 'hound'); m.hp = 1;
  cmd(p, { t: 'attack', id: m.id }); cmd(p, { t: 'skill', n: 0 });
  const r1 = rows();
  check(m.dead && p.gold > gold0 && sum(r1, 'gold', ECON_HUNT.live, '+') === p.gold - gold0 && sum(r1, 'exp', ECON_HUNT.live, '+') === expTotal(p) - exp0 && sum(r1, 'sparks', ECON_HUNT.live, '+') === p.sparks - sparks0,
    `명령 안에서 처치가 일어나도 보상은 hunt에 한 번만 적힌다 (골드 ${p.gold - gold0}, 경험치 ${expTotal(p) - exp0})`);
  check(r1.every((r) => r.why === ECON_HUNT.live) && r1.every((r) => r.n === 1), '기술 명령(cmd:skill)의 몫으로는 아무것도 적히지 않는다');

  // 자리 비움 사냥은 다른 원인으로 적힌다
  p.auto = true; g.away.start(p);
  const gold1 = p.gold;
  kill(p, 'hound');
  check(sum(rows(), 'gold', ECON_HUNT.away, '+') === p.gold - gold1 && sum(rows(), 'gold', ECON_HUNT.live, '+') === gold1 - gold0, '서버가 대신 사냥하는 동안 번 것은 huntAway로, 접속 중에 번 것은 hunt로 적힌다');
  g.away.stop(p); p.auto = false;
  kill(p, 'hound');
  check(sum(rows(), 'gold', ECON_HUNT.live, '+') + sum(rows(), 'gold', ECON_HUNT.away, '+') === p.gold - gold0 && sum(rows(), 'gold', ECON_HUNT.live, '+') > gold1 - gold0, '돌아온 뒤에는 다시 hunt로 적힌다');

  // 가방이 가득 차 버려진 장비
  setup(p, () => { while (p.gear.length < GEAR.bagMax) g.gear.put(p, g.gear.roll(1, 0, 'ring')); });
  const had = p.gear.length;
  g.gear.random = () => 0; // 반드시 떨어지고, 등급은 가장 낮다
  kill(p, 'hound'); kill(p, 'hound');
  const cur = `gear:${RARITIES[0].id}`;
  check(p.gear.length === had && sum(rows(), cur, 'lostFull', '-') === 2 && sum(rows(), cur, ECON_HUNT.live, '+') === 2, '가방이 가득 차 버려진 장비가 세어진다 (떨어진 것 2, 버려진 것 2, 가방은 그대로)');
  check(/버려진 장비 2/.test(g.ledger.line()) && /gold \+0 -0/.test(g.ledger.line()), '지표 로그 한 줄에 구간의 합계가 찍히고, 찍은 뒤에는 구간이 새로 시작된다');

  // 날짜가 바뀌면 새 날짜의 줄에 적힌다
  t.clock = new Date(2026, 0, 11, 0, 0, 5).getTime();
  g.gear.random = () => 0.999;
  const gold2 = p.gold;
  kill(p, 'hound');
  const day2 = g.ledger.today();
  check(day1 === '2026-01-10' && day2 === '2026-01-11' && sum(g.ledger.rows(day2), 'gold', ECON_HUNT.live, '+') === p.gold - gold2 && sum(g.ledger.rows(day1), 'gold', ECON_HUNT.live, '+') === gold2 - gold0 - sum(rows(), 'gold', ECON_HUNT.away, '+'), '날짜가 바뀌면 새 날짜의 줄에 적힌다 (지난 날의 줄은 그대로)');
  t.clock += 2 * DAY; kill(p, 'hound');
  check(g.ledger.rows(day1).length === 0 && g.ledger.rows(day2).length === 0 && g.ledger.drain().some((r) => r.day === day1), '메모리의 합계는 오늘과 어제 것만 남기고, 저장할 줄은 내어 줄 때까지 남는다');

  // 원인을 가리지 못한 변화는 other(틱 밖)와 tick(틱 안)으로 드러난다
  p.gold += 777; run(0.05);
  // (틱 안에서 재화가 바뀌는 자리를 만들려고 틀의 시스템 하나의 틱에 끼워 넣는다: 어느 시스템의 틱이든 같다)
  const orig = g.party.tick.bind(g.party);
  g.party.tick = (dt) => { p.sparks += 3; orig(dt); };
  run(0.05);
  g.party.tick = orig;
  const today = g.ledger.rows(g.ledger.today());
  check(sum(today, 'gold', 'other', '+') === 777 && sum(today, 'sparks', 'tick', '+') === 3, '어느 경계에도 잡히지 않은 변화는 other(틱 밖)와 tick(틱 안)으로 드러난다: 재화 복사 버그의 경보');
  // 재료나 장비의 구성만 바뀐 것은 틱마다가 아니라 돌아가며 세므로(1초에 한 번) 조금 늦게 드러난다
  p.items.ore = (p.items.ore ?? 0) + 4; p.gear[p.gear.length - 1].rar = 3;
  run(1);
  const late = g.ledger.rows(g.ledger.today()).filter((r) => r.why === 'tick');
  check(sum(late, 'item:ore', 'tick', '+') === 4 && sum(late, 'gear:epic', 'tick', '+') === 1 && sum(late, `gear:${RARITIES[0].id}`, 'tick', '-') === 1, '명령 밖에서 재료나 장비의 등급만 바뀌어도 1초 안에 tick으로 드러난다');
  // 장부의 잘못이 게임을 멈추지 않는다
  const err = console.error; let logged = 0; console.error = () => { logged++; };
  (p as { gear: unknown }).gear = null;
  let threw = false;
  try { cmd(p, { t: 'stop' }); } catch { threw = true; }
  p.gear = []; console.error = err;
  check(!threw && logged > 0, '장부를 적다가 예외가 나도 명령은 그대로 처리되고 기록만 남는다');
}

// ---------- 저장소에 얹기: 메모리와 SQLite 파일 ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deungbul-ledger-'));
  const file = path.join(dir, 'econ.db');
  const stores: [string, () => Store & EconStore, boolean][] = [['메모리 저장소', () => new MemoryStore(), false], ['SQLite 파일', () => new SqliteStore(file), true]];
  for (const [name, open, reopens] of stores) {
    let s = open();
    const row = (day: string, cur: string, why: string, dir: '+' | '-', amount: number, n: number): EconRow => ({ day, cur, why, dir, amount, n });
    s.addEcon([row('2026-01-10', 'gold', 'hunt', '+', 100, 4), row('2026-01-10', 'gold', 'cmd:buy', '-', 30, 1), row('2026-01-09', 'exp', 'hunt', '+', 55, 2)]);
    s.addEcon([row('2026-01-10', 'gold', 'hunt', '+', 50, 2), row('2026-01-10', 'gold', 'hunt', '-', 7, 1), row('2026-01-11', 'gear:rare', 'lostFull', '-', 1, 1)]);
    s.addEcon([]);
    const find = (rows: EconRow[], day: string, cur: string, why: string, dir: string) => rows.find((r) => r.day === day && r.cur === cur && r.why === why && r.dir === dir);
    const ok = (st: Store & EconStore) => { const all = st.econ('2026-01-01'), h = find(all, '2026-01-10', 'gold', 'hunt', '+'); return all.length === 5 && h?.amount === 150 && h.n === 6 && find(all, '2026-01-10', 'gold', 'hunt', '-')?.amount === 7 && st.econ('2026-01-10').length === 4 && st.econ('2026-01-11').length === 1 && st.econ('2026-02-01').length === 0; };
    check(ok(s), `${name}: 두 번에 나눠 얹어도 같은 줄(날짜·재화·원인·방향)은 합쳐지고, 날짜로 걸러 읽힌다`);
    s.saveEconSnapshot('2026-01-10', { day: '2026-01-10', chars: 1 }); s.saveEconSnapshot('2026-01-11', { day: '2026-01-11', chars: 2 }); s.saveEconSnapshot('2026-01-11', { day: '2026-01-11', chars: 3 });
    s.savePlayer('k1', { name: '하나', lv: 3, exp: 0, need: 60, maxHp: 100, sparks: 1, gold: 5 }); s.savePlayer('k2', { name: '둘', lv: 4, exp: 0, need: 60, maxHp: 100, sparks: 2, gold: 6 });
    if (reopens) { s.close(); s = open(); } // 재시작
    const seen: PlayerSave[] = [];
    s.eachPlayer((p) => seen.push(p));
    check(ok(s) && (s.econSnapshot()?.data as { chars: number }).chars === 3 && s.econSnapshot()?.day === '2026-01-11' && (s.econSnapshot('2026-01-10')?.data as { chars: number }).chars === 1 && s.econSnapshot('2026-01-12') === null
      && seen.length === 2 && seen.map((p) => p.gold).sort().join() === '5,6', `${name}: ${reopens ? '닫았다 다시 열어도 합계가 남아 있고, ' : ''}스냅샷을 날짜로(없으면 가장 최근 것을) 읽고, 모든 캐릭터를 훑는다`);
    // 캐릭터가 많아도 빠짐없이, 한 번씩만 훑는다 (SQLite는 여러 쪽으로 나눠 읽는다)
    for (let i = 0; i < 1203; i++) s.savePlayer(`many-${i}`, { name: `n${i}`, lv: 2, exp: 0, need: 60, maxHp: 100, sparks: 0, gold: i });
    const ids = new Set<number>(); let calls = 0;
    s.eachPlayer((p) => { calls++; if (p.name.startsWith('n')) ids.add(p.gold ?? -1); });
    check(calls === 1205 && ids.size === 1203, `${name}: 캐릭터 1,205명을 빠짐없이 한 번씩 훑는다`);
    s.close();
  }
  // 지표가 없던 때의 DB 파일에 표가 그대로 붙는다
  const old = path.join(dir, 'old.db');
  { const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(old); db.exec("CREATE TABLE players (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO kv VALUES ('world', '{}');"); db.close(); }
  const s = new SqliteStore(old);
  s.addEcon([{ day: '2026-01-10', cur: 'gold', why: 'hunt', dir: '+', amount: 1, n: 1 }]);
  check(s.econ('').length === 1 && s.econSnapshot() === null && JSON.stringify(s.loadWorld()) === '{}', '지표가 없던 때의 DB 파일에도 표가 그대로 붙는다 (있던 것은 그대로)');
  s.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- 캐릭터별 기록: 플레이 시간, 레벨 도달, 오늘 번·쓴 골드 ----------
{
  const { t, g, run, at, kill, cmd } = bench();
  const p = g.players.spawn('새내기', false, null, 'key-n');
  const born = t.clock;
  g.classes.apply(p, 'knight');
  run(30);
  g.players.grant(p, 600, 0); // 레벨 5를 넘긴다
  run(10);
  p.auto = true; g.away.start(p); run(20); g.away.stop(p); p.auto = false;
  while (p.lv < 10) g.players.grant(p, 300, 0);
  run(1);
  at(p, CAMPS[0].x, CAMPS[0].z);
  g.gear.random = () => 0.999;
  for (let i = 0; i < 5; i++) kill(p, 'mite');
  const hunted = p.gold; // 처음부터 지금까지 사냥으로 번 것 (자리를 비운 동안 번 것 포함)
  at(p, SHOPS[0].x, SHOPS[0].z + 1); cmd(p, { t: 'mailClaim', id: 0 }); cmd(p, { t: 'buy', id: 'draught' });
  const earned = hunted + 30, spent = earned - p.gold; // 출석 우편의 30골드를 받고, 물약을 하나 샀다
  const st = g.ledger.statsOf(p)!;
  check(st.born === born && st.play === 41 && st.away === 20, `접속 플레이 시간과 자리 비움 사냥 시간을 따로 센다 (접속 ${st.play}초, 자리 비움 ${st.away}초)`);
  check(JSON.stringify(st.reach[5]) === '[30,0]' && JSON.stringify(st.reach[10]) === '[40,20]' && st.reach[20] === undefined, `레벨 ${ECON_LEVEL_MARKS.join('·')}에 처음 닿은 플레이 시간을 적는다 (5: ${st.reach[5]}, 10: ${st.reach[10]})`);
  check(st.d[0] === '2026-01-10' && st.d[1] === earned && st.d[2] === spent && spent > 0, `오늘 번 골드(${st.d[1]})와 쓴 골드(${st.d[2]})를 적는다`);
  // 저장하고 다시 읽는다
  const save: PlayerSave = JSON.parse(JSON.stringify(g.players.export(p)));
  g.players.leave(p.id);
  t.clock += DAY;
  const p2 = g.players.spawn('새내기', false, save, 'key-n');
  run(5);
  kill(p2, 'mite');
  const st2 = g.ledger.statsOf(p2)!;
  check(st2.born === born && st2.play === 46 && st2.away === 20 && JSON.stringify(st2.reach) === JSON.stringify(st.reach) && st2.y[0] === '2026-01-10' && st2.y[1] === earned && st2.y[2] === spent && st2.d[0] === '2026-01-11' && st2.d[1] > 0, '캐릭터별 기록이 저장되고 다시 읽혀 이어진다 (다음 날의 수입은 새 칸에, 어제 것은 남는다)');
  // 이 칸이 없는 옛 저장
  const old: PlayerSave = JSON.parse(JSON.stringify(save));
  delete old.ext!.stats;
  const p3 = g.players.spawn('옛사람', false, old, 'key-o');
  run(2);
  const st3 = g.ledger.statsOf(p3)!;
  check(p3.lv === p.lv && p3.gold === save.gold && st3.born === 0 && st3.play === 2 && Object.keys(st3.reach).length === 0, '이 칸이 없는 옛 저장도 그대로 읽힌다 (만든 시각은 모름으로 두고, 레벨 도달 시간은 적지 않는다)');
  for (const bad of [null, 5, 'x', [], { born: 'a', play: -3, reach: { 5: 'no', 10: [1] }, d: 7, y: [1, 'a'] }]) { const s: PlayerSave = JSON.parse(JSON.stringify(save)); s.ext!.stats = bad; const q = g.players.spawn('깨짐', false, s, ''); run(0.05); g.players.leave(q.id); }
  check(g.ledger.statsOf(p3) !== undefined, '깨진 기록이 들어 있어도 접속된다');
  check(g.players.export(g.players.spawn('Bot', true)).ext?.stats === undefined, '봇은 기록하지 않는다');
}

// ---------- 분포 스냅샷 ----------
{
  const { t, g, cmd, setup } = bench();
  const now = t.clock, store = new MemoryStore();
  const golds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 5000, 7];
  const seenAgo = [0.1, 0.5, 0.9, 3, 6, 10, 20, 29, 40, 100, 0.2, 2]; // 며칠 전에 마지막으로 접속했는가
  const yesterday = g.daily.dayOf(now - DAY), today = g.daily.dayOf(now);
  const plusOf = (i: number) => [0, 3, 10, 10, 5, 10, 0, 7, 10, 2, 10, 1][i];
  golds.forEach((gold, i) => {
    const list = [{ uid: 1, slot: 'weapon', base: 'blade1', rar: i % 4, lv: 1, plus: plusOf(i), opts: [] }, { uid: 2, slot: 'ring', rar: 1, lv: 1, plus: 0, opts: [['dmg', 3]] }, { uid: 3, slot: 'charm', rar: 3, lv: 1, plus: 9, opts: [] }];
    // 새로 온 사람 넷(0~3): 레벨 5에는 넷 다, 10에는 둘이 닿았다. 수입은 어제 것만 센다
    const stats = i < 4 ? { born: now - (i + 1) * DAY, play: 5000, away: 100, reach: { 5: [100 * (i + 1), 10 * i], ...(i < 2 ? { 10: [1000 * (i + 1), 500] } : {}) }, d: i % 2 ? [today, 999, 0] : [yesterday, 100 * (i + 1), 5], y: i % 2 ? [yesterday, 100 * (i + 1), 5] : ['2026-01-01', 12345, 0] }
      : i === 4 ? { born: now - 30 * DAY, play: 9, away: 0, reach: { 5: [1, 1] }, d: ['2026-01-02', 4444, 0], y: ['', 0, 0] } : undefined;
    store.savePlayer(`secret-key-${i}`, { name: `이름${i}`, lv: 2 + (i % 3), exp: 0, need: 60, maxHp: 100, sparks: 10 * i, gold, seen: now - seenAgo[i] * DAY, ext: { gear: { list, worn: i === 11 ? {} : { weapon: 1, ring: 2 }, seq: 3 }, ...(stats ? { stats } : {}) } });
  });
  store.savePlayer('secret-key-blank1', { name: '빈이름', lv: 1, exp: 0, need: 60, maxHp: 100, sparks: 0, gold: 0, seen: now });
  store.savePlayer('secret-key-blank2', { name: '빈이름둘', lv: 1, exp: 10, need: 60, maxHp: 100, sparks: 3, seen: now });
  // 거래소: 반지 둘(100, 300)과 철 10개 묶음(50)
  const seller = g.players.spawn('장수', false, null, 'key-s');
  g.classes.apply(seller, 'knight');
  setup(seller, () => { while (seller.lv < 10) g.players.grant(seller, 400, 0); seller.items.ore = 10; });
  for (const price of [100, 300]) { const it = g.gear.roll(3, 2, 'ring'); g.gear.put(seller, it); cmd(seller, { t: 'market', a: 'post', uid: it.uid, price }); }
  cmd(seller, { t: 'market', a: 'post', item: 'ore', n: 10, price: 50 });

  const snap: EconSnapshot = g.ledger.snapshot((fn) => store.eachPlayer(fn));
  const sorted = [...golds].sort((x, y) => x - y), total = golds.reduce((x, y) => x + y, 0);
  check(snap.day === today && snap.chars === 12 && snap.blank === 2, `진행이 없는 캐릭터(레벨 1, 골드 0)는 분포에서 빼고 수만 센다 (분포 ${snap.chars}, 뺀 것 ${snap.blank})`);
  check(snap.active.d1 === 4 && snap.active.d7 === 7 && snap.active.d30 === 10, `활동 캐릭터 수: 1일 ${snap.active.d1}, 7일 ${snap.active.d7}, 30일 ${snap.active.d30}`);
  check(snap.gold.sum === total && snap.gold.median === (sorted[5] + sorted[6]) / 2 && snap.gold.median === 55 && snap.gold.p90 === sorted[10] && snap.gold.p90 === 100 && snap.gold.p99 === 5000 && snap.gold.max === 5000 && median([3, 1, 2]) === 2 && quantile([], 0.9) === 0,
    `골드 보유: 합계 ${snap.gold.sum}, 중간값 ${snap.gold.median}, 상위 10% 경계 ${snap.gold.p90}, 상위 1% 경계 ${snap.gold.p99}, 최대 ${snap.gold.max}`);
  check(Math.abs(snap.gold.top10Share - (total - 7 - 10) / total) < 0.0001, `상위 10명이 가진 몫 ${(snap.gold.top10Share * 100).toFixed(1)}%`);
  check(snap.sparks.sum === 10 * (11 * 12) / 2 && snap.levels[2] === 4 && snap.levels[3] === 4 && snap.levels[4] === 4, '두 번째 재화의 합계와 레벨 분포');
  const plus = Array.from({ length: 11 }, () => 0); for (let i = 0; i < 11; i++) { plus[plusOf(i)]++; plus[0]++; }
  check(snap.worn.n === 22 && JSON.stringify(snap.worn.plus) === JSON.stringify(plus) && snap.worn.plus[10] === 5 && snap.worn.rar.uncommon === 11 + 3 && snap.worn.rar.common === 3 && snap.worn.rar.epic === 2, `낀 장비의 강화 단계 분포(+10이 ${snap.worn.plus[10]}점)와 등급 분포: 가방에만 있는 것은 세지 않는다`);
  check(snap.income.day === yesterday && snap.income.n === 4 && snap.income.median === 250, `어제 하루 수입의 중간값 ${snap.income.median} (어제 번 사람 ${snap.income.n}명)`);
  check(snap.fresh.n === 4 && snap.fresh.reach[5].n === 4 && snap.fresh.reach[5].play === 250 && snap.fresh.reach[5].total === 265 && snap.fresh.reach[10].n === 2 && snap.fresh.reach[10].play === 1500 && snap.fresh.reach[10].total === 2000 && snap.fresh.reach[20] === undefined,
    `최근 7일에 만든 캐릭터 ${snap.fresh.n}명의 레벨 도달 시간(중간값): 5레벨 ${snap.fresh.reach[5].play}초, 10레벨 ${snap.fresh.reach[10].play}초`);
  check(snap.market.n === 3 && snap.market.kinds.ring.n === 2 && snap.market.kinds.ring.median === 200 && snap.market.kinds['item:ore'].median === 5, '거래소의 물건 수와 종류별 값의 중간값 (재료는 낱개 값)');
  const text = JSON.stringify(snap);
  check(!/이름|secret|key-|장수/.test(text), '스냅샷에 이름이나 저장 키가 들어 있지 않다');
  // 깨진 저장이 섞여 있어도 만들어진다
  store.savePlayer('broken', { name: 'x', lv: NaN, exp: 0, need: 0, maxHp: 0, sparks: -5, gold: 50, ext: { gear: { list: [null, 3, { uid: 1 }], worn: { weapon: 1 } }, stats: 'no' } } as unknown as PlayerSave);
  check(g.ledger.snapshot((fn) => store.eachPlayer(fn)).chars === 13, '깨진 저장이 섞여 있어도 스냅샷이 만들어진다');
}

// ---------- 통신 계층: 켜질 때 스냅샷을 남기고, 끌 때 장부를 저장소에 얹는다 ----------
{
  const store = new MemoryStore();
  store.savePlayer('k', { name: '있던사람', lv: 5, exp: 0, need: 60, maxHp: 100, sparks: 0, gold: 120, seen: Date.now() });
  const server = await startServer(0, { store });
  const day = server.game.ledger.today();
  const snap = store.econSnapshot(day)?.data as EconSnapshot | undefined;
  check(snap?.chars === 1 && snap.gold.sum === 120, '서버가 켜질 때 그날의 분포 스냅샷이 없으면 남긴다');
  const p = server.game.players.spawn('잠깐', false, null, 'key-z');
  server.game.classes.apply(p, 'knight');
  const m = server.game.monsters.spawn('mite', p.x + 1, p.z); m.layer = p.layer;
  server.game.combat.damage(p, m, 1e6, false);
  await server.close();
  const rows = store.econ(day);
  check(sum(rows, 'gold', 'hunt', '+') === p.gold && p.gold > 0, `저장하고 끌 때 장부를 저장소에 얹는다 (골드 +${p.gold})`);
  const again = await startServer(0, { store });
  await again.close();
  check((store.econSnapshot(day)?.data as EconSnapshot).at === snap?.at && sum(store.econ(day), 'gold', 'hunt', '+') === p.gold, '같은 날 다시 켜도 스냅샷은 하루에 하나이고, 장부는 두 번 얹히지 않는다');
}
