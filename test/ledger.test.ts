// 재화 흐름 지표(경제 장부): 서버 없이 게임 규칙만 돌려, 장부에 적힌 것이 실제로 바뀐 것과 맞는지 센다.
// 가장 중요한 것은 대조 검사다: 긴 시나리오를 돌린 뒤 재화마다 "장부의 생김 − 사라짐 = 모든 캐릭터가 가진 것의 실제 변화"가 정확히 맞아야 한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CAMPS, CONTRIB_TIERS, DUNGEONS, ECON_HUNT, ECON_LEVEL_MARKS, FORGE, GEAR, RARITIES, SHOPS, SMITHY, marketFee, type MarketItem } from '../shared/defs';
import { TOWER } from '../shared/world';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { isField } from '../server/game/layers';
import { median, quantile, type EconSnapshot } from '../server/game/systems/ledger';
import { startServer } from '../server/net/server';
import { MemoryStore, SqliteStore, type EconRow, type PlayerSave, type Store } from '../server/store';
import { check } from './harness';

const DAY = 24 * 3600000;
type MonsterType = Parameters<Game['monsters']['spawn']>[0];

/** 지금까지 얻은 경험치의 합 (레벨이 올라도 이어지게): 레벨마다 필요한 양은 60에서 시작해 1.35배씩 는다 */
function expTotal(p: Ent): number { let s = p.exp, n = 60; for (let i = 1; i < p.lv; i++) { s += n; n = Math.round(n * 1.35); } return s; }
/** 캐릭터들이 가진 것을 재화별로 센다 (장부와 같은 이름으로) */
function census(ps: Ent[]): Record<string, number> {
  const out: Record<string, number> = { gold: 0, sparks: 0, exp: 0 };
  const add = (k: string, n: number) => { out[k] = (out[k] ?? 0) + n; };
  for (const p of ps) {
    add('gold', p.gold); add('sparks', p.sparks); add('exp', expTotal(p));
    for (const it of p.gear) add(`gear:${RARITIES[it.rar].id}`, 1);
    for (const [id, n] of Object.entries(p.items)) add(`item:${id}`, n);
  }
  return out;
}
/** 장부의 줄을 재화별 순증가(생김 − 사라짐)로 */
function netOf(rows: EconRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.cur] = (out[r.cur] ?? 0) + (r.dir === '+' ? r.amount : -r.amount);
  return out;
}
const sum = (rows: EconRow[], cur: string, why: string | ((w: string) => boolean), dir?: '+' | '-'): number =>
  rows.filter((r) => r.cur === cur && (typeof why === 'string' ? r.why === why : why(r.why)) && (!dir || r.dir === dir)).reduce((s, r) => s + r.amount, 0);

