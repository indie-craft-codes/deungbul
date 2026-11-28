// 필요한 그림 목록 (art2): 그 게임이 실제로 보여 주는 그림 칸을 내용 정의에서 모아 표로 보인다.
// 칸마다 파일 이름(art-import가 받는 이름), 권장 크기, 투명 배경이 필요한가, 지금 등록되었는가, 그림을 만들 사람이 쓸 짧은 영어 설명.
//   node scripts/art-list.mjs <게임> [--missing] [--json] [--prio=1|2|3]
//     --missing  아직 없는 칸만 (등록 표 artlist.ts에도, 그림 시트에도 없는 것)
//     --json     표 대신 JSON (다른 도구가 읽게)
//     --prio=n   중요도 n 이하만 (1 핵심 · 2 권장 · 3 선택: 메뉴 탭 배경·화면 아이콘처럼 대체가 이미 괜찮은 것)
// 흐름: 이 목록 → ChatGPT 등으로 원본을 만든다(설명을 그대로 붙여 넣는다) → 권장 크기로 맞춘다(webp, 투명 칸은 투명) → node scripts/art-import.mjs <게임> <폴더>
// 수집은 scripts/art-list-collect.ts (tsx로 게임의 별칭을 읽는다). 칸의 크기·투명 규칙은 scripts/art-slots.mjs, 화면의 열쇠는 engine/client/art.ts.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SLOTS, sizeText } from './art-slots.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const prioMax = Number(args.find((a) => a.startsWith('--prio='))?.slice(7) ?? 3);
const [game] = args.filter((a) => !a.startsWith('--'));
if (!game) { console.error('쓰는 법: node scripts/art-list.mjs <게임> [--missing] [--json] [--prio=1|2|3]'); process.exit(1); }
const gameDir = path.join(root, 'games', game);
if (!fs.existsSync(path.join(gameDir, 'client'))) { console.error(`게임이 없습니다: games/${game}/client`); process.exit(1); }

const tsconfig = fs.existsSync(path.join(gameDir, 'tsconfig.json')) ? path.join(gameDir, 'tsconfig.json') : path.join(root, 'tsconfig.json');
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const r = spawnSync(process.execPath, [tsx, '--tsconfig', tsconfig, path.join(root, 'scripts', 'art-list-collect.ts'), gameDir], { cwd: root, encoding: 'utf8', maxBuffer: 32 << 20 });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(r.status ?? 1); }
const needs = JSON.parse(r.stdout.slice(r.stdout.lastIndexOf('\n[') + 1 || r.stdout.indexOf('[')));

// 지금 등록된 것: 등록 표(artlist.ts)와, 게임의 화면 코드가 그림 시트(addItemSheet·addIconSheet)에 올린 열쇠
const listFile = path.join(gameDir, 'client', 'artlist.ts');
const table = {};
if (fs.existsSync(listFile)) for (const m of fs.readFileSync(listFile, 'utf8').matchAll(/^\s*'([^']+)': '([^']+)',$/gm)) table[m[1]] = m[2];
const sheet = new Set();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'public' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []));
for (const f of walk(path.join(gameDir, 'client'))) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/add(Item|Icon)Sheet\(/.test(line)) return;
    for (const q of line.matchAll(/'([\w:.-]+)'/g)) sheet.add(q[1]);
    // 고리 안에서 변수로 올린 열쇠 (for (const [id, …] of [['sword5', …]]) addItemSheet(…, [id] …)): 바로 위 세 줄의 for 줄의 글자들
    if (/\[[^\]]*\b(id|key)\b[^\]]*\]/.test(line)) for (const up of lines.slice(Math.max(0, i - 3), i)) if (/\bfor \(/.test(up)) for (const q of up.matchAll(/\['([\w:.-]+)'/g)) sheet.add(q[1]);
  });
}
const inSheet = (key) => {
  const at = key.indexOf(':'), kind = key.slice(0, at), id = key.slice(at + 1);
  if (kind === 'item') return sheet.has(id.split('@')[0]);
  if (kind === 'cur') return sheet.has(key) || (id === 'sparks' && sheet.has('cur:second'));
  return false;
};

