// 줄 위의 모양(스냅샷): 모듈을 다 고른 게임의 글자는 고르지 않은 모듈의 칸을 빼는 길(Fields)과 플레이어의 값(g.playerSync)을 들인 뒤에도 예전과 같다.
// 예전의 만들기(아래 old*)는 들이기 전의 engine/server/net/snapshot.ts를 그대로 옮긴 것이다: 등불지기처럼 전투를 쓰는 게임의 바이트가 바뀌지 않았음을 견준다.
import type { EnterInfo, Ev } from '../../shared/protocol';
import { CLASSES } from '../../shared/defs';
import { AOI, AOI_LEAVE } from '../../shared/world';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { buildFrame, snapshotFor } from '../../server/net/snapshot';
import { check } from '../harness';

const r2 = (v: number) => Math.round(v * 100) / 100;
/** 예전의 상태 줄 */
const oldState = (e: Ent, vals?: readonly number[]) => {
  let more = '';
  if (vals) for (const v of vals) more += ',' + (typeof v === 'number' && Number.isFinite(v) ? r2(v) : 0);
  return `[${e.id},${r2(e.x)},${r2(e.z)},${r2(e.face)},${e.moving ? 1 : 0},${Math.ceil(e.hp)}${more}]`;
};
/** 예전의 스냅샷 (격자 없이 같은 차례로: 시험의 엔티티는 한 칸 안에 있다) */
function oldSnap(me: Ent, ents: Ent[], sync: (e: Ent) => readonly number[] | undefined, events: Ev[], online: number): string {
  const enter: EnterInfo[] = [], states: string[] = [];
  for (const e of ents) {
    if (e === me || e.dead || e.layer !== me.layer || Math.hypot(e.x - me.x, e.z - me.z) > AOI) continue;
    const info: EnterInfo = { id: e.id, kind: e.kind, type: e.type, name: e.name, w: e.weapon, a: e.armor || undefined, c: e.cls, x: r2(e.x), z: r2(e.z), face: r2(e.face), hp: Math.ceil(e.hp), maxHp: e.maxHp };
    if (e.swarm) info.r = 1;
    if (e.guild) info.g = e.guild;
    enter.push(info);
    states.push(oldState(e, sync(e)));
  }
  let json = `{"t":"snap","n":${online},"you":[${r2(me.x)},${r2(me.z)},${me.moving ? 1 : 0},${Math.ceil(me.hp)},${me.targetId}]`;
  if (enter.length) json += `,"enter":${JSON.stringify(enter)}`;
  json += `,"ents":[${states.join(',')}]`;
  if (events.length) json += `,"ev":${JSON.stringify(events)}`;
  return json + '}';
}

{
  const g = new Game({ plugins: [] });
  const a = g.players.spawn('하나', false), b = g.players.spawn('둘', false);
  // 모두 한 격자 칸(16m) 안에: 새 만들기는 칸의 차례로 훑는다
  a.x = 8; a.z = 8;
  b.cls = Object.keys(CLASSES)[0]; b.armor = 'robe'; b.guild = '등불'; b.face = 1.234; b.moving = true;
  b.x = a.x + 3.333; b.z = a.z - 1.777; b.hp = 87.4;
  const mon = [...g.ents.values()].find((e) => e.kind === 'm')!;
  mon.x = a.x - 4.1; mon.z = a.z + 2.05; mon.layer = a.layer; mon.swarm = true;
  g.defineKind('crate', { sync: (e) => [Number(e.data.n ?? 0), 1.23456] });
  const crate = g.place('crate', { x: a.x + 1, z: a.z + 1, type: 'box', layer: a.layer });
  crate.data.n = 7;
  const ents = [b, mon, crate];
  const sync = (e: Ent) => g.kinds.get(e.kind)?.sync?.(e);
  const events: Ev[] = [['h', a.id, mon.id, 12, 1], ['s', b.id, 'slam', 0]];
  // 새 만들기: 모두 켬(전투가 있는 게임)과 playerSync 없음
  const frame = buildFrame(ents, (e) => (e.kind === 'p' ? g.playerVals?.(e) : sync(e)));
  const now = snapshotFor(a, new Set(), frame, events, 2).json;
  const was = oldSnap(a, ents, sync, events, 2);
  check(now === was, `전투·아이템·직업을 고른 게임의 스냅샷은 예전과 글자까지 같다 (${now.length}바이트)`);
  if (now !== was) console.log(`  새: ${now}\n  옛: ${was}`);
  check(AOI_LEAVE >= AOI, '시야에서 빠지는 반경이 들어오는 반경보다 좁지 않다');

  // 플레이어의 값 (g.playerSync): 남에게는 상태 줄 끝에, 본인에게는 you 끝에
  g.playerSync((p) => [p === b ? 1 : 0, 2.5]);
  const f2 = buildFrame([a, ...ents], (e) => (e.kind === 'p' ? g.playerVals?.(e) : sync(e)));
  const forA = JSON.parse(snapshotFor(a, new Set(), f2, [], 2).json) as { you: number[]; ents: number[][] };
  const forB = JSON.parse(snapshotFor(b, new Set(), f2, [], 2).json) as { you: number[]; ents: number[][] };
  const bLine = forA.ents.find((st) => st[0] === b.id)!;
  check(bLine.length === 8 && bLine[6] === 1 && bLine[7] === 2.5, `다른 사람의 상태 줄 끝에 게임의 값이 붙는다 (${JSON.stringify(bLine)})`);
  check(forA.you.length === 7 && forA.you[5] === 0 && forB.you[5] === 1 && forB.you[6] === 2.5, `본인에게는 you의 끝에 붙는다 (${JSON.stringify(forB.you)})`);
  const mLine = forA.ents.find((st) => st[0] === mon.id)!;
  check(mLine.length === 6, '몬스터의 상태 줄에는 플레이어의 값이 붙지 않는다');
  g.playerSync(null);

  // 고르지 않은 모듈의 칸을 뺀다: 체력(전투), 무기(아이템), 직업(직업)
  const f3 = buildFrame(ents, sync, { hp: false, weapon: false, cls: false });
  const off = JSON.parse(snapshotFor(a, new Set(), f3, [], 2).json) as { enter: Record<string, unknown>[]; ents: number[][] };
  const bIn = off.enter.find((e) => e.id === b.id)!;
  check(!('hp' in bIn) && !('maxHp' in bIn) && !('w' in bIn) && !('c' in bIn) && bIn.a === 'robe' && bIn.g === '등불', `모듈을 고르지 않은 칸은 들어올 때 빠진다 (${Object.keys(bIn).join(',')})`);
  const cLine = off.ents.find((st) => st[0] === crate.id)!;
  check(cLine.length === 7 && cLine[5] === 7 && cLine[6] === 1.23, `체력 칸이 빠진 상태 줄: [id, x, z, 방향, 이동, …값] (${JSON.stringify(cLine)})`);
}
