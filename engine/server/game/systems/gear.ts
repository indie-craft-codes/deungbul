// 장비: 낱개 장비(등급, 무작위 옵션, 강화 단계)를 줍고, 끼고, 팔고, 강화한다. 무기와 갑옷도 여기서 다룬다.
// 상점에서 사거나 대장간에서 만든 무기·갑옷은 옵션 없는 기본 장비로 가방에 들어와 바로 낀다.
// 낀 무기와 갑옷의 바탕은 p.weapon, p.armor에 적어 둔다: 기본 수치(systems/shop.ts)와 겉모습이 그것을 따른다.
// 수치는 games/deungbul/shared/content/growth.ts에 있다.
import { ENHANCE, enhanceMax, GEAR, GEAR_SLOTS, ITEMS, RARITIES, STAT_IDS, baseOpt, gearStat, isGearSlot, isItemId, isStat, rollOpt, sellPrice, type Gear, type GearSlot, type ItemId, type Stat } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { WHY } from './wallet';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 옵션 하나의 값이 가질 수 있는 가장 큰 수: 이보다 큰 것은 깨진 저장으로 보고 버린다 */
const OPT_MAX = 500;

export class GearSys {
  /** 시험에서 확률을 고정할 수 있다 */
  random: () => number = Math.random;

  constructor(private g: Game) {
    g.commands.set('equip', (p, m) => { if (num(m.uid)) this.equip(p, m.uid); });
    g.commands.set('unequip', (p, m) => { if (isGearSlot(m.slot)) this.unequip(p, m.slot); });
    g.commands.set('sell', (p, m) => { if (num(m.uid)) this.sell(p, m.uid); });
    g.commands.set('enhance', (p, m) => { if (num(m.uid)) this.enhance(p, m.uid); });

    g.on('monsterKilled', (m, hitters) => {
      const def = m.def;
      if (!def) return;
      for (const p of hitters) {
        if (p.bot || (!def.boss && this.random() >= GEAR.dropChance)) continue;
        // 떨어진 장비: 자동 분해를 켜 둔 등급이면 가방에 넣지 않고 그 자리에서 가루로 바꾼다 (systems/salvage.ts)
        const it = this.roll(GEAR.levelOf(def.exp)), why = g.players.huntWhy(p, m);
        if (!g.salvage.auto(p, it, why)) this.give(p, it, why);
      }
    });

    // 낀 장비의 옵션이 수치 보정으로 들어간다
    g.mods.provide('damage', (p) => 1 + this.total(p, 'dmg') / 100);
    g.mods.provide('guard', (p) => 1 - Math.min(GEAR.guardCap, this.total(p, 'guard')) / 100);
    g.mods.provide('crit', (p) => this.total(p, 'crit') / 100);
    g.mods.provide('hp', (p) => this.total(p, 'hp'));

    g.saves.push({
      name: 'gear',
      save: (p) => ({ list: p.gear, worn: p.worn, seq: p.gearSeq }),
      load: (p, raw) => {
        const d = raw as { list?: unknown; worn?: unknown; seq?: unknown };
        if (!Array.isArray(d.list)) return;
        // 한도를 넘게 들어 있으면(가방이 찬 채 사거나 만든 경우) 끼고 있던 것부터 남긴다: 잘려 나가 기본 장비로 바뀌지 않게
        const worn0 = (typeof d.worn === 'object' && d.worn !== null ? Object.values(d.worn as Record<string, unknown>) : []);
        const all = d.list.filter(GearSys.valid);
        p.gear = [...all.filter((x) => worn0.includes(x.uid)), ...all.filter((x) => !worn0.includes(x.uid))].slice(0, g.bag.slots(p));
        p.gearSeq = Math.max(num(d.seq) ? d.seq : 0, ...p.gear.map((x) => x.uid));
        const worn = (typeof d.worn === 'object' && d.worn !== null ? d.worn : {}) as Record<string, unknown>;
        for (const slot of GEAR_SLOTS) {
          const it = p.gear.find((x) => x.uid === worn[slot]);
          if (it && it.slot === slot) p.worn[slot] = it.uid;
        }
      },
    });
  }

