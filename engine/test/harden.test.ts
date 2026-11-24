// 악용 막기(중간 등급): 허점 검토에서 재현됐던 것들이 다시 생기지 않게 지킨다.
// 항목마다 "고치기 전에는 되던 악용이 이제 안 된다"와 "정상 플레이는 그대로 된다"를 함께 본다.
import { BOSS, CHANNEL, GUILD, ITEMS, MAIL_MAX, MARKET, MAT_MAX, MONSTERS, PARTY, POTION_CD, REJOIN_KEEP_S } from '../shared/defs';
import { NAME_MAX } from '../shared/world';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { fieldLayer } from '../server/game/layers';
import { AWAY_MAX_S } from '../server/game/systems/away';
import { startServer } from '../server/net/server';
import { MemoryStore } from '../server/store';
import { check, connect, sleep, until } from './harness';

const runOn = (g: Game) => (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) g.tick(0.05); };
const saidOn = (g: Game) => (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => [n.k, ...n.a].join(':'));
/** 저장되는 사람(저장 키가 있다)을 만든다 */
const mk = (g: Game, name: string, lv = 12, key = 'key-' + name): Ent => { const p = g.players.spawn(name, false, null, key); g.classes.apply(p, 'warrior'); p.lv = lv; g.players.refresh(p); p.hp = p.maxHp; return p; };
const MAT = Object.keys(ITEMS).find((id) => ITEMS[id as keyof typeof ITEMS].kind === 'mat')!;

// ---------- 1·10. 필드 보스: 한 대 치고 떠난 사람으로 체력을 부풀리거나 되돌리지 못한다 ----------
{
  const H = MONSTERS.ash_troll.hp, share = H * BOSS.hpPerPlayer;
  const setup = () => {
    const g = new Game();
    const troll = [...g.ents.values()].find((e) => e.type === 'ash_troll' && e.layer === fieldLayer(1))!;
    troll.wait = 999;
    const fighter = (name: string, dx: number) => { const p = mk(g, name); p.x = troll.x + dx; p.z = troll.z; p.maxHp = p.hp = 1e7; return p; };
    runOn(g)(0.5);
    return { g, troll, fighter, run: runOn(g) };
  };
  {
    const { g, troll, fighter, run } = setup();
    const a = fighter('혼자', 2), b = fighter('한대', -2);
    g.combat.damage(a, troll, 700, false);
    run(0.1);
    g.combat.damage(b, troll, 10, false);
    run(0.1);
    check(troll.maxHp === H + share && troll.hp === H + share - 710, `둘이 맞서면 체력이 한 사람 몫만큼 늘어난다 (${troll.hp}/${troll.maxHp})`);
    b.x = troll.x + BOSS.countRange + 10; // 한 대 치고 떠난다
    run(0.2);
    check(troll.maxHp === H && troll.hp === H - 700, `한 대 치고 떠나면 체력이 혼자일 때로 돌아가고, 깎아 둔 것은 그대로다 (${troll.hp}/${troll.maxHp}, 고치기 전에는 ${H}/${H}로 회복)`);
    // 떠났다 돌아와 다시 쳐도(되풀이해도) 보스가 회복되지 않는다
    for (let i = 0; i < 3; i++) { b.x = troll.x - 2; g.combat.damage(b, troll, 10, false); run(0.1); b.x = troll.x + BOSS.countRange + 10; run(0.2); }
    check(troll.maxHp === H && troll.hp === H - 700, `들락날락을 되풀이해도 남이 깎아 둔 체력은 그대로다 (${troll.hp}/${troll.maxHp})`);
  }
  { // 곁에 서 있기만 해도(때리지 않으면) 인원에서 빠지고, 빠진 사람은 처치 보상을 받지 못한다
    const { g, troll, fighter, run } = setup();
    const a = fighter('싸운이', 2), b = fighter('선이', -2);
    g.combat.damage(a, troll, 100, false);
    run(0.1);
    g.combat.damage(b, troll, 10, false);
    for (let t = 0; t < BOSS.countS + 2; t++) { g.combat.damage(a, troll, 1, false); a.hp = b.hp = 1e7; run(1); }
    check(troll.maxHp === H && troll.scale === 1, `때리지 않고 ${BOSS.countS}초가 지나면 곁에 있어도 인원에서 빠진다 (${troll.hp}/${troll.maxHp})`);
    const gold = b.gold;
    g.notices = [];
    g.combat.damage(a, troll, 99999, false);
    check(troll.dead && b.gold === gold && saidOn(g)(a).includes('bossDown:ash_troll:1'), '인원에서 빠진 사람은 혼자 몫의 보스에서 보상을 받지 못한다');
  }
  { // 여럿이 깎고 흩어져 한 명이 마무리: 남은 사람이 덜 치게 되지 않는다
    const { g, troll, fighter, run } = setup();
    const a = fighter('남는이', 2), b = fighter('가는이1', -2), c = fighter('가는이2', 0);
    for (const p of [a, b, c]) g.combat.damage(p, troll, 1, false);
    run(0.1);
    g.combat.damage(a, troll, H * 0.5 - 1, false); g.combat.damage(b, troll, H * 0.2 - 1, false); g.combat.damage(c, troll, H * 0.2 - 1, false);
    run(0.1);
    check(troll.maxHp === H + share * 2 && troll.hp === H + share * 2 - H * 0.9, `셋이 맞서 깎는다 (${troll.hp}/${troll.maxHp})`);
    b.x = c.x = troll.x + BOSS.countRange + 10;
    run(0.2);
    check(troll.maxHp === H && troll.hp === H * 0.5, `둘이 떠나면 남은 한 명이 쳐야 할 양은 혼자 싸웠을 때와 같다 (${troll.hp}/${troll.maxHp}: 떠난 사람이 제 몫 안에서 깎은 것은 몫과 함께 사라진다)`);
    // 싸우다 쓰러져 돌아온 사람처럼, 다시 와서 치면 그동안 준 피해가 그대로 인정된다 (손해가 없다)
    b.x = troll.x - 2;
    g.combat.damage(b, troll, 1, false);
    run(0.1);
    check(troll.maxHp === H + share && troll.hp === H + share - H * 0.7 - 1, `돌아와 다시 치면 몫도, 준 피해도 되살아난다 (${troll.hp}/${troll.maxHp})`);
    const gold = b.gold;
    g.combat.damage(a, troll, 99999, false);
    check(b.gold > gold, '돌아와 함께 싸운 사람은 보상을 받는다');
  }
}

