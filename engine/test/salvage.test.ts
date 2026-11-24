// 분해, 장비 가루, 잠금, 자동 분해, 가방 넓히기 (서버 없이 게임 규칙만 돌린다. 규칙 플러그인 없는 틀만의 게임이다).
// 규칙의 수치는 게임의 내용(SALVAGE, BAG_UP)에서 읽는다: 수치를 바꿔도 이 시험은 그대로 돈다.
import { SHOP, SMITHY } from '@game/shared/defs';
import { BAG_UP, CAMPS, DUNGEONS, ECON_HUNT, ECON_LOST_FULL, ENHANCE, GEAR, ITEMS, MAT_MAX, RARITIES, SALVAGE, autoSalvageChoices, bagSlots, bagUpPrice, canSalvage, dustFor, isItemId, isSupply, itemCap, salvageOn, sellPrice, type Gear, type ItemId, type MarketItem } from '../shared/defs';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { WHY } from '../server/game/systems/wallet';
import type { EconRow, PlayerSave } from '../server/store';
import { check } from './harness';

type MonsterType = Parameters<Game['monsters']['spawn']>[0];
const DUST = SALVAGE.item as ItemId;

function bench() {
  const t = { clock: new Date(2026, 0, 10, 9).getTime() };
  const g = new Game({ now: () => t.clock });
  const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.targetId = 0; };
  const kill = (p: Ent, type: MonsterType) => { const m = g.monsters.spawn(type, p.x + 1, p.z); m.layer = p.layer; g.combat.damage(p, m, 1e6, false); };
  const cmd = (p: Ent, m: Record<string, unknown>) => g.command(p, m);
  const run = (s: number) => { for (let i = 0, n = Math.round(s * 20); i < n; i++) { g.tick(0.05); t.clock += 50; } };
  const hero = (name: string, pid: string) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'warrior'); while (p.lv < 12) g.players.grant(p, 400, 0); p.hp = p.maxHp; g.ledger.note(p, 'setup'); return p; };
  /** 장비 한 점을 가방에 넣는다 (시험의 준비) */
  const gear = (p: Ent, rar: number, plus = 0, slot: Gear['slot'] = 'ring'): Gear => { const it = g.gear.roll(3, rar, slot); it.plus = plus; g.bag.giveGear(p, it, 'setup'); return it; };
  let seen = new Map<string, number>();
  const fresh = (): string[] => {
    const now = new Map(g.ledger.rows().map((r: EconRow) => [`${r.cur} ${r.why} ${r.dir}`, r.amount])), out: string[] = [];
    for (const [k, v] of now) { const d = v - (seen.get(k) ?? 0); if (d) out.push(k + d); }
    seen = now;
    return out.sort();
  };
  /** 그 사람이 받은 안내문 (마지막으로 부른 뒤의 것) */
  const said = (p: Ent): string[] => { const out = g.notices.filter((n) => n.id === p.id).map((n) => `${n.k}${n.a.length ? ' ' + n.a.join(',') : ''}`); g.notices = []; return out; };
  /** 그 사람의 개인 상태 한 칸 */
  const mine = <T>(p: Ent, name: string): T => g.personal.find((x) => x.name === name)!.state(p) as T;
  /** 나갔다가 다시 들어온다: 저장을 글로 바꿨다 되읽는다 */
  const relog = (p: Ent): Ent => { const save = JSON.parse(JSON.stringify(g.players.export(p))) as PlayerSave; g.players.leave(p.id); return g.players.spawn(p.name, false, save, p.pid); };
  return { t, g, at, kill, cmd, run, hero, gear, fresh, said, mine, relog };
}
const same = (got: string[], want: string[]): boolean => [...got].sort().join(' | ') === [...want].sort().join(' | ');
const dustOf = (p: Ent): number => p.items[DUST] ?? 0;
const goldOf = (p: Ent): number => p.gold;

