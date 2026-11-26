// handoff.test.ts가 따로 된 프로세스로 띄우는 실제 서버: 기기 옮기기 코드가 서버를 다시 켜도(강제로 죽여도) 남는지 본다.
//   DB=<저장 파일> PORT=0 BACKUP=0 tsx --tsconfig engine/test/fx/tsconfig.json engine/test/fx/handoff-proc.ts
// 포트가 열리면 'PORT <번호>' 한 줄을 찍는다. HANDOFF_SKEW_MS가 있으면 서버의 시계를 그만큼 앞으로 민다 (만료를 보려고).
import { runServer } from '../../server/run';

const skew = Number(process.env.HANDOFF_SKEW_MS ?? 0);
if (skew) { const real = Date.now; Date.now = () => real() + skew; }
const s = await runServer({ port: 0, db: 'memory', dist: 'no-dist' });
console.log(`PORT ${s.port}`);