// ---------- 3. 재접속으로 체력과 쿨다운을 되돌리지 못한다 ----------
{
  let clock = new Date(2026, 10, 23, 15, 0, 0).getTime();
  const g = new Game({ now: () => clock }), run = runOn(g);
  const p = mk(g, '끊는이');
  run(20);
  const m = [...g.ents.values()].find((e) => e.kind === 'm' && !e.dead && e.layer === p.layer)!;
  p.x = m.x + 1; p.z = m.z; p.targetId = m.id;
  g.command(p, { t: 'skill', n: 0 });
  const cd = p.cds[0];
  p.itemCd = POTION_CD; p.hp = Math.round(p.maxHp * 0.3); p.lastHurt = g.clock;
  const save = () => JSON.parse(JSON.stringify(g.players.export(p)));
  const s1 = save();
  const back = (s: unknown, name: string) => g.players.spawn(name, false, s as never, 'key-' + name);

  clock += 3000;
  g.cdAcks = []; g.itemCds = [];
  const b1 = back(s1, '세초뒤');
  check(cd > 3 && Math.abs(b1.hp / b1.maxHp - 0.3) < 0.01, `3초 만에 다시 접속하면 체력이 그대로다 (${Math.round(b1.hp)}/${b1.maxHp})`);
  check(Math.abs(b1.cds[0] - (cd - 3)) < 0.2 && Math.abs(b1.itemCd - (POTION_CD - 3)) < 0.2, `기술 쿨다운과 물약 대기는 떠나 있던 3초만큼만 줄어든다 (쿨다운 ${cd} → ${b1.cds[0].toFixed(1)}, 물약 ${b1.itemCd.toFixed(1)})`);
  check(g.cdAcks.some((a) => a.id === b1.id && a.n === 0 && a.ms > 0) && g.itemCds.some((a) => a.id === b1.id && a.ms > 0), '남은 쿨다운을 화면에도 알린다');
  check(Math.abs(g.clock - b1.lastHurt - 3) < 1.5, '맞은 지 얼마 안 됐으면 다시 접속해도 곧바로 회복되지 않는다');
  { const hp = b1.hp; run(1); check(b1.hp === hp, '다시 접속한 직후에는 체력이 저절로 차지 않는다'); run(6); check(b1.hp > hp, '시간이 지나면 평소처럼 회복된다'); }

  clock += 10 * 60000;
  const b2 = back(s1, '십분뒤');
  check(REJOIN_KEEP_S < 600 && b2.hp === b2.maxHp && b2.cds.every((v) => v === 0) && b2.itemCd === 0, '10분 쉬고 오면 체력이 가득하고 쿨다운도 없다');

  const old = save();
  delete (old.ext as Record<string, unknown>).vitals;
  const b3 = back(old, '옛저장');
  check(b3.hp === b3.maxHp && b3.cds.every((v) => v === 0), '이 값들이 없는 예전 저장도 읽히고, 가득 찬 채로 시작한다');
  const bad = save();
  (bad.ext as Record<string, unknown>).vitals = { at: clock, hp: -3, cds: ['x', 1e9, null], icd: 1e9, hurt: 'y' };
  const b4 = back(bad, '깨진저장');
  check(b4.hp === b4.maxHp && b4.cds.every((v) => Number.isFinite(v) && v >= 0 && v <= 600) && b4.itemCd <= POTION_CD, '깨진 값은 범위 안으로 맞춘다');
}