// ---------- 정의: 가루 아이템과 수치 ----------
{
  check(salvageOn() && isItemId(SALVAGE.item) && ITEMS[DUST].kind === 'mat' && SALVAGE.dust.length === RARITIES.length, `분해의 표가 등급마다 차 있고, 나오는 것(${SALVAGE.item})은 재료 아이템이다`);
  check(itemCap(DUST) > MAT_MAX && itemCap('iron') === MAT_MAX, `가루의 한도(${itemCap(DUST)})는 다른 재료(${MAT_MAX})보다 크고, 다른 재료의 한도는 그대로다`);
  check(SALVAGE.dust.every((n, i) => n > 0 && (i === 0 || n > SALVAGE.dust[i - 1])), `등급이 높을수록 가루가 많다 (${SALVAGE.dust.join(', ')})`);
  check(dustFor({ rar: 0, plus: 0 }) === SALVAGE.dust[0] && dustFor({ rar: 2, plus: 4 }) === SALVAGE.dust[2] + 4 * SALVAGE.perPlus && dustFor({ rar: 3, plus: ENHANCE.max }) === SALVAGE.dust[3] + ENHANCE.max * SALVAGE.perPlus, '나오는 가루 = 등급별 양 + 강화 단계 × 덤');
  check(same(autoSalvageChoices().map(String), ['-1', ...RARITIES.map((_, i) => i).filter((i) => i <= SALVAGE.autoMaxRar).map(String)]) && SALVAGE.autoMaxRar < RARITIES.length - 1, '자동 분해의 선택지: 끔과, 가장 높은 등급을 뺀 등급들');
  check(bagSlots(0) === GEAR.bagMax && bagSlots(BAG_UP.prices.length) === GEAR.bagMax + BAG_UP.prices.length * BAG_UP.step && bagSlots(99) === bagSlots(BAG_UP.prices.length) && bagUpPrice(0) === BAG_UP.prices[0] && bagUpPrice(BAG_UP.prices.length) === null, '가방 칸 수와 넓히는 값의 셈');
  check(SALVAGE.maxBatch >= bagSlots(BAG_UP.prices.length), '한 번에 분해할 수 있는 수가 끝까지 넓힌 가방보다 작지 않다 (일괄 분해가 한 번에 된다)');
}

// ---------- 분해 ----------
{
  const { g, cmd, hero, gear, fresh, said, at } = bench();
  const p = hero('분해', 'key-s'), other = hero('남', 'key-o');
  const a = gear(p, 0), b = gear(p, 1, 3), c = gear(p, 2), d = gear(p, 3, 7), theirs = gear(other, 1);
  g.ledger.note(p, 'setup'); fresh(); said(p);

  cmd(p, { t: 'salvage', uids: [a.uid] });
  check(!p.gear.includes(a) && dustOf(p) === SALVAGE.dust[0] && same(said(p), [`salvaged 1,${SALVAGE.dust[0]}`]), `일반 장비 한 점을 분해하면 가루 ${SALVAGE.dust[0]}`);
  check(same(fresh(), [`gear:common ${WHY.salvage} -1`, `item:${DUST} ${WHY.salvage} +${SALVAGE.dust[0]}`]) && WHY.salvage === 'cmd:salvage', '장부: 사라진 장비와 생긴 가루가 cmd:salvage로 적힌다');
  const before = dustOf(p), want = dustFor(b) + dustFor(c) + dustFor(d);
  cmd(p, { t: 'salvage', uids: [b.uid, c.uid, d.uid] });
  check(p.gear.every((x) => ![b, c, d].includes(x)) && dustOf(p) === before + want && want === SALVAGE.dust[1] + 3 * SALVAGE.perPlus + SALVAGE.dust[2] + SALVAGE.dust[3] + 7 * SALVAGE.perPlus && same(said(p), [`salvaged 3,${want}`]), `여러 점을 한 명령으로: 등급별 가루에 강화 단계의 덤이 붙는다 (+${want})`);
  check(same(fresh(), [`gear:uncommon ${WHY.salvage} -1`, `gear:rare ${WHY.salvage} -1`, `gear:epic ${WHY.salvage} -1`, `item:${DUST} ${WHY.salvage} +${want}`]), '장부: 등급마다 한 줄, 가루 한 줄');

  // 거절: 낀 것, 보급형, 잠근 것, 없는 번호, 남의 번호, 겹친 번호, 모양이 깨진 값
  const worn = gear(p, 1, 0, 'charm'), locked = gear(p, 0), ok = gear(p, 0);
  g.gear.equip(p, worn.uid);
  at(p, SHOP.x + 1, SHOP.z); g.wallet.add(p, 'gold', 1000, 'setup'); cmd(p, { t: 'buy', id: 'sword2' });
  const supply = p.gear.find((x) => isSupply(x) && x.base === 'sword2')!, weapon = p.gear.find((x) => x.uid === p.worn.weapon)!;
  cmd(p, { t: 'gearLock', uid: locked.uid, on: true });
  said(p);
  const n0 = p.gear.length, d0 = dustOf(p);
  const refused = (uids: unknown): boolean => { cmd(p, { t: 'salvage', uids }); return p.gear.length === n0 && dustOf(p) === d0 && same(said(p), ['salvageCant']); };
  check(refused([worn.uid]) && refused([weapon.uid]), '낀 장비는 분해할 수 없다');
  check(supply !== undefined && !canSalvage(supply) && refused([supply.uid]), '보급형(상점에서 산 것)은 분해할 수 없다');
  check(locked.lock === true && !canSalvage(locked) && refused([locked.uid]), '잠근 장비는 분해할 수 없다');
  check(refused([99999]) && refused([theirs.uid + 1000]) && refused([0]) && refused([-1]), '없는 번호는 거절한다');
  check(refused([ok.uid, ok.uid]), '같은 번호를 두 번 보내면 거절한다 (가루를 두 번 받지 못한다)');
  check(refused([ok.uid, locked.uid]) && p.gear.includes(ok), '하나라도 안 되는 것이 섞이면 아무것도 분해하지 않는다');
  check(refused([]) && refused('1') && refused(undefined) && refused([1.5]) && refused(['1']) && refused([NaN]) && refused({ length: 1, 0: ok.uid }), '모양이 깨진 값(빈 목록, 글자, 소수, NaN, 배열이 아닌 것)은 거절한다');
  check(refused(Array.from({ length: SALVAGE.maxBatch + 1 }, (_, i) => i + 1)), `한 번에 ${SALVAGE.maxBatch}점까지만 받는다`);
  // 남의 장비: 내 가방에 같은 번호가 있더라도 내 것만 분해된다
  const o0 = other.gear.length;
  cmd(p, { t: 'salvage', uids: [ok.uid] });
  check(other.gear.length === o0 && other.gear.includes(theirs) && !p.gear.includes(ok), '번호는 내 가방 안에서만 찾는다: 남의 장비는 건드리지 않는다');

  // 가루의 한도: 넘칠 분해는 거절하고 알린다 (넘는 몫을 조용히 버리지 않는다)
  const cap = itemCap(DUST), e = gear(p, 3), f = gear(p, 0);
  g.bag.putItem(p, DUST, cap, 'setup'); g.bag.takeItem(p, DUST, SALVAGE.dust[0], 'setup');
  said(p);
  const n1 = p.gear.length;
  cmd(p, { t: 'salvage', uids: [e.uid, f.uid] });
  check(p.gear.length === n1 && dustOf(p) === cap - SALVAGE.dust[0] && same(said(p), [`salvageFull ${SALVAGE.dust[3] + SALVAGE.dust[0]},${SALVAGE.dust[0]}`]), '가루가 한도를 넘게 되면 분해하지 않고, 나올 양과 남은 자리를 알린다');
  cmd(p, { t: 'salvage', uids: [f.uid] });
  check(dustOf(p) === cap && !p.gear.includes(f), '한도에 꼭 맞으면 분해된다');
  g.ledger.note(p, 'setup');
  check(g.ledger.rows().every((r) => r.why !== 'other' && r.why !== 'tick'), '분해의 흐름에서 원인을 가리지 못한 줄(other, tick)이 없다');
}

