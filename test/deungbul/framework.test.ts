// 틀과 게임을 가르는 작업의 안전망 가운데 이 게임(등불지기)의 규칙과 칸에 기대는 것 (docs/framework-plan.md). 틀의 몫은 test/framework.test.ts에 있다.
//   - 내용 계약: 대장간과 잠금 열쇠가 이 게임의 주민을 가리키는가
//   - 저장 왕복: 견본(test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가 (퀘스트·기여·기여 단계·휴식의 칸, 등탑과 등탑지기 명단)
//   - 저장할 캐릭터: 게임의 진행(퀘스트)만 있는 캐릭터도 저장되는가
//   - 뒤집은 결합: 등탑이 일일 임무를 직접 알리고, 이름 바꾸기가 등탑지기 명단에 닿는가
//   - 확장 지점: 게임이 선언으로 더한 것(사건, 공유 상태, 명령)이 등불지기에는 실행 중에 있고 틀만의 게임에는 없는가
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { FORGES, ITEMS, QUESTS, RESIDENTS, REST, SMITHY, goalCount, restGain } from '../../shared/defs';
import { TOWER } from '../../shared/world';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { MemoryStore, type PlayerSave, type WorldSave } from '../../server/store';
import { check, connect, sleep, until } from '../harness';
import { newGame, startDeungbul } from './game';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
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

// ---------- 내용 계약: 이 게임의 주민에 묶인 것 (docs/framework-plan.md의 단계 5) ----------
{
  // 대장간: 주민에 묶인 한 곳이 아니라 목록이다. 지금은 대장장이 자리 하나이고 그의 id가 잠금 열쇠다
  const smith = RESIDENTS[0];
  check(FORGES.length === 1 && FORGES[0].x === smith.x && FORGES[0].z === smith.z && FORGES[0].needs === smith.id && SMITHY.x === smith.x && SMITHY.z === smith.z, '대장간 목록에는 대장장이의 자리 하나가 있고, 그가 돌아와야 열린다');
  // 잠금 열쇠는 뜻 없는 문자열이지만, 이 게임의 정의에 적힌 열쇠는 모두 실제 주민이다
  const keys = [...(Object.values(ITEMS) as { needs?: string }[]).map((d) => d.needs), ...FORGES.map((f) => f.needs)].filter((k): k is string => !!k);
  check(keys.length === 4 && keys.every((k) => RESIDENTS.some((r) => r.id === k)), `잠금 열쇠가 모두 주민의 id다 (${[...new Set(keys)].join(', ')})`);
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
    const g = newGame({ now: () => now });
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
  const g = newGame({ now: () => noonOf(null) });
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
    const g = newGame({ now: () => now });
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
    const g = newGame({ now: () => now });
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

}

// 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (server/net/server.ts의 savePlayer). 틀의 칸(직업, 레벨, 경험치, 골드, 불씨)에 더해
// 게임이 g.rules.touched로 '진행이 있다'고 답한다 (이 게임에서는 퀘스트). 칸을 옮기기 전과 같은 캐릭터가 저장되고 같은 캐릭터가 저장되지 않는다.
{
  const store = new MemoryStore();
  const s = await startDeungbul(0, { store });
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
}