  /** 저장된 값이 장비의 모양을 갖췄는가 (우편과 거래소도 저장된 장비를 읽을 때 쓴다) */
  static valid(x: unknown): x is Gear {
    const it = x as Gear;
    return typeof x === 'object' && x !== null && num(it.uid) && isGearSlot(it.slot) && num(it.rar) && it.rar >= 0 && it.rar < RARITIES.length
      && (it.base === undefined || (isItemId(it.base) && ITEMS[it.base].kind === it.slot)) && (it.base !== undefined) === (it.slot === 'weapon' || it.slot === 'armor')
      && (it.made === undefined || typeof it.made === 'boolean') && (it.lock === undefined || typeof it.lock === 'boolean') && num(it.lv) && num(it.plus) && it.plus >= 0 && it.plus <= ENHANCE.max && Array.isArray(it.opts) && it.opts.length <= 4 && it.opts.every((o) => Array.isArray(o) && isStat(o[0]) && num(o[1]) && o[1] > 0 && o[1] <= OPT_MAX)
      && Number.isInteger(it.lv) && it.lv >= 1 && it.lv <= 20 && Number.isInteger(it.plus) && Number.isInteger(it.uid);
  }

  /** 낀 장비들이 주는 수치의 합 */
  total(p: Ent | undefined, stat: Stat): number {
    if (!p || p.kind !== 'p') return 0;
    let sum = 0;
    for (const slot of GEAR_SLOTS) {
      const it = p.worn[slot] ? p.gear.find((x) => x.uid === p.worn[slot]) : undefined;
      if (!it) continue;
      sum += gearStat(it, stat);
      // 무기와 갑옷의 기본 수치는 상점 시스템이 이미 셈한다. 여기서는 강화로 늘어난 몫만 더한다
      const base = baseOpt(it);
      if (base && base[0] === stat) sum += base[1] * it.plus * ENHANCE.perPlus;
    }
    return sum;
  }

  /** 장비 한 점을 무작위로 만든다 (uid는 줄 때 붙는다). slot을 정하지 않으면 칸도 무작위다 */
  roll(lv: number, rar?: number, slot?: GearSlot): Gear {
    const rnd = this.random;
    if (rar === undefined) {
      let r = rnd() * RARITIES.reduce((s, x) => s + x.weight, 0);
      rar = RARITIES.findIndex((x) => (r -= x.weight) < 0);
      if (rar < 0) rar = 0;
    }
    const def = RARITIES[rar], pool = [...STAT_IDS], opts: [Stat, number][] = [];
    for (let i = 0; i < def.opts && pool.length; i++) {
      const stat = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      opts.push([stat, rollOpt(stat, rar, lv, rnd())]); // 값의 식은 내용 정의에 있다 (도감이 같은 함수로 범위를 구한다)
    }
    slot ??= GEAR_SLOTS[Math.floor(rnd() * GEAR_SLOTS.length)];
    const base = slot === 'weapon' ? GEAR.weaponFor(lv) : slot === 'armor' ? GEAR.armorFor(lv) : undefined;
    return { uid: 0, slot, base, rar, lv, plus: 0, opts };
  }

  /** 옵션 없는 기본 무기나 갑옷 (상점, 대장간, 처음 든 무기) */
  plain(base: ItemId): Gear {
    const def = ITEMS[base] as { kind: string; tier?: number };
    return { uid: 0, slot: def.kind === 'armor' ? 'armor' : 'weapon', base, rar: 0, lv: def.tier ?? 1, plus: 0, opts: [] };
  }

  /** 무기나 갑옷을 얻어 바로 낀다 (상점, 대장간). 산 것이 사라지지 않게 가방이 가득 차도 들어간다. 장비가 아니면 false. why: 원인의 이름 (systems/bag.ts) */
  acquire(p: Ent, id: ItemId, made = false, why = ''): boolean {
    const kind = ITEMS[id].kind;
    if (kind !== 'weapon' && kind !== 'armor') return false;
    const it = this.plain(id);
    if (made) it.made = true;
    this.g.bag.giveGear(p, it, why, true);
    this.equip(p, it.uid);
    return true;
  }

