// 틀과 게임의 경계를 글자로 지키는 검사 (독립 점검 docs/framework-audit.md 3절에서 놓친 것들).
// framework.test.ts가 import의 방향과 선언 병합을 본다면, 여기서는 import로는 안 보이는 새는 길을 본다:
//   1. 틀의 소스에 게임의 내용 id를 문자열로 적었는가 ('ash_troll', 'crypt')
//   2. 틀의 소스의 문자열과 css에 이 게임의 낱말이 있는가 ('불씨를 등탑에', .raidwarn)
//   3. 타입 검사를 피해 가는 캐스팅(as unknown as, as never, as any)이 늘었는가
//   4. 층을 넘는 import: 화면 → 서버, 게임 규칙 → 저장소 구현
// 모두 소스 글자를 읽는다. 주석은 보지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_STAT_IDS, CLASS_IDS, DAILY_IDS, DUNGEON_IDS, GEAR_SLOTS, ITEMS, MONSTERS, RARITIES, SKILL_DEFS, STAT_IDS } from '../shared/defs';
import { AREAS } from '../shared/world';
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
  /** 이 게임(별칭 @game이 가리키는 게임)의 내용 id. 틀은 이것을 표로만 읽어야 하고, 글자로 적으면 다른 게임에서 조용히 틀린다 */
  const ids = new Set<string>([
    ...CLASS_IDS, ...Object.keys(MONSTERS), ...Object.keys(ITEMS), ...Object.keys(SKILL_DEFS), ...DUNGEON_IDS, ...DAILY_IDS,
    ...AREAS.map((a) => a.id), ...RARITIES.map((r) => r.id), ...GEAR_SLOTS, ...STAT_IDS, ...BUILD_STAT_IDS,
  ]);
  /**
   * 내용의 id와 글자가 같지만 틀의 낱말인 것 → 까닭.
   * weapon, armor: ItemDef.kind의 종류이자 바탕 아이템이 끼는 칸의 이름 (계약에 적은 약속)
   * potion: ItemDef.kind의 종류 / guard, crit, hp: 틀의 효과(StatMod)와 수치 보정(ModName)의 이름 / ring: 미니맵 표시의 모양
   * bolt: ClassDef.shot(날아가는 것의 모양) / dust: 자리 비움 동안 센 것의 칸 이름(away.tally)
   */
  const ENGINE_WORDS: Record<string, string> = { weapon: '아이템 종류·칸', armor: '아이템 종류·칸', potion: '아이템 종류', guard: '효과 이름', crit: '효과 이름', hp: '효과 이름', ring: '미니맵 모양', bolt: '쏘는 것의 모양', dust: '자리 비움의 셈 칸' };
  /** 기본값 묶음은 내용 그 자체다 (게임이 받아 쓰는 기본 칸·등급 id): 검사하지 않는다 */
  const CONTENT_FILES = ['engine/shared/defaults.ts'];
  const hits = SRC.filter((f) => !CONTENT_FILES.includes(f)).flatMap((f) => strings(body(f)).filter((s) => ids.has(s) && !(s in ENGINE_WORDS)).map((s) => `${f}: '${s}'`));
  for (const h of [...new Set(hits)]) console.log('  ' + h);
  check(ids.size >= 40 && hits.length === 0, `틀의 소스가 게임의 내용 id(${ids.size}개)를 문자열로 적지 않는다 (틀의 낱말 ${Object.keys(ENGINE_WORDS).length}개는 뺀다)`);
  // 검사가 실제로 잡아내는가: 몬스터 id를 견주는 줄은 잡고, 주석 속의 id와 id가 아닌 문자열은 잡지 않는다
  const mon = Object.keys(MONSTERS)[0], probe = (src: string) => strings(stripComments(src)).filter((x) => ids.has(x) && !(x in ENGINE_WORDS));
  check(probe(`if (m.type === '${mon}' && p.cls === "${CLASS_IDS[0]}") hit();`).length === 2 && probe(`// '${mon}'
const a = 'hello';`).length === 0, '검사의 모양: 문자열로 적은 id는 잡고, 주석과 다른 문자열은 잡지 않는다');
}

// ---------- 2. 이 게임의 낱말을 문자열과 css에 ----------
{
  /** framework.test.ts의 언어 파일 검사와 같은 낱말. 거기는 언어·알림·소리 파일의 본문 전체를, 여기는 틀의 모든 소스의 문자열과 css를 본다 */
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
   * raid: 몰려온 적의 표시(EnterInfo.r)를 읽는 자리. 점검 14번(습격 몹의 이름을 중립으로)에서 지운다
   */
  const KNOWN: Record<string, string[]> = {
    crypto: ['engine/server/net/server.ts'],
    sparks: ['engine/shared/defaults.ts', 'engine/server/game/systems/ledger.ts', 'engine/server/game/systems/mail.ts', 'engine/server/game/systems/players.ts', 'engine/server/game/systems/wallet.ts'],
    sparkBonus: ['engine/server/game/game.ts', 'engine/server/game/systems/players.ts'],
    raid: ['engine/client/entities.ts'],
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
