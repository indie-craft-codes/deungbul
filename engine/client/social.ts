// 사회와 안전, 화면의 데이터 (서버 쪽은 engine/server/net/social.ts): 차단 목록(서버에 저장된 것), 내 대화 상태(제한 모드·연령·받기 설정), 친구 목록.
// 차단은 서버가 저장 키로 기억하고 서버가 거른다 (대화·귓말·친구 요청·파티와 길드 초대가 오지 않는다). 이름을 바꿔도 풀리지 않는다.
// 예전에는 이 브라우저에 이름으로 적어 두었다(플랫폼 저장소의 'blocked'): 처음 접속 때 서버로 옮기고 지운다 (migrateBlocks).
// 창은 hud/social.ts(설정 칸, 친구 탭, 연령 창)와 hud/party.ts(사람 카드), hud/chat.ts(대화)가 그린다.
import type { BlockView, FriendView, TalkState } from '../shared/defs';
import { onMsg } from './bus';
import { send } from './net';
import { platform } from './platform';

/** 옛 차단 목록의 저장 칸 (이름의 배열) */
const OLD_KEY = 'blocked';

let blocks: BlockView[] = [];
let talk: TalkState = { limited: false, ask: false, noWhisper: false, noFriend: false };
let friends: FriendView[] = [];
const listeners: (() => void)[] = [];
/** 듣는 쪽 하나가 예외를 내도 나머지(와 옛 차단 목록 옮기기)는 돈다 */
const changed = () => { for (const fn of listeners) { try { fn(); } catch (err) { console.error('[social]', err); } } };

/** 차단·대화 상태·친구 목록이 바뀌면 불린다 (창을 다시 그린다) */
export function onSocialChange(fn: () => void): void { listeners.push(fn); }
export const blockList = (): readonly BlockView[] => blocks;
export const talkState = (): TalkState => talk;
export const friendList = (): readonly FriendView[] => friends;

/** 그 사람(엔티티 번호, 지금 이름)을 내가 차단했는가 */
export const isBlocked = (id: number, name = ''): boolean => blocks.some((b) => (b.id !== undefined && b.id === id) || (!!name && b.name === name));
/** 차단을 켜거나 끈다: 엔티티 번호(사람 카드)나 대화 줄 번호로 켜고, 목록의 표로 푼다. 결과는 서버가 알린다 */
export function toggleBlock(id: number, name: string, n?: number): void {
  const had = blocks.find((b) => (b.id !== undefined && b.id === id) || b.name === name);
  if (had) send({ t: 'block', a: 'del', r: had.r });
  else if (id) send({ t: 'block', a: 'add', id });
  else if (n !== undefined) send({ t: 'block', a: 'add', n });
}
export const unblock = (r: string): void => send({ t: 'block', a: 'del', r });

/** 들어온 뒤 한 번: 이 브라우저에 이름으로 남아 있던 옛 차단 목록을 서버로 옮긴다. 서버가 목록으로 답하면 지운다 */
let migrating = false;
function migrateBlocks(): void {
  const raw = platform().storage.get(OLD_KEY);
  if (raw === null) return;
  let names: string[] = [];
  try { const v: unknown = JSON.parse(raw); if (Array.isArray(v)) names = v.filter((x): x is string => typeof x === 'string').slice(-200); } catch { /* 깨진 값은 버린다 */ }
  if (!names.length) { platform().storage.remove(OLD_KEY); return; }
  migrating = true;
  send({ t: 'block', a: 'import', names });
}

/** 메시지를 받기 시작한다 (hud/social.ts의 init이 부른다) */
export function listenSocial(): void {
  onMsg('welcome', () => { blocks = []; friends = []; talk = { limited: false, ask: false, noWhisper: false, noFriend: false }; migrateBlocks(); changed(); });
  onMsg('blocks', (m) => {
    blocks = m.list;
    if (migrating && m.imported !== undefined) { migrating = false; platform().storage.remove(OLD_KEY); }
    changed();
  });
  onMsg('talk', (m) => { talk = m.s; changed(); });
  onMsg('friends', (m) => { friends = m.list; changed(); });
}
