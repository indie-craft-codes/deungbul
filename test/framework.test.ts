// 틀과 게임을 가르는 작업의 안전망과 경계 (docs/framework-plan.md의 단계 0, 1, 2).
// 구조를 고치다가 맵의 배치가 달라지거나 옛 저장이 다르게 읽히면 여기서 잡힌다.
//   - 맵 지문: buildWorld()가 놓는 장애물·나무·바위와 길찾기 격자가 그대로인가
//   - 저장 왕복: 견본(test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가
//   - 프로토콜 번호: 서버가 welcome에 번호를 싣는가
//   - 틀만의 게임: 규칙 플러그인 없이(plugins: []) 만든 게임과 서버가 도는가
//   - 의존 방향: 틀의 서버 파일과 공용 파일이 이 게임의 규칙과 선언을 import하지 않는가
//   - 확장 지점: 게임이 선언으로 더한 칸(사건, 공유 상태, 명령)이 틀만의 게임에는 실행 중에도 없는가
import { createHash } from 'node:crypto';
import { AUTO, AWAY, POTIONS, pickPotion, potionOrder } from '../shared/auto';
import { BOSS, COMBAT, FORGES, FULL_TOWER_OFFER, GEAR, GEAR_SLOTS, GLOW_BRIGHT_REGEN, GLOW_BRIGHT_SPEED, GUILD, ITEMS, LEVEL, MONSTERS, MONSTER_AI, POTION_MAX, POWER, RAID, RARITIES, RESIDENTS, SMITHY, STATS, STAT_IDS, baseTier, bossHp, clearRar, gearScore, guildLevel, needFor, nextNeed, powerOf, raidFoes, raidTowerHp, sellPrice, speedFor, type Gear, type GearSlot, type ItemId, type Stat } from '../shared/defs';
import { AREAS, EDGE, MAP, MAX_X, MAX_Z, MIN_X, MIN_Z, PILLARS, POND, PORTALS, TOWERS, rng } from '../shared/world';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { CHANNEL, DUNGEONS, SHOP, SPAWN } from '../shared/defs';
import { NavGrid } from '../shared/nav';
import { PROTOCOL, type ServerMsg } from '../shared/protocol';
import { PLAYER_SPEED, TOWER, buildWorld } from '../shared/world';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { channelOf, isField } from '../server/game/layers';
import { startServer } from '../server/net/server';
import { MemoryStore, type PlayerSave, type WorldSave } from '../server/store';
import { check, sleep } from './harness';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
const hash = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 16);
/** 두 값이 다른 자리의 목록 (칸의 순서는 따지지 않는다). 같으면 빈 목록 */
function diff(a: unknown, b: unknown, at = ''): string[] {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return [`${at || '(전체)'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
  return [...new Set([...Object.keys(A), ...Object.keys(B)])].flatMap((k) => diff(A[k], B[k], at ? `${at}.${k}` : k));
}
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
// 계약의 모양 자체(빠진 이름, 다른 타입)는 shared/contract.ts가 컴파일할 때 검사한다.
{
  // 맵 정의: 손으로 놓은 장애물은 예전에 buildWorld가 이름으로 읽던 순서(연못, 등탑, 집, 던전의 기둥) 그대로다
  const w = buildWorld();
  const tags = MAP.obstacles.map((o) => o.tag).join(',');
  check(tags === ['pond', ...TOWERS.map(() => 'tower'), 'house', 'house', 'house', 'house', ...PILLARS.map(() => 'pillar')].join(','), `맵 정의의 장애물이 연못, 등탑, 집, 기둥의 순서다 (${MAP.obstacles.length}개)`);
  check(MAP.obstacles.every((o, i) => w.obstacles[i].x === o.x && w.obstacles[i].z === o.z && w.obstacles[i].r === o.r) && w.obstacles[0].x === POND.x && w.obstacles[0].r === POND.r, '월드의 장애물 목록은 맵 정의의 장애물로 시작한다');
  const field = MAP.areas[0];
  check(AREAS === MAP.areas && EDGE === MAP.edge && PORTALS === MAP.portals && field.x0 === MIN_X && field.x1 === MAX_X && field.z0 === MIN_Z && field.z1 === MAX_Z && MAP.spawn.x === SPAWN.x && MAP.spawn.z === SPAWN.z,
    '예전 이름(AREAS, EDGE, PORTALS, SPAWN)은 맵 정의에서 꺼낸 값이고, 0번 지역이 들판이다');

  // 대장간: 주민에 묶인 한 곳이 아니라 목록이다. 지금은 대장장이 자리 하나이고 그의 id가 잠금 열쇠다
  const smith = RESIDENTS[0];
  check(FORGES.length === 1 && FORGES[0].x === smith.x && FORGES[0].z === smith.z && FORGES[0].needs === smith.id && SMITHY.x === smith.x && SMITHY.z === smith.z, '대장간 목록에는 대장장이의 자리 하나가 있고, 그가 돌아와야 열린다');
  // 잠금 열쇠는 뜻 없는 문자열이지만, 이 게임의 정의에 적힌 열쇠는 모두 실제 주민이다
  const keys = [...(Object.values(ITEMS) as { needs?: string }[]).map((d) => d.needs), ...FORGES.map((f) => f.needs)].filter((k): k is string => !!k);
  check(keys.length === 4 && keys.every((k) => RESIDENTS.some((r) => r.id === k)), `잠금 열쇠가 모두 주민의 id다 (${[...new Set(keys)].join(', ')})`);

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

// ---------- 캐릭터 저장의 왕복 ----------
// 견본을 읽어 캐릭터를 만들고 곧바로 다시 저장한다. 견본에 있던 칸은 값이 그대로여야 한다.
// 비교에서 빼거나 다듬어 비교하는 칸 (지금 코드가 원래 그렇게 읽는 것):
//   seen           저장한 시각이다. 떠나 있던 시간이 0이 되도록 시험이 '지금'으로 바꿔 넣는다 (방치 보상과 휴식 보너스가 붙지 않게)
//   ext.vitals     나갈 때의 몸 상태(체력 비율, 쿨다운, 저장 시각)라 접속할 때마다 새로 적힌다
//   items          0개짜리 줄은 읽을 때 버린다 ({ potion: 0 } → {})
//   ext.build      비어 있던 능력치 칸이 0으로 채워진다 ({} → { pow: 0, … }). 0인 칸은 없는 것으로 보고 비교한다
//   ext.gear       목록의 순서(낀 것이 앞으로 온다)는 따지지 않는다. 낀 무기가 없던 저장은 든 무기(weapon)를 낱개 장비로 새로 받으므로,
//                  '견본의 장비가 모두 그대로 있고 끼고 있던 것을 그대로 끼고 있다'까지만 본다
// 견본에 없던 칸(옛 저장의 ext, armor, at 등)은 새로 생기는 것이라 따지지 않는다. 대신 한 번 더 왕복해서 그대로인지 본다.
{
  const samples = fixture<{ note: string; save: PlayerSave }[]>('players');
  type Bag = Record<string, unknown>;
  type GearSave = { list: { uid: number }[]; worn: Bag; seq: number };
  const nonZero = (o: unknown): Bag => Object.fromEntries(Object.entries((o ?? {}) as Bag).filter(([, v]) => v !== 0));
  /** 비교할 모양으로 다듬는다 (위의 목록) */
  const norm = (s: PlayerSave): Bag => {
    const { seen: _seen, ext, ...rest } = structuredClone(s);
    const { vitals: _vitals, ...kept } = (ext ?? {}) as Bag;
    if (kept.build) { const b = kept.build as { stats?: unknown; skillLv?: unknown }; kept.build = { stats: nonZero(b.stats), skillLv: b.skillLv ?? {} }; }
    if (kept.gear) { const gear = kept.gear as GearSave; gear.list.sort((x, y) => x.uid - y.uid); }
    return { ...rest, ...(rest.items ? { items: nonZero(rest.items) } : {}), ext: kept };
  };
  /** 견본을 읽어 캐릭터를 만들고 다시 저장한 값 */
  const roundTrip = (save: PlayerSave, now: number, pid: string): PlayerSave => {
    const g = new Game({ now: () => now });
    const p = g.players.spawn(save.name, false, { ...structuredClone(save), seen: now }, pid);
    return structuredClone(g.players.export(p));
  };
  const bad: string[] = [];
  samples.forEach(({ save }, i) => {
    const now = noonOf(((save.ext ?? {}).daily as { last?: unknown } | undefined)?.last);
    const out = roundTrip(save, now, `fx-${i}`);
    const was = norm(save), is = norm(out), wasExt = was.ext as Bag, isExt = is.ext as Bag;
    const d: string[] = [];
    for (const k of Object.keys(was)) if (k !== 'ext') d.push(...diff(was[k], is[k], k));
    for (const k of Object.keys(wasExt)) {
      if (k !== 'gear') { d.push(...diff(wasExt[k], isExt[k], `ext.${k}`)); continue; }
      const a = wasExt.gear as GearSave, b = isExt.gear as GearSave;
      for (const it of a.list) d.push(...diff(it, b.list.find((x) => x.uid === it.uid), `ext.gear.list[uid ${it.uid}]`));
      for (const slot of Object.keys(a.worn)) d.push(...diff(a.worn[slot], b.worn[slot], `ext.gear.worn.${slot}`));
      if (b.seq < a.seq) d.push(`ext.gear.seq: ${a.seq} > ${b.seq}`);
    }
    // 한 번 더: 방금 저장한 값을 읽어 다시 저장하면 (시각과 몸 상태 말고는) 똑같아야 한다
    d.push(...diff(is, norm(roundTrip(out, now, `fx-${i}`))).map((x) => `다시 읽기 ${x}`));
    bad.push(...d.map((x) => `견본 ${i + 1} (${save.name}) ${x}`));
  });
  for (const line of bad) console.log('  ' + line);
  check(bad.length === 0, `캐릭터 저장 견본 ${samples.length}개를 읽어 다시 저장하면 값이 그대로다`);

  // 옛 칸이 캐릭터의 상태로 옳게 읽혔는지도 본다 (저장 칸을 옮기는 단계에서 읽는 길이 끊기지 않게)
  const old = samples.find((s) => s.save.ext === undefined && s.save.quest && s.save.quest[0] > 0 && (s.save.tier ?? 0) > 0)!.save;
  const g = new Game({ now: () => noonOf(null) });
  const p = g.players.spawn(old.name, false, { ...old, seen: noonOf(null) }, 'fx-old');
  check(p.qc === old.quest![0] && p.qs === old.quest![1] && p.qn === old.quest![2] && p.sparks === old.sparks && p.contrib === old.contrib && p.tier === old.tier && p.rested === old.rested && p.gold === old.gold && p.cls === old.cls,
    'ext가 없던 때의 저장에서 퀘스트·불씨·기여·기여 단계·휴식·골드·직업이 그대로 읽힌다');
  check(p.gear.some((x) => x.base === old.weapon && p.worn.weapon === x.uid) && p.mail.some((m) => m.k === 'attend'), 'ext가 없던 때의 캐릭터도 낀 무기를 낱개 장비로 받고, 그날의 출석 우편을 받는다');
}

// ---------- 월드 저장의 왕복 ----------
// 등탑지기 명단은 날이 바뀌면 비우므로, 시계를 저장된 날에 맞춘다.
{
  const samples = fixture<{ note: string; world: WorldSave; expect?: WorldSave }[]>('worlds');
  const bad: string[] = [];
  samples.forEach(({ world, expect }, i) => {
    const now = noonOf((world.keepers as { day?: unknown } | undefined)?.day);
    const g = new Game({ now: () => now });
    g.importWorld(structuredClone(world));
    const out = structuredClone(g.exportWorld());
    // 옛 형식은 읽으면 지금 형식으로 바뀐다: 견본에 적어 둔 '읽은 뒤의 모습'과 비교한다
    bad.push(...diff(expect ?? world, out).map((x) => `월드 견본 ${i + 1} ${x}`));
    const again = new Game({ now: () => now });
    again.importWorld(structuredClone(out));
    const out2 = structuredClone(again.exportWorld());
    // 등탑지기 명단의 날짜가 비어 있었으면(명단이 없던 옛 저장) 읽을 때 오늘로 채워진다: 그 칸은 따지지 않는다
    const k1 = out.keepers as { day: string }, k2 = out2.keepers as { day: string };
    if (k1.day === '') k2.day = '';
    bad.push(...diff(out, out2).map((x) => `월드 견본 ${i + 1} 다시 읽기 ${x}`));
  });
  for (const line of bad) console.log('  ' + line);
  check(bad.length === 0, `월드 저장 견본 ${samples.length}개(옛 형식 { glow, residents } 포함)를 읽어 다시 저장하면 값이 그대로다`);
}

// ---------- 프로토콜 번호 ----------
{
  const s = await startServer(0, { store: new MemoryStore() });
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const welcome = await new Promise<{ v?: unknown }>((done, fail) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '번호확인' })));
    ws.on('message', (data) => { const m = JSON.parse(data.toString()) as { t: string; v?: unknown }; if (m.t === 'welcome') done(m); });
    ws.on('error', fail);
  });
  check(Number.isInteger(PROTOCOL) && welcome.v === PROTOCOL, `접속하면 서버가 프로토콜 번호를 알려 준다 (v=${String(welcome.v)})`);
  ws.close();
  await s.close();
}

// ---------- 틀만의 게임 (docs/framework-plan.md의 단계 1) ----------
// 규칙 플러그인 없이(plugins: []) 만든 게임: 등탑·습격·등탑지기·퀘스트가 없어도 바탕 기능이 돈다.
// 틀의 코드가 g.tower 같은 게임의 시스템을 건드리면 그 자리에서 예외가 나게 해 둔다.
{
  const now = noonOf(null);
  const g = new Game({ plugins: [], now: () => now });
  const bare = g as unknown as Record<string, unknown>;
  const GAME_ONLY = ['tower', 'raid', 'quests', 'keepers'];
  check(GAME_ONLY.every((k) => bare[k] === undefined), 'plugins: []로 만들면 등탑·습격·퀘스트·등탑지기 시스템이 없다');
  const touched: string[] = [];
  for (const k of GAME_ONLY) Object.defineProperty(g, k, { get() { touched.push(k); throw new Error(`틀이 게임의 시스템 g.${k}를 건드렸다`); } });
  check(Object.keys(g.state()).length === 0 && !('tower' in g.exportWorld()) && !('keepers' in g.exportWorld()), `공유 상태에 등탑·습격 칸이 없고, 월드 저장에도 등탑 칸이 없다 (월드 저장: ${Object.keys(g.exportWorld()).join(', ')})`);

  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const said = (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Ent, m: Record<string, unknown>) => { g.notices = []; g.out = []; g.command(p, m); };
  const hero = (name: string, pid: string) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'warrior'); p.lv = 12; p.gold = 5000; g.players.refresh(p); p.hp = p.maxHp; return p; };
  let threw = '';
  try {
    const p = hero('틀사람', 'bare-a'), mate = hero('틀동료', 'bare-b');
    g.players.spawn('Bot1', true);
    check(p.mail.some((m) => m.k === 'attend') && channelOf(p.layer) === 1, '접속하면 출석 우편을 받고 1채널에 선다');
    check(g.rules.siege === null && g.rules.unlocked('bram') && g.rules.speed(p) === PLAYER_SPEED && g.rules.canChangeClass(p), '규칙의 기본값: 몰려갈 곳이 없고, 잠긴 것이 없고, 걸음은 기본 속도이고, 직업은 어디서나 바꾼다');

    // 이동
    // 처음 서는 자리는 무작위라 찍은 곳이 건물에 걸릴 수 있다: 길이 트인 정해진 자리에서 잰다
    p.x = 0; p.z = 8;
    const from = { x: p.x, z: p.z };
    cmd(p, { t: 'move', x: p.x + 6, z: p.z + 4 });
    run(3);
    check(Math.hypot(p.x - from.x, p.z - from.z) > 5 && !p.moving, '이동: 찍은 곳까지 걸어간다');

    // 전투와 처치, 장비 줍기
    g.gear.random = () => 0; // 반드시 떨어뜨린다
    const m = [...g.ents.values()].find((e) => e.type === 'slime' && !e.dead && e.layer === p.layer)!;
    m.wait = 99; p.x = m.x + 1; p.z = m.z;
    const exp0 = p.exp + p.lv * 1e6, bag0 = p.gear.length;
    cmd(p, { t: 'attack', id: m.id });
    for (let i = 0; i < 400 && !m.dead; i++) g.tick(0.05);
    check(m.dead && p.exp + p.lv * 1e6 > exp0 && g.notices.some((n) => n.id === p.id && n.k === 'kill'), '전투: 몬스터를 쓰러뜨리면 경험치를 받는다');
    check(p.gear.length === bag0 + 1 && p.daily.prog.kill30 === 1, '처치하면 장비가 떨어져 가방에 들어오고, 일일 임무가 세어진다');
    g.gear.random = Math.random;

    // 상점: 잠금 규칙이 없으므로 모든 물건이 열려 있다
    p.x = SHOP.x + 1; p.z = SHOP.z;
    cmd(p, { t: 'buy', id: 'potion' }); cmd(p, { t: 'buy', id: 'sword3' });
    check(p.items.potion === 1 && p.weapon === 'sword3', '상점: 물약과 (이 게임에서는 주민이 돌아와야 풀리는) 등불검을 산다');

    // 우편
    const gold0 = p.gold;
    cmd(p, { t: 'mailClaim', id: 0 });
    check(p.mail.length === 0 && p.gold > gold0, '우편: 받은 우편을 열어 보상을 받는다');

    // 길드
    cmd(p, { t: 'guild', a: 'create', name: '틀모임' });
    check(g.guild.count === 1 && p.guild === '틀모임', '길드를 만든다');
    g.players.rename(p, '새이름');
    check(p.name === '새이름', '이름을 바꾼다 (등탑지기 명단이 없어도 된다)');

    // 거래소
    const ring = g.gear.roll(3, 2, 'ring');
    g.gear.put(p, ring);
    cmd(p, { t: 'market', a: 'post', uid: ring.uid, price: 300 });
    check(g.market.count === 1 && said(p).includes('marketPosted'), '거래소에 장비를 올린다');

    // 채널
    run(CHANNEL.switchCdS + CHANNEL.calmS + 1);
    cmd(p, { t: 'channel', n: 2 });
    const told = g.out.filter((o) => o.id === p.id && o.msg.t === 'channels').pop()?.msg as Extract<ServerMsg, { t: 'channels' }> | undefined;
    check(channelOf(p.layer) === 2 && told?.me === 2 && told.foes === undefined, '채널을 바꾼다 (채널 소식에 습격의 적 칸은 없다)');

    // 던전
    const def = DUNGEONS.crypt;
    p.x = def.portal.x + 1; p.z = def.portal.z;
    cmd(p, { t: 'dungeon', id: 'crypt' });
    check(!isField(p.layer) && said(p).includes('dungeonEnter') && g.dungeon.count === 1, '던전에 들어간다');
    // 던전에서 쓰러지면 던전의 입구에서, 들판에서 쓰러지면 기본 자리(SPAWN)에서 일어난다
    check(g.rules.respawn(p).x === def.entry.x && g.rules.respawn(mate).x === SPAWN.x && g.rules.respawn(mate).id === '', '일어나는 자리: 던전 안은 입구, 들판은 기본 자리');

    // 수백 틱을 더 돈다 (봇, 몬스터, 주기 처리가 모두 도는 동안 예외가 없어야 한다)
    g.daily.add(mate, 'offer', 10); // 게임의 임무 종류를 틀이 몰라도 세기만 하면 된다
    run(30);
    // 저장과 읽기: 캐릭터와 월드
    const save = structuredClone(g.players.export(p)), world = structuredClone(g.exportWorld());
    const g2 = new Game({ plugins: [], now: () => now });
    g2.importWorld(world);
    const again = g2.players.spawn(save.name, false, save, 'bare-a');
    check(again.lv === p.lv && again.gear.length === p.gear.length && again.guild === '틀모임' && g2.market.count === 1, '틀만의 게임도 캐릭터와 월드를 저장하고 다시 읽는다');
    // 이 게임(등불지기)의 월드 저장을 틀만의 게임이 읽어도 죽지 않는다: 모르는 칸은 건너뛴다
    for (const { world: w } of fixture<{ world: WorldSave }[]>('worlds')) g2.importWorld(structuredClone(w));
    check(!('tower' in g2.exportWorld()), '등탑이 든 월드 저장과 옛 형식의 월드 저장을 읽어도, 모르는 칸은 건너뛴다');
  } catch (err) { threw = String(err); }
  check(threw === '' && touched.length === 0, `틀만의 게임이 예외 없이 돌고, 틀의 코드가 게임의 시스템을 건드리지 않는다${threw ? ` (${threw})` : ''}`);
}

// 틀만의 서버: 접속, 공유 상태, 스냅샷, 끊고 저장하기까지 (통신 계층도 게임의 시스템 없이 돈다)
{
  const store = new MemoryStore();
  const s = await startServer(0, { store, game: { plugins: [] } });
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const got: ServerMsg[] = [];
  await new Promise<void>((done, fail) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '틀접속', token: 'bare-token-0001' })));
    ws.on('message', (data) => { got.push(JSON.parse(data.toString()) as ServerMsg); if (got.some((m) => m.t === 'snap') && got.some((m) => m.t === 'stat')) done(); });
    ws.on('error', fail);
  });
  const world = got.find((m) => m.t === 'world') as Extract<ServerMsg, { t: 'world' }> | undefined;
  check(got[0]?.t === 'welcome' && !!world && Object.keys(world.s).length === 0, '틀만의 서버에 접속하면 welcome, 빈 공유 상태, 스냅샷과 내 상태를 받는다');
  ws.send(JSON.stringify({ t: 'class', id: 'warrior' }));
  ws.send(JSON.stringify({ t: 'move', x: 5, z: 8 }));
  await sleep(400);
  ws.close();
  await s.close();
  const saved = store.loadWorld();
  check(!!saved && !('tower' in saved) && 'mailbox' in saved, '틀만의 서버가 닫히며 저장한 월드에 등탑 칸이 없다');
}

// ---------- 의존 방향 ----------
// 틀로 분류한 서버 파일은 이 게임의 규칙(등탑, 습격, 등탑지기, 퀘스트)과 그것을 까는 플러그인을 import하지 않는다.
// 게임 규칙(server/game)은 통신 계층(server/net)을 import하지 않는다. import 문을 읽어 검사한다 (타입만 가져오는 것도 센다).
// server/main.ts는 이 게임의 서버를 띄우는 진입점이라 검사하지 않는다 (플러그인을 고르는 자리다).
{
  const root = new URL('../', import.meta.url);
  const GAME_FILES = ['server/game/deungbul.ts', ...['tower', 'raid', 'keepers', 'quests'].map((n) => `server/game/systems/${n}.ts`)];
  /** 아직 지키지 못하는 것. 뒤의 단계가 줄여 간다 */
  const EXCEPTIONS = [
    // new Game()이 이 게임의 규칙을 기본으로 깐다 (기존 코드와 시험이 그렇게 쓴다). 시험을 틀과 게임으로 가를 때 기본값을 뒤집고 지운다
    'server/game/game.ts -> server/game/deungbul.ts',
  ];
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 그 파일이 import하는 저장소 안의 파일들 (상대 경로만 따라간다) */
  const importsOf = (file: string): string[] => {
    const src = fs.readFileSync(new URL(file, root), 'utf8');
    const specs = [...src.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]|\bdeclare\s+module\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
    return specs.filter((sp) => sp.startsWith('.')).map((sp) => new URL(sp, new URL(file, root)).href.slice(root.href.length)).map((p) => (p.endsWith('.ts') ? p : `${p}.ts`));
  };
  const engine = [...list('server/game/'), ...list('server/net/'), ...list('server/store/'), 'server/text.ts'].filter((f) => !GAME_FILES.includes(f));
  const found: string[] = [];
  for (const f of engine) for (const to of importsOf(f)) if (GAME_FILES.includes(to)) found.push(`${f} -> ${to}`);
  const extra = found.filter((x) => !EXCEPTIONS.includes(x)), stale = EXCEPTIONS.filter((x) => !found.includes(x));
  for (const x of extra) console.log('  ' + x);
  check(engine.length >= 30 && importsOf('server/game/deungbul.ts').filter((x) => GAME_FILES.includes(x)).length === 4 && importsOf('server/net/server.ts').includes('server/game/game.ts'), `import 문을 읽어 낸다 (틀의 서버 파일 ${engine.length}개)`);
  check(extra.length === 0, `틀의 서버 파일은 이 게임의 규칙 시스템과 플러그인을 import하지 않는다 (예외 ${EXCEPTIONS.length}건)`);
  check(stale.length === 0, `예외 목록에 이미 풀린 것이 남아 있지 않다${stale.length ? `: ${stale.join(', ')}` : ''}`);
  const toNet = list('server/game/').flatMap((f) => importsOf(f).filter((to) => to.startsWith('server/net/')).map((to) => `${f} -> ${to}`));
  for (const x of toNet) console.log('  ' + x);
  check(toNet.length === 0, '게임 규칙(server/game)은 통신 계층(server/net)을 import하지 않는다');

  // ---- 확장 지점과 게임의 선언 (단계 2) ----
  // 틀은 넓힐 자리(두 ext.ts)를 비워 두고, 게임은 자기 선언 파일에서 그 두 파일만 선언 병합으로 넓힌다.
  const EXT = ['shared/ext.ts', 'server/game/ext.ts'];
  /** 게임의 선언 파일: 공용(안내문, 메시지, 공유 상태)과 서버(시스템 칸, 사건) */
  const GAME_DECL = ['shared/deungbul.ts', 'server/game/deungbul.ts'];
  /** 이 게임에만 있는 공용 파일: 선언 파일과 등탑·습격·주민·퀘스트의 내용 */
  const GAME_SHARED = ['shared/deungbul.ts', ...['tower', 'raid', 'residents', 'quests'].map((n) => `shared/content/${n}.ts`)];
  /** 틀로 분류한 공용 파일. shared/defs.ts는 내용을 통째로 다시 내보내는 통로라 넣지 않았다 (내용을 별칭으로 갈아 끼우는 단계에서 정리한다) */
  const SHARED_ENGINE = ['ext', 'protocol', 'messages', 'sim', 'nav', 'world', 'auto'].map((n) => `shared/${n}.ts`);
  /** 아직 지키지 못하는 것 (지금은 없다) */
  const SHARED_EXCEPTIONS: string[] = [];
  const sharedFound = SHARED_ENGINE.flatMap((f) => importsOf(f).filter((to) => GAME_SHARED.includes(to)).map((to) => `${f} -> ${to}`));
  const sharedExtra = sharedFound.filter((x) => !SHARED_EXCEPTIONS.includes(x)), sharedStale = SHARED_EXCEPTIONS.filter((x) => !sharedFound.includes(x));
  for (const x of sharedExtra) console.log('  ' + x);
  check(SHARED_ENGINE.every((f) => fs.existsSync(new URL(f, root))) && importsOf('shared/protocol.ts').includes('shared/ext.ts') && importsOf('shared/deungbul.ts').includes('shared/content/raid.ts'), `공용 파일의 import 문을 읽어 낸다 (틀의 공용 파일 ${SHARED_ENGINE.length}개)`);
  check(sharedExtra.length === 0 && sharedStale.length === 0, `틀의 공용 파일은 이 게임의 선언과 등탑·습격·주민·퀘스트의 내용을 직접 import하지 않는다 (예외 ${SHARED_EXCEPTIONS.length}건)`);
  // 게임의 공용 선언 파일은 틀의 서버 파일도, 다른 공용 파일도 import하지 않는다 (tsconfig의 include로만 컴파일에 들어간다)
  const declUsers = [...engine, ...list('shared/')].filter((f) => f !== 'shared/deungbul.ts' && importsOf(f).includes('shared/deungbul.ts'));
  for (const x of declUsers) console.log('  ' + x + ' -> shared/deungbul.ts');
  check(declUsers.length === 0, '틀의 서버 파일과 공용 파일은 이 게임의 공용 선언 파일(shared/deungbul.ts)을 import하지 않는다');
  // (importsOf는 주석 속 쓰는 법의 declare module './ext'도 세므로 자기 자신은 뺀다)
  check(EXT.every((f) => importsOf(f).every((to) => to === f)), '확장 지점 파일(shared/ext.ts, server/game/ext.ts)은 아무것도 import하지 않는다');
  // 선언 병합은 그 파일이 컴파일 대상에 들어 있어야 효력이 있다: 게임의 선언 파일은 tsconfig.json의 include 아래에 있고,
  // 틀만 검사하는 설정(tsconfig.engine.json, npm run typecheck:engine)은 게임의 파일을 모두 뺀다
  const cfgOf = (name: string) => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8')) as { include?: string[]; exclude?: string[] };
  const included = cfgOf('tsconfig.json').include ?? [], left = cfgOf('tsconfig.engine.json').exclude ?? [];
  check(GAME_DECL.every((f) => included.some((d) => f.startsWith(`${d}/`))) && [...GAME_FILES, ...GAME_SHARED].every((f) => left.includes(f)),
    '게임의 선언 파일은 컴파일 대상(tsconfig.json의 include)에 들어 있고, 틀만 검사하는 설정은 게임의 파일을 뺀다');
  // 선언 병합(declare module)은 게임의 선언 파일에만 있고, 확장 지점만 가리킨다: 틀의 다른 타입을 직접 넓히지 않는다
  const merges = [...list('shared/'), ...list('server/'), ...list('client/src/')].flatMap((f) => [...fs.readFileSync(new URL(f, root), 'utf8').matchAll(/^\s*declare\s+module\s*['"]([^'"]+)['"]/gm)]
    .map((m) => ({ from: f, to: new URL(m[1], new URL(f, root)).href.slice(root.href.length) + '.ts' })));
  const badMerges = merges.filter((m) => !GAME_DECL.includes(m.from) || !EXT.includes(m.to));
  for (const m of badMerges) console.log(`  ${m.from} => ${m.to}`);
  check(GAME_DECL.every((f) => merges.some((m) => m.from === f)) && badMerges.length === 0, `선언 병합은 게임의 선언 파일에만 있고 확장 지점만 넓힌다 (${merges.map((m) => `${m.from} => ${m.to}`).join(', ')})`);
}

// ---------- 뒤집은 결합이 그대로 도는가 (이 게임의 규칙이 깔린 게임) ----------
// 일일 임무는 'offered' 사건을 듣지 않고 등탑이 직접 알린다. 이름 바꾸기는 등탑지기를 직접 부르지 않고 사건으로 알린다.
{
  const now = noonOf(null);
  const g = new Game({ now: () => now });
  g.tower.load({ glows: [40, 0], residents: [30, 60, 100] }); // 할멈까지 돌아와 등탑지기의 일이 열려 있다
  const p = g.players.spawn('바치는이', false, null, 'offer-key');
  g.classes.apply(p, 'warrior');
  p.x = TOWER.x + 1; p.z = TOWER.z + 2; p.sparks = 50;
  g.notices = [];
  g.command(p, { t: 'offer', to: 'tower', n: 4 });
  check(p.daily.prog.offer10 === 4 && !p.daily.got.includes('offer10'), '불씨를 바치면 일일 임무(불씨 10개 바치기)가 그만큼 세어진다');
  g.command(p, { t: 'offer', to: 'tower', n: 7 });
  const keys = g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  check(p.daily.prog.offer10 === 10 && p.daily.got.includes('offer10') && p.mail.some((m) => m.k === 'daily' && m.a[0] === 'offer10'), '10개를 채우면 임무 보상이 우편으로 온다 (넘친 것은 세지 않는다)');
  check(keys.join() === 'offered,offered,tierUp,mailNew', `안내문의 순서가 그대로다: 바침, 기여 단계 보상, 임무 우편 (${keys.join()})`);
  g.players.rename(p, '새이름');
  check(g.state().keepers.some((r) => r.name === '새이름' && r.n === 11), '이름을 바꾸면 등탑지기 명단의 내 줄도 따라 바뀐다');
  check(g.channels.busy?.() === false && g.channels.extraFoes?.() === undefined, '습격이 채널의 접점(바쁜 때, 남은 적)을 채워 두었다: 평소에는 바쁘지 않고 남은 적이 없다');
}

// ---------- 확장 지점: 선언으로 더한 것이 실행 중에도 게임 쪽에만 있는가 (docs/framework-plan.md의 단계 2) ----------
// 이 게임의 사건·공유 상태·명령·메시지의 타입 선언은 게임의 선언 파일(shared/deungbul.ts, server/game/deungbul.ts)로 옮겼다.
// 타입은 컴파일 대상 전체에 보이므로, 틀만의 게임에 그 칸이 실제로 없다는 것은 돌려서 확인한다.
{
  const hooksOf = (g: Game): string[] => Object.keys((g as unknown as { hooks: Record<string, unknown[]> }).hooks);
  const GAME_HOOKS = ['offered', 'residentReturned', 'raidWon'], GAME_STATE = ['tower', 'raid', 'keepers'];
  const bare = new Game({ plugins: [] }), full = new Game();
  check(hooksOf(bare).includes('monsterKilled') && GAME_HOOKS.every((k) => !hooksOf(bare).includes(k)) && GAME_HOOKS.every((k) => hooksOf(full).includes(k)),
    `틀만의 게임은 게임의 사건(바침, 주민 귀환, 습격 승리)을 듣는 곳이 없고, 등불지기에는 있다 (틀: ${hooksOf(bare).join(', ')})`);
  let threw = '';
  try { bare.fire('raidWon', []); bare.fire('residentReturned', 'bram'); } catch (err) { threw = String(err); }
  check(threw === '', '듣는 곳이 없는 사건을 알려도 아무 일도 없다');
  check(bare.shared.length === 0 && Object.keys(bare.state()).length === 0 && Object.keys(full.state()).join() === GAME_STATE.join(),
    `공유 상태의 칸은 게임이 등록한 것뿐이다: 틀만의 게임은 비어 있고 등불지기는 ${Object.keys(full.state()).join(', ')}`);
  check(!bare.commands.has('offer') && full.commands.has('offer') && bare.commands.has('move'), '게임이 더한 명령(바치기)은 틀만의 게임에 없다');
  check(bare.mods.sum('sparkBonus') === 0 && bare.mods.product('regen') === 1, '보정을 거는 시스템이 없는 수치는 기본값이다 (틀만의 게임: 불씨 덤 0, 회복 1배)');

  // 엔티티 칸의 처음 값: 플러그인이 entInit에 등록하면, 그 뒤에 만들어지는 엔티티와 그 전에 만들어진 것(첫 채널의 몬스터)이 모두 한 번씩 거친다
  const seen = new Map<number, number>();
  const marked = new Game({ plugins: [(g) => { g.entInit.push((e) => { seen.set(e.id, (seen.get(e.id) ?? 0) + 1); (e as unknown as { mark: string }).mark = e.kind; }); }] });
  const p = marked.players.spawn('칸사람', false, null, 'ext-key');
  const all = [...marked.ents.values()];
  check(all.length > 10 && all.every((e) => seen.get(e.id) === 1 && (e as unknown as { mark: string }).mark === e.kind) && all.includes(p),
    `entInit에 등록한 함수가 모든 엔티티를 한 번씩 거친다 (${all.length}개)`);
  check(bare.entInit.length === 0 && Object.keys(bare.players.spawn('맨사람', false, null, 'ext-bare')).every((k) => k !== 'mark'), '등록하지 않은 게임의 엔티티에는 그 칸이 없다');
}
