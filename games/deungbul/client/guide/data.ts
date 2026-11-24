// 도감의 내용을 만든다: 게임이 쓰는 정의(shared/content)를 돌며 구역과 표를 글자로 엮는다. 화면(DOM)은 모른다.
// 표의 줄은 정의의 모든 항목을 돌며 만든다: 몬스터나 아이템을 정의에 더하면 도감에 저절로 나타난다.
// 이름은 게임의 언어 묶음(game/i18n: 틀의 문장과 이 게임의 문장을 합친 것)에서, 도감에만 있는 문장은 도감의 언어 파일(text.*.ts)에서 온다.
import {
  ATTACK_CD, ATTEND, BOSS, BUILD, BUILD_STATS, CAMPS, CHANNEL, CLASSES, CLASS_IDS, COMBAT, CONTRIB_TIERS, DAILIES, DAILY_IDS, DROPS, DUNGEONS, DUNGEON_IDS,
  ENHANCE, FULL_TOWER_OFFER, GEAR, GEAR_SLOTS, GLOW_BRIGHT, GLOW_BRIGHT_REGEN, GLOW_DIM, GLOW_MAX, GUILD, HP_PER_LEVEL, IDLE, ITEMS, KEEPERS_SHOWN, LEASH, LEVEL, MAIL_MAX, MARKET, MAT_MAX,
  MONSTERS, MONSTER_AI, MONSTER_ATTACK_CD, MONSTER_ATTACK_RANGE, PARTY, PORTAL_REACH, POTION_CD, POTION_MAX, POWER, QUESTS, RAID, RAID_KEEP_POINTS, RANK, RARITIES,
  RECIPES, RESIDENTS, RESPAWN_S, REST, SHOPS, SHOP_REACH, SHOP_STOCK, SKILL_DEFS, SLOW_FACTOR, SMITH, SMITHY_REACH, STAT_IDS, TOWER_REACH,
  baseOpt, bossHp, guildNeed, marketFee, maxHpFor, needFor, raidFoes, raidTowerHp, restGain, speedFor, stageOf,
  type ItemDef, type ItemId, type MonsterDef, type MonsterId, type QuestGoal, type Reward, type SkillDef, type SkillId, type Stage,
} from '../../shared/defs';
import { AUTO, AWAY } from '@engine/shared/auto';
import { AOI_LEAVE, CHAT_MAX, NAME_MAX, PLAYER_SPEED, TOWERS, zoneOf } from '../../shared/world';
import { en, ko } from '../i18n';
import type { Locale } from '@engine/client/i18n/ko';
import {
  DROP_IDS, ITEM_IDS, MONSTER_IDS, avg, enhanceExpected, enhanceTries, expUpTo, gearChance, gearLevels, habitat, levelGrowth, monstersOfGearLv, plainSell,
  raidCapPlayers, rarityShares, raritySharesFrom, respawnOf, scoreOf, sellRange, slotChance, sourcesOf, statBase, tally,
} from './calc';
import { num, pct, span } from './fmt';
import { optRange } from './rules';
import { textEn } from './text.en';
import { textKo, type GuideText } from './text.ko';

// ---------- 도감의 모양 ----------
/** 표의 한 줄. key는 그 줄이 가리키는 정의의 id다 (검사와 거르기에 쓴다) */
export interface Row { key: string; cells: string[] }
export interface Table { id: string; caption: string; head: string[]; rows: Row[] }
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; table: Table };
export interface Section { id: string; title: string; blocks: Block[] }

/** 한 언어의 묶음: 게임의 언어 파일과 도감의 언어 파일 */
export interface Pack { L: Locale; T: GuideText }
export const PACKS: readonly Pack[] = [{ L: ko, T: textKo }, { L: en, T: textEn }];
export const LANGS = PACKS.map((p) => ({ code: p.L.code, label: p.L.label }));
export const packOf = (code: string | null | undefined): Pack | undefined => PACKS.find((p) => code?.toLowerCase().startsWith(p.L.code));

const h = (text: string): Block => ({ t: 'h', text });
const p = (text: string): Block => ({ t: 'p', text });
const ul = (items: string[]): Block => ({ t: 'ul', items });
const table = (id: string, caption: string, head: string[], rows: Row[]): Block => ({ t: 'table', table: { id, caption, head, rows } });
const row = (key: string | number, ...cells: string[]): Row => ({ key: String(key), cells });
/** 이름과 값 두 칸짜리 표: labels의 키를 돌며 values에서 값을 찾는다 (둘의 키가 같아야 컴파일된다) */
function facts<K extends string>(P: Pack, id: string, caption: string, labels: Record<K, string>, values: Record<K, string>): Block {
  return table(id, caption, [P.T.common.item, P.T.common.value], (Object.keys(labels) as K[]).map((k) => row(k, labels[k], values[k])));
}

