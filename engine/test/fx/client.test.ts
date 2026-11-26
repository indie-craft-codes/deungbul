// 화면(engine/client)의 셈을 브라우저 없이 본다: 화면 요소를 읽지 않게 떼어 낸 순수한 파일만 읽는다 (hud/bagcells.ts, hud/menu/tabs.ts, keys.ts).
//   1. 가방의 그림 칸: 어떤 아이템이 어떤 차례로, 칸 귀퉁이의 든 수
//   2. 메뉴의 탭: 고른 모듈마다 틀의 탭, 게임이 고른 차례(setMenuTabs)와 더한 탭(addMenuTab), 늘 보이는 탭, 일일 탭 숨기기
//   3. 단축키: 고른 모듈마다 틀이 다는 키. 표(keys.ts)가 실제로 bindKey를 부르는 소스와 같은가
// 그리는 것 자체(요소, 스타일)는 화면으로 본다. 화면은 startClient가 실제로 달린 키를 이 표와 견주어 다르면 콘솔에 경고한다.
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, itemDef, type ItemId } from '../../shared/defs';
import { ALL_MODULES, MODULE_TABLE, type ModuleId } from '../../shared/modules';
import { BAG_KINDS, bagCells, cellCount } from '../../client/hud/bagcells';
import { ENGINE_TAB_MODS, MENU_TABS, tabsForModules, visibleTabs } from '../../client/hud/menu/tabs';
import { engineKeys, keyDiff, keysFor } from '../../client/keys';
import { check } from '../harness';

// ---------- 1. 가방의 그림 칸 ----------
{
  const ids = Object.keys(ITEMS) as ItemId[];
  const kindOf = (id: ItemId) => itemDef(id).kind;
  const want = BAG_KINDS.flatMap(([k]) => ids.filter((id) => kindOf(id) === k));
  const potions = ids.filter((id) => kindOf(id) === 'potion'), mats = ids.filter((id) => kindOf(id) === 'mat');
  const none = bagCells({});
  check(none.length === want.length && none.length === potions.length + mats.length + ids.filter((id) => kindOf(id) === 'token').length && none.every((c) => c.n === 0 && c.count === null),
    `가진 것이 없어도 물약·재료·특별한 물건마다 칸이 하나씩 있고 (${none.length}칸), 귀퉁이 글이 없다 (흐린 칸)`);
  check(none.map((c) => c.id).join() === want.join() && none.slice(0, potions.length).every((c) => kindOf(c.id) === 'potion'), `칸의 차례: 물약 → 재료 → 특별한 물건, 같은 종류 안에서는 내용의 차례 (${none.map((c) => c.id).join(', ')})`);
  check(!none.some((c) => ['weapon', 'armor'].includes(kindOf(c.id))), '장비(무기·갑옷)는 가방의 칸에 없다 (메뉴의 장비 탭에서 다룬다)');
  const have: Record<string, number> = { [potions[0]]: 3, [mats[0]]: 12345, [mats[1]]: 9999 };
  const cells = bagCells(have), at = (id: ItemId) => cells.find((c) => c.id === id)!;
  check(cells.length === none.length && at(potions[0]).count === '3' && at(mats[0]).count === '12k' && at(mats[1]).count === '9999' && cells.filter((c) => c.count !== null).length === 3,
    `든 수: 가진 것만 귀퉁이에 적고, 만 개부터는 줄인다 (3, 12345 → ${at(mats[0]).count}, 9999)`);
  check(cellCount(1) === '1' && cellCount(10000) === '10k' && cellCount(10999) === '10k' && cellCount(250000) === '250k', '귀퉁이 글: 1, 10000 → 10k, 10999 → 10k, 250000 → 250k');
  check(bagCells({}, []).length === 0 && bagCells({}, ids.filter((id) => kindOf(id) === 'weapon')).length === 0, '칸에 놓을 아이템이 없는 게임은 칸이 없다 (가방 창은 머리줄을 그리지 않는다)');
}

