// 확률과 재화의 투명성 (odds 모듈): 확률표의 단일 원본(engine/shared/defs/odds.ts), 버전·이력·사전 공지·추첨 기록(engine/server/game/systems/odds.ts),
// 공개 페이지(engine/server/net/odds.ts의 odds.json·odds.html), 재화의 종류(engine/server/game/systems/wallet.ts), 귀한 재화의 확인 단계(needsConfirm).
// 검증 기준은 docs/genre-features.md 5.4: 큰 수 굴림의 분포 = 게임 안 표 = 공개 JSON/HTML의 값, 표를 바꾸면 이력이 남고 추첨 기록에 새 버전, 단계별 확률과 천장이 페이지에 나온다.
// 시험용 내용(영웅 들판)은 MODULES에 odds가 없다: 여기서 GameOptions.modules로 더해 고른다 (고르지 않은 시험들은 예전과 같다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BANNERS, BANNER_IDS, CURRENCIES, ENHANCE, MODULES, ODDS_RULES, allTables, bannerTable, checkTables, enhanceStep, enhanceTable, needsConfirm, oddsPct, pullOdds, pullStep, rollStep, seededRng, tableChanges,
  type CurrencyDef, type DrawRow, type OddsPublic, type OddsStep, type OddsTableDef,
} from '../../shared/defs';
import type { ModuleId } from '../../shared/modules';
import type { ServerMsg } from '../../shared/protocol';
import { Game } from '../../server/game/game';
import { personalData } from '../../server/game/personal';
import { startServer } from '../../server/net/server';
import { roleFor } from '../../server/net/admin';
import { MemoryStore, SqliteStore } from '../../server/store';
import { SCHEMA } from '../../server/store/sqlite';
import { check, connect, removeTemp, settle, until, type Peer } from '../harness';
import { heath } from './server/heath';

const MODS: ModuleId[] = [...MODULES, 'odds'];
/** n번 굴려 결과마다 센다 */
function roll(step: OddsStep, n: number, seed: number): Map<string, number> {
  const rng = seededRng(seed), out = new Map<string, number>();
  for (let i = 0; i < n; i++) { const o = rollStep(step, rng())!; out.set(o.id, (out.get(o.id) ?? 0) + 1); }
  return out;
}
/** 센 비율이 확률과 5σ 안에서 맞는가 (결과마다). 가장 크게 벗어난 정도(σ)를 함께 */
function fits(step: OddsStep, counts: Map<string, number>, n: number): { ok: boolean; worst: number } {
  let worst = 0;
  for (const o of step.outcomes) {
    const f = (counts.get(o.id) ?? 0) / n, sd = Math.sqrt(Math.max(o.p * (1 - o.p), 1e-12) / n);
    worst = Math.max(worst, Math.abs(f - o.p) / sd);
  }
  const unknown = [...counts.keys()].some((k) => !step.outcomes.some((o) => o.id === k));
  return { ok: worst < 5 && !unknown, worst };
}
const sameSteps = (a: OddsTableDef, b: OddsTableDef): boolean => JSON.stringify(a.steps) === JSON.stringify(b.steps);

