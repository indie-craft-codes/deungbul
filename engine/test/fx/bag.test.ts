// 가방(g.bag): 아이템(재료, 물약)과 낱개 장비를 넣고 빼는 한 통로 (서버 없이 게임 규칙만 돌린다. 규칙 플러그인 없는 틀만의 게임이다). (시험용 내용 위에서)
// 넣기·빼기·한도·깨진 값, 가방 칸 수, 장부와의 관계(가방이 원인을 직접 알린다, 가방 밖의 변화는 other·tick으로 드러난다),
// 그리고 "아이템의 칸과 장비 목록을 직접 고치는 코드가 가방 밖에 없다"를 소스를 읽어 검사한다 (wallet.test.ts와 같은 방식).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORGES, SHOPS } from '../../shared/defs';
import { CAMPS, ECON_HUNT, ECON_LOST_FULL, GEAR, MAT_MAX, POTION_MAX, itemCap, type MarketItem } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { gearCur, itemCur } from '../../server/game/systems/bag';
import { WHY } from '../../server/game/systems/wallet';
import type { EconRow } from '../../server/store';
import { check } from '../harness';

/** 시험용 내용의 상인과 대장간 */
const SHOP = SHOPS[0], SMITHY = FORGES[0];

type MonsterType = Parameters<Game['monsters']['spawn']>[0];

function bench() {
  const t = { clock: new Date(2026, 0, 10, 9).getTime() };
  const g = new Game({ now: () => t.clock });
  const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.targetId = 0; };
  const kill = (p: Ent, type: MonsterType) => { const m = g.monsters.spawn(type, p.x + 1, p.z); m.layer = p.layer; g.combat.damage(p, m, 1e6, false); };
  const cmd = (p: Ent, m: Record<string, unknown>) => g.command(p, m);
  const run = (s: number) => { for (let i = 0, n = Math.round(s * 20); i < n; i++) { g.tick(0.05); t.clock += 50; } };
  const hero = (name: string, pid: string) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'knight'); while (p.lv < 12) g.players.grant(p, 400, 0); p.hp = p.maxHp; g.ledger.note(p, 'setup'); return p; };
  /** 마지막으로 부른 뒤에 장부에 새로 적힌 것: '재화 원인 방향양'과, 그 줄의 건수 */
  let seen = new Map<string, number>(), seenN = new Map<string, number>();
  const fresh = (): string[] => {
    const now = new Map(g.ledger.rows().map((r: EconRow) => [`${r.cur} ${r.why} ${r.dir}`, r.amount])), out: string[] = [];
    for (const [k, v] of now) { const d = v - (seen.get(k) ?? 0); if (d) out.push(k + d); }
    seen = now;
    return out.sort();
  };
  const counts = (): Map<string, number> => {
    const now = new Map(g.ledger.rows().map((r: EconRow) => [`${r.cur} ${r.why} ${r.dir}`, r.n])), out = new Map<string, number>();
    for (const [k, v] of now) { const d = v - (seenN.get(k) ?? 0); if (d) out.set(k, d); }
    seenN = now;
    return out;
  };
  return { t, g, at, kill, cmd, run, hero, fresh, counts };
}
const same = (got: string[], want: string[]): boolean => [...got].sort().join(' | ') === [...want].sort().join(' | ');
/** 지금 가진 수 (함수로 읽는다: 한 식 안에서 값이 바뀌는 것을 타입 검사가 모르므로) */
const has = (p: Ent, id: string): number => p.items[id] ?? 0;

