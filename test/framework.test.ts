// 틀과 게임을 가르는 작업의 안전망 (docs/framework-plan.md의 단계 0).
// 구조를 고치다가 맵의 배치가 달라지거나 옛 저장이 다르게 읽히면 여기서 잡힌다.
//   - 맵 지문: buildWorld()가 놓는 장애물·나무·바위와 길찾기 격자가 그대로인가
//   - 저장 왕복: 견본(test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { NavGrid } from '../shared/nav';
import { PROTOCOL } from '../shared/protocol';
import { buildWorld } from '../shared/world';
import { Game } from '../server/game/game';
import { startServer } from '../server/net/server';
import { MemoryStore, type PlayerSave, type WorldSave } from '../server/store';
import { WebSocket } from 'ws';
import { check } from './harness';

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