/** 게임 하나와 그것을 다루는 손잡이들. 시계는 틱과 함께 흐른다 */
function bench(start = new Date(2026, 0, 10, 9).getTime()) {
  const t = { clock: start };
  const g = new Game({ now: () => t.clock, raid: { hours: [] } }); // 습격은 시험이 직접 연다
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

// ---------- 대조 검사: 긴 시나리오 뒤에 장부와 실제 변화가 맞는가 ----------
{
  const { t, g, run, at, mob, kill, cmd, setup, mine } = bench();
  const store = new MemoryStore();
  const save = () => store.addEcon(g.ledger.drain()); // 통신 계층이 하는 것처럼 가끔 저장소에 얹는다
  g.tower.load({ glows: [50, 50], residents: [30, 60, 99] }); // 대장장이와 약초꾼은 돌아와 있고, 등탑지기는 불씨 하나가 모자란다

  const a = g.players.spawn('갑', false, null, 'key-a'), b = g.players.spawn('을', false, null, 'key-b');
  let c = g.players.spawn('병', false, null, 'key-c');
  const guest = g.players.spawn('손님', false, null, '');
  g.classes.apply(a, 'warrior'); g.classes.apply(b, 'archer'); g.classes.apply(c, 'warrior'); g.classes.apply(guest, 'mage');
  const live = () => [a, b, c, guest];
  const before = census(live());

  // 준비: 레벨과 밑천 (장부에는 setup으로 적힌다)
  for (const p of [a, b, c]) setup(p, () => { while (p.lv < 12) g.players.grant(p, 400, 0); p.gold += 20000; p.sparks += 300; p.hp = p.maxHp; });
  check(a.lv === 12 && sum(g.ledger.rows(), 'gold', 'setup') === 60000, '명령과 사건 밖에서 바꾼 것도 note로 원인을 붙여 적을 수 있다');

  // 사냥: 직접 쓰러뜨리기, 자동 공격(틱 안), 기술 명령으로 마무리
  at(a, CAMPS[0].x, CAMPS[0].z);
  g.gear.random = () => 0.999; // 장비는 떨어지지 않는다 (아래에서 따로 떨어뜨린다)
  for (let i = 0; i < 3; i++) kill(a, 'slime'); // 퀘스트 1장 1단계(슬라임 3마리)가 처치 사건 안에서 끝난다
  check(a.qs === 1 && sum(g.ledger.rows(), 'exp', 'quest') === 20, '처치 사건 안에서 받은 퀘스트 단계 보상은 사냥이 아니라 quest로 적힌다');
  { const m = mob(a, 'slime'); cmd(a, { t: 'attack', id: m.id }); run(8); check(m.dead, '자동 공격으로 틱 안에서 쓰러뜨렸다'); }
  { const m = mob(a, 'slime'); m.hp = 1; cmd(a, { t: 'attack', id: m.id }); cmd(a, { t: 'skill', n: 0 }); check(m.dead, '기술 명령으로 쓰러뜨렸다'); }
  // 손님(저장하지 않는 접속)도 벌고 쓴다
  at(guest, CAMPS[0].x + 3, CAMPS[0].z); kill(guest, 'slime'); kill(guest, 'wisp');

  // 불씨 바치기: 을이 먼저 바쳐 두고(등탑지기가 없어 단계 보상은 아직), 갑이 등탑지기를 되돌린다 → 을의 단계 보상이 갑의 명령 안에서 나온다
  const tower = (p: Ent) => at(p, TOWER.x + 2, TOWER.z + 2);
  tower(b); cmd(b, { t: 'offer', to: 'tower', n: 12 });
  tower(a); cmd(a, { t: 'offer', to: 'tower', n: 1 }); // 퀘스트 2단계(바치기)가 명령 안에서 끝난다
  const bGold = b.gold;
  cmd(a, { t: 'offer', to: 'resident', n: 1 });
  check(b.tier === 1 && b.gold === bGold + CONTRIB_TIERS[0].gold && sum(g.ledger.rows(), 'gold', 'tier') === CONTRIB_TIERS[0].gold, '남의 명령 안에서 받은 기여 단계 보상도 tier로 적힌다');
  // 퀘스트 3단계: 그 자리에 가면 틱 안에서 끝난다
  at(a, FORGE.x, FORGE.z); run(1);
  check(a.qs === 3 && sum(g.ledger.rows(), 'exp', 'quest') === 20 + 20 + 30, '틱 안에서 받은 퀘스트 단계 보상도 quest로 적힌다');
  kill(a, 'shade_bram');
  tower(a); cmd(a, { t: 'offer', to: 'tower', n: 20 }); // 1장 끝, 기여 22: 단계 보상
  check(a.qc === 1 && a.tier === 1, '갑이 1장을 마치고 기여 1단계가 됐다');

  // 상점: 물약과 무기를 사고(2장 1단계: 물약 사기), 물약을 마신다
  at(a, SHOPS[0].x, SHOPS[0].z + 1);
  for (let i = 0; i < 3; i++) cmd(a, { t: 'buy', id: 'potion' });
  cmd(a, { t: 'buy', id: 'sword2' });
  a.hp = 10; cmd(a, { t: 'use', id: 'potion' });
  check(a.items.potion === 2 && a.weapon === 'sword2' && a.qs === 1, '상점에서 사고 마셨다');
  // 제작
  setup(a, () => { a.items.iron = 30; a.items.hide = 10; });
  at(a, SMITHY.x + 1, SMITHY.z); cmd(a, { t: 'craft', id: 'sword3' });
  check(a.weapon === 'sword3' && a.items.iron === 26, '대장간에서 만들었다');

  // 장비: 줍고, 끼고, 강화(성공과 실패)하고, 판다
  at(a, CAMPS[2].x, CAMPS[2].z);
  g.gear.random = () => 0; kill(a, 'wolf'); kill(a, 'wolf');
  g.gear.random = Math.random; for (let i = 0; i < 6; i++) { g.gear.give(a, g.gear.roll(3)); } g.ledger.note(a, 'setup');
  const drop = a.gear[a.gear.length - 8];
  cmd(a, { t: 'equip', uid: drop.uid });
  g.gear.random = () => 0; cmd(a, { t: 'enhance', uid: drop.uid });
  g.gear.random = () => 0.999; cmd(a, { t: 'enhance', uid: drop.uid });
  check(drop.plus === 1, '강화에 한 번 성공하고 한 번 실패했다');
  cmd(a, { t: 'sell', uid: a.gear[a.gear.length - 1].uid });
  // 기술 강화, 능력치 돌려받기
  cmd(a, { t: 'skillUp', id: 'smash' });
  cmd(a, { t: 'stat', k: 'pow' }); cmd(a, { t: 'statReset' });
  check(a.skillLv.smash === 2 && g.build.spent(a) === 0, '기술을 강화하고 능력치를 돌려받았다');

  // 길드: 만들고, 초대하고, 기부한다
  tower(a); tower(b);
  cmd(a, { t: 'guild', a: 'create', name: '장부길드' });
  cmd(a, { t: 'guild', a: 'give', n: 1000 });
  cmd(a, { t: 'guild', a: 'invite', id: b.id }); cmd(b, { t: 'guild', a: 'accept' });
  cmd(b, { t: 'guild', a: 'give', n: 100 });
  check(g.guild.count === 1 && b.guild === '장부길드', '길드를 만들고 기부했다');
  save();

  // 거래소: 올리기·사기·내리기·만료, 접속해 있지 않은 판매자
  g.gear.random = Math.random;
  const ring = (p: Ent, rar: number) => { const it = g.gear.roll(3, rar, 'ring'); setup(p, () => g.gear.put(p, it)); return it; };
  const r1 = ring(a, 2), r2 = ring(a, 1), r3 = ring(a, 3), r4 = ring(c, 2);
  cmd(a, { t: 'market', a: 'post', uid: r1.uid, price: 400 });
  cmd(a, { t: 'market', a: 'post', item: 'iron', n: 5, price: 50 });
  cmd(a, { t: 'market', a: 'post', uid: r2.uid, price: 90 });
  cmd(a, { t: 'market', a: 'post', uid: r3.uid, price: 7777 });
  const ids = mine(a).map((x) => x.id).sort((x, y) => x - y);
  check(ids.length === 4 && g.market.count === 4, '갑이 반지 셋과 철 다섯을 올렸다');
  cmd(b, { t: 'market', a: 'buy', id: ids[0] }); // 을이 반지를 산다
  cmd(c, { t: 'market', a: 'buy', id: ids[1] }); // 병이 철을 산다
  cmd(a, { t: 'market', a: 'cancel', id: ids[2] }); // 갑이 하나를 내린다
  cmd(c, { t: 'market', a: 'post', uid: r4.uid, price: 600 });
  const cId = mine(c)[0].id;
  // 병이 나간다 (저장하고). 나간 뒤에 을이 병의 반지를 산다: 판 값은 맡아 두었다가 돌아오면 우편으로 간다
  c.auto = false;
  const cSave: PlayerSave = JSON.parse(JSON.stringify(g.players.export(c)));
  const cWas = census([c]);
  g.players.leave(c.id);
  cmd(b, { t: 'market', a: 'buy', id: cId });
  check(g.mail.waitingFor('key-c').length === 1 && b.gear.length >= 3, '나간 사람의 물건을 샀다: 판 값은 맡아 둔다');
  cmd(a, { t: 'mailClaim', id: 0 }); // 출석과 판 돈 둘
  save();

  // 이틀이 지난다: 올려 둔 반지는 기간이 지나 우편으로 돌아오고, 병은 돌아와 방치 보상·출석·판 돈을 받는다
  t.clock += 49 * 3600000;
  run(6);
  c = g.players.spawn('병', false, cSave, 'key-c');
  check(JSON.stringify(census([c])) === JSON.stringify(cWas), '나갔다 들어와도 가진 것은 그대로다');
  check(c.mail.some((m) => m.k === 'idle') && c.mail.some((m) => m.k === 'marketSold') && a.mail.some((m) => m.k === 'marketExpired'), '방치 보상과 판 돈, 돌아온 물건이 우편으로 왔다');
  const aRings = a.gear.length;
  for (const p of [a, b, c, guest]) cmd(p, { t: 'mailClaim', id: 0 });
  check(a.gear.length === aRings + 1 && g.market.count === 0, '기간이 지난 물건을 우편에서 돌려받았다');

  // 일일 임무: 30마리 처치, 불씨 10개, 강화 한 번 → 보상 우편
  at(a, CAMPS[0].x, CAMPS[0].z);
  g.gear.random = () => 0.999;
  for (let i = 0; i < 30; i++) kill(a, 'slime');
  tower(a); cmd(a, { t: 'offer', to: 'tower', n: 10 });
  g.gear.random = () => 0; cmd(a, { t: 'enhance', uid: drop.uid });
  check(a.mail.filter((m) => m.k === 'daily').length === 3, '일일 임무 셋을 채워 우편이 왔다');
  cmd(a, { t: 'mailClaim', id: a.mail[0].id }); // 하나만 받아 본다
  cmd(a, { t: 'mailClaim', id: 0 });

  // 파티: 곁에 있던 파티원도 처치 보상을 나눠 받는다
  at(a, CAMPS[2].x, CAMPS[2].z); at(b, CAMPS[2].x + 2, CAMPS[2].z);
  cmd(a, { t: 'party', a: 'invite', id: b.id }); cmd(b, { t: 'party', a: 'accept' });
  const bExp = expTotal(b);
  g.gear.random = Math.random;
  kill(a, 'wolf');
  check(expTotal(b) > bExp, '파티원이 처치 보상을 나눠 받았다');

  // 던전: 둘이 들어가 갑이 다 잡는다. 을은 입구에 서 있기만 하지만 끝낸 보상(우편과 장비)은 받는다
  const def = DUNGEONS.crypt;
  at(a, def.portal.x + 1, def.portal.z); at(b, def.portal.x + 1, def.portal.z + 1);
  cmd(a, { t: 'dungeon', id: 'crypt' }); cmd(b, { t: 'dungeon', id: 'crypt' });
  check(!isField(a.layer) && a.layer === b.layer, '둘이 같은 던전에 들어갔다');
  const bGear = b.gear.length;
  const inside = () => [...g.ents.values()].filter((m) => m.kind === 'm' && m.layer === a.layer && !m.dead);
  for (const m of inside().sort((x, y) => (x.def?.boss ? 1 : 0) - (y.def?.boss ? 1 : 0))) { at(a, m.x + 1, m.z); g.combat.damage(a, m, 1e6, false); }
  check(b.gear.length >= bGear + 1 && b.mail.some((m) => m.k === 'dungeon'), '던전을 끝내 둘 다 장비와 우편을 받았다');
  run(def.exitS + 1);
  check(isField(a.layer) && isField(b.layer), '던전에서 나왔다');
  cmd(a, { t: 'mailClaim', id: 0 }); cmd(b, { t: 'mailClaim', id: 0 });

  // 습격: 막아 내면 틱 안에서 보상을 받는다
  tower(a);
  Object.assign(g.raid.cfg, { waveAtS: [0] });
  cmd(a, { t: 'stop' }); // 방금 움직인 사람이어야 인원으로 센다
  g.raid.start();
  run(0.2);
  for (const m of [...g.ents.values()]) if (m.raid && !m.dead) { at(a, m.x + 1, m.z); g.combat.damage(a, m, 1e6, false); }
  run(0.2);
  check(g.raid.phase === 'idle' && sum(g.ledger.rows(), 'sparks', 'raid') === g.raid.cfg.rewardSparks && sum(g.ledger.rows(), 'exp', 'raid') === g.raid.cfg.rewardExp, '습격 보상은 틱 안에서 받아도 raid로 적힌다');

  // 쓰러짐과 채널 이동: 재화는 그대로다
  { const m = mob(c, 'wolf'); const had = JSON.stringify(census([c])); g.combat.damage(m, c, 1e6, false); check(JSON.stringify(census([c])) === had, '쓰러져도 잃는 것이 없다'); }
  cmd(guest, { t: 'channel', n: 2 });
  check(guest.layer !== a.layer, '손님이 채널을 옮겼다');
  save();

  // 자리 비움 사냥: 병이 자동 사냥을 켠 채 끊겼다 → 서버가 대신 사냥한다
  at(c, CAMPS[0].x, CAMPS[0].z); c.hp = c.maxHp; c.auto = true;
  const awayGold = c.gold;
  g.away.start(c);
  run(120);
  check(g.away.active(c) && c.gold > awayGold, `자리를 비운 2분 동안 서버가 대신 사냥했다 (골드 +${c.gold - awayGold})`);
  const awayEarned = c.gold - awayGold;
  g.away.stop(c); cmd(c, { t: 'stop' });
  run(1);
  save();

  // ---- 대조 ----
  const rows = store.econ('');
  const ledger = netOf(rows), now = census(live());
  const keys = [...new Set([...Object.keys(ledger), ...Object.keys(now), ...Object.keys(before)])].sort();
  const bad = keys.filter((k) => (ledger[k] ?? 0) !== (now[k] ?? 0) - (before[k] ?? 0));
  console.log(`      (원인 ${new Set(rows.map((r) => r.why)).size}가지, 줄 ${rows.length}개, 건수 ${rows.reduce((s, r) => s + r.n, 0)}건, 재화 ${keys.length}가지: ${keys.map((k) => `${k} ${ledger[k] ?? 0}`).join(', ')})`);
  check(bad.length === 0, `대조: 재화마다 장부의 순증가 = 실제 변화 ${bad.length ? `(어긋남: ${bad.map((k) => `${k} 장부 ${ledger[k] ?? 0} 실제 ${(now[k] ?? 0) - (before[k] ?? 0)}`).join(', ')})` : `(${keys.length}가지 모두 일치)`}`);
  const unknown = rows.filter((r) => r.why === 'other' || r.why === 'tick' || r.why.startsWith('ev:'));
  check(unknown.length === 0, `원인을 가리지 못한 줄(other, tick)이 없다 ${unknown.map((r) => `${r.cur} ${r.why} ${r.dir}${r.amount}`).join(', ')}`);
  // 거래소: 낸 값 − 받은 값 = 수수료
  const out = sum(rows, 'gold', 'market:out'), into = sum(rows, 'gold', 'market:in');
  check(out === 400 + 50 + 600 && out - into === g.market.taxed && g.market.taxed === marketFee(400) + marketFee(50) + marketFee(600), `거래소의 골드는 이동으로 적히고(낸 값 ${out}, 받은 값 ${into}) 그 차이가 수수료(${g.market.taxed})다`);
  check(sum(rows, 'gold', (w) => w.startsWith('cmd:market') || w === 'mail:marketSold') === 0, '거래소의 골드가 명령이나 우편의 이름으로 한 번 더 적히지 않는다');
  const moved = (cur: string) => sum(rows, cur, (w) => w.startsWith('cmd:market') || w.startsWith('mail:market'), '+') - sum(rows, cur, (w) => w.startsWith('cmd:market') || w.startsWith('mail:market'), '-');
  check(RARITIES.every((r) => moved(`gear:${r.id}`) === 0) && moved('item:iron') === 0, '거래소를 거친 장비와 재료는 올린 만큼 누군가 받았다 (생기지도 사라지지도 않았다)');
  // 원인별로 적혔는가
  const whys = new Set(rows.map((r) => r.why));
  const want = ['setup', 'hunt', 'huntAway', 'huntDungeon', 'quest', 'raid', 'tier', 'cmd:buy', 'cmd:use', 'cmd:craft', 'cmd:sell', 'cmd:enhance', 'cmd:skillUp', 'cmd:statReset', 'cmd:guild:create', 'cmd:guild:give', 'cmd:offer',
    'cmd:market:post', 'cmd:market:buy', 'cmd:market:cancel', 'market:out', 'market:in', 'mail:idle', 'mail:attend', 'mail:daily', 'mail:dungeon', 'mail:marketExpired'];
  check(want.every((w) => whys.has(w)), `원인이 이름대로 적힌다 ${want.filter((w) => !whys.has(w)).length ? '(없는 것: ' + want.filter((w) => !whys.has(w)).join(', ') + ')' : `(${want.length}가지)`}`);
  check(![...whys].some((w) => w === 'cmd:mailClaim' || w === 'cmd:skill' || w === 'cmd:attack' || w === 'cmd:guild' || w === 'cmd:market'), '우편은 종류별로, 길드와 거래소는 하위 동작별로 나뉘어 적힌다 (기술·공격 명령의 몫은 없다)');
  check(sum(rows, 'gold', 'cmd:guild:create', '-') === 500 && sum(rows, 'gold', 'cmd:guild:give', '-') === 1100 && sum(rows, 'gold', 'mail:dungeon', '+') === 2 * def.reward.gold! && sum(rows, 'gold', 'mail:daily', '+') === 90 + 40 + 150, '길드·던전·일일 임무의 골드가 값대로 적힌다 (일일 임무: 첫날 갑 둘과 을 하나, 셋째 날 갑 셋)');
  check(sum(rows, 'gold', 'huntAway', '+') === awayEarned && awayEarned > 0, '자리 비움 사냥으로 번 골드가 huntAway에 그대로 적힌다');
}

// ---------- 명령 안의 처치, 직접 사냥과 자리 비움 사냥, 가득 찬 가방, 날짜 ----------
{
  const { t, g, run, at, mob, kill, cmd, setup } = bench();
  const p = g.players.spawn('사냥꾼', false, null, 'key-h');
  g.classes.apply(p, 'warrior');
  setup(p, () => { while (p.lv < 10) g.players.grant(p, 400, 0); });
  p.qc = 99; // 퀘스트 보상이 섞이지 않게
  at(p, CAMPS[2].x, CAMPS[2].z);
  g.gear.random = () => 0.999;
  const day1 = g.ledger.today();
  const rows = () => g.ledger.rows().filter((r) => r.why !== 'setup');

  // 기술 명령 하나로 쓰러뜨린다: 처치 보상은 사냥으로 한 번만 적힌다
  const gold0 = p.gold, exp0 = expTotal(p), sparks0 = p.sparks;
  const m = mob(p, 'wolf'); m.hp = 1;
  cmd(p, { t: 'attack', id: m.id }); cmd(p, { t: 'skill', n: 0 });
  const r1 = rows();
  check(m.dead && p.gold > gold0 && sum(r1, 'gold', ECON_HUNT.live, '+') === p.gold - gold0 && sum(r1, 'exp', ECON_HUNT.live, '+') === expTotal(p) - exp0 && sum(r1, 'sparks', ECON_HUNT.live, '+') === p.sparks - sparks0,
    `명령 안에서 처치가 일어나도 보상은 hunt에 한 번만 적힌다 (골드 ${p.gold - gold0}, 경험치 ${expTotal(p) - exp0})`);
  check(r1.every((r) => r.why === ECON_HUNT.live) && r1.every((r) => r.n === 1), '기술 명령(cmd:skill)의 몫으로는 아무것도 적히지 않는다');

  // 자리 비움 사냥은 다른 원인으로 적힌다
  p.auto = true; g.away.start(p);
  const gold1 = p.gold;
  kill(p, 'wolf');
  check(sum(rows(), 'gold', ECON_HUNT.away, '+') === p.gold - gold1 && sum(rows(), 'gold', ECON_HUNT.live, '+') === gold1 - gold0, '서버가 대신 사냥하는 동안 번 것은 huntAway로, 접속 중에 번 것은 hunt로 적힌다');
  g.away.stop(p); p.auto = false;
  kill(p, 'wolf');
  check(sum(rows(), 'gold', ECON_HUNT.live, '+') + sum(rows(), 'gold', ECON_HUNT.away, '+') === p.gold - gold0 && sum(rows(), 'gold', ECON_HUNT.live, '+') > gold1 - gold0, '돌아온 뒤에는 다시 hunt로 적힌다');

  // 가방이 가득 차 버려진 장비
  setup(p, () => { while (p.gear.length < GEAR.bagMax) g.gear.put(p, g.gear.roll(1, 0, 'ring')); });
  const had = p.gear.length;
  g.gear.random = () => 0; // 반드시 떨어지고, 등급은 가장 낮다
  kill(p, 'wolf'); kill(p, 'wolf');
  const cur = `gear:${RARITIES[0].id}`;
  check(p.gear.length === had && sum(rows(), cur, 'lostFull', '-') === 2 && sum(rows(), cur, ECON_HUNT.live, '+') === 2, '가방이 가득 차 버려진 장비가 세어진다 (떨어진 것 2, 버려진 것 2, 가방은 그대로)');
  check(/버려진 장비 2/.test(g.ledger.line()) && /골드 \+0 -0/.test(g.ledger.line()), '지표 로그 한 줄에 구간의 합계가 찍히고, 찍은 뒤에는 구간이 새로 시작된다');

  // 날짜가 바뀌면 새 날짜의 줄에 적힌다
  t.clock = new Date(2026, 0, 11, 0, 0, 5).getTime();
  g.gear.random = () => 0.999;
  const gold2 = p.gold;
  kill(p, 'wolf');
  const day2 = g.ledger.today();
  check(day1 === '2026-01-10' && day2 === '2026-01-11' && sum(g.ledger.rows(day2), 'gold', ECON_HUNT.live, '+') === p.gold - gold2 && sum(g.ledger.rows(day1), 'gold', ECON_HUNT.live, '+') === gold2 - gold0 - sum(rows(), 'gold', ECON_HUNT.away, '+'), '날짜가 바뀌면 새 날짜의 줄에 적힌다 (지난 날의 줄은 그대로)');
  t.clock += 2 * DAY; kill(p, 'wolf');
  check(g.ledger.rows(day1).length === 0 && g.ledger.rows(day2).length === 0 && g.ledger.drain().some((r) => r.day === day1), '메모리의 합계는 오늘과 어제 것만 남기고, 저장할 줄은 내어 줄 때까지 남는다');

  // 원인을 가리지 못한 변화는 other(틱 밖)와 tick(틱 안)으로 드러난다
  p.gold += 777; run(0.05);
  const orig = g.quests.tick.bind(g.quests);
  g.quests.tick = (dt) => { p.sparks += 3; orig(dt); };
  run(0.05);
  g.quests.tick = orig;
  const today = g.ledger.rows(g.ledger.today());
  check(sum(today, 'gold', 'other', '+') === 777 && sum(today, 'sparks', 'tick', '+') === 3, '어느 경계에도 잡히지 않은 변화는 other(틱 밖)와 tick(틱 안)으로 드러난다: 재화 복사 버그의 경보');
  // 재료나 장비의 구성만 바뀐 것은 틱마다가 아니라 돌아가며 세므로(1초에 한 번) 조금 늦게 드러난다
  p.items.iron = (p.items.iron ?? 0) + 4; p.gear[p.gear.length - 1].rar = 3;
  run(1);
  const late = g.ledger.rows(g.ledger.today()).filter((r) => r.why === 'tick');
  check(sum(late, 'item:iron', 'tick', '+') === 4 && sum(late, 'gear:epic', 'tick', '+') === 1 && sum(late, `gear:${RARITIES[0].id}`, 'tick', '-') === 1, '명령 밖에서 재료나 장비의 등급만 바뀌어도 1초 안에 tick으로 드러난다');
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
  const stores: [string, () => Store, boolean][] = [['메모리 저장소', () => new MemoryStore(), false], ['SQLite 파일', () => new SqliteStore(file), true]];
  for (const [name, open, reopens] of stores) {
    let s = open();
    const row = (day: string, cur: string, why: string, dir: '+' | '-', amount: number, n: number): EconRow => ({ day, cur, why, dir, amount, n });
    s.addEcon([row('2026-01-10', 'gold', 'hunt', '+', 100, 4), row('2026-01-10', 'gold', 'cmd:buy', '-', 30, 1), row('2026-01-09', 'exp', 'hunt', '+', 55, 2)]);
    s.addEcon([row('2026-01-10', 'gold', 'hunt', '+', 50, 2), row('2026-01-10', 'gold', 'hunt', '-', 7, 1), row('2026-01-11', 'gear:rare', 'lostFull', '-', 1, 1)]);
    s.addEcon([]);
    const find = (rows: EconRow[], day: string, cur: string, why: string, dir: string) => rows.find((r) => r.day === day && r.cur === cur && r.why === why && r.dir === dir);
    const ok = (st: Store) => { const all = st.econ('2026-01-01'), h = find(all, '2026-01-10', 'gold', 'hunt', '+'); return all.length === 5 && h?.amount === 150 && h.n === 6 && find(all, '2026-01-10', 'gold', 'hunt', '-')?.amount === 7 && st.econ('2026-01-10').length === 4 && st.econ('2026-01-11').length === 1 && st.econ('2026-02-01').length === 0; };
    check(ok(s), `${name}: 두 번에 나눠 얹어도 같은 줄(날짜·재화·원인·방향)은 합쳐지고, 날짜로 걸러 읽힌다`);
    s.saveEconSnapshot('2026-01-10', { day: '2026-01-10', chars: 1 }); s.saveEconSnapshot('2026-01-11', { day: '2026-01-11', chars: 2 }); s.saveEconSnapshot('2026-01-11', { day: '2026-01-11', chars: 3 });
    s.savePlayer('k1', { name: '하나', lv: 3, exp: 0, need: 60, maxHp: 100, sparks: 1, contrib: 0, gold: 5 }); s.savePlayer('k2', { name: '둘', lv: 4, exp: 0, need: 60, maxHp: 100, sparks: 2, contrib: 0, gold: 6 });
    if (reopens) { s.close(); s = open(); } // 재시작
    const seen: PlayerSave[] = [];
    s.eachPlayer((p) => seen.push(p));
    check(ok(s) && (s.econSnapshot()?.data as { chars: number }).chars === 3 && s.econSnapshot()?.day === '2026-01-11' && (s.econSnapshot('2026-01-10')?.data as { chars: number }).chars === 1 && s.econSnapshot('2026-01-12') === null
      && seen.length === 2 && seen.map((p) => p.gold).sort().join() === '5,6', `${name}: ${reopens ? '닫았다 다시 열어도 합계가 남아 있고, ' : ''}스냅샷을 날짜로(없으면 가장 최근 것을) 읽고, 모든 캐릭터를 훑는다`);
    // 캐릭터가 많아도 빠짐없이, 한 번씩만 훑는다 (SQLite는 여러 쪽으로 나눠 읽는다)
    for (let i = 0; i < 1203; i++) s.savePlayer(`many-${i}`, { name: `n${i}`, lv: 2, exp: 0, need: 60, maxHp: 100, sparks: 0, contrib: 0, gold: i });
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
  g.classes.apply(p, 'warrior');
  run(30);
  g.players.grant(p, 600, 0); // 레벨 5를 넘긴다
  run(10);
  p.auto = true; g.away.start(p); run(20); g.away.stop(p); p.auto = false;
  while (p.lv < 10) g.players.grant(p, 300, 0);
  run(1);
  at(p, CAMPS[0].x, CAMPS[0].z);
  g.gear.random = () => 0.999;
  for (let i = 0; i < 5; i++) kill(p, 'slime');
  const hunted = p.gold; // 처음부터 지금까지 사냥으로 번 것 (자리를 비운 동안 번 것 포함)
  at(p, SHOPS[0].x, SHOPS[0].z + 1); cmd(p, { t: 'mailClaim', id: 0 }); cmd(p, { t: 'buy', id: 'potion' });
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
  kill(p2, 'slime');
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
    const list = [{ uid: 1, slot: 'weapon', base: 'sword1', rar: i % 4, lv: 1, plus: plusOf(i), opts: [] }, { uid: 2, slot: 'ring', rar: 1, lv: 1, plus: 0, opts: [['dmg', 3]] }, { uid: 3, slot: 'charm', rar: 3, lv: 1, plus: 9, opts: [] }];
    // 새로 온 사람 넷(0~3): 레벨 5에는 넷 다, 10에는 둘이 닿았다. 수입은 어제 것만 센다
    const stats = i < 4 ? { born: now - (i + 1) * DAY, play: 5000, away: 100, reach: { 5: [100 * (i + 1), 10 * i], ...(i < 2 ? { 10: [1000 * (i + 1), 500] } : {}) }, d: i % 2 ? [today, 999, 0] : [yesterday, 100 * (i + 1), 5], y: i % 2 ? [yesterday, 100 * (i + 1), 5] : ['2026-01-01', 12345, 0] }
      : i === 4 ? { born: now - 30 * DAY, play: 9, away: 0, reach: { 5: [1, 1] }, d: ['2026-01-02', 4444, 0], y: ['', 0, 0] } : undefined;
    store.savePlayer(`secret-key-${i}`, { name: `이름${i}`, lv: 2 + (i % 3), exp: 0, need: 60, maxHp: 100, sparks: 10 * i, contrib: 0, gold, seen: now - seenAgo[i] * DAY, ext: { gear: { list, worn: i === 11 ? {} : { weapon: 1, ring: 2 }, seq: 3 }, ...(stats ? { stats } : {}) } });
  });
  store.savePlayer('secret-key-blank1', { name: '빈이름', lv: 1, exp: 0, need: 60, maxHp: 100, sparks: 0, contrib: 0, gold: 0, seen: now });
  store.savePlayer('secret-key-blank2', { name: '빈이름둘', lv: 1, exp: 10, need: 60, maxHp: 100, sparks: 3, contrib: 0, seen: now });
  // 거래소: 반지 둘(100, 300)과 철 10개 묶음(50)
  const seller = g.players.spawn('장수', false, null, 'key-s');
  g.classes.apply(seller, 'warrior');
  setup(seller, () => { while (seller.lv < 10) g.players.grant(seller, 400, 0); seller.items.iron = 10; });
  for (const price of [100, 300]) { const it = g.gear.roll(3, 2, 'ring'); g.gear.put(seller, it); cmd(seller, { t: 'market', a: 'post', uid: it.uid, price }); }
  cmd(seller, { t: 'market', a: 'post', item: 'iron', n: 10, price: 50 });

  const snap: EconSnapshot = g.ledger.snapshot((fn) => store.eachPlayer(fn));
  const sorted = [...golds].sort((x, y) => x - y), total = golds.reduce((x, y) => x + y, 0);
  check(snap.day === today && snap.chars === 12 && snap.blank === 2, `진행이 없는 캐릭터(레벨 1, 골드 0)는 분포에서 빼고 수만 센다 (분포 ${snap.chars}, 뺀 것 ${snap.blank})`);
  check(snap.active.d1 === 4 && snap.active.d7 === 7 && snap.active.d30 === 10, `활동 캐릭터 수: 1일 ${snap.active.d1}, 7일 ${snap.active.d7}, 30일 ${snap.active.d30}`);
  check(snap.gold.sum === total && snap.gold.median === (sorted[5] + sorted[6]) / 2 && snap.gold.median === 55 && snap.gold.p90 === sorted[10] && snap.gold.p90 === 100 && snap.gold.p99 === 5000 && snap.gold.max === 5000 && median([3, 1, 2]) === 2 && quantile([], 0.9) === 0,
    `골드 보유: 합계 ${snap.gold.sum}, 중간값 ${snap.gold.median}, 상위 10% 경계 ${snap.gold.p90}, 상위 1% 경계 ${snap.gold.p99}, 최대 ${snap.gold.max}`);
  check(Math.abs(snap.gold.top10Share - (total - 7 - 10) / total) < 0.0001, `상위 10명이 가진 몫 ${(snap.gold.top10Share * 100).toFixed(1)}%`);
  check(snap.sparks.sum === 10 * (11 * 12) / 2 && snap.levels[2] === 4 && snap.levels[3] === 4 && snap.levels[4] === 4, '불씨 합계와 레벨 분포');
  const plus = Array.from({ length: 11 }, () => 0); for (let i = 0; i < 11; i++) { plus[plusOf(i)]++; plus[0]++; }
  check(snap.worn.n === 22 && JSON.stringify(snap.worn.plus) === JSON.stringify(plus) && snap.worn.plus[10] === 5 && snap.worn.rar.uncommon === 11 + 3 && snap.worn.rar.common === 3 && snap.worn.rar.epic === 2, `낀 장비의 강화 단계 분포(+10이 ${snap.worn.plus[10]}점)와 등급 분포: 가방에만 있는 것은 세지 않는다`);
  check(snap.income.day === yesterday && snap.income.n === 4 && snap.income.median === 250, `어제 하루 수입의 중간값 ${snap.income.median} (어제 번 사람 ${snap.income.n}명)`);
  check(snap.fresh.n === 4 && snap.fresh.reach[5].n === 4 && snap.fresh.reach[5].play === 250 && snap.fresh.reach[5].total === 265 && snap.fresh.reach[10].n === 2 && snap.fresh.reach[10].play === 1500 && snap.fresh.reach[10].total === 2000 && snap.fresh.reach[20] === undefined,
    `최근 7일에 만든 캐릭터 ${snap.fresh.n}명의 레벨 도달 시간(중간값): 5레벨 ${snap.fresh.reach[5].play}초, 10레벨 ${snap.fresh.reach[10].play}초`);
  check(snap.market.n === 3 && snap.market.kinds.ring.n === 2 && snap.market.kinds.ring.median === 200 && snap.market.kinds['item:iron'].median === 5, '거래소의 물건 수와 종류별 값의 중간값 (재료는 낱개 값)');
  const text = JSON.stringify(snap);
  check(!/이름|secret|key-|장수/.test(text), '스냅샷에 이름이나 저장 키가 들어 있지 않다');
  // 깨진 저장이 섞여 있어도 만들어진다
  store.savePlayer('broken', { name: 'x', lv: NaN, exp: 0, need: 0, maxHp: 0, sparks: -5, contrib: 0, gold: 50, ext: { gear: { list: [null, 3, { uid: 1 }], worn: { weapon: 1 } }, stats: 'no' } } as unknown as PlayerSave);
  check(g.ledger.snapshot((fn) => store.eachPlayer(fn)).chars === 13, '깨진 저장이 섞여 있어도 스냅샷이 만들어진다');
}

