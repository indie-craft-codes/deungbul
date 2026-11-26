// 돌담 마을의 시험: 내용, 물결의 시작, 우물이 받는 피해, 막아 냄과 무너짐, 보상의 나눔, 고치기와 되살리기, 저장, 실제 접속.
// 실행: npm run test:bastion (tsx --tsconfig games/bastion/tsconfig.json)
import { CLASSES, MONSTERS, SKILL_DEFS } from '../shared/content';
import { WAVE, WELL, waveReward, waveSize } from '../shared/content/waves';
import { bastion } from '../server/bastion';
import { type Ent, Game, MemoryStore, startServer } from '@engine/server';
import type { ServerMsg } from '@engine/shared';
import { check, connect, until } from '@engine/testing';

// ---------- 내용 ----------
{
  const kinds = Object.values(CLASSES).map((c) => c.skills.map((s) => SKILL_DEFS[s].effect as { kind: string; slow?: number; stun?: number }));
  check(Object.keys(CLASSES).length === 2 && kinds.every((k) => k.length === 3 && k.some((e) => e.kind === 'area') && k.some((e) => !!e.slow || !!e.stun) && k.some((e) => e.kind === 'buff')),
    '직업 둘, 저마다 기술 셋: 범위, 느려짐이나 기절, 강화를 하나씩 갖는다');
  check(Object.keys(MONSTERS).length === 4 && Object.values(MONSTERS).some((m) => 'behavior' in m && m.behavior === 'ranged'), '몬스터 넷, 그 가운데 하나는 멀리서 쏜다');
  check(waveSize(2, 1) > waveSize(1, 1) && waveSize(1, 3) > waveSize(1, 1) && waveReward(1, 2).gold * 2 <= WAVE.poolBase + WAVE.poolPerWave, '물결이 뒤로 갈수록, 사람이 많을수록 적이 많고, 보상은 싸운 사람이 나눈다');
}

