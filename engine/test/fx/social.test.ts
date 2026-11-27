// 사회와 안전 (docs/genre-features.md 5.3): 금칙어 정규화(engine/shared/textfilter.ts)와 서버 쪽(engine/server/net/social.ts)을 소켓 클라이언트 여럿으로.
//   금칙어: 우회 표기(띄어쓰기·특수문자·자모 분리·전각·늘인 소리·되풀이·숫자/기호 치환·영문 자판·닮은꼴)를 막고, 보통 말(시 발표, 조직, 깃발, 밥상 …)은 막지 않는다. 무작위 변형 퍼징
//   귓말·근처·파티 채널, 정해진 문장, 도배 막기(통·같은 말), 차단(대화·귓말·친구 요청·파티 초대가 오지 않음, 다시 접속해도 남음), 옛 차단 목록 옮기기,
//   친구(요청·수락·목록·접속 표시·끊기), 제한 모드(자유 대화 막힘, 정해진 문장은 됨, 귓말·친구 요청 받지 않음, 막는 명령, 한 번만 답함),
//   신고의 문맥(앞뒤 줄, 본 줄만), 관리자 명령(words, age, blocks, report), SQLite 표(스키마 4)와 삭제
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RPG_MODULES } from '../../shared/modules';
import { BASIC_QUICK_CHAT, TALK_VIEW, type FriendView } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { addBannedWords, filterKey, isClean, mask } from '../../shared/textfilter';
import { startServer } from '../../server/net/server';
import { MemoryStore, SqliteStore } from '../../server/store';
import { SCHEMA } from '../../server/store/sqlite';
import { check, connect, removeTemp, settle, until, type Peer } from '../harness';

// ---------- 금칙어 정규화 ----------
{
  const bad = ['씨발', '씨 발', '씨.발', '씨1발', '씨이발', 'ㅅㅣㅂㅏㄹ', 'ㅆ ㅣ ㅂ ㅏ ㄹ', 'ㅅㅂ', 'tlqkf', 'qudtls', 'fuck', 'ｆｕｃｋ', 'f u c k', 'fu ck', 'f.u.c.k', 'fuuuuck', 'sh1t', 'a$$hole', 'fück', 'ѕhit', '씨​발', 'FUCK'];
  const good = ['혹시?발견했어', '즉시-발송', '택시2발', 'this hit hard', '시 발표', '다시 발사', 'ㅋㅋㅋㅋ ㅠㅠ', '조직', '깃발', '밥상', '옷방', '없습니다', '시발점에서 만나', 'Niger', 'class pass', '18레벨 달성', '안녕하세요'];
  const badMissed = bad.filter((s) => isClean(s, 'chat'));
  const goodHit = good.filter((s) => !isClean(s, 'chat'));
  check(!badMissed.length, `우회 표기(띄어쓰기·특수문자·자모 분리·전각·늘인 소리·되풀이·숫자/기호 치환·영문 자판·닮은꼴)를 막는다 (놓친 것: ${badMissed.join(', ') || '없음'})`);
  check(!goodHit.length, `보통 말은 막지 않는다: 낱말 사이에 걸친 것, 음절 경계, 받침과 다음 초성, 허용 낱말 (잘못 막은 것: ${goodHit.join(', ') || '없음'})`);
  check(mask('씨 발 뭐야') === '*** 뭐야' && mask('혹시?발견') === '혹시?발견' && mask('ㅆ ㅣ ㅂ ㅏ ㄹ') === '*********', `가리기는 걸린 원문 자리만 별표로 (${mask('씨 발 뭐야')})`);
  check(!isClean('this hit') && isClean('this hit', 'chat'), '이름(엄격함)은 낱말 경계를 보지 않고, 대화(느슨함)는 본다');
  check(filterKey('씨이발') === 'ㅆㅣㅂㅏㄹ' && filterKey('Ｆü ck') === 'fu|ck', `편 모양 (${filterKey('씨이발')}, ${filterKey('Ｆü ck')})`);
  addBannedWords(['뽀로롱']);
  check(!isClean('뽀 로 롱', 'chat') && !isClean('ㅃㅗ로롱', 'chat'), '게임이 더한 낱말도 같은 정규화로 막는다');
  // 무작위 변형 퍼징 (씨앗을 정한 난수): 금칙어를 우회 표기로 바꾼 것은 모두 걸리고, 보통 문장은 걸리지 않고, 예외가 없다
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const SEP = [' ', '.', '_', '-', '*', '1', '~', '  ', '·'];
  const vary = (w: string): string => [...w].map((ch, i) => (i && rnd() < 0.5 ? pick(SEP) : '') + (rnd() < 0.3 ? ch.repeat(2) : ch)).join('');
  let missed = 0, thrown = 0, n = 0;
  for (let i = 0; i < 2000; i++) {
    const w = pick(['씨발', '병신', '개새끼', 'fuck', 'shit', 'bitch']);
    try { const v = vary(w); if (isClean(v, 'chat') || isClean(v, 'name')) missed++; } catch { thrown++; }
    n++;
  }
  check(missed === 0 && thrown === 0, `퍼징: 금칙어의 변형 ${n}개가 모두 걸린다 (놓침 ${missed}, 예외 ${thrown})`);
}