// ---------- 4. 순위: 이름이 아니라 저장 키로 사람을 구분한다 (오늘의 등탑지기 명단은 games/deungbul/test/harden.test.ts) ----------
{
  const clock = new Date(2026, 10, 23, 15, 0, 0).getTime();
  const g = new Game({ now: () => clock });
  const champ = mk(g, '챔피언', 30), low = mk(g, '도전자', 3), guest = g.players.spawn('손님', false);
  guest.lv = 99;
  g.rank.tick(99);
  const power = g.rank.power(champ);
  check(g.rank.top()[0].name === '챔피언' && g.rank.top().every((r) => r.name !== '손님'), '저장 키가 있는 사람만 순위에 오른다 (손님은 오르지 않는다)');
  g.players.leave(champ.id);
  g.players.rename(low, '챔피언'); // 접속해 있지 않은 1위의 이름으로 바꾼다
  g.rank.tick(99);
  const top = g.rank.top();
  check(top[0].power === power && top.filter((r) => r.name === '챔피언').length === 2 && top.length === 2, `남의 이름으로 바꿔도 남의 줄을 덮어쓰지 못한다 (1위 전투력 ${top[0].power}, 원래 ${power})`);
  g.players.rename(low, '새이름');
  g.rank.tick(99);
  check(g.rank.top().some((r) => r.name === '새이름' && r.power === g.rank.power(low)) && g.rank.top().length === 2, '이름을 바꾸면 내 줄의 이름이 따라온다 (줄이 늘지 않는다)');
  g.out = [];
  g.command(low, { t: 'rank' });
  const msg = g.out.find((o) => o.id === low.id && o.msg.t === 'rank')!.msg as { list: object[]; me: number };
  check(msg.me === 1 && !JSON.stringify(msg.list).includes('key-') && msg.list.every((r) => !('pid' in r)), '내 순위는 저장 키로 찾고, 화면에 보내는 줄에는 저장 키가 없다');
  g.out = [];
  g.command(guest, { t: 'rank' });
  check((g.out.find((o) => o.id === guest.id)!.msg as { me: number }).me === -1, '손님의 내 순위는 없다');

  // 저장했다 읽는다. 예전 형식(이름만 있는 줄)도 읽힌다
  const g2 = new Game({ now: () => clock });
  g2.importWorld(JSON.parse(JSON.stringify(g.exportWorld())));
  check(g2.rank.top().length === 2 && g2.rank.top()[0].power === power, '순위가 저장되고 다시 읽힌다');
  const g3 = new Game({ now: () => clock });
  g3.importWorld({ tower: {}, rank: [{ name: '옛사람', lv: 9, cls: 'warrior', power: 500 }, { name: '옛둘', lv: 2, cls: 'archer', power: 60 }] });
  check(g3.rank.top().length === 2 && g3.rank.top()[0].name === '옛사람', '이름만으로 저장된 예전 순위도 읽힌다');
  const fake = mk(g3, '옛사람', 2, 'key-fake');
  g3.rank.tick(99);
  check(g3.rank.top()[0].power === 500 && g3.rank.top().filter((r) => r.name === '옛사람').length === 2, '옛 줄의 이름만 맞춰 온 약한 캐릭터는 그 줄을 덮어쓰지 못한다');
  g3.players.leave(fake.id);
  const owner = mk(g3, '옛둘', 12, 'key-owner');
  g3.rank.tick(99);
  check(g3.rank.top().filter((r) => r.name === '옛둘').length === 1 && g3.rank.top().find((r) => r.name === '옛둘')!.power === g3.rank.power(owner), '옛 줄의 주인이 접속하면 그 줄을 이어받는다 (두 줄이 되지 않는다)');
}

