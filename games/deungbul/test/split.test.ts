// 틀(engine/)과 이 게임(games/deungbul/)의 경계: 의존 방향, 내용 통로, 확장 지점, 언어 파일, 화면의 틀과 뼈대를 소스와 실행으로 검사한다.
// 예전에는 engine/test/framework.test.ts에 있었다. 이 게임의 파일 경로와 이름을 알아야 하므로 이 게임의 시험이다.
// 어느 게임에나 맞는 틀의 규칙(깊은 import 금지, 틀이 games/를 읽지 않음, 게임의 낱말과 id, 층)은 engine/test/boundary.test.ts가 이 게임 없이도 지킨다.
import fs from 'node:fs';
import { Game } from '@engine/server';
import { check } from '@engine/testing';

/**
 * import 문에 적힌 경로를 저장소 뿌리 기준의 파일 경로로 바꾼다: 상대 경로와 별칭(@engine, @game: tsconfig.json의 paths)을 따라간다.
 * 그 밖의 것(node:, 패키지)은 null
 */
const ALIASES: [string, string][] = [['@engine/', 'engine/'], ['@game/', 'games/deungbul/']];
function resolveSpec(root: URL, file: string, spec: string): string | null {
  // 틀의 시험용 내용(engine/test/fx) 안에서는 @game이 그 폴더를 가리킨다 (engine/test/fx/tsconfig.json)
  if (file.startsWith('engine/test/fx/') && spec.startsWith('@game/')) return `engine/test/fx/${spec.slice('@game/'.length)}`;
  const p = spec.startsWith('.') ? new URL(spec, new URL(file, root)).href.slice(root.href.length) : ALIASES.map(([alias, dir]) => (spec.startsWith(alias) ? dir + spec.slice(alias.length) : null)).find((x) => x !== null) ?? null;
  // 폴더를 가리키면 그 폴더의 입구(index.ts)다: 틀의 입구 '@engine/server', '@engine/client', '@engine/shared'
  return p !== null && !fs.existsSync(new URL(`${p}.ts`, root)) && fs.existsSync(new URL(`${p}/index.ts`, root)) ? `${p}/index` : p;
}

