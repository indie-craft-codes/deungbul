// Lv 15 이후의 할 거리 2: 세 번째 구역 '잿불 고원' (Lv 15~25), 세 번째 등탑, 새 몬스터 넷, 레벨 7·8 장비, 메인 퀘스트 5장
import { CAMPS, FULL_TOWER_OFFER, GEAR, MONSTERS, QUESTS, gearLvOf, type MonsterDef } from '../shared/defs';
import { MAP, MAX_X, TOWERS, ZONE_COUNT, ZONE_SPLIT, ZONE_SPLIT2, areaAt, buildWorld, isFree, onPath, zoneOf } from '../shared/world';
import type { Ent, Game } from '@engine/server';
import { check } from '@engine/testing';
import { newGame } from './game';
import { GEAR_LV_MAX, gearLevels, monstersOfGearLv } from '../client/guide/calc';

const NEW = ['cinder_fox', 'highland_raider', 'ember_warden', 'ember_colossus'] as const;
const ember = TOWERS[2];
const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.targetId = 0; };
const mons = (g: Game, type: string) => [...g.ents.values()].filter((e) => e.kind === 'm' && e.type === type && !e.dead);

// ---------- 구역과 맵 ----------
{
  check(ZONE_COUNT === 3 && TOWERS.length === 3 && ember.id === 'ember' && ember.start === 0 && ember.floor === 0, '구역은 셋이고, 세 번째 등탑(잿불 고원)은 꺼진 채로 시작한다');
  check(zoneOf(ZONE_SPLIT - 0.01) === 0 && zoneOf(ZONE_SPLIT) === 1 && zoneOf(ZONE_SPLIT2 - 0.01) === 1 && zoneOf(ZONE_SPLIT2) === 2 && zoneOf(MAX_X) === 2,
    `구역의 경계: x ${ZONE_SPLIT}부터 잿빛 숲, x ${ZONE_SPLIT2}부터 잿불 고원`);
  const crypt = MAP.areas.find((a) => a.id === 'crypt')!;
  check(zoneOf(crypt.x0) === 1 && zoneOf((crypt.x0 + crypt.x1) / 2) === 1 && MAX_X < crypt.x0, '던전(지하묘)은 예전처럼 잿빛 숲의 구역이고, 들판은 던전 지역 앞에서 멈춘다');
  check(zoneOf(ember.x) === 2 && areaAt(ember.x, ember.z) === 0, '세 번째 등탑은 들판의 잿불 고원에 있다');
  // 큰길이 고원 등탑까지 이어지고, 길 위에는 나무와 바위가 없다
  const w = buildWorld();
  const onRoad = [...w.trees, ...w.rocks].filter((d) => onPath(d.x, d.z, 3.2));
  check(onPath(ember.x - 30, 0, 1) && onPath(ember.x, 20, 1) && onRoad.length === 0, `동서 큰길과 고원 등탑의 남북 길이 있고, 길 위에 나무·바위가 없다 (${onRoad.length})`);
  const heights = w.trees.filter((t) => zoneOf(t.x) === 2 && t.x < MAX_X), rocks = w.rocks.filter((r) => zoneOf(r.x) === 2);
  check(heights.length > 40 && rocks.length > 30 && !isFree(ember.x + 3, ember.z), `고원에도 나무(${heights.length})와 바위(${rocks.length})가 있고, 등탑 터는 비어 있다`);
  check(w.trees.every((t) => areaAt(t.x, t.z) <= 0), '들판의 나무가 던전 지역 안에 서지 않는다');
}

