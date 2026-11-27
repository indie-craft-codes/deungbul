// 메아리 계약의 라이브 콘텐츠 (묶음 6, 가상 시계): 2주의 '울림 축제'(시작 → 임무 → 축제 상점 → 끝 → 환전)와 시즌 하나(점수 → 트랙 → 끝 → 놓친 보상·부분 초기화)를
// 한 사람이 처음부터 끝까지 돈다. 그 길에서 상품(하루 꾸러미의 갱신, 상인의 서버 수량, 가방), 업적·칭호, 도감, 우편 만료, 저장과 복귀 보상, 쿠폰을 함께 본다.
// 끝에 서버(메모리 저장소)로 관리자 명령(events·season·coupon·조건부 일괄 우편)과 역할, SQLite의 쿠폰 표를 본다. 수치는 shared/content의 라이브 콘텐츠 절.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVENTS, GOODS, SEASON } from '../shared/content';
import { installEchopact } from '../server/echopact';
import { type Ent, Game, MemoryStore, SqliteStore, SCHEMA, roleFor, startServer } from '@engine/server';
import { SHOPS, seededRng } from '@engine/shared/defs';
import { check, connect, removeTemp, until } from '@engine/testing';

const DAY = 86_400_000, HOUR = 3_600_000;
let clock = Date.UTC(2026, 10, 30, 3);
const g = new Game({ plugins: [installEchopact], now: () => clock });
g.gacha.rng = seededRng(7);
const run = (s: number) => { for (let i = 0; i < s * 20; i++) { g.tick(0.05); clock += 50; } };
/** 시계를 그 시각으로 옮기고 6초를 돌린다 (이벤트·시즌은 5초마다 살핀다) */
const at = (ms: number) => { clock = ms; run(6); };
const said = (p: Ent, k: string) => g.notices.filter((n) => n.id === p.id && n.k === k);
const last = (p: Ent, k: string) => said(p, k).at(-1)?.a ?? [];
const ev = (p: Ent) => g.wallet.kindHave(p, 'sparks', 'event');
const free = (p: Ent) => g.wallet.kindHave(p, 'sparks', 'free');
const mails = (p: Ent, k: string) => p.mail.filter((m) => m.k === k);
const FROM = EVENTS.echofest.from, TO = EVENTS.echofest.to;

const p = g.players.spawn('축제꾼', false, null, 'live-1');
g.fire('playerJoined', p);
run(1);

// ---------- 1. 축제 전: 닫혀 있다. 시즌은 이미 돈다 ----------
g.command(p, { t: 'goods', id: 'festTonic' });
g.daily.add(p, 'kill', 5);
check(g.event.active().length === 0 && last(p, 'goodsNo')[0] === 0 && ev(p) === 0 && g.season.state(p).pts === 5 && g.season.now()!.n === 1,
  `축제 전에는 축제 상점이 닫혀 있고 임무가 세지 않는다. 시즌 1은 이미 돌아 사냥 5마리 = 점수 ${g.season.state(p).pts}`);

// ---------- 2. 축제가 열린다 → 임무 → 축제 조각(이벤트 몫) ----------
at(FROM + 5000);
check(g.announces.some((a) => a.k === 'eventStart' && a.a[0] === 'echofest') && g.event.active().join() === 'echofest', '12-01 00:00 UTC에 축제가 열리고 모두에게 알린다');
g.daily.add(p, 'kill', 40); // 사냥 40 → 60
g.daily.add(p, 'stage', 10); // 단계 10 → 80 + 우편 골드 100
g.daily.add(p, 'pull', 5); // 뽑기 5 → 60
const me = g.event.me(p)[0];
check(ev(p) === 200 && me.got.length === 3 && said(p, 'eventMission').length === 3 && mails(p, 'event').length === 1 && mails(p, 'event')[0].r.gold === 100,
  `임무 셋을 채우면 축제 조각 ${ev(p)}(울림 조각의 이벤트 몫)과 단계 임무의 골드 우편`);
check(g.season.state(p).pts === 5 + 40 + 50 + 15 && g.achieve.state(p).c.kill === 45, `같은 사건이 시즌 점수(${g.season.state(p).pts})와 업적의 셈(사냥 ${g.achieve.state(p).c.kill})에도 든다 (일일 임무와 같은 셈 counted)`);

