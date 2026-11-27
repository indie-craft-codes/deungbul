// 틀과 게임의 경계를 글자로 지키는 검사 (독립 점검 docs/framework-audit.md 3절에서 놓친 것들).
// 이 게임과의 경계(games/deungbul/test/split.test.ts)가 import의 방향과 선언 병합을 본다면, 여기서는 import로는 안 보이는 새는 길을 본다:
//   1. 틀의 소스에 게임의 내용 id를 문자열로 적었는가 ('ash_troll', 'crypt')
//   2. 틀의 소스의 문자열과 css에 이 게임의 낱말이 있는가 ('불씨를 등탑에', .raidwarn)
//   3. 타입 검사를 피해 가는 캐스팅(as unknown as, as never, as any)이 늘었는가
//   4. 층을 넘는 import: 화면 → 서버, 게임 규칙 → 저장소 구현
//   5. 게임이 틀을 입구로만 읽는가 (깊은 import 금지)
//   6. 틀이 게임을 읽지 않는가: 틀의 소스가 engine/ 밖에서 읽는 것은 내용 통로(@game/shared/content) 하나뿐이고, 읽는 자리도 틀의 내용 통로뿐이다
//   7. 게임의 운영 설정(deploy.json)과 서버 진입점의 기본값
//   8. 화면 코드가 브라우저를 직접 부르지 않는가: 저장소·주소·navigator·새 창·생명주기는 플랫폼 접점(engine/client/platform/)으로만
// 모두 소스 글자를 읽는다. 주석은 보지 않는다. 어느 게임에도 기대지 않는다: 저장소에 있는 게임(games/*)과 틀의 시험용 내용을 모두 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check } from './harness';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (f: string) => path.relative(root, f).replaceAll('\\', '/');
const walk = (dir: string, ext: RegExp): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), ext) : ext.test(e.name) ? [path.join(dir, e.name)] : [])) : []);
/** 틀의 소스 (시험 제외) */
const SRC = ['engine/shared', 'engine/server', 'engine/client'].flatMap((d) => walk(path.join(root, d), /\.ts$/)).map(rel);
const CSS = walk(path.join(root, 'engine/client'), /\.css$/).map(rel);
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
/** 주석을 뺀 본문. 문자열 안의 // (주소)는 남긴다 */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const body = (f: string) => stripComments(read(f));
/** 본문의 문자열 조각들 ('…', "…", `…`의 글자 부분) */
const strings = (src: string): string[] => [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');

check(SRC.length >= 90 && CSS.length >= 1, `틀의 소스를 읽었다 (ts ${SRC.length}개, css ${CSS.length}개)`);

// ---------- 1. 게임의 내용 id를 문자열로 ----------
{
  /**
   * 내용의 id: 저장소에 있는 모든 게임과 틀의 시험용 내용의 것. 틀은 이것을 표로만 읽어야 하고, 글자로 적으면 다른 게임에서 조용히 틀린다.
   * 내용 파일을 직접 불러와 표의 키를 모은다 (내용 파일은 틀에서 타입과 기본값만 읽으므로 어느 별칭으로도 불러올 수 있다)
   */
  type Content = Record<string, unknown> & { MAP: { areas: readonly { id: string }[] }; RARITIES: readonly { id: string }[]; GEAR_SLOTS: readonly string[] };
  const gameDirs = fs.existsSync(path.join(root, 'games')) ? fs.readdirSync(path.join(root, 'games'), { withFileTypes: true }) : []; // 게임이 하나도 없는 저장소에서도 돈다
  const CONTENTS = [...gameDirs.filter((e) => e.isDirectory()).map((e) => `games/${e.name}/shared/content/index.ts`), 'engine/test/fx/shared/content/index.ts', 'engine/test/core/shared/content/index.ts', 'engine/test/collect/shared/content/index.ts']
    .filter((f) => fs.existsSync(path.join(root, f)));
  const keys = (o: unknown): string[] => (o && typeof o === 'object' ? Object.keys(o) : []);
  const ids = new Set<string>();
  /**
   * 본보기 내용: 등불지기, 예제, 시험용 내용. 이 셋의 id가 틀의 문자열에 있으면 실패다.
   * 그 밖의 게임(새로 만든 게임)의 id는 틀이 이미 자기 뜻으로 쓰는 낱말('hex', 'heal' …)과 우연히 같을 수 있다: 그때는 알리기만 한다.
   * 틀이 그 새 게임의 id를 적었는지는 가리지 못하지만, 틀이 특정 게임에 기대는 것은 본보기 셋이 지킨다
   */
  const REFERENCE = ['games/deungbul/shared/content/index.ts', 'games/sample/shared/content/index.ts', 'engine/test/fx/shared/content/index.ts'];
  const refIds = new Set<string>();
  /** id → 그 id를 가진 게임 */
  const owners = new Map<string, string[]>();
  // 게임이 적지 않은 이름은 틀의 기본값이다 (engine/shared/content.ts와 같게)
  const dflt = await import(pathToFileURL(path.join(root, 'engine/shared/defaults.ts')).href) as Record<string, unknown>;
  for (const f of CONTENTS) {
    const raw = await import(pathToFileURL(path.join(root, f)).href) as Record<string, unknown>;
    const c = { ...dflt, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) } as Content;
    const add = (k: string) => { ids.add(k); if (REFERENCE.includes(f)) refIds.add(k); owners.set(k, [...(owners.get(k) ?? []), f.split('/').slice(0, 2).join('/')]); };
    for (const t of ['CLASSES', 'MONSTERS', 'ITEMS', 'SKILL_DEFS', 'DUNGEONS', 'DAILIES', 'STATS', 'BUILD_STATS']) keys(c[t]).forEach(add);
    [...c.MAP.areas.map((a) => a.id), ...c.RARITIES.map((r) => r.id), ...c.GEAR_SLOTS].forEach(add);
  }
  check(CONTENTS.length >= 1 && CONTENTS.includes('engine/test/fx/shared/content/index.ts'), `내용의 id를 모은 곳: ${CONTENTS.join(', ')}`);
  /**
   * 내용의 id와 글자가 같지만 틀의 낱말인 것 → 까닭.
   * weapon, armor: ItemDef.kind의 종류이자 바탕 아이템이 끼는 칸의 이름 (계약에 적은 약속)
   * potion: ItemDef.kind의 종류 / guard, crit, hp: 틀의 효과(StatMod)와 수치 보정(ModName)의 이름 / ring: 미니맵 표시의 모양
   * bolt: ClassDef.shot(날아가는 것의 모양) / dust: 자리 비움 동안 센 것의 칸 이름(away.tally) / log: 화면 요소의 id(대화 기록 창)
   * sweep: 소탕의 명령(stage의 a)·메시지·장부의 원인 이름 (몇몇 게임의 기술 id와 글자만 같다)
   */
  const ENGINE_WORDS: Record<string, string> = { weapon: '아이템 종류·칸', armor: '아이템 종류·칸', potion: '아이템 종류', guard: '효과 이름', crit: '효과 이름', hp: '효과 이름', ring: '미니맵 모양', bolt: '쏘는 것의 모양', dust: '자리 비움의 셈 칸', log: '대화 기록 창의 id', sweep: '소탕의 명령·메시지·원인 이름', hide: '플랫폼 생명주기의 사건 이름(숨김: engine/client/platform/)', field: '모드의 자리 종류(modes: 들판)' };
  /** 기본값 묶음은 내용 그 자체다 (게임이 받아 쓰는 기본 칸·등급 id): 검사하지 않는다 */
  const CONTENT_FILES = ['engine/shared/defaults.ts'];
  const all = SRC.filter((f) => !CONTENT_FILES.includes(f)).flatMap((f) => strings(body(f)).filter((s) => ids.has(s) && !(s in ENGINE_WORDS)).map((s) => ({ f, s })));
  const hits = all.filter((h) => refIds.has(h.s)).map((h) => `${h.f}: '${h.s}'`);
  for (const h of [...new Set(hits)]) console.log('  ' + h);
  // 새 게임의 id가 틀의 낱말과 같을 뿐인 것: 실패가 아니다. 헷갈리지 않게 이름을 바꾸기를 권한다
  for (const n of [...new Set(all.filter((h) => !refIds.has(h.s)).map((h) => `${h.f}: '${h.s}' (${owners.get(h.s)?.join(', ')}의 id와 같은 틀의 낱말. 잡지 않는다)`))]) console.log('  알림 ' + n);
  check(ids.size >= 40 && hits.length === 0, `틀의 소스가 게임의 내용 id(${ids.size}개)를 문자열로 적지 않는다 (틀의 낱말 ${Object.keys(ENGINE_WORDS).length}개는 뺀다)`);
  // 검사가 실제로 잡아내는가: 몬스터 id를 견주는 줄은 잡고, 주석 속의 id와 id가 아닌 문자열은 잡지 않는다
  const probe = (src: string) => strings(stripComments(src)).filter((x) => ids.has(x) && !(x in ENGINE_WORDS));
  const mon = 'colossus', cls = 'knight'; // 시험용 내용의 id (어느 게임이 있든 없든 모인다)
  check(probe(`if (m.type === '${mon}' && p.cls === "${cls}") hit();`).length === 2 && probe(`// '${mon}'
const a = 'hello';`).length === 0, '검사의 모양: 문자열로 적은 id는 잡고, 주석과 다른 문자열은 잡지 않는다');
}