// ---------- 2. 메뉴의 탭 ----------
{
  type Tab = { id: string; mod?: ModuleId; always?: boolean };
  const engine: Tab[] = MENU_TABS.map((id) => ({ id, mod: ENGINE_TAB_MODS[id] }));
  const device: Tab = { id: 'device', always: true };
  const ids = (list: Tab[]) => list.map((x) => x.id).join(',');
  const pick = (mods: readonly ModuleId[]) => (m: ModuleId) => mods.includes(m);
  check(MENU_TABS.every((id) => ENGINE_TAB_MODS[id] in MODULE_TABLE), `틀의 탭은 저마다 있는 모듈에 속한다 (${MENU_TABS.map((id) => `${id}:${ENGINE_TAB_MODS[id]}`).join(' ')})`);
  check(ids(tabsForModules(engine, pick(ALL_MODULES))) === MENU_TABS.join(), `모듈을 다 고른 게임: 틀의 탭 일곱 (${MENU_TABS.join(', ')})`);
  check(tabsForModules(engine, pick([])).length === 0, '모듈을 하나도 고르지 않은 게임(핵심만): 틀의 탭이 없다');
  const noTrade = ALL_MODULES.filter((m) => !['market', 'guild', 'rank'].includes(m));
  check(ids(tabsForModules(engine, pick(noTrade))) === 'gear,build,mail,daily', `거래소·길드·순위를 빼면 그 탭만 없다 (${ids(tabsForModules(engine, pick(noTrade)))})`);
  check(ids(tabsForModules(engine, pick(['economy', 'items', 'gear', 'mail']))) === 'gear,mail', '재화·아이템·장비·우편만 고르면 장비와 우편 탭');
  // 게임이 더한 탭(모듈 없음)과 늘 보이는 기기 탭
  const all = [...tabsForModules(engine, pick(noTrade)), { id: 'fire' }, device];
  check(ids(visibleTabs(all, null, false)) === 'gear,build,mail,daily,fire,device', '고른 차례가 없으면 모두, 더한 차례대로');
  check(ids(visibleTabs(all, null, true)) === 'gear,build,mail,fire,device', '일일 임무도 출석도 없는 게임은 일일 탭을 숨긴다');
  check(ids(visibleTabs(all, ['fire', 'gear', 'market'], false)) === 'fire,gear,device', 'setMenuTabs의 차례대로, 고르지 않은 모듈의 탭(market)은 건너뛰고, 기기 탭은 목록에 없어도 맨 뒤에');
  check(ids(visibleTabs(all, ['device', 'gear'], false)) === 'device,gear', '늘 보이는 탭을 목록에 넣으면 그 자리에 (두 번 나오지 않는다)');
  check(ids(visibleTabs(all, [], false)) === 'device', '빈 목록이면 늘 보이는 탭만');
}

// ---------- 3. 단축키 ----------
{
  const all = (m: ModuleId) => ALL_MODULES.includes(m);
  check(keysFor(all, 3).join() === 'm,n,h,1,2,3,tab,q,b,r', `모듈을 다 고른 게임(기술 칸 3): ${keysFor(all, 3).join(' ')}`);
  check(keysFor(() => false, 3).join() === 'm,n,h', '핵심만의 게임: 메뉴(M), 지도(N), 집으로(H)');
  check(keysFor((m) => m === 'items' || m === 'economy', 3).join() === 'm,n,h,q,b', '아이템만: 물약(Q)과 가방(B)이 더해진다. 숫자·Tab·R은 비어 게임이 쓸 수 있다');
  check(keysFor((m) => m === 'combat' || m === 'classes', 12).filter((k) => /^\d$/.test(k)).join() === '1,2,3,4,5,6,7,8,9' && keysFor(all, 0).every((k) => !/^\d$/.test(k)), '숫자 키는 기술 칸 수만큼, 9개까지 (칸이 없으면 없다)');
  check(JSON.stringify(keyDiff(['m', 'x'], ['m', 'n'])) === '{"missing":["n"],"extra":["x"]}' && keyDiff(['n', 'm'], ['m', 'n']).missing.length === 0, 'keyDiff: 표에만 있는 키와 표에 없는 키 (차례는 보지 않는다)');

  // 표가 소스와 같은가: bindKey('글자')를 부르는 곳과 표의 키·파일, 그 파일을 init하는 모듈과 표의 모듈
  const root = path.resolve(import.meta.dirname, '..', '..', 'client');
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : []));
  const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');
  const found: string[] = [];
  for (const f of walk(root)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/bindKey\('([^']+)'/g)) found.push(`${m[1]}@${rel(f)}`);
  const table = engineKeys(1).filter((k) => !/^\d$/.test(k.key)).map((k) => `${k.key}@${k.where}`);
  check(found.sort().join() === table.sort().join(), `글자 키: 소스에서 bindKey를 부르는 곳이 표와 같다 (${found.join(' ')})`);
  const me = fs.readFileSync(path.join(root, 'hud', 'me.ts'), 'utf8');
  check(/if \(hasModule\('combat'\)\) \{\s*for \(let i = 0; i < SKILL_SLOTS && i < 9; i\+\+\) bindKey\(String\(i \+ 1\)/.test(me) && engineKeys(3).filter((k) => k.where === 'hud/me.ts').every((k) => k.mod === 'combat'), '숫자 키와 Tab: hud/me.ts가 전투 모듈일 때 기술 칸 수만큼(9개까지) 단다');
  // 화면 모듈 목록(modules.ts)의 init과 그 모듈
  const list = fs.readFileSync(path.join(root, 'modules.ts'), 'utf8');
  const fileOf = new Map([...list.matchAll(/import \{ ([^}]+) \} from '\.\/([^']+)';/g)].flatMap((m) => m[1].split(',').map((n) => [n.trim(), m[2] + '.ts'] as const)));
  const modOf = new Map<string, string | null>([...list.matchAll(/\{ init: (\w+)(?:, mod: '(\w+)')? \}/g)].map((m) => [fileOf.get(m[1]) ?? '?', m[2] ?? null]));
  const wrong = engineKeys(1).filter((k) => modOf.has(k.where) && modOf.get(k.where) !== k.mod).map((k) => `${k.key}: 표 ${k.mod}, modules.ts ${modOf.get(k.where)}`);
  const listed = engineKeys(1).filter((k) => modOf.has(k.where)).length;
  check(wrong.length === 0 && listed >= 5, `키를 다는 화면 모듈이 modules.ts에서 그 모듈일 때만 init된다 (${listed}개 견줌${wrong.length ? `, 다름: ${wrong.join('; ')}` : ''})`);
}