// ---------- 서버: 소켓 클라이언트 여럿 ----------
let t = Date.UTC(2026, 10, 27, 12, 0, 0);
const now = () => t;
const tick = (ms = 1000) => { t += ms; };
const store = new MemoryStore();
TALK_VIEW.quick = [...BASIC_QUICK_CHAT];
const server = await startServer(0, { store, now, game: { now, modules: [...RPG_MODULES, 'chat', 'friends'] }, backup: false });
const port = server.port;
/** 사람마다 받은 메시지 전부 */
const got = new Map<Peer, ServerMsg[]>();
const join = async (name: string, token: string): Promise<Peer> => {
  const early: ServerMsg[] = [];
  const p = await connect(port, name + '0', token, (m) => early.push(m));
  const list: ServerMsg[] = [...early];
  got.set(p, list);
  p.ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; if (!early.includes(m)) list.push(m); });
  // 이름을 지으면 저장된다 (이름으로 찾는 귓말·친구 요청이 저장된 캐릭터를 본다)
  p.send({ t: 'rename', name }); await settle(p); tick(6000);
  return p;
};
const chats = (p: Peer) => (got.get(p) ?? []).filter((m): m is Extract<ServerMsg, { t: 'chat' }> => m.t === 'chat');
const last = <K extends ServerMsg['t']>(p: Peer, k: K) => [...(got.get(p) ?? [])].reverse().find((m) => m.t === k) as Extract<ServerMsg, { t: K }> | undefined;
const say = async (p: Peer, m: Record<string, unknown>) => { tick(1000); p.send({ t: 'chat', text: '', ...m } as never); await settle(p); };

const a = await join('Alice', 'tok-alice-0123456789abcdef'), b = await join('Bobby', 'tok-bobby-0123456789abcdef'), c = await join('Carol', 'tok-carol-0123456789abcdef');
const nameOf = (p: Peer) => server.game.ents.get(p.id)?.name;
check(nameOf(a) === 'Alice' && nameOf(b) === 'Bobby' && nameOf(c) === 'Carol', '셋이 들어오고 이름을 지어 저장된다');
const talkA = last(a, 'talk');
check(!!talkA && !talkA.s.limited && !talkA.s.ask, `대화 상태가 온다 (chat·friends 모듈): 연령을 묻지 않는 게임은 제한 모드가 아니다 (${JSON.stringify(talkA?.s)})`);

