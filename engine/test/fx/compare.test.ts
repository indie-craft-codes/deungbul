// 장비 비교: 가방의 장비를 지금 낀 같은 칸의 장비와 견주는 공용 계산 (engine/shared/defs/growth.ts의 compareGear). 시험용 내용 위에서.
// 화면은 이 함수의 결과만 그린다. 여기서는 (1) 그 셈이 서버가 실제로 쓰는 보정과 같은지, (2) 두 기준(지금 그대로 / 강화 단계를 맞췄을 때)의 결론을 본다.
import { ENHANCE, GEAR, ITEMS, atPlus, compareGear, deltaSigns, enhanceExpected, enhanceMax, gearDelta, gearEffect, gearPower, gearVerdict, isSupply, wornTotal, type Gear, type GearSlot, type Stat } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';

let uid = 100;
const mk = (slot: GearSlot, rar: number, plus: number, opts: [Stat, number][], base?: string, made = false): Gear => ({ uid: uid++, slot, base, rar, lv: 3, plus, opts, ...(made ? { made: true } : {}) });
const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

// ---------- 공용 셈 = 서버의 실제 보정 ----------
{
  const g = new Game();
  const p = g.players.spawn('비교', false, null, 'key-c');
  g.classes.apply(p, 'knight');
  const put = (it: Gear): Gear => { g.bag.giveGear(p, it, ''); g.gear.equip(p, it.uid); return it; };
  put(mk('weapon', 2, 6, [['dmg', 9], ['crit', 3]], 'blade3'));
  put(mk('armor', 1, 4, [['guard', 5], ['hp', 20]], 'plate2'));
  put(mk('ring', 2, 3, [['dmg', 6], ['hp', 15], ['crit', 2]]));
  const worn = g.gear.worn(p), fx = gearEffect(worn);
  const hp0 = g.mods.sum('hp', undefined);
  check(worn.length === 3 && near(fx.dmg, g.mods.product('damage', p)), `공격 피해의 배율이 서버의 보정(무기 바탕 × 장비 옵션)과 같다 (${fx.dmg.toFixed(4)})`);
  check(near(fx.guard, g.mods.product('guard', p)), `받는 피해의 배율이 서버의 보정(갑옷 바탕 × 장비 옵션)과 같다 (${fx.guard.toFixed(4)})`);
  check(near(fx.crit, g.mods.sum('crit', p)) && near(fx.hp, g.mods.sum('hp', p) - hp0), '치명타와 체력에 더해지는 값이 서버의 보정과 같다');
  check((['dmg', 'guard', 'crit', 'hp'] as Stat[]).every((s) => near(wornTotal(worn, s), g.gear.total(p, s))), '서버의 장비 합(gear.total)이 공용 함수(wornTotal)를 쓴다');
  // 강화가 옵션의 합에 더해지고 바탕의 배율과 곱해진다 (README의 예: +75% 무기를 +5로 → 1.75 × 1.375 = 2.41배)
  const w = mk('weapon', 0, 5, [], 'blade4');
  check(near(gearEffect([w]).dmg, (ITEMS.blade4.damage ?? 1) * (1 + Math.round(((ITEMS.blade4.damage ?? 1) - 1) * 100) * 5 * ENHANCE.perPlus / 100)), '무기의 강화: 바탕의 기본 수치 × 단계 × 10%가 옵션의 합에 더해지고 바탕의 배율과 곱해진다');
  // 바꿔 끼기 전에 낸 차이 = 실제로 바꿔 낀 뒤의 차이
  const cand = mk('ring', 3, 0, [['dmg', 10], ['guard', 4], ['hp', 40], ['crit', 4]]);
  const d = gearDelta(worn, cand), before = { dmg: g.mods.product('damage', p), guard: g.mods.product('guard', p), crit: g.mods.sum('crit', p), hp: g.mods.sum('hp', p), power: g.rank.power(p) };
  put(cand);
  const after = { dmg: g.mods.product('damage', p), guard: g.mods.product('guard', p), crit: g.mods.sum('crit', p), hp: g.mods.sum('hp', p), power: g.rank.power(p) };
  check(near(d.dmg, (after.dmg / before.dmg - 1) * 100, 0.051) && near(d.guard, (after.guard / before.guard - 1) * 100, 0.051) && near(d.crit, (after.crit - before.crit) * 100, 0.051) && near(d.hp, after.hp - before.hp, 0.051),
    `미리 낸 차이가 실제로 바꿔 낀 뒤의 변화와 같다 (공격 ${d.dmg}%, 받는 피해 ${d.guard}%, 치명타 ${d.crit}%p, 체력 ${d.hp})`);
  check(d.power === after.power - before.power && gearPower(g.gear.worn(p)) - gearPower(worn) === d.power, `전투력의 차이도 순위의 전투력(rank.power)과 같다 (${d.power})`);
  // 받는 피해 감소의 한도
  const lots = [mk('ring', 3, 10, [['guard', 40]]), mk('amulet', 3, 10, [['guard', 40]])];
  check(near(gearEffect(lots).guard, 1 - GEAR.guardCap / 100) && gearDelta(lots, mk('charm', 3, 0, [['guard', 30]])).guard === 0, `받는 피해 감소는 한도(${GEAR.guardCap}%)까지만 듣는다: 한도를 넘긴 뒤에는 더 껴도 변화가 0이다`);
}

