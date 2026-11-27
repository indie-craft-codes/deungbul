// 문의와 제재 이의, 서버 쪽 (선택 모듈 support: docs/genre-features.md 5.5). 고르지 않으면 이 파일의 것은 하나도 돌지 않는다 (메시지는 무시, 관리자 명령만 '꺼져 있다'고 답한다).
// 통신 계층(server.ts)이 메시지를 이쪽에 먼저 보이고, 차단된 사람의 접속(atBan)을 이쪽에 묻고, 관리자 명령을 관리자 통로에 더한다.
//
//   support  list(내 문의와 지금 걸린 말 막기) · new(kind: ask 질문 | bug 오류 | appeal 이의, text)
//   join의 appeal  차단된 사람은 게임에 들어올 수 없다: 접속 메시지에 이의 글(appeal)을 실어 보내면 문의로 받아 두고 닫는다 (화면이 따로 된 연결 하나로 보낸다)
//   차단된 사람이 접속하면 닫기 전에 sanction 메시지로 사유·끝 시각·이의를 이미 냈는지를 알린다 (화면이 '이의 신청' 단추를 둔다)
//
// 문의는 저장 키 단위 (손님은 답을 받을 곳이 없어 받지 않는다). 글은 금칙어를 가린 뒤 적는다(textfilter의 mask), 길이 TEXT_MIN~TEXT_MAX.
// 빈도: 한 사람이 GAP_MS에 한 건, 열린 문의 OPEN_MAX건까지, 하루 DAY_MAX건까지. 이의는 걸린 제재마다 열린 것 하나.
// 답: 관리자가 answer로 답하면 상태가 '답변'이 되고, 접속해 있으면 곧바로 알리고(안내문 supportAnswered와 목록), 우편 모듈이 있으면 알림 우편(빈 보상, 종류 support)을 보낸다.
// 관리자 명령: tickets [open|answered|closed|live|all] [수] · ticket id · answer id 글 · tclose id [메모] · treopen id
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { ServerMsg, SanctionView, TicketView } from '../../shared/protocol';
import type { Ent } from '../game/entity';
import type { Game } from '../game/game';
import type { Sanction } from '../game/systems/sanctions';
import { log } from '../log';
import { hasOps, type OpsStore, type Store, type TicketRow } from '../store';
import { mask, tidy } from '../text';

export const TEXT_MIN = 5, TEXT_MAX = 500;
const GAP_MS = 60_000, OPEN_MAX = 3, DAY_MAX = 10;
const DAY = 86_400_000;
/** 화면에 보내는 내 문의의 수 */
const LIST_MAX = 20;

export interface SupportClient { key: string | null; ent: Ent | null; ip: string }
export interface SupportHost {
  game: Game; store: Store; now: () => number;
  send(c: SupportClient, msg: ServerMsg): void;
  byKey(key: string): SupportClient | undefined;
  /** 분석 사건 (문의를 받았다, 답했다: 글은 싣지 않는다) */
  track?(name: string, props: Record<string, string | number | boolean>, key: string): void;
}
export interface Support {
  /** support 메시지면 처리하고 true */
  handle(c: SupportClient, e: Ent, m: Record<string, unknown>): boolean;
  /** 차단된 사람이 접속했다 (닫기 전에): 사유와 이의 여부를 알리고, 접속 메시지에 이의가 실려 있으면 받는다 */
  atBan(c: SupportClient, m: Record<string, unknown>, ban: Sanction): void;
  /** 접속했다: 답이 온 문의가 있으면 목록을 보낸다 */
  joined(c: SupportClient): void;
  /** 고른 모듈인가 */
  readonly on: boolean;
  /** 열린 문의의 수 (지표) */
  openCount(): number;
  admin: Record<string, (a: string[], by: string) => string | { out: string; data: unknown }>;
}