// ---------- 의존 방향: 폴더 (docs/framework-plan.md의 단계 9) ----------
// 틀은 engine/ 아래에, 이 게임은 games/deungbul/ 아래에 있다. 방향은 폴더로 본다 (아래의 블록들은 같은 것을 더 잘게, 가져오는 이름까지 본다):
//   1. engine/ 아래의 어떤 파일도 games/를 상대 경로로 import하지 않는다
//   2. 틀의 소스(시험을 뺀 것)가 별칭 @game으로 읽는 것은 내용 통로(@game/shared/content) 하나뿐이고, 읽는 자리도 틀의 내용 통로(engine/shared/defs.ts, defs/, contract.ts, world.ts)뿐이다
//   3. 틀의 통로가 @game에서 다시 내보내는 이름은 내용 계약(engine/shared/contract.ts)의 이름과 같다: 계약 밖의 것은 틀로 나오지 않는다
//   4. 틀의 시험이 @game으로 읽는 것은 게임의 내용 통로(@game/shared/defs, @game/shared/world)뿐이다 (아직 등불지기의 좌표와 id 위에서 돈다: 13단계에서 뗀다)
//   5. games/deungbul/은 engine/을 별칭 @engine으로만 읽는다 (상대 경로로 폴더를 넘지 않는다). 방향은 게임 → 틀이다
//   6. 틀이 읽는 게임의 내용 파일(content/index.ts가 내보내는 것)은 틀에서 타입만 가져온다: 값을 읽으면 틀의 도우미와 서로 물려 초기화 순서가 꼬인다
//   7. 틀만 타입 검사(tsconfig.engine.json: engine/의 소스만)해도 오류가 없다: 틀이 게임의 선언(시스템 칸, 안내문, 공유 상태)에 기대면 여기서 잡힌다
{
  const root = new URL('../../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 그 파일의 import·export … from·declare module에 적힌 경로들. typeOnly: 문장 전체가 타입만 가져오는가 (import type) */
  const specsOf = (file: string): { spec: string; typeOnly: boolean }[] =>
    [...read(file).matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*declare\s+module\s*['"]([^'"]+)['"]/gm)]
      .map((m) => ({ spec: m[2] ?? m[3] ?? m[4] ?? m[5], typeOnly: !!m[1] }));
  const engineFiles = list('engine/'), gameFiles = list('games/deungbul/');
  const isTest = (f: string): boolean => f.startsWith('engine/test/');
  // 검사가 실제로 읽어 내는지: 경로를 풀어내는 법과, 양쪽 폴더에서 별칭을 실제로 쓰는 곳
  check(resolveSpec(root, 'engine/client/hud/x.ts', '../../../games/deungbul/shared/defs') === 'games/deungbul/shared/defs' && resolveSpec(root, 'games/deungbul/server/x.ts', '@engine/server/game/game') === 'engine/server/game/game'
    && resolveSpec(root, 'engine/shared/defs.ts', 'node:fs') === null && engineFiles.length >= 110 && gameFiles.length >= 70
    && specsOf('engine/shared/defs.ts').some((s) => s.spec === '@game/shared/content') && specsOf('games/deungbul/server/systems/tower.ts').some((s) => s.spec === '@engine/server')
    && specsOf('games/deungbul/shared/content/items.ts').some((s) => s.spec === '@engine/shared/defs/items' && s.typeOnly) && specsOf('games/deungbul/shared/deungbul.ts').some((s) => s.spec === '@engine/shared/ext'),
    `폴더를 넘는 import를 읽어 낸다 (engine/ 아래 ${engineFiles.length}개, games/deungbul/ 아래 ${gameFiles.length}개)`);

  // 1
  const relOut = engineFiles.flatMap((f) => specsOf(f).filter((s) => s.spec.startsWith('.') && !(resolveSpec(root, f, s.spec) ?? '').startsWith('engine/')).map((s) => `${f} -> ${s.spec}`));
  for (const x of relOut) console.log('  ' + x);
  check(relOut.length === 0, 'engine/ 아래의 어떤 파일도 상대 경로로 폴더 밖(games/)을 import하지 않는다');

  // 2
  /** 틀에서 게임의 내용을 읽어도 되는 자리: 틀의 내용 통로와 그 조각들 */
  const isChannel = (f: string): boolean => /^engine\/shared\/(defs|contract|world)\.ts$/.test(f) || f.startsWith('engine/shared/defs/');
  const CONTENT = '@game/shared/content';
  const srcGame = engineFiles.filter((f) => !isTest(f)).flatMap((f) => specsOf(f).filter((s) => s.spec.startsWith('@game')).map((s) => ({ f, spec: s.spec })));
  const srcBad = srcGame.filter((x) => x.spec !== CONTENT || !isChannel(x.f));
  for (const x of srcBad) console.log(`  ${x.f} -> ${x.spec}`);
  check(srcGame.length >= 8 && srcBad.length === 0, `틀의 소스가 @game으로 읽는 것은 내용 통로(${CONTENT})뿐이고, 읽는 자리는 틀의 내용 통로(engine/shared/defs.ts, defs/, contract.ts, world.ts)뿐이다 (${srcGame.length}곳)`);

  // 3
  const contract = /export interface ContentContract \{([\s\S]*?)\n\}/.exec(read('engine/shared/contract.ts'))?.[1] ?? '';
  const wanted = [...contract.matchAll(/^ {2}([A-Z][A-Z_0-9]*):/gm)].map((m) => m[1]);
  const passed = (/export \{([^}]*)\} from '@game\/shared\/content';/.exec(read('engine/shared/defs.ts'))?.[1] ?? '').replace(/\/\/.*$/gm, '').split(',').map((s) => s.trim()).filter(Boolean);
  const onlyContract = wanted.filter((n) => !passed.includes(n)), onlyChannel = passed.filter((n) => !wanted.includes(n));
  check(wanted.length >= 55 && wanted.includes('MAP') && wanted.includes('ECON_HUNT') && new Set(passed).size === passed.length && onlyContract.length === 0 && onlyChannel.length === 0,
    `틀의 통로가 게임에서 다시 내보내는 이름은 내용 계약의 이름과 같다 (${wanted.length}개)${onlyContract.length + onlyChannel.length ? `: 계약에만 ${onlyContract.join(', ') || '없음'}, 통로에만 ${onlyChannel.join(', ') || '없음'}` : ''}`);
  // 계약 밖의 것은 @game의 그 파일이 내보내더라도 틀의 통로로는 나오지 않는다 (실제로 불러 본다)
  const engineDefs = await import('@engine/shared/defs') as Record<string, unknown>, engineWorld = await import('@engine/shared/world') as Record<string, unknown>;
  const gameDefs = await import('../shared/defs') as Record<string, unknown>;
  const leaked = ['SMITH', 'SMITHY', 'SHOP', 'REST', 'restGain', 'RESIDENTS', 'QUESTS', 'RAID', 'GLOW_MAX', 'TOWER', 'TOWERS', 'POND', 'CLEARINGS', 'ZONE_SPLIT', 'MIN_X'].filter((n) => n in engineDefs || n in engineWorld);
  check(leaked.length === 0 && 'SMITHY' in gameDefs && 'RESIDENTS' in gameDefs && wanted.every((n) => n in engineDefs) && 'AREAS' in engineWorld && 'MAP' in engineWorld,
    `이 게임에만 있는 이름(SMITHY, RESIDENTS, TOWER, POND …)은 틀의 통로에 없고 게임의 통로에만 있다${leaked.length ? ': ' + leaked.join(', ') : ''}`);

  // 4
  // engine/test/fx/ 안에서 @game은 게임이 아니라 시험용 내용(그 폴더)을 가리킨다: 이 검사의 대상이 아니다
  const testGame = engineFiles.filter((f) => isTest(f) && !f.startsWith('engine/test/fx/')).flatMap((f) => specsOf(f).filter((s) => s.spec.startsWith('@game')).map((s) => ({ f, spec: s.spec })));
  const testBad = testGame.filter((x) => x.spec !== '@game/shared/defs' && x.spec !== '@game/shared/world');
  for (const x of testBad) console.log(`  ${x.f} -> ${x.spec}`);
  check(testBad.length === 0, `틀의 시험이 @game으로 읽는 것은 게임의 내용 통로(@game/shared/defs, @game/shared/world)뿐이다 (${testGame.length}곳, 시험 파일 ${new Set(testGame.map((x) => x.f)).size}개: 13단계에서 0으로 줄인다)`);

  // 5
  const gameOut = gameFiles.flatMap((f) => specsOf(f).filter((s) => (s.spec.startsWith('.') && !(resolveSpec(root, f, s.spec) ?? '').startsWith('games/deungbul/')) || s.spec.startsWith('@game')).map((s) => `${f} -> ${s.spec}`));
  for (const x of gameOut) console.log('  ' + x);
  const viaAlias = gameFiles.flatMap((f) => specsOf(f).filter((s) => s.spec.startsWith('@engine/'))).length;
  check(viaAlias >= 80 && gameOut.length === 0, `games/deungbul/은 engine/을 별칭 @engine으로만 읽는다: 상대 경로로 폴더를 넘지 않고, 자기 폴더는 상대 경로로 읽는다 (@engine ${viaAlias}곳)`);

  // 6
  const contentFiles = specsOf('games/deungbul/shared/content/index.ts').map((s) => `games/deungbul/shared/content/${s.spec.slice(2)}.ts`);
  const valueReads = contentFiles.flatMap((f) => specsOf(f).filter((s) => !s.typeOnly && (s.spec.startsWith('@engine') || /(^|\/)(defs|world)$/.test(s.spec))).map((s) => `${f} -> ${s.spec}`));
  for (const x of valueReads) console.log('  ' + x);
  check(contentFiles.length >= 10 && contentFiles.every((f) => fs.existsSync(new URL(f, root))) && valueReads.length === 0, `틀이 읽는 게임의 내용 파일 ${contentFiles.length}개는 틀에서 타입만 가져온다 (값을 읽지 않는다)`);

  // 7
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const tsc = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '--noEmit', '--pretty', 'false', '-p', fileURLToPath(new URL('tsconfig.engine.json', root))], { cwd: fileURLToPath(root), encoding: 'utf8' });
  const errors = `${tsc.stdout}${tsc.stderr}`.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  for (const l of errors.slice(0, 20)) console.log('  ' + l);
  check(tsc.status === 0 && errors.length === 0, `틀만 타입 검사해도 오류가 없다 (npm run typecheck:engine: engine/의 소스만, 게임의 선언 없이)${errors.length ? `: 오류 ${errors.length}개` : ''}`);
}

