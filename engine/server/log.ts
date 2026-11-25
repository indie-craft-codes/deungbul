// 서버 로그의 작은 도구: 줄마다 시각과 수준(info/warn/error)을 붙인다.
//   2026-11-26 07:15:02.123 INFO  [server] http://localhost:3001 에서 대기 중
// 서버의 핵심 경로(켜기, 끄기, 저장, 백업, 치명적 오류)가 이것을 쓴다. 그 밖의 console.* 는 그대로 둔다(시각 없이 찍힌다).
// 오류(Error)를 넘기면 스택까지 찍는다. 시험은 setLogSink로 찍힌 줄을 모을 수 있다.

export type Level = 'info' | 'warn' | 'error';
type Sink = (level: Level, line: string) => void;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** 서버 현지 시각 'YYYY-MM-DD HH:MM:SS.mmm' (운영자가 읽는 로그라 현지 시각으로 적는다) */
export function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
const text = (a: unknown): string => (a instanceof Error ? (a.stack ?? `${a.name}: ${a.message}`) : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })());

const consoleSink: Sink = (level, line) => { if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line); };
let sink: Sink = consoleSink;
/** 찍는 곳을 바꾼다 (시험). 주지 않으면 원래대로(표준 출력·오류) */
export function setLogSink(fn?: Sink): void { sink = fn ?? consoleSink; }

function write(level: Level, args: unknown[]): void {
  const line = `${stamp()} ${level.toUpperCase().padEnd(5)} ${args.map(text).join(' ')}`;
  try { sink(level, line); } catch { /* 로그를 찍지 못해도 서버는 돈다 */ }
}

export const log = {
  info: (...args: unknown[]): void => write('info', args),
  warn: (...args: unknown[]): void => write('warn', args),
  error: (...args: unknown[]): void => write('error', args),
};