// ---------- 이름 ----------
/** 아이템 이름. 무기는 직업마다 이름이 달라 모두 적는다 (검 / 활 / 지팡이) */
export function itemLabel(P: Pack, id: ItemId): string {
  const it = P.L.items[id];
  return [it.name, it.bow, it.staff].filter(Boolean).join(' / ');
}
const monsterName = (P: Pack, id: MonsterId): string => P.L.monsters[id];
const rarityName = (P: Pack, rar: number): string => P.L.gear.rarities[RARITIES[rar].id];
const towerName = (P: Pack, i: number): string => P.L.towers[TOWERS[i].id];
const rewardText = (P: Pack, r: Reward): string => P.L.fmt.reward(r.gold ?? 0, r.exp ?? 0, r.sparks ?? 0) || P.T.common.none;
const list = (parts: string[]): string => parts.join(', ');

// ---------- 시작하기 ----------
function start(P: Pack): Section {
  const { L, T } = P, c = T.common;
  return {
    id: 'start', title: T.start.title, blocks: [
      p(T.start.intro),
      h(T.start.controlsHead),
      ul(L.ui.hint.split(' · ')),
      p(T.start.touch),
      h(T.start.flowHead),
      ul(T.start.flow),
      facts(P, 'basics', T.start.basicsHead, T.start.basics, {
        attackCd: c.sec(ATTACK_CD),
        moveSpeed: c.perSec(PLAYER_SPEED),
        potionCd: c.sec(POTION_CD),
        potionMax: c.count(POTION_MAX),
        matMax: c.count(MAT_MAX),
        bagMax: c.count(GEAR.bagMax),
        mailMax: c.count(MAIL_MAX),
        respawn: c.sec(RESPAWN_S),
        leash: c.m(LEASH),
        towerReach: c.m(TOWER_REACH),
        shopReach: c.m(SHOP_REACH),
        smithyReach: c.m(SMITHY_REACH),
        nameMax: c.chars(NAME_MAX),
        chatMax: c.chars(CHAT_MAX),
      }),
      ul(T.start.notes),
    ],
  };
}

// ---------- 직업과 기술 ----------
/** 기술의 효과를 문장으로 */
function effectText(P: Pack, def: SkillDef): string {
  const T = P.T.classes, fx = def.effect;
  switch (fx.kind) {
    case 'hit': return T.fxHit(span(fx.dmg));
    case 'area': return T.fxArea(span(fx.dmg), fx.at === 'self', num(def.radius ?? 0)) + (fx.slow ? ', ' + T.fxSlow(num(fx.slow), pct(1 - SLOW_FACTOR)) : '');
    case 'heal': return fx.allies ? T.fxHealAll(num(fx.amount), num(def.radius ?? 0)) : T.fxHeal(num(fx.amount));
  }
}
const HP_LEVELS = [1, 5, 10, 15, 20, 25, 30];
function classes(P: Pack): Section {
  const { L, T } = P, c = T.common;
  const skillIds = Object.keys(SKILL_DEFS) as SkillId[];
  return {
    id: 'classes', title: T.classes.title, blocks: [
      p(T.classes.intro(num(TOWER_REACH))),
      table('classes', T.classes.classHead, T.classes.classCols, CLASS_IDS.map((id) => {
        const d = CLASSES[id];
        return row(id, L.classes[id].name, L.classes[id].info, num(d.hp), span(d.basic), c.m(d.range), list(d.skills.map((s) => L.skills[s].name)));
      })),
      p(T.classes.hpNote(num(HP_PER_LEVEL))),
      table('classHp', T.classes.hpHead, [T.common.levelCol, ...CLASS_IDS.map((id) => L.classes[id].name)],
        HP_LEVELS.map((lv) => row(lv, c.level(lv), ...CLASS_IDS.map((id) => num(maxHpFor(id, lv)))))),
      table('skills', T.classes.skillHead, T.classes.skillCols, skillIds.map((id) => {
        const d: SkillDef = SKILL_DEFS[id];
        const users = CLASS_IDS.flatMap((cls) => { const n = (CLASSES[cls].skills as readonly string[]).indexOf(id); return n < 0 ? [] : [T.classes.slot(L.classes[cls].name, n + 1)]; });
        return row(id, L.skills[id].name, list(users) || c.none, L.skills[id].info, effectText(P, d), c.sec(d.cd), d.range === undefined ? c.none : c.m(d.range));
      })),
      facts(P, 'combat', T.classes.combatHead, T.classes.combat, {
        critChance: pct(COMBAT.critChance),
        critMult: c.mult(COMBAT.critMult),
        regenAfter: c.sec(COMBAT.regenAfterS),
        regenPerS: T.classes.hpPerSec(num(COMBAT.regenPerS)),
        regenBright: T.classes.hpPerSec(num(COMBAT.regenPerS * GLOW_BRIGHT_REGEN)),
        guardCap: `${num(GEAR.guardCap)}%`,
      }),
      ul(T.classes.notes(c.sec(ATTACK_CD), num(BUILD.skillMax), pct(BUILD.skillPerLevel))),
    ],
  };
}

