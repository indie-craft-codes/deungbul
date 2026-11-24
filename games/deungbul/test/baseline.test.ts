// 틀을 가르기 전과 같은가: 등불지기의 맵·수치·저장이 틀과 게임을 가르는 작업(docs/framework-plan.md) 동안 그대로인지 지키는 안전망.
// 예전에는 engine/test/framework.test.ts에 있었다. 등불지기의 내용과 견본(fixtures/)에 기대므로 이 게임의 시험이다.
//   - 맵 지문: buildWorld()가 놓는 장애물·나무·바위와 길찾기 격자가 그대로인가
//   - 내용 계약: 틀이 게임의 낱말 대신 정의를 읽게 바꾼 것들이 예전과 똑같이 움직이는가
//   - 서버 코드에 박혀 있던 숫자를 내용 정의로 옮긴 것이 예전 식과 같은가
//   - 저장: 견본을 틀만의 게임이 읽어도 이 게임의 칸을 건드리지 않는가, 이 게임의 월드 저장을 틀만의 게임이 읽어도 죽지 않는가
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { AUTO, AWAY, NavGrid, POTIONS, pickPotion, potionOrder } from '@engine/shared';
import { Game, type PlayerSave, type WorldSave } from '@engine/server';
import { check } from '@engine/testing';
import { BOSS, COMBAT, FULL_TOWER_OFFER, GEAR, GEAR_SLOTS, GLOW_BRIGHT_REGEN, GLOW_BRIGHT_SPEED, GUILD, LEVEL, MONSTERS, MONSTER_AI, POTION_MAX, POWER, RAID, RARITIES, SPAWN, STATS, STAT_IDS, baseTier, bossHp, clearRar, gearScore, guildLevel, needFor, nextNeed, powerOf, raidFoes, raidTowerHp, sellPrice, speedFor, type Gear, type GearSlot, type ItemId, type Stat } from '../shared/defs';
import { AREAS, EDGE, MAP, MAX_X, MAX_Z, MIN_X, MIN_Z, PILLARS, PLAYER_SPEED, POND, PORTALS, TOWERS, buildWorld, rng } from '../shared/world';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
const hash = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 16);
/** 'YYYY-M-D' 꼴 날짜의 낮 12시 (서버 현지 시간). 날짜를 못 읽으면 정해 둔 날 */
function noonOf(day: unknown): number {
  const m = typeof day === 'string' ? /^(\d+)-(\d+)-(\d+)$/.exec(day) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : new Date(2026, 0, 10, 12).getTime();
}

// ---------- 맵 지문 ----------
// 값이 달라졌다면 맵이 달라진 것이다: 서버의 충돌 판정, 길찾기, 화면의 나무와 바위가 모두 바뀐다.
// 맵을 일부러 고친 것이 아니라면(정의를 옮기기만 했다면) 장애물을 넣는 순서나 난수를 쓰는 횟수가 바뀌지 않았는지 본다.
{
  const w = buildWorld();
  const f = (n: number) => n.toFixed(3);
  const text = [
    w.obstacles.map((o) => `${f(o.x)},${f(o.z)},${f(o.r)}`).join(';'),
    w.trees.map((d) => `${f(d.x)},${f(d.z)},${f(d.s)},${f(d.rot)}`).join(';'),
    w.rocks.map((d) => `${f(d.x)},${f(d.z)},${f(d.s)},${f(d.rot)}`).join(';'),
  ].join('|');
  const counts = `${w.obstacles.length}/${w.trees.length}/${w.rocks.length}`;
  check(counts === '411/448/80', `맵의 장애물/나무/바위 수가 그대로다 (${counts})`);
  check(hash(text) === '30280907b7a7711f', `맵 지문이 그대로다: 장애물·나무·바위의 좌표와 크기 (${hash(text)})`);
  const blocked = (new NavGrid(w.obstacles) as unknown as { blocked: Uint8Array }).blocked;
  const n = blocked.reduce((sum, v) => sum + v, 0);
  check(n === 17461 && hash(blocked) === '03e74551f70ac7e0', `길찾기 격자의 막힌 칸이 그대로다 (${n}칸, ${hash(blocked)})`);
}

