// 플랫폼 분리 1단계 (docs/platforms.md 4절): 화면이 브라우저를 직접 부르던 곳을 플랫폼 접점 뒤로 옮긴 것과, 서버의 새 칸.
//   1. 접점의 새 칸 (input, notify, purchase, achievements, cloud, display.viewport, app.param·setParam·anchor·language): 시험용 구현의 모양과 웹 기본값
//   2. 키 이름(ev.code 기준): 지금 단축키 표의 이름(ev.key.toLowerCase())과 같은 모양, 한글 입력 상태에서도 같은 이름
//   3. 저장 키 이름이 예전 그대로다 (기존 사용자의 토큰·언어·소리가 이어진다)
//   4. 프로토콜 호환: protocolFits, 서버의 protocolMin(welcome.min, join.v → update + 4006)
//   5. 서버의 정적 파일 끄기(staticDir: null)와 Origin 허용 목록
//   6. 2단계(데스크톱 시제품): 게임패드의 셈(가짜 패드), 단축키의 키 이름(ev.code), 예전 키 설정과의 호환
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { PROTOCOL, protocolFits, type ServerMsg } from '../../shared/protocol';
import { startServer } from '../../server/net/server';
import { CLOSE } from '../../server/net/admin';
import { originAllowed, originMatches } from '../../server/net/origin';
import { guestAuth, keyNameOf, memoryPlatform, setPlatform, type Feature } from '../../client/platform';
import { check, removeTemp } from '../harness';

const root = path.resolve(import.meta.dirname, '../../..');
const src = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

// ---------- 1. 접점의 새 칸 ----------
{
  const p = memoryPlatform();
  setPlatform(p);
  check(p.input.primary() === 'mouse' && p.input.gamepad() === null, '시험용 구현: 주 입력 장치는 mouse, 패드 없음');
  const seen: string[] = [];
  const off = p.input.onChange((k) => seen.push(k));
  p.setInput('touch'); p.setInput('touch'); p.setInput('gamepad');
  off(); p.setInput('mouse');
  check(seen.join() === 'touch,gamepad' && p.input.primary() === 'mouse', `주 입력 장치가 바뀔 때만 알린다, 그만 들으면 오지 않는다 (${seen.join()})`);
  p.params.set('auto', '시험이름'); p.app.setParam('lang', 'en');
  check(p.app.param('auto') === '시험이름' && p.app.param('lang') === 'en' && p.app.param('없음') === null && p.app.anchor() === '', '시작할 때 받은 값(param)과 바꿔 두기(setParam), 자리 표시(anchor)');
  p.lang = 'ko-KR'; p.size = { w: 390, h: 844 };
  check(p.app.language() === 'ko-KR' && p.display.viewport().w === 390 && p.display.viewport().h === 844, '기기 언어와 화면 크기는 플랫폼이 준다');
  let ok = true;
  ok &&= (await p.notify.permission()) === 'denied' && (await p.notify.register()) === null && (await p.notify.local(Date.now() + 1000, '끝', '본문')) === false;
  ok &&= (await p.purchase.products(['gem'])).length === 0 && 'error' in (await p.purchase.buy('gem'));
  ok &&= (await p.achievements.unlock('first')) === false && (await p.cloud.get('k')) === null && (await p.cloud.set('k', 'v')) === false;
  check(ok && p.did.includes('notify:끝') && p.did.includes('achievement:first'), '알림·결제·업적·클라우드: 없는 구현은 throw하지 않고 false·null·빈 목록으로 알린다');
  // 웹 기본 구현이 '없다'고 하는 칸: 그 단추를 그리지 않게 (web.ts의 has와 같은 목록인지 글자로 본다)
  const web = src('engine/client/platform/web.ts');
  const offWeb: Feature[] = ['notify.local', 'notify.push', 'purchase', 'achievements', 'cloudSave'];
  check(offWeb.every((f) => new RegExp(`case '${f.replace('.', '\\.')}':[^\\n]*return false`).test(web)), `웹 기본 구현에서 ${offWeb.join(', ')}는 has()가 false`);
  check(/requireUpdate: \(\) => location\.reload\(\)/.test(web), '웹의 업데이트는 새로고침이다 (예전 main.ts의 location.reload와 같다)');
  p.app.requireUpdate('https://store.example/app');
  check(p.did.includes('update:https://store.example/app'), '업데이트할 곳(스토어 주소)이 플랫폼에 간다');
}

