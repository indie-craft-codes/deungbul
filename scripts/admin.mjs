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
  maint allow|deny 이름         점검 중(과 새 접속이 꺼졌을 때)에도 들어올 사람
웹 출시의 바탕:
  errors [수] [--all]          화면 오류 묶음 (같은 오류는 한 줄, 최근 순. --all이면 스택 전부)
  errors clear 서명|all         화면 오류 묶음을 지운다 (고친 뒤)
  erase [list]                 기다리는 내 데이터 삭제 요청
  erase log [수]               삭제 기록 (요청·취소·실행)
  erase ask 이름 [일수]         대신 삭제 요청을 받는다 (메일 등으로 요청한 사람). 일수를 주지 않으면 게임의 PRIVACY.eraseDays
  erase cancel 이름             삭제 요청을 거둔다
  erase now 이름|키앞           유예 없이 곧바로 지운다
  erase sweep                  때가 된 요청을 지금 실행한다 (서버가 1분마다 한다)
  report 신고id                 신고 하나를 자세히: 최근 말과 대화의 앞뒤 줄 전부 (> 신고당한 사람의 말, ▶ 신고한 줄)
  words [test 글]               금칙어 개수와 관리자가 더한 낱말 / 그 글이 어떻게 펴지고 가려지는지
  words add|del 낱말…           관리자 금칙어를 더하거나 뺀다 (DB에 남아 다시 켜도 걸린다)
  age 이름 [reset]              그 사람의 연령 답과 제한 모드 / 답을 지워 다시 묻는다 (AGE를 적은 게임)
  blocks 이름                   그 사람이 차단한 사람 (신고 처리 때 확인)
확률과 재화의 투명성 (odds 모듈을 고른 게임):
  odds                         공개하는 확률표와 버전
  odds show 표                  표 하나의 단계별 확률 (표: enhance, banner:배너 id, 게임이 준 표)
  odds log [표] [수]             표의 변경 이력 (시각·버전·까닭)
  odds check                   지금의 표를 견주어 바뀐 표의 버전을 올린다 (서버가 10초마다 한다)
  odds plan 표 시각 --ko 글 [--en 글]   사전 공지 (공개 페이지에 '언제부터 무엇이 바뀐다'). 바꾸는 일은 그때 set으로
  odds plans | odds plan cancel|done 번호   사전 공지 목록 / 거두기·끝냄
  odds publish                 공개 페이지(odds.json·odds.html)를 지금 다시 쓴다
  draws [이름|키앞] [--table 표] [--n 수] [--since 시각]   추첨 기록 (사람·시각·표와 버전·결과·치른 것)
  draws stats 표 [--since 시각]   그 표의 단계별로 실제로 나온 비율과 표의 확률
운영 도구와 고객지원:
  ui [view|ops|full]           웹 관리 화면의 주소 (이 PC의 브라우저에서 연다. 토큰은 주소의 # 뒤에: 서버로 가지 않는다). 기본 ops
  stats [daily|retention|funnel 사건,사건,…] [--days n]   분석 사건의 집계 (일별 활성, D1·D7·D30 잔존, 퍼널)
  ledger [일수] [이름]          장부: 통로 밖의 재화 변화(other·tick)가 누구에게서 났는가와 날짜별 줄
  suspects [수]                봇·매크로 의심 점수 (보기만 한다)
  alerts [test]                경보 규칙과 상태 / 웹훅에 시험 알림 (ALERT_WEBHOOK을 준 서버만 보낸다)
  mail 이름|--all [--days n] [--lv a-b] [--expire 일] [--gold n] [--sparks n] [--exp n] [--item id:n]   운영 보상 우편 (--all 전체, --days·--lv 조건부, --expire n일 뒤 사라짐)
  rollback list 이름 | preview 이름 백업|latest | apply 이름 백업 확인코드 | stash 이름 | undo 이름 보관번호 확인코드
                               계정 단위 롤백 (자동 백업에서 그 사람만. 미리보기 → 확인 코드 → 실행)
  tickets [open|answered|closed|all] [수] | ticket 번호 | answer 번호 답글 | tclose 번호 [메모] | treopen 번호   문의 (support 모듈)
  metrics                      지표 값 (/metrics와 같은 것)
라이브 콘텐츠 (묶음 6: event·season·coupon 모듈, 상품 GOODS):
  events                       기간 이벤트(열림·예정·끝, 기간)와 상품(한정·남은 수량). 기간은 원격 설정으로: set EVENTS.<id>.to <UTC ms>
  season                       지금 시즌(열쇠·몇째·끝나는 때)과 보상 트랙
  coupon [list] | show 코드      쿠폰 목록과 쓰인 수
  coupon add 코드 [--gold n] [--sparks n] [--exp n] [--item id:n] [--uses n] [--from 시각] [--to 시각 | --for 기간] [--note 글]
                               쿠폰을 만든다 (영문 대문자·숫자, 금칙어 안 됨, 사람마다 한 번, 보상은 우편으로)
  coupon del 코드               쿠폰을 지운다 (쓴 기록은 남는다)
역할: admin.token(전체), admin-ops.token(운영), admin-view.token(보기 전용). CLI는 전체 토큰을 쓴다. ADMIN_TOKEN_FILE로 다른 토큰을 줄 수 있다`;

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
// 웹 관리 화면의 주소: 서버에 묻지 않고 토큰 파일을 읽어 찍는다 (토큰은 # 뒤: 브라우저가 서버로 보내지 않는다)
if (cmd === 'ui') {
  const role = ['view', 'ops', 'full'].includes(args[0]) ? args[0] : 'ops';
  const file = role === 'full' ? tokenFile : path.join(path.dirname(tokenFile), `admin-${role}.token`);
  let t;
  try { t = fs.readFileSync(file, 'utf8').trim(); } catch { fail(`토큰 파일이 없습니다: ${file} (서버가 운영 도구가 든 판인지 보세요)`); }
  console.log(`http://127.0.0.1:${port}/admin/ui#t=${t}
이 PC의 브라우저에서만 열립니다 (역할: ${role}). 서버를 다시 켜면 토큰이 바뀝니다.`);
  process.exit(0);
}
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
