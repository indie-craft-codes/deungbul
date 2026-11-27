// 도감(games/deungbul/client/guide.html): 내용이 게임의 정의와 일치하는가. 화면 없이 도감의 데이터(games/deungbul/client/guide/data.ts)만 만든다.
// 빠진 항목이 없는가, 확률의 합이 맞는가, 계산해 보여 주는 값이 서버를 실제로 돌린 결과와 맞는가, 두 언어에 빠진 문장이 없는가.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enhanceExpected, enhanceTries, expUpTo, gearChance, gearLevels, monstersOfGearLv, rarityShares, raritySharesFrom, sellRange } from '../client/guide/calc';
import { LEVEL_ROWS, PACKS, buildGuide, tablesOf, type Section, type Table } from '../client/guide/data';
import { num } from '../client/guide/fmt';
import { LINK_TEXT } from '../client/guide/link.text';
import { optRange } from '../client/guide/rules';
import { textEn } from '../client/guide/text.en';
import { textKo } from '../client/guide/text.ko';
import { LOCALES, en, ko } from '../client/i18n';
import { enGame, enNames } from '../client/i18n/en';
import { koGame, koNames } from '../client/i18n/ko';
import { enBase } from '@engine/client/i18n/en';
import { itemInfo, keyHints, koBase } from '@engine/client/i18n/ko';
import { overlaps } from '@engine/client/i18n/merge';
import { AWAY } from '@engine/shared';
import { BUILD, CLASSES, COMBAT, FULL_TOWER_OFFER, GLOW_BRIGHT, GLOW_BRIGHT_REGEN, GLOW_BRIGHT_SPEED, GLOW_MAX, GUILD, LEASH, LEVEL, MONSTER_AI, POWER, STATS, bossHp, gearScore, guildLevel, guildNeed, needFor, raidFoes, raidTowerHp, type Gear } from '../shared/defs';
import { newGame } from './game';
import { compare, readFixture, snapshotOf } from './locale-snapshot';
import {
  ATTEND, BUILD_STAT_IDS, CAMPS, CLASS_IDS, CONTRIB_TIERS, DAILY_IDS, DROPS, DUNGEONS, DUNGEON_IDS, ENHANCE, GEAR, GEAR_SLOTS, ITEMS, MONSTERS, QUESTS, RARITIES, RECIPES,
  RESIDENTS, SHOP_STOCK, SKILL_DEFS, STAT_IDS, sellPrice, type MonsterId,
} from '../shared/defs';
import { TOWERS, rng } from '../shared/world';
import { BAG_UP, SALVAGE, bagSlots, dustFor, gearLvOf, isItemId, itemCap } from '../shared/defs';
import { check } from '@engine/testing';

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const near = (got: number, want: number, ratio: number): boolean => Math.abs(got - want) <= Math.abs(want) * ratio;

