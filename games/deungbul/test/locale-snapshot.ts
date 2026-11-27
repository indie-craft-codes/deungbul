// 언어 파일의 문장을 통째로 떠서 적어 두는 도구 (guide.test.ts가 games/deungbul/test/fixtures/locale-*.json과 비교한다).
// 문자열은 그대로, 함수 꼴 문장은 정해 둔 인자 여러 벌을 넣어 나온 문장들을 적는다: 문장을 실수로 바꾸거나 키를 옮기다 잃으면 잡힌다.
// 문장을 일부러 바꿨을 때는 견본을 새로 뜬다 (바뀐 줄을 git diff로 확인한 뒤 함께 커밋한다):
//   npx tsx games/deungbul/test/locale-snapshot.ts --write
// 인자 목록(아래 ARRAYS, TUPLES)에는 내용의 id를 그 시점의 글자로 적어 두었다: 내용이 늘어도 견본의 줄이 밀리지 않는다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';

type Arg = string | number | boolean | null | (string | number)[];

const BIG = 1234567;
const LONG = '아주긴이름을가진모험가';
/** 서버 안내문(msg)에 넣는 값의 벌: 수, 큰 수, 이름, 내용의 id들 */
const ARRAYS: (string | number)[][] = [
  [], [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 3, 4, 5, 6], [BIG, BIG, BIG, BIG, BIG], [-3, 0], [0, 5, 0, 2, 0], [12, 0, 0, 0, 3],
  [LONG, 'Zed'], ['Zed', LONG], ['브람', '미라'], ['모르는것', '모르는것', '모르는것'],
  ['slime', 12, 3, 1500], ['wisp', 1, 1, 1], ['wolf', 5, 0, 0], ['shade_bram', 1], ['shade_mira', 2], ['boar', 1], ['goblin', 9], ['lost_soldier', 1], ['ash_troll', 1], ['ash_troll', 4], ['crypt_lord', 2],
  ['sword1', 'warrior'], ['sword2', 'archer'], ['sword3', 'mage'], ['sword4', 'archer'], ['armor1', 'mage'], ['armor2', 'warrior'], ['hide'], ['iron'], ['ashcore'], ['potion', 'warrior'], ['tonic'],
  ['warrior'], ['archer'], ['mage'],
  ['crypt', 30], [LONG, 'crypt'],
  ['bram'], ['mira'], ['halmeom'], ['ashwood'],
  ['first'], ['ash'], [0, 'first'], [1, 'ash'], [2, 'first'],
  [5, 40, 'tower'], [1, 1, 'resident'], [30, BIG, 'resident'],
  ['weapon', 'common'], ['armor', 'uncommon'], ['ring', 'rare'], ['amulet', 'epic'], ['charm', 'supply'], ['weapon', 'made'],
  [30, 12, 1500, 0], [480, BIG, BIG, 3],
];
/** 값이 들어가는 화면 문구(fmt)와 능력치·옵션 문장에 넣는 인자의 벌 */
const TUPLES: Arg[][] = [
  [], [0], [1], [2], [5], [BIG], [0, 0, 0, 0], [1, 1, 1, 1], [2, 3, 4, 5], [BIG, BIG, BIG, BIG], [0, 5, 0], [5, 0, 3], [3, 10, 0, 7], [-2, 4],
  [0, 70, 10, 2], [1, 70, 10, 2], [2, 70, 10, 2], [0, 12, 100], [1, 55, 100], [2, 100, 100],
  [LONG], ['Zed'], [LONG, 3], ['Zed', BIG], [3, '전사'], [12, ''], [LONG, 'Zed'], ['Zed', LONG], [LONG, 7, 15], ['브람', 12],
  [LONG, '설명 문장', 2], ['검', '희귀한', 0, 4], ['Sword', '', 7, 30],
  ['12:00', true, 7], ['20:00', false, 7], [17, '2:05'], [3, '0:09'], [BIG, 12, '34ms'], ['-', 0, '-'],
  [2, null], [5, 300], [45, '설명.'],
  [['슬라임', '위습']], [[]], ['쇳조각', ['고블린', '잊힌 병사']], ['Iron Scrap', ['Goblin']],
  ['idle', [35]], ['attend', [7]], ['dungeon', ['crypt']], ['dungeon', ['모르는것']], ['daily', ['kill30']], ['daily', ['offer10']], ['daily', ['enhance1']],
  ['marketSold', ['iron', 3, 1500, 75]], ['marketSold', ['weapon', 1, BIG, 61728]], ['marketExpired', ['hide', 1]], ['marketBought', ['ring', 1]], ['marketBack', ['ashcore', 12]], ['모르는것', [1]],
];