// ---------- 3. 쓰는 차례: 뽑기는 무상 조각부터, 축제 상점은 이벤트 몫으로만 ----------
g.wallet.add(p, 'sparks', 100, 'admin');
g.gacha.draw(p, 'well', 1);
check(free(p) === 0 && ev(p) === 200, `뽑기(100)는 무상 조각을 먼저 쓰고 축제 조각은 남긴다 (무상 ${free(p)}, 축제 ${ev(p)})`);
const tonic0 = g.bag.count(p, 'tonic');
const buys: [string, number, string][] = [ // [상품, 기대(-1 산다, 그 밖은 goodsNo의 까닭), 무엇]
  ['festShards', -1, '축제 조각 120 → 울림 조각 100 (무상)'],
  ['festTonic', -1, '축제 조각 40 → 물약 셋'],
  ['festGold', 3, '축제 조각이 40뿐: 무상 조각 100이 있어도 못 산다'],
];
for (const [id, want, what] of buys) {
  const n0 = said(p, 'goodsGot').length;
  g.command(p, { t: 'goods', id });
  const ok = said(p, 'goodsGot').length > n0;
  check(want === -1 ? ok : !ok && last(p, 'goodsNo')[0] === want, `축제 상점 ${id}: ${what}`);
}
check(ev(p) === 40 && free(p) === 100 && g.bag.count(p, 'tonic') === tonic0 + 3 && g.goods.count(p, 'festShards') === 1, `축제 조각 ${ev(p)}, 무상 조각 ${free(p)}, 산 수가 축제마다 세진다`);
const lim = GOODS.festShards.limit!.n;
g.wallet.add(p, 'sparks', 999, 'test', 'event');
for (let i = 0; i < lim; i++) g.command(p, { t: 'goods', id: 'festShards' });
check(g.goods.count(p, 'festShards') === lim && last(p, 'goodsNo')[0] === 1, `한정 ${lim}개를 넘으면 막는다 (한도)`);
g.wallet.drainKind(p, 'sparks', 'event', 'test');
g.wallet.add(p, 'sparks', 40, 'test', 'event');

// ---------- 4. 늘 파는 상품: 하루 꾸러미(하루 한 번, 초기화 시각에 다시), 상인 특가(상인 곁, 서버 수량), 가방 ----------
g.wallet.add(p, 'gold', 2000, 'test');
g.command(p, { t: 'goods', id: 'dayPack' });
g.command(p, { t: 'goods', id: 'dayPack' });
const packWhy = last(p, 'goodsNo')[0];
at(clock + DAY);
g.command(p, { t: 'goods', id: 'dayPack' });
check(packWhy === 1 && g.goods.count(p, 'dayPack') === 1 && g.bag.count(p, 'tonic') === tonic0 + 7, '하루 꾸러미(물약 둘 + 조각 20)는 하루 한 번, 다음 날 다시 산다');
g.command(p, { t: 'goods', id: 'wellTonic' });
const far = last(p, 'goodsNo')[0];
g.bag.takeItem(p, 'tonic', 5, 'test');
p.x = SHOPS[0].x; p.z = SHOPS[0].z;
g.command(p, { t: 'goods', id: 'wellTonic' });
g.command(p, { t: 'goods', id: 'wellTonic' });
check(far === 5 && g.goods.left('wellTonic') === GOODS.wellTonic.stock! - 1 && last(p, 'goodsNo')[0] === 4, `상인 특가는 상인 곁에서만, 서버 수량이 줄고(남은 ${g.goods.left('wellTonic')}), 물약이 가득하면 값을 치르기 전에 막는다`);

// ---------- 5. 업적·칭호, 도감 ----------
g.daily.add(p, 'kill', 55);
g.command(p, { t: 'title', id: 'climber' });
const before = p.title;
g.command(p, { t: 'title', id: 'hunter' });
check(g.achieve.state(p).got.includes('hunter') && mails(p, 'achieve').length === 1 && before === '' && p.title === 'hunter' && g.casts.some((c) => c.t === 'title' && c.ti === 'hunter'),
  '사냥 100마리로 업적 사냥꾼(우편 보상)을 이루고 그 칭호만 달 수 있다 (모두에게 알린다)');
for (const m of ['mossling', 'thornboar', 'stonehorn', 'wisp']) g.codex.note(p, 'monster', m);
const cx = g.codex.me(p);
check(cx.seen.echoes.length === Object.keys(p.heroes).length && cx.seen.echoes.includes('brindle') && cx.seen.beasts.length === 4 && mails(p, 'codex').some((m) => m.a[0] === 'beasts' && m.r.gold === 100),
  `도감: 처음 메아리(들어올 때 적힌다)와 뽑아 가진 메아리(${cx.seen.echoes.length}), 처치한 몬스터 넷 → 모은 수 보상(골드 100)`);