// ---------- 의존 방향: 서버와 공용 ----------
// 틀의 서버 파일(engine/server/ 아래 전부)은 이 게임의 규칙(등탑, 습격, 등탑지기, 퀘스트, 휴식)과 그것을 까는 플러그인을 import하지 않는다.
// 게임 규칙(engine/server/game)은 통신 계층(engine/server/net)을 import하지 않는다. import 문을 읽어 검사한다 (타입만 가져오는 것도 센다).
// 파일의 목록은 폴더에서 읽는다: 이 게임의 서버 파일은 games/deungbul/server/ 아래의 것이다 (main.ts는 이 게임의 서버를 띄우는 진입점이다: 플러그인을 고르는 자리).
{
  const root = new URL('../../../', import.meta.url);
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 이 게임의 규칙 파일: 플러그인(deungbul.ts)과 규칙 시스템들 */
  const GAME_FILES = list('games/deungbul/server/').filter((f) => f !== 'games/deungbul/server/main.ts');
  /** 아직 지키지 못하는 것 (지금은 없다: new Game()의 기본값이 틀만이 되면서 game.ts가 플러그인을 import하지 않는다) */
  const EXCEPTIONS: string[] = [];
  /** 그 파일이 import하는 저장소 안의 파일들 (상대 경로와 별칭을 따라간다) */
  const importsOf = (file: string): string[] => {
    const src = fs.readFileSync(new URL(file, root), 'utf8');
    const specs = [...src.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]|\bdeclare\s+module\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
    return specs.map((sp) => resolveSpec(root, file, sp)).filter((p): p is string => p !== null).map((p) => (p.endsWith('.ts') ? p : `${p}.ts`));
  };
  const engine = list('engine/server/');
  const found: string[] = [];
  for (const f of engine) for (const to of importsOf(f)) if (to.startsWith('games/')) found.push(`${f} -> ${to}`);
  const extra = found.filter((x) => !EXCEPTIONS.includes(x)), stale = EXCEPTIONS.filter((x) => !found.includes(x));
  for (const x of extra) console.log('  ' + x);
  check(engine.length >= 30 && GAME_FILES.length === 6 && importsOf('games/deungbul/server/deungbul.ts').filter((x) => GAME_FILES.includes(x)).length === 5 && importsOf('engine/server/net/server.ts').includes('engine/server/game/game.ts'), `import 문을 읽어 낸다 (틀의 서버 파일 ${engine.length}개)`);
  check(extra.length === 0, `틀의 서버 파일은 이 게임의 규칙 시스템과 플러그인을 import하지 않는다 (예외 ${EXCEPTIONS.length}건)`);
  check(stale.length === 0, `예외 목록에 이미 풀린 것이 남아 있지 않다${stale.length ? `: ${stale.join(', ')}` : ''}`);
  const toNet = list('engine/server/game/').flatMap((f) => importsOf(f).filter((to) => to.startsWith('engine/server/net/')).map((to) => `${f} -> ${to}`));
  for (const x of toNet) console.log('  ' + x);
  check(toNet.length === 0, '게임 규칙(engine/server/game)은 통신 계층(engine/server/net)을 import하지 않는다');

  // ---- 확장 지점과 게임의 선언 (단계 2) ----
  // 틀은 넓힐 자리(두 ext.ts)를 비워 두고, 게임은 자기 선언 파일에서 그 두 파일만 선언 병합으로 넓힌다.
  const EXT = ['engine/shared/ext.ts', 'engine/server/game/ext.ts', 'engine/client/i18n/ext.ts'];
  /** 게임의 선언 파일: 공용(안내문, 메시지, 공유 상태), 서버(시스템 칸, 사건), 클라이언트(언어 묶음의 모양) */
  const GAME_DECL = ['games/deungbul/shared/deungbul.ts', 'games/deungbul/server/deungbul.ts', 'games/deungbul/client/i18n/index.ts'];
  /** 틀이 읽는 게임의 내용: 계약의 통로(content/index.ts)와 그것이 다시 내보내는 파일들 */
  const CONTRACT_CONTENT = ['games/deungbul/shared/content/index.ts', ...[...fs.readFileSync(new URL('games/deungbul/shared/content/index.ts', root), 'utf8').matchAll(/from '\.\/(\w+)'/g)].map((m) => `games/deungbul/shared/content/${m[1]}.ts`)];
  /** 이 게임에만 있는 공용 파일: games/deungbul/shared/ 아래에서 위의 것을 뺀 전부 (선언 파일, 게임의 통로, 등탑·습격·주민·퀘스트의 내용) */
  const GAME_SHARED = list('games/deungbul/shared/').filter((f) => !CONTRACT_CONTENT.includes(f));
  /** 틀의 공용 파일: engine/shared/ 아래 전부 (내용 통로 defs.ts와 그 조각 defs/도 넣는다: 계약의 내용만 읽는다) */
  const SHARED_ENGINE = list('engine/shared/');
  /** 아직 지키지 못하는 것 (지금은 없다) */
  const SHARED_EXCEPTIONS: string[] = [];
  const sharedFound = SHARED_ENGINE.flatMap((f) => importsOf(f).filter((to) => GAME_SHARED.includes(to)).map((to) => `${f} -> ${to}`));
  const sharedExtra = sharedFound.filter((x) => !SHARED_EXCEPTIONS.includes(x)), sharedStale = SHARED_EXCEPTIONS.filter((x) => !sharedFound.includes(x));
  for (const x of sharedExtra) console.log('  ' + x);
  check(SHARED_ENGINE.length >= 15 && CONTRACT_CONTENT.length >= 10 && ['deungbul.ts', 'defs.ts', 'world.ts', 'content/tower.ts', 'content/raid.ts', 'content/residents.ts', 'content/quests.ts'].every((n) => GAME_SHARED.includes(`games/deungbul/shared/${n}`)) && importsOf('engine/shared/protocol.ts').includes('engine/shared/ext.ts') && importsOf('games/deungbul/shared/deungbul.ts').includes('games/deungbul/shared/content/raid.ts'), `공용 파일의 import 문을 읽어 낸다 (틀의 공용 파일 ${SHARED_ENGINE.length}개)`);
  check(sharedExtra.length === 0 && sharedStale.length === 0, `틀의 공용 파일은 이 게임의 선언과 등탑·습격·주민·퀘스트의 내용을 직접 import하지 않는다 (예외 ${SHARED_EXCEPTIONS.length}건)`);
  // 게임의 공용 선언 파일은 틀의 서버 파일도, 다른 공용 파일도 import하지 않는다 (tsconfig의 include로만 컴파일에 들어간다)
  const declUsers = [...engine, ...list('engine/shared/')].filter((f) => f !== 'games/deungbul/shared/deungbul.ts' && importsOf(f).includes('games/deungbul/shared/deungbul.ts'));
  for (const x of declUsers) console.log('  ' + x + ' -> games/deungbul/shared/deungbul.ts');
  check(declUsers.length === 0, '틀의 서버 파일과 공용 파일은 이 게임의 공용 선언 파일(games/deungbul/shared/deungbul.ts)을 import하지 않는다');
  // (importsOf는 주석 속 쓰는 법의 declare module './ext'도 세므로 자기 자신은 뺀다)
  check(EXT.every((f) => importsOf(f).every((to) => to === f)), '확장 지점 파일(engine/shared/ext.ts, engine/server/game/ext.ts)은 아무것도 import하지 않는다');
  // 선언 병합은 그 파일이 컴파일 대상에 들어 있어야 효력이 있다: 게임의 선언 파일은 tsconfig.json의 include 아래에 있고,
  // 틀만 검사하는 설정(tsconfig.engine.json, npm run typecheck:engine)은 틀의 폴더(engine/)만 읽는다: 게임의 파일은 모두 games/ 아래에 있다
  const cfgOf = (name: string) => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8')) as { include?: string[]; exclude?: string[] };
  const included = cfgOf('tsconfig.json').include ?? [], engineOnly = cfgOf('tsconfig.engine.json').include ?? [];
  check(GAME_DECL.every((f) => included.some((d) => f.startsWith(`${d}/`))) && engineOnly.length > 0 && engineOnly.every((d) => d.startsWith('engine/')) && [...GAME_FILES, ...GAME_SHARED].every((f) => f.startsWith('games/')),
    '게임의 선언 파일은 컴파일 대상(tsconfig.json의 include)에 들어 있고, 틀만 검사하는 설정은 게임의 파일을 뺀다');
  // 선언 병합(declare module)은 게임의 선언 파일에만 있고, 확장 지점만 가리킨다: 틀의 다른 타입을 직접 넓히지 않는다
  // (다른 게임 폴더는 보지 않는다: 예제 games/sample의 선언은 자기 설정으로 따로 컴파일되고 자기 시험이 본다)
  const merges = [...list('engine/'), ...list('games/deungbul/')].flatMap((f) => [...fs.readFileSync(new URL(f, root), 'utf8').matchAll(/^\s*declare\s+module\s*['"]([^'"]+)['"]/gm)]
    .map((m) => ({ from: f, to: `${resolveSpec(root, f, m[1])}.ts` })));
  const badMerges = merges.filter((m) => !GAME_DECL.includes(m.from) || !EXT.includes(m.to));
  for (const m of badMerges) console.log(`  ${m.from} => ${m.to}`);
  check(GAME_DECL.every((f) => merges.some((m) => m.from === f)) && badMerges.length === 0, `선언 병합은 게임의 선언 파일에만 있고 확장 지점만 넓힌다 (${merges.map((m) => `${m.from} => ${m.to}`).join(', ')})`);
  // ---- 틀의 시험은 이 게임의 규칙 없이 돈다 (단계 10) ----
  // 틀의 시험(engine/test/*.test.ts와 그것이 쓰는 engine/test/harness.ts)은 이 게임의 파일(games/ 아래의 것)을 import하지 않는다.
  // 플러그인과 규칙 시스템은 따라 들어오는 것까지 본다 (틀의 파일을 거쳐 딸려 오는 일이 없게). 실행 중에도 같은 것을 확인한다: npm run test:engine (test/all.ts).
  // 이 게임의 내용(등탑·습격·주민·퀘스트의 정의)은 통로(engine/shared/defs)로 들어오므로 여기서는 잡지 않는다: 틀의 시험은 아직 등불지기의 내용 위에서 돈다.
  const fileOf = (p: string): string | null => [p, p.replace(/\.ts$/, '/index.ts')].find((x) => fs.existsSync(new URL(x, root))) ?? null;
  const reach = (from: string): string[] => {
    const seen = new Set<string>(), todo = [from];
    while (todo.length) for (const to of importsOf(todo.pop()!)) { const f = fileOf(to); if (f && !seen.has(f)) { seen.add(f); todo.push(f); } }
    return [...seen];
  };
  /** 틀의 시험이 읽어도 되는 게임의 파일: 내용 통로와 내용 정의뿐이다 (아직 등불지기의 맵 좌표와 몬스터·아이템 id 위에서 돈다. 별칭 @game으로만 읽는다) */
  const isContent = (f: string) => /^games\/deungbul\/shared\/(defs|world)\.ts$/.test(f) || f.startsWith('games/deungbul/shared/content/');
  const isGame = (f: string) => f.startsWith('games/') && !isContent(f);
  const engineTests = ['engine/test/', 'engine/test/fx/'].flatMap((d) => fs.readdirSync(new URL(d, root)).filter((n) => n.endsWith('.test.ts') || n === 'harness.ts').map((n) => `${d}${n}`));
  const gameTests = list('games/deungbul/test/');
  const testLeaks = engineTests.flatMap((f) => [
    ...importsOf(f).filter(isGame).map((to) => `${f} -> ${to}`),
    ...reach(f).filter(isGame).map((to) => `${f} => ${to}`),
  ]);
  for (const x of new Set(testLeaks)) console.log('  ' + x);
  check(engineTests.length >= 15 && reach('engine/test/fx/move.test.ts').includes('engine/server/game/systems/shop.ts') && reach('engine/test/fx/move.test.ts').includes('engine/test/fx/shared/content/index.ts') && reach('games/deungbul/test/game.ts').includes('games/deungbul/server/systems/tower.ts') && gameTests.some((f) => importsOf(f).some(isGame)),
    `시험 파일의 import를 따라가 읽어 낸다 (틀의 시험 파일 ${engineTests.length}개: harness.ts 포함, 게임의 시험 폴더의 파일 ${gameTests.length}개)`);
  check(testLeaks.length === 0, '틀의 시험 파일은 이 게임의 플러그인(games/deungbul/server/deungbul.ts), 규칙 시스템, 게임의 시험(games/deungbul/test/)을 import하지 않는다 (따라 들어오는 것까지)');
}