// ---------- 1. 표의 검사: 거부 코드 ----------
{
  const ok = (key: string, outcomes: { id: string; p: number }[]) => ({ key, when: [{ k: 'base' as const }], outcomes });
  const bad: OddsTableDef[] = [
    { id: 'bad id!', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 1 }])] },
    { id: 'twice', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 1 }])] },
    { id: 'twice', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 1 }])] },
    { id: 'kind', kind: 'lottery' as never, name: 'x', steps: [ok('a', [{ id: 'x', p: 1 }])] },
    { id: 'empty', kind: 'capsule', name: 'x', steps: [] },
    { id: 'stepdup', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 1 }]), ok('a', [{ id: 'x', p: 1 }])] },
    { id: 'outdup', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 0.5 }, { id: 'x', p: 0.5 }])] },
    { id: 'neg', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: -0.1 }, { id: 'y', p: 1.1 }])] },
    { id: 'nan', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: Number.NaN }])] },
    { id: 'sum', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 0.5 }, { id: 'y', p: 0.4 }])] },
    { id: 'pity', kind: 'ceiling', name: 'x', steps: [ok('a', [{ id: 'x', p: 1 }])], pity: { after: 10, step: 'none' } },
    { id: 'enh', kind: 'enhance', name: 'x', steps: [ok('+0', [{ id: 'up', p: 0.5 }, { id: 'break', p: 0.5 }])] },
  ];
  const got = checkTables(bad), codes = new Set(got.map((x) => x.code));
  check(['id', 'dup', 'kind', 'empty', 'stepDup', 'outDup', 'neg', 'sum', 'pity', 'enhanceOut'].every((c) => codes.has(c as never)) && got.filter((x) => x.code === 'neg').length === 3,
    `표의 검사가 거부 코드로 알린다: ${[...codes].join(', ')}`);
  check(checkTables(ODDS_RULES.tables).length === 0 && checkTables(allTables(() => true)).length === 0, '내용이 준 표와 자동 표(강화·배너)는 검사를 지난다 (합 100%, 겹침 없음)');
  check(checkTables([{ id: 'eps', kind: 'capsule', name: 'x', steps: [ok('a', [{ id: 'x', p: 0.1 }, { id: 'y', p: 0.2 }, { id: 'z', p: 0.7 }])] }]).length === 0, '0.1 + 0.2 + 0.7처럼 부동소수 오차가 남는 합도 100%로 받는다');
  // 잘못된 표를 준 게임은 켜지지 않는다
  (ODDS_RULES.tables as OddsTableDef[]).push(bad[9]);
  let err = '';
  try { new Game({ modules: MODS, plugins: [heath] }); } catch (e) { err = String(e); }
  (ODDS_RULES.tables as OddsTableDef[]).pop();
  check(err.includes("표 'sum'") && err.includes('(sum)'), `잘못된 표가 있으면 서버가 켜질 때 멈춘다 (${err.split('\n')[0].slice(0, 80)})`);
}

// ---------- 2. 단일 원본: 굴림의 표 = 뽑기의 셈(pullOdds) = 강화의 셈(ENHANCE.rate) ----------
{
  let same = true;
  for (const id of BANNER_IDS) {
    const b = BANNERS[id], t = bannerTable(id)!;
    for (const s of t.steps) {
      const floor = s.key.startsWith('base') ? -1 : Number(s.key.slice(1, 2)), sure = s.key.endsWith(':sure');
      if (JSON.stringify(s.outcomes) !== JSON.stringify(pullOdds(b, floor, sure).map((o) => ({ id: o.hero, p: o.p, r: o.rarity })))) same = false;
    }
  }
  check(same, '배너의 표의 단계마다의 확률은 공개 확률표의 셈(pullOdds)과 글자까지 같다');
  const dawn = bannerTable('dawn')!, star = bannerTable('starfall')!;
  check(dawn.steps.map((s) => s.key).join() === 'base,r2,r1' && dawn.pity?.after === 50 && dawn.pity.step === 'r2' && dawn.ten?.step === 'r1' && dawn.cost?.ten === 900 && !dawn.limited,
    `상시 배너: 평소·천장(전설 이상)·10번 보장(희귀 이상)의 단계, 천장 50번째 (${dawn.steps.map((s) => s.key).join(', ')})`);
  check(star.steps.length === 6 && star.steps.some((s) => s.key === 'base:sure') && !!star.limited?.from && !!star.limited.to, `픽업·반반 배너: 확정이 켜진 때의 단계까지 여섯, 기간 한정 (${star.steps.map((s) => s.key).join(', ')})`);
  check(pullStep(dawn, 2, false)?.key === 'r2' && pullStep(dawn, 5, false)?.key === 'base', '그 등급 이상의 영웅이 없는 바닥(5)은 평소의 단계로 굴린다 (예전의 pullOdds 빈 표 → 평소와 같다)');
  const enh = enhanceTable();
  check(enh.steps.length === ENHANCE.max && enh.steps.every((s, n) => s.key === `+${n}` && s.outcomes[0].id === 'up' && s.outcomes[0].p === ENHANCE.rate(n) && Math.abs(s.outcomes.reduce((a, o) => a + o.p, 0) - 1) < 1e-12)
    && enh.steps.every((s, n) => (n >= ENHANCE.dropFrom ? s.outcomes.some((o) => o.id === 'down') : !s.outcomes.some((o) => o.id === 'down'))),
    `강화의 자동 표: +0 ~ +${ENHANCE.max - 1} 단계마다 성공 = ENHANCE.rate(단계), 실패는 dropFrom(${ENHANCE.dropFrom}) 이상이면 하락`);
  // 굴림이 예전의 셈과 같다: random() < rate 와 rollStep의 결과가 같은 수에서 같다
  const rng = seededRng(99);
  let agree = 0;
  for (let i = 0; i < 20000; i++) { const plus = i % ENHANCE.max, r = rng(); if ((r < ENHANCE.rate(plus)) === (rollStep(enhanceStep(plus), r)!.id === 'up')) agree++; }
  check(agree === 20000, `같은 난수면 표의 굴림과 예전의 'random() < ENHANCE.rate(plus)'가 늘 같다 (${agree}/20000)`);
}