// ---------- 잠금 ----------
{
  const { g, cmd, hero, gear, said, relog } = bench();
  let p = hero('잠금', 'key-k');
  const mate = hero('동료', 'key-m');
  g.wallet.add(mate, 'gold', 5000, 'setup');
  const a = gear(p, 1), b = gear(p, 0);
  p.metaDirty = false;
  cmd(p, { t: 'gearLock', uid: a.uid, on: true });
  check(a.lock === true && b.lock === undefined && p.metaDirty && p.unsaved, '장비를 잠그면 그 장비에만 표시가 붙고, 화면에 다시 알린다');
  said(p);
  const gold = p.gold;
  cmd(p, { t: 'sell', uid: a.uid });
  check(p.gear.includes(a) && goldOf(p) === gold && same(said(p), ['gearLocked']), '잠근 장비는 팔 수 없다');
  cmd(p, { t: 'market', a: 'post', uid: a.uid, price: 100 });
  check(p.gear.includes(a) && g.market.count === 0 && same(said(p), ['gearLocked']), '잠근 장비는 거래소에 올릴 수 없다');
  cmd(p, { t: 'equip', uid: a.uid });
  check(p.worn[a.slot] === a.uid, '잠근 장비도 낄 수 있다');
  cmd(p, { t: 'unequip', slot: a.slot });
  // 저장 왕복
  p = relog(p);
  const a2 = p.gear.find((x) => x.rar === 1 && x.slot === 'ring')!, b2 = p.gear.find((x) => x.rar === 0 && x.slot === 'ring')!;
  check(a2.lock === true && b2.lock === undefined && !('lock' in b2), '잠금은 저장되고, 잠그지 않은 장비에는 칸이 없다 (옛 저장과 같은 모양)');
  cmd(p, { t: 'gearLock', uid: a2.uid, on: false });
  check(!('lock' in a2), '풀면 칸이 사라진다');
  cmd(p, { t: 'gearLock', uid: 99999, on: true }); cmd(p, { t: 'gearLock', uid: '1', on: true });
  check(p.gear.every((x) => !x.lock), '없는 번호나 깨진 값은 무시한다');
  said(p);
  cmd(p, { t: 'sell', uid: b2.uid });
  cmd(p, { t: 'market', a: 'post', uid: a2.uid, price: 100 });
  check(!p.gear.includes(b2) && !p.gear.includes(a2) && g.market.count === 1 && said(p).some((s) => s.startsWith('marketPosted')), '잠금을 풀면 팔고 올릴 수 있다');
  // 깨진 저장: lock이 참·거짓이 아니면 그 장비는 모양이 깨진 것으로 본다
  const save: PlayerSave = { name: '깨짐', lv: 5, exp: 0, need: 100, maxHp: 100, sparks: 0, gold: 0, ext: { gear: { list: [{ ...g.gear.roll(1, 0, 'ring'), uid: 1, lock: 'yes' }, { ...g.gear.roll(1, 0, 'ring'), uid: 2, lock: false }, { ...g.gear.roll(1, 0, 'ring'), uid: 3 }], worn: {}, seq: 3 } } };
  const q = g.players.spawn('깨짐', false, save, 'key-broken');
  check(q.gear.filter((x) => x.slot === 'ring').map((x) => x.uid).join() === '2,3', '저장의 lock이 참·거짓이 아닌 장비는 버리고, 칸이 없는 옛 저장의 장비는 그대로 읽는다');
}