// ---------- 규칙만 (서버 없이) ----------
{
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [bastion({ intervalS: 20, firstS: 25 })], now: () => clock });
  const run = (seconds: number, until?: () => boolean) => { for (let i = 0; i < seconds * 20; i++) { clock += 50; g.tick(0.05); if (until?.()) return true; } return false; };
  const p = g.players.spawn('담지기하나', false), q = g.players.spawn('약초꾼둘', false);
  const heard = (k: string) => g.announces.filter((a) => a.k === k);
  const said = (e: Ent, k: string) => g.notices.filter((n) => n.id === e.id && n.k === k);
  const cmd = (e: Ent, m: Record<string, unknown>) => { g.notices = []; g.command(e, m); };
  const at = (e: Ent, x: number, z: number) => { e.x = x; e.z = z; e.moving = false; e.path = null; e.targetId = 0; };
  /** 그 적을 쓰러뜨릴 때까지 e가 싸운다 (체력을 깎아 두어 금방 끝낸다) */
  const strike = (e: Ent, m: Ent) => { m.hp = 1; at(e, m.x + 1, m.z); e.hp = e.maxHp; cmd(e, { t: 'attack', id: m.id }); for (let i = 0; i < 60 && !m.dead && g.ents.has(m.id); i++) { clock += 50; g.tick(0.05); } };
  const w = g.waves;

  check(g.rules.siege?.x === WELL.x && g.rules.siege?.z === WELL.z && w.phase === 'idle' && g.state().defense.left === 25 && g.state().defense.hp === WAVE.gateHp, '처음에는 물결 사이: 우물이 가득하고 첫 물결까지 초읽기가 흐른다 (몰려온 적의 목표는 우물)');
  at(p, WELL.x, WELL.z + 4); at(q, WELL.x + 3, WELL.z + 3);
  g.announces = [];
  run(6);
  check(w.phase === 'soon' && heard('waveSoon').length === 1 && heard('waveSoon')[0].a[0] === 1, '시작 전에 곧 온다고 모두에게 알린다');
  // 물결 사이에 고치기: 멀쩡하면 고칠 것이 없다
  cmd(p, { t: 'repair', n: 1 });
  check(said(p, 'repairFull').length === 1, '우물이 멀쩡하면 고칠 것이 없다');

  // ----- 물결 시작 -----
  run(25, () => w.phase === 'active');
  const size1 = waveSize(1, 2);
  check(w.phase === 'active' && w.total === size1 && heard('waveStart').some((a) => a.a[0] === 1 && a.a[1] === size1), `물결이 때가 되면 시작한다: 1번째, 적 ${size1} (두 사람 몫)`);
  run(size1 * WAVE.gapS + 0.5);
  const foes = w.foes();
  check(foes.length === size1 && foes.every((m) => m.swarm && Math.hypot(m.hx - WELL.x, m.hz - WELL.z) > 20), '적은 마을 바깥에서 하나씩 나타난다 (몰려온 적)');
  cmd(p, { t: 'repair', n: 1 });
  check(said(p, 'repairBusy').length === 1, '싸우는 동안에는 고칠 수 없다');

  // ----- 우물이 피해를 받는다 -----
  const reached = run(60, () => w.hp < WAVE.gateHp - 20);
  check(reached && foes.some((m) => g.monsters.atSiege(m)) && g.state().defense.hp < WAVE.gateHp, `적이 길을 찾아 돌담의 문으로 들어와 우물에 붙어 내구를 깎는다 (내구 ${Math.ceil(w.hp)})`);

  // ----- 막아 냄: 두 사람이 함께 싸우고 보상을 나눈다 -----
  const gold0 = p.gold, gold1 = q.gold;
  g.announces = [];
  for (const [i, m] of w.foes().entries()) strike(i % 2 ? q : p, m);
  run(2, () => w.phase !== 'active');
  const share = waveReward(1, 2);
  const killGold = (e: Ent, before: number) => e.gold - before;
  check((w.phase === 'idle' || w.phase === 'soon') && w.wave === 2 && heard('waveWon').some((a) => a.a[0] === 1 && a.a[1] === 2), '적을 다 쓰러뜨리면 물결을 막아 낸다: 다음은 2번째');
  check(g.notices.filter((n) => n.k === 'waveReward' && n.a[0] === share.gold).length === 2 && killGold(p, gold0) >= share.gold && killGold(q, gold1) >= share.gold && p.held === 1 && q.held === 1,
    `함께 싸운 두 사람이 보상을 나눈다: 저마다 골드 ${share.gold}(모두 ${WAVE.poolBase + WAVE.poolPerWave}을 반씩), 경험치 ${share.exp}`);
  check(p.daily.prog.defend1 === 1, "일일 임무 '물결 하나 막아 내기'가 세어진다");
  check(w.foes().length === 0 && g.state().defense.left === 20, '다음 물결까지의 초읽기가 다시 흐른다');

  // ----- 고치기 -----
  const hp0 = w.hp;
  at(p, 30, 30); p.gold = 100;
  cmd(p, { t: 'repair', n: 1 });
  check(said(p, 'repairFar').length === 1 && w.hp === hp0 && p.gold === 100, '우물에서 멀면 고칠 수 없다');
  at(p, WELL.x, WELL.z + 4); p.gold = 5;
  cmd(p, { t: 'repair', n: 1 });
  check(said(p, 'repairPoor').length === 1 && w.hp === hp0, '골드가 모자라면 고칠 수 없다');
  p.gold = 100;
  cmd(p, { t: 'repair', n: 2 }); cmd(p, { t: 'repair', n: 1.5 }); cmd(p, { t: 'repair', n: -3 }); cmd(p, { t: 'repair' });
  const want = Math.min(2, Math.ceil((WAVE.gateHp - hp0) / WAVE.repairHp));
  check(p.gold === 100 - want * WAVE.repairGold && Math.ceil(w.hp) === Math.min(WAVE.gateHp, Math.ceil(hp0 + want * WAVE.repairHp)), `우물 곁에서 골드를 내면 내구가 찬다: ${want}번 고침 (잘못된 수는 무시)`);
  p.gold = 10_000;
  cmd(p, { t: 'repair', n: 999 });
  check(w.hp === WAVE.gateHp && p.gold > 10_000 - 999 * WAVE.repairGold, '많이 고치려 해도 가득 찰 만큼만 낸다');

  // ----- 무너짐: 2번째 물결, 사람이 싸우지 않으면 우물이 무너진다 -----
  at(p, 40, 40); at(q, 40, 41);
  g.announces = [];
  w.start();
  run(3);
  const strong = w.foes();
  check(strong.length > 0 && strong.every((m) => m.maxHp === Math.round(MONSTERS[m.type as keyof typeof MONSTERS].hp * (1 + WAVE.hpPerWave))) && w.total === waveSize(2, 2), '물결이 뒤로 갈수록 적이 많고 단단하다 (2번째: 체력 +15%)');
  w.hp = 15;
  const fell = run(120, () => w.phase === 'broken');
  check(fell && heard('waveLost').some((a) => a.a[0] === 2) && w.foes().length === 0 && w.wave === 2 && g.state().defense.hp === 0, '우물의 내구가 다하면 그 물결은 진다: 남은 적은 물러가고, 같은 물결을 다시 막아야 한다');
  check(p.held === 1 && !g.notices.some((n) => n.k === 'waveReward'), '진 물결에는 보상이 없다');
  at(p, WELL.x, WELL.z + 4);
  cmd(p, { t: 'repair', n: 1 });
  check(said(p, 'gateBroken').length === 1, '무너진 우물은 고치기 전에 되살려야 한다');
  p.gold = 50;
  cmd(p, { t: 'restore' });
  check(said(p, 'repairPoor').length === 1 && w.phase === 'broken', '되살릴 골드가 모자라면 그대로다');
  p.gold = 500;
  g.announces = [];
  cmd(p, { t: 'restore' });
  check(w.phase === 'idle' && w.hp === WAVE.gateHp && p.gold === 500 - WAVE.restoreGold && heard('gateRestored').some((a) => a.a[0] === p.name), '우물 곁에서 골드를 내면 바로 가득 되살린다');

  // 또 무너지고, 이번에는 시간이 지나 저절로 절반으로
  w.start(); run(2); w.hp = 1;
  run(60, () => w.phase === 'broken');
  run(WAVE.restoreS + 1, () => w.phase !== 'broken');
  check(w.phase === 'idle' && w.hp === Math.round(WAVE.gateHp * WAVE.restoreFrac) && g.state().defense.left > 0, `무너진 우물은 ${WAVE.restoreS}초 뒤 저절로 절반으로 되살아나고 초읽기가 다시 흐른다`);

  // 저장 왕복: 물결의 번호와 우물의 내구, 막아 낸 수
  const save = JSON.parse(JSON.stringify(g.players.export(p))), world = JSON.parse(JSON.stringify(g.exportWorld()));
  const g2 = new Game({ plugins: [bastion()], now: () => clock });
  g2.importWorld(world);
  const r = g2.players.spawn(save.name, false, save, 'pid');
  check(g2.waves.wave === 2 && g2.waves.hp === w.hp && r.held === 1 && save.ext.waves.held === 1, '저장했다 읽으면 물결의 번호, 우물의 내구, 막아 낸 물결이 그대로다');

  // 사람이 없으면 물결을 열지 않는다
  const g3 = new Game({ plugins: [bastion({ intervalS: 5, firstS: 1 })], now: () => clock });
  for (let i = 0; i < 40; i++) { clock += 50; g3.tick(0.05); }
  check(g3.waves.phase !== 'active' && g3.waves.foes().length === 0 && g3.waves.wave === 1, '들판에 아무도 없으면 물결을 열지 않고 미룬다');
}

// ---------- 서버를 띄워서: 접속하면 물결의 상태가 온다 ----------
{
  const store = new MemoryStore();
  const server = await startServer(0, { store, game: { plugins: [bastion({ intervalS: 30, firstS: 2 })] } });
  const seen = { phase: '', left: -1, hp: -1, foes: 0 };
  const onMsg = (m: ServerMsg) => { if (m.t === 'world') Object.assign(seen, m.s.defense); };
  const a = await connect(server.port, '파수꾼', 'token-bastion-test-0001', onMsg);
  check(await until(() => seen.hp === WAVE.gateHp && seen.left >= 0), '접속하면 우물의 내구와 초읽기가 온다');
  check(await until(() => seen.phase === 'active' && seen.foes > 0, 20_000) && a.sys.some((s) => s.startsWith('waveStart:1')), '때가 되면 접속한 사람에게 물결이 시작됐다고 알린다');
  a.ws.close();
  await server.close();
}