// ---------- 아이템: 넣기, 빼기, 한도, 깨진 값 ----------
{
  const { g, hero } = bench();
  const b = g.bag, p = hero('가방', 'key-b');
  const heard: string[] = [];
  b.seen.push((q, cur, d, why) => { if (q === p) heard.push(`${cur} ${d} ${why}`); });
  p.dirty = false; p.unsaved = false;
  check(b.count(p, 'ore') === 0 && b.putItem(p, 'ore', 5, 'test') === 5 && has(p, 'ore') === 5 && p.dirty && p.unsaved, '넣으면 받은 수를 돌려주고, 저장하고 알릴 것으로 표시한다');
  check(b.takeItem(p, 'ore', 2, 'test') && has(p, 'ore') === 3 && !b.takeItem(p, 'ore', 4, 'test') && has(p, 'ore') === 3, '가진 만큼만 뺀다: 모자라면 false를 돌려주고 아무것도 바꾸지 않는다');
  check(same(heard, ['item:ore 5 test', 'item:ore -2 test']) && itemCur('ore') === 'item:ore', '가방을 지난 변화는 듣는 쪽(seen)에 원인과 함께 알린다: 넣었으면 +, 뺐으면 −. 바뀐 것이 없으면 알리지 않는다');
  check(itemCap('ore') === MAT_MAX && itemCap('draught') === POTION_MAX && itemCap('blade2') === 0, '한도: 재료와 물약은 종류마다의 한도, 낱개 장비로 다루는 무기와 갑옷은 0');
  check(b.room(p, 'ore') === MAT_MAX - 3 && b.putItem(p, 'ore', MAT_MAX, 'test') === MAT_MAX - 3 && has(p, 'ore') === MAT_MAX && b.putItem(p, 'ore', 1, 'test') === 0, `한도(${MAT_MAX})까지만 들어가고, 실제로 받은 수를 돌려준다`);
  check(b.putItem(p, 'draught', POTION_MAX + 5, 'test') === POTION_MAX && b.putItem(p, 'blade2', 1, 'test') === 0 && !('blade2' in p.items), '물약도 제 한도를 따르고, 무기는 아이템 칸에 들어가지 않는다');
  const bad = [NaN, Infinity, -1, 0, 1.5, undefined as unknown as number, '2' as unknown as number];
  check(bad.every((n) => b.putItem(p, 'pelt', n, 'test') === 0 && !b.takeItem(p, 'ore', n, 'test')) && has(p, 'ore') === MAT_MAX && !has(p, 'pelt'), '깨진 수(NaN, 무한대, 음수, 0, 소수, 수가 아닌 값)는 넣지도 빼지도 않는다');
  check(b.putItem(p, 'nothing' as 'ore', 1, 'test') === 0, '없는 아이템은 넣지 않는다');
}

// ---------- 장비: 넣기, 빼기, 가방 칸 수 ----------
{
  const { g, hero } = bench();
  const b = g.bag, p = hero('장비', 'key-g');
  const heard: string[] = [];
  b.seen.push((q, cur, d, why) => { if (q === p) heard.push(`${cur} ${d} ${why}`); });
  const n0 = p.gear.length, ring = g.gear.roll(3, 2, 'ring');
  check(b.slots(p) === GEAR.bagMax && !b.full(p), `가방 칸 수는 캐릭터마다 묻는다 (지금은 모두 ${GEAR.bagMax})`);
  check(b.giveGear(p, ring, 'test') && ring.uid === p.gearSeq && p.gear.includes(ring) && p.gear.length === n0 + 1, '장비를 넣으면 그 캐릭터 안의 새 번호가 붙는다');
  check(b.removeGear(p, ring.uid, 'test') === ring && !p.gear.includes(ring) && b.removeGear(p, ring.uid, 'test') === undefined && b.removeGear(p, 9999, 'test') === undefined, '뺀 장비를 돌려준다. 없는 번호는 undefined');
  check(same(heard, ['gear:rare 1 test', 'gear:rare -1 test']) && gearCur(2) === 'gear:rare', '장비는 등급별 이름으로 알린다');
  while (!b.full(p)) b.giveGear(p, g.gear.roll(1, 0), '');
  const extra = g.gear.roll(1, 0), seq = p.gearSeq;
  check(p.gear.length === GEAR.bagMax && !b.giveGear(p, extra, 'test') && p.gearSeq === seq && extra.uid === 0, '가득 찼으면 넣지 않고 false를 돌려준다 (번호도 쓰지 않는다)');
  check(b.giveGear(p, extra, 'test', true) && p.gear.length === GEAR.bagMax + 1, 'force: 값을 치르고 얻은 것은 가득 차도 들어간다');
  // 낀 장비를 빼면 그 칸이 빈다
  const worn = g.gear.roll(2, 1, 'charm');
  b.removeGear(p, extra.uid, ''); b.removeGear(p, p.gear[p.gear.length - 1].uid, '');
  b.giveGear(p, worn, ''); g.gear.equip(p, worn.uid);
  check(p.worn.charm === worn.uid && b.removeGear(p, worn.uid, '') === worn && p.worn.charm === undefined, '끼고 있던 장비를 빼면 그 칸도 비운다');
}