const kindOf = (key) => (key.includes(':') ? key.split(':')[0] : key.split('@')[0]);
const rows = needs.filter((n) => n.prio <= prioMax).map((n) => {
  const kind = kindOf(n.key), s = SLOTS[kind];
  const isBg = kind === 'bg' || kind === 'splash';
  const have = (isBg ? [n.key, `${n.key}@portrait`, `${n.key}@landscape`] : [n.key]).filter((v) => table[v]);
  // 앱 아이콘을 게임이 손으로 둔 경우 (등불지기: public/icon-192.png·manifest.webmanifest)
  const ownIcon = n.key === 'appicon' && fs.existsSync(path.join(gameDir, 'client', 'public', 'icon-192.png'));
  const status = have.length ? 'yes' : inSheet(n.key) ? 'sheet' : ownIcon ? 'file' : 'no';
  const ext = kind !== 'sheet' && s.ext.includes('.webp') ? '.webp' : s.ext[0];
  const base = n.key.replace(':', '-');
  const file = isBg ? `${base}@portrait${ext} + @landscape` : `${base}${ext}`;
  return { key: n.key, file, size: s.size.length ? sizeText(s.size) : kind === 'sheet' ? '4×4 칸 (칸 300~400px)' : '', alpha: s.alpha, prio: n.prio, status, have, where: s.where, fallback: s.fallback, desc: n.desc };
});
const ORDER = ['appicon', 'logo', 'splash', 'portrait', 'unit', 'sheet', 'bg', 'banner', 'enemy', 'item', 'cur', 'skill', 'frame', 'fx', 'icon'];
rows.sort((a, b) => ORDER.indexOf(kindOf(a.key)) - ORDER.indexOf(kindOf(b.key)) || a.prio - b.prio);
const shown = flags.has('--missing') ? rows.filter((x) => x.status === 'no') : rows;

if (flags.has('--json')) { process.stdout.write(JSON.stringify({ game, total: rows.length, missing: rows.filter((x) => x.status === 'no').length, slots: shown }, null, 2) + '\n'); process.exit(0); }

const ST = { yes: '있음', sheet: '시트', file: '파일', no: '없음' };
const count = (st) => rows.filter((x) => x.status === st).length;
console.log(`그림 칸: ${game} — 모두 ${rows.length} · 있음 ${count('yes')} · 시트 ${count('sheet')}${count('file') ? ` · 파일 ${count('file')}` : ''} · 없음 ${count('no')}${flags.has('--missing') ? ' (없는 것만 보임)' : ''}${prioMax < 3 ? ` (중요도 ${prioMax} 이하)` : ''}`);
console.log('열: 상태 · 중요도(1 핵심 · 2 권장 · 3 선택: 대체가 이미 괜찮다) · 열쇠 · 파일 이름 · 권장 크기 · 투명 배경. 아랫줄은 그림을 만들 사람에게 줄 영어 설명');
console.log('배경(bg·splash)은 세로·가로 두 장 (한 장만이면 @ 없이 bg-<장면>.webp)');
let group = '';
for (const x of shown) {
  const k = kindOf(x.key), g = ['logo', 'splash', 'appicon'].includes(k) ? 'brand' : k;
  if (g !== group) { group = g; console.log(`\n[${g}] ${g === 'brand' ? '접속 화면의 제목·배경, 앱 아이콘' : `${SLOTS[k].where} · 없으면 ${SLOTS[k].fallback}`}`); }
  console.log(`  ${ST[x.status]} ${x.prio} ${x.key.padEnd(26)} ${x.file.padEnd(36)} ${x.size.padEnd(22)} 투명 ${x.alpha ? '예' : '아니오'}`);
  console.log(`         ${x.desc}`);
}
console.log(`\n넣기: 위의 파일 이름으로 한 폴더에 모아 node scripts/art-import.mjs ${game} <폴더>  (크기·투명을 검사하고 경고한다)`);
