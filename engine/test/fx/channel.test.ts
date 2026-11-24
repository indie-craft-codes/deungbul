// 채널: 같은 들판을 여러 벌로 돌린다 (서버 없이 게임 규칙만 돌린다. 시계는 시험이 직접 돌린다) (시험용 내용 위에서)
import { BOSS, CAMPS, CHANNEL, DUNGEONS, MONSTERS, PARTY, RESPAWN_S, classOf, skillDef } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { DUNGEON_LAYER, channelOf, fieldLayer, isField } from '../../server/game/layers';
import { buildFrame, snapshotFor } from '../../server/net/snapshot';
import { check } from '../harness';

const N = CHANNEL.count;
const camps = CAMPS.reduce((s, c) => s + c.types.length, 0);
const runOn = (g: Game) => (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) g.tick(0.05); };
const saidOn = (g: Game) => (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => [n.k, ...n.a].join(':'));
/** 시험의 준비 단계에서 조건(쿨다운, 싸움)과 무관하게 채널에 세운다. 명령으로 옮기는 것은 따로 검사한다 */
const put = (p: Ent, channel: number) => { p.layer = fieldLayer(channel); };
const mobsIn = (g: Game, channel: number, type?: string) => [...g.ents.values()].filter((m) => m.kind === 'm' && !m.raid && m.layer === fieldLayer(channel) && (!type || m.type === type));
const still = (m: Ent) => { m.wait = 999; m.moving = false; };

// ---------- 층 번호의 뜻 ----------
{
  check(N >= 2 && Array.from({ length: N }, (_, i) => i + 1).every((n) => isField(fieldLayer(n)) && channelOf(fieldLayer(n)) === n) && !isField(DUNGEON_LAYER) && fieldLayer(N) < DUNGEON_LAYER,
    `채널 ${N}개가 저마다 들판의 한 층이고, 던전의 층과 겹치지 않는다`);
}

// ---------- 채널마다 몬스터가 따로 있다 ----------
{
  const g = new Game(), run = runOn(g);
  const per = Array.from({ length: N }, (_, i) => mobsIn(g, i + 1).length);
  check(per.every((n) => n === camps) && [...g.ents.values()].filter((m) => m.kind === 'm').length === camps * N, `채널마다 들판 몬스터가 따로 있고 수가 같다 (채널마다 ${camps}마리)`);
  check(Array.from({ length: N }, (_, i) => mobsIn(g, i + 1, 'colossus').length).every((n) => n === 1), '필드 보스도 채널마다 한 마리씩 있다');

  const p = g.players.spawn('하나', false);
  const s1 = mobsIn(g, 1, 'mite')[0], s2 = mobsIn(g, 2, 'mite')[0];
  check(s1.hx === s2.hx && s1.hz === s2.hz && s1.id !== s2.id, '같은 빈터의 같은 자리에, 채널마다 다른 몬스터가 산다');
  p.x = s1.x + 1; p.z = s1.z;
  g.combat.damage(p, s1, 9999, false);
  check(s1.dead && !s2.dead && s2.hp === s2.maxHp, '한 채널에서 잡아도 다른 채널의 것은 그대로다');
  run(RESPAWN_S + 0.5);
  check(!s1.dead && !s2.dead, '되살아남은 채널마다 따로 흐른다');
}

