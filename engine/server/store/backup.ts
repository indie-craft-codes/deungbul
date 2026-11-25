// 자동 백업: 서버가 켜질 때와 정해진 간격마다 저장 파일을 통째로 복사한다 (SqliteStore.backup: VACUUM INTO).
// 자리: 저장 파일 옆의 backup/ 폴더. 이름: auto-YYYYMMDD-HHMMSS.db (서버 현지 시각).
// 보관 개수를 넘으면 가장 오래된 자동 백업부터 지운다. 지우는 것은 이 이름 꼴(AUTO_NAME)에 꼭 맞는 파일뿐이다:
// 사람이 만든 백업(운영 DB의 data/backup/ 에 있는 game.db.<시각>, game-<시각>-before-….db 같은 것)은 'auto-'로 시작하지 않으므로 건드리지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../log';
import type { Store } from './types';

/** 자동 백업 파일의 이름 꼴. 이것에 맞는 파일만 지운다 */
export const AUTO_NAME = /^auto-\d{8}-\d{6}(?:-\d+)?\.db$/;

export interface BackupOptions {
  /** 백업 간격(분). 0이면 켜질 때만. 기본 360 */
  everyMin?: number;
  /** 남겨 둘 자동 백업 수. 기본 20 */
  keep?: number;
  /** 백업 폴더. 기본은 저장 파일 옆의 backup/ */
  dir?: string;
}
export const BACKUP_DEFAULTS = { everyMin: 360, keep: 20 } as const;

export interface Backups {
  /** 지금 하나 만든다. 만든 파일의 경로 (실패하면 null: 로그를 남기고 서버는 계속 돈다) */
  now(): string | null;
  /** 마지막으로 성공한 백업의 시각(ms). 없으면 0 */
  readonly lastAt: number;
  /** 실패한 횟수 */
  readonly fails: number;
  stop(): void;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** 자동 백업 이름의 차례: [시각 'YYYYMMDD-HHMMSS', 같은 초 안의 번호(없으면 1)] */
const orderOf = (name: string): [string, number] => { const m = /^auto-(\d{8}-\d{6})(?:-(\d+))?\.db$/.exec(name); return m ? [m[1], Number(m[2] ?? 1)] : ['', 0]; };
const byTime = (a: string, b: string): number => { const [ta, na] = orderOf(a), [tb, nb] = orderOf(b); return ta < tb ? -1 : ta > tb ? 1 : na - nb; };

/** 시각이 든 자동 백업 이름. 같은 초에 둘을 만들면 뒤에 번호를 붙인다(그 초의 가장 큰 번호 + 1: 앞의 것을 지웠어도 이름 순서가 만든 순서와 같게) */
export function autoName(at: Date, dir: string): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { /* 폴더가 아직 없다 */ }
  const last = Math.max(0, ...names.map(orderOf).filter(([t]) => t === stamp).map(([, n]) => n));
  return last ? `auto-${stamp}-${last + 1}.db` : `auto-${stamp}.db`;
}

/** 보관 개수를 넘는 오래된 자동 백업을 지운다. 지운 파일의 이름들 */
export function prune(dir: string, keep: number): string[] {
  let names: string[];
  try { names = fs.readdirSync(dir).filter((n) => AUTO_NAME.test(n)); } catch { return []; }
  // 이름에 시각이 들어 있으므로 이름의 차례가 곧 만든 차례다 (파일의 수정 시각은 복사하면 바뀌므로 보지 않는다)
  names.sort(byTime);
  const gone = names.slice(0, Math.max(0, names.length - Math.max(1, keep)));
  for (const n of gone) { try { fs.rmSync(path.join(dir, n)); } catch (err) { log.warn(`[backup] 옛 자동 백업을 지우지 못했습니다: ${n}`, err); } }
  return gone;
}

/** 자동 백업을 시작한다: 곧바로 하나 만들고, everyMin마다 하나씩. 저장소가 파일이 아니면(메모리) 아무것도 하지 않는다 */
export function startBackups(store: Store, opts: BackupOptions = {}): Backups | null {
  if (!store.backup || !store.file) return null;
  const everyMin = opts.everyMin ?? BACKUP_DEFAULTS.everyMin, keep = opts.keep ?? BACKUP_DEFAULTS.keep;
  const dir = opts.dir ?? path.join(path.dirname(store.file), 'backup');
  const state = { lastAt: 0, fails: 0 };
  const now = (): string | null => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, autoName(new Date(), dir));
      const t0 = performance.now();
      store.backup!(file);
      state.lastAt = Date.now();
      const gone = prune(dir, keep);
      log.info(`[backup] ${file} (${(fs.statSync(file).size / 1024).toFixed(0)}KB, ${(performance.now() - t0).toFixed(0)}ms)${gone.length ? `, 옛 자동 백업 ${gone.length}개를 지웠습니다` : ''}`);
      return file;
    } catch (err) { state.fails++; log.error('[backup] 자동 백업 실패:', err); return null; }
  };
  now();
  const timer = everyMin > 0 ? setInterval(now, everyMin * 60_000) : null;
  timer?.unref();
  return { now, get lastAt() { return state.lastAt; }, get fails() { return state.fails; }, stop: () => { if (timer) clearInterval(timer); } };
}