// ---------- 몬스터 ----------
function whereText(P: Pack, id: MonsterId): string {
  const { L, T } = P, at = habitat(id);
  const parts = [...at.zones.map((z) => L.zones[z]), ...at.dungeons.map((d) => T.monsters.inDungeon(L.dungeons[d as keyof typeof L.dungeons].name))];
  if (at.raid) parts.push(T.monsters.inRaid);
  return list(parts) || T.common.none;
}
function monsters(P: Pack): Section {
  const { L, T } = P, c = T.common, M = T.monsters;
  const bosses = MONSTER_IDS.filter((id) => (MONSTERS[id] as MonsterDef).boss);
  const bossCount = Array.from({ length: BOSS.maxScale }, (_, i) => i + 1);
  return {
    id: 'monsters', title: M.title, blocks: [
      ul(M.rules(num(AOI_LEAVE), num(PARTY.shareRange), c.sec(RESPAWN_S), c.m(LEASH), c.m(MONSTER_ATTACK_RANGE), c.sec(MONSTER_ATTACK_CD), c.perSec(PLAYER_SPEED))),
      facts(P, 'monsterAi', M.aiHead, M.ai, {
        loseRange: c.m(MONSTER_AI.loseRange),
        leash: c.m(LEASH),
        homeSpeed: M.homeSpeedValue(c.mult(MONSTER_AI.homeSpeed)),
        wanderSpeed: c.perSec(MONSTER_AI.wanderSpeed),
      }),
      p(M.aiNote),
      table('monsters', M.combatHead, M.combatCols, MONSTER_IDS.map((id) => {
        const d: MonsterDef = MONSTERS[id], back = respawnOf(id);
        return row(id, monsterName(P, id), whereText(P, id), num(d.hp), span(d.dmg), c.perSec(d.speed), d.aggro > 0 ? c.m(d.aggro) : M.passive, back === null ? M.noRespawn : c.sec(back));
      })),
      table('monsterRewards', M.rewardHead, M.rewardCols, MONSTER_IDS.map((id) => {
        const d: MonsterDef = MONSTERS[id], drop = DROPS[id], lv = GEAR.levelOf(d.exp), sparks = d.sparks ?? [0, 0];
        return row(id, monsterName(P, id), num(d.exp), `${span(d.gold)} (${num(avg(d.gold))})`, `${span(sparks)} (${num(avg(sparks))})`,
          pct(gearChance(d)), c.level(lv), drop ? `${itemLabel(P, drop.id)} ${pct(drop.chance)}` : c.none);
      })),
      p(M.rewardNote),
      table('camps', M.campHead, M.campCols, CAMPS.map((camp, i) => row(i, String(i + 1), L.zones[zoneOf(camp.x)], `${num(camp.x)}, ${num(camp.z)}`,
        list(tally(camp.types).map(([type, n]) => `${monsterName(P, type)} ×${n}`))))),
      h(M.bossHead),
      ul(M.bossRules(list(bosses.map((id) => monsterName(P, id))), pct(BOSS.hpPerPlayer), num(BOSS.maxScale), c.sec(BOSS.slamEveryS), c.sec(BOSS.slamWarnS), c.m(BOSS.slamRadius), span(BOSS.slamDmg))),
      table('bossHp', M.bossHpHead, [M.fighters, ...bosses.map((id) => monsterName(P, id))],
        bossCount.map((n) => row(n, c.people(n), ...bosses.map((id) => num(bossHp(MONSTERS[id].hp, n)))))),
    ],
  };
}

// ---------- 아이템과 상점 ----------
/** 아이템이 주는 것 */
function itemEffect(P: Pack, d: ItemDef): string {
  const T = P.T.items;
  if (d.damage !== undefined) return d.damage === 1 ? P.T.common.none : T.fxDamage(num(Math.round((d.damage - 1) * 100)));
  if (d.guard !== undefined) return T.fxGuard(num(Math.round((1 - d.guard) * 100)));
  if (d.heal !== undefined) return T.fxHeal(num(d.heal));
  return P.T.common.none;
}
function sourceText(P: Pack, id: ItemId): string {
  const T = P.T.items, s = sourcesOf(id), parts: string[] = [];
  if (s.start) parts.push(T.srcStart);
  if (s.shop) parts.push(T.srcShop);
  if (s.craft) parts.push(T.srcCraft);
  if (s.mat.length) parts.push(T.srcMat(list(s.mat.map((m) => monsterName(P, m)))));
  if (s.gearLv.length) parts.push(T.srcGear(list(s.gearLv.map((lv) => P.T.common.level(lv)))));
  return list(parts) || P.T.common.none;
}
/** 상점 물건의 잠금: 틀에서는 뜻 없는 열쇠이고, 이 게임에서는 돌아와야 하는 주민이다 */
function needText(P: Pack, d: ItemDef): string {
  const r = RESIDENTS.find((x) => x.id === d.needs);
  return r ? P.T.items.needs(P.L.residents[r.id].name) : P.T.common.none;
}
function items(P: Pack): Section {
  const { L, T } = P, c = T.common, I = T.items;
  return {
    id: 'items', title: I.title, blocks: [
      table('items', I.itemHead, I.itemCols, ITEM_IDS.map((id) => {
        const d: ItemDef = ITEMS[id];
        return row(id, itemLabel(P, id), I.kinds[d.kind], itemEffect(P, d), d.tier === undefined ? c.none : num(d.tier), d.price > 0 ? c.gold(num(d.price)) : I.notSold, sourceText(P, id));
      })),
      table('shop', I.shopHead, I.shopCols, SHOP_STOCK.map((id) => {
        const d: ItemDef = ITEMS[id];
        return row(id, itemLabel(P, id), c.gold(num(d.price)), itemEffect(P, d), needText(P, d));
      })),
      ul(I.notes(list(SHOPS.map((s) => towerName(P, s.tower))), c.m(SHOP_REACH), c.count(POTION_MAX), c.sec(POTION_CD), num(ENHANCE.supplyMax), L.gear.rarities.supply)),
    ],
  };
}

