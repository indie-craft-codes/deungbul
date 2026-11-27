// 메아리 계약의 실제 서버 (접속 둘, SQLite 저장): 두 게임(계약의 탑 A, 울림골 B)을 오간다.
//   A에서 뽑기 → 그 메아리가 B의 변신 목록에 → B에서 변신이 다른 접속자에게 보임, B 들판에 동료가 없음, 대화는 두 게임이 하나(모드의 작은 표시),
//   B에서 자동 사냥을 켠 채 A로 → 들판의 대역이 다른 접속자에게 보이고 사냥함, A↔B를 되풀이해도 맞고, 서버를 껐다 켜도 모드·소유·변신이 이어진다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installEchopact } from '../server/echopact';
import { MODE } from '../shared/content/pact';
import { SqliteStore, startServer } from '@engine/server';
import { decodeLook, seededRng, type CharDef, type ModeMe, type ModeSideMe, type MorphMe, type SquadMe, type StageMe } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared';
import { check, connect, removeTemp, until, type Peer } from '@engine/testing';

/** 스냅샷에서 시야에 들어온 엔티티(종류·이름·겉모습)를 모은다 */
const watchEnters = (p: Peer): Map<number, { k: string; name: string; l?: string }> => {
  const out = new Map<number, { k: string; name: string; l?: string }>();
  p.ws.on('message', (data) => { const m = JSON.parse(data.toString()) as ServerMsg; if (m.t === 'snap') for (const e of m.enter ?? []) out.set(e.id, { k: e.kind, name: e.name, l: e.l }); });
  return out;
};
interface Seen { chars: CharDef[]; morph: MorphMe | null; heroes: Record<string, number[]>; squad: SquadMe | null; stage: StageMe | null; mode: ModeMe | null; side: ModeSideMe | null; got: string[]; chat: { name: string; text: string; md?: string; ch?: string }[]; looks: { id: number; l: string }[] }
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me' && m.k === 'chars') s.chars = m.s as CharDef[];
  if (m.t === 'me' && m.k === 'morph') s.morph = m.s as MorphMe;
  if (m.t === 'me' && m.k === 'heroes') s.heroes = m.s as Record<string, number[]>;
  if (m.t === 'me' && m.k === 'squad') s.squad = m.s as SquadMe;
  if (m.t === 'me' && m.k === 'stage') s.stage = m.s as StageMe;
  if (m.t === 'me' && m.k === 'mode') s.mode = m.s as ModeMe;
  if (m.t === 'me' && m.k === 'modeSide') s.side = m.s as ModeSideMe;
  if (m.t === 'gacha') s.got.push(...m.got.map((x) => x.h));
  if (m.t === 'look') s.looks.push({ id: m.id, l: m.l });
};
/** 대화 줄 (시험의 연결은 대화를 따로 모으므로 소켓에서 직접 읽는다: 모드의 표시 md까지) */
const watchChat = (p: Peer, s: Seen): void => { p.ws.on('message', (data) => { const m = JSON.parse(data.toString()) as ServerMsg; if (m.t === 'chat') s.chat.push({ name: m.name, text: m.text, md: m.md, ch: m.ch }); }); };
const fresh = (): Seen => ({ chars: [], morph: null, heroes: {}, squad: null, stage: null, mode: null, side: null, got: [], chat: [], looks: [] });

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
    const g = server.game;
    try {
      const sa = fresh(), sb = fresh();
      const a = await connect(server.port, '여우', TOKEN_A, listen(sa));
      watchChat(a, sa);
      a.send({ t: 'class', id: 'seeker' });
      await until(() => sa.chars.length === 10 && sa.mode?.id === MODE.tower && sa.stage?.run?.state === 'lobby' && (sa.morph?.own.length ?? 0) === 1);
      check(sa.mode?.id === MODE.tower && sa.stage?.run?.state === 'lobby' && sa.morph?.own.join() === 'brindle' && Object.keys(sa.heroes).join() === 'brindle', '처음 접속하면 계약의 탑(A)의 단계 선택에 서고, 처음 메아리가 영웅과 변신 목록에 함께 온다');
      // A에서 10번 뽑는다
      const ea = g.ents.get(a.id)!;
      g.wallet.add(ea, 'sparks', 900, 'test');
      a.send({ t: 'gacha', id: 'well', n: 10 });
      await until(() => sa.got.length === 10 && Object.keys(sa.heroes).length > 1 && (sa.morph?.own.length ?? 0) === Object.keys(sa.heroes).length);
      const heroes = Object.keys(sa.heroes);
      check(heroes.length > 1 && heroes.every((id) => sa.morph!.own.includes(id)), `A의 뽑기 결과(${sa.got.join(', ')})가 B의 변신 목록에 그대로 (${heroes.length})`);
      pick = heroes.filter((id) => id !== 'brindle').sort((x, y) => (sa.heroes[y][1] ?? 0) - (sa.heroes[x][1] ?? 0))[0];
      a.send({ t: 'squad', ids: [pick, 'brindle'] });
      await until(() => sa.squad?.ids.join() === `${pick},brindle`);
      // B: 들판에 들어온 다른 사람
      const b = await connect(server.port, '구경꾼', TOKEN_B, listen(sb));
      watchChat(b, sb);
      const bEnters = watchEnters(b);
      await until(() => sb.mode?.id === MODE.tower);
      b.send({ t: 'mode', id: MODE.vale });
      await until(() => sb.mode?.id === MODE.vale);
      // A도 B(울림골)로: 들판에 동료가 없다
      a.send({ t: 'mode', id: MODE.vale });
      await until(() => sa.mode?.id === MODE.vale && !sa.stage?.run);
      bEnters.clear();
      ea.x = 0; ea.z = 4; ea.tx = 0; ea.tz = 4; g.emit(['r', ea.id]);
      const eb = g.ents.get(b.id)!;
      eb.x = 2; eb.z = 4; eb.tx = 2; eb.tz = 4; g.emit(['r', eb.id]);
      await until(() => b.seen.has(a.id), 8000);
      await new Promise((r) => setTimeout(r, 600));
      const heroesSeen = [...bEnters.values()].filter((e) => e.k === 'hero');
      check(heroesSeen.length === 0 && b.seen.has(a.id) && g.squad.heroes(ea).length === 0, `울림골(B)에서는 편성한 메아리가 따라다니지 않는다 (다른 접속자의 화면에도 동료가 없다)`);
      ea.lastHurt = -999;
      a.send({ t: 'morph', a: 'on', id: pick });
      await until(() => sa.morph?.on === pick && sb.looks.some((x) => x.id === a.id));
      lookA = sb.looks.find((x) => x.id === a.id)?.l ?? '';
      const def = sa.chars.find((d) => d.id === pick)!;
      check(decodeLook(lookA)?.parts.hat === def.look.parts.hat && decodeLook(lookA)?.colors.cloth === def.look.colors.cloth, `B에서 그 메아리로 변신하면 다른 접속자에게 그 겉모습이 간다 ('${lookA}')`);
      // 대화는 두 게임이 하나: B의 사람이 A의 사람에게, A의 사람이 B의 사람에게 (말한 사람의 모드가 함께 간다)
      await new Promise((r) => setTimeout(r, 1100)); // 모드를 바꾼 뒤 1초는 다시 못 바꾼다 (switchCdS)
      b.send({ t: 'mode', id: MODE.tower });
      await until(() => sb.mode?.id === MODE.tower);
      await new Promise((r) => setTimeout(r, 800));
      a.send({ t: 'chat', text: '탑 쪽 들리나요' });
      await until(() => sb.chat.some((c) => c.text === '탑 쪽 들리나요'));
      await new Promise((r) => setTimeout(r, 800));
      b.send({ t: 'chat', text: '네 탑에서 들려요' });
      await until(() => sa.chat.some((c) => c.text === '네 탑에서 들려요'));
      check(sb.chat.find((c) => c.text === '탑 쪽 들리나요')?.md === MODE.vale && sa.chat.find((c) => c.text === '네 탑에서 들려요')?.md === MODE.tower, '전체 대화가 두 게임 사이에 오가고, 줄마다 말한 사람이 있는 게임의 표시(md)가 붙는다');
      await new Promise((r) => setTimeout(r, 800));
      b.send({ t: 'chat', text: '귓말 갑니다', ch: 'w', to: '여우' });
      await until(() => sa.chat.some((c) => c.text === '귓말 갑니다'));
      check(sa.chat.some((c) => c.text === '귓말 갑니다' && c.ch === 'w'), '귓말도 탑(A)에서 울림골(B)로 간다');
      // B에서 자동 사냥을 켠 채 A로: 들판에 대역이 남아 다른 접속자에게 보인다
      await new Promise((r) => setTimeout(r, 1100));
      b.send({ t: 'mode', id: MODE.vale });
      await until(() => sb.mode?.id === MODE.vale);
      g.players.grant(ea, 400, 0);
      eb.x = 18; eb.z = 12; eb.tx = 18; eb.tz = 12; g.emit(['r', eb.id]);
      ea.x = 20; ea.z = 13; ea.tx = 20; ea.tz = 13; g.emit(['r', ea.id]);
      await new Promise((r) => setTimeout(r, 400));
      a.send({ t: 'auto', on: true });
      await new Promise((r) => setTimeout(r, 1300));
      a.send({ t: 'mode', id: MODE.tower });
      await until(() => sa.mode?.id === MODE.tower && !!sa.side?.field, 8000);
      const stand = g.modes.standOf(ea);
      await until(() => !!stand && bEnters.has(stand.id), 8000);
      // 탑에서는 계약자가 보기만 한다: 화면이 보낸 이동(예전에는 화면의 자동 사냥이 들판의 닻으로 걸어가 탑의 구석으로 끌려갔다)이 듣지 않는다
      const atTower = { x: ea.x, z: ea.z };
      a.send({ t: 'move', x: atTower.x - 15, z: atTower.z - 15 });
      await new Promise((r) => setTimeout(r, 600));
      check(Math.hypot(ea.x - atTower.x, ea.z - atTower.z) < 0.01, '탑에서 보낸 이동은 듣지 않는다 (계약자는 싸움터의 가운데에서 보기만 한다)');
      check(!!stand && bEnters.get(stand.id)?.k === 'stand' && bEnters.get(stand.id)?.name === '여우' && bEnters.get(stand.id)?.l === lookA, 'A로 간 사람의 들판의 몸(대역)이 B의 다른 접속자에게 그 이름·변신한 겉모습으로 보인다');
      await until(() => (sa.side?.field?.kills ?? 0) > 0, 20000);
      check((sa.side?.field?.kills ?? 0) > 0 && sa.side!.field!.state !== 'down', `대역이 사냥한 것이 A의 화면의 작은 표시(modeSide)로 온다 (잡은 수 ${sa.side?.field?.kills}, 조각 +${sa.side?.field?.got.sparks})`);
      // A↔B 되풀이
      for (let k = 0; k < 4; k++) {
        const to = sa.mode?.id === MODE.tower ? MODE.vale : MODE.tower;
        await new Promise((r) => setTimeout(r, 1100));
        a.send({ t: 'mode', id: to });
        await until(() => sa.mode?.id === to);
      }
      check(sa.mode?.id === MODE.tower && g.squad.heroes(ea).length === 2 && g.stages.inLobby(ea) && Object.keys(sa.heroes).length === heroes.length, 'A↔B를 네 번 바꿔도 소유·편성이 그대로이고, 탑에서는 편성이 곁에 선다');
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
      await until(() => sa.chars.length === 10 && !!sa.morph && !!sa.squad && !!sa.mode && Object.keys(sa.heroes).length > 1);
      check(Object.keys(sa.heroes).includes(pick) && sa.morph!.own.includes(pick) && sa.squad!.ids.join() === `${pick},brindle`, `다시 켠 서버에서도 메아리(${pick})의 소유·변신 목록·편성이 이어진다`);
      check(sa.morph!.on === pick, '변신도 이어진다');
      a.send({ t: 'mode', id: MODE.vale });
      await until(() => sa.mode?.id === MODE.vale);
      const c = await connect(server.port, '늦은 이', 'token-echopact-net-c-0003');
      const enters = watchEnters(c);
      c.send({ t: 'mode', id: MODE.vale });
      const ea = server.game.ents.get(a.id)!;
      await new Promise((r) => setTimeout(r, 500));
      const ec = server.game.ents.get(c.id)!;
      ea.x = 0; ea.z = 4; server.game.emit(['r', ea.id]);
      ec.x = 2; ec.z = 4; server.game.emit(['r', ec.id]);
      await until(() => enters.has(a.id));
      check(enters.get(a.id)?.l === lookA, '다시 켠 서버에 새로 들어온 사람에게도 변신한 겉모습이 간다 (EnterInfo.l)');
      for (const x of [a, c]) x.ws.close();
    } finally { await server.close(); store.close(); }
  }
} finally { removeTemp(tmp); }