// ---------- 자동 분해 ----------
{
  const { g, at, kill, cmd, run, hero, gear, fresh, said, mine, relog } = bench();
  let p = hero('자동', 'key-a');
  g.wallet.add(p, 'gold', 50000, 'setup');
  const rnd = Math.random;
  Math.random = () => 0.5;
  at(p, CAMPS[2].x, CAMPS[2].z);
  /** 다음에 떨어질 장비의 등급을 정한다: 드롭 굴림은 반드시 성공하고, 등급 굴림은 그 등급의 가운데로 */
  const dropRar = (rar: number): void => {
    const total = RARITIES.reduce((s, x) => s + x.weight, 0), from = RARITIES.slice(0, rar).reduce((s, x) => s + x.weight, 0);
    let first = true;
    g.gear.random = () => { if (first) { first = false; return 0; } return (from + RARITIES[rar].weight / 2) / total; };
  };
  const drop = (rar: number): void => { dropRar(rar); kill(p, 'wolf'); };

  check(p.autoSalvage === -1 && mine<{ on: boolean; auto: number }>(p, 'salvage').on && mine<{ auto: number }>(p, 'salvage').auto === -1, '처음에는 꺼져 있다');
  const n0 = p.gear.length;
  drop(0);
  check(p.gear.length === n0 + 1 && dustOf(p) === 0, '꺼져 있으면 주운 장비는 가방에 들어온다');
  cmd(p, { t: 'autoSalvage', rar: 3 }); cmd(p, { t: 'autoSalvage', rar: 1.5 }); cmd(p, { t: 'autoSalvage', rar: '1' }); cmd(p, { t: 'autoSalvage', rar: -2 });
  check(p.autoSalvage === -1, '가장 높은 등급(영웅)과 깨진 값은 고를 수 없다');
  cmd(p, { t: 'autoSalvage', rar: 1 });
  check(p.autoSalvage === 1 && mine<{ auto: number }>(p, 'salvage').auto === 1 && p.unsaved, '"고급 이하"로 켠다: 개인 상태에 실리고 저장할 것으로 표시된다');
  g.ledger.note(p, 'setup'); fresh(); said(p);

  // 등급의 경계
  const n1 = p.gear.length;
  drop(0); drop(1);
  check(p.gear.length === n1 && dustOf(p) === SALVAGE.dust[0] + SALVAGE.dust[1], '일반과 고급은 줍자마자 가루가 된다 (가방에 들어오지 않는다)');
  const rows = fresh().filter((r) => r.startsWith('gear:') || r.startsWith('item:'));
  check(same(rows, [`gear:common ${ECON_HUNT.live} +1`, `gear:common ${WHY.autoSalvage} -1`, `gear:uncommon ${ECON_HUNT.live} +1`, `gear:uncommon ${WHY.autoSalvage} -1`, `item:${DUST} ${WHY.autoSalvage} +${SALVAGE.dust[0] + SALVAGE.dust[1]}`]) && WHY.autoSalvage === 'autoSalvage',
    '장부: 사냥으로 생겼다가 autoSalvage로 사라진 장비와, autoSalvage로 생긴 가루');
  drop(2); drop(3);
  check(p.gear.length === n1 + 2 && dustOf(p) === SALVAGE.dust[0] + SALVAGE.dust[1], '희귀와 영웅은 가방에 들어온다');
  // 안내는 묶어서: 한 마리마다 뜨지 않고, 일정 시간의 합계로 한 줄
  const told = said(p);
  check(!told.some((s) => s.startsWith('autoSalvaged')) && told.filter((s) => s.startsWith('gearDrop')).length === 2, '분해된 장비는 줍기 안내가 뜨지 않고, 분해 안내도 바로 뜨지 않는다');
  drop(0);
  run(SALVAGE.tellS + 0.2);
  const sum = SALVAGE.dust[0] * 2 + SALVAGE.dust[1];
  check(same(said(p).filter((s) => s.startsWith('autoSalvaged')), [`autoSalvaged 3,${sum}`]), `${SALVAGE.tellS}초 뒤에 합계로 한 줄: 장비 3점, 가루 ${sum}`);
  run(SALVAGE.tellS + 0.2);
  check(!said(p).some((s) => s.startsWith('autoSalvaged')), '더 분해한 것이 없으면 다시 알리지 않는다');

  // 드롭에만 적용된다: 우편, 거래소, 상점, 제작, 던전 완료 보상으로 받은 것은 분해되지 않는다
  const d1 = dustOf(p), n2 = p.gear.length;
  g.mail.send(p, 'marketBack', ['ring', 1, 0], { gear: [g.gear.roll(1, 0, 'ring')] });
  cmd(p, { t: 'mailClaim', id: 0 });
  const seller = hero('판매', 'key-v');
  const sold = gear(seller, 0);
  cmd(seller, { t: 'market', a: 'post', uid: sold.uid, price: 10 });
  g.out = []; cmd(seller, { t: 'market', a: 'mine' });
  const id = (g.out.filter((o) => o.id === seller.id && o.msg.t === 'market').pop()?.msg as { list: MarketItem[] }).list[0].id;
  cmd(p, { t: 'market', a: 'buy', id });
  at(p, SHOP.x + 1, SHOP.z); cmd(p, { t: 'buy', id: 'armor1' });
  g.bag.putItem(p, 'iron', 10, 'setup'); g.bag.putItem(p, 'hide', 10, 'setup');
  at(p, SMITHY.x + 1, SMITHY.z + 1); cmd(p, { t: 'craft', id: 'sword3' });
  g.gear.give(p, g.gear.roll(DUNGEONS.crypt.dropLv, 0), ECON_HUNT.inst); // 던전 완료 보상이 주는 길 (dungeon.ts의 clear)
  check(p.gear.length === n2 + 5 && dustOf(p) === d1, '우편·거래소·상점·제작·던전 완료 보상으로 받은 일반 장비는 자동 분해되지 않는다');

  // 설정은 저장된다
  p = relog(p);
  check(p.autoSalvage === 1, '자동 분해 설정은 캐릭터와 함께 저장된다');
  cmd(p, { t: 'autoSalvage', rar: -1 });
  const off = g.players.export(p);
  check(p.autoSalvage === -1 && (off.ext as Record<string, unknown>).salvage === undefined, '끄면 저장 칸이 없다 (이 기능을 쓰지 않는 캐릭터의 저장은 전과 같다)');
  cmd(p, { t: 'autoSalvage', rar: 1 });

  // 가방이 가득 찼을 때: 자동 분해 대상은 가득 차도 가루가 되고, 대상이 아닌 것은 버려지며 그 수를 센다
  at(p, CAMPS[2].x, CAMPS[2].z);
  while (!g.bag.full(p)) gear(p, 0);
  g.ledger.note(p, 'setup'); fresh(); said(p);
  const d2 = dustOf(p), n3 = p.gear.length;
  drop(0);
  check(p.gear.length === n3 && dustOf(p) === d2 + SALVAGE.dust[0] && p.lostFull === 0, '가방이 가득 차 있어도 자동 분해 대상은 가루가 된다 (버려지지 않는다)');
  drop(2); drop(2); drop(3);
  const full = fresh().filter((r) => r.includes(ECON_LOST_FULL));
  check(p.gear.length === n3 && p.lostFull === 3 && same(full, [`gear:rare ${ECON_LOST_FULL} -2`, `gear:epic ${ECON_LOST_FULL} -1`]) && said(p).includes('gearFull'), '대상이 아닌 장비는 전처럼 버려지고(lostFull), 버려진 수를 센다');
  check(mine<{ max: number; up: number; lost: number }>(p, 'bag').lost === 3 && mine<{ max: number }>(p, 'bag').max === GEAR.bagMax, '버려진 수와 가방 칸 수가 개인 상태에 실린다 (가방 화면의 경고)');
  p = relog(p);
  check(p.lostFull === 3, '버려진 수는 저장된다 (서버가 다시 떠도 경고가 남는다)');
  const spare = p.gear.find((x) => p.worn[x.slot] !== x.uid && canSalvage(x))!;
  cmd(p, { t: 'salvage', uids: [spare.uid] });
  check(p.lostFull === 0 && mine<{ lost: number }>(p, 'bag').lost === 0, '가방에 자리가 나면 경고가 걷힌다');

  // 가루가 한도까지 차면 자동 분해를 멈추고 장비는 가방으로 간다
  g.bag.putItem(p, DUST, itemCap(DUST), 'setup');
  const n4 = p.gear.length;
  drop(0);
  check(dustOf(p) === itemCap(DUST) && p.gear.length === n4 + 1, '가루가 한도까지 찼으면 분해하지 않고 가방에 넣는다 (가루를 버리지 않는다)');
  Math.random = rnd;
  g.ledger.note(p, 'setup');
  check(g.ledger.rows().every((r) => r.why !== 'other' && r.why !== 'tick'), '자동 분해의 흐름에서 원인을 가리지 못한 줄(other, tick)이 없다');
}