// ---------- 3. 큰 수의 굴림: 분포 = 표 ----------
{
  const N = 200_000, dawn = bannerTable('dawn')!, base = dawn.steps[0], pity = dawn.steps[1], e5 = enhanceStep(5);
  const a = fits(base, roll(base, N, 11), N), b = fits(pity, roll(pity, N, 12), N), c = fits(e5, roll(e5, N, 13), N);
  check(a.ok && b.ok && c.ok, `${N.toLocaleString()}번 굴린 비율이 표와 5σ 안에서 맞다 (평소 ${a.worst.toFixed(2)}σ, 천장 ${b.worst.toFixed(2)}σ, 강화 +5 ${c.worst.toFixed(2)}σ)`);
}

// ---------- 4. 서버: 추첨 기록, 공개 JSON/HTML, 원격 설정으로 표를 바꾸면 버전과 이력 ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'odds-'));
try {
  const pubDir = path.join(tmp, 'pub');
  let T = Date.UTC(2026, 10, 27, 3, 0, 0);
  const store = new MemoryStore();
  const s = await startServer(0, { store, game: { modules: MODS, plugins: [heath], now: () => T }, status: false, odds: { dir: pubDir } });
  const g = s.game;
  const msgs: ServerMsg[] = [];
  const a: Peer = await connect(s.port, 'Ann', 'odds-token-a-000001', (m) => { if (m.t === 'odds' || m.t === 'gacha') msgs.push(m); });
  try {
    await until(() => g.odds.history().length > 0 && fs.existsSync(path.join(pubDir, 'odds.json')));
    const e = g.ents.get(a.id)!;
    const boot = g.odds.history();
    check(boot.length === g.odds.tables().length && boot.every((h) => h.ver === 1 && h.why === 'boot' && h.before === null), `켜진 뒤 첫 틱: 공개하는 표마다 버전 1, 까닭 boot (${boot.map((h) => h.table).join(', ')})`);
    // 공개 JSON·HTML (주소와 파일)
    const base = `http://127.0.0.1:${s.port}`;
    const j1 = await (await fetch(`${base}/odds.json`)).json() as OddsPublic & { names: Record<string, Record<string, string>> };
    const html = await fetch(`${base}/odds.html`), post = await fetch(`${base}/odds.json`, { method: 'POST', body: '{}' });
    const file = JSON.parse(fs.readFileSync(path.join(pubDir, 'odds.json'), 'utf8')) as OddsPublic;
    const live = g.odds.tables();
    check(j1.tables.length === live.length && j1.tables.every((t, i) => t.id === live[i].id && t.version === live[i].version && sameSteps(t, live[i])) && file.tables.every((t, i) => sameSteps(t, live[i])),
      `공개 JSON(주소 /odds.json과 정적 폴더의 파일)의 표 = 게임 안의 표 (${j1.tables.map((t) => `${t.id} v${t.version}`).join(', ')})`);
    const htmlText = await html.text();
    check(html.status === 200 && (html.headers.get('content-type') ?? '').startsWith('text/html') && htmlText.includes('odds.json') && htmlText.includes('확률 정보') && htmlText.includes('Odds') && post.status === 405 && fs.existsSync(path.join(pubDir, 'odds.html')),
      '공개 HTML은 같은 폴더의 odds.json을 읽는 페이지(한국어·영어 문장)이고, 주소는 읽기만 받는다 (POST는 405)');
    const enh = j1.tables.find((t) => t.id === 'enhance')!, dawnPub = j1.tables.find((t) => t.id === 'banner:dawn')!;
    check(enh.steps.length === ENHANCE.max && enh.steps.every((st, n) => st.when[0].k === 'plus' && st.when[0].n === n) && dawnPub.pity?.after === 50 && dawnPub.ten?.r === 1 && (dawnPub.effective?.length ?? 0) > 0,
      '공개 JSON에 강화의 단계별 확률(+0 …)과 뽑기의 천장·10번 보장·실효 확률이 있다');
    check(j1.names.ko.oddsChest === '보물 상자' && j1.names.en.bannerDawn === 'Call of Dawn' && j1.names.ko.oddsEnhanceName === '장비 강화' && (j1.tables.find((t) => t.id === 'chest')?.limited?.total === 100),
      '이름표: 내용의 ODDS.names와 틀의 강화 문장, 게임이 준 상자의 한정 수량');

    // 뽑기 10번 → 추첨 기록 한 줄
    a.send({ t: 'gacha', id: 'dawn', n: 10 });
    await until(() => msgs.some((m) => m.t === 'gacha'));
    const pulled = msgs.find((m): m is Extract<ServerMsg, { t: 'gacha' }> => m.t === 'gacha')!;
    const row = g.odds.draws({ owner: e.pid, limit: 5 })[0];
    check(!!row && row.kind === 'gacha' && row.table === 'banner:dawn' && row.ver === 1 && row.steps.length === 10 && row.got.join() === pulled.got.map((x) => x.h).join() && row.cost?.cur === 'sparks' && row.cost.n === 900 && row.at === T && row.owner === e.pid && !!e.pid,
      `뽑기의 추첨 기록: 사람(저장 키)·시각(UTC)·종류·표와 버전·단계·결과·치른 것 (${row?.steps.join(',')} → ${row?.got.join(',')})`);
    // 큰 수: 서버의 실제 뽑기로 3000번 → 기록의 평소 단계 비율 = 표 = 공개 JSON
    g.gacha.rng = seededRng(2026);
    g.wallet.add(e, 'sparks', 300 * 900, 'admin');
    for (let i = 0; i < 300; i++) g.gacha.draw(e, 'dawn', 10);
    const rows = g.odds.draws({ owner: e.pid, table: 'banner:dawn', limit: 1000 });
    const counts = new Map<string, number>();
    let n = 0;
    for (const r of rows) r.steps.forEach((st, i) => { if (st === 'base') { n++; counts.set(r.got[i], (counts.get(r.got[i]) ?? 0) + 1); } });
    const pubBase = dawnPub.steps.find((st) => st.key === 'base')!, fit = fits(pubBase, counts, n);
    check(rows.length === 301 && fit.ok && sameSteps(dawnPub, g.odds.tables().find((t) => t.id === 'banner:dawn')!),
      `서버가 실제로 뽑은 ${n}번(평소 단계)의 비율 = 공개 JSON의 표 = 게임 안의 표 (가장 벗어난 것 ${fit.worst.toFixed(2)}σ)`);
    const stats = s.admin.run('draws', ['stats', 'banner:dawn'], 'tester', 'test');
    check(stats.ok && stats.out.includes('[base]') && stats.out.includes('[r1]') && stats.out.includes('(표 '), '관리자 draws stats: 표마다 단계별로 나온 비율과 표의 확률');

    // 강화와 게임의 굴림
    g.gear.acquire(e, 'oakblade');
    const blade = e.gear.find((x) => x.base === 'oakblade')!;
    g.wallet.add(e, 'gold', 10_000, 'admin');
    g.gear.enhance(e, blade.uid);
    const er = g.odds.draws({ owner: e.pid, table: 'enhance', limit: 1 })[0];
    check(!!er && er.kind === 'enhance' && er.steps[0] === '+0' && ['up', 'keep'].includes(er.got[0]) && er.ver === 1 && er.cost?.cur === 'gold', `강화의 추첨 기록: 단계 +0, 결과 ${er?.got[0]}, 표 enhance v${er?.ver}`);
    g.odds.rng = seededRng(5);
    const got = g.odds.roll(e, 'chest', 'open'), cr = g.odds.draws({ owner: e.pid, table: 'chest', limit: 1 })[0];
    check(!!got && cr?.kind === 'capsule' && cr.got[0] === got.id && g.odds.roll(e, 'chest', 'nope') === null && g.odds.roll(e, 'nope', 'open') === null, `게임의 굴림(g.odds.roll): 내용이 준 상자의 표에서 뽑고 적는다 (${got?.id})`);

    // 내 추첨 기록 (화면의 창)
    a.send({ t: 'odds', a: 'mine' });
    await until(() => msgs.some((m) => m.t === 'odds' && m.a === 'mine'));
    const mine = (msgs.find((m) => m.t === 'odds' && m.a === 'mine') as Extract<ServerMsg, { t: 'odds'; a: 'mine' }>).rows;
    check(mine.length === 100 && mine[0].table === 'chest' && mine.every((r) => r.owner === '' && r.char === ''), `내 추첨 기록: 최근 100건, 사람 칸은 비워 보낸다 (${mine.length}건)`);

    // 원격 설정으로 천장을 바꾼다 → 버전 2, 이력(시각·전·후·까닭), 모두에게 새 표, 파일을 다시 쓴다, 다음 추첨은 v2
    T += 60_000;
    msgs.length = 0;
    const set = g.live.set('BANNERS.dawn.pity.after', 40, 'tester', '천장 앞당김');
    await settle(a, 2);
    const h = g.odds.history('banner:dawn', 5)[0];
    const pushed = msgs.find((m): m is Extract<ServerMsg, { t: 'odds'; a: 'tables' }> => m.t === 'odds' && m.a === 'tables');
    const file2 = JSON.parse(fs.readFileSync(path.join(pubDir, 'odds.json'), 'utf8')) as OddsPublic;
    check('ver' in set && h.ver === 2 && h.why === 'live:BANNERS.dawn.pity.after (tester)' && h.at === T && h.before?.pity?.after === 50 && h.after?.pity?.after === 40,
      `원격 설정으로 천장을 바꾸면 버전이 2로 오르고 이력에 시각·전(50)·후(40)·까닭이 남는다 (${h?.why})`);
    check(!!pushed && pushed.pub.tables.find((t) => t.id === 'banner:dawn')?.version === 2 && file2.tables.find((t) => t.id === 'banner:dawn')?.pity?.after === 40 && file2.history[0].why === 'live:BANNERS.dawn.pity.after',
      '바뀐 표가 접속한 화면에 오고 공개 파일도 다시 쓴다 (공개 이력의 까닭에는 누가가 빠진다)');
    g.gacha.draw(e, 'dawn', 1);
    check(g.odds.draws({ owner: e.pid, table: 'banner:dawn', limit: 1 })[0].ver === 2, '바뀐 뒤의 추첨 기록에는 새 버전(v2)이 찍힌다');
    // 뽑기 판의 무게를 바꾼다 → 바뀐 확률(전 → 후)이 공개 이력에
    T += 60_000;
    const pool = BANNERS.dawn.pool.map((x) => ({ ...x, w: x.hero === 'starseer' ? 30 : x.w }));
    g.live.set('BANNERS.dawn.pool', pool, 'tester');
    await settle(a, 1);
    const j3 = await (await fetch(`${base}/odds.json`)).json() as OddsPublic;
    const ch = j3.history[0];
    check(j3.tables.find((t) => t.id === 'banner:dawn')?.version === 3 && !!ch.changes?.some((c) => c.step === 'base' && c.id === 'starseer' && c.a !== null && c.b !== null && c.b > c.a),
      `뽑기 판을 바꾸면 버전 3, 공개 이력에 단계·결과마다의 전 → 후 (${ch.changes?.slice(0, 2).map((c) => `${c.step} ${c.id} ${oddsPct(c.a ?? 0)}→${oddsPct(c.b ?? 0)}`).join(', ')})`);
    check(JSON.stringify(tableChanges(h.before, h.after)) === '[]', '천장만 바꾼 이력은 확률이 바뀐 칸이 없다 (천장의 규칙만 다르다)');
    g.live.reset('BANNERS.dawn.pool', 'tester'); g.live.reset('BANNERS.dawn.pity.after', 'tester');
    // 사전 공지
    const pn = g.odds.plan('banner:dawn', T + 3 * 86_400_000, { ko: '사흘 뒤 천장을 40으로', en: 'Ceiling 40 in three days' }, 'tester');
    const j4 = await (await fetch(`${base}/odds.json`)).json() as OddsPublic;
    check(pn === 1 && j4.plans.length === 1 && j4.plans[0].at === T + 3 * 86_400_000 && j4.plans[0].text.ko.includes('사흘'), '사전 공지(언제부터·무엇)가 공개 JSON에 나온다');
    const adm = s.admin.run('odds', ['plan', 'banner:dawn', '+2d', '--ko', '이틀', '뒤'], 'tester', 'test'), list = s.admin.run('odds', ['plans'], 'tester', 'test');
    check(adm.ok && adm.out.includes('[2]') && list.out.includes('이틀 뒤') && s.admin.run('odds', ['plan', 'cancel', '2'], 'tester', 'test').out.includes('거뒀'), '관리자 odds plan·plans·plan cancel');
    const showE = s.admin.run('odds', ['show', 'enhance'], 'tester', 'test').out, ls = s.admin.run('odds', [], 'tester', 'test').out, log = s.admin.run('odds', ['log', 'banner:dawn'], 'tester', 'test').out;
    const who = s.admin.run('draws', ['Ann', '--n', '3'], 'tester', 'test').out;
    check(showE.includes('[+0]') && showE.includes('up') && ls.includes('banner:dawn') && ls.includes('천장') && log.includes('live:BANNERS.dawn.pity.after') && who.split('\n').length === 3 && who.includes('chest'),
      '관리자 odds(목록)·odds show·odds log·draws 이름');
    // 내 데이터: 내보내기에 추첨 기록, 지우면 사람 칸만 지운다
    const pd = personalData(g).find((x) => x.name === 'draws')!;
    const mineAll = pd.get(e.pid) as DrawRow[];
    pd.erase(e.pid);
    check(mineAll.length > 300 && g.odds.draws({ owner: e.pid, limit: 5 }).length === 0 && g.odds.draws({ owner: '-', limit: 5 }).length === 5, '내 데이터: 내보내기에 내 추첨 기록, 삭제하면 줄은 남기고 사람만 지운다');
  } finally { a.ws.close(); await s.close(); }

  // ---------- 5. SQLite: 버전·이력·기록이 다시 켜도 남는다, 소스가 바뀌면 boot, 보관 기간, 스키마 ----------
  const dbFile = path.join(tmp, 'g.db');
  const run = async (fn: (g: Game) => Promise<void> | void) => {
    const st = new SqliteStore(dbFile);
    const sv = await startServer(0, { store: st, game: { modules: MODS, plugins: [heath], now: () => T }, status: false, odds: false });
    try { await until(() => sv.game.odds.tables().every((t) => t.version > 0)); await fn(sv.game); } finally { await sv.close(); st.close(); }
  };
  let firstVer = 0;
  await run(async (g) => {
    const p = g.players.spawn('Dee', false, null, 'dee-key');
    g.wallet.add(p, 'sparks', 1000, 'admin');
    g.live.set('BANNERS.dawn.pity.after', 45, 'tester');
    g.gacha.draw(p, 'dawn', 1);
    firstVer = g.odds.versionOf('banner:dawn');
    g.players.leave(p.id);
  });
  await run(async (g) => {
    const hist = g.odds.history('banner:dawn', 10), row = g.odds.draws({ owner: 'dee-key', limit: 1 })[0];
    check(firstVer === 2 && g.odds.versionOf('banner:dawn') === 2 && hist.length === 2 && hist[0].why.startsWith('live:') && row?.ver === 2,
      `SQLite로 다시 켜도 버전(v${g.odds.versionOf('banner:dawn')})·이력(${hist.length}줄)·추첨 기록이 남고, 같은 내용(원격 설정까지)이면 버전이 오르지 않는다`);
    g.live.reset('BANNERS.dawn.pity.after', 'tester');
  });
  // 소스가 바뀐 것처럼: 상자의 확률을 고친 채 켠다 → boot로 버전이 오른다
  const chest = ODDS_RULES.tables[0].steps[0].outcomes as { id: string; p: number }[];
  chest[0].p = 0.6; chest[1].p = 0.35;
  try {
    await run((g) => {
      const h = g.odds.history('chest', 1)[0];
      check(g.odds.versionOf('chest') === 2 && h.why === 'boot' && tableChanges(h.before, h.after).length === 2, `켜질 때 소스의 표가 달라졌으면 까닭 boot로 버전을 올린다 (chest v${g.odds.versionOf('chest')})`);
      // 보관 기간 (시험용 내용 ODDS.keepDays 30일)
      const p = g.players.spawn('Eve', false, null, 'eve-key');
      g.odds.roll(p, 'chest', 'open');
      T += 31 * 86_400_000;
      g.odds.roll(p, 'chest', 'open');
      const cut = g.odds.prune();
      check(cut >= 1 && g.odds.draws({ owner: 'eve-key', limit: 10 }).length === 1, `보관 기간(${ODDS_RULES.keepDays}일)이 지난 추첨 기록은 지운다 (${cut}줄)`);
    });
  } finally { chest[0].p = 0.7; chest[1].p = 0.25; }
  {
    const f = path.join(tmp, 'old.db');
    const old = new SqliteStore(f, SCHEMA.slice(0, SCHEMA.length - 1));
    old.savePlayer('k1', { name: '옛사람' });
    old.close();
    const st = new SqliteStore(f);
    st.addDraw({ at: 1, owner: 'k1', char: 'k1', kind: 'gacha', table: 'banner:dawn', ver: 1, steps: ['base'], got: ['ironwall'] });
    check(st.schemaVersion() === SCHEMA.length && st.loadPlayer('k1')?.name === '옛사람' && st.draws({ limit: 5 }).length === 1, `앞 단계까지 올린 DB를 열면 확률 공개의 표(스키마 끝, ${SCHEMA.length})를 더하고 캐릭터는 그대로`);
    st.close();
  }
} finally { removeTemp(tmp); }