// ---------- 두 기준의 결론이 갈리는 경우: 낀 것은 +7 고급, 주운 것은 +0 희귀 ----------
{
  const worn = [mk('weapon', 0, 5, [], 'blade3'), mk('ring', 1, 7, [['dmg', 5], ['hp', 12]])];
  const cand = mk('ring', 2, 0, [['dmg', 7], ['hp', 16], ['crit', 2]]);
  const c = compareGear(worn, cand);
  check(c.worn === worn[1] && c.now.dmg < 0 && c.now.hp < 0 && c.now.crit > 0 && gearVerdict(c.now) === 'mixed', `지금 그대로: 강화한 쪽이 공격과 체력에서 앞선다 (공격 ${c.now.dmg}%, 체력 ${c.now.hp}, 치명타 ${c.now.crit}%p)`);
  check(c.even !== null && c.even.plus === 7 && c.even.delta.dmg > 0 && c.even.delta.hp > 0 && c.even.delta.crit > 0 && gearVerdict(c.even.delta) === 'better', `같은 +7이었다면: 주운 희귀가 모든 수치에서 낫다 (공격 ${c.even?.delta.dmg}%, 체력 ${c.even?.delta.hp})`);
  check(c.even!.cand.from === 0 && c.even!.cand.to === 7 && !c.even!.cand.capped && c.even!.cand.cost === Math.round(enhanceExpected(7, 2, 0)) && c.even!.worn.from === 7 && c.even!.worn.to === 7 && c.even!.worn.cost === 0, `거기까지 올리는 기대 골드는 강화의 공용 식에서 나온다 (${c.even!.cand.cost}골드)`);
  // 옵션이 하나뿐이면 결론이 하나로 갈린다
  const one = compareGear([mk('ring', 1, 7, [['dmg', 5]])], mk('ring', 2, 0, [['dmg', 7]]));
  check(gearVerdict(one.now) === 'worse' && gearVerdict(one.even!.delta) === 'better', '공격 옵션만 있는 두 반지: 지금 그대로는 "더 나쁨", 같은 단계였다면 "더 좋음"');
  // 낀 것이 더 낮은 단계면 낀 것을 올려 맞춘다 (둘 중 높은 단계)
  const low = compareGear([mk('ring', 2, 0, [['dmg', 7]])], mk('ring', 1, 4, [['dmg', 6]]));
  check(gearVerdict(low.now) === 'better' && low.even!.plus === 4 && low.even!.worn.from === 0 && low.even!.worn.to === 4 && low.even!.cand.cost === 0 && low.even!.worn.cost === Math.round(enhanceExpected(4, 2, 0)) && gearVerdict(low.even!.delta) === 'worse',
    '주운 것이 더 높은 단계면 낀 것을 그 단계로 올린 것과 견준다: 지금은 더 좋아 보여도 맞추면 더 나쁘다');
  check(compareGear([mk('ring', 1, 3, [['dmg', 5]])], mk('ring', 2, 3, [['dmg', 7]])).even === null, '강화 단계가 같으면 맞춘 비교는 없다 (지금 그대로와 같다)');
}

