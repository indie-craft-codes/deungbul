// 경제 3단계: 강화 규칙(+7부터 실패하면 한 단계 내려감, 보호 부적, +7 이상의 가루), 재련, 강화한 장비의 귀속
import { ATTEND, DAILIES, ENHANCE, MARKET, REFORGE, SALVAGE, STAT_IDS, isItemId, type Gear } from '../shared/defs';
import { type Ent, type Game } from '@engine/server';
import { check } from '@engine/testing';
import { newGame } from './game';

const saidOn = (g: Game) => (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => [n.k, ...n.a].join(':'));
const DUST = SALVAGE.item, WARD = ENHANCE.charm;
check(isItemId(DUST) && isItemId(WARD) && ENHANCE.dropFrom === 7 && ENHANCE.bindPlus === 1 && REFORGE.max === 12, '이 게임의 강화 규칙: +7부터 내려가고, 보호 부적과 가루가 있고, 강화한 장비는 귀속, 재련은 12번까지');
if (!isItemId(DUST) || !isItemId(WARD)) throw new Error('가루나 부적이 없다');

const g = newGame({ raid: { hours: [] } }), said = saidOn(g);
const p = g.players.spawn('강화검사', false, null, 'key-enh');
g.classes.apply(p, 'warrior');
/** 다음 굴림을 정한다: 성공하게(0) 또는 실패하게(0.999) */
const next = (v: number) => { g.gear.random = () => v; };
const ring = (plus: number, rar = 2): Gear => {
  const it = g.gear.roll(5, rar, 'ring');
  it.plus = plus; g.gear.put(p, it); return it;
};
const fresh = () => { g.notices = []; };
const cmd = (m: Record<string, unknown>) => g.command(p, m);

// +6까지는 실패해도 그대로이고 가루를 쓰지 않는다
{
  const it = ring(6); p.gold = 1e6; p.items[DUST] = 100; fresh(); next(0.999);
  cmd({ t: 'enhance', uid: it.uid, charm: true });
  check(it.plus === 6 && p.items[DUST] === 100 && said(p).includes('enhanceFail'), '+6에서 실패하면 그대로이고, 가루도 부적도 쓰지 않는다');
}
// +7에서 실패하면 +6으로, 가루는 2 × (등급+1)
{
  const it = ring(7, 2); p.gold = 1e6; p.items[DUST] = 100; p.items[WARD] = 0; fresh(); next(0.999);
  const gold = p.gold;
  cmd({ t: 'enhance', uid: it.uid, charm: true });
  check(it.plus === 6 && p.items[DUST] === 100 - ENHANCE.dust(7, 2) && ENHANCE.dust(7, 2) === 6 && gold - p.gold === ENHANCE.gold(7, 2) && said(p).includes('enhanceDown:6'),
    `+7에서 실패하면 +6으로 내려가고, 골드 ${ENHANCE.gold(7, 2)}와 가루 6이 든다 (부적이 없으면 쓰라고 해도 그대로 내려간다)`);
}
// 보호 부적: 내려갈 수 있는 시도에 한 장, 실패해도 그대로
{
  const it = ring(8); p.gold = 1e6; p.items[DUST] = 100; p.items[WARD] = 2; fresh(); next(0.999);
  cmd({ t: 'enhance', uid: it.uid, charm: true });
  check(it.plus === 8 && p.items[WARD] === 1 && said(p).includes('enhanceSaved:8'), '부적을 쓰면 +8에서 실패해도 그대로이고, 부적 한 장이 든다');
  fresh(); next(0);
  cmd({ t: 'enhance', uid: it.uid, charm: true });
  check(it.plus === 9 && p.items[WARD] === 0 && said(p).includes('enhanceOk:9'), '성공해도 그 시도에 부적 한 장을 쓴다');
  p.items[WARD] = 3; fresh(); next(0.999);
  cmd({ t: 'enhance', uid: it.uid, charm: false });
  check(it.plus === 8 && p.items[WARD] === 3 && said(p).includes('enhanceDown:8'), '부적 쓰기를 끄면 부적을 아끼고 내려간다');
  const low = ring(2); fresh(); next(0.999);
  cmd({ t: 'enhance', uid: low.uid, charm: true });
  check(p.items[WARD] === 3 && low.plus === 2, '내려갈 일이 없는 단계(+2)에서는 부적을 쓰지 않는다');
}
// 가루가 모자라면 골드를 받기 전에 막는다
{
  const it = ring(7); p.gold = 1e6; p.items[DUST] = 1; fresh(); next(0);
  cmd({ t: 'enhance', uid: it.uid });
  check(it.plus === 7 && p.gold === 1e6 && p.items[DUST] === 1 && said(p).includes('noMats'), '+7 이상에서 가루가 모자라면 강화하지 않고 골드도 받지 않는다');
}