// ---------- 6. 재화의 종류: 쓰는 차례, 장부의 원인, 만료, 저장 ----------
{
  const plain = new Game({ modules: MODS, plugins: [heath] });
  const q = plain.players.spawn('Plain', false, null, 'plain');
  plain.wallet.add(q, 'sparks', 50, 'quest');
  check(plain.wallet.kindsOf('sparks') === null && plain.wallet.balance(q, 'sparks') === null && (plain.players.export(q).ext ?? {}).purse === undefined && !JSON.stringify(plain.players.export(q)).includes('purse'), '종류를 적지 않은 재화는 주머니가 없다 (저장에 purse 칸이 생기지 않는다: 지금의 게임 모두)');
  const def = CURRENCIES.sparks as CurrencyDef & { kinds?: unknown };
  def.kinds = { spend: ['event', 'free', 'paid'], days: { event: 7 } };
  let T = Date.UTC(2026, 10, 27);
  try {
    const g = new Game({ modules: MODS, plugins: [heath], now: () => T });
    const seen: string[] = [];
    g.wallet.seen.push((_p, cur, d, why) => { if (cur === 'sparks') seen.push(`${why}${d > 0 ? '+' : ''}${d}`); });
    const p = g.players.spawn('Kind', false, null, 'kind-key');
    const start = p.sparks;
    g.wallet.add(p, 'sparks', 100, 'quest');
    g.wallet.add(p, 'sparks', 50, 'event1', 'event');
    g.wallet.add(p, 'sparks', 30, 'shop', 'paid');
    const b1 = g.wallet.balance(p, 'sparks')!;
    check(b1.event === 50 && b1.free === 100 + start && b1.paid === 30 && p.sparks === start + 180 && seen.slice(-3).join() === 'quest:free+100,event1:event+50,shop:paid+30',
      `더할 때 종류(기본은 무상)마다 따로 센다, 칸은 합이다, 장부의 원인에 종류가 붙는다 (${seen.slice(-3).join(', ')})`);
    seen.length = 0;
    g.wallet.take(p, 'sparks', 120 + start, 'cmd:gacha');
    const b2 = g.wallet.balance(p, 'sparks')!;
    check(b2.event === 0 && b2.free === 30 && b2.paid === 30 && seen.join() === `cmd:gacha:event-50,cmd:gacha:free-${70 + start}` && g.wallet.lastTake?.event === 50,
      `쓸 때는 정한 차례(이벤트 → 무상 → 유상)로 꺼내고, 종류마다 장부에 한 줄 (${seen.join(', ')})`);
    // 만료: 7일 뒤 이벤트 몫이 'expire:event'로 빠진다
    g.wallet.add(p, 'sparks', 20, 'event2', 'event');
    seen.length = 0;
    T += 8 * 86_400_000;
    // 틱이 1분마다 살핀다 (그동안 단계의 보상이 무상으로 들어올 수 있다: 이벤트 몫과 장부의 만료 줄만 본다)
    for (let i = 0; i < 1250; i++) g.tick(0.05);
    const exp = seen.filter((x) => x.startsWith('expire:'));
    check(g.wallet.balance(p, 'sparks')!.event === 0 && exp.join() === 'expire:event-20', `이벤트 몫은 7일이 지나면 사라진다: 장부에 expire:event (${exp.join(', ')})`);
    // 저장과 다시 읽기, 칸이 주머니와 다르면 칸을 믿는다
    const before = g.wallet.balance(p, 'sparks')!, total = p.sparks;
    const save = g.players.export(p);
    const purse = (save.ext as Record<string, unknown>).purse as Record<string, Record<string, [number, number][]>>;
    g.players.leave(p.id);
    const back = g.players.spawn('Kind', false, save, 'kind-key');
    const b3 = g.wallet.balance(back, 'sparks')!;
    check(!!purse?.sparks && b3.free === before.free && b3.paid === 30 && before.paid === 30 && back.sparks === total, `주머니는 저장의 ext.purse로 남고 다시 읽힌다 (무상 ${b3.free}, 유상 ${b3.paid})`);
    back.sparks += 5; // 지갑 밖의 변화 (종류를 적기 전의 저장과 같다)
    check(g.wallet.balance(back, 'sparks')!.free === (before.free ?? 0) + 5, '칸이 주머니의 합보다 크면 모자란 만큼을 무상으로 본다');
    // 뽑기의 추첨 기록에 무엇으로 치렀나가 남는다: 무상을 35만 남기고 유상 100을 더해 100짜리를 뽑는다
    g.wallet.take(back, 'sparks', (before.free ?? 0) + 5 - 35, 'test');
    g.wallet.add(back, 'sparks', 100, 'shop', 'paid');
    g.gacha.draw(back, 'dawn', 1);
    const row = g.odds.draws({ owner: 'kind-key', limit: 1 })[0];
    check(row?.cost?.kinds?.free === 35 && row.cost.kinds.paid === 65 && g.wallet.balance(back, 'sparks')!.paid === 65, `뽑기의 추첨 기록에 종류마다 치른 양 (무상 ${row?.cost?.kinds?.free}, 유상 ${row?.cost?.kinds?.paid})`);
  } finally { delete def.kinds; }
}