// ---------- 통신 계층: 켜질 때 스냅샷을 남기고, 끌 때 장부를 저장소에 얹는다 ----------
{
  const store = new MemoryStore();
  store.savePlayer('k', { name: '있던사람', lv: 5, exp: 0, need: 60, maxHp: 100, sparks: 0, contrib: 0, gold: 120, seen: Date.now() });
  const server = await startServer(0, { store, game: { raid: { hours: [] } } });
  const day = server.game.ledger.today();
  const snap = store.econSnapshot(day)?.data as EconSnapshot | undefined;
  check(snap?.chars === 1 && snap.gold.sum === 120, '서버가 켜질 때 그날의 분포 스냅샷이 없으면 남긴다');
  const p = server.game.players.spawn('잠깐', false, null, 'key-z');
  server.game.classes.apply(p, 'warrior');
  const m = server.game.monsters.spawn('slime', p.x + 1, p.z); m.layer = p.layer;
  server.game.combat.damage(p, m, 1e6, false);
  await server.close();
  const rows = store.econ(day);
  check(sum(rows, 'gold', 'hunt', '+') === p.gold && p.gold > 0, `저장하고 끌 때 장부를 저장소에 얹는다 (골드 +${p.gold})`);
  const again = await startServer(0, { store, game: { raid: { hours: [] } } });
  await again.close();
  check((store.econSnapshot(day)?.data as EconSnapshot).at === snap?.at && sum(store.econ(day), 'gold', 'hunt', '+') === p.gold, '같은 날 다시 켜도 스냅샷은 하루에 하나이고, 장부는 두 번 얹히지 않는다');
}
