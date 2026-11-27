// 라이브 콘텐츠의 관리자 명령 (묶음 6): 관리자 통로(net/admin.ts)의 명령표 끝에 더해진다 (역할은 admin.ts의 roleFor). 글(CLI)과 값(웹 관리 화면의 '라이브' 탭)을 함께 돌려준다.
//   events                                   기간 이벤트(event 모듈)와 상품(GOODS)의 지금 상태: 열림·예정·끝, 기간(원격 설정으로 바뀐 값), 서버 수량
//   season                                   시즌(season 모듈): 지금 시즌의 열쇠·몇째·끝나는 때, 트랙
//   coupon [list] | show 코드                쿠폰 목록과 쓰인 수 (보기)
//   coupon add 코드 [--gold n] [--sparks n] [--exp n] [--item id:n] [--uses n] [--from 시각] [--to 시각 | --for 기간] [--note 글]   만들기·바꾸기 (전체)
//   coupon del 코드                           지우기 (쓴 기록은 남는다: 같은 코드를 다시 만들어도 쓴 사람은 다시 못 쓴다) (전체)
// 우편의 일괄·조건부 발송과 만료는 운영 도구의 mail 명령에 있다 (net/opstools.ts: --all, --days, --lv a-b, --expire 일).
import { EVENTS, GOODS, SEASON, eventIds, goodsIds, isItemId, parseWhen, seasonAt, within, type Reward } from '../../shared/defs';
import type { Game } from '../game/game';
import { CURS } from '../game/systems/wallet';
import { options, type CmdOut } from './admin';

const when = (ms: number): string => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-');
/** 기간 글(30m, 12h, 7d, 숫자는 시간) → ms */
function span(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([mhd]?)$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * (m[2] === 'm' ? 60_000 : m[2] === 'd' ? 86_400_000 : 3_600_000);
}

/** 관리자 명령의 보상 칸 (--gold n --sparks n --exp n --item id:n …)을 읽는다. 틀리면 까닭 */
export function rewardOf(o: Record<string, string>, items: readonly string[] = []): Reward | string {
  const pay: Partial<Record<(typeof CURS)[number], number>> = {};
  for (const k of CURS) if (o[k] !== undefined) { const n = Number(o[k]); if (!Number.isInteger(n) || n < 1 || n > 1e7) return `--${k}는 1~10000000의 정수: ${o[k]}`; pay[k] = n; }
  const goods: Record<string, number> = {};
  for (const it of items) { const [id, cnt] = it.split(':'), n = Number(cnt ?? 1); if (!isItemId(id) || !Number.isInteger(n) || n < 1 || n > 9999) return `--item 아이템id:수 (${it})`; goods[id] = n; }
  return { ...pay, ...(Object.keys(goods).length ? { items: goods } : {}) };
}