// ---------- 몬스터와 장비 레벨 ----------
{
  const defs = NEW.map((id) => MONSTERS[id] as MonsterDef);
  check(defs.slice(0, 3).every((d) => d.gearLv === 7 && !d.boss) && defs[3].gearLv === 8 && defs[3].boss === true && defs[3].respawn === 600,
    '고원의 몬스터 셋은 레벨 7 장비, 필드 보스 잿불 거상은 레벨 8 장비를 떨어뜨린다 (보스는 600초 뒤에 다시 나온다)');
  check(gearLvOf(MONSTERS.lost_soldier) === GEAR.levelOf(MONSTERS.lost_soldier.exp) && gearLvOf(MONSTERS.ash_troll) === 6 && gearLvOf(MONSTERS.crypt_lord) === 6 && GEAR.levelOf(1e9) === 6,
    '정의에 장비 레벨이 없는 몬스터는 예전처럼 경험치로 정하고, 경험치 식의 상한(6)은 그대로다');
  check(GEAR_LV_MAX === 8 && gearLevels().includes(7) && monstersOfGearLv(7).join(',') === NEW.slice(0, 3).join(',') && monstersOfGearLv(8).join(',') === 'ember_colossus',
    '도감의 장비 레벨 표가 레벨 8까지 있고, 레벨 7·8을 떨어뜨리는 몬스터가 고원의 몬스터다');
  const campTypes = new Set(CAMPS.filter((c) => zoneOf(c.x) === 2).flatMap((c) => c.types));
  check(NEW.every((id) => campTypes.has(id)) && [...campTypes].every((id) => (NEW as readonly string[]).includes(id)), '고원의 빈터에는 새 몬스터 넷만 산다');

  const g = newGame({ raid: { hours: [] } });
  const p = g.players.spawn('고원사냥꾼', false);
  p.lv = 20;
  g.gear.random = () => 0; // 장비가 반드시 떨어진다
  for (const id of NEW) {
    const m = mons(g, id)[0];
    check(!!m && zoneOf(m.x) === 2, `${id}가 고원에 있다`);
    const before = p.gear.length;
    at(p, m.x + 1, m.z);
    g.combat.damage(p, m, 1e7, false);
    const got = p.gear.slice(before);
    const want = id === 'ember_colossus' ? 8 : 7;
    check(m.dead && got.length === 1 && got[0].lv === want, `${id}를 잡으면 레벨 ${want} 장비가 떨어진다 (${got.map((x) => x.lv).join(',')})`);
    p.gear = []; p.worn = {};
  }
  // 보스는 respawn(600초) 뒤에 다시 나온다
  const boss = [...g.ents.values()].find((e) => e.kind === 'm' && e.type === 'ember_colossus')!;
  at(p, 0, 3);
  for (let t = 0; t < 590; t++) g.tick(1);
  const stillDead = boss.dead;
  for (let t = 0; t < 15; t++) g.tick(1);
  check(stillDead && !boss.dead && boss.hp === boss.maxHp,
    '잿불 거상은 590초 뒤에는 아직 쓰러져 있고, 600초가 지나면 다시 나타난다');
}

// ---------- 세 번째 등탑 ----------
{
  // 등탑이 둘이던 때의 월드 저장을 읽는다: 세 번째 등탑은 처음 값(0)이다
  const old = newGame();
  old.importWorld({ tower: { glow: 66, glows: [66, 42], residents: [30, 60, 0] } });
  check(JSON.stringify(old.state().tower.glows) === '[66,42,0]' && old.state().tower.glow === 66, `등탑이 둘이던 때의 월드 저장도 읽히고, 세 번째 등탑은 꺼진 채다 (${JSON.stringify(old.state().tower.glows)})`);
  const again = newGame();
  again.importWorld(old.exportWorld());
  check(JSON.stringify(again.state().tower.glows) === '[66,42,0]', '세 등탑의 밝기가 저장되고 다시 읽힌다');

  const g = newGame({ raid: { hours: [] } });
  const p = g.players.spawn('고원등지기', false);
  const told = () => g.announces.map((a) => `${a.k}:${a.a.join(',')}`);
  at(p, ember.x + 2, ember.z + 2); p.sparks = 200;
  check(g.tower.near(p) === 2, '고원 등탑 곁에 서면 그 등탑에 닿는다');
  g.command(p, { t: 'offer', to: 'tower', n: 20 });
  check(JSON.stringify(g.state().tower.glows) === '[40,0,20]' && told().includes('towerLit:ember') && p.sparks === 180, '고원 등탑에 바치면 그 등탑만 밝아지고, 켜졌다고 알린다');
  g.command(p, { t: 'offer', to: 'tower', n: 60 });
  check(g.tower.glows[2] === 80 && g.tower.stageAt(ember.x) === 2 && g.tower.stageAt(120) === 0 && g.mods.product('regen', p) > 1 && g.mods.product('regen', { ...p, x: 120 } as Ent) === 1, '밝기가 환함에 이르면 고원에서 회복이 빨라진다 (다른 구역은 그대로)');
  at(p, ember.x + 25, 12);
  p.hp = 1; g.combat.damage(mons(g, 'cinder_fox')[0], p, 99, false);
  check(Math.hypot(p.x - ember.spawn.x, p.z - ember.spawn.z) < 1, '고원 등탑이 켜지면 고원에서 쓰러졌을 때 그 등탑에서 일어난다');
  at(p, ember.x + 2, ember.z + 2);
  g.command(p, { t: 'offer', to: 'resident', n: 1 });
  check(g.notices.some((n) => n.k === 'noResident'), '주민 되돌리기는 고원 등탑에서는 되지 않는다');
}

