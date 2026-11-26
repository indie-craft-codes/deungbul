// 단계 밖 (달무리 원정대의 증명이 찾은 빈 곳: docs/proof-dalmuri.md): 던전 안의 자동 전투(DungeonDef.auto), 던전 뒤 단계로 돌아가기(STAGE_RULES.returnAfterDungeon),
// 메뉴에서 바로 던전 들어가기(DungeonDef.fromMenu, 명령 dungeonGo), 돌아왔을 때의 창(IDLE.popup, 메시지 idleBack), 재료로 영웅 키우기(HERO_RULES.trade),
// 화면의 틀 요소 끄기(HUD.hide)를 서버의 셈·저장·장부와 화면의 셈(hud/collectcalc.ts)으로 본다. 모두 내용이 적어야 켜지는 칸이라, 끄면 예전과 같은지도 본다.
import { DUNGEONS, HERO_RULE_VIEW, HUD_PARTS, IDLE, IDLE_VIEW, STAGE_RULE_VIEW, hiddenHudIds, menuDungeons, type IdleBack } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { mailWhy } from '../../server/game/systems/wallet';
import { dungeonGoView, idleBackLines, tradeViews } from '../../client/hud/collectcalc';
import { SKELETON } from '../../client/hud/skeleton';
import { check } from '../harness';

const T = Date.UTC(2026, 10, 25, 12, 0, 0), H = 3600000;
const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
const step = (g: Game, s: number) => { for (let i = 0; i < Math.round(s * 20); i++) g.tick(0.05); };
const rowsOf = (g: Game, cur: string, why: string, dir: '+' | '-') => g.ledger.rows().filter((r) => r.cur === cur && r.why === why && r.dir === dir).reduce((s, r) => s + r.amount, 0);
const goldmine = DUNGEONS.goldmine as { auto?: boolean; fromMenu?: boolean; minLv: number };
/** 금광에 든 몬스터 */
const mobsIn = (g: Game, p: Ent) => [...g.ents.values()].filter((e) => e.kind === 'm' && !e.dead && e.layer === p.layer);

// ---------- 내용: 켠 칸 ----------
{
  check(goldmine.auto === true && goldmine.fromMenu === true && menuDungeons().join() === 'goldmine', '시험용 내용: 금광은 자동 전투(auto)와 메뉴에서 들어가기(fromMenu)');
  check(STAGE_RULE_VIEW.returnAfterDungeon === 2 && IDLE_VIEW.popup === true && !!HERO_RULE_VIEW.trade?.stardust, '단계로 돌아가기 2초, 돌아왔을 때의 창, 별가루 → 조각');
}

