// 재화 흐름 지표를 읽는다: 서버가 저장 파일에 쌓아 둔 경제 장부(engine/server/game/systems/ledger.ts)를 사람이 읽을 표로 찍는다.
//   npm run econ                     최근 7일, data/game.db
//   npm run econ -- 14               최근 14일
//   npm run econ -- 14 경로/game.db   다른 파일 (DB 환경 변수로도 받는다)
//   npm run econ -- --json           같은 내용을 JSON으로
//   npm run econ -- --to=2026-11-20  그 날짜까지의 N일 (기본은 오늘)
// 이 게임(등불지기)의 운영 도구다: 재화의 이름(골드, 불씨, 경험치)과 판단 기준이 이 게임의 것이다. 장부 자체는 틀의 것이라 다른 게임은 이 파일을 본떠 자기 도구를 만든다.
// 저장 파일은 읽기 전용으로 연다: 운영 중인 서버가 쓰고 있는 파일을 열어도 방해하지 않는다.
// 판단 기준(정상 범위)은 games/deungbul/shared/content/economy.ts의 ECON_WATCH에 있다. 모두 임시값이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { WHY, type EconRow, type EconSnapshot } from '@engine/server';
import { ECON_HUNT, ECON_LOST_FULL, ECON_UNKNOWN, ECON_WATCH, ENHANCE, RARITIES, isEconMove } from '../shared/defs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--')), rest = args.filter((a) => !a.startsWith('--'));
const json = flags.includes('--json');
const days = Math.max(1, Math.min(3650, Math.floor(Number(rest.find((a) => /^\d+$/.test(a)) ?? 7))));
const file = path.resolve(rest.find((a) => !/^\d+$/.test(a)) ?? process.env.DB ?? path.join(root, 'data', 'game.db'));
const dayOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toArg = flags.find((a) => /^--to=\d{4}-\d{2}-\d{2}$/.test(a))?.slice(5);
const end = toArg ? new Date(Number(toArg.slice(0, 4)), Number(toArg.slice(5, 7)) - 1, Number(toArg.slice(8, 10))) : new Date();
const to = dayOf(end), from = dayOf(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1)));

/** 자료가 없을 때: 오류가 아니라 그렇다고 알리고 끝낸다 */
function none(why: string): never {
  if (json) console.log(JSON.stringify({ db: file, from, to, days, empty: true, why }));
  else console.log(`자료 없음: ${why}\n  (파일: ${file})`);
  process.exit(0);
}

// ---------- 읽기 ----------
if (!fs.existsSync(file)) none('저장 파일이 없습니다.');
let rows: EconRow[] = [], snap: EconSnapshot | null = null, snaps = 0;
{
  let db: DatabaseSync;
  try { db = new DatabaseSync(file, { readOnly: true }); } catch (err) { none(`저장 파일을 열지 못했습니다 (${(err as Error).message}).`); }
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)));
    if (!tables.has('econ_daily') || !tables.has('econ_snapshot')) none('지표 표가 없습니다. 지표가 들어간 서버가 이 파일로 한 번 켜지면 생깁니다.');
    rows = db.prepare('SELECT day, cur, why, dir, amount, n FROM econ_daily WHERE day >= ? AND day <= ? ORDER BY day, cur, why, dir').all(from, to)
      .map((r) => ({ day: String(r.day), cur: String(r.cur), why: String(r.why), dir: r.dir === '-' ? '-' : '+', amount: Number(r.amount), n: Number(r.n) }));
    const last = db.prepare('SELECT data FROM econ_snapshot WHERE day <= ? ORDER BY day DESC LIMIT 1').get(to);
    snaps = Number(db.prepare('SELECT COUNT(*) AS n FROM econ_snapshot').get()?.n ?? 0);
    try { snap = typeof last?.data === 'string' ? JSON.parse(last.data) as EconSnapshot : null; } catch { snap = null; }
  } catch (err) { none(`저장 파일을 읽지 못했습니다 (${(err as Error).message}).`); } finally { db.close(); }
}
if (!rows.length && !snap) none(`${from} ~ ${to}에 적힌 줄도, 분포 스냅샷도 없습니다.`);

