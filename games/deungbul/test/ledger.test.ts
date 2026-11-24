// 재화 흐름 지표(경제 장부): 서버 없이 게임 규칙만 돌려, 장부에 적힌 것이 실제로 바뀐 것과 맞는지 센다.
// 가장 중요한 것은 대조 검사다: 긴 시나리오를 돌린 뒤 재화마다 "장부의 생김 − 사라짐 = 모든 캐릭터가 가진 것의 실제 변화"가 정확히 맞아야 한다.
// 이 파일은 장부 시험에서 가른 이 게임의 몫이다: 대조 검사의 긴 시나리오가 등탑·퀘스트·기여 단계·습격을 거친다. 장부 자체의 나머지 검사는 틀의 시험 test/ledger.test.ts에 있다.
import { CAMPS, CONTRIB_TIERS, DUNGEONS, FORGE, RARITIES, SHOPS, SMITHY, marketFee, type MarketItem } from '@engine/shared/defs';
import { TOWER } from '@engine/shared/world';
import type { Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';
import { isField } from '@engine/server/game/layers';
import { MemoryStore, type EconRow, type PlayerSave } from '@engine/server/store';
import { check } from '@engine/test/harness';
import { newGame } from './game';

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
  const g = newGame({ now: () => t.clock, raid: { hours: [] } }); // 습격은 시험이 직접 연다
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