// ---------- 메뉴에서 바로 던전 들어가기 (단계 안에서) ----------
{
  const g = new Game({ now: () => T, plugins: [] });
  const p = g.players.spawn('메뉴', false, null, 'if-1');
  check(g.stages.inStage(p), '접속하면 단계 안 (enterOnJoin)');
  const keys0 = g.dungeon.keyCount(p, 'goldmine');
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  check(!g.stages.inStage(p) && g.dungeon.runOf(p)?.id === 'goldmine' && g.dungeon.keyCount(p, 'goldmine') === keys0 - 1 && said(g, p, 'dungeonEnter'),
    `단계 안에서 dungeonGo: 단계에서 나와 문을 거치지 않고 금광으로 (열쇠 ${keys0} → ${g.dungeon.keyCount(p, 'goldmine')})`);
  const layer = p.layer;
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  check(p.layer === layer && g.dungeon.keyCount(p, 'goldmine') === keys0 - 1, '던전 안에서 다시 보내면 아무것도 하지 않는다 (열쇠 그대로)');
  // 열쇠가 없으면 단계에서도 나오지 않는다
  g.dungeon.leave(p, true);
  step(g, 2.2);
  check(g.stages.inStage(p), '스스로 나오면 2초 뒤 단계로 돌아간다 (returnAfterDungeon)');
  g.dungeon.giveKeys(p, 'goldmine', 0);
  while (g.dungeon.keyCount(p, 'goldmine') > 0) { g.command(p, { t: 'dungeonGo', id: 'goldmine' }); g.dungeon.leave(p, false); step(g, 2.2); }
  g.notices = [];
  const stageLayer = p.layer, before = JSON.stringify([p.x, p.z, p.layer, p.stage]);
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  check(said(g, p, 'dungeonNoKeys') && g.stages.inStage(p) && p.layer === stageLayer && JSON.stringify([p.x, p.z, p.layer, p.stage]) === before, '열쇠가 없으면 dungeonNoKeys: 단계에 그대로 남는다 (자리도 그대로)');
  // 레벨이 모자라면
  g.dungeon.giveKeys(p, 'goldmine', 1);
  goldmine.minLv = 99;
  g.notices = [];
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  check(said(g, p, 'dungeonLevel') && g.stages.inStage(p) && g.dungeon.keyCount(p, 'goldmine') === 1, '레벨이 모자라면 dungeonLevel (열쇠도 그대로)');
  goldmine.minLv = 1;
  // 메뉴에서 들어가는 던전이 아니면 받지 않는다
  goldmine.fromMenu = false;
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  check(g.stages.inStage(p) && g.dungeon.keyCount(p, 'goldmine') === 1, 'fromMenu가 아닌 던전은 dungeonGo를 받지 않는다');
  goldmine.fromMenu = true;
  g.command(p, { t: 'dungeonGo', id: 'nope' });
  g.command(p, { t: 'dungeonGo', id: 5 });
  check(g.stages.inStage(p), '없는 던전 id는 받지 않는다');
  // 들판에서도
  g.stages.leave(p, false);
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  check(g.dungeon.runOf(p)?.id === 'goldmine' && g.dungeon.keyCount(p, 'goldmine') === 0, '들판에서도 들어간다');
}

// ---------- 던전 안의 자동 전투 ----------
{
  const g = new Game({ now: () => T, plugins: [] });
  const p = g.players.spawn('자동', false, null, 'if-2');
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  p.lastMove = -10;
  step(g, 0.5);
  const t = g.ents.get(p.targetId);
  check(!!t && t.kind === 'm' && t.layer === p.layer, `자동 전투 던전: 대장에게 가장 가까운 적이 대상으로 (${t?.type})`);
  const hp0 = mobsIn(g, p).reduce((s, m) => s + m.hp, 0);
  step(g, 20);
  const hp1 = mobsIn(g, p).reduce((s, m) => s + m.hp, 0);
  check(hp1 < hp0, `20초 동안 대장이 다가가 친다 (적의 체력 합 ${hp0} → ${hp1})`);
  // 손으로 움직이는 동안(1.5초)은 맡기지 않는다
  p.targetId = 0; p.lastMove = g.clock;
  step(g, 0.5);
  check(p.targetId === 0, '손으로 움직인 지 1.5초 안이면 대상을 주지 않는다');
  step(g, 1.5);
  check(p.targetId !== 0, '그 뒤에는 다시 맡는다');
  // 끄면 (auto 없음) 예전처럼 사람이 싸운다
  goldmine.auto = false;
  const g2 = new Game({ now: () => T, plugins: [] });
  const q = g2.players.spawn('수동', false, null, 'if-3');
  g2.command(q, { t: 'dungeonGo', id: 'goldmine' });
  q.lastMove = -10;
  step(g2, 3);
  check(q.targetId === 0, 'auto가 없는 던전에서는 서버가 대상을 주지 않는다 (예전과 같다)');
  goldmine.auto = true;
  // 봇은 맡지 않는다
  const b = g.players.spawn('봇', true);
  g.command(b, { t: 'dungeonGo', id: 'goldmine' });
  check(b.bot && !g.dungeon.runOf(b), '봇은 dungeonGo를 받지 않는다 (자동 전투에도 들지 않는다)');
}

