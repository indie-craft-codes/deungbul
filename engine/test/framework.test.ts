// 틀과 게임을 가르는 작업의 안전망과 경계 (docs/framework-plan.md의 단계 0, 1, 2).
// 구조를 고치다가 맵의 배치가 달라지거나 옛 저장이 다르게 읽히면 여기서 잡힌다.
//   - 맵 지문: buildWorld()가 놓는 장애물·나무·바위와 길찾기 격자가 그대로인가
//   - 저장 왕복: 견본(games/deungbul/test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가
//   - 프로토콜 번호: 서버가 welcome에 번호를 싣는가
//   - 틀만의 게임: 규칙 플러그인 없이(plugins: []) 만든 게임과 서버가 도는가
//   - 의존 방향: 틀의 서버 파일과 공용 파일이 이 게임의 규칙과 선언을 import하지 않는가
//   - 개인 상태: 틀만의 서버는 me 메시지를 보내지 않는가, 이 게임의 서버는 접속 직후에 전부, 그 뒤로는 바뀐 칸만 보내는가
//   - 확장 지점: 게임이 선언으로 더한 칸(사건, 공유 상태, 명령)이 틀만의 게임에는 실행 중에도 없는가
import { createHash } from 'node:crypto';
import { AUTO, AWAY, POTIONS, pickPotion, potionOrder } from '../shared/auto';
import { BOSS, COMBAT, FULL_TOWER_OFFER, GEAR, GEAR_SLOTS, GLOW_BRIGHT_REGEN, GLOW_BRIGHT_SPEED, GUILD, LEVEL, MONSTERS, MONSTER_AI, POTION_MAX, POWER, RAID, RARITIES, STATS, STAT_IDS, baseTier, bossHp, clearRar, gearScore, guildLevel, needFor, nextNeed, powerOf, raidFoes, raidTowerHp, sellPrice, speedFor, type Gear, type GearSlot, type ItemId, type Stat } from '@game/shared/defs';
import { AREAS, EDGE, MAP, MAX_X, MAX_Z, MIN_X, MIN_Z, PILLARS, POND, PORTALS, TOWERS, rng } from '@game/shared/world';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { CHANNEL, DUNGEONS, SHOP, SPAWN } from '@game/shared/defs';
import { NavGrid } from '../shared/nav';
import { PROTOCOL, type ServerMsg } from '../shared/protocol';
import { PLAYER_SPEED, buildWorld } from '../shared/world';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { channelOf, isField } from '../server/game/layers';
import { startServer } from '../server/net/server';
import { MemoryStore, type PlayerSave, type WorldSave } from '../server/store';
import { check, sleep, until } from './harness';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`../../games/deungbul/test/fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
/**
 * import 문에 적힌 경로를 저장소 뿌리 기준의 파일 경로로 바꾼다: 상대 경로와 별칭(@engine, @game: tsconfig.json의 paths)을 따라간다.
 * 그 밖의 것(node:, 패키지)은 null
 */
const ALIASES: [string, string][] = [['@engine/', 'engine/'], ['@game/', 'games/deungbul/']];
function resolveSpec(root: URL, file: string, spec: string): string | null {
  if (spec.startsWith('.')) return new URL(spec, new URL(file, root)).href.slice(root.href.length);
  for (const [alias, dir] of ALIASES) if (spec.startsWith(alias)) return dir + spec.slice(alias.length);
  return null;
}
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
    const custom = new Game({ plugins: [(g) => { g.saves.push({ name: 'logs', save: () => 3, load: (_p, raw) => { calls.push(`load ${String(raw)}`); }, legacy: (whole) => whole.gold, legacySave: () => ({ gold: 5 }) }); }] });
    custom.players.spawn('옛칸', false, { ...structuredClone(base), gold: 41 }, 'fx-legacy-a');
    custom.players.spawn('새칸', false, { ...structuredClone(base), gold: 41, ext: { logs: 9 } }, 'fx-legacy-b');
    const made = custom.players.export(custom.players.spawn('쓰기', false, null, 'fx-legacy-c'));
    check(calls.join() === 'load 41,load 9' && made.gold === 5 && made.ext?.logs === 3, `Saver.legacy: 자기 칸이 없으면 옛 형식에서 찾고, 있으면 자기 칸을 읽는다. legacySave는 옛 칸에 함께 적는다 (${calls.join()})`);
  }
}

// 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (engine/server/net/server.ts의 savePlayer). 틀의 칸(직업, 레벨, 경험치, 골드, 불씨)에 더해
// 게임이 g.rules.touched로 '진행이 있다'고 답한다 (이 게임에서는 퀘스트). 칸을 옮기기 전과 같은 캐릭터가 저장되고 같은 캐릭터가 저장되지 않는다.
// (게임의 진행만 있는 캐릭터가 저장되는지는 games/deungbul/test/framework.test.ts가 본다. 여기서는 틀만의 서버를 본다)
{
  const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');
  // 틀만의 서버: 게임의 규칙이 없으면 틀의 칸만 본다
  const bareStore = new MemoryStore();
  const b = await startServer(0, { store: bareStore, game: { plugins: [] } });
  const bareVisit = async (token: string, touch: (e: Ent) => void): Promise<PlayerSave | null> => {
    const ws = new WebSocket(`ws://127.0.0.1:${b.port}`);
    const id = await new Promise<number>((done, fail) => {
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', token })));
      ws.on('message', (data) => { const m = JSON.parse(data.toString()) as { t: string; id?: number }; if (m.t === 'welcome') done(m.id!); });
      ws.on('error', fail);
    });
    touch(b.game.ents.get(id)!);
    ws.close();
    await until(() => !b.game.ents.has(id));
    return bareStore.loadPlayer(keyOf(token));
  };
  const bareIdle = await bareVisit('touch-token-bare-0009', () => {});
  const bareGold = await bareVisit('touch-token-bare-0010', (e) => { e.gold = 2; });
  check(bareIdle === null && bareGold?.gold === 2, '틀만의 서버도 아무것도 하지 않은 새 캐릭터는 저장하지 않고, 골드를 얻은 캐릭터는 저장한다');
  await b.close();
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
// 게임 규칙(engine/server/game)은 통신 계층(engine/server/net)을 import하지 않는다. import 문을 읽어 검사한다 (타입만 가져오는 것도 센다).
// games/deungbul/server/main.ts는 이 게임의 서버를 띄우는 진입점이라 검사하지 않는다 (플러그인을 고르는 자리다).
{
  const root = new URL('../../', import.meta.url);
  const GAME_FILES = ['games/deungbul/server/deungbul.ts', ...['tower', 'raid', 'keepers', 'quests', 'rest'].map((n) => `games/deungbul/server/systems/${n}.ts`)];
  /** 아직 지키지 못하는 것 (지금은 없다: new Game()의 기본값이 틀만이 되면서 game.ts가 플러그인을 import하지 않는다) */
  const EXCEPTIONS: string[] = [];
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 그 파일이 import하는 저장소 안의 파일들 (상대 경로와 별칭을 따라간다) */
  const importsOf = (file: string): string[] => {
    const src = fs.readFileSync(new URL(file, root), 'utf8');
    const specs = [...src.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]|\bdeclare\s+module\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
    return specs.map((sp) => resolveSpec(root, file, sp)).filter((p): p is string => p !== null).map((p) => (p.endsWith('.ts') ? p : `${p}.ts`));
  };
  const engine = [...list('engine/server/game/'), ...list('engine/server/net/'), ...list('engine/server/store/'), 'engine/server/text.ts'].filter((f) => !GAME_FILES.includes(f));
  const found: string[] = [];
  for (const f of engine) for (const to of importsOf(f)) if (GAME_FILES.includes(to)) found.push(`${f} -> ${to}`);
  const extra = found.filter((x) => !EXCEPTIONS.includes(x)), stale = EXCEPTIONS.filter((x) => !found.includes(x));
  for (const x of extra) console.log('  ' + x);
  check(engine.length >= 30 && importsOf('games/deungbul/server/deungbul.ts').filter((x) => GAME_FILES.includes(x)).length === 5 && importsOf('engine/server/net/server.ts').includes('engine/server/game/game.ts'), `import 문을 읽어 낸다 (틀의 서버 파일 ${engine.length}개)`);
  check(extra.length === 0, `틀의 서버 파일은 이 게임의 규칙 시스템과 플러그인을 import하지 않는다 (예외 ${EXCEPTIONS.length}건)`);
  check(stale.length === 0, `예외 목록에 이미 풀린 것이 남아 있지 않다${stale.length ? `: ${stale.join(', ')}` : ''}`);
  const toNet = list('engine/server/game/').flatMap((f) => importsOf(f).filter((to) => to.startsWith('engine/server/net/')).map((to) => `${f} -> ${to}`));
  for (const x of toNet) console.log('  ' + x);
  check(toNet.length === 0, '게임 규칙(engine/server/game)은 통신 계층(engine/server/net)을 import하지 않는다');

  // ---- 확장 지점과 게임의 선언 (단계 2) ----
  // 틀은 넓힐 자리(두 ext.ts)를 비워 두고, 게임은 자기 선언 파일에서 그 두 파일만 선언 병합으로 넓힌다.
  const EXT = ['engine/shared/ext.ts', 'engine/server/game/ext.ts', 'engine/client/i18n/ext.ts'];
  /** 게임의 선언 파일: 공용(안내문, 메시지, 공유 상태), 서버(시스템 칸, 사건), 클라이언트(언어 묶음의 모양) */
  const GAME_DECL = ['games/deungbul/shared/deungbul.ts', 'games/deungbul/server/deungbul.ts', 'games/deungbul/client/i18n/index.ts'];
  /** 이 게임에만 있는 공용 파일: 선언 파일과 등탑·습격·주민·퀘스트의 내용 */
  const GAME_SHARED = ['games/deungbul/shared/deungbul.ts', ...['tower', 'raid', 'residents', 'quests'].map((n) => `games/deungbul/shared/content/${n}.ts`)];
  /** 틀로 분류한 공용 파일. engine/shared/defs.ts는 내용을 통째로 다시 내보내는 통로라 넣지 않았다 (내용을 별칭으로 갈아 끼우는 단계에서 정리한다) */
  const SHARED_ENGINE = ['ext', 'protocol', 'messages', 'sim', 'nav', 'world', 'auto'].map((n) => `engine/shared/${n}.ts`);
  /** 아직 지키지 못하는 것 (지금은 없다) */
  const SHARED_EXCEPTIONS: string[] = [];
  const sharedFound = SHARED_ENGINE.flatMap((f) => importsOf(f).filter((to) => GAME_SHARED.includes(to)).map((to) => `${f} -> ${to}`));
  const sharedExtra = sharedFound.filter((x) => !SHARED_EXCEPTIONS.includes(x)), sharedStale = SHARED_EXCEPTIONS.filter((x) => !sharedFound.includes(x));
  for (const x of sharedExtra) console.log('  ' + x);
  check(SHARED_ENGINE.every((f) => fs.existsSync(new URL(f, root))) && importsOf('engine/shared/protocol.ts').includes('engine/shared/ext.ts') && importsOf('games/deungbul/shared/deungbul.ts').includes('games/deungbul/shared/content/raid.ts'), `공용 파일의 import 문을 읽어 낸다 (틀의 공용 파일 ${SHARED_ENGINE.length}개)`);
  check(sharedExtra.length === 0 && sharedStale.length === 0, `틀의 공용 파일은 이 게임의 선언과 등탑·습격·주민·퀘스트의 내용을 직접 import하지 않는다 (예외 ${SHARED_EXCEPTIONS.length}건)`);
  // 게임의 공용 선언 파일은 틀의 서버 파일도, 다른 공용 파일도 import하지 않는다 (tsconfig의 include로만 컴파일에 들어간다)
  const declUsers = [...engine, ...list('engine/shared/')].filter((f) => f !== 'games/deungbul/shared/deungbul.ts' && importsOf(f).includes('games/deungbul/shared/deungbul.ts'));
  for (const x of declUsers) console.log('  ' + x + ' -> games/deungbul/shared/deungbul.ts');
  check(declUsers.length === 0, '틀의 서버 파일과 공용 파일은 이 게임의 공용 선언 파일(games/deungbul/shared/deungbul.ts)을 import하지 않는다');
  // (importsOf는 주석 속 쓰는 법의 declare module './ext'도 세므로 자기 자신은 뺀다)
  check(EXT.every((f) => importsOf(f).every((to) => to === f)), '확장 지점 파일(engine/shared/ext.ts, engine/server/game/ext.ts)은 아무것도 import하지 않는다');
  // 선언 병합은 그 파일이 컴파일 대상에 들어 있어야 효력이 있다: 게임의 선언 파일은 tsconfig.json의 include 아래에 있고,
  // 틀만 검사하는 설정(tsconfig.engine.json, npm run typecheck:engine)은 틀의 폴더(engine/)만 읽는다: 게임의 파일은 모두 games/ 아래에 있다
  const cfgOf = (name: string) => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8')) as { include?: string[]; exclude?: string[] };
  const included = cfgOf('tsconfig.json').include ?? [], engineOnly = cfgOf('tsconfig.engine.json').include ?? [];
  check(GAME_DECL.every((f) => included.some((d) => f.startsWith(`${d}/`))) && engineOnly.length > 0 && engineOnly.every((d) => d.startsWith('engine/')) && [...GAME_FILES, ...GAME_SHARED].every((f) => f.startsWith('games/')),
    '게임의 선언 파일은 컴파일 대상(tsconfig.json의 include)에 들어 있고, 틀만 검사하는 설정은 게임의 파일을 뺀다');
  // 선언 병합(declare module)은 게임의 선언 파일에만 있고, 확장 지점만 가리킨다: 틀의 다른 타입을 직접 넓히지 않는다
  const merges = [...list('engine/'), ...list('games/')].flatMap((f) => [...fs.readFileSync(new URL(f, root), 'utf8').matchAll(/^\s*declare\s+module\s*['"]([^'"]+)['"]/gm)]
    .map((m) => ({ from: f, to: `${resolveSpec(root, f, m[1])}.ts` })));
  const badMerges = merges.filter((m) => !GAME_DECL.includes(m.from) || !EXT.includes(m.to));
  for (const m of badMerges) console.log(`  ${m.from} => ${m.to}`);
  check(GAME_DECL.every((f) => merges.some((m) => m.from === f)) && badMerges.length === 0, `선언 병합은 게임의 선언 파일에만 있고 확장 지점만 넓힌다 (${merges.map((m) => `${m.from} => ${m.to}`).join(', ')})`);
  // ---- 틀의 시험은 이 게임의 규칙 없이 돈다 (단계 10) ----
  // 틀의 시험(engine/test/*.test.ts와 그것이 쓰는 engine/test/harness.ts)은 이 게임의 파일(games/ 아래의 것)을 import하지 않는다.
  // 플러그인과 규칙 시스템은 따라 들어오는 것까지 본다 (틀의 파일을 거쳐 딸려 오는 일이 없게). 실행 중에도 같은 것을 확인한다: npm run test:engine (test/all.ts).
  // 이 게임의 내용(등탑·습격·주민·퀘스트의 정의)은 통로(engine/shared/defs)로 들어오므로 여기서는 잡지 않는다: 틀의 시험은 아직 등불지기의 내용 위에서 돈다.
  const fileOf = (p: string): string | null => [p, p.replace(/\.ts$/, '/index.ts')].find((x) => fs.existsSync(new URL(x, root))) ?? null;
  const reach = (from: string): string[] => {
    const seen = new Set<string>(), todo = [from];
    while (todo.length) for (const to of importsOf(todo.pop()!)) { const f = fileOf(to); if (f && !seen.has(f)) { seen.add(f); todo.push(f); } }
    return [...seen];
  };
  /** 틀의 시험이 읽어도 되는 게임의 파일: 내용 통로와 내용 정의뿐이다 (아직 등불지기의 맵 좌표와 몬스터·아이템 id 위에서 돈다. 별칭 @game으로만 읽는다) */
  const isContent = (f: string) => /^games\/deungbul\/shared\/(defs|world)\.ts$/.test(f) || f.startsWith('games/deungbul/shared/content/');
  const isGame = (f: string) => f.startsWith('games/') && !isContent(f);
  const engineTests = fs.readdirSync(new URL('engine/test/', root)).filter((n) => n.endsWith('.test.ts') || n === 'harness.ts').map((n) => `engine/test/${n}`);
  const gameTests = list('games/deungbul/test/');
  const testLeaks = engineTests.flatMap((f) => [
    ...importsOf(f).filter(isGame).map((to) => `${f} -> ${to}`),
    ...reach(f).filter(isGame).map((to) => `${f} => ${to}`),
  ]);
  for (const x of new Set(testLeaks)) console.log('  ' + x);
  check(engineTests.length >= 15 && reach('engine/test/move.test.ts').includes('engine/server/game/systems/shop.ts') && reach('games/deungbul/test/game.ts').includes('games/deungbul/server/systems/tower.ts') && gameTests.some((f) => importsOf(f).some(isGame)),
    `시험 파일의 import를 따라가 읽어 낸다 (틀의 시험 파일 ${engineTests.length}개: harness.ts 포함, 게임의 시험 폴더의 파일 ${gameTests.length}개)`);
  check(testLeaks.length === 0, '틀의 시험 파일은 이 게임의 플러그인(games/deungbul/server/deungbul.ts), 규칙 시스템, 게임의 시험(games/deungbul/test/)을 import하지 않는다 (따라 들어오는 것까지)');
}

