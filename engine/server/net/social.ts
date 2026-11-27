// 사회와 안전, 서버 쪽 (docs/genre-features.md 5.3): 차단(서버 저장), 대화의 받는 사람(채널·귓말)과 도배 막기, 정해진 문장, 연령과 제한 모드,
// 대화 설정(귓말·친구 요청 받기), 친구(friends 모듈), 신고에 붙이는 대화의 앞뒤. 통신 계층(server.ts)이 메시지를 이쪽에 먼저 보이고, 관리자 명령을 관리자 통로에 더한다.
// 모든 관계는 저장 키(기기 토큰의 해시)를 단위로 적는다 (DB의 blocks, friends, social_prefs: store/types.ts의 SocialStore). 손님(저장 키 없음)의 것은 서버가 켜져 있는 동안만.
// 열쇠는 두 가지로 나눠 부른다 (지금은 같은 값: 기기 토큰 하나 = 저장 키 하나 = 캐릭터 하나. 계정이 생기면 계정 하나에 캐릭터 여럿이 되어 갈라진다):
//   ownerKey  사람(나중에는 계정): 연령·제한 모드, 본인 설정(귓말·친구 요청 받기), 차단 목록의 '주인', 도배 막기의 통
//   charKey   캐릭터(남에게 보이는 쪽): 친구 관계, 귓말 대상, 차단의 '대상', 대화 줄을 말한 이, 신고의 대상. 이름이 아니라 저장 키로 가리킨다 (이름을 바꿔도 이어진다)
// 화면에는 저장 키를 보내지 않는다: 상대는 짧은 표(ref)로 가리킨다.
//
//   block    add(id: 엔티티 | n: 대화 줄) · del(r) · list · import(names: 브라우저에 남아 있던 옛 차단 목록을 처음 접속 때 옮긴다)
//   friend   ask(id | name) · accept(r) · decline(r) · cancel(r) · del(r) · list · invite(r: 파티에 부른다)   [friends 모듈]
//   talk     state · age(y | band) · prefs(noWhisper, noFriend)
//   chat     (server.ts의 chat이 route → deliver로 부른다) ch: n 근처, p 파티, g 길드, w 귓말(to: 이름) [chat 모듈], q: 정해진 문장
//
// 고르지 않거나 적지 않으면 예전과 같다: chat 모듈이 없으면 대화는 전체(그리고 길드 모듈의 gchat)뿐이고 도배 막기도 예전 그대로다.
// AGE가 없으면 아무도 제한 모드가 아니다. QUICK_CHAT이 비어 있으면 정해진 문장은 거절된다. 차단한 사람이 없으면 대화는 예전처럼 모두에게 간다.
import { createHash } from 'node:crypto';
import { CHAT_RULES, FRIENDS, TALK_VIEW, isChatCh, isQuick, type BlockView, type ChatCh, type FriendView, type TalkState } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { ServerMsg } from '../../shared/protocol';
import { NAME_MAX } from '../../shared/world';
import { dist, type Ent } from '../game/entity';
import type { Game } from '../game/game';
import { isField } from '../game/layers';
import { log } from '../log';
import { hasLive, hasSocial, type ReportLine, type SocialStore, type Store } from '../store';
import { addBannedWords, bannedWords, filterKey, isClean, mask, tidy } from '../text';

/** 대화 줄을 이만큼 기억한다 (신고의 앞뒤 문맥): 줄 수와 시간 */
const RING_MAX = 400, RING_MS = 30 * 60_000;
/** 신고에 붙이는 앞뒤 줄 */
export const CTX_BEFORE = 6, CTX_AFTER = 4;
/** 한 사람의 차단 상한 */
export const BLOCK_MAX = 200;
/** 관리자가 더한 금칙어를 적어 두는 운영 값의 열쇠 */
const WORDS_META = 'bannedWords';

