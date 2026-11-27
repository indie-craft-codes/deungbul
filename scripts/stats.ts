// 분석 사건의 집계 (운영 도구): 저장 파일의 events 표를 읽기 전용으로 열어 표를 찍는다. 서버가 켜져 있어도 돌릴 수 있다 (읽기만 한다).
//   npm run stats -- [게임] [daily | retention | funnel 사건,사건,…] [--days n] [--db 경로] [--json]
//   게임: 첫 인자가 games/ 아래의 폴더 이름이면 그것, 아니면 환경 변수 GAME, 그것도 없으면 deungbul (scripts/admin.mjs와 같다)
//   저장 파일: --db, 없으면 환경 변수 DB, 없으면 그 게임의 deploy.json의 db
//   daily      일별 활성: 활성(그날 접속한 저장 키), 새로 온 수, 접속 수, 접속 길이의 중간값. 기본 14일
//   retention  잔존: 처음 온 날의 무리마다 D1·D7·D30에 다시 접속한 비율. 기본 45일
//   funnel     퍼널: 사건의 차례를 밟은 저장 키의 수 (예: funnel first_join,level_up). 기본 30일
//   --json     표를 JSON으로
// 날은 UTC로 가른다. 셈은 서버의 관리자 명령 stats와 같은 함수다 (engine/server/net/stats.ts).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { daily, dailyText, funnel, funnelText, retention, retentionText } from '../engine/server/net/stats';
import type { EventRow } from '../engine/server/store/types';

const root = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const isGame = (a: string | undefined) => a !== undefined && /^[a-z0-9_-]+$/i.test(a) && fs.existsSync(path.join(root, 'games', a, 'deploy.json'));
const game = isGame(argv[0]) ? argv.shift()! : process.env.GAME ?? 'deungbul';
const flag = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const json = argv.includes('--json');
if (json) argv.splice(argv.indexOf('--json'), 1);
const dbArg = flag('db'), daysArg = flag('days');
const [kind = 'daily', steps = ''] = argv;
if (!['daily', 'retention', 'funnel'].includes(kind)) { console.error('쓰는 법: npm run stats -- [게임] [daily | retention | funnel 사건,사건,…] [--days n] [--db 경로] [--json]'); process.exit(1); }
let db = dbArg ?? process.env.DB;
if (!db) { try { db = JSON.parse(fs.readFileSync(path.join(root, 'games', game, 'deploy.json'), 'utf8')).db as string; } catch { console.error(`게임의 운영 설정을 읽지 못했습니다: games/${game}/deploy.json`); process.exit(1); } }
const file = path.resolve(root, db);
if (!fs.existsSync(file)) { console.error(`저장 파일이 없습니다: ${file}`); process.exit(1); }
const days = Math.max(1, Number(daysArg ?? (kind === 'retention' ? 45 : kind === 'funnel' ? 30 : 14)) || 14);
const now = Date.now(), from = now - days * 86_400_000;
const conn = new DatabaseSync(file, { readOnly: true });
let rows: EventRow[] = [];
try {
  rows = (conn.prepare('SELECT at, key, sess, name, props FROM events WHERE at >= ? AND at < ? ORDER BY at, id').all(from, now + 1) as { at: number; key: string; sess: string; name: string; props: string }[])
    .map((r) => ({ at: Number(r.at), key: String(r.key), sess: String(r.sess), name: String(r.name), props: (() => { try { return JSON.parse(r.props) as EventRow['props']; } catch { return {}; } })() }));
} catch (err) { console.error(`events 표를 읽지 못했습니다 (이 저장 파일의 스키마가 운영 도구 이전의 것인가): ${(err as Error).message}`); process.exit(1); }
finally { conn.close(); }
console.error(`${path.relative(root, file)}: 최근 ${days}일의 사건 ${rows.length}줄 (UTC)`);
if (kind === 'daily') { const t = daily(rows); console.log(json ? JSON.stringify(t, null, 2) : dailyText(t)); }
else if (kind === 'retention') { const t = retention(rows, now); console.log(json ? JSON.stringify(t, null, 2) : retentionText(t)); }
else {
  const list = steps.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length < 2) { console.error('퍼널에는 사건이 둘 이상 필요합니다: npm run stats -- funnel first_join,level_up'); process.exit(1); }
  const t = funnel(rows, list);
  console.log(json ? JSON.stringify(t, null, 2) : funnelText(t));
}