// ---------- 2. 키 이름 ----------
{
  const cases: [string, string, string][] = [
    ['KeyW', 'w', 'w'], ['KeyW', 'ㅈ', 'w'], ['KeyW', 'Process', 'w'], ['KeyA', 'A', 'a'], ['Digit1', '1', '1'], ['Digit1', '!', '1'], ['Numpad3', '3', '3'],
    ['Space', ' ', ' '], ['Escape', 'Escape', 'escape'], ['Enter', 'Enter', 'enter'], ['Tab', 'Tab', 'tab'], ['ArrowUp', 'ArrowUp', 'arrowup'], ['F1', 'F1', 'f1'],
    ['Minus', '-', '-'], ['BracketLeft', '[', '['], ['Backslash', '\\', '\\'], ['ShiftLeft', 'Shift', 'shift'], ['', 'm', 'm'], ['IntlRo', 'ろ', 'ろ'],
  ];
  const bad = cases.filter(([code, key, want]) => keyNameOf({ code, key }) !== want).map(([code, key, want]) => `${code}/${key} → ${keyNameOf({ code, key })} (기대 ${want})`);
  check(bad.length === 0, `키 이름은 자판의 자리(ev.code)로: 한글 입력 상태('ㅈ', 'Process')에서도 W는 'w', 모르는 자리는 예전처럼 key의 소문자${bad.length ? ': ' + bad.join('; ') : ''}`);
  // 지금 단축키 표(engine/client/keys.ts)의 이름 모양과 같다: 미국 자판에서 ev.key.toLowerCase()와 keyName이 같은 값
  const us: [string, string][] = [['KeyQ', 'q'], ['KeyE', 'e'], ['KeyR', 'r'], ['KeyM', 'm'], ['KeyB', 'b'], ['KeyI', 'i'], ['Digit5', '5'], ['Escape', 'Escape'], ['Tab', 'Tab'], ['Space', ' ']];
  check(us.every(([code, key]) => keyNameOf({ code, key }) === key.toLowerCase()), '미국 자판에서는 예전 이름(ev.key.toLowerCase())과 같다: 2단계에서 단축키를 바꿀 때 표를 고치지 않는다');
  check(memoryPlatform().input.keyName({ code: 'KeyD', key: 'ㅇ' }) === 'd', '플랫폼의 input.keyName이 같은 함수다');
}

// ---------- 3. 저장 키 이름 ----------
{
  // 키 이름이 바뀌면 기존 사용자의 진행(토큰)·언어·소리 설정을 잃는다: 옮긴 뒤에도 같은 이름을 쓰는지 소스에서 본다
  const keys: [string, RegExp, string][] = [
    ['engine/client/platform/auth.ts', /guestAuth\(key = 'token'\)/, "기기 토큰 'token' (비밀 저장, 웹은 localStorage)"],
    ['engine/client/i18n/index.ts', /storage\.get\('lang'\)[\s\S]*storage\.set\('lang', code\)/, "언어 'lang'"],
    ['games/deungbul/client/guide/main.ts', /storage\.get\('lang'\)/, "도감도 같은 'lang'"],
    ['engine/client/sound.ts', /storage\.get\('sound'\)[\s\S]*MIX_KEY = 'soundMix'|MIX_KEY = 'soundMix'[\s\S]*storage\.get\('sound'\)/, "소리 'sound', 음량 'soundMix'"],
    ['engine/client/social.ts', /KEY = 'blocked'/, "차단 'blocked' (묶음 3이 서버로 옮긴다)"],
  ];
  const miss = keys.filter(([f, re]) => !fs.existsSync(path.join(root, f)) || !re.test(src(f)));
  check(miss.length === 0, `저장 키 이름이 예전 그대로다: ${keys.map((k) => k[2]).join(', ')}${miss.length ? ' — 다른 곳: ' + miss.map((m) => m[0]).join(', ') : ''}`);
  const p = memoryPlatform();
  setPlatform(p);
  const t1 = await guestAuth().token();
  const t2 = await guestAuth().token();
  check(!!t1 && t1 === t2 && p.data.get('secret:token') === t1, '손님 토큰은 비밀 저장의 token 칸에 한 번 만들어 두고 다음부터 그것을 쓴다 (같은 캐릭터)');
}

