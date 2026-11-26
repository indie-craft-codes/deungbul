// 저장 형식의 버전(v)을 들인 뒤에도 옛 저장이 한 글자도 다르지 않게 읽히는가 (engine/server/game/migrate.ts).
// 기대값 fixtures/players-v0-read.json, worlds-v0-read.json은 버전 칸을 들이기 전의 코드(커밋 8ed620f)가 같은 견본(players.json, worlds.json)을
// 같은 난수·시계로 읽어 다시 저장한 값(버전 칸 v·gv는 빼고)과 읽은 직후의 안내문을 글자 그대로 적은 것이다. 만드는 길은 v0read.ts.
// 운영 DB의 저장 59개(2026-11-26 백업의 복사본)도 같은 방법으로 전후가 같음을 따로 확인했다 (복사본은 저장소에 넣지 않는다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteStore, type PlayerSave, type WorldSave } from '@engine/server';
import { check, removeTemp } from '@engine/testing';
import { newGame } from './game';
import { readV0, v0Samples } from './v0read';

const expected = (name: string): string[] => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as string[];
const want = { players: expected('players-v0-read'), worlds: expected('worlds-v0-read') };
const s = v0Samples();
/** 처음으로 다른 글자의 자리 (같으면 -1) */
const firstDiff = (a: string, b: string): number => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };

{
  const got = readV0(s.players, s.worlds);
  const bad = [...got.players.map((x, i) => [`캐릭터 견본 ${i + 1}`, x, want.players[i]]), ...got.worlds.map((x, i) => [`월드 견본 ${i + 1}`, x, want.worlds[i]])].filter(([, a, b]) => a !== b);
  for (const [what, a, b] of bad) { const at = firstDiff(a, b); console.log(`  ${what}: ${at}번째 글자부터 다르다\n    지금 ${a.slice(Math.max(0, at - 40), at + 80)}\n    전   ${b.slice(Math.max(0, at - 40), at + 80)}`); }
  check(got.players.length === 12 && got.worlds.length === 3 && bad.length === 0, `버전 칸이 없는 옛 저장(캐릭터 ${got.players.length}, 월드 ${got.worlds.length})을 읽은 결과가 버전을 들이기 전과 글자까지 같다`);
}

// 옛 DB(스키마 번호가 없고 저장에 버전 칸이 없다)를 지금의 저장소로 열어 읽어도 같다
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-saves-'));
  const file = path.join(dir, 'game.db');
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE players (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  s.players.forEach((p, i) => raw.prepare('INSERT INTO players VALUES (?, ?, ?, ?)').run(`k${String(i).padStart(2, '0')}`, p.name, JSON.stringify(p), 1));
  raw.prepare("INSERT INTO kv VALUES ('world', ?)").run(JSON.stringify(s.worlds[0]));
  raw.close();
  const store = new SqliteStore(file);
  const players = s.players.map((_p, i) => store.loadPlayer(`k${String(i).padStart(2, '0')}`) as PlayerSave);
  const got = readV0(players, [store.loadWorld() as WorldSave]);
  check(store.schemaVersion() >= 1 && players.every((p, i) => JSON.stringify(p) === JSON.stringify(s.players[i])) && got.players.every((x, i) => x === want.players[i]) && got.worlds[0] === want.worlds[0],
    '스키마 번호가 없던 옛 DB를 열면 번호가 붙고, 그 안의 저장은 글자 그대로 나오며, 읽은 결과도 전과 같다');
  // 지금의 코드가 다시 쓴 저장에는 버전이 붙고, 그것을 다시 읽어도 같은 상태다
  const g = newGame({ now: () => 1_795_000_000_000 });
  const p = g.players.spawn(players[0].name, false, players[0], 'k00');
  const out = g.players.export(p);
  store.savePlayer('k00', out);
  const back = store.loadPlayer('k00')!;
  const p2 = newGame({ now: () => 1_795_000_000_000 }).players.spawn(back.name, false, back, 'k00');
  check(back.v === 1 && back.gv === undefined && p2.qc === p.qc && p2.contrib === p.contrib && p2.tier === p.tier && p2.gold === p.gold && p2.lv === p.lv, `다시 쓴 저장에는 틀의 버전(v${back.v})이 붙고(등불지기는 아직 게임의 이전이 없어 gv가 없다), 다시 읽어도 같은 상태다`);
  store.close();
  removeTemp(dir);
}