// ---------- 제작 ----------
const matsText = (P: Pack, mats: Partial<Record<ItemId, number>>): string => list((Object.entries(mats) as [ItemId, number][]).map(([id, n]) => `${itemLabel(P, id)} ×${n}`));
function craft(P: Pack): Section {
  const { L, T } = P, c = T.common, C = T.craft;
  return {
    id: 'craft', title: C.title, blocks: [
      p(C.intro(L.residents[SMITH].name, c.m(SMITHY_REACH))),
      table('recipes', C.recipeHead, C.recipeCols, RECIPES.map((r) => {
        const d: ItemDef = ITEMS[r.id];
        return row(r.id, itemLabel(P, r.id), itemEffect(P, d), matsText(P, r.mats), c.gold(num(r.gold)), d.price > 0 ? c.gold(num(d.price)) : T.items.notSold);
      })),
      table('matDrops', C.dropHead, C.dropCols, DROP_IDS.map((m) => {
        const d = DROPS[m]!;
        return row(m, itemLabel(P, d.id), monsterName(P, m), pct(d.chance), num(1 / d.chance));
      })),
      ul(C.notes(c.count(MAT_MAX), num(ENHANCE.max), L.gear.rarities.made)),
    ],
  };
}

// ---------- 장비 ----------
function gear(P: Pack): Section {
  const { L, T } = P, c = T.common, G = T.gear;
  const shares = rarityShares(), lvs = gearLevels(), rars = RARITIES.map((_, i) => i);
  const steps = Array.from({ length: ENHANCE.max }, (_, i) => i);
  const bases = ITEM_IDS.filter((id) => ITEMS[id].kind === 'weapon' || ITEMS[id].kind === 'armor');
  const sampleBase = baseOpt({ uid: 0, slot: 'weapon', base: GEAR.weaponFor(lvs[lvs.length - 1]), rar: 0, lv: 1, plus: 0, opts: [] });
  return {
    id: 'gear', title: G.title, blocks: [
      p(G.intro(list(GEAR_SLOTS.map((s) => L.gear.slots[s])), c.count(GEAR.bagMax))),
      table('gearKinds', G.kindsHead, G.kindCols, [
        row('supply', L.gear.rarities.supply, G.kindSupply.how, G.kindSupply.opts, `+${ENHANCE.supplyMax}`, c.no),
        row('made', L.gear.rarities.made, G.kindMade.how, G.kindMade.opts, `+${ENHANCE.max}`, c.yes),
        row('drop', G.kindDrop.name, G.kindDrop.how, G.kindDrop.opts, `+${ENHANCE.max}`, c.yes),
      ]),
      h(G.dropHead),
      ul(G.dropRules(pct(GEAR.dropChance), pct(slotChance()), num(GEAR_SLOTS.length))),
      table('rarities', G.rarityHead, G.rarityCols, RARITIES.map((r, i) => row(r.id, rarityName(P, i), num(r.weight), pct(shares[i]), num(r.opts), `×${num(r.mult)}`, pct(GEAR.dropChance * shares[i]))),
      ),
      table('gearLevels', G.levelHead, G.levelCols, lvs.map((lv) => row(lv, c.level(lv), list(monstersOfGearLv(lv).map((m) => monsterName(P, m))) || c.none,
        itemLabel(P, GEAR.weaponFor(lv)), itemLabel(P, GEAR.armorFor(lv))))),
      h(G.optHead),
      p(G.optNote(num(GEAR.optMin), num(GEAR.optMin + GEAR.optSpan), pct(GEAR.optPerLevel))),
      table('options', G.optTableHead, [G.optCol, G.rarityCol, ...lvs.map((lv) => c.level(lv))],
        STAT_IDS.flatMap((s) => rars.map((r) => row(`${s}:${RARITIES[r].id}`, G.stats[s], rarityName(P, r), ...lvs.map((lv) => { const v = optRange(s, r, lv); return v ? span(v) : c.none; }))))),
      h(G.enhanceHead),
      ul(G.enhanceRules(pct(ENHANCE.perPlus), num(ENHANCE.max), num(ENHANCE.supplyMax), L.gear.rarities.supply,
        sampleBase ? G.enhanceExample(L.gear.stats[sampleBase[0]](sampleBase[1]), num(ENHANCE.supplyMax), L.gear.stats[sampleBase[0]](Math.round(sampleBase[1] * ENHANCE.supplyMax * ENHANCE.perPlus * 10) / 10)) : '')),
      table('enhance', G.enhanceTableHead, [G.stepCol, G.rateCol, G.triesCol, ...rars.map((r) => G.costCol(rarityName(P, r)))],
        steps.map((s) => row(s, `+${s} → +${s + 1}`, pct(ENHANCE.rate(s)), num(1 / ENHANCE.rate(s)), ...rars.map((r) => c.gold(num(ENHANCE.gold(s, r))))))),
      p(G.enhanceCostNote(L.gear.rarities.supply, L.gear.rarities.made, rarityName(P, 0))),
      table('enhanceTotal', G.totalHead, [G.targetCol, G.totalTriesCol, ...rars.map((r) => G.totalCol(rarityName(P, r)))],
        steps.map((s) => row(s + 1, `+${s + 1}`, num(enhanceTries(s + 1)), ...rars.map((r) => c.gold(num(Math.round(enhanceExpected(s + 1, r)))))))),
      h(G.sellHead),
      p(G.sellNote(num(GEAR.sellBase), num(GEAR.sellPerTier))),
      table('sellPlain', G.sellPlainHead, G.sellPlainCols, bases.map((id) => row(id, itemLabel(P, id), c.gold(num(plainSell(id)))))),
      table('sellDrop', G.sellDropHead, [G.rarityCol, ...lvs.map((lv) => c.level(lv))],
        rars.map((r) => row(RARITIES[r].id, rarityName(P, r), ...lvs.map((lv) => { const v = sellRange(r, lv); return v ? c.gold(span(v)) : c.none; })))),
    ],
  };
}

