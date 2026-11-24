// 틀과 게임을 가르는 작업의 안전망 가운데 이 게임(등불지기)의 규칙과 칸에 기대는 것 (docs/framework-plan.md). 틀의 몫은 engine/test/framework.test.ts에 있다.
//   - 내용 계약: 대장간과 잠금 열쇠가 이 게임의 주민을 가리키는가
//   - 저장 왕복: 견본(games/deungbul/test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가 (퀘스트·기여·기여 단계·휴식의 칸, 등탑과 등탑지기 명단)
//   - 저장할 캐릭터: 게임의 진행(퀘스트)만 있는 캐릭터도 저장되는가
//   - 뒤집은 결합: 등탑이 일일 임무를 직접 알리고, 이름 바꾸기가 등탑지기 명단에 닿는가
//   - 확장 지점: 게임이 선언으로 더한 것(사건, 공유 상태, 명령)이 등불지기에는 실행 중에 있고 틀만의 게임에는 없는가
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { FORGES, ITEMS, QUESTS, RESIDENTS, REST, SMITHY, goalCount, needFor, restGain } from '../shared/defs';
import { TOWER } from '../shared/world';
import { type Ent, Game, MemoryStore, type PlayerSave, startServer, type WorldSave } from '@engine/server';
import { check, connect, sleep, until } from '@engine/testing';
import { newGame, startDeungbul } from './game';
import { WebSocket } from 'ws';
import type { ServerMsg } from '@engine/shared';
import { installDeungbul } from '../server/deungbul';
/** 이 게임의 옛 저장의 모양: 틀의 칸에 더해, 칸을 ext로 옮기기 전에 최상위에 있던 이 게임의 칸 넷 (틀의 PlayerSave에는 없다. 읽는 길은 각 시스템의 Saver.legacy) */
type OldSave = PlayerSave & { quest?: [number, number, number]; contrib?: number; tier?: number; rested?: number };

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
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
//   need           다음 레벨까지의 필요 경험치. 저장 값을 읽지 않고 레벨에서 다시 구한다 (needFor): 꾸민 견본 셋은 이 칸이 레벨과 맞지 않게 적혀 있다
//   quest, contrib, tier, rested   옛 최상위 칸. 읽기만 하고 다시 적지 않는다: 견본의 옛 칸은 새로 쓴 저장의 새 칸(ext.quest, ext.tower, ext.keepers, ext.rest)과 견준다
// 견본에 없던 칸(옛 저장의 ext, armor, at 등)은 새로 생기는 것이라 따지지 않는다. 대신 한 번 더 왕복해서 그대로인지 본다.
{
  const samples = fixture<{ note: string; save: OldSave }[]>('players');
  type Bag = Record<string, unknown>;
  type GearSave = { list: { uid: number }[]; worn: Bag; seq: number };
  const nonZero = (o: unknown): Bag => Object.fromEntries(Object.entries((o ?? {}) as Bag).filter(([, v]) => v !== 0));
  /** 비교할 모양으로 다듬는다 (위의 목록) */
  const norm = (s: OldSave): Bag => {
    const { seen: _seen, ext, ...rest } = structuredClone(s);
    const { vitals: _vitals, ...kept } = (ext ?? {}) as Bag;
    if (kept.build) { const b = kept.build as { stats?: unknown; skillLv?: unknown }; kept.build = { stats: nonZero(b.stats), skillLv: b.skillLv ?? {} }; }
    if (kept.gear) { const gear = kept.gear as GearSave; gear.list.sort((x, y) => x.uid - y.uid); }
    return { ...rest, ...(rest.items ? { items: nonZero(rest.items) } : {}), ext: kept };
  };
  /** 견본을 읽어 캐릭터를 만들고 다시 저장한 값 */
  const roundTrip = (save: OldSave, now: number, pid: string): OldSave => {
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
    const OLD_CELLS = ['quest', 'contrib', 'tier', 'rested'];
    for (const k of Object.keys(was)) if (k !== 'ext' && k !== 'need' && !OLD_CELLS.includes(k)) d.push(...diff(was[k], is[k], k));
    d.push(...diff(needFor(save.lv), out.need, 'need (레벨에서 다시 구한 값)'));
    for (const k of Object.keys(wasExt)) {
      if (k !== 'gear') { d.push(...diff(wasExt[k], isExt[k], `ext.${k}`)); continue; }
      const a = wasExt.gear as GearSave, b = isExt.gear as GearSave;
      for (const it of a.list) d.push(...diff(it, b.list.find((x) => x.uid === it.uid), `ext.gear.list[uid ${it.uid}]`));
      for (const slot of Object.keys(a.worn)) d.push(...diff(a.worn[slot], b.worn[slot], `ext.gear.worn.${slot}`));
      if (b.seq < a.seq) d.push(`ext.gear.seq: ${a.seq} > ${b.seq}`);
    }
    // 게임의 칸(퀘스트, 기여, 기여 단계, 휴식)은 ext의 새 칸에만 적힌다. 옛 최상위 칸은 이제 적히지 않는다 (함께 적던 것은 배포 한 번 동안뿐이었다).
    // 견본에 옛 칸으로만 있던 값은 새 칸에 그대로 있어야 한다 (견본에 새 칸도 있으면 위의 ext 비교가 본다: 그때는 새 칸이 이긴다)
    if (OLD_CELLS.some((k) => k in out)) d.push(`옛 최상위 칸이 적혔다 (${OLD_CELLS.filter((k) => k in out).join()})`);
    if ([isExt.quest, isExt.tower, isExt.keepers, isExt.rest].some((v) => v === undefined)) d.push('새 칸(ext.quest, ext.tower, ext.keepers, ext.rest)이 적히지 않았다');
    const moved = { quest: 'quest' in wasExt ? undefined : save.quest, contrib: 'tower' in wasExt ? undefined : save.contrib, tier: 'keepers' in wasExt ? undefined : save.tier, rested: 'rest' in wasExt ? undefined : save.rested };
    const cells = { quest: isExt.quest, contrib: (isExt.tower as { contrib?: unknown } | undefined)?.contrib, tier: (isExt.keepers as { tier?: unknown } | undefined)?.tier, rested: (isExt.rest as { left?: unknown } | undefined)?.left } as Bag;
    for (const [k, v] of Object.entries(moved)) if (v !== undefined) d.push(...diff(v, cells[k], `옛 칸 ${k} → 새 칸`));
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
// 옛 형식(최상위 quest, contrib, tier, rested)도 계속 읽는다. 쓸 때는 새 칸에만 쓴다 (옛 칸에 함께 쓰던 것은 칸을 옮긴 배포 한 번 동안뿐이었다).
// 기대값(games/deungbul/test/fixtures/players-read.json)은 칸을 옮기기 전의 코드가 각 견본을 읽은 상태다: rested5h는 5시간 떠나 있다 왔을 때의 휴식 보너스.
{
  const samples = fixture<{ note: string; save: OldSave }[]>('players');
  const expected = fixture<{ quest: number[]; contrib: number; tier: number; rested: number; rested5h: number }[]>('players-read');
  type Read = { quest: number[]; contrib: number; tier: number; rested: number; told: boolean; out: OldSave };
  /** 저장을 읽은 뒤의 상태. 시계는 저장한 시각에서 gone만큼 지난 때 */
  const read = (save: OldSave, gone = 0): Read => {
    const now = (typeof save.seen === 'number' ? save.seen : noonOf(null)) + gone;
    const g = newGame({ now: () => now });
    const p = g.players.spawn(save.name, false, structuredClone(save), 'fx-cells');
    return { quest: [p.qc, p.qs, p.qn], contrib: p.contrib, tier: p.tier, rested: p.rested, told: g.notices.some((n) => n.id === p.id && n.k === 'rested'), out: structuredClone(g.players.export(p)) };
  };
  const same = (r: Read, e: { quest: number[]; contrib: number; tier: number; rested: number }) => r.quest.join() === e.quest.join() && r.contrib === e.contrib && r.tier === e.tier && r.rested === e.rested;
  /** 옛 최상위 칸을 지운 저장: 지금 코드가 쓰는 모양 */
  const newOnly = (save: OldSave): OldSave => { const { quest: _q, contrib: _c, tier: _t, rested: _r, ...rest } = structuredClone(save); return rest; };
  /** 새 칸의 값을 옛 최상위 칸에도 적은 저장: 옛 칸을 함께 쓰던 배포가 남긴 모양 */
  const both = (save: OldSave): OldSave => { const e = (save.ext ?? {}) as { quest?: [number, number, number]; tower?: { contrib?: number }; keepers?: { tier?: number }; rest?: { left?: number } }; return { ...structuredClone(save), quest: e.quest, contrib: e.tower?.contrib, tier: e.keepers?.tier, rested: e.rest?.left }; };
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
    // 새 코드가 쓴 저장을 다시 읽는다. 옛 최상위 칸은 적히지 않고 새 칸만 적힌다
    const w = first.out;
    if (!same(read(w), e) || read(w, HOURS5).rested !== after5h(e.rested)) bad.push(`${at}: 새로 쓴 저장을 다시 읽은 상태가 다르다`);
    if (['quest', 'contrib', 'tier', 'rested'].some((k) => k in w)) bad.push(`${at}: 옛 최상위 칸이 적혔다`);
    if (JSON.stringify(w) !== JSON.stringify(newOnly(w))) bad.push(`${at}: 새로 쓴 저장이 새 칸만 있는 모양이 아니다`);
    // 옛 칸을 함께 쓰던 배포가 남긴 저장(두 칸에 같은 값)도 같은 상태로 읽히고, 다시 쓰면 옛 칸이 사라진다
    const kept = read(both(w));
    if (!same(kept, e) || read(both(w), HOURS5).rested !== after5h(e.rested)) bad.push(`${at}: 옛 칸과 새 칸이 함께 있는 저장을 읽은 상태가 다르다`);
    if (['quest', 'contrib', 'tier', 'rested'].some((k) => k in kept.out)) bad.push(`${at}: 옛 칸이 함께 있던 저장을 다시 썼는데 옛 칸이 남았다`);
    // 둘 다 있고 값이 다르면 새 칸이 이긴다
    const stale = read({ ...both(w), quest: [1, 1, 1], contrib: 777777, tier: 9, rested: 123 });
    if (!same(stale, e)) bad.push(`${at}: 옛 칸의 값이 새 칸을 이겼다 ${JSON.stringify([stale.quest, stale.contrib, stale.tier, stale.rested])}`);
    const fresh = read({ ...structuredClone(w), ext: { ...w.ext, quest: [1, 2, 0], tower: { contrib: 4321 }, keepers: { tier: 3 }, rest: { left: 77 } } });
    if (!same(fresh, { quest: [1, 2, 0], contrib: 4321, tier: 3, rested: 77 })) bad.push(`${at}: 새 칸의 값이 읽히지 않았다`);
  });
  for (const line of bad) console.log('  ' + line);
  check(expected.length === samples.length && bad.length === 0, `캐릭터 저장 견본 ${samples.length}개: 옛 형식, 새로 쓴 저장(옛 칸은 적히지 않고 새 칸만 적힌다), 두 칸이 함께 있는 저장이 모두 칸을 옮기기 전과 같은 상태로 읽히고, 값이 다르면 새 칸이 이긴다`);

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
      const asOld = read({ ...plain, ...v } as OldSave);
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

// 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (engine/server/net/server.ts의 savePlayer). 틀의 칸(직업, 레벨, 경험치, 골드, 불씨)에 더해
// 게임이 g.rules.touched로 '진행이 있다'고 답한다 (이 게임에서는 퀘스트). 칸을 옮기기 전과 같은 캐릭터가 저장되고 같은 캐릭터가 저장되지 않는다.
{
  const store = new MemoryStore();
  const s = await startDeungbul(0, { store });
  const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');
  /** 접속해서 캐릭터를 손본 뒤 끊는다. 저장됐으면 그 저장을 돌려준다 */
  const visit = async (token: string, touch: (e: Ent, send: (m: Record<string, unknown>) => void) => void): Promise<OldSave | null> => {
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
  const q = (s: OldSave | null) => (s?.ext?.quest ?? []) as number[];
  check(q(quest)[2] === 1 && q(step)[1] === 1 && q(chapter)[0] === 1 && quest?.quest === undefined && step?.quest === undefined && chapter?.quest === undefined, '퀘스트만 진행한 캐릭터는 저장한다 (진행 수치, 단계, 장 가운데 하나만 있어도. 새 칸에만 적힌다)');
  check(sparks?.sparks === 3 && gold?.gold === 1, '불씨만 얻은 캐릭터와 골드만 얻은 캐릭터는 저장한다');
  // 한 번 저장된 캐릭터는 그 뒤로 계속 저장한다: 불씨를 다 바쳐 틀의 칸이 비어도 기여가 남는다
  const offered = await visit('touch-token-spark-006', (e) => { e.contrib += e.sparks; e.sparks = 0; e.unsaved = true; });
  check(offered?.sparks === 0 && offered.contrib === undefined && (offered.ext?.tower as { contrib?: number } | undefined)?.contrib === 3, '불씨를 모두 바친 캐릭터의 기여가 저장된다 (새 칸에만: 옛 최상위 칸은 적히지 않는다)');
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
// 이 게임의 사건·공유 상태·명령·메시지의 타입 선언은 게임의 선언 파일(games/deungbul/shared/deungbul.ts, games/deungbul/server/deungbul.ts)로 옮겼다.
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

// ---------- 개인 상태 통로 (docs/framework-plan.md의 단계 4) ----------
// 본인에게만 보내는 값(이 게임에서는 퀘스트 진행, 기여, 기여 단계, 휴식 보너스)은 그 칸을 맡은 시스템이 g.personal에 등록하고,
// 통신 계층이 { t: 'me', k: 칸의 이름, s: 값 }으로 보낸다: 접속 직후에 전부, 그 뒤로는 바뀐 칸만. 틀은 칸의 이름도 모양도 모른다.
// 옛 화면이 읽던 모양(quest 메시지, stat의 contrib·rested·tier 칸)은 옮긴 배포 한 번 동안만 함께 보냈고, 이제 보내지 않는다 (PROTOCOL 2: 옛 화면은 새로고침 안내를 본다).
{
  type Me = Extract<ServerMsg, { t: 'me' }>;
  /** 틀의 시스템이 등록한 개인 상태의 칸: 가방(systems/bag.ts)과 분해(systems/salvage.ts) */
  const ENGINE_CELLS: readonly string[] = ['bag', 'salvage'];
  /** 접속해서 받은 메시지를 차례로 모은다 (스냅샷은 뺀다) */
  const join = async (port: number, name: string, token?: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`), got: ServerMsg[] = [];
    await new Promise<void>((done, fail) => {
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, token })));
      ws.on('message', (data) => { const m = JSON.parse(data.toString()) as ServerMsg; if (m.t !== 'snap') got.push(m); if (m.t === 'welcome') done(); });
      ws.on('error', fail);
    });
    return {
      ws, got,
      id: (got[0] as Extract<ServerMsg, { t: 'welcome' }>).id,
      // 틀이 스스로 등록한 칸(가방, 분해)은 따로 본다: 아래 검사는 게임과 플러그인이 등록한 칸을 본다
      mine: (from = 0) => got.slice(from).filter((m): m is Me => m.t === 'me' && !ENGINE_CELLS.includes(m.k)),
      own: (from = 0) => got.slice(from).filter((m): m is Me => m.t === 'me' && ENGINE_CELLS.includes(m.k)),
      stats: (from = 0) => got.slice(from).filter((m) => m.t === 'stat') as unknown as Record<string, unknown>[],
      /** 이제는 오지 않아야 하는 옛 quest 메시지 (프로토콜에서 빠졌으므로 글자로 견준다) */
      olds: (from = 0) => got.slice(from).filter((m) => (m.t as string) === 'quest'),
    };
  };
  const BARE_STAT = 't,maxHp,lv,exp,need,sparks,gold,weapon,armor,cls,items';
  /** 서버가 몇 번 내보낼 만큼 기다린다 (0.1초마다 내보낸다) */
  const settle = () => sleep(350);

  // 틀만의 서버: 등록한 칸이 없으니 me를 하나도 보내지 않고, stat에는 틀의 칸만 있다
  {
    const s = await startServer(0, { store: new MemoryStore(), game: { plugins: [] } });
    const c = await join(s.port, '틀개인');
    await until(() => c.stats().length > 0);
    const p = s.game.ents.get(c.id)!;
    c.ws.send(JSON.stringify({ t: 'class', id: 'warrior' }));
    p.gold += 3; p.dirty = true;
    await until(() => c.stats().some((m) => m.gold === 3 && m.cls === 'warrior'));
    await settle();
    check(s.game.personal.map((x) => x.name).join() === ENGINE_CELLS.join() && c.own().map((m) => m.k).join() === ENGINE_CELLS.join() && c.mine().length === 0 && c.olds().length === 0, `틀만의 서버는 틀의 개인 상태(${ENGINE_CELLS.join(', ')})만 보내고, 게임의 칸도 옛 quest 메시지도 보내지 않는다`);
    check(c.stats().length >= 2 && c.stats().every((m) => Object.keys(m).join() === BARE_STAT), `틀만의 서버의 stat에는 게임의 칸(기여, 휴식, 기여 단계)이 없다 (${Object.keys(c.stats()[0]).join()})`);
    c.ws.close();
    await s.close();
  }

  // 이 게임의 서버
  {
    const store = new MemoryStore();
    const s = await startServer(0, { store, game: { plugins: [installDeungbul] } });
    const token = 'personal-token-0001';
    const c = await join(s.port, '개인상태', token);
    await until(() => c.mine().length >= 4);
    await settle();
    const p = s.game.ents.get(c.id)!;
    const first = c.mine();
    check(s.game.personal.map((x) => x.name).filter((k) => !ENGINE_CELLS.includes(k)).join() === 'contrib,quest,tier,rested' && first.map((m) => m.k).join() === 'contrib,quest,tier,rested' && JSON.stringify(first.map((m) => m.s)) === '[0,{"c":0,"s":0,"n":0},0,0]',
      `접속 직후에 등록된 개인 상태를 전부 한 번씩 받는다 (${first.map((m) => m.k).join()})`);
    // stat, meta가 먼저 가고 개인 상태가 그 뒤다: 화면이 퀘스트 창을 다시 쓸 때 불씨 수가 이미 새 값이다 (전에도 quest는 stat 뒤에 갔다)
    const order = c.got.map((m) => m.t).filter((t) => t === 'stat' || t === 'meta' || t === 'me');
    check(order.slice(0, 3).join() === 'stat,meta,me', `한 번 내보낼 때 stat, meta, 개인 상태의 순서다 (${order.slice(0, 3).join()})`);

    // 옛 화면이 읽던 것(quest 메시지, stat의 contrib·rested·tier 칸)은 더 가지 않는다: stat은 틀의 칸뿐이다
    check(Object.keys(c.stats()[0]).join() === BARE_STAT && c.olds().length === 0, '옛 메시지를 끈 뒤: quest 메시지와 stat의 옛 칸은 가지 않는다');

    /** 그 사이에 값이 바뀐 칸만, 한 번씩, 지금 값으로 왔는가 */
    const now = () => ({ contrib: p.contrib, quest: { c: p.qc, s: p.qs, n: p.qn }, tier: p.tier, rested: p.rested }) as Record<string, unknown>;
    const onlyChanged = (before: Record<string, unknown>, from: number): boolean => {
      const after = now(), changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
      const got = c.mine(from);
      return got.length === changed.length && changed.every((k) => got.filter((m) => m.k === k).length === 1 && JSON.stringify(got.find((m) => m.k === k)!.s) === JSON.stringify(after[k]));
    };

    // 바뀌지 않으면 가지 않는다: 골드가 바뀌어 stat이 다시 가도 개인 상태는 가지 않는다
    let at = c.got.length, before = now();
    p.gold += 1; p.dirty = true;
    await until(() => c.stats(at).length > 0);
    await settle();
    check(c.mine(at).length === 0 && c.olds(at).length === 0 && c.stats(at).length === 1, '값이 바뀌지 않으면 개인 상태는 다시 가지 않는다 (stat만 간다)');

    // 불씨를 바친다: 기여가 바뀐다 (퀘스트의 지금 단계가 바치기가 아니면 퀘스트는 가지 않는다)
    at = c.got.length; before = now();
    p.sparks = 300; p.x = TOWER.x + 2; p.z = TOWER.z + 2;
    c.ws.send(JSON.stringify({ t: 'offer', to: 'tower', n: 4 }));
    await until(() => c.mine(at).some((m) => m.k === 'contrib'));
    await settle();
    check(p.contrib === 4 && c.mine(at).some((m) => m.k === 'contrib' && m.s === 4) && onlyChanged(before, at), `불씨를 바치면 바뀐 칸만 한 번 온다 (${c.mine(at).map((m) => `${m.k}=${JSON.stringify(m.s)}`).join(' ')})`);
    check(c.stats(at).some((m) => m.sparks === 296) && c.stats(at).every((m) => Object.keys(m).join() === BARE_STAT) && c.olds(at).length === 0, '바뀐 기여는 개인 상태로만 간다: stat에는 옛 칸이 없고(줄어든 불씨만 실린다) 옛 quest 메시지도 가지 않는다');

    // 기여 단계: 등탑지기 할멈이 돌아와 있으면, 기여가 문턱을 넘을 때 단계가 오른다
    s.game.tower.load({ glow: 55, residents: RESIDENTS.map((r) => r.need) });
    at = c.got.length; before = now();
    c.ws.send(JSON.stringify({ t: 'offer', to: 'tower', n: 8 }));
    await until(() => c.mine(at).some((m) => m.k === 'tier'));
    await settle();
    check(p.contrib === 12 && p.tier === 1 && c.mine(at).some((m) => m.k === 'tier' && m.s === 1) && onlyChanged(before, at), `기여 단계가 오르면 그 칸이 온다 (${c.mine(at).map((m) => `${m.k}=${JSON.stringify(m.s)}`).join(' ')})`);

    // 휴식 보너스와 퀘스트 진행: 값이 달라진 틱에 한 번씩
    at = c.got.length; before = now();
    p.rested = 40; p.qn += 1; p.questDirty = true;
    await until(() => c.mine(at).length >= 2);
    await settle();
    check(onlyChanged(before, at) && c.mine(at).map((m) => m.k).join() === 'quest,rested' && !p.questDirty, '휴식 보너스와 퀘스트 진행도 바뀐 때에 한 번씩 오고, 보낸 뒤에는 퀘스트의 더러움 표시가 지워진다');
    check(c.olds().length === 0 && c.stats().every((m) => Object.keys(m).join() === BARE_STAT), '퀘스트 진행이 바뀌어도 옛 quest 메시지는 가지 않는다 (접속한 뒤 지금까지 한 번도, stat의 옛 칸도)');

    // 다시 접속하면 저장된 값으로 전부 다시 온다
    const want = JSON.stringify([p.contrib, { c: p.qc, s: p.qs, n: p.qn }, p.tier, p.rested]);
    c.ws.close();
    await until(() => !s.game.ents.has(c.id));
    const c2 = await join(s.port, '개인상태', token);
    await until(() => c2.mine().length >= 4);
    await settle();
    check(c2.mine().length === 4 && JSON.stringify(c2.mine().map((m) => m.s)) === want, `다시 접속하면 저장된 값으로 전부 다시 받는다 (${JSON.stringify(c2.mine().map((m) => m.s))})`);
    c2.ws.close();
    await s.close();
  }

  // 개인 상태를 등록하는 예: 틀 + 시험용 플러그인. dirty를 주지 않은 칸은 값이 달라지면, 준 칸은 그것이 참일 때 간다
  {
    const logs = new Map<number, number>();
    let flag = false, cleared = 0;
    const s = await startServer(0, { store: new MemoryStore(), game: { plugins: [(g) => {
      g.personal.push({ name: 'logs', state: (p) => logs.get(p.id) ?? 0 });
      g.personal.push({ name: 'note', state: (p) => ({ lv: p.lv, at: 'camp' }), dirty: () => flag, sent: () => { flag = false; cleared++; } });
    }] } });
    const c = await join(s.port, '장작꾼');
    await until(() => c.mine().length >= 2);
    await settle();
    check(JSON.stringify(c.mine()) === '[{"t":"me","k":"logs","s":0},{"t":"me","k":"note","s":{"lv":1,"at":"camp"}}]' && cleared === 1, `플러그인이 g.personal에 등록한 칸이 접속 직후에 me로 온다 (${JSON.stringify(c.mine())})`);
    let at = c.got.length;
    logs.set(c.id, 7);
    await until(() => c.mine(at).length > 0);
    await settle();
    check(JSON.stringify(c.mine(at)) === '[{"t":"me","k":"logs","s":7}]', '값이 달라진 칸만 다시 온다 (dirty를 주지 않으면 마지막으로 보낸 값과 견준다)');
    at = c.got.length;
    flag = true;
    await until(() => c.mine(at).length > 0);
    await settle();
    check(JSON.stringify(c.mine(at)) === '[{"t":"me","k":"note","s":{"lv":1,"at":"camp"}}]' && cleared === 2 && !flag, 'dirty를 준 칸은 그것이 참일 때 한 번 가고, 보낸 뒤 sent가 불려 표시를 지운다');
    check(c.olds().length === 0 && c.stats().every((m) => Object.keys(m).join() === BARE_STAT), '시험용 플러그인의 서버도 옛 메시지를 보내지 않는다 (옛 모양을 만드는 접점 g.oldMsgs는 없어졌다)');
    c.ws.close();
    await s.close();
  }

  // 틀의 통신 계층과 프로토콜, 틀의 화면 상태에는 이 칸들의 이름이 남아 있지 않다 (npm run typecheck:engine이 잡는 것을 여기서도 글자로 본다)
  {
    const read = (f: string): string => fs.readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
    const left = ['engine/server/net/server.ts', 'engine/shared/protocol.ts', 'engine/client/state.ts'].filter((f) => /\b(contrib|rested|questDirty|qc|qs|qn)\b|\.tier\b|\btier:|'quest'|\bquest:/.test(read(f)));
    check(left.length === 0 && !/onMsg\('(quest|me)'/.test(read('engine/client/main.ts')) && /onMsg\('me'/.test(read('games/deungbul/client/deungbul.ts')),
      `통신 계층·프로토콜·틀의 화면 상태는 퀘스트와 기여의 칸을 이름으로 알지 않고, me 메시지는 이 게임의 모듈이 받는다${left.length ? ` (남은 곳: ${left.join(', ')})` : ''}`);
  }

}

// ---------- 안내문의 분류와 소리: 틀의 표 + 이 게임이 등록한 것 (docs/framework-plan.md의 단계 8) ----------
// 틀의 알림 분류표(engine/client/hud/notify.ts)와 소리 대응표(engine/client/sound.ts)에는 틀의 안내문만 있고, 이 게임의 안내문은 games/deungbul/client/words.ts가 등록한다.
// 둘을 합친 결과가 가르기 전의 표와 같아야 한다: 어느 안내문이 가운데 알림(색조)·흘러가는 알림·대화창에, 어떤 소리로 나오는가.
// (화면 파일은 node에서 불러올 수 없어 소스의 글자를 읽는다.)
{
  const read = (file: string): string => fs.readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const between = (src: string, from: string, to: string): string => { const s = src.indexOf(from), e = src.indexOf(to, s + from.length); return s < 0 || e < 0 ? '' : src.slice(s + from.length, e); };
  const notify = read('engine/client/hud/notify.ts'), sound = read('engine/client/sound.ts'), words = read('games/deungbul/client/words.ts');
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
  const gameKeys = [...(/interface MsgMap \{([\s\S]*?)\n  \}/.exec(read('games/deungbul/shared/deungbul.ts'))?.[1] ?? '').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const isGame = (k: string): boolean => gameKeys.includes(k);
  check(engine.banner.length === 8 && engine.feed.length > 70 && engine.sound.length === 13 && game.banner.length === 9 && game.feed.length === 9 && game.sound.length === 5, `알림 분류표와 소리 대응표를 읽어 낸다 (틀: 가운데 ${engine.banner.length}, 흘러가는 ${engine.feed.length}, 소리 ${engine.sound.length} / 게임: ${game.banner.length}, ${game.feed.length}, ${game.sound.length})`);
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
  check(/^setLocales\(LOCALES\);$/m.test(words) && read('games/deungbul/client/deungbul.ts').includes("from './words'") && read('games/deungbul/client/main.ts').includes("from './deungbul'"),
    '이 게임의 언어 묶음은 게임 모듈이 읽히는 때(import)에 틀에 등록된다: client/main.ts → deungbul.ts → words.ts');
}