// ---------- 내용 계약 (docs/framework-plan.md의 단계 5) ----------
// 틀이 게임의 낱말 대신 정의(MAP, FORGES, ITEMS)를 읽게 바꾼 것들이 예전과 똑같이 움직이는가.
// 계약의 모양 자체(빠진 이름, 다른 타입)는 engine/shared/contract.ts가 컴파일할 때 검사한다.
{
  // 맵 정의: 손으로 놓은 장애물은 예전에 buildWorld가 이름으로 읽던 순서(연못, 등탑, 집, 던전의 기둥) 그대로다
  const w = buildWorld();
  const tags = MAP.obstacles.map((o) => o.tag).join(',');
  check(tags === ['pond', ...TOWERS.map(() => 'tower'), 'house', 'house', 'house', 'house', ...PILLARS.map(() => 'pillar')].join(','), `맵 정의의 장애물이 연못, 등탑, 집, 기둥의 순서다 (${MAP.obstacles.length}개)`);
  check(MAP.obstacles.every((o, i) => w.obstacles[i].x === o.x && w.obstacles[i].z === o.z && w.obstacles[i].r === o.r) && w.obstacles[0].x === POND.x && w.obstacles[0].r === POND.r, '월드의 장애물 목록은 맵 정의의 장애물로 시작한다');
  const field = MAP.areas[0];
  check(AREAS === MAP.areas && EDGE === MAP.edge && PORTALS === MAP.portals && field.x0 === MIN_X && field.x1 === MAX_X && field.z0 === MIN_Z && field.z1 === MAX_Z && MAP.spawn.x === SPAWN.x && MAP.spawn.z === SPAWN.z,
    '예전 이름(AREAS, EDGE, PORTALS, SPAWN)은 맵 정의에서 꺼낸 값이고, 0번 지역이 들판이다');

  // 물약 고르기: 아이템 id를 적어 두던 예전 규칙과, 정의(회복량)에서 고르는 지금 규칙이 모든 경우에 같은 답을 낸다
  const oldPick = (ratio: number, items: Record<string, number>): 'tonic' | 'potion' | null => {
    if (ratio >= 0.35) return null;
    return (items.tonic ?? 0) > 0 ? 'tonic' : (items.potion ?? 0) > 0 ? 'potion' : null;
  };
  const oldOrder = (hurt: number): ItemId[] => (hurt >= 160 ? ['tonic', 'potion'] : ['potion', 'tonic']);
  const ratios = [...Array.from({ length: 1001 }, (_, i) => i / 1000), AUTO.potionAt - 1e-9, AUTO.potionAt + 1e-9, -0.1, 1.5];
  const counts: (number | undefined)[] = [undefined, ...Array.from({ length: POTION_MAX + 1 }, (_, i) => i)];
  let cases = 0, wrong = 0;
  for (const ratio of ratios) for (const tonic of counts) for (const potion of counts) {
    // 재료처럼 물약이 아닌 것이 섞여 있어도 고르지 않는다
    const items: Record<string, number> = { iron: 5, hide: 1 };
    if (tonic !== undefined) items.tonic = tonic;
    if (potion !== undefined) items.potion = potion;
    cases++;
    if (pickPotion(ratio, items) !== oldPick(ratio, items)) wrong++;
  }
  check(wrong === 0 && POTIONS.join(',') === 'tonic,potion', `자동으로 마실 물약이 예전 규칙과 모든 경우에 같다 (체력 비율 ${ratios.length}가지 × 보유 ${counts.length * counts.length}가지 = ${cases}가지)`);
  let orderWrong = 0;
  for (let hurt = -5; hurt <= 400; hurt += 0.5) if (potionOrder(hurt).join(',') !== oldOrder(hurt).join(',')) orderWrong++;
  check(orderWrong === 0 && potionOrder(Infinity).join(',') === oldOrder(Infinity).join(','), '손으로 마실 때 살펴보는 순서도 예전과 같다 (많이 다쳤으면 진한 것부터, 아니면 약한 것부터)');

  // 불씨를 주지 않는 몬스터: sparks 칸이 없는 정의도 잡을 수 있고, 불씨는 0이다
  const g = new Game({ plugins: [] });
  const p = g.players.spawn('계약검사', false);
  const m = g.monsters.spawn('slime', 0, 20);
  const { sparks: _sparks, ...bare } = MONSTERS.slime;
  m.def = bare;
  g.fire('monsterKilled', m, [p]);
  check(p.sparks === 0 && p.exp === MONSTERS.slime.exp && p.gold >= MONSTERS.slime.gold[0], '불씨 칸이 없는 몬스터를 잡으면 경험치와 골드만 받는다');

  // 봇이 돌아다니는 범위: 맵 정의의 들판에서 읽어도, 숫자로 적혀 있던 예전 식과 같은 자리를 고른다
  for (const e of [...g.ents.values()]) if (e.kind === 'm') g.remove(e.id);
  const bot = g.players.spawn('봇', true);
  const seq: number[] = [], went: [number, number][] = [];
  const real = Math.random, rnd = rng(5);
  const goTo = g.movement.goTo.bind(g.movement);
  g.movement.goTo = (e, x, z) => { if (e === bot) went.push([x, z]); return goTo(e, x, z); };
  let same = 0, picks = 0;
  try {
    Math.random = () => { const v = rnd(); seq.push(v); return v; };
    for (let i = 0; i < 300; i++) {
      bot.moving = false; bot.targetId = 0; bot.wait = 0; went.length = 0; seq.length = 0;
      g.bots.think(bot, 0.05);
      if (went.length !== 1 || seq.length !== 3) continue; // 난수는 쉬는 시간, x, z의 순서로 세 번 쓴다
      picks++;
      if (went[0][0] === MIN_X + 12 + seq[1] * (MAX_X - MIN_X - 24) && went[0][1] === (seq[2] - 0.5) * 84) same++;
    }
  } finally { Math.random = real; g.movement.goTo = goTo; }
  check(picks === 300 && same === 300, `봇이 고르는 자리가 예전 식과 같다 (${same}/${picks})`);
}

