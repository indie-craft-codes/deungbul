// 도감(client/guide.html): 내용이 게임의 정의와 일치하는가. 화면 없이 도감의 데이터(client/src/guide/data.ts)만 만든다.
// 빠진 항목이 없는가, 확률의 합이 맞는가, 계산해 보여 주는 값이 서버를 실제로 돌린 결과와 맞는가, 두 언어에 빠진 문장이 없는가.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enhanceExpected, enhanceTries, gearChance, gearLevels, rarityShares, raritySharesFrom, sellRange } from '../client/src/guide/calc';
import { PACKS, buildGuide, tablesOf, type Section, type Table } from '../client/src/guide/data';
import { num } from '../client/src/guide/fmt';
import { LINK_TEXT } from '../client/src/guide/link.text';
import { optRange } from '../client/src/guide/rules';
import { textEn } from '../client/src/guide/text.en';
import { textKo } from '../client/src/guide/text.ko';
import { Game } from '../server/game/game';
import {
  ATTEND, BUILD_STATS, CAMPS, CLASS_IDS, CONTRIB_TIERS, DAILY_IDS, DROPS, DUNGEONS, DUNGEON_IDS, ENHANCE, GEAR, GEAR_SLOTS, ITEMS, MONSTERS, QUESTS, RARITIES, RECIPES,
  RESIDENTS, SHOP_STOCK, SKILL_DEFS, STAT_IDS, sellPrice, type MonsterId,
} from '../shared/defs';
import { TOWERS, rng } from '../shared/world';
import { check } from './harness';

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
  check(sameSet(keys('rarities'), RARITIES.map((r) => r.id)) && sameSet(keys('buildStats'), BUILD_STATS) && keys('options').length === STAT_IDS.length * RARITIES.length, `[${lang}] 모든 등급, 능력치, 장비 옵션이 있다`);
  check(keys('enhance').length === ENHANCE.max && keys('enhanceTotal').length === ENHANCE.max, `[${lang}] 강화 표에 모든 단계가 있다 (+${ENHANCE.max}까지)`);
  check(GEAR_SLOTS.every((s) => JSON.stringify(sections.find((x) => x.id === 'gear')).includes(P.L.gear.slots[s])), `[${lang}] 장비 칸의 이름이 모두 나온다`);

  // 표의 모양: 머리와 줄의 칸 수가 같고, 빈 칸이 없다
  check(tables.every((t) => t.head.length > 0 && t.rows.length > 0 && t.rows.every((r) => r.cells.length === t.head.length)), `[${lang}] 모든 표의 줄이 머리와 같은 수의 칸을 가진다 (표 ${tables.length}개)`);
  const texts: string[] = sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => (b.t === 'table' ? [b.table.caption, ...b.table.head, ...b.table.rows.flatMap((r) => r.cells)] : b.t === 'ul' ? b.items : [b.text]))]);
  const cells = tables.flatMap((t: Table) => [...t.head, ...t.rows.flatMap((r) => r.cells)]);
  check(cells.every((c) => typeof c === 'string' && c.trim() !== ''), `[${lang}] 빈 칸이 없다`);
  const bad = texts.filter((s) => /undefined|NaN|\[object|null|Infinity|function|=>/.test(s));
  check(bad.length === 0, `[${lang}] undefined, NaN, [object 같은 글자가 없다${bad.length ? ': ' + bad[0] : ''}`);
  // id가 그대로 보이면 안 된다: 칸이 id와 똑같거나, 밑줄·숫자가 든 id(sword1, shade_bram)가 문장에 들어 있는 경우
  const ids = [...monsterIds, ...itemIds, ...skillIds, ...CLASS_IDS, ...DAILY_IDS, ...DUNGEON_IDS, ...QUESTS.map((q) => q.id), ...RESIDENTS.map((r) => r.id), ...RARITIES.map((r) => r.id), ...STAT_IDS, ...BUILD_STATS, ...GEAR_SLOTS, ...TOWERS.map((t) => t.id)];
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
  const g = new Game({ now: () => new Date(2026, 0, 10, 12).getTime() });
  const p = g.players.spawn('도감검사', false);
  g.classes.apply(p, 'warrior');
  g.gear.random = rng(20261124);

  // 강화 +10까지의 기대 골드: 서버의 강화 명령을 10만 번(장비 10만 점) 굴려 본다
  for (const rar of [0, RARITIES.length - 1]) {
    const RUNS = rar === 0 ? 100000 : 20000;
    let spent = 0, tries = 0;
    for (let i = 0; i < RUNS; i++) {
      const it = g.gear.roll(1, rar, 'ring');
      p.gear = [it]; it.uid = 1; p.worn = {};
      p.gold = 1e9;
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
  const boss = (Object.keys(MONSTERS) as MonsterId[]).find((id) => (MONSTERS[id] as { boss?: boolean }).boss);
  if (boss) {
    p.gear = [];
    const m = g.monsters.spawn(boss, 0, 20);
    g.fire('monsterKilled', m, [p]);
    check(p.gear.length === 1 && p.gear[0].lv === GEAR.levelOf(MONSTERS[boss].exp) && gearChance(MONSTERS[boss]) === 1, '필드 보스는 장비를 반드시 떨어뜨리고, 장비 레벨은 도감에 적힌 것과 같다');
  }
}

// ---------- 도감이 끌어오는 코드 ----------
{
  // 도감은 정적 페이지다: 게임의 3D·통신 코드나 node 모듈, 서버의 통신·저장 코드가 딸려 오면 안 된다.
  // 진입점에서 시작해 불러오는 파일을 모두 따라간다 (형만 불러오는 import type은 번들에 들어가지 않으므로 건너뛴다).
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const seen = new Set<string>(), problems: string[] = [];
  const allowed = (rel: string): boolean => rel.startsWith('shared/') || rel.startsWith('client/src/guide/') || /^client\/src\/i18n\/(ko|en)\.ts$/.test(rel) || rel.startsWith('server/game/');
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
      if (!spec.startsWith('.')) { problems.push(`${rel}: '${spec}'`); continue; }
      const base = path.resolve(path.dirname(file), spec);
      const hit = [base, `${base}.ts`, path.join(base, 'index.ts')].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (hit) visit(hit); else problems.push(`${rel}: '${spec}'를 찾지 못했다`);
    }
  };
  visit(path.join(root, 'client/src/guide/main.ts'));
  check(problems.length === 0, `도감은 내용 정의와 언어 파일, 순수한 게임 규칙만 불러온다 (파일 ${seen.size}개)${problems.length ? ': ' + problems.join('; ') : ''}`);
  check(seen.has('shared/content/monsters.ts') && seen.has('shared/content/growth.ts') && seen.has('client/src/i18n/ko.ts'), '도감은 게임의 정의와 언어 파일을 직접 읽는다');
}