// 귓말
await say(a, { text: '비밀 얘기', ch: 'w', to: 'bobby' });
await settle(b); await settle(c);
const wb = chats(b).find((m) => m.ch === 'w'), wa = chats(a).find((m) => m.ch === 'w');
check(!!wb && wb.name === 'Alice' && wb.text === '비밀 얘기' && typeof wb.n === 'number' && !chats(c).some((m) => m.ch === 'w'), '귓말은 받는 사람에게만 (이름은 대소문자 무시)');
check(!!wa && wa.to === 'Bobby', '보낸 사람에게는 누구에게 보냈는지와 함께 돌아온다');
await say(a, { text: '거기 있어?', ch: 'w', to: '없는사람' });
check(a.sys.includes('whisperNoOne:없는사람'), '없는 이름에는 whisperNoOne');
// 근처·파티
await say(a, { text: '근처 사람들', ch: 'n' });
await settle(c);
check(chats(c).some((m) => m.ch === 'n' && m.text === '근처 사람들'), '근처 채널: 곁에 있는 사람이 받는다');
await say(a, { text: '파티?', ch: 'p' });
check(a.sys.includes('chatNoParty'), '파티가 없으면 파티 대화는 chatNoParty');
// 정해진 문장
await say(c, { q: 'qcHello' });
await settle(a);
const qa = chats(a).find((m) => m.q === 'qcHello');
check(!!qa && qa.text === '' && qa.name === 'Carol', '정해진 문장은 키로 간다 (받는 화면이 자기 언어로 읽는다)');
await say(c, { q: 'notAPhrase' });
await settle(a);
check(!chats(a).some((m) => m.q === 'notAPhrase'), 'QUICK_CHAT에 없는 키는 보내지 않는다');

// 도배 막기: 같은 말, 통
await say(b, { text: '같은 말' });
await say(b, { text: '같은 말' });
check(b.sys.includes('chatSame'), `같은 말을 20초 안에 되풀이하면 chatSame (${b.sys.slice(-3)})`);
tick(30_000);
let waits = 0;
for (let i = 0; i < 10; i++) { tick(-200); await say(b, { text: `말 ${i}` }); }
waits = b.sys.filter((s) => s === 'chatWait').length;
check(waits >= 2, `빠르게 이어 보내면 통이 비어 chatWait (${waits}번)`);
tick(60_000);

// 차단: 대화·귓말·친구 요청·파티 초대가 오지 않는다
b.send({ t: 'block', a: 'add', id: a.id });
await settle(b);
const bl = last(b, 'blocks');
check(b.sys.includes('blockedOn:Alice') && bl?.list.length === 1 && bl.list[0].name === 'Alice' && bl.list[0].id === a.id && !('key' in bl.list[0]), '차단하면 알리고 목록이 온다 (저장 키는 보내지 않는다)');
const bBefore = chats(b).length, cBefore = chats(c).length;
await say(a, { text: '다들 안녕' });
await settle(b); await settle(c);
check(chats(c).length === cBefore + 1 && chats(b).length === bBefore, '차단한 사람의 전체 대화는 오지 않는다 (다른 사람에게는 간다)');
await say(a, { text: '귓말이야', ch: 'w', to: 'Bobby' });
await settle(b);
check(a.sys.includes('whisperNo:Bobby') && chats(b).length === bBefore, '차단한 사람의 귓말은 오지 않고, 보낸 사람은 "귓말을 받지 않는다"를 본다 (차단을 알리지 않는다)');
a.send({ t: 'friend', a: 'ask', id: b.id }); await settle(a); await settle(b);
check(a.sys.includes('friendAsked:Bobby') && !b.sys.some((s) => s.startsWith('friendAskIn')) && store.friendsOf(store.keyOfName('Alice')!).length === 0, '차단한 사람의 친구 요청은 오지 않는다 (보낸 사람에게는 보낸 것처럼)');
tick(10_000);
a.send({ t: 'party', a: 'invite', id: b.id }); await settle(a, 2); await settle(b);
check(a.sys.includes('partyBusy:Bobby') && !(got.get(b) ?? []).some((m) => m.t === 'pinv'), '차단한 사람의 파티 초대는 오지 않는다');
// 다시 접속해도 남는다 (서버 저장)
b.ws.close();
await until(() => !server.game.ents.has(b.id));
const b2 = await join('Bobby', 'tok-bobby-0123456789abcdef');
const bl2 = last(b2, 'blocks');
check(bl2?.list.some((x) => x.name === 'Alice') === true, '다시 접속해도 차단이 남는다 (저장 키 기준: 이름을 바꿔도 풀리지 않는다)');
a.send({ t: 'rename', name: 'Alicia' }); await settle(a); tick(6000);
const bc = chats(b2).length;
await say(a, { text: '이름 바꿨어' });
await settle(b2);
check(chats(b2).length === bc, '이름을 바꿔도 차단은 그대로다');
b2.send({ t: 'block', a: 'del', r: bl2!.list[0].r }); await settle(b2);
check(b2.sys.includes('blockedOff:Alicia') && last(b2, 'blocks')?.list.length === 0, '목록의 표로 푼다');

