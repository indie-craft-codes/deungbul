// 안개 균열: 5분짜리 인스턴스 생존전 (서버 없이 게임 규칙만 돌린다. 시계는 시험이 직접 돌린다)
// 가장 중요한 것은 총량 불변이다: 판 안의 처치로는 골드·경험치·불씨·장비·재료·퀘스트·일일 임무가 하나도 늘지 않고,
// 하루 횟수는 던전과 함께 쓰며, 보상은 끝날 때 우편 한 통(mail:rift)으로만 온다.
import { DUNGEONS, DUNGEON_ECON, QUESTS, RIFT, RIFT_ECON, RIFT_PICKS, RIFT_UPS, RIFT_UP_IDS, SKILL_DEFS, classOf, riftKeep, riftPack, riftReward, riftUp, runKey, type RiftUpId } from '../shared/defs';
import { AREAS, areaAt } from '../shared/world';
import { RIFT_LAYER } from '../server/systems/rift';
import type { Ent } from '@engine/server/game/entity';
import { Game } from '@engine/server/game/game';
import { fieldLayer, isField } from '@engine/server/game/layers';
import type { EconRow } from '@engine/server/store';
import { check } from '@engine/test/harness';
import { newGame } from './game';
import { hero } from './rift-kit';

const KEY = runKey(RIFT_ECON.sharesRunsWith);
const inArena = (p: { x: number; z: number }) => AREAS[areaAt(p.x, p.z)]?.id === RIFT.area.id;
const atGate = (p: { x: number; z: number }) => Math.hypot(p.x - RIFT.portal.x, p.z - RIFT.portal.z) < 5;
const sumRows = (rows: EconRow[], why: (w: string) => boolean) => rows.filter((r) => why(r.why)).reduce((s, r) => s + r.amount, 0);

/** 게임 하나와 그것을 다루는 손잡이들 */
function bench() {
  const t = { clock: new Date(2026, 0, 10, 12).getTime() };
  const g = newGame({ now: () => t.clock, raid: { hours: [] } });
  /** 안에 있는 동안 죽지 않게 지켜 줄 사람들 (긴 판을 끝까지 보려는 시험용) */
  const safe = new Set<Ent>();
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) { for (const p of safe) p.hp = p.maxHp; g.tick(0.05); t.clock += 50; } };
  const said = (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Ent, m: Record<string, unknown>) => { g.notices = []; g.out = []; g.command(p, m); };
  const toGate = (p: Ent) => { p.x = RIFT.portal.x + 1; p.z = RIFT.portal.z; p.layer = isField(p.layer) ? p.layer : fieldLayer(1); };
  const enter = (p: Ent) => { toGate(p); cmd(p, { t: 'rift', a: 'enter' }); };
  const mobs = (p: Ent) => [...g.ents.values()].filter((m) => m.kind === 'm' && m.layer === p.layer && !m.dead);
  const sent = <T extends string>(p: Ent, type: T) => g.out.filter((o) => o.id === p.id && o.msg.t === type).map((o) => o.msg) as Extract<(typeof g.out)[number]['msg'], { t: T }>[];
  /** 다음에 뜨는 고르기에 그 강화가 맨 앞에 나오게 한다 (고를 것은 끝까지 올리지 않은 것 가운데 무작위다) */
  const want = (p: Ent, id: RiftUpId) => {
    const ups = g.rift.runOf(p)!.ups, pool = RIFT_UP_IDS.filter((x) => (ups[x] ?? 0) < RIFT_UPS[x].max);
    let first = true;
    g.rift.random = () => (first ? (first = false, (pool.indexOf(id) + 0.5) / pool.length) : Math.random());
  };
  return { g, t, safe, run, said, cmd, toGate, enter, mobs, sent, want };
}

// ---------- 틀만의 게임에는 균열이 없다 ----------
{
  const g = new Game();
  check(!('rift' in g) && !g.commands.has('rift') && g.rules.credit === undefined && g.mods.product('area') === 1 && g.mods.product('cooldown') === 1,
    '틀만으로 만든 게임에는 균열이 없다: 시스템도 명령도 없고, 틀의 접점(g.rules.credit, 범위·대기 시간 보정)은 비어 있어 전과 같다');
  const p = g.players.spawn('틀', false);
  g.classes.apply(p, 'warrior');
  const m = g.monsters.spawn('goblin', p.x + 1, p.z);
  m.layer = p.layer = 5000; // 틀의 인스턴스 층 (던전이 쓰는 범위)
  g.gear.random = () => 0;
  const gold = p.gold;
  g.combat.damage(p, m, 9999, false);
  check(p.gold > gold && p.exp > 0 && p.gear.length > 1, '접점을 채우지 않으면 인스턴스 안의 처치도 전처럼 보상과 장비를 준다');
}