// ---------- 던전 뒤 단계로 돌아가기: 끝냈을 때, 스스로 나왔을 때, 끊겼을 때 ----------
{
  const g = new Game({ now: () => T, plugins: [] });
  const p = g.players.spawn('돌아가기', false, null, 'if-4');
  const exits: string[] = [];
  g.on('dungeonExited', (_q, id, why) => exits.push(`${id}:${why}`));
  const cur = p.stage.cur;
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  for (const e of mobsIn(g, p)) g.combat.damage(p, e, e.hp + 1, false);
  check(g.dungeon.runOf(p)?.cleared === true && p.mail.some((m) => m.k === 'dungeon' && m.r.items?.stardust === 4), '금광을 끝낸다 (보상 우편에 별가루 4)');
  step(g, 8.1); // exitS 8초 뒤 회차가 닫힌다
  check(!g.dungeon.runOf(p) && exits.join() === 'goldmine:end' && g.stages.returnIn(p) !== undefined && !g.stages.inStage(p), `끝나 나오면 사건 dungeonExited(end), 단계로 돌아가기를 기다린다 (${g.stages.returnIn(p)?.toFixed(2)}초)`);
  step(g, 2.1);
  check(g.stages.inStage(p) && p.stage.cur === cur, `2초 뒤 지금 단계(${cur})로 돌아간다`);
  // 끊겨 나온 것은 돌아가지 않는다
  g.command(p, { t: 'dungeonGo', id: 'goldmine' });
  g.fire('playerDropped', p);
  check(exits[exits.length - 1] === 'goldmine:drop' && g.stages.returnIn(p) === undefined, '접속이 끊겨 나온 것(drop)은 단계로 돌려보내지 않는다 (다시 접속하면 enterOnJoin이 맡는다)');
  // 기다리는 사이 스스로 단계를 시작했으면 그만둔다
  const q = g.players.spawn('사이', false, null, 'if-5');
  g.command(q, { t: 'dungeonGo', id: 'goldmine' });
  g.command(q, { t: 'dungeonLeave' });
  check(g.stages.returnIn(q) !== undefined, '스스로 나오면(self) 기다린다');
  g.command(q, { t: 'stage', a: 'start' });
  step(g, 0.1);
  check(g.stages.inStage(q) && g.stages.returnIn(q) === undefined, '그사이 스스로 단계에 들어가면 기다림을 지운다');
  // 끄면 예전처럼 문 앞에 남는다
  const was = STAGE_RULE_VIEW.returnAfterDungeon;
  (STAGE_RULE_VIEW as { returnAfterDungeon?: number }).returnAfterDungeon = undefined;
  const g2 = new Game({ now: () => T, plugins: [] });
  const r = g2.players.spawn('그대로', false, null, 'if-6');
  g2.command(r, { t: 'dungeonGo', id: 'goldmine' });
  g2.command(r, { t: 'dungeonLeave' });
  step(g2, 5);
  check(!g2.stages.inStage(r) && !g2.dungeon.runOf(r) && Math.hypot(r.x - 26, r.z + 26) < 4, 'returnAfterDungeon이 없으면 나와서 문 앞에 남는다 (예전과 같다)');
  (STAGE_RULE_VIEW as { returnAfterDungeon?: number }).returnAfterDungeon = was;
}