// ---------- 성장 ----------
const RESET_LEVELS = [5, 10, 20, 30];
/** 레벨 표에 보여 주는 가장 높은 레벨 */
export const LEVEL_ROWS = 60;
/** 능력치 표의 본보기 레벨 */
const STAT_SAMPLE_LV = 10;
function growth(P: Pack): Section {
  const { L, T } = P, c = T.common, W = T.growth;
  const skillSteps = Array.from({ length: BUILD.skillMax - 1 }, (_, i) => i + 1);
  let paid = 0;
  const points = (STAT_SAMPLE_LV - 1) * BUILD.pointsPerLevel;
  return {
    id: 'growth', title: W.title, blocks: [
      ul(W.levelRules(num(HP_PER_LEVEL), num(BUILD.pointsPerLevel), num(LEVEL.firstNeed), pct(levelGrowth()))),
      table('levels', W.levelHead, W.levelCols, Array.from({ length: LEVEL_ROWS }, (_, i) => i + 1).map((lv) => row(lv, c.level(lv), num(needFor(lv)), num(expUpTo(lv))))),
      table('buildStats', W.statHead, W.statCols(num(STAT_SAMPLE_LV), num(points)), BUILD_STATS.map((k) => row(k, L.build.stats[k].name, L.build.stats[k].info(BUILD[k]), L.build.stats[k].info(Math.round(BUILD[k] * points * 10) / 10)))),
      table('statReset', W.resetHead, [T.common.levelCol, W.resetCol], RESET_LEVELS.map((lv) => row(lv, c.level(lv), c.gold(num(BUILD.resetGold(lv)))))),
      h(W.skillHead),
      ul(W.skillRules(num(BUILD.skillMax), pct(BUILD.skillPerLevel))),
      table('skillUp', W.skillTableHead, W.skillCols, skillSteps.map((lv) => {
        paid += BUILD.skillGold(lv);
        return row(lv, `${lv} → ${lv + 1}`, c.level(BUILD.skillNeedLv(lv)), c.gold(num(BUILD.skillGold(lv))), c.gold(num(paid)), `+${pct(lv * BUILD.skillPerLevel)}`);
      })),
      h(W.rankHead),
      p(W.rankNote(num(RANK.show))),
      facts(P, 'power', W.powerHead, W.power, {
        level: W.points(num(POWER.perLevel)),
        tier: W.points(num(POWER.perTier)),
        skill: W.points(num(POWER.perSkillLevel)),
        gear: W.points(num(scoreOf(STAT_IDS[0], statBase(STAT_IDS[0])))),
      }),
      p(W.powerNote(list(STAT_IDS.map((s) => `${T.gear.stats[s]} ${num(statBase(s))}`)))),
    ],
  };
}