// ---------- 5. 자리 비움 사냥: 하루 누적 한도 ----------
{
  let clock = new Date(2026, 10, 23, 9, 0, 0).getTime();
  const g = new Game({ now: () => clock });
  const p = mk(g, '비움이');
  p.x = 60; p.z = 60;
  // 한 시간 사냥하고 잠깐 다시 접속하기를 되풀이한다
  let hours = 0;
  for (; hours < 12 && (hours === 0 || p.auto); hours++) {
    p.auto = true;
    g.away.start(p);
    for (let i = 0; i < 60 && p.auto; i++) { p.hp = p.maxHp = 1e7; g.tick(60); }
    g.away.stop(p);
  }
  check(hours <= AWAY_MAX_S / 3600 + 1 && !p.auto && p.away.used >= AWAY_MAX_S && p.away.used <= AWAY_MAX_S + 60, `잠깐씩 다시 접속해도 한도는 처음부터 다시 세지 않는다 (${hours}시간 만에 끝남, 한도 ${AWAY_MAX_S / 3600}시간)`);
  p.auto = true;
  g.away.start(p);
  check(!p.auto, '한도를 다 쓴 날은 자동 사냥을 켠 채 끊겨도 캐릭터가 남지 않는다 (자동 사냥이 꺼져 평소처럼 나간다)');
  const save = JSON.parse(JSON.stringify(g.players.export(p)));
  const again = g.players.spawn('비움이2', false, save, 'key-비움이2');
  check(g.away.left(again) === 0, '쓴 시간은 캐릭터와 함께 저장된다');
  clock += 24 * 3600000;
  const next = g.players.spawn('비움이3', false, save, 'key-비움이3');
  next.auto = true;
  g.away.start(next);
  check(g.away.left(next) === AWAY_MAX_S && next.auto, '날이 바뀌면 한도가 새로 주어진다');
  const fresh = mk(g, '처음');
  fresh.auto = true;
  g.away.start(fresh);
  g.tick(0.05);
  check(fresh.auto && g.away.left(fresh) < AWAY_MAX_S && g.away.left(fresh) > AWAY_MAX_S - 5, '한도가 남은 사람은 전처럼 자리 비움 사냥이 된다');
}

// ---------- 6·7. 거래소: 우편함을 창고로 쓰지 못하고, 전체 물건 수에 상한이 있다 ----------
{
  const g = new Game(), said = saidOn(g);
  const p = mk(g, '창고지기'), seller = mk(g, '판매자');
  p.items[MAT] = MAT_MAX; seller.items[MAT] = 50; p.gold = 1000;
  const post = (who: Ent, price = 10) => g.command(who, { t: 'market', a: 'post', item: MAT, n: 1, price });
  for (let i = 0; i < MAIL_MAX - 1; i++) g.mail.send(p, 'marketBack', [MAT, 1, 5], { items: { [MAT]: 1 } });
  post(p);
  check(g.market.count === 1, `물건이 붙은 우편이 ${MAIL_MAX - 1}통이면 아직 올릴 수 있다`);
  g.mail.send(p, 'marketBack', [MAT, 1, 5], { items: { [MAT]: 1 } });
  post(seller, 20);
  g.notices = [];
  post(p);
  check(g.market.count === 2 && said(p).includes(`marketMailFull:${MAIL_MAX}`), `물건이 붙은 우편이 ${MAIL_MAX}통이면 올리기를 막고 이유를 알린다`);
  g.notices = [];
  const gold = p.gold;
  g.command(p, { t: 'market', a: 'buy', id: 2 });
  check(g.market.count === 2 && p.gold === gold && said(p).includes(`marketMailFull:${MAIL_MAX}`), '사기도 막는다 (돈이 빠져나가지 않는다)');
  p.items[MAT] = MAT_MAX;
  g.command(p, { t: 'market', a: 'cancel', id: 1 });
  check(g.market.count === 1 && p.mail.length === MAIL_MAX + 1, '내리기는 막지 않는다: 가방(재료 한도)이 가득하면 물건은 우편으로 돌아온다');
  g.command(p, { t: 'mailClaim', id: 0 });
  p.items[MAT] = 5; // 우편을 비우고 가방도 비웠다
  g.command(p, { t: 'mailClaim', id: 0 });
  g.notices = [];
  post(p);
  check(g.market.count === 2 && !said(p).some((k) => k.startsWith('marketMailFull')), '우편을 받고 나면 다시 올릴 수 있다');

  // 전체 상한
  const keep = MARKET.maxTotal;
  (MARKET as { maxTotal: number }).maxTotal = 3;
  post(seller, 30);
  g.notices = [];
  const had = seller.items[MAT];
  post(seller, 40);
  check(keep === 2000 && g.market.count === 3 && seller.items[MAT] === had && said(seller).includes('marketCrowded'), '거래소 전체의 물건 수가 상한에 닿으면 올리기를 막고 알린다 (물건은 가방에 그대로다)');
  g.command(p, { t: 'market', a: 'buy', id: 2 });
  check(g.market.count === 2, '상한에 닿아도 사기와 내리기는 된다');
  (MARKET as { maxTotal: number }).maxTotal = keep;
}