// ---------- 서버 코드에 박혀 있던 숫자를 내용 정의로 옮긴 것 ----------
// 값과 식을 옮기기만 했다: 예전에 서버 코드에 적혀 있던 숫자와 식(아래에 그대로 적어 둔다)으로 셈한 것과 지금의 결과가 같아야 한다.
// 수치를 일부러 바꿀 때는 여기의 옛 값도 함께 고친다.
{
  check(LEVEL.firstNeed === 60 && LEVEL.growth === 1.35 && COMBAT.critChance === 0.15 && COMBAT.critMult === 1.8 && COMBAT.regenAfterS === 5 && COMBAT.regenPerS === 4
    && GLOW_BRIGHT_REGEN === 2 && GLOW_BRIGHT_SPEED === 1.1 && speedFor(2) === PLAYER_SPEED * 1.1 && speedFor(1) === PLAYER_SPEED && FULL_TOWER_OFFER === 5
    && GEAR.guardCap === 60 && GEAR.optMin === 0.8 && GEAR.optSpan === 0.4 && GEAR.optPerLevel === 0.15 && GEAR.sellBase === 5 && GEAR.sellPerTier === 10
    && POWER.perLevel === 20 && POWER.perTier === 15 && POWER.perSkillLevel === 10 && AWAY.roam === 60 && AWAY.maxS === 8 * 3600
    && MONSTER_AI.loseRange === 26 && MONSTER_AI.homeSpeed === 1.5 && MONSTER_AI.wanderSpeed === 1.3 && GUILD.noticeGapS === 5 && GUILD.chatGapS === 0.7,
    '옮긴 수치가 서버 코드에 적혀 있던 값 그대로다 (레벨, 치명타, 자연 회복, 등탑 혜택, 장비, 전투력, 자리 비움, 몬스터의 움직임, 길드)');

  // 레벨: 서버는 레벨이 오를 때마다 필요 경험치에 1.35를 곱해 반올림한다. 그 수열을 정의의 함수가 그대로 낸다 (닫힌 식은 어긋난다)
  const g = new Game({ plugins: [] });
  const p = g.players.spawn('수열검사', false);
  let old = 60, closedOff = 0;
  const wrong: number[] = [];
  for (let lv = 1; lv <= 60; lv++) {
    if (p.lv !== lv || p.need !== old || needFor(lv) !== old) wrong.push(lv);
    if (Math.round(60 * 1.35 ** (lv - 1)) !== old) closedOff++;
    g.players.grant(p, p.need, 0);
    old = Math.round(old * 1.35);
    if (nextNeed(needFor(lv)) !== old) wrong.push(lv);
  }
  check(wrong.length === 0, `레벨 1부터 60까지의 필요 경험치가 서버가 실제로 셈하는 수열과 같다${wrong.length ? `: Lv ${wrong.join(', ')}` : ` (Lv 60: ${needFor(60)})`}`);
  check(closedOff > 0, `닫힌 식(60 × 1.35^(n−1))은 반올림이 쌓여 이 수열과 어긋난다 (${closedOff}곳): 그래서 단계마다 되풀이한다`);

  // 장비 굴림: 예전 식(서버의 roll에 숫자로 적혀 있던 것)과 지금의 굴림이 같은 난수열에서 같은 장비를 낸다. 난수를 쓰는 순서와 횟수도 같다
  const oldRoll = (rnd: () => number, lv: number, rar?: number, slot?: GearSlot): Gear => {
    if (rar === undefined) {
      let r = rnd() * RARITIES.reduce((s, x) => s + x.weight, 0);
      rar = RARITIES.findIndex((x) => (r -= x.weight) < 0);
      if (rar < 0) rar = 0;
    }
    const def = RARITIES[rar], pool = [...STAT_IDS], opts: [Stat, number][] = [];
    for (let i = 0; i < def.opts && pool.length; i++) {
      const stat = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      opts.push([stat, Math.max(1, Math.round(STATS[stat].base * def.mult * (0.8 + rnd() * 0.4) * (1 + (lv - 1) * 0.15)))]);
    }
    slot ??= GEAR_SLOTS[Math.floor(rnd() * GEAR_SLOTS.length)];
    const base = slot === 'weapon' ? GEAR.weaponFor(lv) : slot === 'armor' ? GEAR.armorFor(lv) : undefined;
    return { uid: 0, slot, base, rar, lv, plus: 0, opts };
  };
  const a = rng(20261124), b = rng(20261124);
  g.gear.random = b;
  let rolls = 0, differ = 0, sellDiffer = 0;
  for (let i = 0; i < 1200; i++) {
    const lv = 1 + (i % 6), rar = i % 3 === 0 ? undefined : (i >> 2) % RARITIES.length, slot = i % 5 === 0 ? GEAR_SLOTS[i % GEAR_SLOTS.length] : undefined;
    const want = oldRoll(a, lv, rar, slot), got = g.gear.roll(lv, rar, slot);
    rolls++;
    if (JSON.stringify(want) !== JSON.stringify(got)) differ++;
    got.plus = i % 4; // 파는 값은 강화 단계도 본다
    if (sellPrice(got) !== 5 + gearScore(got) + baseTier(got) * 10) sellDiffer++;
  }
  check(differ === 0 && a() === b(), `장비 굴림이 예전 식과 같은 장비를 낸다 (같은 난수열로 ${rolls}점, 난수를 쓴 횟수도 같다)`);
  check(sellDiffer === 0, '파는 값이 예전 식(5 + 값어치 + 바탕의 등급 × 10)과 같다');

  // 전투력, 보스 체력, 습격, 던전 완료 장비의 등급, 길드 레벨: 서버와 도감이 함께 쓰는 함수가 예전에 서버에 적혀 있던 식과 같다
  const ring: Gear = { uid: 1, slot: 'ring', rar: 2, lv: 4, plus: 3, opts: [['dmg', 7], ['hp', 31]] };
  let same = powerOf(23, 5, [1, 4, 2], [ring]) === (0 + 3 + 1) * 10 + 23 * 20 + 5 * 15 + gearScore(ring) && powerOf(1, 0, [], []) === 20;
  for (let n = 0; n <= 14; n++) {
    same &&= bossHp(1600, n) === Math.round(1600 * (1 + BOSS.hpPerPlayer * Math.max(0, Math.min(BOSS.maxScale, n) - 1)));
    same &&= raidFoes(n) === Math.min(RAID.max, RAID.base + RAID.perPlayer * n) && raidFoes(n, { base: 2, perPlayer: 5, max: 30 }) === Math.min(30, 2 + 5 * n);
    same &&= raidTowerHp(n * 7) === RAID.towerHpBase + n * 7 * RAID.towerHpPerGlow;
    same &&= guildLevel(n * 1500) === Math.min(GUILD.maxLevel, 1 + Math.floor((n * 1500) / GUILD.expPerGuildLevel));
  }
  for (let min = 0; min < RARITIES.length; min++) for (let r = 0; r < RARITIES.length; r++) same &&= clearRar({ dropRar: min }, r) === Math.max(min, r);
  check(same, '전투력, 보스 체력, 습격 적의 수와 등탑 내구, 던전 완료 장비의 등급, 길드 레벨의 식이 예전과 같다');
}

