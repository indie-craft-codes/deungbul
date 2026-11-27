// 엔티티의 모듈 몫 (engine/server/game/parts.ts): 핵심 엔티티에는 핵심의 칸만 있고, 모듈의 칸은 그 모듈을 고른 게임의 엔티티에만 있는가.
// 모듈을 다 고른 게임의 엔티티는 예전(모든 칸을 Game.create가 채우던 때)과 같은 칸을 같은 처음 값으로 갖는가.
// 모듈마다(그 의존과 함께) 띄워 사람과 봇을 돌리고 명령을 보내도, 고르지 않은 모듈의 칸이 엔티티에 새로 생기지 않는가.
import { CLASS_IDS, ITEMS } from '../../shared/defs';
import { ALL_MODULES, MODULE_SAVES, MODULE_TABLE, type ModuleId } from '../../shared/modules';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { blankOf, partKeys, partOwner } from '../../server/game/parts';
import { buildFrame, snapshotFor } from '../../server/net/snapshot';
import { check } from '../harness';

/** 핵심의 칸 (engine/server/game/entity.ts의 Ent에서 모듈과 게임의 칸을 뺀 것. kept는 저장에서 읽을 때만 생긴다) */
const CORE = ['id', 'kind', 'type', 'name', 'x', 'z', 'face', 'tx', 'tz', 'moving', 'stuck', 'lastMove', 'lastAct', 'path', 'pgx', 'pgz', 'pat', 'dead', 'layer', 'wait', 'data', 'bot', 'pid', 'dirty', 'unsaved', 'metaDirty', 'offMs'];
/** 모듈의 칸을 떼기 전에 Game.create가 모든 엔티티에 채우던 칸 전부 (커밋 30218c6의 entity.ts). 모듈을 다 고른 게임의 엔티티는 지금도 이것을 다 갖는다 */
const BEFORE = [...CORE, 'hp', 'maxHp', 'targetId', 'atkCd', 'lastHurt', 'guild', 'auto', 'lv', 'exp', 'need', 'sparks', 'cds', 'cls', 'gold', 'weapon', 'armor', 'items', 'itemCd',
  'gear', 'worn', 'gearSeq', 'bagUp', 'lostFull', 'autoSalvage', 'mail', 'mailSeq', 'daily', 'away', 'stats', 'skillLv',
  'def', 'hx', 'hz', 'respawn', 'hitters', 'swarm', 'scale', 'cast', 'windup', 'slowUntil', 'stunUntil', 'buffs', 'dots', 'homing'];
/**
 * 그 뒤에 더한 모듈의 칸: 수집형·방치형 (roster의 heroes, gacha의 pity·pulls, squad의 squad·squadBack(진형의 뒷줄), stages의 stage, herogear의 hgear·hgSeq).
 * 예전의 게임은 이 모듈을 고르지 않으므로 엔티티에 없다. 변신(morph)의 morph, 게임 안의 모드(modes)의 mode·modeCd도 같다
 */
const ADDED = ['heroes', 'pity', 'pulls', 'squad', 'squadBack', 'stage', 'hgear', 'hgSeq', 'morph', 'mode', 'modeCd', /** 업적(achieve)의 칭호 (묶음 6) */ 'title'];
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
/** 그 모듈과 그 모듈이 기대는 모듈 전부 */
const closure = (m: ModuleId): ModuleId[] => { const out = new Set<ModuleId>([m]); const q = [m]; while (q.length) for (const n of MODULE_TABLE[q.pop()!].needs as readonly ModuleId[]) if (!out.has(n)) { out.add(n); q.push(n); } return ALL_MODULES.filter((x) => out.has(x)); };
const owned = partKeys();
const allPart = [...owned.values()].flat();

check(same([...CORE, ...allPart], [...BEFORE, ...ADDED]) && allPart.every((k) => !CORE.includes(k)), `모듈의 칸(${allPart.length}개)과 핵심의 칸(${CORE.length}개)을 합치면 예전의 엔티티 칸(${BEFORE.length}개)과 수집형·변신의 칸(${ADDED.length}개)이고, 겹치지 않는다`);
check(ADDED.every((k) => ['roster', 'gacha', 'squad', 'stages', 'herogear', 'morph', 'modes', 'achieve'].includes(partOwner(k) ?? '')), '수집형의 칸은 수집형의 모듈 넷과 영웅 장비의 것이다 (morph는 변신의 것, mode·modeCd는 게임 안의 모드의 것, title은 업적의 것)');
check([...owned.keys()].every((m) => ALL_MODULES.includes(m)) && partOwner('hp') === 'combat' && partOwner('gold') === 'economy' && partOwner('lv') === 'growth' && partOwner('x') === undefined,
  `칸마다 둔 모듈이 하나다 (${[...owned].map(([m, ks]) => `${m} ${ks.length}`).join(', ')})`);