// ---------- 6. 시즌: 트랙을 받고, 끝나면 놓친 보상은 우편, 점수는 20%만 ----------
const pts = g.season.state(p).pts;
g.command(p, { t: 'season', i: 0 });
const gotTier = g.season.state(p).got.join();
const missed = SEASON.track.filter((t, i) => pts >= t.pts && i !== 0).length;
at(SEASON.period instanceof Object && 'from' in SEASON.period ? SEASON.period.from + SEASON.period.days * DAY + 5000 : 0);
const s2 = g.season.state(p);
check(gotTier === '0' && missed >= 1 && s2.key === 'd1' && s2.pts === Math.floor(pts * 0.2) && s2.got.length === 0 && mails(p, 'season').length === 1 && last(p, 'seasonNew')[2] === missed,
  `시즌 1의 점수 ${pts}: 1단계를 받고, 끝나면 받지 않은 ${missed}칸이 우편 한 통으로, 시즌 2는 점수 ${s2.pts}(20%)부터`);

// ---------- 7. 축제가 끝난다: 남은 축제 조각의 절반이 무상 조각으로 (우편) ----------
const left = ev(p);
at(TO + 5000);
const swap = mails(p, 'eventSwap')[0];
g.command(p, { t: 'goods', id: 'festTonic' });
check(left === 40 && ev(p) === 0 && swap?.r.sparks === 20 && last(p, 'eventEnd').join() === 'echofest,40,20' && last(p, 'goodsNo')[0] === 0,
  `12-15에 축제가 끝나면 남은 축제 조각 ${left}은 빠지고 절반(${swap?.r.sparks})이 우편으로, 축제 상점은 닫힌다`);
const free0 = free(p);
g.mail.claim(p, swap.id);
check(free(p) === free0 + 20, '바꾼 조각은 무상 몫으로 받는다');

// ---------- 8. 우편 만료: 30일 (하루 전에 한 번 알린다) ----------
const evMail = mails(p, 'event')[0];
at(evMail.x! - 12 * HOUR); run(61); // 우편은 1분마다 본다
const warned = said(p, 'mailExpSoon').length > 0 && evMail.w === 1;
at(evMail.x! + 1000); run(61);
check(warned && !p.mail.includes(evMail) && said(p, 'mailExpired').length > 0, `받지 않은 우편은 30일 뒤 사라지고(${new Date(evMail.x!).toISOString().slice(0, 10)}), 그 하루 안에 미리 알린다`);

// ---------- 9. 저장을 지나 이어지고, 7일 넘게 쉬면 복귀 보상 ----------
{
  const save = structuredClone(g.players.export(p));
  clock += 8 * DAY;
  const h = new Game({ plugins: [installEchopact], now: () => clock });
  const q = h.players.spawn('축제꾼', false, save, 'live-1');
  h.fire('playerJoined', q);
  check(q.title === 'hunter' && h.achieve.state(q).got.join() === g.achieve.state(p).got.join() && h.codex.me(q).seen.beasts.length === 4 && h.goods.count(q, 'dayPack') === 0 && h.season.state(q).pts === g.season.state(p).pts,
    '다시 읽은 캐릭터의 칭호·업적·도감·시즌 점수가 이어진다 (하루 꾸러미는 날이 바뀌어 다시 산다)');
  check(h.event.settle(q) === 0 && q.mail.some((m) => m.k === 'comeback') && h.notices.some((n) => n.id === q.id && n.k === 'comeback' && n.a[0] === 8),
    '끝난 축제는 다시 정리하지 않고, 8일 쉬었다 오면 복귀 보상 우편');
}