// ---------- 자리 비움 사냥 중의 자동 분해와, 돌아왔을 때의 안내 ----------
{
  const { g, at, run, cmd, hero, gear, fresh, said } = bench();
  const p = hero('자리', 'key-w');
  const rnd = Math.random;
  cmd(p, { t: 'autoSalvage', rar: 1 });
  at(p, CAMPS[0].x, CAMPS[0].z);
  while (!g.bag.full(p)) gear(p, 0);
  g.bag.putItem(p, 'potion', 10, 'setup');
  g.ledger.note(p, 'setup'); fresh();
  // 서버가 대신 사냥한다 (틱 안의 진짜 전투). 떨어지는 장비의 등급을 번갈아 정한다: 일반(분해), 희귀(가방이 가득 차 버려짐)
  const total = RARITIES.reduce((s, x) => s + x.weight, 0), mid = (rar: number) => (RARITIES.slice(0, rar).reduce((s, x) => s + x.weight, 0) + RARITIES[rar].weight / 2) / total;
  // 장비 난수가 불리는 차례: 떨어지는가(1번) → 등급(1번) → 옵션마다 종류와 값(2번씩) → 칸(1번)
  let turn = 0, phase = 0, left = 0;
  g.gear.random = () => {
    if (phase === 0) { phase = 1; return 0; }
    if (phase === 1) { const rar = turn++ % 2 === 0 ? 0 : 2; left = RARITIES[rar].opts * 2 + 1; phase = 2; return mid(rar); }
    if (--left === 0) phase = 0;
    return 0.5;
  };
  p.auto = true; g.away.start(p);
  const n0 = p.gear.length;
  for (let i = 0; i < 400 && turn < 6; i++) { p.hp = p.maxHp; run(1); }
  const salv = Math.ceil(turn / 2), lost = Math.floor(turn / 2);
  check(turn >= 6 && g.away.active(p) && p.gear.length === n0 && dustOf(p) === salv * SALVAGE.dust[0] && p.lostFull === lost, `자리 비움 사냥 중에도 자동 분해가 된다 (분해 ${salv}점, 가방이 가득 차 버려진 것 ${lost}점)`);
  const rows = fresh();
  check(rows.includes(`gear:common ${ECON_HUNT.away} +${salv}`) && rows.includes(`gear:common ${WHY.autoSalvage} -${salv}`) && rows.includes(`item:${DUST} ${WHY.autoSalvage} +${salv * SALVAGE.dust[0]}`) && rows.includes(`gear:rare ${ECON_LOST_FULL} -${lost}`), '장부: huntAway로 생겨 autoSalvage로 사라진 장비, 생긴 가루, 버려진 장비');
  said(p);
  run(SALVAGE.tellS + 1);
  check(!said(p).some((s) => s.startsWith('autoSalvaged')), '자리를 비운 동안에는 묶음 안내를 보내지 않는다 (볼 사람이 없다)');
  const salv2 = Math.ceil(turn / 2), lost2 = Math.floor(turn / 2);
  g.away.stop(p); p.auto = false;
  const back = said(p);
  check(back[0]?.startsWith('awayBack ') && back[1] === `awayGear ${lost2},${salv2},${salv2 * SALVAGE.dust[0]}`, `돌아오면 요약 안내에 이어 버려진 수와 자동 분해한 수, 얻은 가루를 알린다 (${back[1]})`);
  // 버려진 것도 분해한 것도 없으면 덧붙이지 않는다
  g.gear.random = () => 0.999;
  p.auto = true; g.away.start(p); run(3); g.away.stop(p); p.auto = false;
  check(!said(p).some((s) => s.startsWith('awayGear')), '버려진 것도 분해한 것도 없으면 장비 안내는 없다');
  Math.random = rnd;
  g.ledger.note(p, 'setup');
  check(g.ledger.rows().every((r) => r.why !== 'other' && r.why !== 'tick'), '자리 비움 사냥의 흐름에서 원인을 가리지 못한 줄(other, tick)이 없다');
}

