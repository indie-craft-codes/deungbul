// 등탑지기의 일: 오늘의 명단과 기여 단계, 가득 찬 등탑에 바치기 (서버 없이 게임 규칙만 돌린다)
import { TOWER } from '../shared/world';
import { newGame } from './game';
import { check } from '@engine/testing';

{
  let clock = new Date(2026, 10, 23, 15, 0, 0).getTime();
  const g = newGame({ now: () => clock });
  const p = g.players.spawn('지킴이', false, null, 'keeper-key'); // 명단은 저장 키로 사람을 구분한다 (손님은 오르지 않는다)
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => `${n.k}:${n.a.join(',')}`);
  const offer = (to: string, n: number) => { g.notices = []; p.x = TOWER.x + 2; p.z = TOWER.z + 2; g.command(p, { t: 'offer', to, n }); };
  p.sparks = 500;

  offer('tower', 15);
  check(p.contrib === 15 && p.tier === 0 && p.gold === 0 && g.state().keepers.length === 0, '할멈이 돌아오기 전에는 기여 단계 보상도 명단도 없다');
  g.tower.load({ glow: 55, residents: [30, 60, 99] });
  offer('resident', 1);
  check(p.tier === 1 && p.gold === 30 && said().includes('tierUp:1,30'), '할멈이 돌아오는 순간 그 전의 기여가 인정된다 (16 → 1단계, 골드 30)');
  check(JSON.stringify(g.state().keepers) === JSON.stringify([{ name: '지킴이', n: 16 }]), '오늘의 등탑지기 명단에 이름과 점수가 오른다');
  offer('tower', 30);
  check(p.tier === 2 && p.gold === 90, '기여가 30을 넘으면 2단계가 된다');
  offer('tower', 9999);
  check(p.contrib === 61 && p.tier === 3 && g.tower.glow === 100, // 등탑은 55에서 85가 됐고, 남은 15만큼만 받는다
`한 번에 여러 단계를 넘어도 차례로 받는다 (기여 ${p.contrib}, ${p.tier}단계)`);
  { const before = p.contrib, had = p.sparks; offer('tower', 9999);
    check(p.contrib === before + 5 && p.sparks === had - 5 && g.tower.glow === 100 && said().some((x) => x.startsWith('offered:5,')), '가득 찬 등탑에도 바칠 수 있다: 한 번에 5개까지, 밝기는 그대로이고 기여에는 세어진다');
    p.contrib = before; p.sparks = had; }

  // 습격을 막아 내면 명단 점수가 오른다
  const before = g.state().keepers[0].n;
  Object.assign(g.raid.cfg, { waveAtS: [0] });
  g.raid.start();
  for (let i = 0; i < 4; i++) g.tick(0.05);
  for (const m of [...g.ents.values()]) if (m.raid) { p.x = m.x + 1; p.z = m.z; g.combat.damage(p, m, 9999, false); }
  for (let i = 0; i < 4; i++) g.tick(0.05);
  check(g.raid.phase === 'idle' && g.state().keepers[0].n === before + 5, '습격을 막아 내면 명단 점수가 5 오른다');

  // 저장했다가 읽는다: 같은 날이면 남고, 날이 바뀌면 비운다
  const world = g.exportWorld(), save = g.players.export(p);
  const same = newGame({ now: () => clock });
  same.importWorld(world);
  check(same.state().keepers[0]?.n === before + 5 && same.players.spawn('지킴이', false, save).tier === 3, '명단과 기여 단계가 저장되고 다시 읽힌다');
  clock += 24 * 3600000;
  const next = newGame({ now: () => clock });
  next.importWorld(world);
  check(next.state().keepers.length === 0, '날이 바뀌면 명단이 비워진다');
  for (let i = 0; i < 31 * 20; i++) g.tick(0.05);
  check(g.state().keepers.length === 0, '서버가 켜진 채로 날이 바뀌어도 비워진다');
}
