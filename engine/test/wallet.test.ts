// 지갑(g.wallet): 재화를 더하고 빼는 한 통로 (서버 없이 게임 규칙만 돌린다. 규칙 플러그인 없는 틀만의 게임이다).
// 더하기·빼기·잔액 부족·깨진 값·상한, 수급 배율의 등록, 장부와의 관계(지갑이 원인을 직접 알린다, 지갑 밖의 변화는 other·tick으로 드러난다),
// 그리고 "재화의 칸을 직접 고치는 코드가 지갑 밖에 없다"를 소스를 읽어 검사한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOP, SMITHY } from '@game/shared/defs';
import { ATTEND, CAMPS, CURRENCIES, DAILIES, ECON_HUNT, ENHANCE, GUILD, ITEMS, MONSTERS, RECIPES, marketFee, type CurrencyDef, type MarketItem } from '../shared/defs';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { WHY, mailWhy, type Cur } from '../server/game/systems/wallet';
import type { EconRow, PlayerSave } from '../server/store';
import { check } from './harness';

const DEFS: Readonly<Record<string, CurrencyDef>> = CURRENCIES;
const GOLD_MAX = DEFS.gold?.max ?? Infinity, SPARKS_MAX = DEFS.sparks?.max ?? Infinity;
type MonsterType = Parameters<Game['monsters']['spawn']>[0];

function bench() {
  const t = { clock: new Date(2026, 0, 10, 9).getTime() };
  const g = new Game({ now: () => t.clock });
  const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.targetId = 0; };
  const kill = (p: Ent, type: MonsterType) => { const m = g.monsters.spawn(type, p.x + 1, p.z); m.layer = p.layer; g.combat.damage(p, m, 1e6, false); };
  const cmd = (p: Ent, m: Record<string, unknown>) => g.command(p, m);
  const run = (s: number) => { for (let i = 0, n = Math.round(s * 20); i < n; i++) { g.tick(0.05); t.clock += 50; } };
  const hero = (name: string, pid: string) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'warrior'); while (p.lv < 12) g.players.grant(p, 400, 0); p.hp = p.maxHp; g.ledger.note(p, 'setup'); return p; };
  /** 마지막으로 부른 뒤에 장부에 새로 적힌 것: '재화 원인 방향양' */
  let seen = new Map<string, number>();
  const fresh = (): string[] => {
    const now = new Map(g.ledger.rows().map((r: EconRow) => [`${r.cur} ${r.why} ${r.dir}`, r.amount])), out: string[] = [];
    for (const [k, v] of now) { const d = v - (seen.get(k) ?? 0); if (d) out.push(k + d); }
    seen = now;
    return out.sort();
  };
  return { t, g, at, kill, cmd, run, hero, fresh };
}
/** 지금 가진 골드 (함수로 읽는다: 한 식 안에서 값이 바뀌는 것을 타입 검사가 모르므로) */
const goldOf = (p: Ent): number => p.gold;
const same = (got: string[], want: string[]): boolean => [...got].sort().join(' | ') === [...want].sort().join(' | ');