// ---------- 가방 넓히기 ----------
{
  const { g, cmd, hero, gear, fresh, said, mine, relog } = bench();
  let p = hero('넓힘', 'key-u');
  const sum = BAG_UP.prices.reduce((s, n) => s + n, 0);
  check(BAG_UP.prices.length === 6 && BAG_UP.step === 5 && BAG_UP.prices.join() === '3000,6000,12000,24000,48000,96000', `넓히기의 값: ${BAG_UP.prices.join(' / ')} (${BAG_UP.step}칸씩)`);
  fresh(); said(p);
  cmd(p, { t: 'bagUp' });
  check(p.bagUp === 0 && g.bag.slots(p) === GEAR.bagMax && same(said(p), ['noGold']), '골드가 모자라면 넓히지 못한다');
  g.wallet.add(p, 'gold', sum + 500, 'setup'); fresh();
  for (let i = 0; i < BAG_UP.prices.length; i++) {
    const gold = p.gold;
    cmd(p, { t: 'bagUp' });
    const ok = p.bagUp === i + 1 && goldOf(p) === gold - BAG_UP.prices[i] && g.bag.slots(p) === GEAR.bagMax + (i + 1) * BAG_UP.step && same(said(p), [`bagUpDone ${g.bag.slots(p)}`]);
    if (!ok || i === 0 || i === BAG_UP.prices.length - 1) check(ok, `${i + 1}번째 넓히기: ${BAG_UP.prices[i]}골드를 내고 ${g.bag.slots(p)}칸`);
  }
  check(same(fresh(), [`gold ${WHY.bagUp} -${sum}`]) && WHY.bagUp === 'cmd:bagUp', '장부: 넓히는 데 든 골드가 cmd:bagUp으로 적힌다');
  const gold = p.gold;
  cmd(p, { t: 'bagUp' });
  check(p.bagUp === BAG_UP.prices.length && goldOf(p) === gold && same(said(p), ['bagUpMax']), `${BAG_UP.prices.length + 1}번째는 거절한다 (골드도 그대로)`);
  check(mine<{ max: number; up: number }>(p, 'bag').max === 60 && mine<{ up: number }>(p, 'bag').up === 6, '개인 상태에 칸 수와 넓힌 횟수가 실린다');

  // 넓힌 뒤 저장 왕복: 35번째 장비가 남는다
  while (p.gear.length < 35) gear(p, 0);
  const last = p.gear[34], before = p.gear.map((x) => x.uid).join();
  check(g.saves.findIndex((s) => s.name === 'bag') >= 0 && g.saves.findIndex((s) => s.name === 'bag') < g.saves.findIndex((s) => s.name === 'gear'), '저장 칸의 차례: 가방(넓힌 횟수)이 장비보다 먼저 읽힌다');
  p = relog(p);
  check(p.bagUp === 6 && p.gear.length === 35 && p.gear.some((x) => x.uid === last.uid) && p.gear.map((x) => x.uid).join() === before, '넓힌 가방의 35번째 장비가 저장 왕복 뒤에도 남는다');
  while (!g.bag.full(p)) gear(p, 0);
  check(p.gear.length === 60 && !g.bag.giveGear(p, g.gear.roll(1, 0), 'setup'), '60칸까지 들어가고 61번째는 들어가지 않는다');
  p = relog(p);
  check(p.gear.length === 60, '60점이 저장 왕복 뒤에도 그대로다');

  // 옛 저장 호환: 칸이 없으면 넓히지 않은 가방이다. 깨진 값은 범위로 맞춘다
  const list = Array.from({ length: 40 }, (_, i) => ({ ...g.gear.roll(1, 0, 'ring'), uid: i + 1 }));
  const old = g.players.spawn('옛', false, { name: '옛', lv: 5, exp: 0, need: 100, maxHp: 100, sparks: 0, gold: 10, ext: { gear: { list, worn: {}, seq: 40 } } }, 'key-old');
  check(old.bagUp === 0 && old.lostFull === 0 && old.autoSalvage === -1 && old.gear.filter((x) => x.slot === 'ring').length === GEAR.bagMax, '칸이 없는 옛 저장: 넓히지 않은 가방(30칸)으로 읽고, 자동 분해는 꺼져 있다');
  const odd = g.players.spawn('깨짐', false, { name: '깨짐', lv: 5, exp: 0, need: 100, maxHp: 100, sparks: 0, gold: 10, ext: { bag: { up: 99, lost: -5 }, salvage: { auto: 3 }, gear: { list, worn: {}, seq: 40 } } }, 'key-odd');
  check(odd.bagUp === BAG_UP.prices.length && odd.lostFull === 0 && odd.autoSalvage === -1 && odd.gear.filter((x) => x.slot === 'ring').length === 40, '깨진 값: 넓힌 횟수는 한도로, 버려진 수는 0으로, 고를 수 없는 자동 분해 등급은 끔으로');
  const fresh2 = g.players.export(hero('새', 'key-new'));
  check((fresh2.ext as Record<string, unknown>).bag === undefined && (fresh2.ext as Record<string, unknown>).salvage === undefined, '넓히지도 켜지도 않은 캐릭터의 저장에는 새 칸이 없다');
}