// ---------- 10. 쿠폰: 사람마다 한 번, 손님 막기, 틀린 코드 다섯 번이면 잠시 막힘, 금칙어·모양 ----------
{
  const c = g.coupon;
  const made = [c.put('fest-2026', { sparks: 50 }, {}, 'op'), c.put('BAD', { gold: 1 }, {}, 'op'), c.put('FUCK2026', { gold: 1 }, {}, 'op'), c.put('LIMIT1', { gold: 5 }, { uses: 1 }, 'op')];
  const guest = g.players.spawn('손님', false);
  const q = g.players.spawn('다른이', false, null, 'live-2');
  const rows: [Ent, string, number, string][] = [ // [누가, 코드, 기대(-1 받음, 그 밖은 couponNo), 무엇]
    [p, 'fest 2026', -1, '빈칸·하이픈·소문자를 다듬어 받는다'],
    [p, 'FEST2026', 1, '같은 사람은 한 번만'],
    [guest, 'FEST2026', 5, '손님은 쓸 수 없다'],
    [q, 'LIMIT1', -1, '쓰임 1번인 쿠폰'],
    [p, 'LIMIT1', 3, '모두 쓰였다'],
    [q, '!!', 6, '모양이 틀린 코드'],
  ];
  for (const [who, code, want, what] of rows) {
    const n0 = g.notices.filter((n) => n.id === who.id && n.k === 'couponOk').length;
    g.command(who, { t: 'coupon', code });
    const ok = g.notices.filter((n) => n.id === who.id && n.k === 'couponOk').length > n0;
    check(want === -1 ? ok : !ok && last(who, 'couponNo')[0] === want, `쿠폰 ${code}: ${what}`);
  }
  for (let i = 0; i < 4; i++) g.command(q, { t: 'coupon', code: `WRONG${i}A` });
  g.command(q, { t: 'coupon', code: 'FEST2026' });
  check(made[0] === null && !!made[1] && !!made[2] && last(q, 'couponNo')[0] === 4 && mails(p, 'coupon').length === 1,
    '틀린 코드를 다섯 번 넣으면 맞는 코드도 잠시 막힌다. 너무 짧은 코드와 금칙어가 든 코드는 만들 수 없다');
}

// ---------- 11. 서버: 관리자 명령과 역할, 조건부 일괄 우편(만료), SQLite의 쿠폰 표 ----------
{
  const s = await startServer(0, { store: new MemoryStore(), game: { plugins: [installEchopact] }, backup: false, status: false, odds: false });
  try {
    const a = await connect(s.port, 'Opsy', 'token-echopact-live-0001');
    await until(() => !!s.game.ents.get(a.id));
    const e = s.game.ents.get(a.id)!;
    const run2 = (cmd: string, args: string[]) => s.admin.run(cmd, args, 'tester', 'local');
    const evs = run2('events', []), add = run2('coupon', ['add', 'WELCOME', '--gold', '77', '--uses', '10']);
    const role = [roleFor('events', []), roleFor('coupon', ['list']), roleFor('coupon', ['add', 'X']), roleFor('season', [])].join();
    const viewAdd = s.admin.run('coupon', ['add', 'NOPE1', '--gold', '1'], 'tester', 'local', 'view');
    s.game.command(e, { t: 'coupon', code: 'welcome' });
    const lv = e.lv;
    const sent = run2('mail', ['--all', '--lv', `${lv}-${lv}`, '--expire', '3', '--gold', '5']);
    const skip = run2('mail', ['--all', '--lv', `${lv + 1}-`, '--gold', '5']);
    const comp = e.mail.filter((m) => m.k === 'comp');
    check(evs.ok && /echofest/.test(evs.out) && add.ok && role === 'view,view,full,view' && !viewAdd.ok && e.mail.some((m) => m.k === 'coupon' && m.r.gold === 77),
      `관리자: events가 축제와 상품을, coupon add가 쿠폰을 만들고 그 사람이 받는다. 역할 (${role}), 보기 역할은 만들지 못한다`);
    check(/1명/.test(sent.out) && /0명/.test(skip.out) && comp.length === 1 && comp[0].x! - s.game.now() > 2.9 * DAY && comp[0].x! - s.game.now() <= 3 * DAY,
      `조건부 일괄 우편: 레벨 ${lv}만 받고(${sent.out.split('\n')[0]}), 3일 뒤 사라진다`);
    a.ws.close();
  } finally { await s.close(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live6-'));
  try {
    const db = new SqliteStore(path.join(dir, 'c.db'));
    db.putCoupon('ABCD', { code: 'ABCD', r: { gold: 1 }, uses: 0, used: 0, from: 0, to: 0, at: 1, by: 'op', note: '' });
    const once = [db.useCoupon('ABCD', 'k1', 2), db.useCoupon('ABCD', 'k1', 3), db.useCoupon('ABCD', 'k2', 4)].join();
    check(db.schemaVersion() === SCHEMA.length && once === 'true,false,true' && db.coupons()[0].used === 2 && db.couponUsesOf('k1').join() === 'ABCD' && db.forgetCouponUses('k1') === 1,
      `SQLite의 쿠폰 표(스키마 끝 단계 ${SCHEMA.length}): 코드와 사람이 짝으로 한 번, 쓰인 수, 내 데이터 삭제`);
    db.close();
  } finally { removeTemp(dir); }
}