// ---------- 메인 퀘스트 5장 ----------
{
  const ch = QUESTS.findIndex((q) => q.id === 'ember');
  check(ch === 4 && QUESTS.length === 5, '5장은 4장 다음이다');
  const steps = QUESTS[ch].steps;
  const offered = steps.reduce((s, st) => s + (st.goal.kind === 'offer' ? st.goal.n : 0), 0);
  check(offered >= 100 && steps.every((st) => st.goal.kind !== 'offer' || ('tower' in st.goal && st.goal.tower === 2)), `5장에서는 고원 등탑에 불씨를 모두 ${offered}개 바친다`);

  // 4장을 마친 저장('이야기를 모두 마쳤습니다'였던 사람)으로 들어오면 5장의 첫 단계다
  const g = newGame({ raid: { hours: [] } });
  const done = g.players.spawn('다마침', false);
  done.qc = 4; done.qs = 0; done.qn = 0; done.lv = 16;
  const save = g.players.export(done);
  const p = g.players.spawn('다마침', false, save);
  check(p.qc === 4 && p.qs === 0 && g.quests.step(p)?.goal.kind === 'visit', '4장까지 마친 저장으로 들어오면 5장이 이어진다');

  // 4장의 마지막 단계(습격)를 마치면 5장이 시작된다
  const four = g.players.spawn('사장', false);
  four.qc = 3; four.qs = 2; four.qn = 0;
  at(four, TOWERS[0].x + 3, TOWERS[0].z + 3);
  g.fire('raidWon', [four]);
  check(four.qc === 4 && four.qs === 0 && g.notices.some((n) => n.k === 'questDone' && n.a[0] === 'halmeom'), '4장의 습격 단계를 마치면 4장을 끝내고 5장으로 넘어간다');

  // 5장을 끝까지
  const step = (s: number, n = 0) => p.qc === 4 && p.qs === s && p.qn === n;
  const slay = (type: string, count: number) => {
    let k = 0;
    for (let tries = 0; k < count && tries < 40; tries++) {
      const m = mons(g, type)[0];
      if (!m) { for (let i = 0; i < 20; i++) g.tick(1); continue; } // 다 잡았으면 다시 나오기를 기다린다
      at(p, m.x + 1, m.z); g.combat.damage(p, m, 1e7, false); k++;
    }
    return k;
  };
  at(p, ember.spawn.x, ember.spawn.z);
  for (let i = 0; i < 12; i++) g.tick(0.05);
  check(step(1), '고원 등탑에 닿으면 다음 단계로 넘어간다');
  check(slay('cinder_fox', 6) === 6 && step(2), '잿불 여우 여섯 마리를 잡으면 불씨를 바치는 단계다');
  p.sparks = 500;
  at(p, TOWERS[1].x + 2, TOWERS[1].z + 2);
  g.command(p, { t: 'offer', to: 'tower', n: 10 });
  check(step(2), '잿빛 숲 등탑에 바친 불씨는 세지 않는다');
  at(p, ember.x + 2, ember.z + 2);
  g.command(p, { t: 'offer', to: 'tower', n: 30 });
  check(step(2, 30) && g.tower.glows[2] === 30, '고원 등탑에 바친 만큼 진행이 오르고 등탑이 밝아진다');
  g.command(p, { t: 'offer', to: 'tower', n: 20 });
  check(step(3) && g.tower.glows[2] === 50, '50개를 채우면 다음 단계로 넘어간다');
  check(slay('highland_raider', 6) === 6 && step(4), '고원 약탈자 여섯을 물리치면 더 바치는 단계다');
  // 가득 찬 등탑: 평소에는 한 번에 FULL_TOWER_OFFER만 받지만, 퀘스트가 바치라는 만큼은 한 번에 받는다
  g.tower.changeGlow(100, 2);
  at(p, ember.x + 2, ember.z + 2);
  const s0 = p.sparks;
  g.command(p, { t: 'offer', to: 'tower', n: 999 });
  check(step(5) && s0 - p.sparks === 100 && g.tower.glows[2] === 100, `가득 찬 고원 등탑에도 퀘스트가 바치라는 100개를 한 번에 바친다 (${s0 - p.sparks})`);
  const s1 = p.sparks;
  g.command(p, { t: 'offer', to: 'tower', n: 999 });
  check(s1 - p.sparks === FULL_TOWER_OFFER, '퀘스트가 바치라고 하지 않으면 가득 찬 등탑은 예전처럼 조금만 받는다');
  check(slay('ember_warden', 4) === 4 && step(6), '잿불 파수꾼 넷을 쓰러뜨리면 마지막 단계다');
  const exp0 = p.exp, lv0 = p.lv;
  check(slay('ember_colossus', 1) === 1 && p.qc === 5 && g.quests.step(p) === null && g.notices.some((n) => n.k === 'questDone' && n.a[0] === 'ember') && (p.exp !== exp0 || p.lv !== lv0),
    '잿불 거상을 쓰러뜨리면 5장을 마친다');
  const back = g.players.spawn('다시', false, g.players.export(p));
  check(back.qc === 5 && g.quests.step(back) === null, '5장까지 마친 저장은 다 마친 채로 읽힌다');
}