// ---------- 확장 지점: 선언으로 더한 것이 실행 중에도 게임 쪽에만 있는가 (docs/framework-plan.md의 단계 2) ----------
// 이 게임의 사건·공유 상태·명령·메시지의 타입 선언은 게임의 선언 파일(games/deungbul/shared/deungbul.ts, games/deungbul/server/deungbul.ts)로 옮겼다.
// 타입은 컴파일 대상 전체에 보이므로, 틀만의 게임에 그 칸이 실제로 없다는 것은 돌려서 확인한다.
{
  const bare = new Game({ plugins: [] });
  let threw = '';
  try { bare.fire('raidWon', []); bare.fire('residentReturned', 'bram'); } catch (err) { threw = String(err); }
  check(threw === '', '듣는 곳이 없는 사건을 알려도 아무 일도 없다');
  check(bare.mods.sum('sparkBonus') === 0 && bare.mods.product('regen') === 1, '보정을 거는 시스템이 없는 수치는 기본값이다 (틀만의 게임: 불씨 덤 0, 회복 1배)');

  // 엔티티 칸의 처음 값: 플러그인이 entInit에 등록하면, 그 뒤에 만들어지는 엔티티와 그 전에 만들어진 것(첫 채널의 몬스터)이 모두 한 번씩 거친다
  const seen = new Map<number, number>();
  const marked = new Game({ plugins: [(g) => { g.entInit.push((e) => { seen.set(e.id, (seen.get(e.id) ?? 0) + 1); (e as unknown as { mark: string }).mark = e.kind; }); }] });
  const p = marked.players.spawn('칸사람', false, null, 'ext-key');
  const all = [...marked.ents.values()];
  check(all.length > 10 && all.every((e) => seen.get(e.id) === 1 && (e as unknown as { mark: string }).mark === e.kind) && all.includes(p),
    `entInit에 등록한 함수가 모든 엔티티를 한 번씩 거친다 (${all.length}개)`);
  check(bare.entInit.length === 0 && Object.keys(bare.players.spawn('맨사람', false, null, 'ext-bare')).every((k) => k !== 'mark'), '등록하지 않은 게임의 엔티티에는 그 칸이 없다');
}

