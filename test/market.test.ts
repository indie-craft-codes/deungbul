// 거래소와 우편의 물건 (서버 없이 게임 규칙만 돌린다)
// 올리기·사기·내리기, 기간 만료, 접속해 있지 않은 판매자, 저장과 읽기, 잘못된 입력을 검사하고,
// 처음부터 끝까지 골드와 물건이 복사되거나 사라지지 않는지 센다.
import { GEAR, MAIL_MAX, MARKET, MAT_MAX, marketFee, type Mail, type MarketItem, type Reward } from '../shared/defs';
import type { ServerMsg } from '../shared/protocol';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import type { PlayerSave } from '../server/store';
import { check } from './harness';

type MarketMsg = Extract<ServerMsg, { t: 'market' }>;
const TRADE = ['marketSold', 'marketExpired', 'marketBought', 'marketBack'];
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** 한 게임을 다루는 손잡이들 */
function bench(g: Game) {
  const mk = (name: string, pid: string, gold = 5000, save: PlayerSave | null = null) => { const p = g.players.spawn(name, false, save, pid); if (!save) { g.classes.apply(p, 'warrior'); p.gold = gold; p.mail = []; } return p; }; // 첫 접속의 출석 우편은 치워 둔다: 거래와 무관한 골드가 셈에 섞이지 않게
  const said = (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Ent, m: Record<string, unknown>) => { g.notices = []; g.out = []; g.command(p, m); };
  const got = <V extends MarketMsg['v']>(p: { id: number }, v: V) => g.out.filter((o) => o.id === p.id && o.msg.t === 'market' && o.msg.v === v).pop()?.msg as Extract<MarketMsg, { v: V }> | undefined;
  /** 목록을 받아 온다 */
  const list = (p: Ent, q: Record<string, unknown> = {}): Extract<MarketMsg, { v: 'list' }> => { cmd(p, { t: 'market', a: 'list', ...q }); return got(p, 'list')!; };
  const mine = (p: Ent): MarketItem[] => { cmd(p, { t: 'market', a: 'mine' }); return got(p, 'mine')!.list; };
  /** 반지 한 점을 가방에 넣어 준다 */
  const ring = (p: Ent, rar = 2) => { const it = g.gear.roll(3, rar, 'ring'); g.gear.put(p, it); return it; };
  return { mk, said, cmd, got, list, mine, ring };
}

/**
 * 세상에 있는 골드와 물건을 모두 센다: 가진 것, 우편에 든 것, 접속하지 않은 사람에게 맡아 둔 우편, 거래소가 맡은 것, 수수료로 사라진 골드.
 * 골드는 거래로 생긴 우편의 것만 센다 (출석·방치 보상은 거래와 무관하게 새로 생기는 골드다).
 */
function census(g: Game, ents: Ent[], pids: string[], saves: PlayerSave[] = []): { gold: number; gear: number; iron: number } {
  const out = { gold: g.market.taxed, gear: g.market.held().gear, iron: g.market.held().items.iron ?? 0 };
  const mail = (k: string, r: Reward) => { if (TRADE.includes(k)) out.gold += r.gold ?? 0; out.gear += r.gear?.length ?? 0; out.iron += r.items?.iron ?? 0; };
  for (const p of ents) { out.gold += p.gold; out.gear += p.gear.length; out.iron += p.items.iron ?? 0; for (const m of p.mail) mail(m.k, m.r); }
  for (const s of saves) {
    const ext = s.ext as { gear: { list: unknown[] }; mail: { list: Mail[] } };
    out.gold += s.gold ?? 0; out.gear += ext.gear.list.length; out.iron += s.items?.iron ?? 0;
    for (const m of ext.mail.list) mail(m.k, m.r);
  }
  for (const pid of pids) for (const m of g.mail.waitingFor(pid)) mail(m.k, m.r);
  return out;
}
const same = (a: object, b: object): boolean => JSON.stringify(a) === JSON.stringify(b);