// ---------- 낀 것이 없는 칸 ----------
{
  const worn = [mk('weapon', 0, 0, [], 'blade2')];
  const c = compareGear(worn, mk('amulet', 1, 2, [['hp', 20], ['crit', 3]]));
  check(c.worn === null && c.even === null && c.now.hp > 0 && c.now.crit > 0 && c.now.dmg === 0 && c.now.guard === 0 && gearVerdict(c.now) === 'better' && c.now.power > 0, '낀 것이 없는 칸: 전부 증가이고 "더 좋음", 맞춘 비교는 없다');
  const a = compareGear([], mk('armor', 0, 0, [], 'plate1'));
  check(a.now.guard < 0 && deltaSigns(a.now).guard === 1 && gearVerdict(a.now) === 'better', `갑옷이 없다가 입으면 받는 피해가 준다: 수는 음수이고(${a.now.guard}%) 좋아진 것으로 센다`);
}

// ---------- 강화 한도가 다른 경우: 보급형은 +5까지 ----------
{
  const drop = mk('weapon', 2, 8, [['dmg', 8]], 'blade3'), supply = mk('weapon', 0, 0, [], 'blade4');
  check(isSupply(supply) && enhanceMax(supply) === ENHANCE.supplyMax && enhanceMax(drop) === ENHANCE.max && atPlus(supply, 8).plus === ENHANCE.supplyMax && atPlus(drop, 3).plus === 8, '보급형은 제 한도까지만 올린 것으로 친다. 이미 더 높은 단계는 내리지 않는다');
  const c = compareGear([drop], supply);
  check(c.even !== null && c.even.plus === 8 && c.even.cand.to === ENHANCE.supplyMax && c.even.cand.capped && c.even.cand.cost === Math.round(enhanceExpected(ENHANCE.supplyMax, 0, 0)), `맞추려는 단계(+8)보다 한도가 낮으면 한도(+${ENHANCE.supplyMax})까지로 하고 그렇게 알린다`);
  const full = compareGear([mk('weapon', 0, ENHANCE.supplyMax, [], 'blade2')], mk('weapon', 0, ENHANCE.supplyMax, [], 'blade3'));
  check(full.even === null && gearVerdict(full.now) === 'better', '둘 다 한도까지 올린 보급형: 맞출 것이 없다');
}

// ---------- 옵션의 종류가 다른 경우 ----------
{
  const c = compareGear([mk('ring', 1, 0, [['dmg', 6], ['crit', 2]])], mk('ring', 1, 0, [['hp', 30], ['guard', 4]]));
  const s = deltaSigns(c.now);
  check(s.dmg === -1 && s.crit === -1 && s.hp === 1 && s.guard === 1 && gearVerdict(c.now) === 'mixed', '낀 것에만 있는 옵션은 감소로, 새 것에만 있는 옵션은 증가로 나온다 (공격·치명타 ▼, 체력·방어 ▲: 엇갈림)');
  const same = compareGear([mk('ring', 1, 2, [['dmg', 6]])], mk('ring', 1, 2, [['dmg', 6]]));
  check(gearVerdict(same.now) === 'same' && Object.values(same.now).every((v) => v === 0), '같은 장비끼리는 "비슷"이고 모든 차이가 0이다');
}