// ---------- 8. 깨진 저장 값 ----------
{
  const g = new Game();
  const p = mk(g, '우편주인');
  const save = JSON.parse(JSON.stringify(g.players.export(p)));
  (save.ext as Record<string, unknown>).mail = { seq: 9, list: [
    { id: 1, k: 'idle', a: [5, { x: 1 }, 'y'.repeat(200)], r: { gold: -5, exp: '100', sparks: 1e12, items: { [MAT]: 1e9, nothing: 3 } } },
    { id: 2, k: 'idle', a: [], r: { gold: 2.9, exp: 1e300 } },
    null, { id: 'x' },
  ] };
  const q = g.players.spawn('우편주인2', false, save, 'key-우편주인2');
  const m1 = q.mail.find((m) => m.id === 1)!, m2 = q.mail.find((m) => m.id === 2)!;
  check(!!m1 && m1.r.gold === undefined && m1.r.exp === undefined && m1.r.sparks === 1e7 && m1.r.items?.[MAT] === MAT_MAX && m1.r.items.nothing === undefined, `우편 보상의 음수·문자열은 버리고, 아주 큰 값은 상한으로 맞춘다 (${JSON.stringify(m1?.r)})`);
  check(!!m2 && m2.r.gold === 2 && m2.r.exp === 1e7 && m1.a.length === 2 && String(m1.a[1]).length <= 40, '소수는 내림하고, 제목에 넣을 값도 글자와 수만 짧게 남긴다');
  const lv = q.lv;
  g.command(q, { t: 'mailClaim', id: 0 });
  check(q.gold < 1e7 && q.lv >= lv && Number.isFinite(q.exp) && Number.isFinite(q.sparks), '깨진 우편을 받아도 캐릭터의 수치가 망가지지 않는다');

  const errors: unknown[] = [], keepErr = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  const g2 = new Game();
  g2.importWorld({ tower: {}, guilds: null, market: null, mailbox: null } as never);
  const g3 = new Game();
  g3.importWorld({ tower: {}, guilds: { next: 'x', list: [null, 7, { id: 'x', name: '글자번호', members: [{ pid: 'k0', name: '영' }] }, { id: NaN, name: '깨진번호', members: [{ pid: 'k9', name: '구' }] },
    { id: 4, name: '멀쩡한길드', leader: 'k1', exp: -50, notice: 5, members: [null, { pid: 'k1', name: '하나'.repeat(20), lv: 'x', gave: Infinity }] }] },
    market: { next: 9, list: [null, { id: 1, seller: 'k1', name: '긴'.repeat(60), price: 10, until: Date.now() + 1e7, item: MAT, n: 1 }] } } as never);
  console.error = keepErr;
  check(errors.length === 0 && g2.guild.count === 0, '길드·거래소·우편 칸이 null이어도 예외 없이 지나간다');
  check(g3.guild.count === 1, '깨진 길드가 섞여 있어도 멀쩡한 길드는 읽힌다');
  const one = mk(g3, '하나', 12, 'k1'), fresh = mk(g3, '새길드장', 12, 'k5');
  fresh.gold = 1000;
  g3.command(fresh, { t: 'guild', a: 'create', name: '새길드' });
  check(g3.guild.count === 2, '깨진 번호가 다음 길드 번호를 망가뜨리지 않는다 (새 길드를 만들 수 있다)');
  g3.out = [];
  g3.clock += 5;
  g3.command(one, { t: 'market', a: 'list' });
  const listing = (g3.out.find((o) => o.id === one.id && o.msg.t === 'market')!.msg as { list: { seller: string }[] }).list[0];
  check(!!listing && listing.seller.length <= NAME_MAX, `거래소의 판매자 이름은 이름 길이 한도로 자른다 (${listing?.seller.length}자)`);
}

// ---------- 11·15. 채널: 재접속으로 이동 대기와 싸움 판정을 지우지 못한다 ----------
{
  const g = new Game(), run = runOn(g), said = saidOn(g);
  const rejoin = (p: Ent) => { g.fire('playerDropped', p); const save = JSON.parse(JSON.stringify(g.players.export(p))); g.players.leave(p.id); return g.players.spawn(p.name, false, save, p.pid); };
  const a = mk(g, '옮긴이');
  run(20);
  g.command(a, { t: 'channel', n: 2 });
  check(a.layer === fieldLayer(2), '평소에는 채널을 옮길 수 있다');
  const a2 = rejoin(a);
  g.notices = [];
  g.command(a2, { t: 'channel', n: a2.layer === fieldLayer(3) ? 1 : 3 });
  check(said(a2).some((k) => k.startsWith('channelWait:')), '다시 접속해도 채널 이동 대기는 남는다');
  run(CHANNEL.switchCdS + 0.5);
  const to = a2.layer === fieldLayer(3) ? 1 : 3;
  g.command(a2, { t: 'channel', n: to });
  check(a2.layer === fieldLayer(to), '대기가 끝나면 다시 접속했던 사람도 옮길 수 있다');

  const b = mk(g, '싸운이');
  run(20);
  const m = [...g.ents.values()].find((e) => e.kind === 'm' && !e.dead && e.layer === b.layer && !e.def?.boss)!;
  b.x = m.x + 1; b.z = m.z;
  g.combat.damage(b, m, 1, false);
  const b2 = rejoin(b);
  b2.x = 0; b2.z = 3; // 다시 접속한 뒤에는 몬스터가 나를 잊었고, 나는 맞은 적도 없다
  g.notices = [];
  g.command(b2, { t: 'channel', n: b2.layer === fieldLayer(2) ? 1 : 2 });
  check(said(b2).includes('channelFight'), '싸우다 끊고 다시 접속해도 한동안은 싸우는 중이다');
  run(CHANNEL.calmS + 0.5);
  const to2 = b2.layer === fieldLayer(2) ? 1 : 2;
  g.command(b2, { t: 'channel', n: to2 });
  check(b2.layer === fieldLayer(to2), '싸움이 가라앉으면 옮길 수 있다');

  // 가득 찬 채널로 옮기기를 거절할 때 최신 인원을 함께 보낸다
  const full = b2.layer === fieldLayer(3) ? 1 : 3;
  for (let i = 0; i < CHANNEL.hard; i++) g.players.spawn('봇' + i, true).layer = fieldLayer(full);
  run(CHANNEL.switchCdS + 0.5);
  g.notices = []; g.out = [];
  g.command(b2, { t: 'channel', n: full });
  const tell = g.out.find((o) => o.id === b2.id && o.msg.t === 'channels')?.msg as { list: number[] } | undefined;
  check(said(b2).includes(`channelFull:${full}`) && !!tell && tell.list[full - 1] >= CHANNEL.hard, '가득 찬 채널로는 옮길 수 없고, 거절하면서 최신 인원을 알린다');
}