// ---------- 빠진 항목이 없는가, 이름이 제대로 나오는가 (언어마다) ----------
for (const P of PACKS) {
  const lang = P.L.code, sections = buildGuide(P), tables = tablesOf(sections);
  const byId = new Map(tables.map((t) => [t.id, t]));
  const keys = (id: string): string[] => (byId.get(id)?.rows ?? []).map((r) => r.key);
  const firstCells = (id: string): Map<string, string> => new Map((byId.get(id)?.rows ?? []).map((r) => [r.key, r.cells[0]]));

  check(new Set(tables.map((t) => t.id)).size === tables.length && new Set(sections.map((s) => s.id)).size === sections.length, `[${lang}] 구역과 표의 id가 겹치지 않는다`);

  const monsterIds = Object.keys(MONSTERS) as MonsterId[];
  check(sameSet(keys('monsters'), monsterIds) && sameSet(keys('monsterRewards'), monsterIds), `[${lang}] 모든 몬스터가 전투 수치 표와 보상 표에 있다 (${monsterIds.length}종)`);
  check(monsterIds.every((id) => firstCells('monsters').get(id) === P.L.monsters[id] && P.L.monsters[id] !== id), `[${lang}] 몬스터의 이름이 언어 파일의 것이다`);
  const itemIds = Object.keys(ITEMS);
  check(sameSet(keys('items'), itemIds), `[${lang}] 모든 아이템이 아이템 표에 있다 (${itemIds.length}종)`);
  check(itemIds.every((id) => firstCells('items').get(id)?.startsWith(P.L.items[id as keyof typeof ITEMS].name)), `[${lang}] 아이템의 이름이 언어 파일의 것이다`);
  check(sameSet(keys('shop'), SHOP_STOCK), `[${lang}] 상점의 물건이 모두 상점 표에 있다`);
  const skillIds = Object.keys(SKILL_DEFS);
  check(sameSet(keys('skills'), skillIds) && skillIds.every((id) => firstCells('skills').get(id) === P.L.skills[id as keyof typeof SKILL_DEFS].name), `[${lang}] 모든 기술이 기술 표에 있다 (${skillIds.length}개)`);
  check(sameSet(keys('classes'), CLASS_IDS) && CLASS_IDS.every((id) => firstCells('classes').get(id) === P.L.classes[id].name), `[${lang}] 모든 직업이 직업 표에 있다`);
  check((byId.get('classHp')?.head.length ?? 0) === CLASS_IDS.length + 1, `[${lang}] 레벨별 체력 표에 모든 직업의 칸이 있다`);
  check(QUESTS.every((ch) => sameSet(keys(`quest_${ch.id}`), ch.steps.map((_, i) => `${ch.id}:${i}`)) && byId.get(`quest_${ch.id}`)!.caption.startsWith(P.L.quests[ch.id].title)),
    `[${lang}] 모든 퀘스트의 장과 단계가 있다 (${QUESTS.length}장, ${QUESTS.reduce((s, ch) => s + ch.steps.length, 0)}단계)`);
  check(QUESTS.every((ch) => byId.get(`quest_${ch.id}`)!.rows.every((r, i) => r.cells[3] === num(ch.steps[i].reward.exp) && r.cells[4] === num(ch.steps[i].reward.sparks))), `[${lang}] 퀘스트 단계의 보상이 정의와 같다`);
  check(DUNGEON_IDS.every((id) => byId.has(`dungeon_${id}`) && byId.has(`dungeonGear_${id}`)) && sections.find((s) => s.id === 'dungeons')!.blocks.filter((b) => b.t === 'h').length === DUNGEON_IDS.length, `[${lang}] 모든 던전이 있다`);
  check(sameSet(keys('dailies'), DAILY_IDS) && DAILY_IDS.every((id) => firstCells('dailies').get(id) === P.L.gear.dailies[id]), `[${lang}] 모든 일일 임무가 있다`);
  check(sameSet(keys('recipes'), RECIPES.map((r) => r.id)), `[${lang}] 모든 제작법이 있다`);
  check(sameSet(keys('matDrops'), Object.keys(DROPS)), `[${lang}] 재료를 떨어뜨리는 몬스터가 모두 있다`);
  check(keys('attend').length === ATTEND.length && keys('contrib').length === CONTRIB_TIERS.length && keys('camps').length === CAMPS.length, `[${lang}] 출석 보상, 기여 단계, 몬스터 무리가 모두 있다`);
  check(sameSet(keys('residents'), RESIDENTS.map((r) => r.id)) && sameSet(keys('towers'), TOWERS.map((t) => t.id)), `[${lang}] 모든 주민과 등탑이 있다`);
  check(sameSet(keys('rarities'), RARITIES.map((r) => r.id)) && sameSet(keys('buildStats'), BUILD_STAT_IDS) && keys('options').length === STAT_IDS.length * RARITIES.length, `[${lang}] 모든 등급, 능력치, 장비 옵션이 있다`);
  check(keys('enhance').length === ENHANCE.max && keys('enhanceTotal').length === ENHANCE.max, `[${lang}] 강화 표에 모든 단계가 있다 (+${ENHANCE.max}까지)`);
  // 분해로 나오는 가루의 표와 가방 넓히기의 값 표: 정의(SALVAGE, BAG_UP)를 따른다
  const salvageRows = byId.get('salvage')?.rows ?? [], bagUpRows = byId.get('bagUp')?.rows ?? [];
  check(sameSet(keys('salvage'), RARITIES.map((r) => r.id)) && salvageRows.every((r, i) => r.cells.length === ENHANCE.max + 2 && r.cells.slice(1).every((c, plus) => c === num(dustFor({ rar: i, plus })))) && salvageRows[0].cells[1] === num(SALVAGE.dust[0]),
    `[${lang}] 분해 표: 등급마다 +0부터 +${ENHANCE.max}까지의 가루가 정의의 식(dustFor)과 같다`);
  check(bagUpRows.length === BAG_UP.prices.length && bagUpRows.every((r, i) => r.cells[1].includes(num(BAG_UP.prices[i])) && r.cells[2].includes(num(bagSlots(i + 1))) && r.cells[3].includes(num(BAG_UP.prices.slice(0, i + 1).reduce((s, n) => s + n, 0)))),
    `[${lang}] 가방 넓히기 표: 차례마다의 값과 칸 수, 누적 골드가 정의(BAG_UP)와 같다`);
  const gearText = JSON.stringify(sections.find((s) => s.id === 'gear'));
  check(gearText.includes(P.L.items[SALVAGE.item as keyof typeof ITEMS].name) && gearText.includes(num(itemCap(SALVAGE.item as keyof typeof ITEMS))) && gearText.includes(P.L.gear.rarities[RARITIES[SALVAGE.autoMaxRar].id]),
    `[${lang}] 분해·잠금·자동 분해의 설명에 가루의 이름과 한도, 자동 분해의 가장 높은 등급이 정의에서 읽혀 들어간다`);
  check(GEAR_SLOTS.every((s) => JSON.stringify(sections.find((x) => x.id === 'gear')).includes(P.L.gear.slots[s])), `[${lang}] 장비 칸의 이름이 모두 나온다`);

  // 표의 모양: 머리와 줄의 칸 수가 같고, 빈 칸이 없다
  check(tables.every((t) => t.head.length > 0 && t.rows.length > 0 && t.rows.every((r) => r.cells.length === t.head.length)), `[${lang}] 모든 표의 줄이 머리와 같은 수의 칸을 가진다 (표 ${tables.length}개)`);
  const texts: string[] = sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => (b.t === 'table' ? [b.table.caption, ...b.table.head, ...b.table.rows.flatMap((r) => r.cells)] : b.t === 'ul' ? b.items : [b.text]))]);
  const cells = tables.flatMap((t: Table) => [...t.head, ...t.rows.flatMap((r) => r.cells)]);
  check(cells.every((c) => typeof c === 'string' && c.trim() !== ''), `[${lang}] 빈 칸이 없다`);
  const bad = texts.filter((s) => /undefined|NaN|\[object|null|Infinity|function|=>/.test(s));
  check(bad.length === 0, `[${lang}] undefined, NaN, [object 같은 글자가 없다${bad.length ? ': ' + bad[0] : ''}`);
  // id가 그대로 보이면 안 된다: 칸이 id와 똑같거나, 밑줄·숫자가 든 id(sword1, shade_bram)가 문장에 들어 있는 경우
  const ids = [...monsterIds, ...itemIds, ...skillIds, ...CLASS_IDS, ...DAILY_IDS, ...DUNGEON_IDS, ...QUESTS.map((q) => q.id), ...RESIDENTS.map((r) => r.id), ...RARITIES.map((r) => r.id), ...STAT_IDS, ...BUILD_STAT_IDS, ...GEAR_SLOTS, ...TOWERS.map((t) => t.id)];
  const raw = ids.filter((id) => cells.includes(id) || (/[_\d]/.test(id) && texts.some((s) => new RegExp(`\\b${id}\\b`).test(s))));
  check(raw.length === 0, `[${lang}] id가 그대로 보이는 곳이 없다${raw.length ? ': ' + raw.join(', ') : ''}`);
}

