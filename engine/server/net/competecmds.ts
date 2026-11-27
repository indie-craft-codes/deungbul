// 경쟁의 관리자 명령 (묶음 8): 관리자 통로(net/admin.ts)의 명령표 끝에 더해진다 (역할은 admin.ts의 roleFor). 글(CLI)과 값(웹 관리 화면)을 함께 돌려준다.
//   boards                      순위표 목록 (boards 모듈): 이름·기간·줄 수·다음 초기화
//   rating 이름|저장 키          그 사람의 사다리마다 레이팅·RD·판 수·승패·시즌 최고·지난 시즌 (ranked 모듈)
//   leavers [이름|저장 키]       이탈 기록: 이름을 주면 그 사람의 점수·큐 금지·최근 기록, 없으면 점수가 있는 사람 모두 (고객지원이 본다)
//   leavers forgive 이름|저장 키  이탈 기록을 지운다 (운영: 고객지원의 판단)
import type { Game } from '../game/game';
import type { CmdOut } from './admin';

const when = (ms: number): string => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-');

/** 이름이나 저장 키로 사람의 저장 키를 찾는다 (접속해 있는 사람의 이름, 레이팅·이탈 기록의 이름, 아니면 그대로 저장 키) */
function keyOf(g: Game, who: string): { key: string; name: string } | null {
  if (!who) return null;
  for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot && e.pid && (e.name === who || e.pid === who)) return { key: e.pid, name: e.name };
  if (g.has('ranked')) for (const m of g.ranked.lad.values()) for (const [pid, r] of m) if (r.name === who || pid === who) return { key: pid, name: r.name };
  if (g.has('ranked') && g.ranked.leaves.has(who)) return { key: who, name: '' };
  return null;
}

export function competeCommands(g: Game): Record<string, (a: string[], by: string) => CmdOut> {
  return {
    boards: () => {
      if (!g.has('boards')) return '이 게임은 순위표(boards 모듈)를 쓰지 않습니다.';
      const rows = g.boards.tabs().map((t) => ({ ...t, n: g.boards.entries(t.id).length }));
      return { out: rows.map((r) => `  ${r.id}  ${r.period}  ${r.fmt}  ${r.n}줄`).join('\n') || '순위표가 없습니다.', data: rows };
    },
    rating: (a) => {
      if (!g.has('ranked')) return '이 게임은 랭크 대전(ranked 모듈)을 쓰지 않습니다.';
      const t = keyOf(g, a[0] ?? '');
      if (!t) return '쓰는 법: rating 이름|저장 키 (레이팅이나 이탈 기록이 있는 사람)';
      const data = g.ranked.ladders().map((id) => ({ ladder: id, ...g.ranked.rating(id, t.key), shown: g.ranked.shown(g.ranked.rating(id, t.key)) }));
      return { out: [`${t.name || t.key.slice(0, 8)}의 레이팅`, ...data.map((d) => `  ${d.ladder}  r ${Math.round(d.r)}  RD ${Math.round(d.rd)}  σ ${d.vol}  ${d.n}판 ${d.w}승 ${d.l}패 ${d.d}무  마지막 ${when(d.at)}  ${d.shown ? '등급 보임' : '배치 중·숨김'}  시즌 최고 ${d.best}${d.hist?.length ? `  지난 시즌 ${d.hist.map(([k, b]) => `${k}:${b}`).join(' ')}` : ''}`)].join('\n'), data };
    },
    leavers: (a) => {
      if (!g.has('ranked')) return '이 게임은 랭크 대전(ranked 모듈)을 쓰지 않습니다.';
      if (a[0] === 'forgive') {
        const t = keyOf(g, a[1] ?? '');
        if (!t) return '쓰는 법: leavers forgive 이름|저장 키';
        return g.ranked.forgive(t.key) ? `${t.name || t.key.slice(0, 8)}의 이탈 기록을 지웠습니다 (큐 금지도 풀림).` : '이탈 기록이 없습니다.';
      }
      const now = g.now();
      if (a[0]) {
        const t = keyOf(g, a[0]);
        const r = t ? g.ranked.leaves.get(t.key) : undefined;
        if (!t || !r) return '이탈 기록이 없습니다.';
        const data = { key: t.key, points: g.ranked.points(t.key), ban: g.ranked.banUntil(t.key), log: r.log };
        return { out: [`${t.name || t.key.slice(0, 8)}: 점수 ${data.points} (적힌 ${r.p}, ${when(r.at)})  큐 금지 ${data.ban ? `${when(data.ban)}까지` : '없음'}`, ...r.log.map(([at, def, why]) => `  ${when(at)}  ${def}  ${why}`)].join('\n'), data };
      }
      const rows = [...g.ranked.leaves].map(([key, r]) => ({ key, points: g.ranked.points(key), ban: r.ban > now ? r.ban : 0, last: r.log[r.log.length - 1]?.[0] ?? 0 })).filter((x) => x.points > 0 || x.ban).sort((x, y) => y.points - x.points);
      return { out: rows.length ? rows.map((x) => `  ${x.key.slice(0, 8)}  점수 ${x.points}  큐 금지 ${x.ban ? when(x.ban) : '-'}  마지막 ${when(x.last)}`).join('\n') : '이탈 점수가 있는 사람이 없습니다.', data: rows };
    },
  };
}