// ---------- 7. 귀한 재화의 확인 단계 ----------
{
  const def: CurrencyDef = { tradable: false, confirm: { at: 900, price: null } };
  check(needsConfirm(def, 900) && !needsConfirm(def, 899) && !needsConfirm({ tradable: false }, 1e9) && !needsConfirm(undefined, 1e9), '확인 단계: confirm.at 이상을 쓸 때만 묻는다 (적지 않은 재화는 묻지 않는다)');
}

// ---------- 8. 관리자 역할: 보기 전용은 표·이력·추첨 기록을 읽고, 사전 공지·버전 올리기·다시 쓰기는 전체 ----------
check(roleFor('odds', []) === 'view' && roleFor('odds', ['show', 'enhance']) === 'view' && roleFor('odds', ['log']) === 'view' && roleFor('odds', ['plans']) === 'view' && roleFor('draws', ['stats', 'banner:dawn']) === 'view' && roleFor('draws', ['Ann']) === 'view'
  && roleFor('odds', ['plan', 'banner:dawn', '+1d']) === 'full' && roleFor('odds', ['plan', 'cancel', '1']) === 'full' && roleFor('odds', ['check']) === 'full' && roleFor('odds', ['publish']) === 'full',
  '관리자 역할: odds(목록·show·log·plans)·draws·draws stats는 보기, odds plan·check·publish는 전체');