// ---------- 4. 프로토콜 호환 ----------
{
  check(protocolFits(3, 3) && !protocolFits(2, 3) && !protocolFits(4, 3), 'protocolFits: 범위를 알리지 않으면 같은 번호만 (예전과 같다)');
  check(protocolFits(2, 3, 2) && protocolFits(3, 3, 2) && !protocolFits(1, 3, 2) && !protocolFits(4, 3, 2), 'protocolFits: 범위 min ~ 서버 번호 안의 옛 화면은 맞다, 밖은 맞지 않다');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-platform-'));
  /** 접속해서 join을 보내고, 받은 메시지와 닫힘 코드 */
  const talk = (port: number, join: Record<string, unknown>, headers?: Record<string, string>) => new Promise<{ msgs: ServerMsg[]; code: number; raw: string[] }>((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    const msgs: ServerMsg[] = [], raw: string[] = [];
    let timer: NodeJS.Timeout | undefined;
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'join', ...join })); timer = setTimeout(() => ws.close(), 600); });
    ws.on('message', (d) => { raw.push(String(d)); msgs.push(JSON.parse(String(d)) as ServerMsg); });
    ws.on('close', (code) => { clearTimeout(timer); done({ msgs, code, raw }); });
    ws.on('error', () => { clearTimeout(timer); done({ msgs, code: -1, raw }); });
  });
  const welcomeOf = (r: { msgs: ServerMsg[] }) => r.msgs.find((m): m is Extract<ServerMsg, { t: 'welcome' }> => m.t === 'welcome');

  // 기본: 예전과 같다 (welcome에 min이 없다, v를 실어도 같은 번호면 들어간다, 다른 번호면 update)
  const s1 = await startServer(0, { staticDir: path.join(dir, 'none'), backup: false });
  const plain = await talk(s1.port, { name: '웹', token: 'platform-web-0001' });
  const w1 = welcomeOf(plain);
  check(!!w1 && w1.v === PROTOCOL && !('min' in w1) && /^\{"t":"welcome","id":\d+,"name":"웹","x":[-\d.]+,"z":[-\d.]+,"v":3\}$/.test(plain.raw.find((r) => r.includes('"welcome"')) ?? ''), `기본: welcome의 모양이 예전과 같다 (min 칸 없음: ${plain.raw.find((r) => r.includes('"welcome"'))})`);
  const same = await talk(s1.port, { name: '앱', token: 'platform-app-0001', v: PROTOCOL });
  check(!!welcomeOf(same), '앱이 같은 번호를 실으면 들어간다');
  const old = await talk(s1.port, { name: '옛앱', token: 'platform-app-0002', v: PROTOCOL - 1 });
  const up = old.msgs.find((m) => m.t === 'update');
  check(!welcomeOf(old) && !!up && up.t === 'update' && up.min === PROTOCOL && up.max === PROTOCOL && !('store' in up) && old.code === CLOSE.update && CLOSE.update === 4006, `기본: 옛 번호를 실은 앱은 들어가지 못하고 update(min=max=${PROTOCOL})와 닫힘 4006 (${old.code})`);
  await s1.close();

  // 호환 범위: protocolMin을 낮추면 옛 번호도 들어가고, welcome이 min을 알린다. 더 옛 것은 update + 스토어 주소
  const s2 = await startServer(0, { staticDir: path.join(dir, 'none'), backup: false, protocolMin: PROTOCOL - 1, storeUrl: 'https://store.example/lampkeeper' });
  const inRange = await talk(s2.port, { name: '옛앱', token: 'platform-app-0003', v: PROTOCOL - 1 });
  const w2 = welcomeOf(inRange);
  check(!!w2 && w2.min === PROTOCOL - 1 && w2.v === PROTOCOL && protocolFits(PROTOCOL - 1, w2.v, w2.min), `호환 범위 안의 옛 앱은 들어가고 welcome이 범위를 알린다 (min ${w2?.min}, v ${w2?.v})`);
  const tooOld = await talk(s2.port, { name: '아주옛', token: 'platform-app-0004', v: PROTOCOL - 2 });
  const up2 = tooOld.msgs.find((m) => m.t === 'update');
  check(!!up2 && up2.t === 'update' && up2.min === PROTOCOL - 1 && up2.store === 'https://store.example/lampkeeper' && tooOld.code === 4006, '범위 밖은 update에 범위와 스토어 주소를 싣고 닫는다');
  const webOld = await talk(s2.port, { name: '웹2', token: 'platform-web-0002' });
  check(!!welcomeOf(webOld), '번호를 싣지 않는 화면(웹)은 예전처럼 들어간다 (화면이 welcome의 v·min으로 스스로 판단한다)');
  await s2.close();
  removeTemp(dir);
}