// ---------- 두 언어의 도감이 같은 모양인가 ----------
{
  const [a, b] = PACKS.map((P) => buildGuide(P));
  const shape = (s: Section[]) => s.map((x) => `${x.id}:` + x.blocks.map((bl) => (bl.t === 'table' ? `T(${bl.table.id},${bl.table.head.length},${bl.table.rows.map((r) => r.key).join('/')})` : bl.t === 'ul' ? `U${bl.items.length}` : bl.t)).join(',')).join('\n');
  check(shape(a) === shape(b), '한국어와 영어 도감의 구역, 표, 줄, 목록의 수가 같다');

  // 도감 전용 언어 파일: 같은 키, 같은 종류의 값, 같은 길이의 목록, 같은 수의 인자
  const diff: string[] = [];
  const walk = (x: unknown, y: unknown, at: string): void => {
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) { diff.push(`${at}: 종류가 다르다`); return; }
    if (typeof x === 'function') { if (x.length !== (y as () => void).length) diff.push(`${at}: 인자의 수가 다르다`); return; }
    if (typeof x === 'string') { if (!x.trim() || !(y as string).trim()) diff.push(`${at}: 빈 문장`); return; }
    if (Array.isArray(x)) { if (x.length !== (y as unknown[]).length) diff.push(`${at}: 목록의 길이가 다르다`); x.forEach((v, i) => walk(v, (y as unknown[])[i], `${at}[${i}]`)); return; }
    if (typeof x === 'object' && x !== null && y !== null) {
      const kx = Object.keys(x), ky = Object.keys(y as object);
      for (const k of new Set([...kx, ...ky])) {
        if (!kx.includes(k) || !ky.includes(k)) diff.push(`${at}.${k}: 한쪽에만 있다`);
        else walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${at}.${k}`);
      }
    }
  };
  walk(textKo, textEn, 'text');
  check(diff.length === 0, `도감 전용 언어 파일의 모양이 같다${diff.length ? ': ' + diff.slice(0, 3).join('; ') : ''}`);
  check(PACKS.every((P) => LINK_TEXT[P.L.code]?.label && LINK_TEXT[P.L.code]?.title), '게임 화면의 도감 단추에 모든 언어의 글자가 있다');
  // 한국어 도감에 영어 문장이, 영어 도감에 한글이 섞여 나오지 않는다 (게임의 언어 파일에서 온 이름 포함)
  const hangul = /[가-힣]/;
  const enTexts = JSON.stringify(b);
  check(!hangul.test(enTexts), '영어 도감에 한글이 섞여 있지 않다');
}

// ---------- 확률 ----------
{
  const shares = rarityShares();
  check(Math.abs(shares.reduce((s, x) => s + x, 0) - 1) < 1e-9, '등급 확률의 합이 100%다');
  for (const P of PACKS) {
    const t = tablesOf(buildGuide(P)).find((x) => x.id === 'rarities')!;
    const shown = t.rows.reduce((s, r) => s + parseFloat(r.cells[2]), 0);
    check(Math.abs(shown - 100) < 0.011 && t.rows.every((r, i) => r.cells[2] === `${num(shares[i] * 100)}%`), `[${P.L.code}] 표에 적힌 등급 확률의 합이 100%다 (${shown}%)`);
  }
  check(DUNGEON_IDS.every((id) => { const s = raritySharesFrom(DUNGEONS[id].dropRar); return Math.abs(s.reduce((a, x) => a + x, 0) - 1) < 1e-9 && s.slice(0, DUNGEONS[id].dropRar).every((x) => x === 0); }),
    '던전 완료 장비의 등급 확률은 합이 100%이고, 정해진 등급 아래는 0%다');
}

// ---------- 서버를 실제로 돌린 결과와 맞는가 ----------
{
  const g = newGame({ now: () => new Date(2026, 0, 10, 12).getTime() });
  const p = g.players.spawn('도감검사', false);
  g.classes.apply(p, 'warrior');
  g.gear.random = rng(20261124);

  // 강화 +10까지의 기대 골드: 서버의 강화 명령으로 장비 여러 점을 +10까지 올려 본다 (+7부터는 실패하면 내려가서 한 점에 200번 넘게 굴린다. 가루는 넉넉히 준다)
  for (const rar of [0, RARITIES.length - 1]) {
    const RUNS = 8000;
    let spent = 0, tries = 0;
    for (let i = 0; i < RUNS; i++) {
      const it = g.gear.roll(1, rar, 'ring');
      p.gear = [it]; it.uid = 1; p.worn = {};
      p.gold = 1e9;
      if (isItemId(SALVAGE.item)) p.items[SALVAGE.item] = 1e6;
      while (it.plus < ENHANCE.max) { g.gear.enhance(p, 1); tries++; }
      spent += 1e9 - p.gold;
      g.notices.length = 0; p.mail.length = 0; // 쌓이는 안내문과 우편은 버린다
    }
    const want = enhanceExpected(ENHANCE.max, rar), got = spent / RUNS;
    check(near(got, want, 0.02), `강화 +${ENHANCE.max}까지의 기대 골드가 ${RUNS / 10000}만 번 굴린 평균과 2% 안에서 맞는다 (${RARITIES[rar].id}: 계산 ${Math.round(want)}, 실제 ${Math.round(got)})`);
    check(near(tries / RUNS, enhanceTries(ENHANCE.max), 0.02), `강화 기대 시도 수도 맞는다 (${RARITIES[rar].id}: 계산 ${enhanceTries(ENHANCE.max).toFixed(2)}, 실제 ${(tries / RUNS).toFixed(2)})`);
  }
  // 도감에 적힌 값이 그 계산에서 나온 것인가
  for (const P of PACKS) {
    const t = tablesOf(buildGuide(P)).find((x) => x.id === 'enhanceTotal')!;
    check(RARITIES.every((_, r) => t.rows[ENHANCE.max - 1].cells[2 + r].includes(num(Math.round(enhanceExpected(ENHANCE.max, r))))), `[${P.L.code}] 강화 표의 기대 골드가 계산값과 같다`);
  }

  // 등급의 비중과 옵션 값의 범위: 서버의 장비 굴림을 많이 돌려 본다
  const N = 100000, seen = RARITIES.map(() => 0);
  const sellMemo = new Map<string, [number, number] | null>(), optMemo = new Map<string, [number, number] | null>();
  const lo = new Map<string, number>(), hi = new Map<string, number>();
  let outside = 0, sellOut = 0, slotCount = 0;
  const lvs = gearLevels();
  for (let i = 0; i < N; i++) {
    const lv = lvs[i % lvs.length], it = g.gear.roll(lv);
    seen[it.rar]++;
    if (it.slot === GEAR_SLOTS[0]) slotCount++;
    for (const [stat, v] of it.opts) {
      const k = `${stat}:${it.rar}:${lv}`;
      if (!optMemo.has(k)) optMemo.set(k, optRange(stat, it.rar, lv));
      const r = optMemo.get(k);
      if (!r || v < r[0] || v > r[1]) outside++;
      lo.set(k, Math.min(lo.get(k) ?? Infinity, v)); hi.set(k, Math.max(hi.get(k) ?? -Infinity, v));
    }
    const sk = `${it.rar}:${lv}:${it.slot}`;
    if (!sellMemo.has(sk)) sellMemo.set(sk, sellRange(it.rar, lv, it.slot, it.base as keyof typeof ITEMS | undefined));
    const s = sellMemo.get(sk), price = sellPrice(it);
    if (!s || price < s[0] || price > s[1]) sellOut++;
  }
  const shares = rarityShares();
  check(seen.every((n, i) => Math.abs(n / N - shares[i]) < 0.004), `굴려 나온 등급의 비율이 도감의 확률과 맞는다 (${seen.map((n) => (n / N * 100).toFixed(2) + '%').join(', ')})`);
  check(Math.abs(slotCount / N - 1 / GEAR_SLOTS.length) < 0.004, '장비 칸은 고르게 나온다');
  check(outside === 0, '굴려 나온 옵션 값이 모두 도감의 범위 안에 있다');
  // 자주 나오는 조합(가장 낮은 등급)은 범위의 양 끝이 실제로 나와야 한다: 범위가 넓게 잡혀 있지 않다
  check(STAT_IDS.every((s) => lvs.every((lv) => { const r = optRange(s, 0, lv)!, k = `${s}:0:${lv}`; return lo.get(k) === r[0] && hi.get(k) === r[1]; })), '도감의 옵션 값 범위는 실제로 나오는 가장 작은 값과 가장 큰 값이다');
  check(sellOut === 0, '굴려 나온 장비의 파는 값이 모두 도감의 범위 안에 있다');
  check(RARITIES.every((r, i) => g.gear.roll(1, i, 'ring').opts.length === r.opts), '등급마다 옵션의 수가 정의와 같다');

  // 몬스터 한 마리의 보상: 실제로 잡아 본다 (장비 확률, 평균 골드)
  const KILLS = 30000;
  for (const type of (Object.keys(MONSTERS) as MonsterId[]).filter((id) => !(MONSTERS[id] as { boss?: boolean }).boss).slice(0, 2)) {
    const def = MONSTERS[type];
    let gear = 0, gold = 0;
    for (let i = 0; i < KILLS; i++) {
      p.gear = []; p.gold = 0; p.items = {};
      const m = g.monsters.spawn(type, 0, 20);
      g.fire('monsterKilled', m, [p]);
      g.remove(m.id);
      gear += p.gear.length; gold += p.gold;
      g.notices.length = 0; p.mail.length = 0;
    }
    check(Math.abs(gear / KILLS - gearChance(def)) < 0.005, `${type}: 잡아서 나온 장비의 비율이 도감의 확률과 맞는다 (도감 ${(gearChance(def) * 100).toFixed(1)}%, 실제 ${(gear / KILLS * 100).toFixed(2)}%)`);
    check(near(gold / KILLS, (def.gold[0] + def.gold[1]) / 2, 0.02), `${type}: 잡아서 얻은 골드의 평균이 도감의 기대값과 맞는다 (실제 ${(gold / KILLS).toFixed(2)})`);
  }
  // 필드 보스마다 (잿불 거상은 정의의 gearLv로 레벨 8: 도감도 같은 gearLvOf를 읽는다)
  for (const boss of (Object.keys(MONSTERS) as MonsterId[]).filter((id) => (MONSTERS[id] as { boss?: boolean }).boss)) {
    p.gear = [];
    const m = g.monsters.spawn(boss, 0, 20);
    g.fire('monsterKilled', m, [p]);
    check(p.gear.length === 1 && p.gear[0].lv === gearLvOf(MONSTERS[boss]) && monstersOfGearLv(p.gear[0].lv).includes(boss) && gearChance(MONSTERS[boss]) === 1, `${boss}: 필드 보스는 장비를 반드시 떨어뜨리고, 장비 레벨(${p.gear[0]?.lv})은 도감에 적힌 것과 같다`);
  }
}

// ---------- 서버 코드에서 내용 정의로 옮긴 수치: 도감의 표가 서버를 실제로 굴린 결과와 맞는가 ----------
{
  const g = newGame({ now: () => new Date(2026, 0, 10, 12).getTime() });
  const tableOf = (P: (typeof PACKS)[number], id: string): Table => tablesOf(buildGuide(P)).find((x) => x.id === id)!;
  const cell = (P: (typeof PACKS)[number], id: string, key: string | number, col = 1): string => tableOf(P, id).rows.find((r) => r.key === String(key))!.cells[col];
  const fresh = (name: string, cls = 'warrior') => { const p = g.players.spawn(name, false); g.classes.apply(p, cls as 'warrior'); return p; };

  // 레벨 표: 경험치를 주어 실제로 레벨을 올려 본다. 필요 경험치에 1이 모자라면 오르지 않고, 채우면 오른다
  const p = fresh('레벨검사');
  let total = 0, early = 0, wrongNeed = 0, wrongTotal = 0;
  for (let lv = 1; lv < LEVEL_ROWS; lv++) {
    if (p.need !== needFor(lv) || total !== expUpTo(lv)) wrongNeed++;
    g.players.grant(p, p.need - 1, 0);
    if (p.lv !== lv) early++;
    g.players.grant(p, 1, 0);
    total += needFor(lv);
    if (p.lv !== lv + 1 || p.exp !== 0 || total !== expUpTo(lv + 1)) wrongTotal++;
    g.notices.length = 0;
  }
  check(early === 0 && wrongNeed === 0 && wrongTotal === 0 && p.lv === LEVEL_ROWS, `레벨 표의 필요 경험치만큼 주면 서버의 캐릭터가 정확히 그 지점에서 오른다 (Lv 1에서 ${LEVEL_ROWS}까지)`);
  for (const P of PACKS) {
    const t = tableOf(P, 'levels');
    check(t.rows.length === LEVEL_ROWS && t.rows.every((r, i) => r.key === String(i + 1) && r.cells[1] === num(needFor(i + 1)) && r.cells[2] === num(expUpTo(i + 1))) && t.rows[0].cells[1] === num(LEVEL.firstNeed) && t.rows[0].cells[2] === '0',
      `[${P.L.code}] 레벨 표에 Lv 1부터 ${LEVEL_ROWS}까지의 필요 경험치와 누적이 있다`);
  }

  // 치명타: 기본 공격을 많이 쳐 본다 (난수를 정해 두고). 확률과 피해 배율이 도감의 값과 맞는가
  {
    const a = fresh('치명타검사'), m = g.monsters.spawn('slime', a.x + 1, a.z);
    const real = Math.random, cls = CLASSES.warrior.basic;
    let hits = 0, crits = 0, maxPlain = 0, maxCrit = 0, minCrit = Infinity;
    try {
      Math.random = rng(31);
      for (let i = 0; i < 40000; i++) {
        m.hp = m.maxHp = 1e9; m.x = a.x + 1; m.z = a.z; a.targetId = m.id; a.atkCd = 0; a.hp = a.maxHp;
        g.events = [];
        g.combat.tickPlayer(a, 0.05);
        for (const ev of g.events) if (ev[0] === 'h' && ev[1] === a.id) {
          hits++;
          if (ev[4]) { crits++; maxCrit = Math.max(maxCrit, ev[3]); minCrit = Math.min(minCrit, ev[3]); } else maxPlain = Math.max(maxPlain, ev[3]);
        }
      }
    } finally { Math.random = real; }
    g.remove(m.id);
    check(hits === 40000 && Math.abs(crits / hits - COMBAT.critChance) < 0.006, `기본 공격의 치명타 비율이 도감의 확률과 맞는다 (도감 ${num(COMBAT.critChance * 100)}%, 실제 ${(crits / hits * 100).toFixed(2)}%)`);
    check(maxPlain === cls[1] && maxCrit === Math.round(cls[1] * COMBAT.critMult) && minCrit === Math.round(cls[0] * COMBAT.critMult), `치명타의 피해는 기본 공격 피해에 도감의 배율을 곱한 값이다 (${minCrit}–${maxCrit})`);
    for (const P of PACKS) check(cell(P, 'combat', 'critChance') === `${num(COMBAT.critChance * 100)}%` && cell(P, 'combat', 'critMult').includes(num(COMBAT.critMult)), `[${P.L.code}] 전투 표의 치명타 확률과 배율이 정의의 값이다`);
  }

  // 자연 회복: 맞은 뒤 정해진 시간이 지나야 시작하고, 초당 회복량은 표의 값이다. 등탑이 환하면 배로 는다
  {
    const a = fresh('회복검사');
    const gain = (sinceHurt: number): number => { a.hp = 1; a.targetId = 0; a.moving = false; a.lastHurt = g.clock - sinceHurt; g.combat.tickPlayer(a, 1); return a.hp - 1; };
    const before = gain(COMBAT.regenAfterS - 0.01), plain = gain(COMBAT.regenAfterS + 0.01);
    g.tower.glows[0] = GLOW_MAX;
    const bright = gain(COMBAT.regenAfterS + 0.01);
    g.tower.glows[0] = GLOW_BRIGHT - 1;
    check(before === 0 && plain === COMBAT.regenPerS && bright === COMBAT.regenPerS * GLOW_BRIGHT_REGEN, `자연 회복은 맞은 뒤 ${COMBAT.regenAfterS}초가 지나야 시작하고 초당 ${plain}, 환한 구역에서는 ${bright}이다`);
    for (const P of PACKS) check(cell(P, 'combat', 'regenPerS').includes(num(plain)) && cell(P, 'combat', 'regenBright').includes(num(bright)) && cell(P, 'combat', 'regenAfter').includes(num(COMBAT.regenAfterS)) && cell(P, 'stages', '2', 3).includes(num(GLOW_BRIGHT_REGEN)),
      `[${P.L.code}] 전투 표와 밝기 단계 표의 자연 회복이 서버의 결과와 같다`);
  }

  // 받는 피해 감소의 한도: 옵션을 아무리 쌓아도 한도까지만 듣는다
  {
    const a = fresh('한도검사');
    const ring: Gear = { uid: 0, slot: 'ring', rar: 3, lv: 6, plus: 0, opts: [['guard', 400]] };
    g.gear.put(a, ring); g.gear.equip(a, ring.uid);
    const guard = g.mods.product('guard', a);
    check(Math.abs(guard - (1 - GEAR.guardCap / 100)) < 1e-9, `받는 피해 감소 옵션은 한도까지만 듣는다 (받는 피해 ×${guard.toFixed(2)})`);
    for (const P of PACKS) check(cell(P, 'combat', 'guardCap') === `${num(GEAR.guardCap)}%`, `[${P.L.code}] 전투 표의 받는 피해 감소 한도가 정의의 값이다`);

    // 전투력: 도감의 점수표로 셈한 값이 서버가 내는 전투력과 같다
    a.lv = 17; a.skillLv = { smash: 3, whirl: 2 }; a.weapon = 'sword3'; a.armor = 'armor2';
    const tiers = (ITEMS.sword3.tier ?? 0) + (ITEMS.armor2.tier ?? 0);
    const byTable = (P: (typeof PACKS)[number]) => {
      const n = (key: string) => parseFloat(cell(P, 'power', key));
      return a.lv * n('level') + tiers * n('tier') + (3 - 1 + 2 - 1) * n('skill') + gearScore(ring);
    };
    check(g.rank.power(a) === a.lv * POWER.perLevel + tiers * POWER.perTier + 3 * POWER.perSkillLevel + gearScore(ring) && PACKS.every((P) => byTable(P) === g.rank.power(a)), `도감의 전투력 점수표로 셈한 값이 서버의 전투력과 같다 (${g.rank.power(a)})`);
    // 옵션의 점수: 기본값만큼의 옵션 하나가 표에 적힌 점수다
    check(PACKS.every((P) => STAT_IDS.every((s) => gearScore({ uid: 0, slot: 'ring', rar: 0, lv: 1, plus: 0, opts: [[s, STATS[s].base]] }) === parseFloat(cell(P, 'power', 'gear')))), '기본값만큼의 옵션 하나의 값어치가 전투력 표에 적힌 점수다');
  }

  // 몬스터의 움직임: 대상이 표의 거리보다 멀어지면 놓는다
  {
    const a = fresh('추적검사'), m = g.monsters.spawn('wolf', 26, 22);
    const chase = (d: number): boolean => { m.targetId = a.id; m.homing = false; m.x = m.hx; m.z = m.hz; a.x = m.x + d; a.z = m.z; g.monsters.tick(m, 0.05); return m.targetId === a.id; };
    const near = chase(MONSTER_AI.loseRange - 0.5), far = chase(MONSTER_AI.loseRange + 0.5);
    // 집으로 돌아가는 속도: 한 틱에 걷는 거리로 잰다
    m.x = m.hx + LEASH + 1; m.z = m.hz; a.x = m.x + 1; a.z = m.z; m.targetId = a.id; m.homing = false;
    g.monsters.tick(m, 0.05);
    const x0 = m.x, z0 = m.z; g.monsters.tick(m, 0.05);
    const homeSpeed = Math.hypot(m.x - x0, m.z - z0) / 0.05;
    g.remove(m.id);
    check(near && !far, `몬스터는 대상이 ${MONSTER_AI.loseRange}m보다 멀어지면 놓는다`);
    check(m.homing && Math.abs(homeSpeed - MONSTERS.wolf.speed * MONSTER_AI.homeSpeed) < 0.2, `집으로 돌아가는 몬스터는 제 속도의 ${MONSTER_AI.homeSpeed}배로 걷는다 (초당 ${homeSpeed.toFixed(2)}m)`);
    for (const P of PACKS) check(cell(P, 'monsterAi', 'loseRange').includes(num(MONSTER_AI.loseRange)) && cell(P, 'monsterAi', 'leash').includes(num(LEASH)) && cell(P, 'monsterAi', 'homeSpeed').includes(num(MONSTER_AI.homeSpeed)) && cell(P, 'monsterAi', 'wanderSpeed').includes(num(MONSTER_AI.wanderSpeed)),
      `[${P.L.code}] 몬스터의 움직임 표가 정의의 값이다`);
  }

  // 서버와 도감이 같은 함수를 쓰는 식: 표의 값이 그 함수의 값이고, 길드 레벨의 누적 기부는 실제로 그 레벨이 되는 지점이다
  check(Array.from({ length: GUILD.maxLevel }, (_, i) => i + 1).every((lv) => guildLevel(guildNeed(lv)) === lv && (lv === 1 || guildLevel(guildNeed(lv) - 1) === lv - 1)), '길드 레벨 표의 누적 기부는 그 레벨이 되는 가장 적은 기부다');
  for (const P of PACKS) {
    const boss = (Object.keys(MONSTERS) as MonsterId[]).find((id) => (MONSTERS[id] as { boss?: boolean }).boss)!;
    check(cell(P, 'bossHp', 3) === num(bossHp(MONSTERS[boss].hp, 3)) && cell(P, 'raidFoes', 2) === num(raidFoes(2)) && cell(P, 'raidTower', GLOW_MAX) === num(raidTowerHp(GLOW_MAX)) && cell(P, 'guildLevels', 3).includes(num(guildNeed(3)))
      && cell(P, 'away', 'roam').includes(num(AWAY.roam)) && cell(P, 'away', 'maxTime').includes(num(AWAY.maxS / 3600)) && cell(P, 'guild', 'noticeGap').includes(num(GUILD.noticeGapS)) && cell(P, 'guild', 'chatGap').includes(num(GUILD.chatGapS)),
      `[${P.L.code}] 보스 체력, 습격 적의 수와 등탑 내구, 길드 레벨, 자리 비움, 길드 간격의 표가 서버와 같은 함수·정의에서 나온다`);
    check(JSON.stringify(buildGuide(P).find((s) => s.id === 'tower')).includes(String(FULL_TOWER_OFFER)), `[${P.L.code}] 가득 찬 등탑이 한 번에 받는 불씨가 등탑 구역에 적혀 있다`);
  }
}

// ---------- 게임 언어 파일의 문장: 정의의 값으로 만든 문장이 예전에 손으로 적어 둔 문장과 같은가 ----------
{
  const was: Record<string, Partial<Record<keyof typeof ITEMS, string>>> = {
    ko: { sword1: '기본 무기', sword2: '공격 피해 +20%', sword3: '공격 피해 +45%', sword4: '공격 피해 +75%', sword5: '공격 피해 +110%', sword6: '공격 피해 +150%', armor1: '받는 피해 -12%', armor2: '받는 피해 -24%', armor3: '받는 피해 -34%', potion: '체력 80 회복', tonic: '체력 160 회복', hide: '멧돼지와 잿불 여우가 떨어뜨리는 재료' },
    en: { sword1: 'Starting weapon', sword2: 'Damage +20%', sword3: 'Damage +45%', sword4: 'Damage +75%', sword5: 'Damage +110%', sword6: 'Damage +150%', armor1: 'Damage taken -12%', armor2: 'Damage taken -24%', armor3: 'Damage taken -34%', potion: 'Restores 80 health', tonic: 'Restores 160 health', hide: 'Material dropped by boars and cinder foxes' },
  };
  const stage: Record<string, string[]> = {
    ko: ['빛이 약합니다. 혜택이 없습니다.', '70 이상이면 환해집니다: 이동 속도 +10%, 회복 2배', '환합니다: 이동 속도 +10%, 회복 2배'],
    en: ['The light is weak. No bonuses.', 'At 70 it turns bright: +10% move speed, 2x recovery', 'Bright: +10% move speed, 2x recovery'],
  };
  const left: Record<string, string> = { ko: '능력치 · 남은 점수 4 (레벨이 오를 때마다 3점)', en: 'Attributes · 4 points left (3 per level)' };
  for (const P of PACKS) {
    const lang = P.L.code, ids = Object.keys(was[lang]) as (keyof typeof ITEMS)[];
    const bad = ids.filter((id) => itemInfo(P.L, id) !== was[lang][id]);
    check(bad.length === 0 && (Object.keys(ITEMS) as (keyof typeof ITEMS)[]).every((id) => itemInfo(P.L, id) !== ''), `[${lang}] 아이템 설명(공격 피해, 받는 피해, 회복량)이 정의의 값으로 만들어지고 예전 문장과 같다${bad.length ? ': ' + bad.join(', ') : ''}`);
    check([0, 1, 2].every((s) => P.L.fmt.stageNote(s, GLOW_BRIGHT, Math.round((GLOW_BRIGHT_SPEED - 1) * 100), GLOW_BRIGHT_REGEN) === stage[lang][s]) && P.L.fmt.statLeft(4, BUILD.pointsPerLevel) === left[lang], `[${lang}] 등탑 단계 안내와 능력치 안내가 정의의 값으로 만들어지고 예전 문장과 같다`);
  }
}

// ---------- 도감이 끌어오는 코드 ----------
{
  // 도감은 정적 페이지다: 게임의 3D·통신 코드나 node 모듈, 서버의 코드(engine/server/)가 딸려 오면 안 된다. 규칙의 식은 games/deungbul/shared/content의 순수 함수로 읽는다.
  // 진입점에서 시작해 불러오는 파일을 모두 따라간다 (형만 불러오는 import type은 번들에 들어가지 않으므로 건너뛴다).
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const seen = new Set<string>(), problems: string[] = [];
  const allowed = (rel: string): boolean => rel.startsWith('engine/shared/') || rel.startsWith('games/deungbul/shared/') || rel.startsWith('games/deungbul/client/guide/') || rel.startsWith('games/deungbul/client/i18n/') || /^engine\/client\/i18n\/(ko|en|merge|names|ext)\.ts$/.test(rel)
    // 플랫폼 접점(언어·주소·저장소를 읽는 곳): 브라우저 API만 감싸고 3D·통신 코드를 부르지 않는다
    || /^engine\/client\/platform\/(index|types|web|memory|auth|keyname)\.ts$/.test(rel);
  const visit = (file: string): void => {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!allowed(rel)) { problems.push(`${rel}: 도감이 불러오면 안 되는 파일`); return; }
    if (!file.endsWith('.ts')) return;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?'([^']+)'/gm)) {
      if (m[1]) continue;
      const spec = m[2];
      // 상대 경로와 별칭(@engine, @game: tsconfig.json의 paths)을 따라간다. 그 밖의 것(node 모듈, 패키지)은 도감에 들어오면 안 된다
      const alias = ([['@engine/', 'engine'], ['@game/', 'games/deungbul']] as const).find(([a]) => spec.startsWith(a));
      if (!spec.startsWith('.') && !alias) { problems.push(`${rel}: '${spec}'`); continue; }
      const base = alias ? path.join(root, alias[1], spec.slice(alias[0].length)) : path.resolve(path.dirname(file), spec);
      const hit = [base, `${base}.ts`, path.join(base, 'index.ts')].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (hit) visit(hit); else problems.push(`${rel}: '${spec}'를 찾지 못했다`);
    }
  };
  visit(path.join(root, 'games/deungbul/client/guide/main.ts'));
  check(problems.length === 0, `도감은 내용 정의와 언어 파일, 순수한 게임 규칙만 불러온다 (파일 ${seen.size}개)${problems.length ? ': ' + problems.join('; ') : ''}`);
  check(![...seen].some((f) => f.startsWith('engine/server/')), '도감은 서버 코드를 불러오지 않는다');
  check(seen.has('games/deungbul/shared/content/monsters.ts') && seen.has('games/deungbul/shared/content/growth.ts') && seen.has('engine/client/i18n/ko.ts') && seen.has('games/deungbul/client/i18n/ko.ts') && !seen.has('engine/client/i18n/index.ts'), '도감은 게임의 정의와 언어 파일(틀의 문장과 이 게임의 문장을 합친 묶음)을 직접 읽는다. 화면을 건드리는 i18n/index.ts는 불러오지 않는다');
}

// ---------- 언어 묶음: 틀의 문장과 이 게임의 문장을 합친 결과 (docs/framework-plan.md의 단계 8) ----------
// 화면의 문장은 틀의 몫(engine/client/i18n)과 이 게임의 몫(games/deungbul/client/i18n)으로 나뉘어 있다. 틀만 보는 검사는 games/deungbul/test/split.test.ts에 있고, 여기서는 합친 결과를 본다.
{
  const base = { ko: koBase(koNames), en: enBase(enNames) }, game = { ko: koGame, en: enGame };

  // 문장이 그대로인가: 견본(games/deungbul/test/fixtures/locale-*.json)은 언어 파일을 가르기 전의 문장에서 뜬 것이다. 키가 빠지거나 문장이 한 글자라도 달라지면 여기서 잡힌다.
  // 문장을 일부러 바꾸거나 더했으면 견본을 새로 뜬다: npx tsx games/deungbul/test/locale-snapshot.ts --write (바뀐 줄을 git diff로 확인한 뒤 함께 커밋)
  for (const loc of LOCALES) {
    const was = readFixture(loc.code), d = compare(was, snapshotOf(loc));
    for (const k of d.missing) console.log(`  [${loc.code}] 빠진 키: ${k}`);
    for (const k of d.added) console.log(`  [${loc.code}] 새 키: ${k}`);
    for (const k of d.changed) console.log(`  [${loc.code}] 달라진 문장: ${k}`);
    check(Object.keys(was).length > 400 && d.missing.length + d.added.length + d.changed.length === 0,
      `[${loc.code}] 화면의 문장 ${Object.keys(was).length}개가 견본과 글자까지 같다 (빠진 키 ${d.missing.length}, 새 키 ${d.added.length}, 달라진 문장 ${d.changed.length})`);
  }
  // 견본 비교가 실제로 잡아내는지: 문장 하나와 함수 꼴 문장 하나를 바꿔 보면 걸려야 한다
  const bent = compare(readFixture('ko'), snapshotOf({ ...ko, ui: { ...ko.ui, tower: '등 탑' }, msg: { ...ko.msg, kill: () => '처치' }, zones: [] }));
  check(bent.changed.includes('ui.tower') && bent.changed.includes('msg.kill') && bent.changed.includes('zones.length') && bent.missing.includes('zones[0]'), '견본 비교는 달라진 문장, 달라진 함수 꼴 문장, 빠진 키를 잡아낸다');

  // 게임이 덮어쓴 틀의 키: 틀에 기본 문장이 있고 이 게임이 자기 말(등불지기의 이름, 브람의 대장간, 잿빛 숲 …)로 바꾼 것. 목록에 없는 겹침은 실수다
  const OVERRIDES = [
    'ui.title', // 게임의 이름
    'ui.hint', // 조작 안내에 이 게임의 단축키(F: 퀘스트 이동)가 더 있고, H를 '마을로'라고 한다
    'ui.mapLegend', // 미니맵의 이 게임 표식(등탑, 퀘스트, 상인)을 말한다 (틀의 기본은 틀이 찍는 점만)
    'ui.forge', // 브람의 대장간
    'ui.shop', 'msg.shopFar', // 상인은 '길 상인'이다 (틀의 기본은 그냥 '상인')
    'ui.goingTown', // 돌아가는 곳(첫불 마을)을 말한다
    'fmt.swarmFoe', // 습격으로 온 적(몰려온 적)의 이름 앞에 '안개'를 붙인다 (틀의 기본은 이름 그대로)
    'msg.classFar', // 직업은 등탑 가까이에서 바꾼다
    'msg.bossUp', // 나타난 곳(잿빛 숲)을 말한다
    'msg.loot', 'msg.forgeFar', 'msg.forgeClosed', // 대장간의 주인(브람)을 말한다
  ];
  for (const code of ['ko', 'en'] as const) {
    const over = overlaps(base[code], game[code]);
    check([...over].sort().join() === [...OVERRIDES].sort().join(), `[${code}] 게임이 덮어쓴 틀의 키는 정해 둔 ${OVERRIDES.length}개뿐이다 (${over.join(', ')})`);
  }
  check(OVERRIDES.every((at) => { const [b, k] = at.split('.'); const pick = (l: object) => (l as Record<string, Record<string, unknown>>)[b][k]; return pick(ko) === pick(koGame) && pick(en) === pick(enGame) && pick(ko) !== pick(base.ko); }),
    '겹친 키는 합친 묶음에서 게임의 문장이다');

  // 두 언어의 모양: 틀끼리는 games/deungbul/test/split.test.ts가 보고, 여기서는 게임끼리와 합친 것끼리 본다
  const shapeDiff = (x: unknown, y: unknown, at: string): string[] => {
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) return [`${at}: 종류가 다르다`];
    if (typeof x === 'function') return x.length === (y as () => void).length ? [] : [`${at}: 인자의 수가 다르다`];
    if (typeof x === 'string') return x.trim() && (y as string).trim() ? [] : [`${at}: 빈 문장`];
    if (Array.isArray(x)) return [...(x.length === (y as unknown[]).length ? [] : [`${at}: 목록의 길이가 다르다`]), ...x.flatMap((v, i) => shapeDiff(v, (y as unknown[])[i], `${at}[${i}]`))];
    if (typeof x !== 'object' || x === null || y === null) return [];
    const X = x as Record<string, unknown>, Y = y as Record<string, unknown>;
    return [...new Set([...Object.keys(X), ...Object.keys(Y)])].flatMap((k) => (k in X && k in Y ? shapeDiff(X[k], Y[k], `${at}.${k}`) : [`${at}.${k}: 한쪽에만 있다`]));
  };
  const uneven = [...shapeDiff(koGame, enGame, 'game'), ...shapeDiff(koNames, enNames, 'names'), ...shapeDiff(ko, en, 'locale')];
  for (const x of uneven.slice(0, 10)) console.log('  ' + x);
  check(uneven.length === 0, `이 게임의 문장, 이름표, 합친 묶음은 두 언어가 같은 모양이다 (게임의 ui ${Object.keys(koGame.ui).length}개, fmt ${Object.keys(koGame.fmt).length}개, msg ${Object.keys(koGame.msg).length}개)`);

  // 영어 파일에 한글이 남아 있지 않다 (주석은 뺀다: 틀의 것과 게임의 것 모두)
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const body = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const hangulIn = ['engine/client/i18n/en.ts', 'games/deungbul/client/i18n/en.ts'].filter((f) => /[가-힣]/.test(body(f)));
  check(/[가-힣]/.test(body('games/deungbul/client/i18n/ko.ts')) && hangulIn.length === 0, `영어 언어 파일(틀, 게임)의 본문에 한글이 섞여 있지 않다${hangulIn.length ? ': ' + hangulIn.join(', ') : ''}`);

  // 안내문: 이 게임이 더한 종류(games/deungbul/shared/deungbul.ts의 MsgMap) 전부에 게임 쪽 문장이 있고, 합친 묶음에는 틀의 것까지 모두 있다
  const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  const gameKeys = [...(/interface MsgMap \{([\s\S]*?)\n  \}/.exec(read('games/deungbul/shared/deungbul.ts'))?.[1] ?? '').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const engineKeys = [...read('engine/shared/messages.ts').matchAll(/^\s*\|\s*'(\w+)'/gm)].map((m) => m[1]);
  const has = (o: object, k: string): boolean => typeof (o as Record<string, unknown>)[k] === 'function';
  check(gameKeys.length === 19 && [koGame, enGame].every((g) => gameKeys.every((k) => has(g.msg, k))) && [base.ko, base.en].every((b) => gameKeys.every((k) => !has(b.msg, k))),
    `이 게임의 안내문 ${gameKeys.length}개 모두에 게임 쪽 문장이 두 언어로 있다 (틀의 묶음에는 없다)`);
  check(LOCALES.every((l) => Object.keys(l.msg).sort().join() === [...engineKeys, ...gameKeys].sort().join()), `합친 묶음의 안내문은 틀의 것 ${engineKeys.length}개와 게임의 것 ${gameKeys.length}개, 모두 ${engineKeys.length + gameKeys.length}개다`);

  // 틀의 기능이 게임의 문장에도 똑같이 적용된다: 입력 장치 표시([[PC용|터치용]])는 같은 글꼴로 적혀 틀의 forInput이 풀고, 조작 안내는 틀의 keyHints로 잇고, 자릿수는 틀의 num이 넣는다
  const marks = (l: object): string[] => Object.entries(l).filter(([, v]) => typeof v === 'string' && /\[\[[^|\]]*\|[^\]]*\]\]/.test(v)).map(([k]) => k);
  check(marks(koGame.ui).includes('questGo') && marks(enGame.ui).includes('questGo') && marks(base.ko.ui).includes('chatPlaceholder') && LOCALES.every((l) => !/\[\[|\]\]/.test(Object.values(l.ui).join('').replace(/\[\[[^|\]]*\|[^\]]*\]\]/g, ''))),
    '게임의 문장도 [[PC용|터치용]] 표시를 같은 꼴로 쓴다 (짝이 맞지 않는 표시가 없다)');
  check(ko.ui.hint === keyHints(ko.ui.hint.split(' · ')) && ko.ui.hint.includes(' ') && ko.ui.hint.split(' · ').length === base.ko.ui.hint.split(' · ').length + 1 && ko.msg.tierUp([2, 1234567]).includes('1,234,567') && en.msg.tierUp([2, 1234567]).includes('1,234,567') && ko.fmt.num(1234567) === '1,234,567',
    '게임의 조작 안내는 틀의 keyHints로 잇고(틀의 안내에 이 게임의 단축키 하나(F)를 더했다. H는 틀의 안내에도 있다), 게임의 안내문도 큰 수에 자릿수 구분을 넣는다');
  // 불씨(두 번째 재화)를 말하는 틀의 문장은 재화의 이름을 이 게임의 이름표에서 읽는다
  check(ko.msg.kill(['slime', 3, 2, 1500]) === '슬라임 처치. 경험치 +3, 불씨 +2, 골드 +1,500' && en.msg.kill(['slime', 3, 1, 1500]) === 'Slime defeated. +3 exp, +1 spark, +1,500 gold'
    && ko.fmt.reward(100, 0, 5) === '골드 100 · 불씨 5' && en.fmt.reward(0, 20, 5) === 'Exp 20 · Sparks 5' && ko.msg.died(['ash']) === '쓰러졌습니다. 잿빛 숲 등탑에서 다시 일어났습니다. 잃은 것은 없습니다.',
    '처치·보상 안내의 불씨와 다시 일어난 등탑의 이름은 이 게임의 이름표에서 온다 (문장은 틀의 것)');
}