// 옛 차단 목록 옮기기 (브라우저에 이름으로 남아 있던 것)
b2.send({ t: 'block', a: 'import', names: ['Carol', '없는이름', 'Bobby'] }); await settle(b2);
const imp = last(b2, 'blocks');
check(imp?.imported === 1 && imp.list.length === 1 && imp.list[0].name === 'Carol', `옛 목록의 이름을 저장 키로 옮긴다 (찾은 사람만, 자기 자신은 빼고: ${imp?.imported})`);
b2.send({ t: 'block', a: 'del', r: imp!.list[0].r }); await settle(b2);

// 친구
tick(10_000);
a.send({ t: 'friend', a: 'ask', name: 'carol' }); await settle(a); await settle(c);
const fc = last(c, 'friends');
check(a.sys.includes('friendAsked:Carol') && c.sys.includes('friendAskIn:Alicia') && fc?.list.length === 1 && fc.list[0].st === 'in', '이름으로 친구 요청: 받은 사람에게 알림과 목록 (in)');
c.send({ t: 'friend', a: 'accept', r: fc!.list[0].r }); await settle(c); await settle(a);
const fa = last(a, 'friends')?.list.find((f) => f.name === 'Carol') as FriendView | undefined;
check(c.sys.includes('friendNew:Alicia') && a.sys.includes('friendNew:Carol') && fa?.st === 'ok' && fa.id === c.id && fa.ch === 1, `수락하면 둘 다 친구가 되고, 접속 중인 친구는 엔티티와 채널이 보인다 (${JSON.stringify(fa)})`);
tick(10_000);
a.send({ t: 'friend', a: 'ask', id: c.id }); await settle(a);
check(a.sys.includes('friendAlready:Carol'), '이미 친구면 friendAlready');
c.ws.close();
await until(() => !server.game.ents.has(c.id));
await until(() => last(a, 'friends')?.list.find((f) => f.name === 'Carol')?.id === undefined);
const off = last(a, 'friends')?.list.find((f) => f.name === 'Carol');
check(off?.id === undefined && typeof off?.seen === 'number', '친구가 나가면 목록이 다시 와서 마지막 접속이 보인다');
await say(a, { text: '자니?', ch: 'w', to: 'Carol' });
check(a.sys.includes('whisperOffline:Carol'), '접속하지 않은 사람에게 귓말하면 whisperOffline');
a.send({ t: 'friend', a: 'del', r: off!.r }); await settle(a);
check(a.sys.includes('friendRemoved:Carol') && last(a, 'friends')?.list.length === 0, '친구를 끊는다');
// 받기 끄기
b2.send({ t: 'talk', a: 'prefs', noWhisper: true, noFriend: true }); await settle(b2);
check(last(b2, 'talk')?.s.noWhisper === true && last(b2, 'talk')?.s.noFriend === true, '귓말·친구 요청 받기를 끈다 (설정)');
await say(a, { text: '들려?', ch: 'w', to: 'Bobby' });
tick(10_000);
a.send({ t: 'friend', a: 'ask', id: b2.id }); await settle(a);
check(a.sys.filter((s) => s === 'whisperNo:Bobby').length === 2 && a.sys.includes('friendNo:Bobby'), '귓말을 끈 사람에게는 whisperNo, 친구 요청을 끈 사람에게는 friendNo');
b2.send({ t: 'talk', a: 'prefs', noWhisper: false, noFriend: false }); await settle(b2);