// ---------- 저장 등록 (docs/framework-plan.md의 단계 3): 틀의 몫 ----------
// 이 게임의 칸(퀘스트·기여·기여 단계·휴식)이 옛 형식과 새 형식에서 견본대로 읽히고 쓰이는지는 games/deungbul/test/framework.test.ts가 본다.
{
  const base = fixture<{ note: string; save: PlayerSave }[]>('players')[0].save, HOURS5 = 5 * 3600000;
  // 틀만의 게임에는 이 칸들이 없다: 저장에도, 엔티티에도, 규칙에도. 옛 칸을 읽는 길(Saver.legacy)은 틀의 것이라 플러그인이 그대로 쓴다
  {
    const bare = new Game({ plugins: [], now: () => noonOf(null) });
    const p = bare.players.spawn('맨저장', false, { ...structuredClone(base), seen: noonOf(null) - HOURS5 }, 'fx-bare');
    const out = bare.players.export(p) as unknown as Record<string, unknown>, ext = out.ext as Record<string, unknown>;
    check(['quest', 'contrib', 'tier', 'rested'].every((k) => !(k in out)) && ['quest', 'tower', 'keepers', 'rest'].every((k) => !(k in ext)) && ['qc', 'contrib', 'tier', 'rested', 'questDirty'].every((k) => !(k in p))
      && bare.rules.touched === undefined && bare.killBonus.length === 0 && !bare.notices.some((n) => n.k === 'rested'),
      '틀만의 게임은 퀘스트·기여·휴식의 칸을 읽지도 쓰지도 않는다 (저장, 엔티티, touched 규칙, 처치 덤 모두 없다)');
    const calls: string[] = [];
    const custom = new Game({ plugins: [(g) => { g.saves.push({ name: 'logs', save: () => 3, load: (_p, raw) => { calls.push(`load ${String(raw)}`); }, legacy: (whole) => whole.gold }); }] });
    custom.players.spawn('옛칸', false, { ...structuredClone(base), gold: 41 }, 'fx-legacy-a');
    custom.players.spawn('새칸', false, { ...structuredClone(base), gold: 41, ext: { logs: 9 } }, 'fx-legacy-b');
    const made = custom.players.export(custom.players.spawn('쓰기', false, null, 'fx-legacy-c'));
    check(calls.join() === 'load 41,load 9' && made.gold === 0 && made.ext?.logs === 3, `Saver.legacy: 자기 칸이 없으면 옛 형식에서 찾고, 있으면 자기 칸을 읽는다. 쓸 때는 자기 칸(ext)에만 적고 옛 칸은 건드리지 않는다 (${calls.join()})`);
  }
}

// 이 게임(등불지기)의 월드 저장을 틀만의 게임이 읽어도 죽지 않는다: 모르는 칸(등탑)은 건너뛴다 (틀만의 게임 자체는 engine/test/fx/bare.test.ts)
{
  const bare = new Game({ plugins: [], now: () => noonOf(null) });
  let threw = '';
  try { for (const { world: w } of fixture<{ world: WorldSave }[]>('worlds')) bare.importWorld(structuredClone(w)); } catch (err) { threw = String(err); }
  check(threw === '' && !('tower' in bare.exportWorld()), `등탑이 든 월드 저장과 옛 형식의 월드 저장을 틀만의 게임이 읽어도, 모르는 칸은 건너뛴다${threw ? ` (${threw})` : ''}`);
}
