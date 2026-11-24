// 틀과 게임을 가르는 작업의 안전망과 경계 (docs/framework-plan.md의 단계 0, 1, 2).
// 구조를 고치다가 맵의 배치가 달라지거나 옛 저장이 다르게 읽히면 여기서 잡힌다.
//   - 맵 지문: buildWorld()가 놓는 장애물·나무·바위와 길찾기 격자가 그대로인가
//   - 저장 왕복: 견본(test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가
//   - 프로토콜 번호: 서버가 welcome에 번호를 싣는가
//   - 틀만의 게임: 규칙 플러그인 없이(plugins: []) 만든 게임과 서버가 도는가
//   - 의존 방향: 틀의 서버 파일과 공용 파일이 이 게임의 규칙과 선언을 import하지 않는가
//   - 확장 지점: 게임이 선언으로 더한 칸(사건, 공유 상태, 명령)이 틀만의 게임에는 실행 중에도 없는가
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { CHANNEL, DUNGEONS, QUESTS, REST, SHOP, SPAWN, goalCount, restGain } from '../shared/defs';
import { NavGrid } from '../shared/nav';
import { PROTOCOL, type ServerMsg } from '../shared/protocol';
import { PLAYER_SPEED, TOWER, buildWorld } from '../shared/world';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { channelOf, isField } from '../server/game/layers';
import { startServer } from '../server/net/server';
import { MemoryStore, type PlayerSave, type WorldSave } from '../server/store';
import { check, connect, sleep, until } from './harness';

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
    // 게임의 칸(퀘스트, 기여, 기여 단계, 휴식)은 ext의 새 칸에 적히고, 이번 배포 동안은 옛 최상위 칸에도 같은 값으로 함께 적힌다 (위의 비교가 옛 칸을, 이 비교가 새 칸을 본다)
    const oldCells = { quest: out.quest, tower: { contrib: out.contrib }, keepers: { tier: out.tier }, rest: { left: out.rested } };
    d.push(...diff(oldCells, { quest: isExt.quest, tower: isExt.tower, keepers: isExt.keepers, rest: isExt.rest }, '옛 칸과 새 칸'));
    if (!Array.isArray(out.quest) || [out.contrib, out.tier, out.rested].some((v) => typeof v !== 'number')) d.push('옛 최상위 칸(quest, contrib, tier, rested)이 함께 적히지 않았다');
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

