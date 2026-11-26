// 관리자 명령: 같은 PC에서 돌고 있는 게임 서버의 관리자 통로(POST /admin, engine/server/net/admin.ts)에 명령을 보낸다.
//   npm run admin -- [게임] <명령> [인자 …]
//   게임: 첫 인자가 games/ 아래의 폴더 이름이면 그것, 아니면 환경 변수 GAME, 그것도 없으면 deungbul (scripts/game.mjs와 같다).
//   포트: 환경 변수 PORT, 없으면 그 게임의 운영 설정(games/<게임>/deploy.json)의 port.
//   토큰: 서버가 켜질 때 저장 파일 옆에 만든 admin.token을 읽는다. 저장 파일은 환경 변수 DB, 없으면 deploy.json의 db (서버와 같은 셈).
//         다른 곳에 두었으면 ADMIN_TOKEN_FILE로 파일을 가리킨다.
//   누가: 기록에 남는 이름. 환경 변수 ADMIN_BY, 없으면 이 PC의 사용자 이름.
// 서버는 같은 PC에서 온 요청만 받고, 모든 명령을 기록한다 (저장 파일 옆의 admin-audit.log).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const HELP = `쓰는 법: npm run admin -- [게임] <명령> [인자 …]
  who                          지금 월드에 있는 사람 (주소, 저장 키 앞부분)
  find 이름                    캐릭터 한 명의 상태 (저장, 차단, 말 막기)
  ban 이름 기간 [사유]          접속 차단 (저장 키로). 기간: 숫자(시간), 30m·12h·7d, perm(영구)
  unban 이름                   차단 풀기
  banip 주소 기간 [사유]        접속 주소 차단
  unbanip 주소                 주소 차단 풀기
  mute 이름 기간 [사유]         말 막기 (전체·길드 대화)
  unmute 이름                  말 막기 풀기
  kick 이름 [사유]              내보내기 (자동 사냥으로 남지 않는다)
  announce [--chat] 글          전체 공지. 기본은 가운데 알림, --chat이면 대화창의 한 줄
  give 이름 무엇 수             지급 (무엇: gold, sparks, exp 또는 아이템 id). 접속해 있지 않으면 다음 접속 때
  take 이름 무엇 수             회수 (가진 만큼만)
  reports [수] [--all]         신고 목록 (기본: 처리하지 않은 것 20건)
  resolve 신고id [메모]         신고를 처리했다고 표시
  audit [수]                   최근 관리자 행동 기록
운영의 바탕 (시각: now, +30m, '2026-12-01 09:00'(초기화 시각의 시간대), '2026-12-01T09:00+09:00'):
  set                          원격 설정으로 바꿀 수 있는 칸(내용의 LIVE_KEYS)과 지금 값
  set 이름 값                   칸을 바꾼다 (값은 JSON. 검사를 지나야 반영, 재시작 없이)
  set 이름 --reset | --undo     소스의 값으로 / 바로 앞 값으로
  set --log [이름] [수]          변경 이력 (누가·언제·전·후)
  flag [이름 on|off]            기능 깃발 (join, chat, market, mail, gacha …). 없으면 켜짐
  notice                       공지 목록
  notice add [--popup] [--ticker] [--from 시각] [--to 시각 | --for 기간] --ko 글 [--en 글]
  notice del id                공지 내리기
  maint                        점검 상태와 점검 중 입장(관리자) 목록
  maint plan 시각 [--for 기간 | --until 시각] [--ko 글] [--en 글]   점검 예고 (카운트다운, 30·10·5·1분 전 안내)
  maint now [--for 기간] …       바로 점검 (모두 저장하고 관리자 말고 내보낸다)
  maint cancel                 예고 거두기
  maint end [--gold n] [--sparks n] [--exp n] [--item id:n] [--days n]   점검 끝 (보상을 적으면 저장된 캐릭터 모두에게 우편)
  maint allow|deny 이름         점검 중(과 새 접속이 꺼졌을 때)에도 들어올 사람`;

const root = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const isGame = (a) => a !== undefined && /^[a-z0-9_-]+$/i.test(a) && fs.existsSync(path.join(root, 'games', a, 'deploy.json'));
const game = isGame(argv[0]) ? argv.shift() : process.env.GAME ?? 'deungbul';
const [cmd, ...args] = argv;
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') fail(HELP, cmd ? 0 : 1);

let deploy;
try { deploy = JSON.parse(fs.readFileSync(path.join(root, 'games', game, 'deploy.json'), 'utf8')); }
catch { fail(`게임의 운영 설정을 읽지 못했습니다: games/${game}/deploy.json`); }
const port = Number(process.env.PORT ?? deploy.port);
const db = process.env.DB ?? deploy.db;
if (db === 'memory') fail('저장하지 않는 서버(DB=memory)에는 관리자 통로가 열리지 않습니다.');
const tokenFile = process.env.ADMIN_TOKEN_FILE ?? path.join(path.dirname(path.resolve(root, db)), 'admin.token');
let token;
try { token = fs.readFileSync(tokenFile, 'utf8').trim(); }
catch { fail(`관리자 토큰 파일이 없습니다: ${tokenFile}\n서버가 켜져 있는지, 이 게임(${game})과 저장 파일(DB)이 맞는지 보세요.`); }
let by = process.env.ADMIN_BY;
if (!by) { try { by = os.userInfo().username; } catch { by = 'operator'; } }

// fetch는 브라우저처럼 Sec-Fetch-Mode 머리를 붙여 서버가 거절한다: 머리를 그대로 정하는 http.request로 보낸다
const payload = JSON.stringify({ cmd, args, by });
const res = await new Promise((done) => {
  const req = http.request({ host: '127.0.0.1', port, path: '/admin', method: 'POST', timeout: 10000,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-admin-token': token } }, (r) => {
    const parts = [];
    r.on('data', (c) => parts.push(c));
    r.on('end', () => done({ status: r.statusCode ?? 0, text: Buffer.concat(parts).toString('utf8') }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (err) => fail(`서버(127.0.0.1:${port})에 닿지 못했습니다: ${err.code ?? err.message}`));
  req.end(payload);
});
let body;
try { body = JSON.parse(res.text); } catch { fail(`서버의 답을 읽지 못했습니다 (${res.status}): ${res.text.slice(0, 200)}`); }
console.log(body.out);
process.exit(res.status === 200 && body.ok ? 0 : 1);