// ---------- 셈 ----------
interface Line { why: string; amount: number; n: number; share: number }
interface Flow { made: number; burned: number; net: number; ratio: number | null; top: { made: Line[]; burned: Line[] }; moved: { out: number; in: number } }
const TOP = 8;
const of = (cur: string, list = rows) => list.filter((r) => r.cur === cur);
const total = (list: EconRow[], dir: '+' | '-', pick: (why: string) => boolean = () => true) => list.reduce((s, r) => (r.dir === dir && pick(r.why) ? s + r.amount : s), 0);

/** 한 재화의 흐름: 생성과 소멸(이동은 빼고), 원인별 상위 줄. 사람 사이를 건너간 것 가운데 받지 못한 차이(수수료)는 소멸에 더한다 */
function flow(cur: string, list = rows): Flow {
  const mine = of(cur, list), real = mine.filter((r) => !isEconMove(r.why));
  const out = total(mine, '-', isEconMove), into = total(mine, '+', isEconMove), fee = Math.max(0, out - into);
  const made = total(real, '+'), burned = total(real, '-') + fee;
  const top = (dir: '+' | '-', sum: number): Line[] => {
    const by = new Map<string, Line>();
    for (const r of real) if (r.dir === dir) { const l = by.get(r.why) ?? { why: r.why, amount: 0, n: 0, share: 0 }; l.amount += r.amount; l.n += r.n; by.set(r.why, l); }
    if (dir === '-' && fee > 0) by.set('market:fee', { why: 'market:fee', amount: fee, n: 0, share: 0 });
    return [...by.values()].sort((a, b) => b.amount - a.amount).map((l) => ({ ...l, share: sum > 0 ? l.amount / sum : 0 }));
  };
  return { made, burned, net: made - burned, ratio: made > 0 ? burned / made : null, top: { made: top('+', made), burned: top('-', burned) }, moved: { out, in: into } };
}
const gold = flow('gold'), sparks = flow('sparks'), exp = flow('exp');
const dayList = [...new Set(rows.map((r) => r.day))].sort();
const daily = dayList.map((day) => { const f = flow('gold', rows.filter((r) => r.day === day)); return { day, made: f.made, burned: f.burned, net: f.net, ratio: f.ratio, moved: f.moved.out }; });
const share = (f: Flow, why: string): number | null => (f.made > 0 ? (f.top.made.find((l) => l.why === why)?.amount ?? 0) / f.made : null);
const awayShare = share(gold, ECON_HUNT.away);

// 장비: 등급별로 생긴 것, 사라진 것, 가방이 차서 버려진 것, 분해한 것(직접 + 자동), 거래소를 오간 것
const SALVAGED: readonly string[] = [WHY.salvage, WHY.autoSalvage];
const gear = RARITIES.map((r) => {
  const mine = of(`gear:${r.id}`), real = mine.filter((x) => !isEconMove(x.why));
  const lost = total(real, '-', (w) => w === ECON_LOST_FULL), salvaged = total(real, '-', (w) => SALVAGED.includes(w)), auto = total(real, '-', (w) => w === WHY.autoSalvage);
  return { rar: r.id as string, made: total(real, '+'), gone: total(real, '-') - lost - salvaged, lost, salvaged, auto, listed: total(mine, '-', isEconMove), received: total(mine, '+', isEconMove) };
});
const items = [...new Set(rows.filter((r) => r.cur.startsWith('item:')).map((r) => r.cur))].sort().map((cur) => {
  const mine = of(cur), real = mine.filter((x) => !isEconMove(x.why));
  return { id: cur.slice(5), made: total(real, '+'), used: total(real, '-'), listed: total(mine, '-', isEconMove), received: total(mine, '+', isEconMove) };
});
// 원인을 가리지 못한 변화: 재화마다 전체 흐름에서 차지하는 몫
const unknown = (['gold', 'sparks', 'exp'] as const).map((cur) => {
  const mine = of(cur), amount = mine.reduce((s, r) => (ECON_UNKNOWN.includes(r.why) ? s + r.amount : s), 0), all = mine.reduce((s, r) => s + r.amount, 0);
  return { cur, amount, share: all > 0 ? amount / all : 0 };
});
const unknownGear = rows.filter((r) => r.cur.includes(':') && ECON_UNKNOWN.includes(r.why)).reduce((s, r) => s + r.amount, 0);
const unknownShare = rows.length ? Math.max(...unknown.map((u) => u.share)) : null;