// ---------- 퀘스트 ----------
function goalText(P: Pack, g: QuestGoal): string {
  const Q = P.T.quests;
  switch (g.kind) {
    case 'kill': return Q.goalKill(monsterName(P, g.monster), g.n);
    case 'offer': return g.tower === undefined ? Q.goalOffer(g.n) : Q.goalOfferAt(g.n, towerName(P, g.tower));
    case 'visit': return Q.goalVisit(num(g.r));
    case 'buy': return Q.goalBuy(itemLabel(P, g.item), g.n);
    case 'raid': return Q.goalRaid(g.n, list(RAID.hours.map((hr) => P.T.common.clock(hr))));
  }
}
function quests(P: Pack): Section {
  const { L, T } = P, Q = T.quests;
  const blocks: Block[] = [ul(Q.rules)];
  for (const ch of QUESTS) {
    const texts = L.quests[ch.id];
    const exp = ch.steps.reduce((s, st) => s + st.reward.exp, 0), sparks = ch.steps.reduce((s, st) => s + st.reward.sparks, 0);
    blocks.push(table(`quest_${ch.id}`, `${texts.title} · ${Q.total(num(exp), num(sparks))}`, Q.cols,
      ch.steps.map((st, i) => row(`${ch.id}:${i}`, String(i + 1), texts.steps[i], goalText(P, st.goal), num(st.reward.exp), num(st.reward.sparks)))));
  }
  return { id: 'quests', title: Q.title, blocks };
}

// ---------- 등탑과 주민 ----------
function tower(P: Pack): Section {
  const { L, T } = P, c = T.common, W = T.tower;
  const stageRange: Record<Stage, string> = { 0: `0–${GLOW_DIM - 1}`, 1: `${GLOW_DIM}–${GLOW_BRIGHT - 1}`, 2: `${GLOW_BRIGHT}–${GLOW_MAX}` };
  const stages: Stage[] = [0, 1, 2];
  let need = 0, gold = 0;
  return {
    id: 'tower', title: W.title, blocks: [
      ul(W.rules(c.m(TOWER_REACH), num(GLOW_MAX), c.count(FULL_TOWER_OFFER))),
      table('towers', W.towerHead, W.towerCols, TOWERS.map((t, i) => row(t.id, towerName(P, i), L.zones[i], t.start > 0 ? `${num(t.start)} (${L.stages[stageOf(t.start)]})` : W.unlit, num(t.floor)))),
      table('stages', W.stageHead, W.stageCols, stages.map((s) => {
        const bonus = speedFor(s) / PLAYER_SPEED - 1;
        return row(s, L.stages[s], stageRange[s], bonus > 0 ? `+${pct(bonus)}` : c.none, s === 2 ? c.mult(GLOW_BRIGHT_REGEN) : c.none);
      })),
      h(W.residentHead),
      p(W.residentNote(towerName(P, 0))),
      table('residents', '', W.residentCols, RESIDENTS.map((r, i) => {
        need += r.need;
        const unlocked = ITEM_IDS.filter((id) => (ITEMS[id] as ItemDef).needs === r.id).map((id) => itemLabel(P, id));
        return row(r.id, String(i + 1), L.residents[r.id].name, num(r.need), num(need), L.residents[r.id].bonus, list(unlocked) || c.none);
      })),
      h(W.contribHead),
      ul(W.contribRules(num(KEEPERS_SHOWN), num(RAID_KEEP_POINTS))),
      table('contrib', '', W.contribCols, CONTRIB_TIERS.map((t, i) => { gold += t.gold; return row(i + 1, String(i + 1), num(t.need), c.gold(num(t.gold)), c.gold(num(gold))); })),
    ],
  };
}