{
  let clock = new Date(2026, 0, 10, 12).getTime();
  const g = new Game({ now: () => clock });
  g.gear.random = () => 0.5;
  const { mk, said, cmd, got, list, mine, ring } = bench(g);
  const a = mk('판매자', 'key-a'), b = mk('구매자', 'key-b'), c = mk('둘째 구매자', 'key-c'), poor = mk('빈털터리', 'key-poor', 10), guest = mk('손님', '');
  const PIDS = ['key-a', 'key-b', 'key-c', 'key-poor', 'key-d'];
  const everyone = [a, b, c, poor, guest];
  const count = () => census(g, everyone, PIDS);
  const sold = (p: Ent) => p.mail.filter((m) => m.k === 'marketSold');

  // ---------- 올릴 수 없는 것과 잘못된 값 ----------
  const r1 = ring(a);
  const supply = g.gear.plain('sword2');
  g.gear.put(a, supply);
  a.items.potion = 3; a.items.iron = 50;
  const start = count();

  cmd(guest, { t: 'market', a: 'post', item: 'iron', n: 1, price: 10 });
  check(said(guest).includes('marketGuest') && g.market.count === 0, '손님은 거래소에 올릴 수 없다');
  cmd(a, { t: 'market', a: 'post', uid: a.worn.weapon, price: 100 });
  check(said(a).includes('marketCant') && a.gear.some((x) => x.uid === a.worn.weapon), '끼고 있는 장비는 올릴 수 없다');
  cmd(a, { t: 'market', a: 'post', uid: supply.uid, price: 100 });
  check(said(a).includes('marketCant') && a.gear.includes(supply), '상점에서 산 보급형은 올릴 수 없다');
  cmd(a, { t: 'market', a: 'post', item: 'potion', n: 1, price: 100 });
  check(said(a).includes('marketCant') && a.items.potion === 3, '물약은 올릴 수 없다');

  let threw = false, rejected = 0;
  const badPrices: unknown[] = [0, -5, 1.5, NaN, Infinity, -Infinity, '100', MARKET.maxPrice + 1, 1e308, null, undefined, {}, [100], true];
  for (const price of badPrices) {
    try { cmd(a, { t: 'market', a: 'post', uid: r1.uid, price }); cmd(a, { t: 'market', a: 'post', item: 'iron', n: 5, price }); } catch { threw = true; }
    if (said(a).includes('marketPriceBad')) rejected++;
  }
  check(!threw && rejected === badPrices.length && g.market.count === 0 && a.gear.includes(r1) && a.items.iron === 50, `잘못된 값(0, 음수, 소수, NaN, 문자열, 한도 초과 등 ${badPrices.length}가지)으로는 올릴 수 없다`);

  const badPosts: Record<string, unknown>[] = [
    { uid: 'x' }, { uid: 9999 }, { uid: -1 }, { uid: 1.5 }, { uid: NaN }, { uid: null }, {},
    { item: 'iron', n: 0 }, { item: 'iron', n: -3 }, { item: 'iron', n: 1.5 }, { item: 'iron', n: NaN }, { item: 'iron', n: '3' }, { item: 'iron', n: MAT_MAX + 1 }, { item: 'iron', n: 51 },
    { item: 'nope', n: 1 }, { item: 'sword2', n: 1 }, { item: '__proto__', n: 1 }, { item: 5, n: 1 }, { item: 'iron' },
  ];
  for (const m of badPosts) { try { cmd(a, { t: 'market', a: 'post', price: 100, ...m }); } catch { threw = true; } }
  const junk: Record<string, unknown>[] = [
    { t: 'market' }, { t: 'market', a: 5 }, { t: 'market', a: 'buy' }, { t: 'market', a: 'buy', id: '1' }, { t: 'market', a: 'buy', id: NaN }, { t: 'market', a: 'buy', id: -1 }, { t: 'market', a: 'buy', id: 0.5 },
    { t: 'market', a: 'cancel', id: 1e308 }, { t: 'market', a: 'cancel', id: null }, { t: 'market', a: 'cancel' }, { t: 'market', a: 'constructor' }, { t: 'market', a: 'post' },
  ];
  for (const m of junk) { try { cmd(a, m); cmd(guest, m); } catch { threw = true; } }
  const odd = list(a, { f: {}, sort: [], page: -3 });
  check(!threw && g.market.count === 0 && same(count(), start) && odd.page === 0 && odd.pages === 1 && odd.list.length === 0, '없는 번호, 이상한 수량, 모양이 깨진 명령에도 서버가 죽지 않고 아무것도 바뀌지 않는다');

  // ---------- 장비: 올리기, 둘러보기, 사기 ----------
  const PRICE = 1000, FEE = marketFee(PRICE);
  const bagA = a.gear.length, opts = copy(r1.opts), uid1 = r1.uid;
  cmd(a, { t: 'market', a: 'post', uid: r1.uid, price: PRICE });
  const id1 = got(a, 'mine')?.list[0]?.id ?? 0;
  check(said(a).includes('marketPosted') && g.market.count === 1 && a.gear.length === bagA - 1 && !a.gear.includes(r1) && id1 > 0, '장비를 올리면 가방에서 빠져 거래소가 맡는다');
  cmd(a, { t: 'market', a: 'post', uid: uid1, price: PRICE });
  check(said(a).includes('marketCant') && g.market.count === 1, '이미 올린 장비를 다시 올릴 수 없다 (같은 물건이 두 번 올라가지 않는다)');
  g.players.rename(a, '새 이름');
  const seenB = list(b), seenA = list(a);
  check(seenB.total === 1 && seenB.list[0].seller === '판매자' && !seenB.list[0].mine && seenB.list[0].price === PRICE && seenB.list[0].gear?.slot === 'ring' && seenA.list[0].mine && seenB.list[0].left === MARKET.hours * 3600, '목록에 물건, 값, 올릴 때의 판매자 이름, 남은 시간이 보인다');
  check(list(b, { f: 'ring' }).total === 1 && list(b, { f: 'weapon' }).total === 0 && list(b, { f: 'mat' }).total === 0, '칸 종류로 걸러 볼 수 있다');
  check(list(guest).guest === true && list(guest).total === 1, '손님은 둘러보기만 할 수 있다');

  cmd(a, { t: 'market', a: 'buy', id: id1 });
  check(said(a).includes('marketOwn') && g.market.count === 1, '자기 물건은 살 수 없다');
  cmd(poor, { t: 'market', a: 'buy', id: id1 });
  check(said(poor).includes('noGold') && poor.gold === 10 && g.market.count === 1, '골드가 모자라면 살 수 없다');
  cmd(guest, { t: 'market', a: 'buy', id: id1 });
  check(said(guest).includes('marketGuest') && g.market.count === 1, '손님은 살 수 없다');

  const bagB = b.gear.length;
  cmd(b, { t: 'market', a: 'buy', id: id1 });
  const boughtIt = b.gear[b.gear.length - 1];
  check(said(b).includes('marketBought') && b.gold === 5000 - PRICE && b.gear.length === bagB + 1 && same(boughtIt.opts, opts) && boughtIt.uid > 0 && g.market.count === 0, '사면 골드가 값만큼 줄고 장비가 가방에 들어온다');
  check(sold(a).length === 1 && sold(a)[0].r.gold === PRICE - FEE && FEE === Math.floor(PRICE * MARKET.tax) && g.market.taxed === FEE && a.gold === 5000 && g.out.some((o) => o.id === a.id && o.msg.t === 'market' && o.msg.v === 'mine' && o.msg.list.length === 0), `판 돈은 수수료(${FEE})를 뗀 ${PRICE - FEE}골드가 판매자에게 우편으로 간다`);
  cmd(c, { t: 'market', a: 'buy', id: id1 });
  check(said(c).includes('marketGone') && c.gold === 5000 && c.gear.length === 1, '이미 팔린 물건을 뒤이어 사려 하면 사지 못하고 골드도 그대로다');
  cmd(a, { t: 'mailClaim', id: sold(a)[0].id });
  check(a.gold === 5000 + PRICE - FEE && sold(a).length === 0, '판매자가 우편을 받으면 골드가 들어온다');
  check(marketFee(1) === 0 && marketFee(19) === 0 && marketFee(20) === 1 && marketFee(MARKET.maxPrice) === MARKET.maxPrice * MARKET.tax, '수수료는 내림으로 셈한다 (값 1은 수수료 0)');
  check(same(count(), start), '장비 거래 뒤에도 골드(수수료 포함)와 물건의 총수가 그대로다');

  // ---------- 내리기 ----------
  const r2 = ring(a, 3);
  const base2 = count();
  cmd(a, { t: 'market', a: 'post', uid: r2.uid, price: 77 });
  const id2 = mine(a)[0].id;
  cmd(b, { t: 'market', a: 'cancel', id: id2 });
  check(said(b).includes('marketGone') && g.market.count === 1 && b.gear.length === bagB + 1, '남의 물건은 내릴 수 없다');
  cmd(a, { t: 'market', a: 'cancel', id: id2 });
  check(said(a).includes('marketCanceled') && g.market.count === 0 && a.gear.includes(r2) && r2.uid > 0 && got(a, 'mine')?.list.length === 0, '내리면 물건이 가방으로 돌아온다');
  cmd(a, { t: 'market', a: 'cancel', id: id2 });
  check(said(a).includes('marketGone') && a.gear.filter((x) => x === r2).length === 1, '이미 내린 물건을 다시 내려도 물건이 늘지 않는다');
  check(same(count(), base2), '내린 뒤에도 총수가 그대로다');

  // 가방이 가득 찬 채로 내리면 우편으로 가고, 가방이 가득하면 우편에서 꺼내도 사라지지 않고 남는다
  cmd(a, { t: 'market', a: 'post', uid: r2.uid, price: 77 });
  const id3 = mine(a)[0].id;
  while (a.gear.length < GEAR.bagMax) ring(a, 0);
  const base3 = count();
  cmd(a, { t: 'market', a: 'cancel', id: id3 });
  const back = a.mail.find((m) => m.k === 'marketBack');
  check(a.gear.length === GEAR.bagMax && back?.r.gear?.length === 1 && same(back.r.gear[0].opts, r2.opts) && g.market.count === 0, '가방이 가득 찼을 때 내리면 물건이 우편으로 간다');
  cmd(a, { t: 'mailClaim', id: back!.id });
  check(said(a).includes('mailLeft') && a.gear.length === GEAR.bagMax && a.mail.find((m) => m.id === back!.id)?.r.gear?.length === 1, '가방이 가득 찬 채 우편의 장비를 받으려 하면 사라지지 않고 우편에 남는다');
  cmd(a, { t: 'mailClaim', id: 0 });
  check(a.mail.some((m) => m.id === back!.id) && a.mail.length === 1 && a.gear.length === GEAR.bagMax, '모두 받기를 해도 받지 못한 장비 우편은 남는다');
  check(same(count(), base3), '우편에 남은 장비까지 세면 총수가 그대로다');
  const junkGear = a.gear.filter((x) => x.rar === 0 && x.slot === 'ring');
  cmd(a, { t: 'sell', uid: junkGear[0].uid });
  cmd(a, { t: 'mailClaim', id: back!.id });
  check(a.gear.length === GEAR.bagMax && a.mail.length === 0 && a.gear.some((x) => same(x.opts, r2.opts) && x.rar === 3), '자리를 비우고 다시 받으면 장비가 가방에 들어온다');

  // 가방이 가득 찬 사람이 사면 산 물건이 우편으로 간다
  const r3 = ring(c, 1);
  cmd(c, { t: 'market', a: 'post', uid: r3.uid, price: 40 });
  const id4 = mine(c)[0].id, goldA = a.gold;
  const base4 = count();
  cmd(a, { t: 'market', a: 'buy', id: id4 });
  const held = a.mail.find((m) => m.k === 'marketBought');
  check(a.gold === goldA - 40 && a.gear.length === GEAR.bagMax && held?.r.gear?.length === 1 && sold(c)[0]?.r.gold === 40 - marketFee(40), '가방이 가득 찬 사람이 사면 물건은 우편으로 가고 값은 그대로 치른다');
  check(same(count(), base4), '가방이 가득 찬 거래 뒤에도 총수가 그대로다');

  // ---------- 재료 묶음 ----------
  b.items.iron = 80;
  const base5 = count();
  cmd(a, { t: 'market', a: 'post', item: 'iron', n: 30, price: 300 });
  const id5 = mine(a).find((x) => x.item === 'iron')!.id;
  check(a.items.iron === 20 && list(b, { f: 'mat' }).list[0]?.n === 30 && list(b, { f: 'mat' }).list[0]?.item === 'iron' && list(b, { f: 'ring' }).total === 0, '재료를 묶음으로 올리면 그만큼 빠진다');
  cmd(a, { t: 'market', a: 'post', item: 'iron', n: 21, price: 300 });
  check(said(a).includes('noMats') && a.items.iron === 20, '가진 것보다 많이 올릴 수 없다');
  const goldB = b.gold;
  cmd(b, { t: 'market', a: 'buy', id: id5 });
  const over = b.mail.find((m) => m.k === 'marketBought');
  check(b.gold === goldB - 300 && b.items.iron === MAT_MAX && over?.r.items?.iron === 80 + 30 - MAT_MAX && over.a[1] === 80 + 30 - MAT_MAX, `재료가 한도(${MAT_MAX})를 넘으면 넘는 만큼은 우편으로 간다`);
  check(sold(a).some((m) => m.r.gold === 300 - marketFee(300) && m.a[0] === 'iron' && m.a[1] === 30), '재료를 판 돈도 수수료를 떼고 우편으로 온다');
  cmd(b, { t: 'mailClaim', id: over!.id });
  check(said(b).includes('mailLeft') && b.items.iron === MAT_MAX && b.mail.find((m) => m.id === over!.id)?.r.items?.iron === 11, '한도가 찬 채 우편의 재료를 받으려 하면 우편에 남는다');
  check(same(count(), base5), '재료 거래 뒤에도 골드와 재료의 총수가 그대로다');
  b.items.iron = MAT_MAX - 4; // 넷을 썼다고 치고
  cmd(b, { t: 'mailClaim', id: over!.id });
  check(b.items.iron === MAT_MAX && b.mail.find((m) => m.id === over!.id)?.r.items?.iron === 7, '자리가 난 만큼만 받고 나머지는 남는다');
  b.items.iron = 0;
  cmd(b, { t: 'mailClaim', id: over!.id });
  check(b.items.iron === 7 && !b.mail.some((m) => m.id === over!.id) && said(b).includes('mailGot'), '자리가 충분하면 남은 재료를 모두 받고 우편이 사라진다');

  // ---------- 한 사람이 올릴 수 있는 수 ----------
  for (let i = 0; i < MARKET.maxListings; i++) cmd(a, { t: 'market', a: 'post', item: 'iron', n: 1, price: 5 + i });
  const ironA = a.items.iron;
  cmd(a, { t: 'market', a: 'post', item: 'iron', n: 1, price: 5 });
  check(said(a).includes('marketFull') && mine(a).length === MARKET.maxListings && a.items.iron === ironA, `한 사람이 ${MARKET.maxListings}개까지만 올릴 수 있다`);
  for (const x of mine(a)) cmd(a, { t: 'market', a: 'cancel', id: x.id });
  check(g.market.count === 0 && a.items.iron === ironA + MARKET.maxListings, '모두 내리면 재료가 돌아온다');

  // ---------- 판매자가 접속해 있지 않을 때 ----------
  const r4 = a.gear.find((x) => x.rar === 3 && x.slot === 'ring')!;
  cmd(a, { t: 'market', a: 'post', uid: r4.uid, price: 200 });
  const id6 = mine(a)[0].id;
  cmd(c, { t: 'market', a: 'post', item: 'iron', n: 1, price: 9 }); // 가진 것이 없어 올라가지 않는다
  c.items.iron = 3;
  cmd(c, { t: 'market', a: 'post', item: 'iron', n: 3, price: 9 });
  const saveA = copy(g.players.export(a));
  g.players.leave(a.id);
  const online = [b, c, poor, guest];
  const base6 = census(g, online, PIDS, [saveA]);
  const goldB2 = b.gold, bagB2 = b.gear.length;
  cmd(b, { t: 'market', a: 'buy', id: id6 });
  check(b.gold === goldB2 - 200 && b.gear.length === bagB2 + 1 && g.mail.waitingFor('key-a').length === 1 && g.mail.waitingFor('key-a')[0].r.gold === 200 - marketFee(200), '판매자가 접속해 있지 않아도 팔리고, 판 돈은 맡아 둔다');
  check(same(census(g, online, PIDS, [saveA]), base6), '맡아 둔 우편까지 세면 총수가 그대로다');

  // ---------- 저장했다가 새 게임에서 읽는다 ----------
  const world = copy(g.exportWorld());
  const saves = { b: copy(g.players.export(b)), c: copy(g.players.export(c)) };
  const g2 = new Game({ now: () => clock });
  g2.gear.random = () => 0.5;
  g2.importWorld(world);
  const t2 = bench(g2);
  check(g2.market.count === 1 && g2.market.taxed === g.market.taxed && g2.mail.waitingFor('key-a').length === 1, '올린 물건과 아직 전달되지 않은 우편이 월드와 함께 저장되고 다시 읽힌다');
  const a2 = t2.mk('새 이름', 'key-a', 0, saveA), b2 = t2.mk('구매자', 'key-b', 0, saves.b), c2 = t2.mk('둘째 구매자', 'key-c', 0, saves.c);
  const all2 = [a2, b2, c2];
  const paid = a2.mail.find((m) => m.k === 'marketSold' && m.a[2] === 200);
  check(paid?.r.gold === 200 - marketFee(200) && g2.mail.waitingFor('key-a').length === 0 && t2.said(a2).includes('mailNew'), '접속해 있지 않던 판매자가 다음 접속에 판 돈을 우편으로 받는다');
  const goldA2 = a2.gold;
  t2.cmd(a2, { t: 'mailClaim', id: paid!.id });
  check(a2.gold === goldA2 + 200 - marketFee(200), '그 우편을 받으면 골드가 들어온다');
  const again = t2.mk('새 이름', 'key-a2', 0, copy(g2.players.export(a2)));
  check(!again.mail.some((m) => m.k === 'marketSold' && m.a[2] === 200) && g2.mail.waitingFor('key-a').length === 0, '한 번 전달된 우편은 다시 오지 않는다');
  g2.players.leave(again.id);
  check(t2.mine(c2).length === 1 && t2.mine(c2)[0].item === 'iron' && t2.mine(c2)[0].n === 3, '다시 접속한 판매자에게 올려 둔 물건이 보인다');
  const ironB = b2.items.iron ?? 0;
  t2.cmd(b2, { t: 'market', a: 'buy', id: t2.mine(c2)[0].id });
  check(b2.items.iron === ironB + 3 && g2.market.count === 0 && c2.mail.some((m) => m.k === 'marketSold' && m.r.gold === 9 - marketFee(9)), '저장에서 읽은 물건도 그대로 사고팔린다');

  // ---------- 기간 만료: 접속한 판매자와 접속해 있지 않은 판매자 ----------
  const d = t2.mk('떠날 사람', 'key-d');
  d.items.iron = 12;
  const r5 = t2.ring(a2, 2);
  t2.cmd(a2, { t: 'market', a: 'post', uid: r5.uid, price: 500 });
  t2.cmd(d, { t: 'market', a: 'post', item: 'iron', n: 12, price: 60 });
  const ids = [t2.mine(a2)[0].id, t2.mine(d)[0].id];
  const saveD = copy(g2.players.export(d));
  g2.players.leave(d.id);
  const base7 = census(g2, all2, PIDS, [saveD]);
  clock += MARKET.hours * 3600000 - 1000;
  g2.market.sweep();
  check(g2.market.count === 2 && t2.list(b2).total === 2, '기간이 지나기 전에는 그대로 올라와 있다');
  clock += 2000;
  check(t2.list(b2).total === 0, '기간이 지난 물건은 목록에 보이지 않는다');
  const goldB3 = b2.gold;
  t2.cmd(b2, { t: 'market', a: 'buy', id: ids[0] });
  check(t2.said(b2).includes('marketGone') && b2.gold === goldB3, '기간이 지난 물건은 살 수 없다');
  g2.notices = []; g2.out = [];
  for (let i = 0; i <= MARKET.sweepS / 0.05 + 1; i++) g2.tick(0.05);
  const home = a2.mail.find((m) => m.k === 'marketExpired');
  check(g2.market.count === 0 && home?.r.gear?.length === 1 && same(home.r.gear[0].opts, r5.opts) && g2.out.some((o) => o.id === a2.id && o.msg.t === 'market' && o.msg.v === 'mine' && o.msg.list.length === 0), '기간이 지나면 물건이 판매자에게 우편으로 돌아간다');
  check(g2.mail.waitingFor('key-d').length === 1 && g2.mail.waitingFor('key-d')[0].r.items?.iron === 12, '접속해 있지 않은 판매자의 물건은 맡아 둔다');
  check(same(census(g2, all2, PIDS, [saveD]), base7), '기간 만료 뒤에도 총수가 그대로다');
  const bagA2 = a2.gear.length;
  t2.cmd(a2, { t: 'mailClaim', id: home!.id });
  check(a2.gear.length === bagA2 + 1 && !a2.mail.some((m) => m.k === 'marketExpired'), '돌아온 장비를 우편에서 받는다');

  // 맡아 둔 우편은 서버를 껐다 켜도 남고, 그 사람이 접속하면 온다
  const g3 = new Game({ now: () => clock });
  g3.importWorld(copy(g2.exportWorld()));
  const t3 = bench(g3);
  const d3 = t3.mk('떠날 사람', 'key-d', 0, saveD);
  const homeD = d3.mail.find((m) => m.k === 'marketExpired');
  check(homeD?.r.items?.iron === 12 && (d3.items.iron ?? 0) === 0, '접속해 있지 않던 판매자가 다음 접속에 돌아온 물건을 우편으로 받는다');
  t3.cmd(d3, { t: 'mailClaim', id: homeD!.id });
  check(d3.items.iron === 12 && t3.said(d3).includes('mailGot'), '돌아온 재료를 우편에서 받는다');
  check(census(g3, [d3], PIDS).iron + census(g2, all2, []).iron === base7.iron, '서버를 다시 켠 뒤에도 재료의 총수가 그대로다');

  // 깨진 저장을 읽어도 죽지 않고, 멀쩡한 것만 남는다
  const g4 = new Game({ now: () => clock });
  let broke = false;
  try {
    g4.importWorld({
      market: { next: 'x', burned: -1, list: [null, 5, { id: 1 }, { id: 2, seller: 'k', name: 'n', price: 0, until: 1, item: 'iron', n: 1 }, { id: 3, seller: 'k', name: 'n', price: 10, until: clock + 1000, item: 'potion', n: 1 }, { id: 4, seller: 'k', name: 'n', price: 10, until: clock + 1000, item: 'iron', n: 1.5 }, { id: 5, seller: '', name: 'n', price: 10, until: clock + 1000, item: 'iron', n: 1 }, { id: 6, seller: 'k', name: 'n', price: 10, until: clock + 1000, gear: { uid: 0, slot: 'hat' } }, { id: 7, seller: 'k', name: 'n', price: 10, until: clock + 1000, item: 'iron', n: 2 }, { id: 7, seller: 'k', name: 'n', price: 10, until: clock + 1000, item: 'iron', n: 9 }] },
      mailbox: { waiting: [null, { pid: '', list: [] }, { pid: 'k', list: [null, { k: 'marketSold', a: [], r: { gold: 'many', gear: [{ slot: 'hat' }], items: { iron: 2, potion: 'x', nope: 3, sword2: 1 } } }] }] },
    });
  } catch { broke = true; }
  const k = g4.players.spawn('읽는 사람', false, null, 'k');
  check(!broke && g4.market.count === 1 && g4.market.held().items.iron === 2 && g4.market.taxed === 0 && k.mail.some((m) => m.k === 'marketSold' && m.r.gold === undefined && m.r.gear === undefined && same(m.r.items ?? {}, { iron: 2 })), '깨진 저장을 읽어도 서버가 죽지 않고 멀쩡한 물건만 남는다');
}