// ---------- 판단 기준 ----------
interface Watch { key: string; label: string; value: number | null; range: string; ok: boolean | null; note?: string }
const W = ECON_WATCH;
const within = (v: number | null, r: { min?: number; max?: number }): boolean | null => (v === null ? null : (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max));
const holdDays = snap && snap.income.median > 0 ? snap.gold.median / snap.income.median : null;
const topRatio = snap && snap.gold.median > 0 ? snap.gold.p90 / snap.gold.median : null;
const maxEnh = snap && snap.worn.n > 0 ? (snap.worn.plus[ENHANCE.max] ?? 0) / snap.worn.n : null;
const watch: Watch[] = [
  { key: 'sinkRatio', label: `골드 소멸/생성 비 (${days}일)`, value: gold.ratio, range: `${W.sinkRatio.min}~${W.sinkRatio.max}`, ok: within(gold.ratio, W.sinkRatio) },
  { key: 'holdDays', label: '보유 일수 (보유 중간값 ÷ 하루 수입 중간값)', value: holdDays, range: `${W.holdDays.max}일 이하`, ok: within(holdDays, W.holdDays), note: snap && !snap.income.n ? '어제 수입이 있던 캐릭터가 없습니다' : undefined },
  { key: 'topRatio', label: '상위 10% 경계 ÷ 중간값', value: topRatio, range: `${W.topRatio.max} 이하`, ok: within(topRatio, W.topRatio) },
  { key: 'awayShare', label: '자리 비움 사냥의 골드 비중', value: awayShare, range: `${W.awayShare.max * 100}% 이하`, ok: within(awayShare, W.awayShare) },
  { key: 'maxEnhShare', label: `낀 장비 중 +${ENHANCE.max}의 비율`, value: maxEnh, range: `${W.maxEnhShare.max * 100}% 이하`, ok: within(maxEnh, W.maxEnhShare) },
  { key: 'unknownShare', label: `원인을 가리지 못한 변화 (${ECON_UNKNOWN.join(', ')})`, value: unknownShare, range: `${W.unknownShare.max * 100}% 이하`, ok: within(unknownShare, W.unknownShare), note: unknownGear ? `장비·재료 ${unknownGear}건 포함 안 됨` : undefined },
];
const active = snap?.active.d7 ?? 0, enough = active >= W.minSample;

const report = {
  db: file, from, to, days, provisional: '판단 기준은 임시값입니다 (games/deungbul/shared/content/economy.ts의 ECON_WATCH)',
  daily, gold: { ...gold, awayShare }, sparks, exp, gear, items, unknown,
  snapshot: snap, snapshots: snaps,
  reach: snap ? snap.fresh : null,
  watch, sample: { active, need: W.minSample, enough },
};

if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

// ---------- 찍기 ----------
const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v: number | null) => (v === null ? '-' : `${num(v * 100, 1)}%`);
const ratio = (v: number | null) => (v === null ? '-' : num(v, 2));
const hms = (s: number) => (s >= 3600 ? `${num(s / 3600, 1)}시간` : s >= 60 ? `${num(s / 60, 0)}분` : `${num(s)}초`);
/** 터미널에서 차지하는 칸 수: 한글과 한자는 두 칸이다 */
const width = (s: string) => [...s].reduce((w, ch) => w + (/[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch) ? 2 : 1), 0);
const padL = (s: string, w: number) => ' '.repeat(Math.max(0, w - width(s))) + s;
const padR = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - width(s)));
/** 고정 폭 표: 첫 칸은 왼쪽, 나머지는 오른쪽으로 맞춘다 (글로 된 칸은 left에 번호를 적어 왼쪽으로) */
function table(head: string[], body: string[][], left: number[] = []): void {
  const w = head.map((h, i) => Math.max(width(h), ...body.map((r) => width(r[i] ?? ''))));
  const line = (r: string[]) => '  ' + r.map((c, i) => (i === 0 || left.includes(i) ? padR(c, w[i]) : padL(c, w[i]))).join('  ').trimEnd();
  console.log(line(head));
  console.log('  ' + w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of body) console.log(line(r));
}
const title = (s: string) => console.log(`\n== ${s} ==`);