// ---------- 더하기, 빼기, 잔액 부족, 깨진 값, 상한 ----------
{
  const { g, hero } = bench();
  const w = g.wallet, p = hero('지갑', 'key-w');
  const heard: string[] = [];
  w.seen.push((q, cur, d, why) => { if (q === p) heard.push(`${cur} ${d} ${why}`); });

  check(goldOf(p) === 0 && w.add(p, 'gold', 100, 'test') === 100 && goldOf(p) === 100 && p.dirty && p.unsaved, '더하면 더한 양을 돌려주고, 저장하고 알릴 것으로 표시한다');
  check(w.can(p, 'gold', 100) && !w.can(p, 'gold', 101) && w.take(p, 'gold', 30, 'test') && p.gold === 70, '잔액 안에서는 뺀다');
  check(!w.take(p, 'gold', 71, 'test') && p.gold === 70, '잔액이 모자라면 false를 돌려주고 아무것도 바꾸지 않는다');
  check(w.take(p, 'gold', 70, 'test') && p.gold === 0 && w.take(p, 'gold', 0, 'test') && !w.take(p, 'gold', 1, 'test'), '가진 것을 다 쓸 수 있고(0이 된다), 값이 0이면 언제나 된다');
  check(same(heard, ['gold 100 test', 'gold -30 test', 'gold -70 test']), '지갑을 지난 변화는 듣는 쪽(seen)에 원인과 함께 알린다: 더했으면 +, 뺐으면 −. 바뀐 것이 없으면 알리지 않는다');

  // 깨진 값
  w.add(p, 'gold', 500, 'test');
  const bad = [NaN, Infinity, -Infinity, -5, 0, undefined as unknown as number, '7' as unknown as number, null as unknown as number];
  check(bad.every((n) => w.add(p, 'gold', n, 'test') === 0) && p.gold === 500, '더하기: NaN, 무한대, 음수, 0, 수가 아닌 값은 아무것도 더하지 않는다');
  check([NaN, Infinity, -1, undefined as unknown as number].every((n) => !w.take(p, 'gold', n, 'test') && !w.can(p, 'gold', n)) && p.gold === 500, '빼기: NaN, 무한대, 음수는 치를 수 없는 값이다 (false, 그대로)');
  check(w.add(p, 'gold', 2.9, 'test') === 2 && goldOf(p) === 502 && w.take(p, 'gold', 1.2, 'test') && goldOf(p) === 500 && Number.isInteger(p.gold), '소수: 더할 때는 내리고 뺄 때는 올린다 (재화는 언제나 정수다)');
  check(!w.can(p, 'gold', 500.5) && w.can(p, 'gold', 499.5), '낼 수 있는지도 올린 값으로 본다');
  p.gold = NaN;
  check(!w.can(p, 'gold', 1) && !w.take(p, 'gold', 1, 'test') && w.add(p, 'gold', 5, 'test') === 0, '잔액이 깨져 있으면(NaN) 치르지도 받지도 못한다');
  p.gold = 500;

  // 상한: 재화의 표(CURRENCIES)에서 읽는다
  p.gold = GOLD_MAX - 10;
  check(w.amount(p, 'gold', 50, 'test') === 10 && p.gold === GOLD_MAX - 10 && w.add(p, 'gold', 50, 'test') === 10 && p.gold === GOLD_MAX && w.add(p, 'gold', 1, 'test') === 0, `상한(${GOLD_MAX})까지만 더하고, 실제로 더한 양을 돌려준다. amount는 묻기만 한다`);
  p.sparks = SPARKS_MAX - 1;
  check(w.add(p, 'sparks', 3, 'test') === 1 && p.sparks === SPARKS_MAX, '두 번째 재화도 제 상한을 따른다');
  // 저장을 읽을 때의 범위(players.ts의 spawn)가 재화의 표의 상한과 같다
  const save: PlayerSave = { name: '부자', lv: 3, exp: 0, need: 100, maxHp: 100, sparks: 5e12, gold: 5e12 };
  const rich = g.players.spawn('부자', false, save, 'key-rich');
  check(rich.gold === GOLD_MAX && rich.sparks === SPARKS_MAX, '저장에서 읽을 때 잘라 내는 값이 재화의 표의 상한과 같다');

  // 경험치: 더하면 레벨이 오른다. 상한이 없다
  const q = hero('경험', 'key-e'), lv = q.lv, lots = q.need * 3;
  g.notices = [];
  check(w.add(q, 'exp', lots, 'test') === lots, '경험치를 더하면 받은 양을 돌려준다 (상한이 없다)');
  check(q.lv > lv && q.exp < q.need && q.hp === q.maxHp && g.notices.some((n) => n.id === q.id && n.k === 'levelUp'), '경험치가 차면 레벨이 오른다 (지갑이 레벨 업을 부른다)');
  // 봇도 같은 통로를 쓴다 (장부에는 적히지 않는다)
  const bot = g.players.spawn('Bot', true), rows = g.ledger.rows().length;
  check(w.add(bot, 'gold', 9, 'test') === 9 && goldOf(bot) === 9 && w.take(bot, 'gold', 4, 'test') && goldOf(bot) === 5 && g.ledger.rows().length === rows, '봇의 재화도 지갑으로 바뀐다 (장부는 봇을 적지 않는다)');
}