// ---------- 5. 정적 파일 끄기와 Origin ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-platform2-'));
  fs.mkdirSync(path.join(dir, 'dist'));
  fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>t</title>');
  const s = await startServer(0, { staticDir: null, backup: false });
  const page = await fetch(`http://127.0.0.1:${s.port}/`);
  const health = await fetch(`http://127.0.0.1:${s.port}/healthz`);
  const ws = await new Promise<boolean>((done) => { const w = new WebSocket(`ws://127.0.0.1:${s.port}`); w.on('open', () => { w.close(); done(true); }); w.on('error', () => done(false)); });
  check(page.status === 404 && health.status !== 404 && ws, `staticDir: null이면 화면 파일을 내보내지 않는다 (/ → ${page.status}), /healthz(${health.status})와 WebSocket은 그대로`);
  await s.close();
  const s0 = await startServer(0, { staticDir: path.join(dir, 'dist'), backup: false });
  const page0 = await fetch(`http://127.0.0.1:${s0.port}/`);
  check(page0.status === 200 && (await page0.text()).includes('<title>t</title>'), '주면 예전처럼 화면 파일을 내보낸다 (기본: 한 몸)');
  await s0.close();

  check(originMatches('https://Game.Example', 'https://game.example') && originMatches('http://localhost:5173', 'http://localhost:*') && originMatches('http://localhost', 'http://localhost:*') && !originMatches('http://localhost.evil:80', 'http://localhost:*') && !originMatches('http://evil.example', 'https://game.example'), 'Origin 한 줄: 대소문자 무시, 포트 자리의 *는 숫자 포트만');
  check(originAllowed('http://evil.example') && originAllowed(undefined), '목록이 없으면 검사하지 않는다 (예전과 같다)');
  check(originAllowed(undefined, { list: ['https://a'] }) && !originAllowed(undefined, { list: ['https://a'], allowNone: false }) && !originAllowed('null', { list: ['https://a'] }) && originAllowed('capacitor://localhost', { list: ['https://a', 'capacitor://localhost'] }), "출처 없는 연결은 allowNone(기본 받음), 'null'은 값이라 목록에 있어야 받는다, 앱의 출처도 목록으로");
  const s3 = await startServer(0, { staticDir: null, backup: false, origins: { list: ['https://game.example', 'http://localhost:*'] } });
  const tryOrigin = (origin?: string) => new Promise<boolean>((done) => { const w = new WebSocket(`ws://127.0.0.1:${s3.port}`, origin ? { origin } : {}); w.on('open', () => { w.close(); done(true); }); w.on('error', () => done(false)); });
  const got = [await tryOrigin('https://game.example'), await tryOrigin('http://localhost:5173'), await tryOrigin('https://evil.example'), await tryOrigin()];
  check(got.join() === 'true,true,false,true', `목록을 주면 그 출처만 받는다 (게임, 개발 서버, 남의 페이지, 출처 없음 → ${got.join()})`);
  await s3.close();
  removeTemp(dir);
}