// 신고의 문맥: 대화 줄을 골라 신고하면 앞뒤 줄이 붙는다 (신고한 사람이 본 줄만: 남의 귓말은 들지 않는다)
const c2 = await join('Carol', 'tok-carol-0123456789abcdef');
await say(a, { text: '첫째 줄' });
await say(a, { text: '나쁜 줄' });
await say(b2, { text: '셋째 줄' });
await say(a, { text: '밥한테만', ch: 'w', to: 'Bobby' });
await settle(c2);
const hit = chats(c2).find((m) => m.text === '나쁜 줄');
c2.send({ t: 'report', n: hit!.n }); await settle(c2);
const rep = store.reports(1)[0];
check(c2.sys.includes('reported:Alicia') && rep.target === 'Alicia' && !!rep.ctx && rep.ctx.some((l) => l.hit && l.text === '나쁜 줄' && l.t) && rep.ctx.some((l) => l.text === '셋째 줄') && rep.ctx.some((l) => l.text === '첫째 줄'),
  `대화 줄을 신고하면 그 줄과 앞뒤가 함께 적힌다 (${rep.ctx?.map((l) => l.text).join(' / ')})`);
check(!rep.ctx!.some((l) => l.text === '밥한테만'), '신고한 사람이 보지 못한 줄(남의 귓말)은 들지 않는다');
const rid = server.admin.run('reports', [], 'tester', 'test').out.match(/\[(\w+)\]/)?.[1] ?? '';
const out = server.admin.run('report', [rid], 'tester', 'test').out;
const reps = server.admin.run('reports', [], 'tester', 'test').out;
check(reps.includes('나쁜 줄') && reps.includes('>'), `관리자 reports에 문맥이 보인다`);
check(rid.length > 4 && out.includes('▶') && out.includes('나쁜 줄') && out.includes('셋째 줄'), `관리자 report 신고id: 앞뒤 줄 전부 (${rid})`);

// 관리자: 금칙어
check(server.admin.run('words', ['test', '씨', '발'], 'tester', 'test').out.includes('**'), '관리자 words test: 편 모양과 가린 글');
server.admin.run('words', ['add', '쭈꾸미볶음'], 'tester', 'test');
await say(a, { text: '쭈 꾸 미 볶 음 먹자' });
await settle(c2);
check(chats(c2).some((m) => m.text.startsWith('*') && m.text.endsWith('먹자')), '관리자가 더한 금칙어가 곧바로 걸린다 (운영 값에 남아 다시 켜도 걸린다)');