// ---------- 장부와의 관계 ----------
{
  const { g, at, kill, cmd, run, hero, fresh, counts } = bench();
  const b = g.bag, p = hero('장부', 'key-l'), mate = hero('동료', 'key-m');
  g.wallet.add(p, 'gold', 30000, 'setup'); g.wallet.add(mate, 'gold', 5000, 'setup');
  fresh();
  b.putItem(p, 'ore', 30, 'gift'); b.putItem(p, 'pelt', 20, 'gift'); b.takeItem(p, 'ore', 1, 'fee');
  const ring = g.gear.roll(3, 1, 'ring'), junk = g.gear.roll(1, 0, 'charm');
  b.giveGear(p, ring, 'gift'); b.giveGear(p, junk, 'gift');
  check(same(fresh(), ['item:ore gift +30', 'item:pelt gift +20', 'item:ore fee -1', 'gear:uncommon gift +1', 'gear:common gift +1']), '원인의 이름을 넘기면 경계(명령, 틱)를 기다리지 않고 그 이름으로 바로 적힌다');
  run(1.1); cmd(p, { t: 'stop' });
  check(fresh().length === 0, '가방이 알린 것은 뒤따르는 경계(틱의 전수 조사, 명령)에서 한 번 더 적히지 않는다');

  // 이름 없이 넣은 것: 경계의 차이로 드러난다
  b.putItem(p, 'pelt', 2, ''); b.giveGear(p, g.gear.roll(1, 0), '');
  check(fresh().length === 0, "이름을 비우면('') 바로 적지 않는다");
  g.ledger.note(p, 'setup');
  check(same(fresh(), ['item:pelt setup +2', 'gear:common setup +1']), 'note가 붙인 이름으로 적힌다 (시험의 준비, 운영 도구)');
  b.putItem(p, 'pelt', 1, ''); run(1.1);
  check(same(fresh(), ['item:pelt tick +1']), '이름도 없고 note도 없으면 other·tick으로 남는다');

  // 가방 밖에서 고친 것은 어디서 드러나든 other·tick이다: 명령의 이름으로 숨지 않는다
  g.commands.set('cheat', (q) => { q.items.ore = (q.items.ore ?? 0) + 3; q.gear.push({ ...g.gear.roll(1, 3), uid: ++q.gearSeq }); b.putItem(q, 'pelt', 1, 'cmd:cheat'); });
  cmd(p, { t: 'cheat' });
  check(same(fresh(), ['item:ore other +3', 'gear:epic other +1', 'item:pelt cmd:cheat +1']), '명령 안에서 아이템 칸과 장비 목록을 직접 고치면 그 명령의 이름이 아니라 other로 적히고, 같은 명령이 가방으로 넣은 것은 제 이름으로 적힌다');
  const orig = g.party.tick.bind(g.party);
  g.party.tick = (dt) => { p.items.ore--; b.putItem(p, 'pelt', 1, 'drip'); orig(dt); };
  run(0.05);
  g.party.tick = orig;
  run(1.1);
  check(same(fresh(), ['item:ore tick -1', 'item:pelt drip +1']), '틱 안에서 직접 고친 것은 tick으로(길어야 1초 뒤), 같은 틱에 가방으로 넣은 것은 제 이름으로 적힌다');
  b.putItem(p, 'pelt', 1, 'a|b'); run(1.1);
  check(same(fresh(), ['item:pelt tick +1']), '줄을 가르는 글자가 섞인 이름은 받지 않는다 (other·tick으로 남는다)');
  p.gear.splice(p.gear.findIndex((x) => x.rar === 3), 1); g.ledger.note(p, 'setup'); fresh(); counts();

  // 틀의 시스템이 넘기는 원인의 이름: 장부가 명령에 붙이는 이름과 같고, 건수는 경계마다 하나다
  g.gear.random = () => 0.999; // 장비는 떨어지지 않는다
  const rnd = Math.random;
  Math.random = () => 0; // 재료는 반드시 떨어진다
  at(p, CAMPS[2].x, CAMPS[2].z);
  kill(p, 'tusk');
  check(fresh().includes(`item:pelt ${ECON_HUNT.live} +1`), '처치로 얻은 재료: hunt');
  p.auto = true; g.away.start(p); kill(p, 'tusk'); g.away.stop(p); p.auto = false;
  check(fresh().includes(`item:pelt ${ECON_HUNT.away} +1`), '서버가 대신 사냥하는 동안 얻은 재료: huntAway');
  Math.random = () => 0.5;
  g.gear.random = () => 0; // 장비가 반드시 떨어진다 (일반 등급)
  kill(p, 'hound');
  check(fresh().some((r) => r.startsWith('gear:') && r.endsWith(` ${ECON_HUNT.live} +1`)), '처치로 얻은 장비: hunt');
  g.gear.random = () => 0.999;
  const dropped = p.gear[p.gear.length - 1];
  counts();

  at(p, SHOP.x + 1, SHOP.z);
  cmd(p, { t: 'buy', id: 'draught' }); cmd(p, { t: 'buy', id: 'blade2' });
  check(same(fresh().filter((r) => !r.startsWith('gold')), [`item:draught ${WHY.buy} +1`, `gear:common ${WHY.buy} +1`]), '상점: 받은 물약과 장비가 낸 골드와 같은 이름 cmd:buy에 놓인다');
  p.hp = 1; cmd(p, { t: 'use', id: 'draught' });
  check(same(fresh(), [`item:draught ${WHY.use} -1`]) && WHY.use === 'cmd:use', '물약 마시기: cmd:use');
  at(p, SMITHY.x + 1, SMITHY.z + 1);
  cmd(p, { t: 'craft', id: 'blade3' });
  const crafted = fresh().filter((r) => !r.startsWith('gold'));
  check(same(crafted, [`item:ore ${WHY.craft} -4`, `item:pelt ${WHY.craft} -2`, `gear:common ${WHY.craft} +1`]), `제작: 쓴 재료와 만든 장비가 cmd:craft (${crafted.join(', ')})`);
  cmd(p, { t: 'sell', uid: junk.uid });
  check(fresh().includes(`gear:common ${WHY.sell} -1`), '판매: cmd:sell');
  cmd(p, { t: 'market', a: 'post', uid: ring.uid, price: 200 }); cmd(p, { t: 'market', a: 'post', item: 'ore', n: 3, price: 30 });
  check(same(fresh(), [`gear:uncommon ${WHY.marketPost} -1`, `item:ore ${WHY.marketPost} -3`]) && WHY.marketPost === 'cmd:market:post', '거래소에 올리기: cmd:market:post');
  g.out = []; cmd(p, { t: 'market', a: 'mine' });
  const mine = (g.out.filter((o) => o.id === p.id && o.msg.t === 'market').pop()?.msg as { list: MarketItem[] }).list;
  cmd(mate, { t: 'market', a: 'buy', id: mine.find((l) => l.gear)!.id });
  check(fresh().includes(`gear:uncommon ${WHY.marketBuy} +1`), '거래소에서 사기: cmd:market:buy');
  cmd(p, { t: 'market', a: 'cancel', id: mine.find((l) => !l.gear)!.id });
  check(same(fresh(), [`item:ore ${WHY.marketCancel} +3`]) && WHY.marketCancel === 'cmd:market:cancel', '거래소에서 내리기: cmd:market:cancel');
  const n = [...counts()].filter(([k]) => !k.startsWith('gold')).map(([, v]) => v);
  check(n.length >= 10 && n.every((v) => v === 1), `명령 하나가 바꾼 장비와 아이템은 재화와 원인마다 한 건으로 적힌다 (${n.join(',')})`);

  // 우편: 우편마다 mail:종류로, 물건마다 한 건
  g.mail.send(p, 'marketBack', ['ore', 2, 0], { items: { ore: 2 }, gear: [g.gear.roll(1, 0), g.gear.roll(1, 0)] });
  g.mail.send(p, 'marketBack', ['ore', 1, 0], { items: { ore: 1 } });
  cmd(p, { t: 'mailClaim', id: 0 });
  const mail = fresh().filter((r) => !r.startsWith('gold')), mailN = counts();
  check(same(mail, ['item:ore mail:marketBack +3', 'gear:common mail:marketBack +2']) && mailN.get('item:ore mail:marketBack +') === 2 && mailN.get('gear:common mail:marketBack +') === 2, '우편으로 받은 물건: mail:종류로, 우편의 물건마다 한 건');

  // 가방이 가득 차 버려진 장비: 생겼다가 사라진 것으로 적힌다
  while (!b.full(p)) b.giveGear(p, g.gear.roll(1, 0), '');
  g.ledger.note(p, 'setup'); fresh();
  g.gear.random = () => 0;
  g.notices = [];
  at(p, CAMPS[2].x, CAMPS[2].z);
  const before = p.gear.length;
  kill(p, 'hound');
  const lost = fresh().filter((r) => r.startsWith('gear:'));
  check(p.gear.length === before && same(lost, [`gear:common ${ECON_HUNT.live} +1`, `gear:common ${ECON_LOST_FULL} -1`]) && g.notices.some((x) => x.id === p.id && x.k === 'gearFull'), '가득 찬 가방에 떨어진 장비는 버려지고, 장부에는 hunt로 생겼다가 lostFull로 사라진 것으로 적힌다');
  g.gear.random = () => 0.999;
  Math.random = rnd;
  check(dropped.uid > 0 && g.ledger.rows().filter((r) => r.why === 'other' || r.why === 'tick').every((r) => ['item:ore', 'item:pelt', 'gear:epic'].includes(r.cur)), '이 흐름에서 원인을 가리지 못한 줄은 위에서 일부러 직접 고친 것뿐이다');
}

