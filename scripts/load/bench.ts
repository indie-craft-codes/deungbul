// 한 프로세스 안의 틱·전송 셈 측정 (통신 없이): 게임을 만들고 사람 N을 넣어 정해진 시계·난수로 틱을 돌리며,
// 두 틱마다 사람마다의 스냅샷(buildFrame·snapshotFor, 서버와 같은 함수)을 만든다. 틱과 스냅샷의 시간을 따로 재고,
// 모든 스냅샷 글자와 끝의 엔티티를 sha256 하나로 묶어 찍는다: 틀을 고친 전후에 같은 지문이면 게임의 결과와 줄 위의 글자가 같다.
//   node --import tsx scripts/load/bench.ts '<JSON 설정>'   (TSX_TSCONFIG_PATH=그 게임의 tsconfig. scripts/load.mjs bench …가 부른다)
// 설정: { game, people, squad, mode: 'stage'|'field', ticks, seed }
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cfg = JSON.parse(process.argv[2]) as { game: string; people: number; squad: number; mode: string; ticks: number; seed?: number };
const root = process.cwd();
const imp = (f: string) => import(pathToFileURL(path.join(root, f)).href);

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
Math.random = seeded(cfg.seed ?? 20261126);
let T = new Date(2026, 10, 27, 12, 0, 0).getTime();
const now = () => T;

const PLUGINS: Record<string, [string, string]> = {
  deungbul: ['games/deungbul/server/deungbul.ts', 'installDeungbul'],
  dalmuri: ['games/dalmuri/server/dalmuri.ts', 'installDalmuri'],
  collect: ['engine/test/collect/server/heath.ts', 'heath'],
  rollball: ['games/rollball/server/rollball.ts', 'installRollball'],
};
const [file, fn] = PLUGINS[cfg.game];
const mod = await imp(file);
const { Game } = await imp('engine/server/game/game.ts');
const { buildFrame, snapshotFor } = await imp('engine/server/net/snapshot.ts');
const { TICK_MS, SNAP_EVERY } = await imp('engine/shared/world.ts');
const defs = await imp('engine/shared/defs.ts');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = any; type E = any;
const heroIds: string[] = defs.HERO_IDS ?? [];
if (cfg.squad > 0 && defs.SQUAD_RULES) defs.SQUAD_RULES.size = Math.min(cfg.squad, heroIds.length);
const loadPlugin = (g: G) => {
  let i = 0;
  g.on('playerJoined', (p: E) => {
    if (g.has('classes') && p.cls === '' && defs.CLASS_IDS.length) g.classes.choose(p, defs.CLASS_IDS[i++ % defs.CLASS_IDS.length]);
    if (cfg.squad > 0 && g.has('squad')) { const ids = heroIds.slice(0, defs.SQUAD_RULES.size); for (const id of ids) if (!g.roster.owned(p, id)) g.roster.grant(p, id); g.squad.set(p, ids); }
  });
};
const g: G = new Game({ now, plugins: [(x: G) => (fn === 'installDeungbul' ? mod[fn](x, {}) : mod[fn](x)), loadPlugin] });
const people: E[] = [];
for (let i = 0; i < cfg.people; i++) people.push(g.players.spawn(`B${i}`, false, null, `bench-${i}`));
const cx = people[0]?.x ?? 0, cz = people[0]?.z ?? 0;
if (cfg.mode !== 'stage' && g.has('stages')) for (const p of people) g.command(p, { t: 'stage', a: 'leave' });

const hash = crypto.createHash('sha256');
const known = people.map(() => new Set<number>());
const fields = { hp: g.has('combat'), weapon: g.has('items'), cls: g.has('classes') };
const tickMs: number[] = [], snapMs: number[] = [];
let bytes = 0;
for (let tick = 1; tick <= cfg.ticks; tick++) {
  if (cfg.mode !== 'stage') people.forEach((p, i) => { if ((tick + i * 7) % 40 === 0) g.command(p, { t: 'move', x: cx + (Math.random() - 0.5) * 28, z: cz + (Math.random() - 0.5) * 28 }); });
  T += TICK_MS;
  const t0 = performance.now();
  g.tick(TICK_MS / 1000);
  tickMs.push(performance.now() - t0);
  if (tick % SNAP_EVERY === 0) {
    const t1 = performance.now();
    const frame = buildFrame(g.ents.values(), (e: E) => (e.kind === 'p' ? g.playerVals?.(e) : g.kinds.get(e.kind)?.sync?.(e)), fields);
    const events = g.events; g.events = [];
    const out: string[] = [];
    people.forEach((p, i) => { if (g.ents.get(p.id) !== p) return; const { json, seen } = snapshotFor(p, known[i], frame, events, people.length); known[i] = seen; out.push(json); });
    snapMs.push(performance.now() - t1);
    for (const s of out) { hash.update(s); bytes += s.length; }
    g.notices = []; g.cdAcks = []; g.announces = []; g.itemCds = []; g.gears = []; g.partyOut = []; g.out = []; g.casts = [];
  }
}
const dump = (e: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.keys(e).sort().filter((k) => k !== 'def').map((k) => [k, e[k] instanceof Set || e[k] instanceof Map ? [...(e[k] as Iterable<unknown>)] : e[k]])));
for (const e of g.ents.values()) hash.update(dump(e));
for (const p of people) hash.update(JSON.stringify(g.players.export(p)));
const st = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return `${(s.reduce((v, x) => v + x, 0) / s.length).toFixed(3)} / ${s[Math.floor(s.length * 0.95)].toFixed(3)} / ${s[s.length - 1].toFixed(2)}`; };
const kinds: Record<string, number> = {};
for (const e of g.ents.values()) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
console.log(JSON.stringify({ game: cfg.game, people: cfg.people, squad: g.has('squad') ? defs.SQUAD_RULES.size : 0, mode: cfg.mode, ticks: cfg.ticks, kinds, tick: st(tickMs), snap: st(snapMs), kb: Math.round(bytes / 1024), sha: hash.digest('hex').slice(0, 16) }));
