// 영웅이 많은 편성의 빠른 회귀 검사 (무거운 부하 측정은 npm test에 넣지 않는다: scripts/load.mjs, docs/infra.md '부하와 장시간').
//   1. 사람 13 × 영웅 4 = 영웅 52가 단계(사람마다 따로인 층)와 들판(한곳에 모임)에서 싸우는 동안 틱과 전송 셈(buildFrame·snapshotFor)의 시간이 넉넉한 상한 안이다.
//   2. 틀이 빨라지려고 쓰는 색인이 예전의 셈과 같은 답을 낸다: 층마다의 몬스터(g.monstersIn)는 엔티티 전부를 훑어 고른 것과 같고(차례까지),
//      층마다 나눈 공간 격자의 스냅샷은 한 격자에 모으던 예전의 만들기(아래 oldSnapshot)와 글자까지 같다.
import { CELL, AOI, AOI_LEAVE, SNAP_EVERY, TICK_MS } from '../../shared/world';
import { HERO_IDS, SQUAD_RULES } from '../../shared/defs';
import type { EnterInfo, Ev } from '../../shared/protocol';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { buildFrame, snapshotFor, type Frame } from '../../server/net/snapshot';
import { check, checkEach } from '../harness';
import { heath } from './server/heath';

const r2 = (v: number) => Math.round(v * 100) / 100;
/** 예전(층을 가리지 않는 한 격자)의 스냅샷 만들기: frame의 상태 글자를 그대로 쓰고, 훑는 것만 예전처럼 엔티티 전부에서 */
function oldSnapshot(me: Ent, known: Set<number>, all: readonly Ent[], frame: Frame, events: readonly Ev[], online: number): string {
  const cellOf = (v: number) => Math.floor((v + 4096) / CELL), key = (cx: number, cz: number) => cx * 1024 + cz, REACH = Math.ceil(AOI_LEAVE / CELL);
  const grid = new Map<number, Ent[]>();
  for (const e of all) { if (e.dead) continue; const k = key(cellOf(e.x), cellOf(e.z)); const l = grid.get(k); if (l) l.push(e); else grid.set(k, [e]); }
  const cx = cellOf(me.x), cz = cellOf(me.z), seen = new Set<number>(), ents: string[] = [], enter: EnterInfo[] = [];
  for (let ix = cx - REACH; ix <= cx + REACH; ix++) for (let iz = cz - REACH; iz <= cz + REACH; iz++) {
    for (const e of grid.get(key(ix, iz)) ?? []) {
      if (e === me || e.layer !== me.layer) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z), was = known.has(e.id);
      if (d > (was ? AOI_LEAVE : AOI)) continue;
      seen.add(e.id);
      if (!was) { const f = frame.fields; const info: EnterInfo = { id: e.id, kind: e.kind, type: e.type, name: e.name, w: f.weapon ? e.weapon : undefined, a: e.armor || undefined, c: f.cls ? e.cls : undefined, x: r2(e.x), z: r2(e.z), face: r2(e.face), hp: f.hp ? Math.ceil(e.hp) : undefined, maxHp: f.hp ? e.maxHp : undefined }; if (e.swarm) info.r = 1; if (e.guild) info.g = e.guild; enter.push(info); }
      if (!was || frame.changed.has(e.id)) ents.push(frame.state.get(e.id)!);
    }
  }
  const leave: number[] = [];
  for (const id of known) if (!seen.has(id)) leave.push(id);
  const sees = (id: number) => id === me.id || seen.has(id) || known.has(id);
  const ev = events.length ? events.filter((e) => (e[0] === 'h' ? sees(e[1]) || sees(e[2]) : sees(e[1]))) : [];
  const fight = frame.fields.hp;
  let json = `{"t":"snap","n":${online},"you":[${r2(me.x)},${r2(me.z)},${me.moving ? 1 : 0},${fight ? Math.ceil(me.hp) : 0},${fight ? me.targetId : 0}${frame.more.get(me.id) ?? ''}]`;
  if (enter.length) json += `,"enter":${JSON.stringify(enter)}`;
  if (leave.length) json += `,"leave":[${leave.join(',')}]`;
  json += `,"ents":[${ents.join(',')}]`;
  if (ev.length) json += `,"ev":${JSON.stringify(ev)}`;
  return json + '}';
}