// ---------- 습격 ----------
function raid(P: Pack): Section {
  const { T } = P, c = T.common, R = T.raid;
  const cap = raidCapPlayers(), counts = Array.from({ length: cap }, (_, i) => i + 1);
  const glows = [...new Set([0, TOWERS[0].floor, GLOW_DIM, TOWERS[0].start, GLOW_BRIGHT, GLOW_MAX])].sort((a, b) => a - b);
  const typeShare = tally(RAID.types);
  return {
    id: 'raid', title: R.title, blocks: [
      p(R.intro(towerName(P, 0))),
      facts(P, 'raid', R.factsHead, R.facts, {
        hours: list(RAID.hours.map((hr) => c.clock(hr))),
        perDay: c.times(RAID.hours.length),
        warn: c.sec(RAID.warnS),
        duration: c.sec(RAID.durationS),
        waves: list(RAID.waveAtS.map((s) => c.sec(s))),
        join: c.m(RAID.joinRadius),
        spawn: `${num(RAID.spawnRadius[0])}–${c.m(RAID.spawnRadius[1])}`,
        types: list(typeShare.map(([type, n]) => `${monsterName(P, type)} ${pct(n / RAID.types.length)}`)),
        drain: num(RAID.drainPerS),
        win: R.glowChange(RAID.winGlow > 0 ? `+${RAID.winGlow}` : String(RAID.winGlow)),
        lose: R.glowChange(String(RAID.loseGlow)) + ' ' + R.floorNote(num(TOWERS[0].floor)),
        reward: rewardText(P, { exp: RAID.rewardExp, sparks: RAID.rewardSparks }),
        keep: num(RAID_KEEP_POINTS),
      }),
      ul(R.rules),
      table('raidFoes', R.foesHead(num(RAID.base), num(RAID.perPlayer), num(RAID.max)), R.foesCols, counts.map((n) => row(n, c.people(n), num(raidFoes(n))))),
      table('raidTower', R.towerHead(num(RAID.towerHpBase), num(RAID.towerHpPerGlow)), R.towerCols(num(raidFoes(1))),
        glows.map((g) => row(g, `${num(g)} (${P.L.stages[stageOf(g)]})`, num(raidTowerHp(g)), c.sec(Math.round(raidTowerHp(g) / (RAID.drainPerS * raidFoes(1)))))),
      ),
    ],
  };
}

// ---------- 던전 ----------
function dungeons(P: Pack): Section {
  const { L, T } = P, c = T.common, D = T.dungeons;
  const blocks: Block[] = [ul(D.rules(c.m(PORTAL_REACH)))];
  for (const id of DUNGEON_IDS) {
    const d = DUNGEONS[id], name = L.dungeons[id].name;
    const mobs = tally(d.packs.flatMap((pk) => Array.from({ length: pk.n }, () => pk.type)));
    const shares = raritySharesFrom(d.dropRar);
    blocks.push(
      h(name),
      p(L.dungeons[id].info),
      facts(P, `dungeon_${id}`, '', D.facts, {
        minLv: c.level(d.minLv),
        perDay: c.times(d.perDay),
        time: c.min(d.timeS / 60),
        packs: D.packsValue(num(d.packs.length), num(d.packs.reduce((s, pk) => s + pk.n, 0)), list(mobs.map(([type, n]) => `${monsterName(P, type)} ×${n}`))),
        boss: monsterName(P, d.boss.type),
        reward: rewardText(P, d.reward),
        gear: D.gearValue(rarityName(P, d.dropRar), c.level(d.dropLv)),
        exit: c.sec(d.exitS),
      }),
      table(`dungeonGear_${id}`, D.gearHead(name), D.gearCols, RARITIES.map((r, i) => row(`${id}:${r.id}`, rarityName(P, i), pct(shares[i])))),
    );
  }
  return { id: 'dungeons', title: D.title, blocks };
}

// ---------- 일일 임무, 출석, 방치 보상, 휴식 보너스, 자리 비움 사냥 ----------
const IDLE_LEVELS = [1, 5, 10, 20];
function daily(P: Pack): Section {
  const { L, T } = P, c = T.common, D = T.daily;
  const idleMinutes = [...new Set([IDLE.minMin, 60, 240, IDLE.maxMin])].filter((m) => m >= IDLE.minMin && m <= IDLE.maxMin).sort((a, b) => a - b);
  const restHours = [...new Set([1, 2, 4, REST.cap / REST.expPerHour])].sort((a, b) => a - b);
  const sum = ATTEND.reduce((s: Required<Pick<Reward, 'gold' | 'exp' | 'sparks'>>, r) => ({ gold: s.gold + (r.gold ?? 0), exp: s.exp + (r.exp ?? 0), sparks: s.sparks + (r.sparks ?? 0) }), { gold: 0, exp: 0, sparks: 0 });
  return {
    id: 'daily', title: D.title, blocks: [
      h(D.dailyHead),
      p(D.dailyNote),
      table('dailies', '', D.dailyCols, DAILY_IDS.map((id) => row(id, L.gear.dailies[id], D.kinds[DAILIES[id].kind], num(DAILIES[id].n), rewardText(P, DAILIES[id].r)))),
      h(D.attendHead),
      p(D.attendNote(num(ATTEND.length), rewardText(P, sum))),
      table('attend', '', D.attendCols, ATTEND.map((r, i) => row(i + 1, L.fmt.streak(i + 1), rewardText(P, r)))),
      h(D.idleHead),
      ul(D.idleRules(c.min(IDLE.minMin), c.hour(IDLE.maxMin / 60))),
      table('idle', D.idleTableHead, [D.awayCol, ...IDLE_LEVELS.map((lv) => c.level(lv)), D.sparkCol],
        idleMinutes.map((m) => row(m, c.min(m), ...IDLE_LEVELS.map((lv) => { const r = IDLE.reward(m, lv); return L.fmt.reward(r.gold ?? 0, r.exp ?? 0, 0); }), num(IDLE.reward(m, 1).sparks ?? 0)))),
      h(D.restHead),
      ul(D.restRules(c.min(REST.minMin), num(REST.expPerHour), num(REST.cap))),
      table('rest', '', D.restCols, restHours.map((hr) => row(hr, c.hour(hr), num(restGain(hr * 3600000))))),
      h(D.awayHead),
      facts(P, 'away', '', D.away, {
        minLv: c.level(AWAY.minLv),
        maxTime: c.hour(AWAY.maxS / 3600),
        max: c.people(AWAY.max),
        maxPerIp: c.people(AWAY.maxPerIp),
        seek: c.m(AUTO.seek),
        roam: c.m(AWAY.roam),
        healAt: pct(AUTO.healAt),
        potionAt: pct(AUTO.potionAt),
      }),
      ul(D.awayRules),
    ],
  };
}

