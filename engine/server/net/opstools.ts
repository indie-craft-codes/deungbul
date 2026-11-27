// 운영 도구의 관리자 명령 (docs/genre-features.md 5.5): 분석 표, 장부, 봇 의심 점수, 경보, 보상 우편, 지표. 관리자 통로(net/admin.ts)의 명령표 끝에 더해진다 (역할은 admin.ts의 roleFor).
// 모두 글(CLI)과 값(웹 관리 화면이 표로 그린다)을 함께 돌려준다.
//   stats [daily|retention|funnel 사건,사건,…] [--days n]   분석 사건의 집계 (net/stats.ts). 기본 daily, 최근 14일 (잔존은 45일)
//   ledger [일수] [이름]                                   장부: 통로 밖의 변화(other·tick)가 누구에게서 났는가, 날짜별 재화 흐름의 줄
//   suspects [수]                                          봇·매크로 의심 점수가 높은 사람 (net/suspect.ts: 보기만 한다)
//   alerts [test]                                          경보 규칙과 지금 상태 / 웹훅에 시험 알림 한 번 (net/alerts.ts)
//   mail 이름|--all [--days n] [--lv a-b] [--expire 일] [--gold n] [--sparks n] [--exp n] [--item id:n]   운영 보상 우편 (종류 comp: 사고 뒤 보상 같은 것).
//        --all은 전체 발송, --days는 최근 n일 안에 저장된 캐릭터만, --lv는 레벨 범위만(조건부 발송), --expire는 n일 뒤 사라짐 (묶음 6)
//   metrics                                               /metrics의 값
//   whoami                                                이 토큰의 역할 (웹 관리 화면이 처음에 묻는다)
import { ECON_UNKNOWN, isItemId, type Reward } from '../../shared/defs';
import type { Game } from '../game/game';
import { CURS } from '../game/systems/wallet';
import { hasEcon, hasOps, type Store } from '../store';
import type { Alerts } from './alerts';
import { options, type CmdOut } from './admin';
import { daily, dailyText, funnel, funnelText, retention, retentionText } from './stats';
import { SUSPECT_LINE, type Suspects } from './suspect';

const DAY = 86_400_000;
const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export interface OpsToolsHost {
  game: Game; store: Store;
  suspects: Suspects;
  alerts: Alerts | null;
  metrics(): Record<string, number>;
  find(name: string): { key: string | null; name: string } | null;
  /** 저장된 캐릭터 모두에게 (sinceMs 뒤에 저장된 것만) 우편. 보낸 수 (못 하면 -1): server.ts의 mailAll */
  mailAll(reward: Reward, sinceMs: number, kind: 'comp', opt?: { lv?: readonly [number, number]; x?: number }): number;
  save(): void;
}