// ---------- 장부와의 관계 ----------
{
  const { g, cmd, run, hero, fresh } = bench();
  const w = g.wallet, p = hero('장부', 'key-l');
  fresh();
  w.add(p, 'gold', 300, 'gift'); w.take(p, 'gold', 20, 'fee'); w.add(p, 'sparks', 7, 'gift'); w.add(p, 'exp', 11, 'gift');
  check(same(fresh(), ['gold gift +300', 'gold fee -20', 'sparks gift +7', 'exp gift +11']), '원인의 이름을 넘기면 경계(명령, 틱)를 기다리지 않고 그 이름으로 바로 적힌다');
  run(0.1); cmd(p, { t: 'stop' });
  check(fresh().length === 0, '지갑이 알린 것은 뒤따르는 경계에서 한 번 더 적히지 않는다');

  // 이름 없이 준 것: 경계의 차이로 드러난다
  w.add(p, 'gold', 40, ''); g.players.grant(p, 5, 3);
  check(fresh().length === 0, "이름을 비우면('') 바로 적지 않는다");
  g.ledger.note(p, 'setup');
  check(same(fresh(), ['gold setup +40', 'exp setup +5', 'sparks setup +3']), 'note가 붙인 이름으로 적힌다 (시험의 준비, 운영 도구)');
  w.add(p, 'gold', 1, ''); run(0.05);
  check(same(fresh(), ['gold other +1']), '이름도 없고 note도 없으면 other로 남는다');

  // 지갑 밖에서 고친 것은 어디서 드러나든 other·tick이다: 명령의 이름으로 숨지 않는다
  g.commands.set('cheat', (q) => { q.gold += 55; q.sparks += 2; q.items.iron = (q.items.iron ?? 0) + 1; });
  cmd(p, { t: 'cheat' });
  check(same(fresh(), ['gold other +55', 'sparks other +2', 'item:iron other +1']), '명령 안에서 재화의 칸을 직접 고치면 그 명령의 이름이 아니라 other로 적힌다 (재료도 같다: 가방 통로 밖의 변화다. bag.test.ts)');
  const orig = g.party.tick.bind(g.party);
  g.party.tick = (dt) => { p.gold += 9; w.add(p, 'gold', 4, 'drip'); orig(dt); };
  run(0.05);
  g.party.tick = orig;
  check(same(fresh(), ['gold tick +9', 'gold drip +4']), '틱 안에서 직접 고친 것은 tick으로, 같은 틱에 지갑으로 준 것은 제 이름으로 적힌다');
  // 장부에 쓸 수 없는 이름
  w.add(p, 'gold', 3, 'a|b'); w.add(p, 'gold', 2, 'x'.repeat(80));
  check(same(fresh(), ['gold other +5']) && mailWhy('idle') === 'mail:idle' && mailWhy('a|b') === 'mail:unknown' && mailWhy('') === 'mail:unknown', '줄을 가르는 글자가 섞이거나 너무 긴 이름은 other로 적는다. 우편의 종류도 걸러서 이름으로 쓴다');
  // 장부의 캐릭터별 기록(오늘 번·쓴 골드)도 지갑을 따라 센다
  const st = g.ledger.statsOf(p)!;
  check(st.d[1] === 300 + 40 + 1 + 55 + 9 + 4 + 5 && st.d[2] === 20, `오늘 번 골드(${st.d[1]})와 쓴 골드(${st.d[2]})`);
}