// ---------- 채널이 다르면 서로 보이지 않고 싸우지 않는다 ----------
{
  const g = new Game(), run = runOn(g), said = saidOn(g);
  const a = g.players.spawn('일채널', false), b = g.players.spawn('이채널', false);
  put(b, 2);
  const wolf1 = mobsIn(g, 1, 'hound')[0], wolf2 = mobsIn(g, 2, 'hound')[0];
  [wolf1, wolf2].forEach(still);

  // 때리기
  a.x = wolf2.x + 1; a.z = wolf2.z;
  g.combat.damage(a, wolf2, 50, false);
  g.command(a, { t: 'attack', id: wolf2.id });
  check(wolf2.hp === wolf2.maxHp && a.targetId === 0, '다른 채널의 몬스터는 때릴 수 없고 공격 대상으로 잡히지도 않는다');
  g.combat.damage(wolf2, a, 50, false);
  check(a.hp === a.maxHp, '다른 채널의 몬스터에게 맞지도 않는다');

  // 먼저 덤비는 몬스터: 같은 자리에 서 있어도 다른 채널의 사람에게는 덤비지 않는다
  a.x = 0; a.z = 3; // 1채널에 사람이 있어 1채널의 몬스터는 깨어 있다
  b.x = wolf1.x + 2; b.z = wolf1.z;
  run(1);
  check(wolf1.targetId === 0 && wolf2.targetId === b.id, '먼저 덤비는 몬스터는 자기 채널의 사람에게만 덤빈다');
  // 다른 채널의 사람이 더 가까이 서 있어도, 자기 채널의 사람을 놓치지 않는다
  const late = g.players.spawn('늦게', false);
  late.x = wolf1.x - 4; late.z = wolf1.z;
  run(0.2);
  check(wolf1.targetId === late.id, '다른 채널의 사람이 곁에 있어도 자기 채널의 사람을 찾아 덤빈다');
  g.players.leave(late.id);

  // 회복 기술: 곁에 있어도 다른 채널의 사람은 살리지 못한다
  const mage = g.players.spawn('마법사', false), near = g.players.spawn('곁', false), other = g.players.spawn('딴채널', false);
  g.classes.apply(mage, 'sage');
  const slot = classOf('sage').skills.findIndex((id) => { const fx = skillDef(id).effect; return fx.kind === 'heal' && fx.allies; });
  mage.x = -60; mage.z = -60; near.x = -58; near.z = -60; other.x = -58; other.z = -60;
  put(other, 2);
  near.hp = 10; other.hp = 10; mage.cds = mage.cds.map(() => 0);
  g.command(mage, { t: 'skill', n: slot });
  check(slot >= 0 && near.hp > 10 && other.hp === 10, '회복 기술은 같은 채널의 사람만 살린다');

  // 보이지 않는다: 스냅샷에 다른 채널의 사람과 몬스터가 들지 않는다
  b.x = a.x + 2; b.z = a.z; near.x = a.x - 2; near.z = a.z;
  wolf2.x = a.x + 4; wolf2.z = a.z; wolf1.x = a.x - 4; wolf1.z = a.z;
  const seen = snapshotFor(a, new Set(), buildFrame(g.ents.values()), [], 0).seen;
  check(seen.has(near.id) && seen.has(wolf1.id) && !seen.has(b.id) && !seen.has(wolf2.id), '같은 자리에 있어도 다른 채널의 사람과 몬스터는 보이지 않는다');

  // 파티: 다른 채널의 상대는 초대할 수 없고, 파티원이어도 다른 채널에 있으면 처치 보상을 나눠 받지 않는다
  g.notices = [];
  g.command(a, { t: 'party', a: 'invite', id: b.id });
  check(!said(a).some((k) => k.startsWith('partyInvited')), '보이지 않는(다른 채널의) 사람은 파티에 초대할 수 없다');
  put(b, 1);
  g.command(a, { t: 'party', a: 'invite', id: b.id });
  g.command(b, { t: 'party', a: 'accept' });
  put(b, 2);
  const slime = mobsIn(g, 1, 'mite')[0];
  a.x = slime.x + 1; a.z = slime.z; b.x = slime.x + 2; b.z = slime.z;
  const exp = b.exp;
  g.combat.damage(a, slime, 9999, false);
  check(g.party.membersOf(a.id).length === 2 && a.exp > 0 && b.exp === exp && PARTY.shareRange > 2, '파티원이 곁에 있어도 채널이 다르면 처치 보상을 나눠 받지 않는다');
}

// ---------- 접속할 때의 배치 ----------
{
  const g = new Game();
  const first = Array.from({ length: CHANNEL.soft }, (_, i) => g.players.spawn('사람' + i, false));
  check(first.every((p) => channelOf(p.layer) === 1), `사람이 적을 때는 모두 1채널에 모인다 (${CHANNEL.soft}명까지)`);
  const next = g.players.spawn('넘침', false);
  check(channelOf(next.layer) === 2, `한 채널이 ${CHANNEL.soft}명을 채우면 다음 채널로 간다`);
  check(g.out.some((o) => o.id === next.id && o.msg.t === 'channels' && o.msg.me === 2 && o.msg.list[0] === CHANNEL.soft && o.msg.list[1] === 1 && o.msg.list.length === N), '접속하면 내 채널과 채널별 인원을 받는다');
  // 모든 채널이 붐비면 가장 적은 곳으로
  while (g.channels.counts().some((n) => n < CHANNEL.soft)) g.players.spawn('채움', false);
  const extra = Array.from({ length: N }, (_, i) => channelOf(g.players.spawn('더' + i, false).layer));
  check(g.channels.counts().every((n) => n === CHANNEL.soft + 1) && extra.join() === Array.from({ length: N }, (_, i) => i + 1).join(), '모든 채널이 붐비면 인원이 가장 적은 채널로 간다');

  // 파티원이 접속해 있으면 그 사람의 채널이 먼저다
  const g2 = new Game();
  const a = g2.players.spawn('앞', false), b = g2.players.spawn('뒤', false);
  g2.command(a, { t: 'party', a: 'invite', id: b.id });
  g2.command(b, { t: 'party', a: 'accept' });
  put(b, N);
  g2.channels.seat(a);
  check(g2.channels.pick(a) === N && channelOf(a.layer) === N, '파티원이 접속해 있으면 그 사람의 채널로 간다');

  // 봇은 고르게 나눈다
  const g3 = new Game();
  for (let i = 0; i < N * 2; i++) g3.players.spawn('Bot' + i, true);
  check(g3.channels.counts().every((n) => n === 2), '봇은 채널에 고르게 나뉜다');
}