  /**
   * 접속할 때: 낀 무기와 갑옷을 캐릭터의 겉모습 값(p.weapon, p.armor)과 맞춘다.
   * 장비가 낱개가 되기 전에 저장된 캐릭터는 들고 있던 무기와 갑옷을 기본 장비로 만들어 준다.
   */
  adopt(p: Ent): void {
    for (const slot of ['weapon', 'armor'] as const) {
      const worn = p.gear.find((x) => x.uid === p.worn[slot]);
      const held = slot === 'weapon' ? p.weapon : p.armor;
      if (worn?.base) { if (slot === 'weapon') p.weapon = worn.base; else p.armor = worn.base; }
      else if (isItemId(held) && ITEMS[held].kind === slot) {
        const it = this.plain(held);
        // 접속 처리의 일부라 저장할 것으로 표시하지 않는다 (아무것도 하지 않은 새 캐릭터를 저장하지 않는 규칙)
        const unsaved = p.unsaved;
        this.g.bag.giveGear(p, it, '', true);
        p.unsaved = unsaved;
        p.worn[slot] = it.uid;
      }
    }
    p.metaDirty = true;
  }

  /** 가방에 넣는다. 가득 찼으면 넣지 못하고 알린다: 그 장비는 버려진다. why: 원인의 이름 (systems/bag.ts) */
  give(p: Ent, it: Gear, why = ''): boolean {
    if (!this.g.bag.giveGear(p, it, why)) { this.g.notify(p, 'gearFull'); this.g.bag.lost(p, it, why); this.g.away.tally(p, 'lost', 1); return false; }
    this.g.notify(p, 'gearDrop', it.slot, RARITIES[it.rar].id);
    return true;
  }

  /** 알림 없이 가방에 넣는다 (우편에서 받거나 거래소에서 온 것). 가득 찼으면 넣지 않고 false: 부른 쪽이 물건을 다른 곳에 보관해야 한다 */
  put(p: Ent, it: Gear, why = ''): boolean { return this.g.bag.giveGear(p, it, why); }

  private find(p: Ent, uid: number): Gear | undefined { return p.gear.find((x) => x.uid === uid); }
  private changed(p: Ent): void { p.metaDirty = true; p.unsaved = true; this.g.players.refresh(p); }

  equip(p: Ent, uid: number): void {
    const it = this.find(p, uid);
    if (!it) return;
    p.worn[it.slot] = it.uid;
    this.look(p, it.slot);
    this.changed(p);
  }

  /** 낀 무기나 갑옷이 바뀌었으면 겉모습 값을 맞추고 주변에 알린다 */
  private look(p: Ent, slot: GearSlot): void {
    if (slot !== 'weapon' && slot !== 'armor') return;
    const base = p.gear.find((x) => x.uid === p.worn[slot])?.base ?? '';
    if (slot === 'weapon') p.weapon = base; else p.armor = base;
    this.g.gears.push({ id: p.id, weapon: p.weapon, armor: p.armor, cls: p.cls });
  }

  unequip(p: Ent, slot: GearSlot): void {
    if (!p.worn[slot] || slot === 'weapon') return; // 무기는 빈손이 될 수 없다: 다른 무기로 바꿔 낀다
    delete p.worn[slot];
    this.look(p, slot);
    this.changed(p);
  }

  sell(p: Ent, uid: number): void {
    const it = this.find(p, uid);
    if (!it) return;
    if (it.lock) { this.g.notify(p, 'gearLocked'); return; }
    if (p.worn[it.slot] === uid) {
      if (it.slot === 'weapon') return; // 들고 있는 무기는 팔 수 없다
      delete p.worn[it.slot];
      this.look(p, it.slot);
    }
    this.g.bag.removeGear(p, uid, WHY.sell);
    const gold = this.g.wallet.add(p, 'gold', sellPrice(it), WHY.sell);
    this.g.notify(p, 'gearSold', gold);
    this.changed(p);
  }

  enhance(p: Ent, uid: number): void {
    const g = this.g, it = this.find(p, uid);
    if (!it) return;
    if (it.plus >= enhanceMax(it)) { g.notify(p, 'enhanceMax'); return; }
    const cost = ENHANCE.gold(it.plus, it.rar);
    if (!g.wallet.take(p, 'gold', cost, WHY.enhance)) { g.notify(p, 'noGold'); return; }
    if (this.random() < ENHANCE.rate(it.plus)) { it.plus++; g.notify(p, 'enhanceOk', it.plus); }
    else g.notify(p, 'enhanceFail');
    this.changed(p);
    g.fire('enhanced', p);
  }
}