/** 통신 계층의 연결 가운데 이쪽이 읽는 것 */
export interface SocialClient { key: string | null; ent: Ent | null; ip: string }
/** 이쪽이 통신 계층에서 빌려 쓰는 것 (server.ts가 채운다) */
export interface SocialHost {
  game: Game; store: Store; now: () => number;
  send(c: SocialClient, msg: ServerMsg): void;
  /** 지금 접속해 있는 연결 (캐릭터가 있는 것) */
  clients(): Iterable<SocialClient>;
  byEnt(id: number): SocialClient | undefined;
  byKey(key: string): SocialClient | undefined;
}
/** 대화 한 줄의 받는 곳 (route가 정하고 deliver가 보낸다) */
export interface ChatRoute { ch?: ChatCh; to: SocialClient[] | null; whisper?: SocialClient }
export interface Social {
  /** 이쪽의 메시지면 처리하고 true (block, friend, talk) */
  handle(c: SocialClient, e: Ent, m: Record<string, unknown>): boolean;
  /** 접속했다 (캐릭터를 만든 뒤) */
  joined(c: SocialClient): void;
  /** 연결이 끊긴다 */
  left(c: SocialClient): void;
  /** 대화 한 줄의 받는 곳. 막혔으면 null (까닭은 이미 알렸다). text는 다듬은 원문(정해진 문장이면 빈 글), quick은 정해진 문장의 키 */
  route(c: SocialClient, e: Ent, m: Record<string, unknown>, text: string, quick: string): ChatRoute | null;
  /** 정한 곳으로 보낸다 (받는 사람이 말한 사람을 차단했으면 빼고). 줄을 기억한다 (신고의 문맥) */
  deliver(c: SocialClient, e: Ent, r: ChatRoute, text: string, quick: string): void;
  /** 게임 명령을 막는가 (제한 모드: 자유 대화인 gchat과 TALK_VIEW.age.restrict의 명령). 막았으면 까닭을 알리고 true */
  gate(c: SocialClient, e: Ent, m: Record<string, unknown>): boolean;
  /** 게임이 한 사람에게 보내는 대화(길드 대화: game.out)를 그 사람이 받는가. 받으면 줄을 기억하고 번호를 붙인다 */
  pass(toId: number, msg: ServerMsg): boolean;
  /** 신고의 대상과 문맥: n(대화 줄 번호)이 있으면 그 줄을 말한 사람과 앞뒤, 없으면 target이 최근에 보인 줄들 */
  context(c: SocialClient, n: unknown, target: SocialClient | null): { key: string | null; char: string; name: string; ctx: ReportLine[]; ch?: string } | null;
  /** 그 저장 키의 사회 데이터 (내 데이터 내보내기) */
  exportOf(key: string): Record<string, unknown>;
  /** 그 저장 키를 지웠다 (기억해 둔 것을 비운다) */
  erased(key: string): void;
  /** 관리자 명령 (net/admin.ts의 명령표 끝에 더해진다) */
  admin: Record<string, (a: string[], by: string) => string>;
}

/** 대화 한 줄의 기억 */
/** char: 말한 캐릭터, to: 받은 사람들(ownerKey). null이면 모두 */
interface Line { n: number; at: number; ch?: ChatCh; char: string; key: string | null; name: string; text: string; q?: string; to: Set<string> | null }
/** 사람마다의 대화 설정과 연령 (저장 키의 social_prefs) */
interface Prefs { noWhisper?: boolean; noFriend?: boolean; age?: { y?: number; band?: 'u' | 'o'; at: number } }
interface Bucket { left: number; at: number }

/** 상대를 가리키는 짧은 표 (저장 키를 화면에 보내지 않는다) */
export const refOf = (pk: string): string => createHash('sha1').update('ref:' + pk).digest('hex').slice(0, 12);
/** 사람의 열쇠 (본인 설정·연령·차단 목록의 주인): 지금은 'k:저장 키', 손님은 'i:주소'. 계정이 생기면 계정 id로 바꾼다 */
const ownerKey = (c: SocialClient): string => (c.key ? 'k:' + c.key : 'i:' + c.ip);
/** 캐릭터의 열쇠 (친구·귓말·차단·신고의 대상): 지금은 'k:저장 키', 손님은 'i:주소' */
const charKey = (c: SocialClient): string => (c.key ? 'k:' + c.key : 'i:' + c.ip);
/** 캐릭터의 주인 (지금은 같은 값: 계정이 생기면 캐릭터 → 계정을 찾는다) */
const ownerOfChar = (char: string): string => char;
/** 열쇠에서 저장 키 (손님이면 null) */
const keyOfPk = (pk: string): string | null => (pk.startsWith('k:') ? pk.slice(2) : null);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? tidy(v.replace(/[\u0000-\u001f\u007f]/g, '')).trim().slice(0, max) : '');