// ---------- 채널 바꾸기 ----------
{
  let clock = new Date(2026, 0, 10, 12).getTime();
  const g = new Game({ now: () => clock }), run = runOn(g), said = saidOn(g);
  const cmd = (p: Ent, m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  const p = g.players.spawn('옮기는이', false);
  g.classes.apply(p, 'knight'); p.lv = 12; g.players.refresh(p); p.hp = p.maxHp;
  run(0.1);

  // 잘못된 입력
  let threw = false;
  g.notices = [];
  for (const n of ['2', 1.5, 0, -1, N + 1, NaN, Infinity, null, undefined, {}, [2], true]) {
    try { g.command(p, { t: 'channel', n }); } catch { threw = true; }
  }
  try { g.command(p, { t: 'channel' }); } catch { threw = true; }
  check(!threw && channelOf(p.layer) === 1 && said(p).length === 0, '잘못된 입력(문자열, 소수, 0, 음수, 범위 밖, 빈 값)에 죽지 않고 아무 일도 없다');

  // 성공: 자리는 그대로, 층만 바뀌고, 나를 노리던 몬스터는 대상을 잃는다
  const wolf = mobsIn(g, 1, 'hound')[0];
  still(wolf);
  p.x = wolf.x + 12; p.z = wolf.z;
  wolf.targetId = p.id; wolf.hitters.add(p.id); p.targetId = wolf.id; // 오래전에 건드려 아직 쫓기는 중 (최근에 맞거나 때리지는 않았다)
  const at = { x: p.x, z: p.z };
  g.events = []; g.out = [];
  cmd(p, { t: 'channel', n: 2 });
  check(channelOf(p.layer) === 2 && p.x === at.x && p.z === at.z && said(p).includes('channelMoved:2'), '채널을 바꾸면 자리는 그대로이고 층만 바뀐다');
  check(wolf.targetId === 0 && !wolf.hitters.has(p.id) && p.targetId === 0, '나를 노리던 몬스터는 대상을 잃고, 나도 대상을 내려놓는다');
  check(g.events.some((e) => e[0] === 'r' && e[1] === p.id) && g.out.some((o) => o.id === p.id && o.msg.t === 'channels' && o.msg.me === 2 && o.msg.list[1] === 1 && o.msg.list[0] === 0), '바꾸면 클라이언트에 알린다 (자리 맞춤 사건, 내 채널과 인원)');

  // 쿨다운
  cmd(p, { t: 'channel', n: 1 });
  check(channelOf(p.layer) === 2 && said(p).some((k) => k.startsWith('channelWait:')), `바꾼 뒤 ${CHANNEL.switchCdS}초 안에는 다시 바꿀 수 없다`);
  run(CHANNEL.switchCdS + 0.1);
  cmd(p, { t: 'channel', n: 2 });
  check(said(p).length === 0 && g.out.some((o) => o.id === p.id && o.msg.t === 'channels'), '이미 있는 채널을 고르면 아무 일도 없고 화면만 다시 맞춘다');
  cmd(p, { t: 'channel', n: 1 });
  check(channelOf(p.layer) === 1, '쿨다운이 지나면 다시 바꿀 수 있다');
  run(CHANNEL.switchCdS + 0.1);

  // 싸우는 중: 맞았을 때
  p.x = 0; p.z = 3;
  g.combat.damage(wolf, p, 1, false);
  cmd(p, { t: 'channel', n: 2 });
  check(channelOf(p.layer) === 1 && said(p).includes('channelFight'), '방금 맞았으면 바꿀 수 없다 (싸움에서 도망치지 못한다)');
  run(CHANNEL.calmS + 0.1);
  // 싸우는 중: 때렸을 때, 그리고 쓰러뜨린 직후
  const slime = mobsIn(g, 1, 'mite')[0];
  still(slime);
  p.x = slime.x + 1; p.z = slime.z;
  g.combat.damage(p, slime, 1, false);
  p.lastHurt = -99;
  cmd(p, { t: 'channel', n: 2 });
  check(channelOf(p.layer) === 1 && said(p).includes('channelFight'), '방금 때렸으면 바꿀 수 없다');
  g.combat.damage(p, slime, 9999, false);
  p.lastHurt = -99; p.targetId = 0;
  cmd(p, { t: 'channel', n: 2 });
  check(slime.dead && channelOf(p.layer) === 1 && said(p).includes('channelFight'), '몬스터를 쓰러뜨린 직후에도 바꿀 수 없다');
  p.x = 0; p.z = 3;
  run(CHANNEL.calmS + 0.1);
  cmd(p, { t: 'channel', n: 2 });
  check(channelOf(p.layer) === 2, `싸움이 멎고 ${CHANNEL.calmS}초가 지나면 바꿀 수 있다`);
  run(CHANNEL.switchCdS + 0.1);

  // 가득 참
  const crowd = Array.from({ length: CHANNEL.hard }, (_, i) => g.players.spawn('군중' + i, false));
  for (const c of crowd) put(c, N);
  cmd(p, { t: 'channel', n: N });
  check(channelOf(p.layer) === 2 && said(p).includes(`channelFull:${N}`), `${CHANNEL.hard}명이 찬 채널로는 옮길 수 없다`);
  g.players.leave(crowd[0].id);
  cmd(p, { t: 'channel', n: N });
  check(channelOf(p.layer) === N, '자리가 나면 옮길 수 있다');
  for (const c of crowd) g.players.leave(c.id);
  run(CHANNEL.switchCdS + 0.1);
  cmd(p, { t: 'channel', n: 2 });

  // 던전: 안에서는 바꿀 수 없고, 나오면 들어가기 전의 채널로 돌아온다
  const def = DUNGEONS.vault;
  p.x = def.portal.x + 1; p.z = def.portal.z;
  cmd(p, { t: 'dungeon', id: 'vault' });
  check(!isField(p.layer) && g.channels.of(p) === 2 && g.channels.counts()[1] === 1, '던전 안에 있는 동안에도 돌아갈 채널의 인원으로 센다');
  cmd(p, { t: 'channel', n: 1 });
  check(!isField(p.layer) && said(p).includes('channelDungeon'), '던전 안에서는 채널을 바꿀 수 없다');
  cmd(p, { t: 'dungeonLeave' });
  check(channelOf(p.layer) === 2 && isField(p.layer), '던전에서 나오면 들어가기 전의 채널로 돌아온다');
  // 끊겨서 나온 경우도 같다
  clock += 1000;
  p.x = def.portal.x + 1; p.z = def.portal.z;
  cmd(p, { t: 'dungeon', id: 'vault' });
  g.fire('playerDropped', p);
  check(channelOf(p.layer) === 2, '던전 안에서 접속이 끊겨도 있던 채널로 나온다');

  // 자리 비움 사냥: 있던 채널에 그대로 남고, 그 채널의 몬스터는 깨어 있다
  const boar = mobsIn(g, 2, 'tusk')[0];
  p.x = boar.x + 3; p.z = boar.z; p.auto = true;
  g.away.start(p);
  run(3);
  check(channelOf(p.layer) === 2 && (p.targetId !== 0 || boar.hp < boar.maxHp || boar.dead), '접속이 끊겨 서버가 대신 사냥하는 캐릭터는 있던 채널에 남아 그 채널의 몬스터와 싸운다');

  // 가끔 다시 알린다
  g.out = [];
  run(CHANNEL.tellS + 0.1);
  check(g.out.some((o) => o.id === p.id && o.msg.t === 'channels' && o.msg.me === 2), `채널별 인원을 ${CHANNEL.tellS}초마다 다시 알린다`);
}

// ---------- 싸우는 중의 판정: 함께 치던 몬스터 ----------
{
  const g = new Game(), run = runOn(g), said = saidOn(g);
  const a = g.players.spawn('남는이', false), b = g.players.spawn('떠나는이', false);
  const troll = mobsIn(g, 1, 'colossus')[0];
  still(troll);
  a.maxHp = a.hp = 99999; a.x = troll.x + 2; a.z = troll.z; b.x = troll.x - 2; b.z = troll.z;
  run(0.1);
  g.combat.damage(a, troll, 10, false); g.combat.damage(b, troll, 10, false);
  run(CHANNEL.calmS + 0.1); // 그 뒤로 떠나는이는 때리지 않았지만, 남는이는 계속 친다
  g.combat.damage(a, troll, 10, false);
  b.lastHurt = -99;
  g.notices = [];
  g.command(b, { t: 'channel', n: 2 });
  check(channelOf(b.layer) === 1 && said(b).includes('channelFight'), '함께 치던 몬스터가 곁에서 아직 맞고 있으면 싸우는 중이다');
  b.x = troll.x - 60;
  g.command(b, { t: 'channel', n: 2 });
  check(channelOf(b.layer) === 2, '그 싸움에서 멀리 떠나왔으면 채널을 바꿀 수 있다');
}

// ---------- 사람이 없는 채널은 쉰다 ----------
{
  const g = new Game(), run = runOn(g);
  const a = g.players.spawn('혼자', false);
  const w1 = mobsIn(g, 1, 'moth')[0], w2 = mobsIn(g, 2, 'moth')[0];
  w1.wait = 0; w2.wait = 0;
  const at = { x: w2.x, z: w2.z };
  run(12);
  check(Math.hypot(w1.x - w1.hx, w1.z - w1.hz) > 0.01 && w2.x === at.x && w2.z === at.z, '사람이 있는 채널의 몬스터만 움직이고, 빈 채널의 몬스터는 쉰다');

  // 싸우다 채널이 비면 그 싸움은 지워진다. 쓰러진 것은 빈 채널에서도 되살아난다
  const b = g.players.spawn('둘째', false);
  put(b, 2);
  const s = mobsIn(g, 2, 'mite'), hurt = s[0], dead = s[1];
  b.x = hurt.x + 1; b.z = hurt.z;
  run(0.1);
  g.combat.damage(b, hurt, 10, false);
  g.combat.damage(b, dead, 9999, false);
  g.players.leave(b.id);
  run(RESPAWN_S + 0.5);
  check(hurt.hp === hurt.maxHp && hurt.targetId === 0 && hurt.hitters.size === 0 && !dead.dead, '채널이 비면 싸우던 몬스터는 처음 상태로 돌아가고, 쓰러진 몬스터는 빈 채널에서도 되살아난다');
  void a;
}

// ---------- 필드 보스: 채널마다 따로 ----------
{
  const H = MONSTERS.colossus.hp;
  const g = new Game(), run = runOn(g), said = saidOn(g);
  const t1 = mobsIn(g, 1, 'colossus')[0], t2 = mobsIn(g, 2, 'colossus')[0];
  [t1, t2].forEach(still);
  const fighter = (name: string, channel: number, dx: number) => { const p = g.players.spawn(name, false); put(p, channel); p.x = t1.x + dx; p.z = t1.z; p.maxHp = p.hp = 5000; return p; };
  const p1 = fighter('하나', 1, 3), p2 = fighter('둘', 1, -3), q = fighter('셋', 2, 3);
  run(0.1);
  g.combat.damage(p1, t1, 100, false); g.combat.damage(p2, t1, 100, false); g.combat.damage(q, t2, 100, false);
  run(0.1);
  check(t1.maxHp === H * (1 + BOSS.hpPerPlayer) && t2.maxHp === H, '보스의 체력은 그 채널에서 맞서는 사람 수만 따른다 (1채널 둘, 2채널 하나)');
  t2.hitters.add(p1.id); // 다른 채널의 사람이 명단에 섞여 들어와도
  run(0.1);
  check(t2.maxHp === H && t2.scale === 1, '다른 채널에 있는 사람은 맞서는 인원으로 세지 않는다');
  t2.hitters.delete(p1.id);

  // 내려치기는 같은 채널의 사람만 맞는다
  const hp1 = p1.hp;
  t2.windup = 0.05; t2.targetId = q.id;
  g.events = [];
  run(0.2);
  check(g.events.some((e) => e[0] === 'h' && e[1] === t2.id && e[2] === q.id && e[4] === 1) && !g.events.some((e) => e[0] === 'h' && e[1] === t2.id && e[2] === p1.id) && p1.hp >= hp1 - 60, '보스의 내려치기는 같은 채널의 사람만 맞는다');

  // 쓰러뜨린 소식은 그 채널에만 간다
  g.notices = []; g.announces = [];
  g.combat.damage(q, t2, 99999, false);
  check(t2.dead && !t1.dead && said(q).some((k) => k.startsWith('bossDown:')) && !said(p1).some((k) => k.startsWith('bossDown:')) && g.announces.length === 0, '한 채널의 보스를 쓰러뜨려도 다른 채널의 보스는 그대로이고, 소식은 그 채널에만 간다');
}
