// 달무리 원정대의 규칙 플러그인. 나머지(영웅, 뽑기, 편성, 단계, 열쇠 던전, 방치 보상)는 틀의 모듈이다. 이 파일이 더하는 것:
//  - 처음 온 대장: 직업(하나뿐), 처음 월석·금화, 처음 영웅 둘
//  - 일일 임무의 셈: 단계 깨기(stage), 열쇠 던전(keyrun)
//  - 열쇠 던전으로 가기(명령 keyrun): 단계에서 나와 야영지의 문 앞에서 들어간다. 던전 안에서는 대장도 서버가 대신 싸우고, 나오면 단계로 돌아간다
//  - 별정수 → 영웅의 조각 (명령 essence)
//  - 다시 접속했을 때의 방치 보상을 화면에 알린다 (메시지 idleGain: 화면이 창으로 보인다)
import { CLASS_IDS, heroDef } from '@engine/shared/defs';
import { MAP as aliased } from '@engine/shared/world';
import { dist, type Ent, type Game } from '@engine/server';
import { DUNGEONS, ESSENCE, GATES, MAP, RETURN_S, STARTER, STARTER_HEROES } from '../shared/content';

if (MAP !== aliased) throw new Error('별칭 @game이 games/dalmuri를 가리키지 않습니다. tsx --tsconfig games/dalmuri/tsconfig.json 으로 실행하세요 (node scripts/game.mjs start dalmuri)');

/** 처음 온 대장인가: 영웅도, 깬 단계도, 재화도 없다 */
const fresh = (p: Ent) => Object.keys(p.heroes).length === 0 && p.stage.best === '' && p.gold === 0 && p.sparks === 0;
const isGate = (id: unknown): id is keyof typeof GATES => typeof id === 'string' && Object.hasOwn(GATES, id);

export function installDalmuri(g: Game): void {
  /** 던전에서 나와 단계로 돌아갈 때까지 남은 초 (사람 id → 초) */
  const returning = new Map<number, number>();
  /** 던전 안에 있던 사람 */
  const inside = new Set<number>();
  /** 접속하기 전의 우편 번호 (방치 보상의 우편을 알아보려고) */
  const seqAtJoin = new Map<number, number>();

  g.on('playerJoined', (p) => {
    seqAtJoin.set(p.id, p.mailSeq);
    if (p.cls === '' && CLASS_IDS.length) g.classes.choose(p, CLASS_IDS[0]);
    if (!fresh(p)) return;
    if (STARTER.gold) g.wallet.add(p, 'gold', STARTER.gold, 'start');
    if (STARTER.sparks) g.wallet.add(p, 'sparks', STARTER.sparks, 'start');
    for (const id of STARTER_HEROES) g.roster.grant(p, id);
  });
  g.on('playerLeft', (id) => { returning.delete(id); inside.delete(id); seqAtJoin.delete(id); });

  g.ready.push(() => {
    // 방치 보상(틀의 idle: 접속할 때 우편으로 보낸다)이 왔으면 화면에 알린다. 틀의 처리기보다 뒤에 걸려야 하므로 ready에서 건다
    g.on('playerJoined', (p) => {
      const before = seqAtJoin.get(p.id) ?? 0;
      const m = p.mail.find((x) => x.k === 'idle' && x.id > before);
      if (m) g.out.push({ id: p.id, msg: { t: 'idleGain', mail: m.id, min: Number(m.a[0]) || 0, r: m.r } });
    });
    // 일일 임무: 단계 깨기와 열쇠 던전
    g.on('stageCleared', (p) => g.daily.add(p, 'stage', 1));
    g.on('dungeonCleared', (_id, players) => { for (const p of players) g.daily.add(p, 'keyrun', 1); });
  });

  // 열쇠 던전으로: 단계에서 나와(들어오기 전의 자리) 문 앞으로 옮긴 뒤 틀의 던전 명령으로 들어간다
  g.commands.set('keyrun', (p, m) => {
    if (!isGate(m.id) || g.dungeon.runOf(p)) return;
    // 들어갈 수 없으면 단계에서 나오지 않는다 (틀의 던전과 같은 안내문)
    const def = DUNGEONS[m.id];
    if (p.lv < def.minLv) { g.notify(p, 'dungeonLevel', def.minLv); return; }
    if (g.dungeon.keyCount(p, m.id) <= 0) { g.notify(p, 'dungeonNoKeys', m.id); return; }
    if (g.stages.inStage(p)) g.stages.leave(p, false);
    const gate = GATES[m.id];
    if (dist(p, gate) > 3) {
      p.x = gate.x; p.z = gate.z + 2; p.tx = p.x; p.tz = p.z; p.moving = false; p.path = null;
      g.emit(['r', p.id]);
    }
    g.command(p, { t: 'dungeon', id: m.id });
    // 들어가지 못했으면(열쇠가 없다) 단계로 돌아간다
    if (!g.dungeon.runOf(p)) returning.set(p.id, RETURN_S);
  });

  // 별정수 → 조각: 가진 영웅에게만. 틀의 영웅 모듈에는 재료로 키우는 길이 없어 '한 번 더 얻기'(조각 한 묶음)로 바꾼다
  g.commands.set('essence', (p, m) => {
    if (typeof m.id !== 'string') return;
    const own = g.roster.owned(p, m.id);
    if (!own) { g.notify(p, 'essenceNoHero'); return; }
    const need = ESSENCE.cost[heroDef(m.id).rarity] ?? 99, have = g.bag.count(p, ESSENCE.item);
    if (have < need) { g.notify(p, 'essenceShort', need, have); return; }
    if (!g.bag.takeItem(p, ESSENCE.item, need, 'cmd:essence')) return;
    const got = g.roster.grant(p, m.id);
    g.notify(p, 'essenceUsed', m.id, got?.shards ?? 0, g.bag.count(p, ESSENCE.item));
  });

  // 틱: 던전 안에서는 대장도 대신 싸운다(손으로 움직이면 1.5초는 맡기지 않는다), 던전에서 나오면 잠시 뒤 단계로
  let think = 0;
  g.ticks.push((dt) => {
    for (const [id, s] of returning) {
      const p = g.ents.get(id);
      if (!p) { returning.delete(id); continue; }
      if (g.dungeon.runOf(p)) { returning.delete(id); continue; }
      const left = s - dt;
      if (left > 0) { returning.set(id, left); continue; }
      returning.delete(id);
      if (!g.stages.inStage(p)) g.stages.start(p, g.stages.curIndex(p));
    }
    think -= dt;
    if (think > 0) return;
    think = 0.3;
    for (const p of g.ents.values()) {
      if (p.kind !== 'p' || p.bot) continue;
      const run = g.dungeon.runOf(p);
      if (!run) {
        if (inside.delete(p.id)) returning.set(p.id, RETURN_S);
        continue;
      }
      inside.add(p.id);
      if (run.cleared || p.hp <= 0 || g.clock - p.lastMove < 1.5) continue;
      const cur = g.ents.get(p.targetId);
      if (cur && !cur.dead && cur.layer === p.layer) continue;
      let best: Ent | undefined, bd = Infinity;
      for (const e of g.ents.values()) {
        if (e.kind !== 'm' || e.dead || e.layer !== p.layer) continue;
        const d = dist(p, e);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { p.targetId = best.id; p.stuck = 0; }
    }
  });
}