// ---------- 틀의 시스템이 넘기는 원인의 이름: 장부가 명령에 붙이는 이름과 같다 ----------
{
  const { g, at, kill, cmd, hero, fresh } = bench();
  const w = g.wallet, p = hero('이름', 'key-n'), mate = hero('동료', 'key-m');
  w.add(p, 'gold', 30000, 'setup'); w.add(mate, 'gold', 5000, 'setup');
  p.items.iron = 30; p.items.hide = 20; g.ledger.note(p, 'setup');
  g.gear.random = () => 0.999; // 장비는 떨어지지 않는다
  const rnd = Math.random;
  Math.random = () => 0.5; // 처치 보상의 굴림을 고정한다
  fresh();

  at(p, CAMPS[2].x, CAMPS[2].z);
  kill(p, 'wolf');
  const wolf = fresh();
  check(wolf.length === 3 && wolf.every((r) => r.includes(` ${ECON_HUNT.live} +`)), `처치 보상(골드, 경험치, 불씨)은 hunt로 적힌다 (${wolf.join(', ')})`);
  p.auto = true; g.away.start(p); kill(p, 'wolf'); g.away.stop(p); p.auto = false;
  check(fresh().every((r) => r.includes(` ${ECON_HUNT.away} +`)), '서버가 대신 사냥하는 동안은 huntAway로 적힌다');

  at(p, SHOP.x + 1, SHOP.z);
  cmd(p, { t: 'buy', id: 'potion' });
  check(same(fresh(), [`gold ${WHY.buy} -${ITEMS.potion.price}`, `item:potion ${WHY.buy} +1`]) && WHY.buy === 'cmd:buy', '상점: 낸 골드(지갑)와 받은 물약(가방)이 같은 이름 cmd:buy에 놓인다');
  at(p, SMITHY.x + 1, SMITHY.z + 1);
  const recipe = RECIPES.find((r) => r.id === 'sword3')!;
  cmd(p, { t: 'craft', id: 'sword3' });
  check(fresh().includes(`gold ${WHY.craft} -${recipe.gold}`) && p.weapon === 'sword3', '제작: cmd:craft');
  const ring = g.gear.roll(3, 1, 'ring'), junk = g.gear.roll(1, 0, 'charm');
  g.gear.put(p, ring); g.gear.put(p, junk); g.ledger.note(p, 'setup'); fresh();
  g.gear.random = () => 0;
  cmd(p, { t: 'enhance', uid: ring.uid });
  check(same(fresh(), [`gold ${WHY.enhance} -${ENHANCE.gold(0, 1)}`]) && ring.plus === 1, '강화: cmd:enhance');
  const gold0 = p.gold;
  cmd(p, { t: 'sell', uid: junk.uid });
  check(same(fresh(), [`gold ${WHY.sell} +${p.gold - gold0}`, `gear:common ${WHY.sell} -1`]) && p.gold > gold0, '판매: cmd:sell');
  cmd(p, { t: 'skillUp', id: 'smash' }); cmd(p, { t: 'stat', k: 'pow' }); cmd(p, { t: 'statReset' });
  const build = fresh();
  check(build.length === 2 && build.some((r) => r.startsWith(`gold ${WHY.skillUp} -`)) && build.some((r) => r.startsWith(`gold ${WHY.statReset} -`)), '기술 강화와 능력치 돌려받기: cmd:skillUp, cmd:statReset');
  cmd(p, { t: 'guild', a: 'create', name: '지갑길드' }); cmd(p, { t: 'guild', a: 'give', n: 100 });
  check(same(fresh(), [`gold ${WHY.guildCreate} -${GUILD.createGold}`, `gold ${WHY.guildGive} -100`]), '길드: cmd:guild:create, cmd:guild:give');
  cmd(p, { t: 'mailClaim', id: 0 });
  check(same(fresh(), [`gold mail:attend +${ATTEND[0].gold}`, `gold mail:daily +${DAILIES.enhance1.r.gold}`]), '우편: 우편마다 mail:종류로 적힌다 (출석 첫날, 일일 임무: 강화 한 번)');

  // 거래소: 사는 사람이 낸 값은 이동(market:out)으로, 파는 사람이 우편으로 받은 값도 이동(market:in)으로 적힌다
  cmd(p, { t: 'market', a: 'post', uid: ring.uid, price: 200 }); fresh();
  g.out = []; cmd(p, { t: 'market', a: 'mine' });
  const id = (g.out.filter((o) => o.id === p.id && o.msg.t === 'market').pop()?.msg as { list: MarketItem[] }).list[0].id;
  cmd(mate, { t: 'market', a: 'buy', id });
  check(same(fresh(), ['gold market:out -200', `gear:uncommon ${WHY.marketBuy} +1`]) && WHY.marketBuy === 'cmd:market:buy', '거래소에서 사기: 골드는 market:out, 받은 장비는 cmd:market:buy');
  cmd(p, { t: 'mailClaim', id: 0 });
  check(same(fresh(), [`gold market:in +${200 - marketFee(200)}`]), '판 값을 우편으로 받기: market:in');
  Math.random = rnd;
  check(g.ledger.rows().every((r) => r.why !== 'other' && r.why !== 'tick'), '이 흐름에서 원인을 가리지 못한 줄(other, tick)이 없다: 지갑 밖에서 바뀐 재화가 없다');
}