// ---------- 쪽 넘기기와 정렬 ----------
{
  const g = new Game({ now: () => 0 });
  const { mk, cmd, list } = bench(g);
  const sellers = [mk('가', 'p1'), mk('나', 'p2'), mk('다', 'p3')];
  let price = 100;
  for (const s of sellers) { s.items.iron = MARKET.maxListings; for (let i = 0; i < MARKET.maxListings; i++) cmd(s, { t: 'market', a: 'post', item: 'iron', n: 1, price: (price = (price * 37) % 1009 + 1) }); }
  const total = sellers.length * MARKET.maxListings, pages = Math.ceil(total / MARKET.pageSize);
  const first = list(sellers[0]), last = list(sellers[0], { page: pages - 1 }), far = list(sellers[0], { page: 999999 });
  check(first.list.length === MARKET.pageSize && first.pages === pages && first.total === total && last.list.length === total - MARKET.pageSize * (pages - 1) && far.page === pages - 1, `한 쪽에 ${MARKET.pageSize}개씩 보이고, 없는 쪽을 달라고 하면 마지막 쪽이 온다`);
  const cheap = [...list(sellers[0], { sort: 'cheap' }).list, ...list(sellers[0], { sort: 'cheap', page: 1 }).list].map((x) => x.price);
  const costly = list(sellers[0], { sort: 'costly' }).list.map((x) => x.price);
  const newest = first.list.map((x) => x.id);
  check(cheap.length === total && cheap.every((v, i) => i === 0 || cheap[i - 1] <= v) && costly.every((v, i) => i === 0 || costly[i - 1] >= v) && newest.every((v, i) => i === 0 || newest[i - 1] > v), '싼 순, 비싼 순, 새로 올라온 순으로 줄을 세운다');
  check(first.list.filter((x) => x.mine).length === list(sellers[0]).list.filter((x) => x.seller === '가').length, '내가 올린 것에는 표시가 붙는다');
}