// ---------- 재료로 영웅 키우기 ----------
{
  const g = new Game({ now: () => T, plugins: [] });
  const p = g.players.spawn('재료', false, null, 'if-7');
  g.roster.grant(p, 'ironwall'); g.roster.grant(p, 'starseer');
  g.bag.putItem(p, 'stardust', 20, 'start');
  g.notices = [];
  g.command(p, { t: 'hero', a: 'trade', id: 'ironwall', item: 'stardust' });
  check(p.heroes.ironwall.shards === 5 && p.items.stardust === 17 && said(g, p, 'heroTraded'), `일반 영웅: 별가루 3 → 조각 5 (조각 ${p.heroes.ironwall.shards}, 남은 별가루 ${p.items.stardust})`);
  const n = g.notices.find((x) => x.k === 'heroTraded');
  check(n?.a.join() === 'ironwall,5,stardust,17', `안내문 heroTraded [영웅, 조각, 아이템, 남은 수] (${n?.a.join()})`);
  g.command(p, { t: 'hero', a: 'trade', id: 'ironwall', item: 'stardust', n: 2 });
  check(p.heroes.ironwall.shards === 15 && p.items.stardust === 11, `n번 한꺼번에: 별가루 6 → 조각 10 (조각 ${p.heroes.ironwall.shards})`);
  check(rowsOf(g, 'item:stardust', 'cmd:hero:trade', '-') === 9, `장부: 별가루가 원인 cmd:hero:trade로 9개 나갔다 (${rowsOf(g, 'item:stardust', 'cmd:hero:trade', '-')})`);
  g.notices = [];
  const before = JSON.stringify([p.heroes, p.items]);
  g.command(p, { t: 'hero', a: 'trade', id: 'starseer', item: 'stardust' });
  const short = g.notices.find((x) => x.k === 'itemShort');
  check(short?.a.join() === 'stardust,15,11' && JSON.stringify([p.heroes, p.items]) === before, `전설은 15개: 모자라면 itemShort, 아무것도 바뀌지 않는다 (${short?.a.join()})`);
  for (const bad of [{ id: 'swiftarrow' }, { id: 'ironwall', item: 'skillbook' }, { id: 'ironwall', n: 0 }, { id: 'ironwall', n: 1.5 }, { id: 'ironwall', n: 100 }, { id: 'ironwall', n: '2' }, { id: 'nope' }]) {
    g.command(p, { t: 'hero', a: 'trade', item: 'stardust', ...bad });
  }
  check(JSON.stringify([p.heroes, p.items]) === before, '가지지 않은 영웅, 교환이 없는 아이템, 이상한 횟수는 받지 않는다');
  g.bag.putItem(p, 'stardust', 4, 'start');
  g.command(p, { t: 'hero', a: 'trade', id: 'starseer', item: 'stardust' });
  check(p.heroes.starseer.shards === 25 && p.items.stardust === 0, '전설: 별가루 15 → 조각 25 (그 등급의 한 묶음)');
  // 저장: 조각은 영웅의 저장에 그대로
  const save = g.players.export(p), g2 = new Game({ now: () => T, plugins: [] });
  const q = g2.players.spawn('재료', false, structuredClone(save), 'if-7');
  check(q.heroes.ironwall.shards === 15 && q.heroes.starseer.shards === 25 && (q.items.stardust ?? 0) === 0, '저장하고 다시 읽어도 조각과 별가루가 그대로');
  // 화면의 셈
  const v = tradeViews('ironwall', true, { stardust: 4 });
  check(v.length === 1 && v[0].cost === 3 && v[0].shards === 5 && v[0].have === 4 && v[0].can, '화면: 일반 영웅의 단추 (별가루 3 → 조각 5, 가진 4: 누를 수 있다)');
  check(!tradeViews('starseer', true, { stardust: 4 })[0].can && tradeViews('ironwall', false, { stardust: 99 }).length === 0, '화면: 모자라면 잠기고, 가지지 않은 영웅에게는 단추가 없다');
  // 끄면 명령이 아무것도 하지 않는다
  const was = HERO_RULE_VIEW.trade;
  (HERO_RULE_VIEW as { trade?: unknown }).trade = undefined;
  const g3 = new Game({ now: () => T, plugins: [] });
  const r = g3.players.spawn('끔', false, null, 'if-8');
  g3.roster.grant(r, 'ironwall'); g3.bag.putItem(r, 'stardust', 9, 'start');
  g3.command(r, { t: 'hero', a: 'trade', id: 'ironwall', item: 'stardust' });
  check(r.heroes.ironwall.shards === 0 && r.items.stardust === 9 && tradeViews('ironwall', true, { stardust: 9 }).length === 0, 'trade가 없으면 교환도 단추도 없다');
  (HERO_RULE_VIEW as { trade?: unknown }).trade = was;
}