// ---------- 저장을 읽을 때의 한도 ----------
{
  const { g } = bench();
  const list = Array.from({ length: GEAR.bagMax + 6 }, (_, i) => ({ ...g.gear.roll(1, 0, 'ring'), uid: i + 1 }));
  const p = g.players.spawn('가득', false, { name: '가득', lv: 5, exp: 0, need: 100, maxHp: 100, sparks: 0, gold: 10, items: { ore: 5000, draught: 500, blade2: 3 }, ext: { gear: { list, worn: { ring: GEAR.bagMax + 5 }, seq: 99 } } }, 'key-full');
  check(p.gear.filter((x) => x.slot === 'ring').length === g.bag.slots(p) && p.worn.ring === GEAR.bagMax + 5 && p.gear[0].uid === GEAR.bagMax + 5, '저장을 읽을 때 장비는 그 캐릭터의 가방 칸 수로 자르고, 끼고 있던 것부터 남긴다');
  check(p.items.ore === MAT_MAX && p.items.draught === POTION_MAX && !('blade2' in p.items), '아이템은 가방과 같은 한도(itemCap)로 자른다');
}

// ---------- 아이템의 칸과 장비 목록을 직접 고치는 코드가 가방 밖에 없다 (소스를 읽는다) ----------
{
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const rel = (f: string) => path.relative(root, f).replaceAll('\\', '/');
  const walk = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : [])) : []);
  // 서버와 공용 코드만 본다 (틀과 모든 게임). 화면(client)이 들고 있는 값은 서버가 보낸 것의 사본이고, 시험(test)은 준비로 직접 고친다
  // 게임이 하나도 없는 저장소(틀만 떼어 낸 것)에서도 돈다: 그때는 틀의 소스만 본다
  const games = fs.existsSync(path.join(root, 'games')) ? fs.readdirSync(path.join(root, 'games'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const dirs = ['engine/server', 'engine/shared', ...games.flatMap((n) => [`games/${n}/server`, `games/${n}/shared`])];
  const files = dirs.flatMap((d) => walk(path.join(root, d))).map(rel).filter((f) => !/\.test\.ts$/.test(f));
  /**
   * 아이템의 칸이나 장비 목록에 값을 넣는 모양:
   *   .items[x] = / += / -= / ++ / --,  .items.x = …,  .items = …,  delete ….items…
   *   .gear.push( / splice( / pop( / shift( / unshift( / sort( / reverse( / fill(,  .gear.length = …,  .gear[i] = …,  .gear = …
   * (견주기 ==, 화살표 =>는 아니다)
   */
  const SET = String.raw`\s*(?:[-+*/%]?=(?![=>])|\+\+|--)`;
  const WRITE = new RegExp([
    String.raw`\.items(?:\[[^\]]*\]|\.\w+)?${SET}`,
    String.raw`\bdelete\s+[\w.]+\.items\b`,
    String.raw`\.gear\.(?:push|splice|pop|shift|unshift|sort|reverse|fill)\(`,
    String.raw`\.gear(?:\.length|\[[^\]]*\])?${SET}`,
  ].join('|'));
  /** 직접 고쳐도 되는 곳: 파일, 그 줄의 모양, 까닭. 이 목록에 없는 곳에서 아이템의 칸이나 장비 목록을 고치면 실패한다 */
  const ALLOWED: { file: string; line: RegExp; why: string }[] = [
    { file: 'engine/server/game/systems/players.ts', line: /p\.items = Shop\.readItems\(save\.items\)/, why: '저장을 읽는다 (spawn): 새로 생긴 아이템이 아니다' },
    { file: 'engine/server/game/systems/gear.ts', line: /p\.gear = \[\.\.\.all\.filter/, why: '저장을 읽는다 (장비 칸의 load): 그 캐릭터의 가방 칸 수로 자른다' },
    { file: 'engine/server/game/systems/mail.ts', line: /if \(gear\.length\) r\.gear = gear;/, why: '저장된 우편의 보상을 읽는다 (Reward.gear). 캐릭터의 가방이 아니다' },
    { file: 'engine/server/game/systems/mail.ts', line: /if \(Object\.keys\(items\)\.length\) r\.items = items;/, why: '저장된 우편의 보상을 읽는다 (Reward.items)' },
    { file: 'engine/server/game/systems/mail.ts', line: /if \(restGear\.length\) m\.r\.gear = restGear;/, why: '받지 못한 장비를 우편에 남긴다 (Reward.gear)' },
    { file: 'engine/server/game/systems/mail.ts', line: /m\.r\.items = restItems;/, why: '받지 못한 아이템을 우편에 남긴다 (Reward.items)' },
    { file: 'engine/server/game/systems/market.ts', line: /if \(GearSys\.valid\(raw\.gear\)\) l\.gear = raw\.gear;/, why: '저장된 거래소 물건을 읽는다 (Listing.gear)' },
    { file: 'engine/server/game/systems/market.ts', line: /^\s*l\.gear = it;/, why: '올린 장비를 거래소가 맡는다 (Listing.gear). 가방에서는 통로로 뺐다' },
    { file: 'engine/server/game/systems/market.ts', line: /out\.items\[l\.item\] = \(out\.items\[l\.item\] \?\? 0\) \+ l\.n;/, why: '거래소가 맡은 재료의 합계 (held). 캐릭터의 칸이 아니다' },
    { file: 'engine/server/game/game.ts', line: /this\.gear = has\('gear'\) \? new GearSys\(this\)/, why: '장비 시스템을 만든다 (Game.gear). 캐릭터의 장비 목록이 아니다' },
    { file: 'engine/server/game/systems/players.ts', line: /if \(g\.has\('items'\)\) \{ out\.weapon = p\.weapon; out\.armor = p\.armor; out\.items = \{ \.\.\.p\.items \}; \}/, why: '저장 값을 만든다 (export: PlayerSave.items). 캐릭터의 칸이 아니다' },
    { file: 'engine/server/game/systems/status.ts', line: /if \(has\('items'\)\) s\.items = me\.items;/, why: '본인에게 보낼 메시지를 만든다 (stat.items)' },
    { file: 'engine/server/game/systems/status.ts', line: /if \(has\('gear'\)\) \{ s\.gear = me\.gear; s\.worn = me\.worn; \}/, why: '본인에게 보낼 메시지를 만든다 (meta.gear)' },
    { file: 'engine/server/game/systems/ledger.ts', line: /t\.gear\.fill\(0\); t\.nGear = p\.gear\.length;/, why: '장부의 기준값(Track)을 잡는다. 캐릭터의 칸이 아니다' },
    { file: 'engine/server/game/systems/ledger.ts', line: /for \(const it of p\.gear\) t\.gear\[it\.rar\]\+\+;/, why: '장부의 기준값(Track)' },
    { file: 'engine/server/game/systems/ledger.ts', line: /delete t\.items\[id\]; \}/, why: '장부의 기준값(Track)에서 없어진 칸을 지운다' },
    { file: 'engine/server/game/systems/ledger.ts', line: /t\.items = \{ \.\.\.p\.items \}; t\.nItems =/, why: '장부의 기준값(Track)' },
    { file: 'engine/server/game/systems/ledger.ts', line: /t\.gear\[i\] = n\[i\]; \}/, why: '장부의 기준값(Track)을 옮긴다' },
    { file: 'engine/server/game/systems/ledger.ts', line: /^\s*t\.items\[id\] = v;/, why: '장부의 기준값(Track)을 옮긴다' },
  ];
  /** 가방 자신 */
  const BAG = 'engine/server/game/systems/bag.ts';
  const used = new Set<number>(), stray: string[] = [];
  let writes = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = /^\s*(\*|\/\*|\/\/)/.test(raw) ? '' : raw.replace(/\s\/\/ .*$/, ''); // 주석은 보지 않는다
      if (!WRITE.test(line) || f === BAG) return;
      writes++;
      const k = ALLOWED.findIndex((a) => a.file === f && a.line.test(line));
      if (k >= 0) used.add(k); else stray.push(`${f}:${i + 1}: ${raw.trim().slice(0, 110)}`);
    });
  }
  for (const s of stray) console.log('      ' + s);
  check(files.length >= 40 && files.includes(BAG) && files.includes('engine/server/game/systems/gear.ts') && (games.length === 0 || files.some((f) => f.startsWith('games/'))) && writes >= ALLOWED.length,
    `서버와 공용 소스를 읽었다 (${files.length}개 파일: 틀과 게임 ${games.join(', ')})`);
  check(stray.length === 0, `아이템의 칸(.items)과 장비 목록(.gear)을 직접 고치는 코드가 가방과 허용 목록 밖에 없다${stray.length ? ` (${stray.length}곳: 위)` : ''}`);
  const unused = ALLOWED.filter((_, k) => !used.has(k));
  check(unused.length === 0, `허용 목록의 줄이 모두 실제로 있다 (${ALLOWED.length}곳)${unused.length ? ': 없는 것 ' + unused.map((a) => `${a.file} ${a.line}`).join(', ') : ''}`);
  // 검사가 실제로 잡아내는가
  const hits = ['p.items[id] = (p.items[id] ?? 0) + 1;', 'p.items[mat] -= n;', 'p.items[id]--;', 'p.items.ore = 20', 'q.items = {}', 'delete p.items[id]', 'p.gear.push(it);', 'p.gear.splice(p.gear.indexOf(it), 1);', 'p.gear.length = 0', 'p.gear[0] = it', 'p.gear = []', 'e.gear.pop()'].filter((s) => WRITE.test(s));
  const misses = ['if (p.items[id] > 0)', '(p.items[id] ?? 0) >= n', 'const n = p.items.ore;', '{ items: {}, gear: [] }', 'p.gear.length >= max', 'p.gear.find((x) => x.uid === uid)', 'p.gear.filter((x) => x.rar === 0)', 'g.gear.give(p, it)', 'this.g.gears.push({ id })', '(p) => p.items', 'p.gear.length === t.nGear', 'items: { ...p.items }'].filter((s) => WRITE.test(s));
  check(hits.length === 12 && misses.length === 0, `검사의 모양: 값을 넣는 줄은 잡고, 읽거나 견주는 줄은 잡지 않는다${misses.length ? ' (잘못 잡은 것: ' + misses.join(' / ') + ')' : ''}`);
  // 가방의 통로를 실제로 쓰고 있는가
  const uses = files.filter((f) => f !== BAG && /\.bag\.(putItem|takeItem|giveGear|removeGear|lost)\(/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  const want = ['gear', 'shop', 'craft', 'market', 'mail'].map((n) => `engine/server/game/systems/${n}.ts`);
  check(want.every((f) => uses.includes(f)), `틀의 시스템 ${want.length}곳이 가방을 쓴다 (${uses.length}개 파일)`);
}
