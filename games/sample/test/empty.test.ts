// 빈 표와 다른 장비 체계를 견디는가: 예제의 내용에서 표를 더 비우거나 바꾼 변형을 만들어, 틀만 그 내용으로 타입 검사한다.
// 틀은 게임의 내용을 게임이 적은 그대로의 타입으로 보므로, 표가 비면 id의 타입이 never가 되고 종류가 한 가지뿐이면 비교가 좁아진다:
// 틀의 코드가 표를 직접 읽으면(DAILIES[id], ITEMS[id].kind) 그런 게임에서 컴파일되지 않는다. 틀은 넓은 모양으로 읽는 도우미(dailyDef, itemDef, dungeonDef)를 쓴다.
// 예제 자체가 지키는 것(던전·대장간·보스·두 번째 재화 없음)에 더해 여기서 지키는 것: 상점·무리·떨어뜨리는 재료·일일 임무가 없는 게임, 무기만 있는 게임.
// 변형은 node_modules/.cache/ 아래에 만든다 (git에 들어가지 않고, 타입 패키지를 저장소의 node_modules에서 찾는다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check } from '@engine/test/harness';

const root = new URL('../../../', import.meta.url);
const src = fs.readFileSync(new URL('games/sample/shared/content/index.ts', root), 'utf8').replace(/\r\n/g, '\n');
/** 내용 파일에서 그 자리를 바꾼다. 자리를 찾지 못하면 던진다 (예제를 고쳤으면 이 시험의 식도 함께 고친다) */
const edit = (text: string, pairs: [RegExp, string][]): string => pairs.reduce((s, [re, to]) => { if (!re.test(s)) throw new Error(`자리를 찾지 못했다: ${re}`); return s.replace(re, to); }, text);

const NO_STOCK: [RegExp, string] = [/export const SHOP_STOCK: [^\n]*\n/, 'export const SHOP_STOCK: readonly ItemId[] = [];\n'];
const NO_DROPS: [RegExp, string] = [/(export const DROPS: [^=]*= )\{[\s\S]*?\n\};\n/, '$1{};\n'];
const VARIANTS: Record<string, [RegExp, string][]> = {
  // 상점, 무리, 떨어뜨리는 재료, 일일 임무가 없는 게임
  bare: [
    [/export const SHOPS: [^\n]*\n/, 'export const SHOPS: readonly { x: number; z: number }[] = [];\n'],
    [/(export const CAMPS: [^=]*= )\[[\s\S]*?\n\];\n/, '$1[];\n'],
    NO_STOCK, NO_DROPS,
    [/export const DAILIES = \{[\s\S]*?\n\} as const/, 'export const DAILIES = {} as const'],
  ],
  // 아이템이 처음 무기 하나뿐인 게임 (물약, 갑옷, 재료가 없다)
  weaponOnly: [
    [/  axe2: [^\n]*\n  coat: [^\n]*\n  stew: [^\n]*\n[\s\S]*?  log: [^\n]*\n/, ''],
    NO_STOCK, NO_DROPS,
    [/export const GEAR = [^\n]*\n/, "export const GEAR = { ...GEAR_BASE, weaponFor: (): ItemId => 'axe1', armorFor: (): ItemId => 'axe1' };\n"],
  ],
  // 장비 체계가 등불지기와 다른 게임: 칸 둘(무기·칩: 갑옷 칸이 없다), 옵션 둘(id도 다르다), 등급 둘, 능력치 하나.
  // 틀은 칸·옵션·능력치의 id를 적지 않고, 옵션과 능력치가 드는 효과(mod)만 읽는다 (이름 바꿔 내보내기는 기본값 묶음의 export *보다 앞선다)
  otherGear: [
    [/\n$/, `
export const GEAR_SLOTS = ['weapon', 'chip'] as const;
export const STATS = { atk: { base: 4, mod: 'damage' }, life: { base: 10, mod: 'hp' } } as const;
export const RARITIES = [{ id: 'worn', weight: 80, opts: 1, mult: 1 }, { id: 'keen', weight: 20, opts: 2, mult: 1.5 }] as const;
export const BUILD_STATS = { grit: { mod: 'hp', per: 6 } } as const;
`],
  ],
};
const WHAT: Record<string, string> = { bare: '상점·무리·재료·일일 임무 없음', weaponOnly: '아이템이 무기 하나뿐', otherGear: '갑옷 칸 없이 장비 칸 둘, 옵션 둘, 등급 둘, 능력치 하나' };

const cache = new URL('node_modules/.cache/empty-content/', root);
for (const [name, pairs] of Object.entries(VARIANTS)) {
  const dir = new URL(`${name}/`, cache);
  fs.mkdirSync(new URL('shared/content/', dir), { recursive: true });
  fs.writeFileSync(new URL('shared/content/index.ts', dir), edit(src, pairs));
  fs.copyFileSync(new URL('games/sample/shared/content/bonfire.ts', root), new URL('shared/content/bonfire.ts', dir));
  const up = '../../../../';
  fs.writeFileSync(new URL('tsconfig.json', dir), JSON.stringify({
    extends: `${up}tsconfig.json`,
    compilerOptions: { paths: { '@engine/*': [`${up}engine/*`], '@game/*': ['./*'] } },
    include: [`${up}engine/shared`, `${up}engine/server`, `${up}engine/client`],
  }, null, 2));
  const tsc = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '--noEmit', '--pretty', 'false', '-p', fileURLToPath(new URL('tsconfig.json', dir))], { cwd: fileURLToPath(root), encoding: 'utf8' });
  const errors = `${tsc.stdout}${tsc.stderr}`.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  for (const l of errors.slice(0, 12)) console.log('  ' + l);
  check(tsc.status === 0 && errors.length === 0, `틀이 더 비우거나 바꾼 내용으로도 컴파일된다 (${name}: ${WHAT[name]})${errors.length ? `: 오류 ${errors.length}개` : ''}`);
}
fs.rmSync(cache, { recursive: true, force: true });