// ---------- 게임의 저장 칸을 저장 등록으로 (docs/framework-plan.md의 단계 3) ----------
// 퀘스트·기여·기여 단계·휴식은 그 칸을 맡은 시스템이 ext에 쓰고 읽는다 (ext.quest, ext.tower, ext.keepers, ext.rest).
// 옛 형식(최상위 quest, contrib, tier, rested)도 계속 읽고, 이번 배포 동안은 옛 칸에도 함께 쓴다.
// 기대값(test/fixtures/players-read.json)은 칸을 옮기기 전의 코드가 각 견본을 읽은 상태다: rested5h는 5시간 떠나 있다 왔을 때의 휴식 보너스.
{
  const samples = fixture<{ note: string; save: PlayerSave }[]>('players');
  const expected = fixture<{ quest: number[]; contrib: number; tier: number; rested: number; rested5h: number }[]>('players-read');
  type Read = { quest: number[]; contrib: number; tier: number; rested: number; told: boolean; out: PlayerSave };
  /** 저장을 읽은 뒤의 상태. 시계는 저장한 시각에서 gone만큼 지난 때 */
  const read = (save: PlayerSave, gone = 0): Read => {
    const now = (typeof save.seen === 'number' ? save.seen : noonOf(null)) + gone;
    const g = new Game({ now: () => now });
    const p = g.players.spawn(save.name, false, structuredClone(save), 'fx-cells');
    return { quest: [p.qc, p.qs, p.qn], contrib: p.contrib, tier: p.tier, rested: p.rested, told: g.notices.some((n) => n.id === p.id && n.k === 'rested'), out: structuredClone(g.players.export(p)) };
  };
  const same = (r: Read, e: { quest: number[]; contrib: number; tier: number; rested: number }) => r.quest.join() === e.quest.join() && r.contrib === e.contrib && r.tier === e.tier && r.rested === e.rested;
  /** 옛 최상위 칸을 지운 저장: 옛 칸 쓰기를 멈춘 뒤(다음 배포)의 모양 */
  const newOnly = (save: PlayerSave): PlayerSave => { const { quest: _q, contrib: _c, tier: _t, rested: _r, ...rest } = structuredClone(save); return rest; };
  const HOURS5 = 5 * 3600000;
  /** 방금 쓴 저장(저장한 시각이 적혀 있다)을 5시간 뒤에 읽었을 때의 휴식 보너스 */
  const after5h = (rested: number) => Math.min(REST.cap, rested + restGain(HOURS5));
  const bad: string[] = [];
  samples.forEach(({ save }, i) => {
    const e = expected[i], at = `견본 ${i + 1}`;
    const first = read(save);
    if (!same(first, e)) bad.push(`${at}: 옛 형식을 읽은 상태가 다르다 ${JSON.stringify([first.quest, first.contrib, first.tier, first.rested])}`);
    const later = read(save, HOURS5);
    if (later.rested !== e.rested5h || later.told !== (typeof save.seen === 'number')) bad.push(`${at}: 5시간 쉰 뒤의 휴식 보너스가 다르다 (${later.rested}, 안내 ${later.told})`);
    // 새 코드가 쓴 저장을 다시 읽는다. 이전 코드가 읽는 옛 최상위 칸도 같은 값이다 (되돌려도 진행이 남는다)
    const w = first.out;
    if (!same(read(w), e) || read(w, HOURS5).rested !== after5h(e.rested)) bad.push(`${at}: 새로 쓴 저장을 다시 읽은 상태가 다르다`);
    if (!same({ ...first, quest: w.quest ?? [], contrib: w.contrib ?? -1, tier: w.tier ?? -1, rested: w.rested ?? -1 }, e)) bad.push(`${at}: 함께 쓴 옛 칸의 값이 다르다`);
    // 새 칸만 있는 저장
    const only = newOnly(w);
    if (!same(read(only), e) || read(only, HOURS5).rested !== after5h(e.rested)) bad.push(`${at}: 새 칸만 있는 저장을 읽은 상태가 다르다`);
    // 둘 다 있고 값이 다르면 새 칸이 이긴다
    const stale = read({ ...structuredClone(w), quest: [1, 1, 1], contrib: 777777, tier: 9, rested: 123 });
    if (!same(stale, e)) bad.push(`${at}: 옛 칸의 값이 새 칸을 이겼다 ${JSON.stringify([stale.quest, stale.contrib, stale.tier, stale.rested])}`);
    const fresh = read({ ...structuredClone(w), ext: { ...w.ext, quest: [1, 2, 0], tower: { contrib: 4321 }, keepers: { tier: 3 }, rest: { left: 77 } } });
    if (!same(fresh, { quest: [1, 2, 0], contrib: 4321, tier: 3, rested: 77 })) bad.push(`${at}: 새 칸의 값이 읽히지 않았다`);
  });
  for (const line of bad) console.log('  ' + line);
  check(expected.length === samples.length && bad.length === 0, `캐릭터 저장 견본 ${samples.length}개: 옛 형식, 새로 쓴 저장, 새 칸만 있는 저장이 모두 칸을 옮기기 전과 같은 상태로 읽히고, 값이 다르면 새 칸이 이긴다`);

  // 깨진 값: 옛 칸에 있든 새 칸에 있든 서버가 죽지 않고, 같은 범위 잡기가 적용된다
  const base = samples[0].save, lastStep = QUESTS[0].steps.length - 1;
  const cases: { v: { quest?: unknown; contrib?: unknown; tier?: unknown; rested?: unknown }; want: { quest: number[]; contrib: number; tier: number; rested: number } }[] = [
    { v: { quest: [-1, -1, -1], contrib: -5, tier: -1, rested: -9 }, want: { quest: [0, 0, 0], contrib: 0, tier: 0, rested: 0 } },
    { v: { quest: [99, 3, 3], contrib: 1e12, tier: 500, rested: 99999 }, want: { quest: [QUESTS.length, 0, 0], contrib: 1e9, tier: 99, rested: REST.cap } }, // 장이 끝을 넘으면 '다 마침'(장 = 장의 수)
    { v: { quest: [0, 99, 9999], contrib: 3.4, tier: 1.6, rested: 10.5 }, want: { quest: [0, lastStep, goalCount(QUESTS[0].steps[lastStep].goal) - 1], contrib: 3, tier: 2, rested: 11 } },
    { v: { quest: [0, 0, 9999], contrib: 'abc', tier: '3', rested: null }, want: { quest: [0, 0, goalCount(QUESTS[0].steps[0].goal) - 1], contrib: 0, tier: 0, rested: 0 } },
    { v: { quest: 'abc', contrib: [], tier: {}, rested: true }, want: { quest: [0, 0, 0], contrib: 0, tier: 0, rested: 0 } },
    { v: { quest: ['1', null, {}], contrib: null, tier: null, rested: 'x' }, want: { quest: [0, 0, 0], contrib: 0, tier: 0, rested: 0 } },
    { v: { quest: [2], contrib: 7, tier: 1, rested: 5 }, want: { quest: [2, 0, 0], contrib: 7, tier: 1, rested: 5 } },
    { v: {}, want: { quest: [0, 0, 0], contrib: 0, tier: 0, rested: 0 } },
  ];
  const wrong: string[] = [];
  let threw = '';
  try {
    cases.forEach(({ v, want }, i) => {
      const plain = newOnly(base);
      const asOld = read({ ...plain, ...v } as PlayerSave);
      const asNew = read({ ...plain, ext: { ...plain.ext, quest: v.quest, tower: { contrib: v.contrib }, keepers: { tier: v.tier }, rest: { left: v.rested } } });
      if (!same(asOld, want)) wrong.push(`깨진 값 ${i + 1} (옛 칸): ${JSON.stringify([asOld.quest, asOld.contrib, asOld.tier, asOld.rested])}`);
      if (!same(asNew, want)) wrong.push(`깨진 값 ${i + 1} (새 칸): ${JSON.stringify([asNew.quest, asNew.contrib, asNew.tier, asNew.rested])}`);
    });
    // 칸의 모양 자체가 깨진 것(객체여야 할 자리에 글자나 수)과 ext가 객체가 아닌 것
    const odd = read({ ...newOnly(base), ext: { quest: 5, tower: 'x', keepers: 7, rest: null } as Record<string, unknown> });
    if (!same(odd, cases[7].want)) wrong.push('모양이 깨진 새 칸이 처음 상태로 읽히지 않았다');
    const noExt = read({ ...base, ext: 'x' as unknown as Record<string, unknown> });
    if (!same(noExt, expected[0])) wrong.push('ext가 깨져 있으면 옛 칸을 읽어야 한다');
  } catch (err) { threw = String(err); }
  for (const line of wrong) console.log('  ' + line);
  check(threw === '' && wrong.length === 0, `깨진 값(음수, 범위를 넘는 장·단계, 글자, 빈 칸)이 옛 칸에 있든 새 칸에 있든 죽지 않고 같은 범위로 잡힌다${threw ? ` (${threw})` : ''}`);

  // 5시간 쉬고 온 사람이 받는 안내문의 순서가 그대로다: 휴식 보너스가 방치 보상 우편보다 먼저다
  {
    const save = samples[0].save, now = (save.seen ?? 0) + HOURS5;
    const g = new Game({ now: () => now });
    const p = g.players.spawn(save.name, false, structuredClone(save), 'fx-order');
    const keys = g.notices.filter((n) => n.id === p.id).map((n) => n.k);
    check(keys[0] === 'rested' && keys.includes('mailNew') && p.mail.some((m) => m.k === 'idle'), `쉬고 온 사람의 안내문 순서가 그대로다: 휴식 보너스가 먼저, 방치 보상 우편이 뒤 (${keys.join()})`);
    // 휴식 보너스는 처치 경험치에 덧붙는다 (틀의 killBonus를 거친다): 몬스터의 경험치만큼 줄어든다
    const before = p.rested, mon = [...g.ents.values()].find((e) => e.kind === 'm' && e.def && e.def.exp > 0 && e.def.exp < before)!;
    g.notices = [];
    g.fire('monsterKilled', mon, [p]);
    const kill = g.notices.find((n) => n.id === p.id && n.k === 'kill');
    check(g.killBonus.length === 1 && p.rested === before - mon.def!.exp && kill?.a[1] === mon.def!.exp * 2, `휴식 보너스가 남아 있으면 처치 경험치를 그만큼 더 받는다 (남은 보너스 ${before} → ${p.rested})`);
  }

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

// 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (server/net/server.ts의 savePlayer). 틀의 칸(직업, 레벨, 경험치, 골드, 불씨)에 더해
// 게임이 g.rules.touched로 '진행이 있다'고 답한다 (이 게임에서는 퀘스트). 칸을 옮기기 전과 같은 캐릭터가 저장되고 같은 캐릭터가 저장되지 않는다.
{
  const store = new MemoryStore();
  const s = await startServer(0, { store });
  const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');
  /** 접속해서 캐릭터를 손본 뒤 끊는다. 저장됐으면 그 저장을 돌려준다 */
  const visit = async (token: string, touch: (e: Ent, send: (m: Record<string, unknown>) => void) => void): Promise<PlayerSave | null> => {
    const h = await connect(s.port, undefined, token);
    const e = s.game.ents.get(h.id)!;
    touch(e, (m) => h.ws.send(JSON.stringify(m)));
    await sleep(120);
    h.ws.close();
    await until(() => !s.game.ents.has(e.id));
    return store.loadPlayer(keyOf(token));
  };
  const idle = await visit('touch-token-none-0001', () => {});
  const renamed = await visit('touch-token-name-0002', (_e, send) => send({ t: 'rename', name: '이름만바꿈' }));
  const quest = await visit('touch-token-quest-003', (e) => { e.qn = 1; });
  const step = await visit('touch-token-step-0004', (e) => { e.qs = 1; });
  const chapter = await visit('touch-token-chap-0005', (e) => { e.qc = 1; });
  const sparks = await visit('touch-token-spark-006', (e) => { e.sparks = 3; });
  const gold = await visit('touch-token-gold-0007', (e) => { e.gold = 1; });
  // 기여·기여 단계·휴식만 있는 캐릭터는 전에도 저장하지 않았다 (불씨를 바치려면 먼저 사냥해 경험치를 얻으므로 실제로는 생기지 않는 경우다)
  const contrib = await visit('touch-token-contr-008', (e) => { e.contrib = 5; e.tier = 1; e.rested = 40; });
  check(idle === null && contrib === null, '아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (기여·기여 단계·휴식 칸만 있는 것도 전과 같이 세지 않는다)');
  check(renamed?.name === '이름만바꿈', '이름만 바꾼 캐릭터는 저장한다');
  check(quest?.quest?.[2] === 1 && step?.quest?.[1] === 1 && chapter?.quest?.[0] === 1 && (quest?.ext?.quest as number[] | undefined)?.[2] === 1, '퀘스트만 진행한 캐릭터는 저장한다 (진행 수치, 단계, 장 가운데 하나만 있어도)');
  check(sparks?.sparks === 3 && gold?.gold === 1, '불씨만 얻은 캐릭터와 골드만 얻은 캐릭터는 저장한다');
  // 한 번 저장된 캐릭터는 그 뒤로 계속 저장한다: 불씨를 다 바쳐 틀의 칸이 비어도 기여가 남는다
  const offered = await visit('touch-token-spark-006', (e) => { e.contrib += e.sparks; e.sparks = 0; e.unsaved = true; });
  check(offered?.sparks === 0 && offered.contrib === 3 && (offered.ext?.tower as { contrib?: number } | undefined)?.contrib === 3, '불씨를 모두 바친 캐릭터의 기여가 저장된다 (옛 칸과 새 칸 모두)');
  await s.close();

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
  const GAME_FILES = ['server/game/deungbul.ts', ...['tower', 'raid', 'keepers', 'quests', 'rest'].map((n) => `server/game/systems/${n}.ts`)];
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
  check(engine.length >= 30 && importsOf('server/game/deungbul.ts').filter((x) => GAME_FILES.includes(x)).length === 5 && importsOf('server/net/server.ts').includes('server/game/game.ts'), `import 문을 읽어 낸다 (틀의 서버 파일 ${engine.length}개)`);
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
