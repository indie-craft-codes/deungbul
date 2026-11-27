// 메아리 계약의 실제 서버 (접속 둘, SQLite 저장): 뽑기 → 그 메아리를 편성해 단계에 들어감 → 들판에서 그 메아리로 변신(다른 접속자에게도 보임)
// → 서버를 껐다 켜도(같은 저장 파일) 소유·편성·변신이 이어지고 다시 변신할 수 있다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installEchopact } from '../server/echopact';
import { SqliteStore, startServer } from '@engine/server';
import { decodeLook, seededRng, type CharDef, type MorphMe, type SquadMe, type StageMe } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared';
import { check, connect, removeTemp, until, type Peer } from '@engine/testing';

/** 스냅샷에서 시야에 들어온 사람의 겉모습 글자(EnterInfo.l)를 모은다 */
const watchEnters = (p: Peer): Map<number, string | undefined> => {
  const out = new Map<number, string | undefined>();
  p.ws.on('message', (data) => { const m = JSON.parse(data.toString()) as ServerMsg; if (m.t === 'snap') for (const e of m.enter ?? []) out.set(e.id, e.l); });
  return out;
};
interface Seen { chars: CharDef[]; morph: MorphMe | null; heroes: Record<string, number[]>; squad: SquadMe | null; stage: StageMe | null; got: string[] }
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me' && m.k === 'chars') s.chars = m.s as CharDef[];
  if (m.t === 'me' && m.k === 'morph') s.morph = m.s as MorphMe;
  if (m.t === 'me' && m.k === 'heroes') s.heroes = m.s as Record<string, number[]>;
  if (m.t === 'me' && m.k === 'squad') s.squad = m.s as SquadMe;
  if (m.t === 'me' && m.k === 'stage') s.stage = m.s as StageMe;
  if (m.t === 'gacha') s.got.push(...m.got.map((x) => x.h));
};
const fresh = (): Seen => ({ chars: [], morph: null, heroes: {}, squad: null, stage: null, got: [] });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'echopact-net-'));
const file = path.join(tmp, 'game.db');
const TOKEN_A = 'token-echopact-net-a-0001', TOKEN_B = 'token-echopact-net-b-0002';
let pick = '', lookA = '';
try {
  // ---------- 처음 켬 ----------
  {
    const store = new SqliteStore(file);
    const server = await startServer(0, { store, game: { plugins: [installEchopact] }, backup: false, status: false });
    server.game.gacha.rng = seededRng(5);
    try {
      const sa = fresh(), sb: { looks: { id: number; l: string }[] } = { looks: [] };
      const a = await connect(server.port, '여우', TOKEN_A, listen(sa));
      a.send({ t: 'class', id: 'seeker' });
      await until(() => sa.chars.length === 10 && sa.morph?.own.length === 1 && Object.keys(sa.heroes).length === 1);
      check(sa.chars.length === 10 && sa.morph?.own.join() === 'brindle' && Object.keys(sa.heroes).join() === 'brindle', '접속하면 메아리 정의 열(개인 상태 chars), 처음 메아리가 영웅과 변신에 함께 온다');
      // 울림 조각을 주고 10번 뽑는다
      const ea = server.game.ents.get(a.id)!;
      server.game.wallet.add(ea, 'sparks', 900, 'test');
      a.send({ t: 'gacha', id: 'well', n: 10 });
      await until(() => sa.got.length === 10 && Object.keys(sa.heroes).length > 1 && (sa.morph?.own.length ?? 0) === Object.keys(sa.heroes).length);
      const heroes = Object.keys(sa.heroes);
      check(sa.got.length === 10 && heroes.length > 1 && heroes.every((id) => sa.morph!.own.includes(id)), `뽑기 결과(${sa.got.join(', ')})가 영웅 탭과 변신 탭에 함께 온다 (${heroes.length})`);
      pick = heroes.filter((id) => id !== 'brindle').sort((x, y) => (sa.heroes[y][1] ?? 0) - (sa.heroes[x][1] ?? 0))[0];
      // 그 메아리를 편성해 단계로
      a.send({ t: 'squad', ids: [pick, 'brindle'] });
      a.send({ t: 'stage', a: 'start' });
      await until(() => sa.squad?.ids.join() === `${pick},brindle` && !!sa.stage?.run);
      const inStage = server.game.squad.heroes(ea).some((e) => e.type === pick);
      check(sa.squad?.ids[0] === pick && !!sa.stage?.run && inStage, `뽑은 메아리(${pick})를 편성하고 단계(${sa.stage?.run?.id})에 들어가면 함께 싸운다`);
      a.send({ t: 'stage', a: 'leave' });
      await until(() => !sa.stage?.run);
      ea.lastHurt = -999;
      // 들판에서 변신: 다른 접속자의 화면에도
      const b = await connect(server.port, '구경꾼', TOKEN_B, (m) => { if (m.t === 'look') sb.looks.push({ id: m.id, l: m.l }); });
      const bEnters = watchEnters(b);
      ea.x = 0; ea.z = 4; server.game.emit(['r', ea.id]);
      await until(() => bEnters.has(a.id));
      a.send({ t: 'morph', a: 'on', id: pick });
      await until(() => sa.morph?.on === pick && sb.looks.some((x) => x.id === a.id));
      lookA = sb.looks.find((x) => x.id === a.id)?.l ?? '';
      const def = sa.chars.find((d) => d.id === pick)!;
      check(sa.morph?.on === pick && decodeLook(lookA)?.parts.hat === def.look.parts.hat && decodeLook(lookA)?.colors.cloth === def.look.colors.cloth,
        `들판에서 그 메아리로 변신하면 다른 접속자에게 그 겉모습이 간다 ('${lookA}')`);
      for (const x of [a, b]) x.ws.close();
    } finally { await server.close(); store.close(); }
  }

  // ---------- 껐다 켬 (같은 저장 파일) ----------
  {
    const store = new SqliteStore(file);
    const server = await startServer(0, { store, game: { plugins: [installEchopact] }, backup: false, status: false });
    try {
      const sa = fresh();
      const a = await connect(server.port, '여우', TOKEN_A, listen(sa));
      await until(() => sa.chars.length === 10 && !!sa.morph && !!sa.squad && Object.keys(sa.heroes).length > 1);
      check(Object.keys(sa.heroes).includes(pick) && sa.morph!.own.includes(pick) && sa.squad!.ids.join() === `${pick},brindle`, `다시 켠 서버에서도 메아리(${pick})의 소유·변신의 소유·편성이 이어진다`);
      check(sa.morph!.on === pick && (sa.morph!.left ?? 0) > 0, `변신도 남은 시간(${sa.morph!.left}초) 동안 이어진다`);
      const c = await connect(server.port, '늦은 이', 'token-echopact-net-c-0003');
      const enters = watchEnters(c);
      const ea = server.game.ents.get(a.id)!;
      ea.x = 0; ea.z = 4; server.game.emit(['r', ea.id]);
      await until(() => enters.has(a.id));
      check(enters.get(a.id) === lookA, '다시 켠 서버에 새로 들어온 사람에게도 변신한 겉모습이 간다 (EnterInfo.l)');
      // 풀고 대기가 끝나면 다시 변신할 수 있다
      a.send({ t: 'morph', a: 'off' });
      await until(() => sa.morph?.on === '');
      ea.morph.cdUntil = 0; ea.lastHurt = -999;
      a.send({ t: 'morph', a: 'on', id: 'brindle' });
      await until(() => sa.morph?.on === 'brindle');
      check(sa.morph?.on === 'brindle', '다시 켠 뒤에도 가진 다른 메아리로 변신할 수 있다');
      for (const x of [a, c]) x.ws.close();
    } finally { await server.close(); store.close(); }
  }
} finally { removeTemp(tmp); }