// ---------- 월드 저장의 왕복 ----------
// 등탑지기 명단은 날이 바뀌면 비우므로, 시계를 저장된 날에 맞춘다.
{
  const samples = fixture<{ note: string; world: WorldSave; expect?: WorldSave }[]>('worlds');
  const bad: string[] = [];
  samples.forEach(({ world, expect }, i) => {
    const now = noonOf((world.keepers as { day?: unknown } | undefined)?.day);
    const g = newGame({ now: () => now });
    g.importWorld(structuredClone(world));
    const out = structuredClone(g.exportWorld());
    // 옛 형식은 읽으면 지금 형식으로 바뀐다: 견본에 적어 둔 '읽은 뒤의 모습'과 비교한다
    bad.push(...diff(expect ?? world, out).map((x) => `월드 견본 ${i + 1} ${x}`));
    const again = newGame({ now: () => now });
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

// ---------- 뒤집은 결합이 그대로 도는가 (이 게임의 규칙이 깔린 게임) ----------
// 일일 임무는 'offered' 사건을 듣지 않고 등탑이 직접 알린다. 이름 바꾸기는 등탑지기를 직접 부르지 않고 사건으로 알린다.
{
  const now = noonOf(null);
  const g = newGame({ now: () => now });
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
  const bare = new Game({ plugins: [] }), full = newGame();
  check(hooksOf(bare).includes('monsterKilled') && GAME_HOOKS.every((k) => !hooksOf(bare).includes(k)) && GAME_HOOKS.every((k) => hooksOf(full).includes(k)),
    `틀만의 게임은 게임의 사건(바침, 주민 귀환, 습격 승리)을 듣는 곳이 없고, 등불지기에는 있다 (틀: ${hooksOf(bare).join(', ')})`);
  check(bare.shared.length === 0 && Object.keys(bare.state()).length === 0 && Object.keys(full.state()).join() === GAME_STATE.join(),
    `공유 상태의 칸은 게임이 등록한 것뿐이다: 틀만의 게임은 비어 있고 등불지기는 ${Object.keys(full.state()).join(', ')}`);
  check(!bare.commands.has('offer') && full.commands.has('offer') && bare.commands.has('move'), '게임이 더한 명령(바치기)은 틀만의 게임에 없다');
}

// ---------- 안내문의 분류와 소리: 틀의 표 + 이 게임이 등록한 것 (docs/framework-plan.md의 단계 8) ----------
// 틀의 알림 분류표(client/src/hud/notify.ts)와 소리 대응표(client/src/sound.ts)에는 틀의 안내문만 있고, 이 게임의 안내문은 client/src/game/words.ts가 등록한다.
// 둘을 합친 결과가 가르기 전의 표와 같아야 한다: 어느 안내문이 가운데 알림(색조)·흘러가는 알림·대화창에, 어떤 소리로 나오는가.
// (화면 파일은 node에서 불러올 수 없어 소스의 글자를 읽는다.)
{
  const read = (file: string): string => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const between = (src: string, from: string, to: string): string => { const s = src.indexOf(from), e = src.indexOf(to, s + from.length); return s < 0 || e < 0 ? '' : src.slice(s + from.length, e); };
  const notify = read('client/src/hud/notify.ts'), sound = read('client/src/sound.ts'), words = read('client/src/game/words.ts');
  const tones = (src: string): [string, string][] => [...src.matchAll(/(\w+): (?:\{ tone: )?'(good|bad|)'/g)].map((m) => [m[1], m[2]]);
  const quoted = (src: string): string[] => [...src.matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const sounds = (src: string): [string, string][] => [...src.matchAll(/(\w+): sfx\.(\w+)/g)].map((m) => [m[1], m[2]]);
  const engine = {
    banner: tones(between(notify, 'const BANNER: ', '};')),
    feed: quoted(between(notify, 'new Set<MsgKey>([', ']);')),
    sound: sounds(between(sound, 'const BY_MSG', '};')),
  };
  const game = {
    banner: tones(between(words, 'banner: {', '\n    },')),
    feed: quoted(between(words, 'feed: [', ']')),
    sound: sounds(between(words, 'addMsgSounds({', '})')),
  };
  // 가르기 전의 표 (hud/notify.ts의 BANNER·FEED, sound.ts의 BY_MSG에 적혀 있던 그대로)
  const BANNER: Record<string, string> = {
    raidSoon: 'bad', raidElsewhere: 'bad', raidStart: 'bad', raidWon: 'good', raidLost: 'bad', died: 'bad',
    questDone: 'good', levelUp: 'good', residentBack: 'good', towerLit: 'good', stageChanged: '', bossUp: 'bad', bossDown: 'good', dungeonEnter: '', dungeonClear: 'good', dungeonFail: 'bad', awayBack: 'good',
  };
  const FEED = [
    'kill', 'offered', 'bought', 'questStep', 'raidReward', 'tierUp', 'rested', 'classChanged', 'gearDrop', 'gearFull', 'gearSold', 'enhanceOk', 'enhanceFail', 'enhanceMax', 'mailNew', 'mailGot', 'mailLeft', 'marketMailFull', 'marketCrowded', 'chatWait', 'marketNeedLv', 'marketGuest', 'marketFull', 'marketPriceBad', 'marketCant', 'marketPosted', 'marketBought', 'marketGone', 'marketOwn', 'marketCanceled', 'guildGuest', 'guildNeedLv', 'guildNameBad', 'guildNameTaken', 'guildCreated', 'guildNotLeader', 'guildBusy', 'guildFull', 'guildInvited', 'guildJoined', 'guildLeft', 'guildYouLeft', 'guildKicked', 'guildGave', 'guildLevelUp', 'guildNone', 'channelMoved', 'channelDungeon', 'channelFight', 'channelWait', 'channelFull', 'statNone', 'statReset', 'skillUp', 'skillMax', 'skillNeedLv', 'dungeonFar', 'dungeonLevel', 'dungeonNoRuns', 'dungeonLeft',
    'noTarget', 'tooFar', 'offerFar', 'noSparks', 'towerFull', 'noResident', 'shopFar', 'notStocked', 'alreadyBest',
    'potionFull', 'noGold', 'noPotion', 'hpFull', 'classFar', 'renameWait', 'loot', 'crafted', 'forgeFar', 'forgeClosed', 'noMats', 'nameBad', 'nameTaken', 'reported', 'reportWait', 'partyInvited', 'partyBusy', 'partyFull', 'partyGone', 'partyDeclined',
  ];
  const SOUND: Record<string, string> = {
    levelUp: 'fanfare', questDone: 'fanfare', dungeonClear: 'fanfare', raidWon: 'fanfare', residentBack: 'fanfare', bossDown: 'fanfare', enhanceOk: 'fanfare',
    gearDrop: 'pickup', mailNew: 'pickup', loot: 'pickup', bought: 'pickup', crafted: 'pickup', mailGot: 'pickup',
    died: 'bad', dungeonFail: 'bad', raidStart: 'bad', raidLost: 'bad', enhanceFail: 'bad',
  };
  const same = (got: [string, string][], want: Record<string, string>): boolean => got.length === Object.keys(want).length && new Set(got.map(([k]) => k)).size === got.length && got.every(([k, v]) => want[k] === v);
  const gameKeys = [...(/interface MsgMap \{([\s\S]*?)\n  \}/.exec(read('shared/deungbul.ts'))?.[1] ?? '').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const isGame = (k: string): boolean => gameKeys.includes(k);
  check(engine.banner.length === 8 && engine.feed.length > 70 && engine.sound.length === 13 && game.banner.length === 9 && game.feed.length === 8 && game.sound.length === 5, `알림 분류표와 소리 대응표를 읽어 낸다 (틀: 가운데 ${engine.banner.length}, 흘러가는 ${engine.feed.length}, 소리 ${engine.sound.length} / 게임: ${game.banner.length}, ${game.feed.length}, ${game.sound.length})`);
  check(same([...engine.banner, ...game.banner], BANNER), '가운데 알림으로 뜨는 안내문과 그 색조가 가르기 전과 같다 (틀의 표 + 게임이 등록한 것)');
  check([...engine.feed, ...game.feed].sort().join() === [...FEED].sort().join() && new Set([...engine.feed, ...game.feed]).size === FEED.length, `흘러가는 알림으로 뜨는 안내문 ${FEED.length}개가 가르기 전과 같다`);
  check(same([...engine.sound, ...game.sound], SOUND), '안내문마다 나는 소리가 가르기 전과 같다');
  check([...engine.banner, ...engine.sound].every(([k]) => !isGame(k)) && engine.feed.every((k) => !isGame(k)) && [...game.banner, ...game.sound].every(([k]) => isGame(k)) && game.feed.every(isGame),
    '틀의 표에는 틀의 안내문만, 게임의 등록에는 이 게임의 안내문만 있다');
  // 어디에도 분류하지 않은 게임의 안내문은 대화창에만 남는다 (가르기 전에도 그랬다)
  const unsorted = gameKeys.filter((k) => !game.feed.includes(k) && !game.banner.some(([b]) => b === k));
  check(unsorted.join() === 'raidAbandoned', `분류하지 않은 이 게임의 안내문은 대화창에만 남는다: ${unsorted.join(', ')}`);
  check(words.includes("questDone: { tone: 'good', sub: (a) => rules.lockHint(String(a[0])) }") && !notify.includes('rules') && notify.includes('BANNER_SUB[k]?.(a)'), '장을 마쳤을 때 덧붙는 줄(주민을 되돌리는 법)은 게임이 등록한 함수가 만든다: 틀의 알림 코드는 퀘스트를 모른다');
  // 언어 묶음의 등록은 init이 아니라 모듈이 읽히는 때에 한다 (진입점이 모듈의 init보다 먼저 화면의 문장을 채운다)
  check(/^setLocales\(LOCALES\);$/m.test(words) && read('client/src/game/deungbul.ts').includes("from './words'") && read('client/src/modules.ts').includes("from './game/deungbul'"),
    '이 게임의 언어 묶음은 게임 모듈이 읽히는 때(import)에 틀에 등록된다: modules.ts → game/deungbul.ts → game/words.ts');
}