// ---------- 수급 배율 ----------
{
  const { g, at, kill, cmd, hero, fresh } = bench();
  const w = g.wallet, p = hero('배율', 'key-s');
  w.add(p, 'gold', 1000, 'setup');
  g.gear.random = () => 0.999;
  const rnd = Math.random;
  Math.random = () => 0.5;
  at(p, CAMPS[2].x, CAMPS[2].z);
  const kills = (): { gold: number; exp: number; sparks: number; said: number[] } => {
    const a = { gold: p.gold, sparks: p.sparks };
    g.notices = []; fresh();
    kill(p, 'wolf');
    const rows = fresh(), n = (cur: string) => Number(rows.find((r) => r.startsWith(`${cur} ${ECON_HUNT.live} +`))?.split('+')[1] ?? 0);
    const note = g.notices.find((x) => x.id === p.id && x.k === 'kill')!;
    return { gold: p.gold - a.gold === n('gold') ? n('gold') : NaN, exp: n('exp'), sparks: p.sparks - a.sparks === n('sparks') ? n('sparks') : NaN, said: [Number(note.a[3]), Number(note.a[1]), Number(note.a[2])] };
  };
  const plain = kills();
  // 굴림을 0.5로 고정했으므로 범위의 가운데 값이 나온다
  const mid = (r: readonly [number, number]) => r[0] + Math.floor(0.5 * (r[1] - r[0] + 1)), wolf = MONSTERS.wolf;
  check(w.scale.length === 0 && plain.gold === mid(wolf.gold) && plain.gold === 7 && plain.exp === wolf.exp && plain.sparks === mid(wolf.sparks) && plain.said.join() === [plain.gold, plain.exp, plain.sparks].join(),
    `등록된 배율이 없으면 그대로 받는다 (늑대: 골드 ${plain.gold}, 경험치 ${plain.exp}, 불씨 ${plain.sparks})`);

  // 시험용 배율: 사냥으로 받는 골드만 절반
  const calls: string[] = [];
  const half = (q: Ent, cur: Cur, n: number, why: string): number => { calls.push(`${q.name} ${cur} ${n} ${why}`); return cur === 'gold' && why === ECON_HUNT.live ? 0.5 : 1; };
  w.scale.push(half);
  const halved = kills();
  check(halved.gold === Math.floor(plain.gold * 0.5) && halved.gold === 3, `배율 0.5를 등록하면 처치 골드가 절반이 되고(${plain.gold} → ${halved.gold}, 내림), 장부에도 절반으로 적힌다`);
  check(halved.exp === plain.exp && halved.sparks === plain.sparks, '배율 함수가 1을 돌려준 재화(경험치, 불씨)는 그대로다');
  check(halved.said.join() === [3, plain.exp, plain.sparks].join(), '처치 안내문에도 실제로 받은 양이 적힌다');
  check(calls.includes(`배율 gold ${plain.gold} ${ECON_HUNT.live}`), '배율 함수는 받는 사람, 재화, 배율을 걸기 전의 양, 원인의 이름을 받는다');

  // 빼기에는 배율이 걸리지 않는다
  calls.length = 0;
  at(p, SHOP.x + 1, SHOP.z);
  const gold = p.gold;
  cmd(p, { t: 'buy', id: 'potion' });
  check(p.gold === gold - ITEMS.potion.price && calls.length === 0 && same(fresh(), [`gold ${WHY.buy} -${ITEMS.potion.price}`, `item:potion ${WHY.buy} +1`]), '빼기(값 치르기)에는 배율이 걸리지 않는다: 배율 함수가 불리지도 않는다');
  // 다른 원인에는 걸리지 않고, 여럿이면 곱한다
  check(w.add(p, 'gold', 10, 'gift') === 10, '배율 함수가 가리지 않은 원인은 그대로 받는다');
  w.scale.push((_q, cur) => (cur === 'gold' ? 0.5 : 1));
  check(w.add(p, 'gold', 10, ECON_HUNT.live) === 2 && w.add(p, 'gold', 10, 'gift') === 5, '배율이 여럿이면 모두 곱한다 (0.5 × 0.5: 10 → 2)');
  w.scale.push(() => 0);
  check(w.add(p, 'gold', 10, 'gift') === 0 && w.amount(p, 'exp', 10, 'gift') === 0, '배율 0은 주지 않는다');
  w.scale.length = 0;
  for (const broken of [NaN, -1, Infinity, undefined as unknown as number]) w.scale.push(() => broken);
  check(w.add(p, 'gold', 10, 'gift') === 10, '깨진 배율(NaN, 음수, 무한대)은 없는 것으로 친다');
  w.scale.length = 0;
  w.scale.push(() => 0.29);
  check(w.add(p, 'gold', 100, 'gift') === 29, '부동소수 오차로 하나 덜 주지 않는다 (100 × 0.29 = 29)');
  w.scale.length = 0;
  check(kills().gold === plain.gold, '배율을 거두면 처음으로 돌아간다');
  Math.random = rnd;
}