export function liveCommands(g: Game): Record<string, (a: string[], by: string) => CmdOut> {
  return {
    events: () => {
      const now = g.now();
      const evs = eventIds().map((id) => { const e = EVENTS[id]; return { id, from: e.from, to: e.to, state: within(now, e.from, e.to) ? 'open' : now < e.from ? 'soon' : 'ended', cur: e.cur ?? '', end: e.end?.swap ? `swap ${e.end.swap.rate}x → ${e.end.swap.to}` : e.cur ? 'expire' : '', missions: Object.keys(e.missions ?? {}).length }; });
      const goods = goodsIds().map((id) => { const d = GOODS[id]; return { id, shop: d.event ? `event:${d.event}` : d.shop ?? 'shop', price: `${d.price.n} ${d.price.cur}${d.price.kind ? `:${d.price.kind}` : ''}`, limit: d.limit ? `${d.limit.n}/${d.limit.per ?? 'ever'}` : '', left: g.has('items') && goodsIds().length && d.stock !== undefined ? g.goods.left(id) : null }; });
      const out = [
        g.has('event') ? `기간 이벤트 ${evs.length}개 (지금 ${new Date(now).toISOString().slice(0, 16)} UTC)` : '이 게임은 기간 이벤트(event 모듈)를 쓰지 않습니다.',
        ...evs.map((e) => `  ${e.state === 'open' ? '열림' : e.state === 'soon' ? '예정' : '끝'}  ${e.id}  ${when(e.from)} ~ ${when(e.to)}  임무 ${e.missions}${e.cur ? `  재화 ${e.cur}:event (${e.end})` : ''}`),
        `상품 ${goods.length}개${goods.length ? '' : ' (GOODS 없음)'}`,
        ...goods.map((x) => `  ${x.id}  ${x.shop}  ${x.price}${x.limit ? `  한정 ${x.limit}` : ''}${x.left !== null ? `  남은 수량 ${x.left}` : ''}`),
        '기간은 원격 설정으로 바꾼다: set EVENTS.<id>.to <UTC ms> (내용의 LIVE_KEYS에 선언한 칸만)',
      ];
      return { out: out.join('\n'), data: { now, events: evs, goods } };
    },
    season: () => {
      if (!g.has('season') || !SEASON) return '이 게임은 시즌(season 모듈, SEASON)을 쓰지 않습니다.';
      const cur = seasonAt(SEASON, g.now(), g.time.cal);
      const out = [`시즌 ${cur.key}${cur.n ? ` (${cur.n}째)` : ''}  끝 ${when(cur.to)}  초기화 ${typeof SEASON.reset === 'object' ? `part ${SEASON.reset.part}` : SEASON.reset ?? 'all'}  놓친 보상 ${SEASON.missed ?? 'mail'}`,
        ...SEASON.track.map((t, i) => `  ${i + 1}단계 ${t.pts}점  ${JSON.stringify(t.r)}`)];
      return { out: out.join('\n'), data: { ...cur, reset: SEASON.reset ?? 'all', track: SEASON.track } };
    },
    coupon: (a, by) => {
      if (!g.has('coupon')) return '이 게임은 쿠폰(coupon 모듈)을 쓰지 않습니다.';
      const c = g.coupon, sub = a[0] ?? 'list';
      if (sub === 'list') {
        const rows = c.list();
        return { out: rows.length ? rows.map((r) => `  ${r.code}  쓰임 ${r.used}${r.uses ? `/${r.uses}` : ''}  ${r.from ? when(r.from) : ''} ~ ${r.to ? when(r.to) : ''}  ${JSON.stringify(r.r)}${r.note ? `  (${r.note})` : ''}`).join('\n') : '쿠폰이 없습니다.', data: rows };
      }
      if (sub === 'show') { const r = c.get(a[1] ?? ''); return r ? { out: JSON.stringify(r, null, 2), data: [r] } : `없는 쿠폰입니다: ${a[1] ?? ''}`; }
      if (sub === 'del') return c.del(a[1] ?? '') ? `쿠폰 ${a[1]}을(를) 지웠습니다 (쓴 기록은 남는다).` : `없는 쿠폰입니다: ${a[1] ?? ''}`;
      if (sub !== 'add') return `쓰는 법: coupon [list] | show 코드 | add 코드 ${CURS.map((c) => `[--${c} n]`).join(' ')} [--item id:n] [--uses n] [--from 시각] [--to 시각 | --for 기간] [--note 글] | del 코드`;
      const { pos, o, m } = options(a.slice(1), [], [...CURS, 'uses', 'from', 'to', 'for', 'note'], ['item']);
      const r = rewardOf(o, m.item ?? []);
      if (typeof r === 'string') return r;
      const now = g.now();
      const from = o.from ? parseWhen(o.from, now, g.time.cal) : 0;
      const dur = o.for ? span(o.for) : null;
      const to = o.to ? parseWhen(o.to, now, g.time.cal) : dur ? (from || now) + dur : 0;
      if (from === null || to === null || (o.for && dur === null)) return '시각은 now, +2h, 2026-12-01 09:00 (초기화 시각의 시간대), ISO. 기간은 30m·12h·7d';
      const err = c.put(pos[0] ?? '', r, { uses: o.uses !== undefined ? Number(o.uses) : 0, from, to, note: o.note }, by);
      return err ?? `쿠폰 ${pos[0]}을(를) 만들었습니다: ${JSON.stringify(r)}${o.uses ? `, ${o.uses}번까지` : ''}${to ? `, ${when(to)}까지` : ''}. 사람마다 한 번 쓸 수 있습니다.`;
    },
  };
}