// ---------- 12·13. 초대: 길드 초대는 가까운 사람에게만, 거절당한 초대는 한동안 다시 보내지 못한다 ----------
{
  const g = new Game(), run = runOn(g), said = saidOn(g);
  const lead = mk(g, '길드장'), t = mk(g, '상대');
  lead.gold = 1000;
  g.command(lead, { t: 'guild', a: 'create', name: '초대길드' });
  const invites = () => g.out.filter((o) => o.id === t.id && o.msg.t === 'guild' && (o.msg as { invite?: unknown }).invite).length;
  const invite = () => { g.out = []; g.notices = []; g.command(lead, { t: 'guild', a: 'invite', id: t.id }); return invites(); };
  t.x = lead.x + PARTY.inviteRange + 20; t.z = lead.z;
  check(invite() === 0, '멀리 있는 사람은 길드에 초대할 수 없다');
  t.x = lead.x + 2; t.layer = fieldLayer(2);
  check(invite() === 0, '다른 채널에 있는 사람은 길드에 초대할 수 없다');
  t.layer = lead.layer;
  check(invite() === 1, '같은 채널의 가까운 사람은 초대할 수 있다');
  g.command(t, { t: 'guild', a: 'decline' });
  check(invite() === 0 && said(lead).includes('guildBusy:상대'), '거절당한 길드 초대는 곧바로 다시 보낼 수 없다');
  const other = mk(g, '다른길드장');
  other.gold = 1000; other.x = t.x; other.z = t.z;
  g.command(other, { t: 'guild', a: 'create', name: '다른길드' });
  g.out = [];
  g.command(other, { t: 'guild', a: 'invite', id: t.id });
  check(invites() === 1, '그동안 다른 길드의 초대는 들어온다 (초대 칸을 붙들 수 없다)');
  g.command(t, { t: 'guild', a: 'decline' });
  run(GUILD.reinviteS + 1);
  check(invite() === 1, `${GUILD.reinviteS}초가 지나면 다시 초대할 수 있다`);
  run(GUILD.inviteS + 1); // 받지 않고 두어 사라진 초대
  check(invite() === 0, '받지 않은 채 사라진 초대도 곧바로 다시 보낼 수 없다');
  run(GUILD.reinviteS + 1);
  check(invite() === 1, '간격이 지나면 다시 보낼 수 있다');
  g.command(t, { t: 'guild', a: 'accept' });
  check(g.guild.nameOf(t) === '초대길드', '초대를 받아들이면 길드에 든다');

  const a = mk(g, '파티장'), b = mk(g, '파티원');
  b.x = a.x + 2; b.z = a.z;
  const pinv = () => { g.partyOut = []; g.notices = []; g.command(a, { t: 'party', a: 'invite', id: b.id }); return g.partyOut.filter((o) => o.id === b.id && o.msg.t === 'pinv').length; };
  check(pinv() === 1, '파티 초대가 간다');
  g.command(b, { t: 'party', a: 'decline' });
  check(pinv() === 0 && said(a).includes('partyBusy:파티원'), '거절당한 파티 초대는 곧바로 다시 뜨지 않는다');
  run(PARTY.reinviteS + 1);
  check(pinv() === 1, `${PARTY.reinviteS}초가 지나면 다시 초대할 수 있다`);
  g.command(b, { t: 'party', a: 'accept' });
  g.command(b, { t: 'party', a: 'leave' });
  check(pinv() === 1, '받아들였던 사이에는 간격을 두지 않는다 (나갔다가 곧바로 다시 초대받을 수 있다)');
}