// ---------- 재화의 칸을 직접 고치는 코드가 지갑 밖에 없다 (소스를 읽는다) ----------
{
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const rel = (f: string) => path.relative(root, f).replaceAll('\\', '/');
  const walk = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : [])) : []);
  // 서버와 공용 코드만 본다 (틀과 모든 게임). 화면(client)이 들고 있는 값은 서버가 보낸 것의 사본이고, 시험(test)은 준비로 직접 고친다
  const games = fs.readdirSync(path.join(root, 'games'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const dirs = ['engine/server', 'engine/shared', ...games.flatMap((n) => [`games/${n}/server`, `games/${n}/shared`])];
  const files = dirs.flatMap((d) => walk(path.join(root, d))).map(rel).filter((f) => !/\.test\.ts$/.test(f));
  /** 재화의 칸에 값을 넣는 모양: .gold = / += / -= / *= / ++ / -- (견주기 ==, 화살표 =>는 아니다) */
  const WRITE = /\.(gold|sparks|exp)\s*(?:[-+*/%]?=(?![=>])|\+\+|--)/;
  /** 직접 고쳐도 되는 곳: 파일, 그 줄의 모양, 까닭. 이 목록에 없는 곳에서 재화의 칸을 고치면 실패한다 */
  const ALLOWED: { file: string; line: RegExp; why: string }[] = [
    { file: 'engine/server/game/systems/players.ts', line: /p\.exp = n\(save\.exp,/, why: '저장을 읽는다 (spawn): 새로 생긴 재화가 아니다' },
    { file: 'engine/server/game/systems/players.ts', line: /p\.sparks = n\(save\.sparks,/, why: '저장을 읽는다 (spawn)' },
    { file: 'engine/server/game/systems/players.ts', line: /p\.gold = n\(save\.gold,/, why: '저장을 읽는다 (spawn)' },
    { file: 'engine/server/game/systems/players.ts', line: /p\.exp -= p\.need; p\.need = nextNeed/, why: '레벨 업 (levelUp): 찬 경험치를 필요치만큼 덜어 레벨로 바꾼다. 지갑이 경험치를 더한 뒤에 부른다' },
    { file: 'engine/server/game/systems/guild.ts', line: /rec\.exp \+= n;/, why: '길드의 누적 기부(GuildRec.exp)다. 캐릭터의 재화가 아니다' },
    { file: 'engine/server/game/systems/ledger.ts', line: /\bt\.gold = p\.gold; t\.sparks = p\.sparks;/, why: '장부의 기준값(Track)을 옮긴다. 캐릭터의 칸이 아니다' },
    { file: 'engine/server/game/systems/ledger.ts', line: /t\.gold \+= d; else if \(cur === 'sparks'\) t\.sparks \+= d;/, why: '장부의 기준값(Track)을 지갑이 알린 만큼 옮긴다' },
  ];
  /** 지갑 자신: 칸의 이름을 변수로 고친다 (p[cur] += n) */
  const WALLET = 'engine/server/game/systems/wallet.ts';
  const used = new Set<number>(), stray: string[] = [];
  let writes = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = /^\s*(\*|\/\*|\/\/)/.test(raw) ? '' : raw.replace(/\s\/\/ .*$/, ''); // 주석은 보지 않는다
      if (!WRITE.test(line) || f === WALLET) return;
      writes++;
      const k = ALLOWED.findIndex((a) => a.file === f && a.line.test(line));
      if (k >= 0) used.add(k); else stray.push(`${f}:${i + 1}: ${raw.trim().slice(0, 100)}`);
    });
  }
  for (const s of stray) console.log('      ' + s);
  check(files.length >= 60 && files.includes(WALLET) && files.includes('engine/server/game/systems/players.ts') && files.some((f) => f.startsWith('games/')) && writes >= ALLOWED.length,
    `서버와 공용 소스를 읽었다 (${files.length}개 파일: 틀과 게임 ${games.join(', ')})`);
  check(stray.length === 0, `재화의 칸(.gold, .sparks, .exp)을 직접 고치는 코드가 지갑과 허용 목록 밖에 없다${stray.length ? ` (${stray.length}곳: 위)` : ''}`);
  const unused = ALLOWED.filter((_, k) => !used.has(k));
  check(unused.length === 0, `허용 목록의 줄이 모두 실제로 있다 (${ALLOWED.length}곳)${unused.length ? ': 없는 것 ' + unused.map((a) => `${a.file} ${a.line}`).join(', ') : ''}`);
  // 검사가 실제로 잡아내는가
  const hits = ['p.gold += 5;', 'p.gold -= cost;', 'p.sparks=0', 'q.exp ++', 'e.gold--;', 'this.p.gold *= 2', 'a.gold = b.gold'].filter((s) => WRITE.test(s));
  const misses = ['if (p.gold === 5)', 'p.gold >= cost', 'x = p.gold;', '{ gold: 5, exp: 0 }', 'p.gold == 1', '(r) => r.gold', 'm.r.gold ?? 0', 'p.golden = 1'].filter((s) => WRITE.test(s));
  check(hits.length === 7 && misses.length === 0, '검사의 모양: 값을 넣는 줄은 잡고, 읽거나 견주는 줄은 잡지 않는다');
  // 지갑의 통로를 실제로 쓰고 있는가 (틀의 시스템과 게임의 규칙 시스템)
  const uses = files.filter((f) => f !== WALLET && /\.wallet\.(add|take|can|amount)\(/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  const want = ['players', 'gear', 'shop', 'craft', 'build', 'guild', 'market', 'mail'].map((n) => `engine/server/game/systems/${n}.ts`);
  check(want.every((f) => uses.includes(f)) && uses.some((f) => f.startsWith('games/')), `틀의 시스템 ${want.length}곳과 게임의 규칙 시스템이 지갑을 쓴다 (${uses.length}개 파일)`);
}