export function opsTools(host: OpsToolsHost): Record<string, (a: string[], by: string) => CmdOut> {
  const g = host.game, store = host.store;
  const ops = hasOps(store) ? store : null;
  return {
    stats: (a) => {
      if (!ops) return '이 저장소는 분석 사건을 적지 않습니다.';
      host.save(); // 아직 저장하지 않은 사건도 셈에 들게 먼저 적는다
      const { pos, o } = options(a, [], ['days']);
      const kind = pos[0] ?? 'daily';
      const days = Math.min(400, Math.max(1, Number(o.days ?? (kind === 'retention' ? 45 : 14)) || 14));
      const now = g.now(), from = now - days * DAY;
      if (kind === 'retention') { const t = retention(ops.events(from, now + 1, ['first_join', 'session_start']), now); return { out: retentionText(t), data: { kind, days, rows: t } }; }
      if (kind === 'funnel') {
        const steps = (pos[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
        if (steps.length < 2) return '쓰는 법: stats funnel 사건,사건[,…] [--days n] (예: stats funnel first_join,level_up)';
        const t = funnel(ops.events(from, now + 1, steps), steps);
        return { out: funnelText(t), data: { kind, days, steps, rows: t } };
      }
      if (kind !== 'daily') return '쓰는 법: stats [daily | retention | funnel 사건,사건,…] [--days n]';
      const t = daily(ops.events(from, now + 1, ['session_start', 'first_join', 'session_end']));
      return { out: dailyText(t), data: { kind, days, rows: t, rejected: g.analytics.rejected } };
    },
    ledger: (a) => {
      if (!g.has('economy')) return '이 게임은 재화 모듈(economy)을 쓰지 않아 장부가 없습니다.';
      const n = Math.min(60, Math.max(1, Number(a.find((x) => /^\d+$/.test(x)) ?? 3)));
      const who = a.find((x) => !/^\d+$/.test(x));
      const t = who ? host.find(who) : null;
      if (who && !t?.key) return `'${who}' 이름의 저장된 캐릭터가 없습니다.`;
      const strays = g.ledger.strayList(t?.key ?? undefined);
      const fromDay = new Date(g.now() - (n - 1) * DAY).toISOString().slice(0, 10);
      // 저장된 줄과 아직 저장하지 않은 줄을 합친다 (오늘 것이 바로 보이게)
      const rows = new Map<string, { day: string; cur: string; why: string; dir: string; amount: number; n: number }>();
      const add = (r: { day: string; cur: string; why: string; dir: string; amount: number; n: number }) => { const k = `${r.day}|${r.cur}|${r.why}|${r.dir}`, x = rows.get(k); if (x) { x.amount = Math.max(x.amount, r.amount); x.n = Math.max(x.n, r.n); } else rows.set(k, { ...r }); };
      if (hasEcon(store)) for (const r of store.econ(fromDay)) add(r);
      for (const r of g.ledger.rows()) if (r.day >= fromDay) add(r);
      const list = [...rows.values()].sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : x.cur < y.cur ? -1 : x.cur > y.cur ? 1 : x.why < y.why ? -1 : 1));
      const stray = list.filter((r) => ECON_UNKNOWN.includes(r.why));
      const out = [
        `통로 밖의 변화 (other·tick${t ? `, ${t.name}` : ''}, 서버가 켜진 뒤 ${g.ledger.strayCount}건): ${strays.length ? '' : '없음'}`,
        ...strays.slice(-20).reverse().map((s) => `  ${when(s.at)}  ${s.name || '-'} 키 ${s.key ? s.key.slice(0, 10) : '손님'}  ${s.cur} ${s.d > 0 ? '+' : ''}${s.d} (${s.why})`),
        `날짜별 줄 가운데 원인 모름 (${fromDay}부터): ${stray.length ? stray.map((r) => `${r.day} ${r.cur} ${r.dir}${r.amount} ×${r.n} (${r.why})`).join(', ') : '없음'}`,
        `날짜별 줄 ${list.length}개 (웹 관리 화면의 '장부'에서 표로)`,
      ];
      return { out: out.join('\n'), data: { strays: [...strays].reverse(), strayCount: g.ledger.strayCount, rows: list, fromDay } };
    },
    suspects: (a) => {
      const n = Math.min(200, Math.max(1, Number(a[0] ?? 20) || 20));
      const list = host.suspects.list(g.now(), n);
      const out = list.length
        ? [`의심 점수 (${SUSPECT_LINE}점 이상은 살펴볼 것. 자동으로 막지 않는다)`, ...list.map((r) => `  ${String(r.score).padStart(3)}점${r.score >= SUSPECT_LINE ? ' !' : '  '} ${r.name}  분당 ${r.perMin}  간격 변동 ${r.cv}  ${r.top} ${Math.round(r.topShare * 100)}%  쉬지 않음 ${r.nonstopMin}분  명령 ${r.n}`)].join('\n')
        : '점수를 낼 만큼 명령을 보낸 사람이 없습니다.';
      return { out, data: { line: SUSPECT_LINE, rows: list.map((r) => ({ ...r, who: r.who.slice(0, 12) })) } };
    },
    alerts: (a, by) => {
      const A = host.alerts;
      if (!A) return '경보가 꺼져 있습니다.';
      if (a[0] === 'test') return A.test(by) ? '웹훅에 시험 알림을 보냈습니다 (결과는 alerts로).' : '웹훅 주소가 없어 보내지 않았습니다 (ALERT_WEBHOOK).';
      const list = A.list();
      const out = [`웹훅: ${A.on ? '켜짐' : '꺼짐 (ALERT_WEBHOOK을 주지 않음: 재기만 한다)'}${A.lastSend ? `  마지막 보냄 ${when(A.lastSend.at)} ${A.lastSend.ok ? '성공' : `실패(${A.lastSend.status || A.lastSend.err})`}` : ''}`,
        ...list.map((x) => `  ${x.state === 'firing' ? '경보' : x.state === 'pending' ? '넘음' : '정상'}  ${x.rule.name}  ${x.rule.metric}${x.rule.delta ? '(늘어난 양)' : ''} ${x.rule.op} ${x.rule.value}${x.rule.forS ? ` ${x.rule.forS}초 이어` : ''}  지금 ${x.value ?? '-'}`)];
      return { out: out.join('\n'), data: { on: A.on, lastSend: A.lastSend, rules: list } };
    },
    mail: (a) => {
      if (!g.has('mail')) return '이 게임은 우편 모듈을 쓰지 않습니다.';
      const { pos, o, f, m } = options(a, ['all'], [...CURS, 'days', 'lv', 'expire'], ['item']);
      const pay: Partial<Record<(typeof CURS)[number], number>> = {}, goods: Record<string, number> = {};
      for (const k of CURS) if (o[k] !== undefined) { const n = Number(o[k]); if (!Number.isInteger(n) || n < 1 || n > 1e7) return `--${k}는 1~10000000의 정수: ${o[k]}`; pay[k] = n; }
      for (const it of m.item ?? []) { const [id, cnt] = it.split(':'), n = Number(cnt ?? 1); if (!isItemId(id) || !Number.isInteger(n) || n < 1 || n > 9999) return `--item 아이템id:수 (${it})`; goods[id] = n; }
      const reward: Reward = { ...pay, ...(Object.keys(goods).length ? { items: goods } : {}) };
      if (!Object.keys(reward).length) return `쓰는 법: mail 이름|--all [--days n] [--lv a-b] [--expire 일] ${CURS.map((c) => `[--${c} n]`).join(' ')} [--item id:n]`;
      // 만료 (묶음 6): n일 뒤 사라진다
      const exp = o.expire !== undefined ? Number(o.expire) : 0;
      if (!Number.isFinite(exp) || exp < 0 || exp > 3650) return `--expire는 0~3650의 일 수: ${o.expire}`;
      const x = exp > 0 ? g.now() + exp * DAY : undefined;
      // 레벨 범위 (조건부 발송): 10-30, 10- (10 이상), -9 (9 이하), 20 (20만)
      let lv: [number, number] | undefined;
      if (o.lv !== undefined) {
        const mm = /^(\d*)(-?)(\d*)$/.exec(o.lv.trim());
        if (!mm || (!mm[1] && !mm[3])) return `--lv는 a-b (예: 10-30, 10-, -9, 20): ${o.lv}`;
        lv = [mm[1] ? Number(mm[1]) : 0, mm[3] ? Number(mm[3]) : mm[2] ? Infinity : Number(mm[1])];
        if (!f.has('all')) return '--lv는 --all과 함께 쓴다';
      }
      if (f.has('all')) {
        const days = o.days !== undefined ? Number(o.days) : 0;
        if (!Number.isFinite(days) || days < 0) return `--days는 0 이상의 수: ${o.days}`;
        const n = host.mailAll(reward, days ? g.now() - days * DAY : 0, 'comp', { ...(lv ? { lv } : {}), ...(x ? { x } : {}) });
        return n < 0 ? '보내지 못했습니다 (저장소가 저장 키로 훑지 못한다).' : `운영 보상 우편을 ${n}명에게 보냈습니다${days ? ` (최근 ${days}일 안에 저장된 캐릭터)` : ''}${lv ? ` (레벨 ${lv[0]}~${lv[1] === Infinity ? '' : lv[1]})` : ''}${x ? ` · ${exp}일 뒤 사라짐` : ''}.`;
      }
      const t = host.find(pos[0] ?? '');
      if (!t?.key) return `'${pos[0] ?? ''}' 이름의 저장된 캐릭터가 없습니다.`;
      g.mail.sendTo(t.key, 'comp', [], reward, x);
      g.saveDirty = true;
      host.save();
      return `${t.name}에게 운영 보상 우편을 보냈습니다.`;
    },
    metrics: () => { const v = host.metrics(); return { out: Object.entries(v).map(([k, x]) => `${k} ${Number.isInteger(x) ? x : x.toFixed(3)}`).join('\n'), data: v }; },
    whoami: () => ({ out: '관리자 통로', data: { game: g.has('support') ? ['support'] : [], modules: [...g.modules] } }),
  };
}