// ---------- 6. 2단계: 게임패드의 셈, 키 이름(ev.code)으로 바꾼 단축키, 예전 키 설정 ----------
{
  const { padFieldActions, padMove, padUiSteps, PAD } = await import('../../client/padcalc');
  const { readSettings } = await import('../../client/hud/settingscalc');
  const { legacyKeyName } = await import('../../client/platform/keyname');
  // 가짜 패드: 실제 패드 없이 표준 배치의 단추 번호로
  const pad = (x: number, z: number, ...down: number[]) => ({ x, z, buttons: Array.from({ length: 17 }, (_, i) => down.includes(i)) });
  const idle = pad(0, 0);
  const m = padMove(pad(0, 0, PAD.UP, PAD.RIGHT)), m2 = padMove(pad(0.5, -0.2, PAD.DOWN));
  check(Math.abs(m.x - Math.SQRT1_2) < 1e-9 && Math.abs(m.z + Math.SQRT1_2) < 1e-9 && m2.x === 0.5 && m2.z === -0.2, `이동: 막대가 서 있으면 십자 키(대각선은 길이 1), 막대를 기울이면 막대 (${JSON.stringify(m)}, ${JSON.stringify(m2)})`);
  const acts = padFieldActions(idle, pad(0, 0, PAD.A, PAD.RB, PAD.RT, PAD.START));
  check(acts.join() === '1,q,r,m' && padFieldActions(pad(0, 0, PAD.A), pad(0, 0, PAD.A)).length === 0, `들판: 새로 눌린 단추만 기능으로 (A 기술 1, RB 물약, Start 메뉴, RT 자동 사냥 → ${acts.join()}), 누르고 있는 단추는 되풀이하지 않는다`);
  const ui = [...padUiSteps(idle, pad(0, 0, PAD.DOWN, PAD.A, PAD.B)), ...padUiSteps(idle, pad(0, -0.9)), ...padUiSteps(pad(0, -0.9), pad(0, -0.95))];
  check(ui.join() === 'press,back,next,prev', `창: 십자 키 아래는 다음, A 누름, B 닫기, 막대는 넘긴 순간 한 번 (${ui.join()})`);
  // 한글 입력 상태에서 고른 예전 키 설정(ev.key의 'ㅏ')은 그 자리의 글자로, 입력기가 가로챈 'process'는 버린다. 영문 설정은 그대로
  const s = readSettings(JSON.stringify({ keys: { m: 'ㅏ', b: 'process', q: 'e', tab: 'f' } }));
  check(JSON.stringify(s.keys) === '{"m":"k","q":"e","tab":"f"}' && legacyKeyName('ㅃ') === 'q' && legacyKeyName('f1') === 'f1', `저장된 키 설정과 호환: 한글 자모는 그 자리의 글자, 영문은 그대로 (${JSON.stringify(s.keys)})`);
  // 단축키·이동 키·키 재설정·튜토리얼은 키 이름을 platform().input.keyName(ev.code 기준)으로 만든다: ev.key로 되돌아가지 않게
  const usesKey = ['engine/client/input.ts', 'engine/client/hud/settings.ts', 'engine/client/hud/tutorial.ts'].filter((f) => /ev\.key\b|\(e\.key\)|e\.key\.toLowerCase/.test(src(f).replace(/\/\/.*$/gm, '')));
  check(usesKey.length === 0, `단축키는 자판의 자리(ev.code)로 이름을 만든다 (ev.key를 쓰는 곳: ${usesKey.join(', ') || '없음'})`);
}