// 캐릭터 저장의 최상위 칸(MODULE_SAVES.top)은 엔티티의 칸을 그대로 적는다: 칸을 둔 모듈과 저장 칸의 모듈이 같다 (모듈을 끄면 엔티티의 칸과 저장 칸이 함께 빠진다)
{
  const top = Object.entries(MODULE_SAVES.top), off = top.filter(([k, m]) => partOwner(k) !== m);
  check(top.length >= 10 && off.length === 0, `저장의 최상위 칸 ${top.length}개는 그 칸을 둔 모듈의 것이다${off.length ? ` (어긋남: ${off.map(([k, m]) => `${k} ${m}≠${partOwner(k)}`).join(', ')})` : ''}`);
}

// 모듈을 다 고른 게임: 엔티티(사람, 몬스터, 게임의 종류)는 예전의 칸을 다 같은 처음 값으로 갖는다
{
  const g = new Game({ plugins: [] });
  g.defineKind('crate', {});
  const p = g.players.spawn('모두', false), mon = [...g.ents.values()].find((e) => e.kind === 'm')!, crate = g.place('crate', { x: 3, z: 3, hp: 40 });
  check([p, mon, crate].every((e) => same(Object.keys(e), BEFORE)), '모듈을 다 고른 게임의 엔티티(사람, 몬스터, 게임의 종류)는 예전의 칸을 모두 갖는다');
  check(crate.hp === 40 && crate.maxHp === 40 && crate.lv === 1 && crate.cls === '' && crate.autoSalvage === -1 && crate.lastHurt === -99 && crate.hx === crate.x && crate.daily.day === '' && crate.hitters.size === 0,
    '처음 값은 예전과 같다 (체력은 놓을 때 준 값, 레벨 1, 직업 없음, 자동 분해 끔, 집은 장애물 밖으로 맞춘 자리)');
  check(g.field(p, 'gold') === p.gold && g.field(p, 'lv') === p.lv, '고른 모듈의 칸은 g.field가 엔티티의 값을 그대로 읽는다');
}

// 핵심만의 게임: 엔티티에는 핵심의 칸만 있고, g.field는 처음 값을 읽는다
{
  const g = new Game({ plugins: [], modules: [] });
  const p = g.players.spawn('맨몸', false), bot = g.players.spawn('봇', true);
  for (let i = 0; i < 100; i++) g.tick(0.05);
  check(same(Object.keys(p), CORE) && same(Object.keys(bot), CORE), `핵심만의 게임의 엔티티에는 핵심의 칸 ${CORE.length}개만 있다 (사람 ${Object.keys(p).length}개, 봇 ${Object.keys(bot).length}개)`);
  const items = g.field(p, 'items'); items.x = 1;
  check(g.field(p, 'lv') === 1 && g.field(p, 'cls') === '' && g.field(p, 'hp') === 0 && Object.keys(g.field(p, 'items')).length === 0 && !('items' in p),
    '고르지 않은 모듈의 칸은 g.field가 처음 값을 읽고(레벨 1, 직업 없음, 체력 0), 받은 묶음을 고쳐도 다음에 읽는 값과 엔티티는 그대로다');
  let threw = '';
  try { blankOf('x' as never); } catch (err) { threw = String(err); }
  check(threw.includes('모듈의 칸이 아닙니다'), '모듈의 칸이 아닌 이름은 처음 값을 묻지 못한다');
  const frame = buildFrame(g.ents.values(), () => undefined, { hp: false, weapon: false, cls: false });
  const snap = snapshotFor(p, new Set(), frame, [], 2).json;
  const you = (JSON.parse(snap) as { you: number[] }).you;
  check(you.length === 5 && you[3] === 0 && you[4] === 0, `전투가 없는 게임의 you에서 체력과 노리는 대상의 칸은 0이다 (${JSON.stringify(you)})`);
}