// ---------- 2·3·5. 통신 계층: 제한은 연결이 아니라 사람에게 붙는다 ----------
{
  const store = new MemoryStore();
  const server = await startServer(0, { store });
  const game = server.game;
  const tok = (s: string) => `harden-token-${s}-0123456789`;
  try {
    const watch = await connect(server.port, '지켜봄', tok('watch'));
    const heard = (text: string) => watch.chat.filter((l) => l.endsWith(': ' + text)).length;

    // 대화 간격: 다시 접속해도 이어진다
    const c1 = await connect(server.port, '수다', tok('chat'));
    c1.send({ t: 'chat', text: '첫마디' });
    await until(() => heard('첫마디') === 1);
    c1.ws.close();
    const c2 = await connect(server.port, undefined, tok('chat'));
    c2.send({ t: 'chat', text: '재접속하고바로' });
    await sleep(400);
    check(heard('첫마디') === 1 && heard('재접속하고바로') === 0, '다시 접속해도 대화 간격은 지워지지 않는다');
    await sleep(500);
    c2.send({ t: 'chat', text: '기다렸다가' });
    check(await until(() => heard('기다렸다가') === 1), '간격이 지나면 평소처럼 말할 수 있다');

    // 이름 바꾸기 간격
    c2.send({ t: 'rename', name: '수다쟁이' });
    await until(() => game.ents.get(c2.id)?.name === '수다쟁이');
    c2.ws.close();
    const c3 = await connect(server.port, undefined, tok('chat'));
    c3.send({ t: 'rename', name: '또바꿈' });
    check(await until(() => c3.sys.includes('renameWait')) && game.ents.get(c3.id)!.name !== '또바꿈', '다시 접속해도 이름 바꾸기 간격은 지워지지 않는다');

    // 신고: 간격과 기록
    const bad = await connect(server.port, '말썽', tok('bad'));
    await sleep(750);
    bad.send({ t: 'chat', text: '나쁜말' });
    await until(() => heard('나쁜말') === 1);
    bad.ws.close();
    await until(() => !game.ents.has(bad.id));
    const bad2 = await connect(server.port, undefined, tok('bad'));
    c3.send({ t: 'report', id: bad2.id });
    check(await until(() => c3.sys.some((s) => s.startsWith('reported:'))) && store.reports(1)[0].lines.includes('나쁜말'), '신고당한 사람이 다시 접속해도 그 전에 한 말이 신고에 함께 적힌다');
    c3.ws.close();
    bad2.ws.close();
    await until(() => !game.ents.has(bad2.id) && !game.ents.has(c3.id));
    const bad3 = await connect(server.port, undefined, tok('bad')), c4 = await connect(server.port, undefined, tok('chat'));
    c4.send({ t: 'report', id: bad3.id });
    check(await until(() => c4.sys.includes('reportWait')) && store.reports(10).length === 1, '둘 다 다시 접속해도 같은 사람을 곧바로 다시 신고할 수 없다');
    c4.ws.close(); bad3.ws.close();

    // 대화량: 한 사람이 천천히 말하는 것은 그대로 되고, 한 주소에서 연결을 여러 개 열어 뿌리는 것은 막힌다
    await sleep(2500);
    const calm = await connect(server.port, '차분', tok('calm'));
    for (let i = 0; i < 4; i++) { calm.send({ t: 'chat', text: '차분' + i }); await sleep(750); }
    check(await until(() => [0, 1, 2, 3].every((i) => heard('차분' + i) === 1)), '한 사람이 간격을 두고 하는 말은 모두 전해진다');
    calm.ws.close();
    await sleep(2500);
    const many = await Promise.all(Array.from({ length: 10 }, (_, i) => connect(server.port, '도배' + i, tok('flood' + i))));
    const t0 = Date.now(), before = watch.chat.length;
    for (let round = 0; round < 4; round++) { for (const p of many) p.send({ t: 'chat', text: `도배${round}` }); await sleep(720); }
    await sleep(200);
    const seconds = (Date.now() - t0) / 1000, got = watch.chat.length - before;
    check(got >= 6 && got <= 6 + 3 * seconds + 1 && many.some((p) => p.sys.includes('chatWait')), `연결 10개로 40줄을 보내도 한 주소의 대화는 한도까지만 전해진다 (${seconds.toFixed(1)}초 동안 ${got}줄, 넘친 사람에게는 알린다)`);
    for (const p of many) p.ws.close();
    await sleep(300);

    // 재접속: 체력이 가득 차지 않는다
    const h1 = await connect(server.port, '다친이', tok('hurt'));
    h1.send({ t: 'class', id: 'warrior' });
    await until(() => !!game.ents.get(h1.id)?.cls);
    const e1 = game.ents.get(h1.id)!;
    e1.hp = e1.maxHp * 0.25; e1.lastHurt = game.clock; e1.unsaved = true;
    h1.ws.close();
    await until(() => !game.ents.has(h1.id));
    const h2 = await connect(server.port, undefined, tok('hurt'));
    const e2 = game.ents.get(h2.id)!;
    check(e2.hp / e2.maxHp < 0.3, `싸우다 끊고 곧바로 다시 접속해도 체력은 그대로다 (${Math.round(e2.hp)}/${e2.maxHp})`);
    h2.ws.close();

    // 자리 비움 사냥: 오늘 한도를 다 썼으면 끊겨도 남지 않고, 남았으면 남는다
    const stay = async (name: string, used: number) => {
      const p = await connect(server.port, name, tok(name));
      p.send({ t: 'class', id: 'warrior' });
      await until(() => !!game.ents.get(p.id)?.cls);
      const e = game.ents.get(p.id)!;
      e.lv = 5; e.away = { day: game.daily.dayOf(Date.now()), used };
      p.send({ t: 'auto', on: true });
      await until(() => e.auto);
      p.ws.close();
      await sleep(400);
      return game.ents.has(p.id);
    };
    check(!(await stay('awayused', AWAY_MAX_S)), '오늘 한도를 다 쓴 캐릭터는 자동 사냥을 켠 채 끊겨도 월드에 남지 않는다');
    check(await stay('awayleft', 0), '한도가 남은 캐릭터는 전처럼 남아 사냥한다');
    watch.ws.close();
  } finally {
    await server.close();
  }
}