// ---------- 2. 이 게임의 낱말을 문자열과 css에 ----------
{
  /** games/deungbul/test/split.test.ts의 언어 파일 검사와 같은 낱말. 거기는 언어·알림·소리 파일의 본문 전체를, 여기는 틀의 모든 소스의 문자열과 css를 본다 */
  const WORDS_KO = ['등탑', '불씨', '등불', '습격', '주민', '안개', '첫불', '잿빛', '브람', '미라', '할멈', '퀘스트', '기여', '그림자', '지하묘'];
  const WORDS_EN = ['lamp', 'spark', 'raid', 'resident', 'mist', 'firstlight', 'ashwood', 'bram', 'mira', 'granny', 'quest', 'keeper', 'contribution', 'tower', 'ember', 'crypt', 'shade'];
  const find = (text: string): string[] => [
    ...WORDS_KO.filter((w) => text.includes(w)),
    ...WORDS_EN.flatMap((w) => [...text.matchAll(new RegExp(`(?<![A-Za-z])${w}[A-Za-z]*`, 'gi'))].map((x) => x[0])),
  ];
  /**
   * 알고 남겨 둔 것 → 그것이 있어도 되는 파일. 까닭:
   * crypto: node의 모듈 이름 ('crypt'의 앞머리가 같을 뿐) /
   * sparks, sparkBonus: 두 번째 재화의 칸 이름. 재화를 일반화하지 않기로 했다 (계획 7절, 점검 11번). 저장·지갑·장부·우편의 칸 이름으로 남는다 /
   */
  const KNOWN: Record<string, string[]> = {
    crypto: ['engine/server/net/admin.ts', 'engine/server/net/handoff.ts', 'engine/server/net/web.ts', 'engine/server/net/social.ts'], // node:crypto (관리자 토큰, 기기 옮기기의 코드와 토큰, 화면 오류의 서명, 사회와 안전의 상대 표)
    sparks: ['engine/shared/defaults.ts', 'engine/server/game/systems/ledger.ts', 'engine/server/game/systems/mail.ts', 'engine/server/game/systems/players.ts', 'engine/server/game/systems/wallet.ts', 'engine/shared/defs/collect.ts'],
    sparkBonus: ['engine/server/game/game.ts', 'engine/server/game/systems/players.ts'],
  };
  const used = new Set<string>();
  const ok = (f: string, w: string): boolean => { const hit = KNOWN[w]?.includes(f) ?? false; if (hit) used.add(`${w}@${f}`); return !hit; };
  const hits = [
    ...SRC.flatMap((f) => strings(body(f)).flatMap(find).filter((w) => ok(f, w)).map((w) => `${f}: ${w}`)),
    ...CSS.flatMap((f) => find(read(f).replace(/\/\*[\s\S]*?\*\//g, '')).map((w) => `${f}: ${w}`)),
  ];
  const stale = Object.entries(KNOWN).flatMap(([w, fs_]) => fs_.filter((f) => !used.has(`${w}@${f}`)).map((f) => `${w}@${f}`));
  for (const h of [...new Set(hits)]) console.log('  ' + h);
  check(hits.length === 0, `틀의 모든 소스의 문자열과 css에 이 게임의 낱말(${WORDS_KO.length + WORDS_EN.length}개)이 없다 (알고 남긴 것 ${Object.keys(KNOWN).length}가지)`);
  check(find("notify('불씨를 등탑에 바치세요')").length === 2 && find('.lampglow, .raidwarn { color: #f0bb55 }').length === 2 && find('guild party market').length === 0, '검사의 모양: 문장과 css의 이 게임 낱말은 잡고, 틀의 낱말은 잡지 않는다');
  check(stale.length === 0, `알고 남긴 목록에 이미 없어진 것이 남아 있지 않다${stale.length ? ': ' + stale.join(', ') : ''}`);
}

// ---------- 3. 타입 검사를 피하는 캐스팅 ----------
{
  /** 지금의 개수. 줄어들 수는 있어도 늘면 실패한다: 새 코드는 넓은 타입의 도우미(itemDef, dungeonDef 등)로 읽는다. 줄였으면 이 수도 줄인다 */
  const MAX = 6;
  const found = SRC.flatMap((f) => [...body(f).matchAll(/\bas\s+(unknown\s+as|never|any)\b/g)].map(() => f));
  const per = Object.entries(found.reduce<Record<string, number>>((m, f) => ({ ...m, [f]: (m[f] ?? 0) + 1 }), {}));
  for (const [f, n] of per) console.log(`  ${f}: ${n}`);
  check(found.length <= MAX, `틀의 소스에서 타입 검사를 피하는 캐스팅(as unknown as, as never, as any)이 ${MAX}개를 넘지 않는다 (지금 ${found.length}개)`);
}

// ---------- 4. 층을 넘는 import ----------
{
  const importsIn = (src: string): string[] => [...src.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => `${m[2] ? 'type ' : ''}${m[3]}`);
  const importsOf = (f: string): string[] => importsIn(body(f));
  const resolveTo = (f: string, spec: string): string => (spec.startsWith('.') ? rel(path.resolve(path.join(root, path.dirname(f)), spec)) : spec);
  // 화면(engine/client)은 서버(engine/server)를 읽지 않는다: 화면의 번들에 서버 코드가 딸려 가고, 화면이 서버의 내부에 기대게 된다
  const clientToServer = SRC.filter((f) => f.startsWith('engine/client/')).flatMap((f) => importsOf(f).map((s) => s.replace(/^type /, '')).filter((s) => resolveTo(f, s).startsWith('engine/server')).map((s) => `${f} → ${s}`));
  // 게임 규칙(engine/server/game)은 저장소(engine/server/store)에서 타입만 읽는다: 저장소의 구현은 통신 계층이 골라 넘긴다
  const gameToStore = SRC.filter((f) => f.startsWith('engine/server/game/')).flatMap((f) => importsOf(f).filter((s) => !s.startsWith('type ') && resolveTo(f, s).startsWith('engine/server/store')).map((s) => `${f} → ${s}`));
  // 공용(engine/shared)은 서버도 화면도 읽지 않는다
  const sharedUp = SRC.filter((f) => f.startsWith('engine/shared/')).flatMap((f) => importsOf(f).map((s) => s.replace(/^type /, '')).filter((s) => /^engine\/(server|client)/.test(resolveTo(f, s))).map((s) => `${f} → ${s}`));
  for (const x of [...clientToServer, ...gameToStore, ...sharedUp]) console.log('  ' + x);
  check(clientToServer.length === 0, '틀의 화면(engine/client)은 틀의 서버(engine/server)를 import하지 않는다');
  check(gameToStore.length === 0, '틀의 게임 규칙(engine/server/game)은 저장소(engine/server/store)에서 타입만 import한다');
  check(sharedUp.length === 0, '틀의 공용 코드(engine/shared)는 서버와 화면을 import하지 않는다');
  // 검사가 실제로 잡아내는가
  const probe = importsIn("import { x } from '../server/game/layers';\nimport type { Y } from '../../store';\nexport { z } from './z';");
  check(probe.join('|') === "../server/game/layers|type ../../store|./z" && resolveTo('engine/client/hud/x.ts', '../../server/game/layers') === 'engine/server/game/layers', '검사의 모양: import와 export from, import type을 가려 읽는다');
}

// ---------- 5. 게임은 틀을 입구로만 읽는다 ----------
{
  /**
   * 틀의 입구 (입구의 목록과 뜻은 engine/shared/index.ts). 이 밖의 틀 파일은 틀의 내부라 게임이 깊게 읽지 않는다:
   * 내부를 고쳐도 게임이 깨지지 않게, 그리고 게임에 내놓은 것이 무엇인지 한눈에 보이게.
   *   @engine/shared, @engine/server, @engine/client, @engine/testing: 입구 넷
   *   @engine/client/i18n과 그 언어 묶음(ko, en, names, merge): 언어. 도감과 시험이 three.js 없이 읽는다
   *   @engine/shared/defs, @engine/shared/world: 내용 통로 (게임의 통로 defs.ts·world.ts가 다시 내보낸다)
   *   @engine/shared/ext, @engine/server/game/ext, @engine/client/i18n/ext: 확장 지점 (선언 병합)
   *   @engine/client/platform: 플랫폼 접점. 도감처럼 three.js 없이 서는 페이지가 언어·주소·저장소를 읽는다 (@engine/client는 3D 화면 전체를 끌고 온다)
   */
  const ENTRIES = ['@engine/shared', '@engine/server', '@engine/client', '@engine/testing', '@engine/client/i18n', '@engine/client/i18n/ko', '@engine/client/i18n/en', '@engine/client/i18n/names', '@engine/client/i18n/merge',
    '@engine/shared/defs', '@engine/shared/world', '@engine/shared/ext', '@engine/server/game/ext', '@engine/client/i18n/ext', '@engine/client/platform'];
  /** 게임의 내용 파일(shared/content/)만: 계약의 타입은 defs/*.ts에서 import type으로, 기본값은 defaults에서, 모듈의 목록은 modules에서 (통로를 값으로 읽으면 초기화 순서가 꼬인다. defaults와 modules는 값을 아무 데서도 읽지 않는다) */
  const contentOk = (f: string, spec: string, typeOnly: boolean): boolean => /^games\/[^/]+\/shared\/content\//.test(f) && ((/^@engine\/shared\/defs\/\w+$/.test(spec) && typeOnly) || spec === '@engine/shared/defaults' || spec === '@engine/shared/modules');
  const specsIn = (src: string): { spec: string; typeOnly: boolean }[] => [...stripComments(src).matchAll(/^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"](@engine\/[^'"]+)['"]|^\s*import\s+['"](@engine\/[^'"]+)['"]/gm)].map((m) => ({ spec: m[3] ?? m[4], typeOnly: !!m[2] }));
  const deep = (f: string, src: string): string[] => specsIn(src).filter((s) => !ENTRIES.includes(s.spec) && !contentOk(f, s.spec, s.typeOnly)).map((s) => `${f} → ${s.spec}`);
  const GAMES = walk(path.join(root, 'games'), /\.ts$/).map(rel);
  const found = GAMES.flatMap((f) => deep(f, read(f)));
  for (const x of found) console.log('  ' + x);
  const viaEntry = GAMES.filter((f) => specsIn(read(f)).some((s) => ['@engine/server', '@engine/client', '@engine/shared', '@engine/testing'].includes(s.spec)));
  check((GAMES.length === 0 || viaEntry.length > 0) && found.length === 0, `게임(${[...new Set(GAMES.map((f) => f.split('/')[1]))].join(', ')})은 틀을 입구로만 읽는다: 틀의 내부 파일을 깊게 import하지 않는다 (입구를 쓰는 파일 ${viaEntry.length}개)`);
  // 검사가 실제로 잡아내는가
  const probe = deep('games/x/client/hud.ts', "import { S } from '@engine/client/state';\nimport { $ } from '@engine/client';\nimport type { ItemDef } from '@engine/shared/defs/items';");
  const probeContent = deep('games/x/shared/content/items.ts', "import type { ItemDef } from '@engine/shared/defs/items';\nimport { GEAR_BASE } from '@engine/shared/defaults';\nimport { X } from '@engine/shared/defs/items';");
  check(probe.length === 2 && probeContent.length === 1, '검사의 모양: 깊은 import는 잡고, 입구와 내용 파일의 타입 import는 지나간다');
  // 입구 파일이 실제로 있다
  check(['engine/shared/index.ts', 'engine/server/index.ts', 'engine/client/index.ts', 'engine/testing.ts'].every((f) => fs.existsSync(path.join(root, f))), '틀의 입구 파일 넷이 있다 (engine/{shared,server,client}/index.ts, engine/testing.ts)');
}

// ---------- 6. 틀은 게임을 읽지 않는다 ----------
{
  /** 틀이 게임에서 읽는 유일한 것: 내용 통로. 읽어도 되는 자리는 내용을 꺼내 기본값을 채우는 engine/shared/content.ts와 계약의 검사 contract.ts뿐이다 (그 밖의 틀 파일은 통로 engine/shared/defs.ts·world.ts를 거친다) */
  const CONTENT = '@game/shared/content';
  const PASSAGE = (f: string) => f === 'engine/shared/content.ts' || f === 'engine/shared/contract.ts';
  const specs = (src: string): string[] => [...stripComments(src).matchAll(/^\s*(?:import|export)\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm)].map((m) => m[1] ?? m[2] ?? m[3]);
  /** 그 import가 engine/ 밖을 가리키는가: 상대 경로로 폴더를 넘거나, @game 별칭이거나 */
  const outside = (f: string, spec: string): boolean => spec.startsWith('@game/') || (spec.startsWith('.') && !rel(path.resolve(path.join(root, path.dirname(f)), spec)).startsWith('engine/'));
  const bad = (f: string, src: string): string[] => specs(src).filter((s) => outside(f, s) && !(s === CONTENT && PASSAGE(f))).map((s) => `${f} → ${s}`);
  const found = SRC.flatMap((f) => bad(f, read(f)));
  for (const x of found) console.log('  ' + x);
  const reads = SRC.filter((f) => specs(read(f)).includes(CONTENT));
  check(reads.length === 2 && found.length === 0, `틀의 소스는 engine/ 밖에서 내용 통로(${CONTENT})만 읽고, 그것도 engine/shared/content.ts와 contract.ts에서만 읽는다 (${reads.length}곳)`);
  // 검사가 실제로 잡아내는가
  const probe = [
    ...bad('engine/client/hud/x.ts', "import { TOWER } from '../../../games/deungbul/shared/world';"),
    ...bad('engine/server/game/systems/x.ts', "import { RAID } from '@game/shared/content';"),
    ...bad('engine/shared/defs/x.ts', "import { RESIDENTS } from '@game/shared/content/residents';"),
    ...bad('engine/shared/defs/y.ts', "import { MAP } from '@game/shared/content';\nimport { x } from '../world';"),
    ...bad('engine/shared/content.ts', "import * as game from '@game/shared/content';"),
  ];
  check(probe.length === 4, '검사의 모양: 폴더를 넘는 상대 경로, 통로가 아닌 곳(defs/ 포함)의 @game, 내용 통로가 아닌 @game 경로는 잡고, content.ts의 내용 통로 읽기는 지나간다');
}

// ---------- 7. 게임의 운영 설정(deploy.json)과 서버 진입점의 기본값이 같다 ----------
// 운영 스크립트(restart.sh 등)는 deploy.json을 읽어 그 포트를 지켜보고 그 저장 폴더에 깃발을 세운다: 진입점의 기본값과 다르면 서버를 끄지 못하거나 남의 서버를 끈다
{
  const dirs = fs.existsSync(path.join(root, 'games')) ? fs.readdirSync(path.join(root, 'games'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  const games = dirs.filter((g) => fs.existsSync(path.join(root, 'games', g, 'deploy.json')));
  const wrong: string[] = [], ports = new Map<number, string>(), dbs = new Map<string, string>();
  for (const g of games) {
    const c = JSON.parse(fs.readFileSync(path.join(root, 'games', g, 'deploy.json'), 'utf8')) as { port: number; db: string; dist: string };
    const main = fs.readFileSync(path.join(root, 'games', g, 'server', 'main.ts'), 'utf8');
    // 진입점은 저장 파일과 화면 폴더를 path.join(root, '폴더', …)로 적는다: 그 조각들이 deploy.json의 경로와 같아야 한다
    const parts = (p: string) => p.split('/').map((x) => `'${x}'`).join(', ');
    if (!new RegExp(`port:\\s*${c.port}\\b`).test(main)) wrong.push(`${g}: 포트 ${c.port}`);
    if (!main.includes(parts(c.db))) wrong.push(`${g}: 저장 ${c.db}`);
    if (!main.includes(parts(c.dist))) wrong.push(`${g}: 화면 ${c.dist}`);
    if (ports.has(c.port)) wrong.push(`${g}: 포트 ${c.port}가 ${ports.get(c.port)}와 겹친다`);
    const dir = path.dirname(c.db);
    if (dbs.has(dir)) wrong.push(`${g}: 저장 폴더 ${dir}가 ${dbs.get(dir)}와 겹친다 (stop.flag가 남의 서버를 끈다)`);
    ports.set(c.port, g); dbs.set(dir, g);
  }
  for (const w of wrong) console.log('  ' + w);
  check(wrong.length === 0, `게임의 운영 설정(deploy.json)이 서버 진입점의 기본값과 같고, 게임끼리 포트·저장 폴더가 겹치지 않는다 (${games.join(', ') || '없음'})`);
}

// ---------- 8. 화면 코드는 브라우저를 플랫폼 접점으로만 부른다 ----------
// 데스크톱(Electron)·모바일(Capacitor)·포털에서는 저장소·주소·새 창·생명주기가 브라우저와 다르다: 화면 코드가 그것을 직접 부르면 그 플랫폼에서 조용히 틀린다.
// 그래서 틀의 화면(engine/client)과 게임의 화면(games/*/client)은 그것을 engine/client/platform/의 접점으로만 부른다 (docs/platforms.md 3.1의 규칙, 1단계에서 옮겼다).
{
  /** 금지 낱말 → 대신 쓸 접점 */
  const BANNED: [RegExp, string][] = [
    [/\blocalStorage\b/, 'platform().storage'],
    [/\bsessionStorage\b/, 'platform().storage'],
    [/(?<![\w.])location\.|\bwindow\.location\b|\bdocument\.location\b/, 'platform().app (param, anchor, page, requireUpdate) · platform().server()'],
    [/(?<![\w.])navigator\./, 'platform() (app.language, has, copy, share, input …)'],
    [/\bwindow\.open\s*\(/, 'platform().openUrl'],
    [/['"`]_blank['"`]/, 'platform().openUrl (새 창 전제 금지)'],
    [/\bdocument\.(visibilityState|hidden)\b|['"`](visibilitychange|pagehide|pageshow|beforeunload)['"`]/, 'platform().lifecycle'],
    [/\bhistory\.(replaceState|pushState|back|go)\b/, 'platform().app.setParam'],
    [/\b(requestFullscreen|exitFullscreen|fullscreenElement)\b/, 'platform().display.fullscreen'],
    [/\bdevicePixelRatio\b/, 'platform().display.pixelRatio · pixelRatioCap'],
    [/\bscreen\.(width|height|orientation)\b/, 'platform().display (viewport, orientation)'],
    [/\bcreateObjectURL\b/, 'platform().saveFile'],
    [/\(pointer:\s*coarse\)/, 'platform().input.primary (isTouch)'],
    [/\bserviceWorker\b/, 'platform().offlineCache'],
  ];
  /**
   * 알고 남겨 둔 곳 → 까닭 (최소로). 줄이 바뀌면 이 목록도 고친다 (없어진 것이 남아 있어도 실패한다)
   *   (비어 있다: 1단계에서 남겼던 차단 목록의 localStorage는 묶음 3이 서버로 옮기며 지웠다)
   */
  const KNOWN: Record<string, string> = {
  };
  const CLIENT = [
    ...walk(path.join(root, 'engine/client'), /\.ts$/),
    ...(fs.existsSync(path.join(root, 'games')) ? fs.readdirSync(path.join(root, 'games'), { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => walk(path.join(root, 'games', d.name, 'client'), /\.ts$/)) : []),
  ].map(rel).filter((f) => !f.startsWith('engine/client/platform/'));
  /** 그 소스(주석을 뺀 것)에서 걸린 [낱말, 대신 쓸 것] */
  const scan = (src: string): [string, string][] => BANNED.flatMap(([re, use]) => { const m = re.exec(stripComments(src)); return m ? [[m[0], use] as [string, string]] : []; });
  const used = new Set<string>();
  const hits = CLIENT.flatMap((f) => scan(read(f)).filter(([w]) => {
    const k = `${f}|${w}`;
    if (k in KNOWN) { used.add(k); return false; }
    return true;
  }).map(([w, use]) => `${f}: ${w.trim()} → ${use}`));
  for (const h of hits) console.log('  ' + h);
  for (const [k, why] of Object.entries(KNOWN)) console.log(`  알고 남김 ${k.replace('|', ': ')} (${why})`);
  check(CLIENT.length >= 100 && hits.length === 0, `화면 코드(틀 ${CLIENT.filter((f) => f.startsWith('engine/')).length}개, 게임 ${CLIENT.filter((f) => f.startsWith('games/')).length}개 파일)가 브라우저의 저장소·주소·navigator·새 창·생명주기·전체 화면·내려받기를 직접 부르지 않는다: 플랫폼 접점으로만 (알고 남긴 것 ${Object.keys(KNOWN).length}곳)`);
  const stale = Object.keys(KNOWN).filter((k) => !used.has(k));
  check(stale.length === 0, `알고 남긴 목록에 이미 없어진 것이 남아 있지 않다${stale.length ? ': ' + stale.join(', ') : ''}`);
  // 검사가 실제로 잡아내는가: 직접 부르는 것은 잡고, 주석과 접점을 거친 것, 비슷한 이름은 잡지 않는다
  const probeHit = scan("const t = localStorage.getItem('x'); if (document.hidden) location.reload(); window.open(u, '_blank'); const l = navigator.language;").map((h) => h[0].trim());
  const probeMiss = scan("// localStorage, location.reload()\nplatform().storage.get('lang'); platform().app.param('auto'); const myLocation = p.location; const s = el.location.x; ev.code; const dpr = platform().display.pixelRatio();");
  check(probeHit.length === 6 && probeMiss.length === 0, `검사의 모양: 직접 부르는 것(${probeHit.join(', ')})은 잡고, 주석·접점·다른 객체의 같은 이름은 잡지 않는다${probeMiss.length ? ': 잘못 잡음 ' + probeMiss.map((h) => h[0]).join(', ') : ''}`);
  // 접점 자체에는 그것이 있다 (옮겨 간 곳)
  const web = read('engine/client/platform/web.ts');
  check(['localStorage', 'location.reload()', 'navigator.language', "window.open(url, '_blank', 'noopener')", "'visibilitychange'", "'pagehide'", 'history.replaceState', 'requestFullscreen', 'URL.createObjectURL', 'navigator.clipboard.writeText'].every((w) => web.includes(w)), '옮겨 간 브라우저 호출은 웹 구현(engine/client/platform/web.ts)에 모여 있다');
}