// ---------- 돌아왔을 때의 창 ----------
{
  const g = new Game({ now: () => T, plugins: [] });
  const save = { name: '돌아옴', v: 1, seen: T - H, ext: { roster: { stormblade: [40, 6, 0], starseer: [40, 6, 0] }, squad: ['stormblade', 'starseer'], stages: { cur: '1-1', best: '', auto: true } } };
  const p = g.players.spawn('돌아옴', false, structuredClone(save) as never, 'if-9');
  const msgs = g.out.filter((o) => o.id === p.id && o.msg.t === 'idleBack').map((o) => o.msg as { t: 'idleBack' } & IdleBack);
  const mail = p.mail.find((m) => m.k === 'idle');
  check(msgs.length === 1 && !!mail && msgs[0].mail === mail.id && msgs[0].min === 60 && JSON.stringify(msgs[0].r) === JSON.stringify(mail.r),
    `한 시간 비우고 돌아오면 idleBack 하나: 그 방치 우편의 id(${msgs[0]?.mail})와 분(${msgs[0]?.min}), 보상이 우편과 같다`);
  check(msgs[0].from === '1-1' && msgs[0].to === '2-2' && msgs[0].n === 6, `오프라인 진행이 있으면 처음·지금 단계와 깬 수 (${msgs[0]?.from} → ${msgs[0]?.to}, ${msgs[0]?.n})`);
  // 받기는 우편으로: 장부의 원인은 우편의 것
  const gold0 = p.gold;
  g.command(p, { t: 'mailClaim', id: msgs[0].mail });
  check(p.gold - gold0 === mail!.r.gold && !p.mail.some((m) => m.k === 'idle') && rowsOf(g, 'gold', mailWhy('idle'), '+') === mail!.r.gold, `창의 '받기'(mailClaim)로 받으면 우편이 사라지고 골드는 원인 ${mailWhy('idle')}로 들어온다`);
  // 진행 없는 사람, 짧게 비운 사람, 봇
  const q = g.players.spawn('짧게', false, { name: '짧게', v: 1, seen: T - 5 * 60000 } as never, 'if-10');
  const r = g.players.spawn('진행 없음', false, { name: '진행 없음', v: 1, seen: T - 2 * H } as never, 'if-11');
  const of = (e: Ent) => g.out.filter((o) => o.id === e.id && o.msg.t === 'idleBack').map((o) => o.msg as { t: 'idleBack' } & IdleBack);
  check(of(q).length === 0 && !q.mail.some((m) => m.k === 'idle'), '10분보다 짧게 비우면 우편도 창도 없다');
  check(of(r).length === 1 && of(r)[0].min === 120 && of(r)[0].to === undefined && of(r)[0].n === undefined, '진행이 없으면 분과 보상만 (from·to·n 없음)');
  const b = g.players.spawn('봇', true);
  check(of(b).length === 0, '봇에게는 보내지 않는다');
  // 끄면 예전처럼 우편만
  (IDLE_VIEW as { popup?: boolean }).popup = false;
  const g2 = new Game({ now: () => T, plugins: [] });
  const s = g2.players.spawn('끔', false, { name: '끔', v: 1, seen: T - 2 * H } as never, 'if-12');
  check(!g2.out.some((o) => o.msg.t === 'idleBack') && s.mail.some((m) => m.k === 'idle'), 'popup이 없으면 메시지가 없고 우편만 온다 (예전과 같다)');
  (IDLE_VIEW as { popup?: boolean }).popup = true;
  check(IDLE === IDLE_VIEW, 'IDLE_VIEW는 내용의 IDLE 그 자체다 (넓은 타입으로 본 것)');
  // 화면의 셈: 보일 줄
  const lines = idleBackLines({ gold: 10, exp: 0, sparks: 3, items: { stardust: 2, skillbook: 0 }, gear: [] });
  check(lines.map((x) => `${x.what}:${x.n}`).join() === 'gold:10,sparks:3,stardust:2', `창의 줄: 0인 것은 뺀다 (${lines.map((x) => `${x.what}:${x.n}`).join()})`);
}

// ---------- 화면의 셈: 메뉴의 던전 줄 ----------
{
  const def = { key: { refill: 2, cap: 2 }, minLv: 3, perDay: 2 };
  const a = dungeonGoView(def, 'm', { m: { n: 1, bought: 0 } }, 0, 5, false);
  check(a.can && a.key && a.n === 1 && a.cap === 2 && a.why === '', '열쇠 던전: 열쇠 1/2, 들어갈 수 있다');
  check(dungeonGoView(def, 'm', { m: { n: 0, bought: 0 } }, 0, 5, false).why === 'none' && dungeonGoView(def, 'm', null, 0, 2, false).why === 'lv' && dungeonGoView(def, 'm', null, 0, 5, true).why === 'in',
    '열쇠가 없으면 none, 레벨이 모자라면 lv, 던전 안이면 in');
  const runs = dungeonGoView({ minLv: 1, perDay: 3 }, 'x', null, 2, 1, false);
  check(!runs.key && runs.n === 1 && runs.cap === 3 && runs.can && dungeonGoView({ minLv: 1, perDay: 3 }, 'x', null, 3, 1, false).why === 'none', '하루 횟수 던전: 오늘 남은 횟수 1/3, 다 쓰면 none');
}

