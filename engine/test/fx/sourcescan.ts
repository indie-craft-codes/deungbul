// 시험 도우미: '이 칸을 직접 고치는 코드가 통로(지갑, 가방) 밖에 없다'를 소스를 읽어 본다. fx/wallet.test.ts와 fx/bag.test.ts가 함께 쓴다.
// 서버와 공용 코드만 본다 (틀과 모든 게임). 화면(client)이 들고 있는 값은 서버가 보낸 것의 사본이고, 시험(test)은 준비로 직접 고친다.
// 게임이 하나도 없는 저장소(틀만 떼어 낸 것)에서도 돈다: 그때는 틀의 소스만 본다.
// 검사 하나로 묶었다: 실패하면 무엇이 틀렸는지(읽은 파일, 허용 목록 밖의 줄, 없어진 허용 줄, 검사 모양, 통로를 쓰지 않는 시스템)를 모두 메시지에 적는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../harness';

/** 직접 고쳐도 되는 곳: 파일, 그 줄의 모양, 까닭 */
export interface Allowed { file: string; line: RegExp; why: string }

export interface WriteScan {
  /** 메시지에 쓰는 이름 (예: '재화의 칸(.gold, .sparks, .exp)') */
  what: string;
  /** 값을 넣는 줄의 모양 */
  write: RegExp;
  /** 이 목록에 없는 곳에서 고치면 실패한다. 목록의 줄이 실제로 없어도 실패한다 */
  allowed: Allowed[];
  /** 통로 자신 (그 안의 줄은 보지 않는다) */
  self: string;
  /** 읽은 파일에 반드시 있어야 하는 다른 파일 (읽기가 제대로 되었는가) */
  mustRead: string;
  /** 검사의 모양: 잡아야 하는 줄과 잡지 말아야 하는 줄 */
  hits: string[]; misses: string[];
  /** 통로를 부르는 모양과, 그것을 반드시 쓰는 틀의 시스템 파일. games가 참이면 게임의 규칙 시스템도 하나는 써야 한다 */
  uses: RegExp; want: string[]; games?: boolean;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rel = (f: string) => path.relative(root, f).replaceAll('\\', '/');
const walk = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : [])) : []);

/** 소스를 훑어 검사 하나를 남긴다 (조건: 읽은 파일 · 허용 목록 밖의 줄 없음 · 허용 줄이 모두 있음 · 검사 모양 · 통로를 쓰는 시스템) */
export function scanWrites(o: WriteScan): void {
  const games = fs.existsSync(path.join(root, 'games')) ? fs.readdirSync(path.join(root, 'games'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const dirs = ['engine/server', 'engine/shared', ...games.flatMap((n) => [`games/${n}/server`, `games/${n}/shared`])];
  const files = dirs.flatMap((d) => walk(path.join(root, d))).map(rel).filter((f) => !/\.test\.ts$/.test(f));
  const used = new Set<number>(), stray: string[] = [];
  let writes = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = /^\s*(\*|\/\*|\/\/)/.test(raw) ? '' : raw.replace(/\s\/\/ .*$/, ''); // 주석은 보지 않는다
      if (!o.write.test(line) || f === o.self) return;
      writes++;
      const k = o.allowed.findIndex((a) => a.file === f && a.line.test(line));
      if (k >= 0) used.add(k); else stray.push(`${f}:${i + 1}: ${raw.trim().slice(0, 110)}`);
    });
  }
  const problems: string[] = [];
  // 1. 서버와 공용 소스를 읽었다
  if (!(files.length >= 40 && files.includes(o.self) && files.includes(o.mustRead) && (games.length === 0 || files.some((f) => f.startsWith('games/'))) && writes >= o.allowed.length))
    problems.push(`소스를 제대로 읽지 못했다 (파일 ${files.length}개, 고치는 줄 ${writes}개)`);
  // 2. 허용 목록 밖에서 고치는 줄이 없다
  for (const s of stray) console.log('      ' + s);
  if (stray.length) problems.push(`통로와 허용 목록 밖에서 고치는 줄 ${stray.length}곳 (위)`);
  // 3. 허용 목록의 줄이 모두 실제로 있다
  const unused = o.allowed.filter((_, k) => !used.has(k));
  if (unused.length) problems.push('허용 목록에 있지만 없는 줄: ' + unused.map((a) => `${a.file} ${a.line}`).join(', '));
  // 4. 검사의 모양: 값을 넣는 줄은 잡고, 읽거나 견주는 줄은 잡지 않는다
  const missed = o.hits.filter((s) => !o.write.test(s)), wrong = o.misses.filter((s) => o.write.test(s));
  if (missed.length || wrong.length) problems.push(`검사의 모양이 틀렸다 (못 잡은 것: ${missed.join(' / ') || '없음'}, 잘못 잡은 것: ${wrong.join(' / ') || '없음'})`);
  // 5. 통로를 실제로 쓰고 있다
  const uses = files.filter((f) => f !== o.self && o.uses.test(fs.readFileSync(path.join(root, f), 'utf8')));
  const notUsing = o.want.filter((f) => !uses.includes(f));
  if (notUsing.length) problems.push('통로를 쓰지 않는 틀의 시스템: ' + notUsing.join(', '));
  if (o.games && games.length > 0 && !uses.some((f) => f.startsWith('games/'))) problems.push('통로를 쓰는 게임의 규칙 시스템이 없다');
  check(problems.length === 0,
    `${o.what}을 직접 고치는 코드가 ${path.basename(o.self, '.ts')}와 허용 목록(${o.allowed.length}곳: 모두 실제로 있어야 한다) 밖에 없다 (서버·공용 소스 ${files.length}개: 틀과 게임 ${games.join(', ')}. 검사 모양 ${o.hits.length}/${o.misses.length}, 통로를 쓰는 파일 ${uses.length}개)${problems.length ? ': ' + problems.join('; ') : ''}`);
}

/** 장부에 원인을 가리지 못한 줄(other, tick)이 없다. except에 든 재화의 줄은 일부러 직접 고친 것으로 본다 */
export function noUnknownCause(rows: readonly { cur: string; why: string }[], flow: string, except: readonly string[] = [], also = true): void {
  const bad = rows.filter((r) => (r.why === 'other' || r.why === 'tick') && !except.includes(r.cur));
  check(also && bad.length === 0, `${flow}에서 원인을 가리지 못한 줄(other, tick)이 없다${except.length ? ` (일부러 직접 고친 ${except.join(', ')} 말고)` : ''}${bad.length ? ': ' + bad.map((r) => `${r.cur} ${r.why}`).join(', ') : ''}`);
}