console.log(`등불지기 재화 흐름 지표  ${from} ~ ${to} (${days}일)`);
console.log(`파일: ${file}  (줄 ${rows.length}개, 스냅샷 ${snaps}개)`);

function printFlow(name: string, f: Flow): void {
  title(`${name}: 생성 ${num(f.made)} / 소멸 ${num(f.burned)} / 순증가 ${f.net >= 0 ? '+' : ''}${num(f.net)} / 소멸÷생성 ${ratio(f.ratio)}`);
  if (f.moved.out || f.moved.in) console.log(`  이동(거래소): 낸 값 ${num(f.moved.out)}, 받은 값 ${num(f.moved.in)}, 차이 ${num(f.moved.out - f.moved.in)} (수수료와 아직 받지 않은 판 값. 소멸에 market:fee로 넣었다)`);
  const body = (list: Line[]) => list.slice(0, TOP).map((l) => [l.why, num(l.amount), pct(l.share), l.n ? num(l.n) : '-']);
  if (f.top.made.length) { console.log('  생성 (큰 순)'); table(['원인', '양', '몫', '건수'], body(f.top.made)); }
  if (f.top.burned.length) { console.log('  소멸 (큰 순)'); table(['원인', '양', '몫', '건수'], body(f.top.burned)); }
  if (f.top.made.length > TOP || f.top.burned.length > TOP) console.log(`  (원인이 더 있습니다: 생성 ${f.top.made.length}가지, 소멸 ${f.top.burned.length}가지. --json으로 모두 볼 수 있습니다)`);
}

if (daily.length) {
  title('날짜별 골드');
  table(['날짜', '생성', '소멸', '순증가', '소멸÷생성', '거래소에 낸 값'], daily.map((d) => [d.day, num(d.made), num(d.burned), (d.net >= 0 ? '+' : '') + num(d.net), ratio(d.ratio), num(d.moved)]));
}
printFlow('골드', gold);
console.log(`  자리 비움 사냥(${ECON_HUNT.away})의 비중: ${pct(awayShare)}`);
printFlow('불씨', sparks);
printFlow('경험치', exp);

if (gear.some((g) => g.made || g.gone || g.lost || g.salvaged || g.listed)) {
  title('장비 (등급별 개수)');
  table(['등급', '생김', '사라짐', '버려짐(가방 가득)', '분해', '(자동 분해)', '거래소에 올림', '거래소에서 받음'], gear.map((g) => [g.rar, num(g.made), num(g.gone), num(g.lost), num(g.salvaged), num(g.auto), num(g.listed), num(g.received)]));
  const made = gear.reduce((s, g) => s + g.made, 0), lost = gear.reduce((s, g) => s + g.lost, 0);
  console.log(`  떨어진 장비 가운데 버려진 것: ${num(lost)} / ${num(made)} (${pct(made > 0 ? lost / made : null)})`);
  const salvaged = gear.reduce((s, g) => s + g.salvaged, 0);
  if (salvaged) console.log(`  분해한 것: ${num(salvaged)} (그 가운데 자동 분해 ${num(gear.reduce((s, g) => s + g.auto, 0))})`);
}
if (items.length) {
  title('재료와 물약 (개수)');
  table(['아이템', '생김', '쓰임', '거래소에 올림', '거래소에서 받음'], items.map((i) => [i.id, num(i.made), num(i.used), num(i.listed), num(i.received)]));
}