// ---------- 화면의 틀 요소 끄기 ----------
{
  check(hiddenHudIds().join() === 'bagBtn,tabBtn', `시험용 내용의 HUD.hide: 가방 단추와 '가까운 대상 공격' (${hiddenHudIds().join()})`);
  check(hiddenHudIds({}).length === 0 && hiddenHudIds({ hide: ['nope' as never, 'minimap'] }).join() === 'mapBox', '적지 않으면 없음, 모르는 이름은 건너뛴다');
  const missing = Object.values(HUD_PARTS).flat().filter((id) => !SKELETON.includes(`id="${id}"`));
  check(missing.length === 0, `이름마다의 요소 id가 모두 틀의 뼈대에 있다 (없는 것 ${missing.join() || '없음'})`);
}

// ---------- 틀 안의 타입 오류였던 두 경우: CAMPS를 적지 않은 게임, 아이템이 무기와 재료뿐(갑옷 없음)인 게임 ----------
// 시험용 내용을 그렇게 바꾼 변형을 만들어 틀만 그 내용으로 타입 검사한다 (games/sample/test/empty.test.ts와 같은 방법). 변형은 node_modules/.cache/ 아래에
{
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { removeTemp } = await import('../harness');
  const root = new URL('../../../', import.meta.url);
  let src = fs.readFileSync(new URL('engine/test/collect/shared/content/index.ts', root), 'utf8').replace(/\r\n/g, '\n');
  const swap = (re: RegExp, to: string) => { if (!re.test(src)) throw new Error(`자리를 찾지 못했다: ${re}`); src = src.replace(re, to); };
  // CAMPS를 내보내지 않는다 (맵의 isFree가 읽으므로 이름만 숨긴다), 아이템은 무기 하나와 재료(as const: 좁은 타입), GEAR의 갑옷도 무기로
  swap(/export const CAMPS: [^\n]*\n/, 'const CAMPS: readonly { x: number; z: number }[] = [];\n');
  swap(/export const ITEMS: [^=]*= \{/, 'export const ITEMS = {');
  swap(/  sweepticket: \{ kind: 'token'/, "  sweepticket: { kind: 'mat'");
  swap(/  herochoice: \{ kind: 'token'/, "  herochoice: { kind: 'mat'");
  swap(/  stardust: \{ kind: 'mat', price: 0, max: 999 \},\n\};/, "  stardust: { kind: 'mat', price: 0, max: 999 },\n} as const satisfies Record<string, ItemDef>;");
  const dir = new URL(`node_modules/.cache/collect-narrow-${process.pid}/`, root);
  fs.mkdirSync(new URL('shared/content/', dir), { recursive: true });
  fs.writeFileSync(new URL('shared/content/index.ts', dir), src);
  const up = '../../../';
  fs.writeFileSync(new URL('tsconfig.json', dir), JSON.stringify({ extends: `${up}tsconfig.json`, compilerOptions: { paths: { '@engine/*': [`${up}engine/*`], '@game/*': ['./*'] } }, include: [`${up}engine/shared`, `${up}engine/server`, `${up}engine/client`] }, null, 2));
  const tsc = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '--noEmit', '--pretty', 'false', '-p', fileURLToPath(new URL('tsconfig.json', dir))], { cwd: fileURLToPath(root), encoding: 'utf8' });
  const errors = `${tsc.stdout}${tsc.stderr}`.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  for (const l of errors.slice(0, 8)) console.log('  ' + l);
  check(tsc.status === 0 && errors.length === 0, `CAMPS를 적지 않고 아이템이 무기와 재료뿐(as const)인 내용으로도 틀이 컴파일된다${errors.length ? `: 오류 ${errors.length}개` : ''}`);
  removeTemp(dir);
}