// ---------- 입장 조건, 물결, 처치 보상 없음, 강화, 완주와 보상 ----------
{
  const { g, t, safe, run, said, cmd, toGate, enter, mobs, sent, want } = bench();
  const a = hero(g, '앞장', 'warrior', 'rare15'), outsider = hero(g, '구경', 'warrior', 'rare15');

  // 들어갈 수 없는 경우
  a.x = 0; a.z = 6;
  cmd(a, { t: 'rift', a: 'enter' });
  check(said(a).includes('riftFar') && isField(a.layer), '문에서 멀면 들어갈 수 없다');
  toGate(a);
  a.lv = RIFT.minLv - 1;
  cmd(a, { t: 'rift', a: 'enter' });
  check(said(a).includes('riftLevel') && isField(a.layer) && RIFT.minLv === DUNGEONS.crypt.minLv, `레벨이 모자라면 들어갈 수 없다 (던전과 같은 레벨 ${RIFT.minLv})`);
  a.lv = 15; g.players.refresh(a);

  // 들어가기 전의 수치: 나온 뒤에 이것과 같아야 한다
  const before = { dmg: g.mods.product('damage', a), guard: g.mods.product('guard', a), crit: g.mods.sum('crit', a), area: g.mods.product('area', a), cd: g.mods.product('cooldown', a), speed: g.rules.speed(a), maxHp: a.maxHp };
  const save0 = JSON.stringify(g.players.export(a).ext);
  check(!('rift' in (g.players.export(a).ext ?? {})) && !('rift' in g.exportWorld()), '균열에 들어간 적이 없으면 캐릭터 저장과 월드 저장에 균열의 칸이 생기지 않는다 (하지 않는 사람의 저장은 전과 같다)');
  // 판 안의 처치가 아무것도 올리지 않는지 보려고: 첫 퀘스트(슬라임 잡기)와 일일 임무(처치 30), 휴식 보너스를 걸어 둔다
  a.qc = 0; a.qs = 0; a.qn = 0; a.rested = 500; a.daily.prog = {}; a.daily.got = [];
  check(QUESTS[0].steps[0].goal.kind === 'kill', '(준비) 첫 퀘스트 단계가 처치 목표다');
  a.hp = 10;
  a.layer = fieldLayer(2); // 2채널에서 들어간다: 나오면 2채널로 돌아와야 한다
  enter(a);
  check(!isField(a.layer) && a.layer >= RIFT_LAYER && inArena(a) && said(a).includes('riftEnter') && g.rift.count === 1 && a.hp === a.maxHp, '들어가면 나만의 판이 열리고, 전장 한가운데에 온전한 체력으로 선다');
  check(a.daily.prog[KEY] === 1 && KEY === runKey('crypt') && RIFT.perDay === DUNGEON_ECON.crypt.perDay, `입장 횟수를 던전과 같은 칸(${KEY})에 센다`);
  const base = { gold: a.gold, exp: a.exp, lv: a.lv, sparks: a.sparks, gear: a.gear.length, items: JSON.stringify(a.items), qn: a.qn, qs: a.qs, kill30: a.daily.prog.kill30 ?? 0, rested: a.rested, mail: a.mail.length };
  safe.add(a);

  // 물결: 화면 밖에서 나타나 쫓아온다
  run(2.5);
  const first = mobs(a);
  const d0 = first.map((m) => Math.hypot(m.x - a.x, m.z - a.z));
  check(first.length >= RIFT.waves[0].n && first.every((m) => m.targetId === a.id && m.def!.exp === 0 && m.def!.gold[1] === 0) && Math.min(...d0) > 8,
    `첫 무리 ${first.length}마리가 사람 둘레의 바깥(가장 가까운 것 ${Math.min(...d0).toFixed(0)}m)에 나타나 나를 노린다. 처치 보상이 없는 판 전용 정의다`);
  // 강화 고르기: 처음 한 번은 곧바로 온다. 셋을 보여 주고, 안 고르면 15초 뒤 첫째 것이 골라진다
  run(1);
  const offer1 = g.rift.runOf(a)!.offer!;
  check(!!offer1 && offer1.length === RIFT.choices && new Set(offer1).size === 3 && offer1.every((id) => RIFT_UP_IDS.includes(id)), `들어가자마자 강화 셋을 보여 준다 (${offer1?.join(', ')})`);
  cmd(a, { t: 'rift', a: 'pick', n: 7 });
  check(g.rift.runOf(a)!.offer !== null, '보여 주지 않은 번호는 고를 수 없다');
  run(RIFT.pickTimeoutS + 0.5);
  check(g.rift.runOf(a)!.offer === null && g.rift.runOf(a)!.ups[offer1[0]] === 1 && g.rift.stats.timeouts === 1, `${RIFT.pickTimeoutS}초 안에 고르지 않으면 첫째 것(${offer1[0]})이 골라진다`);
  const gotFirst = offer1[0];
  // 쫓아온다: 달아나도 놓지 않고 집으로 돌아가지도 않는다
  const near = mobs(a).filter((m) => Math.hypot(m.x - a.x, m.z - a.z) < 4).length;
  check(near >= 3, `몰려와 붙는다 (4m 안에 ${near}마리)`);
  a.x = RIFT.area.x0 + 6; a.z = RIFT.area.z0 + 6; a.tx = a.x; a.tz = a.z;
  run(4);
  const chasing = mobs(a);
  check(chasing.length > 0 && chasing.every((m) => m.targetId === a.id && !m.homing && Math.hypot(m.x - a.x, m.z - a.z) <= RIFT.regroupAt + 1), '전장의 구석으로 달아나도 모두 나를 쫓고(집으로 돌아가지 않는다), 멀어진 것은 내 둘레로 다시 온다');

  // ---------- 판 안의 처치는 아무것도 주지 않는다 ----------
  const realRandom = Math.random;
  const killAll = () => { let n = 0; for (const m of mobs(a)) { if (m.def?.boss) continue; g.combat.damage(a, m, 99999, false); n++; } return n; };
  g.gear.random = () => 0; // 장비가 반드시 떨어지는 굴림
  Math.random = () => 0; // 재료가 반드시 떨어지는 굴림
  let killed = killAll();
  Math.random = realRandom;
  run(140 - g.rift.runOf(a)!.t); // 고블린이 나오는 물결까지 (재료를 떨어뜨리는 종류)
  const types5 = new Set(mobs(a).map((m) => m.type));
  Math.random = () => 0;
  killed += killAll();
  Math.random = realRandom; g.gear.random = Math.random;
  check(killed >= 30 && types5.has('goblin') && g.rift.runOf(a)!.kills >= killed, `판 안에서 ${killed}마리를 잡았다 (고블린 포함: 들판이라면 재료와 장비가 반드시 떨어지는 굴림으로)`);
  check(a.gold === base.gold && a.exp === base.exp && a.lv === base.lv && a.sparks === base.sparks, '판 안의 처치로 골드·경험치·불씨가 늘지 않는다');
  check(a.gear.length === base.gear && JSON.stringify(a.items) === base.items && a.mail.length === base.mail, '판 안의 처치로 장비·재료·우편이 생기지 않는다');
  check(a.qn === base.qn && a.qs === base.qs && (a.daily.prog.kill30 ?? 0) === base.kill30 && a.rested === base.rested && !a.daily.got.includes('kill30'), '판 안의 처치로 퀘스트·일일 임무의 처치 수가 오르지 않고 휴식 보너스도 줄지 않는다');
  const rowsMid = g.ledger.rows();
  check(sumRows(rowsMid, (w) => w.startsWith('hunt')) === 0 && sumRows(rowsMid, (w) => w === 'other' || w === 'tick') === 0, '장부에 사냥(hunt, huntDungeon)으로도, 원인 모를 변화(other, tick)로도 아무것도 적히지 않았다');

  // ---------- 강화: 열 가지를 하나씩 골라 효과를 본다 ----------
  const pickNext = (id: RiftUpId) => {
    want(a, id);
    for (let i = 0; i < 20 * 35 && !g.rift.runOf(a)!.offer; i++) { a.hp = a.maxHp; g.tick(0.05); t.clock += 50; }
    g.rift.random = Math.random;
    const o = g.rift.runOf(a)!.offer!;
    cmd(a, { t: 'rift', a: 'pick', n: o.indexOf(id) });
    return g.rift.runOf(a)!.ups[id] ?? 0;
  };
  const order: RiftUpId[] = (['might', 'reach', 'haste', 'swift', 'vigor', 'ward', 'keen', 'ring', 'chain'] as RiftUpId[]).filter((id) => id !== gotFirst);
  const lv: Partial<Record<RiftUpId, number>> = { [gotFirst]: 1 };
  // 같은 것을 다시 고르면 단계가 오른다
  lv.might = pickNext('might');
  if (gotFirst !== 'might') { lv.might = pickNext('might'); order.splice(order.indexOf('might'), 1); }
  check(lv.might === 2 && Math.abs(g.mods.product('damage', a) / before.dmg - riftUp.might(2)) < 1e-9, `같은 강화를 다시 고르면 단계가 오른다: 거센 일격 2단계, 공격 피해 ×${riftUp.might(2)}`);
  check(g.mods.product('damage', outsider) === before.dmg && g.mods.product('area', outsider) === 1 && g.rules.speed(outsider) === before.speed, '강화는 그 판의 그 사람에게만 듣는다 (밖에 있는 같은 차림의 사람은 그대로다)');
  for (const id of order) if (!lv[id]) lv[id] = pickNext(id);
  const ups = g.rift.runOf(a)!.ups;
  check(RIFT_UP_IDS.filter((id) => id !== 'leech').every((id) => (ups[id] ?? 0) >= 1), `한 판에 고르는 횟수는 ${RIFT_PICKS}번이다: 여기까지 ${Object.values(ups).reduce((s, n) => s + (n ?? 0), 0)}번 골랐다 (${Object.entries(ups).map(([k, v]) => k + v).join(' ')})`);
  check(Math.abs(g.mods.product('area', a) - riftUp.reach(ups.reach!)) < 1e-9 && Math.abs(g.mods.product('cooldown', a) - riftUp.haste(ups.haste!)) < 1e-9 && Math.abs(g.rules.speed(a) / before.speed - riftUp.swift(ups.swift!)) < 1e-9,
    '범위·기술 대기 시간·이동 속도의 강화가 보정으로 들어간다');
  check(a.maxHp === before.maxHp + riftUp.vigor(ups.vigor!, classOf(a.cls).hp + 15 * (a.lv - 1)) && Math.abs(g.mods.sum('crit', a) - before.crit - riftUp.keen(ups.keen!)) < 1e-9 && Math.abs(g.mods.product('guard', a) / before.guard - riftUp.ward(ups.ward!)) < 1e-9,
    `최대 체력(${before.maxHp} → ${a.maxHp})·치명타·받는 피해의 강화가 보정으로 들어간다`);
  // 기술: 대기 시간이 줄고 범위가 넓어진다 (회오리: 내 둘레)
  for (const m of mobs(a)) g.remove(m.id);
  const whirl = SKILL_DEFS.whirl, slot = classOf('warrior').skills.indexOf('whirl');
  const edge = g.monsters.spawn('slime', a.x + whirl.radius * 1.1, a.z); edge.layer = a.layer; edge.hp = edge.maxHp = 9999;
  a.cds[slot] = 0; g.cdAcks = [];
  cmd(a, { t: 'skill', n: slot });
  check(edge.hp < 9999 && Math.abs(a.cds[slot] - whirl.cd * riftUp.haste(ups.haste!)) < 1e-9 && g.cdAcks.some((c) => c.id === a.id && Math.abs(c.ms - whirl.cd * riftUp.haste(ups.haste!) * 1000) < 1e-6),
    `범위 기술이 넓어져 반경의 1.1배 거리의 적이 맞고, 대기 시간이 ${whirl.cd}초에서 ${a.cds[slot].toFixed(2)}초로 준다 (화면에도 줄어든 시간을 알린다)`);
  // 안개 고리: 가만히 있어도 둘레의 적이 깎인다
  const hpRing = edge.hp;
  edge.x = a.x + 2; edge.z = a.z; g.out = [];
  run(RIFT_UPS.ring.everyS + 0.2);
  check(edge.hp < hpRing && sent(a, 'riftFx').length > 0, '안개 고리가 간격마다 둘레의 적을 깎고, 화면에 고리를 알린다');
  // 번지는 일격: 기본 공격이 곁의 다른 적에게 번진다
  for (const m of mobs(a)) if (m !== edge) g.remove(m.id);
  const side = g.monsters.spawn('slime', a.x + 2.5, a.z + 1); side.layer = a.layer; side.hp = side.maxHp = 9999;
  edge.hp = 9999; a.atkCd = 0; a.targetId = edge.id;
  const sideHp = side.hp;
  // 고리가 터지지 않는 사이에 기본 공격 한 번
  for (let i = 0; i < 6 && side.hp === sideHp; i++) { a.hp = a.maxHp; g.tick(0.05); t.clock += 50; }
  check(side.hp < sideHp, '번지는 일격: 기본 공격이 곁의 다른 적에게 번진다');
  g.remove(edge.id); g.remove(side.id);

  // ---------- 동시에 살아 있는 몬스터의 수, 종류가 세지는 것, 우두머리 ----------
  let peak = 0, boss = false;
  const seen = new Set<string>();
  while (g.rift.runOf(a) && !g.rift.runOf(a)!.ended && g.rift.runOf(a)!.t < RIFT.timeS - 2) {
    run(1);
    const list = mobs(a);
    peak = Math.max(peak, list.length);
    for (const m of list) { seen.add(m.type); if (m.def?.boss) boss = true; }
    // 마지막 고르기: 남은 한 가지(불씨 삼키기)
    if (g.rift.runOf(a)?.offer) { const o = g.rift.runOf(a)!.offer!; cmd(a, { t: 'rift', a: 'pick', n: Math.max(0, o.indexOf('leech')) }); }
  }
  check(peak <= RIFT.maxFoes && RIFT.maxFoes < 60 && peak >= 40, `동시에 살아 있는 몬스터는 판당 ${RIFT.maxFoes}마리를 넘지 않는다 (가장 많을 때 ${peak})`);
  check(boss && ['lost_soldier', 'shade_bram', 'shade_mira'].every((x) => seen.has(x)) && said(a).includes('riftBoss') === false, `뒤로 갈수록 센 종류가 나오고 우두머리가 나타난다 (${[...seen].join(', ')})`);
  // 처치 회복
  if ((g.rift.runOf(a)!.ups.leech ?? 0) > 0) {
    safe.delete(a);
    a.hp = Math.round(a.maxHp / 2);
    const hp = a.hp;
    const m = mobs(a).find((x) => !x.def?.boss)!;
    a.lastHurt = g.clock; // 자연 회복이 섞이지 않게
    g.combat.damage(a, m, 99999, false);
    g.events = [];
    for (let i = 0; i < 12; i++) { g.tick(0.05); t.clock += 50; if (g.events.some((e) => e[0] === 'heal' && e[1] === a.id)) break; }
    check(g.events.some((e) => e[0] === 'heal' && e[1] === a.id) || a.hp > hp, '불씨 삼키기: 적을 쓰러뜨리면 체력이 돌아온다');
    safe.add(a);
  }

  // ---------- 5분을 버티면 완주: 보상은 우편 한 통, 던전 한 번과 같은 크기 ----------
  g.out = []; g.notices = [];
  run(4);
  const end = sent(a, 'riftEnd')[0], full = DUNGEON_ECON.crypt.reward;
  check(!!end && end.done && end.timeS === RIFT.timeS && g.rift.runOf(a)!.ended && mobs(a).length === 0 && inArena(a), '5분을 버티면 완주다: 남은 떼가 흩어지고 결과를 알린다 (나가기 전까지 전장에 남는다)');
  const mail = a.mail[a.mail.length - 1];
  check(a.mail.length === base.mail + 1 && mail.k === 'rift' && mail.r.gold === full.gold + RIFT_ECON.firstClearGold && mail.r.exp === full.exp && mail.r.sparks === full.sparks,
    `보상은 우편 한 통: 던전 완료 보상과 같은 골드 ${full.gold}·경험치 ${full.exp}·불씨 ${full.sparks}, 그리고 처음 완주 덤 골드 ${RIFT_ECON.firstClearGold}`);
  check(mail.r.gear?.length === 1 && mail.r.gear[0].rar >= DUNGEONS.crypt.dropRar && mail.r.gear[0].lv === DUNGEONS.crypt.dropLv && a.gear.length === base.gear, '장비 한 점도 그 우편에 붙는다: 던전과 같은 최저 등급과 장비 레벨 (가방에 바로 들어오지 않는다)');
  check(a.rift.s === RIFT.timeS && a.rift.clears === 1 && a.rift.first && end.best.s === RIFT.timeS && end.best.dayS === RIFT.timeS && end.newBest && g.rift.best(a).k === end.kills, '기록이 남는다: 버틴 시간과 처치 수, 오늘의 것, 완주 횟수');
  // 끝나면 강화가 사라진다
  check(g.mods.product('damage', a) === before.dmg && g.mods.product('area', a) === 1 && g.mods.product('cooldown', a) === 1 && g.rules.speed(a) === before.speed && a.maxHp === before.maxHp && g.mods.sum('crit', a) === before.crit && g.mods.product('guard', a) === before.guard,
    '판이 끝나면 강화가 사라진다: 공격 피해·범위·대기 시간·이동 속도·최대 체력·치명타·받는 피해가 들어가기 전과 같다');
  safe.delete(a);
  cmd(a, { t: 'rift', a: 'leave' });
  check(isField(a.layer) && a.layer === fieldLayer(2) && atGate(a) && g.rift.count === 1 && said(a).includes('riftLeft') && a.hp === a.maxHp, '나가면 문 앞, 들어가기 전의 채널로 돌아온다');
  run(0.1);
  check(g.rift.count === 0, '모두 나가면 판은 사라진다');
  // 우편을 받으면 장부에 mail:rift로 적힌다
  cmd(a, { t: 'mailClaim', id: mail.id });
  run(0.1);
  const rows = g.ledger.rows();
  const of = (cur: string, why: string) => rows.filter((r) => r.cur === cur && r.why === why && r.dir === '+').reduce((s, r) => s + r.amount, 0);
  check(of('gold', 'mail:rift') === full.gold + RIFT_ECON.firstClearGold && of('exp', 'mail:rift') === full.exp && of('sparks', 'mail:rift') === full.sparks && rows.filter((r) => r.cur.startsWith('gear:') && r.why === 'mail:rift').reduce((s, r) => s + r.amount, 0) === 1,
    '받은 보상은 장부에 mail:rift로 따로 적힌다 (골드, 경험치, 불씨, 장비 한 점)');
  check(sumRows(rows, (w) => w.startsWith('hunt')) === 0 && sumRows(rows, (w) => w === 'other' || w === 'tick') === 0 && a.gold === base.gold + full.gold + RIFT_ECON.firstClearGold,
    '한 판이 통째로 끝난 뒤에도 장부의 사냥 칸과 원인 모를 칸은 0이다: 이 판이 준 것은 우편이 전부다');
  // 저장 왕복: 기록은 남고, 강화나 판의 상태는 저장에 없다
  const save = g.players.export(a);
  const back = g.players.spawn('앞장', false, JSON.parse(JSON.stringify(save)));
  check(JSON.stringify(back.rift) === JSON.stringify(a.rift) && back.maxHp === a.maxHp && save0.includes('"rift"') === false && Object.keys(save.ext!.rift as object).sort().join() === 'clears,day,dayK,dayS,first,k,s',
    '저장 왕복: 기록(가장 오래 버틴 시간, 처치 수, 오늘의 것, 완주 횟수)이 그대로 돌아온다. 저장에는 기록뿐이다');
  const w = JSON.parse(JSON.stringify(g.exportWorld())) as Record<string, { runs: number; clears: number; picked: Record<string, number> }>;
  check(w.rift.runs === 1 && w.rift.clears === 1 && Object.values(w.rift.picked).reduce((s, n) => s + n, 0) === RIFT_PICKS, `지표의 재료가 월드 저장에 쌓인다: 입장 ${w.rift.runs}, 완주 ${w.rift.clears}, 강화별 선택 수 합 ${RIFT_PICKS}`);
  g.players.leave(back.id);

  // ---------- 하루 횟수: 던전과 함께 3번 ----------
  // 지금까지 균열 1번. 던전 1번, 균열 1번을 더 쓰면 둘 다 못 들어간다
  const dg = DUNGEONS.crypt;
  a.x = dg.portal.x + 1; a.z = dg.portal.z; a.layer = fieldLayer(1);
  cmd(a, { t: 'dungeon', id: 'crypt' });
  check(!isField(a.layer) && a.daily.prog[KEY] === 2, '던전에 들어가면 같은 횟수가 준다 (균열 1번 + 던전 1번 = 2번)');
  cmd(a, { t: 'rift', a: 'enter' });
  check(g.rift.count === 0, '던전 안에서는 균열에 들어갈 수 없다');
  cmd(a, { t: 'dungeonLeave' });
  // 두 번째 판: 처음 완주 덤은 한 번뿐이다. 1분 전에 나오면 보상이 없고 횟수는 그대로 쓴다
  enter(a);
  check(a.daily.prog[KEY] === 3 && !isField(a.layer), '세 번째 입장 (균열 2번 + 던전 1번)');
  safe.add(a);
  run(RIFT_ECON.minS - 10);
  const mails = a.mail.length;
  safe.delete(a);
  g.out = [];
  cmd(a, { t: 'rift', a: 'leave' });
  const quit = sent(a, 'riftEnd')[0];
  check(a.mail.length === mails && !!quit && !quit.done && quit.reward.gold === 0 && !quit.reward.gear && quit.timeS < RIFT_ECON.minS && !quit.newBest && a.rift.s === RIFT.timeS, `1분을 버티지 못하고 나오면 보상이 없다 (${quit?.timeS}초). 횟수는 썼고, 기록은 더 좋은 것이 남는다`);
  enter(a);
  check(said(a).includes('riftNoRuns') && isField(a.layer), `하루 ${RIFT.perDay}번을 다 쓰면 균열에 들어갈 수 없다`);
  a.x = dg.portal.x + 1; a.z = dg.portal.z;
  cmd(a, { t: 'dungeon', id: 'crypt' });
  check(said(a).includes('dungeonNoRuns') && isField(a.layer), '던전에도 들어갈 수 없다: 횟수를 함께 쓴다');
  // 날이 바뀌면 다시 열린다. 두 번째 완주에는 덤이 없다
  t.clock += 24 * 3600000;
  enter(a);
  check(!isField(a.layer) && a.daily.prog[KEY] === 1, '날이 바뀌면 다시 들어갈 수 있다');
  safe.add(a);
  while (g.rift.runOf(a) && !g.rift.runOf(a)!.ended) { run(1); if (g.rift.runOf(a)?.offer) cmd(a, { t: 'rift', a: 'pick', n: 0 }); }
  const mail2 = a.mail[a.mail.length - 1];
  check(mail2.k === 'rift' && mail2.r.gold === full.gold && a.rift.clears === 2 && g.rift.best(a).dayS === RIFT.timeS, `두 번째 완주: 덤 없이 던전과 같은 골드 ${full.gold} (처음 완주 덤은 한 번만)`);
  safe.delete(a);
  cmd(a, { t: 'rift', a: 'leave' });
}