// 게임의 처음 값(g.entInit)은 고른 모듈의 칸이 채워진 뒤에 불린다
{
  const saw: string[] = [];
  const g = new Game({ plugins: [(g) => { g.entInit.push((e) => { saw.push(`${e.kind}:${typeof e.gold}:${typeof e.hp}`); }); }], modules: ['economy'] });
  g.players.spawn('하나', false);
  check(saw.length === 1 && saw[0] === 'p:number:undefined', `게임의 entInit은 고른 모듈의 칸(골드)이 채워진 뒤에, 고르지 않은 칸(체력) 없이 불린다 (${saw.join(' ')})`);
}

// 모듈마다(그 의존과 함께): 저장을 읽고, 봇과 함께 돌고, 명령을 받아도 고르지 않은 모듈의 칸이 생기지 않는다
{
  // 모듈을 다 고른 게임에서 키운 캐릭터의 저장 (모든 칸이 있다)
  const full = new Game({ plugins: [] });
  const grown = full.players.spawn('키운사람', false, null, 'parts-grown');
  if (CLASS_IDS.length) full.classes.apply(grown, CLASS_IDS[0]);
  full.wallet.add(grown, 'gold', 500, ''); full.players.grant(grown, 400, 20);
  const potion = Object.keys(ITEMS).find((id) => (ITEMS as Record<string, { kind: string }>)[id].kind === 'potion');
  if (potion) full.bag.putItem(grown, potion as never, 3, '');
  const save = full.players.export(grown);
  const cmds = (p: Ent, other: Ent): Record<string, unknown>[] => [
    { t: 'move', x: p.x + 4, z: p.z + 2 }, { t: 'stop' }, { t: 'class', id: CLASS_IDS[0] ?? 'x' }, { t: 'attack', id: other.id }, { t: 'skill', n: 0 },
    { t: 'buy', id: potion ?? 'x' }, { t: 'use', id: potion ?? 'x' }, { t: 'auto', on: true }, { t: 'mailClaim', id: 0 }, { t: 'stat', k: 'pow' },
    { t: 'party', a: 'invite', id: other.id }, { t: 'guild', a: 'create', name: '칸길드' }, { t: 'rank' }, { t: 'market', a: 'list' }, { t: 'bagUp' }, { t: 'channel', n: 2 },
    { t: 'hero', a: 'level', id: 'x' }, { t: 'gacha', id: 'x', n: 1 }, { t: 'squad', ids: [] }, { t: 'stage', a: 'start' }, { t: 'stage', a: 'auto', on: false }, { t: 'dungeonKey', id: 'x' },
  ];
  const bad: string[] = [];
  for (const m of ALL_MODULES) {
    const on = closure(m), allowed = new Set([...CORE, 'kept', ...on.flatMap((x) => owned.get(x) ?? [])]);
    const g = new Game({ plugins: [], modules: on });
    const a = g.players.spawn('저장', false, structuredClone(save), 'parts-a'), b = g.players.spawn('새사람', false, null, 'parts-b');
    for (let i = 0; i < 4; i++) g.players.spawn('봇' + i, true);
    for (let i = 0; i < 300; i++) {
      if (i % 30 === 0) for (const c of cmds(a, b)) { g.command(a, c); g.command(b, { ...c, id: a.id }); }
      g.tick(0.05);
    }
    const out = JSON.stringify([g.players.export(a), g.players.export(b)]);
    const fields = { hp: g.has('combat'), weapon: g.has('items'), cls: g.has('classes') };
    const snap = snapshotFor(a, new Set(), buildFrame(g.ents.values(), () => undefined, fields), g.events, 2).json;
    let parsed = true;
    try { JSON.parse(snap); } catch { parsed = false; }
    const stray = [...g.ents.values()].flatMap((e) => Object.keys(e).filter((k) => !allowed.has(k)).map((k) => `${e.kind}.${k}`));
    if (stray.length || out.includes('null') || !parsed) bad.push(`${m}(${on.join('+')}): ${[...new Set(stray)].join(',') || ''}${out.includes('null') ? ' 저장에 null' : ''}${parsed ? '' : ' 스냅샷이 JSON이 아니다'}`);
  }
  for (const x of bad) console.log('  ' + x);
  check(bad.length === 0, `모듈 ${ALL_MODULES.length}개를 하나씩(의존과 함께) 띄워 저장을 읽고 봇과 돌고 명령을 받아도 고르지 않은 모듈의 칸이 생기지 않고, 저장에 깨진 값(NaN → null)이 없다`);
}
