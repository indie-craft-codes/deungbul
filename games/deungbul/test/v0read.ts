// 저장 형식 v0(버전 칸이 없던 저장)을 읽은 결과를 만든다: 견본마다 캐릭터·월드를 읽어 다시 저장한 값과 읽은 직후의 안내문.
// 난수와 시계를 고정해 같은 코드면 같은 글자가 나온다. 기대값(fixtures/players-v0-read.json, worlds-v0-read.json)은
// 버전 칸을 들이기 전의 코드(커밋 8ed620f)가 이것으로 만든 것이다(--write). 시험은 saves.test.ts.
import fs from 'node:fs';
import type { PlayerSave, WorldSave } from '@engine/server';
import { newGame } from './game';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
/** 정해진 씨앗의 난수 (mulberry32) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 버전 칸(v, gv)은 비교에서 뺀다: 들인 뒤의 저장에만 있는 칸이다 */
const strip = (o: Record<string, unknown>): Record<string, unknown> => { const { v: _v, gv: _gv, ...rest } = o; return rest; };
/**
 * 기대값은 한국 시각(Asia/Seoul)의 PC에서 만들었다: 일일 임무의 날(등불지기의 RESET은 서버 PC의 현지 자정)과 아래의 정오가 시간대를 따른다.
 * 그래서 읽는 동안만 그 시간대로 두고 끝나면 처음 시간대로 되돌린다 (서버 PC가 UTC여도 같은 글자가 나오게. Windows의 node는 TZ를 지워도 되돌아가지 않아 이름을 적는다)
 */
const FIXTURE_TZ = 'Asia/Seoul';

export function readV0(saves: PlayerSave[], worlds: WorldSave[], gone = 5 * 3600000): { players: string[]; worlds: string[] } {
  const real = Math.random, tz = process.env.TZ, zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = FIXTURE_TZ;
  const NOW = new Date(2026, 10, 20, 12).getTime();
  try {
    const players = saves.map((save, i) => {
      Math.random = seeded(1000 + i);
      const now = (typeof save.seen === 'number' ? save.seen : NOW) + gone;
      const g = newGame({ now: () => now });
      const p = g.players.spawn(save.name, false, structuredClone(save), `v0-${i}`);
      const told = g.notices.filter((n) => n.id === p.id).map((n) => [n.k, n.a]);
      return JSON.stringify({ out: strip(g.players.export(p) as Record<string, unknown>), told, hp: p.hp, maxHp: p.maxHp });
    });
    const ws = worlds.map((w, i) => {
      Math.random = seeded(2000 + i);
      const g = newGame({ now: () => NOW });
      g.importWorld(structuredClone(w));
      return JSON.stringify({ out: strip(g.exportWorld()), state: g.state() });
    });
    return { players, worlds: ws };
  } finally { Math.random = real; process.env.TZ = tz ?? zone; }
}

export const v0Samples = () => ({
  players: fixture<{ save: PlayerSave }[]>('players').map((s) => s.save),
  worlds: fixture<{ world: WorldSave }[]>('worlds').map((s) => s.world),
});

// 명령줄: --write를 주면 기대값 파일을 다시 만든다. 기대값은 '버전 칸을 들이기 전의 코드'가 만든 것이어야 뜻이 있으므로, 지금의 코드로는 다시 만들지 않는다
// (그 커밋을 꺼내 거기서 돌린다). --write 없이 부르면 지금의 코드가 기대값과 같은지만 찍는다
if (process.argv[1] && process.argv[1].endsWith('v0read.ts')) {
  const s = v0Samples(), r = readV0(s.players, s.worlds);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(new URL('./fixtures/players-v0-read.json', import.meta.url), JSON.stringify(r.players, null, 1) + '\n');
    fs.writeFileSync(new URL('./fixtures/worlds-v0-read.json', import.meta.url), JSON.stringify(r.worlds, null, 1) + '\n');
    console.log(`적었다: 캐릭터 ${r.players.length}, 월드 ${r.worlds.length}`);
  } else {
    const read = (n: string) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')) as string[];
    const pw = read('players-v0-read'), ww = read('worlds-v0-read');
    console.log(`캐릭터 ${r.players.filter((x, i) => x === pw[i]).length}/${pw.length}, 월드 ${r.worlds.filter((x, i) => x === ww[i]).length}/${ww.length}가 기대값과 같다`);
  }
}