// ---------- 쓰러짐: 한 번은 제자리에서 일어나고, 두 번째에 끝난다. 중도 종료의 보상 ----------
{
  const { g, t, safe, run, said, cmd, enter, mobs, sent } = bench();
  const a = hero(g, '혼자', 'mage', 'supply8');
  enter(a);
  safe.add(a);
  // 3분 20초를 버틴다 (고르기는 첫째 것)
  while (g.rift.runOf(a)!.t < 200) { run(1); if (g.rift.runOf(a)?.offer) cmd(a, { t: 'rift', a: 'pick', n: 0 }); }
  safe.delete(a);
  const at = { x: a.x, z: a.z }, crowd = mobs(a).length;
  const foe = () => mobs(a).find((m) => !m.def?.boss) ?? (() => { const m = g.monsters.spawn('slime', a.x + 1, a.z); m.layer = a.layer; return m; })();
  g.notices = [];
  g.combat.damage(foe(), a, 99999, false);
  const r1 = g.rift.runOf(a)!;
  check(r1.downs === 1 && !r1.out && !r1.ended && inArena(a) && Math.hypot(a.x - at.x, a.z - at.z) < 1 && a.hp === a.maxHp && said(a).includes('riftRevive') && said(a).includes('died'),
    '처음 쓰러지면 제자리에서 온전한 체력으로 다시 일어난다');
  check(mobs(a).every((m) => !!m.def?.boss || Math.hypot(m.x - a.x, m.z - a.z) > RIFT.reviveClear - 0.01) && crowd > 0, `일어나며 둘레 ${RIFT.reviveClear}m의 떼를 밀어낸다`);
  const hp = a.hp;
  g.combat.damage(foe(), a, 5000, false);
  check(a.hp === hp - 1 && g.rift.runOf(a)!.downs === 1, `일어난 뒤 ${RIFT.reviveSafeS}초 동안은 피해를 받지 않는다 (틀이 남기는 1뿐)`);
  for (let i = 0; i < 20 * (RIFT.reviveSafeS + 0.5); i++) { a.hp = a.maxHp; g.tick(0.05); t.clock += 50; }
  g.out = []; g.notices = [];
  g.combat.damage(foe(), a, 99999, false);
  const end = sent(a, 'riftEnd')[0], r2 = g.rift.runOf(a)!;
  check(r2.downs === 2 && r2.out && !!end && !end.done && end.timeS >= 200 && end.timeS < RIFT.timeS, `두 번째로 쓰러지면 내 판이 끝난다 (${end?.timeS}초 버팀)`);
  run(0.1);
  check(g.rift.runOf(a)!.ended && mobs(a).length === 0 && inArena(a), '혼자였으면 판이 끝나고 떼가 사라진다. 결과를 보는 동안은 전장에 남는다');
  // 중도 종료의 보상: 버틴 시간에 비례하고, 3분을 넘겼으니 장비도 붙는다 (등급은 평소 굴림)
  const mail = a.mail[a.mail.length - 1], want = riftReward(end.timeS, false), full = DUNGEON_ECON.crypt.reward;
  check(mail.k === 'rift' && mail.r.gold === want.gold && mail.r.gold === Math.floor(full.gold * end.timeS / RIFT.timeS) && mail.r.gold < full.gold && mail.r.exp === want.exp && mail.r.gear?.length === 1 && end.reward.gear && end.reward.bonus === 0,
    `중도에 끝나면 버틴 시간만큼 깎인 보상이 온다: 골드 ${mail.r.gold} / ${full.gold}, 장비 한 점(${RIFT_ECON.gearFromS}초부터)`);
  check(riftReward(RIFT_ECON.minS - 1, false).gold === 0 && riftReward(RIFT_ECON.gearFromS - 1, false).gear === 'none' && riftReward(RIFT.timeS - 1, false).gold < full.gold && riftReward(RIFT.timeS, true).gold === full.gold && riftReward(RIFT.timeS, true, true).bonus === RIFT_ECON.firstClearGold && riftReward(RIFT.timeS, true).bonus === 0,
    '보상의 식: 1분 미만은 없음, 3분 전에는 장비 없음, 완주해야 던전과 같아지고, 덤은 처음 완주에만');
  // 결과를 보다가 시간이 지나면 저절로 나간다
  run(RIFT.exitS + 0.5);
  check(isField(a.layer) && atGate(a) && g.rift.count === 0, `결과를 본 채 ${RIFT.exitS}초가 지나면 문 앞으로 나간다`);
  void safe;
}