// ---------- 서버를 껐다 켜도 자리 비움 사냥은 이어진다 ----------
// 자리 비움 사냥 중인 캐릭터는 서버의 기억에만 있어서, 전에는 다시 켜면 월드에서 빠진 채 주인이 접속할 때까지 멈춰 있었다.
// 끌 때 사냥 중이던 캐릭터(자리 비움 사냥 중 + 자동 사냥을 켠 채 접속해 있던 사람)를 적어 두고, 켤 때 다시 세운다.
{
  const store = new MemoryStore();
  const grow = async (port: number, game: Game, name: string, token: string, lv: number, auto: boolean) => {
    const p = await connect(port, name, token);
    const e = game.ents.get(p.id)!;
    p.ws.send(JSON.stringify({ t: 'class', id: 'warrior' }));
    await until(() => e.cls === 'warrior');
    e.lv = lv; game.players.refresh(e); e.hp = e.maxHp; e.unsaved = true;
    if (auto) { p.ws.send(JSON.stringify({ t: 'auto', on: true })); await until(() => e.auto); }
    return { p, e };
  };
  let first = await startServer(0, { store });
  const gone = await grow(first.port, first.game, '이어사냥', 'restore-token-away-0001', 6, true);
  gone.p.ws.close();
  await sleep(400);
  const here = await grow(first.port, first.game, '켜둔사람', 'restore-token-conn-0002', 6, true);
  const idle = await grow(first.port, first.game, '안켠사람', 'restore-token-idle-0003', 6, false);
  const low = await grow(first.port, first.game, '낮은사람', 'restore-token-low-00004', 1, true);
  check(first.game.ents.has(gone.p.id) && first.game.away.active(gone.e), '끄기 전: 자동 사냥을 켠 채 끊긴 캐릭터가 남아 사냥한다');
  await first.close();
  void here; void idle; void low;

  const second = await startServer(0, { store });
  try {
    const names = () => [...second.game.ents.values()].filter((e) => e.kind === 'p').map((e) => e.name).sort();
    check(names().join() === ['이어사냥', '켜둔사람'].sort().join(), `다시 켜면 사냥 중이던 캐릭터만 다시 선다: ${names().join(', ')} (자동 사냥을 켜지 않았거나 레벨이 모자란 캐릭터는 서지 않는다)`);
    const back = [...second.game.ents.values()].find((e) => e.name === '이어사냥')!;
    check(back.lv === 6 && back.auto && second.game.away.active(back), '다시 선 캐릭터는 저장된 그대로이고 서버가 이어서 사냥한다');
    // 주인이 돌아오면 평소처럼 그 캐릭터를 넘겨받는다 (둘이 되지 않는다)
    const again = await connect(second.port, undefined, 'restore-token-away-0001');
    check(again.id === back.id && [...second.game.ents.values()].filter((e) => e.name === '이어사냥').length === 1 && !second.game.away.active(back), '주인이 접속하면 그 캐릭터를 넘겨받는다');
    again.ws.close();
  } finally {
    await second.close();
  }
  // 되살린 뒤에 다시 꺼도 같다: 그때 사냥 중이던 캐릭터(넘겨받았다가 다시 끊긴 것 포함)가 또 적히고 또 선다
  const third = await startServer(0, { store });
  try {
    const left = [...third.game.ents.values()].filter((e) => e.kind === 'p').map((e) => e.name).sort();
    check(left.join() === ['이어사냥', '켜둔사람'].sort().join(), `둘째로 끌 때도 그때 사냥 중이던 캐릭터가 적힌다: ${left.join(', ')}`);
  } finally {
    await third.close();
  }
}
