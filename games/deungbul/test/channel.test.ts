// 채널 시험에서 가른 이 게임의 검사: 습격과 채널 (서버 없이 게임 규칙만 돌린다. 시계는 시험이 직접 돌린다)
// 채널 자체의 검사는 틀의 시험 engine/test/channel.test.ts에 있다.
import { CHANNEL, RAID } from '../shared/defs';
import { TOWER } from '../shared/world';
import type { Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';
import { fieldLayer } from '@engine/server/game/layers';
import { check } from '@engine/test/harness';
import { newGame } from './game';

const runOn = (g: Game) => (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) g.tick(0.05); };
const saidOn = (g: Game) => (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => [n.k, ...n.a].join(':'));
/** 시험의 준비 단계에서 조건(쿨다운, 싸움)과 무관하게 채널에 세운다. 명령으로 옮기는 것은 따로 검사한다 */
const put = (p: Ent, channel: number) => { p.layer = fieldLayer(channel); };

// ---------- 습격: 등탑은 하나, 적은 채널마다 ----------
{
  const g = newGame({ raid: { hours: [], waveAtS: [0, 2] } }), run = runOn(g), said = saidOn(g);
  const c = g.raid.cfg, perChannel = RAID.base + RAID.perPlayer;
  const foes = (channel: number) => [...g.ents.values()].filter((m) => m.raid && !m.dead && m.layer === fieldLayer(channel));
  const near = (p: Ent) => { p.x = TOWER.x + 3; p.z = TOWER.z + 3; p.maxHp = p.hp = 99999; };
  const kill = (p: Ent, channel: number) => { for (const m of foes(channel)) g.combat.damage(p, m, 99999, false); };
  const a = g.players.spawn('일', false), b = g.players.spawn('이', false);
  put(b, 2); near(a); near(b);
  const glow = g.tower.glow;
  run(0.1);
  g.notices = [];
  for (const p of [a, b]) g.command(p, { t: 'stop' }); // 적의 수는 최근에 스스로 움직인 사람만 센다: 둘 다 방금 명령을 냈다
  g.raid.start();
  const max = (RAID.towerHpBase + glow * RAID.towerHpPerGlow) * 2;
  check(g.raid.phase === 'active' && g.raid.state().foes === perChannel * 2 && g.raid.state().towerMaxHp === max, `사람이 있는 채널마다 그 인원에 맞는 적이 온다 (두 채널, ${perChannel}마리씩). 등탑 내구는 하나이고 싸우는 채널 수만큼 크다`);
  check(said(a).includes(`raidStart:${perChannel}`) && said(b).includes(`raidStart:${perChannel}`), '시작 알림의 적 수는 내 채널에 오는 수다');
  run(0.1);
  check(foes(1).length > 0 && foes(1).length === foes(2).length && foes(3).length === 0, '사람이 없는 채널에는 적을 만들지 않는다');

  // 둘째 물결이 올 때 2채널이 비어 있으면 그 적은 미뤄진다 (없어지지 않는다)
  g.players.leave(b.id);
  run(2.5);
  check(foes(1).length === perChannel && foes(2).length < perChannel && g.raid.foesAt(fieldLayer(2)) === perChannel && g.raid.state().foes === perChannel * 2, '채널이 비어 있으면 그 채널의 다음 물결은 미뤄지고, 남은 적으로는 그대로 센다');

  // 어느 채널의 적이든 같은 내구를 깎는다. 다만 아무도 없는 채널의 적은 멈춰 있어 깎지 못한다
  const atTower = (m: Ent) => { m.x = TOWER.x + 1; m.z = TOWER.z + 1; m.targetId = 0; m.moving = false; };
  a.x = TOWER.x + 30; // 적이 사람을 쫓지 않고 등탑에 붙어 있게 비켜선다
  [...foes(1), ...foes(2)].forEach(atTower);
  const hp0 = g.raid.state().towerHp;
  run(2);
  const lost1 = hp0 - g.raid.state().towerHp, want1 = perChannel * c.drainPerS * 2;
  check(Math.abs(lost1 - want1) <= 1.5, `아무도 없는 채널의 적은 등탑을 깎지 못한다 (2초에 ${lost1}, 1채널의 ${perChannel}마리 몫 ${want1.toFixed(1)})`);
  const b2 = g.players.spawn('돌아온이', false);
  put(b2, 2); near(b2); b2.x = TOWER.x + 30;
  run(0.1);
  check(foes(2).length === perChannel, '누군가 그 채널에 오면 미뤄 둔 적이 나온다');
  foes(2).forEach(atTower);
  const hp1 = g.raid.state().towerHp;
  run(2);
  const lost2 = hp1 - g.raid.state().towerHp, want2 = perChannel * 2 * c.drainPerS * 2;
  check(Math.abs(lost2 - want2) <= 1.5, `두 채널의 적이 같은 내구를 함께 깎는다 (2초에 ${lost2}, 두 채널 몫 ${want2.toFixed(1)})`);

  // 모든 채널의 적을 다 쓰러뜨려야 막아 낸 것이다
  g.notices = []; g.announces = []; g.out = [];
  kill(a, 1);
  run(CHANNEL.tellBusyS + 0.1);
  check(g.raid.phase === 'active' && foes(1).length === 0 && said(a).includes('raidElsewhere:2'), '한 채널의 적을 다 잡아도 다른 채널에 남아 있으면 끝나지 않고, 어느 채널에 남았는지 알려 준다');
  check(g.out.some((o) => o.id === a.id && o.msg.t === 'channels' && o.msg.foes?.[0] === 0 && o.msg.foes?.[1] === perChannel), '습격 중에는 채널별로 남은 적의 수도 함께 알린다');
  kill(b2, 2);
  run(0.1);
  check(g.raid.phase === 'idle' && g.tower.glow === glow + RAID.winGlow && g.announces.filter((x) => x.k === 'raidWon').length === 1, '모든 채널의 적을 쓰러뜨리면 막아 낸 것이고, 밝기는 한 번만 오른다');
  check(said(a).some((k) => k.startsWith('raidReward:')) && said(b2).some((k) => k.startsWith('raidReward:')) && [...g.ents.values()].every((m) => !m.raid), '어느 채널에서 싸웠든 보상을 받고, 습격 적은 남지 않는다');

  // 적이 오지 않는 채널에 있던 사람에게는 어디로 가야 하는지 알린다
  const far = g.players.spawn('멀리', false);
  put(far, 3); far.x = 120; far.z = 0;
  g.notices = [];
  near(a);
  g.raid.start();
  check(g.raid.phase === 'active' && said(far).some((k) => k.startsWith('raidElsewhere:')), '적이 오지 않는 채널의 사람에게는 적이 있는 채널을 알려 준다');
}