// ---------- 끊기면 판이 끝난다. 서버를 껐다 켠 뒤 ----------
{
  const { g, safe, run, cmd, enter, mobs } = bench();
  const a = hero(g, '끊김', 'archer', 'rare15');
  a.auto = true; // 자동 사냥을 켠 채로 끊겨도 판은 이어지지 않는다
  enter(a);
  safe.add(a);
  while (g.rift.runOf(a)!.t < 90) { run(1); if (g.rift.runOf(a)?.offer) cmd(a, { t: 'rift', a: 'pick', n: 0 }); }
  safe.delete(a);
  const layer = a.layer, mails = a.mail.length;
  g.fire('playerDropped', a); // 통신 계층이 저장하기 전에 부른다
  const save = g.players.export(a);
  check(isField(a.layer) && atGate(a) && !g.rift.runOf(a) && a.mail.length === mails + 1 && a.mail[a.mail.length - 1].r.gold === riftReward(a.rift.s, false).gold && a.rift.s >= 90,
    `접속이 끊기면 판이 끝난다: 그때까지의 기록(${a.rift.s}초)으로 보상을 받고 문 앞에서 저장된다 (자리 비움 사냥으로 판을 돌리지 못한다)`);
  run(0.1);
  check(g.rift.count === 0 && [...g.ents.values()].every((m) => m.layer !== layer), '끊겨서 빈 판은 몬스터와 함께 사라진다');
  check(Math.hypot(save.at![0] - RIFT.portal.x, save.at![1] - RIFT.portal.z) < 5, '저장된 자리는 문 앞이다');
  void mobs;

  // 서버가 꺼졌다 켜졌다: 판은 없고, 전장 안에서 저장된 캐릭터는 문 앞에서 시작한다
  const g2 = newGame({ raid: { hours: [] } });
  const stuck = { ...JSON.parse(JSON.stringify(save)), at: [RIFT.entry.x, RIFT.entry.z] as [number, number] };
  const b = g2.players.spawn('끊김', false, stuck);
  check(isField(b.layer) && atGate(b) && g2.rift.count === 0 && b.rift.s === a.rift.s, '서버를 껐다 켜면 판은 사라지고, 전장 안에 저장돼 있던 캐릭터는 문 앞에서 시작한다 (기록은 남는다)');
}