// 재련: 옵션 하나의 종류와 값을 다시 뽑는다
{
  const it = ring(0, 3); p.gold = 1e7; p.items[DUST] = 1000; fresh();
  let r = 0.37; g.gear.random = () => { r = (r * 9301 + 0.49297) % 1; return r; };
  const before = it.opts.map((o) => o[0]);
  let gold = p.gold, dust = p.items[DUST] ?? 0, ok = true;
  for (let n = 0; n < REFORGE.max; n++) {
    cmd({ t: 'reforge', uid: it.uid, i: 0 });
    const stats = it.opts.map((o) => o[0]);
    ok &&= it.rf === n + 1 && gold - p.gold === REFORGE.gold(3, n) && dust - (p.items[DUST] ?? 0) === REFORGE.dust(3) && new Set(stats).size === stats.length && stats.slice(1).join() === before.slice(1).join() && STAT_IDS.includes(stats[0]);
    gold = p.gold; dust = p.items[DUST] ?? 0;
  }
  check(ok, `재련 ${REFORGE.max}번: 횟수가 쌓이고, 값은 500 × (등급+1) × 1.25^횟수와 가루 ${REFORGE.dust(3)}, 첫 옵션만 바뀌고 다른 옵션과 종류가 겹치지 않는다`);
  check(REFORGE.gold(3, 0) === 2000 && REFORGE.gold(3, 1) === 2500, '재련의 값: 영웅 첫 번 2,000, 두 번째 2,500');
  fresh(); const g0 = p.gold;
  cmd({ t: 'reforge', uid: it.uid, i: 0 });
  check(it.rf === REFORGE.max && p.gold === g0 && said(p).includes(`reforgeMax:${REFORGE.max}`), '12번을 채우면 더 재련하지 않고 골드도 받지 않는다');
  const other = ring(0, 1), o0 = JSON.stringify(other.opts);
  cmd({ t: 'reforge', uid: other.uid, i: 5 }); cmd({ t: 'reforge', uid: other.uid, i: -1 });
  check(JSON.stringify(other.opts) === o0 && other.rf === undefined, '없는 옵션의 차례는 무시한다');
  p.gold = 0; cmd({ t: 'reforge', uid: other.uid, i: 0 });
  check(JSON.stringify(other.opts) === o0 && said(p).includes('noGold'), '골드가 모자라면 재련하지 않는다');
}

// 귀속: 강화한 장비는 거래소에 올릴 수 없다. 부적도 올릴 수 없다
{
  p.lv = Math.max(p.lv, MARKET.minLv); p.gold = 1e6; fresh();
  const plain = ring(0, 1), up = ring(1, 1);
  cmd({ t: 'market', a: 'post', uid: up.uid, price: 500 });
  check(p.gear.some((x) => x.uid === up.uid) && said(p).includes(`marketBound:${ENHANCE.bindPlus}`), '+1 이상 강화한 장비는 거래소에 올라가지 않는다');
  const plainUid = plain.uid;
  cmd({ t: 'market', a: 'post', uid: plainUid, price: 500 });
  check(!p.gear.some((x) => x.uid === plainUid) && said(p).includes('marketPosted:500'), '강화하지 않은 장비는 그대로 올라간다');
  p.items[WARD] = 3;
  cmd({ t: 'market', a: 'post', item: WARD, n: 1, price: 50 });
  check(p.items[WARD] === 3 && said(p).includes('marketCant'), '보호 부적은 거래소에 올릴 수 없다');
}

// 부적을 받는 곳: 출석 7일째와 강화 일일 임무. 우편으로 받는다
{
  check(ATTEND[6].items?.[WARD] === 2 && (DAILIES.enhance1.r as { items?: Record<string, number> }).items?.[WARD] === 1, '출석 7일째에 부적 2장, 강화 일일 임무에 1장');
  p.items[WARD] = 0; p.mail = [];
  g.mail.send(p, 'attend', [7], ATTEND[6]);
  cmd({ t: 'mailClaim', id: 0 });
  check(p.items[WARD] === 2, '우편으로 받은 부적이 가방에 들어온다');
}

// 저장: 재련 횟수가 남는다
{
  const it = p.gear.find((x) => (x.rf ?? 0) > 0);
  const saved = JSON.parse(JSON.stringify(g.players.export(p)));
  const q = g.players.spawn('강화검사2', false, saved, 'key-enh2');
  check(!!it && q.gear.some((x) => x.uid === it.uid && x.rf === it.rf), '재련한 횟수가 저장되고 다시 읽힌다');
}
check(p.gear.every((x) => x.uid > 0), `가방의 장비는 모두 번호가 있다 (${p.gear.map((x) => x.uid).join(',')})`);