// ---------- 가루는 거래소에 올릴 수 있다 (다른 재료와 같은 방식, 한도만 크다) ----------
{
  const { g, cmd, hero, said } = bench();
  const p = hero('가루', 'key-d'), buyer = hero('구매', 'key-b');
  g.wallet.add(buyer, 'gold', 5000, 'setup');
  g.bag.putItem(p, DUST, 300, 'setup');
  const n = MAT_MAX + 51;
  cmd(p, { t: 'market', a: 'post', item: DUST, n, price: 400 });
  check(dustOf(p) === 300 - n && g.market.count === 1 && g.market.held().items[DUST] === n, `가루 ${n}개를 한 묶음으로 올린다 (다른 재료의 한도 ${MAT_MAX}보다 많이)`);
  cmd(p, { t: 'market', a: 'post', item: 'iron', n: MAT_MAX + 1, price: 400 });
  check(g.market.count === 1 && said(p).includes('marketCant'), '다른 재료는 전처럼 제 한도까지만 올린다');
  // 월드 저장 왕복: 큰 묶음이 그대로 남는다
  const g2 = new Game();
  g2.importWorld(JSON.parse(JSON.stringify(g.exportWorld())));
  check(g2.market.count === 1 && g2.market.held().items[DUST] === n, '거래소에 맡긴 가루 묶음이 월드 저장 왕복 뒤에도 남는다');
  g.out = []; cmd(p, { t: 'market', a: 'mine' });
  const id = (g.out.filter((o) => o.id === p.id && o.msg.t === 'market').pop()?.msg as { list: MarketItem[] }).list[0].id;
  cmd(buyer, { t: 'market', a: 'buy', id });
  check(dustOf(buyer) === n && goldOf(buyer) === 5000 - 400 && g.market.count === 0, '다른 사람이 사면 가루가 건너간다');
  // 저장을 읽을 때의 한도
  const rich = g.players.spawn('부자', false, { name: '부자', lv: 5, exp: 0, need: 100, maxHp: 100, sparks: 0, gold: 10, items: { [DUST]: 5e6, iron: 5000 } }, 'key-rich');
  check(dustOf(rich) === itemCap(DUST) && rich.items.iron === MAT_MAX, '저장을 읽을 때 가루는 제 한도로, 다른 재료는 재료의 한도로 자른다');
  check(sellPrice(g.gear.roll(1, 0)) > 0, '파는 길은 그대로 있다 (분해와 고른다)');
}