const clean = (s: unknown): string => (typeof s === 'string' ? tidy(s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')).trim().slice(0, TEXT_MAX) : '');
const isKind = (v: unknown): v is TicketRow['kind'] => v === 'ask' || v === 'bug' || v === 'appeal';
const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const STATE_KO: Record<TicketRow['state'], string> = { open: '열림', answered: '답변', closed: '닫힘' };
const KIND_KO: Record<TicketRow['kind'], string> = { ask: '질문', bug: '오류', appeal: '이의' };

export function createSupport(host: SupportHost): Support {
  const g = host.game, on = g.has('support') && hasOps(host.store);
  const st: OpsStore | null = hasOps(host.store) ? host.store : null;
  const last = new Map<string, number>();
  const sys = (k: MsgKey, ...a: MsgArg[]): ServerMsg => ({ t: 'sys', k, a });
  const view = (t: TicketRow): TicketView => ({ id: t.id, kind: t.kind, state: t.state, text: t.text, answer: t.answer, at: t.at, upd: t.upd });
  const sanctionOf = (s: Sanction | null, kind: 'ban' | 'mute'): SanctionView | null => (s ? { kind, until: s.until, why: s.why, at: s.at } : null);

  function list(c: SupportClient): void {
    if (!c.key || !st) { host.send(c, { t: 'support', a: 'list', list: [], sanction: null }); return; }
    const mute = sanctionOf(g.sanctions.muted(c.key, ''), 'mute');
    host.send(c, { t: 'support', a: 'list', list: st.tickets({ key: c.key, limit: LIST_MAX }).map(view), sanction: mute, appealed: mute ? hasAppeal(c.key, mute) : false });
  }
  /** 그 제재에 대한 열린 이의가 이미 있는가 */
  const hasAppeal = (key: string, s: { kind: string; at: number }): boolean => !!st?.tickets({ key, state: 'live', limit: 50 }).some((t) => t.kind === 'appeal' && t.sanction?.kind === s.kind && t.state === 'open');

  /** 문의를 받는다. 받았으면 번호, 아니면 안내문의 종류 */
  function take(key: string, name: string, kind: TicketRow['kind'], raw: unknown, sanction?: TicketRow['sanction']): number | MsgKey {
    if (!st) return 'supportOff';
    const text = mask(clean(raw), 'chat');
    if ([...text].length < TEXT_MIN) return 'supportShort';
    const now = host.now();
    if (now - (last.get(key) ?? -Infinity) < GAP_MS) return 'supportWait';
    const mine = st.tickets({ key, limit: 200 });
    if (mine.filter((t) => t.state === 'open').length >= OPEN_MAX) return 'supportFull';
    if (mine.filter((t) => now - t.at < DAY).length >= DAY_MAX) return 'supportFull';
    if (kind === 'appeal' && sanction && hasAppeal(key, sanction.kind === 'ban' ? { kind: 'ban', at: 0 } : { kind: 'mute', at: 0 })) return 'supportAppealed';
    last.set(key, now);
    const id = st.addTicket({ key, name: name.slice(0, 40), kind, state: 'open', text, answer: '', by: '', at: now, upd: now, ...(sanction ? { sanction } : {}) });
    log.info(`[support] 문의 #${id} (${KIND_KO[kind]}): ${name}`);
    host.track?.('support_ticket', { kind }, key);
    return id;
  }

  function handle(c: SupportClient, e: Ent, m: Record<string, unknown>): boolean {
    if (m.t !== 'support') return false;
    if (!on) return true;
    if (m.a === 'list') { list(c); return true; }
    if (m.a !== 'new') return true;
    if (!c.key) { host.send(c, sys('supportGuest')); return true; }
    const kind = isKind(m.kind) ? m.kind : 'ask';
    let sanction: TicketRow['sanction'];
    if (kind === 'appeal') {
      const s = g.sanctions.muted(c.key, '');
      if (!s) { host.send(c, sys('supportNoSanction')); return true; }
      sanction = { kind: 'mute', until: s.until, why: s.why };
    }
    const r = take(c.key, e.name, kind, m.text, sanction);
    if (typeof r === 'number') { host.send(c, { t: 'support', a: 'sent', id: r }); host.send(c, sys('supportSent', r)); list(c); }
    else host.send(c, sys(r, ...(r === 'supportShort' ? [TEXT_MIN] : r === 'supportWait' ? [Math.ceil(GAP_MS / 1000)] : r === 'supportFull' ? [OPEN_MAX] : [])));
    return true;
  }

  function atBan(c: SupportClient, m: Record<string, unknown>, ban: Sanction): void {
    if (!on || !c.key) return;
    const key = c.key;
    // 접속 메시지에 이의가 실려 왔다: 받고 결과를 알린다 (그 뒤 통신 계층이 닫는다)
    if (typeof m.appeal === 'string') {
      const name = host.store.loadPlayer(key)?.name ?? ban.name ?? '';
      const r = take(key, name, 'appeal', m.appeal, { kind: 'ban', until: ban.until, why: ban.why });
      if (typeof r === 'number') host.send(c, { t: 'support', a: 'sent', id: r });
      else host.send(c, sys(r, ...(r === 'supportShort' ? [TEXT_MIN] : r === 'supportWait' ? [Math.ceil(GAP_MS / 1000)] : r === 'supportFull' ? [OPEN_MAX] : [])));
    }
    const answered = st?.tickets({ key, limit: 10 }).find((t) => t.kind === 'appeal' && t.sanction?.kind === 'ban' && t.state !== 'open' && t.answer);
    host.send(c, { t: 'sanction', s: { kind: 'ban', until: ban.until, why: ban.why, at: ban.at }, appealed: hasAppeal(key, { kind: 'ban', at: ban.at }), ...(answered ? { answer: answered.answer } : {}) });
  }

  // ---------- 관리자 명령 ----------
  const off = () => (g.has('support') ? '이 저장소는 문의를 적지 않습니다.' : '이 게임은 문의 모듈(support)을 고르지 않았습니다.');
  const line = (t: TicketRow): string => `#${t.id}  ${STATE_KO[t.state]}  ${KIND_KO[t.kind]}  ${when(t.at)}  ${t.name || '(지운 사람)'} 키 ${t.key ? t.key.slice(0, 10) : '-'}  ${t.text.slice(0, 60)}${t.text.length > 60 ? '…' : ''}`;
  const getT = (raw: string | undefined): TicketRow | null => { const id = Number(String(raw ?? '').replace(/^#/, '')); return Number.isInteger(id) && id > 0 && st ? st.ticket(id) : null; };
  function tell(t: TicketRow): void {
    const c = t.key ? host.byKey(t.key) : undefined;
    if (c?.ent) { host.send(c, sys('supportAnswered', t.id)); list(c); }
    if (t.key && g.has('mail')) { g.mail.sendTo(t.key, 'support', [t.id], {}); g.saveDirty = true; }
  }
  const admin: Support['admin'] = {
    tickets: (a) => {
      if (!on || !st) return off();
      const state = (['open', 'answered', 'closed', 'live'] as const).find((s) => a.includes(s)) ?? (a.includes('all') ? undefined : 'live');
      const n = Math.min(500, Math.max(1, Number(a.find((x) => /^\d+$/.test(x)) ?? 30)));
      const list = st.tickets({ state, limit: n });
      return { out: list.length ? [`문의 ${list.length}건 (${state ?? '전부'})`, ...list.map(line)].join('\n') : '문의가 없습니다.', data: list };
    },
    ticket: (a) => {
      if (!on || !st) return off();
      const t = getT(a[0]);
      if (!t) return `쓰는 법: ticket 번호 (없는 문의: ${a[0] ?? ''})`;
      const s = t.sanction ? `  제재: ${t.sanction.kind === 'ban' ? '접속 차단' : '말 막기'} · ${t.sanction.until ? when(t.sanction.until) + '까지' : '영구'} · ${t.sanction.why || '사유 없음'}` : '';
      return { out: [line(t), s, `  글: ${t.text}`, t.answer ? `  답 (${t.by}, ${when(t.upd)}): ${t.answer}` : '  답: 아직 없음'].filter(Boolean).join('\n'), data: t };
    },
    answer: (a, by) => {
      if (!on || !st) return off();
      const t = getT(a[0]);
      const text = clean(a.slice(1).join(' '));
      if (!t || !text) return '쓰는 법: answer 번호 답글';
      t.answer = text; t.by = by.slice(0, 40); t.state = 'answered'; t.upd = host.now();
      st.putTicket(t);
      tell(t);
      host.track?.('support_answer', { kind: t.kind }, t.key);
      return `문의 #${t.id}에 답했습니다${g.has('mail') ? ' (알림 우편을 보냄)' : ''}.`;
    },
    tclose: (a, by) => {
      if (!on || !st) return off();
      const t = getT(a[0]);
      if (!t) return '쓰는 법: tclose 번호 [메모]';
      const note = clean(a.slice(1).join(' '));
      t.state = 'closed'; t.upd = host.now(); if (note && !t.answer) { t.answer = note; t.by = by.slice(0, 40); }
      st.putTicket(t);
      const c = t.key ? host.byKey(t.key) : undefined;
      if (c?.ent) list(c);
      return `문의 #${t.id}를 닫았습니다.`;
    },
    treopen: (a) => {
      if (!on || !st) return off();
      const t = getT(a[0]);
      if (!t) return '쓰는 법: treopen 번호';
      t.state = 'open'; t.upd = host.now(); st.putTicket(t);
      return `문의 #${t.id}를 다시 열었습니다.`;
    },
  };

  return {
    handle, atBan, on, admin,
    joined(c) { if (on && c.key && st?.tickets({ key: c.key, state: 'answered', limit: 1 }).length) list(c); },
    openCount: () => (st && on ? st.tickets({ state: 'open', limit: 10_000 }).length : 0),
  };
}