/** 사람 n이 영웅 넷씩 편성하고 ticks만큼 돈다. field면 단계에서 나와 한곳에서 걷는다 */
function play(n: number, ticks: number, field: boolean) {
  let T = Date.UTC(2026, 10, 27, 3);
  const g = new Game({ now: () => T, plugins: [heath] });
  const ids = HERO_IDS.slice(0, SQUAD_RULES.size);
  const people: Ent[] = [];
  for (let i = 0; i < n; i++) {
    const p = g.players.spawn(`H${i}`, false, null, `load-${i}`);
    for (const id of ids) if (!g.roster.owned(p, id)) g.roster.grant(p, id);
    g.squad.set(p, ids);
    if (field) g.command(p, { t: 'stage', a: 'leave' });
    people.push(p);
  }
  const known = people.map(() => new Set<number>()), knownOld = people.map(() => new Set<number>());
  const tickMs: number[] = [], frameMs: number[] = [];
  let mobsSame = true, snapSame = true, snaps = 0, heroes = 0;
  const cx = people[0].x, cz = people[0].z;
  for (let t = 1; t <= ticks; t++) {
    if (field) people.forEach((p, i) => { if ((t + i * 5) % 30 === 0) g.command(p, { t: 'move', x: cx + ((t * 7 + i * 13) % 20) - 10, z: cz + ((t * 3 + i * 11) % 20) - 10 }); });
    T += TICK_MS;
    const a = performance.now();
    g.tick(TICK_MS / 1000);
    tickMs.push(performance.now() - a);
    // 층마다의 몬스터 = 엔티티 전부를 훑어 고른 것 (차례까지)
    const layers = new Set([...g.ents.values()].map((e) => e.layer));
    for (const l of layers) {
      const want = [...g.ents.values()].filter((e) => e.kind === 'm' && e.layer === l).map((e) => e.id).join();
      if (g.monstersIn(l).map((e) => e.id).join() !== want) mobsSame = false;
    }
    if (t % SNAP_EVERY) continue;
    const b = performance.now();
    const frame = buildFrame(g.ents.values(), (e) => (e.kind === 'p' ? g.playerVals?.(e) : g.kinds.get(e.kind)?.sync?.(e)), { hp: g.has('combat'), weapon: g.has('items'), cls: g.has('classes') });
    const events = g.events; g.events = [];
    const out = people.map((p, i) => { const r = snapshotFor(p, known[i], frame, events, n); known[i] = r.seen; return r.json; });
    frameMs.push(performance.now() - b);
    const all = [...g.ents.values()];
    people.forEach((p, i) => {
      const old = oldSnapshot(p, knownOld[i], all, frame, events, n);
      knownOld[i] = new Set(known[i]);
      if (old !== out[i]) snapSame = false;
      snaps++;
    });
    heroes = all.filter((e) => e.kind === 'hero').length;
  }
  const avg = (a: number[]) => a.reduce((v, x) => v + x, 0) / a.length;
  return { g, tick: avg(tickMs), tickMax: Math.max(...tickMs), frame: avg(frameMs), mobsSame, snapSame, snaps, heroes, layers: new Set(people.map((p) => p.layer)).size };
}

checkEach([false, true], (field) => (field ? '들판(한곳에 모임)' : '단계(사람마다 따로인 층)'), (field, c) => {
  const r = play(13, 400, field);
  c(r.heroes >= 52, `사람 13 × 영웅 4 = 영웅 ${r.heroes}이 싸운다 (층 ${r.layers}개)`);
  // 상한은 넉넉히 (이 PC에서 단계 약 0.5ms·0.3ms, 들판 약 0.2ms·0.8ms): 느린 컴퓨터와 바쁜 때에도 흔들리지 않고, 사람 수의 제곱으로 커지던 셈이 돌아오면 걸린다
  c(r.tick < 8, `틱의 평균 계산 시간이 8ms 아래다 (${r.tick.toFixed(2)}ms, 가장 긴 것 ${r.tickMax.toFixed(1)}ms)`);
  c(r.frame < 20, `전송 한 번(사람 13의 스냅샷)을 만드는 평균 시간이 20ms 아래다 (${r.frame.toFixed(2)}ms)`);
  c(r.mobsSame, `층마다의 몬스터(g.monstersIn)가 틱마다 엔티티 전부를 훑어 고른 것과 같다 (차례까지)`);
  c(r.snapSame && r.snaps > 0, `층마다 나눈 격자의 스냅샷 ${r.snaps}개가 한 격자로 만들던 예전 것과 글자까지 같다`);
});

// 단계마다 사람이 따로인 층에 있으면 남의 단계(같은 좌표의 경기장)는 보이지 않는다
{
  const r = play(4, 60, false);
  const people = [...r.g.ents.values()].filter((e) => e.kind === 'p');
  const frame = buildFrame(r.g.ents.values());
  const seenOther = people.some((p) => [...snapshotFor(p, new Set(), frame, [], 4).seen].some((id) => r.g.ents.get(id)!.layer !== p.layer));
  check(!seenOther && r.layers === 4, '단계 넷이 같은 경기장 좌표에서 벌어져도 스냅샷에는 제 층의 엔티티만 든다');
}