// ---------- 가루를 주지 않는 게임: 분해가 꺼진다 ----------
{
  const { g, at, kill, cmd, hero, gear, said, mine } = bench();
  const p = hero('없음', 'key-n');
  g.salvage.cfg = { ...SALVAGE, dust: [] };
  check(!g.salvage.on && !salvageOn(g.salvage.cfg) && mine<{ on: boolean; auto: number }>(p, 'salvage').on === false, '등급별 가루의 표가 비어 있으면 분해가 없는 게임이다 (개인 상태 on: false: 화면이 단추를 그리지 않는다)');
  const a = gear(p, 0);
  said(p);
  cmd(p, { t: 'salvage', uids: [a.uid] });
  check(p.gear.includes(a) && dustOf(p) === 0 && same(said(p), ['salvageCant']), '분해 명령은 거절된다');
  cmd(p, { t: 'autoSalvage', rar: 0 });
  check(p.autoSalvage === -1, '자동 분해를 켤 수 없다');
  p.autoSalvage = 1; // 켜 둔 채 저장된 캐릭터가 분해 없는 게임에 들어온 경우
  const n0 = p.gear.length;
  g.gear.random = () => 0;
  at(p, CAMPS[2].x, CAMPS[2].z);
  kill(p, 'wolf');
  check(p.gear.length === n0 + 1 && dustOf(p) === 0 && mine<{ auto: number }>(p, 'salvage').auto === -1, '설정이 남아 있어도 주운 장비는 분해되지 않고 가방에 들어온다');
  cmd(p, { t: 'gearLock', uid: a.uid, on: true });
  check(a.lock === true, '잠금은 분해와 무관하게 쓸 수 있다 (팔기와 거래소를 막는다)');
  // 없는 아이템을 가리키는 표도 꺼진 것으로 본다
  g.salvage.cfg = { ...SALVAGE, item: 'nothing' };
  check(!g.salvage.on, '나오는 아이템이 아이템의 표에 없어도 꺼진다');
  g.salvage.cfg = SALVAGE;
  check(g.salvage.on && g.salvage.complete, '표를 되돌리면 다시 켜진다');
}