// ---------- 언어 파일: 틀의 몫 (docs/framework-plan.md의 단계 8) ----------
// 화면의 문장은 틀의 몫(engine/client/i18n/ko.ts, en.ts의 koBase·enBase)과 게임의 몫(games/deungbul/client/i18n/)으로 나뉘고 mergeLocale로 합친다.
// 여기서는 틀만 본다: 틀의 문장만으로 묶음이 완결되는가, 틀의 안내문에 모두 문장이 있는가, 합치는 규칙, 틀의 언어·알림·소리 파일에 이 게임의 낱말과 안내문이 남아 있지 않은가.
// 게임의 문장과 합친 결과(문장이 예전과 글자까지 같은가, 덮어쓴 키의 목록)는 games/deungbul/test/guide.test.ts가 본다.
{
  const root = new URL('../../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** 주석을 뺀 본문 (낱말 검사는 화면에 나갈 수 있는 글자와 코드만 본다) */
  const body = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const { koBase } = await import('@engine/client/i18n/ko');
  const { enBase } = await import('@engine/client/i18n/en');
  const { mergeLocale, overlaps } = await import('@engine/client/i18n/merge');
  const { idNames } = await import('@engine/client/i18n/names');
  type EngineLocale = import('@engine/client/i18n/ko').EngineLocale;

  // 틀만으로 완결: 게임의 문장 없이, 내용의 이름표만 넘기면 틀의 묶음이 채워진다 (타입으로도: 빠진 칸이 있으면 컴파일되지 않는다)
  const ko: EngineLocale = koBase(idNames()), en: EngineLocale = enBase(idNames());
  /** 두 묶음의 모양이 다른 자리: 키, 값의 종류, 목록의 길이, 함수의 인자 수 */
  const shapeDiff = (x: unknown, y: unknown, at: string): string[] => {
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) return [`${at}: 종류가 다르다`];
    if (typeof x === 'function') return x.length === (y as () => void).length ? [] : [`${at}: 인자의 수가 다르다`];
    if (typeof x === 'string') return x.trim() && (y as string).trim() ? [] : [`${at}: 빈 문장`];
    if (Array.isArray(x)) return [...(x.length === (y as unknown[]).length ? [] : [`${at}: 목록의 길이가 다르다`]), ...x.flatMap((v, i) => shapeDiff(v, (y as unknown[])[i], `${at}[${i}]`))];
    if (typeof x !== 'object' || x === null || y === null) return [];
    const X = x as Record<string, unknown>, Y = y as Record<string, unknown>;
    return [...new Set([...Object.keys(X), ...Object.keys(Y)])].flatMap((k) => (k in X && k in Y ? shapeDiff(X[k], Y[k], `${at}.${k}`) : [`${at}.${k}: 한쪽에만 있다`]));
  };
  // (이름표가 id뿐이라 설명 칸이 비어 있다: 이름표에서 온 칸은 빼고 본다)
  const own = (l: EngineLocale) => ({ ...l, monsters: 0, items: 0, classes: 0, skills: 0, dungeons: 0, nameA: 0, nameB: 0 });
  const uneven = shapeDiff(own(ko), own(en), 'base');
  for (const x of uneven.slice(0, 10)) console.log('  ' + x);
  check(uneven.length === 0 && Object.keys(ko.ui).length > 100 && Object.keys(ko.fmt).length > 60, `틀의 언어 묶음은 두 언어가 같은 모양이다 (ui ${Object.keys(ko.ui).length}개, fmt ${Object.keys(ko.fmt).length}개, msg ${Object.keys(ko.msg).length}개)`);

  // 틀의 안내문(engine/shared/messages.ts에 적힌 종류) 전부에 문장이 있고, 틀의 묶음에는 그것만 있다
  const engineKeys = [...read('engine/shared/messages.ts').matchAll(/^\s*\|\s*'(\w+)'/gm)].map((m) => m[1]);
  /** 게임이 확장 지점에 더한 안내문 (게임의 선언 파일을 글자로만 읽는다) */
  const gameKeys = [...(/interface MsgMap \{([\s\S]*?)\n  \}/.exec(read('games/deungbul/shared/deungbul.ts').replace(/\r\n/g, '\n'))?.[1] ?? '').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const sample = ['slime', 3, 2, 1500, 1];
  const said = (l: EngineLocale) => engineKeys.filter((k) => { const f = (l.msg as Record<string, ((a: (string | number)[]) => string) | undefined>)[k]; return typeof f === 'function' && typeof f(sample) === 'string' && f(sample).length > 0; });
  check(engineKeys.length > 90 && gameKeys.length >= 18 && said(ko).length === engineKeys.length && said(en).length === engineKeys.length
    && [ko, en].every((l) => Object.keys(l.msg).sort().join() === [...engineKeys].sort().join()),
    `틀의 안내문 ${engineKeys.length}개 모두에 두 언어의 문장이 있고, 틀의 묶음에 게임의 안내문(${gameKeys.length}개)은 없다`);
  check(ko.msg.kill(['slime', 3, 2, 1500]).includes('slime') && ko.msg.kill(['slime', 3, 2, 1500]).includes('1,500') && ko.msg.died(['어딘가']).includes('어딘가') && ko.fmt.num(1234567) === '1,234,567' && en.fmt.num(1234567) === '1,234,567',
    '이름표가 없으면 내용의 id가 그대로 이름이 되고(틀만 띄웠을 때), 자릿수 구분은 틀의 문장이 맡는다');

  // 합치는 규칙: 묶음별로 한 단계, 같은 키는 게임이 이긴다, 틀의 묶음은 그대로 둔다
  const b = { code: 'ko', ui: { a: '1', b: '2' }, fmt: { n: (x: number) => `b${x}` }, list: ['x'] }, g = { ui: { b: 'B', c: 'C' }, list: ['y'], extra: { z: 1 } };
  const m = mergeLocale(b, g);
  check(m.code === 'ko' && m.ui.a === '1' && m.ui.b === 'B' && m.ui.c === 'C' && m.fmt.n(1) === 'b1' && m.list.join() === 'y' && m.extra.z === 1,
    'mergeLocale: 양쪽에 있는 묶음은 한 단계 깊이로 합치고, 같은 키는 게임의 것이 이긴다 (목록은 통째로 바뀐다)');
  check(b.ui.b === '2' && !('c' in b.ui) && b.list.join() === 'x' && overlaps(b, g).join() === 'ui.b,list', 'mergeLocale은 틀의 묶음을 고치지 않고, 겹친 키의 목록을 따로 낼 수 있다');

  // 틀의 언어·알림·소리 파일에 이 게임의 낱말과 안내문이 남아 있지 않다 (주석은 뺀다)
  const FILES = ['i18n/ko.ts', 'i18n/en.ts', 'i18n/index.ts', 'i18n/merge.ts', 'i18n/names.ts', 'i18n/ext.ts', 'hud/notify.ts', 'sound.ts'].map((f) => `engine/client/${f}`);
  /** 이 게임의 낱말: 등탑·불씨·주민·습격·퀘스트와 고유한 이름들. 영어는 낱말의 앞머리로 본다 (raid, raids, raidSoon) */
  const WORDS_KO = ['등탑', '불씨', '등불', '습격', '주민', '안개', '첫불', '잿빛', '브람', '미라', '할멈', '퀘스트', '기여', '마을', '그림자', '지하묘'];
  const WORDS_EN = ['lamp', 'spark', 'raid', 'resident', 'mist', 'firstlight', 'ashwood', 'bram', 'mira', 'granny', 'quest', 'keeper', 'contribution', 'village', 'tower', 'ember', 'crypt', 'shade'];
  /** 남길 수밖에 없는 것 → 그것이 있어도 되는 파일. 까닭:
   *  raidFoe: 스냅샷의 '몰려온 적' 표시(EnterInfo.r)를 틀의 entities.ts가 읽어 이름을 꾸미는 자리(fmt.raidFoe)의 키 이름이다. 문장이 아니라 키이고
   *  틀의 기본값은 이름 그대로다(게임이 덮어쓴다). 키 이름을 중립으로 바꾸는 일은 '습격 몹' 개념을 정리할 때 함께 한다 (계획서 8절) */
  const WORD_EXCEPTIONS: Record<string, string[]> = { raidFoe: ['engine/client/i18n/ko.ts', 'engine/client/i18n/en.ts'] };
  const wordHits = FILES.flatMap((f) => {
    const src = body(f);
    return [
      ...WORDS_KO.filter((w) => src.includes(w)),
      ...WORDS_EN.flatMap((w) => [...src.matchAll(new RegExp(`(?<![A-Za-z])${w}[A-Za-z]*`, 'gi'))].map((x) => x[0])).filter((w) => !WORD_EXCEPTIONS[w]?.includes(f)),
    ].map((w) => `${f}: ${w}`);
  });
  for (const x of wordHits) console.log('  ' + x);
  check(body('engine/client/i18n/ko.ts').includes('raidFoe') && !body('engine/client/i18n/ko.ts').includes('(예:') && body('engine/client/i18n/ko.ts').includes('길드') && wordHits.length === 0,
    `틀의 언어·알림·소리 파일 ${FILES.length}개의 본문에 이 게임의 낱말(${WORDS_KO.slice(0, 4).join(', ')} … ${WORDS_EN.slice(0, 3).join(', ')} … ${WORDS_KO.length + WORDS_EN.length}개)이 없다 (예외 ${Object.keys(WORD_EXCEPTIONS).length}건: ${Object.keys(WORD_EXCEPTIONS).join(', ')})`);
  const keyHits = FILES.flatMap((f) => gameKeys.filter((k) => new RegExp(`\\b${k}\\b`).test(body(f))).map((k) => `${f}: ${k}`));
  for (const x of keyHits) console.log('  ' + x);
  check(/\bdied\b/.test(body('engine/client/hud/notify.ts')) && /\blevelUp\b/.test(body('engine/client/sound.ts')) && keyHits.length === 0,
    '틀의 알림 분류표(hud/notify.ts)와 소리 대응표(sound.ts), 틀의 언어 파일은 게임의 안내문을 이름으로 적지 않는다 (게임의 모듈이 등록한다)');
  // 이 파일들은 게임의 클라이언트 폴더(game/, deungbul/, guide/)를 import하지 않는다. 내용에서 가져오는 이름은 아래 6a 블록의 CLEAN이 본다
  const gameImports = FILES.flatMap((f) => [...read(f).matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((x) => resolveSpec(root, f, x[1]) ?? '').filter((to) => to.startsWith('games/')).map((to) => `${f} -> ${to}`));
  for (const x of gameImports) console.log('  ' + x);
  check(read('games/deungbul/client/words.ts').includes("from '@engine/client/i18n'") && gameImports.length === 0, '틀의 언어·알림·소리 파일은 게임의 클라이언트 폴더를 import하지 않는다 (게임이 틀에 등록한다: games/deungbul/client/words.ts)');
}

// ---------- 의존 방향: 클라이언트 (docs/framework-plan.md의 단계 6a) ----------
// 6a에서 가른 틀 쪽 화면 파일은 이 게임의 것을 직접 읽지 않고 rules(engine/client/rules.ts)와 등록 접점(addNpc, onKey)을 거친다.
// 내용은 통로(engine/shared/defs, engine/shared/world)로 들어오므로 파일 경로만으로는 알 수 없다: 가져오는 이름까지 본다.
// 6b부터는 client/src 아래의 틀 쪽 파일 전부가 대상이다: 이 게임의 파일은 games/deungbul/client/ 한 폴더에 모였고, 틀을 시작시키는 것도 게임의 진입점(games/deungbul/client/main.ts)이다.
{
  const root = new URL('../../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 이 게임의 클라이언트 파일: game/ 아래 전부와 도감(guide/). 6b에서 옛 자리(hud/quest.ts, hud/marks.ts, scene/scenery.ts, deungbul/)의 것을 game/으로 모았다 */
  const isGameClient = (f: string): boolean => f.startsWith('games/deungbul/client/');
  /** 틀 쪽 클라이언트 파일: client/src 아래에서 이 게임의 파일을 뺀 전부 (8단계에서 언어 파일과 소리도 갈라 예외가 없다) */
  const CLEAN = list('engine/client/').filter((f) => !isGameClient(f));
  /** 이 게임에만 있는 내용 정의 */
  const GAME_CONTENT = ['residents', 'tower', 'raid', 'quests'].map((n) => `games/deungbul/shared/content/${n}.ts`);
  /** 그 내용 파일들이 내보내는 이름 + 맵 정의 가운데 이 게임의 것 + 클라이언트 상태 가운데 이 게임의 것 */
  const GAME_NAMES = new Set([
    ...GAME_CONTENT.flatMap((f) => [...read(f).matchAll(/^export\s+(?:const|function|type|interface|class|enum)\s+(\w+)/gm)].map((m) => m[1])),
    'TOWERS', 'TOWER', 'TOWN', 'POND', 'HOUSES', 'CLEARINGS', 'ZONE_SPLIT', 'ZONE_COUNT', 'zoneOf', 'onPath',
    'stage', 'zoneGlow', 'myZone', 'raidLeft',
  ]);
  /** 그 파일의 import: 저장소 안의 대상 파일과 가져오는 이름들 */
  const importsOf = (file: string): { to: string; names: string[] }[] =>
    [...read(file).matchAll(/\bimport\s+(?:type\s+)?(?:(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s*)?['"]([^'"]+)['"]/g)].filter((m) => resolveSpec(root, file, m[2]) !== null).map((m) => ({
      to: resolveSpec(root, file, m[2])!.replace(/(\.ts)?$/, '.ts'),
      names: (m[1] ?? '').startsWith('{') ? m[1].slice(1, -1).split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) : [],
    }));
  const breaks = (file: string): string[] => [
    ...importsOf(file).flatMap((i) => [
      ...(isGameClient(i.to) || GAME_CONTENT.includes(i.to) ? [`${file} -> ${i.to}`] : []),
      ...i.names.filter((n) => GAME_NAMES.has(n)).map((n) => `${file} -> ${n} (${i.to})`),
    ]),
    // 공유 상태(S.world)와 퀘스트 진행(S.quest)의 모양은 이 게임의 것이다: 틀은 rules에 묻는다 (6b부터 틀의 상태 S에는 그 칸이 아예 없다: 게임의 상태는 games/deungbul/client/state.ts)
    ...(usesGameState(read(file)) ? [`${file} -> S.world / S.quest`] : []),
  ];
  function usesGameState(src: string): boolean { return /\bS\.(world|quest)\s*\./.test(src); }
  const found = CLEAN.flatMap(breaks);
  for (const x of found) console.log('  ' + x);
  const game = breaks('games/deungbul/client/deungbul.ts');
  check(GAME_NAMES.has('RESIDENTS') && GAME_NAMES.has('speedFor') && GAME_NAMES.has('QUESTS') && ['RESIDENTS', 'speedFor', 'TOWERS', 'TOWN', 'stage'].every((n) => game.some((x) => x.includes(n)))
    && game.some((x) => x.endsWith('-> games/deungbul/client/hud/quest.ts')) && game.some((x) => x.endsWith('-> games/deungbul/client/state.ts')) && usesGameState('const g = S.world.tower.glow;') && !usesGameState('GS.world.tower'),
    `클라이언트의 import 문과 가져오는 이름을 읽어 낸다 (이 게임의 이름 ${GAME_NAMES.size}개, 게임 모듈에서 ${game.length}건)`);
  check(CLEAN.length >= 30 && ['main.ts', 'app.ts', 'modules.ts', 'state.ts', 'actions.ts', 'hud/me.ts', 'hud/near.ts', 'hud/classes.ts', 'scene/view.ts'].every((f) => CLEAN.includes(`engine/client/${f}`)) && found.length === 0,
    `틀 쪽 화면 파일 ${CLEAN.length}개(client/src에서 game/, guide/, 언어 파일, sound.ts를 뺀 전부)는 이 게임의 클라이언트 파일과 게임 전용 내용(주민, 등탑, 습격, 퀘스트)을 import하지 않는다`);
  // 이 게임의 클라이언트 파일은 한 폴더에 모여 있고, 틀을 시작시키는 것은 게임의 진입점이다: 틀의 목록(modules.ts)은 게임의 모듈을 모른다
  const entry = importsOf('games/deungbul/client/main.ts').map((i) => i.to);
  check(entry.includes('engine/client/index.ts') && entry.includes('games/deungbul/client/deungbul.ts') && entry.includes('games/deungbul/client/hud/tower.ts') && /startClient\(\{/.test(read('games/deungbul/client/main.ts'))
    && /<script type="module" src="\.\/main\.ts"><\/script>/.test(read('games/deungbul/client/index.html')) && !list('engine/client/').some((f) => /^engine\/client\/(game|deungbul|guide)\//.test(f)),
    '이 게임의 진입점(games/deungbul/client/main.ts)이 자기 모듈을 들고 틀의 startClient를 부르고, index.html은 그 진입점을 읽는다');
  // 틀만 타입 검사하는 설정은 틀의 폴더만 읽는다 (npm run typecheck:engine이 틀만 센다): 게임의 클라이언트 폴더는 games/ 아래에 있어 들어가지 않는다
  const engineInclude = (JSON.parse(read('tsconfig.engine.json')) as { include?: string[] }).include ?? [];
  check(engineInclude.includes('engine/client') && engineInclude.every((x) => x.startsWith('engine/') && fs.existsSync(new URL(x, root))),
    '틀만 검사하는 설정(tsconfig.engine.json)이 틀의 폴더(engine/)만 읽는다: 이 게임의 클라이언트 폴더(games/deungbul/client/)는 들어가지 않는다');
}

// ---------- 의존 방향: 화면의 틀 (7a단계: 장면의 겉모습을 게임이 넘긴다) ----------
// 틀로 가른 장면 파일(3D 화면, 모델, 미니맵)은 이 게임의 클라이언트 파일(games/deungbul/client/: 이 게임의 장면·건물·표식·퀘스트 화면)을 import하지 않고,
// 내용 정의에서 이 게임에만 있는 이름(등탑·습격·주민·퀘스트의 정의, 맵의 등탑·연못·길·구역)을 가져오지 않는다. 반대 방향(게임이 틀을 import)은 된다.
// 지형을 틀에 넘기는 자리는 게임의 진입점(games/deungbul/client/main.ts)이다: engine/client/app.ts도 이제 게임을 모른다 (위의 6a 블록이 함께 본다).
{
  const root = new URL('../../../', import.meta.url);
  const ENGINE = ['engine/client/scene/view.ts', 'engine/client/scene/models.ts', 'engine/client/hud/minimap.ts'];
  /** 이 게임의 클라이언트 파일: 폴더 하나 (6b에서 옛 자리의 것들을 모았다) */
  const isGameFile = (f: string): boolean => f.startsWith('games/deungbul/client/');
  /** 맵 정의에서 이 게임의 것 (docs/framework-plan.md 2절). 범위·지역·문·기둥·뿌리는 규칙은 틀과의 계약이라 넣지 않는다 */
  const MAP_NAMES = ['TOWERS', 'TOWER', 'TOWN', 'POND', 'HOUSES', 'CLEARINGS', 'ZONE_SPLIT', 'ZONE_COUNT', 'zoneOf', 'onPath', 'isFree', 'TowerDef'];
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** 그 파일이 내보내는 이름들 */
  const exportsOf = (file: string): string[] => [...read(file).matchAll(/^export\s+(?:declare\s+)?(?:const|let|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const GAME_NAMES = new Set([...MAP_NAMES, ...['tower', 'raid', 'residents', 'quests'].flatMap((n) => exportsOf(`games/deungbul/shared/content/${n}.ts`))]);
  /** 그 파일의 import 문들: 저장소 안의 어느 파일에서(상대 경로만) 어떤 이름을 가져오는가. 통째로 가져오면(* as) 이름은 '*' */
  const importsOf = (file: string): { from: string; names: string[] }[] =>
    [...read(file).matchAll(/\b(?:import|export)\b([^;'"]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)]
      .filter((m) => resolveSpec(root, file, m[2] ?? m[3]) !== null)
      .map((m) => {
        const to = resolveSpec(root, file, m[2] ?? m[3])!;
        const braces = /\{([^}]*)\}/.exec(m[1] ?? '')?.[1] ?? '';
        const names = braces.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean);
        return { from: to.endsWith('.ts') ? to : `${to}.ts`, names: /\*/.test(m[1] ?? '') ? ['*'] : names };
      });
  /** 틀의 파일이 지키지 않는 것: 게임의 파일을 import하거나, 공용 정의에서 게임의 이름을 가져온다 */
  const breaks = (file: string): string[] => importsOf(file).flatMap((im) => [
    ...(isGameFile(im.from) ? [`${file} -> ${im.from}`] : []),
    ...(/^(engine|games\/deungbul)\/shared\//.test(im.from) ? im.names.filter((n) => n === '*' || GAME_NAMES.has(n)).map((n) => `${file} -> ${im.from}의 ${n}`) : []),
  ]);
  // 검사가 실제로 잡아내는지: 게임 쪽 파일에 대면 걸려야 한다
  const paint = breaks('games/deungbul/client/scene/paint.ts'), scene = breaks('games/deungbul/client/scene/scene.ts');
  check(GAME_NAMES.has('stageOf') && GAME_NAMES.has('RESIDENTS') && GAME_NAMES.has('QUESTS') && GAME_NAMES.has('RAID')
    && paint.some((x) => x.endsWith('의 POND')) && paint.some((x) => x.endsWith('의 onPath')) && scene.some((x) => x.endsWith('의 Stage')) && scene.includes('games/deungbul/client/scene/scene.ts -> games/deungbul/client/scene/scenery.ts')
    && importsOf('engine/client/scene/view.ts').some((im) => im.from === 'engine/shared/world.ts' && im.names.includes('World')),
    `import 문에서 가져오는 이름을 읽어 낸다 (이 게임에만 있는 이름 ${GAME_NAMES.size}개)`);
  const found = ENGINE.flatMap(breaks);
  for (const x of found) console.log('  ' + x);
  check(found.length === 0, `화면의 틀(${ENGINE.map((f) => f.replace('engine/client/', '')).join(', ')})은 이 게임의 클라이언트 파일과 게임에만 있는 내용 정의를 import하지 않는다`);
}

// ---------- 의존 방향: 화면의 뼈대와 스타일 (7b단계: 게임의 창은 게임이 붙인다. 11단계: 뼈대는 틀이 붙인다) ----------
// 틀의 뼈대(engine/client/hud/skeleton.ts)와 style.css에는 틀의 창만 있다. 게임의 index.html에는 머리와 진입점만 있고, 뼈대는 hud/shell.ts가 붙인다. 이 게임의 창(등탑, 퀘스트, 습격 알림, 내 정보에 덧붙는 표시, '마을로' 단추)은
// 게임의 마크업(games/deungbul/client/markup.ts)이 틀의 빈 자리(hud/shell.ts의 mountPanel)에 붙이고, 모양은 게임의 스타일(games/deungbul/client/deungbul.css)에 있다.
// 옮긴 창의 id는 게임의 마크업에서 읽어 낸다: 창을 더 옮기면 검사도 따라간다.
{
  const root = new URL('../../../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** css에서 주석을 뺀 것 (주석은 등탑·퀘스트를 말해도 된다) */
  const css = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const html = read('engine/client/hud/skeleton.ts'), gameHtml = read('games/deungbul/client/index.html'), markup = read('games/deungbul/client/markup.ts');
  const frameCss = css('engine/client/style.css'), gameCss = css('games/deungbul/client/deungbul.css');
  const ids = [...new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  /** 그 id의 요소가 마크업에 있는가 */
  const hasId = (text: string, id: string): boolean => new RegExp(`\\bid="${id}"`).test(text);
  /** 그 선택자(#id, .class)가 css에 쓰였는가. 더 긴 이름의 앞머리(#questGo의 #quest)는 세지 않는다 */
  const hasSel = (text: string, sel: string): boolean => new RegExp(`${sel.replace(/[.#]/g, '\\$&')}(?![\\w-])`).test(text);
  /** 이 게임의 창에만 쓰는 class (막대의 색, 불씨 글자, 습격 알림의 줄, 습격 몹의 이름표) */
  const GAME_CLASSES = ['.spark', '.rtext', '.rhp', '.bar.glow', '.bar.res', '.tag.raid'];

  // 검사가 실제로 읽어 내는지: 옮긴 창의 대표들이 게임의 마크업과 스타일에 있어야 한다
  const core = ['tower', 'villageBox', 'keepBox', 'classBtn', 'quest', 'questGo', 'goalArrow', 'raid', 'raidMini', 'towerMini', 'contrib', 'rested', 'sparks', 'townBtn'];
  check(core.every((id) => ids.includes(id)) && ids.length >= 30 && ['tower', 'quest', 'raid', 'goalArrow', 'townBtn', 'raidMini', 'contrib'].every((id) => hasSel(gameCss, `#${id}`))
    && GAME_CLASSES.every((c) => hasSel(gameCss, c)) && hasSel('#questGo { }', '#questGo') && !hasSel('#questGo { }', '#quest') && hasId(markup, 'tower'),
    `게임의 마크업과 스타일에서 이 게임의 창을 읽어 낸다 (id ${ids.length}개)`);

  const inHtml = ids.filter((id) => hasId(html, id));
  check(inHtml.length === 0, `틀의 뼈대에 이 게임의 창이 남아 있지 않다${inHtml.length ? ': ' + inHtml.join(', ') : ''}`);
  // 붙는 자리의 기준이 되는 틀의 요소는 뼈대에 있어야 한다 (없으면 mountPanel이 시작할 때 던진다)
  const anchors = [...read('engine/client/hud/shell.ts').matchAll(/byId\('([^']+)'\)/g)].map((m) => m[1]);
  check(anchors.length >= 5 && anchors.every((id) => hasId(html, id)), `붙는 자리의 기준 요소(${[...new Set(anchors)].join(', ')})가 틀의 뼈대에 있다`);

  const inCss = [...ids.map((id) => `#${id}`), ...GAME_CLASSES].filter((sel) => hasSel(frameCss, sel));
  check(inCss.length === 0, `틀의 style.css에 이 게임의 창을 가리키는 선택자가 남아 있지 않다${inCss.length ? ': ' + inCss.join(', ') : ''}`);

  // 뼈대는 게임을 모른다: 게임이 뼈대를 import하고, 진입 쪽(app.ts)이 게임의 mountMarkup을 맨 먼저 부른다.
  // app.ts를 import하지 않는 것은 순서 때문이다: app.ts가 이 파일에 기대어 먼저 붙인 뒤에야 다른 파일이 요소를 잡는다
  const imports = (file: string): string[] => [...read(file).matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
  const shell = imports('engine/client/hud/shell.ts');
  check(imports('games/deungbul/client/markup.ts').includes('@engine/client') && imports('games/deungbul/client/markup.ts').includes('./deungbul.css')
    && !shell.some((to) => /^@game\/|(^|\/)(games?|deungbul)(\/|$)|\/(quest|marks|scenery|app)$|\.css$/.test(to)),
    `hud/shell.ts는 게임 파일(마크업, 스타일)과 app.ts를 import하지 않는다 (import ${shell.length}개)`);
  const app = read('engine/client/app.ts');
  // 뼈대는 틀이 붙인다 (11단계): 게임의 index.html의 body에는 진입점 script만 있고, 틀의 창(#hud, #gate 등)은 뼈대에만 있다.
  // 차례: 요소를 id로 잡는 길은 app.ts의 $ 하나뿐이고(shell.ts의 자리 찾기는 따로다), app.ts는 뼈대를 붙이는 shell.ts를 맨 먼저 import한다.
  // 그래서 어느 파일이 읽히는 때에 요소를 잡아도($('banner')) 그때는 뼈대가 문서에 있다. 뼈대 파일은 아무것도 import하지 않는다
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  const direct = list('engine/client/').filter((f) => /document\.getElementById\(/.test(read(f)));
  check(/<body><script type="module" src="\.\/main\.ts"><\/script><\/body>/.test(gameHtml) && !/\bid="(hud|gate|view|me)"/.test(gameHtml) && ['view', 'tags', 'hud', 'me', 'rightcol', 'chat', 'menu', 'classPick', 'flash', 'gate'].every((id) => hasId(html, id))
    && imports('engine/client/app.ts')[0] === './hud/shell' && shell.includes('./skeleton') && /^mountShell\(\);/m.test(read('engine/client/hud/shell.ts')) && imports('engine/client/hud/skeleton.ts').length === 0
    && direct.sort().join() === 'engine/client/app.ts,engine/client/hud/shell.ts',
    '뼈대는 틀이 붙인다: 게임의 index.html의 body에는 진입점뿐이고, 요소를 잡는 길($)이 있는 app.ts가 뼈대를 붙이는 shell.ts를 맨 먼저 읽는다');
  // 6b 뒤로 진입점은 게임의 것(games/deungbul/client/main.ts)이다: 틀을 시작시키기(startClient) 전에 게임의 창을 붙이고, 틀의 app.ts는 그 일을 모른다
  const entry = read('games/deungbul/client/main.ts');
  check(/^mountMarkup\(\);/m.test(entry) && entry.indexOf('mountMarkup();') < entry.indexOf('startClient(') && !app.includes('mountMarkup'), '게임의 진입점이 틀을 시작시키기 전에 게임의 창을 붙인다 (틀의 app.ts는 모른다)');
}