export type Snapshot = Record<string, string | string[]>;

/**
 * 함수 하나를 인자 벌마다 불러 나온 문장들. 모두 같으면(값을 쓰지 않는 문장) 문자열 하나다. 던지면 그 사실을 적는다.
 * 견본 파일이 너무 커지지 않게, 벌마다 달라지는 문장은 전체의 지문(sha1 앞 16자)과 처음 나온 서로 다른 문장 넷만 적는다:
 * 어느 키가 달라졌는지는 지문이 잡고, 무엇이 달라졌는지는 그 키의 소스를 git diff로 본다. full이면 지문 대신 전부 적는다 (손으로 견줄 때)
 */
function outputs(fn: (...a: never[]) => unknown, sets: Arg[][], spread: boolean, full: boolean): string | string[] {
  const out = sets.map((set) => {
    try { return String(spread ? (fn as (...a: Arg[]) => unknown)(...structuredClone(set)) : (fn as (a: Arg[]) => unknown)(structuredClone(set))); }
    catch (e) { return `(던짐) ${(e as Error).name}`; }
  });
  if (out.every((s) => s === out[0])) return out[0];
  const uniq = [...new Set(out)];
  if (full) return [out.map((s) => uniq.indexOf(s)).join(' '), ...uniq];
  return [createHash('sha1').update(JSON.stringify(out)).digest('hex').slice(0, 16), ...uniq.slice(0, 4)];
}

/** 언어 묶음 하나의 모든 문장: 자리(ui.title, msg.kill, quests.bram.steps[0] …) → 문자열, 또는 [지문, 문장의 보기 몇 개] */
export function snapshotOf(locale: unknown, full = false): Snapshot {
  // 시각을 적는 문장(점검 예고의 '예정 끝' 같은 것)은 서버 PC의 시간대를 따른다: 견본을 뜰 때와 견줄 때 같은 글이 나오게 이 셈 동안만 UTC로 둔다
  // (node는 process.env.TZ를 바꾸면 곧바로 따른다. 날짜 글의 해석(new Date('…'))과 출력(toLocaleString) 모두). 끝나면 되돌린다: 같은 프로세스의 다른 시험은 그대로
  // 되돌릴 때는 지운 TZ가 아니라 처음의 시간대 이름을 적는다 (Windows의 node는 TZ를 지워도 UTC에 머문다)
  const tz = process.env.TZ, zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = 'UTC';
  try { return walkAll(locale, full); } finally { process.env.TZ = tz ?? zone; }
}
function walkAll(locale: unknown, full: boolean): Snapshot {
  const snap: Snapshot = {};
  const walk = (v: unknown, at: string): void => {
    if (typeof v === 'function') snap[at] = at.startsWith('msg.') ? outputs(v as never, ARRAYS, false, full) : outputs(v as never, TUPLES, true, full);
    else if (Array.isArray(v)) { snap[`${at}.length`] = String(v.length); v.forEach((x, i) => walk(x, `${at}[${i}]`)); }
    else if (typeof v === 'object' && v !== null) for (const k of Object.keys(v).sort()) walk((v as Record<string, unknown>)[k], at ? `${at}.${k}` : k);
    else snap[at] = String(v);
  };
  walk(locale, '');
  return snap;
}

export const fixturePath = (code: string): URL => new URL(`./fixtures/locale-${code}.json`, import.meta.url);
export const readFixture = (code: string): Snapshot => JSON.parse(fs.readFileSync(fixturePath(code), 'utf8')) as Snapshot;

/** 두 견본이 다른 자리: 빠진 키, 새 키, 값이 다른 키 */
export function compare(was: Snapshot, now: Snapshot): { missing: string[]; added: string[]; changed: string[] } {
  const same = (a: string | string[], b: string | string[]): boolean => JSON.stringify(a) === JSON.stringify(b);
  return {
    missing: Object.keys(was).filter((k) => !(k in now)),
    added: Object.keys(now).filter((k) => !(k in was)),
    changed: Object.keys(was).filter((k) => k in now && !same(was[k], now[k])),
  };
}

if (process.argv.includes('--write')) {
  const { LOCALES } = await import('../client/i18n');
  for (const loc of LOCALES) {
    const snap = snapshotOf(loc);
    fs.writeFileSync(fixturePath(loc.code), JSON.stringify(snap, null, 1) + '\n');
    console.log(`${loc.code}: 문장 ${Object.keys(snap).length}개를 적었다 (${fixturePath(loc.code).pathname})`);
  }
}
