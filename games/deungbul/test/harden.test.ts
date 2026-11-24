// 악용 막기 시험에서 가른 이 게임의 검사: 습격(서 있기만 한 부계정, 비운 채널)과 오늘의 등탑지기 명단 (서버 없이 게임 규칙만 돌린다)
// 틀의 것(필드 보스, 재접속, 순위, 자리 비움 사냥, 거래소, 깨진 저장 값, 채널, 초대, 통신 계층)은 engine/test/harden.test.ts에 있다. 항목 번호는 그 파일과 같다.
import { RAID } from '../shared/defs';
import { TOWER } from '../shared/world';
import { type Ent, fieldLayer, type Game } from '@engine/server';
import { check } from '@engine/testing';
import { newGame } from './game';

const runOn = (g: Game) => (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) g.tick(0.05); };
const saidOn = (g: Game) => (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => [n.k, ...n.a].join(':'));
/** 저장되는 사람(저장 키가 있다)을 만든다 */
const mk = (g: Game, name: string, lv = 12, key = 'key-' + name): Ent => { const p = g.players.spawn(name, false, null, key); g.classes.apply(p, 'warrior'); p.lv = lv; g.players.refresh(p); p.hp = p.maxHp; return p; };

// ---------- 1. 습격: 서 있기만 한 부계정으로 적의 수를 부풀리지 못한다 ----------
{
  const solo = RAID.base + RAID.perPlayer;
  const setup = () => {
    const g = newGame({ raid: { hours: [] } });
    const at = (p: Ent, ch = 1) => { p.layer = fieldLayer(ch); p.x = TOWER.x + 3; p.z = TOWER.z + 3; p.maxHp = p.hp = 1e7; return p; };
    const foes = (ch: number) => [...g.ents.values()].filter((m) => m.swarm && !m.dead && m.layer === fieldLayer(ch));
    /** 습격이 끝날 때까지 돌린다. 1초마다 fighters가 명령을 내고(싸우려고 움직인다) 자기 채널의 적을 모두 쓰러뜨린다. 쓰러뜨린 수와 걸린 시간을 돌려준다 */
    const fight = (fighters: () => Ent[], maxS = 200) => {
      let killed = 0, t = 0;
      for (; t < maxS && g.raid.phase === 'active'; t++) {
        for (const p of fighters()) g.command(p, { t: 'stop' });
        for (const p of fighters()) for (const m of [...g.ents.values()]) if (m.swarm && !m.dead && m.layer === p.layer) { g.combat.damage(p, m, 99999, false); killed++; }
        runOn(g)(1);
      }
      return { killed, t };
    };
    return { g, at, foes, fight, act: (p: Ent) => g.command(p, { t: 'stop' }) };
  };

  { // 부계정 다섯이 등탑 곁에 서 있기만 한다
    const { g, at, act, fight } = setup();
    const main = at(mk(g, '본캐'));
    for (let i = 0; i < 5; i++) at(mk(g, '부캐' + i));
    runOn(g)(1);
    act(main);
    const glow = g.tower.glow;
    g.raid.start();
    check(g.raid.phase === 'active' && g.raid.state().foes === solo, `서 있기만 한 부계정 다섯은 인원에 들지 않는다 (적 ${g.raid.state().foes}마리, 혼자일 때 ${solo}마리)`);
    const r = fight(() => [main]);
    check(r.killed === solo && g.tower.glow === glow + RAID.winGlow, `부계정이 끝까지 서 있어도 적은 늘지 않고, 혼자서 막아 낸다 (쓰러뜨린 적 ${r.killed}마리)`);
  }
  { // 혼자 가만히 기다리던 사람도 습격을 만나고 막을 수 있다
    const { g, at, fight } = setup();
    const p = at(mk(g, '기다린이'));
    runOn(g)(RAID.activeS + 5);
    const glow = g.tower.glow;
    g.raid.start();
    check(g.raid.phase === 'active' && g.raid.state().foes === solo, '아무 명령 없이 기다리던 사람 혼자여도 습격은 열린다 (1명 몫)');
    const r = fight(() => [p]);
    check(r.killed === solo && g.tower.glow === glow + RAID.winGlow && saidOn(g)(p).some((k) => k.startsWith('raidReward:')), '혼자 습격을 막아 내고 보상을 받는다');
  }
  { // 여럿이 실제로 싸우면 적이 늘어난다: 시작할 때 움직인 사람만큼, 뒤늦게 싸우기 시작한 사람은 다음 물결에
    const { g, at, act, fight } = setup();
    const three = [at(mk(g, '가')), at(mk(g, '나')), at(mk(g, '다'))];
    runOn(g)(1);
    three.forEach(act);
    g.raid.start();
    check(g.raid.state().foes === RAID.base + RAID.perPlayer * 3, `방금 움직인 세 사람이 있으면 세 사람 몫의 적이 온다 (${g.raid.state().foes}마리)`);
    const r = fight(() => three.slice(0, 1)); // 그 뒤로 두 사람이 멈춰 서도 적은 줄지 않는다
    check(r.killed === RAID.base + RAID.perPlayer * 3, `물결 사이에 멈춰 서도 적은 줄지 않는다 (쓰러뜨린 적 ${r.killed}마리)`);
  }
  {
    const { g, at, fight } = setup();
    const three = [at(mk(g, '가')), at(mk(g, '나')), at(mk(g, '다'))];
    runOn(g)(RAID.activeS + 5);
    g.raid.start();
    const first = g.raid.state().foes;
    const r = fight(() => three);
    check(first === solo && r.killed === RAID.base + RAID.perPlayer * 3, `가만히 기다리던 세 사람도 싸우기 시작하면 다음 물결부터 세 사람 몫이 된다 (처음 ${first}마리, 모두 ${r.killed}마리)`);
  }

  // ---------- 9. 한 채널을 방치하거나 떠나도 서버 전체가 지지 않는다 ----------
  { // 2채널에 서 있기만 한 사람: 그 채널에는 적을 만들지 않는다
    const { g, at, act, fight } = setup();
    const a = at(mk(g, '지킴이')); at(mk(g, '구경꾼'), 2);
    runOn(g)(1);
    act(a);
    const glow = g.tower.glow;
    g.raid.start();
    check(g.raid.foesAt(fieldLayer(1)) === solo && g.raid.foesAt(fieldLayer(2)) === 0, '서 있기만 한 사람의 채널에는 적이 오지 않는다');
    const r = fight(() => [a]);
    check(g.tower.glow === glow + RAID.winGlow && r.t < RAID.durationS, `자기 채널을 다 막으면 막아 낸 것이다 (${r.t}초)`);
  }
  { // 시작 직후 접속을 끊은 사람: 그 채널은 버려진 것으로 보고, 남은 채널이 막으면 막아 낸 것이다
    const { g, at, act, fight } = setup();
    const a = at(mk(g, '지킴이')), b = at(mk(g, '떠난이'), 2);
    runOn(g)(1);
    act(a); act(b);
    const glow = g.tower.glow;
    g.raid.start();
    const share = g.raid.state().towerMaxHp / 2;
    check(g.raid.foesAt(fieldLayer(2)) === solo, '둘 다 움직였으면 두 채널에 적이 온다');
    g.players.leave(b.id);
    g.announces = [];
    const r = fight(() => [a]);
    const lost = g.announces.some((x) => x.k === 'raidLost');
    check(!lost && g.tower.glow === glow + RAID.winGlow && r.t < RAID.durationS && g.announces.some((x) => x.k === 'raidAbandoned' && x.a[0] === 2), `남이 떠난 채널 때문에 시간 초과로 지지 않는다 (${r.t}초 만에 막아 냄)`);
    void share;
  }
  { // 채널을 비워 적을 줄이면 그만큼 등탑 내구를 잃는다 (거저 사라지지 않는다). 그 피해는 그 채널이 보탠 몫을 넘지 않는다
    const { g, at, act } = setup();
    const a = at(mk(g, '가')), b = at(mk(g, '나'), 2);
    runOn(g)(1);
    act(a); act(b);
    g.raid.start();
    const full = g.raid.state().towerMaxHp, share = full / 2;
    runOn(g)(1);
    b.layer = fieldLayer(1); // 싸우다 다 같이 1채널로 옮긴다
    for (let t = 0; t < RAID.abandonS + 2; t++) { act(a); act(b); runOn(g)(1); }
    const hp = g.raid.state().towerHp, lostHp = full - hp;
    check(g.raid.foesAt(fieldLayer(2)) === 0 && lostHp >= share * 0.5 && lostHp <= share + 1, `비운 채널의 적은 사라지지만 등탑이 그 값을 치른다 (내구 ${full} → ${hp}, 채널 하나의 몫 ${share})`);
    check(g.raid.foesAt(fieldLayer(1)) + 0 >= RAID.base + RAID.perPlayer * 2 - solo, '옮겨 온 사람은 옮겨 온 채널의 인원으로 세어져 그 채널의 적이 늘어난다');
  }
  { // 모든 채널이 버려졌으면 막아 낸 것이 아니다 (움직였다가 멈춰 서서 거저 이기지 못한다)
    const { g, at, act } = setup();
    const a = at(mk(g, '가'));
    runOn(g)(1);
    act(a);
    const glow = g.tower.glow;
    g.raid.start();
    g.announces = [];
    runOn(g)(RAID.abandonS + 45);
    check(g.raid.phase === 'idle' && g.tower.glow === Math.max(0, glow + RAID.loseGlow) && g.announces.some((x) => x.k === 'raidLost'), '시작만 시켜 놓고 아무도 막지 않으면 진다');
  }
}