// ---------- 확장 지점: 선언으로 더한 것이 실행 중에도 게임 쪽에만 있는가 (docs/framework-plan.md의 단계 2) ----------
// 이 게임의 사건·공유 상태·명령·메시지의 타입 선언은 게임의 선언 파일(games/deungbul/shared/deungbul.ts, games/deungbul/server/deungbul.ts)로 옮겼다.
// 타입은 컴파일 대상 전체에 보이므로, 틀만의 게임에 그 칸이 실제로 없다는 것은 돌려서 확인한다.
{
  const bare = new Game({ plugins: [] });
  let threw = '';
  try { bare.fire('raidWon', []); bare.fire('residentReturned', 'bram'); } catch (err) { threw = String(err); }
  check(threw === '', '듣는 곳이 없는 사건을 알려도 아무 일도 없다');
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

// ---------- 언어 파일: 틀의 몫 (docs/framework-plan.md의 단계 8) ----------
// 화면의 문장은 틀의 몫(engine/client/i18n/ko.ts, en.ts의 koBase·enBase)과 게임의 몫(games/deungbul/client/i18n/)으로 나뉘고 mergeLocale로 합친다.
// 여기서는 틀만 본다: 틀의 문장만으로 묶음이 완결되는가, 틀의 안내문에 모두 문장이 있는가, 합치는 규칙, 틀의 언어·알림·소리 파일에 이 게임의 낱말과 안내문이 남아 있지 않은가.
// 게임의 문장과 합친 결과(문장이 예전과 글자까지 같은가, 덮어쓴 키의 목록)는 games/deungbul/test/guide.test.ts가 본다.
{
  const root = new URL('../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** 주석을 뺀 본문 (낱말 검사는 화면에 나갈 수 있는 글자와 코드만 본다) */
  const body = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const { koBase } = await import('../client/i18n/ko');
  const { enBase } = await import('../client/i18n/en');
  const { mergeLocale, overlaps } = await import('../client/i18n/merge');
  const { idNames } = await import('../client/i18n/names');
  type EngineLocale = import('../client/i18n/ko').EngineLocale;

  // 틀만으로 완결: 게임의 문장 없이, 내용의 이름표만 넘기면 틀의 묶음이 채워진다 (타입으로도: 빠진 칸이 있으면 컴파일되지 않는다)
  const ko: EngineLocale = koBase(idNames()), en: EngineLocale = enBase(idNames());
  /** 두 묶음의 모양이 다른 자리: 키, 값의 종류, 목록의 길이, 함수의 인자 수 */
  const shapeDiff = (x: unknown, y: unknown, at: string): string[] => {
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) return [`${at}: 종류가 다르다`];
    if (typeof x === 'function') return x.length === (y as () => void).length ? [] : [`${at}: 인자의 수가 다르다`];
    if (typeof x === 'string') return x.trim() && (y as string).trim() ? [] : [`${at}: 빈 문장`];
    if (Array.isArray(x)) return [...(x.length === (y as unknown[]).length ? [] : [`${at}: 목록의 길이가 다르다`]), ...x.flatMap((v, i) => shapeDiff(v, (y as unknown[])[i], `${at}[${i}]`))];
    if (typeof x !== 'object' || x === null || y === null) return [];
    const X = x as Record<string, unknown>, Y = y as Record<string, unknown>;
    return [...new Set([...Object.keys(X), ...Object.keys(Y)])].flatMap((k) => (k in X && k in Y ? shapeDiff(X[k], Y[k], `${at}.${k}`) : [`${at}.${k}: 한쪽에만 있다`]));
  };
  // (이름표가 id뿐이라 설명 칸이 비어 있다: 이름표에서 온 칸은 빼고 본다)
  const own = (l: EngineLocale) => ({ ...l, monsters: 0, items: 0, classes: 0, skills: 0, dungeons: 0, nameA: 0, nameB: 0 });
  const uneven = shapeDiff(own(ko), own(en), 'base');
  for (const x of uneven.slice(0, 10)) console.log('  ' + x);
  check(uneven.length === 0 && Object.keys(ko.ui).length > 100 && Object.keys(ko.fmt).length > 60, `틀의 언어 묶음은 두 언어가 같은 모양이다 (ui ${Object.keys(ko.ui).length}개, fmt ${Object.keys(ko.fmt).length}개, msg ${Object.keys(ko.msg).length}개)`);

  // 틀의 안내문(engine/shared/messages.ts에 적힌 종류) 전부에 문장이 있고, 틀의 묶음에는 그것만 있다
  const engineKeys = [...read('engine/shared/messages.ts').matchAll(/^\s*\|\s*'(\w+)'/gm)].map((m) => m[1]);
  /** 게임이 확장 지점에 더한 안내문 (게임의 선언 파일을 글자로만 읽는다) */
  const gameKeys = [...(/interface MsgMap \{([\s\S]*?)\n  \}/.exec(read('games/deungbul/shared/deungbul.ts').replace(/\r\n/g, '\n'))?.[1] ?? '').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const sample = ['slime', 3, 2, 1500, 1];
  const said = (l: EngineLocale) => engineKeys.filter((k) => { const f = (l.msg as Record<string, ((a: (string | number)[]) => string) | undefined>)[k]; return typeof f === 'function' && typeof f(sample) === 'string' && f(sample).length > 0; });
  check(engineKeys.length > 90 && gameKeys.length >= 18 && said(ko).length === engineKeys.length && said(en).length === engineKeys.length
    && [ko, en].every((l) => Object.keys(l.msg).sort().join() === [...engineKeys].sort().join()),
    `틀의 안내문 ${engineKeys.length}개 모두에 두 언어의 문장이 있고, 틀의 묶음에 게임의 안내문(${gameKeys.length}개)은 없다`);
  check(ko.msg.kill(['slime', 3, 2, 1500]).includes('slime') && ko.msg.kill(['slime', 3, 2, 1500]).includes('1,500') && ko.msg.died(['어딘가']).includes('어딘가') && ko.fmt.num(1234567) === '1,234,567' && en.fmt.num(1234567) === '1,234,567',
    '이름표가 없으면 내용의 id가 그대로 이름이 되고(틀만 띄웠을 때), 자릿수 구분은 틀의 문장이 맡는다');

  // 합치는 규칙: 묶음별로 한 단계, 같은 키는 게임이 이긴다, 틀의 묶음은 그대로 둔다
  const b = { code: 'ko', ui: { a: '1', b: '2' }, fmt: { n: (x: number) => `b${x}` }, list: ['x'] }, g = { ui: { b: 'B', c: 'C' }, list: ['y'], extra: { z: 1 } };
  const m = mergeLocale(b, g);
  check(m.code === 'ko' && m.ui.a === '1' && m.ui.b === 'B' && m.ui.c === 'C' && m.fmt.n(1) === 'b1' && m.list.join() === 'y' && m.extra.z === 1,
    'mergeLocale: 양쪽에 있는 묶음은 한 단계 깊이로 합치고, 같은 키는 게임의 것이 이긴다 (목록은 통째로 바뀐다)');
  check(b.ui.b === '2' && !('c' in b.ui) && b.list.join() === 'x' && overlaps(b, g).join() === 'ui.b,list', 'mergeLocale은 틀의 묶음을 고치지 않고, 겹친 키의 목록을 따로 낼 수 있다');

  // 틀의 언어·알림·소리 파일에 이 게임의 낱말과 안내문이 남아 있지 않다 (주석은 뺀다)
  const FILES = ['i18n/ko.ts', 'i18n/en.ts', 'i18n/index.ts', 'i18n/merge.ts', 'i18n/names.ts', 'i18n/ext.ts', 'hud/notify.ts', 'sound.ts'].map((f) => `engine/client/${f}`);
  /** 이 게임의 낱말: 등탑·불씨·주민·습격·퀘스트와 고유한 이름들. 영어는 낱말의 앞머리로 본다 (raid, raids, raidSoon) */
  const WORDS_KO = ['등탑', '불씨', '등불', '습격', '주민', '안개', '첫불', '잿빛', '브람', '미라', '할멈', '퀘스트', '기여', '마을', '그림자', '지하묘'];
  const WORDS_EN = ['lamp', 'spark', 'raid', 'resident', 'mist', 'firstlight', 'ashwood', 'bram', 'mira', 'granny', 'quest', 'keeper', 'contribution', 'village', 'tower', 'ember', 'crypt', 'shade'];
  /** 남길 수밖에 없는 것 → 그것이 있어도 되는 파일. 까닭:
   *  raidFoe: 스냅샷의 '몰려온 적' 표시(EnterInfo.r)를 틀의 entities.ts가 읽어 이름을 꾸미는 자리(fmt.raidFoe)의 키 이름이다. 문장이 아니라 키이고
   *  틀의 기본값은 이름 그대로다(게임이 덮어쓴다). 키 이름을 중립으로 바꾸는 일은 '습격 몹' 개념을 정리할 때 함께 한다 (계획서 8절) */
  const WORD_EXCEPTIONS: Record<string, string[]> = { raidFoe: ['engine/client/i18n/ko.ts', 'engine/client/i18n/en.ts'] };
  const wordHits = FILES.flatMap((f) => {
    const src = body(f);
    return [
      ...WORDS_KO.filter((w) => src.includes(w)),
      ...WORDS_EN.flatMap((w) => [...src.matchAll(new RegExp(`(?<![A-Za-z])${w}[A-Za-z]*`, 'gi'))].map((x) => x[0])).filter((w) => !WORD_EXCEPTIONS[w]?.includes(f)),
    ].map((w) => `${f}: ${w}`);
  });
  for (const x of wordHits) console.log('  ' + x);
  check(body('engine/client/i18n/ko.ts').includes('raidFoe') && !body('engine/client/i18n/ko.ts').includes('(예:') && body('engine/client/i18n/ko.ts').includes('길드') && wordHits.length === 0,
    `틀의 언어·알림·소리 파일 ${FILES.length}개의 본문에 이 게임의 낱말(${WORDS_KO.slice(0, 4).join(', ')} … ${WORDS_EN.slice(0, 3).join(', ')} … ${WORDS_KO.length + WORDS_EN.length}개)이 없다 (예외 ${Object.keys(WORD_EXCEPTIONS).length}건: ${Object.keys(WORD_EXCEPTIONS).join(', ')})`);
  const keyHits = FILES.flatMap((f) => gameKeys.filter((k) => new RegExp(`\\b${k}\\b`).test(body(f))).map((k) => `${f}: ${k}`));
  for (const x of keyHits) console.log('  ' + x);
  check(/\bdied\b/.test(body('engine/client/hud/notify.ts')) && /\blevelUp\b/.test(body('engine/client/sound.ts')) && keyHits.length === 0,
    '틀의 알림 분류표(hud/notify.ts)와 소리 대응표(sound.ts), 틀의 언어 파일은 게임의 안내문을 이름으로 적지 않는다 (게임의 모듈이 등록한다)');
  // 이 파일들은 게임의 클라이언트 폴더(game/, deungbul/, guide/)를 import하지 않는다. 내용에서 가져오는 이름은 아래 6a 블록의 CLEAN이 본다
  const gameImports = FILES.flatMap((f) => [...read(f).matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((x) => resolveSpec(root, f, x[1]) ?? '').filter((to) => to.startsWith('games/')).map((to) => `${f} -> ${to}`));
  for (const x of gameImports) console.log('  ' + x);
  check(read('games/deungbul/client/words.ts').includes("from '@engine/client/i18n'") && gameImports.length === 0, '틀의 언어·알림·소리 파일은 게임의 클라이언트 폴더를 import하지 않는다 (게임이 틀에 등록한다: games/deungbul/client/words.ts)');
}

// ---------- 의존 방향: 클라이언트 (docs/framework-plan.md의 단계 6a) ----------
// 6a에서 가른 틀 쪽 화면 파일은 이 게임의 것을 직접 읽지 않고 rules(engine/client/rules.ts)와 등록 접점(addNpc, onKey)을 거친다.
// 내용은 통로(engine/shared/defs, engine/shared/world)로 들어오므로 파일 경로만으로는 알 수 없다: 가져오는 이름까지 본다.
// 6b부터는 client/src 아래의 틀 쪽 파일 전부가 대상이다: 이 게임의 파일은 games/deungbul/client/ 한 폴더에 모였고, 틀을 시작시키는 것도 게임의 진입점(game/main.ts)이다.
{
  const root = new URL('../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 이 게임의 클라이언트 파일: game/ 아래 전부와 도감(guide/). 6b에서 옛 자리(hud/quest.ts, hud/marks.ts, scene/scenery.ts, deungbul/)의 것을 game/으로 모았다 */
  const isGameClient = (f: string): boolean => f.startsWith('games/deungbul/client/');
  /** 틀 쪽 클라이언트 파일: client/src 아래에서 이 게임의 파일을 뺀 전부 (8단계에서 언어 파일과 소리도 갈라 예외가 없다) */
  const CLEAN = list('engine/client/').filter((f) => !isGameClient(f));
  /** 이 게임에만 있는 내용 정의 */
  const GAME_CONTENT = ['residents', 'tower', 'raid', 'quests'].map((n) => `games/deungbul/shared/content/${n}.ts`);
  /** 그 내용 파일들이 내보내는 이름 + 맵 정의 가운데 이 게임의 것 + 클라이언트 상태 가운데 이 게임의 것 */
  const GAME_NAMES = new Set([
    ...GAME_CONTENT.flatMap((f) => [...read(f).matchAll(/^export\s+(?:const|function|type|interface|class|enum)\s+(\w+)/gm)].map((m) => m[1])),
    'TOWERS', 'TOWER', 'TOWN', 'POND', 'HOUSES', 'CLEARINGS', 'ZONE_SPLIT', 'ZONE_COUNT', 'zoneOf', 'onPath',
    'stage', 'zoneGlow', 'myZone', 'raidLeft',
  ]);
  /** 그 파일의 import: 저장소 안의 대상 파일과 가져오는 이름들 */
  const importsOf = (file: string): { to: string; names: string[] }[] =>
    [...read(file).matchAll(/\bimport\s+(?:type\s+)?(?:(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s*)?['"]([^'"]+)['"]/g)].filter((m) => resolveSpec(root, file, m[2]) !== null).map((m) => ({
      to: resolveSpec(root, file, m[2])!.replace(/(\.ts)?$/, '.ts'),
      names: (m[1] ?? '').startsWith('{') ? m[1].slice(1, -1).split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) : [],
    }));
  const breaks = (file: string): string[] => [
    ...importsOf(file).flatMap((i) => [
      ...(isGameClient(i.to) || GAME_CONTENT.includes(i.to) ? [`${file} -> ${i.to}`] : []),
      ...i.names.filter((n) => GAME_NAMES.has(n)).map((n) => `${file} -> ${n} (${i.to})`),
    ]),
    // 공유 상태(S.world)와 퀘스트 진행(S.quest)의 모양은 이 게임의 것이다: 틀은 rules에 묻는다 (6b부터 틀의 상태 S에는 그 칸이 아예 없다: 게임의 상태는 game/state.ts)
    ...(usesGameState(read(file)) ? [`${file} -> S.world / S.quest`] : []),
  ];
  function usesGameState(src: string): boolean { return /\bS\.(world|quest)\s*\./.test(src); }
  const found = CLEAN.flatMap(breaks);
  for (const x of found) console.log('  ' + x);
  const game = breaks('games/deungbul/client/deungbul.ts');
  check(GAME_NAMES.has('RESIDENTS') && GAME_NAMES.has('speedFor') && GAME_NAMES.has('QUESTS') && ['RESIDENTS', 'speedFor', 'TOWERS', 'TOWN', 'stage'].every((n) => game.some((x) => x.includes(n)))
    && game.some((x) => x.endsWith('-> games/deungbul/client/hud/quest.ts')) && game.some((x) => x.endsWith('-> games/deungbul/client/state.ts')) && usesGameState('const g = S.world.tower.glow;') && !usesGameState('GS.world.tower'),
    `클라이언트의 import 문과 가져오는 이름을 읽어 낸다 (이 게임의 이름 ${GAME_NAMES.size}개, 게임 모듈에서 ${game.length}건)`);
  check(CLEAN.length >= 30 && ['main.ts', 'app.ts', 'modules.ts', 'state.ts', 'actions.ts', 'hud/me.ts', 'hud/near.ts', 'hud/classes.ts', 'scene/view.ts'].every((f) => CLEAN.includes(`engine/client/${f}`)) && found.length === 0,
    `틀 쪽 화면 파일 ${CLEAN.length}개(client/src에서 game/, guide/, 언어 파일, sound.ts를 뺀 전부)는 이 게임의 클라이언트 파일과 게임 전용 내용(주민, 등탑, 습격, 퀘스트)을 import하지 않는다`);
  // 이 게임의 클라이언트 파일은 한 폴더에 모여 있고, 틀을 시작시키는 것은 게임의 진입점이다: 틀의 목록(modules.ts)은 게임의 모듈을 모른다
  const entry = importsOf('games/deungbul/client/main.ts').map((i) => i.to);
  check(entry.includes('engine/client/main.ts') && entry.includes('games/deungbul/client/deungbul.ts') && entry.includes('games/deungbul/client/hud/tower.ts') && /startClient\(\{/.test(read('games/deungbul/client/main.ts'))
    && /<script type="module" src="\.\/main\.ts"><\/script>/.test(read('games/deungbul/client/index.html')) && !list('engine/client/').some((f) => /^engine\/client\/(game|deungbul|guide)\//.test(f)),
    '이 게임의 진입점(games/deungbul/client/main.ts)이 자기 모듈을 들고 틀의 startClient를 부르고, index.html은 그 진입점을 읽는다');
  // 틀만 타입 검사하는 설정은 틀의 폴더만 읽는다 (npm run typecheck:engine이 틀만 센다): 게임의 클라이언트 폴더는 games/ 아래에 있어 들어가지 않는다
  const engineInclude = (JSON.parse(read('tsconfig.engine.json')) as { include?: string[] }).include ?? [];
  check(engineInclude.includes('engine/client') && engineInclude.every((x) => x.startsWith('engine/') && fs.existsSync(new URL(x, root))),
    '틀만 검사하는 설정(tsconfig.engine.json)이 틀의 폴더(engine/)만 읽는다: 이 게임의 클라이언트 폴더(games/deungbul/client/)는 들어가지 않는다');
}

// ---------- 의존 방향: 화면의 틀 (7a단계: 장면의 겉모습을 게임이 넘긴다) ----------
// 틀로 가른 장면 파일(3D 화면, 모델, 미니맵)은 이 게임의 클라이언트 파일(games/deungbul/client/: 이 게임의 장면·건물·표식·퀘스트 화면)을 import하지 않고,
// 내용 정의에서 이 게임에만 있는 이름(등탑·습격·주민·퀘스트의 정의, 맵의 등탑·연못·길·구역)을 가져오지 않는다. 반대 방향(게임이 틀을 import)은 된다.
// 지형을 틀에 넘기는 자리는 게임의 진입점(games/deungbul/client/main.ts)이다: engine/client/app.ts도 이제 게임을 모른다 (위의 6a 블록이 함께 본다).
{
  const root = new URL('../../', import.meta.url);
  const ENGINE = ['engine/client/scene/view.ts', 'engine/client/scene/models.ts', 'engine/client/hud/minimap.ts'];
  /** 이 게임의 클라이언트 파일: 폴더 하나 (6b에서 옛 자리의 것들을 모았다) */
  const isGameFile = (f: string): boolean => f.startsWith('games/deungbul/client/');
  /** 맵 정의에서 이 게임의 것 (docs/framework-plan.md 2절). 범위·지역·문·기둥·뿌리는 규칙은 틀과의 계약이라 넣지 않는다 */
  const MAP_NAMES = ['TOWERS', 'TOWER', 'TOWN', 'POND', 'HOUSES', 'CLEARINGS', 'ZONE_SPLIT', 'ZONE_COUNT', 'zoneOf', 'onPath', 'isFree', 'TowerDef'];
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** 그 파일이 내보내는 이름들 */
  const exportsOf = (file: string): string[] => [...read(file).matchAll(/^export\s+(?:declare\s+)?(?:const|let|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const GAME_NAMES = new Set([...MAP_NAMES, ...['tower', 'raid', 'residents', 'quests'].flatMap((n) => exportsOf(`games/deungbul/shared/content/${n}.ts`))]);
  /** 그 파일의 import 문들: 저장소 안의 어느 파일에서(상대 경로만) 어떤 이름을 가져오는가. 통째로 가져오면(* as) 이름은 '*' */
  const importsOf = (file: string): { from: string; names: string[] }[] =>
    [...read(file).matchAll(/\b(?:import|export)\b([^;'"]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)]
      .filter((m) => resolveSpec(root, file, m[2] ?? m[3]) !== null)
      .map((m) => {
        const to = resolveSpec(root, file, m[2] ?? m[3])!;
        const braces = /\{([^}]*)\}/.exec(m[1] ?? '')?.[1] ?? '';
        const names = braces.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean);
        return { from: to.endsWith('.ts') ? to : `${to}.ts`, names: /\*/.test(m[1] ?? '') ? ['*'] : names };
      });
  /** 틀의 파일이 지키지 않는 것: 게임의 파일을 import하거나, 공용 정의에서 게임의 이름을 가져온다 */
  const breaks = (file: string): string[] => importsOf(file).flatMap((im) => [
    ...(isGameFile(im.from) ? [`${file} -> ${im.from}`] : []),
    ...(/^(engine|games\/deungbul)\/shared\//.test(im.from) ? im.names.filter((n) => n === '*' || GAME_NAMES.has(n)).map((n) => `${file} -> ${im.from}의 ${n}`) : []),
  ]);
  // 검사가 실제로 잡아내는지: 게임 쪽 파일에 대면 걸려야 한다
  const paint = breaks('games/deungbul/client/scene/paint.ts'), scene = breaks('games/deungbul/client/scene/scene.ts');
  check(GAME_NAMES.has('stageOf') && GAME_NAMES.has('RESIDENTS') && GAME_NAMES.has('QUESTS') && GAME_NAMES.has('RAID')
    && paint.some((x) => x.endsWith('의 POND')) && paint.some((x) => x.endsWith('의 onPath')) && scene.some((x) => x.endsWith('의 Stage')) && scene.includes('games/deungbul/client/scene/scene.ts -> games/deungbul/client/scene/scenery.ts')
    && importsOf('engine/client/scene/view.ts').some((im) => im.from === 'engine/shared/world.ts' && im.names.includes('World')),
    `import 문에서 가져오는 이름을 읽어 낸다 (이 게임에만 있는 이름 ${GAME_NAMES.size}개)`);
  const found = ENGINE.flatMap(breaks);
  for (const x of found) console.log('  ' + x);
  check(found.length === 0, `화면의 틀(${ENGINE.map((f) => f.replace('engine/client/', '')).join(', ')})은 이 게임의 클라이언트 파일과 게임에만 있는 내용 정의를 import하지 않는다`);
}

// ---------- 의존 방향: 화면의 뼈대와 스타일 (7b단계: 게임의 창은 게임이 붙인다) ----------
// 틀의 index.html과 style.css에는 틀의 창만 있다. 이 게임의 창(등탑, 퀘스트, 습격 알림, 내 정보에 덧붙는 표시, '마을로' 단추)은
// 게임의 마크업(games/deungbul/client/markup.ts)이 틀의 빈 자리(hud/shell.ts의 mountPanel)에 붙이고, 모양은 게임의 스타일(game/deungbul.css)에 있다.
// 옮긴 창의 id는 게임의 마크업에서 읽어 낸다: 창을 더 옮기면 검사도 따라간다.
{
  const root = new URL('../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** css에서 주석을 뺀 것 (주석은 등탑·퀘스트를 말해도 된다) */
  const css = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const html = read('games/deungbul/client/index.html'), markup = read('games/deungbul/client/markup.ts');
  const frameCss = css('engine/client/style.css'), gameCss = css('games/deungbul/client/deungbul.css');
  const ids = [...new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  /** 그 id의 요소가 마크업에 있는가 */
  const hasId = (text: string, id: string): boolean => new RegExp(`\\bid="${id}"`).test(text);
  /** 그 선택자(#id, .class)가 css에 쓰였는가. 더 긴 이름의 앞머리(#questGo의 #quest)는 세지 않는다 */
  const hasSel = (text: string, sel: string): boolean => new RegExp(`${sel.replace(/[.#]/g, '\\$&')}(?![\\w-])`).test(text);
  /** 이 게임의 창에만 쓰는 class (막대의 색, 불씨 글자, 습격 알림의 줄, 습격 몹의 이름표) */
  const GAME_CLASSES = ['.spark', '.rtext', '.rhp', '.bar.glow', '.bar.res', '.tag.raid'];

  // 검사가 실제로 읽어 내는지: 옮긴 창의 대표들이 게임의 마크업과 스타일에 있어야 한다
  const core = ['tower', 'villageBox', 'keepBox', 'classBtn', 'quest', 'questGo', 'goalArrow', 'raid', 'raidMini', 'towerMini', 'contrib', 'rested', 'sparks', 'townBtn'];
  check(core.every((id) => ids.includes(id)) && ids.length >= 30 && ['tower', 'quest', 'raid', 'goalArrow', 'townBtn', 'raidMini', 'contrib'].every((id) => hasSel(gameCss, `#${id}`))
    && GAME_CLASSES.every((c) => hasSel(gameCss, c)) && hasSel('#questGo { }', '#questGo') && !hasSel('#questGo { }', '#quest') && hasId(markup, 'tower'),
    `게임의 마크업과 스타일에서 이 게임의 창을 읽어 낸다 (id ${ids.length}개)`);

  const inHtml = ids.filter((id) => hasId(html, id));
  check(inHtml.length === 0, `틀의 index.html에 이 게임의 창이 남아 있지 않다${inHtml.length ? ': ' + inHtml.join(', ') : ''}`);
  // 붙는 자리의 기준이 되는 틀의 요소는 index.html에 있어야 한다 (없으면 mountPanel이 시작할 때 던진다)
  const anchors = [...read('engine/client/hud/shell.ts').matchAll(/byId\('([^']+)'\)/g)].map((m) => m[1]);
  check(anchors.length >= 5 && anchors.every((id) => hasId(html, id)), `붙는 자리의 기준 요소(${[...new Set(anchors)].join(', ')})가 틀의 index.html에 있다`);

  const inCss = [...ids.map((id) => `#${id}`), ...GAME_CLASSES].filter((sel) => hasSel(frameCss, sel));
  check(inCss.length === 0, `틀의 style.css에 이 게임의 창을 가리키는 선택자가 남아 있지 않다${inCss.length ? ': ' + inCss.join(', ') : ''}`);

  // 뼈대는 게임을 모른다: 게임이 뼈대를 import하고, 진입 쪽(app.ts)이 게임의 mountMarkup을 맨 먼저 부른다.
  // app.ts를 import하지 않는 것은 순서 때문이다: app.ts가 이 파일에 기대어 먼저 붙인 뒤에야 다른 파일이 요소를 잡는다
  const imports = (file: string): string[] => [...read(file).matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
  const shell = imports('engine/client/hud/shell.ts');
  check(imports('games/deungbul/client/markup.ts').includes('@engine/client/hud/shell') && imports('games/deungbul/client/markup.ts').includes('./deungbul.css')
    && !shell.some((to) => /^@game\/|(^|\/)(games?|deungbul)(\/|$)|\/(quest|marks|scenery|app)$|\.css$/.test(to)),
    `hud/shell.ts는 게임 파일(마크업, 스타일)과 app.ts를 import하지 않는다 (import ${shell.length}개)`);
  const app = read('engine/client/app.ts');
  // 6b 뒤로 진입점은 게임의 것(games/deungbul/client/main.ts)이다: 틀을 시작시키기(startClient) 전에 게임의 창을 붙이고, 틀의 app.ts는 그 일을 모른다
  const entry = read('games/deungbul/client/main.ts');
  check(/^mountMarkup\(\);/m.test(entry) && entry.indexOf('mountMarkup();') < entry.indexOf('startClient(') && !app.includes('mountMarkup'), '게임의 진입점이 틀을 시작시키기 전에 게임의 창을 붙인다 (틀의 app.ts는 모른다)');
}