export function createSocial(host: SocialHost): Social {
  const g = host.game, store = host.store;
  const ss: (Store & SocialStore) | null = hasSocial(store) ? store : null;
  const chatOn = g.has('chat'), friendsOn = g.has('friends') && !!ss;
  if (g.has('friends') && !ss) log.warn('[social] 이 저장소는 친구를 적지 못합니다: friends 모듈을 끕니다');
  const sys = (k: MsgKey, ...a: MsgArg[]): ServerMsg => ({ t: 'sys', k, a });
  const tell = (c: SocialClient, k: MsgKey, ...a: MsgArg[]) => host.send(c, sys(k, ...a));

  // ---------- 기억 ----------
  /** 접속한 사람의 차단 목록: 사람 열쇠 → (상대의 사람 열쇠 → 이름) */
  const blocks = new Map<string, Map<string, { name: string; at: number }>>();
  /** 대화 설정: 사람 열쇠 → 설정 (접속한 사람과 손님) */
  const prefs = new Map<string, Prefs>();
  const ring: Line[] = [];
  let seq = 0;
  /** 사람마다의 대화량과 최근에 한 말 (chat 모듈) */
  const buckets = new Map<string, Bucket>(), recent = new Map<string, { k: string; at: number }[]>();
  const lastAsk = new Map<string, number>();
  /** 길드 대화처럼 같은 메시지를 여러 사람에게 보내는 것: 한 번만 기억한다 */
  const seenMsg = new WeakMap<object, Line>();

  // 관리자가 더한 금칙어 (운영 값에 남는다): 켜질 때 다시 더한다
  const extraWords = (): string[] => { if (!hasLive(store)) return []; const v = store.liveMeta(WORDS_META); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; };
  try { const w = extraWords(); if (w.length) addBannedWords(w); } catch (err) { log.error('[social] 관리자 금칙어를 읽지 못했습니다:', err); }

  function loadPrefs(owner: string): Prefs {
    let p = prefs.get(owner);
    if (p) return p;
    const key = keyOfPk(owner);
    let raw: Record<string, unknown> | null = null;
    try { raw = key && ss ? ss.socialPrefs(key) : null; } catch (err) { log.error('[social] 대화 설정을 읽지 못했습니다:', err); }
    const age = raw && typeof raw.age === 'object' && raw.age !== null ? raw.age as Record<string, unknown> : null;
    p = {
      noWhisper: raw?.noWhisper === true || undefined, noFriend: raw?.noFriend === true || undefined,
      age: age ? { y: typeof age.y === 'number' ? age.y : undefined, band: age.band === 'u' || age.band === 'o' ? age.band : undefined, at: Number(age.at) || 0 } : undefined,
    };
    prefs.set(owner, p);
    return p;
  }
  function savePrefs(owner: string, p: Prefs): void {
    prefs.set(owner, p);
    const key = keyOfPk(owner);
    if (key && ss) try { ss.setSocialPrefs(key, JSON.parse(JSON.stringify(p)) as Record<string, unknown>, host.now()); } catch (err) { log.error('[social] 대화 설정을 적지 못했습니다:', err); }
  }
  /** 그 나이 답이 제한 모드인가 (태어난 해만 알면 생일이 아직이라고 보고 한 살 적게 센다) */
  const under = (a: Prefs['age']): boolean => {
    if (!TALK_VIEW.age) return false;
    if (!a) return true; // 답하기 전에는 제한 모드 (아동 채팅 기본 꺼짐)
    if (a.band) return a.band === 'u';
    const year = new Date(host.now()).getUTCFullYear();
    return typeof a.y !== 'number' || year - a.y - 1 < TALK_VIEW.age.limit;
  };
  /** 그 사람(ownerKey)이 제한 모드인가 */
  const limitedOwner = (owner: string): boolean => !!TALK_VIEW.age && under(loadPrefs(owner).age);
  const limited = (c: SocialClient): boolean => limitedOwner(ownerKey(c));
  function stateOf(c: SocialClient): TalkState {
    const p = loadPrefs(ownerKey(c));
    return { limited: limited(c), ask: !!TALK_VIEW.age && !p.age, noWhisper: !!p.noWhisper, noFriend: !!p.noFriend };
  }
  const sendState = (c: SocialClient) => host.send(c, { t: 'talk', s: stateOf(c) });

  /** 그 사람(ownerKey)의 차단 목록: 차단한 캐릭터(charKey) → 그때의 이름 */
  function blocksOf(owner: string): Map<string, { name: string; at: number }> {
    let b = blocks.get(owner);
    if (b) return b;
    b = new Map();
    const key = keyOfPk(owner);
    if (key && ss) try { for (const r of ss.blocksOf(key)) b.set('k:' + r.char, { name: r.name, at: r.at }); } catch (err) { log.error('[social] 차단 목록을 읽지 못했습니다:', err); }
    blocks.set(owner, b);
    return b;
  }
  /** 받는 사람(ownerKey)이 말한 캐릭터(charKey)를 차단했는가 */
  const hides = (owner: string, char: string): boolean => (blocks.get(owner)?.has(char) ?? false);
  // 파티·길드 초대도 차단을 본다 (engine/server/game/game.ts의 blocks)
  g.blocks = (to, from) => hides(ownerOfChar(charOfEnt(to)), charOfEnt(from));
  function charOfEnt(e: Ent): string { const c = host.byEnt(e.id); return c ? charKey(c) : e.pid ? 'k:' + e.pid : '#' + e.id; }

  /** 이름 → 지금 접속한 연결 (대소문자 무시) */
  function online(name: string): SocialClient | undefined {
    const k = name.toLowerCase();
    for (const c of host.clients()) if (c.ent && c.ent.name.toLowerCase() === k) return c;
    return undefined;
  }
  const nameOfKey = (key: string): string => host.byKey(key)?.ent?.name ?? store.loadPlayer(key)?.name ?? '?';

  function blockList(c: SocialClient): BlockView[] {
    return [...blocksOf(ownerKey(c))].map(([char, b]) => {
      const key = keyOfPk(char), on = key ? host.byKey(key) : undefined;
      return { r: refOf(char), name: on?.ent?.name ?? b.name, ...(on?.ent ? { id: on.ent.id } : {}) };
    });
  }
  const sendBlocks = (c: SocialClient) => host.send(c, { t: 'blocks', list: blockList(c) });

  /** 그 캐릭터(charKey)를 이 사람의 차단 목록에 더한다 */
  function addBlock(c: SocialClient, char: string, name: string): boolean {
    const me = ownerKey(c);
    if (char === charKey(c)) return false;
    const b = blocksOf(me);
    if (!b.has(char) && b.size >= BLOCK_MAX) { tell(c, 'blockFull', BLOCK_MAX); return false; }
    const at = host.now();
    b.set(char, { name: name.slice(0, NAME_MAX), at });
    const key = keyOfPk(me), tk = keyOfPk(char);
    if (key && tk && ss) try { ss.putBlock({ owner: key, char: tk, name, at }); } catch (err) { log.error('[social] 차단을 적지 못했습니다:', err); }
    // 친구였으면 끊는다 (차단한 사람과 친구로 남지 않게)
    if (key && tk && ss && friendsOn && ss.friendsOf(key).some((r) => r.a === tk || r.b === tk)) { ss.delFriend(key, tk); sendFriends(key); sendFriends(tk); }
    return true;
  }

  function block(c: SocialClient, e: Ent, m: Record<string, unknown>): void {
    const me = ownerKey(c);
    if (m.a === 'list') { sendBlocks(c); return; }
    if (m.a === 'add') {
      let char = '', name = '';
      if (typeof m.id === 'number') { const t = host.byEnt(m.id); if (t?.ent && t !== c) { char = charKey(t); name = t.ent.name; } }
      else if (typeof m.n === 'number') { const l = lineOf(c, m.n); if (l) { char = l.char; name = l.name; } }
      else if (typeof m.r === 'string') { const f = friendByRef(c, m.r); if (f) { char = 'k:' + f; name = nameOfKey(f); } }
      if (!char || char === charKey(c)) return;
      if (addBlock(c, char, name)) tell(c, 'blockedOn', name);
      sendBlocks(c);
      return;
    }
    if (m.a === 'del' && typeof m.r === 'string') {
      const b = blocksOf(me);
      for (const [char, v] of b) {
        if (refOf(char) !== m.r) continue;
        b.delete(char);
        const key = keyOfPk(me), tk = keyOfPk(char);
        if (key && tk && ss) try { ss.delBlock(key, tk); } catch (err) { log.error('[social] 차단을 풀지 못했습니다:', err); }
        tell(c, 'blockedOff', host.byKey(tk ?? '')?.ent?.name ?? v.name);
        break;
      }
      sendBlocks(c);
      return;
    }
    if (m.a === 'import' && Array.isArray(m.names)) {
      // 브라우저에 이름으로 남아 있던 옛 차단 목록 (engine/client/social.ts의 흔적): 지금 이름이나 저장된 이름으로 사람을 찾아 저장 키로 옮긴다. 찾지 못한 이름은 버린다
      let n = 0;
      for (const raw of m.names.slice(0, BLOCK_MAX)) {
        const name = str(raw, NAME_MAX);
        if (!name) continue;
        const on = online(name);
        const char = on ? charKey(on) : (() => { try { const k = store.keyOfName(name); return k ? 'k:' + k : ''; } catch { return ''; } })();
        if (char && char !== charKey(c) && !blocksOf(me).has(char) && addBlock(c, char, on?.ent?.name ?? name)) n++;
      }
      log.info(`[social] 옛 차단 목록을 옮겼습니다: ${e.name} (${n}명)`);
      host.send(c, { t: 'blocks', list: blockList(c), imported: n });
    }
  }

  // ---------- 친구 (friends 모듈) ----------
  // 판의 '친구만'도 친구 목록을 본다 (engine/server/game/invites.ts의 g.friends). 저장 키가 없는 사람(손님)은 친구가 없다
  if (friendsOn) g.friends = (a, b) => !!a.pid && !!b.pid && a.pid !== b.pid && friendRows(a.pid).some((r) => r.state === 'ok' && (r.a === b.pid || r.b === b.pid));
  function friendRows(key: string) { try { return ss ? ss.friendsOf(key) : []; } catch (err) { log.error('[social] 친구 목록을 읽지 못했습니다:', err); return []; } }
  function friendList(key: string): FriendView[] {
    return friendRows(key).map((r) => {
      const other = r.a === key ? r.b : r.a, on = host.byKey(other)?.ent;
      const st: FriendView['st'] = r.state === 'ok' ? 'ok' : r.a === key ? 'out' : 'in';
      const save = on ? null : store.loadPlayer(other);
      const v: FriendView = { r: refOf('k:' + other), name: on?.name ?? save?.name ?? '?', st, at: r.at };
      if (on && st === 'ok') { v.id = on.id; v.ch = g.channels.of(on); if (!isField(on.layer)) v.inst = true; }
      else if (st === 'ok' && !on && typeof save?.seen === 'number') v.seen = save.seen;
      return v;
    });
  }
  /** 그 저장 키가 접속해 있으면 친구 목록을 보낸다 */
  function sendFriends(key: string): void { const c = host.byKey(key); if (c?.ent && friendsOn) host.send(c, { t: 'friends', list: friendList(key) }); }
  function friendByRef(c: SocialClient, r: string): string | null {
    if (!c.key) return null;
    for (const row of friendRows(c.key)) { const other = row.a === c.key ? row.b : row.a; if (refOf('k:' + other) === r) return other; }
    return null;
  }

  function friend(c: SocialClient, e: Ent, m: Record<string, unknown>): void {
    if (!friendsOn) return;
    if (!c.key || !ss) { tell(c, 'friendGuest'); return; }
    const me = c.key, now = host.now();
    if (m.a === 'list') { host.send(c, { t: 'friends', list: friendList(me) }); return; }
    if (m.a === 'ask') {
      const wait = FRIENDS.askGapS * 1000 - (now - (lastAsk.get(me) ?? -Infinity));
      if (wait > 0) { tell(c, 'friendWait', Math.ceil(wait / 1000)); return; }
      let tk: string | null = null, name = '';
      if (typeof m.id === 'number') { const t = host.byEnt(m.id); if (t?.ent && t !== c) { tk = t.key; name = t.ent.name; } }
      else if (typeof m.name === 'string') {
        name = str(m.name, NAME_MAX);
        const on = name ? online(name) : undefined;
        tk = on ? on.key : (() => { try { return name ? store.keyOfName(name) : null; } catch { return null; } })();
        if (on?.ent) name = on.ent.name; else if (tk) name = store.loadPlayer(tk)?.name ?? name;
      }
      if (!name) return;
      if (!tk) { tell(c, 'friendNoOne', name); return; }
      if (tk === me) return;
      lastAsk.set(me, now);
      const rows = friendRows(me), had = rows.find((r) => r.a === tk || r.b === tk);
      if (had?.state === 'ok') { tell(c, 'friendAlready', name); return; }
      if (had && had.a === me) { tell(c, 'friendAsked', name); return; }
      const mine = rows.filter((r) => r.state === 'ok').length, theirs = friendRows(tk).filter((r) => r.state === 'ok').length;
      if (mine >= FRIENDS.max) { tell(c, 'friendFull', FRIENDS.max); return; }
      // 상대가 먼저 요청했으면 곧바로 친구가 된다
      if (had && had.a === tk) {
        if (theirs >= FRIENDS.max) { tell(c, 'friendNo', name); return; }
        ss.putFriend({ a: tk, b: me, state: 'ok', at: now });
        tell(c, 'friendNew', name);
        const t = host.byKey(tk); if (t?.ent) tell(t, 'friendNew', e.name);
        sendFriends(me); sendFriends(tk);
        return;
      }
      // 상대가 나를 차단했으면 보낸 것처럼 보이고 실제로는 가지 않는다 (차단을 알리지 않는다)
      if (hides(ownerOfChar('k:' + tk), 'k:' + me)) { tell(c, 'friendAsked', name); return; }
      const tp = loadPrefs(ownerOfChar('k:' + tk));
      if (tp.noFriend || limitedOwner(ownerOfChar('k:' + tk)) || friendRows(tk).filter((r) => r.state === 'ask' && r.b === tk).length >= FRIENDS.pending || theirs >= FRIENDS.max) { tell(c, 'friendNo', name); return; }
      ss.putFriend({ a: me, b: tk, state: 'ask', at: now });
      tell(c, 'friendAsked', name);
      const t = host.byKey(tk); if (t?.ent) tell(t, 'friendAskIn', e.name);
      sendFriends(me); sendFriends(tk);
      return;
    }
    const other = typeof m.r === 'string' ? friendByRef(c, m.r) : null;
    if (!other) return;
    const row = friendRows(me).find((r) => r.a === other || r.b === other)!;
    const name = nameOfKey(other);
    if (m.a === 'accept' && row.state === 'ask' && row.b === me) {
      if (friendRows(me).filter((r) => r.state === 'ok').length >= FRIENDS.max) { tell(c, 'friendFull', FRIENDS.max); return; }
      if (friendRows(other).filter((r) => r.state === 'ok').length >= FRIENDS.max) { tell(c, 'friendNo', name); return; }
      ss.putFriend({ a: other, b: me, state: 'ok', at: now });
      tell(c, 'friendNew', name);
      const t = host.byKey(other); if (t?.ent) tell(t, 'friendNew', e.name);
    } else if ((m.a === 'decline' && row.state === 'ask' && row.b === me) || (m.a === 'cancel' && row.state === 'ask' && row.a === me)) {
      ss.delFriend(me, other);
    } else if (m.a === 'del' && row.state === 'ok') {
      ss.delFriend(me, other);
      tell(c, 'friendRemoved', name);
    } else if (m.a === 'invite' && row.state === 'ok') {
      // 친구를 파티에 부른다: 곁에 없어도 된다 (party 모듈)
      const t = host.byKey(other);
      if (!t?.ent) { tell(c, 'friendOffline', name); return; }
      if (g.has('party')) g.party.invite(e, t.ent.id, true);
      return;
    } else return;
    sendFriends(me); sendFriends(other);
  }

  // ---------- 대화 설정과 연령 ----------
  function talk(c: SocialClient, m: Record<string, unknown>): void {
    const pk = ownerKey(c); // 본인 설정과 연령은 사람의 것
    if (m.a === 'state') { sendState(c); return; }
    if (m.a === 'age') {
      const p = loadPrefs(pk);
      if (!TALK_VIEW.age || p.age) { sendState(c); return; } // 한 번 답하면 바꿀 수 없다 (뒤로 가서 다시 고르지 못하게: 관리자만 age 명령으로)
      const year = new Date(host.now()).getUTCFullYear();
      if (TALK_VIEW.age.ask === 'year' && typeof m.y === 'number' && Number.isInteger(m.y) && m.y >= year - 120 && m.y <= year) p.age = { y: m.y, at: host.now() };
      else if (TALK_VIEW.age.ask === 'band' && (m.band === 'u' || m.band === 'o')) p.age = { band: m.band, at: host.now() };
      else return;
      savePrefs(pk, p);
      sendState(c);
      return;
    }
    if (m.a === 'prefs') {
      const p = { ...loadPrefs(pk) };
      if (typeof m.noWhisper === 'boolean') p.noWhisper = m.noWhisper || undefined;
      if (typeof m.noFriend === 'boolean') p.noFriend = m.noFriend || undefined;
      savePrefs(pk, p);
      sendState(c);
    }
  }

  // ---------- 대화 ----------
  function remember(l: Omit<Line, 'n'>): Line {
    const line: Line = { ...l, n: ++seq };
    ring.push(line);
    const cut = host.now() - RING_MS;
    while (ring.length > RING_MAX || (ring.length && ring[0].at < cut)) ring.shift();
    return line;
  }
  /** 그 사람이 본 줄인가 */
  const saw = (l: Line, c: SocialClient): boolean => l.to === null || l.to.has(ownerKey(c)) || l.char === charKey(c);
  function lineOf(c: SocialClient, n: number): Line | undefined { const l = ring.find((x) => x.n === n); return l && saw(l, c) ? l : undefined; }

  /** chat 모듈의 도배 막기: 모든 채널을 합친 통과 같은 말의 되풀이 */
  function spam(c: SocialClient, text: string, quick: string): boolean {
    const pk = ownerKey(c), now = host.now(); // 도배 막기는 사람마다
    let b = buckets.get(pk);
    if (!b) buckets.set(pk, b = { left: CHAT_RULES.burst, at: now });
    b.left = Math.min(CHAT_RULES.burst, b.left + ((now - b.at) / 1000) * CHAT_RULES.perS);
    b.at = now;
    if (b.left < 1) { tell(c, 'chatWait'); return true; }
    const k = quick ? 'q:' + quick : tidy(text).toLowerCase().replace(/\s+/g, ''), list = (recent.get(pk) ?? []).filter((x) => now - x.at < CHAT_RULES.sameS * 1000);
    if (list.some((x) => x.k === k)) { recent.set(pk, list); tell(c, 'chatSame'); return true; }
    b.left--;
    list.push({ k, at: now });
    recent.set(pk, list.slice(-5));
    return false;
  }

  function route(c: SocialClient, e: Ent, m: Record<string, unknown>, text: string, quick: string): ChatRoute | null {
    if (quick && !isQuick(quick)) return null;
    if (text && limited(c)) { tell(c, 'chatQuickOnly'); return null; }
    // chat 모듈이 없으면 예전처럼 모두에게. 채널을 붙인 말(귓말 따위)은 받지 않는다: 몰래 하려던 말이 모두에게 가지 않게
    if (!chatOn) return m.ch !== undefined || m.to !== undefined ? null : { to: null };
    const ch = isChatCh(m.ch) ? m.ch : undefined;
    let r: ChatRoute;
    if (!ch) r = { to: null };
    else if (ch === 'n') {
      const to: SocialClient[] = [];
      const byMode = (CHAT_RULES as { nearScope?: string }).nearScope === 'mode' && g.has('modes'), mine = byMode ? g.modes.of(e) : '';
      for (const x of host.clients()) if (x.ent && (byMode ? g.modes.of(x.ent) === mine : x.ent.layer === e.layer && dist(x.ent, e) <= CHAT_RULES.nearM)) to.push(x);
      r = { ch, to };
    } else if (ch === 'p') {
      if (!g.has('party') || !g.party.mates(e).length) { tell(c, 'chatNoParty'); return null; }
      r = { ch, to: [c, ...g.party.mates(e).map((x) => host.byEnt(x.id)).filter((x): x is SocialClient => !!x)] };
    } else if (ch === 'g') {
      return null; // 길드 대화는 gchat 명령 (guild 모듈)이 보낸다
    } else {
      const name = str(m.to, NAME_MAX);
      if (!name) return null;
      const t = online(name);
      if (!t?.ent) {
        let saved = false;
        try { saved = !!store.keyOfName(name); } catch { /* 없다고 본다 */ }
        tell(c, saved ? 'whisperOffline' : 'whisperNoOne', name);
        return null;
      }
      if (t === c) return null;
      const tp = ownerKey(t);
      // 받지 않는 사람 (귓말 끔, 제한 모드, 나를 차단함): 같은 말로 알린다 (차단을 알리지 않는다)
      if (loadPrefs(tp).noWhisper || limitedOwner(tp) || hides(tp, charKey(c))) { tell(c, 'whisperNo', t.ent.name); return null; }
      r = { ch, to: [t], whisper: t };
    }
    if (spam(c, text, quick)) return null;
    return r;
  }

  function deliver(c: SocialClient, e: Ent, r: ChatRoute, text: string, quick: string): void {
    const char = charKey(c);
    const to = r.to ? new Set(r.to.map(ownerKey)) : null;
    const line = remember({ at: host.now(), ch: r.ch, char, key: c.key, name: e.name, text, q: quick || undefined, to });
    const msg: Extract<ServerMsg, { t: 'chat' }> = { t: 'chat', id: e.id, name: e.name, text: text ? mask(text) : '', n: line.n };
    if (r.ch) msg.ch = r.ch;
    if (quick) msg.q = quick;
    // 말한 사람이 지금 있는 모드 (modes 모듈: 받는 화면이 작은 표시를 단다)
    if (g.has('modes')) msg.md = g.modes.of(e);
    const list = r.to ?? [...host.clients()].filter((x) => x.ent);
    for (const x of list) if (!hides(ownerKey(x), char)) host.send(x, msg);
    // 귓말은 보낸 사람에게도 (누구에게 보냈는지와 함께)
    if (r.whisper?.ent) host.send(c, { ...msg, to: r.whisper.ent.name });
  }

  function pass(toId: number, msg: ServerMsg): boolean {
    if (msg.t !== 'chat') return true;
    const to = host.byEnt(toId), from = host.byEnt(msg.id);
    let line = seenMsg.get(msg);
    if (!line && from) { line = remember({ at: host.now(), ch: msg.ch, char: charKey(from), key: from.key, name: msg.name, text: msg.text, to: new Set() }); seenMsg.set(msg, line); msg.n = line.n; }
    if (to && line) line.to?.add(ownerKey(to));
    return !(to && from && hides(ownerKey(to), charKey(from)));
  }

  function gate(c: SocialClient, e: Ent, m: Record<string, unknown>): boolean {
    if (!limited(c)) return false;
    if (m.t === 'gchat') { tell(c, 'chatQuickOnly'); return true; }
    if (TALK_VIEW.age && typeof m.t === 'string' && TALK_VIEW.age.restrict.includes(m.t)) { tell(c, 'limitedCant'); return true; }
    return false;
  }

  function context(c: SocialClient, n: unknown, target: SocialClient | null): ReturnType<Social['context']> {
    const me = charKey(c);
    const seen = ring.filter((l) => saw(l, c));
    const out = (l: Line, hitN: number, tchar: string): ReportLine => ({ at: l.at, ...(l.ch ? { ch: l.ch } : {}), name: l.name, text: l.q ? `[${l.q}]` : l.text, ...(l.char === tchar ? { t: true as const } : {}), ...(l.n === hitN ? { hit: true as const } : {}) });
    if (typeof n === 'number') {
      const i = seen.findIndex((l) => l.n === n);
      if (i < 0 || seen[i].char === me) return null;
      const l = seen[i];
      return { key: l.key, char: l.char, name: l.name, ch: l.ch, ctx: seen.slice(Math.max(0, i - CTX_BEFORE), i + 1 + CTX_AFTER).map((x) => out(x, n, l.char)) };
    }
    if (!target?.ent) return null;
    const tpk = charKey(target);
    // 줄을 고르지 않은 신고: 대상이 한 마지막 말의 앞뒤 (대상의 말이 없으면 최근 줄들)
    let i = -1;
    for (let k = seen.length - 1; k >= 0; k--) if (seen[k].char === tpk) { i = k; break; }
    const ctx = i < 0 ? seen.slice(-CTX_BEFORE) : seen.slice(Math.max(0, i - CTX_BEFORE), i + 1 + CTX_AFTER);
    return { key: target.key, char: tpk, name: target.ent.name, ctx: ctx.map((x) => out(x, -1, tpk)) };
  }

  // ---------- 접속 ----------
  function joined(c: SocialClient): void {
    const pk = ownerKey(c);
    blocks.delete(pk); prefs.delete(pk); // 다시 읽는다 (다른 기기에서 바꿨을 수 있다)
    if (blocksOf(pk).size) sendBlocks(c);
    if (TALK_VIEW.age || chatOn || friendsOn) sendState(c);
    if (friendsOn && c.key) { host.send(c, { t: 'friends', list: friendList(c.key) }); for (const r of friendRows(c.key)) if (r.state === 'ok') sendFriends(r.a === c.key ? r.b : r.a); }
  }
  function left(c: SocialClient): void {
    const pk = ownerKey(c);
    // 다른 연결이 같은 사람으로 남아 있지 않으면 잊는다 (다음 접속에 다시 읽는다)
    for (const x of host.clients()) if (x !== c && x.ent && ownerKey(x) === pk) return;
    blocks.delete(pk); prefs.delete(pk); buckets.delete(pk); recent.delete(pk);
    if (friendsOn && c.key) { const key = c.key; queueMicrotask(() => { for (const r of friendRows(key)) if (r.state === 'ok') sendFriends(r.a === key ? r.b : r.a); }); }
  }

  // ---------- 관리자 명령 ----------
  const findKey = (who: string): { key: string; name: string } | null => {
    const on = online(who);
    if (on?.key) return { key: on.key, name: on.ent!.name };
    try { const key = store.keyOfName(who); return key ? { key, name: store.loadPlayer(key)?.name ?? who } : null; } catch { return null; }
  };
  const admin: Record<string, (a: string[], by: string) => string> = {
    words: (a) => {
      const sub = a[0] ?? '';
      if (sub === 'test') {
        const text = a.slice(1).join(' ');
        if (!text) return '쓰는 법: words test 글';
        return [`편 모양: ${filterKey(text)}`, `대화: ${mask(text)}`, `이름으로: ${isClean(text) ? '쓸 수 있다' : '쓸 수 없다'}`].join('\n');
      }
      if (sub === 'add' || sub === 'del') {
        if (!hasLive(store)) return '이 저장소는 운영 값을 적지 못해 금칙어를 남길 수 없습니다.';
        const list = a.slice(1).map((w) => tidy(w).trim().toLowerCase()).filter(Boolean);
        if (!list.length) return `쓰는 법: words ${sub} 낱말 [낱말 …]`;
        const cur = extraWords();
        const next = sub === 'add' ? [...new Set([...cur, ...list])] : cur.filter((w) => !list.includes(w));
        store.setLiveMeta(WORDS_META, next);
        if (sub === 'add') { addBannedWords(list); return `금칙어 ${list.length}개를 더했습니다 (관리자가 더한 것 ${next.length}개, 다시 켜도 남는다).`; }
        return `관리자가 더한 목록에서 ${cur.length - next.length}개를 뺐습니다. 이미 걸고 있는 것은 서버를 다시 켜면 풀립니다.`;
      }
      const extra = extraWords();
      return [`금칙어 ${bannedWords().length}개 (틀의 목록 + 게임이 더한 것 + 관리자가 더한 것 ${extra.length}개)`, extra.length ? `  관리자가 더한 것: ${extra.join(', ')}` : '', '쓰는 법: words | words test 글 | words add 낱말… | words del 낱말…'].filter(Boolean).join('\n');
    },
    age: (a) => {
      if (!TALK_VIEW.age) return '이 게임은 연령을 묻지 않습니다 (내용의 AGE가 없다).';
      const t = findKey(a[0] ?? '');
      if (!t) return '쓰는 법: age 이름 [reset] (캐릭터를 찾지 못했습니다)';
      const pk = 'k:' + t.key, p = loadPrefs(pk);
      if (a[1] === 'reset') {
        delete p.age; savePrefs(pk, p);
        const on = host.byKey(t.key); if (on?.ent) sendState(on);
        return `${t.name}의 연령 답을 지웠습니다: 다음에 다시 묻고, 그때까지 제한 모드입니다.`;
      }
      return `${t.name}: ${p.age ? (p.age.band ? (p.age.band === 'u' ? `${TALK_VIEW.age.limit}세 미만` : `${TALK_VIEW.age.limit}세 이상`) : `태어난 해 ${p.age.y}`) + ` (${new Date(p.age.at).toISOString().slice(0, 10)})` : '답하지 않음'} · ${limitedOwner(pk) ? '제한 모드' : '자유 대화'}`;
    },
    blocks: (a) => {
      const t = findKey(a[0] ?? '');
      if (!t || !ss) return '쓰는 법: blocks 이름';
      const mine = ss.blocksOf(t.key);
      return `${t.name}이(가) 차단한 사람 ${mine.length}명${mine.length ? ': ' + mine.map((r) => r.name).join(', ') : ''}`;
    },
  };

  return {
    handle(c, e, m) {
      if (m.t === 'block') { block(c, e, m); return true; }
      if (m.t === 'friend') { friend(c, e, m); return true; }
      if (m.t === 'talk') { talk(c, m); return true; }
      return false;
    },
    joined, left, route, deliver, gate, pass, context,
    exportOf(key) {
      const p = ss?.socialPrefs(key) ?? null;
      return {
        blocks: ss ? ss.blocksOf(key).map((r) => ({ name: r.name, at: r.at })) : [], // 이 사람이 차단한 캐릭터
        friends: ss ? ss.friendsOf(key).map((r) => ({ name: nameOfKey(r.a === key ? r.b : r.a), state: r.state === 'ok' ? 'friend' : r.a === key ? 'asked' : 'askedMe', at: r.at })) : [],
        prefs: p,
      };
    },
    erased(key) { const owner = 'k:' + key, char = 'k:' + key; blocks.delete(owner); prefs.delete(owner); for (const b of blocks.values()) b.delete(char); },
    admin,
  };
}