// ---------- 4. 오늘의 등탑지기: 이름이 아니라 저장 키로 사람을 구분한다 ----------
{
  const clock = new Date(2026, 10, 23, 15, 0, 0).getTime();
  // 오늘의 등탑지기
  const k = newGame({ now: () => clock, raid: { hours: [] } });
  k.tower.load({ glow: 55, residents: [30, 60, 99] });
  const a = mk(k, '지킴이'), b = mk(k, '흉내쟁이');
  const open = (g: Game, p: Ent) => { p.sparks = 10; p.x = TOWER.x + 2; p.z = TOWER.z + 2; g.command(p, { t: 'offer', to: 'resident', n: 1 }); }; // 할멈이 돌아와야 명단이 열린다
  open(k, a);
  k.fire('offered', a, 'tower', 39, 0);
  k.players.leave(a.id);
  k.players.rename(b, '지킴이');
  k.fire('offered', b, 'tower', 5, 0);
  const list = k.state().keepers;
  check(list.length === 2 && list[0].n === 40 && list[1].n === 5, `남의 이름으로 바꿔 바쳐도 남의 줄에 얹히지 않는다 (${JSON.stringify(list)})`);
  k.players.rename(b, '본이름');
  check(k.state().keepers[1].name === '본이름', '이름을 바꾸면 명단의 내 줄도 따라온다');
  const k2 = newGame({ now: () => clock, raid: { hours: [] } });
  k2.importWorld(JSON.parse(JSON.stringify(k.exportWorld())));
  check(JSON.stringify(k2.state().keepers) === JSON.stringify(k.state().keepers) && !JSON.stringify(k2.state().keepers).includes('key-'), '명단이 저장되고 다시 읽히며, 화면에는 저장 키가 나가지 않는다');
  const d = new Date(clock), k3 = newGame({ now: () => clock, raid: { hours: [] } });
  k3.importWorld({ tower: { glow: 55, residents: [30, 60, 99] }, keepers: { day: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, scores: [['옛지킴이', 12]] } });
  open(k3, mk(k3, '새지킴이'));
  check(JSON.stringify(k3.state().keepers) === JSON.stringify([{ name: '옛지킴이', n: 12 }, { name: '새지킴이', n: 1 }]), '이름으로 저장된 예전 명단도 읽힌다');
}