// ---------- 파티, 길드, 거래소, 채널 ----------
function party(P: Pack): Section {
  const { T } = P, c = T.common;
  return {
    id: 'party', title: T.party.title, blocks: [
      facts(P, 'party', '', T.party.facts, { max: c.people(PARTY.max), inviteRange: c.m(PARTY.inviteRange), inviteS: c.sec(PARTY.inviteS), shareRange: c.m(PARTY.shareRange) }),
      ul(T.party.rules),
    ],
  };
}
function guild(P: Pack): Section {
  const { T } = P, c = T.common, G = T.guild;
  const levels = Array.from({ length: GUILD.maxLevel }, (_, i) => i + 1);
  return {
    id: 'guild', title: G.title, blocks: [
      facts(P, 'guild', '', G.facts, {
        create: G.createValue(c.level(GUILD.createLv), c.gold(num(GUILD.createGold))),
        name: G.nameValue(num(GUILD.nameMin), num(GUILD.nameMax)),
        notice: c.chars(GUILD.noticeMax),
        members: c.people(GUILD.maxMembers),
        inviteS: c.sec(GUILD.inviteS),
        noticeGap: c.sec(GUILD.noticeGapS),
        chatGap: c.sec(GUILD.chatGapS),
        gives: list(GUILD.gives.map((n) => c.gold(num(n)))),
        perLevel: c.gold(num(GUILD.expPerGuildLevel)),
        maxLevel: num(GUILD.maxLevel),
        bonus: `+${pct(GUILD.expPerLevel)}`,
      }),
      table('guildLevels', G.levelHead, G.levelCols, levels.map((lv) => row(lv, c.level(lv), c.gold(num(guildNeed(lv))), `+${pct(lv * GUILD.expPerLevel)}`))),
      ul(G.rules),
    ],
  };
}
function market(P: Pack): Section {
  const { L, T } = P, c = T.common, K = T.market;
  const prices = [...new Set([MARKET.minPrice, 10, 100, 1000, 10000, MARKET.maxPrice])].filter((v) => v >= MARKET.minPrice && v <= MARKET.maxPrice).sort((a, b) => a - b);
  return {
    id: 'market', title: K.title, blocks: [
      facts(P, 'market', '', K.facts, {
        minLv: c.level(MARKET.minLv),
        price: `${num(MARKET.minPrice)}–${c.gold(num(MARKET.maxPrice))}`,
        listings: c.count(MARKET.maxListings),
        hours: c.hour(MARKET.hours),
        tax: K.taxValue(pct(MARKET.tax), c.gold(num(marketFee(MARKET.minPrice)))),
        stack: `1–${c.count(MAT_MAX)}`,
        page: c.count(MARKET.pageSize),
      }),
      table('marketFee', K.feeHead, K.feeCols, prices.map((v) => row(v, c.gold(num(v)), c.gold(num(marketFee(v))), c.gold(num(v - marketFee(v)))))),
      ul(K.rules(L.gear.rarities.supply, c.count(MAIL_MAX))),
    ],
  };
}
function channel(P: Pack): Section {
  const { T } = P, c = T.common;
  return {
    id: 'channel', title: T.channel.title, blocks: [
      facts(P, 'channel', '', T.channel.facts, {
        count: c.count(CHANNEL.count), soft: c.people(CHANNEL.soft), hard: c.people(CHANNEL.hard), switchCd: c.sec(CHANNEL.switchCdS), calm: c.sec(CHANNEL.calmS),
      }),
      ul(T.channel.rules),
    ],
  };
}

/** 도감 전체: 구역의 목록 */
export function buildGuide(P: Pack): Section[] {
  return [start(P), classes(P), monsters(P), items(P), craft(P), gear(P), growth(P), quests(P), tower(P), raid(P), dungeons(P), daily(P), party(P), guild(P), market(P), channel(P)];
}

/** 도감의 표 전부 (검사용) */
export function tablesOf(sections: readonly Section[]): Table[] {
  return sections.flatMap((s) => s.blocks.flatMap((b) => (b.t === 'table' ? [b.table] : [])));
}