// ---------- 파티: 합류, 인원에 맞춘 무리, 모두 쓰러져야 끝난다 ----------
{
  const { g, t, safe, run, said, cmd, toGate, enter, mobs, sent } = bench();
  const a = hero(g, '하나', 'warrior', 'rare15'), b = hero(g, '둘', 'mage', 'rare15'), c = hero(g, '남', 'archer', 'rare15');
  toGate(a); toGate(b);
  g.command(a, { t: 'party', a: 'invite', id: b.id });
  g.command(b, { t: 'party', a: 'accept' });
  g.notices = [];
  enter(a);
  check(g.notices.some((n) => n.id === b.id && n.k === 'riftMate'), '파티원이 들어가면 밖의 파티원에게 알린다');
  enter(b);
  check(b.layer === a.layer && g.rift.count === 1 && g.rift.runOf(b)!.players === 2, '파티원은 같은 판으로 합류한다');
  enter(c);
  check(c.layer !== a.layer && g.rift.count === 2, '파티가 아닌 사람은 다른 판으로 들어간다');
  cmd(c, { t: 'rift', a: 'leave' });
  check(riftPack(RIFT.waves[0].n, 2) > RIFT.waves[0].n && riftPack(RIFT.waves[0].n, 4) > riftPack(RIFT.waves[0].n, 2) && riftKeep(RIFT.waves[9].keep, 4) <= RIFT.maxFoes, `사람 수에 맞춰 무리가 커진다 (첫 물결 한 번에 ${RIFT.waves[0].n} → 둘이면 ${riftPack(RIFT.waves[0].n, 2)}, 넷이면 ${riftPack(RIFT.waves[0].n, 4)}). 한도는 그대로다`);
  safe.add(a); safe.add(b);
  let peak = 0;
  while (g.rift.runOf(a)!.t < 70) { run(1); peak = Math.max(peak, mobs(a).length); for (const p of [a, b]) if (g.rift.runOf(p)?.offer) cmd(p, { t: 'rift', a: 'pick', n: 0 }); }
  check(peak <= RIFT.maxFoes && mobs(a).some((m) => m.targetId === a.id) && mobs(a).some((m) => m.targetId === b.id), `둘이 있으면 떼가 둘을 나눠 노린다 (동시 ${peak}마리, 한도 ${RIFT.maxFoes})`);
  safe.clear();
  // 하나가 두 번 쓰러진다: 그 사람은 결과를 받고 문 앞으로 나가고, 판은 남은 사람과 이어진다
  const kill = (p: Ent) => { const m = mobs(p)[0] ?? (() => { const x = g.monsters.spawn('slime', p.x + 1, p.z); x.layer = p.layer; return x; })(); g.combat.damage(m, p, 99999, false); };
  kill(a);
  for (let i = 0; i < 20 * (RIFT.reviveSafeS + 0.5); i++) { a.hp = a.maxHp; b.hp = b.maxHp; g.tick(0.05); t.clock += 50; }
  g.out = [];
  kill(a);
  check(isField(a.layer) && atGate(a) && sent(a, 'riftEnd').length === 1 && !g.rift.runOf(a) && g.rift.count === 1 && !g.rift.runOf(b)!.ended && g.rift.runOf(b)!.players === 1, '파티에서 한 사람이 두 번 쓰러지면 그 사람만 결과를 받고 나간다. 판은 남은 사람과 이어진다');
  b.hp = b.maxHp;
  run(1);
  check(mobs(b).length > 0 && mobs(b).every((m) => m.targetId === b.id || m.targetId === 0), '남은 떼는 남은 사람을 쫓는다');
  kill(b);
  for (let i = 0; i < 20 * (RIFT.reviveSafeS + 0.5); i++) { b.hp = b.maxHp; g.tick(0.05); t.clock += 50; }
  kill(b);
  run(0.1);
  check(g.rift.runOf(b)!.ended && g.rift.runOf(b)!.out, '모두 쓰러지면 판이 끝난다');
  void said;
}
