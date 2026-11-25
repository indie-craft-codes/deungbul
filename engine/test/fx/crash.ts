// ops.test.ts가 따로 된 프로세스로 띄우는 서버: 일부러 처리되지 않은 거부와 예외를 낸다.
//   DB=<저장 파일> PORT=0 BACKUP=0 tsx --tsconfig engine/test/fx/tsconfig.json engine/test/fx/crash.ts
// 0.3초 뒤 처리되지 않은 거부(기록만 하고 계속 돌아야 한다), 0.9초 뒤 처리되지 않은 예외(저장하고 코드 1로 끝나야 한다).
// 월드에 'crashMark' 칸을 둔다: 예외를 내기 직전에 값을 'after-throw'로 바꾸므로, DB에 그 값이 있으면 예외 뒤에 저장한 것이다.
import { runServer } from '../../server/run';

let mark = 'before';
await runServer({ port: 0, db: 'memory', dist: 'no-dist', plugins: [(g) => { g.worldSaves.push({ name: 'crashMark', save: () => mark, load: () => {} }); }] });
setTimeout(() => { void Promise.reject(new Error('일부러 낸 거부')); }, 300);
setTimeout(() => { mark = 'after-throw'; console.log('[crash] 예외를 냅니다'); throw new Error('일부러 낸 예외'); }, 900);