// 제한 모드 (연령): 내용의 AGE를 켠 것처럼
TALK_VIEW.age = { limit: 14, ask: 'year', restrict: ['market'] };
const kid = await join('Kiddo', 'tok-kid-0123456789abcdef');
const ks = last(kid, 'talk');
check(ks?.s.limited === true && ks.s.ask === true, '연령을 묻는 게임: 답하기 전에는 제한 모드이고 물어야 한다 (아동 채팅 기본 꺼짐)');
await say(kid, { text: '안녕' });
check(kid.sys.includes('chatQuickOnly'), '제한 모드에서는 자유 대화가 막힌다');
await say(kid, { q: 'qcThanks' });
await settle(c2);
check(chats(c2).some((m) => m.name === 'Kiddo' && m.q === 'qcThanks'), '정해진 문장은 된다');
kid.send({ t: 'gchat', text: '길드!' }); await settle(kid);
kid.send({ t: 'market', a: 'list' }); await settle(kid);
check(kid.sys.filter((s) => s === 'chatQuickOnly').length === 2 && kid.sys.includes('limitedCant'), '길드 대화도 막히고, 게임이 정한 명령(market)은 limitedCant');
c2.send({ t: 'talk', a: 'age', y: 1990 }); await settle(c2);
await say(c2, { text: '꼬마야', ch: 'w', to: 'Kiddo' });
tick(10_000);
c2.send({ t: 'friend', a: 'ask', id: kid.id }); await settle(c2);
check(c2.sys.includes('whisperNo:Kiddo') && c2.sys.includes('friendNo:Kiddo'), '제한 모드의 사람은 귓말과 친구 요청을 받지 않는다');
kid.send({ t: 'talk', a: 'age', y: 2016 }); await settle(kid);
check(last(kid, 'talk')?.s.limited === true && last(kid, 'talk')?.s.ask === false, '기준 미만으로 답하면 제한 모드가 이어진다');
kid.send({ t: 'talk', a: 'age', y: 1990 }); await settle(kid);
check(last(kid, 'talk')?.s.limited === true, '한 번 답하면 바꿀 수 없다 (뒤로 가서 다시 고르지 못하게)');
check(server.admin.run('age', ['Kiddo'], 'tester', 'test').out.includes('2016') && server.admin.run('age', ['Kiddo', 'reset'], 'tester', 'test').out.includes('지웠습니다'), '관리자 age: 보기와 지우기');
await settle(kid);
check(last(kid, 'talk')?.s.ask === true, '관리자가 지우면 다시 묻는다');
const adult = await join('Grown', 'tok-grown-0123456789abcdef');
adult.send({ t: 'talk', a: 'age', y: 2000 }); await settle(adult);
await say(adult, { text: '어른입니다' });
check(last(adult, 'talk')?.s.limited === false && !adult.sys.includes('chatQuickOnly'), '기준 이상이면 자유 대화');
TALK_VIEW.age = null;
TALK_VIEW.quick = [];

for (const p of [a, b2, c2, kid, adult]) p.ws.close();
await server.close();

// ---------- SQLite: 스키마 4의 표, 삭제 ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-'));
  try {
    const file = path.join(dir, 's.db');
    const old = new SqliteStore(file, SCHEMA.slice(0, 3));
    old.savePlayer('k1', { name: '하나' });
    old.close();
    const s = new SqliteStore(file);
    check(s.schemaVersion() === SCHEMA.length && SCHEMA.length >= 4 && s.loadPlayer('k1')?.name === '하나', '스키마 3의 DB를 열면 4(사회와 안전)와 그 뒤의 단계를 더하고 캐릭터는 그대로');
    s.putBlock({ owner: 'k1', char: 'k2', name: '둘', at: 1 });
    s.putFriend({ a: 'k1', b: 'k3', state: 'ask', at: 2 });
    s.putFriend({ a: 'k3', b: 'k1', state: 'ok', at: 3 });
    s.setSocialPrefs('k1', { noWhisper: true }, 4);
    check(s.blocksOf('k1').length === 1 && s.friendsOf('k1').length === 1 && s.friendsOf('k1')[0].state === 'ok' && s.friendsOf('k3')[0].a === 'k3' && s.socialPrefs('k1')?.noWhisper === true, '차단·친구(한 쌍에 한 줄)·설정을 적고 읽는다');
    s.putBlock({ owner: 'k9', char: 'k1', name: '하나', at: 5 });
    s.deletePlayer('k1');
    check(s.blocksOf('k1').length === 0 && s.blocksOf('k9').length === 0 && s.friendsOf('k3').length === 0 && s.socialPrefs('k1') === null, '캐릭터를 지우면 차단(한 것·당한 것)·친구·설정도 지운다');
    s.close();
  } finally { removeTemp(dir); }
}