// ---------- 우편함: 예전 저장 형식, 한도 ----------
{
  const clock = new Date(2026, 0, 10, 12).getTime();
  const g = new Game({ now: () => clock });
  const { cmd, said } = bench(g);
  // 물건이 붙기 전의 형식으로 저장된 우편
  const old: PlayerSave = { name: '옛 사람', lv: 3, exp: 0, need: 100, maxHp: 100, sparks: 0, contrib: 0, seen: clock, gold: 10, cls: 'warrior', ext: { mail: { seq: 2, list: [{ id: 1, k: 'idle', a: [30], r: { gold: 5, exp: 7 } }, { id: 2, k: 'attend', a: [1], r: { gold: 30 } }] } } };
  const p = g.players.spawn('옛 사람', false, copy(old), 'key-old');
  check(p.mail.filter((m) => m.id <= 2).length === 2 && p.mail[0].r.gold === 5 && p.mail[0].r.exp === 7, '예전 형식으로 저장된 우편도 그대로 읽힌다');
  cmd(p, { t: 'mailClaim', id: 1 });
  check(p.gold === 15 && said(p).includes('mailGot') && !p.mail.some((m) => m.id === 1), '예전 우편의 보상을 받는다');
  cmd(p, { t: 'mailClaim', id: 0 });

  // 한도: 보상 우편은 오래된 것부터 밀려나지만 거래로 생긴 우편은 밀려나지 않는다
  for (let i = 0; i < 3; i++) g.mail.send(p, 'marketSold', ['iron', 1, 10, 0], { gold: 10 });
  g.mail.send(p, 'marketExpired', ['iron', 2, 10], { items: { iron: 2 } });
  for (let i = 0; i < MAIL_MAX + 10; i++) g.mail.send(p, 'idle', [i], { gold: 1 });
  check(p.mail.length === MAIL_MAX && p.mail.filter((m) => TRADE.includes(m.k)).length === 4 && p.mail[p.mail.length - 1].a[0] === MAIL_MAX + 9, `우편함이 ${MAIL_MAX}통을 넘으면 오래된 보상 우편부터 밀려나고, 거래 우편은 남는다`);
  for (let i = 0; i < MAIL_MAX + 5; i++) g.mail.send(p, 'marketSold', ['iron', 1, 10, 0], { gold: 10 });
  check(p.mail.filter((m) => TRADE.includes(m.k)).length === MAIL_MAX + 9 && p.mail.length === MAIL_MAX + 9, '거래 우편만으로 한도를 넘어도 사라지지 않는다');
  const owed = p.mail.reduce((sum, m) => sum + (m.r.gold ?? 0), 0);
  const g2 = new Game({ now: () => clock });
  const p2 = g2.players.spawn('옛 사람', false, copy(g.players.export(p)), 'key-old');
  check(p2.mail.length === MAIL_MAX + 9 && p2.mail.some((m) => m.r.items?.iron === 2), '한도를 넘긴 거래 우편도 저장되고 다시 읽힌다');
  g2.command(p2, { t: 'mailClaim', id: 0 });
  check(p2.gold === p.gold + owed && owed === 10 * (MAIL_MAX + 8) && p2.items.iron === 2 && p2.mail.length === 0, '모두 받으면 거래 우편의 골드와 재료가 모두 들어온다');
}