title('분포 스냅샷');
if (!snap) console.log('  아직 없습니다 (서버가 켜질 때와 날이 바뀐 뒤 첫 저장 때 하루에 하나 남깁니다).');
else {
  const s = snap, lv = Object.entries(s.levels).map(([k, n]) => [Number(k), n] as const).sort((a, b) => a[0] - b[0]);
  const band = (a: number, b: number) => lv.reduce((sum, [l, n]) => (l >= a && l <= b ? sum + n : sum), 0);
  console.log(`  날짜: ${s.day} (${new Date(s.at).toLocaleString('ko-KR')})`);
  console.log(`  캐릭터: ${num(s.chars)} (진행 없는 캐릭터 ${num(s.blank)}은 뺐다)`);
  console.log(`  활동 캐릭터: 1일 ${num(s.active.d1)} / 7일 ${num(s.active.d7)} / 30일 ${num(s.active.d30)}`);
  console.log(`  레벨 분포: 1~4 ${band(1, 4)} / 5~9 ${band(5, 9)} / 10~19 ${band(10, 19)} / 20 이상 ${band(20, 9999)}  (가장 높은 레벨 ${lv.length ? lv[lv.length - 1][0] : '-'})`);
  console.log(`  골드 보유: 합계 ${num(s.gold.sum)} / 중간값 ${num(s.gold.median)} / 상위 10% 경계 ${num(s.gold.p90)} / 상위 1% 경계 ${num(s.gold.p99)} / 최대 ${num(s.gold.max)}`);
  console.log(`  상위 10% 경계 ÷ 중간값: ${ratio(topRatio)}   상위 10명이 가진 몫: ${pct(s.gold.top10Share)}`);
  console.log(`  하루 수입(${s.income.day}): 중간값 ${num(s.income.median)} (수입이 있던 캐릭터 ${num(s.income.n)})`);
  console.log(`  불씨 보유 합계: ${num(s.sparks.sum)}`);
  console.log(`  낀 장비 ${num(s.worn.n)}점의 강화 단계: ${s.worn.plus.map((n, i) => `+${i}:${n}`).join(' ') || '-'}`);
  console.log(`  낀 장비의 등급: ${RARITIES.map((r) => `${r.id} ${s.worn.rar[r.id] ?? 0}`).join(' / ')}`);
  const kinds = Object.entries(s.market.kinds).sort((a, b) => b[1].n - a[1].n);
  console.log(`  거래소: 물건 ${num(s.market.n)}개${kinds.length ? ' (' + kinds.map(([k, v]) => `${k} ${v.n}개 중간값 ${num(v.median, v.median % 1 ? 1 : 0)}`).join(', ') + ')' : ''}`);
  const marks = Object.entries(s.fresh.reach).sort((a, b) => Number(a[0]) - Number(b[0]));
  console.log(`  신규(최근 7일에 만든 캐릭터 ${num(s.fresh.n)}): ${marks.length ? marks.map(([m, v]) => `레벨 ${m} 도달 ${v.n}명, 접속 시간 중간값 ${hms(v.play)} (자리 비움 포함 ${hms(v.total)})`).join(' / ') : '레벨 도달 기록 없음'}`);
}

title('판단 기준 (임시값: games/deungbul/shared/content/economy.ts의 ECON_WATCH)');
const show = (w: Watch) => (w.value === null ? '자료 없음' : w.key === 'awayShare' || w.key === 'maxEnhShare' || w.key === 'unknownShare' ? pct(w.value) : w.key === 'holdDays' ? `${num(w.value, 1)}일` : num(w.value, 2));
table(['지표', '지금', '정상 범위', '판단'], [
  ...watch.map((w) => [w.label, show(w), w.range, (w.ok === null ? '-' : w.ok ? '정상' : '주의') + (w.note ? ` (${w.note})` : '')]),
  ...(snap ? Object.entries(snap.fresh.reach).sort((a, b) => Number(a[0]) - Number(b[0])).filter(([m]) => Number(m) >= 10).map(([m, v]) => [`신규의 레벨 ${m} 도달 플레이 시간`, hms(v.play), '목표 미정', `값만 (${v.n}명)`]) : []),
], [3]);
if (!enough) console.log(`  ※ 표본이 적어 참고만: 7일 활동 캐릭터 ${active}명 (${W.minSample}명 미만)`);
for (const u of unknown) if (u.amount) console.log(`  ※ ${u.cur}: 원인을 가리지 못한 변화 ${num(u.amount)} (${pct(u.share)})`);
